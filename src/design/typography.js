/* The type scale, as data.
 *
 * The same nine steps are declared as custom properties in index.css, which is
 * what the interface actually renders from. This module exists so that things
 * which are not CSS can reason about the scale too: the contrast checker needs
 * to know which steps count as large text under WCAG, the contact-sheet script
 * needs to name them, and a test can assert that a step nobody uses has been
 * deleted rather than left lying about.
 *
 * Keeping two declarations in agreement is a cost, so `scaleMatchesStylesheet`
 * in the browser suite reads the custom properties back off the document and
 * compares them to this. If they drift, that test fails rather than the design.
 */

/** Every step, in the order they appear in the scale. */
export const TYPE_SCALE = Object.freeze({
  display: { px: 64, weight: 800, tracking: -0.035, family: "data", role: "The day numeral, and nothing else." },
  title:   { px: 24, weight: 700, tracking: -0.018, family: "display", role: "Sheet titles and view headings." },
  heading: { px: 19, weight: 600, tracking: -0.01,  family: "display", role: "Section headings inside a sheet." },
  lead:    { px: 15, weight: 500, tracking: -0.005, family: "display", role: "Event and action titles on a card." },
  body:    { px: 15, weight: 400, tracking: 0,      family: "display", role: "Running interface text." },
  voice:   { px: 15, weight: 400, tracking: 0,      family: "voice",   role: "Note bodies and the app's own asides." },
  label:   { px: 13, weight: 700, tracking: 0.1,    family: "display", role: "The interface voice: rails, chips, controls." },
  data:    { px: 13, weight: 400, tracking: 0.02,   family: "data",    role: "Times, durations, counts." },
  micro:   { px: 11, weight: 400, tracking: 0.02,   family: "data",    role: "Week-grid cards, where nothing else fits." },
});

/** The class each step is applied through. */
export const stepClass = (step) => `nb-${step}`;

/**
 * Is text at this step "large" for the purposes of a contrast ratio?
 *
 * WCAG 2.2 puts the boundary at 18.66px when bold, 24px otherwise, and drops
 * the required ratio from 4.5 to 3 above it. Worth encoding rather than
 * remembering: the difference decides whether a dim label on a cream ground is
 * a pass or a failure, and the answer changed when the scale changed.
 */
export function isLargeText({ px, weight }) {
  if (!Number.isFinite(px) || !Number.isFinite(weight)) return false;
  return weight >= 700 ? px >= 18.66 : px >= 24;
}

/** The ratio a step must reach against its ground. */
export function requiredRatio(step) {
  const spec = TYPE_SCALE[step];
  if (!spec) throw new RangeError(`${step} is not a step in the scale`);
  return isLargeText(spec) ? 3 : 4.5;
}
