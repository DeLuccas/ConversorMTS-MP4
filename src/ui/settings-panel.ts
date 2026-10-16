// Painel "Como converter": modo, destino, nomes e ajustes avançados.
import { h, nextId } from './dom';
import { icon, type IconName } from '../icons';
import { store } from '../state';
import { crfLabel } from '../args';
import { estimateConvertSeconds, estimateOutputBytes } from '../estimate';
import { formatEstimate, formatSize } from '../format';
import { canPickFolder } from '../save';
import { dateStem } from '../naming';
import { isDefaultAdvanced, resetAdvanced, type Settings } from '../settings';
import { engine } from '../ffmpeg';
import { loadCalibration, videoSeconds } from '../queue';

export interface SettingsHandlers {
  pickDestination: () => void;
  openPreview: () => void;
}

type Option<T extends string> = { value: T; label: string };

/** Controle segmentado acessível (grupo de rádios). */
export function segmented<T extends string>(
  label: string,
  options: Option<T>[],
  get: () => T,
  set: (v: T) => void,
  hint?: HTMLElement,
) {
  const name = nextId('seg');
  const labelId = `${name}-label`;
  const inputs = options.map((o) => {
    const input = h('input', { type: 'radio', name, value: o.value, class: 'seg__input' });
    input.addEventListener('change', () => input.checked && set(o.value));
    return { input, el: h('label', { class: 'seg__opt' }, input, h('span', null, o.label)) };
  });
  const root = h(
    'div',
    { class: 'field', role: 'radiogroup', 'aria-labelledby': labelId },
    h('span', { class: 'field__label', id: labelId }, label),
    h('div', { class: 'seg' }, inputs.map((i) => i.el)),
    hint ?? null,
  );
  const sync = () => {
    const v = get();
    for (const i of inputs) i.input.checked = i.input.value === v;
  };
  sync();
  return { root, sync };
}

/** Interruptor (checkbox com aparência de chave). */
export function toggle(label: string, desc: string, get: () => boolean, set: (v: boolean) => void) {
  const input = h('input', { type: 'checkbox', class: 'switch__input', role: 'switch' });
  input.addEventListener('change', () => set(input.checked));
  const root = h(
    'label',
    { class: 'switch-row' },
    h('span', { class: 'switch-row__text' }, h('span', { class: 'field__label' }, label), h('span', { class: 'field__hint' }, desc)),
    input,
    h('span', { class: 'switch', 'aria-hidden': 'true' }, h('i')),
  );
  const sync = () => {
    input.checked = get();
  };
  sync();
  return { root, sync };
}

export function createSettingsPanel(handlers: SettingsHandlers) {
  const S = () => store.state.settings;
  const set = (patch: Partial<Settings>) => store.updateSettings(patch);

  // ---------- Modo ----------
  const modeName = nextId('mode');
  const modeCard = (value: Settings['mode'], ic: IconName, title: string, text: string, badge?: string) => {
    const input = h('input', { type: 'radio', name: modeName, value, class: 'mode__input' });
    input.addEventListener('change', () => input.checked && set({ mode: value }));
    const est = h('span', { class: 'mode__est num' });
    const el = h(
      'label',
      { class: 'mode' },
      input,
      h(
        'span',
        { class: 'mode__head' },
        h('span', { class: 'mode__icon' }, icon(ic)),
        h('span', { class: 'mode__title' }, title),
        badge ? h('span', { class: 'badge' }, badge) : null,
        h('span', { class: 'mode__radio', 'aria-hidden': 'true' }),
      ),
      h('span', { class: 'mode__text' }, text),
      est,
    );
    return { el, input, est };
  };
  const enhance = modeCard(
    'enhance',
    'wand',
    'Melhorar qualidade',
    'Tira as linhas tremidas dos movimentos, limpa o chuvisco e deixa a imagem mais nítida.',
    'Recomendado',
  );
  const fast = modeCard(
    'fast',
    'zap',
    'Conversão rápida',
    'Mantém a imagem exatamente como foi gravada e só troca o formato para MP4.',
  );
  const previewBtn = h(
    'button',
    { class: 'btn preview-cta', type: 'button', onclick: handlers.openPreview },
    icon('eye'),
    'Ver prévia da melhoria',
  );
  const modes = h(
    'div',
    { class: 'modes', role: 'radiogroup', 'aria-label': 'Modo de conversão' },
    enhance.el,
    fast.el,
  );

  // ---------- Onde salvar ----------
  const destName = h('span', { class: 'dest__name' });
  const destBtn = h('button', { class: 'btn', type: 'button', onclick: handlers.pickDestination });
  const destHint = h('p', { class: 'field__hint' });
  const destRow = h(
    'div',
    { class: 'row' },
    h('div', { class: 'row__text' }, h('h3', { class: 'row__title' }, 'Onde salvar'), destHint),
    h('div', { class: 'row__control dest' }, destName, destBtn),
  );

  // ---------- Nomes ----------
  const sample = dateStem(new Date(2011, 2, 12, 14, 32).getTime());
  const naming = segmented<Settings['naming']>(
    'Nome dos arquivos',
    [
      { value: 'date', label: `Data da gravação` },
      { value: 'original', label: 'Nome original' },
    ],
    () => S().naming,
    (v) => set({ naming: v }),
  );
  const namingExample = h('p', { class: 'field__hint num' });
  const namingRow = h(
    'div',
    { class: 'row' },
    h(
      'div',
      { class: 'row__text' },
      h('h3', { class: 'row__title' }, 'Nome dos arquivos'),
      namingExample,
    ),
    h('div', { class: 'row__control' }, naming.root),
  );
  naming.root.querySelector('.field__label')!.classList.add('sr-only');

  // ---------- Avançado ----------
  const advId = nextId('adv');
  const advToggle = h(
    'button',
    { class: 'adv__toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': advId },
    h('span', null, 'Ajustes avançados'),
    h('span', { class: 'adv__state muted' }),
    icon('chevronDown', 'adv__chev'),
  );
  const deint = toggle(
    'Desentrelaçar',
    'Tira o efeito de "pente" nas imagens em movimento. Deixe ligado para filmadoras 1080i.',
    () => S().deinterlace,
    (v) => set({ deinterlace: v }),
  );
  const color = toggle(
    'Realçar cores',
    'Um pouco mais de contraste e cor. Bom para vídeos que ficaram apagados.',
    () => S().color,
    (v) => set({ color: v }),
  );
  const levels: Option<Settings['denoise']>[] = [
    { value: 'off', label: 'Desligada' },
    { value: 'light', label: 'Leve' },
    { value: 'medium', label: 'Média' },
  ];
  const denoise = segmented('Redução de ruído', levels, () => S().denoise, (v) => set({ denoise: v }),
    h('p', { class: 'field__hint' }, 'Média ajuda em vídeos gravados com pouca luz.'));
  const sharpen = segmented('Nitidez', levels, () => S().sharpen, (v) => set({ sharpen: v }));
  const resHint = h('p', { class: 'field__hint field__hint--warn' });
  const resolution = segmented<Settings['resolution']>(
    'Resolução',
    [
      { value: 'original', label: 'Original' },
      { value: '1440', label: '1440p' },
      { value: '2160', label: '4K' },
    ],
    () => S().resolution,
    (v) => set({ resolution: v }),
    resHint,
  );
  const preset = segmented<Settings['preset']>(
    'Velocidade',
    [
      { value: 'veryfast', label: 'Rápida' },
      { value: 'faster', label: 'Equilibrada' },
      { value: 'medium', label: 'Melhor compressão' },
    ],
    () => S().preset,
    (v) => set({ preset: v }),
  );
  const audio = segmented<Settings['audioBitrate']>(
    'Qualidade do áudio',
    [
      { value: '192k', label: '192 kbps' },
      { value: '256k', label: '256 kbps' },
      { value: '320k', label: '320 kbps' },
    ],
    () => S().audioBitrate,
    (v) => set({ audioBitrate: v }),
  );

  const crfId = nextId('crf');
  const crfValue = h('span', { class: 'crf__value' });
  const crfInput = h('input', {
    type: 'range',
    id: crfId,
    min: '14',
    max: '24',
    step: '1',
    class: 'range',
    'aria-describedby': `${crfId}-hint`,
  });
  // Mais à direita = mais qualidade: o slider é invertido em relação ao CRF
  crfInput.addEventListener('input', () => set({ crf: 38 - Number(crfInput.value) }));
  const crfHint = h('p', { class: 'field__hint num', id: `${crfId}-hint` });
  const crf = h(
    'div',
    { class: 'field field--wide' },
    h('label', { class: 'field__label', for: crfId }, 'Qualidade da imagem: ', crfValue),
    h('div', { class: 'range-wrap' }, h('span', { class: 'range__end' }, 'Arquivo menor'), crfInput, h('span', { class: 'range__end' }, 'Mais qualidade')),
    crfHint,
  );

  const resetBtn = h(
    'button',
    { class: 'btn btn--quiet', type: 'button', onclick: () => store.replaceSettings(resetAdvanced(S())) },
    icon('reset'),
    'Restaurar padrões',
  );

  const advEnhanceOnly = h(
    'div',
    { class: 'adv__group' },
    deint.root,
    h('div', { class: 'adv__grid' }, denoise.root, sharpen.root, resolution.root, preset.root),
    color.root,
    crf,
  );
  const fastNote = h(
    'p',
    { class: 'adv__note' },
    'Na conversão rápida a imagem não é alterada. Só a qualidade do áudio pode ser ajustada.',
  );
  const advPanel = h(
    'div',
    { class: 'adv__panel', id: advId, hidden: true },
    fastNote,
    advEnhanceOnly,
    h('div', { class: 'adv__grid' }, audio.root),
    h('div', { class: 'adv__foot' }, resetBtn),
  );
  advToggle.addEventListener('click', () => {
    const open = advPanel.hidden;
    advPanel.hidden = !open;
    advToggle.setAttribute('aria-expanded', String(open));
    if (open) advPanel.classList.add('is-opening');
  });
  advPanel.addEventListener('animationend', () => advPanel.classList.remove('is-opening'));
  const adv = h('div', { class: 'adv' }, advToggle, advPanel);

  const root = h(
    'section',
    { class: 'settings', 'aria-labelledby': 'settings-title' },
    h('div', { class: 'section-head' }, h('h2', { class: 'h2', id: 'settings-title' }, 'Como converter')),
    modes,
    h('div', { class: 'preview-line' }, previewBtn, h('p', { class: 'muted' }, 'Compare um quadro do seu vídeo antes e depois da melhoria.')),
    h('div', { class: 'rows' }, destRow, namingRow, adv),
  );

  function sync() {
    const s = S();
    enhance.input.checked = s.mode === 'enhance';
    fast.input.checked = s.mode === 'fast';
    naming.sync();
    namingExample.textContent = s.naming === 'date' ? `Exemplo: ${sample}.mp4` : 'Exemplo: 00001.mp4, como no cartão';
    deint.sync();
    color.sync();
    denoise.sync();
    sharpen.sync();
    resolution.sync();
    preset.sync();
    audio.sync();
    crfInput.value = String(38 - s.crf);
    crfValue.textContent = `${crfLabel(s.crf)}`;
    crfInput.setAttribute('aria-valuetext', `${crfLabel(s.crf)}, CRF ${s.crf}`);
    resHint.textContent =
      s.resolution === '2160'
        ? 'Ampliar para 4K deixa a conversão até 5 vezes mais lenta e os arquivos bem maiores.'
        : s.resolution === '1440'
          ? 'Ampliar deixa a conversão cerca de 2 vezes mais lenta.'
          : 'Mantém o tamanho gravado pela filmadora.';
    resHint.classList.toggle('field__hint--warn', s.resolution !== 'original');
    advEnhanceOnly.hidden = s.mode === 'fast';
    fastNote.hidden = s.mode !== 'fast';
    advToggle.querySelector('.adv__state')!.textContent = isDefaultAdvanced(s) ? 'Padrão recomendado' : 'Personalizado';
    resetBtn.disabled = isDefaultAdvanced(s);
    updateEstimates();
  }

  function updateEstimates() {
    const s = S();
    const sel = store.selected;
    const secs = sel.reduce((a, i) => a + videoSeconds(i), 0);
    const bytes = sel.reduce((a, i) => a + i.file.size, 0);
    const ctx = { multithread: engine.kind === 'mt', calibrated: loadCalibration() };
    const n = sel.length;
    const suffix = n === 1 ? 'para este vídeo' : `para ${n} vídeos`;
    enhance.est.textContent = n
      ? `${capital(formatEstimate(estimateConvertSeconds(secs, { ...s, mode: 'enhance' }, ctx)))} ${suffix}`
      : '';
    fast.est.textContent = n ? `${capital(formatEstimate(estimateConvertSeconds(secs, { ...s, mode: 'fast' }, ctx)))} ${suffix}` : '';
    const out = estimateOutputBytes(secs || 60, bytes, { ...s, mode: 'enhance' });
    crfHint.textContent = n
      ? `Os arquivos devem ficar com cerca de ${formatSize(out)} no total (os originais têm ${formatSize(bytes)}).`
      : `Cerca de ${formatSize(out)} por minuto de vídeo.`;

    const hasFolder = !!store.state.folderName;
    if (!canPickFolder()) {
      destHint.textContent = 'Os vídeos convertidos vão para a pasta Downloads do computador.';
      destBtn.hidden = true;
      destName.textContent = '';
    } else {
      destHint.textContent = hasFolder
        ? 'Cada vídeo é salvo nessa pasta assim que fica pronto.'
        : 'Recomendado: escolha uma pasta e cada vídeo é salvo nela assim que fica pronto.';
      destName.hidden = !hasFolder;
      clear(destName);
      if (hasFolder) destName.append(icon('folder'), h('span', null, store.state.folderName!));
      destBtn.textContent = hasFolder ? 'Trocar pasta' : 'Escolher pasta de destino';
      destBtn.classList.toggle('btn--quiet', hasFolder);
    }
  }

  store.on('settings', sync);
  store.on('items', updateEstimates);
  store.on('folder', updateEstimates);
  store.on('item', () => {
    if (store.state.phase === 'ready') scheduleEstimates();
  });
  let pending = 0;
  const scheduleEstimates = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      updateEstimates();
    });
  };

  sync();
  return { root };
}

function clear(el: Element) {
  while (el.firstChild) el.firstChild.remove();
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
