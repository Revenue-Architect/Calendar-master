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
  /* An Event object expansion is read as one persistent material changing
     shape, not as a transient popover. Four hundred milliseconds leaves room
     for the source material to hold, the shell to grow, then the Inspector
     detail to enter without making a repeated planner action feel delayed. */
  /* The card keeps growing after its shared identity has landed. This mirrors
     the reference: title first, facts second, so it reads as one Event opening
     rather than a dialog arriving after a card disappears. */
  OBJECT_OPEN_MS: 390,
  /* The return uses the panel-close beat rather than snapping away after the
     fuller expansion. It is still shorter than the opening read, but gives the
     shared Event shell enough time to reconnect cleanly with its source. */
  OBJECT_CLOSE_MS: 340,
  EVENT_SHARED_OPEN_MS: 300,
  EVENT_SHARED_CLOSE_MS: 340,
  COMPOSER_GROW_MS: 300,
  COMPOSER_CANCEL_MS: 220,
  CONTROL_UNFOLD_MS: 200,
  CONTROL_FOLD_MS: 180,
  FIELD_UNFOLD_MS: 180,
  FIELD_FOLD_MS: 150,
});

export const MORPH_EASING = Object.freeze({
  // The reference's balanced, middle-weighted object curve. It responds at
  // once, spends time in the expansion, and settles without a modal snap.
  DECELERATE: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  // The return has a quiet first and last frame with its speed in the middle.
  // That gives a click immediate acknowledgement without a modal-like eject.
  RELEASE: "cubic-bezier(0.2, 0, 0, 1)",
  // Snappy retract for cancellation
  RETRACT: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  // Linear for color/opacity fades
  LINEAR: "linear",
});
