/* Ticking the last open step finishes the action itself.
 *
 * Two rules, and the second is the one that is easy to lose:
 *
 * 1. **Only the check transition triggers it.** Unticking a step must never
 *    quietly reopen — or complete — the parent. So the decision is made about the
 *    step's state *before* the toggle, and only when it was open.
 *
 * 2. **It revalidates when it fires, not when it is scheduled.** The completion
 *    is delayed by a beat so the tick and the progress bar land first, and 420ms
 *    is easily long enough to untick the step again. A completion has to honour
 *    what is true at fire time; scheduling it is a proposal, not a decision.
 *
 * Both are pure predicates here so they can be asserted without a clock, a
 * render, or a React tree.
 */

export const AUTO_COMPLETE_DELAY_MS = 420;

/**
 * Would ticking `stepId` close the last open step of this task?
 *
 * Answered against the task as it is *now* — before the toggle is applied.
 */
export function togglesLastOpenStep(task, stepId) {
  if (!task || task.status === "completed") return false;
  const checklist = task.checklist ?? [];
  const step = checklist.find((item) => item.id === stepId);
  /* Already done means this toggle is an untick, which never completes. */
  if (!step || step.done) return false;
  return checklist.every((item) => item.done || item.id === stepId);
}

/**
 * Is the delayed completion still the right thing to do?
 *
 * Called at fire time against freshly read state. A task that was completed by
 * another route, had a step unticked, had its checklist emptied, or vanished
 * entirely (a detached occurrence that was undone) must not be completed.
 */
export function autoCompleteStillValid(task) {
  if (!task || task.status === "completed") return false;
  const checklist = task.checklist ?? [];
  if (!checklist.length) return false;
  return checklist.every((step) => step.done);
}
