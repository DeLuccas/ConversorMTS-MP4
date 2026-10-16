// Estado Concluído: resumo do lote e próximos passos.
import { h } from './dom';
import { icon } from '../icons';
import { store } from '../state';
import { count, formatDuration, formatSize } from '../format';
import { onCelebrationChange, stopCelebration } from '../platform';

export interface DoneHandlers {
  downloadAll: () => void;
  convertMore: () => void;
}

export function createDoneSummary(handlers: DoneHandlers) {
  const stats = h('dl', { class: 'done__stats' });
  const where = h('div', { class: 'done__where' });
  const downloadAll = h(
    'button',
    { class: 'btn btn--primary btn--lg', type: 'button', onclick: handlers.downloadAll },
    icon('download'),
    'Baixar todos',
  );
  const more = h('button', { class: 'btn btn--lg', type: 'button', onclick: handlers.convertMore }, icon('plus'), 'Converter mais vídeos');
  const music = h('button', { class: 'btn btn--quiet', type: 'button', hidden: true, onclick: () => stopCelebration() }, icon('volumeOff'), 'Parar música');
  const failedNote = h('p', { class: 'done__failed' });
  const root = h(
    'section',
    { class: 'done', 'aria-labelledby': 'done-title' },
    h('h2', { class: 'sr-only', id: 'done-title' }, 'Resumo da conversão'),
    stats,
    where,
    failedNote,
    h('div', { class: 'done__actions' }, downloadAll, more, music),
  );

  onCelebrationChange((playing) => {
    music.hidden = !playing || store.state.phase !== 'done';
  });

  function stat(label: string, value: string) {
    return h('div', { class: 'done__stat' }, h('dt', null, label), h('dd', { class: 'num' }, value));
  }

  function render() {
    const s = store.state;
    root.hidden = s.phase !== 'done';
    if (root.hidden) {
      music.hidden = true;
      return;
    }
    const sum = s.summary;
    if (!sum) return;
    stats.replaceChildren(
      stat('Convertidos', count(sum.converted, 'vídeo', 'vídeos')),
      stat('Gravação', formatDuration(sum.videoSeconds)),
      stat('Tamanho', `${formatSize(sum.inputBytes)} → ${formatSize(sum.outputBytes)}`),
      stat('Levou', formatDuration(sum.elapsed)),
    );
    stats.hidden = sum.converted === 0;

    const toDownload = s.items.filter((i) => i.status === 'ready' && i.outUrl);
    where.replaceChildren();
    if (sum.folder && s.items.some((i) => i.status === 'saved')) {
      where.append(
        h('span', { class: 'done__folder-icon' }, icon('folder')),
        h('p', null, 'Salvos em ', h('strong', null, `‘${sum.folder}’`)),
      );
    } else if (toDownload.length) {
      where.append(
        h('span', { class: 'done__folder-icon' }, icon('download')),
        h(
          'p',
          null,
          toDownload.length === 1
            ? 'O vídeo está pronto. Clique em Baixar para guardar na pasta Downloads.'
            : `Clique em Baixar todos e os ${toDownload.length} vídeos vão para a pasta Downloads, um de cada vez.`,
        ),
      );
    }
    where.hidden = !where.childElementCount;
    downloadAll.hidden = toDownload.length < 1;
    downloadAll.replaceChildren(icon('download'), toDownload.length === 1 ? 'Baixar o vídeo' : 'Baixar todos');
    more.classList.toggle('btn--primary', downloadAll.hidden);

    const failed = s.items.filter((i) => i.status === 'failed').length;
    failedNote.hidden = !failed;
    failedNote.replaceChildren(
      icon('alert'),
      h('span', null, `${count(failed, 'vídeo não foi convertido', 'vídeos não foram convertidos')}. Veja o motivo na lista e use “Tentar de novo”.`),
    );
  }

  store.on('phase', render);
  store.on('summary', render);
  store.on('item', () => store.state.phase === 'done' && render());
  render();
  return { root };
}
