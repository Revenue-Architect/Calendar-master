# View Switching Motion Design

**Status:** Proposed. Supersedes nothing; extends `2026-08-15-shared-layout-motion-prd.md` §7.2 to the regular tier and adds the gesture layer that plan deliberately left out.

**Goal:** One continuous progress model shared by the view pills and the page body, working identically at every width, driven by tap *and* by drag, with zero layout-property animation.

**Non-goal:** The NEW→composer morph. That is blocked on reference data — see *Deferred*.

---

## 1. What exists today

| Behaviour | Compact (≤639.98px) | Regular (≥640px) |
| --- | --- | --- |
| Inactive tab | Icon only | Text label |
| Active tab | Icon + clip-revealed word | Text label |
| Indicator | Computed slot, `transform` | Measured box, animates `left`/`width` |
| Page change | 140 ms opacity cross-fade | 140 ms opacity cross-fade |
| Drag to change view | None | None |

The compact mechanism (`src/features/motion/viewPills.js`) is correct and stays. Three things are missing: the regular tier never got it, nothing slides, and no gesture drives anything.

**Horizontal swipe on the page body currently calls `goDay()`** (`Planner.jsx:1898`). That is the collision this spec resolves.

---

## 2. Decision — day-turn moves to the ribbon

This is the one product change here, and it should be made deliberately.

**Recommendation: body swipe switches *view*; the date ribbon owns day-turn.**

Rationale:

- The ribbon is already a horizontally scrolling date surface (`stripRef`, `RIBBON_*`). It is the obvious place to move through days, and it already is one — day-turn by swipe duplicates an affordance that exists two rows above.
- Page-level horizontal swipe meaning "next sibling screen" is the platform convention on both iOS and Android. Meaning "next day" is not.
- Two horizontal gestures on two distinct surfaces do not conflict. One horizontal gesture serving two meanings on the same surface cannot be disambiguated without a modifier.

Preserved so nothing is lost: `←` / `→` keys, the TODAY control, ribbon tap and scroll, and the existing `nb-page` day-turn transform — which still runs, just triggered from the ribbon rather than the body.

**Risk:** muscle memory. Anyone used to body-swiping days will land on Agenda instead. Mitigation is a one-time hint reusing the existing `gesture-hint` component, and the change is a single handler swap if it is rejected in use.

**If this is rejected:** implement §3–§6 with tap-driven progress only. Everything else in this spec stands; only §5 is lost.

---

## 3. One progress model

A single value drives both surfaces. This is what makes tap and drag the same code path.

```
viewProgress ∈ [0, count-1]      // 1.4 = 40% between Agenda and Actions
```

- **Tap** animates `viewProgress` to the target index on the standard curve.
- **Drag** sets it directly from pointer delta: `startIndex - (dx / paneWidth)`, clamped with rubber-band resistance at the ends.
- **Release** animates to `Math.round(viewProgress)`, or to the next index if velocity exceeds threshold.

Both the indicator and the page read this one value. They cannot desynchronise, which is the failure the current discrete `useLayoutEffect` FLIP would hit the moment a gesture drove it.

Hold it in a ref plus a CSS custom property (`--view-progress`) rather than React state — a state update per pointer-move is a render per frame.

---

## 4. Pill behaviour

Both tiers use `viewPillSlots`. The only difference is whether inactive tabs reserve word width.

**Compact (< 640px)** — unchanged from today. Icon-only inactive, word clip-reveals, siblings FLIP.

**Regular (≥ 640px)** — labels always visible. There is room; collapsing them to icons on a desktop loses scannability and buys nothing. Slots are therefore *static*, which makes this tier strictly simpler than compact: the indicator only has to move.

- [ ] Extend `viewPillSlots` with a `mode: "compact" | "regular"` param. Regular gives every slot `icon + word`, so all slots are equal width and independent of `activeIndex`.
- [ ] Indicator renders once at slot 0's box and moves by `translate3d(x, 0, 0)` + `scaleX(w / w0)`. **Delete the `left` / `width` transition at `Planner.jsx:7617`** — this is the last layout-property animation in the nav and the PRD's acknowledged exception.
- [ ] Interpolate indicator position from `viewProgress`, not from `activeIndex`, so it tracks a drag.

Counter-scale the indicator's children if any are added later; today it is an empty plate, so `scaleX` is safe.

---

## 5. Page slide

- [ ] Wrap the three views in a track: `display: grid; grid-auto-flow: column; grid-auto-columns: 100%`. Static tracks — never animated.
- [ ] Translate the track by `translate3d(calc(var(--view-progress) * -100%), 0, 0)`.
- [ ] Replace the `nb-view-enter-a` / `-b` opacity cross-fade (`Planner.jsx:4080-4083`) with this. Keep the classes as a `prefers-reduced-motion` fallback.
- [ ] `touch-action: pan-y` on the track so vertical timeline scroll is never captured.
- [ ] Direction lock: first 10 px of movement decides axis; once vertical, ignore horizontal for that gesture.
- [ ] Only the active pane is interactive — `inert` on the other two, so a hidden Agenda cannot take focus.

**Do not mount all three eagerly at every width.** The timeline is the expensive pane; keep the neighbour mounted only while a drag is live.

---

## 6. Motion tokens

Match what compact already uses. No new curves — `index.css:74-83` exists to prevent exactly that.

| Property | Value | Note |
| --- | --- | --- |
| Track / indicator travel | `200ms cubic-bezier(.23, 1, .32, 1)` | Already the compact value |
| Word clip reveal | `200ms` same curve | Unchanged |
| Word opacity | `160ms ease 40ms` | Unchanged |
| Colour | `260ms ease` | Unchanged |
| Reduced motion / keyboard | instant | Extend the existing `instant` path at `:7651` |

Deliberately **not** adopted from the external reference:

- **A spring solver** (stiffness 380 / damping 30). The reference offers `cubic-bezier(0.25, 1, 0.5, 1)` as an equivalent; ours is `(.23, 1, .32, 1)`, the same family, already tokenised. A physics runtime for one interaction is not worth the dependency.
- **Framer Motion's `layout` prop / Reanimated `Layout.springify()`.** These animate layout properties by design. `viewPills.js:1-8` records the measured failure that produced the current approach, and §7.2 bans it. Adopting the reference's mechanism would undo a decision made against evidence.

The reference describes how the motion *looks*. It guesses at mechanism, and the guess is the expensive one. Match the look, keep the mechanism.

---

## 7. Verification

- [ ] Unit: `viewPillSlots` regular mode returns equal, `activeIndex`-independent slots.
- [ ] Unit: `viewProgress` → indicator x is linear and matches slot geometry at integer values.
- [ ] E2E: drag the pane 40% and assert the indicator has moved ~40% of the inter-slot distance **in the same frame** — this is the assertion that catches desync.
- [ ] E2E: vertical scroll inside the timeline never changes `viewProgress`.
- [ ] E2E: no element transitions a layout property after this lands (extends the Phase 6 guard in `2026-08-16-responsive-tiers-and-motion.md`).
- [ ] E2E at 390, 768, and 1280 px — the tablet width is the one with no current coverage.

---

## 8. The NEW → composer morph

Read from the reference Lottie (600×600, 5 s @ 30 fps, ground `#0A0A0C`). All values below are measured from the file, not estimated.

### 8.1 The easing is authored — only the fades use defaults

123 of 133 easing handle pairs in the file are Lottie Creator's default `(0.167,0.167,0.833,0.833)`. Every one of them is on a **content opacity fade**, where a symmetric ease-in-out is fine.

The ten that are *not* default are all on the morph itself, and they are deliberate:

| Layer | Property | Direction | Curve |
| --- | --- | --- | --- |
| Sheet Container | position, `rect.size`, `rect.round` | open | `cubic-bezier(0.22, 0.85, 0.28, 1)` |
| Sheet Container | position, `rect.size`, `rect.round` | close | `cubic-bezier(0.4, 0, 0.3, 1)` |
| Trigger Title | position | open / close | same pair |
| Submit Button Box | scale | open | `cubic-bezier(0.22, 0.85, 0.28, 1)` |
| Active Type Pill | position | switch | `cubic-bezier(0.22, 1.12, 0.28, 1)` — this is `--spring` exactly |

So the reference agrees with this codebase's own tokens. Nothing here needs inventing.

### 8.2 Geometry

| | Trigger | Sheet |
| --- | --- | --- |
| Size | 56 × 28 | 380 × 510 |
| Centre | (520, 38) — top right | (300, 300) — centred |
| Radius | 6 | 24 — matches `--r-sheet` |

As fractions of the frame: trigger is 9.3% × 4.7% at (86.7%, 6.3%); sheet is 63.3% × 85% centred. Scrim fades `0 → 72%` across the whole morph.

### 8.3 Timing

**Open — container:** f15 → f35 = **667 ms**, `cubic-bezier(0.22, 0.85, 0.28, 1)`.

**Open — content cascade.** Six groups, each fading over 333 ms, staggered **133 ms** apart. Offsets are relative to morph start:

| Offset | Group |
| --- | --- |
| +233 ms | Sheet Header Title, Close Icon |
| +367 ms | Type Switcher Box, Active Type Pill, Type Switcher Text |
| +500 ms | Prompt Title, Date Subtitle |
| +633 ms | Duration Chips, Time Range, Time Box |
| +767 ms | Category Text, More Options Text |
| +900 ms | Submit Button Box (scale 94→100), Submit Button Text |

The container settles at +667 ms; content keeps arriving until +1233 ms. **Total open ≈ 1233 ms.**

**Trigger label handoff.** Trigger Title travels with the container on the same curve and fades out over the first 233 ms — landing exactly when Sheet Header Title begins fading in. A clean cross-dissolve, not a disappearance.

**Close.** Content leaves *first*: groups fade out from f88, and the container only begins collapsing at f95 — a **233 ms lead**. Container collapse is f95 → f115 = **667 ms**, `cubic-bezier(0.4, 0, 0.3, 1)`. The trigger label returns over the final 233 ms.

### 8.4 Diff against what ships today

`nbnotchin` (`Planner.jsx:4139`) already uses the right *mechanism* — `clip-path: inset(… round …)` plus `translate`, which is why it does not violate §7.2. Four things differ, and they are why it does not feel like the reference:

- [ ] **Duration: 320 ms → 667 ms.** Today's morph runs at less than half the reference. A 56×28 box becoming 380×510 in 320 ms reads as a pop, not a morph. This is the single largest difference.
- [ ] **Content cascade replaces the single block.** `nbnotchbodyin` fades the entire body as one unit starting at 60%. The reference staggers six groups 133 ms apart across 900 ms. **This is most likely why previous attempts failed** — no amount of tuning one opacity transition produces a sheet that assembles itself.
- [ ] **Close: 260 ms → 667 ms, with content leading the container by 233 ms.** Today everything collapses together.
- [ ] **Open curve: `cubic-bezier(.23,1,.32,1)` → `cubic-bezier(.22,.85,.28,1)`.** The correct curve is already in the file — it is on `nbnotchbodyin`, applied to the body rather than the container.

Already correct, leave alone: the close curve (`cubic-bezier(.4,0,.3,1)` matches the reference exactly), the `clip-path` mechanism, and the accent→card wash on the clip's own timeline (`712a010`).

Open question for implementation: the cascade needs the sheet's six content groups individually targetable. If they are not, that markup change is the bulk of the work — the animation itself is a keyframe edit.

### 8.5 Do not animate `rect.size`

The Lottie animates `rect.size` because that is what Lottie does. Implementing that literally means animating width/height, which is a layout property and banned by §7.2. Keep the existing `clip-path` reveal; take the *timing and geometry* from the reference, not the mechanism. Same lesson as §6.
