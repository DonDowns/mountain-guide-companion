import { expect, test } from '@playwright/test';
import {
  buildFeatureRequest, buildProblemReport, COMPANION_ONBOARDING_VERSION, deriveCompanionStatus,
  searchCompanionHelp, sharedInformationState
} from '../js/companion-help.js';

function completedState() {
  return {
    schemaVersion: 4,
    setup: { onboarding: { version: COMPANION_ONBOARDING_VERSION, status: 'completed', recordedAt: '2026-08-11T00:00:00.000Z' } }
  };
}

async function seedCompletedOnboarding(page) {
  await page.addInitScript(state => localStorage.setItem('mgc-companion-local-state', JSON.stringify(state)), completedState());
}

test('Help search handles morphology, aliases, case, partial terms, empty and no-result queries', () => {
  const cases = [
    ['emergencies', 'emergency'], ['INSTALLATION', 'install'], ['refreshing', 'refresh'],
    ['turnarounds', 'weather'], ['no signal', 'offline'], ['diag', 'support'], ['airpl', 'offline']
  ];
  for (const [query, id] of cases) expect(searchCompanionHelp(query).map(topic => topic.id), query).toContain(id);
  expect(searchCompanionHelp('')).toHaveLength(15);
  expect(searchCompanionHelp('unfindable-zebra-term')).toEqual([]);
});

test('status model keeps setup, packaged data, and update truth separate without invented expiry', () => {
  const now = new Date('2026-08-11T12:00:00Z');
  const recent = sharedInformationState({ verifiedAt: '2026-08-10T12:00:00Z', now });
  const old = sharedInformationState({ verifiedAt: '2026-07-01T12:00:00Z', now });
  expect(recent).toMatchObject({ status: 'current-package', ageDays: 1 });
  expect(recent.label).toBe('Packaged trip data · verified Aug 10, 2026 · 1 day old by this phone’s clock. Recheck changing facts when connectivity is available.');
  expect(old).toMatchObject({ status: 'current-package', ageDays: 41 });
  expect(old.label).toBe('Packaged trip data · verified Jul 1, 2026 · 41 days old by this phone’s clock. Recheck changing facts when connectivity is available.');
  expect(deriveCompanionStatus({ standalone: true, offlineResult: { complete: true }, workerState: { controlled: true } })).toMatchObject({
    setup: 'complete', sharedData: 'current-package', update: 'current'
  });
  expect(deriveCompanionStatus({ standalone: false, offlineResult: { complete: true }, workerState: { controlled: true, updateAvailable: true } })).toMatchObject({
    setup: 'incomplete', sharedData: 'stale-package', update: 'available'
  });
  expect(sharedInformationState({ verifiedAt: '2020-01-01T00:00:00Z', now })).toMatchObject({ status: 'current-package' });
  const newer = sharedInformationState({ verifiedAt: '2026-08-07T00:00:00Z', now, updateAvailable: true });
  expect(newer).toMatchObject({ status: 'stale-package', ageDays: 4 });
  expect(newer.label).toContain('Newer verified package downloaded');
  expect(sharedInformationState({ verifiedAt: '', now })).toEqual({
    status: 'missing',
    label: 'Packaged trip data · verification date unavailable; age cannot be calculated. Recheck changing facts when connectivity is available.'
  });
  expect(sharedInformationState({ verifiedAt: 'not-a-timestamp', now }).label).toContain('verification date unavailable');
  const future = sharedInformationState({ verifiedAt: '2026-08-12T12:00:00Z', now });
  expect(future).toMatchObject({ status: 'current-package' });
  expect(future).not.toHaveProperty('ageDays');
  expect(future.label).toBe('Packaged trip data · verified Aug 12, 2026 · verification time is ahead of this phone’s clock. Check this phone’s date and time. Recheck changing facts when connectivity is available.');
  expect(future.label).not.toMatch(/-\d+ days? old/);
  expect(deriveCompanionStatus({ standalone: false, offlineResult: {}, workerState: { controlled: false } }).setup).toBe('not-started');
  expect(deriveCompanionStatus({ standalone: false, offlineResult: { checking: true }, workerState: { controlled: false } }).setup).toBe('in-progress');
  expect(deriveCompanionStatus({ standalone: true, offlineResult: { attempted: true, error: 'failed' }, workerState: { controlled: true, updateStatus: 'failed' } })).toMatchObject({ setup: 'incomplete', update: 'failed' });
  expect(deriveCompanionStatus({ standalone: true, offlineResult: { complete: true }, workerState: { controlled: false, updateStatus: 'downloading' } })).toMatchObject({ setup: 'incomplete', update: 'downloading' });
});

test('an earlier tutorial version reappears once and migrates only the onboarding record', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__candidate8EarlierTutorialSeeded')) return;
    sessionStorage.setItem('__candidate8EarlierTutorialSeeded', '1');
    localStorage.setItem('mgc-companion-local-state', JSON.stringify({
      schemaVersion: 4,
      statusNote: 'preserve me',
      setup: { onboarding: { version: 'earlier-tutorial', status: 'completed', recordedAt: '2026-08-01T00:00:00.000Z' } }
    }));
  });
  await page.goto('/');
  await expect(page.locator('#companion-onboarding')).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')));
  expect(stored.statusNote).toBe('preserve me');
  expect(stored.setup.onboarding).toMatchObject({ version: COMPANION_ONBOARDING_VERSION, status: 'dismissed' });
  await page.reload();
  await expect(page.locator('#companion-onboarding')).toBeHidden();
});

test('completed installed setup becomes quiet while update status remains separately labeled', async ({ page }) => {
  await seedCompletedOnboarding(page);
  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.goto('/');
  await expect(page.locator('.header-setup')).toBeHidden();
  await expect(page.locator('#install-panel')).toBeHidden();
  await expect(page.locator('#home-offline-status')).toHaveText('Offline copy verified');
  await expect(page.locator('#home-shared-status')).toContainText('verified Aug 7, 2026');
  await expect(page.locator('#home-shared-status')).toContainText(/\d+ days? old by this phone’s clock/);
  await expect(page.locator('#home-shared-status')).toContainText('Recheck changing facts when connectivity is available.');
  await expect(page.locator('#home-update-status')).not.toContainText(/set.?up/i);
  await page.getByRole('button', { name: /Help/ }).click();
  await expect(page.getByRole('button', { name: 'Repair Offline Copy' })).toBeVisible();
});

test('copy-only report builders keep problem and feature payloads distinct', () => {
  const problem = buildProblemReport({ section: 'Help', description: '<img onerror=alert(1)>', steps: 'Open Help.' }, 'Connection: Offline');
  const feature = buildFeatureRequest({ problem: 'Need recovery', who: 'Trip partner', when: 'Before the trip', frequency: 'Once per trip', behavior: 'Show steps' });
  expect(problem).toContain('COMPANION PROBLEM REPORT');
  expect(problem).toContain('<img onerror=alert(1)>');
  expect(problem).not.toContain('FEATURE REQUEST');
  expect(feature).toContain('COMPANION FEATURE REQUEST');
  expect(feature).not.toContain('Connection: Offline');
});

test('first use is dismissible, persistent, replayable, focus-contained, and focus-restoring', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator('#companion-onboarding');
  await expect(overlay).toBeVisible();
  await expect(page.locator('#companion-onboarding-kicker')).toHaveText('Step 1 of 4');
  await expect(page.locator('.app-header')).toHaveJSProperty('inert', true);
  await expect(page.locator('#companion-onboarding-next')).toBeFocused();

  const close = page.getByRole('button', { name: 'Dismiss tutorial' });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#companion-onboarding-next')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(overlay).toBeHidden();
  await expect(page.locator('.app-header')).toHaveJSProperty('inert', false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')).setup.onboarding)).toMatchObject({
    version: COMPANION_ONBOARDING_VERSION, status: 'completed'
  });

  await page.reload();
  await expect(overlay).toBeHidden();
  await page.getByRole('button', { name: /Help/ }).click();
  const replay = page.getByRole('button', { name: 'Replay Tutorial' });
  await replay.click();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  await expect(replay).toBeFocused();
});

test('search UI shows the correct topic, empty list, and no-result guidance', async ({ page }) => {
  await seedCompletedOnboarding(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Help/ }).click();
  const search = page.locator('#companion-help-search');
  await search.fill('emergencies');
  await expect(page.locator('.help-topic').filter({ has: page.getByText('Use emergency information', { exact: true }) })).toHaveCount(1);
  await expect(page.locator('#companion-help-status')).toContainText(/help topic/);
  await search.fill('UNFINDABLE ZEBRA');
  await expect(page.locator('.help-topic')).toHaveCount(0);
  await expect(page.locator('#companion-help-status')).toContainText('No topics found');
  await search.fill('');
  await expect(page.locator('.help-topic')).toHaveCount(15);
});

test('feedback preview renders hostile text safely and diagnostics omit private trip fields', async ({ page }) => {
  await seedCompletedOnboarding(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { globalThis.__copiedSupport = value; } } });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('mgc-companion-local-state'));
    state.statusNote = 'PRIVATE STATUS SENTINEL';
    state.privateContact = { name: 'PRIVATE NAME SENTINEL', phone: 'PRIVATE PHONE SENTINEL', alternate: 'PRIVATE ALT SENTINEL', note: 'PRIVATE NOTE SENTINEL' };
    state.actualStarts = { objective: 'PRIVATE START SENTINEL' };
    state.milestoneMarks = { milestone: 'PRIVATE MILESTONE SENTINEL' };
    state.setup.offlineVerifiedBundleId = 'HIDDEN BUNDLE SENTINEL';
    localStorage.setItem('mgc-companion-local-state', JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: /Help/ }).click();
  const hostile = '<img src=x onerror="globalThis.__unsafe=true">';
  await page.locator('#problem-description').fill(hostile);
  await page.locator('#problem-steps').fill('Open Help.');
  await page.getByRole('button', { name: 'Copy Problem Report' }).click();
  await expect(page.locator('#problem-report-preview')).toContainText(hostile);
  expect(await page.locator('#problem-report-preview img').count()).toBe(0);
  expect(await page.evaluate(() => globalThis.__unsafe || false)).toBe(false);
  const copied = await page.evaluate(() => globalThis.__copiedSupport);
  expect(copied).toContain('COMPANION PROBLEM REPORT');
  expect(copied).toContain('verified Aug 7, 2026');
  expect(copied).toMatch(/\d+ days? old by this phone’s clock/);
  expect(copied).toContain('Recheck changing facts when connectivity is available.');
  expect(copied).not.toContain('current-package');
  expect(copied).not.toMatch(/PRIVATE .* SENTINEL|HIDDEN BUNDLE SENTINEL/);
  expect(copied).not.toMatch(/mgc-companion-local-state|storage dump|manifest_sha256|source_commit|offlineVerifiedBundleId|private contact|status note|actual start|milestone mark|CALL 911 FIRST/i);
});

test('future and invalid verification metadata degrade safely in Home and diagnostics', async ({ page }) => {
  await seedCompletedOnboarding(page);
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const { buildCompanionDiagnostics, renderCompanionSupportStatus } = await import('/js/companion-help.js');
    const base = { standalone: false, offlineResult: {}, workerState: { controlled: false }, now: new Date('2026-08-11T12:00:00Z') };
    renderCompanionSupportStatus({ ...base, verifiedAt: '2026-08-12T12:00:00Z' });
    const futureHome = document.querySelector('#home-shared-status').textContent;
    const futureDiagnostic = buildCompanionDiagnostics({ ...base, verifiedAt: '2026-08-12T12:00:00Z' });
    renderCompanionSupportStatus({ ...base, verifiedAt: 'invalid' });
    return {
      futureHome,
      futureDiagnostic,
      invalidHome: document.querySelector('#home-shared-status').textContent,
      invalidDiagnostic: buildCompanionDiagnostics({ ...base, verifiedAt: 'invalid' })
    };
  });
  expect(results.futureHome).toContain('verification time is ahead of this phone’s clock');
  expect(results.futureHome).not.toMatch(/-\d+ days? old/);
  expect(results.futureDiagnostic).toContain('Check this phone’s date and time.');
  expect(results.invalidHome).toContain('verification date unavailable; age cannot be calculated');
  expect(results.invalidDiagnostic).toContain('Recheck changing facts when connectivity is available.');
  await page.getByRole('button', { name: /Help/ }).click();
  await expect(page.getByRole('heading', { name: 'Help & Diagnostics' })).toBeVisible();
});

test('copy failure leaves a selectable offline preview and manual-copy prompt', async ({ page }) => {
  await seedCompletedOnboarding(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('unavailable'); } } });
    document.execCommand = () => false;
    globalThis.prompt = (message, value) => { globalThis.__manualSupport = { message, value }; };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Help/ }).click();
  await page.locator('#feature-problem').fill('Need an offline recovery cue.');
  await page.getByRole('button', { name: 'Copy Feature Request' }).click();
  await expect(page.locator('#feature-request-preview')).toBeVisible();
  await expect(page.locator('#feature-request-status')).toContainText('Select and copy');
  expect(await page.evaluate(() => globalThis.__manualSupport.value)).toContain('COMPANION FEATURE REQUEST');
});

test('Help and onboarding fit a smaller supported iPhone viewport', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile-only viewport check');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.locator('#companion-onboarding')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const boxes = await page.locator('.onboarding-sheet button:visible').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(boxes.every(box => box.width >= 44 && box.height >= 44)).toBe(true);
});

test('verification disclosure and Help remain available after successful offline preparation', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'single real offline proof');
  await seedCompletedOnboarding(page);
  await page.addInitScript(() => {
    globalThis.__COMPANION_TEST_STANDALONE__ = true;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { globalThis.__copiedOfflineSupport = value; } } });
  });
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.getByRole('button', { name: 'Offline Check' }).click();
  await expect(page.locator('#home-offline-status')).toHaveText('Offline copy verified');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#home-shared-status')).toContainText('verified Aug 7, 2026');
  await expect(page.locator('#home-shared-status')).toContainText(/\d+ days? old by this phone’s clock/);
  await expect(page.locator('#home-shared-status')).toContainText('Recheck changing facts when connectivity is available.');
  await page.getByRole('button', { name: /Help/ }).click();
  await page.locator('#companion-help-search').fill('no signal');
  await expect(page.getByText('Prepare for no signal', { exact: true })).toBeVisible();
  await page.locator('#problem-description').fill('Offline disclosure check.');
  await page.getByRole('button', { name: 'Copy Problem Report' }).click();
  const copied = await page.evaluate(() => globalThis.__copiedOfflineSupport);
  expect(copied).toContain('verified Aug 7, 2026');
  expect(copied).toMatch(/\d+ days? old by this phone’s clock/);
  expect(copied).toContain('Recheck changing facts when connectivity is available.');
});
