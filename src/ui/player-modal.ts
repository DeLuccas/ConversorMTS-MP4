// Player do MP4 convertido.
import { h } from './dom';
import { openModal } from './modal';
import { readFromDestination } from '../save';
import type { VideoItem } from '../state';
import { formatDay, formatTime } from '../format';
import { toast } from './toast';

export async function openPlayer(item: VideoItem) {
  let url = item.outUrl ?? null;
  let revoke = false;
  if (!url && item.outName) {
    const file = await readFromDestination(item.outName);
    if (file) {
      url = URL.createObjectURL(file);
      revoke = true;
    }
  }
  if (!url) {
    toast('Não encontrei este vídeo na pasta de destino. Ele pode ter sido movido ou apagado.', { tone: 'error' });
    return;
  }
  const video = h('video', { class: 'player', controls: true, playsInline: true, preload: 'metadata', src: url });
  const when = `${formatDay(item.file.lastModified)}, ${formatTime(item.file.lastModified)}`;
  openModal(h('div', null, video), {
    title: item.outName ?? 'Vídeo convertido',
    description: when,
    size: 'lg',
    initialFocus: () => video,
    onClose: () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (revoke) URL.revokeObjectURL(url!);
    },
  });
  void video.play().catch(() => {});
}
