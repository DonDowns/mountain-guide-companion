import { expect, test as base } from '@playwright/test';
import { companionData, releaseMetadata } from '../js/companion-data.js';

const test = base.extend({
  consoleGate: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && url.origin !== 'http://127.0.0.1:4173') errors.push(`external request: ${url.origin}`);
    });
    await use();
    expect(errors).toEqual([]);
  }, { auto: true }]
});

test('loads canonical identity and friend first-open setup', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mountain Guide Companion', level: 1 })).toBeVisible();
  await expect(page.locator('#trip-name')).toHaveText(companionData.trip.name);
  await expect(page.getByText('INSTALL FOR OFFLINE USE', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install for Offline Use', exact: true })).toBeVisible();
  await expect(page.getByText(`Manifest ${companionData.identity.manifestShort}…`)).toBeVisible();
  expect(companionData.identity.manifestSha256).toBe(releaseMetadata.manifest_sha256);
  if (testInfo.project.name === 'webkit-mobile') {
    await expect(page.getByText('Open this page in Safari.')).toBeVisible();
    await expect(page.getByText('Choose Add to Home Screen.')).toBeVisible();
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
  await expect(page.getByText('Opening a phone intent does not prove that a call occurred.', { exact: true }).first()).toBeVisible();
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
  await expect(page.getByText('Marked locally only', { exact: true })).toBeVisible();
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
  await page.getByText('Optional private fields on this device').click();
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
  await page.getByText('Optional private fields on this device').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('x');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear Private Data' }).click();
  await page.getByText('Optional private fields on this device').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('');
  await expect(page.locator('[data-private-field="note"]')).toHaveValue('');
});

test('shows factual installed state and bounded structural Offline Check', async ({ page }) => {
  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.goto('/');
  await expect(page.getByText('INSTALLED COMPANION', { exact: true })).toBeVisible();
  await expect(page.getByText('INSTALL FOR OFFLINE USE', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Offline Check' }).click();
  await expect(page.getByText('Local Companion resources present', { exact: true })).toBeVisible();
  await expect(page.getByText(/Full offline cold-launch verification not yet completed/)).toBeVisible();
  await expect(page.locator('#install-panel')).not.toContainText(/offline verified|all clear|good to go/i);
  await expect(page.getByText('Phase 5 cache and cold-launch verification is not implemented.')).toBeVisible();
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
  await expect(page.locator('#lily-status')).toContainText('Exact canonical coordinate/elevation pending final verification.');
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
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    outline: getComputedStyle(document.activeElement).outlineStyle
  }));
  expect(focused.tag).not.toBe('BODY');
  expect(focused.outline).not.toBe('none');
});
