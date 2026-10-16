// Nomes dos arquivos de saída. Nunca sobrescreve: em conflito, acrescenta " (2)", " (3)"…
import type { Naming } from './settings';

const pad = (n: number) => String(n).padStart(2, '0');

/** "2011-03-12 14h32" a partir da data de gravação (hora local). */
export function dateStem(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

/** "00001" a partir de "00001.MTS". */
export function originalStem(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const stem = base.replace(/\.(m2ts|mts)$/i, '');
  return stem || 'video';
}

export function outputStem(file: { name: string; lastModified: number }, naming: Naming): string {
  if (naming === 'date' && Number.isFinite(file.lastModified) && file.lastModified > 0) {
    return dateStem(file.lastModified);
  }
  return originalStem(file.name);
}

/**
 * Devolve um nome livre. `isTaken` pode consultar o lote atual e a pasta de destino.
 * A comparação ignora maiúsculas/minúsculas, como no Windows e no macOS.
 */
export async function uniqueName(
  stem: string,
  isTaken: (name: string) => boolean | Promise<boolean>,
  ext = '.mp4',
): Promise<string> {
  let name = `${stem}${ext}`;
  for (let k = 2; await isTaken(name); k++) name = `${stem} (${k})${ext}`;
  return name;
}

/** Registro de nomes já usados neste lote. */
export class NameRegistry {
  private used = new Set<string>();
  has(name: string): boolean {
    return this.used.has(name.toLowerCase());
  }
  add(name: string): void {
    this.used.add(name.toLowerCase());
  }
  delete(name: string): void {
    this.used.delete(name.toLowerCase());
  }
  clear(): void {
    this.used.clear();
  }
}
