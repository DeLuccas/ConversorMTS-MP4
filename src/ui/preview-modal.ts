// Prévia de qualidade: comparação antes/depois de um quadro do vídeo, com slider arrastável.
import { h } from './dom';
import { icon } from '../icons';
import { openModal } from './modal';
import { segmented, toggle } from './settings-panel';
import { previewFrame } from '../probe';
import { store, type VideoItem } from '../state';
import type { Settings } from '../settings';
import { formatDay, formatTime, timecode } from '../format';

export function openPreview(item: VideoItem, onUse: (s: Settings) => void) {
  let draft: Settings = { ...store.state.settings, mode: 'enhance' };
  let at = pickMoment(item, null);
  let pos = 50;
  let token = 0;
  let originalFor = -1;
  const urls: string[] = [];

  const imgA = h('img', { class: 'compare__img', alt: 'Quadro original do vídeo' });
  const imgB = h('img', { class: 'compare__img compare__img--after', alt: 'O mesmo quadro com a melhoria aplicada' });
  const handle = h(
    'div',
    {
      class: 'compare__handle',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Divisão entre original e melhorado',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-describedby': 'compare-hint',
    },
    h('span', { class: 'compare__grip', 'aria-hidden': 'true' }, chevrons()),
  );
  const loading = h('div', { class: 'compare__loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'compare__loading-text' }, 'Gerando a prévia…'));
  const errorBox = h('div', { class: 'compare__error', hidden: true });
  const stage = h(
    'div',
    { class: 'compare' },
    h('div', { class: 'compare__frame' }, imgA, imgB),
    h('span', { class: 'compare__label compare__label--a' }, 'Original'),
    h('span', { class: 'compare__label compare__label--b' }, 'Melhorado'),
    handle,
    loading,
    errorBox,
  );
  const tcLabel = h('span', { class: 'num' });
  const zoomBtn = h('button', { class: 'btn btn--quiet btn--small', type: 'button', 'aria-pressed': 'false' }, icon('zoomIn'), 'Aproximar');
  const below = h(
    'div',
    { class: 'compare__below' },
    h('p', { class: 'compare__hint', id: 'compare-hint' }, 'Arraste a alça ou use as setas do teclado para comparar.'),
    h('div', { class: 'compare__tools' }, h('span', { class: 'compare__tc muted' }, 'Quadro em ', tcLabel), zoomBtn),
  );

  const regen = () => schedule(true);
  const denoise = segmented<Settings['denoise']>(
    'Redução de ruído',
    [
      { value: 'off', label: 'Desligada' },
      { value: 'light', label: 'Leve' },
      { value: 'medium', label: 'Média' },
    ],
    () => draft.denoise,
    (v) => {
      draft = { ...draft, denoise: v };
      regen();
    },
  );
  const sharpen = segmented<Settings['sharpen']>(
    'Nitidez',
    [
      { value: 'off', label: 'Desligada' },
      { value: 'light', label: 'Leve' },
      { value: 'medium', label: 'Média' },
    ],
    () => draft.sharpen,
    (v) => {
      draft = { ...draft, sharpen: v };
      regen();
    },
  );
  const color = toggle(
    'Realçar cores',
    'Mais contraste e cor.',
    () => draft.color,
    (v) => {
      draft = { ...draft, color: v };
      regen();
    },
  );
  const controls = h('div', { class: 'preview__controls' }, denoise.root, sharpen.root, color.root);

  const anotherBtn = h('button', { class: 'btn', type: 'button' }, icon('shuffle'), 'Ver outro momento');
  const useBtn = h('button', { class: 'btn btn--primary', type: 'button' }, icon('check'), 'Usar estas configurações');
  const actions = h('div', { class: 'modal__actions modal__actions--split' }, anotherBtn, useBtn);

  const busy = store.state.phase === 'converting';
  const body = h('div', { class: 'preview' }, stage, below, controls, actions);

  const when = `${formatDay(item.file.lastModified)}, ${formatTime(item.file.lastModified)}`;
  const modal = openModal(body, {
    title: 'Prévia da melhoria',
    description: `Vídeo de ${when}. À esquerda, como foi gravado; à direita, como vai ficar.`,
    size: 'lg',
    initialFocus: () => handle,
    onClose: () => {
      token++;
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  });

  // ---------- Slider ----------
  const setPos = (p: number) => {
    pos = Math.max(0, Math.min(100, p));
    stage.style.setProperty('--pos', `${pos}%`);
    handle.setAttribute('aria-valuenow', String(Math.round(pos)));
    handle.setAttribute('aria-valuetext', `${Math.round(pos)}% original, ${Math.round(100 - pos)}% melhorado`);
  };
  setPos(50);
  const fromPointer = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    setPos(((e.clientX - r.left) / r.width) * 100);
  };
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
    fromPointer(e);
    handle.focus({ preventScroll: true });
  });
  stage.addEventListener('pointermove', (e) => {
    if (stage.hasPointerCapture(e.pointerId)) fromPointer(e);
  });
  const endDrag = (e: PointerEvent) => {
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    const map: Record<string, number> = {
      ArrowLeft: pos - step,
      ArrowDown: pos - step,
      ArrowRight: pos + step,
      ArrowUp: pos + step,
      PageDown: pos - 10,
      PageUp: pos + 10,
      Home: 0,
      End: 100,
    };
    if (e.key in map) {
      e.preventDefault();
      setPos(map[e.key]);
    }
  });

  zoomBtn.addEventListener('click', () => {
    const on = !stage.classList.contains('compare--zoom');
    stage.classList.toggle('compare--zoom', on);
    zoomBtn.setAttribute('aria-pressed', String(on));
    zoomBtn.replaceChildren(icon(on ? 'zoomOut' : 'zoomIn'), on ? 'Ver inteiro' : 'Aproximar');
  });

  // ---------- Geração dos quadros ----------
  let timer = 0;
  function schedule(onlyProcessed: boolean) {
    clearTimeout(timer);
    timer = window.setTimeout(() => void generate(onlyProcessed), onlyProcessed ? 250 : 0);
  }

  async function generate(onlyProcessed: boolean) {
    const my = ++token;
    loading.hidden = false;
    errorBox.hidden = true;
    stage.classList.add('is-loading');
    tcLabel.textContent = timecode(at).slice(0, 8);
    try {
      if (!onlyProcessed || originalFor !== at) {
        const a = await previewFrame(item.file, draft, at, false);
        if (my !== token) return URL.revokeObjectURL(a);
        urls.push(a);
        imgA.src = a;
        originalFor = at;
      }
      const b = await previewFrame(item.file, draft, at, true);
      if (my !== token) return URL.revokeObjectURL(b);
      urls.push(b);
      imgB.src = b;
      await Promise.all([imgA.decode().catch(() => {}), imgB.decode().catch(() => {})]);
      if (my !== token) return;
      loading.hidden = true;
      stage.classList.remove('is-loading');
    } catch {
      if (my !== token) return;
      loading.hidden = true;
      errorBox.hidden = false;
      errorBox.replaceChildren(
        h('p', null, 'Não consegui gerar a prévia deste momento do vídeo.'),
        h('button', { class: 'btn btn--small', type: 'button', onclick: () => newMoment() }, icon('shuffle'), 'Tentar outro momento'),
      );
    }
  }

  function newMoment() {
    at = pickMoment(item, at);
    schedule(false);
  }

  anotherBtn.addEventListener('click', newMoment);
  useBtn.addEventListener('click', () => {
    onUse({ ...store.state.settings, mode: 'enhance', denoise: draft.denoise, sharpen: draft.sharpen, color: draft.color });
    modal.close();
  });

  if (busy) {
    loading.hidden = true;
    errorBox.hidden = false;
    errorBox.replaceChildren(h('p', null, 'A prévia fica disponível quando a conversão terminar.'));
    anotherBtn.disabled = true;
  } else {
    schedule(false);
  }
}

/** Sorteia um instante entre 10% e 90% do vídeo, diferente do anterior. */
function pickMoment(item: VideoItem, previous: number | null): number {
  const d = item.duration ?? 0;
  if (d < 4) return Math.min(1, Math.max(0, d / 2));
  for (let i = 0; i < 6; i++) {
    const t = d * (0.1 + Math.random() * 0.8);
    if (previous === null || Math.abs(t - previous) > d * 0.15) return Math.round(t * 10) / 10;
  }
  return Math.round(d * (0.1 + Math.random() * 0.8) * 10) / 10;
}

function chevrons() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', '24');
  s.setAttribute('height', '24');
  s.innerHTML =
    '<path d="m9 7-5 5 5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
}
