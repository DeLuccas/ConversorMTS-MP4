import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const FIXTURES = join(process.cwd(), 'test-fixtures');
export const CARD_FOLDER = join(FIXTURES, 'AVCHD');
export const hasFixtures = () => existsSync(join(CARD_FOLDER, 'BDMV', 'STREAM', '00000.MTS'));

export function hasFfprobe() {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Streams do arquivo, via ffprobe do sistema. */
export function probeStreams(path: string): { codec_type: string; codec_name: string }[] {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', path]);
  return JSON.parse(out.toString()).streams;
}

/**
 * Simula arrastar arquivos para a página. Os arquivos são criados dentro do navegador
 * com a data de gravação original, como num cartão de verdade.
 */
export async function dropFiles(page: Page, files: { path: string; name: string; lastModified: number }[]) {
  const payload = files.map((f) => ({ name: f.name, lastModified: f.lastModified, b64: readFileSync(f.path).toString('base64') }));
  await page.evaluate((list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const bin = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bin], f.name, { lastModified: f.lastModified, type: 'video/mp2t' }));
    }
    const target = document.getElementById('viewfinder')!;
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
  }, payload);
}

export async function addCardFolder(page: Page) {
  await page.locator('input[webkitdirectory]').setInputFiles(CARD_FOLDER);
}

export async function waitAnalyzed(page: Page, n: number) {
  await page.locator('.card__thumb.is-loaded').nth(n - 1).waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => {
    const s = (window as any).__app.store.state;
    return !s.analyze && s.items.every((i: any) => i.probe === 'done');
  });
}

export async function dismissNotifyPrompt(page: Page) {
  const later = page.getByRole('button', { name: 'Agora não' });
  if (await later.isVisible({ timeout: 2000 }).catch(() => false)) await later.click();
}
