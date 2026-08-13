# Calendar Master resilience and accessibility hardening

**Date:** 2026-08-12  
**Status:** Approved for implementation  
**Scope:** Evaluation findings 1, 2, 4, 5, and 6  
**Explicit exclusion:** Evaluation finding 3, cross-device sync and release-boundary decisions

## Outcome

Make the current local-first notebook safer and clearer at accessibility, storage-failure, slow-bootstrap, gesture-discovery, and stress boundaries without changing its product model, visual identity, or interaction semantics. The existing React/Vite architecture remains in place and the current `DESIGN.md` vocabulary is preserved where it still matches the implementation.

## Approach

Use targeted changes in the existing application rather than introducing a new resilience framework, accessibility dependency, or localization system. The current code already has reusable native-field, sheet, storage-reporting, shortcut, and Playwright helpers. The work will extend those boundaries and add deterministic coverage around them.

## 1. Native field semantics and inactive controls

The composer’s direct native date/time inputs will receive semantic accessible names while keeping the existing visible labels and layout. Names include `Start time`, `End time`, `Event date`, `Last event day`, `Action time`, `Due date`, and `Repeat until` as applicable to the current branch.

The Day-view zoom-in control has no valid action and currently renders as a blank disabled button. It will be omitted in Day view; Week and Month retain their existing zoom controls. Browser assertions will be updated to test the actual available action rather than a meaningless disabled node.

## 2. Scoped storage status and recovery

Storage failures remain represented by the existing scope set, but the UI derives two explicit classes:

- **Canonical failure:** `planner` or `device`; the notebook may not be durable.
- **Supporting failure:** preferences, reminders, motivation, or diagnostics; notebook records can remain durable.

Canonical failure renders one responsive alert with wrapping safety copy and an explicit `SAVE A COPY` action. It must remain readable at 320px and 390px, never rely on truncation, and avoid implying that an unseen damaged notebook was successfully recovered. Supporting-only failures stay out of the red global alert and appear as scoped guidance in Settings. Backup-nudge suppression will use the canonical-risk state rather than the broad set size.

The local-only boundary remains explicit. No account, sync, provider, or cross-device behavior is added.

## 3. Slow bootstrap recovery

The existing `OPENING THE NOTEBOOK` state remains the first state. A bounded watchdog changes the copy to `STILL OPENING THE NOTEBOOK` if bootstrap exceeds the recovery threshold and exposes a safe `RELOAD` action. The watchdog is cancelled when bootstrap completes and cannot seed, overwrite, or discard stored notebook data. A delayed-storage browser test proves the recovery state appears; the normal fast path remains unchanged.

## 4. Gesture orientation

The existing `SHORTCUTS` sheet remains the single help surface. A new `GESTURES` group documents hold-to-create, hold-and-drag, edge resize, scheduled-Action swipe completion, and scroll-versus-hold arbitration. The list is generated from the same source as the keyboard shortcuts so it cannot drift from the UI.

The Timeline receives one dismissible, non-modal first-use hint. It is a UI-only preference, not notebook content and not a new onboarding sheet. The hint points to the existing Shortcuts surface and disappears after dismissal or a recognized first-use interaction. If storage is unavailable, it is session-safe and must not block planning.

## 5. Stress and performance coverage

Add a focused Playwright quality suite to the normal browser run. It will cover:

- accessible names on visible date/time controls and actionable controls;
- blocked and delayed storage;
- 320px/390px responsive layouts;
- RTL direction and long mixed-script labels/content;
- 200% reflow simulation;
- a seeded notebook with at least 1,000 records;
- rapid timeline scrolling and repeated lane/card updates.

The performance assertion is deliberately conservative: browser errors, horizontal overflow in supported states, and severe long tasks fail; low-frequency intentional transitions are not removed merely because a static detector reports a layout property. A trace/capture path records the stressed motion surface for review without making ordinary CI depend on a fragile frame-rate threshold.

## Error handling and compatibility

- Existing planner data, recurrence behavior, drag behavior, completion/reopen behavior, haptics, reminders, and local export remain unchanged.
- Supporting-store failures never block the canonical notebook from opening.
- Canonical read failure continues to use the existing in-memory safety path with autosave blocked.
- Reduced-motion behavior remains immediate and usable.
- The design does not alter themes, typography tokens, animation curves, or the cross-platform product roadmap.

## Verification gates

1. Focused unit tests for any new pure status/watchdog helpers.
2. Focused Playwright coverage for semantics, storage, help, reflow, RTL, volume, and stressed motion.
3. Existing full unit and browser suites remain green.
4. Production build succeeds.
5. Visual captures confirm the storage alert, Shortcuts Gestures section, first-use hint, narrow composer, and Timeline under stress.
6. Only the intended spec, source, and test files are committed; existing untracked audit artifacts remain untouched.

## Non-goals

- No implementation of cross-device sync or account infrastructure.
- No redesign of the Timeline, navigation shell, card geometry, or motion language.
- No new localization framework.
- No blanket removal of layout transitions or the documented arrival spring.
