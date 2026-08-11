# Design

The rules this interface is built from, and the reasoning behind the ones that
are not obvious. Written to be argued with: if a decision here is wrong, change
it here first and then in the code.

---

## 1. Three voices

**The face tells you who is speaking.** This is the spine of the system; most of
the other decisions fall out of it.

| Voice | Face | Speaks for |
|---|---|---|
| **Interface** | Geometric sans — Jost\* | Titles, headings, controls, section rails. Everything the app says. |
| **Measure** | Monospace — system | Times, durations, counts, the hour rail, levels and streaks. |
| **Voice** | Serif italic — Georgia | Note bodies and the app's own asides. What was written, not computed. |

Monospace survives because a calendar is a table of numbers. `10:00 AM` and
`11:30 AM` are the same width, times align down the rail, and durations stack in
columns without a single alignment hack. Losing that to a geometric would cost a
year of fighting `font-variant-numeric`. What it stopped doing is everyone else's
job — it was on 229 elements, including every title and button.

### The stack

```
--font-display: "Futura PT", "Jost", "Avenir Next", "Century Gothic",
                -apple-system, …
```

Ordered so that licensing Futura PT is a one-line change and nothing else moves.
Until then Jost\* — a Futura revival under the SIL OFL, variable 100–900, Latin
subset, 26 kB, inlined as a data URI. Licence at `src/assets/fonts/OFL.txt`.

**Gill Sans was considered and rejected**: it is humanist, not geometric, and its
lowercase a, g and t work against the direction. **SF Pro Display** is licensed
to Apple platforms only, so it cannot ship on Android or Windows — it stays in
the stack as a platform fallback, which is what `-apple-system` already does.

> The font must be inlined. The artifact CSP blocks font CDNs and the build
> inlines only the CSS and JS, so a font emitted as a separate asset would 404
> and the whole interface would fall back silently. `vite.config.js` raises
> `assetsInlineLimit` past the subset's size to force it. **If that limit ever
> drops below the font size, the failure is invisible in dev and total in the
> artifact.** `tests/e2e/typography.spec.js` asserts the face actually rendered.

---

## 2. The scale

Nine steps, declared twice — as custom properties in `src/index.css` (what
renders) and as data in `src/design/typography.js` (what tests and tooling read).
A browser test compares them so they cannot drift.

| Step | Size | Weight | Tracking | Job |
|---|---|---|---|---|
| `display` | 64 | 800 | −0.035em | The day numeral, and nothing else. Mono. |
| `title` | 24 | 700 | −0.018em | Sheet titles, view headings. |
| `heading` | 19 | 600 | −0.01em | Section headings inside a sheet. |
| `lead` | 16 | 600 | −0.008em | Event and action titles on a card. |
| `body` | 15 | 400 | 0 | Running interface text. |
| `voice` | 15 | 400 | 0 | Note bodies and asides. Serif italic. |
| `label` | 13 | 700 | +0.1em | Rails, chips, controls. Capitals. |
| `data` | 13 | 400 | +0.02em | Times, durations, counts. Mono, tabular. |
| `micro` | 11 | 400 | +0.02em | Week-grid cards, where nothing else fits. |

**Why there had to be a middle.** Before this, 86% of every sized string was
12 px or 14 px and the scale then jumped to a 72 px numeral with nothing between.
Hierarchy had nothing to carry it but colour and capitals, and a phone screen read
as one uniform texture.

**Why 16 and not 17.** The sizes are set against geometry that already exists,
not a ratio. A half-hour event is 31 px tall at `HOUR_H = 68`; 16 px with its
padding fits, 17 px clips. A scale that looks correct in a specimen and clips
real content is not correct.

**Why the scale change and the face change are one decision.** Geometric sans
have low x-heights and near-circular bowls — c, e and o converge below about
14 px. Timepage gets away with a geometric because it sets things large. Shipping
this face at the old 12 px would have been *worse* than the monospace it replaced.

### Tracking

Wide tracking is for capitals and small labels. On running text it only slows
reading down, and it was on 212 elements including 14 px sentences.

| Context | Tracking |
|---|---|
| Capitals (`label`) | +0.10em |
| Mono data | +0.02em |
| Body, lead | 0 to −0.008em |
| Heading, title | −0.01 to −0.018em |
| Display numeral | −0.035em |

---

## 3. Colour

A theme is **one ground plus exactly one accent**. Fifteen of them, sharing a
handful of neutral families (two obsidians, two creams, a linen, a raw paper).
Adding a theme costs one hex value, never a palette. That restraint is the
identity — protect it.

`on` — the colour that goes *on* the accent — is authored per theme rather than
computed, because acid yellow wants black and crimson wants white and a formula
gets the middle of that range wrong often enough to matter.

### Colour as a surface and colour as text are two different jobs

Only the second has a legibility requirement, and this is the rule that let the
contrast failures be fixed without editing a single theme:

- **Fills, borders, dots, the elapsed bar** use `theme.accent` and `theme.dim`
  exactly as authored. Timepage Red is that red.
- **Glyphs** use `T.accentText` / `T.dimText`, derived by `src/design/contrast.js`
  — the authored colour walked toward the ground's opposite in 2% steps, stopping
  the instant it clears 4.5:1. On a theme that already passed it returns the same
  string, so this is a floor rather than a filter.

Thirteen of fifteen themes needed it. Dusty Rose on linen was **2.53:1**.

### Gradients are opt-in and off

`display.litSurfaces` defaults to `false`, and with it off `--accent-fill`
resolves to the flat accent the theme has always been. On, it becomes a shallow
gradient *derived* from that same accent, so a new theme still costs one hex.
Never behind text. This is a preference, not a redesign — the flat accent is the
identity and stays the default.

---

## 4. Material

Three elevations and no more. Each encodes state rather than decorating.

```
--e0  inset hairline    flush: hour bands, rails
--e1  resting           cards, chips, rows
--e2  lifted            a dragged card, an open sheet
--sheen                 one lit pixel along the top edge
```

Shadow alphas are **per-ground tokens**, stamped from the active theme via
`data-ground` on the root — not from `prefers-color-scheme`, because the app's
fifteen themes are its own choice and someone running a cream theme on a dark OS
must get the cream shadows. A dark ground needs roughly eight times the alpha to
be visible at all.

Radii: 10 px chips, **14 px cards**, 24 px sheets, 999 px pills.

---

## 5. Motion and feedback

One spring for arrivals — `cubic-bezier(.22, 1.12, .28, 1)` — and one ease for
departures. Named in `index.css` so a new interaction cannot invent a fourteenth
curve.

**Press states.** Every control scales to `.97` in 90 ms and springs back over
260 ms. Imperceptible once; most of what "solid" means over a day of use.
Suppressed entirely under `prefers-reduced-motion`.

**Sheets grow from the control that opened them** by being *revealed*, never
scaled: the panel arrives at true size, clipped to a rounded window exactly the
trigger's size, and the window opens out. Animating a container's scale magnifies
everything inside it — see `src/features/motion/fluidGeometry.js`, which carries
the full argument and the measurements.

---

## 6. Non-negotiables

These have tests. Breaking one should turn something red.

1. **Every theme is legible on both its grounds.** `src/design/contrast.test.js`
   checks 15 themes × 7 pairs and names the failure with its numbers.
2. **Every control on a coarse pointer reaches 44 × 44.** The target may grow via
   a pseudo-element while the button stays its drawn size — padding would have
   cost 40 px of header on a screen where the timeline is already down to 44%.
3. **The declared face is the rendered face.** Asserted metrically, not by
   presence.
4. **The stylesheet and the token map agree.**
5. **Nothing in the interface is smaller than the smallest step (11 px).**

---

## 7. The fortieth-time test

The tactile direction here borrows from Not Boring, and it needs one constraint
that Not Boring does not: **those are single-purpose utilities you open once and
enjoy. A calendar is opened forty times a day.** Every tactile move must survive
being experienced forty times before lunch. Delight that repeats becomes friction,
and friction in a planner is the product failing.

| Adopted | Rejected |
|---|---|
| Press scale + sheen | Gradient surfaces — visual noise under 12 hours of timeline |
| Three elevations | Confetti on completion — an obstruction by the fourth action |
| Derived accent gradient (opt-in) | Animated theme switching — a test matrix nobody runs |
| Bound feedback (below) | 3D / parallax cards — breaks hit-testing where drag lives |

---

## 8. Verification

Unit tests cannot see any of this, and a browser suite that drives the app with a
mouse can miss a phone being completely unusable — which has happened here.

- **`scripts/contact-sheet.mjs`** — 15 themes × 2 widths × 4 surfaces = 120
  frames, assembled into one page. Not an assertion; the thing a person looks at.
  Run it before a visual change and after, and compare.
- **Real hardware, by hand.** A geometric at 13 px on an OLED panel at 40%
  brightness is a different typeface than it is on a laptop.
- **A test that cannot fail is worse than no test, because it gets counted.**
  Every test added here was run against a deliberately broken build and watched
  go red before it was trusted. Do the same.

---

## 9. Known gaps

Written down rather than quietly skipped.

- **Casing still lives in the strings.** Capitals are literal (`TODAY`,
  `ANY TIME`) rather than `text-transform` on a semantic class. Screen readers
  may spell out short all-caps tokens, and the casing rule cannot be changed
  without editing every string. The `nb-label` class already applies
  `text-transform: uppercase`, so the migration is mechanical — store the natural
  string, let CSS shout.
- **The feedback triple is not bound.** `useSynth` (nine voices, including a
  swept-bandpass page turn), `buzz()` and the spring curve are still called
  independently at each site, so they drift. They should be one named token per
  interaction — `{ motion, sound, haptic }` — with the sound landing on the
  motion's key frame rather than on the call.
- **Elevation is defined but only lightly applied.** The tokens and classes
  exist; most surfaces still carry their original hairline.
- **Title Case is not adopted.** Buttons and rails remain capitals. Timepage sets
  event titles in Title Case in a warm geometric; that is a further step, and it
  depends on the casing migration above.
