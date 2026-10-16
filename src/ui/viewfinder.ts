// O visor da filmadora: área de soltar arquivos, painel de progresso e tela de conclusão.
import { h } from './dom';
import { icon } from '../icons';
import { store } from '../state';
import { engine, type EngineStatus } from '../ffmpeg';
import { count, formatDay, formatTime, timecode } from '../format';
import { videoSeconds } from '../queue';

export interface ViewfinderHandlers {
  pickFolder: () => void;
  pickFiles: () => void;
}

const SEGMENTS = 5;

export function createViewfinder(handlers: ViewfinderHandlers) {
  let load: { status: EngineStatus; ratio: number } = { status: engine.status, ratio: 0 };

  const bg = h('img', { class: 'vf__bg', alt: '', 'aria-hidden': 'true', decoding: 'async' });
  const dot = h('span', { class: 'vf__dot', 'aria-hidden': 'true' });
  const statusText = h('span', { class: 'vf__status-text' }, 'STBY');
  const doneMark = h('span', { class: 'vf__done-mark', 'aria-hidden': 'true' });
  doneMark.innerHTML =
    '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>';
  const status = h('div', { class: 'vf__status osd' }, dot, doneMark, statusText);

  const battSegs = Array.from({ length: SEGMENTS }, () => h('i'));
  const battLabel = h('span', { class: 'vf__batt-label' });
  const batt = h(
    'div',
    { class: 'vf__batt osd', 'aria-hidden': 'true' },
    battLabel,
    h('span', { class: 'vf__batt-cell' }, ...battSegs),
  );

  const title = h('p', { class: 'vf__title' });
  const sub = h('p', { class: 'vf__sub num' });
  const btnFolder = h(
    'button',
    { class: 'btn btn--primary btn--lg vf__btn', type: 'button', onclick: handlers.pickFolder },
    icon('folderOpen'),
    'Escolher pasta',
  );
  const btnFiles = h(
    'button',
    { class: 'btn btn--lg vf__btn vf__btn--ghost', type: 'button', onclick: handlers.pickFiles },
    icon('files'),
    'Escolher arquivos',
  );
  const btnMore = h(
    'button',
    { class: 'btn vf__btn vf__btn--ghost', type: 'button', onclick: handlers.pickFolder },
    icon('plus'),
    'Adicionar vídeos',
  );
  const actions = h('div', { class: 'vf__actions' }, btnFolder, btnFiles, btnMore);
  const bigCheck = h('span', { class: 'vf__big-check', 'aria-hidden': 'true' });
  bigCheck.innerHTML =
    '<svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="3" pathLength="1"/><path d="M19 33l9 9 18-19" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>';
  const center = h('div', { class: 'vf__center' }, bigCheck, h('div', { class: 'vf__text' }, title, sub), actions);

  const meta = h('div', { class: 'vf__meta osd' });
  const tc = h('div', { class: 'vf__tc osd num' }, '00:00:00:00');
  const barFill = h('i');
  const bar = h('div', { class: 'vf__bar', 'aria-hidden': 'true' }, barFill);

  const root = h(
    'div',
    { class: 'vf', id: 'viewfinder' },
    bg,
    h('div', { class: 'vf__scan', 'aria-hidden': 'true' }),
    h('span', { class: 'vf__corner vf__corner--tl', 'aria-hidden': 'true' }),
    h('span', { class: 'vf__corner vf__corner--tr', 'aria-hidden': 'true' }),
    h('span', { class: 'vf__corner vf__corner--bl', 'aria-hidden': 'true' }),
    h('span', { class: 'vf__corner vf__corner--br', 'aria-hidden': 'true' }),
    status,
    batt,
    center,
    meta,
    tc,
    bar,
  );

  let lastPhase = store.state.phase;
  let bgFor = '';

  function setBattery(fraction: number | null, label: string) {
    const filled = fraction === null ? SEGMENTS : Math.round(fraction * SEGMENTS);
    battSegs.forEach((s, i) => s.classList.toggle('on', i < filled));
    battLabel.textContent = label;
  }

  function setBar(pct: number, tone: 'amber' | 'ok' = 'amber') {
    barFill.style.transform = `scaleX(${Math.max(0, Math.min(100, pct)) / 100})`;
    bar.dataset.tone = tone;
  }

  function setBackground(url: string | null) {
    if ((url ?? '') === bgFor) return;
    bgFor = url ?? '';
    if (url) {
      bg.src = url;
      bg.classList.add('on');
    } else {
      bg.classList.remove('on');
      bg.removeAttribute('src');
    }
  }

  function engineLine(): string | null {
    if (load.status === 'downloading') return `Preparando o conversor… ${Math.round(load.ratio * 100)}%`;
    if (load.status === 'loading') return 'Preparando o conversor…';
    return null;
  }

  function render() {
    const s = store.state;
    const phase = s.phase;
    root.dataset.phase = phase;
    root.classList.toggle('vf--compact', phase === 'ready');
    root.classList.toggle('vf--busy', phase === 'converting' && !s.stopping);

    if (phase !== lastPhase) {
      if (phase === 'done' && lastPhase === 'converting') {
        root.classList.remove('vf--celebrate');
        void root.offsetWidth; // reinicia a animação
        root.classList.add('vf--celebrate');
      }
      lastPhase = phase;
    }

    btnFolder.hidden = phase !== 'empty';
    btnFiles.hidden = phase !== 'empty';
    btnMore.hidden = phase !== 'ready';
    actions.hidden = phase === 'converting' || phase === 'done';
    bigCheck.hidden = phase !== 'done';

    const total = s.items.reduce((acc, i) => acc + (i.duration ?? 0), 0);

    if (phase === 'empty') {
      statusText.textContent = 'STBY';
      title.textContent = 'Arraste aqui a pasta do cartão da filmadora';
      sub.textContent = 'ou use um dos botões abaixo';
      sub.hidden = true;
      meta.textContent = '';
      tc.textContent = timecode(0);
      setBattery(null, '');
      setBar(0);
      setBackground(null);
    } else if (phase === 'ready') {
      statusText.textContent = 'STBY';
      const a = s.analyze;
      const n = s.items.length;
      sub.hidden = false;
      if (a && (a.scanning || a.done < a.total)) {
        title.textContent = a.scanning
          ? `Procurando vídeos… ${count(a.found, 'encontrado', 'encontrados')}`
          : `Encontrei ${count(a.total, 'vídeo', 'vídeos')}, analisando…`;
        sub.textContent = engineLine() ?? (a.scanning ? 'Lendo as pastas do cartão' : `${a.done} de ${a.total} prontos`);
        const pct = load.status === 'downloading' ? load.ratio * 100 : a.total ? (a.done / a.total) * 100 : 0;
        setBar(pct);
      } else {
        title.textContent = `${count(n, 'vídeo pronto', 'vídeos prontos')} para converter`;
        sub.textContent = 'Arraste mais pastas aqui, se quiser';
        setBar(0);
      }
      meta.textContent = '';
      tc.textContent = timecode(total);
      setBattery(null, '');
      setBackground(null);
    } else if (phase === 'converting') {
      const b = s.batch;
      const current = b ? store.item(b.ids[b.index]) : undefined;
      statusText.textContent = s.stopping ? 'STOP' : 'CONV';
      sub.hidden = false;
      const eng = engineLine();
      if (s.stopping) {
        title.textContent = 'Parando…';
        sub.textContent = 'Os vídeos já prontos ficam salvos';
      } else if (b && current) {
        title.textContent = `Vídeo ${b.index + 1} de ${b.ids.length}`;
        sub.textContent = eng ?? `${formatDay(current.file.lastModified)}, ${formatTime(current.file.lastModified)}`;
      } else {
        title.textContent = 'Começando…';
        sub.textContent = eng ?? '';
      }
      meta.textContent = current ? current.file.name : '';
      tc.textContent = timecode(b?.currentTime ?? 0, current?.fps && current.fps > 40 ? 60 : 30);
      setBattery(b ? b.overall / 100 : 0, b ? `${Math.min(b.index + 1, b.ids.length)}/${b.ids.length}` : '');
      setBar(load.status === 'downloading' ? load.ratio * 100 : (current?.progress ?? 0));
      setBackground(current?.thumbUrl ?? null);
    } else {
      const sum = s.summary;
      statusText.textContent = sum && sum.converted === 0 ? 'STBY' : 'OK';
      sub.hidden = false;
      if (sum && sum.converted > 0) {
        title.textContent = `${count(sum.converted, 'vídeo convertido', 'vídeos convertidos')}`;
        sub.textContent = sum.failed ? `${count(sum.failed, 'vídeo não pôde', 'vídeos não puderam')} ser convertido${sum.failed > 1 ? 's' : ''}` : 'Tudo pronto';
      } else {
        title.textContent = 'Nenhum vídeo foi convertido';
        sub.textContent = 'Veja os detalhes na lista abaixo';
      }
      meta.textContent = '';
      tc.textContent = timecode(sum?.videoSeconds ?? 0);
      setBattery(1, '');
      setBar(100, 'ok');
      setBackground(null);
      root.classList.toggle('vf--failed', !sum || sum.converted === 0);
    }
    if (phase !== 'done') root.classList.remove('vf--failed');
  }

  store.on('phase', render);
  store.on('analyze', render);
  store.on('batch', render);
  store.on('items', render);
  store.on('summary', render);
  store.on('item', (id) => {
    const b = store.state.batch;
    if (store.state.phase === 'converting' && b && b.ids[b.index] === id) render();
    else if (store.state.phase === 'ready') {
      // A duração total muda conforme a análise avança
      const total = store.state.items.reduce((acc, i) => acc + (i.duration ?? 0), 0);
      tc.textContent = timecode(total);
    }
  });
  engine.onLoad((p) => {
    load = p;
    render();
  });

  render();
  return { root, render };
}

/** Segundos estimados de vídeo da seleção (usado em resumos). */
export function selectionSeconds() {
  return store.selected.reduce((s, i) => s + videoSeconds(i), 0);
}
