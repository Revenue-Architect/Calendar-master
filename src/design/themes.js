/* Fifteen themes, and each one is a ground plus exactly one colour.
 *
 * That constraint is the whole system: the neutrals belong to a family — two
 * obsidians, two creams, a linen, a raw paper — and a theme is one of those
 * grounds with a single accent on it. Adding a theme therefore costs one hex
 * value, never a palette, and the lit and deep stops of the accent gradient are
 * derived from it rather than authored (see Planner.jsx).
 *
 * `on` is the colour that goes *on* the accent, and it is picked per theme
 * rather than computed: acid yellow wants black on it, crimson wants white, and
 * a contrast formula gets the middle of that range wrong often enough to matter.
 * tests/design/contrast.test.js checks all of them, every combination, on both
 * grounds.
 *
 * Lifted out of Planner.jsx so the contrast tests and the contact-sheet script
 * can read the same list the interface renders from — a second copy of fifteen
 * palettes would be a second copy that drifts.
 */
export const THEMES = [
  { id: "obsidian-acid", name: "Obsidian / Acid", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#CCFF00", on: "#000000" },
  { id: "obsidian-cyan", name: "Obsidian / Cyan", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#00F0FF", on: "#000000" },
  { id: "ink-violet", name: "Ink / Violet", bg: "#0C0B12", card: "#15131E", line: "#221F2E", text: "#F1EFF7", dim: "#7C778C", faint: "#2B2739", accent: "#A855F7", on: "#150A22" },
  { id: "ember", name: "Ember / Orange", bg: "#0B0908", card: "#151110", line: "#211B18", text: "#F5F1EE", dim: "#857C75", faint: "#2C2521", accent: "#FF5500", on: "#1B0A02" },
  { id: "signal", name: "Obsidian / Crimson", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#FF2A55", on: "#1F0208" },
  { id: "raw-amber", name: "Raw Paper / Amber", bg: "#1A1917", card: "#221F1C", line: "#2C2822", text: "#F0EBE1", dim: "#8B8477", faint: "#38332B", accent: "#D97706", on: "#1B1102" },
  { id: "cream-terracotta", name: "Cream / Terracotta", bg: "#F4F1EA", card: "#FFFFFF", line: "#E4DED2", text: "#14141A", dim: "#79736A", faint: "#DED7C9", accent: "#C85A32", on: "#FFFFFF" },
  { id: "cream-sage", name: "Cream / Sage", bg: "#F4F1EA", card: "#FFFFFF", line: "#E4DED2", text: "#14141A", dim: "#79736A", faint: "#DED7C9", accent: "#789078", on: "#000000" },
  { id: "cream-slate", name: "Cream / Slate", bg: "#F1F2F4", card: "#FFFFFF", line: "#E1E3E7", text: "#14141A", dim: "#71757C", faint: "#D8DBE0", accent: "#5B7C99", on: "#FFFFFF" },
  { id: "linen-dusty", name: "Linen / Dusty Rose", bg: "#F7F3F4", card: "#FFFFFF", line: "#E9E0E2", text: "#1A1418", dim: "#7C7074", faint: "#E0D4D7", accent: "#C48B9F", on: "#000000" },


  /* Same neutrals as the sets above, new accents only. A theme here is a ground plus
     one colour, so a new accent is a new theme rather than a new palette. */
  { id: "obsidian-red", name: "Obsidian / Timepage Red", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#E23B2E", on: "#FFFFFF" },
  { id: "obsidian-blue", name: "Obsidian / Actions Blue", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#1BA3C4", on: "#00161C" },
  { id: "obsidian-forest", name: "Obsidian / Forest", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#34C77B", on: "#03210F" },
  { id: "cream-red", name: "Cream / Timepage Red", bg: "#F4F1EA", card: "#FFFFFF", line: "#E4DED2", text: "#14141A", dim: "#79736A", faint: "#DED7C9", accent: "#C8221B", on: "#FFFFFF" },
  { id: "cream-blue", name: "Cream / Actions Blue", bg: "#F1F2F4", card: "#FFFFFF", line: "#E1E3E7", text: "#14141A", dim: "#71757C", faint: "#D8DBE0", accent: "#0E7F99", on: "#FFFFFF" },
];
