// Formatação em português do Brasil: tamanhos, durações, datas, timecode.

const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${nf1.format(gb)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 10) return `${nf0.format(mb)} MB`;
  return `${nf1.format(Math.max(mb, 0.1))} MB`;
}

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export const count = (n: number, one: string, many: string) => `${n} ${plural(n, one, many)}`;

/** Duração de gravação curta: "3:12", "1:02:40". */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(r).padStart(2, '0')}`;
}

/** Duração humana: "46 min", "1 h 10 min", "40 s". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s} s`;
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}

/** Tempo restante falado: "Faltam cerca de 25 minutos". */
export function formatRemaining(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return 'Calculando o tempo restante…';
  if (sec < 45) return 'Falta menos de 1 minuto';
  const min = Math.round(sec / 60);
  if (min < 60) {
    // Arredonda para valores "humanos" quando o tempo é maior
    const rounded = min <= 10 ? min : Math.round(min / 5) * 5;
    return `Faltam cerca de ${rounded} ${plural(rounded, 'minuto', 'minutos')}`;
  }
  const h = Math.floor(min / 60);
  const m = Math.round((min % 60) / 5) * 5;
  if (m === 0 || m === 60) {
    const hh = m === 60 ? h + 1 : h;
    return `Faltam cerca de ${hh} ${plural(hh, 'hora', 'horas')}`;
  }
  return `Faltam cerca de ${h} h ${String(m).padStart(2, '0')} min`;
}

/** Estimativa curta: "cerca de 1 h 10 min", "menos de 1 min". */
export function formatEstimate(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return 'alguns segundos';
  if (sec < 60) return 'menos de 1 min';
  return `cerca de ${formatDuration(sec)}`;
}

/** Timecode HH:MM:SS:FF. */
export function timecode(sec: number, fps = 30): string {
  const t = Math.max(0, sec || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const f = Math.min(fps - 1, Math.floor((t % 1) * fps));
  return [h, m, s, f].map((n) => String(n).padStart(2, '0')).join(':');
}

const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDayFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

/** "Sábado, 12 de março de 2011". */
export function formatDay(ts: number): string {
  const s = dayFmt.format(new Date(ts));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatShortDay(ts: number): string {
  return shortDayFmt.format(new Date(ts));
}

/** "14h32". */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Chave do dia local "2011-03-12". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Converte "HH:MM:SS.ss" em segundos. */
export function parseHMS(h: string, m: string, s: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}
