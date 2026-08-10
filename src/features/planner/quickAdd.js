import { addDaysToKey, assertDateKey, isDateKey } from "../../shared/time/dateKey.js";
import { addMinutesToLocalDateTime } from "../../shared/time/localDateTime.js";

/* One line in, one draft out.
 *
 * The composer is thorough but form-shaped, and a planner is only the default
 * tool if capture is faster than the thought. This parser reads a single line —
 * "Lunch w/ Sara Tue 1pm 45m" — and returns the same shape the composer submits,
 * so quick add and the form are two doors into one code path rather than two
 * implementations of "create".
 *
 * Three rules keep it honest:
 *
 * 1. It never guesses a title. Whatever it did not consume *is* the title, so a
 *    word it fails to recognise survives instead of being silently dropped.
 * 2. It reports what it consumed. `confident` says whether the draft can be
 *    committed straight from the palette; anything less opens the composer
 *    prefilled with what did parse, which is why an unparseable line still
 *    saves the typing rather than throwing it away.
 * 3. Every token is matched on word boundaries and, for month names, only
 *    beside a number — otherwise "March" in "Marchbank review" and the modal
 *    "may" would eat half of people's titles.
 *
 * It is deliberately pure: no clock, no locale, no state. `todayDate` and
 * `weekStart` come from the caller so the same line parses identically in a
 * test, in a browser, and on a device an hour either side of midnight.
 */

const WEEKDAYS = [
  ["sunday", "sun", "su"],
  ["monday", "mon", "mo"],
  ["tuesday", "tues", "tue", "tu"],
  ["wednesday", "weds", "wed", "we"],
  ["thursday", "thurs", "thur", "thu", "th"],
  ["friday", "fri", "fr"],
  ["saturday", "sat", "sa"],
];

const MONTHS = [
  ["january", "jan"], ["february", "feb"], ["march", "mar"], ["april", "apr"],
  ["may"], ["june", "jun"], ["july", "jul"], ["august", "aug"],
  ["september", "sept", "sep"], ["october", "oct"], ["november", "nov"], ["december", "dec"],
];

const WEEKDAY_LOOKUP = new Map(WEEKDAYS.flatMap((names, index) => names.map((name) => [name, index])));
const MONTH_LOOKUP = new Map(MONTHS.flatMap((names, index) => names.map((name) => [name, index + 1])));

const WEEKDAY_WORDS = [...WEEKDAY_LOOKUP.keys()].sort((a, b) => b.length - a.length).join("|");
const MONTH_WORDS = [...MONTH_LOOKUP.keys()].sort((a, b) => b.length - a.length).join("|");

/* Longest-first alternation matters: "tues" must win over "tue" or the trailing
   "s" is left stranded in the title. */
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_EVENING_MINUTE = 19 * 60;

export const QUICK_ADD_SYNTAX = Object.freeze([
  Object.freeze({ token: "tue, next fri, tomorrow", means: "day" }),
  Object.freeze({ token: "jan 15, 15 jan, 3/14, 2026-03-14", means: "date" }),
  Object.freeze({ token: "in 3 days, in 2 weeks", means: "relative day" }),
  Object.freeze({ token: "1pm, 13:00, 9:30am, noon", means: "start time" }),
  Object.freeze({ token: "1-2pm, 9:00-10:30", means: "start and end" }),
  Object.freeze({ token: "45m, 90min, 1h, 1.5h", means: "duration" }),
  Object.freeze({ token: "by friday, due jan 9", means: "deadline (actions)" }),
  Object.freeze({ token: "#list", means: "list (actions)" }),
  Object.freeze({ token: "@tag", means: "tag (actions)" }),
  Object.freeze({ token: "todo: …", means: "force an action" }),
  Object.freeze({ token: "event: …", means: "force an event" }),
]);

function clampMinuteOfDay(minute) {
  return Math.max(0, Math.min(1439, Math.round(minute)));
}

/* A span is a half-open [start, end) slice of the original string. Consuming
   one blanks it out so a later pattern cannot match across a hole and so the
   leftover text — the title — falls out for free at the end. */
function makeScanner(text) {
  const kept = [...text];
  const consumed = [];
  return {
    /* The remaining text, with already-consumed spans blanked to spaces so
       positions stay stable for every subsequent pattern. */
    rest: () => kept.join(""),
    consumed: () => consumed.slice(),
    take(pattern, accept) {
      const source = kept.join("");
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const value = accept(match);
        if (value === null || value === undefined) continue;
        for (let i = match.index; i < match.index + match[0].length; i += 1) kept[i] = " ";
        consumed.push(match[0].trim());
        return value;
      }
      return null;
    },
  };
}

function normalizeTitle(text) {
  return text
    .replace(/\s+/g, " ")
    /* Connectives left dangling by a consumed token read as typos: "Lunch with
       on Tuesday" once "Tuesday" moves out is worse than "Lunch with". */
    .replace(/\s+(at|on|from|for|by|due|starting|start)\s*$/i, "")
    .replace(/^(at|on|from|for|by|due)\s+/i, "")
    .replace(/\s*[,;:–—-]\s*$/, "")
    .trim();
}

function hourMinuteToMinute(rawHour, rawMinute, meridiem) {
  let hour = Number(rawHour);
  const minute = rawMinute == null ? 0 : Number(rawMinute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const lower = meridiem[0].toLowerCase();
    if (lower === "p" && hour !== 12) hour += 12;
    if (lower === "a" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/* Bare "9" is a title far more often than it is nine o'clock, so an unqualified
   number is never a time: a time needs either a meridiem or a colon. */
const TIME_CORE = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|a|p)?`;
const TIME_RANGE = new RegExp(
  String.raw`\b(?:from\s+)?${TIME_CORE}\s*(?:-|–|—|to|until|til)\s*${TIME_CORE}\b`,
  "gi",
);
const TIME_SINGLE = new RegExp(String.raw`\b(?:at\s+)?${TIME_CORE}\b`, "gi");
/* Named hours are rewritten to digits before anything is scanned, so "noon-2pm"
   is a range by the same rule "12:00-2pm" is, instead of needing the whole time
   grammar written a second time in words. The rewrite always gets consumed by
   the numeric patterns, so a digit never surfaces in a title where a word was
   typed. */
const NAMED_TIME = /\b(noon|midday|midnight)\b/gi;
const NAMED_TIME_DIGITS = { noon: "12:00", midday: "12:00", midnight: "00:00" };
const DURATION = /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h|minutes|minute|mins|min|m)\b/gi;
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/g;
const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
const MONTH_FIRST = new RegExp(String.raw`\b(${MONTH_WORDS})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "gi");
const DAY_FIRST = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH_WORDS})\.?\b`, "gi");
const RELATIVE_DAY = /\b(?:in\s+)(\d{1,3})\s*(days?|weeks?)\b/gi;
const NAMED_DAY = /\b(today|tonight|tomorrow|tmr|tmrw|yesterday)\b/gi;
const WEEKDAY = new RegExp(String.raw`\b(next\s+|this\s+|on\s+)?(${WEEKDAY_WORDS})\b`, "gi");
const DEADLINE_LEAD = /\b(by|due)\b\s+/i;
const LIST_TOKEN = /(?:^|\s)#([^\s#@]+)/g;
const TAG_TOKEN = /(?:^|\s)@([^\s#@]+)/g;
const KIND_PREFIX = /^\s*(todo|task|action|event|meeting|appt|appointment)\s*:\s*/i;

function timeFromMatch(match, offset = 0) {
  return hourMinuteToMinute(match[offset + 1], match[offset + 2], match[offset + 3]);
}

/* "1-2pm" means 13:00–14:00, not 01:00–14:00: an unqualified first hour borrows
   the meridiem the range ends with. */
function borrowMeridiem(startMinute, endMinute, startHadMeridiem, endMeridiem) {
  if (startHadMeridiem || !endMeridiem || startMinute >= endMinute) return startMinute;
  const shifted = startMinute + 12 * 60;
  return shifted < endMinute && shifted < 1440 ? shifted : startMinute;
}

function nextWeekdayFrom(todayDate, weekdayIndex, modifier) {
  const todayIndex = new Date(`${todayDate}T00:00:00Z`).getUTCDay();
  let delta = (weekdayIndex - todayIndex + 7) % 7;
  /* "Tue" on a Tuesday means today — the day you are already standing on is the
     one people mean. "next Tue" is the week after, always. */
  if (modifier === "next") delta = delta === 0 ? 7 : delta + 7;
  return addDaysToKey(todayDate, delta);
}

function resolveMonthDay(todayDate, month, day, explicitYear) {
  const year = explicitYear ?? Number(todayDate.slice(0, 4));
  const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isDateKey(candidate)) return null;
  /* A bare "Jan 9" typed in December means the January that is coming, not the
     one eleven months gone. An explicit year is always taken at face value. */
  if (explicitYear == null && candidate < todayDate) {
    const rolled = `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isDateKey(rolled) ? rolled : null;
  }
  return candidate;
}

function scanDate(scanner, todayDate) {
  const iso = scanner.take(ISO_DATE, (match) => (isDateKey(match[1]) ? match[1] : null));
  if (iso) return iso;

  const named = scanner.take(NAMED_DAY, (match) => {
    const word = match[1].toLowerCase();
    if (word === "today") return { date: todayDate };
    if (word === "tonight") return { date: todayDate, impliedMinute: DEFAULT_EVENING_MINUTE };
    if (word === "yesterday") return { date: addDaysToKey(todayDate, -1) };
    return { date: addDaysToKey(todayDate, 1) };
  });
  if (named) return named;

  const relative = scanner.take(RELATIVE_DAY, (match) => {
    const amount = Number(match[1]);
    if (!Number.isInteger(amount) || amount < 0 || amount > 999) return null;
    return addDaysToKey(todayDate, match[2].toLowerCase().startsWith("week") ? amount * 7 : amount);
  });
  if (relative) return relative;

  const monthFirst = scanner.take(MONTH_FIRST, (match) => (
    resolveMonthDay(todayDate, MONTH_LOOKUP.get(match[1].toLowerCase()), Number(match[2]), null)
  ));
  if (monthFirst) return monthFirst;

  const dayFirst = scanner.take(DAY_FIRST, (match) => (
    resolveMonthDay(todayDate, MONTH_LOOKUP.get(match[2].toLowerCase()), Number(match[1]), null)
  ));
  if (dayFirst) return dayFirst;

  const numeric = scanner.take(NUMERIC_DATE, (match) => {
    const year = match[3] == null ? null : Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return resolveMonthDay(todayDate, Number(match[1]), Number(match[2]), year);
  });
  if (numeric) return numeric;

  return scanner.take(WEEKDAY, (match) => {
    const modifier = (match[1] || "").trim().toLowerCase();
    return nextWeekdayFrom(todayDate, WEEKDAY_LOOKUP.get(match[2].toLowerCase()), modifier);
  });
}

/* The deadline is scanned before the start day so "Tue by Friday" keeps them
   apart: the phrase after "by"/"due" is lifted out on its own and parsed as a
   date in isolation, then the whole phrase is removed from the line. */
function scanDeadline(scanner, todayDate) {
  const source = scanner.rest();
  const lead = DEADLINE_LEAD.exec(source);
  if (!lead) return null;
  const tailStart = lead.index + lead[0].length;
  const tail = source.slice(tailStart);
  const tailScanner = makeScanner(tail);
  const date = scanDate(tailScanner, todayDate);
  if (!date) return null;
  const resolved = typeof date === "string" ? date : date.date;
  const consumedTail = tail.length - tailScanner.rest().trimEnd().length;
  const phrase = new RegExp(
    `${lead[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${tail.slice(0, Math.max(1, consumedTail)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "i",
  );
  /* Re-consume through the scanner so the deadline phrase leaves the title. */
  scanner.take(new RegExp(phrase.source, "gi"), () => resolved);
  return resolved;
}

function scanTime(scanner) {
  const range = scanner.take(TIME_RANGE, (match) => {
    const start = timeFromMatch(match, 0);
    const end = timeFromMatch(match, 3);
    if (start == null || end == null) return null;
    /* A range needs a colon or a meridiem somewhere, or "Sprint 3 - 4" is a
       meeting from three to four. */
    if (!match[3] && !match[6] && !match[2] && !match[5]) return null;
    const startMinute = borrowMeridiem(start, end, Boolean(match[3]), match[6]);
    const span = end - startMinute;
    /* "3pm-3pm" is a typo, not a 24-hour event. Rejecting it here lets the line
       fall through to the single-time reading, which is what was meant. */
    if (span === 0) return null;
    return { startMinute, durationMinutes: span > 0 ? span : span + 1440 };
  });
  if (range) return range;

  return scanner.take(TIME_SINGLE, (match) => {
    if (!match[2] && !match[3]) return null;
    const startMinute = timeFromMatch(match, 0);
    return startMinute == null ? null : { startMinute };
  });
}

function scanDuration(scanner) {
  return scanner.take(DURATION, (match) => {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const unit = match[2].toLowerCase();
    const minutes = Math.round(unit.startsWith("h") ? amount * 60 : amount);
    return minutes > 0 && minutes <= 1440 ? minutes : null;
  });
}

function scanAll(pattern, scanner, accept) {
  const found = [];
  for (;;) {
    const value = scanner.take(pattern, accept);
    if (value == null) return found;
    found.push(value);
  }
}

/**
 * Parse one line of quick-add text into a composer-shaped draft.
 *
 * @param {string} text                 the raw line
 * @param {object} options
 * @param {string} options.todayDate    date key the relative words resolve against
 * @param {Array}  [options.lists]      `{ id, name }` lists a `#token` can name
 * @param {number} [options.defaultDurationMinutes]
 * @returns {object|null} a draft, or null when the line is blank
 */
export function parseQuickAdd(text, {
  todayDate,
  lists = [],
  defaultDurationMinutes = DEFAULT_DURATION_MINUTES,
} = {}) {
  if (typeof text !== "string") throw new TypeError("quick-add text must be a string");
  assertDateKey(todayDate, "todayDate");
  const trimmed = text.trim();
  if (!trimmed) return null;

  const forced = KIND_PREFIX.exec(trimmed);
  const forcedKind = forced
    ? (/^(event|meeting|appt|appointment)$/i.test(forced[1]) ? "event" : "task")
    : null;
  const body = (forced ? trimmed.slice(forced[0].length) : trimmed)
    .replace(NAMED_TIME, (word) => NAMED_TIME_DIGITS[word.toLowerCase()]);
  const scanner = makeScanner(body);

  /* "#42" in "review PR #42" is an issue number, not a list. Lists have names,
     so a purely numeric token is left in the title where it was typed. */
  const listNames = scanAll(LIST_TOKEN, scanner, (match) => (
    /^\d+$/.test(match[1]) ? null : match[1].toLowerCase()
  ));
  const tags = scanAll(TAG_TOKEN, scanner, (match) => match[1]);
  const deadline = scanDeadline(scanner, todayDate);
  const day = scanDate(scanner, todayDate);
  const time = scanTime(scanner);
  const duration = scanDuration(scanner);

  const date = day == null ? null : (typeof day === "string" ? day : day.date);
  const impliedMinute = day != null && typeof day !== "string" ? day.impliedMinute ?? null : null;
  const startMinute = time?.startMinute ?? impliedMinute ?? null;
  const title = normalizeTitle(scanner.rest());

  /* A time makes it an appointment; anything else is work to do. An explicit
     prefix always wins, because that is what a prefix is for. */
  const kind = forcedKind ?? (startMinute != null ? "event" : "task");
  const matchedList = listNames.length
    ? lists.find((list) => String(list?.name ?? "").toLowerCase() === listNames[0]) ?? null
    : null;

  const durationMinutes = kind !== "event" || startMinute == null
    ? null
    : duration ?? time?.durationMinutes ?? defaultDurationMinutes;

  return {
    kind,
    title,
    date,
    startMinute: startMinute == null ? null : clampMinuteOfDay(startMinute),
    durationMinutes,
    deadline: kind === "task" ? deadline : null,
    listId: matchedList?.id ?? null,
    listName: listNames[0] ?? null,
    tags,
    consumed: scanner.consumed(),
    /* Committable straight from the palette when there is something to call it
       and, for an event, a time to put it at. Everything else is still worth
       returning — the composer opens prefilled rather than empty. */
    confident: Boolean(title) && (kind !== "event" || startMinute != null),
  };
}

const pad = (value) => String(value).padStart(2, "0");
const asLocal = (date, minute) => `${date}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

/**
 * Turn a parsed draft into the payload the composer submits.
 *
 * Quick add and the form are two doors into one write: this returns exactly the
 * shape `Composer.onSubmit` emits, so a line typed in the palette takes the same
 * validation, the same recurring-scope question and the same undo entry as one
 * filled in by hand. Anything the line did not say takes the composer's own
 * default rather than a second set invented here.
 *
 * @param {object} draft         from `parseQuickAdd`
 * @param {object} options
 * @param {string} options.fallbackDate  the day in view, for a line with no date
 * @param {string} options.defaultCategory
 * @param {number} options.defaultReward
 */
export function quickAddToEntry(draft, { fallbackDate, defaultCategory, defaultReward = 30 } = {}) {
  if (!draft || !draft.title) return null;
  assertDateKey(fallbackDate, "fallbackDate");
  const common = {
    id: undefined,
    kind: draft.kind,
    title: draft.title,
    cat: defaultCategory,
    xp: defaultReward,
    place: "",
    link: "",
    note: "",
    allDay: false,
    endDate: "",
    alerts: [],
    repeat: null,
    recurrence: null,
    ...(draft.tags.length ? { tags: draft.tags } : {}),
    ...(draft.listId ? { listId: draft.listId } : {}),
  };

  if (draft.kind === "event") {
    const date = draft.date || fallbackDate;
    const start = draft.startMinute ?? 540;
    const dur = draft.durationMinutes ?? 60;
    const startLocal = asLocal(date, start);
    return {
      ...common,
      date,
      start,
      dur,
      at: null,
      estimate: null,
      due: null,
      timing: { kind: "timed", timeZoneMode: "floating", startLocal, endLocal: addMinutesToLocalDateTime(startLocal, dur) },
    };
  }

  /* An action with no day stays undated on purpose: that is what makes it carry
     forward instead of landing on whichever day happened to be on screen. */
  return {
    ...common,
    date: draft.date ?? null,
    unplanned: draft.date == null,
    start: 0,
    dur: 0,
    at: draft.date == null ? null : draft.startMinute,
    estimate: null,
    due: draft.deadline ?? null,
    timing: undefined,
  };
}

/* What the palette shows under the input: the draft in words, so the parse is
   visible before it is committed rather than a surprise afterwards. */
export function describeQuickAdd(draft, { formatDate, formatTime, formatDuration } = {}) {
  if (!draft || !draft.title) return "";
  const parts = [draft.kind === "event" ? "Event" : "Action", `"${draft.title}"`];
  if (draft.date && formatDate) parts.push(formatDate(draft.date));
  if (draft.startMinute != null && formatTime) parts.push(`at ${formatTime(draft.startMinute)}`);
  if (draft.durationMinutes && formatDuration) parts.push(`for ${formatDuration(draft.durationMinutes)}`);
  if (draft.deadline && formatDate) parts.push(`due ${formatDate(draft.deadline)}`);
  if (draft.listName) parts.push(`in ${draft.listName}`);
  if (draft.tags.length) parts.push(draft.tags.map((tag) => `@${tag}`).join(" "));
  return parts.join(" ");
}
