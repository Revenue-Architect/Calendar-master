import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as storage from "./storage.js";
import {
  appendBlock as appendNoteBlock,
  blocksToShorthand,
  blocksToText,
  createNote as createNoteCommand,
  deleteNote as deleteNoteCommand,
  dropRevisionsFor,
  getDailyNote,
  getNotebookNotes,
  getNotesForDate,
  getNotesForEntity,
  isEmptyNote,
  markBlockExtracted,
  migrateV6ToV7,
  noteExcerpt,
  parseInline,
  plainText,
  recordRevision,
  removeBlock as removeNoteBlock,
  restoredNote,
  revisionIsIntact,
  revisionsFor,
  searchNotes,
  archiveNote as archiveNoteCommand,
  pinNote as pinNoteCommand,
  toggleChecklistBlock,
  updateBlock as updateNoteBlock,
  updateNote as updateNoteCommand,
} from "./domains/notes/index.js";
import { migrateV4ToV5 } from "./domains/calendar/migrations/migrateV4ToV5.js";
import {
  SMART_VIEWS,
  addTaskDependency,
  allTags,
  blockingReasons,
  createTaskList,
  deleteTaskList,
  getEarliestResponsibleStart,
  getTasksByList,
  removeTaskDependency,
  resolveSmartView,
  setTaskStatus,
  smartViewCounts,
  completeTask as completeTaskCommand,
  completedOn,
  countOpen,
  createTask as createTaskCommand,
  deferTask as deferTaskCommand,
  getBlockedTasks,
  getDayTasks,
  getOverdueForToday,
  getSubtasksOf,
  getTaskBlockers,
  moveTaskToList,
  renameTaskList,
  setTaskReminders,
  setTaskTags,
  getUpcomingRange,
  getUpcomingDeadlines,
  migrateV5ToV6,
  normalizeTaskInput,
  parseTaskOccurrenceId,
  planTask as planTaskCommand,
  promoteChecklistItem as promoteChecklistItemCommand,
  removeTaskException,
  reopenTask as reopenTaskCommand,
  scheduleTask as scheduleTaskCommand,
  updateTask as updateTaskCommand,
  upsertTaskException,
} from "./domains/tasks/index.js";
import { loadPlannerState, savePlannerState } from "./platform/persistence/plannerStateStore.js";
import {
  createBlankPlannerState,
  normalizeImportedPlannerState,
} from "./platform/persistence/plannerStateImport.js";
import {
  projectNoteSearchResult,
  projectTaskSearchResult,
  searchResultDateLabel,
} from "./features/search/searchProjection.js";
import { textToNoteBlocks } from "./features/notes/noteText.js";
import { eventNoteLink, taskNoteLink } from "./features/notes/contextLink.js";
import {
  applyBulkTaskAction,
  createTaskMutationUndoPayload,
  deleteTaskFromPlannerState,
  restoreDeletedTaskInPlannerState,
  restoreTaskPlannedDates,
} from "./features/planner/taskMutations.js";
import { resolveTaskForInspection } from "./features/planner/taskInspection.js";
import {
  createEvent as createCalendarEvent,
  deleteEvent as deleteCalendarEvent,
  getOccurrencesForRange,
  legacyEventInputToCanonical,
  parseOccurrenceId,
  previewRecurrence,
  cancelOccurrence,
  modifyOccurrence,
  moveOccurrence,
  restoreOccurrence,
  splitSeries,
  moveEvent as moveCalendarEvent,
  packEventLanes,
  resizeEvent as resizeCalendarEvent,
  restoreEvent as restoreCalendarEvent,
  updateEvent as updateCalendarEvent,
} from "./domains/calendar/index.js";
import { addDays, addDaysToKey, diffDays, isDateKey, keyOf, parseKey } from "./shared/time/dateKey.js";
import { addMinutesToLocalDateTime, localDateTimeToEpochMinutes } from "./shared/time/localDateTime.js";
import { getOffsetCandidates } from "./shared/time/timezone.js";

/* ═══════════════════════ TOKENS ═══════════════════════ */

const THEMES = [
  { id: "obsidian-acid", name: "Obsidian / Acid", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#CCFF00", on: "#000000" },
  { id: "obsidian-cyan", name: "Obsidian / Cyan", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#00F0FF", on: "#000000" },
  { id: "ink-violet", name: "Ink / Violet", bg: "#0C0B12", card: "#15131E", line: "#221F2E", text: "#F1EFF7", dim: "#7C778C", faint: "#2B2739", accent: "#A855F7", on: "#150A22" },
  { id: "ember", name: "Ember / Orange", bg: "#0B0908", card: "#151110", line: "#211B18", text: "#F5F1EE", dim: "#857C75", faint: "#2C2521", accent: "#FF5500", on: "#1B0A02" },
  { id: "signal", name: "Obsidian / Crimson", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#FF2A55", on: "#1F0208" },
  { id: "raw-amber", name: "Raw Paper / Amber", bg: "#1A1917", card: "#221F1C", line: "#2C2822", text: "#F0EBE1", dim: "#8B8477", faint: "#38332B", accent: "#D97706", on: "#1B1102" },
  { id: "cream-terracotta", name: "Cream / Terracotta", bg: "#F4F1EA", card: "#FFFFFF", line: "#E4DED2", text: "#14141A", dim: "#79736A", faint: "#DED7C9", accent: "#C85A32", on: "#FFFFFF" },
  { id: "cream-sage", name: "Cream / Sage", bg: "#F4F1EA", card: "#FFFFFF", line: "#E4DED2", text: "#14141A", dim: "#79736A", faint: "#DED7C9", accent: "#789078", on: "#000000" },
  { id: "cream-slate", name: "Cream / Slate", bg: "#F1F2F4", card: "#FFFFFF", line: "#E1E3E7", text: "#14141A", dim: "#71757C", faint: "#D8DBE0", accent: "#5B7C99", on: "#FFFFFF" },
  { id: "linen-dusty", name: "Linen / Dusty Rose", bg: "#F7F3F4", card: "#FFFFFF", line: "#E9E0E2", text: "#1A1418", dim: "#7C7074", faint: "#E0D4D7", accent: "#C48B9F", on: "#000000" },


  /* Same neutrals as the sets above, new accents only. A theme here is a ground plus
     one colour, so a new accent is a new theme rather than a new palette. */
  { id: "obsidian-red", name: "Obsidian / Timepage Red", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#E23B2E", on: "#FFFFFF" },
  { id: "obsidian-blue", name: "Obsidian / Actions Blue", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#1BA3C4", on: "#00161C" },
  { id: "obsidian-forest", name: "Obsidian / Forest", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#34C77B", on: "#03210F" },
  { id: "cream-red", name: "Cream / Timepage Red", bg: "#F4F1EA", card: "#FFFFFF", line: "#E4DED2", text: "#14141A", dim: "#79736A", faint: "#DED7C9", accent: "#C8221B", on: "#FFFFFF" },
  { id: "cream-blue", name: "Cream / Actions Blue", bg: "#F1F2F4", card: "#FFFFFF", line: "#E1E3E7", text: "#14141A", dim: "#71757C", faint: "#D8DBE0", accent: "#0E7F99", on: "#FFFFFF" },
];

const CATS = ["DEEP WORK", "ADMIN", "BODY", "PEOPLE", "RITUAL"];

/* Category colour is the one hue an event card carries, so it has to read on both a
   near-black and a cream ground. These sit in the mid-luminance band where that
   holds, rather than being tinted per theme — a category keeps the same colour
   wherever you see it, which is what makes the dot scannable. */
const CAT_COLOR = {
  "DEEP WORK": "#E0A33E",
  ADMIN: "#5E8BC7",
  BODY: "#45A877",
  PEOPLE: "#D4456B",
  RITUAL: "#9B6FD4",
};
const catColor = (cat) => CAT_COLOR[cat] || "#8A8A96";
const CARD_R = 10;
const HOUR_H = 68;
const DAY_H = HOUR_H * 24;
const XP_PER_LEVEL = 300;
const HOLD_MS = 420;
const LIFT_MS = 300;
const SNAP = 5;
const NOW_RED = "#C43A56";
const ALERT_CHOICES = [0, 5, 15, 30, 60];
const DAY_LETTERS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const SERIF = "Georgia, Cambria, Times New Roman, serif";

/* ═══════════════════════ UTILS ═══════════════════════ */

const pad = (n) => String(n).padStart(2, "0");
const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WD1 = ["S", "M", "T", "W", "T", "F", "S"];
const MO = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
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
const uid = () => Math.random().toString(36).slice(2, 9);
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixHex = (a, b, t) => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
};
const isDark = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.5;
};
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${Math.round(m)}m`);
const snapTo = (m, s = SNAP) => Math.max(0, Math.min(1440, Math.round(m / s) * s));
/* A start is a minute of the day, and a day has no minute 1440. Snapping "now" at
   23:53 rounded up to it and built "…T24:00", which the time model rejects — from
   inside render, so the whole page went blank. A new entry begins in the last slot
   the day actually has. */
const startSlot = (m, s = 15) => Math.min(snapTo(m, s), 1440 - s);
/* The wire form a native time input speaks, independent of the 12/24 display clock. */
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fromHhmm = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const splitId = (id) => { const i = String(id).indexOf("@"); return i === -1 ? { base: id, date: null } : { base: id.slice(0, i), date: id.slice(i + 1) }; };
/* "STARTS" reads in the largest unit that still says something useful — days for
   next week, hours today, minutes when it is imminent, and past tense once gone. */
const minutesUntil = (dateKey, startMin, todayKey, nowMin) => diffDays(dateKey, todayKey) * 1440 + startMin - nowMin;
const countdownLabel = (dateKey, startMin, todayKey, nowMin, durationMin = 0) => {
  const minutes = minutesUntil(dateKey, startMin, todayKey, nowMin);
  /* An event that has begun is not "in -20 minutes"; it is happening, then over. */
  if (minutes <= 0) return minutes + durationMin > 0 ? "Now" : "Ended";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
};
const plannedLabel = (dateKey, todayKey) => {
  const days = diffDays(dateKey, todayKey);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return fmtDay(dateKey);
};
const fmtDay = (k) => { const d = parseKey(k); return `${WD[d.getDay()]} ${pad(d.getDate())} ${MO[d.getMonth()]}`; };

const recurrenceToRepeat = (recurrence) => recurrence ? {
  freq: recurrence.frequency,
  interval: recurrence.interval || 1,
  ...(recurrence.byWeekday ? { byDay: recurrence.byWeekday.map((value) => typeof value === "number" ? value : value.weekday) } : {}),
  until: recurrence.until || "",
  ...(recurrence.count ? { count: recurrence.count } : {}),
  endMode: recurrence.count ? "count" : recurrence.until ? "until" : "never",
  missingDatePolicy: recurrence.missingDatePolicy || "skip",
  ...(recurrence.frequency === "monthly" ? { monthlyMode: recurrence.byWeekday?.some((value) => typeof value === "object" && value.ordinal === -1) ? "last-weekday" : "day" } : {}),
} : null;

function eventForUi(event) {
  if (!event?.timing) return event;
  const repeat = recurrenceToRepeat(event.recurrence);
  if (event.timing.kind === "all-day") {
    return {
      ...event,
      date: event.date || event.timing.startDate,
      allDay: true,
      start: 0,
      dur: event.dur || 1440,
      endDate: addDaysToKey(event.timing.endDateExclusive, -1),
      repeat,
    };
  }
  const start = localDateTimeToEpochMinutes(event.timing.startLocal);
  const end = localDateTimeToEpochMinutes(event.timing.endLocal);
  return {
    ...event,
    date: event.date || event.timing.startLocal.slice(0, 10),
    allDay: false,
    start: event.start ?? ((start % 1440) + 1440) % 1440,
    dur: event.dur || end - start,
    endDate: event.timing.endLocal.slice(0, 10),
    repeat,
    timeZoneMode: event.timing.timeZoneMode,
    timeZone: event.timing.timeZone || "",
  };
}

function canonicalOccurrenceIdentity(id) {
  try { return parseOccurrenceId(id); } catch { return null; }
}

function eventTimingFromPosition(event, date, start = event.start, duration = event.dur) {
  if (event.timing.kind === "all-day") {
    const span = diffDays(event.timing.endDateExclusive, event.timing.startDate);
    return { kind: "all-day", startDate: date, endDateExclusive: addDaysToKey(date, span) };
  }
  const startLocal = addMinutesToLocalDateTime(`${date}T00:00`, start);
  const endLocal = addMinutesToLocalDateTime(startLocal, duration);
  if (event.timing.timeZoneMode === "floating") {
    return { kind: "timed", timeZoneMode: "floating", startLocal, endLocal };
  }
  const chooseOffset = (local, preferred) => {
    const candidates = getOffsetCandidates(local, event.timing.timeZone);
    if (!candidates.length) throw new RangeError(`${local} does not exist in ${event.timing.timeZone}`);
    const preferredCandidate = candidates.find((candidate) => candidate.offset === preferred);
    if (preferredCandidate) return preferredCandidate.offset;
    if (candidates.length === 1) return candidates[0].offset;
    throw new RangeError(`${local} is ambiguous; use the event editor to select an offset`);
  };
  return {
    kind: "timed", timeZoneMode: "zoned", startLocal, endLocal,
    timeZone: event.timing.timeZone,
    startOffset: chooseOffset(startLocal, event.timing.startOffset),
    endOffset: chooseOffset(endLocal, event.timing.endOffset),
  };
}

/* ─── recurrence ─── */
function taskOccursOn(item, dateKey) {
  if (dateKey < item.date) return false;
  const r = item.repeat;
  if (!r) return item.date === dateKey;
  if (r.until && dateKey > r.until) return false;
  const n = Math.max(1, r.interval || 1);
  const a = parseKey(dateKey), b = parseKey(item.date);
  if (r.freq === "daily") return diffDays(dateKey, item.date) % n === 0;
  if (r.freq === "weekly") {
    const days = r.byDay && r.byDay.length ? r.byDay : [b.getDay()];
    if (!days.includes(a.getDay())) return false;
    const wa = Math.floor((a - addDays(b, -b.getDay())) / (7 * 86400000));
    return wa % n === 0;
  }
  if (r.freq === "monthly") {
    if (a.getDate() !== b.getDate()) return false;
    return ((a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth())) % n === 0;
  }
  return false;
}


const repeatLabel = (r) => {
  if (!r) return "";
  const n = r.interval || 1;
  if (r.freq === "daily") return n === 1 ? "Every day" : `Every ${n} days`;
  if (r.freq === "weekly") {
    const d = (r.byDay || []).map((i) => DAY_LETTERS[i]).join(" ");
    return `${n === 1 ? "Weekly" : `Every ${n} weeks`}${d ? ` · ${d}` : ""}`;
  }
  if (r.freq === "monthly") return n === 1 ? "Monthly" : `Every ${n} months`;
  if (r.freq === "yearly") return n === 1 ? "Yearly" : `Every ${n} years`;
  return "";
};

/* ═══════════════════════ SOUND ═══════════════════════ */

function useSynth(enabled) {
  const ref = useRef(null);
  const ctx = () => {
    try {
      if (!ref.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ref.current = new AC();
      }
      if (ref.current.state === "suspended") ref.current.resume();
      return ref.current;
    } catch (e) { return null; }
  };
  return useCallback((kind, p = 0) => {
    if (!enabled) return;
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const tone = (type, f0, f1, d, g0, delay = 0) => {
      const o = c.createOscillator(), g = c.createGain();
      const t = t0 + delay;
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(g0, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + d + 0.03);
    };
    const paper = (secs, cut, gain) => {
      const len = Math.max(1, Math.floor(c.sampleRate * secs));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.1) * (0.55 + 0.45 * Math.sin(t * 34));
      }
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = cut; bp.Q.value = 0.7;
      const g = c.createGain(); g.gain.value = gain;
      src.connect(bp); bp.connect(g); g.connect(c.destination);
      src.start(t0);
    };
    switch (kind) {
      case "click": tone("triangle", 450, 120, 0.025, 0.16); break;
      case "tick": tone("sine", 800, 400, 0.015, 0.09); break;
      case "ratchet": tone("sine", 520 + 620 * p, 320 + 500 * p, 0.014, 0.05 + 0.07 * p); break;
      case "abort": tone("triangle", 300, 160, 0.05, 0.07); break;
      case "lift": tone("sine", 300, 520, 0.05, 0.09); break;
      case "drop": tone("triangle", 520, 240, 0.045, 0.12); break;
      case "commit":
        tone("sine", 523.25, 659.25, 0.12, 0.2);
        tone("triangle", 783.99, 1046.5, 0.16, 0.2);
        tone("sine", 1046.5, 1318.5, 0.18, 0.09, 0.06);
        break;
      case "levelup": [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone("triangle", f, f * 1.02, 0.14, 0.16, i * 0.07)); break;
      case "alert": [880, 1174.66].forEach((f, i) => tone("sine", f, f, 0.16, 0.16, i * 0.18)); break;
      case "page": paper(0.26, 2300, 0.26); tone("sine", 180, 90, 0.06, 0.05); break;
      case "schedule": tone("square", 660, 880, 0.03, 0.07); break;
      case "defer": tone("sine", 420, 220, 0.09, 0.11); break;
      case "delete": tone("sawtooth", 240, 50, 0.06, 0.14); break;
      default: break;
    }
  }, [enabled]);
}

/* ═══════════════════════ SEED ═══════════════════════ */

function seed() {
  const t = new Date();
  const k = (n) => keyOf(addDays(t, n));
  return {
    themeId: "obsidian-acid",
    sound: true,
    clock: "12",
    notifs: false,
    xp: 690,
    overrides: {},
    events: [
      { id: uid(), date: k(-30), title: "Morning pages", start: 420, dur: 30, cat: "RITUAL", place: "Kitchen table", note: "Three pages, longhand, no editing.", repeat: { freq: "daily", interval: 1 }, alerts: [] },
      { id: uid(), date: k(-28), title: "Standup", start: 690, dur: 25, cat: "PEOPLE", place: "Video", note: "", repeat: { freq: "weekly", interval: 1, byDay: [1, 2, 3, 4, 5] }, alerts: [5] },
      { id: uid(), date: k(0), title: "Deep block — pricing model", start: 540, dur: 120, cat: "DEEP WORK", place: "Desk", note: "Rebuild the tiering sheet. No inbox until this ships.", alerts: [15] },
      { id: uid(), date: k(0), title: "Lunch and a walk", start: 780, dur: 55, cat: "BODY", place: "Riverside loop", note: "", alerts: [] },
      { id: uid(), date: k(0), title: "Client review — Nordwell", start: 900, dur: 90, cat: "PEOPLE", place: "Room 4", note: "Bring the migration timeline and the two open risks.", alerts: [30] },
      { id: uid(), date: k(0), title: "Notes sync", start: 930, dur: 30, cat: "ADMIN", place: "", note: "", alerts: [] },
      { id: uid(), date: k(0), title: "Inbox sweep", start: 1050, dur: 30, cat: "ADMIN", place: "", note: "", alerts: [] },
      { id: uid(), date: k(1), title: "Roadmap workshop", start: 600, dur: 180, cat: "DEEP WORK", place: "Studio", note: "", alerts: [] },
      { id: uid(), date: k(2), title: "Offsite — Ridgeway", allDay: true, endDate: k(4), start: 0, dur: 0, cat: "PEOPLE", place: "Ridgeway House", note: "Pack the plotter prints.", alerts: [] },
      { id: uid(), date: k(3), title: "Dentist", start: 665, dur: 45, cat: "ADMIN", place: "", note: "", alerts: [60] },
      { id: uid(), date: k(5), title: "Dinner — Ana and Theo", start: 1140, dur: 120, cat: "PEOPLE", place: "Osteria", note: "", alerts: [] },
    ],
    tasks: [
      { id: uid(), date: k(0), at: null, due: k(0), order: 0, title: "Ship the pricing model v2", cat: "DEEP WORK", xp: 60, done: false, note: "The whole day bends around this one.", subs: [
        { id: uid(), title: "Pull last quarter's cohort data", done: true },
        { id: uid(), title: "Rebuild the tier math", done: false },
        { id: uid(), title: "Sanity-check against three live accounts", done: false },
      ] },
      { id: uid(), date: k(0), at: null, due: k(2), order: 1, title: "Send Nordwell the migration timeline", cat: "PEOPLE", xp: 40, done: false, note: "", subs: [
        { id: uid(), title: "Confirm cutover weekend", done: false },
        { id: uid(), title: "Attach the risk register", done: false },
      ] },
      { id: uid(), date: k(-20), at: 1140, due: null, order: 2, title: "Walk 8k steps", cat: "BODY", xp: 30, done: false, note: "", subs: [], repeat: { freq: "daily", interval: 1 } },
      { id: uid(), date: k(0), at: null, due: null, order: 3, title: "Reconcile receipts", cat: "ADMIN", xp: 30, done: true, note: "", subs: [] },
      { id: uid(), date: k(-1), at: null, due: k(-1), order: 4, title: "Chase the Vela invoice", cat: "ADMIN", xp: 30, done: false, note: "", subs: [] },
      { id: uid(), date: k(1), at: null, due: k(1), order: 5, title: "Draft the workshop agenda", cat: "DEEP WORK", xp: 50, done: false, note: "", subs: [] },
      { id: uid(), date: k(-1), at: null, due: null, order: 6, title: "Close the books", cat: "ADMIN", xp: 40, done: true, note: "", subs: [] },
      { id: uid(), date: k(-2), at: null, due: null, order: 7, title: "Weekly review", cat: "RITUAL", xp: 40, done: true, note: "", subs: [] },
    ],
    notes: [
      { id: uid(), date: k(0), text: "The pricing work keeps stalling in the same place — the moment it touches legacy accounts. Worth naming that out loud tomorrow instead of routing around it again." },
    ],
  };
}

/* ═══════════════════════ APP ═══════════════════════ */

export default function Planner() {
  const [db, setDb] = useState(null);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  const [zoom, setZoom] = useState("week");
  const [dateKey, setDateKey] = useState(keyOf(new Date()));
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [sheet, setSheet] = useState(false);
  const [inspect, setInspect] = useState(null);
  const [composer, setComposer] = useState(null);
  const [noteEdit, setNoteEdit] = useState(null);
  const [noteHistory, setNoteHistory] = useState(null);
  const [notebook, setNotebook] = useState(null);
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(false);
  const [scopeAsk, setScopeAsk] = useState(null);
  const [reward, setReward] = useState(null);
  const [levelFlash, setLevelFlash] = useState(null);
  const [undo, setUndo] = useState(null);
  const [gesture, setGesture] = useState(null);
  const [turn, setTurn] = useState(null);
  const [swipe, setSwipe] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const [alertToast, setAlertToast] = useState(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [storageBad, setStorageBad] = useState(!storage.writable);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(null);
  const [smartView, setSmartView] = useState("today");
  const [dependencyPicker, setDependencyPicker] = useState(null);
  const [listManager, setListManager] = useState(false);
  const [viewMode, setViewMode] = useState("timeline");
  const [listPicker, setListPicker] = useState(null);
  const [selection, setSelection] = useState(null);
  const [firstRun, setFirstRun] = useState(false);

  const stripRef = useRef(null);
  const activeRef = useRef(null);
  const streamRef = useRef(null);
  const listRef = useRef(null);
  const saveT = useRef(null);
  const undoT = useRef(null);
  const prevLevel = useRef(null);
  const pinch = useRef(null);
  const swipeRef = useRef(null);
  const holdRef = useRef(null);
  const gestureRef = useRef(null);
  const tappedRef = useRef(false);
  const firedRef = useRef(new Set());

  useEffect(() => { gestureRef.current = gesture; }, [gesture]);
  const startGesture = (g) => { gestureRef.current = g; setGesture(g); };
  const endGesture = () => { gestureRef.current = null; setGesture(null); };

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const loaded = await loadPlannerState(storage);
        const state = loaded.state || migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(seed())));
        if (!loaded.state) await savePlannerState(storage, state);
        /* A brand-new notebook opens on someone else's week. The sample is useful for
           judging the app and confusing as your own planner, so the first run asks
           rather than assuming. */
        if (!dead) { setDb(state); setStorageBad(false); setFirstRun(!loaded.state); setReady(true); }
      } catch (error) {
        /* Either the device can't be written to, or what's already stored is
           unreadable. Open a fresh notebook in memory so the app is still usable —
           without it `ready` flips while `db` stays null and the loader never
           clears — but leave autosave off. Overwriting here would seed straight over
           data that is damaged rather than gone, and export stays the way out. */
        if (!dead) { setDb(migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(seed())))); setSaveBlocked(true); setStorageBad(true); setReady(true); }
      }
    })();
    return () => { dead = true; };
  }, []);

  useEffect(() => { if (ready) { const r = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(r); } }, [ready]);

  useEffect(() => {
    if (!ready || !db || saveBlocked) return;
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      savePlannerState(storage, db).then(() => setStorageBad(false), () => setStorageBad(true));
    }, 400);
    return () => clearTimeout(saveT.current);
  }, [db, ready]);

  useEffect(() => { const i = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(i); }, []);

  const T = useMemo(() => THEMES.find((t) => t.id === (db && db.themeId)) || THEMES[0], [db]);
  const beep = useSynth(db ? db.sound : true);
  /* An event card sits *above* the day surface, so it is lifted off the page rather
     than cut into it. Blending keeps the fill opaque so cards never show the grid
     lines through them. */
  const dark = isDark(T.bg);
  const surface = dark ? mixHex(T.card, "#FFFFFF", 0.13) : mixHex(T.card, "#000000", 0.06);
  const hourRule = dark ? mixHex(T.card, "#FFFFFF", 0.05) : mixHex(T.card, "#000000", 0.05);
  const hourBand = dark ? mixHex(T.card, "#FFFFFF", 0.022) : mixHex(T.card, "#000000", 0.018);
  /* On small screens the actions sheet is an overlay, so the day surface reserves
     room for it: the collapsed handle normally, the full sheet when it is open, so
     the surface contracts instead of running underneath something opaque. The
     breakpoint stays in CSS rather than being read from window at render time,
     which would not survive a resize. */
  const sheetPad = sheet ? "76dvh" : "64px";
  const clock = (db && db.clock) || "12";
  const tm = (m) => fmtTime(m, clock);

  /* The theme lives in state, so the page around the app has to follow it: the body
     (otherwise overscroll shows a mismatched strip), the browser chrome on mobile,
     and color-scheme — which is what makes the native date and time pickers in the
     composer legible instead of dark-on-dark. */
  useEffect(() => {
    document.body.style.background = T.bg;
    document.documentElement.style.colorScheme = isDark(T.bg) ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", T.bg);
  }, [T]);

  const todayKey = keyOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = dateKey === todayKey;
  const activeDate = parseKey(dateKey);
  const ov = (db && db.overrides) || {};

  const days = useMemo(() => { const s = addDays(new Date(), -2); return Array.from({ length: 14 }, (_, i) => addDays(s, i)); }, [todayKey]);
  const monthGrid = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthCursor]);

  /* One continuous run of days rather than a single page. Reads go through the same
     domain queries the timeline uses, so an occurrence, an exception or a missed
     habit behaves identically in both views. */
  /* Backwards as well as forwards: "what did I do last week" is a question the
     agenda is the right view to answer, and it could not before. */
  const AGENDA_BACK = 7;
  const AGENDA_SPAN = 28;
  const agenda = useMemo(() => {
    if (!db) return [];
    const start = addDaysToKey(dateKey, -AGENDA_BACK);
    const end = addDaysToKey(start, AGENDA_SPAN);
    const events = getOccurrencesForRange(db, start, end, { segments: true }).map(eventForUi);
    const tasks = getUpcomingRange(db, start, AGENDA_SPAN);
    return Array.from({ length: AGENDA_SPAN }, (_, i) => {
      const key = addDaysToKey(start, i);
      const onDay = events.filter((e) => e.date === key);
      return {
        key,
        allDay: onDay.filter((e) => e.allDay),
        timed: onDay.filter((e) => !e.allDay).sort((a, b) => a.start - b.start),
        tasks: tasks.filter((t) => t.planned.date === key)
          .sort((a, b) => (a.planned.startMinute ?? 1441) - (b.planned.startMinute ?? 1441)),
      };
    });
  }, [db, dateKey]);

  const dayEvents = useMemo(() => (db
    ? getOccurrencesForRange(db, dateKey, addDaysToKey(dateKey, 1), { segments: true }).map(eventForUi)
    : []), [db, dateKey]);
  const timed = useMemo(() => dayEvents.filter((e) => !e.allDay), [dayEvents]);
  const allDay = useMemo(() => dayEvents.filter((e) => e.allDay), [dayEvents]);
  /* All task reads go through the Tasks domain. Recurring series are expanded into
     occurrences here rather than stored, so the screen never sees an exception. */
  const dayTasks = useMemo(() => (db ? getDayTasks(db, dateKey) : []), [db, dateKey]);
  const notes = useMemo(() => (db ? getNotesForDate(db.notes, dateKey) : []), [db, dateKey]);
  const openCount = countOpen(dayTasks);

  /* §5.5 and §9.3 now decide this: a one-off task is overdue once its deadline has
     passed, and a series contributes only what its missed-occurrence policy still
     considers owed — nothing at all under the default `skip`. */
  const overdue = useMemo(() => (db ? getOverdueForToday(db, todayKey) : []), [db, todayKey]);

  const deadlines = useMemo(
    () => (db ? getUpcomingDeadlines(db.tasks, todayKey, 10) : []),
    [db, todayKey],
  );

  const blockedIds = useMemo(() => {
    if (!db) return new Set();
    return new Set(getBlockedTasks(db.tasks).map((task) => task.id));
  }, [db]);

  const events = useMemo(() => {
    const g = gesture;
    const list = timed.map((e) => (g && g.id === e.id && (g.mode === "move" || g.mode === "resize") ? { ...e, start: g.start, dur: g.dur } : e));
    return packEventLanes(list);
  }, [timed, gesture]);

  const xp = db ? db.xp : 0;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelPct = ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100;

  const streak = useMemo(() => {
    if (!db) return 0;
    const doneOn = (k) => completedOn(db, k);
    let n = 0, cur = new Date(now);
    if (!doneOn(keyOf(cur))) cur = addDays(cur, -1);
    while (n < 60 && doneOn(keyOf(cur))) { n++; cur = addDays(cur, -1); }
    return n;
  }, [db, todayKey, ov]);

  useEffect(() => {
    if (prevLevel.current !== null && level > prevLevel.current) {
      beep("levelup"); buzz([12, 40, 12]);
      setLevelFlash(level);
      const t = setTimeout(() => setLevelFlash(null), 2400);
      prevLevel.current = level;
      return () => clearTimeout(t);
    }
    prevLevel.current = level;
  }, [level]);

  useEffect(() => {
    if (ready && zoom === "week" && activeRef.current && stripRef.current) {
      stripRef.current.scrollTo({ left: activeRef.current.offsetLeft - 24, behavior: mounted ? "smooth" : "auto" });
    }
  }, [dateKey, ready, zoom]);

  useEffect(() => {
    if (!ready || !streamRef.current) return;
    const first = timed.slice().sort((a, b) => a.start - b.start)[0];
    const anchor = isToday ? nowMin : first ? first.start : 480;
    streamRef.current.scrollTop = Math.max(0, (anchor / 1440) * DAY_H - 140);
  }, [ready, dateKey, turn]);

  const mutate = (fn) => setDb((d) => (d ? fn({ ...d }) : d));

  /* ─── reminders ─── */
  useEffect(() => {
    if (!db) return;
    const todays = getOccurrencesForRange(db, todayKey, addDaysToKey(todayKey, 1), { segments: true })
      .map(eventForUi)
      .filter((e) => !e.allDay && e.alerts && e.alerts.length);
    todays.forEach((e) => {
      (e.alerts || []).forEach((a) => {
        const fireAt = e.start - a;
        const key = `${e.id}|${a}`;
        if (firedRef.current.has(key)) return;
        if (nowMin >= fireAt && nowMin < fireAt + 2) {
          firedRef.current.add(key);
          const body = a === 0 ? `Starting now · ${tm(e.start)}` : `In ${dur(a)} · ${tm(e.start)}`;
          beep("alert"); buzz([10, 60, 10]);
          setAlertToast({ title: e.title, body, k: uid() });
          setTimeout(() => setAlertToast(null), 8000);
          try {
            if (db.notifs && "Notification" in window && Notification.permission === "granted") new Notification(e.title, { body });
          } catch (err) {}
        }
      });
    });

    /* §12.1. Task reminders hang off a date the task already has, so a rescheduled
       task moves its reminder with it instead of firing at the old moment. */
    const fire = (title, body) => {
      beep("alert"); buzz([10, 60, 10]);
      setAlertToast({ title, body, k: uid() });
      setTimeout(() => setAlertToast(null), 8000);
      try {
        if (db.notifs && "Notification" in window && Notification.permission === "granted") new Notification(title, { body });
      } catch (err) {}
    };
    getDayTasks(db, todayKey)
      .filter((task) => task.status !== "completed" && (task.reminders ?? []).length)
      .forEach((task) => {
        task.reminders.forEach((reminder) => {
          const anchorDate = reminder.anchor === "deadline" ? task.deadline.date
            : reminder.anchor === "followUp" ? task.followUpDate
              : task.planned.date;
          if (anchorDate !== todayKey) return;
          const anchorMinute = reminder.anchor === "deadline"
            ? task.deadline.minute ?? 9 * 60
            : task.planned.startMinute ?? 9 * 60;
          const fireAt = anchorMinute - reminder.offsetMinutes;
          const key = `task:${task.id}|${reminder.id}`;
          if (firedRef.current.has(key)) return;
          if (nowMin >= fireAt && nowMin < fireAt + 2) {
            firedRef.current.add(key);
            fire(task.title, reminder.offsetMinutes === 0
              ? `Due now · ${tm(anchorMinute)}`
              : `In ${dur(reminder.offsetMinutes)} · ${tm(anchorMinute)}`);
          }
        });
      });
  }, [now, db, todayKey]);

  const askNotifs = async () => {
    try {
      if (!("Notification" in window)) return;
      const p = await Notification.requestPermission();
      mutate((d) => ({ ...d, notifs: p === "granted" }));
      beep(p === "granted" ? "commit" : "abort");
    } catch (e) {}
  };

  const densityOf = useCallback((d) => {
    if (!db) return 0;
    const k = keyOf(d);
    return getOccurrencesForRange(db, k, addDaysToKey(k, 1)).length + getDayTasks(db, k).filter((t) => t.status !== "completed").length;
  }, [db, ov]);

  const briefing = useMemo(() => {
    if (!db) return "";
    const sorted = timed.slice().sort((a, b) => a.start - b.start);
    if (dateKey < todayKey) return `Archive · ${sorted.length} events, ${dayTasks.filter((t) => t.status === "completed").length} done`;
    if (dateKey > todayKey) return sorted.length ? `${sorted.length} events · first at ${tm(sorted[0].start)}` : `${openCount} actions waiting, nothing scheduled`;
    const live = sorted.find((e) => nowMin >= e.start && nowMin < e.start + e.dur);
    if (live) return `${live.title} · ${dur(live.start + live.dur - nowMin)} left`;
    const next = sorted.find((e) => e.start > nowMin);
    if (next) return `${dur(next.start - nowMin)} free until ${next.title}`;
    return openCount ? `Nothing left scheduled · ${openCount} open ${openCount === 1 ? "action" : "actions"}` : "Day's clear. Nothing scheduled, nothing open.";
  }, [db, dateKey, todayKey, nowMin, timed, openCount, dayTasks]);

  const suggested = useMemo(() => {
    const busy = [...timed.map((e) => [e.start, e.start + e.dur]), ...dayTasks.filter((t) => t.planned.startMinute != null).map((t) => [t.planned.startMinute, t.planned.startMinute + 30])];
    const free = [];
    for (let h = 6; h <= 22; h++) {
      const s = h * 60, e = s + 60;
      if (!busy.some(([a, b]) => s < b && e > a)) free.push(h);
    }
    const anchor = isToday ? nowMin / 60 : 9;
    return free.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor)).slice(0, 2);
  }, [timed, dayTasks, isToday, nowMin]);

  /* §6.3. Lane packing already computes overlap clusters; an event sharing its
     cluster is double-booked. Detected, warned about, never prevented. */
  const conflictIds = useMemo(() => new Set(events.filter((e) => e.cols > 1).map((e) => e.id)), [events]);
  const liveEvent = isToday ? events.find((e) => nowMin >= e.start && nowMin < e.start + e.dur) : null;
  const livePct = liveEvent ? (nowMin - liveEvent.start) / liveEvent.dur : 0;
  const laneL = liveEvent ? (liveEvent.lane / liveEvent.cols) * 100 : 0;
  const laneW = liveEvent ? 100 / liveEvent.cols : 100;

  /* ─── day turning ─── */
  const goDay = useCallback((n) => {
    beep("page");
    setTurn({ dir: n, k: uid() });
    setDateKey((k) => keyOf(addDays(parseKey(k), n)));
  }, [beep]);
  const jumpTo = (k) => {
    /* Guard the entry point rather than every caller: a bad key used to reach
       parseKey and take the whole screen down with it. */
    if (!isDateKey(k) || k === dateKey) return;
    beep("page");
    setTurn({ dir: k > dateKey ? 1 : -1, k: uid() });
    setDateKey(k);
  };

  const onSwipeStart = (e) => {
    if (e.touches.length !== 1 || gestureRef.current) return;
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, live: false };
  };
  const onSwipeMove = (e) => {
    const s = swipeRef.current;
    if (!s || e.touches.length !== 1 || gestureRef.current) return;
    const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
    if (!s.live && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.4) { s.live = true; clearTimeout(holdRef.current); }
    if (s.live) {
      /* The committed distance is kept on the ref as well as in state: the end
         handler must decide from the last position actually seen, not from a state
         value that may not have flushed. */
      s.dx = Math.max(-140, Math.min(140, dx));
      setSwipe(s.dx);
    }
  };
  const onSwipeEnd = () => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (s && s.live && Math.abs(s.dx) > 64) {
      /* Drop the drag offset in the same commit as the page turn and without a
         transition. Springing the page back while the turn animation rotates the
         new one in animates two transforms against each other on nested elements,
         which is the jump. Only the turn should play. */
      setSnapping(true);
      setSwipe(0);
      goDay(s.dx < 0 ? 1 : -1);
      requestAnimationFrame(() => setSnapping(false));
      return;
    }
    setSwipe(0);
  };

  useEffect(() => {
    const h = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      /* Every modal counts. Leaving the newer sheets off this list let shortcuts act
         on the page behind them — arrow keys turned days while the first-run choice
         was still up. */
      if (inspect || composer || settings || noteEdit || noteHistory || notebook || scopeAsk
        || firstRun || confirmComplete || dependencyPicker || listPicker || pendingImport) return;
      if (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); setSearch(true); return; }
      if (search) return;
      if (e.key === "ArrowRight") goDay(1);
      if (e.key === "ArrowLeft") goDay(-1);
      if (e.key === "t" || e.key === "T") jumpTo(todayKey);
      if (e.key === "n" || e.key === "N") setComposer({ kind: "event", start: startSlot(nowMin), dur: 60 });
      /* Completion, deferral and inspection were pointer-only — a hold, a swipe and a
         tap with no keyboard path. These act on the first open action of the day. */
      if (e.key === "c" || e.key === "C") {
        const next = dayTasks.find((t) => t.status !== "completed");
        if (next) completeTask(next.id);
      }
      if (e.key === "d" || e.key === "D") {
        const next = dayTasks.find((t) => t.status !== "completed");
        if (next && next.planned.date) deferTask(next.id, 1);
      }
      if (e.key === "a" || e.key === "A") setComposer({ kind: "task" });
      if ((e.key === "z" && (e.metaKey || e.ctrlKey)) && undo) { e.preventDefault(); runUndo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dateKey, inspect, composer, settings, noteEdit, noteHistory, notebook, search, scopeAsk, goDay, todayKey, nowMin, dayTasks, undo, firstRun, confirmComplete, dependencyPicker, listPicker, pendingImport]);

  /* ─── writes (series-aware) ─── */
  const flash = (label, payload) => {
    clearTimeout(undoT.current);
    setUndo({ label, payload, k: uid() });
    undoT.current = setTimeout(() => setUndo(null), 6000);
  };

  const patchItem = (kind, id, patch, scope = "one") => {
    if (kind === "event") {
      mutate((d) => updateCalendarEvent(d, id, patch, {
        scope: scope === "all" ? "series" : "occurrence",
      }).state);
      return;
    }
    const { base, date } = splitId(id);
    mutate((d) => {
      if (!date) {
        d.tasks = d.tasks.map((x) => (x.id === base ? { ...x, ...patch } : x));
        return d;
      }
      if (scope === "all") {
        d.tasks = d.tasks.map((x) => (x.id === base ? { ...x, ...patch } : x));
      } else {
        d.overrides = { ...d.overrides, [`${base}@${date}`]: { ...(d.overrides[`${base}@${date}`] || {}), ...patch } };
      }
      return d;
    });
  };

  const findTask = (id) => dayTasks.find((t) => t.id === id) || (db && db.tasks.find((t) => t.id === id));
  const nowStamp = () => new Date().toISOString().slice(0, 16);

  /* One write path for both plain tasks and series occurrences.
     An occurrence id is `series@date`. Completing or reopening one records a typed
     exception so the series definition and its earlier completion history stay
     intact (§9.4/§9.5). Any other edit detaches that single occurrence into a real
     one-off task and cancels it on the series, which is how "just this one" edits
     avoid rewriting the whole series. */
  const writeTask = (id, command, intent = {}) => {
    mutate((d) => {
      const { seriesId, occurrenceDate } = parseTaskOccurrenceId(id);
      const series = occurrenceDate ? d.tasks.find((t) => t.id === seriesId && t.recurrence) : null;
      if (!series) return { ...d, tasks: command(d, id).tasks };

      /* "The whole series" edits the series definition itself. The answer used to be
         discarded here, so choosing the series still detached a single day — the
         scope sheet asked a question and then ignored it. */
      if (intent.scope === "all") return { ...d, tasks: command(d, seriesId, series).tasks };

      if (intent.completed) {
        return {
          ...d,
          taskExceptions: upsertTaskException(d.taskExceptions, {
            id: uid(), seriesId, occurrenceDate, kind: "completed", completedAt: nowStamp(),
          }),
        };
      }
      if (intent.reopened) {
        return { ...d, taskExceptions: removeTaskException(d.taskExceptions, seriesId, occurrenceDate) };
      }
      const detachedId = uid();
      const detached = normalizeTaskInput({
        ...series,
        id: detachedId,
        recurrence: null,
        planned: { ...series.planned, date: occurrenceDate },
      });
      const staged = {
        ...d,
        tasks: [...d.tasks, detached],
        taskExceptions: upsertTaskException(d.taskExceptions, {
          id: uid(), seriesId, occurrenceDate, kind: "cancelled",
        }),
      };
      return { ...staged, tasks: command(staged, detachedId).tasks };
    });
  };

  const completeTask = (id, force = false) => {
    const t = findTask(id);
    if (!t || t.status === "completed") return;

    /* §15.4/§7.4. Blocking is advisory, so the domain reports what stands in the way
       and the screen decides. Rather than silently forcing it through, name the
       blocker and let the user confirm. */
    const reasons = blockingReasons(db.tasks, t);
    if (reasons.length && !force) {
      beep("abort");
      setConfirmComplete({ id, reasons });
      return;
    }
    beep("commit"); buzz([8, 30, 14]);
    setReward({ xp: t.reward, k: uid() });
    setTimeout(() => setReward(null), 900);
    writeTask(id, (state, taskId) => completeTaskCommand(state.tasks, taskId, {
      now: new Date().toISOString().slice(0, 16),
      override: true,
    }), { completed: true });
    mutate((d) => ({ ...d, xp: d.xp + (t.reward || 0) }));
    /* §10.3. Completion is the most-used action and fires from a 420ms hold, so it
       is the one that most needs a way back. */
    flash("Completed", { type: "task-complete", id, reward: t.reward || 0 });
    setConfirmComplete(null);
  };
  const reopenTask = (id) => {
    const t = findTask(id);
    if (!t || t.status !== "completed") return;
    beep("click");
    writeTask(id, (state, taskId) => reopenTaskCommand(state.tasks, taskId), { reopened: true });
    mutate((d) => ({ ...d, xp: Math.max(0, d.xp - (t.reward || 0)) }));
  };
  const deferTask = (id, n = 1) => {
    const t = findTask(id);
    if (!t) return;
    beep("defer"); buzz(10);
    /* §5.4 keeps the deadline where it is; only the plan moves. */
    const undoPayload = createTaskMutationUndoPayload(db, id, { type: "task-defer", id, n: -n });
    writeTask(id, (state, taskId) => deferTaskCommand(state.tasks, taskId, n));
    flash(n > 0 ? "Moved to tomorrow" : "Moved back", undoPayload);
  };
  const moveToDay = (kind, id, targetKey) => {
    beep("drop"); buzz(8);
    const item = kind === "event" ? dayEvents.find((e) => e.id === id) : findTask(id);
    if (!item) return;
    const { base, date } = splitId(id);
    if (kind === "event") {
      const canonical = canonicalOccurrenceIdentity(id);
      const scope = canonical || date ? "occurrence" : "series";
      if (canonical) {
        const result = moveOccurrence(db, id, eventTimingFromPosition(item, targetKey), { id: uid() });
        setDb(result.state);
        flash(`Moved to ${fmtDay(targetKey)}`, { type: "restore-calendar-occurrence", snapshot: result.removed });
        return;
      }
      mutate((d) => moveCalendarEvent(d, id, { date: targetKey }, { scope }).state);
      flash(`Moved to ${fmtDay(targetKey)}`, {
        type: "calendar-event-move",
        id,
        target: { date: item.date, start: item.start },
        scope,
      });
      return;
    }
    const undoPayload = createTaskMutationUndoPayload(db, id, {
      type: "back-date", kind, id, date: item.planned?.date,
    });
    writeTask(id, (state, taskId) => planTaskCommand(state.tasks, taskId, {
      date: targetKey,
      startMinute: item.planned?.startMinute ?? null,
      estimateMinutes: item.planned?.estimateMinutes ?? null,
    }));
    flash(`Moved to ${fmtDay(targetKey)}`, undoPayload);
  };
  const pullOverdue = () => {
    beep("schedule");
    /* Everything counted as overdue is a real one-off task, so everything counted is
       something this button can actually move — the count always clears. */
    const ids = overdue.map((t) => ({ id: t.id, date: t.planned.date }));
    mutate((d) => {
      let tasks = d.tasks;
      for (const entry of ids) {
        tasks = planTaskCommand(tasks, entry.id, {
          date: todayKey,
          startMinute: tasks.find((task) => task.id === entry.id)?.planned.startMinute ?? null,
          estimateMinutes: tasks.find((task) => task.id === entry.id)?.planned.estimateMinutes ?? null,
        }).tasks;
      }
      return { ...d, tasks };
    });
    flash(`${ids.length} planned for today`, { type: "task-restore-dates", ids });
  };
  const duplicateEvent = (id) => {
    const e = dayEvents.find((x) => x.id === id);
    if (!e) return;
    beep("schedule");
    const nid = uid();
    const copy = { ...e };
    delete copy.id;
    delete copy.seriesId;
    delete copy.recurrenceDate;
    delete copy.recurrenceAnchor;
    delete copy.instance;
    delete copy.timing;
    delete copy.recurrence;
    delete copy.segmentId;
    mutate((d) => createCalendarEvent(d, {
      ...copy,
      repeat: null,
      date: dateKey,
      start: e.allDay ? 0 : Math.min(1440 - e.dur, e.start + (e.dur || 60)),
    }, { id: nid }).state);
    setInspect(null);
    flash("Duplicated", { type: "drop-event", id: nid });
  };
  const scheduleTask = (id, at) => {
    beep("schedule"); buzz(8);
    writeTask(id, (state, taskId) => scheduleTaskCommand(state.tasks, taskId, at));
  };
  const reorderTask = (id, targetId) => {
    beep("tick");
    /* §11.1. Rank is explicit and dense, so a reload cannot reshuffle the list. */
    mutate((d) => {
      const { seriesId: from } = parseTaskOccurrenceId(id);
      const { seriesId: to } = parseTaskOccurrenceId(targetId);
      const list = [...d.tasks].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
      const fromIndex = list.findIndex((t) => t.id === from);
      const toIndex = list.findIndex((t) => t.id === to);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return d;
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      const ranks = new Map(list.map((t, i) => [t.id, i]));
      return { ...d, tasks: d.tasks.map((t) => ({ ...t, rank: ranks.get(t.id) ?? t.rank })) };
    });
  };
  const patchChecklist = (taskId, next) => {
    writeTask(taskId, (state, id) => updateTaskCommand(state.tasks, id, {
      checklist: next(state.tasks.find((t) => t.id === id).checklist ?? []),
    }));
  };
  const toggleSub = (taskId, subId) => {
    beep("tick");
    patchChecklist(taskId, (checklist) => checklist.map((item) => (
      item.id === subId
        ? { ...item, done: !item.done, completedAt: item.done ? null : nowStamp() }
        : item
    )));
  };
  const addSub = (taskId, title) => {
    beep("tick");
    patchChecklist(taskId, (checklist) => [...checklist, { id: uid(), title, done: false, order: checklist.length }]);
  };
  const removeSub = (taskId, subId) => {
    beep("delete");
    patchChecklist(taskId, (checklist) => checklist.filter((item) => item.id !== subId));
  };
  /* §8.4. A step that needs its own planning stops being a checklist line and
     becomes a real subtask, keeping its title, state and place in the order. */
  const blockOn = (taskId, blockerId) => {
    const seriesId = parseTaskOccurrenceId(taskId).seriesId;
    try {
      /* Validated eagerly against current state, not inside the state updater: a
         throw from within an updater runs during render and escapes this catch,
         which would crash the screen instead of explaining the rejected edge. */
      const next = addTaskDependency(db.tasks, seriesId, blockerId, { now: nowStamp() });
      mutate((d) => ({ ...d, tasks: next.tasks }));
      beep("schedule");
      setDependencyPicker(null);
    } catch (error) {
      /* §15.2 rejects cycles and hierarchy edges; say which, rather than failing mute. */
      beep("abort");
      setDependencyPicker((current) => ({ ...current, error: error.message }));
    }
  };
  const unblockTask = (taskId, blockerId) => {
    beep("delete");
    const seriesId = parseTaskOccurrenceId(taskId).seriesId;
    mutate((d) => ({ ...d, tasks: removeTaskDependency(d.tasks, seriesId, blockerId, { now: nowStamp() }).tasks }));
  };
  const changeStatus = (taskId, status) => {
    beep("tick");
    const seriesId = parseTaskOccurrenceId(taskId).seriesId;
    mutate((d) => ({
      ...d,
      tasks: setTaskStatus(d.tasks, seriesId, status, {
        now: nowStamp(),
        followUpDate: status === "waiting" ? keyOf(addDays(now, 3)) : null,
      }).tasks,
    }));
  };
  const setList = (taskId, listId) => {
    beep("tick");
    const seriesId = parseTaskOccurrenceId(taskId).seriesId;
    mutate((d) => ({ ...d, tasks: moveTaskToList(d.tasks, seriesId, listId, d.taskLists).tasks }));
    setListPicker(null);
  };
  const setTags = (taskId, tags) => {
    beep("tick");
    const seriesId = parseTaskOccurrenceId(taskId).seriesId;
    mutate((d) => ({ ...d, tasks: setTaskTags(d.tasks, seriesId, tags).tasks }));
  };
  /* One reminder per task for now, anchored to the planned time (§12.1). Offering a
     list of offsets rather than a free field keeps it a single tap. */
  const setReminder = (taskId, offsetMinutes) => {
    beep(offsetMinutes == null ? "abort" : "schedule");
    const seriesId = parseTaskOccurrenceId(taskId).seriesId;
    mutate((d) => ({
      ...d,
      tasks: setTaskReminders(d.tasks, seriesId,
        offsetMinutes == null ? [] : [{ id: uid(), anchor: "planned", offsetMinutes }],
        { now: nowStamp() }).tasks,
    }));
  };
  /* §11.3. Every bulk action runs each task through the same command a single task
     would use, and counts what actually changed. A run that reports "5 completed"
     when two were blocked is worse than no bulk action at all — the whole risk of
     operating on many things at once is not noticing what refused. */
  const runBulk = (action, bulkArg = null) => {
    const ids = [...(selection ?? [])];
    if (!ids.length) return;
    const before = structuredClone(db);
    const result = applyBulkTaskAction(db, ids, action, {
      bulkArg,
      createId: uid,
      now: nowStamp(),
      todayKey,
    });
    const done = result.completedIds.length;
    const failed = result.failures;
    setDb(result.state);
    beep(failed.length ? "abort" : "commit");
    flash(
      failed.length
        ? `${done} of ${ids.length} — ${failed.length} ${failed[0].reason === "blocked" ? "blocked" : "refused"}`
        : `${done} ${action === "delete" ? "deleted" : action === "complete" ? "completed" : action === "tag" ? "tagged" : action === "priority" ? "reprioritised" : "moved"}`,
      done ? { type: "restore-planner-state", snapshot: { state: before } } : null,
    );
    setSelection(null);
  };
  const promoteSub = (taskId, subId) => {
    beep("schedule");
    writeTask(taskId, (state, id) => promoteChecklistItemCommand(state.tasks, id, subId, uid(), { now: nowStamp() }));
    flash("Promoted to a subtask", null);
  };

  const doDelete = (kind, id, scope) => {
    beep("delete");
    const { base, date } = splitId(id);
    let removed = null;
    if (kind === "event") {
      const canonical = canonicalOccurrenceIdentity(id);
      let result;
      if (canonical && scope === "one") {
        result = cancelOccurrence(db, id, { id: uid() });
      } else if (canonical && scope === "following") {
        const newSeriesId = uid();
        const split = splitSeries(db, id, {}, { newSeriesId });
        const deleted = deleteCalendarEvent(split.state, newSeriesId, { scope: "series" });
        result = {
          ...deleted,
          removed: { kind: "planner-state", state: structuredClone(db) },
        };
      } else {
        result = deleteCalendarEvent(db, canonical ? canonical.seriesId : id, { scope: "series" });
      }
      removed = result.removed;
      setDb(result.state);
      setInspect(null); setScopeAsk(null);
      flash(scope === "one" && date ? "This one skipped" : "Deleted", {
        type: canonical && scope === "one"
          ? "restore-calendar-occurrence"
          : canonical && scope === "following"
            ? "restore-planner-state"
            : "restore-calendar-event",
        snapshot: removed,
      });
      return;
    }
    if (kind === "task") {
      const targetId = date && scope === "one" ? id : base;
      const result = deleteTaskFromPlannerState(db, targetId, { exceptionId: uid() });
      const reward = result.removed.kind === "series" && result.removed.tasks[0]?.status === "completed"
        ? result.removed.tasks[0].reward || 0
        : 0;
      setDb(reward
        ? { ...result.state, xp: Math.max(0, result.state.xp - reward) }
        : result.state);
      setInspect(null); setScopeAsk(null);
      flash(result.removed.kind === "occurrence" ? "This one skipped" : "Deleted", {
        type: "restore-task-deletion",
        removed: result.removed,
        reward,
      });
      return;
    }
    /* What is being deleted has to be read here, not inside the updater: React runs
       the updater after the handler returns, so the old code handed flash a payload
       that was still null and undoing a deleted note silently restored nothing. */
    removed = kind === "note" ? db.notes.find((n) => n.id === base) ?? null : null;
    /* A revision cannot outlive the note it snapshots — but undo has to be able to
       put both back, so the history rides along in the undo payload. */
    const removedRevisions = kind === "note" ? revisionsFor(db.noteRevisions, base) : [];
    mutate((d) => (kind === "note" && removed
      ? { ...d, notes: deleteNoteCommand(d.notes, base).notes, noteRevisions: dropRevisionsFor(d.noteRevisions, [base]) }
      : d));
    setInspect(null); setNoteEdit(null); setNoteHistory(null); setScopeAsk(null);
    flash("Deleted", { type: "restore", kind, item: removed, revisions: removedRevisions });
  };

  const removeItem = (kind, id) => {
    const { date } = splitId(id);
    if (date || (kind === "event" && canonicalOccurrenceIdentity(id))) setScopeAsk({ action: "delete", kind, id });
    else doDelete(kind, id, "all");
  };

  const runUndo = () => {
    /* Some messages are just confirmations and carry nothing to reverse; reading
       .type off a missing payload threw out of the state updater and blanked the
       page. Those messages no longer offer the button either. */
    if (!undo || !undo.payload) return;
    const p = undo.payload;
    beep("click");
    mutate((d) => {
      if (p.type === "restore" && p.item) {
        if (p.kind === "note") {
          d.notes = [...d.notes, p.item];
          /* revisionsFor hands back newest-first; the store keeps them oldest-first
             so the head it compares against is the latest one. */
          if (p.revisions?.length) {
            d.noteRevisions = [...(d.noteRevisions ?? []), ...[...p.revisions].sort((a, b) => a.revision - b.revision)];
          }
        }
      }
      if (p.type === "restore-task-deletion" && p.removed) {
        const restored = restoreDeletedTaskInPlannerState(d, p.removed);
        return p.reward ? { ...restored, xp: restored.xp + p.reward } : restored;
      }
      if (p.type === "restore-calendar-event") return restoreCalendarEvent(d, p.snapshot).state;
      if (p.type === "restore-calendar-occurrence") return restoreOccurrence(d, p.snapshot).state;
      if (p.type === "restore-planner-state" && p.snapshot?.state) return structuredClone(p.snapshot.state);
      if (p.type === "drop-event") return deleteCalendarEvent(d, p.id, { scope: "series" }).state;
      if (p.type === "task-complete") {
        const seriesId = parseTaskOccurrenceId(p.id).seriesId;
        const target = d.tasks.find((x) => x.id === seriesId);
        if (target && target.status === "completed") d.tasks = reopenTaskCommand(d.tasks, seriesId).tasks;
        d.taskExceptions = removeTaskException(d.taskExceptions, seriesId, parseTaskOccurrenceId(p.id).occurrenceDate ?? "");
        d.xp = Math.max(0, d.xp - (p.reward || 0));
      }
      if (p.type === "unskip") { const o = { ...d.overrides }; delete o[p.key]; d.overrides = o; }
      /* Deferral moves the planned date, so undo moves it back — the old handler
         keyed on a payload type deferTask never emits and a field tasks no longer
         have, which made undoing a defer silently do nothing. */
      if (p.type === "task-defer" || p.type === "task-date") {
        const seriesId = parseTaskOccurrenceId(p.id).seriesId;
        d.tasks = d.tasks.map((t) => (t.id === seriesId && t.planned.date
          ? { ...t, planned: { ...t.planned, date: addDaysToKey(t.planned.date, p.n) } }
          : t));
      }
      if (p.type === "back-date") d.tasks = restoreTaskPlannedDates(d.tasks, [{ id: p.id, date: p.date }]);
      if (p.type === "calendar-event-move") return moveCalendarEvent(d, p.id, p.target, { scope: p.scope }).state;
      if (p.type === "task-restore-dates") d.tasks = restoreTaskPlannedDates(d.tasks, p.ids);
      if (p.type === "event-time") return updateCalendarEvent(d, p.id, { start: p.start, dur: p.dur }, { scope: p.scope }).state;
      return d;
    });
    setUndo(null);
  };

  const commitSave = (p, scope) => {
    beep(p.id ? "click" : "schedule");
    const patch = p.kind === "event"
      ? { title: p.title, start: p.start, dur: p.dur, cat: p.cat, place: p.place, note: p.note, allDay: p.allDay, endDate: p.endDate || null, repeat: p.repeat, recurrence: p.recurrence, timing: p.timing, alerts: p.alerts }
      : {
        title: p.title,
        category: p.cat,
        reward: p.xp,
        note: p.note,
        planned: { date: p.unplanned ? null : (p.date || dateKey), startMinute: p.unplanned ? null : (p.at ?? null), estimateMinutes: null },
        deadline: { date: p.due || null, minute: null },
        recurrence: p.repeat ? { ...p.repeat, frequency: p.repeat.freq ?? p.repeat.frequency, missedPolicy: p.repeat.missedPolicy ?? "skip" } : null,
      };
    if (p.date && scope !== "one") patch.date = p.date;
    if (p.id && p.kind === "event") {
      const canonical = canonicalOccurrenceIdentity(p.id);
      mutate((d) => {
        if (!canonical) return updateCalendarEvent(d, p.id, patch, { scope: scope === "all" ? "series" : "occurrence" }).state;
        const eventInput = legacyEventInputToCanonical({ ...patch, date: p.date || dateKey });
        if (scope === "one") {
          const { timing, recurrence, ...metadata } = eventInput;
          return moveOccurrence(d, p.id, timing, { id: uid(), patch: metadata }).state;
        }
        if (scope === "following") {
          return splitSeries(d, p.id, {
            ...eventInput,
            recurrence: eventInput.recurrence,
          }, { newSeriesId: uid() }).state;
        }
        const base = d.events.find((event) => event.id === canonical.seriesId);
        let seriesTiming = eventInput.timing;
        if (base?.timing.kind === "timed" && eventInput.timing.kind === "timed") {
          const baseDate = base.timing.startLocal.slice(0, 10);
          const duration = localDateTimeToEpochMinutes(eventInput.timing.endLocal) - localDateTimeToEpochMinutes(eventInput.timing.startLocal);
          const startLocal = `${baseDate}${eventInput.timing.startLocal.slice(10)}`;
          seriesTiming = {
            ...eventInput.timing,
            startLocal,
            endLocal: addMinutesToLocalDateTime(startLocal, duration),
            startOffset: undefined,
            endOffset: undefined,
          };
        } else if (base?.timing.kind === "all-day" && eventInput.timing.kind === "all-day") {
          const span = diffDays(eventInput.timing.endDateExclusive, eventInput.timing.startDate);
          seriesTiming = { kind: "all-day", startDate: base.timing.startDate, endDateExclusive: addDaysToKey(base.timing.startDate, span) };
        }
        return updateCalendarEvent(d, canonical.seriesId, { ...patch, date: undefined, timing: seriesTiming }, { scope: "series" }).state;
      });
    } else if (p.id && p.kind === "task") {
      const { occurrenceDate } = parseTaskOccurrenceId(p.id);
      writeTask(p.id, (state, taskId, series) => updateTaskCommand(
        state.tasks, taskId,
        /* Editing the whole series must not drag its anchor to whichever day you
           happened to open. The planned date moves only when that field itself
           moved — otherwise renaming Thursday's instance would re-anchor the rule
           to Thursday and change which days it lands on. */
        series && p.date === occurrenceDate
          ? { ...patch, planned: { ...patch.planned, date: series.planned.date } }
          : patch,
        { now: nowStamp() },
      ), { scope });
    } else if (p.id) patchItem(p.kind, p.id, patch, scope);
    else {
      mutate((d) => {
        if (p.kind === "event") return createCalendarEvent(d, {
          date: p.date || dateKey,
          ...patch,
          alerts: p.alerts || [],
        }, { id: uid() }).state;
        return { ...d, tasks: createTaskCommand(d.tasks, { id: uid(), ...patch }, { now: nowStamp() }).tasks };
      });
    }
    setScopeAsk(null);
    /* §4.6. A composer has done its job once it writes and gets out of the way. An
       inline edit has not: closing the record you are editing after every field
       would make editing in place worse than the form it replaced. */
    if (!p.inline) { setComposer(null); setInspect(null); }
  };
  const saveEntry = (p) => {
    const { date } = splitId(p.id || "");
    if (p.id && (date || canonicalOccurrenceIdentity(p.id))) setScopeAsk({ action: "save", payload: p });
    else commitSave(p, "all");
  };

  /* §4.5/§4.8. One shape describes a record for writing, whichever surface asked.
     The composer builds it from its fields; the detail view builds it from the
     record. Because both hand the same payload to the same write, an inline title
     change takes exactly the path the composer's does — including the scope
     question a recurring entry has to ask. */
  const entryPayload = (kind, item) => (kind === "task"
    ? {
      kind: "task", id: item.id, title: item.title, cat: item.category, xp: item.reward,
      at: item.planned.startMinute, due: item.deadline.date || "", date: item.planned.date || dateKey,
      unplanned: !item.planned.date, note: item.note,
      repeat: item.recurrence ? { ...item.recurrence, freq: item.recurrence.frequency, byDay: item.recurrence.byWeekday } : null,
    }
    : { ...item, kind, id: item.id });

  const saveNote = (draft, text, title) => {
    beep("click");
    mutate((d) => {
      const kind = draft.kind || "daily";
      /* §4.1. A day has one daily note, so writing on a day that already has one
         edits it rather than making a second. Every other capture owns its own
         durable identity; a standalone or contextual note must never be folded
         into the day merely because it happened to be written there. */
      const targetId = draft.id || (kind === "daily" ? getDailyNote(d.notes, draft.date || dateKey)?.id : null);
      if (targetId) {
        const current = d.notes.find((n) => n.id === targetId);
        const saved = updateNoteCommand(d.notes, targetId, {
          title,
          blocks: textToNoteBlocks(text, current?.blocks ?? [], uid),
        }, { now: nowStamp() });
        /* §10.2. A save that changed nothing returns the same collection and leaves
           no revision behind, so reopening the editor cannot inflate the history. */
        if (saved.notes === d.notes) return d;
        return {
          ...d,
          notes: saved.notes,
          /* History holds what the document was before this save; the live note is
             always the head, so a restore goes back to a body someone actually saw. */
          noteRevisions: recordRevision(d.noteRevisions, current, { at: nowStamp() }),
        };
      }
      return {
        ...d,
        notes: createNoteCommand(d.notes, {
          id: uid(),
          kind,
          ...(kind === "daily" ? { date: draft.date || dateKey } : {}),
          title,
          links: draft.links || [],
          blocks: textToNoteBlocks(text, [], uid),
        }, { now: nowStamp() }).notes,
      };
    });
    setNoteEdit(null);
  };

  const setNotePinned = (note) => {
    beep("tick");
    mutate((d) => ({
      ...d,
      notes: pinNoteCommand(d.notes, note.id, !note.pinned, { now: nowStamp() }).notes,
    }));
    setNoteEdit((current) => (current?.id === note.id ? { ...current, pinned: !note.pinned } : current));
  };

  const setNoteArchived = (note, archived) => {
    beep(archived ? "delete" : "commit");
    mutate((d) => ({
      ...d,
      notes: archiveNoteCommand(d.notes, note.id, archived, { now: nowStamp() }).notes,
    }));
    if (archived) setNoteEdit(null);
    else setNoteEdit((current) => (current?.id === note.id ? { ...current, archived: false } : current));
  };

  const newContextualNote = () => {
    if (!inspectNoteContext) return;
    beep("click");
    setInspect(null);
    setNoteEdit({
      kind: inspectNoteContext.type,
      blocks: [],
      links: [{
        type: inspectNoteContext.type,
        targetId: inspectNoteContext.targetId,
        ...(inspectNoteContext.occurrenceDate ? { occurrenceDate: inspectNoteContext.occurrenceDate } : {}),
      }],
      contextLabel: inspectNoteContext.label,
    });
  };

  /* §10.2. Restoring is itself an edit: the body someone is leaving becomes the new
     head of the history, so nothing is erased by going back. */
  const restoreNoteRevision = (noteId, revision) => {
    beep("commit");
    mutate((d) => {
      const current = d.notes.find((n) => n.id === noteId);
      if (!current) return d;
      const back = restoredNote(current, revision);
      const saved = updateNoteCommand(d.notes, noteId, { title: back.title, blocks: back.blocks }, { now: nowStamp() });
      if (saved.notes === d.notes) return d;
      return {
        ...d,
        notes: saved.notes,
        noteRevisions: recordRevision(d.noteRevisions, current, { at: nowStamp(), source: "restore" }),
      };
    });
    setNoteHistory(null); setNoteEdit(null);
    flash("Went back to an earlier version", null);
  };

  const toggleNoteCheck = (noteId, blockId) => {
    beep("tick");
    mutate((d) => ({ ...d, notes: toggleChecklistBlock(d.notes, noteId, blockId, { now: nowStamp() }).notes }));
  };
  /* §7.1. Turning a line into a task is a Tasks write plus a Notes reference; the
     block records which task it produced so the line cannot spawn a second one. */
  const extractTask = (noteId, blockId, title) => {
    const taskId = uid();
    beep("commit");
    mutate((d) => ({
      ...d,
      tasks: createTaskCommand(d.tasks, {
        id: taskId,
        title,
        planned: { date: dateKey, startMinute: null, estimateMinutes: null },
        category: CATS[0],
        reward: 30,
      }, { now: nowStamp() }).tasks,
      notes: markBlockExtracted(d.notes, noteId, blockId, taskId, { now: nowStamp() }).notes,
    }));
    flash("Added to actions", null);
  };

  /* ─── export / import ─── */
  const download = (name, text, mime) => {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      beep("commit");
    } catch (e) { beep("abort"); }
  };
  const exportJson = () => download(`planner-${todayKey}.json`, JSON.stringify(db, null, 2), "application/json");
  const exportIcs = () => {
    const esc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Not Boring Moleskine Planner//EN"];
    db.events.forEach((e) => {
      const view = eventForUi(e);
      lines.push("BEGIN:VEVENT", `UID:${e.id}@planner`, `SUMMARY:${esc(e.title)}`);
      if (view.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${e.timing.startDate.replace(/-/g, "")}`);
        lines.push(`DTEND;VALUE=DATE:${e.timing.endDateExclusive.replace(/-/g, "")}`);
      } else {
        lines.push(
          `DTSTART:${e.timing.startLocal.replace(/[-:]/g, "")}00`,
          `DTEND:${e.timing.endLocal.replace(/[-:]/g, "")}00`,
        );
      }
      if (view.repeat) {
        const r = view.repeat;
        let rule = `FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval || 1}`;
        if (r.freq === "weekly" && r.byDay && r.byDay.length) rule += `;BYDAY=${r.byDay.map((i) => DAY_LETTERS[i]).join(",")}`;
        if (r.until) rule += `;UNTIL=${r.until.replace(/-/g, "")}T235900Z`;
        lines.push(`RRULE:${rule}`);
      }
      if (e.place) lines.push(`LOCATION:${esc(e.place)}`);
      if (e.note) lines.push(`DESCRIPTION:${esc(e.note)}`);
      (e.alerts || []).forEach((a) => lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:-PT${a}M`, `DESCRIPTION:${esc(e.title)}`, "END:VALARM"));
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    download(`planner-${todayKey}.ics`, lines.join("\r\n"), "text/calendar");
  };
  const importJson = (file) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        if (parsed && parsed.events) setPendingImport(normalizeImportedPlannerState(parsed));
        else beep("abort");
      } catch (e) { beep("abort"); }
    };
    r.readAsText(file);
  };
  const wipeAll = () => {
    beep("delete");
    setDb(createBlankPlannerState({ themeId: T.id, sound: db.sound, notifs: db.notifs, clock: db.clock }));
    setConfirmWipe(false);
    setSettings(false);
  };

  /* ─── zoom ─── */
  const zoomOut = () => { if (zoom === "day") { setZoom("week"); beep("tick"); } else if (zoom === "week") { setMonthCursor(activeDate); setZoom("month"); beep("tick"); } };
  const zoomIn = () => { if (zoom === "month") { setZoom("week"); beep("tick"); } else if (zoom === "week") { setZoom("day"); beep("tick"); } };
  const onTouchStartNav = (e) => { if (e.touches.length === 2) pinch.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); };
  const onTouchMoveNav = (e) => {
    if (e.touches.length !== 2 || !pinch.current) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (d / pinch.current > 1.3) { zoomIn(); pinch.current = d; }
    else if (d / pinch.current < 0.77) { zoomOut(); pinch.current = d; }
  };

  /* ─── stream gestures ─── */
  const minutesAt = (clientY) => {
    const el = streamRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return ((clientY - r.top + el.scrollTop) / DAY_H) * 1440;
  };
  const hitAttr = (x, y, attr) => {
    try {
      const el = document.elementFromPoint(x, y);
      const m = el && el.closest(`[${attr}]`);
      return m ? m.getAttribute(attr) : null;
    } catch (e) { return null; }
  };

  /* live mirrors so the native listeners below never read stale data */
  const eventsRef = useRef([]);
  const dateKeyRef = useRef(dateKey);
  const applyRef = useRef(() => {});
  const finishRef = useRef(() => {});

  const applyMove = (x, y) => {
    const g = gestureRef.current;
    if (!g) return;
    const overDay = hitAttr(x, y, "data-day");
    const overTask = hitAttr(x, y, "data-task");
    const m = minutesAt(y);
    const next = { ...g, x, y, overDay, overTask };
    if (g.mode === "move" && !overDay) next.start = Math.max(0, Math.min(1440 - g.dur, snapTo(m - g.grab)));
    if (g.mode === "resize") next.dur = Math.max(10, Math.min(1440 - g.start, snapTo(m - g.start)));
    if (g.mode === "draft") next.dur = Math.max(15, snapTo(m - g.start) || 15);
    gestureRef.current = next;
    setGesture(next);
  };

  const finishGesture = (x, y) => {
    const g = gestureRef.current;
    endGesture();
    if (!g) return;
    const key = dateKeyRef.current;
    if (g.mode === "move") {
      if (g.overDay && g.overDay !== key) moveToDay("event", g.id, g.overDay);
      else {
        beep("drop"); buzz(8);
        const canonical = canonicalOccurrenceIdentity(g.id);
        if (canonical) {
          const item = eventsRef.current.find((event) => event.id === g.id);
          const timing = eventTimingFromPosition(item, key, g.start, g.dur);
          const result = moveOccurrence(db, g.id, timing, { id: uid() });
          setDb(result.state);
          flash(`Moved to ${tm(g.start)}`, { type: "restore-calendar-occurrence", snapshot: result.removed });
        } else {
          const scope = splitId(g.id).date ? "occurrence" : "series";
          mutate((d) => moveCalendarEvent(d, g.id, { start: g.start }, { scope }).state);
          flash(`Moved to ${tm(g.start)}`, { type: "event-time", id: g.id, start: g.was.start, dur: g.was.dur, scope });
        }
      }
    } else if (g.mode === "resize") {
      beep("drop");
      const canonical = canonicalOccurrenceIdentity(g.id);
      if (canonical) {
        const item = eventsRef.current.find((event) => event.id === g.id);
        const timing = eventTimingFromPosition(item, key, g.start, g.dur);
        const result = moveOccurrence(db, g.id, timing, { id: uid() });
        setDb(result.state);
        flash(`Set to ${dur(g.dur)}`, { type: "restore-calendar-occurrence", snapshot: result.removed });
      } else {
        const scope = splitId(g.id).date ? "occurrence" : "series";
        mutate((d) => resizeCalendarEvent(d, g.id, g.dur, { scope }).state);
        flash(`Set to ${dur(g.dur)}`, { type: "event-time", id: g.id, start: g.was.start, dur: g.was.dur, scope });
      }
    } else if (g.mode === "draft") {
      beep("click");
      setComposer({ kind: "event", start: g.start, dur: g.dur });
    } else if (g.mode === "task") {
      if (g.overDay && g.overDay !== key) moveToDay("task", g.id, g.overDay);
      else if (g.overTask && g.overTask !== g.id) reorderTask(g.id, g.overTask);
      else {
        const el = streamRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) scheduleTask(g.id, snapTo(minutesAt(y), 15));
        }
      }
    }
  };

  applyRef.current = applyMove;
  finishRef.current = finishGesture;

  /* mouse / pen only — touch is handled by the delegated listeners below,
     because a scroll container fires pointercancel the instant the browser
     claims the gesture, which would kill every long press. */
  const canvasDown = (e) => {
    if (e.button === 2 || e.pointerType === "touch") return;
    const startMin = snapTo(minutesAt(e.clientY));
    tappedRef.current = true;
    holdRef.current = setTimeout(() => {
      tappedRef.current = false;
      beep("lift"); buzz(12);
      startGesture({ mode: "draft", start: startMin, dur: 30 });
    }, LIFT_MS);
  };
  const canvasUp = (e) => {
    if (e.pointerType === "touch") return;
    clearTimeout(holdRef.current); holdRef.current = null;
    if (gestureRef.current) return;
    if (tappedRef.current) {
      tappedRef.current = false;
      beep("click");
      setComposer({ kind: "event", start: startSlot(minutesAt(e.clientY)), dur: 60 });
    }
  };
  const eventDown = (e, ev) => {
    if (e.pointerType === "touch") return;
    e.stopPropagation();
    const grab = minutesAt(e.clientY) - ev.start;
    tappedRef.current = true;
    holdRef.current = setTimeout(() => {
      tappedRef.current = false;
      beep("lift"); buzz(14);
      startGesture({ mode: "move", kind: "event", id: ev.id, start: ev.start, dur: ev.dur, grab, was: { start: ev.start, dur: ev.dur }, x: e.clientX, y: e.clientY });
    }, LIFT_MS);
  };
  const eventUp = (e, ev) => {
    if (e.pointerType === "touch") return;
    clearTimeout(holdRef.current); holdRef.current = null;
    if (gestureRef.current) return;
    if (tappedRef.current) { tappedRef.current = false; e.stopPropagation(); beep("click"); setInspect({ kind: "event", id: ev.id }); }
  };
  const resizeDown = (e, ev) => {
    if (e.pointerType === "touch") return;
    e.stopPropagation();
    clearTimeout(holdRef.current); holdRef.current = null;
    tappedRef.current = false;
    beep("lift");
    startGesture({ mode: "resize", kind: "event", id: ev.id, start: ev.start, dur: ev.dur, was: { start: ev.start, dur: ev.dur } });
  };

  /* ─── touch: delegated on the stream, driven entirely by touch events ─── */
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    const press = { t: null };
    const disarm = () => { if (press.t) { clearTimeout(press.t.timer); press.t = null; } };

    const onStart = (e) => {
      if (e.touches.length !== 1 || gestureRef.current) return;
      const t = e.touches[0];
      const node = e.target.closest ? e.target.closest("[data-event-id],[data-resize],[data-task-chip]") : null;
      const m = minutesAt(t.clientY);
      if (node && node.hasAttribute("data-resize")) {
        const ev = eventsRef.current.find((x) => x.id === node.getAttribute("data-resize"));
        if (ev) { beep("lift"); buzz(10); startGesture({ mode: "resize", kind: "event", id: ev.id, start: ev.start, dur: ev.dur, was: { start: ev.start, dur: ev.dur }, x: t.clientX, y: t.clientY }); }
        return;
      }
      const chipId = node && node.getAttribute("data-task-chip");
      const id = node && node.getAttribute("data-event-id");
      const ev = id ? eventsRef.current.find((x) => x.id === id) : null;
      const p = { x: t.clientX, y: t.clientY, ev, chipId, startMin: snapTo(m), grab: ev ? m - ev.start : 0, held: false, timer: null };
      p.timer = setTimeout(() => {
        if (!press.t) return;
        press.t.held = true;
        beep("lift"); buzz(14);
        if (p.ev) startGesture({ mode: "move", kind: "event", id: p.ev.id, start: p.ev.start, dur: p.ev.dur, grab: p.grab, was: { start: p.ev.start, dur: p.ev.dur }, x: p.x, y: p.y });
        else if (p.chipId) startGesture({ mode: "task", kind: "task", id: p.chipId, x: p.x, y: p.y });
        else startGesture({ mode: "draft", start: p.startMin, dur: 30, x: p.x, y: p.y });
      }, LIFT_MS);
      press.t = p;
    };

    const onMove = (e) => {
      if (gestureRef.current) {
        e.preventDefault();
        const t = e.touches[0];
        if (t) applyRef.current(t.clientX, t.clientY);
        return;
      }
      const p = press.t;
      if (!p) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - p.x) > 12 || Math.abs(t.clientY - p.y) > 12) disarm();
    };

    const onEnd = (e) => {
      const g = gestureRef.current;
      const p = press.t;
      disarm();
      const t = e.changedTouches && e.changedTouches[0];
      if (g) { finishRef.current(t ? t.clientX : g.x, t ? t.clientY : g.y); return; }
      if (p && !p.held) {
        /* A tap handled here opens a sheet. Without this the browser still emits its
           compatibility click ~300ms later, which lands on the freshly-opened sheet's
           backdrop and closes it again — the card appeared not to open at all. */
        if (e.cancelable) e.preventDefault();
        if (p.ev) { beep("click"); setInspect({ kind: "event", id: p.ev.id }); }
        else if (p.chipId) { beep("click"); setInspect({ kind: "task", id: p.chipId }); }
        else { beep("click"); setComposer({ kind: "event", start: startSlot(p.startMin), dur: 60 }); }
      }
    };

    const onCancel = (e) => {
      const g = gestureRef.current;
      disarm();
      if (g) { const t = e.changedTouches && e.changedTouches[0]; finishRef.current(t ? t.clientX : g.x, t ? t.clientY : g.y); }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [ready, viewMode]);

  /* mouse / pen tracking, plus touch tracking for drags that begin outside the stream */
  useEffect(() => {
    if (!gesture) return;
    const move = (e) => applyRef.current(e.clientX, e.clientY);
    const up = (e) => finishRef.current(e.clientX, e.clientY);
    const tmove = (e) => {
      if (!gestureRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      if (t) applyRef.current(t.clientX, t.clientY);
    };
    const tend = (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      const g = gestureRef.current;
      if (g) finishRef.current(t ? t.clientX : g.x, t ? t.clientY : g.y);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.addEventListener("touchmove", tmove, { passive: false });
    document.addEventListener("touchend", tend);
    document.addEventListener("touchcancel", tend);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("touchmove", tmove);
      document.removeEventListener("touchend", tend);
      document.removeEventListener("touchcancel", tend);
    };
  }, [gesture && gesture.mode, gesture && gesture.id]);

  if (!ready || !db) {
    return (
      <div style={{ background: THEMES[0].bg, color: THEMES[0].dim, fontFamily: MONO, minHeight: "100vh" }} className="flex items-center justify-center text-xs tracking-widest">
        OPENING THE NOTEBOOK
      </div>
    );
  }

  eventsRef.current = events;
  dateKeyRef.current = dateKey;

  const inspectItem = inspect && (inspect.kind === "event"
    ? dayEvents.find((event) => event.id === inspect.id)
    : resolveTaskForInspection(dayTasks, db.tasks, inspect.id));
  const inspectBlockers = inspect && inspect.kind === "task" && db
    ? getTaskBlockers(db.tasks, parseTaskOccurrenceId(inspect.id).seriesId)
    : [];
  const inspectSubtasks = inspect && inspect.kind === "task" && db
    ? getSubtasksOf(db, parseTaskOccurrenceId(inspect.id).seriesId)
    : [];
  const inspectDependsOn = inspect && inspect.kind === "task" && db
    ? (db.tasks.find((t) => t.id === parseTaskOccurrenceId(inspect.id).seriesId)?.dependsOn ?? [])
      .map((id) => db.tasks.find((t) => t.id === id)).filter(Boolean)
    : [];
  const earliestStart = inspect && inspect.kind === "task" && db
    ? getEarliestResponsibleStart(db.tasks, parseTaskOccurrenceId(inspect.id).seriesId)
    : null;
  /* Context links always target the durable owner, never a transient rendered card.
     Event occurrences additionally retain their date so a meeting note does not
     spill across every Tuesday; an undated event link is intentionally series-wide. */
  const inspectNoteContext = inspect && inspectItem
    ? (inspect.kind === "event" ? eventNoteLink(inspectItem) : taskNoteLink(inspectItem))
    : null;
  const linkedNotes = inspectNoteContext
    ? getNotesForEntity(db.notes, inspectNoteContext.type, inspectNoteContext.targetId, {
      occurrenceDate: inspectNoteContext.occurrenceDate,
    })
    : [];
  /* §4.6/§4.8. Changing one attribute is the same write as changing all of them,
     with the rest of the record supplied unchanged. Nothing here decides scope —
     that stays with saveEntry, so one question has one answer. */
  const editEntry = (patch) => {
    if (!inspect || !inspectItem) return;
    const next = { ...entryPayload(inspect.kind, inspectItem), ...patch, inline: true };
    if (inspect.kind === "event") {
      /* The record carries the timing it was read with. An inline change to the
         time, the day, or all-day has to rebuild it — passing the old timing
         through would quietly overwrite the very field that was just edited. */
      const day = next.date || dateKey;
      try {
        next.timing = next.allDay
          ? { kind: "all-day", startDate: day, endDateExclusive: addDaysToKey(next.endDate && next.endDate >= day ? next.endDate : day, 1) }
          : inspectItem.allDay
            ? { kind: "timed", timeZoneMode: "floating", startLocal: addMinutesToLocalDateTime(`${day}T00:00`, next.start), endLocal: addMinutesToLocalDateTime(`${day}T00:00`, next.start + next.dur) }
            : eventTimingFromPosition(inspectItem, day, next.start, next.dur);
      } catch {
        /* A zoned time that lands in a gap or a fold cannot be resolved without
           being asked which one — that question belongs to the composer, which
           owns the offset picker. */
        beep("abort");
        setComposer({ ...next, inline: undefined });
        return;
      }
    }
    saveEntry(next);
  };
  const draggingTask = gesture && gesture.mode === "task" ? dayTasks.find((t) => t.id === gesture.id) : null;
  const dropMin = gesture && gesture.mode === "task" && !gesture.overDay && !gesture.overTask && streamRef.current
    ? (() => {
        const r = streamRef.current.getBoundingClientRect();
        if (gesture.y < r.top || gesture.y > r.bottom) return null;
        return snapTo(minutesAt(gesture.y), 15);
      })()
    : null;

  /* §4.3. The day is one view among several; the rest are queries over the same
     tasks, so switching never moves or copies anything. */
  /* Plain computations, not hooks: this block sits below the loading guard, so a
     hook here would run conditionally and change the hook order between renders. */
  const viewCounts = smartViewCounts(db, todayKey);
  const shownTasks = smartView === "today" ? dayTasks : resolveSmartView(db, smartView, todayKey);

  const actionsPanel = (
    <ActionsPanel
      T={T} listRef={listRef} tasks={shownTasks} notes={notes}
      smartView={smartView} viewCounts={viewCounts}
      onSmartView={(id) => { beep("tick"); setSmartView(id); }}
      lists={db.taskLists} onManageLists={() => { beep("click"); setListManager(true); }} clock={clock}
      selection={selection}
      onToggleSelect={(id) => setSelection((cur) => {
        const next = new Set(cur ?? []);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      })}
      onStartSelect={(id) => { beep("lift"); buzz(8); setSelection(new Set(id ? [id] : [])); }}
      onCancelSelect={() => { beep("click"); setSelection(null); }}
      onBulk={runBulk} overdue={overdue} deadlines={deadlines} showOverdue={isToday}
      todayKey={todayKey} gesture={gesture} onPullOverdue={pullOverdue} beep={beep}
      onComplete={completeTask} onReopen={reopenTask} onDefer={deferTask}
      onInspect={(id) => setInspect({ kind: "task", id })} onToggleSub={toggleSub} onAddSub={addSub} onRemoveSub={removeSub}
      onDragStart={(id, x, y) => { startGesture({ mode: "task", kind: "task", id, x, y }); setSheet(false); buzz(6); beep("lift"); }}
      onAddTask={() => { beep("click"); setComposer({ kind: "task" }); }}
      onEditNote={(n) => { beep("click"); setNoteEdit(n || { kind: "daily", date: dateKey, blocks: [] }); }}
      onToggleNoteCheck={toggleNoteCheck}
      onExtract={extractTask}
      onUnschedule={(id) => scheduleTask(id, null)}
      blockersFor={(t) => (db ? getTaskBlockers(db.tasks, parseTaskOccurrenceId(t.id).seriesId) : [])}
      onPromoteSub={promoteSub}
      onJump={jumpTo}
      onOpenDeadline={(t) => {
        /* Go to the day the work is planned for, falling back to the deadline day,
           and open it — a deadline row that only navigated was a dead end. */
        beep("click");
        const target = t.planned.date || t.deadline.date;
        if (target && target !== dateKey) jumpTo(target);
        setTimeout(() => setInspect({ kind: "task", id: t.id }), target && target !== dateKey ? 80 : 0);
      }}
    />
  );

  return (
    <div className="nb-root flex flex-col" style={{ background: T.bg, color: T.text, fontFamily: SANS }}>
      <style>{`
        .nb-s::-webkit-scrollbar{width:5px;height:5px}
        .nb-s::-webkit-scrollbar-thumb{background:${T.faint}}
        .nb-s::-webkit-scrollbar-track{background:transparent}
        .nb-x::-webkit-scrollbar{display:none}
        .nb-x{-ms-overflow-style:none;scrollbar-width:none}
        .nb-root{min-height:100dvh}
        /* Below the desktop breakpoint the page is exactly one viewport tall, so the
           day surface can flex into the space that is left instead of overflowing
           past the fold and leaving a dead gap under it. */
        @media(max-width:1023px){.nb-root{height:100dvh;overflow:hidden}}
        .nb-main{padding-bottom:var(--sheet-pad);transition:padding-bottom 260ms cubic-bezier(.2,.8,.25,1)}
        @media(min-width:1024px){.nb-main{padding-bottom:2rem}}
        .nb-stream{flex:1 1 auto;min-height:0}
        @media(min-width:1024px){.nb-stream{flex:none;height:auto;max-height:620px}}
        .nb-tap{transition:transform 90ms ease,opacity 120ms ease}
        .nb-tap:active{transform:scale(0.96)}
        /* A stamp hides its native control, so the focus it takes has to be drawn
           on the wrapper instead — otherwise a keyboard user sees nothing. */
        .nb-stamp{transition:box-shadow 160ms ease}
        .nb-stamp:focus-within{box-shadow:0 1px 0 0 ${T.accent}}
        .nb-row:hover{background:${T.faint}55}
        .nb-cell{transition:opacity 420ms cubic-bezier(.2,.7,.3,1),transform 420ms cubic-bezier(.2,.7,.3,1)}
        .nb-page{transform-origin:left center;backface-visibility:hidden}
        .nb-turn-next{animation:turnnext 380ms cubic-bezier(.22,.75,.3,1)}
        @keyframes turnnext{0%{opacity:.15;transform:perspective(1400px) rotateY(-19deg) translateX(11%) scale(.97)}60%{opacity:1}100%{opacity:1;transform:none}}
        .nb-turn-prev{animation:turnprev 380ms cubic-bezier(.22,.75,.3,1);transform-origin:right center}
        @keyframes turnprev{0%{opacity:.15;transform:perspective(1400px) rotateY(19deg) translateX(-11%) scale(.97)}60%{opacity:1}100%{opacity:1;transform:none}}
        .nb-up{animation:nbup 200ms cubic-bezier(.2,.9,.3,1.1)}
        @keyframes nbup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .nb-p{animation:nbp 620ms cubic-bezier(.1,.7,.3,1) forwards}
        @keyframes nbp{from{opacity:1;transform:translate(0,0) scale(1)}to{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.2)}}
        .nb-rw{animation:nbrw 900ms cubic-bezier(.2,.8,.3,1) forwards}
        @keyframes nbrw{0%{opacity:0;transform:translateY(20px) scale(.8)}25%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-52px) scale(1)}}
        .nb-blink{animation:nbb 2s ease-in-out infinite}
        @keyframes nbb{0%,100%{opacity:1}50%{opacity:.4}}
                                button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid ${T.accent};outline-offset:2px}
        input,textarea,select{color:${T.text}}
        input::placeholder,textarea::placeholder{color:${T.dim}}
        @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
      `}</style>

      {/* ══ HUD ══ */}
      <header style={{ background: T.bg, borderBottom: `1px solid ${T.line}` }} className="sticky top-0 z-30 px-3 sm:px-5 py-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">LVL</span>
          <span style={{ fontFamily: MONO }} className="text-sm font-bold">{level}</span>
          <div style={{ background: T.faint }} className="w-14 h-1 mx-1"><div style={{ background: T.accent, width: `${levelPct}%` }} className="h-full" /></div>
          {streak > 0 && <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{streak}d</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { jumpTo(todayKey); setMonthCursor(new Date()); }} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap px-2 py-1 text-xs tracking-widest">TODAY</button>
          <button onClick={() => { beep("click"); setNotebook("all"); }} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap px-2 py-1 text-xs tracking-widest">NOTES</button>
          <button onClick={() => { beep("click"); setSearch(true); }} style={{ color: T.dim }} className="nb-tap w-8 h-8 text-sm" aria-label="Search">⌕</button>
          <button onClick={() => { beep("click"); setSettings(true); }} style={{ color: T.dim }} className="nb-tap w-8 h-8 text-sm" aria-label="Settings">⋯</button>
          <button onClick={() => { beep("click"); setComposer({ kind: "event", start: startSlot(nowMin), dur: 60 }); }} style={{ background: T.accent, color: T.on, fontFamily: MONO }} className="nb-tap px-2 py-1.5 text-xs font-bold tracking-widest">NEW</button>
        </div>
      </header>

      {/* ══ NAVIGATOR ══ */}
      <div onTouchStart={onTouchStartNav} onTouchMove={onTouchMoveNav} style={{ borderBottom: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between px-3 sm:px-5 py-1.5">
          <button onClick={zoomOut} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap text-xs tracking-widest" disabled={zoom === "month"}>
            {zoom === "day" ? "◂ 14 DAYS" : zoom === "week" ? "◂ MONTH" : `${MO[monthCursor.getMonth()]} ${monthCursor.getFullYear()}`}
          </button>
          <div className="flex items-center gap-2">
            {/* Timeline answers "when, and for how long"; agenda answers "what is
                coming". Same days, same data, two questions. */}
            <div className="flex" style={{ borderRadius: 999, border: `1px solid ${T.line}` }}>
              {[["timeline", "TIMELINE"], ["agenda", "AGENDA"]].map(([mode, label]) => (
                <button key={mode} onClick={() => { beep("tick"); setViewMode(mode); }}
                  className="px-2 py-1 text-xs tracking-widest"
                  style={{ fontFamily: MONO, borderRadius: 999, background: viewMode === mode ? T.accent : "transparent", color: viewMode === mode ? T.on : T.dim }}>
                  {label}
                </button>
              ))}
            </div>
            {zoom === "month" && (
              <>
                <button onClick={() => { beep("page"); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)); }} style={{ color: T.dim }} className="nb-tap px-2 text-xs">◂</button>
                <button onClick={() => { beep("page"); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)); }} style={{ color: T.dim }} className="nb-tap px-2 text-xs">▸</button>
              </>
            )}
            <button onClick={zoomIn} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap text-xs tracking-widest" disabled={zoom === "day"}>
              {zoom === "month" ? "14 DAYS ▸" : zoom === "week" ? "DAY ▸" : ""}
            </button>
          </div>
        </div>

        {zoom === "month" && (
          <div className="px-3 sm:px-5 pb-3">
            <div className="grid grid-cols-7 mb-1">{WD1.map((d, i) => <span key={i} style={{ fontFamily: MONO, color: T.dim }} className="text-center text-xs tracking-widest">{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-px" style={{ background: T.line }}>
              {monthGrid.map((d, i) => {
                const k = keyOf(d);
                const n = densityOf(d);
                const inMonth = d.getMonth() === monthCursor.getMonth();
                const sel = k === dateKey;
                return (
                  <button key={k} data-day={k} onClick={() => { jumpTo(k); setZoom("week"); }} className="nb-cell relative py-2.5"
                    style={{ background: T.bg, opacity: mounted ? (inMonth ? 1 : 0.32) : 0, transitionDelay: `${Math.min(i, 24) * 8}ms` }}>
                    <span className="absolute inset-0" style={{ background: T.accent, opacity: n ? Math.min(0.75, 0.14 + n * 0.13) : 0 }} />
                    <span className="relative text-xs font-semibold" style={{ fontFamily: MONO, color: n > 2 ? T.on : T.text }}>{d.getDate()}</span>
                    {sel && <span className="absolute inset-0" style={{ boxShadow: `inset 0 0 0 2px ${T.accent}` }} />}
                    {k === todayKey && <span className="absolute left-1 top-1 w-1 h-1" style={{ background: NOW_RED }} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {zoom === "week" && (
          <div ref={stripRef} className="nb-x overflow-x-auto">
            <div className="flex min-w-max">
              {days.map((d, i) => {
                const k = keyOf(d);
                const on = k === dateKey;
                const n = densityOf(d);
                const target = gesture && gesture.overDay === k;
                return (
                  <button key={k} data-day={k} ref={on ? activeRef : null} onClick={() => jumpTo(k)}
                    className="nb-cell nb-tap relative w-16 sm:w-20 lg:w-24 shrink-0 py-2.5"
                    style={{ opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(10px)", transitionDelay: `${i * 26}ms`, boxShadow: target ? `inset 0 0 0 2px ${T.accent}` : "none" }}>
                    {/* Selection is a filled cell and today is an outlined one. Washing
                        every busy day in accent turned the whole strip a muddy tint and
                        made the selected day compete with its neighbours. */}
                    <span className="absolute inset-1" style={{
                      borderRadius: CARD_R,
                      background: on ? T.accent : "transparent",
                      boxShadow: !on && k === todayKey ? `inset 0 0 0 1.5px ${T.faint}` : "none",
                    }} />
                    <span className="relative block">
                      <span style={{ fontFamily: MONO, color: on ? T.on : T.dim }} className="block text-xs tracking-widest">{WD[d.getDay()]}</span>
                      <span style={{ fontFamily: MONO, color: on ? T.on : T.text }} className="block text-xl font-bold tracking-tight">{pad(d.getDate())}</span>
                      <span style={{ fontFamily: MONO, color: on ? T.on : T.dim }} className="block text-xs tracking-widest">{k === todayKey ? "NOW" : MO[d.getMonth()]}</span>
                      {/* Density as a countable mark rather than a wash of colour. */}
                      <span className="flex items-center justify-center gap-0.5 h-1.5 mt-1">
                        {Array.from({ length: Math.min(3, n) }).map((_, dot) => (
                          <span key={dot} className="rounded-full" style={{ width: 3, height: 3, background: on ? T.on : T.dim }} />
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {zoom === "day" && (
          <div className="flex items-center justify-between px-3 sm:px-5 pb-2">
            <button onClick={() => goDay(-1)} style={{ color: T.dim }} className="nb-tap px-3 py-1">◂</button>
            <span style={{ fontFamily: MONO }} className="text-sm font-bold tracking-widest">{fmtDay(dateKey)}</span>
            <button onClick={() => goDay(1)} style={{ color: T.dim }} className="nb-tap px-3 py-1">▸</button>
          </div>
        )}
      </div>

      {/* ══ HERO ══ */}
      <div className="px-3 sm:px-5 pt-4 pb-3">
        <div className="flex items-end gap-3">
          <span style={{ fontFamily: MONO }} className="text-6xl sm:text-7xl font-bold tracking-tighter leading-none">{pad(activeDate.getDate())}</span>
          <span className="pb-1.5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest">{WD[activeDate.getDay()]} · {MO[activeDate.getMonth()]} {activeDate.getFullYear()}</span>
            <span className="block text-sm font-semibold leading-snug mt-0.5">{briefing}</span>
          </span>
        </div>
      </div>

      {/* ══ BODY ══ */}
      <main className="nb-main px-3 sm:px-5 grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0"
        style={{ "--sheet-pad": sheetPad }}>
        <section className="lg:col-span-7 flex flex-col min-h-0" onTouchStart={onSwipeStart} onTouchMove={onSwipeMove} onTouchEnd={onSwipeEnd} onTouchCancel={onSwipeEnd}
          style={{
            transform: swipe === 0 ? "none" : `translateX(${swipe * 0.32}px)`,
            transition: snapping || swipe !== 0 ? "none" : "transform 260ms cubic-bezier(.2,.8,.25,1)",
          }}>
          <div key={turn ? turn.k : "first"} className={`nb-page flex flex-col min-h-0 flex-1 ${turn ? (turn.dir > 0 ? "nb-turn-next" : "nb-turn-prev") : ""}`}>

            {viewMode === "agenda" ? (
              <Agenda
                T={T} surface={surface} days={agenda} dateKey={dateKey} todayKey={todayKey} clock={clock}
                onOpenEvent={(id, key) => { beep("click"); if (key !== dateKey) jumpTo(key); setTimeout(() => setInspect({ kind: "event", id }), key !== dateKey ? 80 : 0); }}
                onOpenTask={(id, key) => { beep("click"); if (key !== dateKey) jumpTo(key); setTimeout(() => setInspect({ kind: "task", id }), key !== dateKey ? 80 : 0); }}
                onJump={jumpTo}
              />
            ) : (
            <>
            {allDay.length > 0 && (
              <div style={{ background: T.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottom: `1px solid ${T.line}` }} className="px-3 pt-3 pb-2 flex flex-col gap-1.5">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">ALL DAY</span>
                {allDay.map((e) => {
                  const span = e.endDate ? diffDays(e.endDate, e.date) + 1 : 1;
                  const idx = diffDays(dateKey, e.date) + 1;
                  return (
                    <button key={e.id} onClick={() => { beep("click"); setInspect({ kind: "event", id: e.id }); }}
                      className="nb-tap flex items-center gap-2 px-2.5 py-2 text-left"
                      style={{ background: surface, borderRadius: CARD_R }}>
                      <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                      <span className="text-xs font-semibold truncate flex-1">{e.title}</span>
                      {span > 1 && <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{idx}/{span}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div ref={streamRef} className="nb-s nb-stream overflow-y-auto relative" style={{ background: T.card, borderTopLeftRadius: allDay.length ? 0 : 16, userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
              <div className="relative" style={{ height: DAY_H }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="absolute left-0 right-0 flex items-start pointer-events-none"
                    style={{
                      top: h * HOUR_H,
                      height: HOUR_H,
                      /* Depth comes from banding, not from rules. A hairline every hour
                         reads as a table; alternating fills give the same reading
                         without drawing 24 lines across the content. */
                      borderTop: `1px solid ${hourRule}`,
                      background: h % 2 ? hourBand : "transparent",
                    }}>
                    <span style={{ fontFamily: MONO, color: T.dim, transform: h === 0 ? "none" : "translateY(-50%)" }}
                      className="w-14 shrink-0 pr-3 text-right text-xs tracking-widest">{fmtHour(h, clock)}</span>
                    {suggested.includes(h) && !gesture && (
                      <span style={{ fontFamily: MONO, color: T.faint }} className="flex-1 mr-2 mt-1.5 text-xs tracking-widest">FREE</span>
                    )}
                  </div>
                ))}

                <div className="absolute inset-0" style={{ touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={canvasDown} onPointerUp={canvasUp} />

                <div className="absolute left-16 right-2 top-0" style={{ height: DAY_H, pointerEvents: "none" }}>
                  {isToday && (
                    <>
                      {/* The rule runs up to the live card and stops there; inside the
                          card the elapsed fill carries the same accent onward, so the
                          line reads as flowing into the event rather than being cut
                          off behind it. With nothing live it spans the full width. */}
                      <div className="absolute pointer-events-none" style={{
                        left: 0,
                        width: liveEvent ? `calc(${laneL}% + 2px)` : "100%",
                        top: mounted ? (nowMin / 1440) * DAY_H : 0,
                        height: 2,
                        background: T.accent,
                        zIndex: 6,
                        transition: "top 600ms cubic-bezier(.2,.8,.25,1), width 600ms cubic-bezier(.2,.8,.25,1)",
                      }} />
                      <span className="absolute px-1.5 py-0.5 text-xs tracking-widest pointer-events-none"
                        style={{
                          fontFamily: MONO, background: T.accent, color: T.on, borderRadius: 4,
                          /* The card's own elapsed chip is right-aligned, so when an
                             event is live the time moves to the left edge instead of
                             landing on top of it. */
                          ...(liveEvent ? { left: 0 } : { right: 0 }),
                          top: mounted ? (nowMin / 1440) * DAY_H - 9 : -9,
                          zIndex: 7,
                          transition: "top 600ms cubic-bezier(.2,.8,.25,1)",
                        }}>
                        {tm(nowMin)}
                      </span>
                    </>
                  )}

                  {events.map((e) => {
                    const top = (e.start / 1440) * DAY_H;
                    const h = Math.max(22, (e.dur / 1440) * DAY_H) - 3;
                    const live = isToday && nowMin >= e.start && nowMin < e.start + e.dur;
                    const past = isToday && nowMin >= e.start + e.dur;
                    const pct = live ? ((nowMin - e.start) / e.dur) * 100 : 0;
                    const held = gesture && gesture.id === e.id && (gesture.mode === "move" || gesture.mode === "resize");
                    return (
                      <div key={e.id} data-event-id={e.id} className="absolute" style={{ top: top + 2, height: h, left: `${(e.lane / e.cols) * 100}%`, width: `calc(${100 / e.cols}% - 6px)`, zIndex: held ? 20 : 1, opacity: held && gesture.overDay ? 0.35 : 1, pointerEvents: "auto" }}>
                        <div onPointerDown={(ev) => eventDown(ev, e)} onPointerUp={(ev) => eventUp(ev, e)} onContextMenu={(ev) => ev.preventDefault()}
                          className="relative w-full h-full overflow-hidden"
                          style={{
                            background: surface,
                            borderRadius: CARD_R,
                            opacity: past ? 0.45 : 1,
                            boxShadow: held
                              ? `0 10px 28px rgba(0,0,0,.45), inset 0 0 0 2px ${T.accent}`
                              : live ? `inset 0 0 0 1.5px ${T.accent}` : "none",
                            transform: held ? "scale(1.02)" : "none",
                            transition: "transform 120ms ease, box-shadow 120ms ease, background 200ms ease",
                            touchAction: "pan-y", cursor: "grab",
                          }}>
                          {/* A live event fills with the theme accent as it elapses, so
                              "now" is expressed in the same colour system as everything
                              else instead of an unrelated crimson. */}
                          {live && (
                            <span className="absolute inset-y-0 left-0 pointer-events-none"
                              style={{ width: `${pct}%`, background: `${T.accent}26`, transition: "width 600ms linear" }}>
                              {/* the leading edge is the rule, continued through the card */}
                              <span className="absolute inset-y-0" style={{ right: 0, width: 2, background: T.accent }} />
                            </span>
                          )}
                          <div className="relative pl-2.5 pr-2.5 py-1.5">
                            <div className="flex items-center gap-2">
                              {/* the category dot is the card's only colour, so it stays
                                  legible at 22px height where a left rail would vanish */}
                              <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: held ? T.accent : catColor(e.cat) }} />
                              <span className="text-xs font-semibold truncate flex-1">{e.title}</span>
                              {conflictIds.has(e.id) && <span title="Overlaps another event" style={{ color: NOW_RED }} className="text-xs shrink-0">⚠</span>}
                              {e.repeat && <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs shrink-0">↻</span>}
                              {e.alerts && e.alerts.length > 0 && <span style={{ color: T.dim }} className="text-xs shrink-0">◔</span>}
                              {live && <span style={{ fontFamily: MONO, background: T.accent, color: T.on, borderRadius: 4 }} className="shrink-0 px-1 text-xs tracking-widest">{Math.round(pct)}%</span>}
                              {held && <span style={{ fontFamily: MONO, background: T.accent, color: T.on, borderRadius: 4 }} className="shrink-0 px-1 text-xs tracking-widest">{gesture.overDay ? fmtDay(gesture.overDay) : tm(e.start)}</span>}
                              {!held && !live && h < 38 && <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{tm(e.start)}</span>}
                            </div>
                            {h >= 38 && (
                              <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest truncate mt-0.5 pl-4">
                                {tm(e.start)} → {tm(e.start + e.dur)}
                              </span>
                            )}
                            {h >= 88 && (e.place || e.note) && (
                              <span style={{ color: T.dim }} className="block text-xs mt-1 truncate pl-4">{e.place || e.note}</span>
                            )}
                          </div>
                          {h >= 32 && (
                            <div data-resize={e.id} onPointerDown={(ev) => resizeDown(ev, e)} className="absolute inset-x-0 bottom-0 flex items-end justify-center" style={{ height: 12, cursor: "ns-resize", touchAction: "none" }}>
                              <span style={{ background: T.faint, width: 22, height: 2, marginBottom: 3, borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {gesture && gesture.mode === "draft" && (
                    <div className="absolute left-0 right-2 pointer-events-none flex items-center justify-center"
                      style={{ top: (gesture.start / 1440) * DAY_H, height: (gesture.dur / 1440) * DAY_H, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1.5px ${T.accent}`, background: `${T.accent}14` }}>
                      <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">
                        {tm(gesture.start)} – {tm(gesture.start + gesture.dur)}
                      </span>
                    </div>
                  )}

                  {dayTasks.filter((t) => t.planned.startMinute != null).map((t) => (
                    <button key={t.id} data-task-chip={t.id} onClick={() => { beep("click"); setInspect({ kind: "task", id: t.id }); }} className="nb-tap absolute left-0 right-2 text-left overflow-hidden"
                      style={{ top: (t.planned.startMinute / 1440) * DAY_H + 2, height: 28, borderRadius: CARD_R, border: `1px dashed ${T.faint}`, opacity: t.status === "completed" ? 0.4 : 1, zIndex: 5, pointerEvents: "auto" }}>
                      <span className="flex items-center gap-2 px-2.5 py-1">
                        <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: t.status === "completed" ? T.accent : "transparent", boxShadow: `inset 0 0 0 1.5px ${T.accent}` }} />
                        <span className="text-xs font-semibold truncate" style={{ textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</span>
                        <span style={{ fontFamily: MONO, color: T.dim }} className="ml-auto text-xs tracking-widest">{tm(t.planned.startMinute)}</span>
                      </span>
                    </button>
                  ))}

                  {dropMin != null && (
                    <div className="absolute left-0 right-2 pointer-events-none" style={{ top: (dropMin / 1440) * DAY_H, zIndex: 30 }}>
                      <div style={{ background: T.accent, height: 2 }} />
                      <span style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="absolute right-0 -top-2 px-1 text-xs tracking-widest">{tm(dropMin)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            </>
            )}
          </div>
        </section>

        <section className="hidden lg:block lg:col-span-5">{actionsPanel}</section>
      </main>

      {/* ══ MOBILE SHEET ══ */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex flex-col"
        style={{ height: "76vh", background: T.card, borderTop: `1px solid ${T.line}`, transform: sheet ? "translateY(0)" : "translateY(calc(100% - 52px))", transition: "transform 260ms cubic-bezier(.2,.8,.25,1)" }}>
        <div className="flex items-center gap-3 px-3 shrink-0" style={{ height: 52 }}>
          <button onClick={() => { beep("tick"); setSheet(!sheet); }} className="flex-1 flex items-center gap-2 text-left" aria-label="Toggle actions">
            <span style={{ background: T.faint }} className="w-8 h-0.5" />
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest">ACTIONS</span>
            <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{openCount} OPEN</span>
            {isToday && overdue.length > 0 && <span style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest">{overdue.length} LATE</span>}
          </button>
          <button onClick={() => { beep("click"); setComposer({ kind: "task" }); }} style={{ background: T.accent, color: T.on, fontFamily: MONO }} className="nb-tap px-3 py-1.5 text-xs font-bold tracking-widest">+ ACTION</button>
        </div>
        <div className="nb-s flex-1 overflow-y-auto px-3 pb-6">{actionsPanel}</div>
      </div>

      {draggingTask && (
        <div className="fixed z-50 pointer-events-none px-2 py-1" style={{ left: gesture.x - 60, top: gesture.y - 18, background: T.accent, color: T.on }}>
          <span className="text-xs font-semibold">{gesture.overDay ? `→ ${fmtDay(gesture.overDay)}` : draggingTask.title}</span>
        </div>
      )}

      {/* A failed write is silent otherwise: everything keeps working on screen while
          nothing reaches the device, and the only sign of it is a line in Settings
          the user has no reason to open. */}
      {storageBad && (
        <div className="fixed inset-x-0 top-14 z-50 flex justify-center px-3 pointer-events-none">
          <div className="nb-up flex items-center gap-3 px-3 py-2 w-full sm:w-auto pointer-events-auto"
            style={{ background: NOW_RED, color: "#FFFFFF", borderRadius: CARD_R }}>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest shrink-0">NOT SAVING</span>
            <span className="text-sm truncate">Changes are staying in this tab only.</span>
            <button onClick={() => { beep("click"); setSettings(true); }}
              style={{ fontFamily: MONO }} className="text-xs font-bold tracking-widest shrink-0 underline">EXPORT</button>
          </div>
        </div>
      )}

      {alertToast && (
        <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-3 pointer-events-none">
          <div className="nb-up flex items-center gap-3 px-3 py-2 w-full sm:w-auto" style={{ background: NOW_RED, color: "#FFFFFF" }}>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest shrink-0">REMINDER</span>
            <span className="text-sm font-semibold truncate">{alertToast.title}</span>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest shrink-0">{alertToast.body}</span>
          </div>
        </div>
      )}

      {undo && (
        <div className="fixed inset-x-0 z-50 flex justify-center pointer-events-none" style={{ bottom: 68 }}>
          <div className="nb-up flex items-center gap-3 px-3 py-2 pointer-events-auto" style={{ background: T.text, color: T.bg }}>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest">{undo.label}</span>
            {undo.payload && <button onClick={runUndo} style={{ fontFamily: MONO, color: T.accent }} className="text-xs font-bold tracking-widest">UNDO</button>}
          </div>
        </div>
      )}

      {reward && (
        <div className="fixed inset-x-0 top-1/3 z-50 flex justify-center pointer-events-none">
          <span key={reward.k} className="nb-rw text-7xl font-bold tracking-tighter" style={{ fontFamily: MONO, color: T.accent }}>+{reward.xp}</span>
        </div>
      )}
      {levelFlash && (
        <div className="fixed inset-x-0 top-20 z-50 flex justify-center pointer-events-none">
          <span style={{ background: T.accent, color: T.on, fontFamily: MONO }} className="nb-up px-3 py-1.5 text-xs font-bold tracking-widest">LEVEL {levelFlash}</span>
        </div>
      )}

      {/* ══ INSPECTOR ══ */}
      {inspectItem && (
        <Sheet T={T} title={inspect.kind === "event" ? "EVENT" : "ACTION"} onClose={() => { beep("click"); setInspect(null); }}>
          {inspect.kind === "task" ? (
            /* A task reads as a working document: what it is, the steps, then the
               facts that govern it. Nothing is centred, because the checklist is a
               list you act on rather than a title card you read. */
            <div>
              <InlineText T={T} value={inspectItem.title} ariaLabel="Action title"
                onCommit={(title) => editEntry({ title })}
                className="text-2xl font-bold tracking-tight leading-tight" />
              <div className="flex items-center gap-2 mt-1.5">
                <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(inspectItem.category) }} />
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">
                  {(db.taskLists.find((l) => l.id === inspectItem.listId) || {}).name || "—"} · {inspectItem.category}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 mt-4">
                {(inspectItem.checklist ?? []).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-3 py-2.5" style={{ background: surface, borderRadius: 999 }}>
                    <button onClick={() => toggleSub(inspect.id, item.id)} className="shrink-0" aria-label={item.done ? "Reopen step" : "Complete step"}>
                      <span className="block rounded-full" style={{
                        width: 20, height: 20,
                        background: item.done ? T.accent : "transparent",
                        boxShadow: `inset 0 0 0 2px ${item.done ? T.accent : T.faint}`,
                      }} />
                    </button>
                    <span className="flex-1 text-sm truncate" style={{ textDecoration: item.done ? "line-through" : "none", color: item.done ? T.dim : T.text }}>{item.title}</span>
                    <button onClick={() => promoteSub(inspect.id, item.id)} style={{ color: T.dim }} className="text-xs px-1" aria-label="Promote step to a subtask">↥</button>
                    <button onClick={() => removeSub(inspect.id, item.id)} style={{ color: T.dim }} className="text-xs px-1" aria-label="Remove step">✕</button>
                  </div>
                ))}
                <InlineAdd T={T} surface={surface} onAdd={(v) => addSub(inspect.id, v)} />
              </div>

              {(inspectItem.checklist ?? []).length > 0 && (
                <div className="flex items-center gap-3 mt-3">
                  <span className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: T.faint }}>
                    <span className="block h-full rounded-full" style={{
                      width: `${((inspectItem.checklist.filter((x) => x.done).length) / inspectItem.checklist.length) * 100}%`,
                      background: T.accent, transition: "width 220ms ease",
                    }} />
                  </span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">
                    {inspectItem.checklist.filter((x) => x.done).length} / {inspectItem.checklist.length}
                  </span>
                </div>
              )}

              <div className="flex items-start gap-3 px-3 py-3 mt-4" style={{ background: surface, borderRadius: CARD_R }}>
                <InlineText T={T} value={inspectItem.note} placeholder="Add a note" ariaLabel="Note" multiline
                  onCommit={(note) => editEntry({ note })} className="text-sm leading-relaxed" />
                <span style={{ color: T.dim }} className="text-sm shrink-0 pt-0.5">≡</span>
              </div>

              {/* The governing facts, grouped as one card so they read as a block of
                  rules rather than a run of unrelated rows. */}
              <div className="mt-4 overflow-hidden" style={{ background: surface, borderRadius: CARD_R }}>
                {/* §4.6. When it is planned, and when it is due, are edited where
                    they are read. §4.7 keeps the repeat rule behind its own gesture. */}
                <DetailRow T={T} icon="▦" divider>
                  <div className="flex items-center gap-2">
                    <InlineStamp T={T} dark={dark} type="date" ariaLabel="Planned day"
                      value={inspectItem.planned.date || ""}
                      display={inspectItem.planned.date ? plannedLabel(inspectItem.planned.date, todayKey) : "Unplanned"}
                      onCommit={(v) => editEntry({ date: v, unplanned: !v })} className="text-sm" />
                    {inspectItem.planned.date && (
                      <button onClick={() => editEntry({ unplanned: true })} style={{ fontFamily: MONO, color: T.dim }}
                        className="nb-tap text-xs tracking-widest shrink-0">INBOX</button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <InlineStamp T={T} dark={dark} type="time" ariaLabel="Planned time"
                      value={inspectItem.planned.startMinute != null ? hhmm(inspectItem.planned.startMinute) : ""}
                      display={inspectItem.planned.startMinute != null ? tm(inspectItem.planned.startMinute) : "Any time"}
                      onCommit={(v) => editEntry({ at: v ? fromHhmm(v) : null })}
                      style={{ color: T.dim }} className="text-xs" />
                    <button onClick={() => { beep("click"); setComposer({ ...entryPayload("task", inspectItem), openRepeat: true }); }}
                      style={{ color: T.dim }} className="nb-tap text-xs text-left flex-1 truncate">
                      {inspectItem.recurrence
                        ? repeatLabel({ ...inspectItem.recurrence, freq: inspectItem.recurrence.frequency, byDay: inspectItem.recurrence.byWeekday })
                        : "Does not repeat"}
                    </button>
                  </div>
                </DetailRow>
                <InlineChoiceRow T={T} icon="◔" divider
                  label={(inspectItem.reminders ?? []).length
                    ? (inspectItem.reminders[0].offsetMinutes === 0
                      ? `When it starts${inspectItem.planned.startMinute != null ? `, ${tm(inspectItem.planned.startMinute)}` : ""}`
                      : `${dur(inspectItem.reminders[0].offsetMinutes)} before`)
                    : "No reminder"}
                  value={(inspectItem.reminders ?? [])[0]?.offsetMinutes ?? "off"}
                  options={[["off", "OFF"], [0, "AT TIME"], [15, "15M"], [60, "1H"]]}
                  onPick={(v) => setReminder(inspect.id, v === "off" ? null : v)} />
                <DetailRow T={T} icon="⌛" divider>
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">DUE</span>
                    <InlineStamp T={T} dark={dark} type="date" ariaLabel="Deadline"
                      value={inspectItem.deadline.date || ""} onCommit={(v) => editEntry({ due: v })}
                      display={inspectItem.deadline.date ? fmtDay(inspectItem.deadline.date) : "No deadline"}
                      style={{ color: inspectItem.deadline.date && inspectItem.deadline.date < todayKey ? NOW_RED : T.text }}
                      className="text-sm" />
                    {inspectItem.deadline.date && (
                      <button onClick={() => editEntry({ due: "" })} style={{ color: T.dim }} className="nb-tap text-xs px-1" aria-label="Clear deadline">✕</button>
                    )}
                  </div>
                </DetailRow>
                {/* §8.2. The label names the attribute; it does not repeat the value
                    the selected chip already carries. */}
                <InlineChoiceRow T={T} icon="◈" divider label={`Worth ${inspectItem.reward}`}
                  value={inspectItem.reward} options={[20, 30, 40, 60].map((xp) => [xp, String(xp)])}
                  onPick={(xp) => editEntry({ xp })} />
                {inspectItem.status === "waiting" && (
                  <DetailRow T={T} icon="◷" divider={inspectDependsOn.length > 0}>
                    <span className="block text-sm">{inspectItem.followUpDate ? `Follow up ${fmtDay(inspectItem.followUpDate)}` : "Waiting, no follow-up date"}</span>
                  </DetailRow>
                )}
                {/* Every edge is listed, satisfied or not, each removable — otherwise a
                    dependency could be added from here but never taken back. */}
                <DetailRow T={T} icon="▤" divider>
                  <button onClick={() => { beep("click"); setListPicker({ taskId: inspect.id }); }} className="text-left w-full">
                    <span className="block text-sm">{(db.taskLists.find((l) => l.id === inspectItem.listId) || {}).name || "—"}</span>
                    <span style={{ color: T.dim }} className="block text-xs mt-0.5">Tap to move to another list</span>
                  </button>
                </DetailRow>
                <InlineChoiceRow T={T} icon="◑" divider label={inspectItem.category} dot={catColor}
                  value={inspectItem.category} options={CATS.map((c) => [c, c])}
                  onPick={(cat) => editEntry({ cat })} />
                <DetailRow T={T} icon="#" divider={inspectDependsOn.length > 0}>
                  <TagField T={T} tags={inspectItem.tags} onChange={(next) => setTags(inspect.id, next)} />
                </DetailRow>
                {inspectDependsOn.map((blocker, i) => (
                  <DetailRow key={blocker.id} T={T} icon="⛌" divider={i < inspectDependsOn.length - 1}>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm truncate"
                        style={{ color: blocker.status === "completed" ? T.dim : NOW_RED, textDecoration: blocker.status === "completed" ? "line-through" : "none" }}>
                        Blocked by {blocker.title}
                      </span>
                      <button onClick={() => unblockTask(inspect.id, blocker.id)} style={{ color: T.dim }} className="text-xs px-1" aria-label="Remove dependency">✕</button>
                    </div>
                  </DetailRow>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 mt-4">
                <div className="flex flex-wrap gap-1">
                  {["open", "in_progress", "waiting"].map((next) => (
                    <button key={next} onClick={() => changeStatus(inspect.id, next)} className="px-2 py-1 text-xs tracking-widest"
                      style={{ fontFamily: MONO, borderRadius: 999, background: inspectItem.status === next ? T.accent : "transparent", color: inspectItem.status === next ? T.on : T.dim, border: `1px solid ${inspectItem.status === next ? T.accent : T.line}` }}>
                      {next.replace("_", " ").toUpperCase()}
                    </button>
                  ))}
                </div>
                <button onClick={() => { beep("click"); setDependencyPicker({ taskId: parseTaskOccurrenceId(inspect.id).seriesId }); }}
                  style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest shrink-0">+ BLOCK ON</button>
              </div>

              {earliestStart && inspectItem.planned.date && inspectItem.planned.date < earliestStart && (
                <p style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest mt-3">
                  PLANNED BEFORE ITS BLOCKERS LAND — EARLIEST {fmtDay(earliestStart)}
                </p>
              )}
            </div>
          ) : (
          <>
          {/* Header reads as a title card: what, when, which day — centred, with the
              detail rows below it. Every line of it is the field itself (§4.6). */}
          <div className="text-center pt-1 pb-4">
            <InlineText T={T} value={inspectItem.title} ariaLabel="Event title"
              onCommit={(title) => editEntry({ title })}
              className="text-2xl font-bold tracking-tight leading-tight" style={{ textAlign: "center" }} />
            {inspectItem.allDay ? (
              <p className="text-base font-semibold mt-1.5">All day</p>
            ) : (
              <div className="flex items-center justify-center gap-1.5 mt-1.5">
                <InlineStamp T={T} dark={dark} type="time" ariaLabel="Starts" value={hhmm(inspectItem.start)}
                  display={tm(inspectItem.start)} onCommit={(v) => v && editEntry({ start: fromHhmm(v) })}
                  className="text-base font-semibold" />
                <span style={{ color: T.dim }} className="text-base">–</span>
                <InlineStamp T={T} dark={dark} type="time" ariaLabel="Ends" value={hhmm((inspectItem.start + inspectItem.dur) % 1440)}
                  display={tm((inspectItem.start + inspectItem.dur) % 1440)}
                  onCommit={(v) => {
                    if (!v) return;
                    const end = fromHhmm(v);
                    editEntry({ dur: Math.max(5, (end > inspectItem.start ? end : end + 1440) - inspectItem.start) });
                  }} className="text-base font-semibold" />
              </div>
            )}
            <InlineStamp T={T} dark={dark} type="date" ariaLabel="Day"
              value={splitId(inspect.id).date || inspectItem.date || dateKey}
              display={fmtDay(splitId(inspect.id).date || inspectItem.date || dateKey)}
              onCommit={(v) => v && editEntry({ date: v })}
              style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest mt-1" />
          </div>

          {/* Two figures the app can actually answer, rather than borrowed metrics. */}
          <div className="flex gap-2 pb-4">
            <div className="flex-1 text-center py-3" style={{ background: surface, borderRadius: CARD_R }}>
              <span className="block text-2xl font-semibold tracking-tight">
                {inspect.kind === "event" ? (inspectItem.allDay ? "—" : dur(inspectItem.dur)) : `+${inspectItem.reward}`}
              </span>
              <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-0.5">
                {inspect.kind === "event" ? "LENGTH" : "REWARD"}
              </span>
            </div>
            <div className="flex-1 text-center py-3" style={{ background: surface, borderRadius: CARD_R }}>
              <span className="block text-2xl font-semibold tracking-tight">
                {inspect.kind === "event"
                  ? (inspectItem.allDay ? "—" : countdownLabel(dateKey, inspectItem.start, todayKey, nowMin))
                  : `${(inspectItem.checklist ?? []).filter((x) => x.done).length}/${(inspectItem.checklist ?? []).length}`}
              </span>
              <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-0.5">
                {inspect.kind === "event" ? "STARTS" : "STEPS"}
              </span>
            </div>
          </div>

          {/* One row per attribute, each one the control for it (§4.6). Collapsed it
              costs a line; touched, it grows the alternatives underneath. */}
          <div className="flex flex-col gap-2">
            <InlineChoice T={T} surface={surface} icon="◑" tint={catColor(inspectItem.cat)}
              label={inspectItem.cat || "—"} value={inspectItem.cat} dot={catColor}
              options={CATS.map((c) => [c, c])} onPick={(cat) => editEntry({ cat })} />

            <InlineChoice T={T} surface={surface} icon="◷" label={inspectItem.allDay ? "All day" : "At a time"}
              value={inspectItem.allDay ? "all" : "timed"} options={[["timed", "AT A TIME"], ["all", "ALL DAY"]]}
              onPick={(v) => editEntry({ allDay: v === "all", ...(v === "all" ? {} : { start: inspectItem.start || 540, dur: inspectItem.dur || 60 }) })} />

            {inspectItem.allDay && (
              <InlineField T={T} surface={surface} icon="→">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">THROUGH</span>
                <InlineStamp T={T} dark={dark} type="date" ariaLabel="Last day"
                  value={inspectItem.endDate || inspectItem.date || dateKey} min={inspectItem.date || dateKey}
                  display={fmtDay(inspectItem.endDate || inspectItem.date || dateKey)}
                  onCommit={(v) => v && editEntry({ endDate: v })}
                  style={{ fontFamily: MONO }} className="text-sm" />
              </InlineField>
            )}

            {/* §4.7. Recurrence rewrites a series rather than an entry, so it stays
                behind a deliberate gesture with room to explain itself. */}
            <button onClick={() => { beep("click"); setComposer({ ...entryPayload("event", inspectItem), openRepeat: true }); }}
              className="nb-tap flex items-center gap-3 px-3 py-2.5 text-left" style={{ background: surface, borderRadius: CARD_R }}>
              <span style={{ color: T.dim }} className="text-sm shrink-0 w-4 text-center">↻</span>
              <span className="flex-1 text-sm truncate">{inspectItem.repeat ? repeatLabel(inspectItem.repeat) : "Does not repeat"}</span>
              <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest shrink-0">CHANGE</span>
            </button>

            <InlineChoice T={T} surface={surface} icon="◔"
              label={(inspectItem.alerts || []).length
                ? inspectItem.alerts.map((a) => (a === 0 ? "When it starts" : `${dur(a)} before`)).join(", ")
                : "No reminder"}
              value={(inspectItem.alerts || [])[0] ?? "off"}
              options={[["off", "OFF"], [0, "AT TIME"], [5, "5M"], [15, "15M"], [30, "30M"], [60, "60M"]]}
              onPick={(v) => editEntry({ alerts: v === "off" ? [] : [v] })} />

            <InlineField T={T} surface={surface} icon="⌖">
              <InlineText T={T} value={inspectItem.place} placeholder="Add a place" ariaLabel="Place"
                onCommit={(place) => editEntry({ place })} className="text-sm" />
            </InlineField>

            {conflictIds.has(inspect.id) && (
              <Pill T={T} surface={surface} icon="⚠" tint={NOW_RED} label="Overlaps another event on this day" />
            )}

            <div className="flex items-start gap-3 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <span style={{ color: T.dim }} className="text-sm shrink-0 w-4 text-center pt-0.5">≡</span>
              <InlineText T={T} value={inspectItem.note} placeholder="Add a note" ariaLabel="Note" multiline
                onCommit={(note) => editEntry({ note })} className="text-sm leading-relaxed" />
            </div>
          </div>

          {!inspectItem.allDay && minutesUntil(dateKey, inspectItem.start, todayKey, nowMin) > 0 && (
            <p className="text-center text-sm mt-5" style={{ color: T.dim }}>
              <span className="font-bold" style={{ color: T.text }}>{countdownLabel(dateKey, inspectItem.start, todayKey, nowMin, inspectItem.dur)}</span> away
            </p>
          )}

          </>
          )}

          <EntityNotes T={T} notes={linkedNotes} kind={inspect.kind}
            onNew={newContextualNote}
            onOpen={(note) => { beep("click"); setInspect(null); setNoteEdit(note); }} />

          {/* §4.7. No generic "edit" — the view above already is the editor, so the
              only actions left are the ones that do something other than change a
              field. An action that leads elsewhere names what it is for. */}
          <button
            onClick={() => {
              if (inspect.kind === "event") duplicateEvent(inspect.id);
              else { inspectItem.status === "completed" ? reopenTask(inspect.id) : completeTask(inspect.id); setInspect(null); }
            }}
            style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap w-full py-3 mt-5 text-xs font-bold tracking-widest">
            {inspect.kind === "event" ? "DUPLICATE" : inspectItem.status === "completed" ? "REOPEN" : "MARK COMPLETE"}
          </button>
          <button onClick={() => removeItem(inspect.kind, inspect.id)} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap w-full py-3 mt-2 text-xs tracking-widest">DELETE</button>
        </Sheet>
      )}

      {/* §15.4/§7.4. Blocking is advisory: name what is in the way and let the user
          decide, rather than silently completing or flatly refusing. */}
      {confirmComplete && (
        <Sheet T={T} onClose={() => { beep("click"); setConfirmComplete(null); }} title="Still blocked">
          <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-1 mb-3">
            {confirmComplete.reasons.map((reason) => (reason.kind === "dependencies"
              ? `Waiting on ${reason.blockers.map((b) => b.title).join(", ")}.`
              : `${reason.remaining} step${reason.remaining === 1 ? "" : "s"} still open.`)).join(" ")}
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => completeTask(confirmComplete.id, true)}
              style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap py-3 text-xs font-bold tracking-widest">COMPLETE ANYWAY</button>
            <button onClick={() => { beep("click"); setConfirmComplete(null); }}
              style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap py-3 text-xs tracking-widest">KEEP IT OPEN</button>
          </div>
        </Sheet>
      )}

      {firstRun && (
        <Sheet T={T} onClose={() => setFirstRun(false)} title="Welcome">
          <h2 className="text-2xl font-bold tracking-tight">Start how you like</h2>
          <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-1 mb-4">
            There's a sample week loaded so you can see how everything behaves. Keep it
            to explore, or clear it and make the notebook yours.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => { beep("commit"); setFirstRun(false); }}
              style={{ fontFamily: MONO, background: T.accent, color: T.on, borderRadius: CARD_R }} className="nb-tap py-3 text-xs font-bold tracking-widest">EXPLORE THE SAMPLE</button>
            <button onClick={() => {
              beep("click");
              mutate((d) => ({ ...d, events: [], tasks: [], notes: [], eventExceptions: [], taskExceptions: [], occurrenceAliases: [], overrides: {}, xp: 0 }));
              setFirstRun(false);
            }} style={{ fontFamily: MONO, background: surface, borderRadius: CARD_R }} className="nb-tap py-3 text-xs tracking-widest">START EMPTY</button>
          </div>
        </Sheet>
      )}

      {listPicker && (
        <Sheet T={T} onClose={() => { beep("click"); setListPicker(null); }} title="Move to list">
          <div className="flex flex-col">
            {db.taskLists.map((list) => (
              <button key={list.id} onClick={() => setList(listPicker.taskId, list.id)}
                className="nb-row flex items-center gap-2 py-2.5 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                <span className="flex-1 text-sm">{list.name}</span>
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">{getTasksByList(db.tasks, list.id).length}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {dependencyPicker && (
        <Sheet T={T} onClose={() => { beep("click"); setDependencyPicker(null); }} title="What has to happen first?">
          {dependencyPicker.error && (
            <p style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest mb-2">{dependencyPicker.error.toUpperCase()}</p>
          )}
          <div className="flex flex-col max-h-80 overflow-y-auto nb-s">
            {db.tasks
              .filter((candidate) => candidate.id !== dependencyPicker.taskId && candidate.status !== "archived")
              .map((candidate) => (
                <button key={candidate.id} onClick={() => blockOn(dependencyPicker.taskId, candidate.id)}
                  className="nb-row flex items-center gap-2 py-2.5 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0 w-12">
                    {candidate.status === "completed" ? "DONE" : "OPEN"}
                  </span>
                  <span className="flex-1 text-sm truncate">{candidate.title}</span>
                </button>
              ))}
          </div>
        </Sheet>
      )}

      {listManager && (
        <Sheet T={T} onClose={() => { beep("click"); setListManager(false); }} title="Lists and tags">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">LISTS</span>
          <div className="flex flex-col mt-1">
            {db.taskLists.map((list) => (
              <div key={list.id} className="flex items-center gap-2 py-2" style={{ borderBottom: `1px solid ${T.line}` }}>
                {/* Editing in place: the name is the field, so there is no separate
                    rename mode to enter and leave. */}
                <input defaultValue={list.name} disabled={list.isSystem}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (!next || next === list.name) { e.target.value = list.name; return; }
                    beep("tick");
                    mutate((d) => ({ ...d, taskLists: renameTaskList(d.taskLists, list.id, next) }));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                  style={{ background: "transparent", border: "none", color: list.isSystem ? T.dim : T.text }}
                  className="flex-1 text-sm py-0.5" />
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">
                  {getTasksByList(db.tasks, list.id).length}
                </span>
                {!list.isSystem && !list.isDefault && (
                  <button onClick={() => { beep("delete"); mutate((d) => { const r = deleteTaskList(d.taskLists, d.tasks, list.id); return { ...d, taskLists: r.lists, tasks: r.tasks }; }); }}
                    style={{ color: T.dim }} className="text-xs px-1" aria-label="Delete list">✕</button>
                )}
              </div>
            ))}
          </div>
          <NewListField T={T} onAdd={(name) => { beep("schedule"); mutate((d) => ({ ...d, taskLists: createTaskList(d.taskLists, { id: `list-${uid()}`, name }) })); }} />

          <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-5">TAGS</span>
          {allTags(db.tasks).length === 0
            ? <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-1">No tags yet. Add them when composing an action.</p>
            : (
              <div className="flex flex-wrap gap-1 mt-1">
                {allTags(db.tasks).map((tag) => (
                  <span key={tag} style={{ fontFamily: MONO, color: T.dim, border: `1px solid ${T.line}` }} className="px-2 py-1 text-xs tracking-widest">{tag}</span>
                ))}
              </div>
            )}
        </Sheet>
      )}

      {composer && (
        <Sheet T={T} title={composer.id ? "EDIT" : "NEW"} onClose={() => { beep("click"); setComposer(null); }}>
          <Composer T={T} initial={composer} dateLabel={fmtDay(dateKey)} dateKey={dateKey} onSubmit={saveEntry} onTick={() => beep("tick")} />
        </Sheet>
      )}

      {/* ══ SCOPE ASK ══ */}
      {/* Rendered after the composer so it stacks above it: the question is asked
          while the form is still open, and underneath the form its buttons cannot be
          reached at all. Cancelling returns to the form with the edit intact. */}
      {scopeAsk && (
        <Sheet T={T} title="REPEATING ITEM" onClose={() => { beep("click"); setScopeAsk(null); }}>
          <h2 className="text-xl font-bold tracking-tight">This repeats</h2>
          <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-1 mb-4">Change this one day, or every day it appears?</p>
          <div className="flex flex-col gap-2">
            <button onClick={() => (scopeAsk.action === "delete" ? doDelete(scopeAsk.kind, scopeAsk.id, "one") : commitSave(scopeAsk.payload, "one"))}
              style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap py-3 text-xs tracking-widest">THIS DAY ONLY</button>
            {scopeAsk.kind === "event" && canonicalOccurrenceIdentity(scopeAsk.id || scopeAsk.payload?.id) && (
              <button onClick={() => (scopeAsk.action === "delete"
                ? doDelete(scopeAsk.kind, scopeAsk.id, "following")
                : commitSave(scopeAsk.payload, "following"))}
                style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap py-3 text-xs tracking-widest">THIS AND FOLLOWING</button>
            )}
            <button onClick={() => (scopeAsk.action === "delete" ? doDelete(scopeAsk.kind, scopeAsk.id, "all") : commitSave(scopeAsk.payload, "all"))}
              style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap py-3 text-xs font-bold tracking-widest">THE WHOLE SERIES</button>
          </div>
        </Sheet>
      )}

      {noteEdit && (
        <Sheet T={T} title="NOTE" onClose={() => { beep("click"); setNoteEdit(null); }}>
          <NoteEditor T={T} note={noteEdit} onSave={(text, title) => saveNote(noteEdit, text, title)} onDelete={() => noteEdit.id && doDelete("note", noteEdit.id, "all")}
            history={noteEdit.id ? revisionsFor(db.noteRevisions, noteEdit.id).length : 0}
            onHistory={() => { beep("click"); setNoteHistory(noteEdit.id); }}
            onPin={() => noteEdit.id && setNotePinned(noteEdit)}
            onArchive={() => noteEdit.id && setNoteArchived(noteEdit, !noteEdit.archived)} />
        </Sheet>
      )}

      {notebook && (
        <Sheet T={T} title="NOTEBOOK" onClose={() => { beep("click"); setNotebook(null); }}>
          <NotebookPanel T={T} view={notebook} notes={getNotebookNotes(db.notes, notebook)}
            onView={(view) => { beep("tick"); setNotebook(view); }}
            onNew={() => { beep("click"); setNotebook(null); setNoteEdit({ kind: "standalone", blocks: [] }); }}
            onOpen={(note) => { beep("click"); setNotebook(null); setNoteEdit(note); }}
            onPin={setNotePinned}
            onArchive={(note) => setNoteArchived(note, !note.archived)} />
        </Sheet>
      )}

      {noteHistory && (
        <Sheet T={T} title="HISTORY" onClose={() => { beep("click"); setNoteHistory(null); }}>
          <NoteHistory T={T} clock={clock} revisions={revisionsFor(db.noteRevisions, noteHistory)}
            onRestore={(revision) => restoreNoteRevision(noteHistory, revision)} />
        </Sheet>
      )}

      {search && (
        <Sheet T={T} title="SEARCH" onClose={() => { beep("click"); setSearch(false); }}>
          <SearchPanel T={T} db={db} todayKey={todayKey} onPick={(item) => {
            setSearch(false);
            if (item.kind === "note") {
              if (item.date) jumpTo(item.date);
              setNoteEdit(item);
              return;
            }
            const occurrence = item.kind === "event" && item.recurrence
              ? nextCalendarOccurrence(item, todayKey)
              : null;
            const target = occurrence ? occurrence.timing.kind === "all-day" ? occurrence.timing.startDate : occurrence.timing.startLocal.slice(0, 10) : item.repeat ? nextOccurrence(item, todayKey) : item.date;
            if (target) jumpTo(target);
            setTimeout(() => setInspect({ kind: item.kind, id: occurrence?.id || (item.repeat ? `${item.id}@${target}` : item.id) }), 60);
          }} />
        </Sheet>
      )}

      {settings && (
        <Sheet T={T} title="SETTINGS" onClose={() => { beep("click"); setSettings(false); }}>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

          <div className="mt-4">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">FEEDBACK</span>
            <button onClick={() => { beep("tick"); mutate((d) => ({ ...d, sound: !d.sound })); }} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Sound</span>
              <span style={{ fontFamily: MONO, color: db.sound ? T.accent : T.dim }} className="text-xs tracking-widest">{db.sound ? "ON" : "OFF"}</span>
            </button>
            <button onClick={() => { beep("tick"); mutate((d) => ({ ...d, clock: d.clock === "24" ? "12" : "24" })); }} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Clock</span>
              <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{clock === "24" ? "24-HOUR" : "12-HOUR"}</span>
            </button>
            <button onClick={askNotifs} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">System notifications</span>
              <span style={{ fontFamily: MONO, color: db.notifs ? T.accent : T.dim }} className="text-xs tracking-widest">{db.notifs ? "ON" : "ALLOW"}</span>
            </button>
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">THEME</span>
            <div className="flex flex-col mt-1">
              {THEMES.map((th) => (
                <button key={th.id} onClick={() => { beep("tick"); mutate((d) => ({ ...d, themeId: th.id })); }} className="nb-row flex items-center gap-3 py-2 px-1 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <span className="flex shrink-0">
                    <span className="w-4 h-6" style={{ background: th.bg }} />
                    <span className="w-4 h-6" style={{ background: th.card }} />
                    <span className="w-4 h-6" style={{ background: th.accent }} />
                  </span>
                  <span className="flex-1 text-sm font-semibold">{th.name}</span>
                  {th.id === T.id && <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">ON</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">YOUR DATA</span>
            <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-1 mb-2">Everything lives on this device. There's no account to sync with — take it with you as a file instead.</p>
            {storageBad && (
              <p style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest mb-2">SAVING TO THIS DEVICE FAILED — EXPORT A COPY</p>
            )}
            {pendingImport && (
              <div className="flex items-center gap-2 mb-2 p-2" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
                <span className="flex-1 text-xs">Replace everything on this device?</span>
                <button onClick={() => { setPendingImport(null); beep("abort"); }} style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">CANCEL</button>
                <button onClick={() => { setDb(pendingImport); setPendingImport(null); beep("commit"); setSettings(false); }} style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs font-bold tracking-widest">REPLACE</button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={exportIcs} style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 text-xs tracking-widest">EXPORT .ICS</button>
              <button onClick={exportJson} style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 text-xs tracking-widest">EXPORT .JSON</button>
              <label style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 text-xs tracking-widest cursor-pointer">
                IMPORT .JSON
                <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
              </label>
            </div>
          </div>

          <div className="mt-4">
            {confirmWipe ? (
              <div className="flex items-center gap-2 p-2" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
                <span className="flex-1 text-xs">Erase every event, action and note?</span>
                <button onClick={() => setConfirmWipe(false)} style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">KEEP</button>
                <button onClick={wipeAll} style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs font-bold tracking-widest">ERASE</button>
              </div>
            ) : (
              <button onClick={() => { beep("click"); setConfirmWipe(true); }} style={{ fontFamily: MONO, color: T.dim, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 text-xs tracking-widest">START A BLANK NOTEBOOK</button>
            )}
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">SHORTCUTS</span>
            <div className="mt-1">
              <Row T={T} k="← →" v="PREVIOUS / NEXT DAY" />
              <Row T={T} k="T" v="TODAY" />
              <Row T={T} k="N" v="NEW EVENT" />
              <Row T={T} k="/" v="SEARCH" />
              <Row T={T} k="A" v="NEW ACTION" />
              <Row T={T} k="C" v="COMPLETE NEXT ACTION" />
              <Row T={T} k="D" v="DEFER NEXT ACTION" />
              <Row T={T} k="⌘Z" v="UNDO" />
            </div>
          </div>

          <button onClick={() => { beep("click"); setSettings(false); }} style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap w-full py-3 mt-5 text-xs font-bold tracking-widest">DONE</button>
        </Sheet>
      )}
    </div>
  );
}

function nextOccurrence(item, fromKey) {
  for (let i = 0; i < 400; i++) {
    const k = keyOf(addDays(parseKey(fromKey), i));
    if (taskOccursOn(item, k)) return k;
  }
  return item.date;
}

function nextCalendarOccurrence(item, fromKey) {
  return previewRecurrence(item, 100).find((occurrence) => {
    const date = occurrence.timing.kind === "all-day" ? occurrence.timing.startDate : occurrence.timing.startLocal.slice(0, 10);
    return date >= fromKey;
  }) || null;
}

/* ═══════════════════════ ACTIONS ═══════════════════════ */

function ActionsPanel({ T, listRef, tasks, notes, onToggleNoteCheck, onExtract, onOpenDeadline, overdue, deadlines, showOverdue, todayKey, gesture, blockersFor, onPromoteSub, smartView, viewCounts, onSmartView, lists, onManageLists, clock = "12", selection, onToggleSelect, onStartSelect, onCancelSelect, onBulk, onPullOverdue, beep, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onAddTask, onEditNote, onUnschedule, onJump }) {
  const open = tasks.filter((t) => t.status !== "completed");
  const done = tasks.filter((t) => t.status === "completed");
  return (
    <div ref={listRef}>
      <div className="hidden lg:flex items-baseline justify-between mb-3">
        <h2 className="text-2xl font-bold tracking-tight">Actions</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => (selection ? onCancelSelect() : onStartSelect(null))} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap text-xs tracking-widest">SELECT</button>
          <button onClick={onManageLists} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap text-xs tracking-widest">LISTS</button>
          <button onClick={onAddTask} style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest">+ ADD</button>
        </div>
      </div>

      {selection && (
        <div className="flex flex-wrap items-center gap-1 mb-2 px-2 py-2" style={{ boxShadow: `inset 0 0 0 1px ${T.accent}`, borderRadius: CARD_R }}>
          <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest mr-1">{selection.size} SELECTED</span>
          {[["complete", "COMPLETE"], ["today", "TODAY"], ["defer", "TOMORROW"]].map(([action, label]) => (
            <button key={action} onClick={() => onBulk(action)} className="nb-tap px-2 py-1 text-xs tracking-widest"
              style={{ fontFamily: MONO, borderRadius: 999, color: T.text, border: `1px solid ${T.line}` }}>{label}</button>
          ))}
          {/* §11.3. The three that benefit most from being done at once, each
              borrowing the single-task command so the rules stay identical. */}
          <select onChange={(e) => { if (e.target.value) { onBulk("list", e.target.value); e.target.value = ""; } }} defaultValue=""
            style={{ fontFamily: MONO, borderRadius: 999, background: "transparent", color: T.dim, border: `1px solid ${T.line}` }} className="px-2 py-1 text-xs tracking-widest">
            <option value="">MOVE TO…</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select onChange={(e) => { if (e.target.value) { onBulk("priority", e.target.value); e.target.value = ""; } }} defaultValue=""
            style={{ fontFamily: MONO, borderRadius: 999, background: "transparent", color: T.dim, border: `1px solid ${T.line}` }} className="px-2 py-1 text-xs tracking-widest">
            <option value="">PRIORITY…</option>
            {["urgent", "high", "normal", "low", "none"].map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}
          </select>
          <button onClick={() => { const t = prompt("Tag to add"); if (t && t.trim()) onBulk("tag", t.trim()); }}
            className="nb-tap px-2 py-1 text-xs tracking-widest" style={{ fontFamily: MONO, borderRadius: 999, color: T.text, border: `1px solid ${T.line}` }}>TAG…</button>
          <button onClick={() => onBulk("delete")} className="nb-tap px-2 py-1 text-xs tracking-widest"
            style={{ fontFamily: MONO, borderRadius: 999, color: NOW_RED, border: `1px solid ${T.line}` }}>DELETE</button>
          <button onClick={onCancelSelect} style={{ fontFamily: MONO, color: T.dim }} className="ml-auto text-xs tracking-widest">CANCEL</button>
        </div>
      )}

      <div className="nb-x flex gap-1 overflow-x-auto mb-3 -mx-1 px-1">
        {SMART_VIEWS.map((view) => {
          const on = view.id === smartView;
          const count = viewCounts?.[view.id] ?? 0;
          if (!on && count === 0 && view.id !== "today") return null;
          return (
            <button key={view.id} onClick={() => onSmartView(view.id)} className="shrink-0 px-2 py-1 text-xs tracking-widest"
              style={{ fontFamily: MONO, background: on ? T.accent : "transparent", color: on ? T.on : T.dim, border: `1px solid ${on ? T.accent : T.line}` }}>
              {view.label}{count ? ` ${count}` : ""}
            </button>
          );
        })}
      </div>

      {showOverdue && overdue.length > 0 && (
        <button onClick={onPullOverdue} className="w-full flex items-center gap-2 px-3 py-2 mb-2 text-left" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
          <span style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest shrink-0">{overdue.length} OVERDUE</span>
          <span className="flex-1 text-xs truncate" style={{ color: T.dim }}>{overdue.map((t) => t.title).join(" · ")}</span>
          <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest shrink-0">PLAN TODAY</span>
        </button>
      )}

      {deadlines.length > 0 && (
        <div className="mb-3">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">DEADLINES</span>
          <div className="flex flex-col mt-1">
            {deadlines.slice(0, 4).map((t) => {
              const dLeft = diffDays(t.deadline.date, todayKey);
              return (
                <button key={t.id} data-deadline={t.id} onClick={() => onOpenDeadline(t)} className="nb-row flex items-center gap-2 py-2 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                  {/* The chip sizes to its longest word instead of being clipped to a
                      fixed width, which was overlapping the title. */}
                  <span style={{ fontFamily: MONO, color: dLeft <= 1 ? NOW_RED : T.dim, borderRadius: 999, border: `1px solid ${dLeft <= 1 ? NOW_RED : T.line}` }}
                    className="px-2 py-0.5 text-xs tracking-widest shrink-0 whitespace-nowrap">
                    {dLeft === 0 ? "TODAY" : dLeft === 1 ? "TOM" : `${dLeft}D`}
                  </span>
                  <span className="flex-1 text-xs truncate min-w-0">{t.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tasks.length === 0 && !selection && (
        <button onClick={onAddTask} className="w-full py-8 text-center" style={{ border: `1px dashed ${T.faint}` }}>
          <span style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic">Nothing claimed for this day yet. Add the one thing that matters.</span>
        </button>
      )}

      <div className="flex flex-col gap-2">
        {open.map((t) => (
          <TaskCard key={t.id} T={T} t={t} beep={beep} target={gesture && gesture.overTask === t.id} todayKey={todayKey} blockers={blockersFor(t)} onPromoteSub={onPromoteSub} clock={clock} selection={selection} onToggleSelect={onToggleSelect} onStartSelect={onStartSelect}
            onComplete={onComplete} onReopen={onReopen} onDefer={onDefer} onInspect={onInspect} onToggleSub={onToggleSub} onAddSub={onAddSub} onRemoveSub={onRemoveSub} onDragStart={onDragStart} onUnschedule={onUnschedule} />
        ))}
      </div>

      {done.length > 0 && (
        <div className="mt-4">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">DONE · {done.length}</span>
          <div className="flex flex-col gap-2 mt-2">
            {done.map((t) => (
              <TaskCard key={t.id} T={T} t={t} beep={beep} todayKey={todayKey} blockers={blockersFor(t)} onPromoteSub={onPromoteSub} clock={clock} selection={selection} onToggleSelect={onToggleSelect} onStartSelect={onStartSelect}
                onComplete={onComplete} onReopen={onReopen} onDefer={onDefer} onInspect={onInspect} onToggleSub={onToggleSub} onAddSub={onAddSub} onRemoveSub={onRemoveSub} onDragStart={onDragStart} onUnschedule={onUnschedule} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">NOTES</span>
          <button onClick={() => onEditNote(notes[0] ?? null)} style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest">{notes.length ? "EDIT" : "+ WRITE"}</button>
        </div>
        <div className="flex flex-col gap-3 mt-2">
          {notes.map((n) => (
            <div key={n.id} className="pl-3" style={{ borderLeft: `2px solid ${T.faint}` }}>
              {n.blocks.map((block, i, all) => (block.type === "checklist" ? (
                <div key={block.id} className="flex items-center gap-2 py-1">
                  <button onClick={() => onToggleNoteCheck(n.id, block.id)} className="shrink-0" aria-label={block.done ? "Reopen line" : "Complete line"}>
                    <span className="block rounded-full" style={{ width: 14, height: 14, background: block.done ? T.accent : "transparent", boxShadow: `inset 0 0 0 1.5px ${block.done ? T.accent : T.faint}` }} />
                  </button>
                  <span className="flex-1 text-sm" style={{ textDecoration: block.done ? "line-through" : "none", color: block.done ? T.dim : T.text }}>
                    <Inline T={T} text={block.text} />
                  </span>
                  {/* §7.2. Once a line has become a task the affordance goes away, so
                      the same line cannot be turned into a second one. */}
                  {!block.extractedTaskId
                    ? <button onClick={() => onExtract(n.id, block.id, plainText(block.text))} style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest shrink-0">+ ACTION</button>
                    : <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">TRACKED</span>}
                </div>
              ) : (
                <NoteBlock key={block.id} T={T} block={block} ordinal={orderedIndex(all, i)} onOpen={() => onEditNote(n)} />
              )))}
            </div>
          ))}
          {notes.length === 0 && <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic pl-3">No notes on this page yet.</p>}
        </div>
      </div>
    </div>
  );
}

/* §3.5. Marks are stored as the punctuation people typed, so a note stays legible
   anywhere. Rendering the mark instead of its punctuation is what makes typing it
   worth doing — the stored text is never rewritten. */
function Inline({ T, text }) {
  return parseInline(text).map((run, i) => {
    if (run.mark === "strong") return <strong key={i} className="font-bold not-italic">{run.text}</strong>;
    if (run.mark === "em") return <em key={i} className="italic">{run.text}</em>;
    if (run.mark === "strike") return <span key={i} style={{ textDecoration: "line-through", color: T.dim }}>{run.text}</span>;
    if (run.mark === "code") {
      return <code key={i} style={{ fontFamily: MONO, background: T.faint, color: T.text }} className="text-xs not-italic px-1 py-0.5">{run.text}</code>;
    }
    return <React.Fragment key={i}>{run.text}</React.Fragment>;
  });
}

/* A numbered line counts from the start of its own run, not from its position in
   the document, so a list that follows prose still begins at one. */
function orderedIndex(blocks, i) {
  let n = 1;
  for (let j = i - 1; j >= 0 && blocks[j].type === "numbered"; j -= 1) n += 1;
  return n;
}

/* §3.2. Every block type the document model holds now reads as itself on the page.
   Before this the seven types all rendered as the same italic paragraph, so typing
   a heading looked identical to typing prose and the shorthand bought nothing. */
function NoteBlock({ T, block, ordinal, onOpen }) {
  if (block.type === "divider") {
    return <div className="my-2.5" style={{ borderTop: `1px solid ${T.faint}` }} aria-hidden="true" />;
  }
  const marked = <Inline T={T} text={block.text} />;
  const body = block.type === "heading" ? (
    <p style={{ fontFamily: MONO, color: T.text }}
      className={`${block.level === 1 ? "text-sm" : "text-xs"} font-bold tracking-widest uppercase pt-2 pb-0.5`}>{marked}</p>
  ) : block.type === "quote" ? (
    <p style={{ fontFamily: SERIF, color: T.dim, borderLeft: `2px solid ${T.accent}` }}
      className="text-sm italic leading-relaxed py-0.5 pl-2.5 my-1">{marked}</p>
  ) : block.type === "code" ? (
    <span style={{ fontFamily: MONO, background: T.faint, color: T.text, display: "block", whiteSpace: "pre-wrap" }}
      className="text-xs leading-relaxed p-2.5 my-1 overflow-x-auto">{block.text}</span>
  ) : block.type === "bulleted" || block.type === "numbered" ? (
    <span className="flex gap-2 py-0.5">
      <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs shrink-0 pt-1 tabular-nums">
        {block.type === "numbered" ? `${ordinal}.` : "—"}
      </span>
      <span style={{ fontFamily: SERIF }} className="flex-1 text-sm italic leading-relaxed">{marked}</span>
    </span>
  ) : (
    <p style={{ fontFamily: SERIF }} className="text-sm italic leading-relaxed py-0.5">{marked}</p>
  );
  return <button onClick={onOpen} className="text-left w-full">{body}</button>;
}

function TaskCard({ T, t, beep, target, todayKey, blockers = [], onPromoteSub, clock = "12", selection = null, onToggleSelect, onStartSelect, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onUnschedule }) {
  const [prog, setProg] = useState(0);
  const [dx, setDx] = useState(0);
  const [burst, setBurst] = useState(null);
  const raf = useRef(null), t0 = useRef(0), lastTick = useRef(0), holding = useRef(false);
  const sw = useRef(null);

  const stopHold = (aborted) => {
    cancelAnimationFrame(raf.current);
    if (holding.current && aborted && prog > 0.15) beep("abort");
    holding.current = false;
    setProg(0);
  };
  const startHold = () => {
    if (t.status === "completed") return;
    holding.current = true;
    t0.current = performance.now();
    lastTick.current = 0;
    const loop = (now) => {
      const p = Math.min(1, (now - t0.current) / HOLD_MS);
      setProg(p);
      const step = 0.17 - 0.11 * p;
      if (p - lastTick.current >= step) { lastTick.current = p; beep("ratchet", p); buzz(3); }
      if (p >= 1) { holding.current = false; setProg(0); fire(); return; }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  const fire = () => { setBurst(uid()); setTimeout(() => setBurst(null), 640); onComplete(t.id); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onDown = (e) => { sw.current = { x: e.clientX, y: e.clientY, live: false }; };
  const onMove = (e) => {
    if (!sw.current) return;
    const ddx = e.clientX - sw.current.x, ddy = e.clientY - sw.current.y;
    if (!sw.current.live && Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy)) { sw.current.live = true; stopHold(false); }
    if (sw.current.live) setDx(Math.max(-140, Math.min(140, ddx)));
  };
  const onUp = () => {
    if (sw.current && sw.current.live) {
      if (dx > 96 && t.status !== "completed") fire();
      else if (dx < -96) onDefer(t.id, 1);
    }
    sw.current = null;
    setDx(0);
  };

  /* Derived from the theme rather than passed down: the card only needs the same
     lift rule as the timeline, and threading a token through three components to
     say "one step above the page" is not worth the prop. */
  const surface = isDark(T.bg) ? mixHex(T.card, "#FFFFFF", 0.13) : mixHex(T.card, "#000000", 0.06);
  const checklist = t.checklist ?? [];
  const subDone = checklist.filter((s) => s.done).length;
  const subPct = checklist.length ? (subDone / checklist.length) * 100 : 0;
  const dueLeft = t.deadline.date ? diffDays(t.deadline.date, todayKey) : null;
  const isDone = t.status === "completed";

  return (
    <div data-task={t.id} className="relative overflow-hidden" style={{ background: "transparent", borderRadius: CARD_R, boxShadow: target ? `inset 0 2px 0 ${T.accent}` : "none" }}>
      <div className="absolute inset-0 flex items-center justify-between px-4" style={{ fontFamily: MONO }}>
        <span className="text-xs tracking-widest" style={{ color: T.accent, opacity: dx > 20 ? 1 : 0 }}>COMPLETE</span>
        <span className="text-xs tracking-widest" style={{ color: T.dim, opacity: dx < -20 ? 1 : 0 }}>TOMORROW</span>
      </div>

      <article className="relative" style={{ background: surface, borderRadius: CARD_R, transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 220ms cubic-bezier(.2,.8,.25,1)" : "none", opacity: isDone ? 0.55 : 1, touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="flex items-start gap-3 p-3 pl-4">
          <button onPointerDown={(e) => { e.stopPropagation(); if (selection) return; if (!isDone) startHold(); }}
            onPointerUp={(e) => {
              e.stopPropagation();
              /* While selecting, the same control toggles membership — no second
                 checkbox appears and nothing shifts position. */
              if (selection) { onToggleSelect(t.id); return; }
              if (isDone) onReopen(t.id); else stopHold(true);
            }}
            onPointerLeave={() => stopHold(true)} onPointerCancel={() => stopHold(true)}
            className="relative mt-0.5 w-8 h-8 shrink-0 flex items-center justify-center"
            aria-label={selection ? (selection.has(t.id) ? "Deselect" : "Select") : isDone ? "Reopen" : "Hold to complete"} style={{ touchAction: "none" }}>
            <svg width="32" height="32" viewBox="0 0 32 32" className="absolute inset-0">
              <circle cx="16" cy="16" r="13" fill="none" stroke={selection && selection.has(t.id) ? T.accent : T.faint} strokeWidth="2" />
              <circle cx="16" cy="16" r="13" fill="none" stroke={T.accent} strokeWidth="3" strokeDasharray={2 * Math.PI * 13} strokeDashoffset={2 * Math.PI * 13 * (1 - (isDone ? 1 : prog))} transform="rotate(-90 16 16)" />
            </svg>
            <span className="relative" style={{ width: 10, height: 10, borderRadius: selection ? 2 : 0, background: (isDone || (selection && selection.has(t.id))) ? T.accent : "transparent", transform: `scale(${1 + prog * 0.5})` }} />
            {burst && Array.from({ length: 10 }).map((_, i) => {
              const a = (i / 10) * Math.PI * 2;
              return <span key={burst + i} className="nb-p absolute" style={{ width: 4, height: 4, background: T.accent, "--tx": `${Math.cos(a) * 34}px`, "--ty": `${Math.sin(a) * 34}px` }} />;
            })}
          </button>

          <div className="flex-1 min-w-0">
            <button onClick={() => onInspect(t.id)} className="text-left w-full">
              <span className="block text-sm font-semibold leading-snug" style={{ textDecoration: isDone ? "line-through" : "none", color: isDone ? T.dim : T.text }}>{t.title}</span>
            </button>
            <div className="flex flex-wrap items-center gap-2 mt-1" style={{ fontFamily: MONO }}>
              <span className="inline-flex items-center gap-1.5">
                <span className="shrink-0 rounded-full" style={{ width: 7, height: 7, background: catColor(t.category) }} />
                <span style={{ color: T.dim }} className="text-xs tracking-widest">{t.category}</span>
              </span>
              {t.recurrence && <span style={{ color: T.dim }} className="text-xs">↻</span>}
              {t.planned.startMinute != null && <button onClick={() => onUnschedule(t.id)} style={{ color: T.accent }} className="text-xs tracking-widest">{fmtTime(t.planned.startMinute, clock)}</button>}
              {dueLeft != null && <span style={{ color: dueLeft <= 0 ? NOW_RED : T.dim }} className="text-xs tracking-widest">DUE {dueLeft === 0 ? "TODAY" : dueLeft < 0 ? `${-dueLeft}D LATE` : `${dueLeft}D`}</span>}
              {checklist.length > 0 && <span style={{ color: T.dim }} className="text-xs tracking-widest">{subDone}/{checklist.length}</span>}
              {blockers.length > 0 && (
                <span title={blockers.map((b) => b.title).join(", ")} style={{ color: NOW_RED }} className="text-xs tracking-widest">
                  ⛌ BLOCKED BY {blockers.length === 1 ? blockers[0].title : `${blockers.length} TASKS`}
                </span>
              )}
            </div>
            {checklist.length > 0 && (
              <div className="h-0.5 mt-2" style={{ background: T.faint }}>
                <div className="h-full" style={{ background: T.accent, width: `${subPct}%`, transition: "width 220ms ease" }} />
              </div>
            )}
          </div>

          <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(t.id, e.clientX, e.clientY); }}
            onContextMenu={(e) => { e.preventDefault(); if (!selection) onStartSelect(t.id); }}
            style={{ color: T.dim, touchAction: "none" }}
            className="nb-tap shrink-0 w-7 h-8 text-xs" aria-label="Drag to schedule, reorder, or move to another day">⣿</button>
        </div>

        {checklist.length > 0 && !isDone && (
          <div className="pl-8 pr-3 pb-3">
            <div className="pl-3" style={{ borderLeft: `2px solid ${T.faint}` }}>
              {checklist.map((s) => (
                <div key={s.id} className="nb-row flex items-center gap-2 w-full py-1.5">
                  <button onClick={() => onToggleSub(t.id, s.id)} className="flex items-center gap-2 flex-1 text-left">
                    <span className="w-3 h-3 shrink-0" style={{ background: s.done ? T.accent : "transparent", boxShadow: `inset 0 0 0 1px ${s.done ? T.accent : T.faint}` }} />
                    <span className="text-xs" style={{ textDecoration: s.done ? "line-through" : "none", color: s.done ? T.dim : T.text }}>{s.title}</span>
                  </button>
                  <button onClick={() => onPromoteSub(t.id, s.id)} style={{ color: T.dim }} className="text-xs px-1" aria-label="Promote step to a subtask" title="Needs its own planning? Promote to a subtask">↥</button>
                  <button onClick={() => onRemoveSub(t.id, s.id)} style={{ color: T.dim }} className="text-xs px-1" aria-label="Remove step">✕</button>
                </div>
              ))}
              <SubComposer T={T} onAdd={(v) => onAddSub(t.id, v)} />
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

/* ═══════════════════════ PIECES ═══════════════════════ */

/* One attribute per row: an icon, the value in plain words, and an optional tint
   when the attribute carries meaning of its own — the category's colour, or the red
   of something overdue or blocked. */
/* A row inside a grouped attribute card: value on the left, its icon on the right,
   matching how the reference groups the facts that govern a task. */
/* The agenda: a continuous run of days down one rail. A day with nothing in it is
   still drawn, because the gap is the information — you can see the shape of a week
   without counting entries. */
function Agenda({ T, surface, days, dateKey, todayKey, clock, onOpenEvent, onOpenTask, onJump }) {
  return (
    <div className="nb-s overflow-y-auto flex-1 min-h-0" style={{ background: T.card, borderRadius: 16 }}>
      {days.map((day) => {
        const d = parseKey(day.key);
        const isToday = day.key === todayKey;
        const count = day.allDay.length + day.timed.length + day.tasks.length;
        return (
          <div key={day.key} className="flex" style={{ borderTop: `1px solid ${T.line}`, minHeight: 76 }}>
            <button onClick={() => onJump(day.key)} className="shrink-0 w-16 py-3 text-center" style={{ background: T.bg }}>
              <span className="inline-flex flex-col items-center px-2 py-1"
                style={{ borderRadius: CARD_R, boxShadow: isToday ? `inset 0 0 0 1.5px ${T.text}` : "none" }}>
                <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest">{WD[d.getDay()]}</span>
                <span style={{ fontFamily: MONO }} className="block text-xl font-bold tracking-tight">{pad(d.getDate())}</span>
              </span>
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-2 pr-2 pl-2">
              {count === 0 && <span style={{ fontFamily: MONO, color: T.faint }} className="text-xs tracking-widest py-2">—</span>}
              {day.allDay.map((e) => (
                <button key={e.id} onClick={() => onOpenEvent(e.id, day.key)} className="nb-tap flex items-center gap-2.5 px-3 py-2.5 text-left"
                  style={{ background: surface, borderRadius: CARD_R }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 text-sm font-semibold truncate">{e.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">ALL DAY</span>
                </button>
              ))}
              {day.timed.map((e) => (
                <button key={e.id} onClick={() => onOpenEvent(e.id, day.key)} className="nb-tap flex items-center gap-2.5 px-3 py-2.5 text-left"
                  style={{ background: surface, borderRadius: CARD_R }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{e.title}</span>
                    {e.place && <span style={{ color: T.dim }} className="block text-xs truncate">{e.place}</span>}
                  </span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{fmtTime(e.start, clock)}</span>
                </button>
              ))}
              {day.tasks.map((t) => (
                <button key={t.id} onClick={() => onOpenTask(t.id, day.key)} className="nb-tap flex items-center gap-2.5 px-3 py-2.5 text-left"
                  style={{ background: surface, borderRadius: CARD_R, opacity: t.status === "completed" ? 0.45 : 1 }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, boxShadow: `inset 0 0 0 1.5px ${catColor(t.category)}`, background: t.status === "completed" ? catColor(t.category) : "transparent" }} />
                  <span className="flex-1 text-sm font-semibold truncate" style={{ textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">
                    {t.planned.startMinute != null ? fmtTime(t.planned.startMinute, clock) : "ACTION"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Tags are added by typing and removed by tapping the tag itself — a chip that is
   its own delete control, so there is no second affordance to hunt for. */
function TagField({ T, tags, onChange }) {
  const [v, setV] = useState("");
  const add = () => {
    const value = v.trim().replace(/^#/, "");
    if (value) { onChange([...tags, value]); setV(""); }
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <button key={tag} onClick={() => onChange(tags.filter((x) => x !== tag))}
          className="px-2 py-0.5 text-xs tracking-widest" title="Remove tag"
          style={{ fontFamily: MONO, borderRadius: 999, color: T.dim, border: `1px solid ${T.line}` }}>{tag} ✕</button>
      ))}
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} onBlur={add}
        placeholder={tags.length ? "Add tag" : "No tags"} style={{ background: "transparent", border: "none" }}
        className="text-sm py-0.5 flex-1 min-w-20" />
    </div>
  );
}

function DetailRow({ T, icon, children, divider = false }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: divider ? `1px solid ${T.line}` : "none" }}>
      <div className="flex-1 min-w-0">{children}</div>
      <span style={{ color: T.dim }} className="text-sm shrink-0">{icon}</span>
    </div>
  );
}

/* The add-a-step affordance is the same pill as a step, so the list grows in place
   instead of opening a separate field somewhere else. */
function InlineAdd({ T, surface, onAdd }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV(""); } };
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: surface, borderRadius: 999 }}>
      <span style={{ color: T.dim }} className="text-base shrink-0 w-5 text-center">+</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder="Add a step" style={{ background: "transparent", border: "none" }} className="flex-1 text-sm py-0.5" />
      {v.trim() && <button onClick={go} style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">ADD</button>}
    </div>
  );
}

function Pill({ T, surface, icon, label, tint = null }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: tint ? `${tint}22` : surface, borderRadius: CARD_R }}>
      <span style={{ color: tint || T.dim }} className="text-sm shrink-0 w-4 text-center">{icon}</span>
      <span className="flex-1 text-sm truncate" style={{ color: tint || T.text }}>{label}</span>
    </div>
  );
}

/* §4.6. The value is the field. These render as the record reads until they are
   touched, then take the control in place — same surface, same box, so nothing
   reflows and focusing a field never feels like arriving somewhere else. */

/* §4.6. A title or a line of prose commits when it is left or confirmed, never per
   keystroke: a half-typed title is not a title, and committing one would put it
   through the scope question a character at a time. */
function InlineText({ T, value, onCommit, placeholder = "Untitled", multiline = false, className = "", style = {}, ariaLabel }) {
  const [draft, setDraft] = useState(value ?? "");
  const [live, setLive] = useState(false);
  /* Escape blurs the field, and blur is what commits — so the abandonment has to be
     recorded somewhere the commit can read immediately. Resetting the draft is not
     enough: state has not re-rendered by the time blur runs. */
  const abandoned = useRef(false);
  /* While the field is not being edited it follows the record, so a change made
     anywhere else — a bulk action, an undo — shows here without a remount. */
  useEffect(() => { if (!live) setDraft(value ?? ""); }, [value, live]);

  const commit = () => {
    setLive(false);
    if (abandoned.current) { abandoned.current = false; setDraft(value ?? ""); return; }
    const next = draft.trim();
    if (next === (value ?? "").trim()) return;
    if (!next && !multiline) { setDraft(value ?? ""); return; }
    onCommit(next);
  };
  const keys = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); abandoned.current = true; setDraft(value ?? ""); e.target.blur(); return; }
    if (e.key === "Enter" && !multiline) { e.preventDefault(); e.target.blur(); }
  };
  const shared = {
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onFocus: () => setLive(true),
    onBlur: commit,
    onKeyDown: keys,
    placeholder,
    "aria-label": ariaLabel || placeholder,
    className: `${className} w-full`,
    style: {
      background: "transparent",
      border: "none",
      outline: "none",
      resize: "none",
      /* The only thing focus changes is a hairline under the text, so the field
         announces itself as editable without redrawing the row. */
      boxShadow: live ? `0 1px 0 0 ${T.accent}` : "none",
      transition: "box-shadow 160ms ease",
      ...style,
    },
  };
  return multiline
    ? <textarea rows={Math.min(6, Math.max(1, draft.split("\n").length))} {...shared} />
    : <input {...shared} />;
}

/* §4.6. Collapsed, an attribute costs one line. Tapping it grows the alternatives
   underneath rather than showing every choice all the time. */
function InlineChoice({ T, surface, icon, label, options, value, onPick, tint = null, dot = null, children = null }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: tint ? `${tint}22` : surface, borderRadius: CARD_R }} className="overflow-hidden">
      <button onClick={() => setOpen(!open)} className="nb-tap flex items-center gap-3 px-3 py-2.5 w-full text-left">
        <span style={{ color: tint || T.dim }} className="text-sm shrink-0 w-4 text-center">{icon}</span>
        <span className="flex-1 text-sm truncate" style={{ color: tint || T.text }}>{label}</span>
        <span style={{ color: T.dim, transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms cubic-bezier(.2,.8,.25,1)" }}
          className="text-xs shrink-0">▾</span>
      </button>
      <div style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 240ms cubic-bezier(.2,.8,.25,1)",
      }}>
        {/* Clipping alone only hides the choices from the eye — they stayed
            focusable and clickable, so tabbing through a collapsed row landed on
            controls nobody could see. Hiding waits for the collapse to finish so
            the animation still plays. */}
        <div className="overflow-hidden" inert={!open}
          style={{ visibility: open ? "visible" : "hidden", transition: `visibility 0s linear ${open ? 0 : 240}ms` }}>
          <div className="flex flex-wrap gap-1 px-3 pb-2.5">
            {options.map(([key, text]) => {
              const on = key === value;
              return (
                <button key={String(key)} onClick={() => { onPick(key); setOpen(false); }}
                  className="nb-tap inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs tracking-widest"
                  style={{
                    fontFamily: MONO, borderRadius: 999,
                    background: on ? T.accent : "transparent",
                    color: on ? T.on : T.dim,
                    border: `1px solid ${on ? T.accent : T.line}`,
                    transition: "background 180ms ease, color 180ms ease",
                  }}>
                  {dot && <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: on ? T.on : dot(key) }} />}
                  {text}
                </button>
              );
            })}
          </div>
          {children && <div className="px-3 pb-2.5">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/* §4.6. A native picker fires as it is spun, so committing on change would put a
   recurring entry through the scope question once per arrow press. The value is
   held here and written when the field is left or confirmed — the same rule the
   text fields follow, so no control in the view behaves differently from another. */
function InlineNative({ T, type, value, onCommit, ariaLabel, className = "", style = {}, min, dark = false }) {
  const [draft, setDraft] = useState(value ?? "");
  const [live, setLive] = useState(false);
  const abandoned = useRef(false);
  useEffect(() => { if (!live) setDraft(value ?? ""); }, [value, live]);
  const commit = () => {
    setLive(false);
    if (abandoned.current) { abandoned.current = false; setDraft(value ?? ""); return; }
    if ((draft ?? "") !== (value ?? "")) onCommit(draft);
  };
  return (
    <input type={type} min={min} aria-label={ariaLabel} value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setLive(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); abandoned.current = true; setDraft(value ?? ""); e.target.blur(); return; }
        if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
      }}
      className={className}
      style={{
        background: "transparent",
        border: "none",
        outline: "none",
        colorScheme: dark ? "dark" : "light",
        boxShadow: live ? `0 1px 0 0 ${T.accent}` : "none",
        transition: "box-shadow 160ms ease",
        ...style,
      }} />
  );
}

/* §4.4/§4.6. The same expansion inside the task's grouped rules card, which reads as
   one block of rules with its icons on the right — so the choices cannot bring their
   own surface without breaking the group. */
function InlineChoiceRow({ T, icon, label, sub, options, value, onPick, dot = null, divider = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: divider ? `1px solid ${T.line}` : "none" }}>
      <button onClick={() => setOpen(!open)} className="nb-tap flex items-center gap-3 px-3 py-3 w-full text-left">
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            {dot && <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: dot(value) }} />}
            <span className="block text-sm truncate">{label}</span>
          </span>
          {sub && <span style={{ color: T.dim }} className="block text-xs mt-0.5">{sub}</span>}
        </span>
        <span style={{ color: T.dim, transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms cubic-bezier(.2,.8,.25,1)" }}
          className="text-xs shrink-0">▾</span>
        <span style={{ color: T.dim }} className="text-sm shrink-0">{icon}</span>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 240ms cubic-bezier(.2,.8,.25,1)" }}>
        <div className="overflow-hidden" inert={!open}
          style={{ visibility: open ? "visible" : "hidden", transition: `visibility 0s linear ${open ? 0 : 240}ms` }}>
          <div className="flex flex-wrap gap-1 px-3 pb-3">
            {options.map(([key, text]) => {
              const on = key === value;
              return (
                <button key={String(key)} onClick={() => { onPick(key); setOpen(false); }}
                  className="nb-tap inline-flex items-center gap-1.5 px-2.5 py-1 text-xs tracking-widest"
                  style={{
                    fontFamily: MONO, borderRadius: 999,
                    background: on ? T.accent : "transparent", color: on ? T.on : T.dim,
                    border: `1px solid ${on ? T.accent : T.line}`,
                    transition: "background 180ms ease, color 180ms ease",
                  }}>
                  {dot && <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: on ? T.on : dot(key) }} />}
                  {text}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* §4.6/§8. A native date or time control brings its own type and its own picker
   glyph, which is a different visual language from everything around it — the day
   would read "08/10/2026 📅" in the middle of a page that says "MON 10 AUG". The
   value keeps the product's own formatting and the real control lies invisibly on
   top of it, so the picker is still exactly where the value is. */
function InlineStamp({ T, type, value, display, onCommit, ariaLabel, min, className = "", style = {}, dark = false }) {
  return (
    <span className="nb-stamp relative inline-flex items-center">
      <span aria-hidden="true" className={className} style={{ ...style, pointerEvents: "none" }}>{display}</span>
      <InlineNative T={T} dark={dark} type={type} value={value} min={min} onCommit={onCommit} ariaLabel={ariaLabel}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0, cursor: "pointer", padding: 0, margin: 0 }} />
    </span>
  );
}

/* A native picker sitting on the row it describes, so a date reads as a date and
   edits as one without a second surface. */
function InlineField({ T, surface, icon, children, tint = null }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: tint ? `${tint}22` : surface, borderRadius: CARD_R }}>
      <span style={{ color: tint || T.dim }} className="text-sm shrink-0 w-4 text-center">{icon}</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

function Row({ T, k, v }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${T.line}`, fontFamily: MONO }}>
      <span style={{ color: T.dim }} className="text-xs tracking-widest">{k}</span>
      <span className="text-xs tracking-widest">{v}</span>
    </div>
  );
}

function Sheet({ T, onClose, title, children }) {
  /* Ignore a backdrop dismissal that arrives in the same tap that opened the sheet.
     Belt and braces alongside preventDefault at the source: any future path that
     opens a sheet from a touch inherits the protection. */
  const openedAt = useRef(Date.now());
  const guardedClose = useCallback(() => {
    if (Date.now() - openedAt.current < 350) return;
    onClose();
  }, [onClose]);
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.8)" }} onClick={guardedClose}>
      <div role="dialog" aria-modal="true" aria-label={title || "Details"} onClick={(e) => e.stopPropagation()}
        className="nb-up w-full sm:max-w-md overflow-y-auto nb-s" style={{ background: T.card, color: T.text, maxHeight: "88vh" }}>
        <div className="sticky top-0 flex items-center justify-between px-4 sm:px-5 pt-3 pb-2" style={{ background: T.card, zIndex: 3 }}>
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">{title || ""}</span>
          <button onClick={onClose} aria-label="Close" style={{ color: T.dim, fontFamily: MONO }} className="nb-tap -mr-1 px-2 py-1 text-sm">✕</button>
        </div>
        <div className="px-4 sm:px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

function NewListField({ T, onAdd }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV(""); } };
  return (
    <div className="flex items-center gap-2 py-2">
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder="New list" style={{ background: "transparent", border: `1px solid ${T.line}` }} className="flex-1 px-2 py-1.5 text-sm" />
      {v.trim() && <button onClick={go} style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">ADD</button>}
    </div>
  );
}

function SubComposer({ T, onAdd }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV(""); } };
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-3 h-3 shrink-0" style={{ boxShadow: `inset 0 0 0 1px ${T.faint}` }} />
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Add a step" style={{ background: "transparent", border: "none" }} className="flex-1 text-xs py-0.5" />
      {v.trim() && <button onClick={go} style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">ADD</button>}
    </div>
  );
}

/* §10.2. History is browsable, not just recorded. A revision that no longer matches
   its own checksum is shown but cannot be restored — putting damaged text back in
   place of a good document would be worse than losing the snapshot. */
function NoteHistory({ T, clock, revisions, onRestore }) {
  if (!revisions.length) {
    return <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic py-4">No earlier versions yet. Every save from here keeps one.</p>;
  }
  return (
    <div className="flex flex-col">
      <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic pb-3">
        {revisions.length === 1 ? "One earlier version" : `${revisions.length} earlier versions`}, newest first. Going back keeps the current one too.
      </p>
      {revisions.map((r) => {
        const intact = revisionIsIntact(r);
        const stamp = r.at ? `${fmtDay(r.at.slice(0, 10))} · ${fmtTime(Number(r.at.slice(11, 13)) * 60 + Number(r.at.slice(14, 16)), clock)}` : "UNDATED";
        return (
          <div key={r.id} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0 w-10 tabular-nums">v{r.revision}</span>
            <div className="flex-1 min-w-0">
              <p style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">{stamp}</p>
              <p style={{ fontFamily: SERIF }} className="text-sm italic truncate">
                {r.blocks.map((b) => plainText(b.text)).filter(Boolean).join(" · ") || "Empty page"}
              </p>
            </div>
            {intact
              ? <button onClick={() => onRestore(r)} style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest shrink-0">GO BACK</button>
              : <span style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest shrink-0">DAMAGED</span>}
          </div>
        );
      })}
    </div>
  );
}

function noteContextLabel(note) {
  if (note.contextLabel) return note.contextLabel;
  if (note.kind === "daily") return note.date ? fmtDay(note.date) : "DAILY NOTE";
  if (note.kind === "event") return "EVENT NOTE";
  if (note.kind === "task") return "TASK NOTE";
  return "STANDALONE NOTE";
}

function EntityNotes({ T, notes, kind, onNew, onOpen }) {
  return (
    <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${T.line}` }}>
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">
          NOTES · {notes.length}
        </span>
        <button onClick={onNew} style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest">+ NEW NOTE</button>
      </div>
      {notes.length === 0 ? (
        <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-2">Keep the thinking beside this {kind}, not inside a field it will outgrow.</p>
      ) : (
        <div className="flex flex-col mt-2">
          {notes.map((note) => (
            <button key={note.id} onClick={() => onOpen(note)} className="nb-row text-left py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="block text-sm truncate">{note.title || noteExcerpt(note, 90) || "Untitled note"}</span>
              <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-0.5">
                {note.pinned ? "PINNED · " : ""}{note.updatedAt ? "UPDATED" : "NEW"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotebookPanel({ T, view, notes, onView, onNew, onOpen, onPin, onArchive }) {
  const tabs = [["all", "ALL"], ["pinned", "PINNED"], ["archived", "ARCHIVED"]];
  return (
    <div>
      <div className="flex gap-1" role="tablist" aria-label="Notebook views">
        {tabs.map(([id, label]) => {
          const active = id === view;
          return <button key={id} role="tab" aria-selected={active} onClick={() => onView(id)}
            style={{ fontFamily: MONO, background: active ? T.accent : "transparent", color: active ? T.on : T.dim, border: `1px solid ${active ? T.accent : T.line}`, borderRadius: 999 }}
            className="nb-tap flex-1 py-2 text-xs tracking-widest">{label}</button>;
        })}
      </div>
      {view !== "archived" && (
        <button onClick={onNew} style={{ fontFamily: MONO, color: T.on, background: T.accent }} className="nb-tap w-full py-3 mt-4 text-xs font-bold tracking-widest">+ NEW NOTE</button>
      )}
      <div className="flex flex-col mt-3">
        {notes.map((note) => (
          <div key={note.id} className="flex items-center gap-2 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <button onClick={() => onOpen(note)} className="nb-row text-left flex-1 min-w-0">
              <span className="block text-sm truncate">{note.title || noteExcerpt(note, 100) || "Untitled note"}</span>
              <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-0.5 truncate">
                {noteContextLabel(note)}{note.pinned ? " · PINNED" : ""}
              </span>
            </button>
            {view !== "archived" && <button onClick={() => onPin(note)} aria-label={note.pinned ? "Unpin note" : "Pin note"}
              style={{ color: note.pinned ? T.accent : T.dim }} className="nb-tap p-2 text-sm">{note.pinned ? "★" : "☆"}</button>}
            <button onClick={() => onArchive(note)} aria-label={note.archived ? "Restore note" : "Archive note"}
              style={{ fontFamily: MONO, color: T.dim }} className="nb-tap p-2 text-xs tracking-widest">{note.archived ? "RESTORE" : "ARCHIVE"}</button>
          </div>
        ))}
        {notes.length === 0 && <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic py-6 text-center">
          {view === "pinned" ? "Pin the notes worth returning to." : view === "archived" ? "Nothing archived yet." : "A blank notebook is a good place to start."}
        </p>}
      </div>
    </div>
  );
}

function NoteEditor({ T, note, onSave, onDelete, history = 0, onHistory, onPin, onArchive }) {
  /* The editor shows the same shorthand it parses, so a checklist remains a
     checklist on the next save instead of being silently flattened to prose. */
  const [v, setV] = useState(() => blocksToShorthand(note.blocks ?? []));
  const [title, setTitle] = useState(() => note.title ?? "");
  useEffect(() => {
    setV(blocksToShorthand(note.blocks ?? []));
    setTitle(note.title ?? "");
  }, [note.id]);
  const canSave = Boolean(title.trim() || v.trim());
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">{note.id ? "EDIT NOTE" : "NEW NOTE"}</span>
        <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest truncate">{noteContextLabel(note)}</span>
        {history > 0 && <button onClick={onHistory} style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest shrink-0">HISTORY · {history}</button>}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled"
        style={{ background: "transparent", borderBottom: `1px solid ${T.line}`, fontFamily: SANS, width: "100%" }} className="text-xl font-semibold py-3 mt-2" />
      <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={6} placeholder="Write it down.&#10;&#10;# Heading   - list   [ ] to-do   > quote&#10;**bold**  *italic*  `code`"
        style={{ background: "transparent", border: `1px solid ${T.line}`, fontFamily: SERIF, resize: "none", width: "100%" }} className="text-sm italic leading-relaxed p-3 mt-3" />
      {note.id && <div className="flex gap-2 mt-3">
        <button onClick={onPin} style={{ fontFamily: MONO, color: note.pinned ? T.accent : T.dim, border: `1px solid ${T.line}` }} className="nb-tap flex-1 py-2 text-xs tracking-widest">{note.pinned ? "UNPIN" : "PIN"}</button>
        <button onClick={onArchive} style={{ fontFamily: MONO, color: T.dim, border: `1px solid ${T.line}` }} className="nb-tap flex-1 py-2 text-xs tracking-widest">{note.archived ? "RESTORE" : "ARCHIVE"}</button>
      </div>}
      <div className="flex gap-2 mt-3">
        {note.id && <button onClick={onDelete} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap flex-1 py-3 text-xs tracking-widest">DELETE</button>}
        <button onClick={() => canSave && onSave(v.trim(), title.trim())} disabled={!canSave} style={{ fontFamily: MONO, background: canSave ? T.accent : "transparent", color: canSave ? T.on : T.dim, border: `1px solid ${canSave ? T.accent : T.faint}` }} className="nb-tap flex-1 py-3 text-xs font-bold tracking-widest">SAVE</button>
      </div>
    </div>
  );
}

function SearchPanel({ T, db, todayKey, onPick }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const hit = (x) => [x.title, x.note, x.place, x.text].filter(Boolean).some((f) => String(f).toLowerCase().includes(s));
    return [
      ...db.events.filter(hit).map((e) => ({ ...eventForUi(e), kind: "event" })),
      ...db.tasks.filter(hit).map(projectTaskSearchResult),
      ...searchNotes(db.notes, q).map((n) => projectNoteSearchResult(n, noteExcerpt(n, 60))),
    ].slice(0, 30);
  }, [q, db]);

  return (
    <div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything"
        style={{ background: "transparent", border: `1px solid ${T.line}` }} className="w-full px-3 py-3 text-base font-semibold" />
      <div className="mt-3 flex flex-col">
        {q && results.length === 0 && <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic py-4">Nothing matches that. Try a shorter word.</p>}
        {results.map((r) => (
          <button key={r.kind + r.id} onClick={() => onPick(r)} className="nb-row flex items-center gap-2 py-2.5 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0 w-12">{r.kind === "event" ? "EVT" : r.kind === "task" ? "ACT" : "NOTE"}</span>
            <span className="flex-1 text-sm truncate">{r.title}</span>
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{searchResultDateLabel(r, (date) => fmtDay(date).slice(4))}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({ T, initial, dateLabel, dateKey, onSubmit, onTick }) {
  const editing = !!initial.id;
  const [kind, setKind] = useState(initial.kind || "event");
  const [title, setTitle] = useState(initial.title || "");
  const [cat, setCat] = useState(initial.cat || CATS[0]);
  /* Clamped here too, so no caller — a drag that reached the bottom of the grid, an
     imported entry, a stale draft — can hand the editor a start the day has no room
     for and take the page down with it. */
  const [start, setStart] = useState(initial.start != null ? startSlot(initial.start, 1) : 540);
  const [len, setLen] = useState(initial.dur != null && initial.dur > 0 ? initial.dur : 60);
  const [xp, setXp] = useState(initial.xp || 30);
  const [place, setPlace] = useState(initial.place || "");
  const [note, setNote] = useState(initial.note || "");
  const [at, setAt] = useState(initial.at != null ? initial.at : null);
  const [due, setDue] = useState(initial.due || "");
  const [allDay, setAllDay] = useState(!!initial.allDay);
  const [endDate, setEndDate] = useState(initial.endDate || "");
  const [alerts, setAlerts] = useState(initial.alerts || []);
  const [repeat, setRepeat] = useState(initial.repeat || null);
  const [date, setDate] = useState(initial.date || dateKey);
  /* §4.7. Arriving here from a detail view's repeat row means the disclosure is
     already the reason you came, so it opens with the panel showing. */
  const [more, setMore] = useState(!!initial.openRepeat);
  /* §1.2. An action captured without a day is what makes the Inbox reachable. */
  const [unplanned, setUnplanned] = useState(initial.kind === "task" && initial.id ? !initial.date : false);
  const [timeZoneMode, setTimeZoneMode] = useState(initial.timeZoneMode || "floating");
  const [timeZone, setTimeZone] = useState(initial.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [startOffset, setStartOffset] = useState(initial.timing?.startOffset || "");
  const [endOffset, setEndOffset] = useState(initial.timing?.endOffset || "");
  /* The editor is the detail view in an editable state, so it borrows the same
     surfaces: filled rounded fields rather than outlined boxes. */
  const surface = isDark(T.bg) ? mixHex(T.card, "#FFFFFF", 0.13) : mixHex(T.card, "#000000", 0.06);
  const field = { background: surface, border: "none", borderRadius: CARD_R };
  const startLocal = `${date}T${`${pad(Math.floor(start / 60))}:${pad(start % 60)}`}`;
  const endLocal = addMinutesToLocalDateTime(startLocal, len);
  const offsetInfo = useMemo(() => {
    if (allDay || timeZoneMode !== "zoned") return { start: [], end: [], valid: true };
    try {
      const startCandidates = getOffsetCandidates(startLocal, timeZone);
      const endCandidates = getOffsetCandidates(endLocal, timeZone);
      return { start: startCandidates, end: endCandidates, valid: startCandidates.length > 0 && endCandidates.length > 0 };
    } catch { return { start: [], end: [], valid: false }; }
  }, [allDay, timeZoneMode, startLocal, endLocal, timeZone]);
  const recurrence = repeat?.freq ? {
    frequency: repeat.freq,
    interval: repeat.interval || 1,
    weekStart: 0,
    ...(repeat.freq === "weekly" ? { byWeekday: repeat.byDay || [parseKey(date).getDay()] } : {}),
    ...(repeat.freq === "monthly" && repeat.monthlyMode === "last-weekday" ? { byWeekday: [{ weekday: parseKey(date).getDay(), ordinal: -1 }] } : {}),
    ...(repeat.freq === "monthly" && repeat.monthlyMode !== "last-weekday" ? { byMonthDay: [parseKey(date).getDate()] } : {}),
    ...(repeat.freq === "yearly" ? { byMonth: [parseKey(date).getMonth() + 1], byMonthDay: [parseKey(date).getDate()] } : {}),
    ...(repeat.endMode === "count" ? { count: Math.max(1, Number(repeat.count) || 1) } : repeat.until ? { until: repeat.until } : {}),
    missingDatePolicy: repeat.missingDatePolicy || "skip",
  } : null;
  const timing = allDay
    ? { kind: "all-day", startDate: date, endDateExclusive: addDaysToKey(endDate && endDate >= date ? endDate : date, 1) }
    : {
      kind: "timed", timeZoneMode, startLocal, endLocal,
      ...(timeZoneMode === "zoned" ? {
        timeZone,
        ...(offsetInfo.start.length > 1 ? { startOffset: startOffset || offsetInfo.start[0].offset } : {}),
        ...(offsetInfo.end.length > 1 ? { endOffset: endOffset || offsetInfo.end[0].offset } : {}),
      } : {}),
    };
  const ok = title.trim().length > 0 && (allDay || offsetInfo.valid);
  const preview = useMemo(() => {
    if (kind !== "event" || !recurrence || !ok) return [];
    try {
      return previewRecurrence({ id: "preview", title: title.trim(), calendarId: "calendar-default", timing, recurrence }, 5);
    } catch { return []; }
  }, [kind, recurrence && JSON.stringify(recurrence), JSON.stringify(timing), ok]);
  const submit = () => {
    if (!ok) return;
    onSubmit({ id: initial.id, date: unplanned && kind === "task" ? null : date, unplanned, kind, title: title.trim(), cat, start: allDay ? 0 : start, dur: allDay ? 0 : len, xp, place, note, at, due: due || null, allDay, endDate, alerts, repeat: repeat && repeat.freq ? repeat : null, recurrence, timing });
  };
  const toTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fromTime = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const setFreq = (f) => { onTick(); setRepeat(f ? { freq: f, interval: 1, byDay: f === "weekly" ? [parseKey(date).getDay()] : undefined, until: (repeat && repeat.until) || "", endMode: "never", missingDatePolicy: "skip" } : null); };
  const toggleDay = (i) => {
    onTick();
    const days = (repeat.byDay || []).includes(i) ? repeat.byDay.filter((d) => d !== i) : [...(repeat.byDay || []), i].sort();
    setRepeat({ ...repeat, byDay: days });
  };

  return (
    <div>
      {!editing && (
        <div className="flex gap-1 p-1 mb-1" style={{ background: surface, borderRadius: 999 }}>
          {["event", "task"].map((k) => (
            <button key={k} onClick={() => { onTick(); setKind(k); }} className="nb-tap flex-1 py-1.5 text-xs tracking-widest"
              style={{ fontFamily: MONO, borderRadius: 999, background: kind === k ? T.accent : "transparent", color: kind === k ? T.on : T.dim, transition: "background 180ms ease, color 180ms ease" }}>
              {k === "event" ? "EVENT" : "ACTION"}
            </button>
          ))}
        </div>
      )}

      <div className={`${kind === "event" ? "text-center" : ""} pt-3 pb-4`}>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={kind === "event" ? "What's happening?" : "What gets finished?"}
          style={{ background: "transparent", border: "none" }}
          className={`w-full text-2xl font-bold tracking-tight leading-tight ${kind === "event" ? "text-center" : ""}`} />
        <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-1.5">
          {editing ? "EDITING" : dateLabel}
        </span>
      </div>

      {/* Only what the entry cannot exist without. Everything else waits behind
          "More options", so adding a thing is one decision and refining it is another. */}
      <div className="flex flex-col gap-2">
        {kind === "event" ? (
          <>
            <Chips T={T} surface={surface} value={allDay ? "all" : "timed"} onChange={(v) => { onTick(); setAllDay(v === "all"); }}
              options={[["timed", "AT A TIME"], ["all", "ALL DAY"]]} />
            {!allDay && (
              <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">FROM</span>
                <input type="time" step={60} value={toTime(start)} onChange={(e) => e.target.value && setStart(fromTime(e.target.value))}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                <span style={{ color: T.dim }} className="text-sm">&#8594;</span>
                <input type="time" step={60} value={endLocal.slice(11)} onChange={(e) => {
                  if (!e.target.value) return;
                  const proposed = `${endLocal.slice(0, 10)}T${e.target.value}`;
                  setLen(Math.max(5, localDateTimeToEpochMinutes(proposed) - localDateTimeToEpochMinutes(startLocal)));
                }} style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest ml-auto shrink-0">{dur(len)}</span>
              </div>
            )}
            {!allDay && (
              <Chips T={T} surface={surface} value={len} onChange={(v) => { onTick(); setLen(v); }}
                options={[[30, "30M"], [60, "1H"], [90, "1H30"], [120, "2H"]]} />
            )}
          </>
        ) : (
          <>
            <Chips T={T} surface={surface} value={unplanned ? "inbox" : "day"} onChange={(v) => { onTick(); setUnplanned(v === "inbox"); }}
              options={[["day", "ON A DAY"], ["inbox", "INBOX"]]} />
            {!unplanned && (
              <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">ON</span>
                <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm flex-1" />
              </div>
            )}
          </>
        )}

        <Chips T={T} surface={surface} value={cat} onChange={(v) => { onTick(); setCat(v); }}
          options={CATS.map((c) => [c, c])} dot={catColor} wrap />
      </div>

      <button onClick={() => { onTick(); setMore(!more); }}
        style={{ fontFamily: MONO, color: T.dim }} className="nb-tap w-full py-3 text-xs tracking-widest">
        {more ? "FEWER OPTIONS" : "MORE OPTIONS"}
      </button>

      <div data-more-panel style={{
        maxHeight: more ? 1600 : 0,
        opacity: more ? 1 : 0,
        overflow: "hidden",
        transition: "max-height 380ms cubic-bezier(.2,.8,.25,1), opacity 240ms ease",
      }}>
        <div className="flex flex-col gap-2 pb-1">
          {kind === "event" && allDay && (
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">THROUGH</span>
              <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)}
                style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm flex-1" />
            </div>
          )}
          {kind === "event" && !initial.instance && (
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">ON</span>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
                style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm flex-1" />
            </div>
          )}

          {kind === "event" ? (
            <>
              <Chips T={T} surface={surface} label="REMIND ME" multi value={alerts}
                onChange={(v) => { onTick(); setAlerts(v); }}
                options={ALERT_CHOICES.map((a) => [a, a === 0 ? "AT TIME" : `${a}M`])} wrap />
              <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Where"
                style={{ background: surface, border: "none", borderRadius: CARD_R }} className="w-full px-3 py-2.5 text-sm" />
            </>
          ) : (
            <>
              <Chips T={T} surface={surface} label="REWARD" value={xp} onChange={(v) => { onTick(); setXp(v); }}
                options={[[30, "+30"], [40, "+40"], [50, "+50"], [60, "+60"]]} />
              {!unplanned && (
                <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">AT</span>
                  <input type="time" step={60} value={at != null ? toTime(at) : ""} onChange={(e) => setAt(e.target.value ? fromTime(e.target.value) : null)}
                    style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0 ml-auto">DUE</span>
                  <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
                    style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                </div>
              )}
            </>
          )}

          <Chips T={T} surface={surface} label="REPEATS" value={repeat ? repeat.freq : ""}
            onChange={(v) => setFreq(v)}
            options={[["", "ONCE"], ["daily", "DAILY"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"]]} wrap />

          {repeat && (
            <div className="flex flex-col gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">EVERY</span>
                <input type="number" min={1} max={30} value={repeat.interval || 1}
                  onChange={(e) => setRepeat({ ...repeat, interval: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="w-12 text-sm" />
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">
                  {repeat.freq === "daily" ? "DAYS" : repeat.freq === "weekly" ? "WEEKS" : repeat.freq === "monthly" ? "MONTHS" : "YEARS"}
                </span>
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest ml-auto">UNTIL</span>
                <input type="date" value={repeat.until || ""} onChange={(e) => setRepeat({ ...repeat, until: e.target.value })}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
              </div>
              {repeat.freq === "weekly" && (
                <div className="flex gap-1">
                  {DAY_LETTERS.map((d, i) => {
                    const on = (repeat.byDay || []).includes(i);
                    return (
                      <button key={d} onClick={() => toggleDay(i)} className="nb-tap flex-1 py-1 text-xs tracking-widest"
                        style={{ fontFamily: MONO, borderRadius: 999, background: on ? T.accent : "transparent", color: on ? T.on : T.dim, border: `1px solid ${on ? T.accent : T.line}` }}>{d[0]}</button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Notes"
            style={{ background: surface, border: "none", borderRadius: CARD_R, fontFamily: SERIF, resize: "none" }}
            className="w-full px-3 py-2.5 text-sm italic" />
        </div>
      </div>

      <button onClick={submit} disabled={!ok} className="nb-tap w-full py-3 mt-2 text-xs font-bold tracking-widest"
        style={{ fontFamily: MONO, borderRadius: CARD_R, background: ok ? T.accent : surface, color: ok ? T.on : T.dim, border: "none", transition: "background 180ms ease" }}>
        {editing ? "SAVE CHANGES" : kind === "event" ? "ADD TO TIMELINE" : "ADD ACTION"}
      </button>
    </div>
  );
}

/* One chip row, one shape. Mixing pills with boxed fields makes unrelated controls
   look like different kinds of thing, so everything selectable here is a pill. */
function Chips({ T, surface, label, value, onChange, options, multi = false, wrap = false, dot = null }) {
  const selected = (key) => (multi ? (value ?? []).includes(key) : value === key);
  const pick = (key) => {
    if (!multi) return onChange(key);
    const set = new Set(value ?? []);
    if (set.has(key)) set.delete(key); else set.add(key);
    onChange([...set].sort((a, b) => a - b));
  };
  return (
    <div>
      {label && <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mb-1">{label}</span>}
      <div className={`flex gap-1 ${wrap ? "flex-wrap" : ""}`}>
        {options.map(([key, text]) => {
          const on = selected(key);
          return (
            <button key={String(key)} onClick={() => pick(key)}
              className={`nb-tap ${wrap ? "" : "flex-1"} inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs tracking-widest`}
              style={{
                fontFamily: MONO, borderRadius: 999,
                background: on ? T.accent : surface,
                color: on ? T.on : T.dim,
                transition: "background 180ms ease, color 180ms ease, transform 120ms ease",
              }}>
              {dot && <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: on ? T.on : dot(key) }} />}
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
