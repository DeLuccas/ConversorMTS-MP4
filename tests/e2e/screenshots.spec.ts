// Revisão visual: screenshots de cada estado em 1440, 1024 e 390 px, nos temas claro e escuro.
// Rode com: npx playwright test screenshots  (saída em screenshots/)
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addCardFolder, dismissNotifyPrompt, FIXTURES, hasFixtures, waitAnalyzed } from './helpers';

test.skip(!hasFixtures(), 'Gere as fixtures com `npm run fixtures`.');
test.skip(!process.env.SCREENSHOTS, 'Defina SCREENSHOTS=1 para gerar as imagens de revisão.');

const OUT = join(process.cwd(), 'screenshots');
const SIZES = [
  [1440, 900],
  [1024, 768],
  [390, 844],
] as const;
const SCHEMES = ['light', 'dark'] as const;

async function shoot(page: Page, name: string, fullPage = true) {
  mkdirSync(OUT, { recursive: true });
  for (const [w, h] of SIZES) {
    for (const scheme of SCHEMES) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(OUT, `${name}-${w}-${scheme}.png`), fullPage, animations: 'disabled' });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
}

test('screenshots de todos os estados', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  // 1. Vazio
  await shoot(page, '1-vazio');
  await page.getByRole('button', { name: 'Onde ficam os vídeos no cartão?' }).click();
  await shoot(page, '1b-vazio-cartao');
  await page.getByRole('button', { name: 'Onde ficam os vídeos no cartão?' }).click();

  // 2. Pronto
  await addCardFolder(page);
  await waitAnalyzed(page, 3);
  await shoot(page, '2-pronto');
  await page.getByRole('button', { name: /Ajustes avançados/ }).click();
  await shoot(page, '2b-pronto-avancado');
  await page.getByRole('button', { name: /Ajustes avançados/ }).click();

  // Prévia
  await page.getByRole('button', { name: 'Ver prévia da melhoria', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Prévia da melhoria' });
  await expect(dialog.locator('.compare__loading')).toBeHidden({ timeout: 120_000 });
  await page.waitForTimeout(300);
  await shoot(page, '5-previa', false);
  await page.keyboard.press('Escape');

  // 3. Convertendo (modo Melhorar)
  await page.getByRole('button', { name: 'Converter 3 vídeos' }).click();
  await dismissNotifyPrompt(page);
  await page.waitForFunction(
    () => {
      const b = (window as any).__app.store.state.batch;
      return b && b.overall > 12 && Date.now() - b.startedAt > 9000;
    },
    null,
    { timeout: 5 * 60_000 },
  );
  await shoot(page, '3-convertendo');

  // 4. Concluído
  await expect(page.locator('.vf[data-phase="done"]')).toBeVisible({ timeout: 10 * 60_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, '4a-concluido-confete-1440-light.png') });
  await page.waitForTimeout(4500);
  await shoot(page, '4-concluido');

  // Estado de erro: um arquivo corrompido junto de um bom
  await page.getByRole('button', { name: 'Converter mais vídeos' }).click();
  const junk = join(OUT, '..', 'test-results', '00009.MTS');
  mkdirSync(join(OUT, '..', 'test-results'), { recursive: true });
  writeFileSync(junk, Buffer.alloc(3 * 1024 * 1024, 7));
  await page.locator('input[multiple]:not([webkitdirectory])').setInputFiles([join(FIXTURES, '00001.MTS'), junk]);
  await page.waitForFunction(() => {
    const s = (window as any).__app.store.state;
    return !s.analyze && s.items.length === 2 && s.items.every((i: any) => i.probe === 'done' || i.probe === 'failed');
  });
  await page.locator('.mode', { hasText: 'Conversão rápida' }).click();
  await page.getByRole('button', { name: 'Converter 2 vídeos' }).click();
  await dismissNotifyPrompt(page);
  await expect(page.locator('.vf[data-phase="done"]')).toBeVisible({ timeout: 5 * 60_000 });
  await page.waitForTimeout(4500);
  await shoot(page, '6-erro');
  await page.getByRole('button', { name: 'Ver detalhes' }).click();
  await shoot(page, '6b-erro-detalhes', false);
});
