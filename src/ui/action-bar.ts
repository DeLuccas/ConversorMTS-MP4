// Barra fixa no rodapé: resumo da seleção e o botão principal "Converter".
import { h } from './dom';
import { icon } from '../icons';
import { store } from '../state';
import { estimateConvertSeconds } from '../estimate';
import { count, formatDuration, formatEstimate } from '../format';
import { engine } from '../ffmpeg';
import { loadCalibration, videoSeconds } from '../queue';

export function createActionBar(onConvert: () => void) {
  const line1 = h('p', { class: 'bar__title num' });
  const line2 = h('p', { class: 'bar__sub num' });
  const btn = h('button', { class: 'btn btn--primary btn--lg bar__btn', type: 'button', onclick: onConvert });
  const root = h(
    'div',
    { class: 'actionbar', role: 'region', 'aria-label': 'Converter' },
    h('div', { class: 'actionbar__inner shell' }, h('div', { class: 'bar__summary' }, line1, line2), btn),
  );

  let raf = 0;
  function render() {
    raf = 0;
    const s = store.state;
    root.hidden = s.phase !== 'ready';
    if (root.hidden) return;
    const pending = store.pending;
    const n = pending.length;
    const secs = pending.reduce((a, i) => a + videoSeconds(i), 0);
    const known = pending.every((i) => i.duration);
    const est = estimateConvertSeconds(secs, s.settings, {
      multithread: engine.kind === 'mt',
      calibrated: loadCalibration(),
    });
    const analyzing = !!s.analyze && (s.analyze.scanning || s.analyze.done < s.analyze.total);
    const done = s.items.filter((i) => i.status === 'saved' || i.status === 'ready').length;

    if (!n) {
      line1.textContent = done ? 'Os vídeos marcados já foram convertidos' : 'Nenhum vídeo marcado';
      line2.textContent = done ? 'Marque outros vídeos ou adicione mais' : 'Marque os vídeos que quer converter';
    } else {
      line1.textContent = `${count(n, 'vídeo selecionado', 'vídeos selecionados')}`;
      const rec = `${known ? '' : 'cerca de '}${formatDuration(secs)} de gravação`;
      line2.textContent = analyzing ? `${rec} · calculando o tempo…` : `${rec} · ${formatEstimate(est)} para converter`;
    }
    btn.replaceChildren(icon('play'), n ? `Converter ${count(n, 'vídeo', 'vídeos')}` : 'Converter');
    btn.disabled = n === 0;
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };
  store.on('phase', render);
  store.on('items', schedule);
  store.on('item', schedule);
  store.on('settings', schedule);
  store.on('analyze', schedule);
  render();
  return { root };
}
