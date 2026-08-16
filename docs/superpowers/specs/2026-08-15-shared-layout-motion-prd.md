# Shared Layout Motion PRD and Design

**Status:** Approved for documentation; implementation is gated on this PRD  
**Date:** 2026-08-15  
**Repository baseline:** `origin/main` at `3e12857`  
**Product owner:** Kamran  
**Visitor mode:** Operate  

**References**

- Recordings: `S:\DCIM\Screen recordings\Screen_Recording_20260814_183549_Chrome.mp4` (NEW morph, 13.19s) and `S:\DCIM\Screen recordings\Screen_Recording_20260814_182827_Chrome.mp4` (expanding sibling pills, 11.77s)
- Incumbent visual authority: `DESIGN.md`
- Incumbent motion geometry: `src/features/motion/fluidGeometry.js`
- Incumbent sheet morph: `src/Planner.jsx` `Sheet`, `nbnotchin`, `recentFluidTriggerRect`
- Incumbent view switcher: `src/Planner.jsx` `PillNav`, `useLiquidPill`, `LiquidPillIndicator`
- Related design: `docs/superpowers/specs/2026-08-10-motion-stabilization-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-15-shared-layout-motion.md`

## 1. Executive decision

Recreate two reference *motions* on Calendar Master, not the Ikigro product those recordings came from.

1. **NEW becomes the composer.** The accent header control and the composer sheet are one object. The button-shaped hole opens into a sheet-shaped hole. The form is revealed only after that shape exists.
2. **TIMELINE / AGENDA / ACTIONS become expanding siblings** at compact width. The active tab is a raised plate that carries an icon and a word. Inactive tabs collapse to drawn icons and slide out of the way.

This is a translation of motion language into the incumbent web app. It is not a React Native port, not a second modal, not a zinc/lime costume, and not a license to animate `width`, `height`, `left`, or `top`.

The fortieth-time test still wins. NEW and view-switching happen all day. The motion must stay one object, under 320ms, interruptible from current geometry, and skippable under keyboard and reduced motion.

## 2. Problem

The recordings show a committed shared-layout language. Calendar Master already owns the correct engine and then under-commits the material:

- NEW already hides the real trigger, measures it, places the finished sheet at true size, and opens a rounded `clip-path` from the trigger rect (`fluidMorphFromRects` + `nbnotchin`, 320ms). Mid-open, the trigger label and body are already bound to that same timeline. What is missing is the *material* story: the clipped window should stay accent-filled until the shape has landed, then wash into `T.card`. Today the card color arrives too early, so the gesture reads as "a sheet fading in from a button" instead of "the button becoming the sheet."
- `PillNav` is still the older liquid idiom: three always-visible words and a traveling `LiquidPillIndicator` under them. That is stable and should remain the desktop behavior. It is not the compact-width recording, where inactive siblings collapse to icons and the plate *is* the active sibling.
- A Gemini React Native spec tried to reproduce both clips by interpolating `left/top/width/height` with clamped springs, hardcoding `#E2F952` / zinc, fading form contents after `progress > 0.4`, and mounting labels during width springs. That is the exact anti-pattern `fluidGeometry.js`, Impeccable's layout-transition detector, and `DESIGN.md` section 5 reject.

The product gap is therefore not "add shared layout." The gap is: finish the NEW material continuity the morph already implies, and give compact `PillNav` the expanding-sibling behavior the header can actually afford.

## 3. Job to be done

A person planning a day taps NEW or switches TIMELINE / AGENDA / ACTIONS many times before lunch.

- Tapping NEW must feel like the same accent object opening, not a second surface appearing.
- Switching views on a phone must feel like one raised plate sliding and growing a word, not three labels swapping color.
- Keyboard N / A / arrow-tabs must stay instant. Reduced motion must keep the end state and drop the travel.

Success is recognized by a paused mid-open frame, not by a demo GIF. If the 40% frame is not still the trigger, the motion failed.

## 4. Product-specific truth

Calendar Master is not Ikigro and must not become it.

| Keep | Do not copy from the recordings |
| --- | --- |
| One ground + exactly one accent (`T.accent`, `T.on`, `T.card`, `T.dim`) | Hardcoded `#E2F952`, zinc-900, `#141416` |
| Jost / mono / Georgia italic | Inter-ish 22/700 marketing titles |
| Existing composer fields and copy | "What's happening?", EVENT/ACTION costume, ADD TO TIMELINE restyle |
| Existing view modes and data | Ikigro / Tools / Tasks |
| Drawn SVG icons from the current icon set | Emoji or Unicode marks |
| Origin-revealed sheet at true size | Scale of form contents, RN `Modal`, layout springs |
| Named ease `cubic-bezier(.23, 1, .32, 1)` | Celebration springs on daily verbs |
| Compact-width collapsing pills | Collapsing TIMELINE on a wide desktop header |

Craft-floor bans that apply here:

- No kicker / eyebrow (`NEW` sitting above the composer title as decoration). The morph source label is a *stage skin*, not a heading.
- No emoji standing in for an icon system.
- Modal is not the first thought. The composer already exists as an origin sheet.

## 5. Motion thesis

**Focal moment:** NEW is one authored object. Accent pill, clipped accent card, wash to sheet, then form. Close is the reverse from current geometry.

**Continuity:** Compact view pills share one raised plate. The active sibling grows a word; neighbors translate out of the way.

**Feedback:** Press scale stays the global `.97 / 90ms` rule. View change still beeps `tick`. NEW still beeps `click`.

**Budget:** NEW 320ms enter / about 240ms exit. Pills 180–220ms. No page-load choreography. No library. CSS + WAAPI + the existing `fluidGeometry.js` helpers.

Personality is **Corporate / Operate**: clean, professional, no overshoot, exit faster than enter. One arrival spring remains reserved for rare celebrations, not these two verbs.

## 6. Motion 1 — NEW becomes the composer

### 6.1 Object story

The real header button is hidden for the life of the morph (`visibility: hidden`, already shipped). The sheet is the only painted object. It is not a new overlay fading on top of a still-visible NEW.

| Stage | Window | Paint |
| --- | --- | --- |
| source | 0–15% | clip = button rect, fill = `T.accent`, label NEW centered, body gone |
| reveal | 15–60% | clip + translate open; still `T.accent`; NEW holds until about 55% |
| wash | 55–80% | `T.accent` to `T.card` on the same surface (background-color, not a second overlay) |
| content | 60–100% | `.nb-notch-body` fades / translates 10px; NEW is gone |
| open | 320ms | settled |
| close | about 240ms | reverse from currentTime: body out, accent back, clip into button |

This matches the reference frames: lime square still in the header, then a full-size olive card with no readable type, then the dark form.

### 6.2 Geometry (already shipped, do not replace)

`fluidMorphFromRects(triggerRect, panelRect)` returns:

- `translateX / translateY`: trigger center minus panel center
- `insetX / insetY`: half the size delta per axis, clamped at 0

The panel is measured with its entry animation suppressed so `getBoundingClientRect` reports the destination box, not the first keyframe. CSS variables `--fluid-x`, `--fluid-y`, `--fluid-inset-x`, `--fluid-inset-y` drive `nbnotchin`:

- 0%: `translate(var(--fluid-x), var(--fluid-y))` and `clip-path: inset(var(--fluid-inset-y) var(--fluid-inset-x) round 999px)`
- 100%: `translate(0, 0)` and `clip-path: inset(0px 0px round 24px)`

Never introduce `left`, `top`, `width`, `height`, or `scale()` on a container that has form contents.

### 6.3 What this PRD changes

The geometry stays. The material staging changes.

1. Keep the clipped window **accent-filled through reveal**, not only during `morphStage === "source"`. Today `Sheet` switches `backgroundColor` from `morphSurface.background` to `T.card` as soon as the stage leaves `source` / `closing`. That is too early. Hold accent through `reveal`, then wash during `content`.
2. Keep `nb-morph-source-label` and `nb-notch-body` on the **same 320ms timeline** already landed in `3e12857`. Do not reintroduce wall-clock `setTimeout(70/115)` as the source of truth for visibility. Stages may still be named `source | reveal | content | open | closing`, but paint must follow the clip, not the clock.
3. Close with WAAPI / CSS reverse from current geometry. Cancel the label animation on close so a mid-flight dismiss does not leave a ghost NEW.
4. Keyboard N / A and any composer opened without a remembered press stay `morph: "none"`. `recentFluidTriggerRect()` remains press-only and short-lived.
5. `prefers-reduced-motion`: skip stages, jump to `open`, leave no source skin, keep opacity / focus / press scale.

### 6.4 What this PRD does not change

- Composer fields, EVENT/ACTION kind, quick-add, MORE OPTIONS, duration chips
- Sheet max width (`sm:max-w-md`), 24px radius, 88vh cap
- `+ ACTION` morph from the Actions column (same contract, same material rules)
- Search / command palette (still `morph: "none"`)

## 7. Motion 2 — compact expanding sibling pills

### 7.1 Object story

At compact width the view switcher is three siblings sharing one track:

- Active: raised accent plate + drawn icon + word (`TIMELINE` / `AGENDA` / `ACTIONS`)
- Inactive: icon-only square, dim ink, same 44x44 hit target
- On pick: outgoing word clips away, incoming word clips in, neighbors **translate** to make room, `LiquidPillIndicator` stretches along travel (cap 1.18 via `fluidPillStretch`) and settles

There is no second sliding thumb under three always-on labels. The plate is the active sibling.

At desktop width, keep today's behavior: three visible words and a traveling plate. Collapsing TIMELINE forty times a day on a wide header is costume, not help.

### 7.2 Why not Gemini's LinearTransition

Animating each pill's `width` reflows the month-navigator and crushes WEEK / MONTH. Calendar Master already learned this on Week JOIN: a 50px word on a ~45px column left a 5.7px title. The legal analog of height animation is `grid-template-columns: auto 0fr` to `auto 1fr` with `overflow: hidden` on the label, then FLIP the siblings with `transform`. Labels never mount or unmount.

Goo / droplet stays off this track. `PillNav` already rejected it: mounting a filter for the duration of a transition re-rasterises both ends.

### 7.3 Layout contract

- Tablist has a **reserved width**: max of (three collapsed icon slots + one word column). It must not shove WEEK / MONTH, TODAY, or NOTES. GooeySearch already taught this: a flourish that moves other people's buttons is a bug.
- Icons are drawn SVG, one stroke, currentColor. Reuse `CalendarIcon`, a list/agenda mark, and `CheckIcon`. Do not add emoji.
- Each tab is `icon + label` in a two-column grid. Inactive `0fr` + label opacity 0. Active `1fr` + opacity 1 after about 40ms.
- Hit target stays at least 44x44 on coarse pointers even when the word is gone (existing `:before` expansion rule).
- Keyboard pick (`event.detail === 0`, already plumbed) and reduced motion apply the end state with `transition: none`.
- `useLiquidPill` still measures `[data-active="true"]` and feeds `LiquidPillIndicator`. Prefer driving the indicator with `transform: translate3d()` plus a single width token rather than expanding its existing `left`/`width` transitions further. If the indicator must keep left/width for one release, that is an acknowledged exception to land and then replace; new sibling motion must not add more layout-property animation.

### 7.4 Breakpoint

Use the existing compact header / `sm` boundary already used by the chrome (the 390x844 phone viewport in e2e is the proof surface). Below that: expanding siblings. At `sm` and above: three words + traveling plate.

## 8. Architecture

Do not add a motion library. Do not add React Native files. Do not create `src/features/ui/MorphingModal.tsx`.

| Unit | Responsibility | Lives in |
| --- | --- | --- |
| `fluidMorphFromRects` | Trigger to panel clip geometry | `src/features/motion/fluidGeometry.js` (keep) |
| `fluidPillBox` / `fluidPillStretch` | Plate box + bounded stretch | same (keep) |
| `Sheet` notch staging | Accent hold, label/body timeline, reverse close | `src/Planner.jsx` `Sheet` |
| `PillNav` | Compact expanding siblings vs desktop labeled track | `src/Planner.jsx` `PillNav` |
| View icons | Drawn marks for the three modes | `src/Planner.jsx` icon helpers |
| Tests | Mid-morph material, pill lanes, keyboard, reduced motion | `tests/e2e/motion.spec.js`, new `tests/e2e/view-pills.spec.js`, `src/features/motion/viewPills.test.js` |

Planner.jsx is already large. This work may add a small `src/features/motion/viewPills.js` helper for reserved-width / column-template math if the compact layout needs a unit-tested function. Do not extract `Sheet` or `PillNav` unless a file split is required to land the tests cleanly.

## 9. Accessibility and input

- NEW and each view tab remain real `<button>`s. View tabs keep `role="tab"` / `aria-selected` / `tablist` / `aria-label="View mode"`.
- Icon-only inactive tabs keep a visible word for the active tab and an accessible name for every tab (`aria-label` = `TIMELINE` / `AGENDA` / `ACTIONS`).
- Focus must not land on a `visibility: hidden` NEW. The existing `tabIndex={-1}` while that source owns the morph stays.
- Keyboard-initiated view changes and composer opens do not travel.
- Reduced motion: end state, no travel, no leftover source skin, opacity/color allowed.
- Contrast: inactive icons use `T.dimText` / `T.dim`, never raw gray. Accent glyphs use `T.on`.

## 10. Testing strategy

Test-first. Write the failing assertion, watch the number, then implement.

### NEW / composer

Extend `tests/e2e/motion.spec.js` notch-morph contract:

- At 40% of `nbnotchin`: source label opacity at least 0.9, body opacity under 0.2 (already shipped).
- **New:** at 40%, the clipped sheet background is still accent-dominant (computed background matches `T.accent` / `morphSurface.background`, not `T.card`).
- At 100%: label gone, body visible, sheet is `T.card`.
- Reverse close from mid-open does not snap; NEW trigger is visible after close.
- Reduced motion: no source skin, composer open immediately.
- Keyboard N: `data-fluid-origin="none"`, trigger stays visible.

### Compact pills

Create `tests/e2e/view-pills.spec.js` at 390x844:

- Default TIMELINE tab shows a readable word lane (title box width > 20).
- AGENDA and ACTIONS are icon-sized and still at least 44px hit height.
- After picking ACTIONS, ACTIONS word lane > 20 and TIMELINE collapses without dropping below 44px.
- Neighbors move; WEEK / MONTH (or the zoom-out control) do not lose their lane.
- Keyboard pick is instant (no in-flight width/transform when `detail === 0`).
- Reduced motion: end state, no travel.
- Desktop 1280x900: all three words remain visible.

### Unit

If compact reserved-width math is extracted, cover it in `src/features/motion/viewPills.test.js`: three collapsed slots + one word is at most the reserved track; stretch still caps at 1.18.

Do not treat the historically timing-out full Playwright suite as the gate. Focused files plus `npm test` are the gate, matching recent motion work.

## 11. Anti-goals

- Do not paste Gemini's `MorphingModal.tsx` / `DynamicPillNavbar.tsx` into this repo.
- Do not write `docs/features/motion-components.md` from that spec.
- Do not restyle the composer into the Ikigro form.
- Do not animate layout-driving properties on the sheet or on sibling pills.
- Do not add Framer Motion / Reanimated / a spring library.
- Do not morph keyboard-initiated sheets.
- Do not collapse desktop view labels.
- Do not ship goo on `PillNav`.

## 12. Rollout

Two independently shippable implementation commits, in this order:

1. NEW material continuity on the existing notch morph. Smallest change. Already has e2e scaffolding.
2. Compact `PillNav` expanding siblings. New e2e file. Watch the month-navigator row.

Stop after those two. Do not bundle theme work, icon redesign of the rest of the chrome, or a native port.

## 13. Open decisions locked by this PRD

These were the live product choices. They are now decided:

- Motion only. This visual world.
- Phone / compact pills collapse. Desktop stays labeled.
- Existing composer contents.
- Accent is the active theme, never a hardcoded lime.

If a later change wants the Ikigro form or collapsing pills on desktop, that is a new PRD.

## 14. Completion criteria

The work is done when:

1. A paused NEW open at 40% of `nbnotchin` is still the accent trigger with a visible NEW and an unreadably-absent form.
2. A paused NEW open at 100% is this app's composer on `T.card`.
3. Close reverses into the header NEW without a snap from mid-flight.
4. On a 390-wide viewport, the view switcher matches the sibling-collapse story without crushing WEEK / MONTH.
5. On desktop, three words remain.
6. Keyboard and reduced-motion paths stay instant.
7. `npm test` and the focused motion + view-pills + existing view-tab e2e files pass.
8. No RN files, no hardcoded lime, no new animation dependency.

## 15. Implementation consequence

Implementers should open `docs/superpowers/plans/2026-08-15-shared-layout-motion.md` and execute it task-by-task. Do not invent a third motion system. The code already knows how to reveal a sheet and slide a plate. This PRD only tells those systems to finish the story the recordings asked for.
