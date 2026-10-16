import { describe, expect, it } from 'vitest';
import {
  BASE_SPEED,
  estimateConvertSeconds,
  estimateOutputBytes,
  expectedSpeed,
  parseDuration,
  parseTime,
  ProgressTracker,
  SpeedMeter,
  speedFactor,
} from '../../src/estimate';
import { formatEstimate, formatRemaining, formatDuration, timecode } from '../../src/format';
import { DEFAULTS } from '../../src/settings';

const s = { ...DEFAULTS };

describe('estimativa de tempo', () => {
  it('padrões têm fator 1', () => expect(speedFactor(s)).toBe(1));

  it('opções mais pesadas deixam mais lento', () => {
    expect(speedFactor({ ...s, preset: 'medium' })).toBeLessThan(1);
    expect(speedFactor({ ...s, resolution: '2160' })).toBeLessThan(speedFactor({ ...s, resolution: '1440' }));
    expect(speedFactor({ ...s, preset: 'veryfast' })).toBeGreaterThan(1);
  });

  it('modo rápido é muito mais rápido que o Melhorar', () => {
    const ctx = { multithread: true };
    const fast = estimateConvertSeconds(600, { ...s, mode: 'fast' }, ctx);
    const enh = estimateConvertSeconds(600, s, ctx);
    expect(enh / fast).toBeGreaterThan(10);
  });

  it('single-thread é mais lento que multithread', () => {
    expect(expectedSpeed(s, { multithread: false })).toBeLessThan(expectedSpeed(s, { multithread: true }));
  });

  it('usa a calibração medida quando existe', () => {
    expect(expectedSpeed(s, { multithread: true, calibrated: 1.2 })).toBeCloseTo(1.2);
    expect(expectedSpeed(s, { multithread: true, calibrated: null })).toBe(BASE_SPEED.mt);
  });

  it('46 min de gravação no padrão multithread ≈ 1 h 24 min', () => {
    const sec = estimateConvertSeconds(46 * 60, s, { multithread: true });
    expect(formatDuration(sec)).toBe('1 h 24 min');
  });

  it('nada selecionado: 0', () => expect(estimateConvertSeconds(0, s, { multithread: true })).toBe(0));
});

describe('tamanho estimado', () => {
  it('CRF menor gera arquivo maior', () => {
    expect(estimateOutputBytes(60, 0, { ...s, crf: 14 })).toBeGreaterThan(estimateOutputBytes(60, 0, { ...s, crf: 24 }));
  });
  it('modo rápido fica perto do original', () => {
    expect(estimateOutputBytes(60, 1000, { ...s, mode: 'fast' })).toBeCloseTo(970);
  });
});

describe('SpeedMeter (média móvel)', () => {
  it('começa pela estimativa inicial', () => {
    const m = new SpeedMeter(0.5);
    expect(m.speed).toBe(0.5);
    expect(m.remaining(100)).toBe(200);
  });

  it('converge para a velocidade medida', () => {
    const m = new SpeedMeter(0.5);
    let t = 0;
    let v = 0;
    for (let i = 0; i < 60; i++) {
      m.sample(v, t);
      t += 1000;
      v += 2; // 2 s de vídeo por segundo real
    }
    expect(m.speed).toBeGreaterThan(1.8);
    expect(m.speed).toBeLessThan(2.05);
    expect(m.confident).toBe(true);
  });

  it('suaviza picos', () => {
    const m = new SpeedMeter(1, 0.15);
    let v = 0;
    for (let i = 0; i <= 30; i++) m.sample((v += 1), i * 1000);
    m.sample(v + 20, 31_000); // pico
    expect(m.speed).toBeLessThan(5);
  });

  it('pausa entre vídeos não conta como lentidão', () => {
    const m = new SpeedMeter(1);
    for (let i = 0; i <= 25; i++) m.sample(i, i * 1000);
    m.pause();
    m.sample(25, 60_000); // 35 s parado lendo o próximo arquivo
    m.sample(26, 61_000);
    expect(m.speed).toBeGreaterThan(0.9);
  });

  it('ignora amostras próximas demais', () => {
    const m = new SpeedMeter(1);
    m.sample(0, 0);
    m.sample(10, 100);
    expect(m.speed).toBe(1);
  });
});

describe('ProgressTracker', () => {
  it('nunca volta e não passa de 99%', () => {
    const p = new ProgressTracker(100);
    expect(p.update(50)).toBe(50);
    expect(p.update(30)).toBe(50);
    expect(p.update(150)).toBe(99);
    expect(p.updateRatio(1)).toBe(99);
  });
  it('sem duração conhecida, fica em 0', () => {
    expect(new ProgressTracker(0).update(10)).toBe(0);
  });
});

describe('leitura do log do ffmpeg', () => {
  it('Duration', () => {
    expect(parseDuration('  Duration: 00:12:34.56, start: 1.4, bitrate: 17000 kb/s')).toBeCloseTo(754.56);
    expect(parseDuration('nada')).toBeNull();
  });
  it('time=', () => {
    expect(parseTime('frame=  100 fps= 25 q=28.0 size=1024kB time=00:01:02.50 bitrate=...')).toBeCloseTo(62.5);
    expect(parseTime('time=-00:00:00.03')).toBeNull();
    expect(parseTime('time=N/A')).toBeNull();
  });
});

describe('textos de tempo', () => {
  it.each([
    [20, 'Falta menos de 1 minuto'],
    [60, 'Faltam cerca de 1 minuto'],
    [5 * 60, 'Faltam cerca de 5 minutos'],
    [23 * 60, 'Faltam cerca de 25 minutos'],
    [60 * 60, 'Faltam cerca de 1 hora'],
    [70 * 60, 'Faltam cerca de 1 h 10 min'],
    [119 * 60, 'Faltam cerca de 2 horas'],
    [150 * 60, 'Faltam cerca de 2 h 30 min'],
  ])('%i s → %s', (sec, text) => expect(formatRemaining(sec)).toBe(text));

  it('estimativas curtas', () => {
    expect(formatEstimate(30)).toBe('menos de 1 min');
    expect(formatEstimate(70 * 60)).toBe('cerca de 1 h 10 min');
    expect(formatDuration(46 * 60)).toBe('46 min');
  });

  it('timecode HH:MM:SS:FF', () => {
    expect(timecode(0)).toBe('00:00:00:00');
    expect(timecode(3723.5)).toBe('01:02:03:15');
  });
});
