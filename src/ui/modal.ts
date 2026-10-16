// Modal acessível: foco preso, Esc fecha e o foco volta para quem abriu.
import { h, focusables, trapFocus } from './dom';
import { icon } from '../icons';

export interface ModalOptions {
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  onClose?: () => void;
  /** Elemento que recebe o foco ao abrir. */
  initialFocus?: () => HTMLElement | null;
  dismissible?: boolean;
}

const stack: HTMLElement[] = [];

export function openModal(content: HTMLElement | HTMLElement[], opts: ModalOptions) {
  const opener = document.activeElement as HTMLElement | null;
  const titleId = `modal-title-${Date.now()}`;
  const descId = opts.description ? `${titleId}-d` : undefined;
  const dismissible = opts.dismissible !== false;

  const closeBtn = dismissible
    ? h('button', { class: 'icon-btn modal__close', type: 'button', 'aria-label': 'Fechar' }, icon('x'))
    : null;
  const dialog = h(
    'div',
    {
      class: `modal modal--${opts.size ?? 'md'}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'aria-describedby': descId,
    },
    h(
      'header',
      { class: 'modal__head' },
      h('div', null, h('h2', { class: 'modal__title', id: titleId }, opts.title), opts.description ? h('p', { class: 'modal__desc', id: descId }, opts.description) : null),
      closeBtn,
    ),
    h('div', { class: 'modal__body' }, content),
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);
  document.body.append(backdrop);
  stack.push(backdrop);
  document.documentElement.classList.add('has-modal');
  // O resto da página fica inerte enquanto o modal está aberto
  const app = document.getElementById('app');
  app?.setAttribute('inert', '');
  const untrap = trapFocus(dialog);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    untrap();
    document.removeEventListener('keydown', onKey, true);
    backdrop.classList.add('is-leaving');
    const remove = () => backdrop.remove();
    backdrop.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 260);
    stack.splice(stack.indexOf(backdrop), 1);
    if (!stack.length) {
      document.documentElement.classList.remove('has-modal');
      app?.removeAttribute('inert');
    }
    opts.onClose?.();
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && dismissible && stack[stack.length - 1] === backdrop) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  closeBtn?.addEventListener('click', close);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop && dismissible) close();
  });

  requestAnimationFrame(() => {
    const target = opts.initialFocus?.() ?? focusables(dialog).find((el) => el !== closeBtn) ?? closeBtn;
    target?.focus({ preventScroll: true });
  });

  return { close, dialog };
}

/** Confirmação com duas ações. Resolve true se confirmar. */
export function confirmDialog(opts: {
  title: string;
  text: string;
  confirm: string;
  cancel: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const cancelBtn = h('button', { class: 'btn', type: 'button' }, opts.cancel);
    const okBtn = h('button', { class: `btn ${opts.danger ? 'btn--danger' : 'btn--primary'}`, type: 'button' }, opts.confirm);
    const body = h('div', null, h('p', { class: 'modal__text' }, opts.text), h('div', { class: 'modal__actions' }, cancelBtn, okBtn));
    const m = openModal(body, {
      title: opts.title,
      size: 'sm',
      initialFocus: () => cancelBtn,
      onClose: () => resolve(result),
    });
    cancelBtn.addEventListener('click', () => m.close());
    okBtn.addEventListener('click', () => {
      result = true;
      m.close();
    });
  });
}
