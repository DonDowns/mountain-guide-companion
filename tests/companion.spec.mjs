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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('mgc-companion-local-state')) {
      localStorage.setItem('mgc-companion-local-state', JSON.stringify({
        schemaVersion: 4,
        setup: { onboarding: { version: 'companion-onboarding-candidate-8-v1', status: 'completed', recordedAt: '2026-08-11T00:00:00.000Z' } }
      }));
    }
  });
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
  await expect(page.getByRole('heading', { name: 'Prepare This Phone', level: 1 })).toBeVisible();
  await expect(page.getByText('Test version · 0.6.0-candidate.13', { exact: true })).toBeVisible();
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
  await expect(page.locator('#weather-invariant')).toHaveText(companionData.invariants.weather);
  await expect(page.locator('#weather-snapshot-invariant')).toHaveText(companionData.invariants.weather);

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
  await page.waitForFunction(() => !('serviceWorker' in navigator) || Boolean(navigator.serviceWorker.controller));
  const red = page.getByRole('button', { name: /Red Mode/ });
  await red.click();
  await expect(red).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-display', 'red');
  await page.reload();
  await expect(page.getByRole('button', { name: /Red Mode/ })).toHaveAttribute('aria-pressed', 'true');

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
  await page.getByRole('button', { name: /Red Mode/ }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Prepare This Phone', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Trip Timeline' }).first()).toBeVisible();
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
  await page.getByRole('button', { name: 'Share Companion', exact: true }).first().click();
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
  await page.getByRole('button', { name: 'Share Companion', exact: true }).first().click();
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
  await page.getByRole('button', { name: 'Share Companion', exact: true }).first().click();
  const fallback = await page.evaluate(() => globalThis.__manualCopy);
  expect(fallback).toEqual({ message: 'Copy this public Companion link:', value: releaseMetadata.pwa_url });
});

test('opens both PDFs through real online browser navigation with PDF responses', async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Online PDF navigation runs once in Chromium desktop');
  await page.goto('/');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  for (const path of ['/generated/field-guide.pdf', '/generated/pocket-card.pdf']) {
    const artifactPage = await context.newPage();
    const responsePromise = artifactPage.waitForResponse(res => new URL(res.url()).pathname === path);
    const downloadPromise = artifactPage.waitForEvent('download').catch(() => null);
    await artifactPage.goto(path).catch(err => {
      if (!err.message.includes('Download is starting')) throw err;
    });
    const response = await responsePromise;
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect(response.headers()['content-type']).not.toContain('text/html');
    expect(new URL(response.url()).pathname).toBe(path);
    await downloadPromise;
    await artifactPage.close();
  }
});

test('shows factual installed state and verifies the complete offline bundle', async ({ page }) => {
  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Companion Home', level: 1 })).toBeVisible();
  await expect(page.locator('#home-primary-action')).toHaveText('Open Trip Timeline');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await expect(page.getByRole('button', { name: 'Run Offline Check', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Run Offline Check' }).first().click();
  await expect(page.getByRole('heading', { name: 'Finish Preparing This Phone for Offline Use' })).toBeVisible();
  await expect(page.getByText('Running from Home Screen', { exact: true })).toBeVisible();
  await expect(page.getByText('Offline resources verified', { exact: true })).toBeVisible();
  await expect(page.locator('#install-panel').getByText('Airplane Mode Test Required', { exact: true })).toBeVisible();
  await expect(page.getByText('Offline Check confirms the required Companion resources are stored on this phone. It does not evaluate weather, access, terrain, or route conditions.', { exact: false })).toBeVisible();
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

test('migrates earlier local state to schema version 4 without inventing a milestone timestamp', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await openCompanion(page);
  await expect(page.locator('#current-objective-context')).toContainText('Mount Lindsey');
  await expect(page.locator('article[data-milestone="0"]')).toContainText('Marked locally; time was not recorded by the earlier version.');
  await expect(page.locator('html')).toHaveAttribute('data-display', 'red');
  await page.getByText('Optional private fields on this phone').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('x');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')));
  expect(stored.schemaVersion).toBe(4);
  expect(stored.milestoneMarks['0']).toBe('');
  expect(stored.statusNote).toBe('z');
  expect(stored.setup.legacyStructuralCheckCompletedAt).toBe('2026-08-07T10:05:00.000Z');
  expect(stored.setup.offlineVerifiedAt).toBe('');
});

test('records the physical Airplane Mode test only after explicit confirmation', async ({ page }) => {
  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.getByRole('button', { name: 'Run Offline Check' }).first().click();
  // The details element auto-expands in Candidate 10 after a successful Offline Check.
  await expect(page.getByRole('heading', { name: 'AIRPLANE MODE TEST' })).toBeVisible();
  await expect(page.locator('.airplane-test li')).toHaveCount(12);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Start Airplane Mode Test' }).click();
  await expect(page.getByText('Airplane Mode Test Recorded ✓')).toBeVisible();
  await expect(page.getByText(/Recorded on this phone:/)).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mgc-companion-local-state')));
  expect(stored.setup.airplaneModeTestCompletedAt).toBeTruthy();
});

test('exposes an install action only after a supported browser prompt', async ({ page }) => {
  await page.goto('/');
  const dismiss = page.getByRole('button', { name: 'Close tutorial' });
  if (await dismiss.isVisible()) await dismiss.click();
  const installButton = page.locator('.install-button');
  await expect(installButton).toBeHidden();
  await page.evaluate(() => {
    const prompt = new Event('beforeinstallprompt', { cancelable: true });
    prompt.prompt = async () => { globalThis.__installPrompted = true; };
    prompt.userChoice = Promise.resolve({ outcome: 'accepted' });
    dispatchEvent(prompt);
  });
  await expect(installButton).toBeVisible();
  await installButton.click();
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
  const red = page.getByRole('button', { name: /Red Mode/ });
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

test('candidate.11 defect A: visual current-state uniqueness and computed style deselection across all routes', async ({ page }) => {
  await page.goto('/');
  await openCompanion(page);

  const getNavStyles = () => page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.primary-nav button')];
    return buttons.map(b => {
      const computed = getComputedStyle(b);
      return {
        label: b.textContent.trim(),
        action: b.dataset.action || null,
        nav: b.dataset.nav || null,
        ariaCurrent: b.getAttribute('aria-current'),
        bg: computed.backgroundColor,
        color: computed.color
      };
    });
  });

  // Check on Timeline
  let styles = await getNavStyles();
  let activeButtons = styles.filter(s => s.ariaCurrent === 'page');
  expect(activeButtons).toHaveLength(1);
  expect(activeButtons[0].nav).toBe('timeline');
  expect(activeButtons[0].bg).not.toBe('rgba(0, 0, 0, 0)');
  let homeStyle = styles.find(s => s.action === 'home');
  expect(homeStyle.ariaCurrent).toBeNull();
  expect(homeStyle.bg).toBe('rgba(0, 0, 0, 0)');

  // Tap Route
  await page.getByRole('button', { name: /Route/ }).last().click();
  await expect(page.locator('#route-view')).toBeVisible();
  styles = await getNavStyles();
  activeButtons = styles.filter(s => s.ariaCurrent === 'page');
  expect(activeButtons).toHaveLength(1);
  expect(activeButtons[0].nav).toBe('route');
  expect(activeButtons[0].bg).not.toBe('rgba(0, 0, 0, 0)');
  homeStyle = styles.find(s => s.action === 'home');
  expect(homeStyle.ariaCurrent).toBeNull();
  expect(homeStyle.bg).toBe('rgba(0, 0, 0, 0)');

  // Tap Emergency
  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await expect(page.locator('#emergency-view')).toBeVisible();
  styles = await getNavStyles();
  activeButtons = styles.filter(s => s.ariaCurrent === 'page');
  expect(activeButtons).toHaveLength(1);
  expect(activeButtons[0].nav).toBe('emergency');
  expect(activeButtons[0].bg).toBe('rgb(139, 40, 31)'); // semantic red active
  homeStyle = styles.find(s => s.action === 'home');
  expect(homeStyle.ariaCurrent).toBeNull();
  expect(homeStyle.bg).toBe('rgba(0, 0, 0, 0)');

  // Tap Help
  await page.getByRole('button', { name: /Help/ }).last().click();
  await expect(page.locator('#help-view')).toBeVisible();
  styles = await getNavStyles();
  activeButtons = styles.filter(s => s.ariaCurrent === 'page');
  expect(activeButtons).toHaveLength(1);
  expect(activeButtons[0].nav).toBe('help');
  expect(activeButtons[0].bg).not.toBe('rgba(0, 0, 0, 0)');
  homeStyle = styles.find(s => s.action === 'home');
  expect(homeStyle.ariaCurrent).toBeNull();
  expect(homeStyle.bg).toBe('rgba(0, 0, 0, 0)');

  // Tap Home
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('#companion-home')).toBeVisible();
  styles = await getNavStyles();
  activeButtons = styles.filter(s => s.ariaCurrent === 'page');
  expect(activeButtons).toHaveLength(1);
  expect(activeButtons[0].action).toBe('home');
  expect(activeButtons[0].bg).not.toBe('rgba(0, 0, 0, 0)');
  const timelineStyle = styles.find(s => s.nav === 'timeline');
  expect(timelineStyle.ariaCurrent).toBeNull();
  expect(timelineStyle.bg).toBe('rgba(0, 0, 0, 0)');
  const emergencyStyle = styles.find(s => s.nav === 'emergency');
  expect(emergencyStyle.ariaCurrent).toBeNull();
  expect(emergencyStyle.bg).toBe('rgba(0, 0, 0, 0)');
  expect(emergencyStyle.color).toBe('rgb(139, 40, 31)'); // semantic red idle
});

test('candidate.12: Phone Setup completion hierarchy and Airplane Mode discoverability', async ({ page }) => {
  await page.goto('/');
  // Browser context incomplete state
  const headerSetup = page.locator('.header-setup');
  await expect(headerSetup).toBeVisible();
  await expect(headerSetup).toHaveText('Phone Setup for Offline Use');

  // Complete offline state in standalone mode
  await page.addInitScript(() => {
    globalThis.__COMPANION_TEST_STANDALONE__ = true;
    localStorage.setItem('mgc-companion-local-state', JSON.stringify({
      schemaVersion: 4,
      setup: {
        onboarding: { version: 'companion-onboarding-candidate-8-v1', status: 'completed', recordedAt: '2026-08-11T00:00:00.000Z' },
        offlineVerifiedAt: '2026-08-11T01:00:00.000Z',
        offlineVerifiedBundleId: 'ddmg-companion-0-6-0-candidate-13-data-3cda95d4e6b1-b1',
        airplaneModeTestCompletedAt: '2026-08-11T02:00:00.000Z'
      }
    }));
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));

  // Compact header state displays Phone Setup ✓
  await expect(headerSetup).toBeVisible();
  await expect(headerSetup).toHaveText('Phone Setup ✓');

  // Home status dl shows Offline readiness: Complete ✓ (no duplicate Phone setup lines)
  await expect(page.locator('.home-status dt').first()).toHaveText('Offline readiness');
  await expect(page.locator('#home-offline-status')).toHaveText('Complete ✓');
  const homeStatusText = await page.locator('.home-status').innerText();
  expect(homeStatusText).not.toMatch(/Phone setup\s*\n\s*Phone Setup ✓/);

  // Click header button to open Phone Setup details
  await headerSetup.click();
  const installPanel = page.locator('#install-panel');
  await expect(installPanel).toBeVisible();

  // Detailed completed card title
  await expect(installPanel.getByRole('heading', { name: 'This Phone Is Ready for Offline Use ✓', level: 2 })).toBeVisible();

  // Airplane Mode test status is visible and discoverable
  await expect(installPanel.getByText('Airplane Mode Test Recorded ✓')).toBeVisible();
  await expect(installPanel.getByText(/Recorded on this phone:/)).toBeVisible();

  // View Airplane Mode Test Steps disclosure
  const airplaneDetails = installPanel.locator('details.airplane-test');
  await expect(airplaneDetails).toBeVisible();
  await expect(airplaneDetails.locator('summary')).toHaveText('View Airplane Mode Test Steps');
  await airplaneDetails.locator('summary').click();
  await expect(airplaneDetails.locator('ol li')).toHaveCount(12);

  // Clear button is secondary
  const clearBtn = installPanel.getByRole('button', { name: 'Clear Airplane Mode Record' });
  await expect(clearBtn).toBeVisible();
  expect(await clearBtn.getAttribute('class')).toContain('secondary-button');

  // Explicit safety qualifier preserved
  await expect(installPanel.locator('.setup-boundary')).toContainText(
    'Offline Check confirms the required Companion resources are stored on this phone. It does not evaluate weather, access, terrain, or route conditions.'
  );
});

test('candidate.12: artifact viewer in-app page rendering, geometry, and centering', async ({ page }) => {
  await page.goto('/');

  // 1. Open Field Guide artifact
  await page.locator('#artifact-cards').scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: 'Open Field Guide' }).click();

  const artifactView = page.locator('#artifact-view');
  await expect(artifactView).toBeVisible();
  await expect(page.locator('#artifact-header-title')).toHaveText('3-Page Printable Field Guide');
  await expect(page.locator('#artifact-download-pdf')).toHaveAttribute('href', './generated/field-guide.pdf');

  const backButton = page.locator('.back-to-companion');
  await expect(backButton).toBeVisible();
  const backBox = await backButton.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(backBox.width).toBeGreaterThanOrEqual(44);
  expect(backBox.height).toBeGreaterThanOrEqual(44);

  // Field Guide page cards
  const fgPages = page.locator('.artifact-page-card');
  await expect(fgPages).toHaveCount(3);
  await expect(page.getByText('Page 1 of 3 · Operational Timeline & Decision Gates')).toBeVisible();
  await expect(page.getByText('Page 2 of 3 · Route Profile Summary')).toBeVisible();
  await expect(page.getByText('Page 3 of 3 · Emergency & Communication')).toBeVisible();

  // Document container has no horizontal overflow
  const fgScrollWidth = await page.locator('#artifact-document-container').evaluate(node => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth
  }));
  expect(fgScrollWidth.scrollWidth).toBeLessThanOrEqual(fgScrollWidth.clientWidth + 1);

  // Return to Companion
  await backButton.click();
  await expect(artifactView).toBeHidden();
  await expect(page.locator('#companion-home')).toBeVisible();

  // 2. Open Pocket Card artifact
  await page.getByRole('link', { name: 'Open Pocket Card' }).click();
  await expect(artifactView).toBeVisible();
  await expect(page.locator('#artifact-header-title')).toHaveText('Emergency & Communication Pocket Card');
  await expect(page.locator('#artifact-download-pdf')).toHaveAttribute('href', './generated/pocket-card.pdf');

  const pcPages = page.locator('.artifact-page-card.pocket-card-page');
  await expect(pcPages).toHaveCount(2);
  await expect(page.getByText('Front · Emergency & Jurisdictions')).toBeVisible();
  await expect(page.getByText('Back · Communication & Milestones')).toBeVisible();

  // Pocket card page width naturally scales to fill mobile width (not tiny 1/4 screen)
  const pcPageWidth = await pcPages.first().evaluate(node => node.getBoundingClientRect().width);
  expect(pcPageWidth).toBeGreaterThan(250); // substantial width on mobile and desktop
  expect(pcPageWidth).toBeLessThanOrEqual(420); // capped at 420px max width

  // Deterministic 1-tap return
  await backButton.click();
  await expect(artifactView).toBeHidden();
  await expect(page.locator('#companion-home')).toBeVisible();
});

test('candidate.12: deterministic one-tap Back to Companion and first-transition Home render', async ({ page }) => {
  await page.goto('/');

  // 1. Open Field Guide -> Back
  await page.locator('#artifact-cards').scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: 'Open Field Guide' }).click();
  await expect(page.locator('#artifact-view')).toBeVisible();

  await page.locator('.back-to-companion').click();
  await expect(page.locator('#artifact-view')).toBeHidden();
  await expect(page.locator('#companion-home')).toBeVisible();
  await expect(page.locator('.welcome-copy')).toBeVisible();
  await expect(page.locator('.artifact-overview')).toBeVisible();

  // 2. Open Pocket Card -> Back
  await page.getByRole('link', { name: 'Open Pocket Card' }).click();
  await expect(page.locator('#artifact-view')).toBeVisible();
  await page.locator('.back-to-companion').click();
  await expect(page.locator('#artifact-view')).toBeHidden();
  await expect(page.locator('#companion-home')).toBeVisible();
  await expect(page.locator('.welcome-copy')).toBeVisible();

  // 3. Cold direct URL to artifact -> Back
  await page.goto('/#artifact=' + encodeURIComponent('./generated/field-guide.pdf'));
  await expect(page.locator('#artifact-view')).toBeVisible();
  await page.locator('.back-to-companion').click();
  await expect(page.locator('#artifact-view')).toBeHidden();
  await expect(page.locator('#companion-home')).toBeVisible();
  await expect(page.locator('.welcome-copy')).toBeVisible();

  // 4. Subsequent navigation to Timeline and back to Home works cleanly on first transition
  await page.getByRole('button', { name: /Timeline/ }).last().click();
  await expect(page.locator('#timeline-view')).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('#companion-home')).toBeVisible();
  await expect(page.locator('.welcome-copy')).toBeVisible();
  await expect(page.locator('.home-status')).toBeVisible();
});

test('candidate.12: Weather Snapshot card rendering, source attribution, and safety invariants', async ({ page }) => {
  await page.goto('/');
  await openCompanion(page);
  await expect(page.locator('#timeline-view')).toBeVisible();

  const weatherCard = page.locator('#weather-snapshot');
  await expect(weatherCard).toBeVisible();
  await expect(weatherCard.getByRole('heading', { name: 'Weather Snapshot', level: 3 })).toBeVisible();
  await expect(weatherCard.locator('#weather-snapshot-summary')).toContainText(/Packaged alpine reference points/);
  await expect(weatherCard.locator('#weather-snapshot-source')).toContainText(/Mountain Guide v15.3.10/);
  await expect(weatherCard.locator('#weather-snapshot-source')).toContainText(/Verified 2026-08-07/);
  await expect(weatherCard.locator('#weather-snapshot-age')).toBeVisible();

  // Invariant statement
  await expect(weatherCard.locator('#weather-snapshot-invariant')).toHaveText('Weather is evidence, not permission.');

  // Reference locations
  const locationPills = weatherCard.locator('.weather-location-pill');
  await expect(locationPills).toHaveCount(5);
  await expect(weatherCard.getByText('Lake Como area', { exact: true })).toBeVisible();
  await expect(weatherCard.getByText('Blanca Peak', { exact: true })).toBeVisible();
  await expect(weatherCard.getByText('Ellingwood Point', { exact: true })).toBeVisible();
  await expect(weatherCard.getByText('Mount Lindsey', { exact: true })).toBeVisible();

  // Refresh action button
  const checkUpdateBtn = weatherCard.getByRole('button', { name: 'Check for Updated Shared Information' });
  await expect(checkUpdateBtn).toBeVisible();
  await checkUpdateBtn.click();
  await expect(page.locator('#toast')).toBeVisible();

  // Invariant: no affirmative safety language
  const timelineText = await page.locator('#timeline-view').innerText();
  expect(timelineText).not.toMatch(/safe to proceed|all clear|route is safe|weather permits|approved to continue|safe to climb|good to go/i);
});

test('candidate.13: Share Companion invokes native Web Share and does not open QR modal', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__shareInvocations = [];
    navigator.share = async payload => {
      globalThis.__shareInvocations.push(payload);
    };
  });
  await page.goto('/');
  await expect(page.locator('#companion-qr-overlay')).toBeHidden();

  // Header Share Companion button
  const headerShareBtn = page.getByRole('button', { name: 'Share Companion', exact: true }).first();
  await headerShareBtn.click();

  const shareCalls = await page.evaluate(() => globalThis.__shareInvocations);
  expect(shareCalls).toHaveLength(1);
  expect(shareCalls[0].url).toBe(releaseMetadata.pwa_url);
  expect(shareCalls[0].title).toBe('Mountain Guide Companion');
  await expect(page.locator('#companion-qr-overlay')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Share sheet opened with the public Companion link.');
});

test('candidate.13: Show QR Code displays QR overlay and does not invoke native share', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__shareInvocations = [];
    navigator.share = async payload => {
      globalThis.__shareInvocations.push(payload);
    };
  });
  await page.goto('/');
  await expect(page.locator('#companion-qr-overlay')).toBeHidden();

  // Click Show QR Code
  const qrBtn = page.getByRole('button', { name: 'Show QR Code', exact: true }).first();
  await qrBtn.click();

  // QR Modal is visible with SVG and public URL
  const qrOverlay = page.locator('#companion-qr-overlay');
  await expect(qrOverlay).toBeVisible();
  await expect(qrOverlay.getByRole('heading', { name: 'Scan QR Code' })).toBeVisible();
  await expect(qrOverlay.locator('#companion-qr-container svg')).toBeVisible();
  await expect(qrOverlay.locator('#companion-qr-url')).toHaveText(releaseMetadata.pwa_url);

  // Native share was NOT invoked
  const shareCalls = await page.evaluate(() => globalThis.__shareInvocations);
  expect(shareCalls).toHaveLength(0);

  // Dismiss QR code via Done button
  await qrOverlay.getByRole('button', { name: 'Done' }).click();
  await expect(qrOverlay).toBeHidden();
});

test('candidate.13: QR modal supports Escape key dismissal and inner Share Link action', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__shareInvocations = [];
    navigator.share = async payload => {
      globalThis.__shareInvocations.push(payload);
    };
  });
  await page.goto('/');
  const qrBtn = page.getByRole('button', { name: 'Show QR Code', exact: true }).first();
  await qrBtn.click();

  const qrOverlay = page.locator('#companion-qr-overlay');
  await expect(qrOverlay).toBeVisible();

  // Test inner Share Companion Link button inside the QR modal
  await qrOverlay.getByRole('button', { name: 'Share Companion Link' }).click();
  const shareCalls = await page.evaluate(() => globalThis.__shareInvocations);
  expect(shareCalls).toHaveLength(1);
  expect(shareCalls[0].url).toBe(releaseMetadata.pwa_url);

  // Test Escape key dismissal
  await page.keyboard.press('Escape');
  await expect(qrOverlay).toBeHidden();
});

test('candidate.13: checks for updates on startup and on foreground return without reload loop', async ({ page, context }) => {
  await page.addInitScript(() => {
    globalThis.__updateCheckCalls = 0;
    sessionStorage.setItem('__page_reloads__', String(Number(sessionStorage.getItem('__page_reloads__') || 0) + 1));
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));

  // Verify reload count is exactly 1 (no reload loops)
  const loadCount = await page.evaluate(() => Number(sessionStorage.getItem('__page_reloads__')));
  expect(loadCount).toBe(1);

  // Home update status dl shows Up to date
  const updateStatus = page.locator('#home-update-status');
  await expect(updateStatus).toHaveText('Up to date');

  // Trigger foreground return by changing visibilityState
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // Verify still no reload loop
  const postLoadCount = await page.evaluate(() => Number(sessionStorage.getItem('__page_reloads__')));
  expect(postLoadCount).toBe(1);
});

test('candidate.13: user-triggered update installation displays exact toast on reload', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('mgc-update-installed-toast', 'true');
  });
  await page.goto('/');
  const toast = page.locator('#toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('Update successfully installed.');
});
