// "Registro técnico": o log do ffmpeg e do app, para ajudar à distância.
import { h } from './dom';
import { icon } from '../icons';
import { engine } from '../ffmpeg';
import { toast } from './toast';

const MAX_LINES = 4000;

export function createTechLog() {
  const lines: string[] = [];
  const pre = h('pre', { class: 'log__pre', tabindex: '0', 'aria-label': 'Registro técnico' });
  const copyBtn = h('button', { class: 'btn btn--small', type: 'button' }, icon('copy'), 'Copiar registro');
  const details = h(
    'details',
    { class: 'log' },
    h('summary', { class: 'log__summary' }, icon('chevronDown', 'log__chev'), 'Registro técnico'),
    h(
      'div',
      { class: 'log__body' },
      h('p', { class: 'muted' }, 'Detalhes para quem for ajudar. Copie e envie por mensagem.'),
      pre,
      copyBtn,
    ),
  );

  let dirty = false;
  const flush = () => {
    dirty = false;
    if (!details.open) return;
    pre.textContent = lines.join('\n');
    pre.scrollTop = pre.scrollHeight;
  };
  const push = (line: string) => {
    lines.push(line);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    if (!dirty) {
      dirty = true;
      setTimeout(flush, 500);
    }
  };
  details.addEventListener('toggle', flush);

  const time = () => new Date().toLocaleTimeString('pt-BR');
  engine.onLog((l) => push(l));
  engine.onTech((l) => push(`[${time()}] ${l}`));

  push(`[${time()}] Navegador: ${navigator.userAgent}`);
  push(`[${time()}] Isolamento de origem: ${crossOriginIsolated ? 'sim' : 'não'} · núcleos: ${navigator.hardwareConcurrency ?? '?'}`);

  copyBtn.addEventListener('click', async () => {
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('Registro copiado. Agora é só colar na mensagem.');
    } catch {
      const range = document.createRange();
      pre.textContent = text;
      range.selectNodeContents(pre);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      toast('Selecionei o registro. Use Ctrl+C para copiar.');
    }
  });

  return { root: details, open: () => (details.open = true) };
}
