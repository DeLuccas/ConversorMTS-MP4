// Estimativas de tempo e tamanho, e medição de velocidade durante a conversão.
// Sem dependências do navegador, para ser testável.
import type { Settings } from './settings';

/**
 * Velocidade de referência (segundos de vídeo por segundo real) para 1080i no modo Melhorar
 * com os padrões. Valores conservadores, medidos em notebooks comuns.
 */
export const BASE_SPEED = { mt: 0.55, st: 0.2 } as const;
/** Conversão rápida só reempacota o vídeo e recodifica o áudio. */
export const FAST_SPEED = { mt: 12, st: 8 } as const;

/** Quanto as opções deixam a conversão mais lenta (1 = padrão). */
export function speedFactor(s: Settings): number {
  if (s.mode === 'fast') return 1;
  let f = 1;
  f *= s.preset === 'veryfast' ? 1.45 : s.preset === 'medium' ? 0.55 : 1;
  f *= s.resolution === '1440' ? 0.5 : s.resolution === '2160' ? 0.2 : 1;
  f *= s.denoise === 'medium' ? 0.88 : s.denoise === 'off' ? 1.1 : 1;
  f *= s.sharpen === 'off' ? 1.05 : 1;
  f *= s.deinterlace ? 1 : 1.12;
  f *= s.color ? 0.96 : 1;
  return f;
}

export interface SpeedContext {
  multithread: boolean;
  /** Velocidade-base medida em conversões anteriores (normalizada para o fator 1). */
  calibrated?: number | null;
}

export function expectedSpeed(s: Settings, ctx: SpeedContext): number {
  const key = ctx.multithread ? 'mt' : 'st';
  if (s.mode === 'fast') return FAST_SPEED[key];
  const base = ctx.calibrated && ctx.calibrated > 0 ? ctx.calibrated : BASE_SPEED[key];
  return base * speedFactor(s);
}

/** Tempo previsto (s) para converter `videoSeconds` de gravação. */
export function estimateConvertSeconds(videoSeconds: number, s: Settings, ctx: SpeedContext): number {
  if (videoSeconds <= 0) return 0;
  return videoSeconds / expectedSpeed(s, ctx);
}

/** Taxa de bits estimada do vídeo H.264 (bits/s) para o CRF e a resolução escolhidos. */
export function estimateVideoBitrate(s: Settings): number {
  const base1080 = 9_000_000; // CRF 18, cenas típicas de filmadora
  let br = base1080 * Math.pow(2, -(s.crf - 18) / 6);
  br *= s.resolution === '1440' ? 1.7 : s.resolution === '2160' ? 3.4 : 1;
  br *= s.denoise === 'medium' ? 0.82 : s.denoise === 'light' ? 0.9 : 1;
  br *= s.sharpen === 'medium' ? 1.12 : s.sharpen === 'light' ? 1.05 : 1;
  br *= s.preset === 'veryfast' ? 1.15 : s.preset === 'medium' ? 0.92 : 1;
  return br;
}

export function audioBits(s: Settings): number {
  return parseInt(s.audioBitrate, 10) * 1000;
}

/** Tamanho estimado do MP4 (bytes). No modo rápido o vídeo é copiado, então fica perto do original. */
export function estimateOutputBytes(videoSeconds: number, inputBytes: number, s: Settings): number {
  if (s.mode === 'fast') return inputBytes * 0.97;
  return ((estimateVideoBitrate(s) + audioBits(s)) / 8) * videoSeconds;
}

/**
 * Mede a velocidade real (segundos de vídeo por segundo de relógio) com média móvel exponencial.
 * A estimativa inicial vale até haver medições suficientes.
 */
export class SpeedMeter {
  private last: { video: number; time: number } | null = null;
  private ema: number | null = null;
  private measuredWall = 0;

  constructor(
    private prior: number,
    private alpha = 0.15,
  ) {}

  /** Registra o progresso acumulado do lote (segundos de vídeo concluídos) no instante `now` (ms). */
  sample(videoDone: number, now: number): void {
    if (!this.last) {
      this.last = { video: videoDone, time: now };
      return;
    }
    const dt = (now - this.last.time) / 1000;
    const dv = videoDone - this.last.video;
    if (dt < 0.5 || dv < 0) return;
    const inst = dv / dt;
    this.ema = this.ema === null ? inst : this.alpha * inst + (1 - this.alpha) * this.ema;
    this.measuredWall += dt;
    this.last = { video: videoDone, time: now };
  }

  /** Recomeça a contagem de tempo (ex.: entre vídeos, para não contar a leitura do arquivo). */
  pause(): void {
    this.last = null;
  }

  get speed(): number {
    if (this.ema === null) return this.prior;
    // Mistura a estimativa inicial com a medição nos primeiros ~20 s
    const w = Math.min(1, this.measuredWall / 20);
    return w * this.ema + (1 - w) * this.prior;
  }

  get confident(): boolean {
    return this.measuredWall >= 8;
  }

  remaining(videoRemaining: number): number {
    const sp = this.speed;
    return sp > 0 ? videoRemaining / sp : Infinity;
  }
}

/** Progresso de um vídeo: nunca volta e não passa de 99% antes do fim. */
export class ProgressTracker {
  private pct = 0;
  constructor(public duration = 0) {}
  update(seconds: number): number {
    if (this.duration > 0 && Number.isFinite(seconds)) {
      const p = (seconds / this.duration) * 100;
      this.pct = Math.min(99, Math.max(this.pct, p));
    }
    return this.pct;
  }
  /** Reserva: evento `progress` do ffmpeg (0–1). */
  updateRatio(ratio: number): number {
    if (Number.isFinite(ratio) && ratio > 0 && ratio <= 1) this.pct = Math.min(99, Math.max(this.pct, ratio * 100));
    return this.pct;
  }
  get value(): number {
    return this.pct;
  }
}

const RE_DURATION = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const RE_TIME = /time=\s*(-?\d+):(\d+):(\d+(?:\.\d+)?)/;

export function parseDuration(line: string): number | null {
  const m = RE_DURATION.exec(line);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

export function parseTime(line: string): number | null {
  const m = RE_TIME.exec(line);
  if (!m || m[1].startsWith('-')) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Taxa de quadros a partir de "29.97 fps" ou "59.94 fps" no log. */
export function parseFps(line: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*fps/.exec(line);
  return m ? Number(m[1]) : null;
}
