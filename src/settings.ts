// Preferências do usuário, guardadas no localStorage.

export type Mode = 'enhance' | 'fast';
export type Level = 'off' | 'light' | 'medium';
export type Resolution = 'original' | '1440' | '2160';
export type Preset = 'veryfast' | 'faster' | 'medium';
export type AudioBitrate = '192k' | '256k' | '320k';
export type Naming = 'date' | 'original';

export interface Settings {
  mode: Mode;
  deinterlace: boolean;
  denoise: Level;
  sharpen: Level;
  resolution: Resolution;
  color: boolean;
  preset: Preset;
  crf: number;
  audioBitrate: AudioBitrate;
  naming: Naming;
  sound: boolean;
}

export const DEFAULTS: Readonly<Settings> = Object.freeze({
  mode: 'enhance',
  deinterlace: true,
  denoise: 'light',
  sharpen: 'light',
  resolution: 'original',
  color: false,
  preset: 'faster',
  crf: 18,
  audioBitrate: '256k',
  naming: 'date',
  sound: true,
});

const KEY = 'conversor-mts:settings:v1';

const ALLOWED: { [K in keyof Settings]?: readonly unknown[] } = {
  mode: ['enhance', 'fast'],
  denoise: ['off', 'light', 'medium'],
  sharpen: ['off', 'light', 'medium'],
  resolution: ['original', '1440', '2160'],
  preset: ['veryfast', 'faster', 'medium'],
  audioBitrate: ['192k', '256k', '320k'],
  naming: ['date', 'original'],
};

/** Valida um objeto qualquer e devolve configurações completas e seguras. */
export function sanitize(raw: unknown): Settings {
  const out: Settings = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = r[key];
    if (v === undefined) continue;
    const allowed = ALLOWED[key];
    if (allowed) {
      if (allowed.includes(v)) (out as unknown as Record<string, unknown>)[key] = v;
    } else if (key === 'crf') {
      if (typeof v === 'number' && Number.isFinite(v)) out.crf = Math.min(24, Math.max(14, Math.round(v)));
    } else if (typeof v === 'boolean') {
      (out as unknown as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* modo privado ou armazenamento cheio: segue sem salvar */
  }
}

export function isDefaultAdvanced(s: Settings): boolean {
  return (
    s.deinterlace === DEFAULTS.deinterlace &&
    s.denoise === DEFAULTS.denoise &&
    s.sharpen === DEFAULTS.sharpen &&
    s.resolution === DEFAULTS.resolution &&
    s.color === DEFAULTS.color &&
    s.preset === DEFAULTS.preset &&
    s.crf === DEFAULTS.crf &&
    s.audioBitrate === DEFAULTS.audioBitrate
  );
}

export function resetAdvanced(s: Settings): Settings {
  return {
    ...s,
    deinterlace: DEFAULTS.deinterlace,
    denoise: DEFAULTS.denoise,
    sharpen: DEFAULTS.sharpen,
    resolution: DEFAULTS.resolution,
    color: DEFAULTS.color,
    preset: DEFAULTS.preset,
    crf: DEFAULTS.crf,
    audioBitrate: DEFAULTS.audioBitrate,
  };
}
