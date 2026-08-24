# Timeline Gesture Ownership Reliability — QA Record

## Provenance

- Base: `c966c79c67a7b61144448be07c863154f9171c89` (PR #14 merge)
- Validated implementation tree: `967dae8`
- Branch: `fix/timeline-gesture-reliability`
- Environment: Windows; Node `v24.18.0`; npm `11.16.0`; Playwright `1.62.1`; Chromium `151.0.7922.34`
- Chromium executable: `C:\Users\Kamran\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`

Files changed before this record:

- `src/Planner.jsx`
- `src/features/planner/TimelineEventResizeControls.jsx`
- `src/features/planner/timelineInteractionState.js`
- `src/features/planner/timelineInteractionState.test.js`
- `tests/e2e/timeline-polish.spec.js`
- `tests/e2e/timeline-touch.spec.js`
- `docs/plans/2026-08-24-001-fix-timeline-gesture-ownership-reliability-plan.md`

No motion, navigation, Week, ribbon, domain, recurrence, persistence, Composer, or Sheet implementation changed.

## Root causes and corrections

1. The 300ms lift timer activated a touch gesture, but a stationary lifted release had no path back to the card's tap outcome. Event and Action long holds could therefore end as neither move nor inspect. The interaction state now records whether any proposal or semantic drop target ever changed; a lifted item with no manipulation aborts its live gesture cleanly and opens its own inspector.
2. Day touchstart opened the Timeline scroll session before any scroll intent existed and did not close it at sequence end. A later layout-driven scroll could impersonate the old finger. Scroll authorization now begins only from meaningful vertical movement or a native scroll event, ends with bounded momentum after a real scroll, and expires on cancel or surface cleanup.
3. Full-width Event resize overlays also acted as coarse touch targets. On short cards the bottom edge owned the visual centre, so a body drag extended time. Mouse/pen retain full-width top/bottom edges; touch receives centred 44px semantic cues whose heights leave a body-owned seam at every rendered duration.
4. Proposal history originally covered time and day only. A same-time Action drop over a sibling could be misread as a tap before reorder persistence. `overTask` is now a semantic manipulation target.
5. Releasing a genuine scroll immediately expired chrome authorization. The session now ends with its existing bounded momentum window, while stationary taps never begin a session. The near-midnight regression now uses a real touch movement before testing post-release momentum.

The existing interaction engine, snapping, domain writes, completion swipe, JOIN, recurrence, lane packing, and Week gesture ownership remain authoritative. No drag library was added.

## Test-first evidence

Exact-base RED reproduction produced five causal failures and six controls:

- stationary 1000ms Event hold: record unchanged, inspector missing;
- stationary 1000ms Action hold: record unchanged, inspector missing;
- completed touch sequence left scroll authorization live;
- 10-minute Event centre resolved to end resize;
- 15-minute Event centre resolved to end resize;
- controls: Event and Action moves after 600ms/1000ms, pre-lift physical scroll, and a 30-minute Event body move already worked.

Negative controls were executed locally and not committed:

- removing stationary-release reconciliation made both 1000ms inspector tests RED;
- restoring speculative touchstart scroll authorization made the post-sequence chrome test RED;
- marking the full-width Event edges as touch targets made 10/15-minute centres resize to 80 minutes;
- restoring fixed 8px/12px touch zones made 16/20/23-minute Event body tests RED;
- removing `overTask` proposal history made the Action reorder regression RED.

## Automated verification

- `src/features/planner/timelineInteractionState.test.js`: `25/25` passed.
- `tests/e2e/timeline-touch.spec.js`: `46/46` passed.
- Action drag/resize/timeline/completion focus: `31/31` passed, including deliberate right-swipe COMPLETE, partial-swipe return, body move, estimate resize, and hold-to-complete.
- Focused post-review ownership set: `18/18` passed.
- Post-efficiency touch/momentum set: `10/10` passed.
- Full touched-test repeat: `158/160` reached product assertions; two runs failed during fixture startup because `day-stream` never mounted. Both failing product cases then passed `10/10` each in a fresh isolated run (`20/20`). No retry option was used.
- `npm test`: `654/654` passed.
- `npm run build`: passed (`190` modules transformed).
- Final Chromium, one worker, isolated port: `416/416` passed.

Earlier focused gates were also green: Timeline gestures `23/23`, gesture isolation `6/6`, interaction contracts `11/11`, Week drag `11/11`, recurrence + JOIN `15/15`, and Timeline chrome `4/4`.

## Windows Chrome product and visual QA

Visible Chrome was inspected at desktop `1280×900`, mobile `390×844`, and short mobile `390×601`, with additional desktop sampling at the live browser's `1304×675` viewport and DPR `1.1458`.

Desktop observations:

- Event body drag persisted its new slot; the two full-width mouse edges separately resized start and end.
- Short Event centres remained body-owned while the centred touch cues stayed visibly associated with their edges.
- A scheduled estimated Action body moved from `6:50 PM` to `7:50 PM` while preserving `1h`.
- Dragging the explicit 48px Action estimate rail kept `7:50 PM` fixed and extended `1h` to `1h 30m`; the card grew downward with no lane jump or inspector opening.
- The Action completion target remained a distinct compact left lane, the body remained continuous, and the estimate owner remained a distinct right lane. No overlap or ambiguous hit area appeared.
- `ANY TIME` remained visible; no unexplained full-width horizontal line, overflow, blank ribbon, or navigation/Composer regression appeared.

Mobile observations:

- Event and Action touch targets remained readable at both phone heights.
- Pre-lift vertical movement retained Timeline scroll ownership; after lift the active card owned the sequence and the Timeline did not travel underneath it.
- Touch resize cues did not cover the Event title/body lane; the Action estimate affordance remained explicit and separate from COMPLETE.
- Navigation return rail, Timeline chrome, card stacking, and short-viewport edge spacing remained visually intact.

Automated CDP touch sequences cover browser arbitration, but they are not physical-device certification. Physical Android Chrome and iOS Safari validation remain pending.

## Review and residual risk

Compound review initially found the 16–23-minute centre-ownership gap and the same-time Action reorder gap; both received RED controls and focused fixes. The refreshed review verdict was **Ready to merge** with no actionable findings. A final reuse/quality/efficiency pass removed a write-only scroll flag, avoided proposal-history work on mouse frames, made inactive scroll-session end a no-op, reused local date-time helpers, and hardened geometry failures.

Residual release gate: physical Android Chrome and iOS Safari touch/inertial-scroll validation.
