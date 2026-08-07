import { expect, test } from '@playwright/test';
import { corruptActiveCache, installCurrent, setServerState } from './offline-helpers.mjs';

test.describe.configure({ mode: 'serial' });

const corruptions = [
  ['missing JavaScript', 'js/companion-ui.js', 'delete'],
  ['missing canonical manifest and emergency data', 'data/trip-manifest.json', 'delete'],
  ['missing Field Guide PDF', 'generated/field-guide.pdf', 'delete'],
  ['missing Pocket Card PDF', 'generated/pocket-card.pdf', 'delete'],
  ['unexpected release ID', '', 'marker']
];

for (const [label, path, mode] of corruptions) {
  test(`Offline Check fails closed for ${label}`, async ({ page, request }, testInfo) => {
    test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Cache-manipulation matrix runs once in Chromium desktop');
    await installCurrent(page, request);
    expect(await corruptActiveCache(page, path, mode)).not.toBe('');
    await page.getByRole('button', { name: 'Offline Check' }).click();
    await expect(page.getByText('OFFLINE RESOURCES INCOMPLETE', { exact: true })).toBeVisible();
    await expect(page.getByText('Reconnect to the internet and retry Companion update/install.', { exact: true })).toBeVisible();
  });
}

test('repair creates a new complete cache and preserves device-local state', async ({ page, request }, testInfo) => {
  test.skip(!testInfo.project.name.includes('chromium-desktop'), 'Repair transaction runs once in Chromium desktop');
  await installCurrent(page, request);
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await page.getByRole('radio', { name: /Select Mount Lindsey/ }).check();
  await page.getByRole('button', { name: /Red/ }).click();
  await page.locator('[data-milestone="0"]').check();
  await page.getByText('Optional private fields on this phone').click();
  await page.locator('[data-private-field="name"]').fill('x');
  await page.getByRole('button', { name: 'Set up this phone' }).click();
  await corruptActiveCache(page, 'js/companion-ui.js');
  await page.getByRole('button', { name: 'Offline Check' }).click();
  await expect(page.getByText('OFFLINE RESOURCES INCOMPLETE', { exact: true })).toBeVisible();

  await setServerState(request);
  await page.getByRole('button', { name: 'Repair Offline Copy' }).click();
  await expect(page.getByText('OFFLINE RESOURCES VERIFIED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Companion' }).first().click();
  await expect(page.getByRole('radio', { name: /Select Mount Lindsey/ })).toBeChecked();
  await expect(page.locator('[data-milestone="0"]')).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-display', 'red');
  await page.getByText('Optional private fields on this phone').click();
  await expect(page.locator('[data-private-field="name"]')).toHaveValue('x');
});
