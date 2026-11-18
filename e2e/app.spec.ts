import { expect, test, type Page } from '@playwright/test';

test('opens on today and reaches the style guide from library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Nothing waiting yet' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await page.getByRole('link', { name: 'Open the style guide' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lantern', exact: true })).toBeVisible();
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

async function captureOne(page: Page, title: string) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Capture what you studied' }).click();
  await page.getByRole('textbox', { name: 'Topic' }).fill(title);
  await page.getByRole('textbox', { name: 'Topic' }).press('Enter');
}

/** Waits until a settings field has reached IndexedDB, so a reload cannot race the write. */
async function expectStoredSetting(page: Page, field: string, value: unknown) {
  await expect
    .poll(() =>
      page.evaluate(
        (name) =>
          new Promise<unknown>((resolve) => {
            const open = indexedDB.open('lantern');
            open.onsuccess = () => {
              const get = open.result.transaction('settings').objectStore('settings').get('settings');
              get.onsuccess = () => {
                resolve((get.result as Record<string, unknown> | undefined)?.[name]);
                open.result.close();
              };
            };
          }),
        field,
      ),
    )
    .toBe(value);
}

test('reminders are offered once, switch on, and can be tuned in settings', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  // Emulated Android Chrome reads the grant back as "denied" after a navigation; the app
  // on a phone asks Android itself. Report the permission this browser was given.
  await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'granted' }));
  await captureOne(page, 'Binary search');

  const offer = page.getByRole('region', { name: 'Want a nudge on review days?' });
  await offer.getByRole('button', { name: 'Turn on reminders' }).click();
  await expect(offer).toHaveCount(0);

  await page.goto('/settings');
  await expect(page.getByRole('switch', { name: 'Review reminders' })).toBeChecked();
  const time = page.getByLabel('Remind me at');
  await expect(time).toHaveValue('19:30');

  // Settings says what the phone is holding, and a test reminder can be sent.
  await expect(page.getByText(/^Next reminder on .+ at 7:30 pm: “Binary search”\.$/)).toBeVisible();
  await page.getByRole('button', { name: 'Send a test reminder' }).click();
  await expect(page.getByText('A test reminder arrives in a few seconds.', { exact: false })).toBeVisible();

  // A time inside quiet hours is moved, and the page says so.
  await time.fill('23:00');
  await expect(page.getByText('reminders arrive at 07:00 the next morning')).toBeVisible();

  await page.getByRole('switch', { name: 'One daily digest' }).check();
  await expectStoredSetting(page, 'dailyDigest', true);
  await page.reload();
  await expect(page.getByLabel('Remind me at')).toHaveValue('23:00');
  await expect(page.getByRole('switch', { name: 'One daily digest' })).toBeChecked();

  // The offer does not come back.
  await page.goto('/today');
  await expect(page.getByRole('region', { name: 'Coming up' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Want a nudge on review days?' })).toHaveCount(0);
});

test('"Not now" puts the reminder offer away for good', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await captureOne(page, 'Two pointers');

  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('region', { name: 'Want a nudge on review days?' })).toHaveCount(0);
  await expectStoredSetting(page, 'reminderOfferSeen', true);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Coming up' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Want a nudge on review days?' })).toHaveCount(0);

  await page.goto('/settings');
  await expect(page.getByRole('switch', { name: 'Review reminders' })).not.toBeChecked();
});

/** Finished focus sessions as stored on the device. */
function storedFocusSessions(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ focusedMinutes: number; trackId?: string; parkingLot: string[] }[]>((resolve) => {
        const open = indexedDB.open('lantern');
        open.onsuccess = () => {
          const all = open.result.transaction('focusSessions').objectStore('focusSessions').getAll();
          all.onsuccess = () => {
            resolve(all.result);
            open.result.close();
          };
        };
      }),
  );
}

test('a focus session runs down, ends warm, is saved, and offers a break', async ({ page }) => {
  await page.clock.install();
  await page.goto('/focus');
  await page.getByRole('radio', { name: 'System design' }).check();
  await page.getByRole('button', { name: 'Begin' }).click();

  // Full screen: the navigation and the capture button step aside.
  await expect(page.getByRole('timer')).toHaveText(/^2[45]:\d\d$/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Capture what you studied' })).toHaveCount(0);

  const thought = page.getByRole('textbox', { name: 'Park a thought' });
  await thought.fill('renew the domain');
  await thought.press('Enter');
  await expect(thought).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Parked, safe until later' })).toContainText('renew the domain');

  // A pause holds the timer however long it lasts.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.clock.fastForward('40:00');
  await expect(page.getByText('Paused. The flame is holding.')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/^2[45]:\d\d$/);
  await page.getByRole('button', { name: 'Carry on' }).click();

  await page.clock.fastForward('25:00');
  await expect(page.getByRole('heading', { level: 1, name: 'That was good work' })).toBeVisible();
  await expect(page.getByText('25 minutes on System design.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Parked for later' })).toContainText('renew the domain');
  await expect.poll(() => storedFocusSessions(page)).toHaveLength(1);
  expect((await storedFocusSessions(page))[0]).toMatchObject({
    focusedMinutes: 25,
    trackId: 'track-sd',
    parkingLot: ['renew the domain'],
  });

  await page.getByRole('button', { name: 'Take 5 minutes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rest a little' })).toBeVisible();
  await page.clock.fastForward('05:00');
  await expect(page.getByRole('heading', { level: 1, name: 'Ready when you are' })).toBeVisible();
  await page.getByRole('button', { name: 'Done for now' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'One flame, one thing' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('ending a focus session early keeps what was done; a false start keeps nothing', async ({ page }) => {
  await page.clock.install();
  await page.goto('/focus');

  // A custom length outside the limits cannot begin.
  await page.getByRole('radio', { name: 'Custom' }).check();
  await page.getByLabel('Custom length').fill('3');
  await expect(page.getByRole('button', { name: 'Begin' })).toBeDisabled();
  await page.getByLabel('Custom length').fill('40');
  // Every phase stays inside one Ionic page. A new page swapped in without navigating
  // stays hidden on Android, which left the screen blank after "End here".
  const focusPage = page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)');
  await focusPage.evaluate((el) => el.setAttribute('data-e2e-mark', ''));
  const samePage = page.locator('ion-router-outlet > .ion-page[data-e2e-mark]');

  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.getByRole('timer')).toHaveText(/^(40:00|39:\d\d)$/);
  await expect(samePage).toHaveCount(1);

  await page.getByRole('button', { name: 'End here' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'One flame, one thing' })).toBeVisible();
  await expect(samePage).toHaveCount(1);
  await expect(samePage).not.toHaveClass(/ion-page-invisible/);
  expect(await storedFocusSessions(page)).toHaveLength(0);

  await page.getByRole('button', { name: 'Begin' }).click();
  await page.clock.fastForward('12:00');
  await page.getByRole('button', { name: 'End here' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stopped at 12 minutes' })).toBeVisible();
  await expect.poll(() => storedFocusSessions(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Done for now' }).click();

  // The length is remembered.
  await page.reload();
  await expect(page.getByLabel('Custom length')).toHaveValue('40');
});
