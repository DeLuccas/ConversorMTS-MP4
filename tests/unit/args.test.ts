import { describe, expect, it } from 'vitest';
import { buildArgs, buildFilters, buildPreviewArgs, buildThumbArgs, crfLabel, FILTERS } from '../../src/args';
import { DEFAULTS, type Settings } from '../../src/settings';

const base: Settings = { ...DEFAULTS };

describe('buildFilters', () => {
  it('usa a ordem desentrelaçar → ruído → escala → nitidez → cor → formato', () => {
    const vf = buildFilters({ deinterlace: true, denoise: 'medium', resolution: '1440', sharpen: 'medium', color: true });
    expect(vf).toBe(
      [
        'bwdif=mode=send_frame:parity=auto:deint=interlaced',
        'hqdn3d=3:2.5:8:7',
        'scale=-2:1440:flags=lanczos',
        'unsharp=5:5:0.85:3:3:0.0',
        'eq=contrast=1.04:saturation=1.10',
        'format=yuv420p',
      ].join(','),
    );
  });

  it('padrões: desentrelaçar, ruído leve e nitidez leve', () => {
    expect(buildFilters(base)).toBe(
      'bwdif=mode=send_frame:parity=auto:deint=interlaced,hqdn3d=1.5:1.5:6:6,unsharp=5:5:0.45:3:3:0.0,format=yuv420p',
    );
  });

  it('tudo desligado deixa só o formato', () => {
    expect(buildFilters({ deinterlace: false, denoise: 'off', resolution: 'original', sharpen: 'off', color: false })).toBe(
      'format=yuv420p',
    );
  });

  // Todas as combinações de opções que mexem na imagem
  const bools = [true, false];
  const levels = ['off', 'light', 'medium'] as const;
  const resolutions = ['original', '1440', '2160'] as const;
  const combos: Parameters<typeof buildFilters>[0][] = [];
  for (const deinterlace of bools)
    for (const denoise of levels)
      for (const resolution of resolutions)
        for (const sharpen of levels) for (const color of bools) combos.push({ deinterlace, denoise, resolution, sharpen, color });

  it.each(combos)('combinação %o mantém a ordem e termina em yuv420p', (c) => {
    const parts = buildFilters(c).split(',');
    expect(parts.at(-1)).toBe(FILTERS.format);
    const expected: string[] = [];
    if (c.deinterlace) expected.push(FILTERS.deinterlace);
    if (c.denoise !== 'off') expected.push(FILTERS.denoise[c.denoise]);
    if (c.resolution !== 'original') expected.push(`scale=-2:${c.resolution}:flags=lanczos`);
    if (c.sharpen !== 'off') expected.push(FILTERS.sharpen[c.sharpen]);
    if (c.color) expected.push(FILTERS.color);
    expected.push(FILTERS.format);
    expect(parts).toEqual(expected);
  });

  it('as 108 combinações foram testadas', () => expect(combos).toHaveLength(108));
});

describe('buildArgs', () => {
  it('modo Melhorar com os argumentos exatos', () => {
    expect(buildArgs(base, '/in/00001.MTS', '/out.mp4')).toEqual([
      '-i', '/in/00001.MTS',
      '-map', '0:v:0', '-map', '0:a?',
      '-vf', buildFilters(base),
      '-c:v', 'libx264', '-preset', 'faster', '-crf', '18',
      '-profile:v', 'high',
      '-c:a', 'aac', '-b:a', '256k',
      '-movflags', '+faststart',
      '/out.mp4',
    ]);
  });

  it('modo Rápido copia o vídeo e recodifica o áudio', () => {
    expect(buildArgs({ ...base, mode: 'fast', audioBitrate: '320k' }, 'IN', 'OUT.mp4')).toEqual([
      '-fflags', '+genpts',
      '-i', 'IN',
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '320k',
      '-movflags', '+faststart',
      'OUT.mp4',
    ]);
  });

  it.each(['veryfast', 'faster', 'medium'] as const)('preset %s', (preset) => {
    const a = buildArgs({ ...base, preset }, 'IN', 'OUT');
    expect(a[a.indexOf('-preset') + 1]).toBe(preset);
  });

  it.each([14, 18, 24])('CRF %i', (crf) => {
    const a = buildArgs({ ...base, crf }, 'IN', 'OUT');
    expect(a[a.indexOf('-crf') + 1]).toBe(String(crf));
  });

  it.each(['192k', '256k', '320k'] as const)('áudio %s nos dois modos', (audioBitrate) => {
    for (const mode of ['enhance', 'fast'] as const) {
      const a = buildArgs({ ...base, mode, audioBitrate }, 'IN', 'OUT');
      expect(a[a.indexOf('-b:a') + 1]).toBe(audioBitrate);
    }
  });

  it('sempre preserva o áudio (inclusive 5.1): mapeia 0:a? e não força canais', () => {
    for (const mode of ['enhance', 'fast'] as const) {
      const a = buildArgs({ ...base, mode }, 'IN', 'OUT');
      expect(a).toContain('0:a?');
      expect(a).not.toContain('-ac');
      expect(a).not.toContain('-an');
    }
  });

  it('o modo rápido ignora os filtros de imagem', () => {
    const a = buildArgs({ ...base, mode: 'fast', resolution: '2160', color: true }, 'IN', 'OUT');
    expect(a).not.toContain('-vf');
  });
});

describe('miniatura e prévia', () => {
  it('miniatura: -ss antes do -i, 320 px, JPEG, um quadro', () => {
    const a = buildThumbArgs('IN', 'T.jpg');
    expect(a.slice(0, 4)).toEqual(['-ss', '2', '-i', 'IN']);
    expect(a.join(' ')).toContain('scale=320:-2');
    expect(a).toContain('-frames:v');
  });

  it('prévia: original e processado partem do mesmo instante', () => {
    const a = buildPreviewArgs(base, 'IN', 'A.jpg', 12.3, false);
    const b = buildPreviewArgs(base, 'IN', 'B.jpg', 12.3, true);
    expect(a.slice(0, 2)).toEqual(['-ss', '12.30']);
    expect(b.slice(0, 2)).toEqual(['-ss', '12.30']);
    expect(a[a.indexOf('-vf') + 1]).toBe('format=yuv420p');
    expect(b[b.indexOf('-vf') + 1]).toBe(buildFilters(base));
  });
});

describe('crfLabel', () => {
  it.each([
    [14, 'máxima'],
    [16, 'máxima'],
    [17, 'alta'],
    [18, 'alta'],
    [19, 'alta'],
    [20, 'boa'],
    [21, 'boa'],
    [22, 'econômica'],
    [24, 'econômica'],
  ])('CRF %i → %s', (crf, label) => expect(crfLabel(crf)).toBe(label));
});
