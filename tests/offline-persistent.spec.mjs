import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { resetServerRequests, serverRequests, setServerState, waitForServiceWorker } from './offline-helpers.mjs';

test('persisted Chromium profile cold-launches after a simulated browser close', async ({ request, baseURL }, testInfo) => {
  test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Persistent-profile simulation runs once in Chromium desktop');
  await setServerState(request);
  const profile = await mkdtemp(join(tmpdir(), 'mgc-offline-profile-'));
  try {
    const online = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 390, height: 844 } });
    const first = online.pages()[0] || await online.newPage();
    await first.goto(baseURL);
    await waitForServiceWorker(first);
    await first.getByRole('button', { name: /Red/ }).click();
    await first.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('mgc-companion-local-state'));
      state.statusNote = 'z';
      localStorage.setItem('mgc-companion-local-state', JSON.stringify(state));
    });
    await resetServerRequests(request);
    await online.close();

    const offline = await chromium.launchPersistentContext(profile, { headless: true, offline: true, viewport: { width: 390, height: 844 } });
    const second = offline.pages()[0] || await offline.newPage();
    await second.goto(baseURL);
    await expect(second.getByRole('heading', { name: 'Mountain Guide Companion' })).toBeVisible();
    await expect(second.locator('html')).toHaveAttribute('data-display', 'red');
    await second.getByRole('button', { name: 'Open Companion' }).first().click();
    const stored = await second.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')));
    expect(stored.statusNote).toBe('z');
    await second.getByRole('button', { name: /Emergency/ }).last().click();
    await expect(second.getByRole('heading', { name: 'CALL 911 FIRST' })).toBeVisible();
    await offline.close();
    expect(await serverRequests(request)).toEqual([]);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});
