# Planner

A single-page day planner: a 24-hour timeline, an actions list with hold-to-complete
and swipe gestures, recurring events and tasks, reminders, XP/levels/streaks, and ten
themes. All state is local to the device.

## Running it

```bash
npm install
npm run dev      # dev server
npm run build    # production bundle into dist/
npm run preview  # serve the built bundle
```

## Layout

| Path            | What it is                                                     |
| --------------- | -------------------------------------------------------------- |
| `src/Planner.jsx` | The entire app — one component tree, no other source dependencies |
| `src/main.jsx`  | Entry point: mounts `Planner` and provides the storage shim       |
| `src/index.css` | Tailwind import plus page-level resets                            |

## Storage

`Planner.jsx` persists through a host-provided `window.storage` object
(`get(key) -> {value}` / `set(key, value)`). Running standalone there is no host, so
`src/main.jsx` installs a `localStorage`-backed shim when `window.storage` is absent.
If a real host API is present it is left untouched. Everything is stored under the key
`nbmp:state:v4`; if a write fails, Settings shows a warning and the data can be
exported to a file instead.

Settings can export the calendar as `.ics` or the full state as `.json`, and import a
previously exported `.json` (which replaces everything, behind a confirmation).

## Keyboard

| Key   | Action              |
| ----- | ------------------- |
| `←` `→` | Previous / next day |
| `T`   | Jump to today       |
| `N`   | New event           |
| `/`   | Search              |
