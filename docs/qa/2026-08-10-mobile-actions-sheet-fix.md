# Mobile Actions Sheet Overlap Fix

## Problem
When `viewMode` is set to `"actions"` on mobile, the bottom sheet still reserved space and rendered, causing overlap.

## Fix applied in src/Planner.jsx (three sites)
1. `const sheetPad = viewMode === "actions" ? "0px" : (sheet ? "76dvh" : "64px");`
2. View mode picker also does `if (mode === "actions") setSheet(false);`
3. Mobile sheet wrapped in `{viewMode !== "actions" && ( ... )}`

The full patched `src/Planner.jsx` is available in the conversation artifacts.
