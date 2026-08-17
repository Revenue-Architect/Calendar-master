import { addDaysToKey, parseKey } from "../../shared/time/dateKey.js";

/* Named destinations for the overdue PLAN sheet.
 *
 * PLAN used to open a choice before writing a day. Collapsing that to "today"
 * skipped the decision the button still names. These helpers keep the destinations
 * pure so the sheet and the mutation share one contract. */

export function nextMonday(fromKey, weekStart = 0) {
  const day = parseKey(fromKey).getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  void weekStart;
  return addDaysToKey(fromKey, daysUntilMonday);
}

export function planWhenOptions(todayKey, { weekStart = 0 } = {}) {
  return [
    { id: "today", label: "TODAY", date: todayKey },
    { id: "tomorrow", label: "TOMORROW", date: addDaysToKey(todayKey, 1) },
    { id: "next-week", label: "NEXT WEEK", date: nextMonday(todayKey, weekStart) },
    { id: "custom", label: "PICK A DAY", date: null },
  ];
}

export function resolvePlanWhen(choice, todayKey, { weekStart = 0, customDate = null } = {}) {
  if (choice === "custom") return customDate || null;
  const option = planWhenOptions(todayKey, { weekStart }).find((entry) => entry.id === choice);
  return option?.date ?? null;
}
