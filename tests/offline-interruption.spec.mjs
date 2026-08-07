import { expect, test } from '@playwright/test';
import { setServerState, waitForServiceWorker } from './offline-helpers.mjs';

test.describe.configure({ mode: 'serial' });

const failures = [
  ['required JavaScript unavailable', { failPath: 'js/companion-ui.js' }],
  ['canonical data unavailable', { failPath: 'data/trip-manifest.json' }],
  ['PDF unavailable', { failPath: 'generated/pocket-card.pdf' }],
  ['integrity mismatch', { corruptPath: 'css/companion.css' }],
  ['simulated low-storage response', { failPath: 'index.html', failureStatus: 507 }]
];

for (const [label, failure] of failures) {
  test(`failed candidate does not replace the previous release: ${label}`, async ({ page, request }, testInfo) => {
    test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Interrupted-install matrix runs once in Chromium desktop');
    await setServerState(request, { release: 'previous' });
    await page.goto('/');
    await waitForServiceWorker(page);
    await expect(page.getByRole('heading', { name: 'OLD COMPLETE RELEASE' })).toBeVisible();
    await setServerState(request, { release: 'current', ...failure });
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await page.waitForTimeout(900);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'OLD COMPLETE RELEASE' })).toBeVisible();
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { active: registration.active?.state, waiting: Boolean(registration.waiting) };
    });
    expect(state).toEqual({ active: 'activated', waiting: false });
  });
}
