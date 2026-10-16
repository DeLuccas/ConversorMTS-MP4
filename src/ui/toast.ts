// Avisos curtos (toasts) e anúncios para leitores de tela.
import { h } from './dom';
import { icon } from '../icons';

let region: HTMLElement;
let announcer: HTMLElement;

export function mountToasts() {
  region = h('div', { class: 'toasts', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  announcer = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
  document.body.append(region, announcer);
}

/** Anúncio só para leitores de tela. */
export function announce(text: string) {
  if (!announcer) return;
  announcer.textContent = '';
  setTimeout(() => (announcer.textContent = text), 60);
}

export interface ToastOptions {
  action?: { label: string; run: () => void };
  tone?: 'default' | 'error';
  duration?: number;
}

export function toast(message: string, opts: ToastOptions = {}) {
  const close = () => {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    const done = () => el.remove();
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, 300);
  };
  const el = h(
    'div',
    { class: `toast${opts.tone === 'error' ? ' toast--error' : ''}`, role: 'status' },
    h('p', { class: 'toast__msg' }, message),
    opts.action
      ? h(
          'button',
          {
            class: 'toast__action',
            type: 'button',
            onclick: () => {
              opts.action!.run();
              close();
            },
          },
          icon('reset'),
          opts.action.label,
        )
      : null,
    h('button', { class: 'toast__close', type: 'button', 'aria-label': 'Fechar aviso', onclick: close }, icon('x')),
  );
  // Mantém no máximo 3 avisos
  while (region.children.length >= 3) region.firstElementChild?.remove();
  region.append(el);
  let timer = window.setTimeout(close, opts.duration ?? (opts.action ? 7000 : 5000));
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => (timer = window.setTimeout(close, 3000)));
  el.addEventListener('focusin', () => clearTimeout(timer));
  return close;
}
