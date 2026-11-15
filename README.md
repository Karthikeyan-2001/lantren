# Lantern

A quiet focus-and-study app built around the 1-4-7 spaced revision method. You log what you studied (day 1); Lantern sets reviews for day 4 and day 7 and reminds you. Offline-first, no backend, no login.

## Status

| Phase | What | State |
| --- | --- | --- |
| P0 | Project setup, design tokens, style-guide page | done |
| P1 | Scheduler module and tests | next |
| P2 | Data layer, Capture, Today | |
| P3 | Review flow | |
| P4 | Notifications | |
| P5 | Focus mode and ambient sound | |
| P6 | Progress, tracks and weekly goals, export and import | |
| P7 | Polish, accessibility pass, Android build | |

## Stack and decisions

- **Ionic React 9 + Capacitor 8**, TypeScript (strict), Vite, function components and hooks, `IonReactRouter`.
- **Ionic is structure only.** Its core and structure CSS and the page/router shell are used; no Ionic palettes, typography or UI components. Everything visible lives in `src/ui` and `src/theme`.
- **State:** Zustand (from P2). **Storage:** Dexie over IndexedDB (from P2), one code path for Android and the PWA.
- **Fonts:** Fraunces (headings), Source Sans 3 (body), DM Mono (numbers), self-hosted through `@fontsource` so they work offline.
- **PWA:** `vite-plugin-pwa` precaches the whole app for airplane mode.
- **Tests:** Vitest for unit tests, Playwright for one smoke test.

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
src/ui        Lantern's own components: Flame, Lantern, Button, fields, Choice, ProgressRing, Nav, Screen
src/pages     screens; StyleGuide.tsx shows every token and component
scripts       make-icons.mjs draws the app icons
```
