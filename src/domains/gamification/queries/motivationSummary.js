import { addDaysToKey, assertDateKey } from "../../../shared/time/dateKey.js";
import { POINTS_PER_LEVEL, normalizeMotivationLedger } from "../model/ledger.js";

function activeAwards(entries) {
  const reversed = new Set(entries.filter((entry) => entry.kind === "reversal").map((entry) => entry.reversalOf));
  return entries.filter((entry) => entry.kind === "award" && !reversed.has(entry.id));
}

function currentStreak(entries, todayDate) {
  const dates = new Set(activeAwards(entries)
    .filter((entry) => entry.reason === "task-completed" && entry.planningDate)
    .map((entry) => entry.planningDate));
  let cursor = todayDate;
  if (!dates.has(cursor)) cursor = addDaysToKey(cursor, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}

export function getMotivationSummary(ledger, { todayDate, controls = {} } = {}) {
  const normalized = normalizeMotivationLedger(ledger);
  assertDateKey(todayDate);
  const totalPoints = normalized.entries.reduce((total, entry) => total + entry.amount, 0);
  const showPoints = controls.points !== false;
  const showLevels = controls.levels !== false;
  const showStreaks = controls.streaks !== false;
  const level = Math.floor(Math.max(0, totalPoints) / POINTS_PER_LEVEL) + 1;
  return {
    totalPoints,
    points: showPoints ? totalPoints : null,
    level: showLevels ? level : null,
    levelProgress: showLevels ? (Math.max(0, totalPoints) % POINTS_PER_LEVEL) / POINTS_PER_LEVEL : null,
    streak: showStreaks ? currentStreak(normalized.entries, todayDate) : null,
    activeAwardCount: activeAwards(normalized.entries).length,
  };
}
