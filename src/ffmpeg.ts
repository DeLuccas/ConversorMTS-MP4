// Motor de conversão: uma única instância do ffmpeg.wasm, reaproveitada entre vídeos.
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

export type EngineKind = 'mt' | 'st';
export type EngineStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

interface CoreURLs {
  coreURL: string;
  wasmURL: string;
  workerURL?: string;
}

type LogFn = (line: string) => void;
type LoadProgressFn = (p: { status: EngineStatus; ratio: number; kind: EngineKind }) => void;

const LOAD_TIMEOUT_MS = 30_000;
/** Sem nenhuma linha de log por esse tempo, consideramos o motor travado. */
const STALL_MS = 30_000;
const BASE = `${import.meta.env.BASE_URL}ffmpeg`;

export class EngineStalledError extends Error {
  constructor() {
    super('O motor de conversão parou de responder.');
  }
}

export class StoppedError extends Error {
  constructor() {
    super('Conversão interrompida.');
  }
}

class Engine {
  private ff: FFmpeg | null = null;
  private loadPromise: Promise<void> | null = null;
  private downloads: Partial<Record<EngineKind, Promise<CoreURLs>>> = {};
  private chain: Promise<unknown> = Promise.resolve();
  private logListeners = new Set<LogFn>();
  private techListeners = new Set<LogFn>();
  private progressListeners = new Set<(ratio: number) => void>();
  private loadListeners = new Set<LoadProgressFn>();
  private lastActivity = 0;
  private stopped = false;
  private wasmTotal = 0;

  /** Multithread só funciona com isolamento de origem (COOP/COEP). */
  kind: EngineKind = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated ? 'mt' : 'st';
  status: EngineStatus = 'idle';
  /** null = ainda não testado; false = WORKERFS indisponível, usando cópia na memória. */
  workerfs: boolean | null = null;

  onLog(fn: LogFn) {
    this.logListeners.add(fn);
    return () => this.logListeners.delete(fn);
  }
  /** Mensagens do próprio app para o registro técnico (não vêm do ffmpeg). */
  onTech(fn: LogFn) {
    this.techListeners.add(fn);
    return () => this.techListeners.delete(fn);
  }
  onProgress(fn: (ratio: number) => void) {
    this.progressListeners.add(fn);
    return () => this.progressListeners.delete(fn);
  }
  onLoad(fn: LoadProgressFn) {
    this.loadListeners.add(fn);
    return () => this.loadListeners.delete(fn);
  }

  tech(line: string) {
    for (const fn of this.techListeners) fn(line);
  }

  private emitLoad(status: EngineStatus, ratio: number) {
    this.status = status;
    for (const fn of this.loadListeners) fn({ status, ratio, kind: this.kind });
  }

  get ready() {
    return this.ff !== null && this.status === 'ready';
  }

  /** Baixa os arquivos do motor como blob URLs (ficam em cache para recargas após "Parar"). */
  private download(kind: EngineKind): Promise<CoreURLs> {
    const cached = this.downloads[kind];
    if (cached) return cached;
    const dir = `${BASE}/${kind}`;
    const p = (async () => {
      this.emitLoad('downloading', 0);
      const coreURL = await toBlobURL(`${dir}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${dir}/ffmpeg-core.wasm`, 'application/wasm', true, (e) => {
        if (e.total > 0) this.wasmTotal = e.total;
        const total = e.total > 0 ? e.total : this.wasmTotal || 32 * 1024 * 1024;
        this.emitLoad('downloading', Math.min(1, e.received / total));
      });
      const urls: CoreURLs = { coreURL, wasmURL };
      if (kind === 'mt') urls.workerURL = await toBlobURL(`${dir}/ffmpeg-core.worker.js`, 'text/javascript');
      this.tech(`Motor ${kind === 'mt' ? 'multithread' : 'single-thread'} baixado.`);
      return urls;
    })();
    this.downloads[kind] = p;
    p.catch(() => delete this.downloads[kind]);
    return p;
  }

  /** Começa a baixar em segundo plano, quando o navegador estiver ocioso. */
  preload() {
    const start = () => {
      this.download(this.kind).catch((err) => this.tech(`Pré-carga do motor falhou: ${String(err)}`));
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
      .requestIdleCallback;
    const later = () => (idle ? idle(start, { timeout: 4000 }) : setTimeout(start, 1500));
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
  }

  /** Garante o motor carregado. Tenta multithread e cai para single-thread se falhar ou travar. */
  ensure(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        await this.loadKind(this.kind);
      } catch (err) {
        if (this.kind === 'mt') {
          this.tech(`Motor multithread falhou (${errMessage(err)}). Usando single-thread.`);
          this.kind = 'st';
          await this.loadKind('st');
        } else {
          this.emitLoad('error', 0);
          throw err;
        }
      }
    })();
    this.loadPromise.catch(() => {}).finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async loadKind(kind: EngineKind) {
    const urls = await this.download(kind);
    this.emitLoad('loading', 1);
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => {
      this.lastActivity = performance.now();
      for (const fn of this.logListeners) fn(message);
    });
    ff.on('progress', ({ progress }) => {
      this.lastActivity = performance.now();
      for (const fn of this.progressListeners) fn(progress);
    });
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('tempo de carregamento esgotado (30 s)')), LOAD_TIMEOUT_MS),
    );
    try {
      await Promise.race([
        (async () => {
          await ff.load(urls);
          // Teste rápido: alguns navegadores carregam o multithread mas travam ao executar.
          await ff.exec(['-hide_banner', '-version']);
        })(),
        timer,
      ]);
    } catch (err) {
      try {
        ff.terminate();
      } catch {
        /* ignorar */
      }
      throw err;
    }
    this.ff = ff;
    this.tech(`Motor pronto (${kind === 'mt' ? 'multithread' : 'single-thread'}).`);
    this.emitLoad('ready', 1);
  }

  /** Executa operações uma de cada vez (miniaturas, prévias e conversões dividem a mesma instância). */
  run<T>(task: (ff: FFmpeg) => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      await this.ensure();
      if (!this.ff) throw new Error('Motor indisponível');
      return task(this.ff);
    });
    this.chain = next.catch(() => {});
    return next;
  }

  /**
   * Executa o ffmpeg com vigia de travamento. Se o multithread travar, troca para single-thread
   * e repete a operação uma vez.
   */
  async exec(ff: FFmpeg, args: string[]): Promise<number> {
    this.stopped = false;
    this.tech(`ffmpeg ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
    this.lastActivity = performance.now();
    let watchdog = 0;
    const stalled = new Promise<never>((_, reject) => {
      watchdog = window.setInterval(() => {
        if (performance.now() - this.lastActivity > STALL_MS) reject(new EngineStalledError());
      }, 2000);
    });
    try {
      return await Promise.race([ff.exec(args), stalled]);
    } catch (err) {
      if (this.stopped) throw new StoppedError();
      throw err;
    } finally {
      clearInterval(watchdog);
    }
  }

  /** Disponibiliza o arquivo para o ffmpeg. Prefere WORKERFS (lê direto do disco). */
  async withInput<T>(ff: FFmpeg, file: File, fn: (path: string) => Promise<T>): Promise<T> {
    let mounted = false;
    let path = '';
    if (this.workerfs !== false) {
      try {
        await ff.createDir('/in').catch(() => {});
        await ff.mount('WORKERFS' as Parameters<FFmpeg['mount']>[0], { files: [file] }, '/in');
        mounted = true;
        this.workerfs = true;
        path = `/in/${file.name}`;
      } catch (err) {
        this.workerfs = false;
        this.tech(`WORKERFS indisponível (${errMessage(err)}). Copiando arquivos para a memória.`);
      }
    }
    if (!mounted) {
      path = `/input${extOf(file.name)}`;
      await ff.writeFile(path, await fetchFile(file));
    }
    try {
      return await fn(path);
    } finally {
      if (mounted) await ff.unmount('/in').catch(() => {});
      else await ff.deleteFile(path).catch(() => {});
    }
  }

  async removeFile(ff: FFmpeg, path: string) {
    await ff.deleteFile(path).catch(() => {});
  }

  /** "Parar": encerra o worker. O próximo uso recarrega o motor a partir dos blob URLs em cache. */
  terminate() {
    this.stopped = true;
    if (this.ff) {
      try {
        this.ff.terminate();
      } catch {
        /* ignorar */
      }
    }
    this.ff = null;
    this.status = 'idle';
    this.tech('Motor encerrado.');
  }

  /** Depois de um travamento: encerra e, se for multithread, passa a usar single-thread. */
  recoverFromStall() {
    const wasMt = this.kind === 'mt';
    this.terminate();
    this.stopped = false;
    if (wasMt) {
      this.kind = 'st';
      this.tech('O motor multithread travou. Usando single-thread daqui em diante.');
    }
    return wasMt;
  }
}

function extOf(name: string) {
  const m = /\.[a-z0-9]+$/i.exec(name);
  return m ? m[0].toLowerCase() : '.mts';
}

export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export const engine = new Engine();
