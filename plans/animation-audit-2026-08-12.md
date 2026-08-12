# Calendar Master animation audit

Audit baseline: `f723e20` (`fix: make action completion reversible and opaque`)
Audit date: 2026-08-12
Scope: `src/Planner.jsx`, `src/features/planner/TimelineActionCard.jsx`, and the shared interaction styles injected by `Planner`.

This is an audit plan produced by `improve-animations`. It does not authorize source edits by that skill. Any implementation should be reviewed against the existing `DESIGN.md`, the motion regression tests, and the reduced-motion contract before landing.

## Findings

| Priority | Location | Observation | User impact | Recommended treatment |
| --- | --- | --- | --- | --- |
| High | `src/Planner.jsx:3408-3409`, `3491-3497`, `3520`, `3528`, `3550-3551`, `4178` | Several everyday controls use overshooting curves (`cubic-bezier(..., 1.1)` through `1.6`) and the completion pop reaches `scale:1.28`. | Repeated taps, sheet entry, and completion feedback can read as bounce or instability rather than a connected state change. | Keep intentional emphasis only for the completion moment; use a no-overshoot ease-out for ordinary press/release, banners, bottom sheets, and lane settling. Keep transforms/opacity compositor-friendly. |
| Medium | `src/Planner.jsx:3394`, `3678`, `3716` | Calendar-cell entry uses a 420ms transition plus per-cell delay. | Month and week navigation can feel late to settle, especially on a small device. | Reduce the base reveal to a short 240–300ms range and cap staggered delay. Preserve the existing low-frequency reveal rather than adding more motion. |
| Medium | `src/Planner.jsx:3473-3476` | Scrim uses bare `ease` for both sheet entry and exit while the panel uses product-specific curves. | The scrim and panel do not feel like one material during modal open/close. | Use the same explicit strong ease-out for entry and a short ease-in for exit; leave blur static. |
| Medium | `src/Planner.jsx:3574-3578` | Both OS reduced-motion and the in-app preference globally remove all animation and transition, including state feedback. | Reduced-motion users lose useful opacity/color confirmation and can experience abrupt state replacement. | Replace the global kill switch with a gentle reduced-motion profile: no travel/scale/blur animation, but preserve essential color/opacity transitions and immediate visibility. Add a browser test for both preference paths. |
| Low | `src/Planner.jsx:3980`, `4001`, `4042` | Timeline layout and progress changes animate `top`, `width`, and progress width over 600ms. | A drag or reflow can visibly lag behind the pointer and make connected cards feel detached. | Reserve layout transitions for post-drop settling, shorten them, and use transform/opacity for transient feedback. Keep direct manipulation immediate. |

## Missed opportunity

The action completion interaction already has a solid completion backing surface in `TimelineActionCard`, but the list `TaskCard` communicates completion primarily with opacity and strikethrough (`src/Planner.jsx:5353-5381`). A short, opaque completion reveal followed by a stable completed state would give both action surfaces the same satisfying language without making the completed row unreadable.

## Acceptance checks

1. Everyday tap feedback settles once with no visible overshoot or bounce.
2. Event/action sheets remain full-size internally and preserve their connected open/close morph.
3. Reduced motion removes travel, scale, blur, and stagger, but keeps state changes perceivable and controls usable.
4. A timeline drag follows the pointer immediately and only settles after release.
5. Completing and reopening an action remains reversible; the completion overlay is opaque and never leaves a transparent residue.
6. Existing unit, browser, motion, touch, agenda, and completion tests remain green at desktop and mobile widths.
