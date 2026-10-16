// Conversor MTS - DLCCS: ponto de entrada. Liga o estado, os componentes e o motor.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-700.css';
import '@fontsource/share-tech-mono/latin-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/viewfinder.css';
import './styles/how.css';
import './styles/list.css';
import './styles/settings.css';
import './styles/action-bar.css';
import './styles/progress.css';
import './styles/done.css';
import './styles/modal.css';
import './styles/compare.css';
import './styles/toast.css';
import './styles/footer.css';

import { h, $ } from './ui/dom';
import { icon } from './icons';
import { store, type VideoItem } from './state';
import { engine, errMessage } from './ffmpeg';
import { probe } from './probe';
import { captureDrop, dedupeAndSort, fileKey, splitFiles, walkEntries } from './files';
import { names, requestStop, runBatch, videoSeconds } from './queue';
import { canPickFolder, destination, downloadAll, ensureWritePermission, pickDestination, triggerDownload } from './save';
import {
  APP_TITLE,
  askNotification,
  canAskNotification,
  guardUnload,
  isChromium,
  isMobileDevice,
  isSupported,
  keepAwake,
  notify,
  playCelebration,
  primeCelebration,
  setTitle,
  stopCelebration,
} from './platform';
import { count, formatDuration, formatSize } from './format';
import { createViewfinder } from './ui/viewfinder';
import { createHowItWorks } from './ui/how-it-works';
import { createFileList } from './ui/file-list';
import { createSettingsPanel } from './ui/settings-panel';
import { createActionBar } from './ui/action-bar';
import { createProgress } from './ui/progress';
import { createDoneSummary } from './ui/done-summary';
import { createTechLog } from './ui/tech-log';
import { mountToasts, toast, announce } from './ui/toast';
import { confirmDialog, openModal } from './ui/modal';
import { openPreview } from './ui/preview-modal';
import { openPlayer } from './ui/player-modal';
import { confetti } from './ui/confetti';

// ---------- Entrada de arquivos ----------
const folderInput = h('input', { type: 'file', webkitdirectory: true, multiple: true, hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
const filesInput = h('input', {
  type: 'file',
  multiple: true,
  accept: '.mts,.m2ts,.MTS,.M2TS,video/mp2t',
  hidden: true,
  'aria-hidden': 'true',
  tabindex: '-1',
});
folderInput.setAttribute('webkitdirectory', '');
folderInput.addEventListener('change', () => {
  if (folderInput.files) addFromList(folderInput.files);
  folderInput.value = '';
});
filesInput.addEventListener('change', () => {
  if (filesInput.files) addFromList(filesInput.files);
  filesInput.value = '';
});

function pickFolder() {
  if (busy()) return;
  folderInput.click();
}
function pickFiles() {
  if (busy()) return;
  filesInput.click();
}
const busy = () => store.state.phase === 'converting';

function addFromList(list: FileList) {
  const { videos, others } = splitFiles(Array.from(list));
  addVideos(videos, others);
}

function addVideos(videos: File[], others: number) {
  if (!videos.length) {
    if (others > 0 || !store.state.items.length) {
      toast(
        'Não encontrei vídeos .MTS aqui. Na filmadora eles ficam em PRIVATE › AVCHD › BDMV › STREAM. Tente arrastar a pasta do cartão inteira.',
        { tone: 'error', duration: 9000 },
      );
    }
    if (store.state.analyze?.scanning) store.state.analyze = null;
    store.emit('analyze');
    return;
  }
  const existing = new Set(store.state.items.map((i) => i.key));
  const { added, duplicates } = dedupeAndSort(videos, existing);
  if (others || duplicates) engine.tech(`Adicionados: ${added.length}. Ignorados (não MTS): ${others}. Repetidos: ${duplicates}.`);
  if (!added.length) {
    toast(duplicates === 1 ? 'Esse vídeo já está na lista.' : 'Esses vídeos já estão na lista.');
    return;
  }
  const items: VideoItem[] = added.map((file) => ({
    id: crypto.randomUUID(),
    key: fileKey(file),
    file,
    selected: true,
    probe: 'pending',
    duration: null,
    fps: null,
    thumbUrl: null,
    status: 'queued',
    progress: 0,
  }));
  const all = [...store.state.items, ...items].sort(
    (a, b) => a.file.lastModified - b.file.lastModified || a.file.name.localeCompare(b.file.name, undefined, { numeric: true }),
  );
  store.state.items = all;
  if (store.state.phase === 'empty' || store.state.phase === 'done') {
    store.state.summary = null;
    store.setPhase('ready');
  }
  store.emit('items');
  if (duplicates) toast(`${count(duplicates, 'vídeo repetido foi ignorado', 'vídeos repetidos foram ignorados')}.`);
  announce(`${count(added.length, 'vídeo adicionado', 'vídeos adicionados')}.`);
  void analyze();
}

// ---------- Análise: duração e miniatura, um vídeo por vez ----------
let analyzing = false;
async function analyze() {
  if (analyzing) return;
  analyzing = true;
  try {
    for (;;) {
      const queue = store.state.items.filter((i) => i.probe === 'pending');
      if (!queue.length) break;
      const total = store.state.items.filter((i) => i.probe !== 'failed').length;
      const done = store.state.items.filter((i) => i.probe === 'done').length;
      store.state.analyze = { found: total, total, done, scanning: false };
      store.emit('analyze');
      // Durante a conversão, a análise espera
      while (busy()) await new Promise((r) => setTimeout(r, 1000));
      const item = queue[0];
      if (!store.item(item.id)) continue;
      store.patchItem(item.id, { probe: 'running' });
      try {
        const r = await probe(item.file);
        if (!store.item(item.id)) {
          if (r.thumbUrl) URL.revokeObjectURL(r.thumbUrl);
          continue;
        }
        store.patchItem(item.id, {
          probe: r.duration || r.thumbUrl ? 'done' : 'failed',
          duration: r.duration,
          fps: r.fps,
          thumbUrl: r.thumbUrl,
        });
      } catch (err) {
        const it = store.item(item.id);
        if (!it) continue;
        if (store.state.phase === 'converting' || /terminate/i.test(errMessage(err))) {
          store.patchItem(item.id, { probe: 'pending' });
        } else {
          engine.tech(`Análise falhou (${item.file.name}): ${errMessage(err)}`);
          store.patchItem(item.id, { probe: 'failed' });
          if (engine.status === 'error') {
            toast('Não consegui preparar o conversor. Verifique a internet e recarregue a página.', { tone: 'error', duration: 10000 });
            break;
          }
        }
      }
      store.emit('items');
    }
  } finally {
    analyzing = false;
    store.state.analyze = null;
    store.emit('analyze');
    warnFallbackMemory();
  }
}

/** Só quando o WORKERFS não funciona os arquivos vão para a memória, e aí arquivos grandes podem falhar. */
let warnedMemory = false;
function warnFallbackMemory() {
  if (warnedMemory || engine.workerfs !== false) return;
  const big = store.state.items.filter((i) => i.file.size > 1.5 * 1024 ** 3);
  if (!big.length) return;
  warnedMemory = true;
  toast(
    `${count(big.length, 'vídeo tem', 'vídeos têm')} mais de 1,5 GB. Neste navegador eles podem não caber na memória; se falharem, use o Chrome ou o Edge no computador.`,
    { duration: 12000 },
  );
}

// ---------- Arrastar e soltar em qualquer lugar da página ----------
let dragDepth = 0;
const vfEl = () => document.getElementById('viewfinder');
document.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  dragDepth++;
  if (!busy()) vfEl()?.classList.add('vf--drag');
});
document.addEventListener('dragover', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = busy() ? 'none' : 'copy';
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) vfEl()?.classList.remove('vf--drag');
});
document.addEventListener('drop', (e) => {
  if (!e.dataTransfer) return;
  e.preventDefault();
  dragDepth = 0;
  vfEl()?.classList.remove('vf--drag');
  if (busy()) {
    toast('Espere a conversão terminar para adicionar mais vídeos.');
    return;
  }
  // As entradas precisam ser capturadas antes de qualquer await
  const { entries, files } = captureDrop(e.dataTransfer);
  void (async () => {
    if (store.state.phase === 'empty' || store.state.phase === 'done') {
      store.state.analyze = { found: 0, total: 0, done: 0, scanning: true };
      if (store.state.phase === 'done') store.state.summary = null;
      store.setPhase('ready');
      store.emit('items');
    } else {
      store.state.analyze = { found: 0, total: 0, done: 0, scanning: true };
    }
    store.emit('analyze');
    const fromFiles = splitFiles(files);
    const walked = await walkEntries(entries, (n) => {
      if (store.state.analyze) {
        store.state.analyze.found = n;
        store.emit('analyze');
      }
    });
    if (store.state.analyze) store.state.analyze.scanning = false;
    if (!store.state.items.length && !walked.videos.length && !fromFiles.videos.length) store.setPhase('empty');
    addVideos([...walked.videos, ...fromFiles.videos], walked.others + fromFiles.others);
  })();
});

// ---------- Ações da lista ----------
function removeItem(id: string) {
  const idx = store.state.items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const [item] = store.state.items.splice(idx, 1);
  store.emit('items');
  if (!store.state.items.length) store.setPhase('empty');
  toast(`Vídeo das ${new Date(item.file.lastModified).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} removido da lista.`, {
    action: {
      label: 'Desfazer',
      run: () => {
        if (store.state.items.some((i) => i.id === item.id)) return;
        store.state.items.splice(Math.min(idx, store.state.items.length), 0, item);
        if (store.state.phase === 'empty') store.setPhase('ready');
        store.emit('items');
        if (item.probe === 'pending') void analyze();
      },
    },
  });
}

function showDetails(id: string) {
  const it = store.item(id);
  if (!it?.error) return;
  const pre = h('pre', { class: 'log__pre', tabindex: '0' }, it.error.detail || 'Sem detalhes.');
  const copy = h('button', { class: 'btn btn--small', type: 'button' }, icon('copy'), 'Copiar detalhes');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`${it.file.name}\n${it.error!.message}\n\n${it.error!.detail}`);
      toast('Detalhes copiados.');
    } catch {
      toast('Não consegui copiar. Selecione o texto e use Ctrl+C.');
    }
  });
  openModal(h('div', null, h('p', { class: 'modal__text' }, it.error.message), pre, h('div', { class: 'modal__actions' }, copy)), {
    title: `O que aconteceu com ${it.file.name}`,
    size: 'md',
  });
}

function previewFor(id?: string) {
  const items = store.state.items;
  const it =
    (id && store.item(id)) ||
    items.find((i) => i.selected && i.probe === 'done') ||
    items.find((i) => i.selected) ||
    items[0];
  if (!it) {
    toast('Adicione um vídeo primeiro para ver a prévia.');
    return;
  }
  openPreview(it, (s) => {
    store.replaceSettings(s);
    toast('Configurações aplicadas. A conversão vai usar a melhoria que você viu.');
  });
}

async function chooseDestination() {
  try {
    if (await pickDestination()) {
      store.state.folderName = destination.name;
      store.emit('folder');
      announce(`Os vídeos serão salvos em ${destination.name}.`);
    }
  } catch (err) {
    engine.tech(`Seletor de pasta: ${errMessage(err)}`);
    toast('Não foi possível usar essa pasta. Escolha outra, por exemplo uma dentro de Vídeos ou Documentos.', { tone: 'error' });
  }
}

// ---------- Converter ----------
async function startConvert(only?: VideoItem[]) {
  const batch = only ?? store.pending;
  if (!batch.length || busy()) return;

  if (destination.handle && !(await ensureWritePermission())) {
    toast('Sem permissão para salvar na pasta escolhida. Os vídeos vão ficar prontos para baixar.', { tone: 'error' });
    destination.clear();
    store.state.folderName = null;
    store.emit('folder');
  }
  primeCelebration();

  if (canAskNotification()) {
    const yes = await confirmDialog({
      title: 'Avisar quando terminar?',
      text: 'A conversão pode demorar. Se você deixar, o navegador mostra um aviso no canto da tela quando tudo estiver pronto, mesmo que esteja usando outro programa.',
      confirm: 'Sim, me avise',
      cancel: 'Agora não',
    });
    if (yes) await askNotification();
  }

  store.state.stopping = false;
  store.setPhase('converting');
  store.emit('items');
  keepAwake(true);
  guardUnload(true);
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

  const result = await runBatch(batch);

  keepAwake(false);
  guardUnload(false);
  store.state.batch = null;
  store.state.stopping = false;

  if (result.stopped) {
    setTitle();
    store.setPhase('ready');
    store.emit('items');
    const n = result.converted.length;
    toast(n ? `Conversão parada. ${count(n, 'vídeo pronto continua salvo', 'vídeos prontos continuam salvos')}.` : 'Conversão parada.');
    void analyze();
    return;
  }

  const converted = store.state.items.filter((i) => i.status === 'saved' || i.status === 'ready');
  store.state.summary = {
    converted: converted.length,
    failed: store.state.items.filter((i) => i.status === 'failed').length,
    videoSeconds: converted.reduce((s, i) => s + videoSeconds(i), 0),
    inputBytes: converted.reduce((s, i) => s + i.file.size, 0),
    outputBytes: converted.reduce((s, i) => s + (i.outSize ?? 0), 0),
    elapsed: result.elapsed + (store.state.summary && only ? store.state.summary.elapsed : 0),
    folder: destination.name,
  };
  store.setPhase('done');
  store.emit('summary');
  store.emit('items');

  if (result.converted.length) {
    document.title = '✓ Conversão concluída';
    if (store.state.settings.sound) playCelebration();
    confetti(document.getElementById('viewfinder')?.getBoundingClientRect());
    notify(
      'Conversão concluída',
      `${count(result.converted.length, 'vídeo convertido', 'vídeos convertidos')}${result.failed.length ? `, ${result.failed.length} com problema` : ''}.`,
    );
    announce(`Conversão concluída. ${count(result.converted.length, 'vídeo convertido', 'vídeos convertidos')}.`);
  } else {
    setTitle();
    announce('Nenhum vídeo foi convertido.');
  }
}

async function stop() {
  const ok = await confirmDialog({
    title: 'Parar a conversão?',
    text: 'Os vídeos já prontos ficam salvos. Os outros voltam para a lista e você pode converter depois.',
    confirm: 'Parar',
    cancel: 'Continuar convertendo',
    danger: true,
  });
  if (!ok || !busy()) return;
  store.state.stopping = true;
  store.emit('batch');
  requestStop();
}

function retry(id: string) {
  const it = store.item(id);
  if (!it || busy()) return;
  it.selected = true;
  void startConvert([it]);
}

function download(id: string) {
  const it = store.item(id);
  if (it?.outUrl && it.outName) triggerDownload(it.outUrl, it.outName);
}

function downloadAllReady() {
  const ready = store.state.items
    .filter((i) => i.status === 'ready' && i.outUrl && i.outName)
    .map((i) => ({ url: i.outUrl!, name: i.outName! }));
  if (!ready.length) return;
  toast(ready.length > 1 ? `Baixando ${ready.length} vídeos, um de cada vez. Se o navegador perguntar, permita vários downloads.` : 'Baixando o vídeo.');
  void downloadAll(ready);
}

function convertMore() {
  stopCelebration();
  for (const it of store.state.items) {
    if (it.outUrl) URL.revokeObjectURL(it.outUrl);
    if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
  }
  store.state.items = [];
  store.state.summary = null;
  names.clear();
  setTitle();
  store.setPhase('empty');
  store.emit('items');
  window.scrollTo({ top: 0 });
  requestAnimationFrame(() => document.querySelector<HTMLElement>('.vf__btn')?.focus({ preventScroll: true }));
}

// ---------- Título da aba com o progresso ----------
let lastTitlePct = -1;
store.on('batch', () => {
  const b = store.state.batch;
  if (!b || store.state.phase !== 'converting') return;
  const pct = Math.floor(b.overall);
  if (pct !== lastTitlePct) {
    lastTitlePct = pct;
    setTitle(`${pct}%`);
  }
});
store.on('phase', () => {
  lastTitlePct = -1;
  const p = store.state.phase;
  document.documentElement.dataset.phase = p;
  const h1 = document.getElementById('state-title');
  if (h1) {
    h1.textContent =
      p === 'ready' ? 'Pronto para converter' : p === 'converting' ? 'Convertendo os vídeos' : p === 'done' ? 'Conversão concluída' : '';
  }
  if (p === 'empty' || p === 'ready') document.title = APP_TITLE;
});
window.addEventListener('focus', () => {
  if (store.state.phase === 'done' && document.title.startsWith('✓')) setTimeout(() => setTitle(), 4000);
});

// ---------- Montagem ----------
function mount() {
  const main = $('#main');
  const notices = $('#notices');

  if (!isSupported()) {
    notices.append(
      h('div', { class: 'notice notice--error', role: 'alert' }, icon('alert'), h('p', null, 'Este navegador não consegue converter vídeos. Abra esta página no Google Chrome, no computador.')),
    );
  } else if (isMobileDevice()) {
    const close = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar aviso' }, icon('x'));
    const n = h(
      'div',
      { class: 'notice', role: 'note' },
      icon('laptop'),
      h('p', null, 'Funciona melhor no computador: a conversão é pesada e o celular pode esquentar ou parar no meio. Mas pode tentar por aqui.'),
      close,
    );
    close.addEventListener('click', () => n.remove());
    notices.append(n);
  } else if (!isChromium()) {
    notices.append(
      h('div', { class: 'notice', role: 'note' }, icon('info'), h('p', null, 'Para a melhor experiência, use o Google Chrome ou o Microsoft Edge.')),
    );
  }

  const vf = createViewfinder({ pickFolder, pickFiles });
  const how = createHowItWorks();
  const list = createFileList({
    remove: removeItem,
    preview: previewFor,
    retry,
    details: showDetails,
    watch: (id) => {
      const it = store.item(id);
      if (it) void openPlayer(it);
    },
    download,
    toggleAll: (on) => {
      for (const i of store.state.items) i.selected = on;
      store.emit('items');
    },
  });
  const settings = createSettingsPanel({ pickDestination: chooseDestination, openPreview: () => previewFor() });
  const progress = createProgress(stop, (on) => store.updateSettings({ sound: on }));
  const done = createDoneSummary({ downloadAll: downloadAllReady, convertMore });
  const bar = createActionBar(() => void startConvert());
  const log = createTechLog();

  main.append(
    h('div', { class: 'stage' }, vf.root, progress.root, done.root),
    how,
    list.root,
    settings.root,
  );
  main.after(bar.root);
  $('#log-slot').append(log.root);
  document.body.append(folderInput, filesInput);
  mountToasts();

  const syncVisibility = () => {
    const p = store.state.phase;
    how.hidden = p !== 'empty';
    settings.root.hidden = p !== 'ready';
    $('#intro').hidden = p !== 'empty';
  };
  store.on('phase', syncVisibility);
  syncVisibility();
  document.documentElement.dataset.phase = store.state.phase;

  if (!canPickFolder()) engine.tech('Pasta de destino indisponível neste navegador: os vídeos serão baixados.');
  if (isSupported()) engine.preload();

  // Erros inesperados vão para o registro técnico
  window.addEventListener('error', (e) => engine.tech(`Erro: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => engine.tech(`Erro: ${errMessage(e.reason)}`));

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  // Ganchos para os testes automatizados
  (window as unknown as { __app: unknown }).__app = { store, engine, formatSize, formatDuration };
}

mount();
