import { expect, test } from '@playwright/test';
import { installCurrent, resetServerRequests, seedCompletedOnboarding, serverRequests, setServerState, waitForServiceWorker } from './offline-helpers.mjs';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page, request }) => {
  await seedCompletedOnboarding(page);
  await setServerState(request);
});

async function openCompanion(page) {
  await page.locator('[data-action="open-companion"]').first().click();
  await expect(page.locator('#timeline-view')).toBeVisible();
}

test('installs, verifies, and cold-launches every field-critical path with zero connectivity', async ({ page, context, request }, testInfo) => {
  test.skip(
    testInfo.project.name.includes('webkit'),
    'Playwright WebKit encounters an internal error on service-worker-controlled offline navigation; normal WebKit runtime coverage remains active'
  );
  const errors = [];
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { globalThis.__offlineCopiedMessage = value; } }
    });
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installCurrent(page, request);

  await openCompanion(page);
  await page.getByRole('button', { name: /Change objective/ }).click();
  await page.getByRole('radio', { name: /Choose Mount Lindsey/ }).check();
  await page.getByRole('button', { name: 'Use objective' }).click();
  await page.getByRole('button', { name: /Red Mode/ }).click();
  await page.getByRole('button', { name: /Mark Vehicle departure locally/ }).click();
  await page.getByText('Optional private fields on this phone').click();
  await page.locator('[data-private-field="name"]').fill('x');

  await context.setOffline(true);
  await resetServerRequests(request);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Prepare This Phone', level: 1 })).toBeVisible();
  await page.close();
  const offlinePage = await context.newPage();
  offlinePage.on('pageerror', error => errors.push(error.message));
  offlinePage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await offlinePage.goto('/');
  await expect(offlinePage.getByRole('heading', { name: 'Prepare This Phone', level: 1 })).toBeVisible();
  await expect(offlinePage.locator('html')).toHaveAttribute('data-display', 'red');
  await openCompanion(offlinePage);
  await expect(offlinePage.locator('#current-objective-context')).toContainText('Mount Lindsey');
  await expect(offlinePage.locator('article[data-milestone="0"]')).toContainText(/Marked locally at/);
  await offlinePage.getByRole('button', { name: 'Copy message for Lake Como camp' }).click();
  expect(await offlinePage.evaluate(() => globalThis.__offlineCopiedMessage)).toMatch(/^At Lake Como camp at /);
  await expect(offlinePage.locator('article[data-milestone="1"]')).toContainText('Not marked');
  await offlinePage.getByText('Optional private fields on this phone').click();
  await expect(offlinePage.locator('[data-private-field="name"]')).toHaveValue('x');

  await offlinePage.getByRole('button', { name: /Route/ }).last().click();
  await expect(offlinePage.locator('#route-view')).toBeVisible();
  await offlinePage.getByRole('button', { name: /Emergency/ }).last().click();
  await expect(offlinePage.getByRole('heading', { name: 'CALL 911 FIRST' })).toBeVisible();
  await expect(offlinePage.locator('a.phone-link')).toHaveCount(6);
  await offlinePage.getByRole('button', { name: 'Prepare this phone' }).click();
  await offlinePage.locator('.setup-panel').getByRole('button', { name: 'Offline Check' }).click();
  await expect(offlinePage.getByText('Offline resources verified', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);

  const observedRequests = await serverRequests(request);
  const fieldCriticalRequests = observedRequests.filter(({ path }) => path !== 'service-worker.js');
  expect(fieldCriticalRequests).toEqual([]);
  expect(observedRequests.every(({ method, path }) => method === 'GET' && path === 'service-worker.js')).toBe(true);
  await context.setOffline(false);
});

test('opens both bundled PDFs through real browser navigation while offline', async ({ page, context, request }, testInfo) => {
  test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Offline PDF navigation runs once in Chromium desktop');
  await installCurrent(page, request);
  await context.setOffline(true);
  for (const [name, path] of [
    ['Open Field Guide', '/generated/field-guide.pdf'],
    ['Open Pocket Card', '/generated/pocket-card.pdf']
  ]) {
    const artifactPage = await context.newPage();
    await artifactPage.goto('/');
    const responsePromise = artifactPage.waitForResponse(response =>
      new URL(response.url()).pathname === path && response.request().isNavigationRequest()
    );
    await artifactPage.getByRole('link', { name }).click();
    const response = await responsePromise;
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect(response.headers()['content-type']).not.toContain('text/html');
    expect(response.fromServiceWorker()).toBe(true);
    expect(new URL(response.url()).pathname).toBe(path);
    await artifactPage.close();
  }
  await context.setOffline(false);
});

test('keeps the previous complete release active when a new required JavaScript resource fails', async ({ page, context, request }, testInfo) => {
  test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Detailed update transaction runs once in Chromium desktop');
  await setServerState(request, { release: 'previous' });
  await page.goto('/');
  await waitForServiceWorker(page);
  await expect(page.getByRole('heading', { name: 'OLD COMPLETE RELEASE' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('mgc-companion-local-state', JSON.stringify({
    schemaVersion: 2,
    selectedObjectiveId: 'objective-mount-lindsey',
    actualStarts: {},
    elapsedBasis: {},
    checkedMilestones: { 0: true },
    redDisplay: true,
    statusNote: 'z',
    privateContact: { name: 'x', phone: '', alternate: '', note: '' },
    setup: {
      companionOpened: true,
      offlineVerifiedAt: '',
      offlineVerifiedBundleId: '',
      airplaneModeTestCompletedAt: '2026-08-07T10:00:00.000Z',
      legacyStructuralCheckCompletedAt: ''
    }
  })));

  await setServerState(request, { release: 'current', failPath: 'js/companion-ui.js' });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    try { await registration?.update(); } catch {}
  });
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return !registration?.installing && !registration?.waiting;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'OLD COMPLETE RELEASE' })).toBeVisible();

  await context.setOffline(false);
  await setServerState(request);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const deadline = Date.now() + 20000;
    while (!registration?.waiting && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!registration?.waiting) throw new Error('Verified update never reached waiting state');
    const previousController = navigator.serviceWorker.controller;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Verified update did not become controller')), 20000);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      registration.waiting.postMessage({ type: 'ACTIVATE_VERIFIED_UPDATE' });
      if (navigator.serviceWorker.controller !== previousController) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Prepare This Phone', level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-display', 'red');
  await page.getByRole('button', { name: 'Prepare this phone' }).click();
  await expect(page.getByText('Offline resources verified', { exact: true })).toBeVisible();
  await expect(page.getByText(/Recorded on this phone:/)).toBeVisible();
  await openCompanion(page);
  await expect(page.locator('#current-objective-context')).toContainText('Mount Lindsey');
  await expect(page.locator('article[data-milestone="0"]')).toContainText(/Marked locally/);
  await page.getByText('Optional private fields on this phone').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('x');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).statusNote).toBe('z');
  const cachesAfter = await page.evaluate(() => caches.keys());
  expect(cachesAfter.filter(name => name.startsWith('ddmg-companion-release-')).length).toBeLessThanOrEqual(2);
});

test('reloads two previous-release tabs coherently when the verified update activates', async ({ page, context, request }, testInfo) => {
  test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Multi-tab update transaction runs once in Chromium desktop');
  await context.addInitScript(() => {
    sessionStorage.setItem('__companion_load_count__', String(Number(sessionStorage.getItem('__companion_load_count__') || 0) + 1));
  });
  await setServerState(request, { release: 'previous' });
  await page.goto('/');
  await waitForServiceWorker(page);
  const second = await context.newPage();
  await second.goto('/');
  await waitForServiceWorker(second);
  await expect(page.getByRole('heading', { name: 'OLD COMPLETE RELEASE' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'OLD COMPLETE RELEASE' })).toBeVisible();

  await setServerState(request, { release: 'current' });
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
  await expect(page.getByRole('button', { name: 'Restart to use update' })).toBeVisible();
  await page.getByRole('button', { name: 'Restart to use update' }).click();

  for (const candidatePage of [page, second]) {
    await expect(candidatePage.getByRole('heading', { name: 'Prepare This Phone', level: 1 })).toBeVisible();
    await expect(candidatePage.getByText(/Companion 0\.6\.0-candidate\.10/)).toBeVisible();
    expect(await candidatePage.evaluate(() => Number(sessionStorage.getItem('__companion_load_count__')))).toBeGreaterThanOrEqual(2);
  }
  const complete = await page.evaluate(async () => {
    const records = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith('ddmg-companion-release-')) continue;
      const response = await (await caches.open(name)).match(new URL('__ddmg_complete__.json', location.href));
      if (!response) continue;
      const marker = await response.json();
      if (marker.complete === true) records.push(marker.bundle_id);
    }
    return records.sort();
  });
  expect(complete).toEqual([
    expect.stringMatching(/^ddmg-companion-0-6-0-candidate-10-data-3cda95d4e6b1-b1$/),
    'ddmg-companion-0-6-0-candidate-4-data-3cda95d4e6b1-b1'
  ]);
});

test('Offline Check rejects an active registration when this page has no controlling worker', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Controller requirement runs once in Chromium desktop');
  await page.goto('/');
  await waitForServiceWorker(page);
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => null });
    return { active: Boolean(registration?.active), controlled: Boolean(navigator.serviceWorker.controller) };
  });
  expect(state).toEqual({ active: true, controlled: false });
  await page.locator('.setup-panel').getByRole('button', { name: 'Offline Check' }).click();
  await expect(page.getByText('OFFLINE RESOURCES INCOMPLETE', { exact: true })).toBeVisible();
  await expect(page.getByText(/not controlling this page/i)).toBeVisible();
});
