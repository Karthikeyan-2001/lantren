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
| P2 | Data layer, Capture, Today | done | `26a6078` | Opus 5.5 (used) |
| P3 | Review flow | done | `2872ae8` | Opus 5.5 (used) |
| P4 | Notifications | done (not yet run on a device) | `5d17047` | Fable 5.2 (used) |
| P5 | Focus mode and ambient sound | done (sound and screen lock not yet tried on a phone) | `719b607` | Fable 5.2 (used) |
| P6 | Progress, tracks and weekly goals, export and import | done (export not yet tried on a phone) | `27da090` | Sonnet 5.5 (used) |
| P7 | Polish, accessibility pass, Android build | in progress (Android platform, cloud APK build and UI refinement done; accessibility audit not yet done) | | Opus 5.5 |

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

### P3 Review flow (done)

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

### P5 Focus mode and ambient sound (done)

1. Sessions of 25, 50, 90 minutes or custom (5 to 180), for a track and optionally linked to a topic. Once begun, the navigation steps aside: one flame in a lantern window (`Hearth`) that dims, one big timer.
2. Parking lot box for stray thoughts. Leaving the app mid-session is logged as an interruption and the time away is not counted as focused. The screen is kept awake.
3. A 5 or 15 minute break is offered after a session, then a gentle "Ready when you are". Finishing leaves a warm glow, never confetti.
4. Ambient sound generated with the Web Audio API (rain, brown noise, soft hum), volume control, a sleep fade and an optional end chime.

### P6 Progress, tracks and goals, export and import (done)

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
- `npm run test:e2e` is the Playwright smoke test (needs `npx playwright install chromium` once). It uses port 5173; set `E2E_PORT` to test against a dev server on another port.

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
- Rows on Today were not tappable in P2; P3 turned them into the review flow.
- Theme stays in `localStorage` (needed before the database opens, to avoid a flash), not in Settings.
- The app asks for persistent storage (`navigator.storage.persist`) on start.
- Tests use `fake-indexeddb`, loaded in `setupTests.ts`.

### P3
- Review lives at `/review/:reviewId`. Rows in Due today and Waiting for you open it; Coming up rows do not, so nothing is reviewed early.
- Steps: recall (title only), reveal (notes beside what was recalled), rate, then a done card with the lantern and what happens next.
- Recall text is kept only for the visit, never stored. "Say it" means the keyboard's mic; the Web Speech API is not used because it goes over the network.
- For `dsa-problem` the recall step asks for a fresh JavaScript solution in a mono box and offers the problem link; pattern, time taken and notes stay hidden until the reveal.
- `recordReview` in `repo.ts` stores the rated review, any added review and the topic status in one transaction; a test proves a failed extra-review write keeps the rating out.
- "Not today" uses `snoozeReview` and returns to Today with a notice. Snoozing is on the recall step only, before the notes are seen.
- After rating, the done card offers the next waiting review (oldest first) or Back to Today.
- Outcome words: Lit, Lit a little hazy, A little leaky, Locked in, Still glowing (graduation). Copy comes from `outcomeCopy` in `view.ts`, unit-tested.
- Graduation reviews are a switch in Settings (`/settings`, reached from Library, default off). They apply to topics that lock in after it is switched on.
- Settings writes are optimistic in the store and rolled back if Dexie fails.
- The store's `lastCapture` became a generic `notice` string used by capture and snooze. Notices say "today", "tomorrow" or "on Wed 18 Nov".
- New components: `RecallRating`, `Toggle` (checkbox with `role="switch"`), tappable `TopicRow` (`to` prop, stretched link). All on the style-guide page. Theme choice also appears in Settings.

### P4
- Code lives in `src/reminders`: `plan.ts` (pure planner in wall-clock terms, no Date), `sync.ts` (plan to local instants, one sync at a time), `port.ts` (the only Capacitor Local Notifications caller), `useReminders.ts` (hooks and wiring).
- Reminders are off until the user says yes. Today offers once (`reminderOfferSeen`); the switch is in Settings. Permission is asked only at that moment.
- Digest off: each open review reminds once on its due day; reviews whose moment has passed share one "waiting for you" nudge at the next reminder time. Digest on: one line a day instead, planned 7 days ahead.
- A reminder time inside quiet hours waits until they end, even the next morning. Settings says so.
- Estimates: 4 minutes a review, 10 for a `dsa-problem`. Plan capped at 48, per-review horizon 30 days.
- Every sync cancels all pending, clears the tray and schedules the fresh plan. Runs on topic, review and reminder-setting changes, local date or timezone change (checked each minute) and every return to the foreground.
- Exact alarms: plugin 8.3 opens a system settings screen on every `schedule` if exact is wanted without permission, so `isExactNotification` is set only when already granted; otherwise inexact with `allowWhileIdle`. Settings has an "Allow exact timing" button.
- Known limit: a timezone change while the app is closed is corrected the next time it opens.
- Web: reminders only fire while the app is open; Android Chrome cannot show them at all (Settings says so).
- New component: `Offer`. Time fields are `TextField type="time"`. Both on the style-guide page.
- Playwright covers the offer (yes and not now) and the reminder settings, with notification permission granted to the test browser.
- Left for P7: notification small icon, and testing all of this on a real device.

### P5
- Code lives in `src/focus`: `config.ts` (every number), `session.ts` (pure timer rules over a `FocusRun`, time passed in as epoch ms), `store.ts` (Zustand phases: idle, focus, done, break, breakOver), `noise.ts` (pure sample maths), `sound.ts` (the only Web Audio caller), `awake.ts` (the only screen-lock caller), `copy.ts`, `useFocus.ts` (wiring and the app-wide lifecycle hook). The screen is `src/pages/Focus.tsx`.
- The timer follows the wall clock (an end instant, not a count of ticks), so it stays right when the app is throttled, hidden or restarted.
- Leaving the app while the timer runs is one interruption. The timer keeps going; the time away is subtracted from focused minutes. Absences under 10 seconds do not count, and leaving while paused or on a break does not count.
- Pause exists and is not an interruption. "End here" keeps the session if at least 1 focused minute was done; less than that keeps nothing. There is no confirmation dialog.
- A running session is kept in `localStorage` under `lantern.focus` (rewritten on every change and every 15 seconds), so it survives the app being killed. On reopening, the gap counts as away; if the timer ran out meanwhile, the done card shows and the session ends at the moment the timer reached zero.
- A finished session is one `FocusSession` row, written when it ends (not at start). `focusedMinutes` is rounded down. The store keeps `focusSessions` in memory for P6.
- A session belongs to a track (remembered as `focusTrackId`, falling back to the last captured track); linking a topic files it under that topic's track.
- Breaks: 15 minutes is suggested after a session of 50 minutes or more, or after every fourth session begun today; otherwise 5. Both are offered. Breaks are not stored and do not survive a restart.
- "Full screen" means the navigation and capture button are hidden on `/focus` while a session or break is on. Hiding the Android status bar is left for P7.
- Screen awake: `@capacitor-community/keep-awake` on Android, the Screen Wake Lock API in a browser (asked for again on each return, since browsers drop it when hidden).
- Sound is synthesised on the device, no audio files: rain is filtered noise with drops baked in, brown noise is integrated white noise, the hum is a low open fifth. Ten-second loops are crossfaded at the join so they do not click.
- Sound plays only while the timer runs: it fades out on pause and at the end. The sleep fade (never, 15, 30, 60 minutes) reaches silence at the chosen minute after a one-minute fade; choosing a sound or a fade again restarts it.
- The audio context is only created inside a tap (Begin, or the first tap after a restart), so browsers never block it and no console warning appears.
- A soft two-note chime marks the end of a session and of a break (setting `focusChime`, default on). There is no end-of-session notification: if the app is in the background the done card is waiting on return.
- Focus settings (`focusMinutes`, `focusTrackId`, `focusSound`, `focusVolume`, `focusSleepFade`, `focusChime`) are new fields on `Settings`; older stored settings pick up the defaults on load, so the Dexie schema is still v1.
- New components: `Hearth`, `SelectField`, `RangeField`, and `Nav`'s `hidden` prop. All on the style-guide page. `Placeholders.tsx` is gone.
- Playwright covers a full session (park, pause, finish, break) and an early stop, using its fake clock.
- Left for P7: hear the three sounds on a phone speaker and adjust their levels, check that sound and the wake lock behave on Android when the screen is turned off, hide the status bar during a session.

### P6
- Code: `src/progress` (`stats.ts` pure maths over stored data, `copy.ts` wording and unit helpers), `src/data/backup.ts` (backup format, pure), `src/data/files.ts` (the only Filesystem/Share caller), `src/pages/Progress.tsx`, `Tracks.tsx`, `DataSection.tsx` (inside Settings), `src/ui/Progress.tsx` (`Heatmap`, `Meter`, `Stat`, `WeekCard`). `weekdayIndex` and `startOfWeek` were added to `src/scheduler/dates.ts` with tests; weeks run Monday to Sunday.
- Screens: `/progress` is reached from the ring on Today and from Library, and sits under Today in the navigation. `/tracks` and `/settings` sit under Library. Still three destinations.
- A study day is any local day with a topic studied, a review completed or a focus session of at least 1 focused minute. Backdated captures count on the day studied.
- The streak counts study days in a row. Each Monday-to-Sunday week has one rest day: the first missed day while a streak is running is forgiven (and is not counted as a study day), a second one in the same week ends it. A rest day is only spent when there is a running streak to protect, and today never counts against it until it is over. The rest day is automatic; there is nothing to tap. Copy never says lost, broke or missed.
- Heatmap: 12 whole weeks ending with this one, Monday at the top, three warm levels (1, 2, 3 or more things done), future days a dashed outline. One picture to a screen reader, described by a sentence.
- Weekly focus is Monday to today, summed from `focusedMinutes` by the day each session started, per track against its target. Time on put-away tracks counts toward the total but not the targets. The Today ring is the total against all targets; with no targets it stays empty and the line states the time.
- Review completion: of the reviews that came due in the last 28 days, the share that were done (late counts). A review due today and still open is not counted. Reviews of archived topics are ignored. Locked-in is a plain count.
- Tracks: name (up to 60 letters), one of the six colours, a weekly target in hours (0 to 40, 0 means none) stored as minutes. Tracks are put away, never deleted, so topics keep their track; at least one track always stays in view. Reordering is not offered. New tracks get `concept` as their default kind and the first colour not in use.
- Backup: one JSON file, `lantern-backup-YYYY-MM-DD.json`, `{ app: 'lantern', version: 1, exportedAt, tracks, topics, reviews, focusSessions, settings }`. Reading it validates every record and refuses the whole file, with a kind reason and nothing changed, on any problem; settings are read field by field and fall back to defaults. A focus session whose track or topic is missing keeps its minutes and loses the link.
- Restore replaces everything on the device (one transaction, all or nothing) after a confirmation that shows what the file holds. There is no merge. Reminders re-plan by themselves because the store changes.
- Delete everything needs the word "delete" typed, then returns to a first-run state: starter tracks and default settings (a running focus session is cleared too). The theme choice is left alone. No red styling.
- Saving: on Android the file is written to the cache and handed to the share sheet (`@capacitor/filesystem`, `@capacitor/share`), because a WebView cannot download files; in a browser it is a normal download. Choosing a file uses a plain file input.
- Playwright covers the Today ring and Progress, track editing, and a full backup, delete and restore round trip.
- Left for P7: try Save a backup and Restore on a real Android device (share sheet, file picker, and where the file ends up).

### P7 (Android part so far)
- `@capacitor/android` 8.6.2 added and `npx cap add android` run; the `android/` folder is committed (its own `.gitignore` leaves out build output and the copied web assets).
- Permissions (notifications, exact alarms, boot) come from the local-notifications plugin's own manifest, merged at build time, so the app manifest is untouched. `INTERNET` stays because Capacitor adds it; the app makes no network calls.
- Reminder small icon is a white flame vector, `ic_stat_lantern`, wired in `capacitor.config.ts` with the ember tint.
- APKs are built online by `.github/workflows/android.yml` (Node 22, JDK 21): unit tests, web build, `cap sync`, `gradlew assembleDebug`, uploaded as the `lantern-debug-apk` artifact. Debug build only; no signing keys are stored in the repo.
- Not yet done in P7: the accessibility audit, airplane-mode and console pass, hiding the status bar during focus, adaptive launcher icon and splash from the Lantern artwork, and trying any of it on a device.

### P7 (UI refinement)
- Motion tokens added: `--ease-out` (soft landing for arrivals), `--ease-spring` (a slight overshoot, only for things under a finger: switch thumbs, the nav indicator, the segmented thumb, press release) and `--stagger` (45 ms). Presses scale to 0.97 in 90 ms and spring back.
- Elevation tokens added per theme: `--edge-light` (a faint lit top edge), `--shadow-1` (cards), `--shadow-float` (the dock), `--scrim`. Shadows are warm-tinted, never black. Arch, card, offer, notice, week card and stats share one recipe.
- Screens arrive as a cascade: each direct child of `.ln-screen` and each list row rises a beat after the one above. All of it collapses under reduced motion through the existing global rule.
- `Choice` picks its own shape: up to 5 options with short labels (9 letters or fewer) and no colours is a segmented track with a thumb that glides to the choice; anything else is chips sized to their labels, tinted with the option's colour (or ember) when chosen. The old solid cream selected state is gone. The `fit` prop now just forces chips.
- The dock: the nav has a gliding indicator and an ember icon for the current place, a blurred surface with a soft float shadow, and a scrim under it so content fades out instead of colliding. It centres itself on screens without the capture button.
- Row titles are a step smaller (17 px), clamped to two lines; meta is micro size. Dividers on tappable rows are inset so they never bend at the rounded corners. Group heads lost their underline; counts are small mono badges.
- Disclosures (Capture's optional fields, Tracks) glide open with `::details-content` and `interpolate-size`; their marker is a chevron that turns. Browsers without support just open instantly.
- Library's three outlined buttons became one menu card (`.ln-menu`) with a hint line per place. Specimen on the style-guide page.
- Screen kickers use `--accent-text`. Headings use Fraunces at weight 400 with optical sizing and slightly tighter tracking.
- Heatmap sits in its own surface, empty days are soft wells instead of outlines, gaps are 3 px. Meters grow in from the left on arrival.

### P7 (living flame)
- The flame is hand-built SVG and CSS, not Lottie: no player library, no animation files, it follows the theme tokens and still dims with `level`.
- Layers: glow, outline, fire (a gradient from the new `--flame-deep` token through ember to the tip), a lighter inner tongue, a pale core. Each moves on its own rhythm (2.9 s, 1.9 s, 1.3 s), so the loop never looks obvious.
- Flames 40 px and wider are "live": the outline morphs (CSS `d: path()`), the core pulses, the glow breathes and two small sparks rise now and then, fading as the flame burns down. Smaller flames (list rows, lanterns) only let the inner tongue breathe, to keep long lists calm and cheap to draw.
- Browsers without CSS `d` animation (Safari) keep the still outline with the other layers moving. Reduced motion stops everything through the global rule.

### P7 (lanterns and window arch)
- `.ln-arch` is no longer a dome: a low elliptical window arch (rise `clamp(64px, 22vw, 104px)`) with an inner hairline frame 7 px in, so it looks like a window at any width. `--r-arch` is still used for tall, narrow shapes (Hearth, style-guide specimens).
- `EmptyState` shows a lit flame (40 px, so it is live) standing on a sill inside a soft round halo.
- `Lantern` is an SVG carriage lantern (viewBox 100 x 126): hook and ring, a domed roof with a finial, a band in the track colour, a glass chamber between two bronze pillars with a glint and a mullion, and a footed base; d4 and d7 sit under it. The two `Flame`s are laid over the glass (their own halos are hidden there) and the light on the glass follows `data-glow` (none, a slow ember pulse while waiting, half, full; gold when locked in). New per-theme tokens: `--metal-hi`, `--metal-lo`, `--glass`, `--glass-shine`, `--lantern-shadow`. Full size is 76 px and sways a little on its ring when lit; list rows use 62 px and stay still.

### P7 (one lantern across the app)
- The lantern drawing is one component, `LanternFrame` (`src/ui/LanternFrame.tsx`, CSS `.ln-frame*`). Callers lay flames over its glass with `.ln-frame-flames` and set the light with `--frame-light` (0 to 1) and `--frame-light-colour`.
- `Hearth` is now that lantern with a single flame (no mullion) and light spilling around it, in three sizes: full (Focus session, about 196 px), `compact` (Focus set-up, style guide) and `mini` (empty states, streak). It sways on its ring while ready, burning or resting, holds still when paused or finished, and dims glass, flame and spill together with `level`. New mood `dark` is an unlit lantern.
- Empty states show a mini lit lantern; the streak on Progress shows a mini lantern that is lit today, holding while the streak runs, dark at zero.
- Nav icons follow the motif: Today is a lantern with a flame, Library is two lanterns on a shelf, Focus stays a flame.
- Brass details: switch knobs are small brass knobs when off (ember when on), the capture button carries a brass ring, and the window arch's inner frame is tinted with `--metal-hi`.

### P7 (lamplit material across every page)
- One finish for the whole app, appended as the "Lamplit material" layer at the end of `ui.css`. New per-theme tokens: `--rim-top`, `--rim-bottom` (a panel's border catches light at the top and fades), `--well-shadow` (fields and tracks are sunken wells), `--lamp` (a warm light above every screen, painted on `ion-content`).
- Panels: cards, offers, notices, the week card, stats, the menu, rating answers and topic lists share the lit-rim material (`padding-box` fill plus a `border-box` gradient). Sections of Progress, Settings, Your data and Tracks are `.ln-panel`s and the old hairline rules between them are gone. `.ln-panel--warm` (the streak) carries a glow behind its lantern; `.ln-panel--list` is a panel of rows.
- Topic lists (Today, Library) sit in one panel each, rows divided inside it. Library shelves are headed by an orb in the track colour (`.ln-orb`); track dots in Tracks are the same orb.
- Screen kickers carry a small lit ember. Today's kicker is the date (`longDate` in `view.ts`).
- Buttons: ember is a lit gradient; a `Flame` inside an ember button is drawn in ink. Quiet buttons and the back link share the lit rim.
- Capture: the title is written on a line in Fraunces (`.ln-field__control--hero`, an ember underline draws across on focus); notes (and recall on Review) are ruled paper (`--lined`, the ruling confined to the writing area); confidence is `FlameScale`, five flames with a word for the level; "Light it" carries an ink flame.
- Review: `Steps` (Recall, Compare, Done) above each stage; the notes are an index card (`.ln-index`, a margin line in ember); each recall answer shows its flame (none, flicker, full) and Solid has an ember rim.
- Progress: the heatmap is a sunken tray with month labels on top and M/W/F down the side, today is ringed, brighter days glow; meters are wells with a glowing fill in the track colour; the streak number and the focus timer glow faintly.
- Tracks: each track's weekly target sits on a second line under its name.
- New components `FlameScale` and `Steps`, and the writing surfaces, have specimens on the style-guide page.
- The style-guide e2e check matches the heading exactly, so the fading Library heading ("Your lanterns") cannot match it mid-transition.

### P7 (dials and embers)
- `ProgressRing` is an ember dial: a brass rim, a sunken track with twelve hour marks, an arc that brightens toward its end (a gradient in the ring's colour), and a small tip at the arc's leading end, turned with `--ring-fraction` so it travels with the fill. A full ring glows the steady gold and hides the tip; an empty ring shows no arc. Arc and tip draw in together on arrival. The centre stays clear: a glow inside the dial was tried and dropped, as it carried no meaning.
- Heatmap days are round metal studs, all one size: the finish shows the day's level (dull iron at half strength for nothing, polished brass, warm copper, then ember-hot metal), using the lantern's `--metal-*` tokens. Crisp, no blur or motion. Today has an ember ring; future days an empty ring. Every weekday is labelled down the side (M T W T F S S). Earlier tries, dropped: blurred breathing embers (strained the eye), round dots growing with the level, and rounded-square tiles.

## Environment notes

- Windows 11, Node 26. No Java or Android SDK installed, so Android builds wait for Android Studio.
- Phone testing before P7 is over Wi-Fi with `npm run dev:phone`. The service worker only registers on `localhost` or HTTPS, so install and offline cannot be tested over a LAN `http://` address.
