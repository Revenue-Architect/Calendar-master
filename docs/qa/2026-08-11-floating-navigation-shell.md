# Floating Navigation Shell QA — 2026-08-11

## Passed

- Desktop: the dark shell, full-height navigation, shifted/scaled page surface, 18px radius, and restrained shadow render without a scrim.
- Mobile (390 × 844): the intentionally selected scale-and-shift card treatment renders with a 16px radius.
- Menu trigger, outside press, Escape, focus handoff/return, all five destinations, and reduced-motion semantics pass in Playwright.
- Visual inspection at desktop and mobile widths found no console errors, bounce, or filter/blur artifacts.
- `npm run build` and `npm test` pass; 485 unit tests pass.
- `git diff --check` passes.

## Note

- The full end-to-end suite exceeded the local two-minute command limit before reporting a failure. The new focused navigation suite passed in 8.2 seconds; the existing unit suite passed in 7.7 seconds.
