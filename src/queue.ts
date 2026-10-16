// Fila de conversão: um vídeo por vez, progresso, tempo restante e tratamento de erros.
import { engine, EngineStalledError, StoppedError, errMessage } from './ffmpeg';
import { buildArgs } from './args';
import { ProgressTracker, SpeedMeter, expectedSpeed, parseDuration, parseTime, speedFactor } from './estimate';
import { NameRegistry, outputStem, uniqueName } from './naming';
import { destination, existsInDestination, writeToDestination } from './save';
import { store, type ItemError, type VideoItem } from './state';
import type { Settings } from './settings';

const OUT = '/out.mp4';
/** Taxa típica do AVCHD (bits/s), usada quando a duração ainda não é conhecida. */
const AVCHD_BITRATE = 16_000_000;
const CALIBRATION_KEY = 'conversor-mts:speed:v1';

export const names = new NameRegistry();

let stopRequested = false;

export function videoSeconds(item: VideoItem): number {
  if (item.duration && item.duration > 0) return item.duration;
  return (item.file.size * 8) / AVCHD_BITRATE;
}

export function loadCalibration(): number | null {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    const v = raw ? JSON.parse(raw)[engine.kind] : null;
    return typeof v === 'number' && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function saveCalibration(speed: number, s: Settings) {
  if (s.mode !== 'enhance' || !(speed > 0)) return;
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[engine.kind] = speed / speedFactor(s);
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(data));
  } catch {
    /* ignorar */
  }
}

export function currentExpectedSpeed(s: Settings): number {
  return expectedSpeed(s, { multithread: engine.kind === 'mt', calibrated: loadCalibration() });
}

/** Traduz falhas técnicas em mensagens que explicam o que fazer. */
export function explainError(err: unknown, log: string): ItemError {
  const text = `${errMessage(err)}\n${log}`;
  const detail = log.trim() || errMessage(err);
  if (/memory|OOM|Aborted\(\)|RangeError|Cannot enlarge|out of bounds/i.test(text)) {
    return { message: 'O navegador ficou sem memória. Feche outras abas e tente de novo este vídeo.', detail };
  }
  if (/Invalid data found|could not find codec|Error while decoding|corrupt|non-existing PPS|moov atom/i.test(text)) {
    return { message: 'Este vídeo parece estar corrompido. Os outros continuam normalmente.', detail };
  }
  if (/No such file|NotFoundError|NotReadableError|could not be read/i.test(text)) {
    return {
      message: 'Não consegui ler este arquivo. Confira se o cartão ainda está conectado e tente de novo.',
      detail,
    };
  }
  return {
    message: 'Não foi possível converter este vídeo. Tente de novo; se continuar, copie o registro técnico.',
    detail,
  };
}

export interface BatchResult {
  converted: VideoItem[];
  failed: VideoItem[];
  stopped: boolean;
  elapsed: number;
}

/** Converte os vídeos na ordem. Erro em um vídeo não interrompe o lote. */
export async function runBatch(items: VideoItem[]): Promise<BatchResult> {
  stopRequested = false;
  const settings = { ...store.state.settings };
  const startedAt = performance.now();
  const total = items.reduce((s, i) => s + videoSeconds(i), 0);
  const meter = new SpeedMeter(currentExpectedSpeed(settings));
  const converted: VideoItem[] = [];
  const failed: VideoItem[] = [];
  let doneSeconds = 0;

  store.state.batch = {
    ids: items.map((i) => i.id),
    index: 0,
    startedAt: Date.now(),
    videoTotal: total,
    videoDone: 0,
    remaining: meter.remaining(total),
    currentTime: 0,
    overall: 0,
  };
  store.emit('batch');
  for (const it of items) store.patchItem(it.id, { status: 'queued', progress: 0, error: undefined });

  for (let k = 0; k < items.length; k++) {
    if (stopRequested) break;
    const item = items[k];
    if (!store.item(item.id)) continue;
    const batch = store.state.batch!;
    batch.index = k;
    batch.currentTime = 0;
    store.emit('batch');

    const seconds = videoSeconds(item);
    const onProgress = (pct: number, time: number) => {
      const b = store.state.batch;
      if (!b) return;
      const current = (pct / 100) * seconds;
      b.videoDone = doneSeconds + current;
      b.currentTime = time;
      meter.sample(b.videoDone, performance.now());
      b.remaining = meter.remaining(Math.max(0, total - b.videoDone));
      b.overall = Math.min(99, total > 0 ? (b.videoDone / total) * 100 : 0);
      store.patchItem(item.id, { progress: pct });
      store.emit('batch');
    };

    let attempt = 0;
    for (;;) {
      try {
        await convertOne(item, settings, onProgress);
        converted.push(item);
        break;
      } catch (err) {
        if (err instanceof StoppedError || stopRequested) {
          store.patchItem(item.id, { status: 'queued', progress: 0 });
          break;
        }
        if (err instanceof EngineStalledError && attempt === 0) {
          attempt++;
          engine.recoverFromStall();
          store.patchItem(item.id, { progress: 0 });
          continue;
        }
        const log = (err as { log?: string }).log ?? '';
        store.patchItem(item.id, { status: 'failed', progress: 0, error: explainError(err, log) });
        engine.tech(`Falhou: ${item.file.name}: ${errMessage(err)}`);
        failed.push(item);
        break;
      }
    }
    doneSeconds += seconds;
    meter.pause();
  }

  if (converted.length && meter.confident) saveCalibration(meter.speed, settings);
  const elapsed = (performance.now() - startedAt) / 1000;
  const stopped = stopRequested;
  stopRequested = false;
  return { converted, failed, stopped, elapsed };
}

async function convertOne(item: VideoItem, settings: Settings, onProgress: (pct: number, time: number) => void) {
  store.patchItem(item.id, { status: 'converting', progress: 0, error: undefined });

  // Nome final: nunca sobrescreve nada do lote nem da pasta de destino
  if (item.outName) names.delete(item.outName);
  const stem = outputStem(item.file, settings.naming);
  const name = await uniqueName(stem, async (n) => names.has(n) || (await existsInDestination(n)));
  names.add(name);
  item.outName = name;

  const tracker = new ProgressTracker(item.duration ?? 0);
  const tail: string[] = [];
  const offLog = engine.onLog((line) => {
    tail.push(line);
    if (tail.length > 60) tail.shift();
    if (!tracker.duration) {
      const d = parseDuration(line);
      if (d) tracker.duration = d;
    }
    const t = parseTime(line);
    if (t !== null) onProgress(tracker.update(t), t);
  });
  const offProgress = engine.onProgress((ratio) => {
    // Reserva quando o log não traz "time="
    const before = tracker.value;
    const pct = tracker.updateRatio(ratio);
    if (pct > before) onProgress(pct, (pct / 100) * (tracker.duration || 0));
  });

  let blob: Blob;
  try {
    blob = await engine.run(async (ff) => {
      const code = await engine.withInput(ff, item.file, (path) => engine.exec(ff, buildArgs(settings, path, OUT)));
      try {
        if (code !== 0) throw Object.assign(new Error(`ffmpeg terminou com código ${code}`), { log: tail.join('\n') });
        const data = await ff.readFile(OUT);
        if (typeof data === 'string' || data.byteLength < 1024) {
          throw Object.assign(new Error('Arquivo de saída vazio'), { log: tail.join('\n') });
        }
        return new Blob([data as BlobPart], { type: 'video/mp4' });
      } finally {
        await engine.removeFile(ff, OUT);
      }
    });
  } catch (err) {
    names.delete(name);
    if (err instanceof Error && !(err as { log?: string }).log) Object.assign(err, { log: tail.join('\n') });
    throw err;
  } finally {
    offLog();
    offProgress();
  }

  if (destination.handle) {
    try {
      await writeToDestination(name, blob);
      engine.tech(`Salvo: ${name}`);
      store.patchItem(item.id, { status: 'saved', progress: 100, outSize: blob.size, savedToFolder: true });
      return;
    } catch (err) {
      engine.tech(`Não foi possível salvar ${name} na pasta: ${errMessage(err)}. Ficou disponível para baixar.`);
    }
  }
  const url = URL.createObjectURL(blob);
  store.patchItem(item.id, { status: 'ready', progress: 100, outSize: blob.size, outUrl: url, savedToFolder: false });
}

export function requestStop() {
  stopRequested = true;
  engine.terminate();
}
