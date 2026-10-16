// Progresso do lote durante a conversão, com tempo restante e anúncios espaçados para leitores de tela.
import { h } from './dom';
import { icon } from '../icons';
import { store } from '../state';
import { formatRemaining } from '../format';
import { announce } from './toast';

export function createProgress(onStop: () => void, onToggleSound: (on: boolean) => void) {
  const remaining = h('p', { class: 'prog__remaining num' });
  const pct = h('p', { class: 'prog__pct num' });
  const fill = h('i');
  const track = h(
    'div',
    {
      class: 'prog__track',
      role: 'progressbar',
      'aria-label': 'Progresso total',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
    },
    fill,
  );
  const stopBtn = h('button', { class: 'btn', type: 'button', onclick: onStop }, icon('x'), 'Parar');
  const soundInput = h('input', { type: 'checkbox', class: 'switch__input', role: 'switch' });
  soundInput.addEventListener('change', () => onToggleSound(soundInput.checked));
  const sound = h(
    'label',
    { class: 'prog__sound' },
    soundInput,
    h('span', { class: 'switch', 'aria-hidden': 'true' }, h('i')),
    h('span', null, 'Tocar música quando terminar'),
  );

  const root = h(
    'section',
    { class: 'prog', 'aria-label': 'Progresso da conversão' },
    h('div', { class: 'prog__top' }, remaining, pct),
    track,
    h(
      'div',
      { class: 'prog__foot' },
      h('p', { class: 'prog__note' }, 'Pode usar o computador normalmente, mas não feche esta aba.'),
      h('div', { class: 'prog__actions' }, sound, stopBtn),
    ),
  );

  let lastAnnounce = 0;
  let lastAnnouncedIndex = -1;
  let shown = 0;
  let lastRemaining = 0;

  function render() {
    const s = store.state;
    root.hidden = s.phase !== 'converting';
    soundInput.checked = s.settings.sound;
    if (root.hidden) {
      shown = 0;
      lastRemaining = 0;
      lastAnnouncedIndex = -1;
      return;
    }
    const b = s.batch;
    const overall = b ? b.overall : 0;
    shown = Math.max(shown, overall);
    fill.style.transform = `scaleX(${shown / 100})`;
    track.setAttribute('aria-valuenow', String(Math.floor(shown)));
    pct.textContent = `${Math.floor(shown)}%`;
    stopBtn.disabled = s.stopping;
    const elapsed = b ? (Date.now() - b.startedAt) / 1000 : 0;
    const now = Date.now();
    // O texto do tempo restante muda no máximo a cada 3 s, para não "piscar"
    if (s.stopping || !b || elapsed < 6 || now - lastRemaining > 3000) {
      remaining.textContent = s.stopping
        ? 'Parando a conversão…'
        : !b || elapsed < 6
          ? 'Calculando o tempo restante…'
          : formatRemaining(b.remaining);
      if (b && elapsed >= 6) lastRemaining = now;
    }

    // Leitor de tela: no máximo a cada 60 s, e quando muda de vídeo
    if (b && (b.index !== lastAnnouncedIndex || now - lastAnnounce > 60_000)) {
      if (b.index !== lastAnnouncedIndex) announce(`Convertendo o vídeo ${b.index + 1} de ${b.ids.length}.`);
      else announce(`${Math.floor(shown)}% concluído. ${remaining.textContent}.`);
      lastAnnounce = now;
      lastAnnouncedIndex = b.index;
    }
  }

  store.on('phase', render);
  store.on('batch', render);
  store.on('settings', render);
  render();
  return { root };
}
