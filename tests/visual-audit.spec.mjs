import { expect, test } from '@playwright/test';

test('captures the Phase 4 visual-audit matrix', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'chromium-mobile';
  const desktop = testInfo.project.name === 'chromium-desktop';
  test.skip(!mobile && !desktop, 'Visual matrix uses Chromium reference renders');

  await page.goto('/');
  if (desktop) {
    await page.screenshot({ path: 'tmp/visual-audit/08-desktop-first-open.png' });
    return;
  }

  await page.screenshot({ path: 'tmp/visual-audit/01-mobile-first-open.png' });
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await page.screenshot({ path: 'tmp/visual-audit/02-mobile-timeline-daylight.png' });
  await page.getByRole('button', { name: /Route/ }).last().click();
  await page.screenshot({ path: 'tmp/visual-audit/03-mobile-route-daylight.png' });
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await page.screenshot({ path: 'tmp/visual-audit/04-mobile-emergency-daylight.png' });
  await page.getByRole('button', { name: /Timeline/ }).last().click();
  await page.getByRole('button', { name: /Red/ }).click();
  await page.screenshot({ path: 'tmp/visual-audit/05-mobile-timeline-red.png' });
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await page.screenshot({ path: 'tmp/visual-audit/06-mobile-emergency-red.png' });

  await page.getByRole('button', { name: /Red/ }).click();

  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.reload();
  await expect(page.getByText('INSTALLED COMPANION', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Set up this phone' }).click();
  await page.locator('#install-panel').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(page.getByText('Companion installed on this phone')).toBeVisible();
  await page.screenshot({ path: 'tmp/visual-audit/07-mobile-installed-setup.png' });
});
