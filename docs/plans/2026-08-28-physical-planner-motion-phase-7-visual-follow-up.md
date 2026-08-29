# Physical Planner Motion — Phase 7 Visual Follow-up

Status: Phase 8 implementation checkpoint complete. Phase 7 visual certification remains open for the source forms that have not yet been inspected manually.

## What is confirmed

- Day timed Event open/close was manually inspected in Windows Chrome.
- The Event stayed in its timeline lane, the sibling stayed painted, and the pointer path showed no visible scrim, blur, or flight to the viewport centre.
- The existing automated coverage exercises Week timed, Day all-day, Week all-day, recurrence isolation, the Timeline Lens, JOIN suppression, source restoration, and dynamic disclosures. Treat that as behavioral evidence, not a substitute for the visual gate below.
- Phase 8 Edit now reconfigures the already-expanded Event surface. The dedicated browser regression is `Event Edit reconfigures the expanded surface without remounting its object` in `tests/e2e/motion.spec.js`.

## Required Chrome visual pass before calling Phase 7 complete

Use the local preview at `http://127.0.0.1:5174/` and temporary test data only. Remove temporary planner data after the pass.

For each source form, inspect opening at 0%, 25%, 50%, 75%, and 100%, then closing at 100%, 75%, 50%, 25%, and 0%:

| Source form | Manual inspection | Notes |
| --- | --- | --- |
| Day timed Event | Confirmed | Recheck after any later motion change. |
| Week timed Event | Pending | Exact Week card remains the spatial anchor; narrow cards may widen only into the timeline plane. |
| Day all-day Event | Pending | Expand from the all-day ribbon, preserving its lane identity. |
| Week all-day Event | Pending | Expand from the exact Week ribbon; do not cover the Actions rail. |

At every frame, record:

- no dark scrim, backdrop blur, or whole-screen dimming;
- source top/left stays fixed while the visual carrier grows;
- the Event reads as one object: shell, marker, title, time, and corners remain continuous;
- title and time do not stutter, duplicate, disappear, or snap between card and expanded hierarchy;
- the timeline and visible cards below yield visually, while logical time/lane/scroll geometry stays unchanged;
- no hard black extended border, clipped bottom field, or nested-scroll surprise;
- the expanded surface remains inside the timeline plane and does not reveal the source-only JOIN control at an edge;
- closing reverses cleanly to the latest live/remounted semantic source.

## Dynamic and interaction follow-up

- Open Repeat, verify the Event grows to contain its options, choose a value, close the options, and verify both the carrier and Timeline Lens shrink without a snap.
- Repeat the same check for Alerts (or the next equivalent expanding field).
- Test adjacent/overlapping cards, including a linked Event with a JOIN URL; only the selected Event may suppress its source paint.
- Test a recurring Week occurrence with a visible sibling; the sibling must remain fully painted and the close must return to the selected dated occurrence.
- Move or remount the source while Inspector is open, then close; the return target must be the latest semantic geometry, not the original location.
- Run pointer drag, resize, hold, tap, JOIN, touch-scroll, and post-close click paths in both Day and Week views.
- Run Enter and Space activation; it must open the instant, source-less Inspector without the Timeline Lens or spatial travel.
- Run reduced-motion mode; preserve focus, Escape, scroll, and functionality with no spatial travel or lens animation.
- Verify focus restore, inert/background behavior, body-scroll preservation, mobile keyboard protection, source-disconnected fallback, and dirty-close veto.
- Verify Phase 8 Edit in the expanded Event: same anchor, same Sheet node, same morph carrier, no entrance replay, draft/Revert/Save semantics intact, and no second editor surface.

## Evidence capture and acceptance

Capture screenshots or short recordings locally for the four source forms and the Repeat/Alerts sequence. Do not commit temporary visual artifacts. The visual verdict is PASS only when a human would say “I expanded this Event,” not “a modal opened.”

Action cards are not part of the Phase 7 Event morph. They currently remain on their existing Action/Sheet interaction path while participating only as passive Timeline Lens targets; a separate Action Inspector phase must cover in-place Action expansion.

## Phase boundaries

- Phase 7 owns Event source registration, the in-place Event Inspector morph, and its visual certification.
- Phase 8 owns Inspector → Edit same-object reconfiguration; it must not introduce a second Sheet or remount the Inspector.
- Phase 9/10 own Day/Week creation.
- A later Action phase owns Action card expansion.
