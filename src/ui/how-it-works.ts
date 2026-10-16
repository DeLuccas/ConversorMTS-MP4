// "Como funciona": três passos (uma sequência real) e o painel sobre as pastas do cartão.
import { h, nextId } from './dom';
import { icon, type IconName } from '../icons';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'sdCard',
    title: 'Coloque o cartão no computador',
    text: 'Use o leitor de cartão ou ligue a filmadora no cabo USB.',
  },
  {
    icon: 'pointer',
    title: 'Arraste a pasta para o visor',
    text: 'Pode ser a pasta inteira do cartão. Eu encontro os vídeos.',
  },
  {
    icon: 'play',
    title: 'Clique em Converter',
    text: 'Os vídeos em MP4 vão para a pasta que você escolher.',
  },
];

export function createHowItWorks() {
  const panelId = nextId('cartao');
  const toggle = h(
    'button',
    {
      class: 'link-btn how__toggle',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': panelId,
    },
    icon('info'),
    'Onde ficam os vídeos no cartão?',
  );

  const tree = h(
    'ul',
    { class: 'tree', 'aria-label': 'Pastas do cartão da filmadora' },
    h(
      'li',
      null,
      h('span', { class: 'tree__node' }, icon('sdCard'), 'Cartão da filmadora'),
      h(
        'ul',
        null,
        h(
          'li',
          null,
          h('span', { class: 'tree__node' }, icon('folder'), 'PRIVATE'),
          h(
            'ul',
            null,
            h(
              'li',
              null,
              h('span', { class: 'tree__node' }, icon('folder'), 'AVCHD'),
              h(
                'ul',
                null,
                h(
                  'li',
                  null,
                  h('span', { class: 'tree__node' }, icon('folder'), 'BDMV'),
                  h(
                    'ul',
                    null,
                    h(
                      'li',
                      null,
                      h('span', { class: 'tree__node tree__node--hit' }, icon('folderOpen'), 'STREAM'),
                      h(
                        'ul',
                        { class: 'tree__files' },
                        h('li', null, h('span', { class: 'tree__file' }, '00000.MTS')),
                        h('li', null, h('span', { class: 'tree__file' }, '00001.MTS')),
                        h('li', null, h('span', { class: 'tree__file' }, '00002.MTS')),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  const panel = h(
    'div',
    { class: 'how__panel', id: panelId, hidden: true },
    h(
      'div',
      { class: 'how__panel-text' },
      h('h3', { class: 'how__panel-title' }, 'Os vídeos ficam bem escondidos'),
      h(
        'p',
        null,
        'As filmadoras Sony e Panasonic guardam cada gravação como um arquivo ',
        h('strong', null, '.MTS'),
        ' dentro de PRIVATE, depois AVCHD, BDMV e por fim STREAM.',
      ),
      h(
        'p',
        null,
        'Você não precisa abrir nada disso: arraste a pasta do cartão inteira e eu procuro os vídeos em todas as subpastas.',
      ),
    ),
    tree,
  );

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) panel.classList.add('is-opening');
  });
  panel.addEventListener('animationend', () => panel.classList.remove('is-opening'));

  const root = h(
    'section',
    { class: 'how', 'aria-labelledby': 'how-title' },
    h('h2', { class: 'h2', id: 'how-title' }, 'Como funciona'),
    h(
      'ol',
      { class: 'how__steps' },
      STEPS.map((s) =>
        h(
          'li',
          { class: 'how__step' },
          h('span', { class: 'how__icon' }, icon(s.icon)),
          h('h3', { class: 'how__title' }, s.title),
          h('p', { class: 'how__text' }, s.text),
        ),
      ),
    ),
    toggle,
    panel,
  );
  return root;
}
