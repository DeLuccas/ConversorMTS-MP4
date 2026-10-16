// Salvar na pasta escolhida (File System Access API) ou baixar pelo navegador.

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
};

type PickerWindow = Window & {
  showDirectoryPicker?: (o?: { mode?: 'read' | 'readwrite'; id?: string; startIn?: string }) => Promise<DirHandle>;
};

export const canPickFolder = (): boolean =>
  typeof window !== 'undefined' && window.isSecureContext && typeof (window as PickerWindow).showDirectoryPicker === 'function';

let dir: DirHandle | null = null;

export const destination = {
  get handle() {
    return dir;
  },
  get name() {
    return dir?.name ?? null;
  },
  clear() {
    dir = null;
  },
};

/** Abre o seletor de pasta. Devolve false se a pessoa cancelar. */
export async function pickDestination(): Promise<boolean> {
  const w = window as PickerWindow;
  if (!w.showDirectoryPicker) return false;
  try {
    dir = await w.showDirectoryPicker({ mode: 'readwrite', id: 'conversor-mts-destino', startIn: 'videos' });
    return true;
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return false;
    throw err;
  }
}

/** Confirma a permissão de escrita (pedida dentro do clique em Converter). */
export async function ensureWritePermission(): Promise<boolean> {
  if (!dir) return false;
  try {
    if (dir.queryPermission && (await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    if (dir.requestPermission) return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
    return true;
  } catch {
    return false;
  }
}

export async function existsInDestination(name: string): Promise<boolean> {
  if (!dir) return false;
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

export async function writeToDestination(name: string, blob: Blob): Promise<void> {
  if (!dir) throw new Error('Nenhuma pasta de destino');
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(blob);
    await w.close();
  } catch (err) {
    await w.abort().catch(() => {});
    throw err;
  }
}

/** Relê o MP4 salvo na pasta, para o player. */
export async function readFromDestination(name: string): Promise<File | null> {
  if (!dir) return null;
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

export function triggerDownload(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Baixa em sequência, com 700 ms entre um e outro (os navegadores bloqueiam rajadas). */
export async function downloadAll(items: { url: string; name: string }[], onEach?: (i: number) => void) {
  for (let i = 0; i < items.length; i++) {
    triggerDownload(items[i].url, items[i].name);
    onEach?.(i);
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, 700));
  }
}
