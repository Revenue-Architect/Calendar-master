/* The notch morph's one dial. Every other beat in the sequence — the stage
   machine, the content cascade's lead, step and fade — is a fraction of this,
   so retuning the whole choreography is one number rather than nine that
   have to be kept in agreement.
   The reference motion runs its container for 667ms (20 frames at 30fps), and
   that is the right shape but not the right speed for a control opened dozens of
   times a day — a showcase piece is authored to be watched once, and DESIGN.md's
   fortieth-time test is the standard that actually applies here. 380ms keeps the
   physical choreography while removing the wait between repeated planner actions:
   the sheet still assembles itself group by group, but the complete cascade lands
   before the surface settles. It remains longer than the old 320ms pop that read
   as a resize rather than a morph. */
export const MORPH_MS = 380;

/* Ordinary trigger-origin Sheets retain their established CSS entrance. Keep
   this beside the notch dial so JS guards and the stylesheet cannot drift apart
   when either path is retuned. */
export const SHEET_ENTRY_MS = 420;

/* Fractions of MORPH_MS. Content starts a third of the way through the container's
   travel, each group is a step behind the last, and each takes its own share of the
   duration to arrive.

   The lead is the load-bearing one and it does not move: it is the beat that makes the
   form wait until the clip has somewhere to land, which is the difference between a
   morph and a panel with a fade on it.

   The step and the fade used to be the reference's own .2 and .5, which put the eighth
   group's start at 936ms and its end at 1176ms — two and a half times the shape it
   belongs to. Measured, not guessed: content was still at 0.30 opacity 622ms after the
   press. A gesture whose content keeps arriving after its container has settled reads as
   a fade laid over a morph, which is exactly what it was reported as.

   At .04 and .3 the last group starts at ~255ms and lands at ~369ms, inside MORPH_MS
   with room to spare, and the whole cascade spans 281ms — under the 300ms an interface
   opened dozens of times a day can afford. The stagger survives; only its tail is gone.
   Keep the arithmetic true if MORPH_MS ever moves: lead + groups*step + fade must stay <= 1. */
export const MORPH_LEAD = 0.35;
export const MORPH_STEP = 0.04;
export const MORPH_FADE = 0.3;
export const CASCADE_GROUPS = 8;

/* Kept as the same fractions of the container's travel the 320ms version
   used — 56%, 69%, 100% — so stretching MORPH_MS moves these with it rather
   than leaving the handoff stranded at an absolute millisecond that no
   longer means anything in the new timeline. Wall-clock, not animation-clock:
   the stage machine has to keep working when a tab freezes CSS animations. */
export const MORPH_STAGE_REVEAL = 0.56;
export const MORPH_STAGE_CONTENT = 0.69;

/* Long enough that a full pane width reads as travel rather than a jump, short
   enough that it never delays the surface you asked for. The day turn next door
   moves a fraction of this distance in 240ms; a whole width wants a little more. */
export const VIEW_SLIDE_MS = 300;

export function cascadeSpan(lead = MORPH_LEAD, step = MORPH_STEP, fade = MORPH_FADE, groups = CASCADE_GROUPS) {
  return lead + groups * step + fade;
}
