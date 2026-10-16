// Lista de vídeos agrupada por dia de gravação, com miniaturas e estado de cada item.
import { h, clear } from './dom';
import { icon } from '../icons';
import { store, type VideoItem } from '../state';
import { count, dayKey, formatClock, formatDay, formatDuration, formatSize, formatTime } from '../format';
import { videoSeconds } from '../queue';

export interface ListHandlers {
  remove: (id: string) => void;
  preview: (id: string) => void;
  retry: (id: string) => void;
  details: (id: string) => void;
  watch: (id: string) => void;
  download: (id: string) => void;
  toggleAll: (on: boolean) => void;
}

interface Row {
  el: HTMLLIElement;
  thumbBtn: HTMLButtonElement;
  img: HTMLImageElement;
  dur: HTMLSpanElement;
  check: HTMLInputElement;
  meta: HTMLSpanElement;
  side: HTMLDivElement;
  state: HTMLDivElement;
  bar: HTMLElement;
  sig: string;
}

export function createFileList(handlers: ListHandlers) {
  const title = h('h2', { class: 'h2', id: 'list-title' }, 'Seus vídeos');
  const toggleAll = h('button', { class: 'link-btn', type: 'button' });
  const groupsEl = h('div', { class: 'groups' });
  const root = h(
    'section',
    { class: 'list', 'aria-labelledby': 'list-title' },
    h('div', { class: 'section-head' }, title, toggleAll),
    groupsEl,
  );

  const rows = new Map<string, Row>();
  const groupHeads = new Map<string, HTMLElement>();

  toggleAll.addEventListener('click', () => {
    const all = store.state.items.every((i) => i.selected);
    handlers.toggleAll(!all);
  });

  function buildRow(item: VideoItem): Row {
    const img = h('img', { class: 'card__img', alt: '', decoding: 'async', loading: 'lazy' });
    const dur = h('span', { class: 'card__dur num' });
    const thumbBtn = h(
      'button',
      { class: 'card__thumb', type: 'button' },
      h('span', { class: 'card__skeleton', 'aria-hidden': 'true' }),
      img,
      h('span', { class: 'card__eye', 'aria-hidden': 'true' }, icon('eye'), 'Ver prévia'),
      dur,
    );
    thumbBtn.addEventListener('click', () => handlers.preview(item.id));
    img.addEventListener('load', () => thumbBtn.classList.add('is-loaded'));

    const check = h('input', { type: 'checkbox', class: 'check__input' });
    check.addEventListener('change', () => {
      store.patchItem(item.id, { selected: check.checked });
      store.emit('items');
    });
    const timeLabel = h('span', { class: 'card__time num' }, formatTime(item.file.lastModified));
    const label = h(
      'label',
      { class: 'check card__check' },
      check,
      h('span', { class: 'check__box', 'aria-hidden': 'true' }, icon('check')),
      h('span', { class: 'sr-only' }, `Converter o vídeo das `),
      timeLabel,
    );
    const meta = h('span', { class: 'card__meta num' });
    const side = h('div', { class: 'card__side' });
    const state = h('div', { class: 'card__state' });
    const bar = h('i');
    const el = h(
      'li',
      { class: 'card', dataset: { id: item.id } },
      thumbBtn,
      h('div', { class: 'card__progress', 'aria-hidden': 'true' }, bar),
      h('div', { class: 'card__body' }, h('div', { class: 'card__line' }, label, side), meta, state),
    );
    return { el, thumbBtn, img, dur, check, meta, side, state, bar, sig: '' };
  }

  function stateSignature(it: VideoItem, phase: string) {
    return [phase, it.status, it.selected, it.outUrl ? 1 : 0, it.savedToFolder ? 1 : 0, it.error?.message ?? ''].join('|');
  }

  function renderState(row: Row, it: VideoItem) {
    const phase = store.state.phase;
    const sig = stateSignature(it, phase);
    if (sig === row.sig) return;
    row.sig = sig;
    clear(row.state);
    clear(row.side);
    row.el.dataset.status = it.status;
    const idle = phase === 'empty' || phase === 'ready';

    if (it.status === 'converting') {
      row.state.append(h('span', { class: 'chip chip--amber num' }, `Convertendo ${Math.floor(it.progress)}%`));
    } else if (it.status === 'saved') {
      row.state.append(h('span', { class: 'chip chip--ok' }, icon('check'), 'Salvo'));
      if (!idle) row.state.append(watchBtn(it));
    } else if (it.status === 'ready' && phase === 'converting') {
      row.state.append(h('span', { class: 'chip chip--accent' }, icon('download'), 'Pronto para baixar'));
    } else if (it.status === 'ready') {
      row.state.append(
        h(
          'button',
          { class: 'btn btn--small', type: 'button', onclick: () => handlers.download(it.id) },
          icon('download'),
          'Baixar',
        ),
      );
      row.state.append(watchBtn(it));
    } else if (it.status === 'failed') {
      row.state.append(h('span', { class: 'chip chip--err' }, icon('alert'), 'Falhou'));
    } else if (phase === 'converting' && store.state.batch?.ids.includes(it.id)) {
      row.state.append(h('span', { class: 'chip' }, 'Na fila'));
    } else if (idle) {
      row.side.append(
        h(
          'button',
          {
            class: 'icon-btn card__remove',
            type: 'button',
            'aria-label': `Remover o vídeo das ${formatTime(it.file.lastModified)} da lista`,
            title: 'Remover da lista',
            onclick: () => handlers.remove(it.id),
          },
          icon('trash'),
        ),
      );
    }

    // Erro: mensagem e ações ocupam a largura do cartão
    row.el.querySelector('.card__error')?.remove();
    if (it.status === 'failed' && it.error) {
      row.el.querySelector('.card__body')!.append(
        h(
          'div',
          { class: 'card__error' },
          h('p', null, it.error.message),
          h(
            'div',
            { class: 'card__error-actions' },
            h(
              'button',
              { class: 'btn btn--small', type: 'button', onclick: () => handlers.retry(it.id) },
              icon('reset'),
              'Tentar de novo',
            ),
            h('button', { class: 'link-btn', type: 'button', onclick: () => handlers.details(it.id) }, 'Ver detalhes'),
          ),
        ),
      );
    }
  }

  function watchBtn(it: VideoItem) {
    return h(
      'button',
      { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => handlers.watch(it.id) },
      icon('play'),
      'Assistir',
    );
  }

  function updateRow(row: Row, it: VideoItem) {
    const phase = store.state.phase;
    const idle = phase === 'empty' || phase === 'ready';
    row.check.checked = it.selected;
    row.check.disabled = !idle;
    row.el.classList.toggle('is-locked', !idle);
    row.el.classList.toggle('is-off', !it.selected && idle);
    row.el.hidden = !idle && !it.selected && it.status === 'queued';

    if (it.thumbUrl && row.img.getAttribute('src') !== it.thumbUrl) row.img.src = it.thumbUrl;
    row.thumbBtn.classList.toggle('is-failed', it.probe === 'failed');
    row.thumbBtn.classList.toggle('is-pending', it.probe === 'pending' || it.probe === 'running');
    const when = `${formatDay(it.file.lastModified)}, ${formatTime(it.file.lastModified)}`;
    row.img.alt = `Quadro do vídeo de ${when}`;
    row.thumbBtn.setAttribute('aria-label', `Ver prévia da melhoria do vídeo de ${when}`);
    row.thumbBtn.disabled = phase === 'converting';
    row.dur.textContent = it.duration ? formatClock(it.duration) : '';
    row.dur.hidden = !it.duration;

    const parts: string[] = [];
    if (it.duration) parts.push(`${formatDuration(it.duration)} de vídeo`);
    if ((it.status === 'saved' || it.status === 'ready') && it.outSize) {
      parts.push(`${formatSize(it.file.size)} → ${formatSize(it.outSize)}`);
    } else parts.push(formatSize(it.file.size));
    row.meta.replaceChildren(...parts.map((p) => h('span', null, p)));
    row.meta.title = it.outName ?? it.file.name;

    const p = it.status === 'converting' ? it.progress : it.status === 'saved' || it.status === 'ready' ? 100 : 0;
    row.bar.style.transform = `scaleX(${p / 100})`;
    row.el.classList.toggle('is-working', it.status === 'converting');

    // Atualização frequente do percentual sem refazer o DOM
    if (it.status === 'converting') {
      const chip = row.state.querySelector('.chip--amber');
      if (chip) chip.textContent = `Convertendo ${Math.floor(it.progress)}%`;
    }
    renderState(row, it);
  }

  /** Redesenha a estrutura (grupos por dia). Chamado quando a lista muda. */
  function renderAll() {
    const items = store.state.items;
    const phase = store.state.phase;
    root.hidden = items.length === 0;
    const allOn = items.length > 0 && items.every((i) => i.selected);
    toggleAll.textContent = allOn ? 'Desmarcar todos' : 'Marcar todos';
    toggleAll.hidden = !(phase === 'ready' || phase === 'empty') || items.length < 2;
    title.textContent = phase === 'done' ? 'Vídeos convertidos' : 'Seus vídeos';

    const groups = new Map<string, VideoItem[]>();
    for (const it of items) {
      const k = dayKey(it.file.lastModified);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(it);
    }

    for (const id of [...rows.keys()]) if (!items.some((i) => i.id === id)) rows.delete(id);

    const frag = document.createDocumentFragment();
    for (const [k, list] of groups) {
      const visible = phase === 'converting' || phase === 'done' ? list.filter((i) => i.selected || i.status !== 'queued') : list;
      if (!visible.length) continue;
      let head = groupHeads.get(k);
      if (!head) {
        head = h('div', { class: 'group' });
        groupHeads.set(k, head);
      }
      clear(head);
      const secs = list.reduce((s, i) => s + videoSeconds(i), 0);
      const known = list.every((i) => i.duration);
      head.append(
        h(
          'div',
          { class: 'group__head' },
          h('h3', { class: 'group__day' }, formatDay(list[0].file.lastModified)),
          h(
            'p',
            { class: 'group__meta num' },
            `${count(list.length, 'vídeo', 'vídeos')} · ${known ? '' : 'cerca de '}${formatDuration(secs)}`,
          ),
        ),
      );
      const ul = h('ul', { class: 'cards' });
      for (const it of list) {
        let row = rows.get(it.id);
        if (!row) {
          row = buildRow(it);
          rows.set(it.id, row);
        }
        row.sig = '';
        updateRow(row, it);
        ul.append(row.el);
      }
      head.append(ul);
      frag.append(head);
    }
    clear(groupsEl);
    groupsEl.append(frag);
  }

  store.on('items', renderAll);
  store.on('phase', renderAll);
  store.on('item', (id) => {
    const it = id ? store.item(id) : undefined;
    const row = id ? rows.get(id) : undefined;
    if (it && row) updateRow(row, it);
  });

  renderAll();
  return { root, rowFor: (id: string) => rows.get(id)?.el ?? null };
}
