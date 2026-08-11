# Floating Navigation Shell Design

## Status

Approved on 2026-08-11. The selected mobile treatment deliberately mirrors the desktop card transform: it is more distinctive, even though it leaves less usable page area while navigation is open.

## Goal

Add a calm, dark navigation shell around the existing Planner. On desktop, opening navigation makes the current light planner surface travel right, reduce slightly, round its corners, and sit above the shell. On mobile, the same direction and scale language remains, with a narrower panel and a slightly less aggressive scale so the current context remains legible.

## Existing Product Constraints

- `src/Planner.jsx` owns the rendered shell and uses theme tokens (`T`) for colour.
- The current app is a one-page planner with Timeline, Agenda, Actions, notes, settings, and a command palette.
- Existing motion avoids uncontrolled springs and disables animation for both OS and in-app reduced-motion preferences.
- The current `main` checkout has diverged from `origin/main`; implementation is isolated from the fetched remote head in an agent worktree.

## Interaction Model

The shell has four semantic phases: `closed`, `opening`, `open`, and `closing`.

- A menu trigger in the left side of the dark top rail toggles the navigation.
- Opening immediately darkens the containing shell, begins the page transform, then makes the navigation accessible and reveals its content.
- Navigation items use a 28ms stagger. Each enters from 10px left at zero opacity with a restrained `cubic-bezier(0.16, 1, 0.3, 1)` timing curve.
- Closing reverses item motion, then restores the page. The dark shell returns to the normal planner background only after the page transition ends.
- Clicking the exposed shell beside the navigation, or pressing Escape, closes the navigation.
- Opening moves focus to the navigation's first actionable item. Closing restores focus to the menu trigger.

## Layout And Motion Tokens

Use the following CSS custom properties on the shell wrapper so visual tuning remains local:

```css
--nav-width: 304px;
--nav-gap: 18px;
--nav-page-scale: 0.965;
--nav-page-radius: 18px;
--nav-page-shadow: 0 18px 48px rgb(0 0 0 / 0.28);
--nav-page-duration: 320ms;
--nav-content-duration: 240ms;
--nav-item-stagger: 28ms;
--nav-ease: cubic-bezier(0.16, 1, 0.3, 1);
```

Desktop page translation is `calc(var(--nav-width) + var(--nav-gap))`. Mobile keeps the same visual model but uses a `min(78vw, 320px)` panel, an 11px gap, a `0.94` scale, and 16px radius. The mobile page remains interactive only after the navigation has closed.

The main planner surface owns its clipping, shadow, and transform. The dark shell supplies separation; no translucent black scrim is layered over the page.

## Navigation Content

The ordered primary destinations are Timeline, Actions, and Setup. A concise secondary group provides Notes and Today. Each destination has a real action:

- Timeline changes the existing view mode to `timeline` and closes navigation.
- Actions changes the existing view mode to `actions` and closes navigation.
- Setup opens the existing settings sheet and closes navigation.
- Notes opens the existing notebook and closes navigation.
- Today returns to today's date and closes navigation.

The visual treatment remains subdued: a small app label, an active state backed by a low-contrast shell tone, short labels, and an unobtrusive membership/status card below the main destinations.

## Accessibility

- The trigger is a semantic button with `aria-label="Open navigation"`, `aria-controls`, and `aria-expanded`.
- Navigation is labelled with `aria-label="Primary navigation"`.
- The closed page is inert to pointer events while the panel is open, preventing accidental clicks through the exposed card.
- Escape, outside-shell click, and visible focus rings work on both desktop and touch-sized mobile targets.
- Reduced-motion suppresses transform travel and staggered translation, retaining only immediate state visibility.

## Implementation Shape

- Add a focused `NavigationShell` component beside Planner helpers in `src/Planner.jsx`; it receives only navigation state, close/toggle callbacks, and destination actions.
- Keep the existing content in a `.nb-app-surface` wrapper. The component only decorates the outer shell and orchestrates focus; it does not duplicate planner state or move domain logic.
- Add animation classes and tunable custom properties to the component's existing scoped style block.
- Use the existing `viewMode`, `setNotebook`, `setSettings`, `jumpTo`, `todayKey`, and `reducedMotion` state/actions.

## Test Plan

Add Playwright coverage that proves:

1. the menu trigger exposes the accessible state and opens a labelled navigation;
2. the light app surface receives the transformed open-state class and is restored after close;
3. outside-shell click and Escape close it;
4. focus moves into navigation and returns to the trigger;
5. Timeline, Actions, Setup, Notes, and Today perform their real existing actions;
6. the mobile viewport uses the same floating-card mode with mobile token overrides;
7. reduced motion suppresses the travel/stagger animation classes.

## Non-Goals

- Do not change calendar, Actions, notes, search, or sheet behavior.
- Do not add a provider-backed user account, persistent navigation preference, or a new route system.
- Do not add goo, blur, or bouncy physics to the navigation motion.
