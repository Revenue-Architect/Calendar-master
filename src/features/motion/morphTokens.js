/**
 * Calendar Master — Physical Planner Motion Tokens (Provisional)
 *
 * Provisional timing and easing curves subject to 40th-time evaluation and tuning.
 * Geometry and corner radii are derived directly from live DOM snapshots rather
 * than duplicate synthetic tokens.
 *
 * Grounding: docs/plans/2026-08-25-002-physical-planner-motion-ard.md §10
 * Visual Authority: docs/plans/2026-08-25-006-physical-planner-motion-visual-reference.html
 */

export const MORPH_TIMING = Object.freeze({
  OBJECT_OPEN_MS: 280,
  OBJECT_CLOSE_MS: 240,
  COMPOSER_GROW_MS: 300,
  COMPOSER_CANCEL_MS: 220,
  CONTROL_UNFOLD_MS: 200,
  CONTROL_FOLD_MS: 180,
  FIELD_UNFOLD_MS: 180,
  FIELD_FOLD_MS: 150,
});

export const MORPH_EASING = Object.freeze({
  // Swift decelerate for physical object arrival
  DECELERATE: "cubic-bezier(0.2, 0, 0, 1)",
  // Responsive linear-to-settle for user release
  RELEASE: "cubic-bezier(0.25, 1, 0.5, 1)",
  // Snappy retract for cancellation
  RETRACT: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  // Linear for color/opacity fades
  LINEAR: "linear",
});
