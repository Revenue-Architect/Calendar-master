/* Sheets morph open from the control that opened them. Focus alone cannot always
   say which control that was — iOS Safari does not focus a tapped button — so the
   last pressed trigger is remembered here and consulted when a sheet mounts.
 *
 * The remembered press is only good until the next thing that could open a sheet
 * some other way. A keystroke clears it: a sheet opened by pressing N was not
 * opened by a control, and growing it out of whichever button happens to still
 * hold focus — a view tab, the last thing clicked a second ago — makes it appear
 * to fly out of something unrelated. With nothing remembered the sheet uses its
 * neutral arrival, which is the honest answer to "where did this come from".
 * The window is short for the same reason: a sheet opens within a frame or two of
 * the press that opened it, so anything later did not come from that press. */

export const FLUID_TRIGGER_MAX_AGE_MS = 900;
export const FLUID_TRIGGER_SELECTOR = "button,[role='button'],summary,label,[data-event-id],[data-task-chip]";

let lastFluidTriggerRect = null;
let lastFluidTriggerAt = 0;
let installedOn = null;

export function rememberFluidTrigger(snapshot, now = Date.now()) {
  lastFluidTriggerRect = snapshot && snapshot.width > 0 && snapshot.height > 0
    ? {
      left: snapshot.left,
      top: snapshot.top,
      width: snapshot.width,
      height: snapshot.height,
      radius: snapshot.radius ?? null,
    }
    : null;
  lastFluidTriggerAt = lastFluidTriggerRect ? now : 0;
}

export function rememberFluidTriggerFromEvent(event, now = Date.now(), stylesOf = defaultStylesOf) {
  /* Duck-typed rather than `instanceof Element`: a text node has no closest,
     and unit tests cannot see the browser's Element constructor. */
  const el = event.target && typeof event.target.closest === "function"
    ? event.target.closest(FLUID_TRIGGER_SELECTOR)
    : null;
  const rect = el?.getBoundingClientRect?.();
  /* The corner travels with the rect. A pill and a card are the same geometry
     problem with different radii, and using one number for both is what turned
     a card's reveal into an ellipse. */
  const radius = el ? stylesOf(el).borderTopLeftRadius : null;
  rememberFluidTrigger(
    rect && rect.width > 0 && rect.height > 0
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, radius }
      : null,
    now,
  );
}

export function clearFluidTrigger() {
  lastFluidTriggerRect = null;
  lastFluidTriggerAt = 0;
}

export function recentFluidTriggerRect(now = Date.now()) {
  /* Keep a geometry snapshot rather than a DOM node. Navigation can legitimately
     unmount the pressed card before the delayed inspector mounts; requiring the
     node to remain connected turned that valid path into a generic fade. A new
     pointer press replaces the snapshot and keyboard opens clear it, so the short
     lifetime still prevents an unrelated control from borrowing an old origin. */
  if (!lastFluidTriggerRect) return null;
  if (now - lastFluidTriggerAt > FLUID_TRIGGER_MAX_AGE_MS) return null;
  return lastFluidTriggerRect;
}

/** The pressed control's own corner radius, for the shape the reveal starts from. */
export function recentFluidTriggerRadius(now = Date.now()) {
  return recentFluidTriggerRect(now)?.radius ?? null;
}

export function installFluidTriggerListeners(target = typeof window !== "undefined" ? window : null) {
  if (!target || installedOn === target) return;
  if (installedOn) return;
  installedOn = target;
  target.addEventListener("pointerdown", (event) => rememberFluidTriggerFromEvent(event), true);
  target.addEventListener("keydown", () => { clearFluidTrigger(); }, true);
}

function defaultStylesOf(el) {
  return typeof window !== "undefined" && typeof window.getComputedStyle === "function"
    ? window.getComputedStyle(el)
    : { borderTopLeftRadius: null };
}
