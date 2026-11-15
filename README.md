# Lantern

A quiet focus-and-study app built around the 1-4-7 spaced revision method. You log what you studied (day 1); Lantern sets reviews for day 4 and day 7 and reminds you. Offline-first, no backend, no login.

## Status

| Phase | What | State |
| --- | --- | --- |
| P0 | Project setup, design tokens, style-guide page | done |
| P1 | Scheduler module and tests | done |
| P2 | Data layer, Capture, Today | done |
| P3 | Review flow | done |
| P4 | Notifications | done |
| P5 | Focus mode and ambient sound | done |
| P6 | Progress, tracks and weekly goals, export and import | next |
| P7 | Polish, accessibility pass, Android build | |

## Stack and decisions

- **Ionic React 9 + Capacitor 8**, TypeScript (strict), Vite, function components and hooks, `IonReactRouter`.
- **Ionic is structure only.** Its core and structure CSS and the page/router shell are used; no Ionic palettes, typography or UI components. Everything visible lives in `src/ui` and `src/theme`.
- **State:** Zustand (from P2). **Storage:** Dexie over IndexedDB (from P2), one code path for Android and the PWA.
- **Fonts:** Fraunces (headings), Source Sans 3 (body), DM Mono (numbers), self-hosted through `@fontsource` so they work offline.
- **Focus:** the timer follows the wall clock; ambient sound (rain, brown noise, soft hum) is synthesised with the Web Audio API, so there are no audio files; the screen is kept awake with `@capacitor-community/keep-awake`.
- **PWA:** `vite-plugin-pwa` precaches the whole app for airplane mode.
- **Tests:** Vitest for unit tests, Playwright for end-to-end checks of capture, review, settings and focus sessions.

## Setup

Needs Node 20 or newer.

```bash
npm install
```

## Run

```bash
npm run dev
```

Opens on http://localhost:5173. The style guide is at `/styleguide` (Library, then "Open the style guide").

### On your phone, same Wi-Fi

```bash
npm run dev:phone
```

Vite prints a `Network:` address such as `http://192.168.x.x:5173`. Open that in Chrome on the phone. If it does not load, allow Node.js through Windows Firewall for private networks.

Note: over plain `http://` on a LAN address the browser will not register the service worker, so "Install app" and offline mode only work on `localhost` or an HTTPS host. To try the installed PWA, deploy `dist/` to any HTTPS static host.

## Checks

```bash
npm run test:unit
```

```bash
npm run lint
```

```bash
npm run build
```

`npm run test:e2e` runs the Playwright smoke test (first run `npx playwright install chromium`).

## Android build

Needs Android Studio (with its bundled JDK and an Android SDK). The Android project is added in P7; the steps will be:

```bash
npm install @capacitor/android
npx cap add android
npm run build
npx cap sync android
npx cap open android
```

Then run on a device from Android Studio, or build an APK with Build > Build APK(s).

## Layout

```
src/theme     tokens.css (palette, type, shape, motion), base.css, theme switch, contrast test
src/scheduler pure 1-4-7 rules (config.ts holds REVIEW_OFFSETS), local-date helpers, tests
src/data      model, Dexie schema, repository, Zustand store
src/reminders reminder planning and scheduling (Capacitor Local Notifications)
src/focus     focus timer rules, ambient sound, screen wake lock
src/ui        Lantern's own components: Flame, Lantern, Hearth, Button, fields, Choice, ProgressRing, Nav, Screen
src/pages     screens; StyleGuide.tsx shows every token and component
scripts       make-icons.mjs draws the app icons
```
