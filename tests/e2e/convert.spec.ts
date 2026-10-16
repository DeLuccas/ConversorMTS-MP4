import { expect, test } from '@playwright/test';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { addCardFolder, dismissNotifyPrompt, dropFiles, FIXTURES, hasFfprobe, hasFixtures, probeStreams, waitAnalyzed } from './helpers';

test.skip(!hasFixtures(), 'Gere as fixtures com `npm run fixtures` (precisa do ffmpeg instalado).');

test.beforeEach(async ({ page }) => {
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  await page.goto('/');
  // Isolamento de origem ativo: o motor multithread pode ser usado
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});

test('estado vazio convida a arrastar a pasta', async ({ page }) => {
  await expect(page.getByText('Arraste aqui a pasta do cartão da filmadora')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher pasta', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher arquivos' })).toBeVisible();
  await page.getByRole('button', { name: 'Onde ficam os vídeos no cartão?' }).click();
  await expect(page.getByText('STREAM', { exact: true })).toBeVisible();
});

test('arrastar a pasta do cartão: lê subpastas, ignora outros arquivos, gera miniaturas e agrupa por dia', async ({ page }) => {
  await addCardFolder(page);
  await waitAnalyzed(page, 3);
  await expect(page.locator('.card')).toHaveCount(3);
  await expect(page.locator('.group__day')).toHaveText(['Sábado, 12 de março de 2011', 'Domingo, 13 de março de 2011']);
  await expect(page.locator('.card__dur').first()).toHaveText('0:05');
  // Ordenado pela hora da gravação
  await expect(page.locator('.card__time')).toHaveText(['14h32', '15h05', '10h12']);
  await expect(page.getByRole('button', { name: 'Converter 3 vídeos' })).toBeEnabled();

  // Duplicados são ignorados
  await addCardFolder(page);
  await expect(page.getByText('Esses vídeos já estão na lista.')).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(3);
});

test('arrastar arquivos soltos (drag and drop)', async ({ page }) => {
  await dropFiles(page, [
    { path: join(FIXTURES, '00001.MTS'), name: '00001.MTS', lastModified: statSync(join(FIXTURES, '00001.MTS')).mtimeMs },
  ]);
  await waitAnalyzed(page, 1);
  await expect(page.locator('.card')).toHaveCount(1);
});

test('remover e desfazer', async ({ page }) => {
  await addCardFolder(page);
  await waitAnalyzed(page, 3);
  await page.getByRole('button', { name: /Remover o vídeo das 15h05/ }).click();
  await expect(page.locator('.card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.locator('.card')).toHaveCount(3);
});

test('prévia de qualidade com slider acessível por teclado', async ({ page }) => {
  await addCardFolder(page);
  await waitAnalyzed(page, 3);
  await page.getByRole('button', { name: 'Ver prévia da melhoria', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Prévia da melhoria' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.compare__loading')).toBeHidden({ timeout: 120_000 });
  const slider = dialog.getByRole('slider');
  await expect(slider).toHaveAttribute('aria-valuenow', '50');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '54');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  // As duas imagens têm conteúdo
  const sizes = await dialog.locator('.compare__img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).naturalWidth));
  expect(sizes.every((w) => w >= 1280)).toBe(true);
  await dialog.getByRole('button', { name: 'Ver outro momento' }).click();
  await expect(dialog.locator('.compare__loading')).toBeHidden({ timeout: 120_000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

for (const mode of ['fast', 'enhance'] as const) {
  test(`converter no modo ${mode === 'fast' ? 'Rápido' : 'Melhorar'} e baixar MP4 com vídeo e áudio`, async ({ page }, info) => {
    test.skip(!hasFfprobe(), 'ffprobe não instalado');
    await addCardFolder(page);
    await waitAnalyzed(page, 3);
    await page.locator('.mode', { hasText: mode === 'fast' ? 'Conversão rápida' : 'Melhorar qualidade' }).click();
    if (mode === 'enhance') {
      // Para o teste ser rápido, converte só dois vídeos
      await page.locator('.card').nth(2).locator('.check').click();
      await expect(page.getByRole('button', { name: 'Converter 2 vídeos' })).toBeVisible();
    }
    const expected = mode === 'enhance' ? 2 : 3;
    await page.getByRole('button', { name: `Converter ${expected} vídeos` }).click();
    await dismissNotifyPrompt(page);
    await expect(page.locator('.vf[data-phase="converting"]')).toBeVisible();
    await expect(page.locator('.vf[data-phase="done"]')).toBeVisible({ timeout: 8 * 60_000 });
    await expect(page.locator('.vf__title')).toHaveText(`${expected} vídeos convertidos`);
    await expect(page).toHaveTitle('✓ Conversão concluída');

    const all: import('@playwright/test').Download[] = [];
    page.on('download', (d) => all.push(d));
    await page.getByRole('button', { name: 'Baixar todos' }).click();
    await expect.poll(() => all.length, { timeout: 30_000 }).toBe(expected);
    const names = all.map((d) => d.suggestedFilename()).sort();
    expect(names).toEqual(
      mode === 'fast'
        ? ['2011-03-12 14h32.mp4', '2011-03-12 15h05.mp4', '2011-03-13 10h12.mp4']
        : ['2011-03-12 14h32.mp4', '2011-03-12 15h05.mp4'],
    );
    for (const d of all) {
      const path = info.outputPath(d.suggestedFilename());
      await d.saveAs(path);
      const streams = probeStreams(path);
      expect(streams.some((s) => s.codec_type === 'video' && s.codec_name === 'h264')).toBe(true);
      expect(streams.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac')).toBe(true);
    }

    // "Assistir" abre o player com o MP4
    await page.getByRole('button', { name: 'Assistir' }).first().click();
    const player = page.locator('video.player');
    await expect(player).toBeVisible();
    await expect(player).toHaveAttribute('src', /^blob:/);
    // O Chromium de testes não traz H.264/AAC (o Chrome e o Edge trazem); só confere a reprodução quando há codec
    const canPlay = await player.evaluate((v: HTMLVideoElement) => v.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"'));
    if (canPlay) await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 }).toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Converter mais vídeos' }).click();
    await expect(page.getByText('Arraste aqui a pasta do cartão da filmadora')).toBeVisible();
  });
}
