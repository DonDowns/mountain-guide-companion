import { expect, test } from '@playwright/test';

async function expectBelowHeader(page, heading) {
  const headerBottom = await page.locator('.app-header').evaluate(node => node.getBoundingClientRect().bottom);
  const headingTop = await page.getByRole('heading', { name: heading }).evaluate(node => node.getBoundingClientRect().top);
  expect(headingTop).toBeGreaterThanOrEqual(headerBottom);
  await page.waitForTimeout(750);
}

test('captures the Phase 6A mountain-earth visual-audit matrix', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'chromium-mobile';
  const desktop = testInfo.project.name === 'chromium-desktop';
  test.skip(!mobile && !desktop, 'Visual matrix uses Chromium reference renders');

  await page.goto('/');
  if (desktop) {
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'Continue in Browser' }).click();
    await expectBelowHeader(page, 'Timeline');
    await page.screenshot({ path: 'tmp/visual-audit/14-desktop-timeline.png' });
    await page.getByRole('button', { name: /Route/ }).last().click();
    await expectBelowHeader(page, 'Route');
    await page.screenshot({ path: 'tmp/visual-audit/15-desktop-route.png' });
    return;
  }

  await page.screenshot({ path: 'tmp/visual-audit/01-mobile-first-open.png' });
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.locator('#artifact-cards').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/visual-audit/02-mobile-artifacts.png' });
  await page.locator('#install-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/visual-audit/03-mobile-setup.png' });
  await page.getByRole('button', { name: 'Continue in Browser' }).click();
  await expectBelowHeader(page, 'Timeline');
  await page.screenshot({ path: 'tmp/visual-audit/04-mobile-timeline-daylight.png' });
  await page.getByRole('button', { name: /Route/ }).last().click();
  await expectBelowHeader(page, 'Route');
  await page.screenshot({ path: 'tmp/visual-audit/05-mobile-route-daylight.png' });
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await expectBelowHeader(page, 'CALL 911 FIRST');
  await page.screenshot({ path: 'tmp/visual-audit/06-mobile-emergency-daylight.png' });
  await page.getByRole('button', { name: /Help/ }).last().click();
  await page.locator('#companion-help-search').fill('no signal');
  await expectBelowHeader(page, 'Help & Diagnostics');
  await page.screenshot({ path: 'tmp/visual-audit/06a-mobile-help-search.png' });
  await page.getByRole('button', { name: /Timeline/ }).last().click();
  await expectBelowHeader(page, 'Timeline');
  await page.getByRole('button', { name: /Red Mode/ }).click();
  await page.screenshot({ path: 'tmp/visual-audit/07-mobile-timeline-red.png' });
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await expectBelowHeader(page, 'CALL 911 FIRST');
  await page.screenshot({ path: 'tmp/visual-audit/08-mobile-emergency-red.png' });

  await page.getByRole('button', { name: /Red Mode/ }).click();

  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Companion Home', level: 1 })).toBeAttached();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.getByRole('button', { name: 'Offline Check' }).first().click();
  await expect(page.getByRole('heading', { name: 'Finish Preparing This Phone for Offline Use' })).toBeVisible();
  await page.locator('#install-panel').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(page.locator('.setup-checklist')).toContainText('Running from Home Screen');
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
