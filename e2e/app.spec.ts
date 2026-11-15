import { expect, test, type Page } from '@playwright/test';

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

/** A local calendar date some days back, as the date input wants it. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function captureStudied(page: Page, title: string, notes: string, ago: number) {
  await page.goto('/capture');
  await page.getByRole('textbox', { name: 'Topic' }).fill(title);
  await page.getByRole('radio', { name: 'JavaScript and TypeScript' }).check();
  await page.getByRole('textbox', { name: 'Notes' }).fill(notes);
  await page.getByText('Source link and study date').click();
  await page.getByLabel('Studied on').fill(daysAgo(ago));
  await page.getByRole('button', { name: 'Light it' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'One to revisit' })).toBeVisible();
}

test('reviews a topic: recall, reveal the notes, rate Solid', async ({ page }) => {
  await captureStudied(page, 'Closures', 'a function remembers where it was made', 3);

  await page.getByRole('region', { name: 'Due today' }).getByRole('link', { name: 'Closures' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Closures' })).toBeVisible();
  // Recall first: the notes are not on screen yet.
  await expect(page.getByText('a function remembers where it was made')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'What comes back' }).fill('lexical scope, kept alive');
  await page.getByRole('button', { name: 'Show my notes' }).click();

  await expect(page.getByText('a function remembers where it was made')).toBeVisible();
  await expect(page.getByText('lexical scope, kept alive')).toBeVisible();
  await page.getByRole('button', { name: /^Solid/ }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Lit' })).toBeVisible();
  await expect(page.getByText(/It comes back .*day 7/)).toBeVisible();
  await page.getByRole('link', { name: 'Back to Today' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'A quiet day' })).toBeVisible();
});

test('Forgot is leaky and comes back tomorrow; Not today snoozes', async ({ page }) => {
  await captureStudied(page, 'Event loop', 'microtasks before the next macrotask', 3);
  await page.getByRole('link', { name: 'Event loop' }).click();
  await page.getByRole('button', { name: 'Show my notes' }).click();
  await page.getByRole('button', { name: /^Forgot/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'A little leaky' })).toBeVisible();
  await expect(page.getByText(/look again tomorrow/)).toBeVisible();
  await page.getByRole('link', { name: 'Back to Today' }).click();
  await expect(page.getByRole('region', { name: 'Coming up' }).getByText('one more look, tomorrow')).toBeVisible();

  await captureStudied(page, 'Promises', 'then returns a new promise', 3);
  await page.getByRole('link', { name: 'Promises' }).click();
  await page.getByRole('button', { name: 'Not today, ask me tomorrow' }).click();
  await expect(page.getByRole('status')).toContainText('“Promises” will be back tomorrow');
  await expect(page.getByRole('heading', { level: 1, name: 'A quiet day' })).toBeVisible();
});

test('graduation reviews can be switched on from Library settings', async ({ page }) => {
  await page.goto('/library');
  await page.getByRole('link', { name: 'Settings' }).click();
  const toggle = page.getByRole('switch', { name: 'Graduation reviews' });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  // Wait for the write to land before reloading.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<unknown>((resolve) => {
            const open = indexedDB.open('lantern');
            open.onsuccess = () => {
              const get = open.result.transaction('settings').objectStore('settings').get('settings');
              get.onsuccess = () => {
                resolve((get.result as { graduationReviews?: boolean } | undefined)?.graduationReviews);
                open.result.close();
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Graduation reviews' })).toBeChecked();
});
