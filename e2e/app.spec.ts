import { expect, test } from '@playwright/test';

test('opens on today and reaches the style guide from library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Nothing waiting yet' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await page.getByRole('link', { name: 'Open the style guide' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lantern' })).toBeVisible();
});

test('captures a topic with a title and Enter, then sees it coming up and in library', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Capture what you studied' }).click();

  const title = page.getByRole('textbox', { name: 'Topic' });
  await expect(title).toBeFocused();
  await title.fill('Closures and the event loop');
  await title.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: 'A quiet day' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('“Closures and the event loop” is lit');
  const comingUp = page.getByRole('region', { name: 'Coming up' });
  await expect(comingUp.getByText('Closures and the event loop')).toHaveCount(2);

  // Survives a reload: it is in IndexedDB, not just memory.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Coming up' }).getByText('day 4')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(
    page.getByRole('region', { name: 'DSA in JavaScript' }).getByText('Closures and the event loop'),
  ).toBeVisible();
});
