/* Series-level iCalendar export for one stored event.
 *
 * This is a portability adapter, not a renderer. It reads the canonical
 * `timing` / `recurrence` record (or a legacy date/start/dur event via
 * `eventForUi`) and emits one VEVENT. Callers must not append a literal
 * `"00"` onto a local date-time — `YYYY-MM-DDTHH:mm` already has minutes,
 * and stuffing two more digits produced `YYYYMMDDTHHmm00`, which is not
 * a valid ICS DATETIME.
 *
 * One bad event must not abort the whole notebook. `eventToIcs` returns
 * `null` when the record cannot be described; `eventsToIcs` skips those
 * and reports them. Floating times stay floating (no `Z`). Zoned times
 * carry `TZID`. All-day uses `VALUE=DATE` with an exclusive DTEND.
 *
 * `eventForUi` is injected so this module never imports Planner.jsx.
 */

const DAY_LETTERS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function escapeIcsText(value) {
  return String(value || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

function dateValue(dateKey) {
  return String(dateKey || "").replace(/-/g, "");
}

/* `YYYY-MM-DDTHH:mm` → `YYYYMMDDTHHmm00`. ICS DATETIME is seconds-resolution;
   the planner stores minutes, so seconds are always zero — written as two
   zeros after the minute, never concatenated onto a value that already has
   them. */
function floatingDateTime(local) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local || ""));
  if (!match) return null;
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}00`;
}

function rruleFromView(view) {
  const repeat = view?.repeat;
  if (!repeat?.freq) return null;
  let rule = `FREQ=${String(repeat.freq).toUpperCase()};INTERVAL=${repeat.interval || 1}`;
  if (repeat.freq === "weekly" && Array.isArray(repeat.byDay) && repeat.byDay.length) {
    rule += `;BYDAY=${repeat.byDay.map((index) => DAY_LETTERS[index]).join(",")}`;
  }
  if (repeat.count) rule += `;COUNT=${repeat.count}`;
  else if (repeat.until) rule += `;UNTIL=${dateValue(repeat.until)}T235900Z`;
  return rule;
}

function startEndLines(event, view) {
  const timing = event?.timing;
  if (timing?.kind === "all-day") {
    return [
      `DTSTART;VALUE=DATE:${dateValue(timing.startDate)}`,
      `DTEND;VALUE=DATE:${dateValue(timing.endDateExclusive)}`,
    ];
  }
  if (timing?.kind === "timed") {
    const start = floatingDateTime(timing.startLocal);
    const end = floatingDateTime(timing.endLocal);
    if (!start || !end) return null;
    if (timing.timeZoneMode === "zoned" && timing.timeZone) {
      return [
        `DTSTART;TZID=${timing.timeZone}:${start}`,
        `DTEND;TZID=${timing.timeZone}:${end}`,
      ];
    }
    return [`DTSTART:${start}`, `DTEND:${end}`];
  }

  /* Legacy date/start/dur events have no timing. eventForUi already folded
     them into minutes-of-day; rebuild a local DATETIME from that view so a
     pre-migration notebook still exports. */
  if (!view?.date) return null;
  if (view.allDay) {
    const start = dateValue(view.date);
    const end = dateValue(view.endDate || view.date);
    if (!start) return null;
    /* Exclusive end: a one-day all-day event ends the next calendar day. */
    const endExclusive = view.endDate
      ? incrementDateValue(end)
      : incrementDateValue(start);
    return [`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${endExclusive}`];
  }
  const startLocal = localFromMinutes(view.date, view.start ?? 0);
  const endLocal = localFromMinutes(view.date, (view.start ?? 0) + (view.dur || 0));
  const start = floatingDateTime(startLocal);
  const end = floatingDateTime(endLocal);
  if (!start || !end) return null;
  return [`DTSTART:${start}`, `DTEND:${end}`];
}

function incrementDateValue(yyyymmdd) {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function localFromMinutes(dateKey, minutes) {
  const clamped = Math.max(0, Number(minutes) || 0);
  const hour = String(Math.floor(clamped / 60) % 24).padStart(2, "0");
  const minute = String(clamped % 60).padStart(2, "0");
  return `${dateKey}T${hour}:${minute}`;
}

/**
 * @param {object} event stored event (canonical or legacy)
 * @param {(event: object) => object} eventForUi presentation adapter
 * @param {(value: unknown) => string} [normalizeMeetingLink]
 * @returns {string[] | null} VEVENT lines, or null if the event cannot be described
 */
export function eventToIcs(event, eventForUi, normalizeMeetingLink = () => "") {
  if (!event || typeof event !== "object") return null;
  try {
    const view = typeof eventForUi === "function" ? eventForUi(event) : event;
    const startEnd = startEndLines(event, view || event);
    if (!startEnd) return null;
    const lines = [
      "BEGIN:VEVENT",
      `UID:${event.id || "unknown"}@planner`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      ...startEnd,
    ];
    const rule = rruleFromView(view || event);
    if (rule) lines.push(`RRULE:${rule}`);
    if (event.place) lines.push(`LOCATION:${escapeIcsText(event.place)}`);
    const href = normalizeMeetingLink(event.link);
    if (href) lines.push(`URL:${href}`);
    if (event.note) lines.push(`DESCRIPTION:${escapeIcsText(event.note)}`);
    for (const minutes of event.alerts || []) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${minutes}M`,
        `DESCRIPTION:${escapeIcsText(event.title)}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
    return lines;
  } catch {
    return null;
  }
}

/**
 * @param {object[]} events
 * @param {(event: object) => object} eventForUi
 * @param {(value: unknown) => string} [normalizeMeetingLink]
 * @returns {{ ics: string, skipped: number }}
 */
export function eventsToIcs(events, eventForUi, normalizeMeetingLink = () => "") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Not Boring Moleskine Planner//EN"];
  let skipped = 0;
  for (const event of events || []) {
    const vevent = eventToIcs(event, eventForUi, normalizeMeetingLink);
    if (vevent) lines.push(...vevent);
    else skipped += 1;
  }
  lines.push("END:VCALENDAR");
  return { ics: lines.join("\r\n"), skipped };
}
