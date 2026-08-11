# Floating Navigation Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible, animated floating-navigation shell to the existing Planner at desktop and mobile widths.

**Architecture:** Keep navigation state in `Planner`, add one presentation-only `NavigationShell` helper in `src/Planner.jsx`, and place the current application in a transformable surface wrapper. CSS custom properties defined on the root shell own all geometry and timing. Navigation destinations call existing planner actions rather than adding routes or duplicated data.

**Tech Stack:** React 19, Vite, native CSS transitions, Node test runner, Playwright.

## Global Constraints

- Preserve all existing Planner domain state, dialogs, keyboard commands, gestures, and persistence.
- Use `closed`, `opening`, `open`, and `closing` state values, with no overshooting spring.
- Use `cubic-bezier(0.16, 1, 0.3, 1)`, 320ms page travel, 240ms content reveal, and 28ms item stagger.
- Centralize `--nav-width`, `--nav-gap`, `--nav-page-scale`, `--nav-page-radius`, `--nav-page-shadow`, `--nav-page-duration`, `--nav-content-duration`, and `--nav-item-stagger` on the root shell.
- The mobile layout intentionally retains the desktop-style shift-and-scale card treatment, using mobile CSS overrides.
- Support trigger ARIA, focus handoff/restore, Escape, outside press, and `prefers-reduced-motion`.
- Production code must be preceded by a failing Playwright test.

---

### Task 1: Define the user-visible navigation contract

**Files:**
- Create: `tests/e2e/navigation-shell.spec.js`

**Interfaces:**
- The menu trigger is `[data-test="nav-toggle"]`.
- The transformable planner page is `[data-test="app-surface"]`.
- The shell state is carried in `[data-test="nav-shell"]` through `data-nav-state`.
- The primary navigation is `role="navigation"` with accessible name `Primary navigation`.

- [x] **Step 1: Write the failing desktop test**

```js
test("opens a labelled floating shell and restores focus after Escape", async ({ page }) => {
  await openPlanner(page);
  const trigger = page.getByTestId("nav-toggle");
  const shell = page.getByTestId("nav-shell");
  const surface = page.getByTestId("app-surface");

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(shell).toHaveAttribute("data-nav-state", "open");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(surface).toHaveClass(/nb-app-surface-open/);

  await page.keyboard.press("Escape");
  await expect(shell).toHaveAttribute("data-nav-state", "closed");
  await expect(trigger).toBeFocused();
});
```

- [x] **Step 2: Write the failing destination, outside-press, mobile, and reduced-motion tests**

```js
test("destinations run existing planner actions and close navigation", async ({ page }) => {
  await openPlanner(page);
  await page.getByTestId("nav-toggle").click();
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("tab", { name: "ACTIONS", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
});

test("outside press closes the panel and mobile uses the floating-card mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlanner(page);
  await page.getByTestId("nav-toggle").click();
  await expect(page.getByTestId("app-surface")).toHaveClass(/nb-app-surface-open/);
  await page.getByTestId("app-surface").click({ position: { x: 370, y: 400 } });
  await expect(page.getByTestId("nav-shell")).toHaveAttribute("data-nav-state", "closed");
});
```

- [x] **Step 3: Run the new file and verify RED**

```powershell
npx playwright test tests/e2e/navigation-shell.spec.js
```

Expected: the test fails because no menu trigger or navigation shell exists.

### Task 2: Implement the stateful shell and responsive motion

**Files:**
- Modify: `src/Planner.jsx`

**Interfaces:**
- `NavigationShell({ phase, T, triggerRef, onToggle, onClose, onTimeline, onActions, onSetup, onNotes, onToday, reduced })` renders only navigation chrome and calls supplied actions.
- `Planner` owns `navPhase`, uses a close timer of 320ms, and owns page and trigger refs.

- [x] **Step 1: Add navigation state and focus behavior**

Add `navPhase`, a menu trigger ref, a navigation focus ref, and a close timer ref to `Planner`. `openNavigation` sets `opening`, waits one animation frame, then sets `open` and focuses the first navigation destination. `closeNavigation` sets `closing`, restores `closed` after 320ms, and returns focus to the trigger. Install a keydown listener that closes only an open or opening navigation on Escape.

- [x] **Step 2: Add the navigation component and connect real destinations**

Render Timeline, Actions, Setup, Notes, and Today in that order with existing state setters and `jumpTo(todayKey)`. Each action plays the existing click/tick feedback, applies its existing state change, and calls `closeNavigation`.

- [x] **Step 3: Wrap the app surface and add motion tokens**

Make the root a `data-test="nav-shell"` shell. Make the existing Planner root a `data-test="app-surface"` surface. Add root-level CSS variables and transition `.nb-app-surface` through `inset`, `transform`, `border-radius`, and `box-shadow`. In the open state, the surface begins after the panel width, retains a dark margin at right/top/bottom, and scales from top left. Do not place a scrim over the page.

Add `@media (max-width: 639px)` token overrides:

```css
--nav-width: min(78vw, 320px);
--nav-gap: 11px;
--nav-page-scale: .94;
--nav-page-radius: 16px;
```

Hide navigation movement and stagger under either OS or in-app reduced motion while keeping open/closed state changes and accessibility behavior.

- [x] **Step 4: Run the focused browser test and verify GREEN**

```powershell
npx playwright test tests/e2e/navigation-shell.spec.js
```

Expected: all navigation assertions pass.

### Task 3: Regression QA, build, and release

**Files:**
- Modify: `docs/qa/2026-08-11-floating-navigation-shell.md`
- Inspect: `src/Planner.jsx`, `tests/e2e/navigation-shell.spec.js`, and the final Git diff

- [x] **Step 1: Record the visual/interaction QA checklist**

Document desktop and mobile open/close, outside press, Escape, focus, destinations, reduced motion, no scrim, no bounce, and no impact on the existing timeline/Actions UI.

- [x] **Step 2: Run verification**

```powershell
npm test
npm run build
npm run test:e2e
git diff --check
git status -sb
```

Expected: all commands succeed and no unrelated source file changes are present.

- [ ] **Step 3: Commit and push to main**

Commit the navigation shell, tests, QA record, plan/spec, and worktree ignore entry. Fast-forward `origin/main` from the isolated branch only after the verification commands above pass. Verify the remote hash and clean status after push.
