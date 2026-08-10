import { expect, test as base } from '@playwright/test';
import { companionData, releaseMetadata } from '../js/companion-data.js';
import { createMilestoneMessage } from '../js/companion-ui.js';

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

async function openCompanion(page) {
  await page.waitForFunction(() => !('serviceWorker' in navigator) || Boolean(navigator.serviceWorker.controller));
  await page.locator('[data-action="open-companion"]').first().click();
  await expect(page.locator('#timeline-view')).toBeVisible();
}

async function chooseObjective(page, objective) {
  await page.getByRole('button', { name: /Change objective/ }).click();
  await page.getByRole('radio', { name: `Choose ${objective.name}` }).check();
  await page.getByRole('button', { name: 'Use objective' }).click();
}

test('loads canonical identity and friend first-open setup', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('MOUNTAIN GUIDE COMPANION', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Set Up This Phone', level: 1 })).toBeVisible();
  await expect(page.getByText('Test version · 0.6.0-candidate.6', { exact: true })).toBeVisible();
  await expect(page.getByText(/PHYSICAL PHONE TESTING REQUIRED/)).toBeVisible();
  expect(releaseMetadata.release_status).toBe('candidate');
  await expect(page.locator('#trip-name')).toHaveText(companionData.trip.name);
  await expect(page.getByText('RECOMMENDED FOR TRIP PARTNERS', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install for Offline Use', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue in Browser', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share Companion', exact: true }).first()).toBeVisible();
  await expect(page.locator('#welcome-summary')).toContainText(/Recommended for trip partners.*when there is no service/i);
  expect(companionData.identity.manifestSha256).toBe(releaseMetadata.manifest_sha256);
  if (testInfo.project.name === 'webkit-mobile') {
    await expect(page.getByText('Open in Safari.')).toBeVisible();
    await expect(page.getByText('Add to Home Screen.')).toBeVisible();
  }
});

test('navigates Timeline, Route, and one-action Emergency', async ({ page }) => {
  await page.goto('/');
  await openCompanion(page);
  await expect(page.locator('#timeline-view')).toBeVisible();
  await expect(page.locator('#current-objective-context')).toContainText(companionData.objectives[0].name);
  await expect(page.getByText(companionData.invariants.weather, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Route/ }).last().click();
  await expect(page.locator('#route-view')).toBeVisible();
  await expect(page.locator('#current-objective-context')).toContainText(companionData.objectives[0].name);
  for (const route of companionData.routes) await expect(page.getByRole('heading', { name: route.name })).toBeVisible();

  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await expect(page.locator('#emergency-view')).toBeVisible();
  await expect(page.locator('#current-objective-context')).toContainText(companionData.objectives[0].name);
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
  await openCompanion(page);
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

  await openCompanion(page);
  const target = companionData.objectives[2];
  await chooseObjective(page, target);
  await page.reload();
  await openCompanion(page);
  await expect(page.locator('#current-objective-context')).toContainText(target.name);
  await expect(page.locator('body')).not.toContainText(/danger status|safety status/i);
});

test('keeps actual start separate from canonical planned start and persists elapsed basis', async ({ page }) => {
  await page.goto('/');
  await openCompanion(page);
  const objective = companionData.objectives[1];
  await chooseObjective(page, objective);
  await expect(page.getByText('4:15 AM', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start Objective' }).click();
  await expect(page.getByRole('button', { name: 'Record current time' })).toBeVisible();
  await page.getByRole('button', { name: 'Record current time' }).click();
  await expect(page.getByText('Not started on this device')).toHaveCount(0);
  await expect(page.getByText('4:15 AM', { exact: true })).toBeVisible();
  await page.reload();
  await openCompanion(page);
  await expect(page.getByText('4:15 AM', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Elapsed /)).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')));
  expect(stored.actualStarts[objective.id]).toBeTruthy();
  expect(stored.elapsedBasis[objective.id].startedAt).toBe(stored.actualStarts[objective.id]);
});

test('makes Companion Home returnable and Start Objective cancellable without state loss', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-main')).toBeHidden();
  await openCompanion(page);
  const objective = companionData.objectives[0];
  await page.getByRole('button', { name: 'Start Objective' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[objective.id]).toBeUndefined();

  await page.getByRole('button', { name: 'Start Objective' }).click();
  await page.getByRole('button', { name: 'Record current time' }).click();
  const recorded = (await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[objective.id];
  await page.getByRole('button', { name: /Red/ }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set Up This Phone', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume Trip Companion' }).first()).toBeVisible();
  await expect(page.locator('#app-main')).toBeHidden();

  await openCompanion(page);
  await expect(page.getByRole('button', { name: 'Resume Objective' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-display', 'red');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[objective.id]).toBe(recorded);
});

test('protects existing actual starts with edit Cancel and replace/reset confirmation', async ({ page }) => {
  await page.goto('/');
  await openCompanion(page);
  await page.getByRole('button', { name: 'Start Objective' }).click();
  await page.getByRole('button', { name: 'Record current time' }).click();
  const objectiveId = companionData.objectives[0].id;
  const original = (await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[objectiveId];

  await page.getByRole('button', { name: 'Edit actual start' }).click();
  await page.locator('#actual-start-input').fill('2026-08-07T10:04');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[objectiveId]).toBe(original);

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Replace with current time' }).click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[objectiveId]).toBe(original);

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Reset actual start' }).click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[objectiveId]).toBe(original);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Reset actual start' }).click();
  await expect(page.getByRole('button', { name: 'Start Objective' })).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[objectiveId]).toBeUndefined();
});

test('switches objectives deliberately and preserves each objective actual start', async ({ page }) => {
  await page.goto('/');
  await openCompanion(page);
  const first = companionData.objectives[0];
  const second = companionData.objectives[1];
  await page.getByRole('button', { name: 'Start Objective' }).click();
  await page.getByRole('button', { name: 'Record current time' }).click();
  const firstStart = (await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[first.id];

  await page.getByRole('button', { name: /Change objective/ }).click();
  await page.getByRole('radio', { name: `Choose ${second.name}` }).check();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#current-objective-context')).toContainText(first.name);

  await chooseObjective(page, second);
  await expect(page.locator('#current-objective-context')).toContainText(second.name);
  await expect(page.getByRole('button', { name: 'Start Objective' })).toBeVisible();
  await chooseObjective(page, first);
  await expect(page.getByRole('button', { name: 'Resume Objective' })).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')))).actualStarts[first.id]).toBe(firstStart);
});

test('returns to the top and reaches Emergency from deep Timeline content', async ({ page }) => {
  await page.goto('/');
  await openCompanion(page);
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    scrollTo(0, document.documentElement.scrollHeight);
  });
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(400);
  await expect(page.locator('#current-objective-context')).toBeVisible();
  await page.locator('#timeline-view').getByRole('button', { name: '↑ Top' }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(5);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await expect(page.getByRole('heading', { name: 'CALL 911 FIRST' })).toBeVisible();
});

test('timestamps, edits, persists, and undoes a local milestone without delivery claims', async ({ page }) => {
  await page.goto('/');
  await openCompanion(page);
  const milestone = companionData.communication.milestones[0];
  const card = page.locator('article[data-milestone="0"]');
  await page.getByRole('button', { name: `Mark ${milestone} locally` }).click();
  await expect(card).toContainText(/Marked locally at .*M[DS]T/);
  const initialMarkedStatus = await card.locator('.milestone-status').textContent();
  await page.getByRole('button', { name: `Edit local mark time for ${milestone}` }).click();
  await page.locator('#milestone-time-0').fill('2026-08-07T10:04');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card.locator('.milestone-status')).toHaveText(initialMarkedStatus);
  await page.getByRole('button', { name: `Edit local mark time for ${milestone}` }).click();
  await page.locator('#milestone-time-0').fill('2026-08-07T10:04');
  await page.getByRole('button', { name: `Save local mark time for ${milestone}` }).click();
  await expect(card).toContainText('Marked locally at 10:04 AM MDT');
  await page.reload();
  await openCompanion(page);
  await expect(page.locator('article[data-milestone="0"]')).toContainText('Marked locally at 10:04 AM MDT');
  await page.getByRole('button', { name: `Undo local mark for ${milestone}` }).click();
  await expect(page.locator('article[data-milestone="0"]')).toContainText('Not marked');
  await expect(page.locator('#milestone-list')).not.toContainText(/sent|delivered|received|completed/i);
});

test('generates the nine approved milestone message templates from canonical objective and operational time', async () => {
  const objective = companionData.objectives[1];
  const time = new Date('2026-08-07T16:04:00.000Z');
  expect(companionData.communication.milestones.map((_, index) => createMilestoneMessage(index, objective.id, time))).toEqual([
    `Leaving the vehicle for ${objective.name} at 10:04 AM MDT. I’ll check in again at the next planned milestone.`,
    'At Lake Como camp at 10:04 AM MDT.',
    `Starting ${objective.name} at 10:04 AM MDT.`,
    `At the summit or high point for ${objective.name} at 10:04 AM MDT. Beginning the return.`,
    'Below exposed high terrain at 10:04 AM MDT and continuing down.',
    'Back at Lake Como camp at 10:04 AM MDT.',
    'Back at the vehicle at 10:04 AM MDT.',
    'Through Fort Garland at 10:04 AM MDT and heading home.',
    'Home at 10:04 AM MDT.'
  ]);
});

test('copies only the prepared public message and never auto-marks the milestone', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { globalThis.__copiedMessage = value; } }
    });
  });
  await page.goto('/');
  await openCompanion(page);
  await page.getByText('Optional private fields on this phone').click();
  await page.locator('[data-private-field="name"]').fill('PRIVATE-NAME-SENTINEL');
  await page.locator('[data-private-field="note"]').fill('PRIVATE-NOTE-SENTINEL');
  await page.getByRole('button', { name: 'Copy message for Vehicle departure' }).click();
  await expect(page.locator('#toast')).toContainText('Message copied.');
  const copied = await page.evaluate(() => globalThis.__copiedMessage);
  expect(copied).toContain(`Leaving the vehicle for ${companionData.objectives[0].name}`);
  expect(copied).toMatch(/at \d{1,2}:\d{2} [AP]M M[DS]T\./);
  expect(copied).not.toMatch(/PRIVATE|https?:|coordinate|phone/i);
  await expect(page.locator('article[data-milestone="0"]')).toContainText('Not marked');
});

test('uses native Share without delivery or local-mark claims', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async payload => { globalThis.__sharedMessagePayload = payload; };
  });
  await page.goto('/');
  await openCompanion(page);
  await page.getByRole('button', { name: 'Share message for Summit start' }).click();
  await expect(page.locator('#toast')).toContainText('Confirm delivery in the sending app.');
  const payload = await page.evaluate(() => globalThis.__sharedMessagePayload);
  expect(Object.keys(payload).sort()).toEqual(['text', 'title']);
  expect(payload.text).toContain(`Starting ${companionData.objectives[0].name}`);
  expect(payload).not.toHaveProperty('url');
  await expect(page.locator('article[data-milestone="2"]')).toContainText('Not marked');
});

test('treats cancelled Share neutrally and keeps milestone state unchanged', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async () => { throw new DOMException('Canceled', 'AbortError'); };
  });
  await page.goto('/');
  await openCompanion(page);
  await page.getByRole('button', { name: 'Share message for Home' }).click();
  await expect(page.locator('#toast')).toContainText('Share canceled. Milestone unchanged.');
  await expect(page.locator('article[data-milestone="8"]')).toContainText('Not marked');
});

test('falls back from unavailable message Share to offline-capable clipboard copy', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { globalThis.__sharedFallbackCopy = value; } }
    });
  });
  await page.goto('/');
  await openCompanion(page);
  await page.getByRole('button', { name: 'Share message for Back at vehicle' }).click();
  expect(await page.evaluate(() => globalThis.__sharedFallbackCopy)).toMatch(/^Back at the vehicle at /);
  await expect(page.locator('#toast')).toContainText('Message copied. Share is unavailable on this device.');
  await expect(page.locator('article[data-milestone="6"]')).toContainText('Not marked');
});

test('keeps private fields device-local, shares only the public URL, and clears private data', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async payload => { globalThis.__sharedPayload = payload; };
  });
  await page.goto('/');
  await openCompanion(page);
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
  await openCompanion(page);
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
  await expect(page.getByRole('heading', { name: 'Companion Home', level: 1 })).toBeVisible();
  await expect(page.locator('#home-primary-action')).toHaveText('Open Trip Companion');
  await expect(page.getByRole('button', { name: 'Offline Check', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Offline Check' }).first().click();
  await expect(page.getByRole('heading', { name: 'THIS PHONE IS SET UP' })).toBeVisible();
  await expect(page.getByText('Companion installed', { exact: true })).toBeVisible();
  await expect(page.getByText('Offline resources verified', { exact: true })).toBeVisible();
  await expect(page.getByText('Airplane Mode test still required', { exact: true })).toBeVisible();
  await expect(page.getByText('Offline Check confirms the required Companion resources are stored on this phone. It does not evaluate weather, access, terrain, or route conditions.', { exact: true })).toBeVisible();
  await expect(page.locator('#install-panel')).not.toContainText(/all clear|good to go|ready to climb/i);
});

test('shows Return to Mountain Guide only for the exact trusted referrer origin', async ({ browser, baseURL }) => {
  const trusted = await browser.newPage();
  await trusted.goto(baseURL, { referer: 'https://mountainguide.vondadowns.com/' });
  await expect(trusted.getByRole('link', { name: 'Return to Mountain Guide' })).toBeVisible();
  await expect(trusted.getByRole('link', { name: 'Return to Mountain Guide' })).toHaveAttribute('href', 'https://mountainguide.vondadowns.com/');
  await trusted.close();

  const ordinary = await browser.newPage();
  await ordinary.goto(baseURL);
  await expect(ordinary.getByRole('link', { name: 'Return to Mountain Guide' })).toBeHidden();
  await ordinary.close();

  const lookalike = await browser.newPage();
  await lookalike.goto(baseURL, { referer: 'https://mountainguide.vondadowns.com.evil.example/' });
  await expect(lookalike.getByRole('link', { name: 'Return to Mountain Guide' })).toBeHidden();
  await lookalike.close();
});

test('migrates earlier local state to schema version 3 without inventing a milestone timestamp', async ({ page }) => {
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
  await openCompanion(page);
  await expect(page.locator('#current-objective-context')).toContainText('Mount Lindsey');
  await expect(page.locator('article[data-milestone="0"]')).toContainText('Marked locally; time was not recorded by the earlier version.');
  await expect(page.locator('html')).toHaveAttribute('data-display', 'red');
  await page.getByText('Optional private fields on this phone').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('x');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')));
  expect(stored.schemaVersion).toBe(3);
  expect(stored.milestoneMarks['0']).toBe('');
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
  await expect(page.getByText(/Recorded on this phone:/)).toBeVisible();
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
  await openCompanion(page);
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
  await expect(page.getByRole('main')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Companion sections' })).toBeVisible();
  const red = page.getByRole('button', { name: /Red/ });
  await expect(red).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Offline resources verified', { exact: true })).toBeVisible();
  await openCompanion(page);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    outline: getComputedStyle(document.activeElement).outlineStyle
  }));
  expect(focused.tag).not.toBe('BODY');
  expect(focused.outline).not.toBe('none');
});

test('keeps mobile navigation readable and non-overlapping with increased text', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Increased-text wrapping is verified at the 390×844 mobile viewport');
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await openCompanion(page);
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    headerWidth: document.querySelector('.app-header').scrollWidth,
    headerClientWidth: document.querySelector('.app-header').clientWidth,
    navButtons: [...document.querySelectorAll('.primary-nav button')].map(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width, height: box.height, scrollWidth: node.scrollWidth };
    })
  }));
  expect(layout.pageWidth - layout.viewport).toBeLessThanOrEqual(1);
  expect(layout.headerWidth - layout.headerClientWidth).toBeLessThanOrEqual(1);
  for (const [index, button] of layout.navButtons.entries()) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.scrollWidth - button.width).toBeLessThanOrEqual(1);
    if (index) expect(layout.navButtons[index - 1].right).toBeLessThanOrEqual(button.left + 0.5);
  }
});
