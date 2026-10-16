// Leitura de duração, miniatura e frames da prévia de qualidade.
import { engine, EngineStalledError } from './ffmpeg';
import { buildPreviewArgs, buildThumbArgs } from './args';
import { parseDuration, parseFps } from './estimate';
import type { Settings } from './settings';

export interface ProbeResult {
  duration: number | null;
  fps: number | null;
  height: number | null;
  interlaced: boolean | null;
  thumbUrl: string | null;
}

function toBlobUrl(data: Uint8Array | string, type: string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
}

/** Uma única passada: o ffmpeg imprime a duração ao abrir o arquivo e grava a miniatura. */
export async function probe(file: File): Promise<ProbeResult> {
  return engine.run(async (ff) => {
    const out: ProbeResult = { duration: null, fps: null, height: null, interlaced: null, thumbUrl: null };
    const stop = engine.onLog((line) => {
      const d = parseDuration(line);
      if (d !== null && out.duration === null) out.duration = d;
      if (/Stream #.*Video:/.test(line)) {
        out.fps = parseFps(line) ?? out.fps;
        const h = /\d{3,4}x(\d{3,4})/.exec(line);
        if (h) out.height = Number(h[1]);
        // Filmadoras 1080i costumam declarar "top first" ou "bottom first"
        if (/top first|bottom first|tff|bff/i.test(line)) out.interlaced = true;
        else if (/progressive/i.test(line)) out.interlaced = false;
      }
    });
    try {
      await engine.withInput(ff, file, async (path) => {
        for (const at of [2, 0]) {
          const thumb = '/thumb.jpg';
          try {
            const code = await engine.exec(ff, buildThumbArgs(path, thumb, at));
            if (code === 0) {
              const data = await ff.readFile(thumb);
              if (typeof data !== 'string' && data.byteLength > 0) {
                out.thumbUrl = toBlobUrl(data, 'image/jpeg');
                break;
              }
            }
          } catch (err) {
            if (err instanceof EngineStalledError) throw err;
          } finally {
            await engine.removeFile(ff, thumb);
          }
          // Sem frame aos 2 s (vídeo muito curto): tenta o primeiro frame
        }
      });
    } finally {
      stop();
    }
    return out;
  });
}

/** Um frame da prévia (original ou processado) a partir do instante `at`. */
export async function previewFrame(file: File, settings: Settings, at: number, processed: boolean): Promise<string> {
  return engine.run(async (ff) =>
    engine.withInput(ff, file, async (path) => {
      const out = processed ? '/prev-b.jpg' : '/prev-a.jpg';
      try {
        const code = await engine.exec(ff, buildPreviewArgs({ ...settings, mode: 'enhance' }, path, out, at, processed));
        const data = code === 0 ? await ff.readFile(out) : null;
        if (!data || typeof data === 'string' || !data.byteLength) throw new Error('Não foi possível gerar a prévia deste trecho.');
        return toBlobUrl(data, 'image/jpeg');
      } finally {
        await engine.removeFile(ff, out);
      }
    }),
  );
}
