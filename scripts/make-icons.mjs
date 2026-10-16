// Gera os PNGs do PWA a partir dos SVGs, usando o Chromium do Playwright.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const jobs = [
  { src: 'camcorder.svg', out: 'icon-192.png', size: 192 },
  { src: 'camcorder.svg', out: 'icon-512.png', size: 512 },
  { src: 'maskable.svg', out: 'maskable-512.png', size: 512 },
  { src: 'camcorder.svg', out: 'apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const j of jobs) {
  const svg = readFileSync(join(dir, j.src), 'utf8');
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${j.size}" height="${j.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: join(dir, j.out), omitBackground: true, clip: { x: 0, y: 0, width: j.size, height: j.size } });
  console.log(`icons/${j.out}`);
}
await browser.close();
