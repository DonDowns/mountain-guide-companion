import { expect } from '@playwright/test';

export async function seedCompletedOnboarding(page) {
  await page.addInitScript(() => {
    const key = 'mgc-companion-local-state';
    let state = {};
    try { state = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { state = {}; }
    state.schemaVersion = 4;
    state.setup = state.setup && typeof state.setup === 'object' ? state.setup : {};
    state.setup.onboarding = { version: 'companion-onboarding-candidate-8-v1', status: 'completed', recordedAt: '2026-08-11T00:00:00.000Z' };
    localStorage.setItem(key, JSON.stringify(state));
  });
}

export async function setServerState(request, value = {}) {
  const response = await request.post('/__test__/state', { data: { release: 'current', failPath: '', corruptPath: '', failureStatus: 503, ...value } });
  expect(response.ok()).toBe(true);
}

export async function resetServerRequests(request) {
  expect((await request.post('/__test__/reset-requests')).ok()).toBe(true);
}

export async function serverRequests(request) {
  const response = await request.get('/__test__/requests');
  expect(response.ok()).toBe(true);
  return response.json();
}

export async function waitForServiceWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

export async function installCurrent(page, request) {
  await seedCompletedOnboarding(page);
  await setServerState(request);
  await page.goto('/');
  await waitForServiceWorker(page);
  await page.getByRole('button', { name: 'Set up this phone' }).click();
  await expect(page.getByText('Offline resources verified', { exact: true })).toBeVisible();
}

export async function activeCompanionCache(page) {
  return page.evaluate(async () => {
    for (const name of await caches.keys()) {
      if (!name.startsWith('ddmg-companion-release-')) continue;
      const cache = await caches.open(name);
      const marker = await cache.match(new URL('__ddmg_complete__.json', location.href));
      if (!marker) continue;
      const value = await marker.json();
      if (value.complete && value.bundle_id?.startsWith('ddmg-companion-')) return name;
    }
    return '';
  });
}

export async function corruptActiveCache(page, path, mode = 'delete') {
  return page.evaluate(async ({ path, mode }) => {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.startsWith('ddmg-companion-release-')) continue;
      const cache = await caches.open(name);
      const markerUrl = new URL('__ddmg_complete__.json', location.href);
      const markerResponse = await cache.match(markerUrl);
      if (!markerResponse) continue;
      const marker = await markerResponse.json();
      if (!marker.bundle_id?.startsWith('ddmg-companion-')) continue;
      if (mode === 'marker') {
        marker.bundle_id = 'unexpected-release-id';
        await cache.put(markerUrl, new Response(JSON.stringify(marker), { headers: { 'Content-Type': 'application/json' } }));
      } else {
        await cache.delete(new URL(path, location.href));
      }
      return name;
    }
    return '';
  }, { path, mode });
}
