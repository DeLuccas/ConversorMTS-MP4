// Copia os arquivos do motor ffmpeg.wasm para public/ffmpeg/ (st = single-thread, mt = multithread).
// Assim o motor é servido do mesmo domínio, o que é obrigatório com COEP: require-corp.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  { pkg: '@ffmpeg/core', dir: 'st', files: ['ffmpeg-core.js', 'ffmpeg-core.wasm'] },
  { pkg: '@ffmpeg/core-mt', dir: 'mt', files: ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'] },
];

for (const { pkg, dir, files } of targets) {
  const src = join(root, 'node_modules', pkg, 'dist', 'esm');
  const out = join(root, 'public', 'ffmpeg', dir);
  if (!existsSync(src)) {
    console.warn(`[copy-ffmpeg] ${pkg} não encontrado, pulando.`);
    continue;
  }
  mkdirSync(out, { recursive: true });
  for (const f of files) copyFileSync(join(src, f), join(out, f));
  console.log(`[copy-ffmpeg] ${pkg} → public/ffmpeg/${dir}/`);
}
