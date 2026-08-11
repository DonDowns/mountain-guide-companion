import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function audit(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations, `${label} accessibility violations`).toEqual([]);
}

test('meets automated WCAG 2.1 AA checks across core states', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'What was shared' })).toBeVisible();
  await audit(page, 'first-use onboarding');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await audit(page, 'friend first-open');

  await page.getByRole('button', { name: 'Continue in Browser' }).click();
  await audit(page, 'Timeline daylight');

  await page.getByRole('button', { name: /Route/ }).last().click();
  await audit(page, 'Route daylight');

  await page.getByRole('button', { name: /Emergency/ }).last().click();
  await audit(page, 'Emergency daylight');

  await page.getByRole('button', { name: /Help/ }).last().click();
  await audit(page, 'Help and feedback daylight');

  await page.getByRole('button', { name: /Red/ }).click();
  await audit(page, 'Emergency Red Display');

  await page.getByRole('button', { name: /Timeline/ }).last().click();
  await audit(page, 'Timeline Red Display');

  await page.getByRole('button', { name: /Red/ }).click();
  await page.addInitScript(() => { globalThis.__COMPANION_TEST_STANDALONE__ = true; });
  await page.reload();
  await page.getByRole('button', { name: 'Offline Check' }).first().click();
  await expect(page.getByRole('heading', { name: 'THIS PHONE IS SET UP' })).toBeVisible();
  await audit(page, 'installed setup and Offline Check');
});
