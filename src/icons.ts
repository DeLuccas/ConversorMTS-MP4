// Ícones Lucide importados no build (nada de CDN), com traço 1.75.
import {
  createElement,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Download,
  Eye,
  Folder,
  FolderOpen,
  Files,
  Info,
  Laptop,
  MousePointerClick,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Trash,
  TriangleAlert,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
  type IconNode,
} from 'lucide';

const icons = {
  check: Check,
  chevronDown: ChevronDown,
  circleCheck: CircleCheck,
  copy: Copy,
  download: Download,
  eye: Eye,
  folder: Folder,
  folderOpen: FolderOpen,
  files: Files,
  info: Info,
  laptop: Laptop,
  pointer: MousePointerClick,
  play: Play,
  plus: Plus,
  reset: RotateCcw,
  shuffle: Shuffle,
  trash: Trash,
  alert: TriangleAlert,
  volume: Volume2,
  volumeOff: VolumeX,
  wand: WandSparkles,
  x: X,
  zap: Zap,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
} satisfies Record<string, IconNode>;

/** Ícones próprios desenhados na mesma grade 24×24 e traço do Lucide. */
const custom: Record<string, IconNode> = {
  // Cartão SD
  sdCard: [
    ['path', { d: 'M7 2h8.5L19 5.5V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z' }],
    ['path', { d: 'M9 6v3' }],
    ['path', { d: 'M12 6v3' }],
    ['path', { d: 'M15 6v3' }],
  ],
  // Filmadora (a mesma silhueta do ícone do app)
  camcorder: [
    ['rect', { x: '2', y: '7', width: '14', height: '10', rx: '2.5' }],
    ['path', { d: 'm16 10.5 5-3v9l-5-3' }],
    ['circle', { cx: '6.5', cy: '12', r: '1.5' }],
  ],
};

export type IconName = keyof typeof icons | 'sdCard' | 'camcorder';

export function icon(name: IconName, extraClass = ''): SVGElement {
  const node = (icons as Record<string, IconNode>)[name] ?? custom[name];
  const svg = createElement(node, {
    'stroke-width': 1.75,
    width: 24,
    height: 24,
    class: `icon ${extraClass}`.trim(),
    'aria-hidden': 'true',
    focusable: 'false',
  });
  return svg;
}
