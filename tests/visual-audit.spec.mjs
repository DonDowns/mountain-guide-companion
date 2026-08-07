import { expect, test } from '@playwright/test';

async function expectBelowHeader(page, heading) {
  const headerBottom = await page.locator('.app-header').evaluate(node => node.getBoundingClientRect().bottom);
  const headingTop = await page.getByRole('heading', { name: heading }).evaluate(node => node.getBoundingClientRect().top);
  expect(headingTop).toBeGreaterThanOrEqual(headerBottom);
}

test('captures the Phase 6A mountain-earth visual-audit matrix', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'chromium-mobile';
  const desktop = testInfo.project.name === 'chromium-desktop';
  test.skip(!mobile && !desktop, 'Visual matrix uses Chromium reference renders');

  await page.goto('/');
  if (desktop) {
    await page.getByRole('button', { name: 'Open Companion' }).first().click();
    await expectBelowHeader(page, 'Timeline');
    await page.screenshot({ path: 'tmp/visual-audit/14-desktop-timeline.png' });
    await page.getByRole('button', { name: /Route/ }).last().click();
    await expectBelowHeader(page, 'Route');
    await page.screenshot({ path: 'tmp/visual-audit/15-desktop-route.png' });
    return;
  }

  await page.screenshot({ path: 'tmp/visual-audit/01-mobile-first-open.png' });
  await page.locator('#artifact-cards').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/visual-audit/02-mobile-artifacts.png' });
  await page.locator('#install-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/visual-audit/03-mobile-setup.png' });
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await expectBelowHeader(page, 'Timeline');
  await page.screenshot({ path: 'tmp/visual-audit/04-mobile-timeline-daylight.png' });
  await page.getByRole('button', { name: /Route/ }).last().click();
  await expectBelowHeader(page, 'Route');
  await page.screenshot({ path: 'tmp/visual-audit/05-mobile-route-daylight.png' });
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await expectBelowHeader(page, 'CALL 911 FIRST');
  await page.screenshot({ path: 'tmp/visual-audit/06-mobile-emergency-daylight.png' });
  await page.getByRole('button', { name: /Timeline/ }).last().click();
  await expectBelowHeader(page, 'Timeline');
  await page.getByRole('button', { name: /Red/ }).click();
  await page.screenshot({ path: 'tmp/visual-audit/07-mobile-timeline-red.png' });
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await expectBelowHeader(page, 'CALL 911 FIRST');
  await page.screenshot({ path: 'tmp/visual-audit/08-mobile-emergency-red.png' });

  await page.getByRole('button', { name: /Red/ }).click();

  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.reload();
  await expect(page.getByText('INSTALLED COMPANION', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Set up this phone' }).click();
  await page.getByRole('button', { name: 'Offline Check' }).click();
  await expect(page.getByText('OFFLINE RESOURCES VERIFIED', { exact: true })).toBeVisible();
  await page.locator('#install-panel').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(page.getByText('Companion installed on this phone')).toBeVisible();
  await page.screenshot({ path: 'tmp/visual-audit/09-mobile-installed-offline-check.png' });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: /Timeline/ }).last().click();
  await expectBelowHeader(page, 'Timeline');
  await page.screenshot({ path: 'tmp/visual-audit/10-landscape-timeline.png' });
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await expectBelowHeader(page, 'CALL 911 FIRST');
  await page.screenshot({ path: 'tmp/visual-audit/11-landscape-emergency.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.filter = 'grayscale(1)'; });
  await page.getByRole('button', { name: /Timeline/ }).last().click();
  await page.screenshot({ path: 'tmp/visual-audit/12-mobile-timeline-grayscale.png' });
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await page.screenshot({ path: 'tmp/visual-audit/13-mobile-emergency-grayscale.png' });
});
