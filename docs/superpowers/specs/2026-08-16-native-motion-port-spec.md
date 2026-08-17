# Porting the Framer Motion pill nav and morphing modal to React Native

**Status:** Design spec. Nothing here is implemented — `apps/mobile` does not exist yet (master plan Phase 3 creates it).
**Source:** A Framer Motion reference implementation of `DynamicPillNavbar` and `MorphingModal`.
**Verified against:** Reanimated docs and release notes, August 2026. Version-sensitive claims are dated because one of them is the deciding factor.

---

## 1. The short answer

| Component | Native equivalent | Verdict |
| --- | --- | --- |
| **Pill navbar** — `layout` + `<AnimatePresence>` width expansion | Reanimated `LinearTransition` / Moti `<MotiView layout>` | **Yes, cleanly, production-ready.** Near 1:1 mapping. |
| **Modal morph** — `layoutId` shared-element between two components | Reanimated Shared Element Transitions | **Not for production.** See §3. |

The two halves of the reference have very different answers, and the modal is the one that decides the platform strategy.

---

## 2. Pill navbar — direct port

Framer's `layout` prop and Reanimated's layout transitions solve the same problem: an element changed size or position, animate the delta. Both measure before and after and interpolate. The reference maps over almost unchanged.

### 2.1 Mapping

| Framer Motion | Reanimated / Moti | Note |
| --- | --- | --- |
| `<motion.button layout>` | `<Animated.View layout={LinearTransition.springify()}>` or `<MotiView layout>` | Reflows siblings when one grows. |
| `<AnimatePresence>` | `<AnimatePresence>` (Moti) or `entering`/`exiting` (Reanimated) | Moti's is the closer API. |
| `initial/animate/exit` on width | `from` / `animate` / `exit` on `width` | Moti names differ, semantics match. |
| `transition: { type: "spring", damping, stiffness, mass }` | `withSpring(v, { damping, stiffness, mass })` | Same physics model, same numbers. |

### 2.2 Spring

The reference uses `{ damping: 20, stiffness: 220, mass: 0.6, bounce: 0 }`. Carry those verbatim — Reanimated's spring takes the same three parameters and `bounce: 0` corresponds to critical damping, which `damping: 20` against `stiffness: 220, mass: 0.6` already approximates.

```tsx
const SPRING = { damping: 20, stiffness: 220, mass: 0.6 };
```

### 2.3 The one real difference — `width: 'auto'`

Framer animates `width: 0 → 'auto'` by measuring the natural width. **Reanimated cannot animate to `auto`**; it needs a number. Three options, in order of preference:

1. **Measure once and cache.** Render the label off-screen at mount, capture its width with `onLayout`, animate `0 → measured`. Stable because the labels are fixed strings.
2. **Fixed slot width.** This is what the web client already does — `VIEW_PILL_WORD = 84` in `src/features/motion/viewPills.js`, chosen so TIMELINE fits with fallback-font headroom. Reuse the constant; it is already shared-package material.
3. **`LinearTransition` on the parent only**, letting the label mount at natural width and the row absorb it. Simplest, least controlled.

**Recommendation: option 2.** The constant exists, it is already the web contract, and sharing it is the point of `packages/domain`. Two clients disagreeing about how wide TIMELINE is would be a real bug.

### 2.4 Direction-aware squeeze

The reference does not have this, and it should. The web client learned it the hard way (commit `8dfe6a2`): a word must be squeezed from **the side the growing tab is on**, or the backwards direction reads as the label collapsing away from the thing pushing it.

Native has no `clip-path`. The equivalent is a fixed-width `<View overflow="hidden">` whose width animates, with the label inside pinned to the edge that should stay put:

- Tab **left** of active → label pinned `right`, so shrinking eats it from the left edge inward.
- Tab **right** of active → label pinned `left`.

Port `viewPillLabelSide()` unchanged; only the mechanism differs.

---

## 3. Modal morph — the honest part

`layoutId` is Framer's standout feature: two components in different parts of the tree sharing an identity, so one morphs into the other. This is what makes the NEW button become the composer sheet.

**React Native's direct equivalent is not production-ready as of August 2026.**

Shared Element Transitions returned in **Reanimated 4.2.0**, but they ship **behind the `ENABLE_SHARED_ELEMENT_TRANSITIONS` feature flag**, require the New Architecture (Fabric), and Software Mansion state plainly that they are experimental and not recommended for production. Their own announcement asks for feedback rather than adoption.

### 3.1 Three routes

| Route | How | Cost |
| --- | --- | --- |
| **A — Reanimated shared transitions** | `sharedTransitionTag` on both elements, flag enabled | Closest to Framer. Experimental, flagged, Fabric-only. Shipping a beta on it means the morph is the least stable thing in the app. |
| **B — Hand-rolled FLIP** | `measure()` the trigger, `measure()` the target, animate an absolutely-positioned surface between the two rects | Full control, no flag, works today. More code. |
| **C — No morph on native** | Sheet slides up from the bottom, platform-standard | Cheapest. Loses the signature. |

### 3.2 Recommendation: B

Not as a compromise — because **the web client already does exactly this**, and it works. `fluidMorphFromRects` measures the trigger and the panel and animates a `clip-path` inset plus a translate between them. The native version is the same algorithm with `clip-path` swapped for an animated-width/height `<View>` and `borderRadius` interpolated the same way.

That makes the morph **one shared contract with two renderers**, which is exactly the relationship BD-05 asks for — shared logic, platform-specific views. Route A would instead make web and native structurally different *and* put the native side on an experimental flag.

The geometry to port is already measured and written down in `docs/superpowers/specs/2026-08-16-view-switching-motion-design.md` §8: trigger 56×28 at (520,38) radius 6, sheet 380×510 centred radius 24, 480ms, `cubic-bezier(0.22, 0.85, 0.28, 1)` opening and `(0.4, 0, 0.3, 1)` closing, content cascading in six groups 133ms apart from +233ms.

Reanimated has no cubic-bezier-to-spring converter. Use `withTiming(v, { easing: Easing.bezier(0.22, 0.85, 0.28, 1) })` for the container, not `withSpring` — the reference curve is authored, not physical, and substituting a spring changes the character.

---

## 4. What this means for BD-03

The Framer proposal and the master plan point at different platforms, and the difference is not a library preference.

- **Framer Motion is React DOM only.** It runs wherever React DOM runs: web, and Windows/macOS/Android/iOS *wrapped* via Tauri, Electron or Capacitor. It does not run in React Native at all.
- **BD-03 commits to Expo / React Native for Android.** On that path Framer is unavailable and the port above is required.

So the real question is not "Framer or Reanimated" but:

| Path | Motion story | Consequence |
| --- | --- | --- |
| **Web-only + wrapper** (Tauri/Capacitor) | One implementation, Framer everywhere | Contradicts BD-03. Gains a single motion codebase. Gives up native gesture/scroll feel. |
| **Expo / RN** (current plan) | Two implementations, shared contract | Keeps BD-03. Motion must be specified once and rendered twice — which is what this document is. |

**This is an ADR-level decision, not a dependency addition**, and it should be made before Phase 3 rather than discovered during it.

### 4.1 A caution that applies to the web side either way

If Framer *is* adopted on web, note that the `layout` prop animates layout properties by measurement — which is what `2026-08-15-shared-layout-motion-prd.md` §7.2 bans, and what this repo has spent two days removing. The `emil-design-eng` reference makes the same point with a specific case: Vercel's dashboard tab animation used Shared Layout Animations, dropped frames during page loads, and was fixed by moving to CSS.

Adopting Framer for `layout` would re-introduce the exact class of problem the audit in `2026-08-16-responsive-tiers-and-motion.md` was written to close. Framer for orchestration and gesture, CSS for layout-shaped motion, is the combination that does not fight itself.

---

## 5. Shared tokens

Whatever the platform decision, these are the contract and belong in `packages/domain` rather than being restated per client:

| Token | Value | Used by |
| --- | --- | --- |
| `VIEW_PILL_ICON` | 30 | Both — slot geometry |
| `VIEW_PILL_WORD` | 84 | Both — label slot |
| `VIEW_PILL_COMPACT_MAX` | 639.98 | Web only; native is always compact |
| Pill travel | 260ms, `cubic-bezier(.22,.61,.36,1)` | Both |
| Morph open | 480ms, `cubic-bezier(0.22,0.85,0.28,1)` | Both |
| Morph close | 480ms, `cubic-bezier(0.4,0,0.3,1)` | Both |
| Cascade lead / step / fade | 0.35 / 0.2 / 0.5 of morph duration | Both |
| Swipe commit velocity | 0.11 px/ms | Both |
| Swipe soft limit / resistance | 140px / 0.32 | Both |

---

## 6. Open questions

1. **BD-03 stands or changes?** Everything above branches on it.
2. **If Expo:** route A, B or C for the morph? This spec recommends B.
3. **If web-only + wrapper:** does Framer earn its place for anything other than `layout`, given §4.1?

## 7. Sources

- [Introducing Reanimated 4.2.0](https://blog.swmansion.com/introducing-reanimated-4-2-0-71eea21ca861)
- [Shared Element Transitions — React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/docs/shared-element-transitions/overview/)
- [Migrating from Reanimated 3.x to 4.x](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/)
- [Animating elements between screens — React Navigation](https://reactnavigation.org/docs/shared-element-transitions/)
