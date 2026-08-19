/* Naming a date the way the interface says it out loud.
 *
 * This is where `fmtDay` belongs, and not in shared/time/ where the plan
 * originally grouped it with the clock: it formats through the WD and MO
 * label arrays next door in constants.js, and shared/ must not import from
 * features/. `plannedLabel` prefers Today/Tomorrow/Yesterday and falls back
 * to fmtDay, so the two travel together.
 */
import { diffDays, parseKey } from "../../shared/time/dateKey.js";
import { pad } from "../../shared/time/clockFormat.js";

import { MO, WD } from "./constants.js";

const plannedLabel = (dateKey, todayKey) => {
  const days = diffDays(dateKey, todayKey);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return fmtDay(dateKey);
};
const fmtDay = (k) => { const d = parseKey(k); return `${WD[d.getDay()]} ${pad(d.getDate())} ${MO[d.getMonth()]}`; };

export {
  fmtDay,
  plannedLabel,
};
