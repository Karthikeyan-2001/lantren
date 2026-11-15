import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function captureOne(page: Page, title: string) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Capture what you studied' }).click();
  await page.getByRole('textbox', { name: 'Topic' }).fill(title);
  await page.getByRole('textbox', { name: 'Topic' }).press('Enter');
}

/** Puts a finished focus session straight into IndexedDB, as if it had just been logged. */
async function seedFocusSession(page: Page, focusedMinutes: number, trackId: string) {
  await page.evaluate(
    ({ minutes, track }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('lantern');
        open.onsuccess = () => {
          const tx = open.result.transaction('focusSessions', 'readwrite');
          tx.objectStore('focusSessions').put({
            id: `seed-${minutes}`,
            startedAt: new Date().toISOString(),
            plannedMinutes: minutes,
            focusedMinutes: minutes,
            trackId: track,
            interruptions: 0,
            parkingLot: [],
          });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { minutes: focusedMinutes, track: trackId },
  );
}

test('Today shows the week as a calm ring, and Progress tells the same story', async ({ page }) => {
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Nothing waiting yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: /This week.s focus.*No focus yet this week/ })).toBeVisible();

  await seedFocusSession(page, 30, 'track-dsa');
  await page.reload();
  const card = page.getByRole('link', { name: /This week.s focus.*30 min of 9 h 30 min this week/ });
  await expect(card).toBeVisible();
  await card.click();

  await expect(page.getByRole('heading', { level: 1, name: 'How the lamp has burned' })).toBeVisible();
  await expect(page.getByText('day in a row')).toBeVisible();
  await expect(page.getByRole('img', { name: '1 study day in the last 12 weeks.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'DSA in JavaScript: 30 min of 2 h' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'AI engineering: 0 min of 2 h 30 min' })).toBeVisible();
  // Progress sits under Today in the navigation.
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('link', { name: 'Edit tracks and targets' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your tracks' })).toBeVisible();
});

test('tracks can be renamed, recoloured, retargeted, added and put away', async ({ page }) => {
  await page.goto('/library');
  await page.getByRole('link', { name: 'Tracks' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your tracks' })).toBeVisible();

  await page.locator('summary', { hasText: 'DSA in JavaScript' }).click();
  // The first track; its form is named for the track, so the name changes once it is renamed.
  const form = page.locator('details.ln-track').first().getByRole('form');
  await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
  await form.getByRole('textbox', { name: 'Name' }).fill('Algorithms');
  await form.getByRole('radio', { name: 'Moss' }).check();
  await form.getByLabel('Weekly focus target, in hours').fill('3');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('status')).toHaveText('Saved.');
  await expect(page.locator('summary', { hasText: 'Algorithms' })).toContainText('3 h a week');

  // An impossible target is met with a note, not a save.
  await form.getByLabel('Weekly focus target, in hours').fill('99');
  await expect(form.getByText('Somewhere from 0 to 40 hours works.')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.reload();
  await expect(page.locator('summary', { hasText: 'Algorithms' })).toContainText('3 h a week');

  const add = page.getByRole('form', { name: 'New track' });
  await expect(add.getByRole('button', { name: 'Add track' })).toBeDisabled();
  await add.getByRole('textbox', { name: 'Name' }).fill('Rust for fun');
  await add.getByLabel('Weekly focus target, in hours').fill('1.5');
  await add.getByRole('button', { name: 'Add track' }).click();
  await expect(page.locator('summary', { hasText: 'Rust for fun' })).toContainText('1 h 30 min a week');

  // Put away, and it leaves Capture but keeps its place here.
  await page.locator('summary', { hasText: 'Rust for fun' }).click();
  await page.getByRole('form', { name: 'Edit Rust for fun' }).getByRole('button', { name: 'Put away' }).click();
  await expect(page.locator('summary', { hasText: 'Rust for fun' })).toContainText('put away');
  await page.goto('/capture');
  await expect(page.getByRole('radio', { name: 'Algorithms' })).toBeAttached();
  await expect(page.getByRole('radio', { name: 'Rust for fun' })).toHaveCount(0);
});

test('a backup can be saved, everything deleted behind a confirmation, and the backup restored', async ({
  page,
}, testInfo) => {
  await captureOne(page, 'Binary search');
  await expect(page.getByRole('region', { name: 'Coming up' }).getByText('Binary search')).toHaveCount(2);

  await page.goto('/settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save a backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^lantern-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = testInfo.outputPath('backup.json');
  await download.saveAs(file);
  const saved = JSON.parse(readFileSync(file, 'utf8')) as {
    app: string;
    topics: { title: string }[];
    reviews: unknown[];
  };
  expect(saved.app).toBe('lantern');
  expect(saved.topics.map((t) => t.title)).toEqual(['Binary search']);
  expect(saved.reviews).toHaveLength(2);
  await expect(page.getByText('Backup saved. Keep it somewhere safe.')).toBeVisible();

  // Deleting needs the word, and can be backed out of.
  await page.getByRole('button', { name: 'Delete everything…' }).click();
  const confirm = page.getByRole('form', { name: 'Delete everything?' });
  const sure = confirm.getByRole('button', { name: 'Delete everything' });
  await expect(sure).toBeDisabled();
  await confirm.getByRole('button', { name: 'Keep my data' }).click();
  await expect(confirm).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete everything…' }).click();
  await confirm.getByRole('textbox', { name: /Type .delete. to confirm/ }).fill('delete');
  await sure.click();
  await expect(page.getByText('Everything is cleared.')).toBeVisible();
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Nothing waiting yet' })).toBeVisible();

  // A file that is not a backup is refused and changes nothing.
  await page.goto('/settings');
  const picker = page.locator('input[type="file"]');
  await picker.setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('hello') });
  await expect(page.getByText('This does not look like a Lantern backup. Nothing was changed.')).toBeVisible();

  await picker.setInputFiles(file);
  const ask = page.getByRole('group', { name: 'Restore this backup?' });
  await expect(ask).toContainText('1 topic, 2 reviews and 0 focus sessions');
  await ask.getByRole('button', { name: 'Replace with this backup' }).click();
  await expect(page.getByText('Restored 1 topic, 2 reviews and 0 focus sessions.')).toBeVisible();

  await page.goto('/today');
  await expect(page.getByRole('region', { name: 'Coming up' }).getByText('Binary search')).toHaveCount(2);
});
