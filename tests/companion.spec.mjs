import { expect, test as base } from '@playwright/test';
import { companionData, releaseMetadata } from '../js/companion-data.js';

const test = base.extend({
  consoleGate: [async ({ page, baseURL }, use) => {
    const errors = [];
    const allowedOrigin = new URL(baseURL).origin;
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && url.origin !== allowedOrigin) errors.push(`external request: ${url.origin}`);
    });
    await use();
    expect(errors).toEqual([]);
  }, { auto: true }]
});

test('loads canonical identity and friend first-open setup', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mountain Guide Companion', level: 1 })).toBeVisible();
  await expect(page.getByText('CANDIDATE', { exact: true })).toBeVisible();
  await expect(page.getByText(/PHYSICAL PHONE TESTING REQUIRED/)).toBeVisible();
  expect(releaseMetadata.release_status).toBe('candidate');
  await expect(page.locator('#trip-name')).toHaveText(companionData.trip.name);
  await expect(page.getByText('INSTALL FOR OFFLINE USE', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install for Offline Use', exact: true })).toBeVisible();
  expect(companionData.identity.manifestSha256).toBe(releaseMetadata.manifest_sha256);
  if (testInfo.project.name === 'webkit-mobile') {
    await expect(page.getByText('Open in Safari.')).toBeVisible();
    await expect(page.getByText('Add to Home Screen.')).toBeVisible();
  }
});

test('navigates Timeline, Route, and one-action Emergency', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await expect(page.locator('#timeline-view')).toBeVisible();
  await expect(page.getByText(companionData.invariants.weather, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Route/ }).last().click();
  await expect(page.locator('#route-view')).toBeVisible();
  for (const route of companionData.routes) await expect(page.getByRole('heading', { name: route.name })).toBeVisible();

  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await expect(page.locator('#emergency-view')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CALL 911 FIRST' })).toBeVisible();
  const headerBottom = await page.locator('.app-header').evaluate(node => node.getBoundingClientRect().bottom);
  const emergencyTop = await page.getByRole('heading', { name: 'CALL 911 FIRST' }).evaluate(node => node.getBoundingClientRect().top);
  expect(emergencyTop).toBeGreaterThanOrEqual(headerBottom);
  const phoneLinks = page.locator('a.phone-link');
  await expect(phoneLinks).toHaveCount(6);
  const expected = companionData.contacts.flatMap(contact => contact.phones.map(phone => phone.tel));
  expect(await phoneLinks.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).toEqual(expected);
  for (const contact of companionData.contacts) {
    const county = contact.agency.replace(/ County Sheriff’s Office$/, '');
    for (const phone of contact.phones) {
      const action = phone.kind === 'dispatch' ? 'Dispatch' : 'Sheriff Office';
      await expect(page.getByRole('link', { name: `Call ${county} ${action}, ${phone.display}`, exact: true })).toBeVisible();
    }
  }
  await expect(page.locator('#emergency-view')).not.toContainText(/called|call completed|contacted/i);
});

test('uses field-facing copy without implementation disclaimers or false confirmations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(/phone intent|browser intent|does not prove|drafted\/copied|service worker|cache|sha-256|fingerprint/i);
  expect(visibleText).not.toMatch(/message sent|delivered|call completed|rescue requested|recipient notified|help is on the way/i);
});

test('persists Red Display and objective selection without safety meaning', async ({ page }) => {
  await page.goto('/');
  const red = page.getByRole('button', { name: /Red/ });
  await red.click();
  await expect(red).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-display', 'red');
  await page.reload();
  await expect(page.getByRole('button', { name: /Red/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  const target = companionData.objectives[2];
  await page.getByRole('radio', { name: `Select ${target.name}` }).check();
  await page.reload();
  await expect(page.getByRole('radio', { name: `Select ${target.name}` })).toBeChecked();
  await expect(page.locator('body')).not.toContainText(/danger status|safety status/i);
});

test('keeps actual start separate from canonical planned start and persists elapsed basis', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  const objective = companionData.objectives[1];
  await page.getByRole('radio', { name: `Select ${objective.name}` }).check();
  await expect(page.getByText('4:15 AM', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start Objective' }).click();
  await expect(page.getByText('Not started on this device')).toHaveCount(0);
  await expect(page.getByText('4:15 AM', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('4:15 AM', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Elapsed /)).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')));
  expect(stored.actualStarts[objective.id]).toBeTruthy();
  expect(stored.elapsedBasis[objective.id].startedAt).toBe(stored.actualStarts[objective.id]);
});

test('persists milestones as local marks only', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  const milestone = companionData.communication.milestones[0];
  const checkbox = page.getByRole('checkbox', { name: `Mark ${milestone} locally` });
  await checkbox.check();
  await expect(page.getByText('Marked locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: `Mark ${milestone} locally` })).toBeChecked();
  await expect(page.locator('#milestone-list')).not.toContainText(/sent|delivered|confirmed/i);
});

test('keeps private fields device-local, shares only the public URL, and clears private data', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async payload => { globalThis.__sharedPayload = payload; };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await page.getByText('Optional private fields on this phone').click();
  await page.locator('[data-private-field="name"]').fill('x');
  await page.locator('[data-private-field="alternate"]').fill('y');
  await page.locator('[data-private-field="note"]').fill('z');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const payload = await page.evaluate(() => globalThis.__sharedPayload);
  expect(payload.url).toBe(releaseMetadata.pwa_url);
  expect(Object.keys(payload).sort()).toEqual(['text', 'title', 'url']);
  expect(page.url()).not.toContain('?');
  await page.reload();
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await page.getByText('Optional private fields on this phone').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('x');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear Private Data' }).click();
  await page.getByText('Optional private fields on this phone').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('');
  await expect(page.locator('[data-private-field="note"]')).toHaveValue('');
});

test('falls back from unavailable native sharing to clipboard using only the public URL', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { globalThis.__copiedPublicValue = value; } }
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  expect(await page.evaluate(() => globalThis.__copiedPublicValue)).toBe(releaseMetadata.pwa_url);
});

test('documents a manual public-link fallback when share and clipboard are unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    document.execCommand = () => false;
    globalThis.prompt = (message, value) => { globalThis.__manualCopy = { message, value }; };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const fallback = await page.evaluate(() => globalThis.__manualCopy);
  expect(fallback).toEqual({ message: 'Copy this public Companion link:', value: releaseMetadata.pwa_url });
});

test('opens both PDFs through real online browser navigation with PDF responses', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Online PDF navigation runs once in Chromium desktop');
  await page.goto('/');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
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
    expect(new URL(response.url()).pathname).toBe(path);
    await artifactPage.close();
  }
});

test('shows factual installed state and verifies the complete offline bundle', async ({ page }) => {
  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.goto('/');
  await expect(page.getByText('INSTALLED COMPANION', { exact: true })).toBeVisible();
  await expect(page.getByText('INSTALL FOR OFFLINE USE', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Offline Check' }).click();
  await expect(page.getByText('OFFLINE RESOURCES VERIFIED', { exact: true })).toBeVisible();
  await expect(page.getByText('This confirms Companion resources on this phone. It does not evaluate weather, access, terrain, or route conditions.', { exact: true })).toBeVisible();
  await expect(page.getByText('Still required on this phone.', { exact: true })).toBeVisible();
  await expect(page.locator('#install-panel')).not.toContainText(/all clear|good to go|ready to climb/i);
});

test('migrates Phase 4 local state to schema version 2 without losing operational or private values', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mgc-companion-local-state', JSON.stringify({
      schemaVersion: 1,
      selectedObjectiveId: 'objective-mount-lindsey',
      actualStarts: { 'objective-mount-lindsey': '2026-08-07T10:00:00.000Z' },
      elapsedBasis: { 'objective-mount-lindsey': { startedAt: '2026-08-07T10:00:00.000Z', deviceTimeZoneOffsetMinutes: 360 } },
      checkedMilestones: { 0: true },
      redDisplay: true,
      statusNote: 'z',
      privateContact: { name: 'x', phone: '', alternate: 'y', note: '' },
      setup: { companionOpened: true, structuralCheckCompletedAt: '2026-08-07T10:05:00.000Z' }
    }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await expect(page.getByRole('radio', { name: /Select Mount Lindsey/ })).toBeChecked();
  await expect(page.locator('[data-milestone="0"]')).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-display', 'red');
  await page.getByText('Optional private fields on this phone').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('x');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')));
  expect(stored.schemaVersion).toBe(2);
  expect(stored.statusNote).toBe('z');
  expect(stored.setup.legacyStructuralCheckCompletedAt).toBe('2026-08-07T10:05:00.000Z');
  expect(stored.setup.offlineVerifiedAt).toBe('');
});

test('records the physical Airplane Mode test only after explicit confirmation', async ({ page }) => {
  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.goto('/');
  await page.getByText('Airplane Mode test instructions').click();
  await expect(page.getByRole('heading', { name: 'AIRPLANE MODE TEST' })).toBeVisible();
  await expect(page.locator('.airplane-test li')).toHaveCount(11);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Record Airplane Mode Test' }).click();
  await expect(page.getByText(/Marked complete on this phone:/)).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')));
  expect(stored.setup.airplaneModeTestCompletedAt).toBeTruthy();
});

test('exposes an install action only after a supported browser prompt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Install Companion' })).toHaveCount(0);
  await page.evaluate(() => {
    const prompt = new Event('beforeinstallprompt', { cancelable: true });
    prompt.prompt = async () => { globalThis.__installPrompted = true; };
    prompt.userChoice = Promise.resolve({ outcome: 'accepted' });
    dispatchEvent(prompt);
  });
  await expect(page.getByRole('button', { name: 'Install Companion' })).toBeVisible();
  await page.getByRole('button', { name: 'Install Companion' }).click();
  expect(await page.evaluate(() => globalThis.__installPrompted)).toBe(true);
});

test('withholds Lily Lake location and prevents horizontal overflow with usable targets', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await page.getByRole('button', { name: /Route/ }).last().click();
  await expect(page.locator('#lily-status')).toContainText('Exact coordinate/elevation is pending verification and is not shown.');
  await expect(page.locator('body')).not.toContainText(/37\.62361|-105\.47278|37\.623486|-105\.472903/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const undersized = await page.locator('button:visible, a.phone-link:visible, a.call-911:visible, summary:visible').evaluateAll(nodes =>
    nodes.map(node => ({ label: node.textContent.trim(), box: node.getBoundingClientRect().toJSON() }))
      .filter(item => item.box.width < 44 || item.box.height < 44)
  );
  expect(undersized).toEqual([]);
});

test('provides semantic landmarks, visible focus, and named global controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Companion sections' })).toBeVisible();
  const red = page.getByRole('button', { name: /Red/ });
  await expect(red).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('OFFLINE RESOURCES VERIFIED', { exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    outline: getComputedStyle(document.activeElement).outlineStyle
  }));
  expect(focused.tag).not.toBe('BODY');
  expect(focused.outline).not.toBe('none');
});
