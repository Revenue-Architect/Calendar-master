/* Blending two hex colours, and deciding whether one is dark.
 *
 * Moved out of Planner because the composite surfaces need them — mixHex and
 * isDark are between them a blocker on four of the components still in that
 * file — and they are arithmetic with no UI dependency.
 *
 * This deliberately does NOT merge with contrast.js next door, though the
 * overlap is real and worth a decision later:
 *
 *   - `hexToRgb` is `parseHex` without the validation or the #RGB shorthand.
 *     parseHex is strictly better and this could call it.
 *   - `isDark` is NOT `luminance` with a threshold. It applies the Rec.709
 *     coefficients to raw sRGB bytes; luminance() gamma-corrects each channel
 *     first, per WCAG. The two disagree in the midtones, so swapping one for
 *     the other would repaint text on some themes.
 *
 * Either change is an edit, not a move, and would need the theme contrast
 * suite run against it. Kept as-is so this commit stays a relocation.
 */
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixHex = (a, b, t) => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
};
const isDark = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.5;
};
export {
  isDark,
  mixHex,
};
