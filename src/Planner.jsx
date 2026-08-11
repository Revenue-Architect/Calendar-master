import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import * as storage from "./storage.js";
import {
  appendBlock as appendNoteBlock,
  blocksToShorthand,
  blocksToText,
  createNote as createNoteCommand,
  deleteNoteWithAttachments,
  dropRevisionsFor,
  getDailyNote,
  getNotebookNotes,
  getNotesForEntity,
  isEmptyNote,
  markBlockExtracted,
  migrateV6ToV7,
  migrateV7ToV8,
  noteExcerpt,
  parseInline,
  plainText,
  recordRevision,
  removeBlock as removeNoteBlock,
  restoredNote,
  restoreDeletedNoteWithAttachments,
  revisionIsIntact,
  revisionsFor,
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
  smartViewCounts,
  completeTask as completeTaskCommand,
  countOpen,
  createTask as createTaskCommand,
  deferTask as deferTaskCommand,
  getBlockedTasks,
  getDayTasks,
  getSubtasksOf,
  getTaskBlockers,
  moveTaskToList,
  renameTaskList,
  getUpcomingRange,
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
  projectPlannerSearch,
  resolvePlannerSearchPick,
  searchResultDateLabel,
} from "./features/search/searchProjection.js";
import { QUICK_ADD_SYNTAX, describeQuickAdd, parseQuickAdd, quickAddToEntry } from "./features/planner/quickAdd.js";
import { matchCommands } from "./features/planner/commandPalette.js";
import { getDayTasksWithCarry } from "./features/planner/carryForward.js";
import { planOverdueForToday, pullableOverdue } from "./features/planner/overduePull.js";
import { AUTO_COMPLETE_DELAY_MS, autoCompleteStillValid, togglesLastOpenStep } from "./features/planner/autoComplete.js";
import { recordBackupDismissed, recordBackupTaken, shouldPromptBackup } from "./features/planner/backupReminder.js";
import {
  gestureChangedAnything,
  isResizable,
  movedEnoughToCancelHold,
  proposeGesture,
} from "./features/planner/timelineGesture.js";
import { loadBackupRecord, saveBackupRecord } from "./platform/persistence/backupStore.js";
import { textToNoteBlocks } from "./features/notes/noteText.js";
import { eventNoteLink, taskNoteLink } from "./features/notes/contextLink.js";
import {
  focusDialogOnOpen, restoreDialogFocus, trapDialogTab,
} from "./features/accessibility/dialogFocus.js";
import {
  applyBulkTaskAction,
  createTaskMutationUndoPayload,
  deleteTaskFromPlannerState,
  restoreDeletedTaskInPlannerState,
  restoreTaskPlannedDates,
} from "./features/planner/taskMutations.js";
import { resolveTaskForInspection } from "./features/planner/taskInspection.js";
import { projectPlannerDay } from "./features/planner/dayProjection.js";
import { findOpenSlots } from "./features/planner/slotSearch.js";
import { busyFractionForDay, projectDayPeek, projectPlannerWeek } from "./features/planner/weekProjection.js";
import {
  applyDetailDraft,
  buildDetailEntryPayload,
  buildTaskWritePatch,
  durationFromClockRange,
  durationFromDatedClockRange,
  hasDetailDraft,
} from "./features/planner/detailDraft.js";
import { progressSegmentStates } from "./features/motion/progressGeometry.js";
import {
  fluidMorphFromRects,
  fluidPillBox,
  fluidPillStretch,
} from "./features/motion/fluidGeometry.js";
import {
  deliverReminder,
  dismissReminder,
  getDueReminders,
  getReminderIntents,
  reconcileReminders,
  snoozeReminder,
} from "./domains/reminders/index.js";
import { loadReminderRecords, saveReminderRecords } from "./platform/persistence/reminderStore.js";
import { loadPreferences, savePreferences } from "./platform/persistence/preferencesStore.js";
import { loadDiagnostics, saveDiagnostics } from "./platform/persistence/diagnosticsStore.js";
import {
  createDiagnosticsLedger,
  recordDiagnostic,
  shouldRecordStorageDiagnostic,
  storageDiagnosticOperation,
} from "./platform/diagnostics/diagnostics.js";
import { preferencesFromLegacyState } from "./platform/preferences/preferences.js";
import {
  awardTaskCompletion,
  createMotivationLedger,
  getMotivationSummary,
  reverseLatestTaskAward,
} from "./domains/gamification/index.js";
import { loadMotivationLedger, saveMotivationLedger } from "./platform/persistence/gamificationStore.js";
import {
  createEvent as createCalendarEvent,
  deleteEvent as deleteCalendarEvent,
  getVisibleOccurrencesForRange,
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

/* §4.6/§4.7. The frequencies an entry can be set to from its own detail view. The
   fuller rule — selected weekdays, an end date, a count — still belongs to the
   composer, which has the room to explain it. */
const REPEATS = [["never", "NEVER"], ["daily", "DAILY"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"]];

/* Changing the frequency keeps whatever else the rule already said, so switching
   weekly → monthly and back does not quietly drop an end date. */
function repeatFor(freq, current, dateKey) {
  if (!freq || freq === "never") return null;
  return {
    ...(current ?? {}),
    freq,
    interval: current?.interval || 1,
    byDay: freq === "weekly" ? (current?.byDay ?? [parseKey(dateKey).getDay()]) : undefined,
    until: current?.until || "",
    endMode: current?.endMode || "never",
    missingDatePolicy: current?.missingDatePolicy || "skip",
  };
}

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
/* How close the now marker has to get to an hour before that hour's label steps
   aside. The marker and a label are each about eighteen pixels tall, so inside
   this distance they overlap and read as one smudged mark rather than two
   times — and at that distance the marker *is* the hour, so there is nothing
   the label was still saying. */
const NOW_LABEL_CLEARANCE_MIN = Math.round((18 / HOUR_H) * 60);
const DAY_H = HOUR_H * 24;
const HOLD_MS = 420;
const LIFT_MS = 300;
const SNAP = 5;
const NOW_RED = "#C43A56";
const ALERT_CHOICES = [0, 5, 15, 30, 60];
const DAY_LETTERS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/* Every shortcut the keydown handler implements, in one list, because a shortcut
   nobody can find is a shortcut nobody has. The cheat sheet renders this rather
   than a second hand-written copy, so the two cannot drift apart. */
const SHORTCUTS = [
  { group: "MOVING", keys: ["←", "→"], does: "Previous / next day" },
  { group: "MOVING", keys: ["T"], does: "Jump to today" },
  { group: "MOVING", keys: ["["], does: "Zoom out — day, week, month" },
  { group: "MOVING", keys: ["]"], does: "Zoom in" },
  { group: "MAKING", keys: ["N"], does: "New event" },
  { group: "MAKING", keys: ["A"], does: "New action" },
  { group: "MAKING", keys: ["⌘K", "/"], does: "Search, run a command, or type to create" },
  { group: "ACTIONS", keys: ["C"], does: "Complete the first open action" },
  { group: "ACTIONS", keys: ["D"], does: "Defer the first open action by a day" },
  { group: "ELSEWHERE", keys: ["⌘Z"], does: "Undo the last change" },
  { group: "ELSEWHERE", keys: ["?"], does: "This list" },
  { group: "ELSEWHERE", keys: ["Esc"], does: "Close whatever is open" },
];

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
const buzzDevice = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
/* Sheets morph open from the control that opened them. Focus alone cannot always
   say which control that was — iOS Safari does not focus a tapped button — so the
   last pressed trigger is remembered here and consulted when a sheet mounts. */
let lastFluidTrigger = null;
let lastFluidTriggerAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (event) => {
    const el = event.target instanceof Element
      ? event.target.closest("button,[role='button'],summary,label,[data-event-id],[data-task-chip]")
      : null;
    if (el) { lastFluidTrigger = el; lastFluidTriggerAt = Date.now(); }
  }, true);
}
function recentFluidTriggerRect() {
  if (!lastFluidTrigger || !lastFluidTrigger.isConnected) return null;
  if (Date.now() - lastFluidTriggerAt > 1200) return null;
  const rect = lastFluidTrigger.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}
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

/* A meeting link is stored as a full URL. Bare domains get https:// prefixed;
   anything that still fails to parse as http(s) yields "" so a Join affordance is
   never rendered around a link it could not open. */
const normalizeMeetingLink = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".")) return url.href;
  } catch { /* not a URL */ }
  return "";
};

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
    /* A page turning is two brushes and a sweep: the sheet lifts, brightens as it
       passes the fold, and dulls as it lands. A flat noise burst through a fixed
       bandpass — which is what this was — is a hiss; the moving filter is the
       whole difference between "paper" and "static". */
    const paper = (secs, gain) => {
      const len = Math.max(1, Math.floor(c.sampleRate * secs));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const lift = Math.pow(1 - t, 1.6);
        const land = 0.8 * Math.exp(-Math.pow((t - 0.55) / 0.11, 2));
        d[i] = (Math.random() * 2 - 1) * (lift + land) * 0.6;
      }
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(1500, t0);
      bp.frequency.exponentialRampToValueAtTime(4200, t0 + secs * 0.45);
      bp.frequency.exponentialRampToValueAtTime(950, t0 + secs);
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
      case "page": paper(0.22, 0.3); tone("sine", 150, 78, 0.05, 0.045); break;
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
      { id: uid(), date: k(-28), title: "Standup", start: 690, dur: 25, cat: "PEOPLE", place: "Video", link: "https://meet.google.com/nbp-demo-standup", note: "", repeat: { freq: "weekly", interval: 1, byDay: [1, 2, 3, 4, 5] }, alerts: [5] },
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
  const [zoom, setZoom] = useState("day");
  const [dateKey, setDateKey] = useState(keyOf(new Date()));
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [sheet, setSheet] = useState(false);
  const [inspect, setInspect] = useState(null);
  const [composer, setComposer] = useState(null);
  const [noteEdit, setNoteEdit] = useState(null);
  const [noteHistory, setNoteHistory] = useState(null);
  /* The details sheet has a deliberate reading state and an editing state. The
     record stays in place; only its controls and compact action pill change. */
  const [detailEditing, setDetailEditing] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  /* Pending record-field edits stay outside canonical planner state. */
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    setDraft(null);
    setDetailEditing(false);
    setDiscardAsk(false);
  }, [inspect?.id, inspect?.kind]);
  const [notebook, setNotebook] = useState(null);
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [shortcuts, setShortcuts] = useState(false);
  const [backupRecord, setBackupRecord] = useState(null);
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
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(null);
  const [smartView, setSmartView] = useState("today");
  const [dependencyPicker, setDependencyPicker] = useState(null);
  const [listManager, setListManager] = useState(false);
  const [viewMode, setViewMode] = useState("timeline");
  const [actionsOpen, setActionsOpen] = useState(() => {
    try {
      const stored = window.localStorage.getItem("nbmp:ui:actionsOpen");
      return stored == null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem("nbmp:ui:actionsOpen", String(actionsOpen)); } catch { /* UI preference is best-effort. */ }
  }, [actionsOpen]);
  /* Week view's "find a slot": a chosen duration highlights the next open gaps. */
  const [slotDur, setSlotDur] = useState(null);
  /* Month peek: press-and-hold (or a long hover) on a month day opens its agenda
     in a morph sheet without leaving month view. */
  const [peekDay, setPeekDay] = useState(null);
  const [listPicker, setListPicker] = useState(null);
  const [selection, setSelection] = useState(null);
  const [firstRun, setFirstRun] = useState(false);
  const [reminderRecords, setReminderRecords] = useState([]);
  const [remindersReady, setRemindersReady] = useState(false);
  const [preferences, setPreferences] = useState(null);
  const [motivationLedger, setMotivationLedger] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsSaveBlocked, setDiagnosticsSaveBlocked] = useState(false);
  const [preferencesSaveBlocked, setPreferencesSaveBlocked] = useState(false);
  const [motivationSaveBlocked, setMotivationSaveBlocked] = useState(false);
  const [storageFailures, setStorageFailures] = useState(() => new Set(storage.writable ? [] : ["device"]));

  const stripRef = useRef(null);
  const activeRef = useRef(null);
  const streamRef = useRef(null);
  const listRef = useRef(null);
  const saveT = useRef(null);
  const reminderSaveT = useRef(null);
  const preferencesSaveT = useRef(null);
  const motivationSaveT = useRef(null);
  const diagnosticsSaveT = useRef(null);
  const undoT = useRef(null);
  const prevLevel = useRef(null);
  const pinch = useRef(null);
  const swipeRef = useRef(null);
  const holdRef = useRef(null);
  const gestureRef = useRef(null);
  const tappedRef = useRef(false);
  const monthHoldT = useRef(null);
  const monthHeldRef = useRef(false);
  const monthHoverT = useRef(null);

  const storageBad = storageFailures.size > 0;
  const reportStorage = useCallback((scope, failed, errorCode = "write-failed") => {
    setStorageFailures((current) => {
      const next = new Set(current);
      if (failed) next.add(scope); else next.delete(scope);
      return next;
    });
    if (shouldRecordStorageDiagnostic(scope, failed)) {
      setDiagnostics((current) => current ? recordDiagnostic(current, {
        id: `diag-${uid()}`,
        category: "storage",
        operation: storageDiagnosticOperation(scope),
        occurredAt: new Date().toISOString(),
        appVersion: "0.1.0",
        schemaVersion: 8,
        correlationId: `local-${uid()}`,
        errorCode,
      }) : current);
    }
  }, []);

  useEffect(() => { gestureRef.current = gesture; }, [gesture]);
  /* The last lane layout computed while nothing was being dragged — see `events`. */
  const laneFreeze = useRef(null);
  const startGesture = (g) => { gestureRef.current = g; setGesture(g); };
  const endGesture = () => { gestureRef.current = null; setGesture(null); };

  useEffect(() => {
    let dead = false;
    (async () => {
      let state;
      let isFirstRun = false;
      let nextDiagnostics = createDiagnosticsLedger();
      try {
        const loaded = await loadDiagnostics(storage);
        nextDiagnostics = loaded.ledger;
        if (loaded.initialized) await saveDiagnostics(storage, nextDiagnostics);
        reportStorage("diagnostics", false);
      } catch {
        /* Do not overwrite a malformed diagnostics ledger on startup. The normal
           save effect stays blocked, and `reportStorage` deliberately does not
           create a diagnostic about this diagnostic-store failure. */
        setDiagnosticsSaveBlocked(true);
        reportStorage("diagnostics", true, "read-failed");
      }
      try {
        const loaded = await loadPlannerState(storage);
        state = loaded.state || migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(seed()))));
        if (!loaded.state) await savePlannerState(storage, state);
        isFirstRun = !loaded.state;
        reportStorage("planner", false);
      } catch (error) {
        /* Either the device can't be written to, or what's already stored is
           unreadable. Open a fresh notebook in memory so the app is still usable —
           without it `ready` flips while `db` stays null and the loader never
           clears — but leave autosave off. Overwriting here would seed straight over
           data that is damaged rather than gone, and export stays the way out. */
        state = migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(seed()))));
        setSaveBlocked(true);
        reportStorage("planner", true, "read-failed");
      }
      let nextPreferences = preferencesFromLegacyState(state);
      let nextLedger = createMotivationLedger({ openingBalance: state.xp ?? 0 });
      try {
        const loaded = await loadPreferences(storage, state);
        nextPreferences = loaded.preferences;
        if (loaded.initialized) await savePreferences(storage, nextPreferences);
        reportStorage("preferences", false);
      } catch {
        setPreferencesSaveBlocked(true);
        reportStorage("preferences", true, "read-failed");
      }
      try {
        const loaded = await loadMotivationLedger(storage, { openingBalance: state.xp ?? 0 });
        nextLedger = loaded.ledger;
        if (loaded.initialized) await saveMotivationLedger(storage, nextLedger);
        reportStorage("motivation", false);
      } catch {
        setMotivationSaveBlocked(true);
        reportStorage("motivation", true, "read-failed");
      }
      /* Knowing nothing about past backups is a fine state to be in — it only
         means the nudge may ask once more than it needed to. */
      let nextBackup = null;
      try {
        nextBackup = (await loadBackupRecord(storage)).record;
      } catch { nextBackup = null; }
      /* A brand-new notebook opens on someone else's week. The sample is useful for
         judging the app and confusing as your own planner, so the first run asks
         rather than assuming. */
      if (!dead) {
        setDb(state);
        setPreferences(nextPreferences);
          setMotivationLedger(nextLedger);
        setBackupRecord(nextBackup);
        setDiagnostics(nextDiagnostics);
        setFirstRun(isFirstRun);
        setReady(true);
      }
    })();
    return () => { dead = true; };
  }, [reportStorage]);

  useEffect(() => { if (ready) { const r = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(r); } }, [ready]);

  useEffect(() => {
    if (!ready || !db || saveBlocked) return;
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      savePlannerState(storage, db).then(() => reportStorage("planner", false), () => reportStorage("planner", true));
    }, 400);
    return () => clearTimeout(saveT.current);
  }, [db, ready, reportStorage, saveBlocked]);

  /* §2.1. Reminder delivery state is a separate local aggregate. A damaged ledger
     must never block the canonical notebook from opening, so it starts empty and
     is reconstructed from source intent rather than overwriting planner content. */
  useEffect(() => {
    if (!ready) return undefined;
    let dead = false;
    loadReminderRecords(storage)
      .then((records) => { if (!dead) setReminderRecords(records); })
      .catch(() => { if (!dead) reportStorage("reminders", true, "read-failed"); })
      .finally(() => { if (!dead) setRemindersReady(true); });
    return () => { dead = true; };
  }, [ready, reportStorage]);

  useEffect(() => {
    if (!remindersReady || saveBlocked) return undefined;
    clearTimeout(reminderSaveT.current);
    reminderSaveT.current = setTimeout(() => {
      saveReminderRecords(storage, reminderRecords).then(() => reportStorage("reminders", false), () => reportStorage("reminders", true));
    }, 400);
    return () => clearTimeout(reminderSaveT.current);
  }, [reminderRecords, remindersReady, saveBlocked, reportStorage]);

  useEffect(() => {
    if (!preferences || preferencesSaveBlocked) return undefined;
    clearTimeout(preferencesSaveT.current);
    preferencesSaveT.current = setTimeout(() => {
      savePreferences(storage, preferences).then(() => reportStorage("preferences", false), () => reportStorage("preferences", true));
    }, 200);
    return () => clearTimeout(preferencesSaveT.current);
  }, [preferences, preferencesSaveBlocked, reportStorage]);

  useEffect(() => {
    if (!motivationLedger || motivationSaveBlocked) return undefined;
    clearTimeout(motivationSaveT.current);
    motivationSaveT.current = setTimeout(() => {
      saveMotivationLedger(storage, motivationLedger).then(() => reportStorage("motivation", false), () => reportStorage("motivation", true));
    }, 200);
    return () => clearTimeout(motivationSaveT.current);
  }, [motivationLedger, motivationSaveBlocked, reportStorage]);

  useEffect(() => {
    if (!diagnostics || diagnosticsSaveBlocked) return undefined;
    clearTimeout(diagnosticsSaveT.current);
    diagnosticsSaveT.current = setTimeout(() => {
      saveDiagnostics(storage, diagnostics).then(
        () => reportStorage("diagnostics", false),
        () => reportStorage("diagnostics", true),
      );
    }, 200);
    return () => clearTimeout(diagnosticsSaveT.current);
  }, [diagnostics, diagnosticsSaveBlocked, reportStorage]);

  useEffect(() => {
    if (!backupRecord) return;
    saveBackupRecord(storage, backupRecord).catch(() => { /* best effort: the nudge is not worth blocking on */ });
  }, [backupRecord]);

  useEffect(() => { const i = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(i); }, []);

  const T = useMemo(() => THEMES.find((t) => t.id === preferences?.display.themeId) || THEMES[0], [preferences]);
  const beep = useSynth(preferences?.feedback.sound ?? true);
  const buzz = useCallback((pattern) => {
    if (preferences?.feedback.haptics) buzzDevice(pattern);
  }, [preferences]);
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
  /* Full-screen Actions replaces the day surface, so there is no surface left to
     reserve room in — and the sheet it would reserve for is hidden in that mode. */
  const sheetPad = viewMode === "actions" ? "0px" : (sheet ? "76dvh" : "64px");
  const clock = preferences?.display.clock ?? "12";
  /* Both switches mean the same thing to motion: the in-app preference and the
     OS one. The global CSS kill-switch handles animation and transition, but a
     filter is neither, so components that mount one ask directly. */
  const reducedMotion = Boolean(preferences?.display.reducedMotion)
    || (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
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
  /* Fingerprinting a few hundred kilobytes is ~1ms, but there is no reason to do
     it on every keystroke: the decision only changes when the notebook or the
     day does. */
  const askForBackup = useMemo(() => (
    db && backupRecord ? shouldPromptBackup({ state: db, record: backupRecord, today: todayKey }) : false
  ), [db, backupRecord, todayKey]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const searchProjection = useMemo(() => projectPlannerSearch(db, {
    query: searchQuery, todayDate: todayKey,
  }), [db, searchQuery, todayKey]);
  const nowLocal = addMinutesToLocalDateTime(`${todayKey}T00:00`, nowMin);
  const isToday = dateKey === todayKey;
  const activeDate = parseKey(dateKey);
  const ov = (db && db.overrides) || {};

  /* Which weekday a week opens on. A display preference like the clock: it moves
     columns, never records. Everything that lays out a week — the month grid and
     its header letters, the week view's first column, and the weekly recurrence
     rule's own `weekStart` — reads this one value, so they cannot disagree. */
  const weekStart = preferences?.display.weekStart ?? 0;
  const backToWeekStart = useCallback((day) => -(((day - weekStart) + 7) % 7), [weekStart]);
  const weekdayOrder = useMemo(
    () => Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7),
    [weekStart],
  );

  const days = useMemo(() => { const s = addDays(new Date(), -2); return Array.from({ length: 14 }, (_, i) => addDays(s, i)); }, [todayKey]);
  const monthGrid = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const start = addDays(first, backToWeekStart(first.getDay()));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthCursor, backToWeekStart]);

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
    /* The agenda is a surface someone reads, so it goes through the visibility
       projection like every other one — a hidden, archived or disconnected
       calendar is as absent here as it is on the day, the week and the month.
       See .agents/memory/calendar-read-projections.md. */
    const events = getVisibleOccurrencesForRange(db, start, end, { segments: true }).map(eventForUi);
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

  /* The true week: 7 columns from the Sunday of the selected day's week. Reads go
     through the calendar domain's visible-occurrence projection, so a hidden or
     inactive calendar is as absent here as everywhere else. */
  const weekStartKey = useMemo(
    () => keyOf(addDays(activeDate, backToWeekStart(activeDate.getDay()))),
    [dateKey, backToWeekStart],
  );
  const week = useMemo(() => (db ? projectPlannerWeek(db, {
    weekStart: weekStartKey,
    mapEvent: eventForUi,
  }) : []), [db, weekStartKey]);

  /* "Find a slot" reads free/busy through the calendar domain's availability
     projection plus timed actions as blockers — see slotSearch.js. */
  const slotMatches = useMemo(() => (db && slotDur ? findOpenSlots(db, {
    fromDate: todayKey,
    currentMinute: nowMin,
    durationMinutes: slotDur,
  }) : []), [db, slotDur, todayKey, nowMin]);

  /* §1.1. The visible day is composed once from the three source domains. The
     timeline still owns its layout and gestures, but it no longer reimplements
     domain queries independently from Actions, notes, and briefing. */
  const dayProjection = useMemo(() => (db ? projectPlannerDay(db, {
    selectedDate: dateKey,
    todayDate: todayKey,
    currentMinute: nowMin,
    mapEvent: eventForUi,
  }) : null), [db, dateKey, todayKey, nowMin]);
  const dayEvents = dayProjection?.events ?? [];
  const timed = useMemo(() => dayEvents.filter((e) => !e.allDay), [dayEvents]);
  const allDay = useMemo(() => dayEvents.filter((e) => e.allDay), [dayEvents]);
  /* The day's own planned work, plus the undated backlog that has not been
     given a day yet — see carryForward.js. An action with no date is not an
     action for no day; it is work still owed, so it stands on today and on every
     day ahead until it is done or decided about. */
  const dayTasks = useMemo(
    () => (db ? getDayTasksWithCarry(db, dateKey, { todayDate: todayKey }) : []),
    [db, dateKey, todayKey],
  );
  const notes = dayProjection?.notes ?? [];
  const openCount = countOpen(dayTasks);

  /* §5.5 and §9.3 now decide this: a one-off task is overdue once its deadline has
     passed, and a series contributes only what its missed-occurrence policy still
     considers owed — nothing at all under the default `skip`. */
  const overdue = dayProjection?.overdue ?? [];
  const deadlines = dayProjection?.deadlines ?? [];

  const blockedIds = useMemo(() => {
    if (!db) return new Set();
    return new Set(getBlockedTasks(db.tasks).map((task) => task.id));
  }, [db]);

  const events = useMemo(() => {
    const g = gesture;
    const dragging = g && (g.mode === "move" || g.mode === "resize-end" || g.mode === "resize-start");
    const list = timed.map((e) => (dragging && g.id === e.id ? { ...e, start: g.start, dur: g.dur } : e));
    const packed = packEventLanes(list);
    /* Lanes are frozen for the duration of a drag. Repacking every frame means the
       cards *around* the one being moved slide sideways as it passes them, so the
       timeline reflows under a hand that is only trying to put one thing down —
       and the card being dragged changes width mid-gesture, which reads as the
       app fighting the gesture. The columns settle once, on drop, when there is a
       result worth showing. */
    if (!dragging) {
      laneFreeze.current = new Map(packed.map((e) => [e.id, { lane: e.lane, cols: e.cols }]));
      return packed;
    }
    const frozen = laneFreeze.current;
    if (!frozen) return packed;
    return packed.map((e) => (frozen.has(e.id) ? { ...e, ...frozen.get(e.id) } : e));
  }, [timed, gesture]);

  const motivation = useMemo(() => (motivationLedger
    ? getMotivationSummary(motivationLedger, {
      todayDate: todayKey,
      controls: preferences?.motivation,
    })
    : { points: null, level: null, levelProgress: null, streak: null }), [motivationLedger, preferences, todayKey]);
  const level = motivation.level;
  const levelPct = motivation.levelProgress == null ? 0 : motivation.levelProgress * 100;
  const streak = motivation.streak;

  useEffect(() => {
    if (level != null && preferences?.motivation.celebrations && prevLevel.current !== null && level > prevLevel.current) {
      beep("levelup"); buzz([12, 40, 12]);
      setLevelFlash(level);
      const t = setTimeout(() => setLevelFlash(null), 2400);
      prevLevel.current = level;
      return () => clearTimeout(t);
    }
    prevLevel.current = level;
  }, [level, preferences, beep, buzz]);

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
    /* `zoom` belongs here: changing it rebuilds the surface above the day, which
       remounts the stream with a scrollTop of zero. Without it, zooming out to the
       month and back left the day sitting at midnight — eight hours above anything
       the day actually contains — and the only clue was an empty grid. */
  }, [ready, dateKey, turn, zoom]);

  const mutate = (fn) => setDb((d) => (d ? fn({ ...d }) : d));

  /* §2.1–2.5. Calendar and Tasks describe intent. The ledger resolves, preserves,
     and controls delivery without rewriting either source record. */
  useEffect(() => {
    if (!db || !remindersReady) return;
    const intents = getReminderIntents(db, { now: nowLocal });
    const horizonEnd = `${addDaysToKey(todayKey, 14)}T00:00`;
    setReminderRecords((records) => {
      const next = reconcileReminders(records, intents, { now: nowLocal, horizonEnd });
      return JSON.stringify(next) === JSON.stringify(records) ? records : next;
    });
  }, [db, remindersReady, nowLocal, todayKey]);

  useEffect(() => {
    if (!db || !remindersReady || alertToast) return;
    const due = getDueReminders(reminderRecords, nowLocal, { limit: 3 });
    const reminder = due[0];
    if (!reminder) return;
    setReminderRecords((records) => deliverReminder(records, reminder.id, { now: nowLocal }));
    beep("alert"); buzz([10, 60, 10]);
    setAlertToast({ title: reminder.title, body: reminder.body, reminderId: reminder.id, k: uid() });
    try {
      if (preferences?.notifications.systemEnabled && "Notification" in window && Notification.permission === "granted") {
        new Notification(reminder.title, { body: reminder.body });
      }
    } catch (err) {}
  }, [db, preferences, remindersReady, reminderRecords, nowLocal, alertToast, beep, buzz]);

  const askNotifs = async () => {
    try {
      if (!("Notification" in window)) return;
      const p = await Notification.requestPermission();
      setPreferences((current) => current ? {
        ...current,
        notifications: { ...current.notifications, systemEnabled: p === "granted" },
      } : current);
      beep(p === "granted" ? "commit" : "abort");
    } catch (e) {}
  };

  const snoozeAlert = () => {
    if (!alertToast?.reminderId) return;
    const until = addMinutesToLocalDateTime(nowLocal, 10);
    setReminderRecords((records) => snoozeReminder(records, alertToast.reminderId, { now: nowLocal, until }));
    setAlertToast(null); beep("tick");
  };

  const dismissAlert = () => {
    if (!alertToast?.reminderId) return;
    setReminderRecords((records) => dismissReminder(records, alertToast.reminderId, { now: nowLocal }));
    setAlertToast(null); beep("click");
  };

  const densityOf = useCallback((d) => {
    if (!db) return 0;
    const k = keyOf(d);
    return getVisibleOccurrencesForRange(db, k, addDaysToKey(k, 1)).length + getDayTasks(db, k).filter((t) => t.status !== "completed").length;
  }, [db, ov]);

  /* Booked minutes inside the 6:00–22:00 working window, as a fraction of it —
     the month view's free/busy signal, read through the calendar domain's
     availability projection. */
  const busyFractionOf = useCallback((d) => (db ? busyFractionForDay(db, keyOf(d)) : 0), [db]);

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
        || firstRun || confirmComplete || dependencyPicker || listPicker || pendingImport || peekDay
        || shortcuts) return;
      if (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); setSearchQuery(""); setSearch(true); return; }
      if (search) return;
      /* The shortcuts have to be discoverable from the keyboard they belong to. */
      if (e.key === "?") { e.preventDefault(); beep("click"); setShortcuts(true); return; }
      if (e.key === "[") { e.preventDefault(); zoomOut(); }
      if (e.key === "]") { e.preventDefault(); zoomIn(); }
      if (e.key === "ArrowRight") goDay(1);
      if (e.key === "ArrowLeft") goDay(-1);
      if (e.key === "t" || e.key === "T") jumpTo(todayKey);
      /* N and A open a sheet whose first field autofocuses. Without
         preventDefault the same keystroke then lands in that field, so the
         composer opened with "n" already typed into the title. */
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setComposer({ kind: "event", start: startSlot(nowMin), dur: 60 }); }
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
      if (e.key === "a" || e.key === "A") { e.preventDefault(); setComposer({ kind: "task" }); }
      if ((e.key === "z" && (e.metaKey || e.ctrlKey)) && undo) { e.preventDefault(); runUndo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    /* `zoom` is in here because the handler closes over `zoomIn`/`zoomOut`, which
       read it — without it, `[` and `]` would step from whatever zoom the page
       had when the listener was last attached. */
  }, [dateKey, inspect, composer, settings, noteEdit, noteHistory, notebook, search, scopeAsk, goDay, todayKey, nowMin, dayTasks, undo, firstRun, confirmComplete, dependencyPicker, listPicker, pendingImport, peekDay, shortcuts, zoom]);

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
  const taskRewardSource = (id) => {
    const { seriesId, occurrenceDate } = parseTaskOccurrenceId(id);
    return { domain: "task", entityId: seriesId, occurrenceId: occurrenceDate ?? null };
  };
  const awardCompletion = (id, task, awardId = uid()) => {
    if (!preferences?.motivation.points || !task?.reward) return null;
    const source = taskRewardSource(id);
    setMotivationLedger((ledger) => ledger ? awardTaskCompletion(ledger, {
      id: awardId,
      source,
      amount: task.reward,
      occurredAt: nowStamp(),
      planningDate: todayKey,
    }) : ledger);
    return source;
  };
  const reverseTaskReward = (id) => {
    const source = taskRewardSource(id);
    setMotivationLedger((ledger) => ledger ? reverseLatestTaskAward(ledger, source, {
      id: uid(), occurredAt: nowStamp(),
    }) : ledger);
    return source;
  };

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
      /* A caller may pre-pick the detached id when it needs to address the
         detached task right after this write — e.g. the checklist tick that
         completes the whole action. */
      const detachedId = intent.detachedId ?? uid();
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
    const rewardSource = awardCompletion(id, t);
    if (rewardSource && preferences?.motivation.celebrations) {
      setReward({ xp: t.reward, k: uid() });
      setTimeout(() => setReward(null), 900);
    }
    writeTask(id, (state, taskId) => completeTaskCommand(state.tasks, taskId, {
      now: new Date().toISOString().slice(0, 16),
      override: true,
    }), { completed: true });
    /* §10.3. Completion is the most-used action and fires from a 420ms hold, so it
       is the one that most needs a way back. */
    flash("Completed", { type: "task-complete", id, rewardSources: rewardSource ? [rewardSource] : [] });
    setConfirmComplete(null);
  };
  /* The last-step auto-complete fires after a beat of delay, so it goes through a
     render-fresh ref AND revalidates before acting: 420ms is long enough to untick
     the step, and a completion must honour what is true when it fires, not what
     was true when it was scheduled. */
  const autoCompleteRef = useRef(null);
  autoCompleteRef.current = (id) => {
    if (!autoCompleteStillValid(findTask(id))) return;
    completeTask(id);
  };
  const reopenTask = (id) => {
    const t = findTask(id);
    if (!t || t.status !== "completed") return;
    beep("click");
    writeTask(id, (state, taskId) => reopenTaskCommand(state.tasks, taskId), { reopened: true });
    reverseTaskReward(id);
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
  /* A week drag moves an event on both axes at once, which the day timeline
     never had to do: `moveToDay` keeps the time and the day-view drag keeps the
     day. This writes both in one command, through the same occurrence-vs-series
     split every other calendar write uses, so a dragged instance of a repeating
     event still detaches into an exception rather than dragging the series. */
  const moveEventTo = (item, { date, start }) => {
    if (!item || !isDateKey(date)) return;
    beep("drop"); buzz(8);
    const canonical = canonicalOccurrenceIdentity(item.id);
    const label = `Moved to ${fmtDay(date)} ${tm(start)}`;
    if (canonical) {
      const result = moveOccurrence(db, item.id, eventTimingFromPosition(item, date, start, item.dur), { id: uid() });
      setDb(result.state);
      flash(label, { type: "restore-calendar-occurrence", snapshot: result.removed });
      return;
    }
    const scope = splitId(item.id).date ? "occurrence" : "series";
    mutate((d) => moveCalendarEvent(d, item.id, { date, start }, { scope }).state);
    flash(label, {
      type: "calendar-event-move",
      id: item.id,
      target: { date: item.date, start: item.start },
      scope,
    });
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
  /* PLAN TODAY. The decision of what can actually move, and the state transition
     that moves it, both live in features/planner/overduePull.js so they can be
     asserted without a render — including the awkward case, a missed occurrence
     of an accumulating series, whose id is not a row any command can find. */
  const pullOverdue = () => {
    const entries = pullableOverdue(overdue, todayKey);
    if (!entries.length) return;
    beep("schedule");
    const before = structuredClone(db);
    mutate((d) => planOverdueForToday(d, entries, todayKey, { makeId: uid }).state);
    flash(`${entries.length} planned for today`, { type: "restore-planner-state", snapshot: { state: before } });
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
  /* Dropping an action on the timeline says two things at once: this day, and
     this time. The domain deliberately refuses a time without a day — a minute
     with no date is not a plan — so an action that has never been given a day
     (a carried one, straight out of capture) is planned onto the day in view in
     the same write. Without this, the most natural gesture on a carried action
     is the one that throws. */
  const scheduleTask = (id, at) => {
    beep("schedule"); buzz(8);
    writeTask(id, (state, taskId) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (at != null && task && task.planned.date == null) {
        return planTaskCommand(state.tasks, taskId, {
          date: dateKey,
          startMinute: at,
          estimateMinutes: task.planned.estimateMinutes ?? null,
        });
      }
      return scheduleTaskCommand(state.tasks, taskId, at);
    });
  };
  /* An estimate is how much of the day an action is expected to take, so on the
     timeline it *is* the height of its block. Dragging that height is the most
     direct sentence available for "this is going to take longer than I thought" —
     and it is the same gesture the events beside it already answer to. */
  const estimateTask = (id, minutes) => {
    const before = structuredClone(db);
    buzz(6);
    writeTask(id, (state, taskId) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) return { tasks: state.tasks };
      return planTaskCommand(state.tasks, taskId, {
        date: task.planned.date ?? dateKey,
        startMinute: task.planned.startMinute ?? null,
        estimateMinutes: minutes,
      });
    });
    flash(`Estimate ${dur(minutes)}`, { type: "restore-planner-state", snapshot: { state: before } });
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
  const patchChecklist = (taskId, next, intent = {}) => {
    writeTask(taskId, (state, id) => updateTaskCommand(state.tasks, id, {
      checklist: next(state.tasks.find((t) => t.id === id).checklist ?? []),
    }), intent);
  };
  const toggleSub = (taskId, subId) => {
    beep("tick");
    /* §8.2 extended: ticking the last open step finishes the action itself,
       through the same completion flow as the hold — XP, streak, sound and the
       blocker confirmation all included. Only the check transition triggers it;
       unchecking a step never quietly reopens a completed parent. */
    const lastStep = togglesLastOpenStep(findTask(taskId), subId);
    /* Editing a series occurrence detaches it (§9.5); pre-picking the detached id
       lets the delayed completion find the task this very tick creates. */
    const { occurrenceDate } = parseTaskOccurrenceId(taskId);
    const detachedId = lastStep && occurrenceDate ? uid() : null;
    patchChecklist(taskId, (checklist) => checklist.map((step) => (
      step.id === subId
        ? { ...step, done: !step.done, completedAt: step.done ? null : nowStamp() }
        : step
    )), detachedId ? { detachedId } : {});
    if (lastStep) {
      /* The beat of delay lets the tick and the progress bar land before the card
         completes; the ref revalidates at fire time, so unticking within the delay
         cancels the completion. */
      setTimeout(() => autoCompleteRef.current?.(detachedId ?? taskId), AUTO_COMPLETE_DELAY_MS);
    }
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
  const setList = (taskId, listId) => {
    beep("tick");
    if (listPicker?.draft) {
      editEntry({ listId });
      setListPicker(null);
      return;
    }
    const seriesId = parseTaskOccurrenceId(taskId).seriesId;
    mutate((d) => ({ ...d, tasks: moveTaskToList(d.tasks, seriesId, listId, d.taskLists).tasks }));
    setListPicker(null);
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
    const rewardSources = action === "complete"
      ? result.completedIds.flatMap((id) => {
        const { seriesId } = parseTaskOccurrenceId(id);
        const task = before.tasks.find((entry) => entry.id === seriesId);
        return awardCompletion(id, task) ? [taskRewardSource(id)] : [];
      })
      : [];
    beep(failed.length ? "abort" : "commit");
    flash(
      failed.length
        ? `${done} of ${ids.length} — ${failed.length} ${failed[0].reason === "blocked" ? "blocked" : "refused"}`
        : `${done} ${action === "delete" ? "deleted" : action === "complete" ? "completed" : action === "tag" ? "tagged" : action === "priority" ? "reprioritised" : "moved"}`,
      done ? { type: "restore-planner-state", snapshot: { state: before }, rewardSources } : null,
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
      /* A reward records a completed action, not the continued existence of its
         task. Deleting a completed task therefore preserves its historical award. */
      setDb(result.state);
      setInspect(null); setScopeAsk(null);
      flash(result.removed.kind === "occurrence" ? "This one skipped" : "Deleted", {
        type: "restore-task-deletion",
        removed: result.removed,
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
    const removedAttachments = kind === "note"
      ? (db.noteAttachments ?? []).filter((attachment) => attachment.noteId === base)
      : [];
    mutate((d) => {
      if (kind !== "note" || !removed) return d;
      const deletion = deleteNoteWithAttachments(d.notes, d.noteAttachments ?? [], base);
      return {
        ...d,
        notes: deletion.notes,
        noteAttachments: deletion.noteAttachments,
        noteRevisions: dropRevisionsFor(d.noteRevisions, [base]),
      };
    });
    setInspect(null); setNoteEdit(null); setNoteHistory(null); setScopeAsk(null);
    flash("Deleted", {
      type: "restore", kind, item: removed, revisions: removedRevisions, attachments: removedAttachments,
    });
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
    if (p.rewardSources?.length) {
      setMotivationLedger((ledger) => p.rewardSources.reduce((next, source) => reverseLatestTaskAward(next, source, {
        id: uid(), occurredAt: nowStamp(),
      }), ledger));
    }
    mutate((d) => {
      if (p.type === "restore" && p.item) {
        if (p.kind === "note") {
          const restored = restoreDeletedNoteWithAttachments(
            d.notes,
            d.noteAttachments ?? [],
            { note: p.item, attachments: p.attachments ?? [] },
          );
          d.notes = restored.notes;
          d.noteAttachments = restored.noteAttachments;
          /* revisionsFor hands back newest-first; the store keeps them oldest-first
             so the head it compares against is the latest one. */
          if (p.revisions?.length) {
            d.noteRevisions = [...(d.noteRevisions ?? []), ...[...p.revisions].sort((a, b) => a.revision - b.revision)];
          }
        }
      }
      if (p.type === "restore-task-deletion" && p.removed) {
        return restoreDeletedTaskInPlannerState(d, p.removed);
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
      ? { title: p.title, start: p.start, dur: p.dur, cat: p.cat, place: p.place, note: p.note, link: normalizeMeetingLink(p.link) || String(p.link || "").trim(), allDay: p.allDay, endDate: p.endDate || null, repeat: p.repeat, recurrence: p.recurrence, timing: p.timing, alerts: p.alerts }
      : buildTaskWritePatch(p, dateKey);
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
    if (p.inline) {
      setDraft(null);
      setDetailEditing(false);
    } else {
      setComposer(null);
      setInspect(null);
    }
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
  const entryPayload = (kind, item) => buildDetailEntryPayload(kind, item, dateKey);

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
  const exportJson = () => {
    download(`planner-${todayKey}.json`, JSON.stringify(db, null, 2), "application/json");
    /* Exporting *is* the backup, however the user got here — from Settings, from
       the storage warning, or from the nudge. All three should quiet it. */
    setBackupRecord((current) => recordBackupTaken(current, { state: db, today: todayKey }));
  };
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
      if (normalizeMeetingLink(e.link)) lines.push(`URL:${normalizeMeetingLink(e.link)}`);
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
    setDb(createBlankPlannerState());
    setReminderRecords([]);
    setMotivationLedger(createMotivationLedger());
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
  const plannedRef = useRef([]);
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
    /* The arithmetic itself lives in features/planner/timelineGesture.js, shared
       with the week grid. What stays here is only the part that is genuinely
       about this surface: where the pointer is and what it is over. */
    if (g.mode === "move" && !overDay) {
      next.start = proposeGesture("move", { pointerMinute: m, grab: g.grab, duration: g.dur }).start;
    } else if (g.mode === "resize-end" || g.mode === "task-resize" || g.mode === "draft") {
      next.dur = proposeGesture("resize-end", { start: g.start, pointerMinute: m, kind: g.kind }).duration;
    } else if (g.mode === "resize-start") {
      /* Measured from where the gesture began, not from the last frame, so a
         chain of roundings can never walk the end of the block away. */
      const resized = proposeGesture("resize-start", {
        start: g.was.start, duration: g.was.dur, pointerMinute: m, kind: g.kind,
      });
      next.start = resized.start;
      next.dur = resized.duration;
    }
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
    } else if (g.mode === "resize-end" || g.mode === "resize-start") {
      /* A drag that lands where it started is not a change: no write, no undo
         entry, no toast. The difference between "I put it back" and "I changed my
         mind" is invisible to the person and should be invisible to the record. */
      if (!gestureChangedAnything(
        { start: g.was.start, duration: g.was.dur },
        { start: g.start, duration: g.dur },
      )) return;
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
        mutate((d) => {
          /* Dragging the top edge changes where the block starts as well as how
             long it is. Two commands, one gesture — and the move goes first so a
             block growing upward is never briefly long enough to hit midnight. */
          const moved = g.start === g.was.start
            ? d
            : moveCalendarEvent(d, g.id, { start: g.start }, { scope }).state;
          return resizeCalendarEvent(moved, g.id, g.dur, { scope }).state;
        });
        flash(`Set to ${dur(g.dur)}`, { type: "event-time", id: g.id, start: g.was.start, dur: g.was.dur, scope });
      }
    } else if (g.mode === "task-resize") {
      if (g.dur === g.was.dur) return;
      beep("drop");
      estimateTask(g.id, g.dur);
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
  /* A press that travels before it lifts was never a press. Without this the hold
     timer keeps running while the pointer moves, so pressing a card and dragging
     across the timeline lifts it 300ms later under a cursor that has already left
     it — the same defect the week grid had. Both surfaces now arm on press and
     disarm on movement, so they behave identically. */
  const armedRef = useRef(null);
  const disarmHold = useCallback(() => {
    clearTimeout(holdRef.current);
    holdRef.current = null;
    armedRef.current = null;
  }, []);
  const armHold = (x, y, fire) => {
    disarmHold();
    armedRef.current = { x, y };
    holdRef.current = setTimeout(() => { armedRef.current = null; fire(); }, LIFT_MS);
  };
  useEffect(() => {
    const move = (e) => {
      const armed = armedRef.current;
      if (!armed || gestureRef.current) return;
      if (movedEnoughToCancelHold(armed, { x: e.clientX, y: e.clientY })) {
        disarmHold();
        tappedRef.current = false;
      }
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [disarmHold]);

  const canvasDown = (e) => {
    if (e.button === 2 || e.pointerType === "touch") return;
    const startMin = snapTo(minutesAt(e.clientY));
    tappedRef.current = true;
    armHold(e.clientX, e.clientY, () => {
      tappedRef.current = false;
      beep("lift"); buzz(12);
      startGesture({ mode: "draft", start: startMin, dur: 30 });
    });
  };
  const canvasUp = (e) => {
    if (e.pointerType === "touch") return;
    disarmHold();
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
    const { clientX, clientY } = e;
    tappedRef.current = true;
    armHold(clientX, clientY, () => {
      tappedRef.current = false;
      beep("lift"); buzz(14);
      startGesture({ mode: "move", kind: "event", id: ev.id, start: ev.start, dur: ev.dur, grab, was: { start: ev.start, dur: ev.dur }, x: clientX, y: clientY });
    });
  };
  const eventUp = (e, ev) => {
    if (e.pointerType === "touch") return;
    disarmHold();
    if (gestureRef.current) return;
    if (tappedRef.current) { tappedRef.current = false; e.stopPropagation(); beep("click"); setInspect({ kind: "event", id: ev.id }); }
  };
  /* `edge` is which end of the block the hand has hold of: the bottom moves the
     end and the top moves the start, and in both cases the *other* end is what
     the person is holding still in their head. */
  const resizeDown = (e, ev, edge = "end", kind = "event") => {
    if (e.pointerType === "touch") return;
    e.stopPropagation();
    disarmHold();
    tappedRef.current = false;
    beep("lift");
    startGesture({
      mode: kind === "task" ? "task-resize" : `resize-${edge}`,
      kind, id: ev.id, start: ev.start, dur: ev.dur, was: { start: ev.start, dur: ev.dur },
    });
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
        const handleId = node.getAttribute("data-resize");
        const edge = node.getAttribute("data-resize-edge") || "end";
        const ev = eventsRef.current.find((x) => x.id === handleId);
        const chip = ev ? null : plannedRef.current.find((x) => x.id === handleId);
        if (ev || chip) {
          beep("lift"); buzz(10);
          const block = ev
            ? { start: ev.start, dur: ev.dur }
            : { start: chip.planned.startMinute, dur: chip.planned.estimateMinutes };
          startGesture({
            mode: ev ? `resize-${edge}` : "task-resize",
            kind: ev ? "event" : "task",
            id: handleId, ...block, was: { ...block }, x: t.clientX, y: t.clientY,
          });
        }
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

  /* Toasts and inline confirmations hold their content for one beat after they are
     dismissed, so they can animate out instead of vanishing on the spot. */
  const [undoShown, undoLeaving] = usePresence(undo);
  const [alertShown, alertLeaving] = usePresence(alertToast);
  const [levelShown, levelLeaving] = usePresence(levelFlash);
  const [pendingImportShown] = usePresence(pendingImport, 320);

  if (!ready || !db) {
    return (
      <div style={{ background: THEMES[0].bg, color: THEMES[0].dim, fontFamily: MONO, minHeight: "100vh" }} className="flex items-center justify-center text-xs tracking-widest">
        OPENING THE NOTEBOOK
      </div>
    );
  }

  eventsRef.current = events;
  dateKeyRef.current = dateKey;
  /* The actions that have a time on the day, mirrored for the native touch
     listeners — same reason as `eventsRef`: they must never read a stale list. */
  const plannedTasks = dayTasks.filter((t) => t.planned.startMinute != null);
  plannedRef.current = plannedTasks;

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
  /* §4.6. Edits are held as a draft rather than written field by field. Two reasons,
     and the second is the important one: a change you can see pending is a change
     you can see landed, and a recurring entry asks its scope question once for the
     whole batch instead of once per field — editing a title, a time and a category
     used to mean answering it three times. */
  const editEntry = (patch) => {
    if (!inspect || !inspectItem) return;
    setDraft((current) => ({ ...(current ?? {}), ...patch }));
    /* §4.6. Touching a field is what starts editing — the pill follows the record
       into its editing state rather than gatekeeping it. */
    setDetailEditing(true);
  };
  const beginDetailEdit = (element = null) => {
    setDetailEditing(true);
    if (!(element instanceof HTMLElement)) return;
    window.setTimeout(() => {
      if (!element.isConnected) return;
      const reduced = preferences?.display?.reducedMotion
        || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }, 280);
  };

  /* The record as it currently reads, draft included, so the view shows what will
     be saved rather than what is stored. */
  const inspectDraft = draft && inspectItem
    ? applyDetailDraft(inspect.kind, inspectItem, draft, dateKey)
    : inspectItem;

  const commitDraft = (pending = draft) => {
    if (!inspect || !inspectItem || !hasDetailDraft(pending)) {
      setDetailEditing(false);
      return false;
    }
    const next = { ...entryPayload(inspect.kind, inspectItem), ...pending, inline: true };
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
      } catch (error) {
        /* §4.7. A zoned time landing in a DST gap or fold cannot be resolved without
           being asked which offset is meant, and that question belongs to the
           composer. Handing over silently is what made editing feel unpredictable —
           the same gesture sometimes opened a whole form with no explanation — so
           the handover says why, and the edit is carried into it rather than lost.

           Only ambiguity hands over. Anything else is a fault, and dressing a fault
           up as "here is the editor" hides it. */
        if (!(error instanceof RangeError)) throw error;
        beep("abort");
        flash("That clock time is ambiguous here — pick an offset", null);
        setComposer({ ...next, inline: undefined, openRepeat: true });
        setDraft(null);
        setDetailEditing(false);
        setInspect(null);
        return true;
      }
    }
    saveEntry(next);
    return true;
  };
  const closeInspector = () => {
    beep("click");
    if (hasDetailDraft(draft)) {
      setDiscardAsk(true);
      return false;
    }
    setDetailEditing(false);
    return true;
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

  /* ─── the palette ───
     One input over the things you have and the things you can do. Everything is
     computed plainly rather than in a hook: this block sits below the loading
     guard, and it only runs while the palette is actually open. */
  const closePalette = () => { setSearch(false); setSearchQuery(""); };
  const runCommand = (fn) => () => { beep("click"); closePalette(); fn(); };
  const quickDraft = search ? parseQuickAdd(searchQuery, { todayDate: todayKey, lists: db.taskLists }) : null;

  const commitQuickAdd = () => {
    const entry = quickAddToEntry(quickDraft, { fallbackDate: dateKey, defaultCategory: CATS[0] });
    if (!entry) return;
    closePalette();
    /* If the line named a day, go there, so what was just created is on screen
       rather than filed somewhere the user has to go looking for. */
    if (entry.kind === "event" && entry.date !== dateKey) jumpTo(entry.date);
    saveEntry(entry);
  };
  /* Anything short of committable opens the composer holding whatever did parse,
     so an unrecognised line costs a click rather than the typing. */
  const openComposerFromQuery = () => {
    closePalette();
    const draft = quickDraft;
    if (!draft) { setComposer({ kind: "event", start: startSlot(nowMin), dur: 60 }); return; }
    if (draft.date && draft.date !== dateKey) jumpTo(draft.date);
    setComposer(draft.kind === "event"
      ? { kind: "event", title: draft.title, start: draft.startMinute ?? startSlot(nowMin), dur: draft.durationMinutes ?? 60 }
      : { kind: "task", title: draft.title, due: draft.deadline ?? null, at: draft.startMinute ?? null });
  };

  const paletteCommands = [
    { id: "new-event", label: "New event", keywords: ["create", "add", "meeting"], run: runCommand(() => setComposer({ kind: "event", start: startSlot(nowMin), dur: 60 })) },
    { id: "new-action", label: "New action", keywords: ["create", "add", "task", "todo"], run: runCommand(() => setComposer({ kind: "task" })) },
    { id: "jump-today", label: "Jump to today", keywords: ["now"], run: runCommand(() => jumpTo(todayKey)) },
    { id: "view-day", label: "Day view", keywords: ["timeline", "zoom"], run: runCommand(() => { setViewMode("timeline"); setZoom("day"); }) },
    { id: "view-week", label: "Week view", keywords: ["zoom", "7"], run: runCommand(() => { setViewMode("timeline"); setZoom("week"); }) },
    { id: "view-month", label: "Month view", keywords: ["zoom", "grid"], run: runCommand(() => { setViewMode("timeline"); setMonthCursor(activeDate); setZoom("month"); }) },
    { id: "view-agenda", label: "Agenda view", keywords: ["list", "upcoming"], run: runCommand(() => setViewMode("agenda")) },
    { id: "switch-theme", label: "Switch theme", keywords: ["dark", "light", "colour", "color", "appearance"], run: runCommand(() => {
      const next = THEMES[(THEMES.findIndex((theme) => theme.id === T.id) + 1) % THEMES.length];
      setPreferences((current) => current ? { ...current, display: { ...current.display, themeId: next.id } } : current);
      flash(next.name.toUpperCase());
    }) },
    { id: "toggle-clock", label: `Switch to ${clock === "24" ? "12" : "24"}-hour clock`, keywords: ["time format", "24", "12"], run: runCommand(() => {
      setPreferences((current) => current ? { ...current, display: { ...current.display, clock: current.display.clock === "24" ? "12" : "24" } } : current);
    }) },
    { id: "toggle-week-start", label: `Start weeks on ${weekStart === 1 ? "Sunday" : "Monday"}`, keywords: ["week start", "monday", "sunday"], run: runCommand(() => {
      setPreferences((current) => current ? { ...current, display: { ...current.display, weekStart: current.display.weekStart === 1 ? 0 : 1 } } : current);
    }) },
    { id: "shortcuts", label: "Keyboard shortcuts", keywords: ["keys", "help", "?"], run: runCommand(() => setShortcuts(true)) },
    { id: "settings", label: "Settings", keywords: ["preferences", "export", "import"], run: runCommand(() => setSettings(true)) },
  ];

  const paletteRows = [];
  if (quickDraft?.title) {
    paletteRows.push({
      key: "quick-add",
      group: "CREATE",
      testId: "palette-quick-add",
      badge: quickDraft.kind === "event" ? "EVT" : "ACT",
      tint: T.accent,
      label: describeQuickAdd(quickDraft, {
        formatDate: (date) => fmtDay(date).slice(4),
        formatTime: (minute) => tm(minute),
        formatDuration: (minutes) => dur(minutes),
      }),
      meta: "⏎",
      run: commitQuickAdd,
    });
  }
  if (searchQuery.trim()) {
    paletteRows.push({
      key: "open-composer",
      group: "CREATE",
      testId: "palette-open-composer",
      badge: "FORM",
      label: quickDraft?.title ? `Open the composer for “${quickDraft.title}”` : "Open the composer",
      run: openComposerFromQuery,
    });
  }
  for (const command of matchCommands(paletteCommands, searchQuery)) {
    paletteRows.push({
      key: `cmd-${command.id}`,
      group: "DO",
      testId: `palette-cmd-${command.id}`,
      badge: "CMD",
      label: command.label,
      run: command.run,
    });
  }
  for (const result of searchProjection.results) {
    paletteRows.push({
      key: `${result.kind}-${result.id}`,
      group: "FIND",
      testId: "palette-result",
      badge: result.kind === "event" ? "EVT" : result.kind === "task" ? "ACT" : "NOTE",
      label: result.title,
      meta: searchResultDateLabel(result, (date) => fmtDay(date).slice(4)),
      run: () => {
        const pick = resolvePlannerSearchPick(db, result, { todayDate: todayKey });
        closePalette();
        if (pick.status !== "available") { flash("SEARCH RESULT UNAVAILABLE"); return; }
        if (pick.date) jumpTo(pick.date);
        if (pick.noteId) {
          const note = db.notes.find((entry) => entry.id === pick.noteId);
          if (note) setNoteEdit(note);
          return;
        }
        /* Let the palette finish closing before the inspector morphs open, or
           the two sheets animate over each other. */
        if (pick.inspect) setTimeout(() => setInspect(pick.inspect), 60);
      },
    });
  }

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
      todayKey={todayKey} gesture={gesture} onPullOverdue={pullOverdue} beep={beep} buzz={buzz}
      onComplete={completeTask} onReopen={reopenTask} onDefer={deferTask}
      onInspect={(id) => setInspect({ kind: "task", id })} onToggleSub={toggleSub} onAddSub={addSub} onRemoveSub={removeSub}
      onDragStart={(id, x, y) => {
        if (viewMode === "actions") return;
        startGesture({ mode: "task", kind: "task", id, x, y }); setSheet(false); buzz(6); beep("lift");
      }}
      onAddTask={() => { beep("click"); setComposer({ kind: "task" }); }}
      onCollapse={viewMode === "actions" ? null : () => setActionsOpen(false)}
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
        /* A touch browser zooms the whole viewport when it focuses a field whose
           text is under 16px, and every sheet here autofocuses one. Standalone
           the viewport meta suppresses it; embedded, the host writes <head> and
           it does not — so the fix belongs on the fields themselves. Desktop
           keeps the small type; a coarse pointer gets 16px, which is easier to
           hit anyway. */
        @media (pointer: coarse){
          input,textarea,select,[contenteditable="true"]{font-size:16px}
        }
        .nb-s::-webkit-scrollbar{width:5px;height:5px}
        .nb-s::-webkit-scrollbar-thumb{background:${T.faint};border-radius:999px}
        .nb-s::-webkit-scrollbar-track{background:transparent}
        /* A scrollbar is drawn in the padding box, which is square, so on a panel
           with a 24px radius it runs straight through the curve and reads as a
           sliver sitting outside the sheet. Holding the track back past the
           corners keeps the whole bar inside the shape it belongs to. */
        .nb-sheet-scroll::-webkit-scrollbar-track{margin:22px 0}
        .nb-sheet-scroll{scrollbar-width:thin;scrollbar-color:${T.faint} transparent}
        .nb-x::-webkit-scrollbar{display:none}
        .nb-x{-ms-overflow-style:none;scrollbar-width:none}
        /* The page is exactly one viewport tall at every width, so the day surface
           flexes into the space that is left instead of stopping at an arbitrary
           cap partway down a large screen. Each pane scrolls inside itself. */
        .nb-root{height:100dvh;overflow:hidden}
        .nb-main{padding-bottom:var(--sheet-pad);transition:padding-bottom 260ms cubic-bezier(.2,.8,.25,1)}
        @media(min-width:1024px){.nb-main{padding-bottom:2rem}}
        .nb-stream{flex:1 1 auto;min-height:0}
        .nb-tap{transition:transform 90ms ease,opacity 120ms ease}
        .nb-tap:active{transform:scale(0.96)}
        /* A stamp hides its native control, so the focus it takes has to be drawn
           on the wrapper instead — otherwise a keyboard user sees nothing. */
        .nb-stamp{transition:box-shadow 160ms ease}
        .nb-stamp:focus-within{box-shadow:0 1px 0 0 ${T.accent}}
        .nb-row:hover{background:${T.faint}55}
        .nb-cell{transition:opacity 420ms cubic-bezier(.2,.7,.3,1),transform 420ms cubic-bezier(.2,.7,.3,1)}
        .nb-page{transform-origin:left center;backface-visibility:hidden}
        /* A day arrives from the side it came from, and it arrives quickly.
           This used to be a rotateY through a 1400px perspective — a page-flip
           mime that read as cheap for the same reason stock 3D transitions
           always do: the day is not a physical sheet, and pretending it is
           draws attention to the effect instead of to the day. A fast slide
           says the same thing (you moved, this way) in a quarter of a second
           and then gets out of the way. The paper sound carries the metaphor;
           the motion just needs to be direction and speed. */
        .nb-turn-next{animation:turnnext 240ms cubic-bezier(.22,.9,.28,1)}
        @keyframes turnnext{0%{opacity:.4;transform:translate3d(6%,0,0)}55%{opacity:1}100%{opacity:1;transform:translate3d(0,0,0)}}
        .nb-turn-prev{animation:turnprev 240ms cubic-bezier(.22,.9,.28,1)}
        @keyframes turnprev{0%{opacity:.4;transform:translate3d(-6%,0,0)}55%{opacity:1}100%{opacity:1;transform:translate3d(0,0,0)}}
        .nb-up{animation:nbup 200ms cubic-bezier(.2,.9,.3,1.1)}
        @keyframes nbup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        /* Every menu and sheet is the same material as the control that opened it.
           When a trigger can be measured the surface grows from that exact pill;
           first-run and system sheets use the bottom-sheet fallback. */
        .nb-fluid{animation:nbfluid 420ms cubic-bezier(.22,1.12,.28,1);transform-origin:bottom center;border-radius:24px 24px 0 0;will-change:transform,opacity,border-radius}
        @keyframes nbfluid{
          0%{opacity:0;transform:translateY(26px) scale(.965)}
          55%{opacity:1}
          100%{opacity:1;transform:translateY(0) scale(1)}
        }
        .nb-fluid[data-fluid-origin="trigger"]{animation-name:nbfluidorigin;transform-origin:center}
        @keyframes nbfluidorigin{
          0%{opacity:.25;transform:translate(var(--fluid-x),var(--fluid-y)) scale(var(--fluid-sx),var(--fluid-sy));border-radius:999px}
          52%{opacity:1}
          100%{opacity:1;transform:translate(0,0) scale(1);border-radius:24px}
        }
        .nb-fluid.nb-fluid-closing{animation:nbfluidout 240ms cubic-bezier(.4,0,.4,1) forwards;pointer-events:none}
        .nb-fluid.nb-fluid-closing[data-fluid-origin="trigger"]{animation-name:nbfluidoriginout;animation-duration:300ms}
        @keyframes nbfluidout{0%,30%{opacity:1}100%{opacity:0;transform:translateY(12px) scale(.97);border-radius:30px}}
        /* The exit retraces the entry. It used to travel a quarter of the way back
           and stop at scale(.88), so a sheet that flew out of its card drifted
           vaguely downward on the way out — the two halves of one gesture did not
           describe the same path. Same distance, same scale, reversed. */
        @keyframes nbfluidoriginout{
          0%{opacity:1;transform:translate(0,0) scale(1);border-radius:24px}
          70%{opacity:1}
          100%{opacity:0;transform:translate(var(--fluid-x),var(--fluid-y)) scale(var(--fluid-sx),var(--fluid-sy));border-radius:999px}
        }
        /* The notch morph: one object changing shape, rather than a panel fading
           in. The shape never fades — it travels and stretches from the pill at
           full opacity, so the eye follows a thing moving instead of watching
           one image replaced by another. The body is held back until the shape
           has most of its size, and on the way out it leaves first, so the
           panel is empty by the time it folds back into the button. */
        .nb-fluid[data-fluid-origin="notch"]{animation-name:nbnotchin;animation-duration:380ms}
        @keyframes nbnotchin{
          0%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y)) scale(var(--fluid-sx),var(--fluid-sy));border-radius:999px}
          100%{opacity:1;transform:translate(0,0) scale(1);border-radius:24px}
        }
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body{animation:nbnotchbody 260ms ease 130ms both}
        @keyframes nbnotchbody{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"]{animation:nbnotchout 260ms cubic-bezier(.4,0,.3,1) forwards}
        @keyframes nbnotchout{
          0%{opacity:1;transform:translate(0,0) scale(1);border-radius:24px}
          100%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y)) scale(var(--fluid-sx),var(--fluid-sy));border-radius:999px}
        }
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-notch-body{animation:nbnotchbodyout 140ms ease forwards}
        @keyframes nbnotchbodyout{to{opacity:0;transform:translateY(6px)}}
        @media(min-width:640px){.nb-fluid{transform-origin:center;border-radius:24px}}
        /* The blur is set once and never animated. A changing blur radius throws
           away the compositor's cached backdrop every frame and re-blurs the whole
           viewport — the most expensive thing on screen, running underneath the
           sheet's own morph, which is what made the first open of a session stutter
           while that pipeline warmed up. Fading the scrim's opacity fades the blur
           in with it, so it costs one blur instead of eighteen and looks the same. */
        .nb-scrim{animation:nbscrim 300ms ease forwards;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
        @keyframes nbscrim{from{opacity:0}to{opacity:1}}
        .nb-scrim.nb-fluid-closing{animation:nbscrimout 240ms ease forwards}
        @keyframes nbscrimout{0%,25%{opacity:1}100%{opacity:0}}
        .nb-sheet-h{transition:height 320ms cubic-bezier(.2,.8,.25,1)}
        .nb-edit-actions{transition:width 420ms cubic-bezier(.22,1.12,.28,1),background-color 260ms ease,box-shadow 260ms ease}
        .nb-edit-liquid{transition:left 420ms cubic-bezier(.22,1.12,.28,1)}
        .nb-edit-face{transition:opacity 200ms ease,transform 420ms cubic-bezier(.22,1.12,.28,1)}
        /* A multi-select pill has no single selection to slide, so its fill grows in
           and shrinks out with the same spring the traveling pill uses. */
        .nb-chip-fill{transition:transform 320ms cubic-bezier(.2,1.4,.3,1),opacity 200ms ease}
        /* Toasts leave the way they came instead of vanishing on the frame they are
           dismissed. */
        .nb-toast-out{animation:nbtoastout 200ms cubic-bezier(.4,0,.65,1) forwards;pointer-events:none}
        @keyframes nbtoastout{to{opacity:0;transform:translateY(14px) scale(.96)}}
        /* The mobile sheet's spring overshoots its resting place; the extension below
           keeps the overshoot from showing a gap under the bottom edge. */
        .nb-msheet::after{content:"";position:absolute;top:100%;left:0;right:0;height:40px;background:inherit}
        .nb-detail-editor{animation:nbrise 300ms cubic-bezier(.22,1.12,.28,1)}
        /* A primary action gets a little more weight under the finger than a
           secondary one — the difference is felt before it is read. */
        .nb-liquid{transition:scale 260ms cubic-bezier(.2,1.6,.35,1),box-shadow 260ms ease}
        .nb-liquid:active{scale:.94;transition:scale 90ms cubic-bezier(.4,0,.6,1)}
        .nb-rise{animation:nbrise 260ms cubic-bezier(.22,1.12,.28,1)}
        @keyframes nbrise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .nb-p{animation:nbp 620ms cubic-bezier(.1,.7,.3,1) forwards}
        @keyframes nbp{from{opacity:1;transform:translate(0,0) scale(1)}to{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.2)}}
        .nb-rw{animation:nbrw 900ms cubic-bezier(.2,.8,.3,1) forwards}
        @keyframes nbrw{0%{opacity:0;transform:translateY(20px) scale(.8)}25%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-52px) scale(1)}}
        .nb-blink{animation:nbb 2s ease-in-out infinite}
        @keyframes nbb{0%,100%{opacity:1}50%{opacity:.4}}
        button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,
        [data-event-id]:focus-visible,[data-task-chip]:focus-visible{outline:2px solid ${T.accent};outline-offset:2px}
        input,textarea,select{color:${T.text}}
        input::placeholder,textarea::placeholder{color:${T.dim}}

        /* ── Press ──────────────────────────────────────────────────────────────
           Everything you can press answers the press. This is set on the elements
           themselves rather than a class on 123 call sites, so a control added
           later is never silently dead to the touch.

           It animates the standalone \`scale\` property, not \`transform\`. Cards are
           positioned, dragged and paged with transforms, and animating one
           transform against another is exactly what made the page swipe judder —
           \`scale\` composites on its own and cannot fight them. */
        button,[role="button"],summary,label[for],[data-event-id],[data-task-chip]{
          -webkit-tap-highlight-color:transparent;touch-action:manipulation;
          transition:scale 240ms cubic-bezier(.2,1.5,.35,1),background-color 200ms ease,color 200ms ease,box-shadow 220ms ease,opacity 160ms ease;
        }
        /* Down is quick and linear, release overshoots and settles — the difference
           between the two is what reads as a physical thing rather than a fade. */
        button:active,[role="button"]:active,summary:active,[data-event-id]:active,[data-task-chip]:active{
          scale:.965;transition:scale 90ms cubic-bezier(.4,0,.6,1);
        }
        button:disabled,button[disabled]{scale:1!important}
        @media(hover:hover){
          [data-event-id]:hover,[data-task-chip]:hover{scale:1.006}
        }
        /* A control that completes something pops rather than just filling in. */
        .nb-pop{animation:nbpop 380ms cubic-bezier(.2,1.6,.35,1)}
        @keyframes nbpop{0%{scale:1}35%{scale:1.28}100%{scale:1}}

        @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}
          button:active,[role="button"]:active,[data-event-id]:active,[data-task-chip]:active{scale:1!important}}
        ${preferences?.display.reducedMotion ? `*{animation:none!important;transition:none!important}
          button:active,[role="button"]:active,[data-event-id]:active,[data-task-chip]:active{scale:1!important}` : ""}
      `}</style>

      {/* ══ HUD ══ */}
      <header style={{ background: T.bg, borderBottom: `1px solid ${T.line}` }} className="sticky top-0 z-30 px-3 sm:px-5 py-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          {level != null && <>
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">LVL</span>
            <span style={{ fontFamily: MONO }} className="text-sm font-bold">{level}</span>
            <div style={{ background: T.faint }} className="w-14 h-1 mx-1"><div style={{ background: T.accent, width: `${levelPct}%` }} className="h-full" /></div>
          </>}
          {streak != null && streak > 0 && <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{streak}d</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { jumpTo(todayKey); setMonthCursor(new Date()); }} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap px-2 py-1 text-xs tracking-widest">TODAY</button>
          <button onClick={() => { beep("click"); setNotebook("all"); }} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap px-2 py-1 text-xs tracking-widest">NOTES</button>
          <GooeySearch T={T} surface={surface} reduced={reducedMotion}
            onOpen={() => { beep("click"); setSearchQuery(""); setSearch(true); }} />
          <button onClick={() => { beep("click"); setSettings(true); }} style={{ color: T.dim }} className="nb-tap w-8 h-8 text-sm" aria-label="Settings">⋯</button>
          <button data-test="new-entry" onClick={() => { beep("click"); setComposer({ kind: "event", start: startSlot(nowMin), dur: 60, notch: true }); }} style={{ background: T.accent, color: T.on, fontFamily: MONO }} className="nb-tap nb-liquid px-2 py-1.5 text-xs font-bold tracking-widest">NEW</button>
        </div>
      </header>

      {/* ══ NAVIGATOR ══ */}
      <div onTouchStart={onTouchStartNav} onTouchMove={onTouchMoveNav} style={{ borderBottom: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between px-3 sm:px-5 py-1.5">
          <button data-test="zoom-out" onClick={zoomOut} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap text-xs tracking-widest" disabled={zoom === "month"}>
            {zoom === "day" ? "◂ WEEK" : zoom === "week" ? "◂ MONTH" : `${MO[monthCursor.getMonth()]} ${monthCursor.getFullYear()}`}
          </button>
          <div className="flex items-center gap-2">
            {/* Timeline answers "when, and for how long"; agenda answers "what is
                coming". Same days, same data, two questions. */}
            <PillNav T={T} ariaLabel="View mode" value={viewMode}
              options={[["timeline", "TIMELINE"], ["agenda", "AGENDA"], ["actions", "ACTIONS"]]}
              onPick={(mode) => { beep("tick"); setViewMode(mode); if (mode === "actions") setSheet(false); }}
              style={{ border: `1px solid ${T.line}` }} />
            {zoom === "month" && (
              <>
                <button onClick={() => { beep("page"); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)); }} style={{ color: T.dim }} className="nb-tap px-2 text-xs">◂</button>
                <button onClick={() => { beep("page"); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)); }} style={{ color: T.dim }} className="nb-tap px-2 text-xs">▸</button>
              </>
            )}
            <button data-test="zoom-in" onClick={zoomIn} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap text-xs tracking-widest" disabled={zoom === "day"}>
              {zoom === "month" ? "WEEK ▸" : zoom === "week" ? "DAY ▸" : ""}
            </button>
          </div>
        </div>

        {zoom === "month" && (
          <div className="px-3 sm:px-5 pb-3">
            <div className="grid grid-cols-7 mb-1">{weekdayOrder.map((d) => <span key={d} style={{ fontFamily: MONO, color: T.dim }} className="text-center text-xs tracking-widest">{WD1[d]}</span>)}</div>
            <div className="grid grid-cols-7 gap-px" style={{ background: T.line }}>
              {monthGrid.map((d, i) => {
                const k = keyOf(d);
                const n = densityOf(d);
                const bf = busyFractionOf(d);
                const inMonth = d.getMonth() === monthCursor.getMonth();
                const sel = k === dateKey;
                /* The tint is the heat — how much of the working day is booked —
                   and the bar underneath is the same fact as a readable measure.
                   An empty track is the free/busy signal for a clear day.

                   Straight proportion, and nothing added for merely having
                   something on it. A flat bonus for "this day is not empty" plus a
                   scale that topped out at four booked hours meant every day in the
                   month landed between 0.10 and 0.30 — a single olive wash, in
                   which a day holding one recurring ritual looked exactly as full
                   as a day with back-to-back meetings. The corner dot already says
                   there is something here; the tint should only say how much. */
                const heat = Math.min(0.72, bf * 0.72);
                return (
                  <button key={k} data-day={k}
                    onClick={() => {
                      if (monthHeldRef.current) { monthHeldRef.current = false; return; }
                      jumpTo(k); setZoom("week");
                    }}
                    onPointerDown={() => {
                      monthHeldRef.current = false;
                      clearTimeout(monthHoldT.current);
                      monthHoldT.current = setTimeout(() => { monthHeldRef.current = true; beep("lift"); buzz(8); setPeekDay(k); }, HOLD_MS);
                    }}
                    onPointerUp={() => clearTimeout(monthHoldT.current)}
                    onPointerLeave={() => clearTimeout(monthHoldT.current)}
                    onPointerCancel={() => clearTimeout(monthHoldT.current)}
                    onMouseEnter={() => {
                      if (!window.matchMedia?.("(hover:hover)").matches) return;
                      clearTimeout(monthHoverT.current);
                      monthHoverT.current = setTimeout(() => setPeekDay((cur) => cur ?? k), 650);
                    }}
                    onMouseLeave={() => clearTimeout(monthHoverT.current)}
                    onContextMenu={(e) => e.preventDefault()}
                    className="nb-cell relative pt-2 pb-3.5"
                    style={{ background: T.bg, opacity: mounted ? (inMonth ? 1 : 0.32) : 0, transitionDelay: `${Math.min(i, 24) * 8}ms` }}>
                    <span className="absolute inset-0" style={{ background: T.accent, opacity: heat }} />
                    <span className="relative text-xs font-semibold" style={{ fontFamily: MONO, color: heat > 0.4 ? T.on : T.text }}>{d.getDate()}</span>
                    {n > 0 && <span className="absolute right-1 top-1 rounded-full" style={{ width: 4, height: 4, background: heat > 0.4 ? T.on : T.accent, opacity: 0.9 }} />}
                    <span className="absolute left-1.5 right-1.5 bottom-1.5 rounded-full overflow-hidden" style={{ height: 3, background: heat > 0.4 ? `${T.on}33` : T.faint }}>
                      <span className="block h-full rounded-full" style={{ width: `${Math.round(bf * 100)}%`, background: heat > 0.4 ? T.on : T.accent }} />
                    </span>
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
        <section className={`${viewMode === "actions" || !actionsOpen ? "lg:col-span-12" : "lg:col-span-7"} flex flex-col min-h-0`} onTouchStart={onSwipeStart} onTouchMove={onSwipeMove} onTouchEnd={onSwipeEnd} onTouchCancel={onSwipeEnd}
          style={{
            transform: swipe === 0 ? "none" : `translateX(${swipe * 0.32}px)`,
            transition: snapping || swipe !== 0 ? "none" : "transform 260ms cubic-bezier(.2,.8,.25,1)",
          }}>
          <div key={turn ? turn.k : "first"} className={`nb-page flex flex-col min-h-0 flex-1 ${turn ? (turn.dir > 0 ? "nb-turn-next" : "nb-turn-prev") : ""}`}>

            {viewMode === "actions" ? (
              <div className="nb-s overflow-y-auto min-h-0 flex-1">
                <div className="flex items-center justify-between pb-2">
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">ALL ACTIONS</span>
                  <button onClick={() => setViewMode("timeline")} style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest">BACK TO DAY</button>
                </div>
                {actionsPanel}
              </div>
            ) : viewMode === "agenda" ? (
              <Agenda
                T={T} surface={surface} days={agenda} dateKey={dateKey} todayKey={todayKey} clock={clock}
                onOpenEvent={(id, key) => { beep("click"); if (key !== dateKey) jumpTo(key); setTimeout(() => setInspect({ kind: "event", id }), key !== dateKey ? 80 : 0); }}
                onOpenTask={(id, key) => { beep("click"); if (key !== dateKey) jumpTo(key); setTimeout(() => setInspect({ kind: "task", id }), key !== dateKey ? 80 : 0); }}
                onJump={jumpTo}
              />
            ) : zoom === "week" ? (
              <>
                {/* "Find a slot": pick a duration and the next open gaps across the
                    coming days light up in the grid, ready to book. */}
                <div className="flex items-center gap-1.5 flex-wrap pb-2 shrink-0">
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest mr-0.5">FIND A SLOT</span>
                  {[30, 60, 120].map((d) => (
                    <button key={d} onClick={() => { beep("tick"); setSlotDur((cur) => (cur === d ? null : d)); }}
                      className="nb-tap px-2 py-0.5 text-xs font-bold tracking-widest"
                      style={{ fontFamily: MONO, borderRadius: 999, background: slotDur === d ? T.accent : "transparent", color: slotDur === d ? T.on : T.dim, border: `1px solid ${slotDur === d ? T.accent : T.line}` }}>
                      {d >= 60 ? `${d / 60}H` : `${d}M`}
                    </button>
                  ))}
                  {slotDur != null && (slotMatches.length === 0 ? (
                    <span style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest">NO OPEN GAPS IN 14 DAYS</span>
                  ) : (
                    slotMatches.slice(0, 3).map((s) => (
                      <button key={`${s.date}-${s.start}`}
                        onClick={() => { beep("click"); if (s.date !== dateKey) jumpTo(s.date); setComposer({ kind: "event", date: s.date, start: s.start, dur: s.dur }); }}
                        className="nb-tap px-2 py-0.5 text-xs tracking-widest"
                        style={{ fontFamily: MONO, color: T.accent, borderRadius: 999, border: `1.5px dashed ${T.accent}` }}>
                        {plannedLabel(s.date, todayKey).toUpperCase()} {tm(s.start)}
                      </button>
                    ))
                  ))}
                </div>
                <WeekGrid
                  T={T} surface={surface} hourRule={hourRule} hourBand={hourBand}
                  week={week} dateKey={dateKey} todayKey={todayKey} nowMin={nowMin} clock={clock}
                  slots={slotMatches}
                  onOpenDay={(k) => { beep("tick"); if (k !== dateKey) jumpTo(k); setZoom("day"); }}
                  onOpenEvent={(id, key) => { beep("click"); if (key !== dateKey) jumpTo(key); setTimeout(() => setInspect({ kind: "event", id }), key !== dateKey ? 80 : 0); }}
                  onOpenTask={(id, key) => { beep("click"); if (key !== dateKey) jumpTo(key); setTimeout(() => setInspect({ kind: "task", id }), key !== dateKey ? 80 : 0); }}
                  onSlotPick={(s) => { beep("click"); if (s.date !== dateKey) jumpTo(s.date); setComposer({ kind: "event", date: s.date, start: s.start, dur: s.dur }); }}
                  onMoveEvent={moveEventTo} beep={beep} buzz={buzz}
                />
              </>
            ) : (
            <>
            {(allDay.length > 0 || dayTasks.some((task) => task.planned.startMinute == null)) && (
              <div style={{ background: T.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottom: `1px solid ${T.line}` }} className="px-3 pt-3 pb-2 flex flex-col gap-1.5">
                {allDay.length > 0 && <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">ALL DAY</span>}
                {allDay.map((e) => {
                  const span = e.endDate ? diffDays(e.endDate, e.date) + 1 : 1;
                  const idx = diffDays(dateKey, e.date) + 1;
                  return (
                    <RowWithJoin key={e.id} T={T} surface={surface} link={e.link} title={e.title}
                      padding="px-2.5 py-2"
                      onOpen={() => { beep("click"); setInspect({ kind: "event", id: e.id }); }}>
                      <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                      <span className="text-xs font-semibold truncate flex-1">{e.title}</span>
                      {span > 1 && <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{idx}/{span}</span>}
                    </RowWithJoin>
                  );
                })}
                {dayTasks.some((task) => task.planned.startMinute == null) && (
                  <>
                    <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest mt-1">ANY TIME</span>
                    <div className="flex gap-1.5 overflow-x-auto nb-x pb-0.5">
                      {dayTasks.filter((task) => task.planned.startMinute == null).map((task) => (
                        <button key={task.id}
                          onClick={() => { beep("click"); setInspect({ kind: "task", id: task.id }); }}
                          onPointerDown={(event) => {
                            if (event.pointerType === "mouse" && event.button !== 0) return;
                            startGesture({ mode: "task", kind: "task", id: task.id, x: event.clientX, y: event.clientY });
                          }}
                          className="nb-tap shrink-0 flex items-center gap-2 px-2.5 py-1.5 text-left"
                          style={{ background: surface, borderRadius: 999, opacity: task.status === "completed" ? .55 : 1 }}>
                          <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: task.status === "completed" ? T.accent : "transparent", boxShadow: `inset 0 0 0 1.5px ${T.accent}` }} />
                          <span className="text-xs font-semibold max-w-48 truncate" style={{ textDecoration: task.status === "completed" ? "line-through" : "none" }}>{task.title}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div ref={streamRef} data-test="day-stream" className="nb-s nb-stream overflow-y-auto relative" style={{ background: T.card, borderTopLeftRadius: allDay.length || dayTasks.some((task) => task.planned.startMinute == null) ? 0 : 16, userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
              <div className="relative" style={{ height: DAY_H }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="absolute left-0 right-0 flex items-start pointer-events-none"
                    style={{ top: h * HOUR_H, height: HOUR_H }}>
                    {/* The label owns its gutter: rules and banding start after it, so
                        the times read on clean card instead of sitting across the
                        grid lines they annotate. */}
                    {/* The hour yields to the now marker when the marker is on top
                        of it. Two times a few pixels apart is not more
                        information than one — it is the same information,
                        illegible. Fading rather than unmounting so the label
                        returns as the minute moves on. */}
                    <span style={{
                      fontFamily: MONO, color: T.dim,
                      transform: h === 0 ? "none" : "translateY(-50%)",
                      opacity: isToday && liveEvent && Math.abs(nowMin - h * 60) < NOW_LABEL_CLEARANCE_MIN ? 0 : 1,
                      transition: "opacity 200ms ease",
                    }}
                      className="w-14 shrink-0 pr-3 text-right text-xs tracking-widest">{fmtHour(h, clock)}</span>
                    <div className="flex-1 h-full" style={{
                      /* Depth comes from banding, not from rules. A hairline every hour
                         reads as a table; alternating fills give the same reading
                         without drawing 24 lines across the content. */
                      borderTop: `1px solid ${hourRule}`,
                      background: h % 2 ? hourBand : "transparent",
                    }}>
                      {suggested.includes(h) && !gesture && (
                        <span style={{ fontFamily: MONO, color: T.faint }} className="block mr-2 mt-1.5 text-xs tracking-widest">FREE</span>
                      )}
                    </div>
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
                      {/* With nothing live the rule crosses empty grid, so the time
                          can sit at the end of it. While an event is live the whole
                          lane is card, and a chip anywhere in it lands on the title,
                          the times, or the elapsed fill it is meant to be reading —
                          so it steps out into the hour gutter, which is where every
                          other time label on this surface already lives. */}
                      <span className="absolute px-1.5 py-0.5 text-xs tracking-widest pointer-events-none"
                        style={{
                          fontFamily: MONO, background: T.accent, color: T.on, borderRadius: 4,
                          /* Opaque, because in the gutter it lands on whichever hour
                             label is nearest and has to replace it rather than
                             overprint it. */
                          ...(liveEvent
                            /* Wide enough to cover the whole hour label it replaces,
                               not just overlap part of it and leave a stray digit. */
                            ? { right: "100%", marginRight: 4, whiteSpace: "nowrap", minWidth: 54, textAlign: "right" }
                            : { right: 0 }),
                          top: mounted ? (nowMin / 1440) * DAY_H - 9 : -9,
                          zIndex: 7,
                          transition: "top 600ms cubic-bezier(.2,.8,.25,1)",
                        }}>
                        {/* In the gutter it drops the meridiem: the hour labels it
                            sits among already say which half of the day this is, and
                            the full form does not fit the rail. */}
                        {liveEvent ? tm(nowMin).replace(/\s*[AP]M$/i, "") : tm(nowMin)}
                      </span>
                    </>
                  )}

                  {events.map((e) => {
                    const top = (e.start / 1440) * DAY_H;
                    const h = Math.max(22, (e.dur / 1440) * DAY_H) - 3;
                    const live = isToday && nowMin >= e.start && nowMin < e.start + e.dur;
                    const past = isToday && nowMin >= e.start + e.dur;
                    const pct = live ? ((nowMin - e.start) / e.dur) * 100 : 0;
                    const held = gesture && gesture.id === e.id
                      && (gesture.mode === "move" || gesture.mode === "resize-end" || gesture.mode === "resize-start");
                    return (
                      <div key={e.id} data-event-id={e.id} className="absolute" style={{ top: top + 2, height: h, left: `${(e.lane / e.cols) * 100}%`, width: `calc(${100 / e.cols}% - 6px)`, zIndex: held ? 20 : 1, opacity: held && gesture.overDay ? 0.35 : 1, pointerEvents: "auto" }}>
                        <div onPointerDown={(ev) => eventDown(ev, e)} onPointerUp={(ev) => eventUp(ev, e)} onContextMenu={(ev) => ev.preventDefault()}
                          className="relative w-full h-full overflow-hidden"
                          style={{
                            background: surface,
                            borderRadius: CARD_R,
                            opacity: past ? 0.74 : 1,
                            boxShadow: held
                              ? `0 10px 28px rgba(0,0,0,.45), inset 0 0 0 2px ${T.accent}`
                              : live ? `inset 0 0 0 1.5px ${T.accent}` : past ? `inset 0 0 0 1px ${T.line}` : "none",
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
                              {normalizeMeetingLink(e.link) && (
                                <a href={normalizeMeetingLink(e.link)} target="_blank" rel="noopener noreferrer" draggable={false}
                                  onPointerDown={(ev) => ev.stopPropagation()} onPointerUp={(ev) => ev.stopPropagation()} onClick={(ev) => ev.stopPropagation()}
                                  aria-label={`Join ${e.title}`}
                                  style={{ fontFamily: MONO, color: T.accent }} className="text-xs font-bold tracking-widest shrink-0">JOIN ↗</a>
                              )}
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
                          {/* Both ends are draggable. Only the bottom one used to be,
                              which meant the only way to say "this started earlier"
                              was to move the block and then lengthen it — two gestures
                              for one thought, and the second undid the first. */}
                          {/* The top handle is shorter than the bottom one and only
                              appears on a card with room to spare. The title sits at
                              the top of the card, and the top of the card is also the
                              most natural place to grab it — a full-width 12px handle
                              there turns "pick this up" into "make it start earlier".
                              8px is edge; anything more is content. */}
                          {h >= 52 && (
                            <div data-resize={e.id} data-resize-edge="start" onPointerDown={(ev) => resizeDown(ev, e, "start")} className="absolute inset-x-0 top-0 flex items-start justify-center" style={{ height: 8, cursor: "ns-resize", touchAction: "none" }}>
                              <span style={{ background: T.faint, width: 22, height: 2, marginTop: 2, borderRadius: 2 }} />
                            </div>
                          )}
                          {h >= 32 && (
                            <div data-resize={e.id} data-resize-edge="end" onPointerDown={(ev) => resizeDown(ev, e, "end")} className="absolute inset-x-0 bottom-0 flex items-end justify-center" style={{ height: 12, cursor: "ns-resize", touchAction: "none" }}>
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

                  {/* An action with an estimate occupies the time it claims. It used
                      to be drawn 28px tall whatever it said it would take, so a
                      three-hour action and a five-minute one looked identical and the
                      day looked emptier than it was. */}
                  {plannedTasks.map((t) => {
                    const sizing = gesture && gesture.mode === "task-resize" && gesture.id === t.id;
                    const estimate = sizing ? gesture.dur : t.planned.estimateMinutes;
                    const block = isResizable(t, "task");
                    const h = block ? Math.max(28, (estimate / 1440) * DAY_H - 3) : 28;
                    return (
                      <button key={t.id} data-task-chip={t.id} onClick={() => { beep("click"); setInspect({ kind: "task", id: t.id }); }} className="nb-tap absolute left-0 right-2 text-left overflow-hidden"
                        style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", top: (t.planned.startMinute / 1440) * DAY_H + 2, height: h, borderRadius: CARD_R, border: `1px dashed ${sizing ? T.accent : T.faint}`, background: block ? `${T.accent}0D` : "transparent", opacity: t.status === "completed" ? 0.4 : 1, zIndex: sizing ? 20 : 5, pointerEvents: "auto" }}>
                        <span className="flex items-center gap-2 px-2.5 py-1">
                          <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: t.status === "completed" ? T.accent : "transparent", boxShadow: `inset 0 0 0 1.5px ${T.accent}` }} />
                          <span className="text-xs font-semibold truncate" style={{ textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</span>
                          <span style={{ fontFamily: MONO, color: sizing ? T.accent : T.dim }} className="ml-auto text-xs tracking-widest shrink-0">
                            {sizing ? dur(estimate) : tm(t.planned.startMinute)}
                          </span>
                        </span>
                        {block && h >= 40 && (
                          <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest truncate px-2.5 pl-7">{dur(estimate)}</span>
                        )}
                        {/* Only an action that has an estimate gets a handle: with no
                            length there is nothing for the gesture to change. */}
                        {block && (
                          <span data-resize={t.id} data-resize-edge="end" onPointerDown={(ev) => resizeDown(ev, { id: t.id, start: t.planned.startMinute, dur: estimate }, "end", "task")}
                            className="absolute inset-x-0 bottom-0 flex items-end justify-center" style={{ height: 12, cursor: "ns-resize", touchAction: "none" }}>
                            <span style={{ background: T.faint, width: 22, height: 2, marginBottom: 3, borderRadius: 2 }} />
                          </span>
                        )}
                      </button>
                    );
                  })}

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

        {viewMode !== "actions" && actionsOpen && (
          <section data-test="actions-column" className="nb-s hidden lg:block lg:col-span-5 min-h-0 overflow-y-auto relative">
            {actionsPanel}
          </section>
        )}
        {viewMode !== "actions" && !actionsOpen && (
          <button data-test="actions-restore" onClick={() => setActionsOpen(true)}
            className="nb-tap hidden lg:block fixed right-0 top-1/2 -translate-y-1/2 z-20 px-2 py-4 text-xs font-bold tracking-widest"
            style={{ fontFamily: MONO, background: T.accent, color: T.on, borderRadius: "12px 0 0 12px", writingMode: "vertical-rl" }}>
            ACTIONS
          </button>
        )}
      </main>

      {/* ══ MOBILE SHEET ══
          Not rendered while Actions owns the whole screen: it is the same list,
          and left mounted it sits over the view it duplicates. */}
      {viewMode !== "actions" && (
      <div className="nb-msheet lg:hidden fixed inset-x-0 bottom-0 z-40 flex flex-col"
        style={{ height: "76vh", background: T.card, borderTop: `1px solid ${T.line}`, transform: sheet ? "translateY(0)" : "translateY(calc(100% - 52px))", transition: "transform 420ms cubic-bezier(.22,1.12,.28,1)" }}>
        <div className="flex items-center gap-3 px-3 shrink-0" style={{ height: 52 }}>
          <button onClick={() => { beep("tick"); setSheet(!sheet); }} className="flex-1 flex items-center gap-2 text-left" aria-label="Toggle actions">
            <span style={{ background: T.faint }} className="w-8 h-0.5" />
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest">ACTIONS</span>
            <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{openCount} OPEN</span>
            {isToday && overdue.length > 0 && <span style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest">{overdue.length} LATE</span>}
          </button>
          <button data-test="new-action" onClick={() => { beep("click"); setComposer({ kind: "task", notch: true }); }} style={{ background: T.accent, color: T.on, fontFamily: MONO }} className="nb-tap nb-liquid px-3 py-1.5 text-xs font-bold tracking-widest">+ ACTION</button>
        </div>
        <div className="nb-s flex-1 overflow-y-auto px-3 pb-6">{actionsPanel}</div>
      </div>
      )}

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
          <div role="alert" className="nb-up flex items-center gap-3 px-3 py-2 w-full sm:w-auto pointer-events-auto"
            style={{ background: NOW_RED, color: "#FFFFFF", borderRadius: CARD_R }}>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest shrink-0">NOT SAVING</span>
            <span className="text-sm truncate">Changes are staying in this tab only.</span>
            <button onClick={() => { beep("click"); setSettings(true); }}
              style={{ fontFamily: MONO }} className="text-xs font-bold tracking-widest shrink-0 underline">EXPORT</button>
          </div>
        </div>
      )}

      {/* Everything is on this device, and export is a manual action in Settings
          nobody performs on a good day. This is the only thing that closes the
          gap between "my planner" and "my planner, if this browser survives" —
          so it is a real prompt, and it is rare enough to be believed: never for
          an empty notebook, never twice for the same content, and "not now"
          holds until the notebook has actually moved on. It yields to the
          storage warning, which is the more urgent problem. */}
      {/* Centred, it straddled both columns and covered a row of each. Docked to
          one corner on a wide screen it sits over the end of one list instead of
          the middle of the layout, and stops being the widest thing on the page. */}
      {askForBackup && !storageBad && !firstRun && (
        <div className="fixed inset-x-0 bottom-20 lg:bottom-6 z-40 flex justify-center lg:justify-end px-3 lg:pr-5 pointer-events-none">
          <div data-test="backup-nudge" className="nb-up flex items-center gap-3 px-3 py-2 w-full sm:w-auto sm:max-w-lg pointer-events-auto"
            style={{ background: surface, color: T.text, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
            <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest shrink-0">BACK UP</span>
            <span className="text-sm truncate">This notebook only exists on this device.</span>
            <button data-test="backup-nudge-save" onClick={() => { beep("click"); exportJson(); }}
              style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs font-bold tracking-widest shrink-0 underline">SAVE A COPY</button>
            <button data-test="backup-nudge-dismiss"
              onClick={() => { beep("click"); setBackupRecord((current) => recordBackupDismissed(current, { state: db, today: todayKey })); }}
              style={{ fontFamily: MONO, color: T.dim }} className="nb-tap text-xs tracking-widest shrink-0" aria-label="Not now">NOT NOW</button>
          </div>
        </div>
      )}

      {alertShown && (
        <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-3 pointer-events-none">
          <div role="alert" className={`${alertLeaving ? "nb-toast-out" : "nb-up"} flex items-center gap-3 px-3 py-2 w-full sm:w-auto ${alertLeaving ? "" : "pointer-events-auto"}`} style={{ background: NOW_RED, color: "#FFFFFF" }}>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest shrink-0">REMINDER</span>
            <span className="text-sm font-semibold truncate">{alertShown.title}</span>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest shrink-0">{alertShown.body}</span>
            {alertShown.reminderId && <>
              <button onClick={snoozeAlert} style={{ fontFamily: MONO }} className="text-xs font-bold tracking-widest underline shrink-0">SNOOZE 10M</button>
              <button onClick={dismissAlert} style={{ fontFamily: MONO }} className="text-xs font-bold tracking-widest underline shrink-0">DISMISS</button>
            </>}
          </div>
        </div>
      )}

      {undoShown && (
        <div className="fixed inset-x-0 z-50 flex justify-center pointer-events-none" style={{ bottom: 68 }}>
          <div role="status" aria-live="polite" className={`${undoLeaving ? "nb-toast-out" : "nb-up"} flex items-center gap-3 px-3 py-2 ${undoLeaving ? "" : "pointer-events-auto"}`} style={{ background: T.text, color: T.bg }}>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest">{undoShown.label}</span>
            {undoShown.payload && <button onClick={runUndo} style={{ fontFamily: MONO, color: T.accent }} className="text-xs font-bold tracking-widest">UNDO</button>}
          </div>
        </div>
      )}

      {reward && (
        <div className="fixed inset-x-0 top-1/3 z-50 flex justify-center pointer-events-none">
          <span key={reward.k} className="nb-rw text-7xl font-bold tracking-tighter" style={{ fontFamily: MONO, color: T.accent }}>+{reward.xp}</span>
        </div>
      )}
      {levelShown && (
        <div className="fixed inset-x-0 top-20 z-50 flex justify-center pointer-events-none">
          <span style={{ background: T.accent, color: T.on, fontFamily: MONO }} className={`${levelLeaving ? "nb-toast-out" : "nb-up"} px-3 py-1.5 text-xs font-bold tracking-widest`}>LEVEL {levelShown}</span>
        </div>
      )}

      {/* ══ MONTH PEEK ══ */}
      {peekDay && db && (() => {
        const { allDay: allDayP, timed: timedP, tasks: tasksP } = projectDayPeek(db, peekDay, { mapEvent: eventForUi });
        const openFrom = (kind, id) => {
          setPeekDay(null); beep("click");
          if (peekDay !== dateKey) jumpTo(peekDay);
          setTimeout(() => setInspect({ kind, id }), peekDay !== dateKey ? 80 : 0);
        };
        return (
          <Sheet T={T} title={fmtDay(peekDay)} onClose={() => setPeekDay(null)}
            headerAction={(
              <button onClick={() => { setPeekDay(null); beep("tick"); jumpTo(peekDay); setZoom("day"); }}
                style={{ fontFamily: MONO, color: T.accent }} className="nb-tap px-2 py-1 text-xs font-bold tracking-widest">OPEN DAY ▸</button>
            )}>
            <div className="flex flex-col gap-1.5">
              {allDayP.length + timedP.length + tasksP.length === 0 && (
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest py-3">NOTHING SCHEDULED — ALL FREE</span>
              )}
              {allDayP.map((e) => (
                <button key={e.id} onClick={() => openFrom("event", e.id)} className="nb-tap flex items-center gap-2.5 px-3 py-2.5 text-left" style={{ background: surface, borderRadius: CARD_R }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 text-sm font-semibold truncate">{e.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">ALL DAY</span>
                </button>
              ))}
              {timedP.map((e) => (
                <button key={e.id} onClick={() => openFrom("event", e.id)} className="nb-tap flex items-center gap-2.5 px-3 py-2.5 text-left" style={{ background: surface, borderRadius: CARD_R }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{e.title}</span>
                    {e.place && <span style={{ color: T.dim }} className="block text-xs truncate">{e.place}</span>}
                  </span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{tm(e.start)} · {dur(e.dur)}</span>
                </button>
              ))}
              {tasksP.map((t) => (
                <button key={t.id} onClick={() => openFrom("task", t.id)} className="nb-tap flex items-center gap-2.5 px-3 py-2.5 text-left" style={{ background: surface, borderRadius: CARD_R, opacity: t.status === "completed" ? 0.45 : 1 }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, boxShadow: `inset 0 0 0 1.5px ${catColor(t.category)}`, background: t.status === "completed" ? catColor(t.category) : "transparent" }} />
                  <span className="flex-1 text-sm font-semibold truncate" style={{ textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{t.planned.startMinute != null ? tm(t.planned.startMinute) : "ACTION"}</span>
                </button>
              ))}
            </div>
          </Sheet>
        );
      })()}

      {/* ══ INSPECTOR ══ */}
      {inspectItem && (
        <Sheet T={T} title={inspect.kind === "event" ? "EVENT" : "ACTION"}
          headerAction={(
            <FluidEditActions T={T} editing={detailEditing} dirty={hasDetailDraft(draft)}
              label={inspect.kind === "event" ? "EDIT EVENT" : "EDIT ACTION"}
              onEdit={() => { beep("click"); setDetailEditing(true); }}
              onRevert={() => { beep("abort"); setDraft(null); setDetailEditing(false); }}
              onSave={() => { beep("commit"); commitDraft(); }} />
          )}
          beforeClose={closeInspector}
          onClose={() => setInspect(null)}>
          {inspect.kind === "task" ? (
            /* A task reads as a working document: what it is, the steps, then the
               facts that govern it. Nothing is centred, because the checklist is a
               list you act on rather than a title card you read. */
            <div>
              <InlineText T={T} value={inspectDraft.title} ariaLabel="Action title"
                onCommit={(title) => editEntry({ title })}
                onBeginEdit={beginDetailEdit}
                className="text-2xl font-bold tracking-tight leading-tight" />
              <div className="flex items-center gap-2 mt-1.5">
                <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(inspectDraft.category) }} />
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">
                  {(db.taskLists.find((l) => l.id === inspectDraft.listId) || {}).name || "—"} · {inspectDraft.category}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 mt-4">
                {(inspectDraft.checklist ?? []).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-3 py-2.5" style={{ background: surface, borderRadius: 999 }}>
                    <button onClick={() => toggleSub(inspect.id, item.id)} className="shrink-0" aria-label={item.done ? "Reopen step" : "Complete step"}>
                      {/* Keyed on the state it shows, so ticking a step replays the
                          pop rather than sliding a colour in. */}
                      <span key={String(item.done)} className={`block rounded-full ${item.done ? "nb-pop" : ""}`} style={{
                        width: 20, height: 20,
                        background: item.done ? T.accent : "transparent",
                        boxShadow: `inset 0 0 0 2px ${item.done ? T.accent : T.faint}`,
                      }} />
                    </button>
                    <span className="flex-1 text-sm truncate" style={{ textDecoration: item.done ? "line-through" : "none", color: item.done ? T.dim : T.text }}>{item.title}</span>
                    {/* Structure edits write to the record immediately rather than the
                        draft, so they stay behind the editing state — otherwise Revert
                        would appear to cover a change it cannot take back. */}
                    {detailEditing && <button onClick={() => promoteSub(inspect.id, item.id)} style={{ color: T.dim }} className="text-xs px-1" aria-label="Promote step to a subtask">↥</button>}
                    {detailEditing && <button onClick={() => removeSub(inspect.id, item.id)} style={{ color: T.dim }} className="text-xs px-1" aria-label="Remove step">✕</button>}
                  </div>
                ))}
                {detailEditing && <InlineAdd T={T} surface={surface} onAdd={(v) => addSub(inspect.id, v)} />}
              </div>

              {(inspectDraft.checklist ?? []).length > 0 && (
                <div className="flex items-center gap-3 mt-3">
                  <span className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: T.faint }}>
                    <span className="block h-full rounded-full" style={{
                      width: `${((inspectDraft.checklist.filter((x) => x.done).length) / inspectDraft.checklist.length) * 100}%`,
                      background: T.accent, transition: "width 220ms ease",
                    }} />
                  </span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">
                    {inspectDraft.checklist.filter((x) => x.done).length} / {inspectDraft.checklist.length}
                  </span>
                </div>
              )}

              <div className="flex items-start gap-3 px-3 py-3 mt-4" style={{ background: surface, borderRadius: CARD_R }}>
                <InlineText T={T} value={inspectDraft.note} placeholder="Add a note" ariaLabel="Note" multiline
                  onCommit={(note) => editEntry({ note })} onBeginEdit={beginDetailEdit} className="text-sm leading-relaxed" />
                <span style={{ color: T.dim }} className="text-sm shrink-0 pt-0.5">≡</span>
              </div>

              {/* The governing facts, grouped as one card so they read as a block of
                  rules rather than a run of unrelated rows. */}
              <div className="mt-4 overflow-hidden" style={{ background: surface, borderRadius: CARD_R }}>
                {/* §4.6. When it is planned, and when it is due, are edited where
                    they are read. §4.7 keeps the repeat rule behind its own gesture. */}
                <DetailRow T={T} icon="▦" divider>
                  {detailEditing ? (
                    <div className="flex flex-col gap-2">
                      <PillNav T={T} ariaLabel="Action planning state"
                        value={inspectDraft.planned.date ? "day" : "inbox"}
                        options={[["day", "ON A DAY"], ["inbox", "INBOX"]]}
                        onPick={(value) => editEntry(value === "inbox"
                          ? { unplanned: true }
                          : { unplanned: false, date: inspectDraft.planned.date || dateKey })}
                        surface={T.card} className="w-full [&>button]:flex-1 [&>button]:py-1.5" />
                      {inspectDraft.planned.date && (
                        <div className="grid grid-cols-2 gap-2">
                          <LabeledNative T={T} dark={dark} label="DAY" type="date" ariaLabel="Planned day"
                            value={inspectDraft.planned.date}
                            onCommit={(value) => value && editEntry({ date: value, unplanned: false })} />
                          <LabeledNative T={T} dark={dark} label="TIME" type="time" ariaLabel="Planned time"
                            value={inspectDraft.planned.startMinute != null ? hhmm(inspectDraft.planned.startMinute) : ""}
                            onCommit={(value) => editEntry({ at: value ? fromHhmm(value) : null })} />
                        </div>
                      )}
                      <DurationPicker T={T} label="ESTIMATE" value={inspectDraft.planned.estimateMinutes}
                        onPick={(estimate) => editEntry({ estimate })} />
                      <label className="flex items-center gap-2">
                        <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">REPEATS</span>
                        <select value={inspectDraft.recurrence?.frequency ?? "never"} aria-label="Repeats"
                          onChange={(e) => editEntry({ repeat: repeatFor(e.target.value, inspectDraft.recurrence
                            ? { ...inspectDraft.recurrence, freq: inspectDraft.recurrence.frequency }
                            : null, inspectDraft.planned.date || dateKey) })}
                          style={{ background: "transparent", border: "none", color: T.text, colorScheme: dark ? "dark" : "light" }}
                          className="text-sm flex-1 truncate">
                          {REPEATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <button onClick={() => { beep("click"); beginDetailEdit(); }} className="block w-full text-left" aria-label="Edit planning">
                      <span className="block text-sm">{inspectDraft.planned.date ? plannedLabel(inspectDraft.planned.date, todayKey) : "Unplanned"}</span>
                      <span style={{ color: T.dim }} className="block text-xs mt-0.5">
                        {inspectDraft.planned.startMinute != null ? tm(inspectDraft.planned.startMinute) : "Any time"}
                        {inspectDraft.planned.estimateMinutes ? ` · ${dur(inspectDraft.planned.estimateMinutes)} estimate` : " · No estimate"}
                        {` · ${inspectDraft.recurrence ? repeatLabel({ ...inspectDraft.recurrence, freq: inspectDraft.recurrence.frequency, byDay: inspectDraft.recurrence.byWeekday }) : "Does not repeat"}`}
                      </span>
                    </button>
                  )}
                </DetailRow>
                <InlineChoiceRow T={T} icon="◔" divider onBeginEdit={beginDetailEdit}
                  label={(inspectDraft.reminders ?? []).length
                    ? (inspectDraft.reminders[0].offsetMinutes === 0
                      ? `When it starts${inspectDraft.planned.startMinute != null ? `, ${tm(inspectDraft.planned.startMinute)}` : ""}`
                      : `${dur(inspectDraft.reminders[0].offsetMinutes)} before`)
                    : "No reminder"}
                  value={(inspectDraft.reminders ?? [])[0]?.offsetMinutes ?? "off"}
                  options={[["off", "OFF"], [0, "AT TIME"], [15, "15M"], [60, "1H"]]}
                  onPick={(value) => editEntry({ reminders: value === "off" ? [] : [{
                    id: (inspectDraft.reminders ?? [])[0]?.id || uid(), anchor: "planned", offsetMinutes: value,
                  }] })} />
                <DetailRow T={T} icon="⌛" divider>
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">DUE</span>
                    <InlineStamp T={T} dark={dark} type="date" ariaLabel="Deadline"
                      value={inspectDraft.deadline.date || ""} onCommit={(v) => editEntry({ due: v })}
                      display={inspectDraft.deadline.date ? fmtDay(inspectDraft.deadline.date) : "No deadline"}
                      onBeginEdit={beginDetailEdit}
                      style={{ color: inspectDraft.deadline.date && inspectDraft.deadline.date < todayKey ? NOW_RED : T.text }}
                      className="text-sm" />
                    {inspectDraft.deadline.date && (
                      <button onClick={() => editEntry({ due: "" })} style={{ color: T.dim }} className="nb-tap text-xs px-1" aria-label="Clear deadline">✕</button>
                    )}
                  </div>
                </DetailRow>
                {/* §8.2. The label names the attribute; it does not repeat the value
                    the selected chip already carries. */}
                <InlineChoiceRow T={T} icon="◈" divider onBeginEdit={beginDetailEdit} label={`Worth ${inspectDraft.reward}`}
                  value={inspectDraft.reward} options={[20, 30, 40, 60].map((xp) => [xp, String(xp)])}
                  onPick={(xp) => editEntry({ xp })} />
                {inspectDraft.status === "waiting" && (
                  <DetailRow T={T} icon="◷" divider={inspectDependsOn.length > 0}>
                    <span className="block text-sm">{inspectDraft.followUpDate ? `Follow up ${fmtDay(inspectDraft.followUpDate)}` : "Waiting, no follow-up date"}</span>
                  </DetailRow>
                )}
                {/* Every edge is listed, satisfied or not, each removable — otherwise a
                    dependency could be added from here but never taken back. */}
                <DetailRow T={T} icon="▤" divider>
                  <button
                    onClick={() => { beep("click"); beginDetailEdit(); setListPicker({ taskId: inspect.id, draft: true }); }} className="text-left w-full">
                    <span className="block text-sm">{(db.taskLists.find((l) => l.id === inspectDraft.listId) || {}).name || "—"}</span>
                    <span style={{ color: T.dim }} className="block text-xs mt-0.5">Tap to move to another list</span>
                  </button>
                </DetailRow>
                <InlineChoiceRow T={T} icon="◑" divider onBeginEdit={beginDetailEdit} label={inspectDraft.category} dot={catColor}
                  value={inspectDraft.category} options={CATS.map((c) => [c, c])}
                  onPick={(cat) => editEntry({ cat })} />
                <DetailRow T={T} icon="#" divider={inspectDependsOn.length > 0}>
                  <TagField T={T} tags={inspectDraft.tags} onBeginEdit={beginDetailEdit} onChange={(tags) => editEntry({ tags })} />
                </DetailRow>
                {inspectDependsOn.map((blocker, i) => (
                  <DetailRow key={blocker.id} T={T} icon="⛌" divider={i < inspectDependsOn.length - 1}>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm truncate"
                        style={{ color: blocker.status === "completed" ? T.dim : NOW_RED, textDecoration: blocker.status === "completed" ? "line-through" : "none" }}>
                        Blocked by {blocker.title}
                      </span>
                      {detailEditing && <button onClick={() => unblockTask(inspect.id, blocker.id)} style={{ color: T.dim }} className="text-xs px-1" aria-label="Remove dependency">✕</button>}
                    </div>
                  </DetailRow>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 mt-4">
                {inspectDraft.status === "completed" ? (
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">COMPLETED</span>
                ) : (
                  <PillNav T={T} ariaLabel="Action status" value={inspectDraft.status}
                    options={[["open", "OPEN"], ["in_progress", "DOING"], ["waiting", "WAITING"]]}
                    onPick={(status) => editEntry({ status })} style={{ border: `1px solid ${T.line}` }} />
                )}
                {/* Dependency edits also write immediately, so the affordance belongs
                    to the editing state rather than the read view. */}
                {detailEditing && <button onClick={() => { beep("click"); setDependencyPicker({ taskId: parseTaskOccurrenceId(inspect.id).seriesId }); }}
                  style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest shrink-0">+ BLOCK ON</button>}
              </div>

              {earliestStart && inspectDraft.planned.date && inspectDraft.planned.date < earliestStart && (
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
            <InlineText T={T} value={inspectDraft.title} ariaLabel="Event title"
              onCommit={(title) => editEntry({ title })}
              onBeginEdit={beginDetailEdit}
              className="text-2xl font-bold tracking-tight leading-tight" style={{ textAlign: "center" }} />
            {inspectDraft.allDay ? (
              <p className="text-base font-semibold mt-1.5">All day</p>
            ) : (
              <div className="flex items-center justify-center gap-1.5 mt-1.5">
                <InlineStamp T={T} dark={dark} type="time" ariaLabel="Starts" value={hhmm(inspectDraft.start)}
                  display={tm(inspectDraft.start)} onCommit={(v) => v && editEntry({ start: fromHhmm(v) })} onBeginEdit={beginDetailEdit}
                  className="text-base font-semibold" />
                <span style={{ color: T.dim }} className="text-base">–</span>
                <InlineStamp T={T} dark={dark} type="time" ariaLabel="Ends" value={hhmm((inspectDraft.start + inspectDraft.dur) % 1440)}
                  display={tm((inspectDraft.start + inspectDraft.dur) % 1440)}
                  onCommit={(v) => {
                    if (!v) return;
                    const end = fromHhmm(v);
                    editEntry({ dur: durationFromClockRange(inspectDraft.start, end) });
                  }} onBeginEdit={beginDetailEdit} className="text-base font-semibold" />
              </div>
            )}
            <InlineStamp T={T} dark={dark} type="date" ariaLabel="Day"
              value={splitId(inspect.id).date || inspectDraft.date || dateKey}
              display={fmtDay(splitId(inspect.id).date || inspectDraft.date || dateKey)}
              onCommit={(v) => v && editEntry({ date: v })}
              onBeginEdit={beginDetailEdit}
              style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest mt-1" />
          </div>

          {detailEditing && (
            <EventScheduleEditor T={T} dark={dark} event={inspectDraft}
              date={splitId(inspect.id).date || inspectDraft.date || dateKey}
              onChange={editEntry} />
          )}

          {/* Two figures the app can actually answer, rather than borrowed metrics. */}
          <div className="flex gap-2 pb-4">
            <div className="flex-1 text-center py-3" style={{ background: surface, borderRadius: CARD_R }}>
              <span className="block text-2xl font-semibold tracking-tight">
                {inspect.kind === "event" ? (inspectDraft.allDay ? "—" : dur(inspectDraft.dur)) : `+${inspectDraft.reward}`}
              </span>
              <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-0.5">
                {inspect.kind === "event" ? "LENGTH" : "REWARD"}
              </span>
            </div>
            <div className="flex-1 text-center py-3" style={{ background: surface, borderRadius: CARD_R }}>
              <span className="block text-2xl font-semibold tracking-tight">
                {inspect.kind === "event"
                  ? (inspectDraft.allDay ? "—" : countdownLabel(dateKey, inspectDraft.start, todayKey, nowMin))
                  : `${(inspectDraft.checklist ?? []).filter((x) => x.done).length}/${(inspectDraft.checklist ?? []).length}`}
              </span>
              <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-0.5">
                {inspect.kind === "event" ? "STARTS" : "STEPS"}
              </span>
            </div>
          </div>

          {/* One row per attribute, each one the control for it (§4.6). Collapsed it
              costs a line; touched, it grows the alternatives underneath. */}
          <div className="flex flex-col gap-2">
            <InlineChoice T={T} surface={surface} icon="◑" tint={catColor(inspectDraft.cat)} onBeginEdit={beginDetailEdit}
              label={inspectDraft.cat || "—"} value={inspectDraft.cat} dot={catColor}
              options={CATS.map((c) => [c, c])} onPick={(cat) => editEntry({ cat })} />

            <InlineChoice T={T} surface={surface} icon="◷" label={inspectDraft.allDay ? "All day" : "At a time"} onBeginEdit={beginDetailEdit}
              value={inspectDraft.allDay ? "all" : "timed"} options={[["timed", "AT A TIME"], ["all", "ALL DAY"]]}
              onPick={(v) => editEntry({ allDay: v === "all", ...(v === "all" ? {} : { start: inspectDraft.start || 540, dur: inspectDraft.dur || 60 }) })} />

            {inspectDraft.allDay && (
              <InlineField T={T} surface={surface} icon="→">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">THROUGH</span>
                <InlineStamp T={T} dark={dark} type="date" ariaLabel="Last day"
                  value={inspectDraft.endDate || inspectDraft.date || dateKey} min={inspectDraft.date || dateKey}
                  display={fmtDay(inspectDraft.endDate || inspectDraft.date || dateKey)}
                  onCommit={(v) => v && editEntry({ endDate: v })}
                  onBeginEdit={beginDetailEdit}
                  style={{ fontFamily: MONO }} className="text-sm" />
              </InlineField>
            )}

            {/* §4.7. Recurrence rewrites a series rather than an entry, so it stays
                behind a deliberate gesture with room to explain itself. */}
            {/* §4.6. Repeating is an attribute of the entry like any other, so it is
                chosen here rather than in a form somewhere else. The safety was never
                the separate surface — it is the scope question, which the save still
                asks. */}
            <InlineChoice T={T} surface={surface} icon="↻" onBeginEdit={beginDetailEdit}
              label={inspectDraft.repeat ? repeatLabel(inspectDraft.repeat) : "Does not repeat"}
              value={inspectDraft.repeat?.freq ?? "never"}
              options={REPEATS}
              onPick={(freq) => editEntry({ repeat: repeatFor(freq, inspectDraft.repeat, inspectDraft.date || dateKey) })} />

            <InlineChoice T={T} surface={surface} icon="◔" onBeginEdit={beginDetailEdit}
              label={(inspectDraft.alerts || []).length
                ? inspectDraft.alerts.map((a) => (a === 0 ? "When it starts" : `${dur(a)} before`)).join(", ")
                : "No reminder"}
              value={(inspectDraft.alerts || [])[0] ?? "off"}
              options={[["off", "OFF"], [0, "AT TIME"], [5, "5M"], [15, "15M"], [30, "30M"], [60, "60M"]]}
              onPick={(v) => editEntry({ alerts: v === "off" ? [] : [v] })} />

            <InlineField T={T} surface={surface} icon="⌖">
              <InlineText T={T} value={inspectDraft.place} placeholder="Add a place" ariaLabel="Place"
                onCommit={(place) => editEntry({ place })} onBeginEdit={beginDetailEdit} className="text-sm" />
            </InlineField>

            <InlineField T={T} surface={surface} icon="⌁">
              <InlineText T={T} value={inspectDraft.link || ""} placeholder="Add a meeting link" ariaLabel="Meeting link"
                onCommit={(link) => editEntry({ link: normalizeMeetingLink(link) || link.trim() })} onBeginEdit={beginDetailEdit} className="text-sm" />
              {normalizeMeetingLink(inspectDraft.link) && (
                <a href={normalizeMeetingLink(inspectDraft.link)} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontFamily: MONO, background: T.accent, color: T.on, borderRadius: 999 }}
                  className="nb-tap px-2.5 py-1 text-xs font-bold tracking-widest shrink-0">JOIN</a>
              )}
              {inspectDraft.link && !normalizeMeetingLink(inspectDraft.link) && (
                <span style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest shrink-0">NOT A LINK</span>
              )}
            </InlineField>

            {conflictIds.has(inspect.id) && (
              <Pill T={T} surface={surface} icon="⚠" tint={NOW_RED} label="Overlaps another event on this day" />
            )}

            <div className="flex items-start gap-3 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <span style={{ color: T.dim }} className="text-sm shrink-0 w-4 text-center pt-0.5">≡</span>
              <InlineText T={T} value={inspectDraft.note} placeholder="Add a note" ariaLabel="Note" multiline
                onCommit={(note) => editEntry({ note })} onBeginEdit={beginDetailEdit} className="text-sm leading-relaxed" />
            </div>
          </div>

          {!inspectDraft.allDay && minutesUntil(dateKey, inspectDraft.start, todayKey, nowMin) > 0 && (
            <p className="text-center text-sm mt-5" style={{ color: T.dim }}>
              <span className="font-bold" style={{ color: T.text }}>{countdownLabel(dateKey, inspectDraft.start, todayKey, nowMin, inspectDraft.dur)}</span> away
            </p>
          )}

          </>
          )}

          {!detailEditing && <>
            <EntityNotes T={T} notes={linkedNotes} kind={inspect.kind}
              onNew={newContextualNote}
              onOpen={(note) => { beep("click"); setInspect(null); setNoteEdit(note); }} />
            <button
              onClick={() => {
                if (inspect.kind === "event") duplicateEvent(inspect.id);
                else { inspectDraft.status === "completed" ? reopenTask(inspect.id) : completeTask(inspect.id); setInspect(null); }
              }}
              style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap nb-liquid w-full py-3 mt-5 text-xs font-bold tracking-widest">
              {inspect.kind === "event" ? "DUPLICATE" : inspectDraft.status === "completed" ? "REOPEN" : "MARK COMPLETE"}
            </button>
            <button onClick={() => removeItem(inspect.kind, inspect.id)} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap w-full py-3 mt-2 text-xs tracking-widest">DELETE</button>
          </>}
        </Sheet>
      )}

      {discardAsk && (
        <Sheet T={T} title="UNSAVED CHANGES" onClose={() => { beep("click"); setDiscardAsk(false); }}>
          <h2 className="text-xl font-bold tracking-tight">Discard this edit?</h2>
          <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-1 mb-4">
            The saved {inspect?.kind === "event" ? "event" : "action"} will stay as it was.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => { beep("click"); setDiscardAsk(false); }}
              style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap nb-liquid py-3 text-xs font-bold tracking-widest">KEEP EDITING</button>
            <button onClick={() => {
              beep("abort");
              setDraft(null);
              setDetailEditing(false);
              setDiscardAsk(false);
              setInspect(null);
            }} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap py-3 text-xs tracking-widest">DISCARD CHANGES</button>
          </div>
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
              mutate((d) => ({ ...d, events: [], tasks: [], notes: [], noteTags: [], noteAttachments: [], eventExceptions: [], taskExceptions: [], occurrenceAliases: [], overrides: {}, xp: 0 }));
              setMotivationLedger(createMotivationLedger());
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
        <Sheet T={T} title={composer.id ? "EDIT" : "NEW"} morph={composer.notch ? "notch" : "auto"}
          onClose={() => { beep("click"); setComposer(null); }}>
          <Composer T={T} initial={composer} dateLabel={fmtDay(dateKey)} dateKey={dateKey} onSubmit={saveEntry} onTick={() => beep("tick")} weekStart={weekStart} />
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
        <Sheet T={T} title="PALETTE" onClose={() => { beep("click"); closePalette(); }}>
          <CommandPalette T={T} surface={surface} query={searchQuery} onQueryChange={setSearchQuery}
            rows={paletteRows} queryIssues={searchProjection.query.issues}
            placeholder="Search, run a command, or type to create"
            footer={quickDraft?.consumed.length ? `READ · ${quickDraft.consumed.join(" · ").toUpperCase()}` : null} />
          {!searchQuery.trim() && <QuickAddHint T={T} />}
        </Sheet>
      )}

      {shortcuts && (
        <Sheet T={T} title="SHORTCUTS" onClose={() => { beep("click"); setShortcuts(false); }}>
          <h2 className="text-2xl font-bold tracking-tight">Keyboard</h2>
          <ShortcutSheet T={T} surface={surface} />
        </Sheet>
      )}

      {settings && (
        <Sheet T={T} title="SETTINGS" onClose={() => { beep("click"); setSettings(false); }}>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

          <div className="mt-4">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">FEEDBACK</span>
            <button onClick={() => { beep("tick"); setPreferences((current) => current ? { ...current, feedback: { ...current.feedback, sound: !current.feedback.sound } } : current); }} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Sound</span>
              <span style={{ fontFamily: MONO, color: preferences.feedback.sound ? T.accent : T.dim }} className="text-xs tracking-widest">{preferences.feedback.sound ? "ON" : "OFF"}</span>
            </button>
            <button onClick={() => { beep("tick"); setPreferences((current) => current ? { ...current, display: { ...current.display, clock: current.display.clock === "24" ? "12" : "24" } } : current); }} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Clock</span>
              <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{clock === "24" ? "24-HOUR" : "12-HOUR"}</span>
            </button>
            <button data-test="week-start-toggle"
              onClick={() => { beep("tick"); setPreferences((current) => current ? { ...current, display: { ...current.display, weekStart: current.display.weekStart === 1 ? 0 : 1 } } : current); }}
              className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Week starts</span>
              <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{weekStart === 1 ? "MONDAY" : "SUNDAY"}</span>
            </button>
            <button onClick={askNotifs} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">System notifications</span>
              <span style={{ fontFamily: MONO, color: preferences.notifications.systemEnabled ? T.accent : T.dim }} className="text-xs tracking-widest">{preferences.notifications.systemEnabled ? "ON" : "ALLOW"}</span>
            </button>
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">THEME</span>
            <div className="flex flex-col mt-1">
              {THEMES.map((th) => (
                <button key={th.id} onClick={() => { beep("tick"); setPreferences((current) => current ? { ...current, display: { ...current.display, themeId: th.id } } : current); }} className="nb-row flex items-center gap-3 py-2 px-1 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <span className="flex shrink-0">
                    <span className="w-4 h-6" style={{ background: th.bg }} />
                    <span className="w-4 h-6" style={{ background: th.card }} />
                    <span className="w-4 h-6" style={{ background: th.accent }} />
                  </span>
                  <span className="flex-1 text-sm font-semibold">{th.name}</span>
                  {th.id === T.id && <span className="nb-pop text-xs tracking-widest" style={{ fontFamily: MONO, color: T.accent }}>ON</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">PACE</span>
            {[
              ["reducedMotion", "Reduce motion", preferences.display.reducedMotion, (current) => ({ ...current, display: { ...current.display, reducedMotion: !current.display.reducedMotion } })],
              ["points", "Points", preferences.motivation.points, (current) => ({ ...current, motivation: { ...current.motivation, points: !current.motivation.points } })],
              ["levels", "Levels", preferences.motivation.levels, (current) => ({ ...current, motivation: { ...current.motivation, levels: !current.motivation.levels } })],
              ["streaks", "Streaks", preferences.motivation.streaks, (current) => ({ ...current, motivation: { ...current.motivation, streaks: !current.motivation.streaks } })],
              ["celebrations", "Celebrations", preferences.motivation.celebrations, (current) => ({ ...current, motivation: { ...current.motivation, celebrations: !current.motivation.celebrations } })],
            ].map(([id, label, enabled, update]) => (
              <button key={id} onClick={() => { beep("tick"); setPreferences((current) => current ? update(current) : current); }} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
                <span className="text-sm">{label}</span>
                <span style={{ fontFamily: MONO, color: enabled ? T.accent : T.dim }} className="text-xs tracking-widest">{enabled ? "ON" : "OFF"}</span>
              </button>
            ))}
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">YOUR DATA</span>
            <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-1 mb-2">Everything lives on this device. There's no account to sync with — take it with you as a file instead.</p>
            {storageBad && (
              <p style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest mb-2">SAVING TO THIS DEVICE FAILED — EXPORT A COPY</p>
            )}
            <Reveal open={Boolean(pendingImport)}>
              {pendingImportShown && (
                <div className="flex items-center gap-2 mb-2 p-2" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
                  <span className="flex-1 text-xs">Replace everything on this device?</span>
                  <button onClick={() => { setPendingImport(null); beep("abort"); }} style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">CANCEL</button>
                  <button onClick={() => {
                    if (!pendingImport) return;
                    setDb(pendingImport);
                    setReminderRecords([]);
                    setMotivationLedger(createMotivationLedger({ openingBalance: pendingImport.xp ?? 0 }));
                    setPendingImport(null);
                    beep("commit");
                    setSettings(false);
                  }} style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs font-bold tracking-widest">REPLACE</button>
                </div>
              )}
            </Reveal>
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
            <Reveal open={confirmWipe}>
              <div className="flex items-center gap-2 p-2" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
                <span className="flex-1 text-xs">Erase every event, action and note?</span>
                <button onClick={() => setConfirmWipe(false)} style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">KEEP</button>
                <button onClick={wipeAll} style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs font-bold tracking-widest">ERASE</button>
              </div>
            </Reveal>
            <Reveal open={!confirmWipe}>
              <button onClick={() => { beep("click"); setConfirmWipe(true); }} style={{ fontFamily: MONO, color: T.dim, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 text-xs tracking-widest">START A BLANK NOTEBOOK</button>
            </Reveal>
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

          <button onClick={() => { beep("click"); setSettings(false); }} style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap nb-liquid w-full py-3 mt-5 text-xs font-bold tracking-widest">DONE</button>
        </Sheet>
      )}
    </div>
  );
}

/* ═══════════════════════ ACTIONS ═══════════════════════ */

function ActionsPanel({ T, listRef, tasks, notes, onToggleNoteCheck, onExtract, onOpenDeadline, overdue, deadlines, showOverdue, todayKey, gesture, blockersFor, onPromoteSub, smartView, viewCounts, onSmartView, lists, onManageLists, clock = "12", selection, onToggleSelect, onStartSelect, onCancelSelect, onBulk, onPullOverdue, beep, buzz, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onAddTask, onEditNote, onUnschedule, onJump, onCollapse = null }) {
  const pullable = overdue.filter((t) => t.planned?.date !== todayKey);
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
          {onCollapse && (
            <button data-test="actions-collapse" onClick={onCollapse} style={{ fontFamily: MONO, color: T.dim }}
              className="nb-tap text-xs tracking-widest" aria-label="Collapse Actions column">COLLAPSE ›</button>
          )}
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

      {/* Only what PLAN TODAY can actually move is offered: overdue work already
          planned onto today would make the button a visible no-op. */}
      {showOverdue && pullable.length > 0 && (
        <button onClick={onPullOverdue} className="w-full flex items-center gap-2 px-3 py-2 mb-2 text-left" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
          <span style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest shrink-0">{pullable.length} OVERDUE</span>
          <span className="flex-1 text-xs truncate" style={{ color: T.dim }}>{pullable.map((t) => t.title).join(" · ")}</span>
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
          <TaskCard key={t.id} T={T} t={t} beep={beep} buzz={buzz} target={gesture && gesture.overTask === t.id} todayKey={todayKey} blockers={blockersFor(t)} onPromoteSub={onPromoteSub} clock={clock} selection={selection} onToggleSelect={onToggleSelect} onStartSelect={onStartSelect}
            onComplete={onComplete} onReopen={onReopen} onDefer={onDefer} onInspect={onInspect} onToggleSub={onToggleSub} onAddSub={onAddSub} onRemoveSub={onRemoveSub} onDragStart={onDragStart} onUnschedule={onUnschedule} />
        ))}
      </div>

      {done.length > 0 && (
        <div className="mt-4">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">DONE · {done.length}</span>
          <div className="flex flex-col gap-2 mt-2">
            {done.map((t) => (
              <TaskCard key={t.id} T={T} t={t} beep={beep} buzz={buzz} todayKey={todayKey} blockers={blockersFor(t)} onPromoteSub={onPromoteSub} clock={clock} selection={selection} onToggleSelect={onToggleSelect} onStartSelect={onStartSelect}
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
                    <span key={String(block.done)} className={`block rounded-full ${block.done ? "nb-pop" : ""}`} style={{ width: 14, height: 14, background: block.done ? T.accent : "transparent", boxShadow: `inset 0 0 0 1.5px ${block.done ? T.accent : T.faint}` }} />
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

function TaskCard({ T, t, beep, buzz, target, todayKey, blockers = [], onPromoteSub, clock = "12", selection = null, onToggleSelect, onStartSelect, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onUnschedule }) {
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
  /* Where the last render left the row. The stagger runs from the first segment
     that is actually changing, so a single tick has no delay and a jump of three
     still fills one after another. */
  const previousDone = useRef(subDone);
  useEffect(() => { previousDone.current = subDone; }, [subDone]);
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
              {/* Open is the default and stays quiet; the two states you set on
                  purpose announce themselves, so changing status in the detail view
                  has a visible effect out here on the row. */}
              {!isDone && t.status === "in_progress" && (
                <span style={{ color: T.accent, border: `1px solid ${T.accent}`, borderRadius: 999 }} className="px-1.5 py-0.5 text-xs tracking-widest shrink-0">DOING</span>
              )}
              {!isDone && t.status === "waiting" && (
                <span style={{ color: T.dim, border: `1px solid ${T.line}`, borderRadius: 999 }} className="px-1.5 py-0.5 text-xs tracking-widest shrink-0">WAITING</span>
              )}
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
            {/* One segment per step, not one bar filled to a fraction. A
                continuous bar says "roughly two-thirds done"; segments say
                "four of six", which is the thing a checklist actually knows.

                Segments fill by *count*, left to right — segment three lights up
                for the third completed step whichever step that was. A checklist
                is a quantity of work remaining, not an ordered pipeline, so a bar
                that reshuffles because you started at the bottom would be
                reporting the order you worked in rather than how much is left.

                And they fill rather than flip: a width that grows is a thing
                happening, where a colour that changes is a thing that already
                happened. The stagger is measured from the lowest segment that
                actually changed, so ticking one step fills immediately and
                clearing three fills them in sequence. */}
            {checklist.length > 0 && (
              <div className="flex gap-1 mt-2" role="progressbar"
                aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={subDone}
                aria-label={`${subDone} of ${checklist.length} steps done`}>
                {progressSegmentStates(subDone, checklist.length).map((filled, index) => {
                  const delay = Math.max(0, index - Math.min(subDone, previousDone.current)) * 60;
                  return (
                    <span key={index} className="flex-1 overflow-hidden"
                      style={{ height: 3, borderRadius: 999, background: T.faint }}>
                      <span className="block h-full w-full" style={{
                        background: T.accent,
                        borderRadius: 999,
                        transformOrigin: "left center",
                        transform: filled ? "scaleX(1)" : "scaleX(0)",
                        transition: `transform 300ms cubic-bezier(.22,.9,.3,1) ${delay}ms`,
                      }} />
                    </span>
                  );
                })}
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
                  <button onClick={() => {
                    /* The tick that finishes the last step is about to finish the
                       whole action — burst here, where the circle is, so the
                       celebration starts on the control the finger is on. A
                       dependency-blocked task asks for confirmation instead. */
                    if (!s.done && !blockers.length && checklist.every((x) => x.done || x.id === s.id)) {
                      setBurst(uid()); setTimeout(() => setBurst(null), 640);
                    }
                    onToggleSub(t.id, s.id);
                  }} className="flex items-center gap-2 flex-1 text-left">
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
/* The true week: 7 day columns against one shared time axis. Events are blocks and
   free time is the open space between them — the shape of the week is the point,
   so the columns carry as little chrome as they can. */
function WeekGrid({ T, surface, hourRule, hourBand, week, dateKey, todayKey, nowMin, clock, slots, onOpenDay, onOpenEvent, onOpenTask, onSlotPick, onMoveEvent, beep, buzz }) {
  const scrollRef = useRef(null);
  const weekKey = week[0]?.key;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firsts = week.flatMap((d) => d.timed.map((e) => e.start));
    const anchor = week.some((d) => d.key === todayKey) ? nowMin : firsts.length ? Math.min(...firsts) : 480;
    el.scrollTop = Math.max(0, (anchor / 1440) * DAY_H - 140);
  }, [weekKey]);
  const hasAllDay = week.some((d) => d.allDay.length > 0);

  /* ─── dragging a card across the week ───
     Two axes at once, which is the whole point of the view: y is the minute, x is
     the day. Both are read from the pointer rather than from the card, so a drop
     lands where the cursor is and not where the grab started.

     Press-and-hold to lift, the same as the day timeline — a week column is
     narrow enough that an immediate drag would fight the vertical scroll on every
     attempt to read it. */
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const holdRef = useRef(null);
  const tapRef = useRef(false);
  const dragging = Boolean(drag);

  const minuteAt = (clientY) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return ((clientY - rect.top + el.scrollTop) / DAY_H) * 1440;
  };
  /* Hit-test the column under the pointer rather than doing arithmetic on the
     grid's width: the gutter, the borders and a horizontal scroll all shift
     where a column actually is, and `elementFromPoint` already knows. */
  const dayAt = (x, y) => {
    try {
      const found = document.elementFromPoint(x, y)?.closest("[data-week-day]");
      return found ? found.getAttribute("data-week-day") : null;
    } catch { return null; }
  };

  const beginDrag = (event, day, clientX, clientY) => {
    tapRef.current = false;
    beep?.("lift"); buzz?.(14);
    const next = {
      id: event.id, event, dur: event.dur,
      grab: minuteAt(clientY) - event.start,
      fromDate: day, fromStart: event.start,
      date: day, start: event.start,
      x: clientX, y: clientY,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const updateDrag = (clientX, clientY) => {
    const current = dragRef.current;
    if (!current) return;
    const day = dayAt(clientX, clientY);
    /* Same arithmetic the day timeline uses — features/planner/timelineGesture.js. */
    const { start } = proposeGesture("move", {
      pointerMinute: minuteAt(clientY), grab: current.grab, duration: current.dur,
    });
    const next = { ...current, x: clientX, y: clientY, start, date: day ?? current.date };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = () => {
    const finished = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!finished) return;
    if (!gestureChangedAnything(
      { start: finished.fromStart, duration: finished.dur, date: finished.fromDate },
      { start: finished.start, duration: finished.dur, date: finished.date },
    )) return;
    onMoveEvent?.(finished.event, { date: finished.date, start: finished.start });
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => { e.preventDefault(); updateDrag(e.clientX, e.clientY); };
    const up = () => endDrag();
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);

  /* Touch is driven by touch events, not pointer events: a scroll container fires
     pointercancel the instant the browser claims the gesture, which would kill
     every long press before it lifted. Same reason the day timeline does. */
  const touchStart = (e, event, day) => {
    if (e.touches.length !== 1) return;
    const { clientX, clientY } = e.touches[0];
    tapRef.current = true;
    clearTimeout(holdRef.current);
    holdRef.current = setTimeout(() => beginDrag(event, day, clientX, clientY), LIFT_MS);
  };
  const touchMove = (e) => {
    if (!dragRef.current) { disarm(); tapRef.current = false; return; }
    e.preventDefault();
    updateDrag(e.touches[0].clientX, e.touches[0].clientY);
  };
  const touchEnd = (e, event, day) => {
    disarm();
    if (dragRef.current) { endDrag(); return; }
    if (tapRef.current) { tapRef.current = false; e.preventDefault(); onOpenEvent(event.id, day); }
  };

  /* A press that moves before it lifts was never a press. Without this the hold
     timer keeps running while the pointer travels, and the card lifts under a
     cursor that had already left it — turning a scroll or a stray drag across the
     week into a move nobody asked for. The day timeline cancels its hold the same
     way; the week grid was missing it. */
  const armedRef = useRef(null);
  const disarm = () => { clearTimeout(holdRef.current); armedRef.current = null; };

  useEffect(() => {
    const move = (e) => {
      const armed = armedRef.current;
      if (!armed || dragRef.current) return;
      if (movedEnoughToCancelHold(armed, { x: e.clientX, y: e.clientY })) { disarm(); tapRef.current = false; }
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  const pointerDown = (e, event, day) => {
    if (e.pointerType === "touch" || e.button === 2) return;
    e.stopPropagation();
    tapRef.current = true;
    const { clientX, clientY } = e;
    disarm();
    armedRef.current = { x: clientX, y: clientY };
    holdRef.current = setTimeout(() => {
      armedRef.current = null;
      beginDrag(event, day, clientX, clientY);
    }, LIFT_MS);
  };
  const pointerUp = (e, event, day) => {
    if (e.pointerType === "touch") return;
    disarm();
    if (dragRef.current) return;
    if (tapRef.current) { tapRef.current = false; e.stopPropagation(); onOpenEvent(event.id, day); }
  };

  useEffect(() => () => clearTimeout(holdRef.current), []);

  /* The lifted card leaves its old column and is drawn in the one under the
     pointer, so the week shows the move rather than describing it. */
  const cardsFor = (day) => {
    const settled = drag ? day.timed.filter((event) => event.id !== drag.id) : day.timed;
    if (!drag || drag.date !== day.key) return settled;
    return [...settled, { ...drag.event, start: drag.start, dur: drag.dur, lane: 0, cols: 1, lifted: true }];
  };
  return (
    <div data-test="week-grid" className="nb-x flex-1 min-h-0 overflow-x-auto flex flex-col" style={{ background: T.card, borderRadius: 16 }}>
      <div className="flex flex-col flex-1 min-h-0" style={{ minWidth: 620 }}>
        <div className="flex shrink-0" style={{ borderBottom: `1px solid ${T.line}` }}>
          <span className="w-12 shrink-0" />
          {week.map((day) => {
            const d = parseKey(day.key);
            const isToday = day.key === todayKey;
            const sel = day.key === dateKey;
            return (
              <button key={day.key} onClick={() => onOpenDay(day.key)} className="nb-tap flex-1 min-w-0 py-1.5 text-center" style={{ borderLeft: `1px solid ${hourRule}` }} aria-label={`Open ${fmtDay(day.key)}`}>
                <span style={{ fontFamily: MONO, color: sel ? T.accent : T.dim }} className="block text-xs tracking-widest">{WD[d.getDay()]}</span>
                <span className="inline-flex items-center justify-center w-7 h-7 text-sm font-bold" style={{
                  fontFamily: MONO, borderRadius: 999,
                  background: isToday ? T.accent : "transparent",
                  color: isToday ? T.on : T.text,
                  boxShadow: sel && !isToday ? `inset 0 0 0 1.5px ${T.accent}` : "none",
                }}>{pad(d.getDate())}</span>
              </button>
            );
          })}
        </div>
        {hasAllDay && (
          <div className="flex shrink-0" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span className="w-12 shrink-0 self-center pr-2 text-right text-xs tracking-widest" style={{ fontFamily: MONO, color: T.dim, fontSize: 9 }}>ALL DAY</span>
            {week.map((day) => (
              <div key={day.key} className="flex-1 min-w-0 px-0.5 py-1 flex flex-col gap-0.5" style={{ borderLeft: `1px solid ${hourRule}` }}>
                {day.allDay.map((e) => (
                  <button key={e.segmentId ?? e.id} onClick={() => onOpenEvent(e.id, day.key)} className="nb-tap flex items-center gap-1 px-1.5 py-0.5 text-left overflow-hidden"
                    style={{ background: surface, borderRadius: 6 }}>
                    <span className="shrink-0 rounded-full" style={{ width: 5, height: 5, background: catColor(e.cat) }} />
                    <span className="font-semibold truncate" style={{ fontSize: 10 }}>{e.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div ref={scrollRef} className="nb-s flex-1 min-h-0 overflow-y-auto">
          <div className="relative flex" style={{ height: DAY_H, userSelect: "none", WebkitUserSelect: "none" }}>
            <div className="relative w-12 shrink-0">
              {Array.from({ length: 24 }).map((_, h) => h > 0 && (
                <span key={h} className="absolute right-2 tracking-widest" style={{ top: h * HOUR_H, transform: "translateY(-50%)", fontFamily: MONO, color: T.dim, fontSize: 9 }}>{fmtHour(h, clock)}</span>
              ))}
            </div>
            {week.map((day) => {
              const isToday = day.key === todayKey;
              const daySlots = slots.filter((s) => s.date === day.key);
              return (
                <div key={day.key} data-week-day={day.key} className="relative flex-1 min-w-0" style={{
                    borderLeft: `1px solid ${hourRule}`,
                    background: drag?.date === day.key ? `${T.accent}14` : day.key === dateKey ? `${T.accent}08` : "transparent",
                  }}
                  onClick={(e) => {
                    /* A drop is not a click on the column underneath it. */
                    if (dragRef.current) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    onSlotPick({ date: day.key, start: startSlot(((e.clientY - rect.top) / DAY_H) * 1440, 30), dur: 60 });
                  }}>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="absolute left-0 right-0 pointer-events-none" style={{ top: h * HOUR_H, height: HOUR_H, borderTop: `1px solid ${hourRule}`, background: h % 2 ? hourBand : "transparent" }} />
                  ))}
                  {cardsFor(day).map((e) => {
                    const top = (e.start / 1440) * DAY_H;
                    const h = Math.max(16, (e.dur / 1440) * DAY_H) - 2;
                    const past = !e.lifted && (day.key < todayKey || (isToday && nowMin >= e.start + e.dur));
                    return (
                      <button key={e.segmentId ?? `${e.id}-${e.start}`}
                        data-test="week-event" data-event-id={e.id}
                        onPointerDown={(ev) => pointerDown(ev, e, day.key)}
                        onPointerUp={(ev) => pointerUp(ev, e, day.key)}
                        onTouchStart={(ev) => touchStart(ev, e, day.key)}
                        onTouchMove={touchMove}
                        onTouchEnd={(ev) => touchEnd(ev, e, day.key)}
                        onTouchCancel={() => { disarm(); endDrag(); }}
                        onClick={(ev) => ev.stopPropagation()}
                        className="absolute text-left overflow-hidden"
                        style={{
                          /* A button centres its contents vertically — that is the
                             browser's own layout for buttons, and it does not care
                             that this one happens to be a two-hour block. The title
                             of a 9-to-11 event was floating 55px down the card,
                             nowhere near the hour it starts at, while the identical
                             card on the day timeline (a div) had it at the top. */
                          display: "flex", flexDirection: "column", justifyContent: "flex-start",
                          top: top + 1, height: h,
                          left: `calc(${(e.lane / e.cols) * 100}% + 2px)`, width: `calc(${100 / e.cols}% - 4px)`,
                          background: surface, borderRadius: CARD_R,
                          opacity: past ? 0.74 : 1,
                          /* The lifted card rides above everything, is not a drop
                             target for its own hit-test, and says it is lifted. */
                          zIndex: e.lifted ? 8 : 2,
                          pointerEvents: e.lifted ? "none" : "auto",
                          touchAction: "none",
                          transform: e.lifted ? "scale(1.04)" : "none",
                          boxShadow: e.lifted
                            ? `0 8px 24px rgba(0,0,0,0.32), inset 0 0 0 1.5px ${T.accent}`
                            : past ? `inset 0 0 0 1px ${T.line}` : "none",
                        }}>
                        {/* Sharing the column halves the width, and at half a
                            week-column there is only room for one thing to be
                            legible. Keeping the dot and the time turned a title
                            into "R…" over "10:…" — two truncations that say
                            nothing where one whole word would have. */}
                        <span className={`flex items-center gap-1 ${e.cols > 1 ? "px-1" : "px-1.5"} pt-0.5 min-w-0`}>
                          {e.cols === 1 && <span className="shrink-0 rounded-full" style={{ width: 5, height: 5, background: catColor(e.cat) }} />}
                          <span className="font-semibold leading-tight truncate" style={{ fontSize: 10 }}>{e.title}</span>
                        </span>
                        {/* A lifted card always states its time, however short it
                            is: the number is the whole feedback of the drag. */}
                        {(e.lifted || (h >= 30 && e.cols === 1)) && <span className="block truncate tracking-widest" style={{ fontFamily: MONO, color: e.lifted ? T.accent : T.dim, fontSize: 9, paddingLeft: e.lifted && e.cols > 1 ? 4 : 15 }}>{fmtTime(e.start, clock)}</span>}
                      </button>
                    );
                  })}
                  {day.tasks.map((t) => (
                    <button key={t.id} onClick={(ev) => { ev.stopPropagation(); onOpenTask(t.id, day.key); }}
                      className="absolute left-0.5 right-0.5 text-left overflow-hidden"
                      style={{ top: (t.planned.startMinute / 1440) * DAY_H + 1, height: 16, borderRadius: 6, border: `1px dashed ${T.faint}`, opacity: t.status === "completed" ? 0.4 : 1, zIndex: 3, background: T.card }}>
                      <span className="block px-1 font-semibold truncate" style={{ fontSize: 9, textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</span>
                    </button>
                  ))}
                  {daySlots.map((s) => (
                    <button key={`slot-${s.start}`} onClick={(ev) => { ev.stopPropagation(); onSlotPick(s); }}
                      className="absolute flex items-start justify-center"
                      style={{ left: 2, right: 2, top: (s.start / 1440) * DAY_H + 1, height: (s.dur / 1440) * DAY_H - 2, borderRadius: 6, border: `1.5px dashed ${T.accent}`, background: `${T.accent}14`, zIndex: 4 }}
                      aria-label={`Book ${fmtTime(s.start, clock)} on ${fmtDay(s.date)}`}>
                      <span className="tracking-widest pt-0.5" style={{ fontFamily: MONO, color: T.accent, fontSize: 9 }}>{fmtTime(s.start, clock)}</span>
                    </button>
                  ))}
                  {isToday && (
                    <div className="absolute left-0 right-0 pointer-events-none" style={{ top: (nowMin / 1440) * DAY_H, height: 2, background: T.accent, zIndex: 6 }}>
                      <span className="absolute left-0 -top-0.5 w-1.5 h-1.5 rounded-full" style={{ background: T.accent }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* A row that is one tap target, plus a second one for the link.
 *
 * A meeting link has to be reachable wherever the meeting appears, not only from
 * the timed card that happened to get it first — living in the agenda should not
 * cost two taps to join a call. But a row is already a button, and an anchor
 * inside a button is invalid HTML that browsers and screen readers resolve
 * differently.
 *
 * So the anchor is a *sibling* laid over the row's right edge, and the row
 * reserves the width it occupies. Two real controls, no nesting, and the row's
 * own tap target is unchanged everywhere the link is absent. */
function RowWithJoin({ T, surface, link, title, onOpen, className = "", padding = "px-3 py-2.5", style = {}, children }) {
  const href = normalizeMeetingLink(link);
  return (
    <div className="relative" style={{ background: surface, borderRadius: CARD_R, ...style }}>
      <button onClick={onOpen} className={`nb-tap w-full flex items-center gap-2.5 text-left ${padding} ${className}`}
        style={{ paddingRight: href ? 64 : undefined, background: "transparent", borderRadius: CARD_R }}>
        {children}
      </button>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" draggable={false}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Join ${title}`}
          style={{ fontFamily: MONO, color: T.accent }}
          className="nb-tap absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-1 text-xs font-bold tracking-widest">JOIN ↗</a>
      )}
    </div>
  );
}

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
                <RowWithJoin key={e.id} T={T} surface={surface} link={e.link} title={e.title}
                  onOpen={() => onOpenEvent(e.id, day.key)}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 text-sm font-semibold truncate">{e.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">ALL DAY</span>
                </RowWithJoin>
              ))}
              {day.timed.map((e) => (
                <RowWithJoin key={e.id} T={T} surface={surface} link={e.link} title={e.title}
                  onOpen={() => onOpenEvent(e.id, day.key)}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{e.title}</span>
                    {e.place && <span style={{ color: T.dim }} className="block text-xs truncate">{e.place}</span>}
                  </span>
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{fmtTime(e.start, clock)}</span>
                </RowWithJoin>
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
function TagField({ T, tags, onChange, editable = true, onBeginEdit = null }) {
  const [v, setV] = useState("");
  const add = () => {
    const value = v.trim().replace(/^#/, "");
    if (value) { onChange([...tags, value]); setV(""); }
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        editable ? (
          <button key={tag} onClick={() => onChange(tags.filter((x) => x !== tag))}
            className="px-2 py-0.5 text-xs tracking-widest" title="Remove tag"
            style={{ fontFamily: MONO, borderRadius: 999, color: T.dim, border: `1px solid ${T.line}` }}>{tag} ✕</button>
        ) : (
          <span key={tag} className="px-2 py-0.5 text-xs tracking-widest"
            style={{ fontFamily: MONO, borderRadius: 999, color: T.dim, border: `1px solid ${T.line}` }}>{tag}</span>
        )
      ))}
      {editable ? (
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} onBlur={add}
          onFocus={(event) => onBeginEdit?.(event.currentTarget)}
          placeholder={tags.length ? "Add tag" : "No tags"} style={{ background: "transparent", border: "none" }}
          className="text-sm py-0.5 flex-1 min-w-20" />
      ) : !tags.length ? <span style={{ color: T.dim }} className="text-sm">No tags</span> : null}
    </div>
  );
}

/* Presence with an exit: the value is held for one beat after it clears so the
   surface can animate out instead of vanishing on the frame it was dismissed. */
function usePresence(value, exitMs = 220) {
  const present = value != null && value !== false;
  const [held, setHeld] = useState(present ? value : null);
  const [leaving, setLeaving] = useState(false);
  const heldRef = useRef(held);
  heldRef.current = held;
  useEffect(() => {
    if (present) { setHeld(value); setLeaving(false); return undefined; }
    if (heldRef.current == null) return undefined;
    setLeaving(true);
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => { setHeld(null); setLeaving(false); }, reduced ? 0 : exitMs);
    return () => clearTimeout(t);
  }, [present, present ? value : null]);
  return [held, leaving && !present];
}

/* An inline surface that grows open and folds closed instead of popping — the same
   grid-rows idiom the choice rows use, shared by the Settings confirmations. */
function Reveal({ open, children }) {
  return (
    <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 300ms cubic-bezier(.22,1.12,.28,1)" }}>
      <div className="overflow-hidden" inert={!open} style={{ minHeight: 0, visibility: open ? "visible" : "hidden", transition: `visibility 0s linear ${open ? 0 : 300}ms` }}>
        {children}
      </div>
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
function InlineText({ T, value, onCommit, placeholder = "Untitled", multiline = false, className = "", style = {}, ariaLabel, editable = true, onBeginEdit = null }) {
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
    onFocus: (event) => { setLive(true); onBeginEdit?.(event.currentTarget); },
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
  if (!editable) {
    const content = value || placeholder;
    return multiline
      ? <p aria-label={ariaLabel} className={`${className} w-full`} style={{ whiteSpace: "pre-wrap", ...style }}>{content}</p>
      : <span aria-label={ariaLabel} className={`${className} block w-full`} style={style}>{content}</span>;
  }
  return multiline
    ? <textarea rows={Math.min(6, Math.max(1, draft.split("\n").length))} {...shared} />
    : <input {...shared} />;
}

/* §4.6. Collapsed, an attribute costs one line. Tapping it grows the alternatives
   underneath rather than showing every choice all the time. */
function InlineChoice({ T, surface, icon, label, options, value, onPick, tint = null, dot = null, children = null, editable = true, onBeginEdit = null }) {
  const [open, setOpen] = useState(false);
  const optionsRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(optionsRef, [value, options.length, open]);
  useEffect(() => { if (!editable) setOpen(false); }, [editable]);
  return (
    <div style={{ background: tint ? `${tint}22` : surface, borderRadius: CARD_R }} className="overflow-hidden">
      <button disabled={!editable} onClick={(event) => { if (!open) onBeginEdit?.(event.currentTarget); setOpen(!open); }} className="nb-tap flex items-center gap-3 px-3 py-2.5 w-full text-left disabled:opacity-100">
        <span style={{ color: tint || T.dim }} className="text-sm shrink-0 w-4 text-center">{icon}</span>
        <span className="flex-1 text-sm truncate" style={{ color: tint || T.text }}>{label}</span>
        {editable && <span style={{ color: T.dim, transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms cubic-bezier(.2,.8,.25,1)" }}
          className="text-xs shrink-0">▾</span>}
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
          <div ref={optionsRef} className="relative flex flex-wrap gap-1 px-3 pb-2.5">
            <LiquidPillIndicator T={T} box={box} stretch={stretch} settled={settled} />
            {options.map(([key, text]) => {
              const on = key === value;
              return (
                <button key={String(key)} data-active={on ? "true" : "false"}
                  onClick={() => { onPick(key); setOpen(false); }}
                  className="nb-tap relative inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs tracking-widest"
                  style={{
                    fontFamily: MONO, borderRadius: 999, zIndex: 1,
                    background: "transparent",
                    color: on ? T.on : T.dim,
                    border: `1px solid ${on ? "transparent" : T.line}`,
                    transition: "border-color 180ms ease, color 260ms ease",
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
function InlineNative({ T, type, value, onCommit, ariaLabel, className = "", style = {}, min, dark = false, onBeginEdit = null }) {
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
      onFocus={(event) => { setLive(true); onBeginEdit?.(event.currentTarget); }}
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

function LabeledNative({ T, dark, label, type, value, onCommit, ariaLabel, min }) {
  return (
    <label className="block px-2.5 py-2" style={{ border: `1px solid ${T.line}`, borderRadius: 12 }}>
      <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mb-0.5">{label}</span>
      <InlineNative T={T} dark={dark} type={type} value={value} min={min} onCommit={onCommit} ariaLabel={ariaLabel}
        className="w-full text-sm" style={{ fontFamily: MONO }} />
    </label>
  );
}

function DurationPicker({ T, label, value, onPick, allowNone = true }) {
  const standards = [15, 30, 45, 60, 90, 120];
  const choices = value && !standards.includes(value)
    ? [...standards, value].sort((a, b) => a - b)
    : standards;
  const options = [
    ...(allowNone ? [[null, "NONE"]] : []),
    ...choices.map((minutes) => [minutes, dur(minutes).toUpperCase()]),
  ];
  return (
    <div>
      <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mb-1">{label}</span>
      <PillNav T={T} ariaLabel={label} value={value ?? null} options={options} onPick={onPick}
        className="w-full [&>button]:flex-1 [&>button]:px-1.5 [&>button]:py-1.5"
        style={{ border: `1px solid ${T.line}` }} />
    </div>
  );
}

function EventScheduleEditor({ T, dark, event, date, onChange }) {
  const endMinute = (event.start + event.dur) % 1440;
  const derivedEndDate = addDaysToKey(date, Math.floor((event.start + event.dur) / 1440));
  return (
    <div className="nb-detail-editor flex flex-col gap-2 mb-4 p-3"
      style={{ background: isDark(T.bg) ? mixHex(T.card, "#FFFFFF", 0.13) : mixHex(T.card, "#000000", 0.06), borderRadius: CARD_R }}>
      {event.allDay ? (
        <div className="grid grid-cols-2 gap-2">
          <LabeledNative T={T} dark={dark} label="DAY" type="date" ariaLabel="Event day" value={date}
            onCommit={(value) => value && onChange({ date: value })} />
          <LabeledNative T={T} dark={dark} label="THROUGH" type="date" ariaLabel="Last day"
            min={date} value={event.endDate || date}
            onCommit={(value) => value && onChange({ endDate: value })} />
        </div>
      ) : <>
        <div className="grid grid-cols-2 gap-2">
          <LabeledNative T={T} dark={dark} label="DAY" type="date" ariaLabel="Event day" value={date}
            onCommit={(value) => value && onChange({ date: value })} />
          <LabeledNative T={T} dark={dark} label="START" type="time" ariaLabel="Starts" value={hhmm(event.start)}
            onCommit={(value) => value && onChange({ start: fromHhmm(value) })} />
          <LabeledNative T={T} dark={dark} label="END DAY" type="date" ariaLabel="Event end day"
            min={date} value={derivedEndDate}
            onCommit={(value) => value && onChange({ dur: durationFromDatedClockRange(date, event.start, value, endMinute) })} />
          <LabeledNative T={T} dark={dark} label="END" type="time" ariaLabel="Ends" value={hhmm(endMinute)}
            onCommit={(value) => value && onChange({ dur: durationFromDatedClockRange(date, event.start, derivedEndDate, fromHhmm(value)) })} />
        </div>
        <DurationPicker T={T} label="LENGTH" value={event.dur} allowNone={false}
          onPick={(duration) => onChange({ dur: duration })} />
      </>}
    </div>
  );
}

function FluidEditActions({ T, editing, dirty, label, onEdit, onRevert, onSave }) {
  return (
    <div className={`nb-edit-actions relative overflow-hidden ${editing ? "is-editing" : ""}`}
      style={{
        width: editing ? 176 : 104,
        height: 34,
        borderRadius: 999,
        background: editing ? T.faint : "transparent",
        boxShadow: editing ? `inset 0 0 0 1px ${T.line}` : "inset 0 0 0 1px transparent",
      }}>
      {/* One accent surface lives two lives — the whole EDIT pill at rest, the SAVE
          half while editing. It travels between them rather than swapping, which is
          what makes the control read as a single object morphing. */}
      <span aria-hidden="true" className="nb-edit-liquid absolute"
        style={{ top: 0, bottom: 0, right: 0, left: editing ? "50%" : 0, background: T.accent, borderRadius: 999 }} />
      <button onClick={onEdit} disabled={editing} aria-hidden={editing}
        className="nb-edit-face absolute inset-0 text-xs font-bold tracking-widest"
        style={{ fontFamily: MONO, color: T.on, opacity: editing ? 0 : 1,
          transform: editing ? "scale(.85)" : "none", pointerEvents: editing ? "none" : "auto" }}>
        {label}
      </button>
      <div className="nb-edit-face absolute inset-0 grid grid-cols-2" inert={!editing}
        style={{ opacity: editing ? 1 : 0, transform: editing ? "none" : "scale(.9)", pointerEvents: editing ? "auto" : "none" }}>
        <button onClick={onRevert} disabled={!editing} className="text-xs tracking-widest"
          style={{ fontFamily: MONO, color: T.dim }}>{dirty ? "REVERT" : "CANCEL"}</button>
        <button onClick={onSave} disabled={!editing} className="relative text-xs font-bold tracking-widest"
          style={{ fontFamily: MONO, color: T.on, borderRadius: 999 }}>
          {dirty ? "SAVE" : "DONE"}
          {dirty && <span aria-label="Unsaved changes" className="absolute rounded-full" style={{ width: 5, height: 5, right: 7, top: 6, background: T.on }} />}
        </button>
      </div>
    </div>
  );
}

/* A segmented control where the selection is one pill that travels between the
   options rather than a background that blinks from one to the next. It stretches
   along the direction of travel and settles — the liquid-pill idiom — which is what
   makes the movement read as one object rather than two states.

   Built natively: the reference implementations are Framer components, and a
   published page here cannot load anything off-host anyway. */
function useLiquidPill(wrapRef, deps) {
  const [box, setBox] = useState(null);
  const [stretch, setStretch] = useState(1);
  const [settled, setSettled] = useState(false);
  const boxRef = useRef(null);
  const settle = useRef(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    setSettled(false);
    let settleFrame = null;
    const move = () => {
      const active = wrap.querySelector('[data-active="true"]');
      if (!active) { boxRef.current = null; setBox(null); return; }
      const next = {
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      };
      const previous = boxRef.current;
      if (previous && Math.abs(previous.left - next.left) > 1) {
        setStretch(fluidPillStretch(previous, next));
        clearTimeout(settle.current);
        settle.current = setTimeout(() => setStretch(1), 210);
      }
      boxRef.current = next;
      setBox(next);
      window.cancelAnimationFrame(settleFrame);
      settleFrame = window.requestAnimationFrame(() => setSettled(true));
    };
    move();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(move) : null;
    observer?.observe(wrap);
    window.addEventListener("resize", move);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", move);
      clearTimeout(settle.current);
      window.cancelAnimationFrame(settleFrame);
    };
  }, deps);

  return { box, stretch, settled };
}

/* The goo.
 *
 * A blur followed by a steep alpha curve: neighbouring shapes bleed into each
 * other's blur, the curve snaps the result back to hard edges, and what was two
 * separate elements becomes one surface with a meniscus between them. It is the
 * whole effect, and it is four lines of SVG — which is why it is written here
 * rather than pulled in. This app has no animation library on purpose.
 *
 * The filter is expensive enough to matter, so it is only mounted where it is
 * used, and never while motion is reduced — under `prefers-reduced-motion` the
 * elements simply do not travel, and a filter over stationary shapes is cost
 * with no picture. */
function GooeyFilter({ id, blur = 5 }) {
  return (
    <svg aria-hidden="true" className="absolute w-0 h-0" style={{ position: "absolute" }}>
      <defs>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

/* Search, as a control that says what it is.
 *
 * It was a bare ⌕ with no label and no hint that ⌘K reaches it — the fastest way
 * into the app, and the least legible thing in the header. On hover or focus the
 * glyph's bubble separates, travels, and merges into a pill carrying the word and
 * the shortcut; the goo filter is what makes those two shapes read as one
 * material stretching rather than two divs moving.
 *
 * The flourish never delays anything: the click opens the palette on the way
 * down, whatever the animation is doing. Reduced motion gets the label without
 * the travel. */
function GooeySearch({ T, surface, reduced, onOpen }) {
  const [open, setOpen] = useState(false);
  const filterId = useRef(`goo-search-${Math.random().toString(36).slice(2, 9)}`).current;
  const expanded = open && !reduced;

  return (
    /* The expanded width is reserved at rest and the control is right-aligned
       inside it. Growing a flex child on hover would otherwise shove TODAY and
       NOTES sideways every time the pointer crossed this corner — a flourish
       that moves other people's buttons is a bug. */
    <div className="relative flex items-center justify-end" style={{ width: 104 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {/* Mounted for as long as the control is, and applied unconditionally.
          Switching `filter` on and off around a transition re-rasterises the
          element at both ends, which reads as a snap at the start and another at
          the finish — the thing it is decorating is the thing it was ruining.
          Over two static shapes it costs nothing visible. */}
      {!reduced && <GooeyFilter id={filterId} blur={4} />}
      <div className="flex items-center justify-end" style={{ filter: reduced ? "none" : `url(#${filterId})` }}>
        {/* The bubble is a second shape that exists only to merge with the pill.
            It sits under the label and shares its surface, so the goo has two
            like-coloured things to join. */}
        <span aria-hidden="true" className="absolute rounded-full" style={{
          width: 26, height: 26, right: expanded ? 74 : 3, background: surface,
          opacity: expanded ? 1 : 0,
          transition: reduced ? "none" : "right 380ms cubic-bezier(.22,1.1,.28,1), opacity 220ms ease",
          pointerEvents: "none",
        }} />
        <button
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={() => { setOpen(false); onOpen(); }}
          data-test="search-control"
          aria-label="Search, or run a command"
          aria-keyshortcuts="Meta+K Control+K"
          className="nb-tap relative flex items-center justify-center gap-1.5 h-8 overflow-hidden"
          style={{
            width: expanded ? 104 : 32,
            borderRadius: 999,
            background: expanded ? surface : "transparent",
            color: T.dim,
            transition: reduced ? "none" : "width 380ms cubic-bezier(.22,1.1,.28,1), background 220ms ease",
          }}>
          <span className="text-sm shrink-0">⌕</span>
          <span style={{
            fontFamily: MONO, color: T.dim,
            opacity: expanded ? 1 : 0,
            transition: reduced ? "none" : "opacity 180ms ease 120ms",
          }} className="text-xs tracking-widest whitespace-nowrap">⌘K</span>
        </button>
      </div>
    </div>
  );
}

function LiquidPillIndicator({ T, box, stretch, settled = true, z = 0 }) {
  if (!box) return null;
  return (
    <span aria-hidden="true" data-test="pill-indicator" data-width={Math.round(box.width)} className="absolute" style={{
      left: box.left, width: box.width, top: box.top, height: box.height,
      background: T.accent, borderRadius: 999, zIndex: z,
      transform: `scaleX(${stretch})`, transformOrigin: "center",
       transition: settled ? "left 420ms cubic-bezier(.22,1.1,.28,1), width 420ms cubic-bezier(.22,1.1,.28,1), height 300ms ease, top 300ms ease, transform 210ms cubic-bezier(.3,1.4,.4,1)" : "none",
      pointerEvents: "none",
    }} />
  );
}

/* The liquid idiom for a multi-select pill: there is no single selection to slide,
   so each pill's fill grows in and shrinks out with the same spring instead. */
function LiquidFill({ T, on, radius = 999 }) {
  return (
    <span aria-hidden="true" className="nb-chip-fill absolute inset-0"
      style={{ background: T.accent, borderRadius: radius,
        transform: on ? "scale(1)" : "scale(.55)", opacity: on ? 1 : 0 }} />
  );
}

function PillNav({ T, value, options, onPick, ariaLabel, surface = "transparent", className = "", style = {} }) {
  const wrapRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(wrapRef, [value, options.length]);
  /* No goo here, deliberately. A trailing droplet was tried and removed: it can
     only be mounted once the pill is already moving, which means mounting it at
     the position it was supposed to be travelling *from* — so it flickered at
     the destination instead of lagging behind. And switching `filter` on for the
     duration of a transition re-rasterises the element at both ends: a snap in,
     a snap out, on every press. One shape sliding cleanly beats two shapes and a
     filter that pops. */

  return (
    <div ref={wrapRef} role="tablist" aria-label={ariaLabel} className={`relative flex ${className}`}
      style={{ background: surface, borderRadius: 999, ...style }}>
      <LiquidPillIndicator T={T} box={box} stretch={stretch} settled={settled} />
      {options.map(([key, label]) => {
        const on = key === value;
        return (
          <button key={String(key)} role="tab" aria-selected={on} data-active={on ? "true" : "false"}
            onClick={() => onPick(key)}
            className="relative px-3 py-1 text-xs tracking-widest"
            style={{ fontFamily: MONO, color: on ? T.on : T.dim, borderRadius: 999, zIndex: 1, transition: "color 260ms ease" }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* §4.4/§4.6. The same expansion inside the task's grouped rules card, which reads as
   one block of rules with its icons on the right — so the choices cannot bring their
   own surface without breaking the group. */
function InlineChoiceRow({ T, icon, label, sub, options, value, onPick, dot = null, divider = false, editable = true, onBeginEdit = null }) {
  const [open, setOpen] = useState(false);
  const optionsRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(optionsRef, [value, options.length, open]);
  useEffect(() => { if (!editable) setOpen(false); }, [editable]);
  return (
    <div style={{ borderBottom: divider ? `1px solid ${T.line}` : "none" }}>
      <button disabled={!editable} onClick={(event) => { if (!open) onBeginEdit?.(event.currentTarget); setOpen(!open); }} className="nb-tap flex items-center gap-3 px-3 py-3 w-full text-left disabled:opacity-100">
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            {dot && <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: dot(value) }} />}
            <span className="block text-sm truncate">{label}</span>
          </span>
          {sub && <span style={{ color: T.dim }} className="block text-xs mt-0.5">{sub}</span>}
        </span>
        {editable && <span style={{ color: T.dim, transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms cubic-bezier(.2,.8,.25,1)" }}
          className="text-xs shrink-0">▾</span>}
        <span style={{ color: T.dim }} className="text-sm shrink-0">{icon}</span>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 240ms cubic-bezier(.2,.8,.25,1)" }}>
        <div className="overflow-hidden" inert={!open}
          style={{ visibility: open ? "visible" : "hidden", transition: `visibility 0s linear ${open ? 0 : 240}ms` }}>
          <div ref={optionsRef} className="relative flex flex-wrap gap-1 px-3 pb-3">
            <LiquidPillIndicator T={T} box={box} stretch={stretch} settled={settled} />
            {options.map(([key, text]) => {
              const on = key === value;
              return (
                <button key={String(key)} data-active={on ? "true" : "false"}
                  onClick={() => { onPick(key); setOpen(false); }}
                  className="nb-tap relative inline-flex items-center gap-1.5 px-2.5 py-1 text-xs tracking-widest"
                  style={{
                    fontFamily: MONO, borderRadius: 999, zIndex: 1,
                    background: "transparent", color: on ? T.on : T.dim,
                    border: `1px solid ${on ? "transparent" : T.line}`,
                    transition: "border-color 180ms ease, color 260ms ease",
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
function InlineStamp({ T, type, value, display, onCommit, ariaLabel, min, className = "", style = {}, dark = false, editable = true, onBeginEdit = null }) {
  return (
    <span className="nb-stamp relative inline-flex items-center">
      <span aria-hidden="true" className={className} style={{ ...style, pointerEvents: "none" }}>{display}</span>
      {editable && <InlineNative T={T} dark={dark} type={type} value={value} min={min} onCommit={onCommit} ariaLabel={ariaLabel} onBeginEdit={onBeginEdit}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0, cursor: "pointer", padding: 0, margin: 0 }} />}
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

function Sheet({ T, onClose, title, children, headerAction = null, beforeClose = null, morph = "auto" }) {
  /* Ignore a backdrop dismissal that arrives in the same tap that opened the sheet.
     Belt and braces alongside preventDefault at the source: any future path that
     opens a sheet from a touch inherits the protection. */
  const openedAt = useRef(Date.now());
  const dialogRef = useRef(null);
  const contentRef = useRef(null);
  const openerRef = useRef(null);
  const closeTimer = useRef(null);
  const closingRef = useRef(false);
  const morphRef = useRef(morph);
  morphRef.current = morph;
  const openedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const beforeCloseRef = useRef(beforeClose);
  const [closing, setClosing] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(null);
  const [heightReady, setHeightReady] = useState(false);
  const titleId = useRef(`sheet-title-${Math.random().toString(36).slice(2, 9)}`);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { beforeCloseRef.current = beforeClose; }, [beforeClose]);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (beforeCloseRef.current && beforeCloseRef.current() === false) return;
    closingRef.current = true;
    setClosing(true);
    const panel = dialogRef.current;
    const reduced = typeof window !== "undefined" && (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || (panel && window.getComputedStyle(panel).animationName === "none")
    );
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), reduced ? 0 : (morphRef.current === "notch" ? 260 : 300));
  }, []);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;
    const measure = () => {
      const next = Math.min(content.scrollHeight, Math.round(window.innerHeight * .88));
      setSheetHeight(next);
      /* A notch sheet is mid-scale for its opening animation; letting height
         transition underneath it animates the same box on two curves at once. */
      if (morphRef.current === "notch" && !openedRef.current) return;
      window.requestAnimationFrame(() => setHeightReady(true));
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(content);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [morph]);
  const guardedClose = useCallback(() => {
    if (Date.now() - openedAt.current < 350) return;
    requestClose();
  }, [requestClose]);
  useEffect(() => {
    if (morph !== "notch") { openedRef.current = true; return undefined; }
    const panel = dialogRef.current;
    if (!panel) return undefined;
    const done = (event) => {
      /* Only the panel's own entry animation, not one bubbling from inside it. */
      if (event.target !== panel || closingRef.current) return;
      openedRef.current = true;
      setHeightReady(true);
    };
    panel.addEventListener("animationend", done);
    /* A belt for the case the animation never fires — a hidden tab, or reduced
       motion stripping it — so the sheet can never be left unable to resize. */
    const fallback = window.setTimeout(() => { openedRef.current = true; setHeightReady(true); }, 600);
    return () => {
      panel.removeEventListener("animationend", done);
      window.clearTimeout(fallback);
    };
  }, [morph]);

  useEffect(() => {
    const h = (e) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
      window.clearTimeout(closeTimer.current);
    };
  }, [requestClose]);
  useLayoutEffect(() => {
    openerRef.current = document.activeElement;
    const panel = dialogRef.current;
    const opener = openerRef.current;
    /* The pressed control is the truer origin: on touch the opener never receives
       focus, and a confirmation raised from inside another sheet should grow from
       the button that asked for it, not from whatever still holds focus. */
    let triggerRect = recentFluidTriggerRect();
    if (!triggerRect && opener instanceof HTMLElement && opener !== document.body && opener.isConnected) {
      const rect = opener.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) triggerRect = rect;
    }
    if (panel && triggerRect) {
      /* Measure the panel as it will finally be, not as the entry animation has
         already made it.
         A CSS animation's first keyframe is applied the moment the element is
         first styled — which is before any layout effect runs — so the rect read
         here is the *pill*: `.nb-fluid`'s 0% is `translateY(26px) scale(.965)`,
         and `getBoundingClientRect` reports transformed boxes. The morph was
         being computed from its own output, so it started a few per cent too
         small and 26px too low and then snapped to the real box on the last
         frame. Suppressing the animation for the length of one measurement costs
         nothing — this is all still before the first paint — and the animation is
         handed back the correct numbers to start from. */
      const suppressed = panel.style.animation;
      panel.style.animation = "none";
      const panelRect = panel.getBoundingClientRect();
      panel.style.animation = suppressed;
      /* Named `geometry`, not `morph`: the prop of that name says *how* to move,
         this says *how far*, and letting the local shadow the prop silently
         compared an object to a string and lost the notch every time. */
      const geometry = fluidMorphFromRects(triggerRect, panelRect);
      panel.dataset.fluidOrigin = morphRef.current === "notch" ? "notch" : "trigger";
      panel.style.setProperty("--fluid-x", `${geometry.translateX}px`);
      panel.style.setProperty("--fluid-y", `${geometry.translateY}px`);
      panel.style.setProperty("--fluid-sx", String(geometry.scaleX));
      panel.style.setProperty("--fluid-sy", String(geometry.scaleY));
    }
    const frame = window.requestAnimationFrame(() => focusDialogOnOpen(dialogRef.current));
    /* `nb-sheet-h` transitions height, and it used to switch on one frame into
       the notch's own 380ms scale — two curves animating the same box, which is
       the bounce. The height transition waits until the shape has finished
       arriving. */
    return () => {
      window.cancelAnimationFrame(frame);
      restoreDialogFocus(openerRef.current);
    };
  }, []);
  return (
    <div className={`nb-scrim ${closing ? "nb-fluid-closing" : ""} fixed inset-0 z-50 flex items-end sm:items-center justify-center`} style={{ background: "rgba(0,0,0,0.72)" }} onClick={guardedClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId.current} data-test="sheet" data-sheet-title={title || "Details"}
        onKeyDown={(event) => trapDialogTab(event, dialogRef.current)} onClick={(e) => e.stopPropagation()}
        className={`nb-fluid nb-sheet-scroll ${heightReady ? "nb-sheet-h" : ""} ${closing ? "nb-fluid-closing" : ""} w-full sm:max-w-md overflow-y-auto nb-s`} style={{ background: T.card, color: T.text, maxHeight: "88vh", height: sheetHeight == null ? "auto" : sheetHeight }}>
        <div ref={contentRef} className="nb-notch-body">
        <div className="sticky top-0 flex items-center justify-between px-4 sm:px-5 pt-3 pb-2" style={{ background: T.card, zIndex: 3 }}>
          <span id={titleId.current} style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">{title || "Details"}</span>
          <div className="flex items-center gap-1.5">
            {headerAction}
            <button onClick={requestClose} aria-label="Close" style={{ color: T.dim, fontFamily: MONO }} className="nb-tap -mr-1 px-2 py-1 text-sm">✕</button>
          </div>
        </div>
        {/* Padding deeper than the panel's 24px corner radius, so the last row
            ends on straight edge instead of dying into the curve. */}
        <div className="px-4 sm:px-5" style={{ paddingBottom: 28 }}>{children}</div>
        {/* A sheet capped at 88vh cuts its last row mid-height with no sign that
            there is more. This rides the bottom of the scroll box and fades the
            cut into the panel, so "there is more below" is visible rather than
            inferred. It is inert, and it disappears when nothing is clipped. */}
        <div aria-hidden="true" className="sticky bottom-0 pointer-events-none" style={{
          height: 24, marginTop: -24,
          background: `linear-gradient(to bottom, transparent, ${T.card})`,
        }} />
        </div>
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
      <PillNav T={T} ariaLabel="Notebook views" value={view} options={tabs} onPick={onView}
        className="w-full [&>button]:flex-1 [&>button]:py-2"
        style={{ border: `1px solid ${T.line}` }} />
      {view !== "archived" && (
        <button onClick={onNew} style={{ fontFamily: MONO, color: T.on, background: T.accent }} className="nb-tap nb-liquid w-full py-3 mt-4 text-xs font-bold tracking-widest">+ NEW NOTE</button>
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

/* One input over two different things: what you have, and what you can do.
 *
 * The rows arrive already ordered and already flattened — creating, then
 * commands, then results — so the highlight can walk the whole sheet with one
 * index and Enter always means "the row I am looking at". Group headers are
 * drawn from the rows rather than passed separately, so a section with nothing
 * in it cannot leave its title stranded. */
function CommandPalette({ T, surface, query, onQueryChange, rows, placeholder, footer, queryIssues = [] }) {
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  /* A new query is a new list; keeping the old index would leave the highlight
     on whatever happened to slide into that position. */
  useEffect(() => { setActive(0); }, [query, rows.length]);

  const clamp = (index) => (rows.length ? (index + rows.length) % rows.length : 0);
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => clamp(i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => clamp(i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); rows[active]?.run(); }
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = null;
  return (
    <div>
      <input autoFocus data-test="palette-input" value={query} onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown} placeholder={placeholder} aria-label="Search or run a command"
        style={{ background: "transparent", border: `1px solid ${T.line}` }} className="w-full px-3 py-3 text-base font-semibold" />
      {footer && <p style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest pt-2">{footer}</p>}
      <div ref={listRef} className="mt-3 flex flex-col" data-test="palette-rows">
        {queryIssues.length > 0 && <p style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest py-2">IGNORED FILTER · {queryIssues[0].token.toUpperCase()}</p>}
        {query && rows.length === 0 && <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic py-4">Nothing matches that. Try a shorter word.</p>}
        {rows.map((row, index) => {
          const header = row.group !== lastGroup ? row.group : null;
          lastGroup = row.group;
          const on = index === active;
          return (
            <React.Fragment key={row.key}>
              {header && <p style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest pt-3 pb-1">{header}</p>}
              <button data-test={row.testId} data-active={on} onClick={row.run} onMouseEnter={() => setActive(index)}
                className="nb-row flex items-center gap-2 py-2.5 px-2 text-left" style={{
                  borderBottom: `1px solid ${T.line}`,
                  background: on ? surface : "transparent",
                  borderRadius: on ? 8 : 0,
                }}>
                <span style={{ fontFamily: MONO, color: row.tint ?? T.dim }} className="text-xs tracking-widest shrink-0 w-12">{row.badge}</span>
                <span className="flex-1 text-sm truncate">{row.label}</span>
                {row.meta && <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{row.meta}</span>}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* The shortcuts, grouped as they are declared. Rendered from `SHORTCUTS` so the
   sheet cannot claim a key the handler does not answer to. */
function ShortcutSheet({ T, surface }) {
  let lastGroup = null;
  return (
    <div data-test="shortcut-sheet">
      {SHORTCUTS.map((shortcut) => {
        const header = shortcut.group !== lastGroup ? shortcut.group : null;
        lastGroup = shortcut.group;
        return (
          <React.Fragment key={shortcut.keys.join("+")}>
            {header && <p style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest pt-4 pb-1">{header}</p>}
            <div className="flex items-center gap-3 py-2" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="flex gap-1 shrink-0">
                {shortcut.keys.map((key) => (
                  <kbd key={key} style={{ fontFamily: MONO, background: surface, color: T.text, borderRadius: 6 }}
                    className="inline-flex items-center justify-center min-w-7 px-1.5 py-1 text-xs font-bold">{key}</kbd>
                ))}
              </span>
              <span className="flex-1 text-sm">{shortcut.does}</span>
            </div>
          </React.Fragment>
        );
      })}
      <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic pt-4">
        Shortcuts are ignored while you are typing in a field.
      </p>
    </div>
  );
}

/* What the palette can parse, shown where somebody would look for it: under the
   input, the first time they open it with nothing typed. */
function QuickAddHint({ T }) {
  return (
    <div data-test="quick-add-hint" className="pt-1">
      <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic pb-2">
        Type a whole line and it will be read as one — “Lunch w/ Sara Tue 1pm 45m”.
      </p>
      <div className="flex flex-col gap-0.5">
        {QUICK_ADD_SYNTAX.map((entry) => (
          <div key={entry.token} className="flex items-baseline gap-2">
            <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs shrink-0 w-44 truncate">{entry.token}</span>
            <span style={{ color: T.dim }} className="text-xs">{entry.means}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Composer({ T, initial, dateLabel, dateKey, onSubmit, onTick, weekStart = 0 }) {
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
  const [link, setLink] = useState(initial.link || "");
  const [note, setNote] = useState(initial.note || "");
  const [at, setAt] = useState(initial.at != null ? initial.at : null);
  const [estimate, setEstimate] = useState(initial.estimate != null ? initial.estimate : null);
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
    /* A weekly rule counts its interval in weeks, so which day starts the week
       decides which side of a boundary an occurrence falls on. It has to be the
       same week the grid is drawing. */
    weekStart,
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
  /* An empty link is fine; a non-empty one must be something a Join button could
     actually open, so newly typed junk is caught here rather than silently dropped
     on save. A stored value that was already unparseable is let through untouched —
     an unrelated edit must not hold the whole save hostage or erase the field. */
  const linkUntouched = link.trim() === String(initial.link || "").trim();
  const linkOk = kind !== "event" || !link.trim() || !!normalizeMeetingLink(link) || linkUntouched;
  const ok = title.trim().length > 0 && (allDay || offsetInfo.valid) && linkOk;
  const preview = useMemo(() => {
    if (kind !== "event" || !recurrence || !ok) return [];
    try {
      return previewRecurrence({ id: "preview", title: title.trim(), calendarId: "calendar-default", timing, recurrence }, 5);
    } catch { return []; }
  }, [kind, recurrence && JSON.stringify(recurrence), JSON.stringify(timing), ok]);
  const submit = () => {
    if (!ok) return;
    onSubmit({ id: initial.id, date: unplanned && kind === "task" ? null : date, unplanned, kind, title: title.trim(), cat, start: allDay ? 0 : start, dur: allDay ? 0 : len, xp, place, link: normalizeMeetingLink(link) || link.trim(), note, at, estimate, due: due || null, allDay, endDate, alerts, repeat: repeat && repeat.freq ? repeat : null, recurrence, timing });
  };
  const toTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fromTime = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const setFreq = (f) => { onTick(); setRepeat(f ? { freq: f, interval: 1, byDay: f === "weekly" ? [parseKey(date).getDay()] : undefined, until: (repeat && repeat.until) || "", endMode: "never", missingDatePolicy: "skip" } : null); };
  const dayFilterId = useRef(`goo-days-${Math.random().toString(36).slice(2, 9)}`).current;
  const [osReducedDays] = useState(() => (
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  ));
  /* On for the whole life of the row rather than only while a run exists. The
     merge is what the filter is for, but toggling it as days are picked meant it
     switched on and off under the user's finger — every chip press flickered the
     whole row. Over chips with nothing adjacent it is invisible anyway. */
  const dayGooOff = osReducedDays;

  const toggleDay = (i) => {
    onTick();
    const days = (repeat.byDay || []).includes(i) ? repeat.byDay.filter((d) => d !== i) : [...(repeat.byDay || []), i].sort();
    setRepeat({ ...repeat, byDay: days });
  };

  return (
    <div data-test="composer" data-composer-kind={kind}>
      {!editing && (
        <PillNav T={T} ariaLabel="What to add" value={kind}
          options={[["event", "EVENT"], ["task", "ACTION"]]}
          onPick={(k) => { onTick(); setKind(k); }}
          surface={surface} className="mb-1 p-1 w-full [&>button]:flex-1 [&>button]:py-1.5" />
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
                  setLen(durationFromClockRange(start, fromTime(e.target.value)));
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
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Meeting link — Meet, Zoom, Teams…" inputMode="url"
                style={{ background: surface, border: "none", borderRadius: CARD_R }} className="w-full px-3 py-2.5 text-sm" />
              {!linkOk && (
                <span style={{ fontFamily: MONO, color: NOW_RED }} className="px-1 text-xs tracking-widest">DOESN'T LOOK LIKE A LINK</span>
              )}
            </>
          ) : (
            <>
              <Chips T={T} surface={surface} label="REWARD" value={xp} onChange={(v) => { onTick(); setXp(v); }}
                options={[[30, "+30"], [40, "+40"], [50, "+50"], [60, "+60"]]} />
              <DurationPicker T={T} label="ESTIMATE" value={estimate} onPick={(value) => { onTick(); setEstimate(value); }} />
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
              {/* The one place the goo says something rather than decorates: a
                  weekly rule of Mon–Wed–Fri is three separate marks, and one of
                  Mon–Tue–Wed is a *run*. Letting adjacent selected days merge
                  into a single bar makes that difference visible at a glance,
                  which is the actual question this control is asking. */}
              {repeat.freq === "weekly" && (
                <div className="flex gap-1" style={{ filter: dayGooOff ? "none" : `url(#${dayFilterId})` }}>
                  {!dayGooOff && <GooeyFilter id={dayFilterId} blur={5} />}
                  {Array.from({ length: 7 }, (_, offset) => (weekStart + offset) % 7).map((i) => {
                    const d = DAY_LETTERS[i];
                    const on = (repeat.byDay || []).includes(i);
                    return (
                      <button key={d} data-test="weekday-chip" data-weekday={i} data-on={on ? "true" : "false"}
                        aria-pressed={on} aria-label={DAY_LETTERS[i]}
                        onClick={() => toggleDay(i)} className="nb-tap relative flex-1 py-1 text-xs tracking-widest"
                        style={{ fontFamily: MONO, borderRadius: 999, background: "transparent", color: on ? T.on : T.dim,
                          border: `1px solid ${on ? "transparent" : T.line}`, transition: "color 260ms ease, border-color 180ms ease" }}>
                        <LiquidFill T={T} on={on} />
                        <span className="relative" style={{ zIndex: 2 }}>{d[0]}</span>
                      </button>
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
  const wrapRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(wrapRef, [multi ? -1 : value, options.length]);
  const pick = (key) => {
    if (!multi) return onChange(key);
    const set = new Set(value ?? []);
    if (set.has(key)) set.delete(key); else set.add(key);
    onChange([...set].sort((a, b) => a - b));
  };
  return (
    <div>
      {label && <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mb-1">{label}</span>}
      <div ref={wrapRef} className={`relative flex gap-1 ${wrap ? "flex-wrap" : ""}`}>
        {!multi && <LiquidPillIndicator T={T} box={box} stretch={stretch} settled={settled} z={1} />}
        {options.map(([key, text]) => {
          const on = selected(key);
          return (
            <button key={String(key)} onClick={() => pick(key)} data-active={!multi && on ? "true" : "false"}
              className={`nb-tap relative ${wrap ? "" : "flex-1"} inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs tracking-widest`}
              style={{
                fontFamily: MONO, borderRadius: 999,
                background: multi || !on ? surface : "transparent",
                color: on ? T.on : T.dim,
                transition: "background 180ms ease, color 260ms ease, transform 120ms ease",
              }}>
              {multi && <LiquidFill T={T} on={on} />}
              <span className="relative inline-flex items-center gap-1.5" style={{ zIndex: 2 }}>
                {dot && <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: on ? T.on : dot(key) }} />}
                {text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
