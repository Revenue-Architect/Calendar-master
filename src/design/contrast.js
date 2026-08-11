/* Whether a colour can be read on the one behind it.
 *
 * Fifteen themes, each a ground plus one accent, and until now not one line of
 * code had ever checked that the dim text on the cream grounds was legible.
 * That is the kind of thing you get away with until you change the type scale —
 * and this change moves several pairs across the line in both directions, so
 * the check has to exist before the change lands, not after.
 *
 * WCAG 2.2 relative luminance and contrast ratio, implemented straight from the
 * definition. No dependency, no approximation: this is thirty lines of
 * arithmetic that will outlive any package.
 */

/** #RGB or #RRGGBB to [r, g, b] in 0–255. */
export function parseHex(hex) {
  if (typeof hex !== "string") throw new TypeError(`${hex} is not a colour`);
  const value = hex.trim().replace(/^#/, "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new RangeError(`${hex} is not a hex colour`);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance. The 0.03928 knee is the sRGB transfer curve. */
export function luminance(hex) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast between two opaque colours: 1 (identical) to 21 (black on white). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = ([r, g, b]) => `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const mix = (a, b, t) => toHex(parseHex(a).map((c, i) => c + (parseHex(b)[i] - c) * t));

/**
 * The same colour, moved just far enough to be readable on this ground.
 *
 * A theme's accent is a brand decision — Timepage Red is that red — and several
 * of them are nowhere near legible as *text*: Dusty Rose on linen is 2.53:1
 * against a 4.5 bar. The wrong fix is to change the accent, because that changes
 * what the theme is. The right one is to notice that a colour used as a surface
 * and the same colour used as text are two different jobs, and only the second
 * has a legibility requirement.
 *
 * So every fill keeps the authored colour, and text takes this: the accent
 * walked toward white on a dark ground or black on a light one, in 2% steps,
 * stopping the moment it clears the bar. On a theme that already passes it
 * returns the colour untouched, which is most of them — this is a floor, not a
 * filter.
 */
export function readableOn(color, ground, minimum = 4.5, steps = 50) {
  if (contrastRatio(color, ground) >= minimum) return color.toUpperCase();
  /* Away from the ground: lighten on dark, darken on light. */
  const target = luminance(ground) > 0.18 ? "#000000" : "#FFFFFF";
  for (let i = 1; i <= steps; i += 1) {
    const candidate = mix(color, target, i / steps);
    if (contrastRatio(candidate, ground) >= minimum) return candidate;
  }
  return target;
}

/**
 * Every pair in a theme that carries text, and what each one has to reach.
 *
 * `dim` on a card is the pair that matters most and is easiest to lose: it is
 * the times, the section rails and the secondary half of every row, and it sits
 * at 13px, which is small text by every definition. `on` over `accent` is the
 * label inside a primary button, which is large and bold enough to take the
 * lower bar.
 */
export function textPairs(theme) {
  const t = readable(theme);
  return [
    { name: "text on ground", fg: t.text, bg: theme.bg, minimum: 4.5 },
    { name: "text on card", fg: t.text, bg: theme.card, minimum: 4.5 },
    { name: "dim on ground", fg: t.dimOnBg, bg: theme.bg, minimum: 4.5 },
    { name: "dim on card", fg: t.dimOnCard, bg: theme.card, minimum: 4.5 },
    { name: "accent text on ground", fg: t.accentOnBg, bg: theme.bg, minimum: 4.5 },
    { name: "accent text on card", fg: t.accentOnCard, bg: theme.card, minimum: 4.5 },
    /* The label inside a filled control: bold, and never below the label step.
       This one uses the authored colours, because a filled control is the
       accent — there is nothing to derive. */
    { name: "on over accent", fg: theme.on, bg: theme.accent, minimum: 3 },
  ];
}

/**
 * A theme's colours as text, derived once.
 *
 * `accent` and `dim` stay exactly as authored for every fill, border and dot.
 * These are the versions that go on a glyph, and on most themes they are the
 * same values — the derivation only bites where the authored colour genuinely
 * could not be read.
 */
export function readable(theme) {
  return {
    text: theme.text,
    dimOnBg: readableOn(theme.dim, theme.bg),
    dimOnCard: readableOn(theme.dim, theme.card),
    accentOnBg: readableOn(theme.accent, theme.bg),
    accentOnCard: readableOn(theme.accent, theme.card),
  };
}

/** Every failing pair in a theme, with the numbers, ready to print. */
export function failures(theme) {
  return textPairs(theme)
    .map((pair) => ({ ...pair, ratio: contrastRatio(pair.fg, pair.bg) }))
    .filter((pair) => pair.ratio < pair.minimum);
}

export const describeFailure = (theme, pair) =>
  `${theme.name}: ${pair.name} is ${pair.ratio.toFixed(2)}:1, needs ${pair.minimum}:1 (${pair.fg} on ${pair.bg})`;
