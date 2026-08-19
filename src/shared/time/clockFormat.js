/* Clock formatting: minutes-since-midnight in, a string a person reads out.
 *
 * These left Planner together because the composite surfaces need them —
 * `fmtTime` alone is referenced by five of them — and because they are pure
 * time, with no UI dependency to drag along. `fmtDay` deliberately stayed
 * behind: it formats with the WD/MO label arrays from features/planner, and
 * importing those here would point shared/ at features/.
 *
 * `h12` and `meridiem` have no caller outside this file and stay private.
 */
const pad = (n) => String(n).padStart(2, "0");
/* The clock is a display choice, never a stored one — minutes since midnight stay
   the single representation, so switching format can never move an event. */
const h12 = (h) => (h % 12 === 0 ? 12 : h % 12);
const meridiem = (h) => (h < 12 ? "AM" : "PM");
const fmtTime = (m, clock) => {
  const hour = Math.floor(m / 60) % 24;
  const minute = Math.round(m) % 60;
  if (clock === "24") return `${pad(hour)}:${pad(minute)}`;
  return `${h12(hour)}:${pad(minute)} ${meridiem(hour)}`;
};
/* The rail drops ":00" — an hour label is a ruler mark, not a timestamp. */
const fmtHour = (h, clock) => (clock === "24" ? pad(h) : `${h12(h)} ${meridiem(h)}`);
/* The wire form a native time input speaks, independent of the 12/24 display clock. */
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fromHhmm = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
export {
  fmtHour,
  fmtTime,
  fromHhmm,
  hhmm,
  pad,
};
