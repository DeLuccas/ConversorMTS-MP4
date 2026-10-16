// Monta os argumentos do ffmpeg. Funções puras, cobertas por testes.
import type { Settings } from './settings';

export const FILTERS = {
  deinterlace: 'bwdif=mode=send_frame:parity=auto:deint=interlaced',
  denoise: { light: 'hqdn3d=1.5:1.5:6:6', medium: 'hqdn3d=3:2.5:8:7' },
  sharpen: { light: 'unsharp=5:5:0.45:3:3:0.0', medium: 'unsharp=5:5:0.85:3:3:0.0' },
  color: 'eq=contrast=1.04:saturation=1.10',
  format: 'format=yuv420p',
} as const;

type FilterSettings = Pick<Settings, 'deinterlace' | 'denoise' | 'sharpen' | 'resolution' | 'color'>;

/** Cadeia de filtros do modo Melhorar: desentrelaçar → ruído → escala → nitidez → cor → formato. */
export function buildFilters(s: FilterSettings): string {
  const vf: string[] = [];
  if (s.deinterlace) vf.push(FILTERS.deinterlace);
  if (s.denoise !== 'off') vf.push(FILTERS.denoise[s.denoise]);
  if (s.resolution !== 'original') vf.push(`scale=-2:${s.resolution}:flags=lanczos`);
  if (s.sharpen !== 'off') vf.push(FILTERS.sharpen[s.sharpen]);
  if (s.color) vf.push(FILTERS.color);
  vf.push(FILTERS.format);
  return vf.join(',');
}

export function buildArgs(s: Settings, input: string, output: string): string[] {
  if (s.mode === 'fast') {
    return [
      '-fflags', '+genpts',
      '-i', input,
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', s.audioBitrate,
      '-movflags', '+faststart',
      output,
    ];
  }
  return [
    '-i', input,
    '-map', '0:v:0', '-map', '0:a?',
    '-vf', buildFilters(s),
    '-c:v', 'libx264', '-preset', s.preset, '-crf', String(s.crf),
    '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', s.audioBitrate,
    '-movflags', '+faststart',
    output,
  ];
}

/** Lê duração e gera a miniatura numa única passada (frame aos `at` segundos, 320px, JPEG). */
export function buildThumbArgs(input: string, output: string, at = 2): string[] {
  return [
    '-ss', String(at), '-i', input,
    '-frames:v', '1',
    '-vf', 'scale=320:-2:flags=bicubic',
    '-q:v', '4',
    '-an', '-y', output,
  ];
}

/** Frame da prévia: original (só converte) ou processado com as configurações atuais. */
export function buildPreviewArgs(s: Settings, input: string, output: string, at: number, processed: boolean): string[] {
  const vf = processed ? buildFilters({ ...s }) : FILTERS.format;
  return [
    '-ss', at.toFixed(2), '-i', input,
    '-vf', vf,
    '-frames:v', '1',
    '-q:v', '2',
    '-an', '-y', output,
  ];
}

/** Rótulo textual da qualidade (CRF). */
export function crfLabel(crf: number): string {
  if (crf <= 16) return 'máxima';
  if (crf <= 19) return 'alta';
  if (crf <= 21) return 'boa';
  return 'econômica';
}
