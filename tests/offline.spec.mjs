import { expect, test } from '@playwright/test';
import { installCurrent, resetServerRequests, serverRequests, setServerState, waitForServiceWorker } from './offline-helpers.mjs';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }) => {
  await setServerState(request);
});

test('installs, verifies, and cold-launches every field-critical path with zero connectivity', async ({ page, context, request }, testInfo) => {
  test.skip(
    testInfo.project.name.includes('webkit'),
    'Playwright WebKit encounters an internal error on service-worker-controlled offline navigation; normal WebKit runtime coverage remains active'
  );
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installCurrent(page, request);

  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await page.getByRole('radio', { name: /Select Mount Lindsey/ }).check();
  await page.getByRole('button', { name: /Red/ }).click();
  const firstMilestone = page.locator('[data-milestone="0"]');
  await firstMilestone.check();
  await page.getByText('Optional private fields on this phone').click();
  await page.locator('[data-private-field="name"]').fill('x');

  await context.setOffline(true);
  await resetServerRequests(request);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mountain Guide Companion' })).toBeVisible();
  await page.close();
  const offlinePage = await context.newPage();
  offlinePage.on('pageerror', error => errors.push(error.message));
  offlinePage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await offlinePage.goto('/');
  await expect(offlinePage.getByRole('heading', { name: 'Mountain Guide Companion' })).toBeVisible();
  await expect(offlinePage.locator('html')).toHaveAttribute('data-display', 'red');
  await offlinePage.getByRole('button', { name: 'Open Companion' }).first().click();
  await expect(offlinePage.getByRole('radio', { name: /Select Mount Lindsey/ })).toBeChecked();
  await expect(offlinePage.locator('[data-milestone="0"]')).toBeChecked();
  await offlinePage.getByText('Optional private fields on this phone').click();
  await expect(offlinePage.locator('[data-private-field="name"]')).toHaveValue('x');

  await offlinePage.getByRole('button', { name: /Route/ }).last().click();
  await expect(offlinePage.locator('#route-view')).toBeVisible();
  await offlinePage.getByRole('button', { name: /Emergency/ }).last().click();
  await expect(offlinePage.getByRole('heading', { name: 'CALL 911 FIRST' })).toBeVisible();
  await expect(offlinePage.locator('a.phone-link')).toHaveCount(6);
  const pdfs = await offlinePage.evaluate(async () => Promise.all([
    'generated/field-guide.pdf', 'generated/pocket-card.pdf'
  ].map(async path => {
    const response = await fetch(path);
    return { path, ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
  })));
  expect(pdfs.every(pdf => pdf.ok && pdf.bytes > 0)).toBe(true);

  await offlinePage.getByRole('button', { name: 'Set up this phone' }).click();
  await offlinePage.getByRole('button', { name: 'Offline Check' }).click();
  await expect(offlinePage.getByText('OFFLINE RESOURCES VERIFIED', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);

  const observedRequests = await serverRequests(request);
  const fieldCriticalRequests = observedRequests.filter(({ path }) => path !== 'service-worker.js');
  expect(fieldCriticalRequests).toEqual([]);
  expect(observedRequests.every(({ method, path }) => method === 'GET' && path === 'service-worker.js')).toBe(true);
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
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.waitForTimeout(1200);
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
  await expect(page.getByRole('heading', { name: 'Mountain Guide Companion' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-display', 'red');
  await page.getByRole('button', { name: 'Set up this phone' }).click();
  await expect(page.getByText('OFFLINE RESOURCES VERIFIED', { exact: true })).toBeVisible();
  await expect(page.getByText(/Marked complete on this phone:/)).toBeVisible();
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await expect(page.getByRole('radio', { name: /Select Mount Lindsey/ })).toBeChecked();
  await expect(page.locator('[data-milestone="0"]')).toBeChecked();
  await page.getByText('Optional private fields on this phone').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('x');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).statusNote).toBe('z');
  const cachesAfter = await page.evaluate(() => caches.keys());
  expect(cachesAfter.filter(name => name.startsWith('ddmg-companion-release-')).length).toBeLessThanOrEqual(2);
});
