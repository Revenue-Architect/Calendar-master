# Technology Stack

**Analysis Date:** 2026-08-13

## Languages

**Primary:**
- JavaScript (ES modules, `"type": "module"` in `package.json`) — application, domain logic, platform stores, Vite config, and Node unit tests
- JSX — UI entry (`src/main.jsx`), presentation tree (`src/Planner.jsx`), extracted cards (`src/features/planner/TimelineActionCard.jsx`), crash fallback (`src/app/ErrorBoundary.jsx`)

**Secondary:**
- CSS / Tailwind v4 — page tokens and `@font-face` in `src/index.css`; large theme/motion stylesheet is inlined inside `src/Planner.jsx`
- HTML — standalone shell (`index.html`); single-file ship artifact (`build-artifact.mjs` writes `artifact/planner.html`)
- Bash — Replit post-merge hook (`scripts/post-merge.sh`)
- Markdown / iCalendar / JSON — interchange formats produced by the app, not source languages

There is no TypeScript. No `tsconfig.json`. Domain, feature, and platform modules are plain `.js`.

## Runtime

**Environment:**
- Browser: a client-only single-page app. React mounts into `#root` from `src/main.jsx`. There is no application server, no SSR, and no `fetch()` in `src/`.
- Node.js: used for Vite, unit tests (`node --test`), Playwright, and the artifact/contact-sheet scripts. `package.json` does not declare `engines`. Vite 7.3.6 requires `node: ^20.19.0 || >=22.12.0`. Replit pins `nodejs-24` in `.replit`.

**Package Manager:**
- npm (lockfileVersion 3)
- Lockfile: present (`package-lock.json`)
- No `yarn.lock`, `pnpm-lock.yaml`, or `bun.lockb`

## Frameworks

**Core:**
- React 19 (`^19.1.0` declared; `19.2.8` locked) — UI runtime. `createRoot` + `React.StrictMode` in `src/main.jsx`. Class `ErrorBoundary` in `src/app/ErrorBoundary.jsx`. Hooks (`useState`, `useEffect`, `useLayoutEffect`, `useRef`, `useMemo`, `useCallback`) in `src/Planner.jsx`.
- react-dom 19.2.8 — DOM renderer only. No React Router, no Next.js, no RSC.
- Vite 7 (`^7.0.0` declared; `7.3.6` locked) — dev server, production bundler, preview server. Config: `vite.config.js`.
- Tailwind CSS 4 (`^4.1.11` declared; `4.3.3` locked) via `@tailwindcss/vite` — utility classes plus CSS custom properties. Imported as `@import "tailwindcss"` in `src/index.css`. No `tailwind.config.js`; v4 is plugin-driven.

**Testing:**
- Node.js built-in test runner (`node --test`) + `node:assert/strict` — unit tests co-located next to source (`*.test.js` under `src/`).
- Playwright 1.62.1 (`@playwright/test`) — Chromium-only browser suite against the production preview (`tests/e2e/`, config `playwright.config.js`).

**Build/Dev:**
- `@vitejs/plugin-react` (`^5.0.0` declared; `5.2.0` locked) — JSX transform
- `vite preview` — serves `dist/` for Playwright and local production checks
- `build-artifact.mjs` — inlines `dist/assets/*.js` + `*.css` into one CSP-safe HTML file
- `scripts/contact-sheet.mjs` — Playwright screenshot grid of 15 themes × 2 widths × 4 surfaces

## Key Dependencies

**Critical:**
- `react` / `react-dom` 19.2.8 — the only runtime npm packages. Calendar recurrence, ICS, notes, search, reminders, and persistence are hand-rolled in `src/`, not pulled from libraries.
- `vite` 7.3.6 — must stay on a Node that satisfies `^20.19.0 || >=22.12.0`.
- `@tailwindcss/vite` 4.3.3 — the only CSS pipeline. Do not add a separate PostCSS config unless Tailwind 4 is being replaced.

**Infrastructure:**
- `@playwright/test` 1.62.1 — e2e only; also imported by `scripts/contact-sheet.mjs` for Chromium.
- Jost variable WOFF2 (`src/assets/fonts/jost-latin-variable.woff2`, SIL OFL in `src/assets/fonts/OFL.txt`) — the embedded display face. `vite.config.js` sets `assetsInlineLimit: 64 * 1024` so the ~26 kB font is base64-inlined; a separate font asset 404s under the artifact host CSP.

**Deliberately absent (do not add without an explicit decision):**
- No state library (no Redux, Zustand, Jotai). Planner state is React `useState` plus storage ports.
- No animation library (no Framer Motion). Motion is CSS + hooks in `src/features/motion/`.
- No date library (no date-fns, luxon, moment). Time lives in `src/shared/time/` and uses `Intl.DateTimeFormat` for IANA zones.
- No ICS library. Export is `src/domains/calendar/portability/eventToIcs.js`.
- No HTTP client, auth SDK, analytics, or error-tracking SDK.

## Configuration

**Environment:**
- No `.env`, `.env.local`, or `.env.*` files are present. Do not introduce secrets; the app has no backend.
- Optional process env (dev/CI only — never baked into the client bundle):
  - `CI` — Playwright `forbidOnly`, one retry, HTML reporter with `open: "never"`, and `reuseExistingServer: false` (`playwright.config.js`)
  - `PLAYWRIGHT_PORT` — preview port, default `4321` (`playwright.config.js`)
  - `PLAYWRIGHT_CHROMIUM_EXECUTABLE` — override Chromium path for sandboxes that cannot download Playwright's browser (`playwright.config.js`, `scripts/contact-sheet.mjs`)
  - `SHEET_BASE` — contact-sheet target origin, default `http://127.0.0.1:4321` (`scripts/contact-sheet.mjs`)
- Browser storage keys (not env vars) are the real configuration surface. Canonical notebook key is `nbmp:state:v8`. See `INTEGRATIONS.md`.

**Build:**
- `vite.config.js` — React + Tailwind plugins; `assetsInlineLimit: 64 * 1024`; dev server `host: "0.0.0.0"`, `port: 5000`, `allowedHosts: true`
- `playwright.config.js` — `testDir: ./tests/e2e`, `workers: 1`, `fullyParallel: false`, `testIdAttribute: "data-test"`, Chromium project, webServer builds then previews
- `index.html` — viewport, theme-color `#0A0A0C`, apple-mobile-web-app-capable, inline SVG favicon
- `package.json` scripts:
  - `dev` → `vite`
  - `build` → `vite build`
  - `preview` → `vite preview`
  - `test` → `node --test`
  - `test:e2e` → `playwright test`
  - `test:e2e:ui` → `playwright test --ui`
  - `test:all` → unit then e2e
  - `build:artifact` → `vite build` then `node build-artifact.mjs`
- No ESLint, Prettier, Biome, or TypeScript config files.

## Platform Requirements

**Development:**
- Node `^20.19.0 || >=22.12.0` (Vite 7). Prefer current LTS or the Replit `nodejs-24` module.
- `npm install` from the repo root (`scripts/post-merge.sh` runs `npm install --no-audit --no-fund`).
- Chromium once for the browser suite: `npx playwright install chromium`. If the image already has a browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
- Dev URL: `http://0.0.0.0:5000` (`npm run dev`; Replit workflow `Start application` in `.replit`).

**Production:**
- Static SPA. `npm run build` emits `dist/`. Preview with `npm run preview`.
- Single-file artifact: `npm run build:artifact` writes `artifact/planner.html` with CSS + JS inlined. The artifact host wraps its own `<head>`/`<body>` and a CSP that blocks every external request — fonts, scripts, and styles must be inline. `build-artifact.mjs` also injects a viewport meta because the host owns `<head>`.
- Cloudflare Sites adapter: `scripts/sites-worker.js` is a Worker that serves `env.ASSETS` and falls back to `/index.html` on 404. Packaging expects Vite output under `dist/client` and the worker under `dist/server`.
- Replit: module `nodejs-24`, port 5000 mapped to external 80, webview workflow.
- Target browsers: modern Chromium-class engines (the e2e project is Desktop Chrome at 1280×900). Touch / iOS Safari constraints are encoded in comments and tests (no zoom on focus, `viewport-fit=cover`, host `window.storage` for embeds). There is no service worker and no `manifest.json` in source.

---

*Stack analysis: 2026-08-13*
