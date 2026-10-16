// Estado da aplicação e um mecanismo mínimo de assinatura (sem framework).
import { loadSettings, saveSettings, type Settings } from './settings';

export type Phase = 'empty' | 'ready' | 'converting' | 'done';
export type ItemStatus = 'queued' | 'converting' | 'saved' | 'ready' | 'failed';
export type ProbeState = 'pending' | 'running' | 'done' | 'failed';

export interface ItemError {
  message: string;
  detail: string;
}

export interface VideoItem {
  id: string;
  key: string;
  file: File;
  selected: boolean;
  probe: ProbeState;
  duration: number | null;
  fps: number | null;
  thumbUrl: string | null;
  status: ItemStatus;
  progress: number;
  outName?: string;
  outUrl?: string;
  outSize?: number;
  /** Salvo na pasta, mas o download direto também está disponível (se a gravação falhou). */
  savedToFolder?: boolean;
  error?: ItemError;
}

export interface BatchState {
  ids: string[];
  index: number;
  startedAt: number;
  videoTotal: number;
  videoDone: number;
  remaining: number;
  currentTime: number;
  overall: number;
}

export interface DoneSummary {
  converted: number;
  failed: number;
  videoSeconds: number;
  inputBytes: number;
  outputBytes: number;
  elapsed: number;
  folder: string | null;
}

export interface AnalyzeState {
  found: number;
  done: number;
  total: number;
  scanning: boolean;
}

export interface AppState {
  phase: Phase;
  items: VideoItem[];
  settings: Settings;
  analyze: AnalyzeState | null;
  batch: BatchState | null;
  summary: DoneSummary | null;
  folderName: string | null;
  stopping: boolean;
}

export type Topic = 'phase' | 'items' | 'item' | 'settings' | 'analyze' | 'batch' | 'summary' | 'folder';

type Listener = (detail?: string) => void;

class Store {
  state: AppState = {
    phase: 'empty',
    items: [],
    settings: loadSettings(),
    analyze: null,
    batch: null,
    summary: null,
    folderName: null,
    stopping: false,
  };
  private listeners = new Map<Topic, Set<Listener>>();

  on(topic: Topic, fn: Listener) {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)!.add(fn);
    return () => this.listeners.get(topic)!.delete(fn);
  }

  emit(topic: Topic, detail?: string) {
    this.listeners.get(topic)?.forEach((fn) => fn(detail));
  }

  setPhase(phase: Phase) {
    if (this.state.phase === phase) return;
    this.state.phase = phase;
    this.emit('phase');
  }

  updateSettings(patch: Partial<Settings>) {
    this.state.settings = { ...this.state.settings, ...patch };
    saveSettings(this.state.settings);
    this.emit('settings');
  }

  replaceSettings(s: Settings) {
    this.state.settings = s;
    saveSettings(s);
    this.emit('settings');
  }

  item(id: string) {
    return this.state.items.find((i) => i.id === id);
  }

  /** Atualiza um item e avisa só quem desenha esse item. */
  patchItem(id: string, patch: Partial<VideoItem>) {
    const it = this.item(id);
    if (!it) return;
    Object.assign(it, patch);
    this.emit('item', id);
  }

  get selected() {
    return this.state.items.filter((i) => i.selected);
  }

  /** Vídeos que o botão "Converter" vai processar. */
  get pending() {
    return this.state.items.filter((i) => i.selected && (i.status === 'queued' || i.status === 'failed'));
  }
}

export const store = new Store();
