import { expect, test } from '@playwright/test';

test('opens on today and reaches the style guide from library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Nothing waiting yet' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await page.getByRole('link', { name: 'Open the style guide' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lantern' })).toBeVisible();
});
