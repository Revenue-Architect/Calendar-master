# Floating Navigation Shell QA — 2026-08-11

## Passed

- Desktop: the dark shell, full-height navigation, shifted/scaled page surface, 18px radius, and restrained shadow render without a scrim.
- Mobile (390 × 844): the intentionally selected scale-and-shift card treatment renders with a 16px radius.
- Menu trigger, outside press, Escape, focus handoff/return, all five destinations, and reduced-motion semantics pass in Playwright.
- Visual inspection at desktop and mobile widths found no console errors, bounce, or filter/blur artifacts.
- `npm run build` and `npm test` pass; 485 unit tests pass.
- `git diff --check` passes.

## Refinement pass

- Replaced the prior sharp ease-out with `cubic-bezier(.22,.61,.36,1)`: it has no overshoot and gives the page one clean settle.
- Removed the black header rail; the header now returns to the active planner theme while the menu and information controls remain available.
- Increased the open-card top and bottom insets to 18px on desktop and 14px on mobile, and increased navigation labels to 15px.
- Browser inspection confirmed the open card has 18px top/bottom margins, an 18px radius, the new timing function, and no console errors. The focused navigation suite still passes (5/5); `npm test` passes (485/485).

## Note

- The full end-to-end suite exceeded the local two-minute command limit before reporting a failure. The new focused navigation suite passed in 8.2 seconds; the existing unit suite passed in 7.7 seconds.
