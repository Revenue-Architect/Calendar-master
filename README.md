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

| Path              | What it is                                            |
| ----------------- | ----------------------------------------------------- |
| `src/Planner.jsx` | The whole app — one component tree                    |
| `src/storage.js`  | Where state is persisted, and the only I/O in the app |
| `src/main.jsx`    | Entry point: mounts `Planner`                         |
| `src/index.css`   | Tailwind import plus page-level resets                |

## Storage

`src/storage.js` prefers a host-provided `window.storage`
(`get(key) -> {value}` / `set(key, value)`) when the planner is embedded, and falls
back to `localStorage` otherwise, under the key `nbmp:state:v4`.

Reads never reject — a failure just means "nothing saved yet", and the planner seeds
itself. Writes do reject, so if the device can't be written to (quota, Safari private
mode, disabled cookies) Settings says so and points at export instead. That check runs
at load, so the warning appears before you've lost anything rather than after the
first failed save.

Settings can export the calendar as `.ics` or the full state as `.json`, and import a
previously exported `.json` (which replaces everything, behind a confirmation).

## Overdue vs. recurring

Overdue means unfinished work that still carries a debt, so it counts one-off tasks
only. A missed day of a recurring task is not a debt — you don't owe yesterday's walk
on top of today's, and today's instance is already on the page — so recurring
instances are excluded, matching how deadlines already treat them. The streak carries
the "did you keep it up" signal instead. This also keeps the OVERDUE count and the
PULL IN button in agreement: everything counted is something the button can move.

## Keyboard

| Key   | Action              |
| ----- | ------------------- |
| `←` `→` | Previous / next day |
| `T`   | Jump to today       |
| `N`   | New event           |
| `/`   | Search              |
