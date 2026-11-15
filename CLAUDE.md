# Lantern

A focus-and-study app built around 1-4-7 spaced revision. The user logs what they studied (day 1); the app schedules reviews for day 4 and day 7 and reminds them. Offline-first, no backend, no login. Android is the main target; it must also run as an installable PWA. The aim is focus: it should feel like a quiet desk lamp, not a dashboard of badges.

The user is a working software engineer in Chennai (IST) upskilling toward AI engineer and full-stack roles, with 8 to 12 hours a week. This is not an exam app.

## How to work on this project

- Build in the phases below, one at a time. **After each phase: stop, say how to test it on the phone, and commit.**
- Make decisions yourself and state each one in a line. Only ask when something blocks you.
- Commit straight to `master`, one commit per phase, message starting `P<n>: ...`.
- When a phase is finished, update the phase table here and in `README.md`, and add its decisions to the log at the bottom of this file.

## Phases

| Phase | What | State | Commit | Model |
| --- | --- | --- | --- | --- |
| P0 | Project setup, design tokens, style-guide page | done | `5e16fcf` | Fable 5.2 (used) |
| P1 | Scheduler module and tests | done | `f4d93da` | Fable 5.2 (used) |
| P2 | Data layer, Capture, Today | done | see `git log` | Opus 5.5 (used) |
| P3 | Review flow | next | | Opus 5.5 |
| P4 | Notifications | | | Fable 5.2 |
| P5 | Focus mode and ambient sound | | | Fable 5.2 |
| P6 | Progress, tracks and weekly goals, export and import | | | Sonnet 5.5 |
| P7 | Polish, accessibility pass, Android build | | | Opus 5.5 |

## Which model to use

These are recommendations, not requirements; any of them can do any phase. Pick the model in the app's model selector before starting a phase.

| Model | ID | Use it for |
| --- | --- | --- |
| Fable 5.2 | `claude-fable-5-2` | The hardest phases: new design work that must not look generic, subtle correctness (dates, alarms), anything where a wrong first decision is expensive later. |
| Opus 5.5 | `claude-opus-5-5` | Substantial feature phases that build on patterns already in the repo. |
| Sonnet 5.5 | `claude-sonnet-5-5` | Well-specified, mostly mechanical phases and follow-up fixes. |
| Haiku 5.5 | `claude-haiku-5-5` | Small chores only: copy tweaks, renames, a single failing lint rule, README edits. |

Why each phase gets its model:

- **P0, Fable 5.2.** The design language is invented here and everything later inherits it.
- **P1, Fable 5.2.** Date and scheduling rules are easy to get subtly wrong (local midnight, DST, late reviews) and every later phase trusts them.
- **P2, Opus 5.5.** Dexie schema, Zustand store and two screens. A lot of code, but the tokens, components and scheduler it builds on already exist. Move up to Fable if Capture's under-10-seconds flow needs real design exploration.
- **P3, Opus 5.5.** A multi-step flow with state and some design judgement (recall first, reveal, rate), on top of an already tested `completeReview`.
- **P4, Fable 5.2.** The riskiest phase: Android 13+ permissions, exact alarms with an inexact fallback, quiet hours, and rescheduling on timezone change. Hard to test on this machine, so it needs to be right by reasoning.
- **P5, Fable 5.2.** The signature screen (the dimming flame) plus sound synthesis with the Web Audio API, wake lock and interruption tracking.
- **P6, Sonnet 5.5.** Heatmap, rings, counts, streak, JSON export and import. Clear requirements and existing patterns. Use Opus for the streak-with-freeze rule if it gets fiddly, and unit-test it either way.
- **P7, Opus 5.5.** A wide audit across the whole app plus the Android toolchain, where errors are environment-specific. Haiku is fine for the small fixes the audit turns up.

### P0 Project setup and design tokens (done)

1. Kept the Ionic React + Vite scaffold; removed the demo page, the legacy-browser plugin and ionicons.
2. Self-hosted fonts through `@fontsource` (Fraunces, Source Sans 3, DM Mono).
3. Wrote `src/theme/tokens.css` (palette, semantic roles for dark and paper, type, shape, motion) and `base.css`.
4. Added a unit test that every text role is at least 4.5:1 on every surface in both themes.
5. Built Lantern's own components in `src/ui` (Flame, Lantern, Button, fields, Choice, ProgressRing, Nav, Screen).
6. Wired three destinations (Today, Focus, Library) plus the floating capture button, with placeholder screens.
7. Built the style-guide page at `/styleguide`, reached from Library.
8. Added `vite-plugin-pwa` precaching, generated icons (`npm run icons`), README.

### P1 Scheduler (done)

1. `src/scheduler/dates.ts`: `LocalDate` as a `YYYY-MM-DD` string, calendar arithmetic, `toLocalDate(instant, timeZone?)`.
2. `src/scheduler/config.ts`: the single `SCHEDULE` object (`REVIEW_OFFSETS: [3, 6]`, `GRADUATION_OFFSETS: [13, 29]`).
3. `src/scheduler/scheduler.ts`: `createReviews`, `completeReview`, `snoozeReview`, `rescheduleForStudiedOn`, `groupForToday`, `isOverdue`.
4. Unit tests for every scheduler rule, including midnight, DST and timezone-change cases, and a test that the module imports nothing outside itself.

### P2 Data layer, Capture, Today (done)

1. Add Dexie and Zustand. Define the full data model (Track, Topic, Review, FocusSession, Settings) and a Dexie schema.
2. Seed the six starter tracks and default settings on first run.
3. Repository functions that call the scheduler (save topic creates day 4 and day 7 reviews in one transaction).
4. Capture screen: title, track, kind, notes, confidence 1-5, optional source link; extra fields for `dsa-problem` (problem link, pattern, time taken, solved without hints). Must be usable in under 10 seconds.
5. Today screen: Due today, Waiting for you (overdue), Coming up (next 7 days), with warm empty states.
6. Library list of topics by track, each shown as a lantern with its two flames.

### P3 Review flow

1. Recall first: show only the title, ask the user to type or say what they remember.
2. Reveal the original notes, then rate Forgot, Fuzzy or Solid.
3. For `dsa-problem`, ask to re-solve from scratch in JavaScript instead of recalling notes.
4. Apply `completeReview`; show locked-in and leaky states; snooze 1 day.
5. Graduation reviews (day 14, day 30) behind a setting, default off.

### P4 Notifications

1. Capacitor Local Notifications: one reminder per review at the chosen time (default 7:30 pm).
2. Android 13+ notification permission and exact-alarm permission, falling back to inexact alarms.
3. Optional daily digest ("3 reviews waiting, about 12 minutes"). Quiet hours.
4. Reschedule everything when topics, settings or the timezone change.

### P5 Focus mode and ambient sound

1. Sessions of 25, 50, 90 minutes or custom, optionally linked to a topic. Full screen, one big timer, a flame that dims.
2. Parking lot box for stray thoughts. Leaving the app mid-session is logged as an interruption. Keep the screen awake.
3. Short and long breaks with a gentle prompt. Finishing leaves a warm glow, never confetti.
4. Ambient sound generated with the Web Audio API (rain, brown noise, soft hum), volume control and a sleep fade.

### P6 Progress, tracks and goals, export and import

1. Track editing with colours and a weekly focus target per track; a calm progress ring on Today.
2. 12-week heatmap of study days, weekly focus minutes per track against target, review completion rate, count of locked-in topics.
3. A gentle streak with 1 freeze day per week. No leaderboards.
4. JSON export and import of all data, and "delete everything" behind a confirmation.

### P7 Polish, accessibility pass, Android build

1. Accessibility pass: labels, focus states, 44px touch targets, reduced motion, contrast.
2. Airplane-mode check, empty states, no console errors.
3. Add the Android platform (`@capacitor/android`), build and run on a device. Needs Android Studio, which is not installed on this machine yet.
4. Final README with setup, run and Android build steps.

## Commands

- `npm run dev` runs on http://localhost:5173. `npm run dev:phone` exposes it on the LAN for phone testing.
- `npm run test:unit` (Vitest), `npm run lint` (ESLint, e2e typecheck, Prettier check), `npm run build` (tsc then Vite).
- `npm run lint:fix` formats and fixes. Run it before committing.
- `npm run test:e2e` is the Playwright smoke test (needs `npx playwright install chromium` once).

## Rules that must hold

### Dates and the scheduler
- All due dates are **local calendar dates** (`LocalDate`, `YYYY-MM-DD`) in the device timezone. Never use UTC midnight math, `toISOString().slice(0, 10)`, or millisecond addition for due dates. Use `addDays` and `toLocalDate` from `src/scheduler/dates.ts`.
- `src/scheduler` is pure TypeScript: no React, Ionic, Capacitor, Dexie or app imports. A test enforces this.
- The day studied is day 1. Offsets live only in `SCHEDULE` in `src/scheduler/config.ts`.
- Every scheduler rule has a unit test. Add the test with any rule change.
- Completing a review never changes another review's due date; only Forgot adds a review. Missed reviews stay due and are never skipped or deleted.

### Design language
- Do not use Ionic UI components, palettes or typography. Ionic provides structure only (`IonApp`, `IonPage`, `IonContent`, the router). Everything visible comes from `src/ui` and `src/theme`.
- No Material, iOS, Notion, Duolingo or Apple look. Tall arches and soft pills, hairline borders, warm grain, no heavy shadows or neon gradients.
- Use semantic tokens (`--bg`, `--surface`, `--text`, `--text-muted`, `--accent-text`, ...) in components, never raw hex. Text must be at least 4.5:1; extend `tokens.test.ts` when adding a text or surface role.
- Fraunces for headings, Source Sans 3 for body, DM Mono for timers and numbers. No Inter or Roboto.
- Motion is slow and calm (250 to 600 ms tokens) and honours `prefers-reduced-motion`.
- Navigation has three destinations only: Today, Focus, Library, plus the floating capture button. Settings are reached from Library.
- New components get a specimen on the style-guide page.

### Voice
- Short, kind copy. No guilt or shaming, no red alarm styling. Overdue is "waiting for you".
- No confetti, badges, leaderboards, exams or countdowns.

### Quality
- Strict TypeScript (`noUncheckedIndexedAccess` is on). No `any`.
- Accessible: real labels, visible focus, 44px touch targets.
- Offline-first: no network calls, fonts and assets are bundled. Data stays on the device.
- No console errors.

## Decision log

### P0
- State: Zustand. Storage: Dexie over IndexedDB (one code path for Android and PWA). Both arrive in P2.
- Body font: Source Sans 3. All fonts self-hosted for offline use.
- Ionic runs in one mode (`md`) with page transitions and ripples off.
- Raw ash, dusk and ember fail 4.5:1 as text on some surfaces, so text uses adjusted shades; raw colours are for fills and decoration.
- ESLint rule `explicit-module-boundary-types` is off.
- Theme choice is stored in `localStorage` under `lantern.theme` until Settings storage exists.

### P1
- Fuzzy on day 7: topic stays active, not locked in, nothing more scheduled.
- Forgot on day 7: extra review next day; Solid on that extra locks the topic in.
- A topic locks in when a Solid rating leaves no core or extra review waiting and the day 7 review is done.
- Leaky stays until the topic locks in.
- A late Forgot puts the extra on the day after it was actually reviewed.
- Snoozing an overdue review moves it to tomorrow.
- Graduation reviews for a topic locked in late are never dated in the past (earliest is tomorrow).
- Editing `studiedOn` leaves extra reviews alone.
- `Review` has `dueHistory` (earlier due dates); `dayMark` is `number | 'extra'` so it follows the config.

### P2
- Data lives in `src/data`: `types.ts` (model), `db.ts` (Dexie schema v1), `seed.ts`, `repo.ts` (all reads and writes), `store.ts` (Zustand), `view.ts` (pure display helpers), `useToday.ts`.
- Seeding uses Dexie's `populate` event, so it runs exactly once, when the database is created.
- Starter tracks: DSA in JavaScript, AI engineering, ML foundations, JavaScript and TypeScript, Full-stack web, System design (about 9.5 h a week of targets). Seed ids are stable (`track-dsa`, ...).
- Each track has a `defaultKind`; picking DSA makes the kind `dsa-problem` unless the user picks a kind.
- Topic kinds: `concept`, `dsa-problem`, `build`, `reading`.
- `saveTopic` writes the topic, its reviews and `lastTrackId` in one `rw` transaction; a test proves a failed review write rolls the topic back.
- Ids come from `crypto.getRandomValues`, not `randomUUID`, which is missing on plain-http LAN testing.
- Capture: title is focused on arrival, track is remembered, Enter saves, confidence defaults to 3, source link and study date sit in a closed disclosure. A study date can be up to 60 days back, never in the future.
- The capture button hides while on Capture.
- Flames: unlit while a review is ahead, waiting when due or overdue, lit when done, steady when locked in.
- Today's date comes from `useToday`, rechecked every minute and on return to the foreground (midnight and timezone changes).
- Rows on Today are not tappable yet; P3 turns them into the review flow.
- Theme stays in `localStorage` (needed before the database opens, to avoid a flash), not in Settings.
- The app asks for persistent storage (`navigator.storage.persist`) on start.
- Tests use `fake-indexeddb`, loaded in `setupTests.ts`.

## Environment notes

- Windows 11, Node 26. No Java or Android SDK installed, so Android builds wait for Android Studio.
- Phone testing before P7 is over Wi-Fi with `npm run dev:phone`. The service worker only registers on `localhost` or HTTPS, so install and offline cannot be tested over a LAN `http://` address.
