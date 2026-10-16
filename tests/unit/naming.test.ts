import { describe, expect, it } from 'vitest';
import { dateStem, NameRegistry, originalStem, outputStem, uniqueName } from '../../src/naming';

const ts = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 7).getTime();

describe('nomes de saída', () => {
  it('data da gravação: "2011-03-12 14h32"', () => {
    expect(dateStem(ts(2011, 3, 12, 14, 32))).toBe('2011-03-12 14h32');
    expect(dateStem(ts(2009, 1, 2, 3, 4))).toBe('2009-01-02 03h04');
  });

  it('nome original: tira .MTS / .M2TS em qualquer caixa', () => {
    expect(originalStem('00001.MTS')).toBe('00001');
    expect(originalStem('00001.mts')).toBe('00001');
    expect(originalStem('CLIP 7.M2TS')).toBe('CLIP 7');
    expect(originalStem('PRIVATE/AVCHD/BDMV/STREAM/00003.MTS')).toBe('00003');
  });

  it('escolhe o formato conforme a preferência', () => {
    const f = { name: '00001.MTS', lastModified: ts(2011, 3, 12, 14, 32) };
    expect(outputStem(f, 'date')).toBe('2011-03-12 14h32');
    expect(outputStem(f, 'original')).toBe('00001');
  });

  it('sem data válida, usa o nome original', () => {
    expect(outputStem({ name: '00009.MTS', lastModified: 0 }, 'date')).toBe('00009');
  });
});

describe('conflitos: nunca sobrescreve', () => {
  it('acrescenta (2), (3)…', async () => {
    const reg = new NameRegistry();
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      const n = await uniqueName('2011-03-12 14h32', (x) => reg.has(x));
      reg.add(n);
      names.push(n);
    }
    expect(names).toEqual(['2011-03-12 14h32.mp4', '2011-03-12 14h32 (2).mp4', '2011-03-12 14h32 (3).mp4']);
  });

  it('considera arquivos que já existem na pasta (consulta assíncrona)', async () => {
    const onDisk = new Set(['00001.mp4', '00001 (2).mp4']);
    const n = await uniqueName('00001', async (x) => onDisk.has(x));
    expect(n).toBe('00001 (3).mp4');
  });

  it('ignora maiúsculas e minúsculas, como o Windows e o macOS', async () => {
    const reg = new NameRegistry();
    reg.add('00001.MP4');
    expect(await uniqueName('00001', (x) => reg.has(x))).toBe('00001 (2).mp4');
  });

  it('liberar um nome permite reutilizá-lo', async () => {
    const reg = new NameRegistry();
    reg.add('a.mp4');
    reg.delete('a.mp4');
    expect(await uniqueName('a', (x) => reg.has(x))).toBe('a.mp4');
  });
});
