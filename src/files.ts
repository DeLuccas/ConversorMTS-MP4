// Leitura de arquivos e pastas (inclusive a estrutura AVCHD do cartão).

export const VIDEO_RE = /\.(mts|m2ts)$/i;

export const fileKey = (f: { name: string; size: number; lastModified: number }) =>
  `${f.name}|${f.size}|${f.lastModified}`;

/**
 * Captura as entradas do arrastar e soltar de forma SÍNCRONA. O DataTransfer é esvaziado
 * pelo navegador assim que o evento termina, então isto precisa rodar antes de qualquer await.
 */
export function captureDrop(dt: DataTransfer): { entries: FileSystemEntry[]; files: File[] } {
  const entries: FileSystemEntry[] = [];
  const files: File[] = [];
  const items = dt.items ? Array.from(dt.items) : [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
    else {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (!entries.length && !files.length && dt.files) files.push(...Array.from(dt.files));
  return { entries, files };
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

/** Percorre pastas recursivamente. `onFound` informa quantos vídeos já apareceram. */
export async function walkEntries(
  entries: FileSystemEntry[],
  onFound?: (videos: number) => void,
): Promise<{ videos: File[]; others: number }> {
  const videos: File[] = [];
  let others = 0;
  const visit = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      if (!VIDEO_RE.test(entry.name)) {
        others++;
        return;
      }
      try {
        videos.push(await entryFile(entry as FileSystemFileEntry));
        onFound?.(videos.length);
      } catch {
        others++;
      }
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries devolve lotes de até 100 itens; repete até vir vazio
      for (;;) {
        let batch: FileSystemEntry[];
        try {
          batch = await readBatch(reader);
        } catch {
          break;
        }
        if (!batch.length) break;
        for (const child of batch) await visit(child);
      }
    }
  };
  for (const e of entries) await visit(e);
  return { videos, others };
}

export function splitFiles(list: Iterable<File>): { videos: File[]; others: number } {
  const videos: File[] = [];
  let others = 0;
  for (const f of list) {
    if (VIDEO_RE.test(f.name)) videos.push(f);
    else others++;
  }
  return { videos, others };
}

/** Remove duplicados (nome + tamanho + data) e ordena por data de gravação. */
export function dedupeAndSort<T extends { name: string; size: number; lastModified: number }>(
  incoming: T[],
  existingKeys: Set<string>,
): { added: T[]; duplicates: number } {
  const seen = new Set(existingKeys);
  const added: T[] = [];
  let duplicates = 0;
  for (const f of incoming) {
    const k = fileKey(f);
    if (seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    added.push(f);
  }
  added.sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { added, duplicates };
}
