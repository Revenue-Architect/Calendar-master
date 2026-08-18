# Memory index

- [Calendar read projections](calendar-read-projections.md) — UI must read events via visible/availability projections, never raw occurrence queries; segments bucket by their own `date`/`segmentId`.
- [Playwright runtime setup](playwright-runtime-setup.md) — fresh workspaces may lack Chromium/native libs; keep test setup from adding unrelated Replit metadata.
- [Sheet motion scheduling](sheet-motion-scheduling.md) — serialize compositor entry motion and layout-driven height changes; never observe/rewrite sheet height during entry.
