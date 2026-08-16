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
  instantiateBuiltInNoteTemplate,
  isEmptyNote,
  listBuiltInNoteTemplates,
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
import {
  loadPlannerState,
  readPlannerRecoverySnapshot,
  savePlannerState,
} from "./platform/persistence/plannerStateStore.js";
import { createBlankPlannerState } from "./platform/persistence/plannerStateImport.js";
import { readPlannerImportText } from "./platform/persistence/plannerStateRead.js";
import {
  replacePlannerNotebook,
  wipePlannerNotebook,
} from "./platform/persistence/plannerNotebookReplace.js";
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
import { normalizeMeetingLink } from "./features/planner/meetingLink.js";
import {
  applyTaskCompleteUndo,
  createTaskCompleteUndoPayload,
  isTaskCompleteUndo,
} from "./features/planner/taskCompleteUndo.js";
import {
  gestureChangedAnything,
  EMPTY_SPACE_LIFT_MS,
  isResizable,
  liftDelayForTimelineTarget,
  movedEnoughToCancelHold,
  proposeGesture,
  shouldCommitActionSwipe,
  timelineTouchIntent,
} from "./features/planner/timelineGesture.js";
import {
  INTERACTION_ORIGINS,
  INTERACTION_OWNERS,
  activateWithMovement,
  armInteraction,
  cancelActiveInteraction,
  cancelArmedInteraction,
  clickFollowsCancelledArm,
  createIdleInteraction,
  createScrollSession,
  restoreCancelledInteraction,
  resolveShortEventEdge,
} from "./features/planner/timelineInteractionState.js";
import { loadBackupRecord, saveBackupRecord } from "./platform/persistence/backupStore.js";
import { textToNoteBlocks } from "./features/notes/noteText.js";
import { eventNoteLink, taskNoteLink } from "./features/notes/contextLink.js";
import {
  applyScrollSnapshot, focusDialogOnOpen, restoreDialogFocus, scrollChildIntoContainer, snapshotAncestorScroll, trapDialogTab,
} from "./features/accessibility/dialogFocus.js";
import {
  applyBulkTaskAction,
  createTaskMutationUndoPayload,
  deleteTaskFromPlannerState,
  restoreDeletedTaskInPlannerState,
  restoreTaskPlannedDates,
} from "./features/planner/taskMutations.js";
import { resolveTaskForInspection } from "./features/planner/taskInspection.js";
import { eventForUi } from "./features/planner/eventPresentation.js";
import { projectPlannerDay } from "./features/planner/dayProjection.js";
import { findOpenSlots } from "./features/planner/slotSearch.js";
import {
  busyFractionForDay, busyFractionsForRange, monthDensitiesForRange, projectDayPeek, projectPlannerWeek,
} from "./features/planner/weekProjection.js";
import {
  applyDetailDraft,
  buildDetailEntryPayload,
  buildTaskWritePatch,
  durationFromClockRange,
  durationFromDatedClockRange,
  hasDetailDraft,
} from "./features/planner/detailDraft.js";
import SegmentedProgress from "./features/planner/SegmentedProgress.jsx";
import TimelineActionCard from "./features/planner/TimelineActionCard.jsx";
import { HAPTIC_PATTERNS, triggerDeviceHaptic } from "./features/feedback/haptics.js";
import {
  fluidMorphFromRects,
  fluidPillBox,
  fluidPillStretch,
} from "./features/motion/fluidGeometry.js";
import {
  VIEW_PILL_COMPACT_MAX,
  VIEW_PILL_ICON,
  VIEW_PILL_WORD,
  viewPillTrackWidth,
  viewPillSlots,
  viewPillIndicatorBox,
  viewPillFlipOffset,
  viewPillLabelClip,
} from "./features/motion/viewPills.js";
import {
  deliverReminder,
  dismissReminder,
  getDueReminders,
  getExpiredReminders,
  getMissedReminders,
  getReminderIntents,
  markRemindersMissed,
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
import { classifyStorageFailures } from "./platform/resilience/storageStatus.js";
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
  eventsToIcs,
} from "./domains/calendar/index.js";
import { addDays, addDaysToKey, diffDays, isDateKey, keyOf, parseKey } from "./shared/time/dateKey.js";
import { createId } from "./shared/ids.js";
import { addMinutesToLocalDateTime, localDateTimeToEpochMinutes } from "./shared/time/localDateTime.js";
import { getOffsetCandidates } from "./shared/time/timezone.js";
import { THEMES } from "./design/themes.js";
import { readable } from "./design/contrast.js";

/* ═══════════════════════ TOKENS ═══════════════════════ */

const GESTURE_HINT_KEY = "nbmp:ui:gestureHintSeen";

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
/* The ribbon is a rolling window, not a date limit. Keeping roughly two years
   mounted gives the person room to browse without making the DOM grow forever;
   reaching an edge shifts that window by one year and preserves the viewport. */
const RIBBON_RADIUS_DAYS = 366;
const RIBBON_SHIFT_DAYS = 366;
const RIBBON_EDGE_BUFFER_DAYS = 14;
const RIBBON_FALLBACK_CELL_WIDTH = 80;
const RIBBON_RENDER_BUFFER_DAYS = 18;
const RIBBON_RENDER_WINDOW_DAYS = 56;
const TIMELINE_FOCUS_TRIGGER_PX = 24;
/* A short phone window can leave less vertical room than a three-hour card at
   the preferred scale. Forty-four pixels still gives an hour a real touch-sized
   row; below that, density starts making the timeline less usable than scrolling. */
const MIN_DAY_HOUR_H = 44;
/* How close the now marker has to get to an hour before that hour's label steps
   aside. The marker and a label are each about eighteen pixels tall, so inside
   this distance they overlap and read as one smudged mark rather than two
   times — and at that distance the marker *is* the hour, so there is nothing
   the label was still saying. */
const DAY_H = HOUR_H * 24;
const HOLD_MS = 420;
const LIFT_MS = 300;
/* The notch morph's one dial. Every other beat in the sequence — the stage
   machine below, the content cascade's lead, step and fade — is a fraction of
   this, so retuning the whole choreography is one number rather than nine that
   have to be kept in agreement.
   667ms is the reference motion's container duration (20 frames at 30fps). It is
   roughly twice what this used to run at, and that is the point: a 56x28 button
   becoming a full sheet in 320ms reads as a pop rather than a morph. If it ever
   fails the fortieth-time test, lower this and the cascade compresses with it. */
const MORPH_MS = 667;
/* The order the three surfaces lie in, left to right. It is the one place that
   knows a view has neighbours, and both the switch animation's direction and
   the swipe's target come from it. */
const VIEW_ORDER = ["timeline", "agenda", "actions"];
/* Fractions of MORPH_MS, matching the reference: content starts a third of the
   way through the container's travel, each group is a step behind the last, and
   each takes half the container's duration to arrive. */
const MORPH_LEAD = 0.35;
const MORPH_STEP = 0.2;
const MORPH_FADE = 0.5;
const SNAP = 5;
const NOW_RED = "#C43A56";
const ALERT_CHOICES = [0, 5, 15, 30, 60];
const DAY_LETTERS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function ribbonRangeAround(anchorKey) {
  return {
    startKey: addDaysToKey(anchorKey, -RIBBON_RADIUS_DAYS),
    endKey: addDaysToKey(anchorKey, RIBBON_RADIUS_DAYS + 1),
  };
}

/* Every shortcut the keydown handler implements, in one list, because a shortcut
   nobody can find is a shortcut nobody has. The cheat sheet renders this rather
   than a second hand-written copy, so the two cannot drift apart. */
const SHORTCUTS = [
  { group: "MOVING", keys: ["←", "→"], does: "Previous / next day" },
  { group: "MOVING", keys: ["T"], does: "Jump to today" },
  { group: "MOVING", keys: ["F"], does: "Focus timeline" },
  { group: "MOVING", keys: ["["], does: "Zoom out — day, week, month" },
  { group: "MOVING", keys: ["]"], does: "Zoom in" },
  { group: "MAKING", keys: ["N"], does: "New event" },
  { group: "MAKING", keys: ["A"], does: "New action" },
  { group: "MAKING", keys: ["⌘K", "/"], does: "Search, run a command, or type to create" },
  { group: "ACTIONS", keys: ["C"], does: "Complete the first open action" },
  { group: "ACTIONS", keys: ["D"], does: "Defer the first open action by a day" },
  { group: "GESTURES", keys: ["HOLD"], does: "Hold an empty slot to create" },
  { group: "GESTURES", keys: ["DRAG"], does: "Hold and drag an event or action to move it" },
  { group: "GESTURES", keys: ["EDGE"], does: "Drag an event edge to resize it" },
  { group: "GESTURES", keys: ["SWIPE →"], does: "Swipe a scheduled action right to complete it" },
  { group: "GESTURES", keys: ["SCROLL"], does: "Scroll the timeline without creating" },
  { group: "ELSEWHERE", keys: ["⌘Z"], does: "Undo the last change" },
  { group: "ELSEWHERE", keys: ["?"], does: "This list" },
  { group: "ELSEWHERE", keys: ["Esc"], does: "Close whatever is open" },
];

/* Three voices, and the face is how you know which one is speaking.
 *
 * DISPLAY is what the app says to you — titles, headings, controls, the labels
 * on its own sections. MONO is what it measures: times, durations, counts, the
 * hour rail. VOICE is what was written rather than computed — a note's body, and
 * the app's own asides.
 *
 * Mono stays because a calendar is a table of numbers. "10:00 AM" and "11:30 AM"
 * are the same width, times align down the rail, and durations stack in columns
 * without a single alignment hack. It just stops doing everyone else's job as
 * well: it used to be on 229 elements, including every title and button.
 *
 * The stacks themselves live in index.css as custom properties, so the CSS and
 * the inline styles cannot drift apart. `SANS` is gone — it named Inter, which
 * was never shipped in any build, so the stack silently fell through to the
 * system face for the life of the project. */
const DISPLAY = "var(--font-display)";
const MONO = "var(--font-data)";
const SERIF = "var(--font-voice)";

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
/* Persisted records (events, tasks, notes, exceptions, awards) go through
   createId() — crypto.randomUUID — so two writes cannot collide on a 7-char
   Math.random token. Ephemeral React keys reuse the same helper; a UUID in a
   toast key is harmless and keeps one id story in this file. */
const uid = createId;
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
const FLUID_TRIGGER_MAX_AGE_MS = 900;
let lastFluidTriggerRect = null;
let lastFluidTriggerAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (event) => {
    const el = event.target instanceof Element
      ? event.target.closest("button,[role='button'],summary,label,[data-event-id],[data-task-chip]")
      : null;
    const rect = el?.getBoundingClientRect();
    lastFluidTriggerRect = rect && rect.width > 0 && rect.height > 0
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      : null;
    lastFluidTriggerAt = el ? Date.now() : 0;
  }, true);
  window.addEventListener("keydown", () => { lastFluidTriggerRect = null; lastFluidTriggerAt = 0; }, true);
}
function recentFluidTriggerRect() {
  /* Keep a geometry snapshot rather than a DOM node. Navigation can legitimately
     unmount the pressed card before the delayed inspector mounts; requiring the
     node to remain connected turned that valid path into a generic fade. A new
     pointer press replaces the snapshot and keyboard opens clear it, so the short
     lifetime still prevents an unrelated control from borrowing an old origin. */
  if (!lastFluidTriggerRect) return null;
  if (Date.now() - lastFluidTriggerAt > FLUID_TRIGGER_MAX_AGE_MS) return null;
  return lastFluidTriggerRect;
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

/* A row that scrolls sideways with no scrollbar and no cue does not look like a
   row that scrolls — it looks like a row that is broken, because the chip at the
   edge is simply cut in half against the panel's corner. This reports which ends
   still have something beyond them, so the row can fade there and only there: a
   fade on a row that already fits would just be a chip with a dimmed corner. */
function useEdgeFade(externalRef = null) {
  const ownRef = useRef(null);
  const ref = externalRef ?? ownRef;
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges((current) => {
      const next = { start: el.scrollLeft > 2, end: max > 2 && el.scrollLeft < max - 2 };
      return current.start === next.start && current.end === next.end ? current : next;
    });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);
  /* No dependency list: the row's contents change without its box changing, and
     an observer watching the box would never hear about it. */
  useEffect(measure);
  if (!edges.start && !edges.end) return [ref, {}];
  const mask = `linear-gradient(to right, transparent 0, #000 ${edges.start ? 18 : 0}px,`
    + ` #000 calc(100% - ${edges.end ? 22 : 0}px), transparent 100%)`;
  return [ref, { maskImage: mask, WebkitMaskImage: mask }];
}

/* A reminder is a bell.
   The job was being done by `◔`, a quarter-filled clock face, which at 12px in
   dim grey reads as a smudge rather than a symbol — it sat on a card beside ⚠, ↻
   and ↗, all of which say what they are at a glance. Drawn rather than typed, so
   it is the same shape at every size and in every font, and inherits the colour
   of whatever it is standing next to. */
function BellIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path d="M4.1 6.6a3.9 3.9 0 0 1 7.8 0c0 2.8.9 3.7 1.4 4.3h-10.6c.5-.6 1.4-1.5 1.4-4.3Z" />
      <path d="M6.4 13.1a1.75 1.75 0 0 0 3.2 0" />
    </svg>
  );
}

/* Small controls use the same drawn language as the bell. Unicode arrows and
   dingbats inherit whichever font happens to be active, so their weight and
   baseline changed between themes and made compact controls look unfinished. */
function UiIcon({ size = 14, viewBox = "0 0 16 16", children, fill = "none", stroke = "currentColor", strokeWidth = 1.6, style = {} }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0, pointerEvents: "none", ...style }}>
      {children}
    </svg>
  );
}

function MenuIcon({ size = 14 }) {
  return <UiIcon size={size}><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></UiIcon>;
}

function MoreIcon({ size = 14 }) {
  return <UiIcon size={size} fill="currentColor" stroke="none"><circle cx="3.25" cy="8" r="1.15" /><circle cx="8" cy="8" r="1.15" /><circle cx="12.75" cy="8" r="1.15" /></UiIcon>;
}

function ChevronIcon({ direction = "right", size = 12 }) {
  const angle = direction === "left" ? 180 : direction === "up" ? -90 : direction === "down" ? 90 : 0;
  return <UiIcon size={size} style={{ transform: `rotate(${angle}deg)` }}><path d="m5 2.75 5.25 5.25L5 13.25" /></UiIcon>;
}

function CloseIcon({ size = 14 }) {
  return <UiIcon size={size}><path d="m4 4 8 8M12 4 4 12" /></UiIcon>;
}

function ExternalLinkIcon({ size = 12 }) {
  return <UiIcon size={size}><path d="M9 3h4v4M13 3 7.25 8.75" /><path d="M11 8.5v3a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 3 11.5v-5A1.5 1.5 0 0 1 4.5 5h3" /></UiIcon>;
}

function RepeatIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M2.75 5.25h8.5l-1.75-1.75M13.25 10.75h-8.5l1.75 1.75" /><path d="M11.25 5.25A2.25 2.25 0 0 1 13 7.4M4.75 10.75A2.25 2.25 0 0 1 3 8.6" /></UiIcon>;
}

function WarningIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="m8 2.15 5.45 10.7H2.55L8 2.15Z" /><path d="M8 5.35v3.2M8 10.55h.01" /></UiIcon>;
}

function ArrowUpIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M8 13V3M4.5 6.5 8 3l3.5 3.5" /></UiIcon>;
}

function ArrowRightIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M3 8h10M9 4l4 4-4 4" /></UiIcon>;
}

function GripIcon({ size = 14 }) {
  return <UiIcon size={size}><path d="M5 3.5h.01M8 3.5h.01M11 3.5h.01M5 8h.01M8 8h.01M11 8h.01M5 12.5h.01M8 12.5h.01M11 12.5h.01" strokeWidth="2.4" /></UiIcon>;
}

function SearchIcon({ size = 14 }) {
  return <UiIcon size={size}><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></UiIcon>;
}

function PinIcon({ size = 14, filled = false }) {
  return <UiIcon size={size} fill={filled ? "currentColor" : "none"}><path d="m8 2.35 1.55 3.15 3.45.5-2.5 2.45.6 3.45L8 10.3l-3.1 1.6.6-3.45L3 6l3.45-.5L8 2.35Z" /></UiIcon>;
}

function CheckIcon({ size = 12 }) {
  return <UiIcon size={size}><path d="m3 8.2 3 3 7-7" /></UiIcon>;
}

function LocationIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M8 13s4-3.55 4-7a4 4 0 0 0-8 0c0 3.45 4 7 4 7Z" /><circle cx="8" cy="6" r="1.25" /></UiIcon>;
}

function LinkIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="m6.25 9.75-1 1a2.1 2.1 0 0 1-3-3l1.5-1.5a2.1 2.1 0 0 1 3-.05" /><path d="m9.75 6.25 1-1a2.1 2.1 0 0 1 3 3l-1.5 1.5a2.1 2.1 0 0 1-3 .05" /><path d="m5.75 8.25 4.5-.5" /></UiIcon>;
}

function ClockIcon({ size = 13 }) {
  return <UiIcon size={size}><circle cx="8" cy="8" r="5.25" /><path d="M8 5v3.25l2.25 1.25" /></UiIcon>;
}

function CalendarIcon({ size = 13 }) {
  return <UiIcon size={size}><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M5 2.5v2M11 2.5v2M2.5 6.25h11" /></UiIcon>;
}

function ListIcon({ size = 13 }) {
  return <UiIcon size={size}><path d="M3 4.5h10M3 8h10M3 11.5h7" /></UiIcon>;
}

function BlockIcon({ size = 13 }) {
  return <UiIcon size={size}><circle cx="8" cy="8" r="5.25" /><path d="m4.5 4.5 7 7" /></UiIcon>;
}

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
  const [recoverySnapshot, setRecoverySnapshot] = useState(null);
  const [ready, setReady] = useState(false);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  const [zoom, setZoom] = useState("day");
  const [dateKey, setDateKey] = useState(keyOf(new Date()));
  const [ribbonRange, setRibbonRange] = useState(() => ribbonRangeAround(dateKey));
  const ribbonSpan = diffDays(ribbonRange.endKey, ribbonRange.startKey);
  const ribbonInitialWindowStart = Math.max(0, Math.min(
    ribbonSpan - RIBBON_RENDER_WINDOW_DAYS,
    diffDays(dateKey, ribbonRange.startKey) - RIBBON_RENDER_BUFFER_DAYS,
  ));
  const [ribbonWindowStart, setRibbonWindowStart] = useState(ribbonInitialWindowStart);
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [sheet, setSheet] = useState(false);
  const [inspect, setInspect] = useState(null);
  const [inspectExitSnapshot, setInspectExitSnapshot] = useState(null);
  const [composer, setComposer] = useState(null);
  /* Commands such as MARK COMPLETE and saving a new entry used to set their
     parent state to null directly. React then removed the Sheet before its own
     exit lifecycle could run, so the close button morphed while commands faded.
     A monotonic signal lets Sheet own the same close path for those commands. */
  const [sheetCloseSignals, setSheetCloseSignals] = useState({ inspect: 0, composer: 0, scopeAsk: 0 });
  const requestSheetClose = useCallback((kind) => {
    setSheetCloseSignals((current) => ({ ...current, [kind]: current[kind] + 1 }));
  }, []);
  const [noteEdit, setNoteEdit] = useState(null);
  const [noteHistory, setNoteHistory] = useState(null);
  /* The details sheet has a deliberate reading state and an editing state. The
     record stays in place; only its controls and compact action pill change. */
  const [detailEditing, setDetailEditing] = useState(false);
  const [inspectField, setInspectField] = useState(null);
  const [discardAsk, setDiscardAsk] = useState(false);
  /* Pending record-field edits stay outside canonical planner state. */
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    setDraft(null);
    setDetailEditing(false);
    setInspectField(null);
    setDiscardAsk(false);
    setInspectExitSnapshot(null);
  }, [inspect?.id, inspect?.kind]);
  const [notebook, setNotebook] = useState(null);
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [shortcuts, setShortcuts] = useState(false);
  const [gestureHintVisible, setGestureHintVisible] = useState(true);
  useEffect(() => {
    let live = true;
    storage.get(GESTURE_HINT_KEY)
      .then((result) => {
        const value = result && typeof result === "object" && Object.hasOwn(result, "value") ? result.value : result;
        if (live && value === "true") setGestureHintVisible(false);
      })
      .catch(() => { /* A blocked preference store should leave the hint available for this session. */ });
    return () => { live = false; };
  }, []);
  const dismissGestureHint = useCallback(() => {
    setGestureHintVisible(false);
    storage.set(GESTURE_HINT_KEY, "true").catch(() => { /* Session dismissal is still useful when storage is blocked. */ });
  }, []);
  const [backupRecord, setBackupRecord] = useState(null);
  const [scopeAsk, setScopeAsk] = useState(null);
  const [reward, setReward] = useState(null);
  const [levelFlash, setLevelFlash] = useState(null);
  const [undo, setUndo] = useState(null);
  const [gesture, setGesture] = useState(null);
  const [draftPreview, setDraftPreview] = useState(null);
  useEffect(() => {
    if (!composer) setDraftPreview(null);
  }, [composer]);
  const [turn, setTurn] = useState(null);
  const [swipe, setSwipe] = useState(0);
  const [viewDir, setViewDir] = useState(1);
  const [taskSwipe, setTaskSwipe] = useState(null);
  const [snapping, setSnapping] = useState(false);
  const [alertToast, setAlertToast] = useState(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [importError, setImportError] = useState(null);
  const [notebookUnreadable, setNotebookUnreadable] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(null);
  const [smartView, setSmartView] = useState("today");
  const [dependencyPicker, setDependencyPicker] = useState(null);
  const [listManager, setListManager] = useState(false);
  const [viewMode, setViewMode] = useState("timeline");
  const [viewHandoff, setViewHandoff] = useState(0);
  const [timelineFocused, setTimelineFocused] = useState(false);
  const [timelineFocusSource, setTimelineFocusSource] = useState(null);
  const timelineChromeInnerRef = useRef(null);
  const timelineChromeObserverRef = useRef(null);
  const [timelineChromeHeight, setTimelineChromeHeight] = useState(null);
  useEffect(() => {
    timelineUserScrollRef.current = false;
    timelineScrollSessionRef.current?.expire?.();
    timelineAutoPositionRef.current = false;
    setTimelineFocused(false);
    setTimelineFocusSource(null);
  }, [dateKey, viewMode, zoom]);
  const attachTimelineChromeInner = useCallback((inner) => {
    timelineChromeObserverRef.current?.disconnect();
    timelineChromeObserverRef.current = null;
    timelineChromeInnerRef.current = inner;
    if (!inner) return;
    const measure = () => setTimelineChromeHeight(Math.ceil(inner.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    timelineChromeObserverRef.current = observer;
  }, []);
  /* The shell has explicit phases so the dark application frame is stable before
     the page moves, and so close can reverse cleanly instead of unmounting the
     navigation underneath its exit transition. */
  const [navPhase, setNavPhase] = useState("closed");
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
  /* What came due while nothing was running to say so. Gathered once, on the
     open that finds it, and then reported rather than rung. */
  const [missedReport, setMissedReport] = useState(null);
  const [missedSheet, setMissedSheet] = useState(false);
  const missedChecked = useRef(false);
  const [preferences, setPreferences] = useState(null);
  const [motivationLedger, setMotivationLedger] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsSaveBlocked, setDiagnosticsSaveBlocked] = useState(false);
  const [preferencesSaveBlocked, setPreferencesSaveBlocked] = useState(false);
  const [motivationSaveBlocked, setMotivationSaveBlocked] = useState(false);
  const [storageFailures, setStorageFailures] = useState(() => new Set(storage.writable ? [] : ["device"]));

  const stripRef = useRef(null);
  const activeRef = useRef(null);
  const ribbonShiftPendingRef = useRef(false);
  const ribbonScrollAnchorRef = useRef(null);
  const ribbonCenterPendingRef = useRef(false);
  const ribbonPositionedRef = useRef(false);
  const ribbonWindowStartRef = useRef(ribbonInitialWindowStart);
  const ribbonScrollLockRef = useRef(false);
  const navToggleRef = useRef(null);
  const navFirstItemRef = useRef(null);
  const navCloseTimer = useRef(null);
  const navPhaseRef = useRef(navPhase);
  navPhaseRef.current = navPhase;
  /* The timeline's touch gestures are delegated to the stream element rather than
     bound per card, so the effect that installs them has to know when that element
     is *replaced* — and it is, routinely: the page wrapper is keyed on the day
     turn, so every step to another day, and every change of zoom, builds a new
     stream node. A plain ref cannot say that. It changes silently, the effect does
     not re-run, and the listeners are left on a node that is no longer in the
     document: on a phone the whole timeline goes dead from the first time you move
     off today — no tap opens a card, no press lifts one, nothing at all. A mouse
     never noticed, because its handlers are React props that every render puts
     back.
     Holding the node in state as well as a ref makes the identity of the element
     an ordinary dependency, so the listeners follow it wherever it goes rather
     than relying on someone remembering to list every cause of a remount. */
  const streamRef = useRef(null);
  const timelineScrollTopRef = useRef(0);
  const timelineAutoPositionRef = useRef(false);
  const timelineUserScrollRef = useRef(false);
  const timelineScrollSessionRef = useRef(createScrollSession());
  const ribbonNodeRef = useRef(null);
  const interactionRef = useRef(createIdleInteraction());
  const [streamNode, setStreamNode] = useState(null);
  const [dayHourHeight, setDayHourHeight] = useState(HOUR_H);
  const dayHeight = dayHourHeight * 24;
  const nowLabelClearanceMin = Math.round((18 / dayHourHeight) * 60);
  const attachStream = useCallback((node) => {
    streamRef.current = node;
    timelineScrollTopRef.current = node?.scrollTop ?? 0;
    setStreamNode(node);
  }, []);
  const attachRibbon = useCallback((node) => {
    stripRef.current = node;
    if (ribbonNodeRef.current !== node) {
      ribbonNodeRef.current = node;
      ribbonPositionedRef.current = false;
    }
  }, []);
  useEffect(() => {
    if (!streamNode) return undefined;
    const fitTimeline = () => {
      /* Keep a three-hour block wholly inspectable in the stream that actually
         exists after the header, anytime shelf, backup notice and action handle
         have taken their space. The scale stays at 68px whenever there is room;
         only short windows compact it. */
      const fitted = Math.floor(Math.max(0, streamNode.clientHeight - 8) / 3);
      const next = Math.max(MIN_DAY_HOUR_H, Math.min(HOUR_H, fitted));
      setDayHourHeight((current) => (current === next ? current : next));
    };
    fitTimeline();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(fitTimeline);
    observer.observe(streamNode);
    return () => observer.disconnect();
  }, [streamNode]);
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
  const completeTaskRef = useRef(() => {});
  const tappedRef = useRef(false);
  const monthHoldT = useRef(null);
  const monthHeldRef = useRef(false);
  const monthHoverT = useRef(null);

  const storageStatus = useMemo(() => classifyStorageFailures(storageFailures), [storageFailures]);
  const storageBad = storageStatus.canonical;
  const supportingStorageBad = storageStatus.supporting.length > 0;
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
  /* The last shared event/action lane layout computed while nothing was being
     transformed — see `timelineLayout`. */
  const laneFreeze = useRef(null);
  const [anyTimeRef, anyTimeFade] = useEdgeFade();
  /* The strip is a scroll container too, and the same argument applies: without
     this the day cell at the edge is sliced down the middle by the arrow beside
     it, which reads as a rendering fault rather than "there is more this way". */
  const [, stripFade] = useEdgeFade(stripRef);
  const revealRibbonCell = useCallback((behavior = "auto", center = false) => {
    const strip = stripRef.current;
    const cell = activeRef.current;
    if (!strip || !cell) return;
    const inset = 24;
    const left = cell.offsetLeft;
    const right = left + cell.offsetWidth;
    const visibleLeft = strip.scrollLeft;
    const visibleRight = visibleLeft + strip.clientWidth;
    let next = center
      ? Math.max(0, left - (strip.clientWidth - cell.offsetWidth) / 2)
      : visibleLeft;
    if (!center && left < visibleLeft + inset) next = Math.max(0, left - inset);
    else if (!center && right > visibleRight - inset) next = Math.max(0, right - strip.clientWidth + inset);
    if (Math.abs(next - visibleLeft) < 1) return;
    /* Returning from Actions remounts the strip. Instant placement keeps the
       selected cell inside the first painted frame instead of waiting on a
       smooth scroll that can be cancelled mid-flight. */
    strip.scrollTo({ left: next, behavior: behavior === "smooth" && ribbonPositionedRef.current ? "smooth" : "auto" });
  }, []);
  const setRibbonWindow = useCallback((next) => {
    const proposed = typeof next === "function" ? next(ribbonWindowStartRef.current) : next;
    const clamped = Math.max(0, Math.min(ribbonSpan - RIBBON_RENDER_WINDOW_DAYS, Math.round(proposed)));
    if (clamped === ribbonWindowStartRef.current) return;
    ribbonScrollLockRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => { ribbonScrollLockRef.current = false; }));
    ribbonWindowStartRef.current = clamped;
    setRibbonWindowStart(clamped);
  }, [ribbonSpan]);
  const shiftRibbon = useCallback((direction) => {
    if (ribbonShiftPendingRef.current) return;
    const strip = stripRef.current;
    const cell = strip?.querySelector("[data-day]");
    const width = cell?.getBoundingClientRect().width || RIBBON_FALLBACK_CELL_WIDTH;
    const signedDays = direction === "before" ? -RIBBON_SHIFT_DAYS : RIBBON_SHIFT_DAYS;
    ribbonShiftPendingRef.current = true;
    ribbonScrollAnchorRef.current = direction === "before"
      ? width * RIBBON_SHIFT_DAYS
      : -width * RIBBON_SHIFT_DAYS;
    setRibbonWindow((current) => current + (direction === "before" ? RIBBON_SHIFT_DAYS : -RIBBON_SHIFT_DAYS));
    setRibbonRange((current) => ({
      startKey: addDaysToKey(current.startKey, signedDays),
      endKey: addDaysToKey(current.endKey, signedDays),
    }));
  }, [setRibbonWindow]);
  const onRibbonScroll = useCallback(() => {
    const strip = stripRef.current;
    if (!strip || ribbonShiftPendingRef.current || ribbonScrollLockRef.current) return;
    const cell = strip.querySelector("[data-day]");
    const width = cell?.getBoundingClientRect().width || RIBBON_FALLBACK_CELL_WIDTH;
    const edge = Math.max(160, width * RIBBON_EDGE_BUFFER_DAYS);
    if (strip.scrollLeft <= edge) { shiftRibbon("before"); return; }
    if (strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - edge) { shiftRibbon("after"); return; }
    setRibbonWindow(Math.floor(strip.scrollLeft / width) - RIBBON_RENDER_BUFFER_DAYS);
  }, [setRibbonWindow, shiftRibbon]);
  useLayoutEffect(() => {
    const anchor = ribbonScrollAnchorRef.current;
    if (anchor == null || !stripRef.current) return;
    stripRef.current.scrollLeft = Math.max(0, stripRef.current.scrollLeft + anchor);
    ribbonScrollAnchorRef.current = null;
    ribbonShiftPendingRef.current = false;
  }, [ribbonRange.startKey, ribbonRange.endKey]);
  const startGesture = (g) => { gestureRef.current = g; setGesture(g); };
  const endGesture = () => { gestureRef.current = null; setGesture(null); };

  useEffect(() => {
    let dead = false;
    (async () => {
      let state;
      let isFirstRun = false;
      let nextRecoverySnapshot = null;
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
        /* Truly empty storage is a first run: the sample week is a teaching
           notebook, and the welcome sheet asks before it becomes "yours". */
        state = loaded.state || migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(seed()))));
        isFirstRun = !loaded.state;
        /* A blocked or missing store is not an unreadable notebook. Load already
           succeeded as empty; failing to write the sample must leave autosave
           off and say NOT SAVING, not pretend a stored copy could not be read. */
        if (!loaded.state) {
          try {
            await savePlannerState(storage, state);
            reportStorage("planner", false);
          } catch {
            setSaveBlocked(true);
            reportStorage("planner", true, "write-failed");
          }
        } else {
          reportStorage("planner", false);
        }
      } catch (error) {
        /* Unreadable storage is not a first run. Opening the sample week here
           used to present someone else's demo as the user's notebook, and a
           later successful save would have overwritten the damaged record.
           Open a blank in-memory notebook, keep autosave off, and tell the
           user the stored copy was not touched. Export still prefers the raw
           recovery snapshot when one can be read. */
        state = createBlankPlannerState();
        nextRecoverySnapshot = await readPlannerRecoverySnapshot(storage);
        setSaveBlocked(true);
        setNotebookUnreadable(true);
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
        setRecoverySnapshot(nextRecoverySnapshot);
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

  useEffect(() => {
    if (ready) {
      setLoadingSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setLoadingSlow(true), 2000);
    return () => clearTimeout(timer);
  }, [ready]);

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

  /* The theme, plus the same colours as they have to be to be *read*.
     Thirteen of the fifteen themes had at least one text pair below the
     legibility floor and nothing had ever checked — Dusty Rose on linen was
     2.53:1 against a 4.5 bar. Editing the accents would have edited the themes,
     so `dim` and `accent` keep their authored values everywhere they fill,
     border or dot, and `dimText`/`accentText` are the versions that go on a
     glyph. On a theme that already passed they are the same string.
     src/design/contrast.test.js holds all fifteen to it. */
  const T = useMemo(() => {
    const theme = THEMES.find((t) => t.id === preferences?.display.themeId) || THEMES[0];
    const read = readable(theme);
    return {
      ...theme,
      dimText: read.dimOnBg,
      dimOnCard: read.dimOnCard,
      accentText: read.accentOnBg,
      accentOnCard: read.accentOnCard,
    };
  }, [preferences]);
  const beep = useSynth(preferences?.feedback.sound ?? true);
  const buzz = useCallback((pattern) => {
    if (preferences?.feedback.haptics) triggerDeviceHaptic(pattern);
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
  const compactViewPills = useCompactViewPills();
  const selectViewMode = useCallback((mode, source = "programmatic") => {
    /* Alternating names lets the new surface begin its handoff in the same
       render as the view change. A next-frame class would first paint the
       replacement fully visible, then flash it back to transparent. */
    setViewHandoff((current) => (
      source === "pointer" && !reducedMotion && mode !== viewMode
        ? (current === 1 ? 2 : 1)
        : 0
    ));
    /* Which way the views lie relative to each other, so the arriving surface
       enters from the side it came from rather than from a fixed direction. A
       switch that always slides the same way tells you a view changed but not
       which way you moved through them. */
    const from = VIEW_ORDER.indexOf(viewMode);
    const to = VIEW_ORDER.indexOf(mode);
    if (from !== -1 && to !== -1 && from !== to) setViewDir(to > from ? 1 : -1);
    setViewMode(mode);
    if (mode === "actions") setSheet(false);
  }, [reducedMotion, viewMode]);
  const tm = (m) => fmtTime(m, clock);

  const navOpen = navPhase === "opening" || navPhase === "open";
  const openNavigation = useCallback(() => {
    window.clearTimeout(navCloseTimer.current);
    navPhaseRef.current = "opening";
    setNavPhase("opening");
  }, []);
  const finishNavigationClose = useCallback(() => {
    if (navPhaseRef.current !== "closing") return;
    window.clearTimeout(navCloseTimer.current);
    navPhaseRef.current = "closed";
    setNavPhase("closed");
    requestAnimationFrame(() => navToggleRef.current?.focus({ preventScroll: true }));
  }, []);
  const closeNavigation = useCallback(() => {
    if (navPhaseRef.current === "closed" || navPhaseRef.current === "closing") return;
    navPhaseRef.current = "closing";
    setNavPhase("closing");
    window.clearTimeout(navCloseTimer.current);
    /* transitionend is the clock. This is only a safety net for a browser that
       cancels the transition (for example during a visibility change). */
    navCloseTimer.current = window.setTimeout(finishNavigationClose, reducedMotion ? 50 : 500);
  }, [finishNavigationClose, reducedMotion]);
  const finishNavigationOnSurfaceTransition = useCallback((event) => {
    if (event.target !== event.currentTarget || (event.propertyName && event.propertyName !== "transform")) return;
    finishNavigationClose();
  }, [finishNavigationClose]);
  useEffect(() => {
    if (navPhase !== "opening") return undefined;
    const frame = requestAnimationFrame(() => {
      setNavPhase("open");
      navFirstItemRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [navPhase]);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && navPhase !== "closed") {
        event.preventDefault();
        closeNavigation();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeNavigation, navPhase]);
  useEffect(() => () => window.clearTimeout(navCloseTimer.current), []);

  /* The theme lives in state, so the page around the app has to follow it: the body
     (otherwise overscroll shows a mismatched strip), the browser chrome on mobile,
     and color-scheme — which is what makes the native date and time pickers in the
     composer legible instead of dark-on-dark. */
  useEffect(() => {
    document.body.style.background = T.bg;
    const ground = isDark(T.bg) ? "dark" : "light";
    document.documentElement.style.colorScheme = ground;
    /* Shadows and the sheen are per-ground and live in index.css. This is the
       app's own fifteen themes, not the operating system's preference, so it is
       stamped from the theme rather than read from a media query — someone
       running a cream theme on a dark OS must get the cream shadows. */
    document.documentElement.dataset.ground = ground;
    /* The accent as a lit surface rather than a flat fill — derived, never
       authored. Fifteen themes times two hand-picked gradient stops is thirty
       hex values to keep in agreement, and a theme in this app has always been
       one colour on one ground. So the two stops come out of the accent itself
       and a new theme still costs exactly one hex.

       It goes on the three places the accent already dominates — the primary
       button, the selected day, the elapsed fill — and never behind text. */
    const root = document.documentElement.style;
    root.setProperty("--accent-solid", T.accent);
    root.setProperty("--accent-lit", mixHex(T.accent, "#FFFFFF", 0.18));
    root.setProperty("--accent-deep", mixHex(T.accent, "#000000", 0.12));
    root.setProperty("--nb-line", T.line);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", T.bg);
  }, [T]);

  /* Opt-in, and absent by default: with no `data-surfaces` the accent fill is
     the flat colour the theme has always been. */
  useEffect(() => {
    const lit = Boolean(preferences?.display?.litSurfaces);
    if (lit) document.documentElement.dataset.surfaces = "lit";
    else delete document.documentElement.dataset.surfaces;
  }, [preferences?.display?.litSurfaces]);

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

  const ribbonWindowEnd = Math.min(ribbonSpan, ribbonWindowStart + RIBBON_RENDER_WINDOW_DAYS);
  const ribbonDays = useMemo(
    () => Array.from(
      { length: Math.max(0, ribbonWindowEnd - ribbonWindowStart) },
      (_, i) => parseKey(addDaysToKey(ribbonRange.startKey, ribbonWindowStart + i)),
    ),
    [ribbonRange.startKey, ribbonWindowStart, ribbonWindowEnd],
  );
  useEffect(() => {
    if (dateKey >= ribbonRange.startKey && dateKey < ribbonRange.endKey) return;
    /* A month jump, an agenda jump, or a long run of arrow presses can land
       outside the current rolling window. Recenter around the requested day,
       then let the layout effect place that cell without a blank intermediate
       ribbon. */
    ribbonCenterPendingRef.current = true;
    ribbonScrollAnchorRef.current = null;
    ribbonShiftPendingRef.current = false;
    setRibbonWindow(RIBBON_RADIUS_DAYS - RIBBON_RENDER_BUFFER_DAYS);
    setRibbonRange(ribbonRangeAround(dateKey));
  }, [dateKey, ribbonRange.startKey, ribbonRange.endKey, setRibbonWindow]);
  useLayoutEffect(() => {
    if (zoom !== "week" && zoom !== "day") return;
    const index = diffDays(dateKey, ribbonRange.startKey);
    if (index < ribbonWindowStart || index >= ribbonWindowEnd) {
      ribbonCenterPendingRef.current = true;
      setRibbonWindow(index - RIBBON_RENDER_BUFFER_DAYS);
    }
  }, [dateKey, ribbonRange.startKey, ribbonWindowStart, ribbonWindowEnd, zoom, setRibbonWindow]);
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
    fromDate: weekStartKey,
    todayDate: todayKey,
    currentMinute: nowMin,
    durationMinutes: slotDur,
    days: 7,
    limit: 12,
  }) : []), [db, slotDur, weekStartKey, todayKey, nowMin]);

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
  const scheduledTasks = useMemo(
    () => dayTasks.filter((task) => task.planned.startMinute != null),
    [dayTasks],
  );
  /* Children deliberately stay out of top-level day queries. Keep their compact
     progress with the parent, though, so a promotion remains discoverable from
     the scheduled Action that owns it. */
  const subtaskProgressByParent = useMemo(() => {
    const progress = new Map();
    for (const task of db?.tasks ?? []) {
      if (!task.parentTaskId || task.status === "cancelled") continue;
      const current = progress.get(task.parentTaskId) ?? { done: 0, total: 0 };
      current.total += 1;
      if (task.status === "completed") current.done += 1;
      progress.set(task.parentTaskId, current);
    }
    return progress;
  }, [db]);
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

  /* Events and scheduled actions occupy one timeline, so they must be packed in
     one collision graph. Packing the event list alone and then painting actions
     full-width made an action at 9:00 cover every 9:00 event even though each
     individual renderer looked correct in isolation. */
  const timelineLayout = useMemo(() => {
    const g = gesture;
    const movingEvent = g && (g.mode === "move" || g.mode === "resize-end" || g.mode === "resize-start");
    const movingTask = g && g.mode === "task";
    const resizingTask = g && g.mode === "task-resize";
    const transforming = movingEvent || movingTask || resizingTask;
    const list = [
      ...timed.map((event) => ({
        ...(movingEvent && g.id === event.id ? { ...event, start: g.start, dur: g.dur } : event),
        timelineKind: "event",
        timelineKey: `event:${event.id}`,
      })),
      ...scheduledTasks.map((task) => ({
        ...task,
        start: movingTask && g.id === task.id && g.start != null ? g.start : task.planned.startMinute,
        dur: resizingTask && g.id === task.id ? g.dur : (task.planned.estimateMinutes ?? 30),
        timelineKind: "task",
        timelineKey: `task:${task.id}`,
      })),
    ];
    const packed = packEventLanes(list);
    /* Lanes are frozen for the duration of a transform. Repacking every frame
       makes surrounding cards slide under the hand and changes the held card's
       width mid-gesture. They settle together once the gesture lands. */
    if (!transforming) {
      laneFreeze.current = new Map(packed.map((item) => [item.timelineKey, { lane: item.lane, cols: item.cols }]));
      return {
        events: packed.filter((item) => item.timelineKind === "event"),
        tasks: packed.filter((item) => item.timelineKind === "task"),
      };
    }
    const frozen = laneFreeze.current;
    const laidOut = frozen
      ? packed.map((item) => (frozen.has(item.timelineKey) ? { ...item, ...frozen.get(item.timelineKey) } : item))
      : packed;
    return {
      events: laidOut.filter((item) => item.timelineKind === "event"),
      tasks: laidOut.filter((item) => item.timelineKind === "task"),
    };
  }, [timed, scheduledTasks, gesture]);
  const events = timelineLayout.events;
  const plannedTasks = timelineLayout.tasks;

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

  useLayoutEffect(() => {
    if (viewMode === "actions" || (zoom !== "week" && zoom !== "day")) return;
    if (!ready || !activeRef.current || !stripRef.current) return;
    const initial = !ribbonPositionedRef.current;
    /* Remounts and date/view changes re-anchor. Virtual-window shifts from the
       person's own scroll must not yank the selected cell back into view. */
    if (!initial && ribbonCenterPendingRef.current === false) {
      revealRibbonCell("smooth", false);
      return;
    }
    revealRibbonCell("auto", initial);
    ribbonPositionedRef.current = true;
    ribbonCenterPendingRef.current = false;
  }, [dateKey, ready, zoom, viewMode, revealRibbonCell]);
  useLayoutEffect(() => {
    if (!ribbonCenterPendingRef.current || !activeRef.current || !stripRef.current) return;
    revealRibbonCell("auto");
    ribbonCenterPendingRef.current = false;
  }, [ribbonRange.startKey, ribbonRange.endKey, ribbonWindowStart, mounted, revealRibbonCell]);

  useEffect(() => {
    if (!ready || !streamRef.current) return;
    const first = timed.slice().sort((a, b) => a.start - b.start)[0];
    const anchor = isToday ? nowMin : first ? first.start : 480;
    const nextScrollTop = Math.max(0, (anchor / 1440) * dayHeight - 140);
    timelineAutoPositionRef.current = true;
    streamRef.current.scrollTop = nextScrollTop;
    timelineScrollTopRef.current = nextScrollTop;
    requestAnimationFrame(() => requestAnimationFrame(() => { timelineAutoPositionRef.current = false; }));
    /* `zoom` belongs here: changing it rebuilds the surface above the day, which
       remounts the stream with a scrollTop of zero. Without it, zooming out to the
       month and back left the day sitting at midnight — eight hours above anything
       the day actually contains — and the only clue was an empty grid. */
  }, [ready, dateKey, turn, zoom, dayHeight]);

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

  /* A web page cannot set an alarm for a time when it is not running: the only
     mechanisms are a push from a server or a notification-trigger API that never
     shipped, and this notebook has no server by design. So the honest thing is
     not to pretend, but to say what was missed as soon as there is someone to
     say it to — once per open, after the ledger has been reconciled, so the list
     reflects the notebook as it stands rather than as it was left. */
  useEffect(() => {
    if (!db || !remindersReady || missedChecked.current) return;
    missedChecked.current = true;
    const missed = getMissedReminders(reminderRecords, nowLocal);
    const expired = getExpiredReminders(reminderRecords, nowLocal);
    /* Too old to be worth mentioning, but they cannot stay active or every open
       would examine them again for the life of the notebook. */
    if (expired.length) {
      setReminderRecords((records) => markRemindersMissed(records, expired.map((r) => r.id), { now: nowLocal }));
    }
    if (missed.length) setMissedReport(missed);
  }, [db, remindersReady, reminderRecords, nowLocal]);

  const closeMissedReport = useCallback(() => {
    setMissedSheet(false);
    setMissedReport((report) => {
      if (report?.length) {
        setReminderRecords((records) => markRemindersMissed(records, report.map((r) => r.id), { now: nowLocal }));
      }
      return null;
    });
  }, [nowLocal]);

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

  /* The month grid asks these of 42 cells. Asked one cell at a time they are 84
     range queries per step, each re-expanding the same six weeks of recurrence;
     asked once for the whole grid they are two. Keyed by the grid's first day so
     the work is redone when the grid moves and not when anything else renders. */
  const monthStartKey = monthGrid.length ? keyOf(monthGrid[0]) : todayKey;
  const monthDensities = useMemo(
    () => (db && zoom === "month" ? monthDensitiesForRange(db, monthStartKey, monthGrid.length) : null),
    [db, zoom, monthStartKey, monthGrid.length],
  );
  const monthBusy = useMemo(
    () => (db && zoom === "month" ? busyFractionsForRange(db, monthStartKey, monthGrid.length) : null),
    [db, zoom, monthStartKey, monthGrid.length],
  );

  const densityOf = useCallback((d) => {
    if (!db) return 0;
    const k = keyOf(d);
    return getVisibleOccurrencesForRange(db, k, addDaysToKey(k, 1)).length + getDayTasks(db, k).filter((t) => t.status !== "completed").length;
  }, [db, ov]);
  const ribbonDensityStartKey = addDaysToKey(ribbonRange.startKey, ribbonWindowStart);
  const ribbonDensitySpan = Math.max(0, ribbonWindowEnd - ribbonWindowStart);
  const ribbonDensities = useMemo(
    () => (db && (zoom === "week" || zoom === "day")
      ? monthDensitiesForRange(db, ribbonDensityStartKey, ribbonDensitySpan)
      : new Map()),
    [db, zoom, ribbonDensityStartKey, ribbonDensitySpan],
  );

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
  /* One NOW signal needs one owner. Events keep precedence — they are fixed
     commitments — but every scheduled, incomplete Action owns the time the
     timeline renders for it. An Action without an authored estimate already
     receives the renderer's 30-minute default duration, so excluding it here
     made the NOW rule cut through a visibly occupied card. */
  const liveAction = !liveEvent && isToday
    ? plannedTasks.find((task) => task.status !== "completed"
      && nowMin >= task.start && nowMin < task.start + task.dur)
    : null;
  const liveTimelineItem = liveEvent ?? liveAction;
  const livePct = liveTimelineItem ? (nowMin - liveTimelineItem.start) / liveTimelineItem.dur : 0;
  const laneL = liveTimelineItem ? (liveTimelineItem.lane / liveTimelineItem.cols) * 100 : 0;

  /* ─── day turning ─── */
  const ensureRibbonDateVisible = useCallback((key) => {
    if (zoom !== "week" && zoom !== "day") return;
    if (key < ribbonRange.startKey || key >= ribbonRange.endKey) {
      ribbonCenterPendingRef.current = true;
      setRibbonWindow(RIBBON_RADIUS_DAYS - RIBBON_RENDER_BUFFER_DAYS);
      return;
    }
    const index = diffDays(key, ribbonRange.startKey);
    if (index < ribbonWindowStart || index >= ribbonWindowEnd) {
      ribbonCenterPendingRef.current = true;
      setRibbonWindow(index - RIBBON_RENDER_BUFFER_DAYS);
    }
  }, [ribbonRange.startKey, ribbonRange.endKey, ribbonWindowStart, ribbonWindowEnd, setRibbonWindow, zoom]);
  const goDay = useCallback((n) => {
    beep("page");
    setTurn({ dir: n, k: uid() });
    setDateKey((k) => {
      const next = keyOf(addDays(parseKey(k), n));
      ensureRibbonDateVisible(next);
      return next;
    });
  }, [beep, ensureRibbonDateVisible]);
  const jumpTo = (k) => {
    /* Guard the entry point rather than every caller: a bad key used to reach
       parseKey and take the whole screen down with it. */
    if (!isDateKey(k) || k === dateKey) return;
    beep("page");
    setTurn({ dir: k > dateKey ? 1 : -1, k: uid() });
    ensureRibbonDateVisible(k);
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
  /* A horizontal drag across the body moves between the three views, not
     between days.
     Both readings are horizontal, and one surface cannot serve both without a
     modifier nobody would find. The ribbon is already a horizontally scrolling
     row of dates sitting directly above this one, so day-turn has a home that
     is more discoverable than the gesture it lost — while "drag the page to the
     next page" is what a page-level horizontal swipe means on both phone
     platforms. Arrow keys, TODAY and the ribbon all still turn the day, and the
     turn animation is unchanged; only the trigger moved. */
  const onSwipeEnd = () => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (s && s.live && Math.abs(s.dx) > 64) {
      const from = VIEW_ORDER.indexOf(viewMode);
      /* Clamped, never wrapped. Falling off Actions back onto Timeline would
         make the three surfaces a carousel, and they are not one — the ends are
         ends, and running into one should feel like it. */
      const to = Math.max(0, Math.min(VIEW_ORDER.length - 1, from + (s.dx < 0 ? 1 : -1)));
      /* Drop the drag offset in the same commit as the switch and without a
         transition. Springing the page back while the arriving view plays its
         own travel animates two transforms against each other on nested
         elements, which is the jump. Only the switch should play. */
      setSnapping(true);
      setSwipe(0);
      if (from !== -1 && to !== from) selectViewMode(VIEW_ORDER[to], "pointer");
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
      if ((e.key === "f" || e.key === "F") && viewMode === "timeline" && (zoom === "day" || zoom === "week")) {
        e.preventDefault();
        beep("tick");
        setTimelineFocusSource("manual"); setTimelineFocused((current) => !current);
        return;
      }
      if (e.key === "[") { e.preventDefault(); zoomOut(); }
      if (e.key === "]") { e.preventDefault(); zoomIn(); }
      if (e.key === "ArrowRight") goDay(1);
      if (e.key === "ArrowLeft") goDay(-1);
      if (e.key === "t" || e.key === "T") jumpTo(todayKey);
      /* N and A open a sheet whose first field autofocuses. Without
         preventDefault the same keystroke then lands in that field, so the
         composer opened with "n" already typed into the title. */
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setComposer({ kind: "event", start: startSlot(nowMin), dur: 60, morph: "none" }); }
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
      if (e.key === "a" || e.key === "A") { e.preventDefault(); setComposer({ kind: "task", morph: "none" }); }
      if ((e.key === "z" && (e.metaKey || e.ctrlKey)) && undo) { e.preventDefault(); runUndo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    /* `zoom` is in here because the handler closes over `zoomIn`/`zoomOut`, which
       read it — without it, `[` and `]` would step from whatever zoom the page
       had when the listener was last attached. */
  }, [dateKey, inspect, composer, settings, noteEdit, noteHistory, notebook, search, scopeAsk, goDay, todayKey, nowMin, dayTasks, undo, firstRun, confirmComplete, dependencyPicker, listPicker, pendingImport, peekDay, shortcuts, viewMode, zoom]);

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
    beep("commit"); buzz(HAPTIC_PATTERNS.complete);
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
    flash("Completed", { ...createTaskCompleteUndoPayload(id), rewardSources: rewardSource ? [rewardSource] : [] });
    setConfirmComplete(null);
  };
  /* The delegated native touch listener lives longer than the render that
     installed it. Keep completion pointed at the current notebook and current
     preference state rather than closing over the first render. */
  completeTaskRef.current = completeTask;
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
    /* Reopening is an explicit reversal. Leaving the previous completion toast
       and its UNDO action alive made the next screen claim the task was still
       completed, even though the card had already reopened. */
    clearTimeout(undoT.current);
    undoT.current = null;
    setUndo(null);
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
  const pullOverdue = (ids = null) => {
    const candidates = pullableOverdue(overdue, todayKey);
    const selected = ids == null ? null : new Set(ids);
    const entries = selected ? candidates.filter((entry) => selected.has(entry.id)) : candidates;
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
    requestSheetClose("inspect");
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
    if (kind === "event" || kind === "task") holdInspectForExit(kind, id);
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
      requestSheetClose("inspect"); requestSheetClose("scopeAsk");
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
      requestSheetClose("inspect"); requestSheetClose("scopeAsk");
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
    requestSheetClose("inspect"); setNoteEdit(null); setNoteHistory(null); requestSheetClose("scopeAsk");
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
      if (isTaskCompleteUndo(p)) return applyTaskCompleteUndo(d, p);
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
      ? { title: p.title, start: p.start, dur: p.dur, cat: p.cat, place: p.place, note: p.note, link: normalizeMeetingLink(p.link), allDay: p.allDay, endDate: p.endDate || null, repeat: p.repeat, recurrence: p.recurrence, timing: p.timing, alerts: p.alerts }
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
    requestSheetClose("scopeAsk");
    /* §4.6. A composer has done its job once it writes and gets out of the way. An
       inline edit has not: closing the record you are editing after every field
       would make editing in place worse than the form it replaced. */
    if (p.inline) {
      setDraft(null);
      setDetailEditing(false);
      setInspectField(null);
    } else {
      requestSheetClose("composer");
      requestSheetClose("inspect");
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

  const saveNote = (draft, text, title, provenance = null) => {
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
          /* Which template this came from, and which version of it. The note
             model has recorded this since v8 and nothing has ever been able to
             set it, because nothing could offer a template to start from. */
          ...(provenance ? { templateProvenance: provenance } : {}),
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
    const exportState = recoverySnapshot || db;
    download(`planner-${todayKey}.json`, JSON.stringify(exportState, null, 2), "application/json");
    /* Exporting *is* the backup, however the user got here — from Settings, from
       the storage warning, or from the nudge. All three should quiet it. */
    setBackupRecord((current) => recordBackupTaken(current, { state: exportState, today: todayKey }));
  };
  const exportIcs = () => {
    /* Series-level ICS lives in the calendar portability adapter so a bad
       event can no longer throw out of this handler and abort the download.
       eventForUi is injected — the adapter must not import this file. */
    const { ics, skipped } = eventsToIcs(db.events, eventForUi, normalizeMeetingLink);
    download(`planner-${todayKey}.ics`, ics, "text/calendar");
    if (skipped) beep("abort");
  };
  const importJson = (file) => {
    setImportError(null);
    if (file.size > 2 * 1024 * 1024) {
      setImportError("This file is larger than 2 MB.");
      beep("abort");
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const result = readPlannerImportText(String(r.result || ""), { byteLength: file.size });
      if (!result.ok) {
        setPendingImport(null);
        setImportError(result.error);
        beep("abort");
        return;
      }
      setPendingImport(result.state);
      setImportError(null);
    };
    r.readAsText(file);
  };
  const applyReplacedNotebook = (session) => {
    /* One transaction: notebook + reminders + motivation + backup fingerprint.
       Preferences and diagnostics stay on the device — see plannerNotebookReplace. */
    setDb(session.state);
    setReminderRecords(session.reminderRecords);
    setMotivationLedger(session.motivationLedger);
    setBackupRecord(session.backupRecord);
    setPendingImport(null);
    setImportError(null);
    setNotebookUnreadable(false);
  };
  const wipeAll = () => {
    beep("delete");
    applyReplacedNotebook(wipePlannerNotebook({
      themeId: preferences?.display.themeId,
      sound: preferences?.feedback.sound,
      notifs: preferences?.notifications.systemEnabled,
      clock: preferences?.display.clock,
    }));
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
    return ((clientY - r.top + el.scrollTop) / dayHeight) * 1440;
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
  /* An edge held but not yet dragged, and the call that turns it into a drag —
     both read from the window listener below, which outlives the render that
     installed it. */
  const armedResizeRef = useRef(null);
  const beginResizeRef = useRef(() => {});
  /* When the gesture that just ended did so, so a click chasing it can be told
     apart from a click that means something. A touch's compatibility click can
     trail its release by ~300ms. */
  const gestureEndedAt = useRef(0);
  const clickFollowsGesture = () => Date.now() - gestureEndedAt.current < 350 || clickFollowsCancelledArm(interactionRef.current);

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
    } else if (g.mode === "task" && g.start != null) {
      /* Actions use the same vertical move proposal as events. The old task
         gesture only updated its drop metadata, so the floating label moved
         while the actual card stayed at its original minute. */
      /* Use the pointer's movement from the lift point, with any scroll that
         happened during the drag folded in. Reading an absolute minute from a
         moving scroll node makes a one-hour pointer move turn into a different
         duration when the browser nudges the stream while the card is captured. */
      const originY = Number.isFinite(g.originY) ? g.originY : y;
      const originStart = Number.isFinite(g.originStart) ? g.originStart : g.start;
      const scrollDelta = streamRef.current && Number.isFinite(g.originScrollTop)
        ? streamRef.current.scrollTop - g.originScrollTop
        : 0;
      const pointerMinute = originStart + g.grab + (((y - originY) + scrollDelta) / dayHeight) * 1440;
      next.start = proposeGesture("move", { pointerMinute, grab: g.grab, duration: g.dur }).start;
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

  /* Day and week timelines have different scroll nodes, but focus mode is one
     piece of navigation. Keep the direction/restore rule here so the two views
     cannot drift: a small move away from midnight collapses the chrome, and only
     movement back toward midnight restores it. Initial positioning is explicitly
     silent so opening a week at 10am never collapses the header by accident. */
  const onTimelineScrollPosition = useCallback((nextScrollTop, { initial = false } = {}) => {
    if (!Number.isFinite(nextScrollTop)) return;
    if (initial) {
      timelineScrollTopRef.current = nextScrollTop;
      return;
    }
    if (timelineAutoPositionRef.current) {
      timelineScrollTopRef.current = nextScrollTop;
      return;
    }
    /* Resize, card insertion, and the initial anchor can all move a scroll node
       without a person scrolling it. Focus mode must respond to intent, not to
       those layout corrections; the touch/wheel listeners below mark the first
       real scroll gesture. */
    if (timelineFocusSource === "manual" || !timelineScrollSessionRef.current?.isActive?.()) {
      timelineScrollTopRef.current = nextScrollTop;
      return;
    }
    const previousScrollTop = timelineScrollTopRef.current;
    const movingTowardMidnight = nextScrollTop < previousScrollTop - 1;
    const movingAwayFromMidnight = nextScrollTop > previousScrollTop + 1;
    timelineScrollTopRef.current = nextScrollTop;
    const timelineView = viewMode === "timeline" && (zoom === "day" || zoom === "week");
    const mobileTimeline = window.matchMedia?.("(max-width:1023px)").matches && timelineView;
    if (!mobileTimeline) return;
    if (nextScrollTop <= Math.max(48, dayHourHeight) && movingTowardMidnight) {
      setTimelineFocused(false);
      setTimelineFocusSource("auto");
    }
    if (movingAwayFromMidnight && nextScrollTop >= TIMELINE_FOCUS_TRIGGER_PX) {
      setTimelineFocused(true);
      setTimelineFocusSource("auto");
    }
  }, [dayHourHeight, viewMode, zoom, timelineFocusSource]);

  const abortGesture = () => {
    const cancelled = cancelActiveInteraction(interactionRef.current);
    interactionRef.current = restoreCancelledInteraction(cancelled);
    gestureEndedAt.current = Date.now();
    armedResizeRef.current = null;
    setTaskSwipe(null);
    setDraftPreview(null);
    endGesture();
  };

  const finishGesture = (x, y, { cancelled = false } = {}) => {
    if (cancelled) {
      abortGesture();
      return;
    }
    const g = gestureRef.current;
    const finishedDraft = g?.mode === "draft"
      ? { date: dateKeyRef.current, start: g.start, dur: g.dur }
      : null;
    endGesture();
    if (!g) return;
    /* A drag that ends inside the control it began in still produces a click.
       Letting go of an action's grip would otherwise open the action it had just
       finished resizing. */
    gestureEndedAt.current = Date.now();
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
      /* Keep the final placement visible under the composer. Removing the live
         gesture before opening the sheet made the red placement outline vanish on
         the exact frame where the user needed it as a spatial confirmation. */
      setDraftPreview(finishedDraft);
      setComposer({ kind: "event", start: g.start, dur: g.dur });
    } else if (g.mode === "task") {
      if (g.overDay && g.overDay !== key) moveToDay("task", g.id, g.overDay);
      else if (g.overTask && g.overTask !== g.id) reorderTask(g.id, g.overTask);
      else {
        const el = streamRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            const dropStart = g.start ?? snapTo(minutesAt(y), 15);
            const changed = g.start == null || gestureChangedAnything(
              { start: g.was?.start ?? g.start, duration: g.was?.dur ?? g.dur },
              { start: g.start, duration: g.dur },
            );
            if (changed) scheduleTask(g.id, dropStart);
          }
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
      if (gestureRef.current) return;
      /* Movement means opposite things to the two armed states, which is the
         point of keeping them apart: it cancels a press that was going to lift a
         card, and it starts a press that was holding an edge. */
      if (armedResizeRef.current && movedEnoughToCancelHold(armedResizeRef.current, { x: e.clientX, y: e.clientY }, 2)) {
        beginResizeRef.current(e.clientX, e.clientY);
        return;
      }
      const armed = armedRef.current;
      if (!armed) return;
      if (movedEnoughToCancelHold(armed, { x: e.clientX, y: e.clientY })) {
        disarmHold();
        tappedRef.current = false;
      }
    };
    /* Whatever the release lands on, an edge that was never dragged is not held
       any more. */
    const drop = () => { armedResizeRef.current = null; };
    const cancel = () => {
      armedResizeRef.current = null;
      if (gestureRef.current) abortGesture();
      else interactionRef.current = cancelArmedInteraction(interactionRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
    };
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
    if (e.target.closest?.("a[href], [data-join]")) return;
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
    if (e.target.closest?.("a[href], [data-join]")) {
      disarmHold();
      tappedRef.current = false;
      return;
    }
    disarmHold();
    if (gestureRef.current) return;
    if (tappedRef.current) { tappedRef.current = false; e.stopPropagation(); beep("click"); setInspect({ kind: "event", id: ev.id }); }
  };
  const taskDown = (e, task) => {
    if (e.pointerType === "touch" || e.button === 2 || task?.planned?.startMinute == null) return;
    e.stopPropagation();
    const start = task.planned.startMinute;
    const duration = task.planned.estimateMinutes ?? 30;
    const grab = minutesAt(e.clientY) - start;
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    tappedRef.current = true;
    armHold(e.clientX, e.clientY, () => {
      tappedRef.current = false;
      if (pointerId != null) target.setPointerCapture?.(pointerId);
      beep("lift"); buzz(14);
      startGesture({
        mode: "task", kind: "task", id: task.id, start, dur: duration, grab,
        originStart: start, originY: e.clientY, originScrollTop: streamRef.current?.scrollTop ?? 0,
        was: { start, dur: duration }, x: e.clientX, y: e.clientY,
      });
    });
  };
  const taskUp = (e, task) => {
    if (e.pointerType === "touch") return;
    disarmHold();
    /* Pointer capture retargets the release to the card. Finish here as well as
       in the document-level safety listener: otherwise a captured desktop
       Action can follow the pointer visually but never commit its new time. */
    if (gestureRef.current) {
      finishGesture(e.clientX, e.clientY);
      return;
    }
    if (tappedRef.current) {
      tappedRef.current = false;
      e.stopPropagation();
      beep("click");
      setInspect({ kind: "task", id: task.id });
    }
  };
  /* `edge` is which end of the block the hand has hold of: the bottom moves the
     end and the top moves the start, and in both cases the *other* end is what
     the person is holding still in their head.

     A press on a grip is not yet a resize — the pointer has to move first. Under
     a mouse that is invisible, since you cannot drag an edge without moving, but
     it is what stops a *click* on a grip from being swallowed: the gesture used
     to open and close having changed nothing, and the card never opened. The
     press is left marked as a tap so the card's own release opens it. */
  const resizeDown = (e, ev, edge = "end", kind = "event") => {
    if (e.pointerType === "touch" || e.button === 2) return;
    e.stopPropagation();
    disarmHold();
    tappedRef.current = true;
    const origin = kind === "task"
      ? INTERACTION_ORIGINS.actionResize
      : (edge === "start" ? INTERACTION_ORIGINS.eventStart : INTERACTION_ORIGINS.eventEnd);
    interactionRef.current = armInteraction(interactionRef.current, {
      owner: INTERACTION_OWNERS.dayStream,
      surface: "day",
      input: e.pointerType || "pointer",
      origin,
      mode: kind === "task" ? "task-resize" : `resize-${edge}`,
      id: ev.id,
      before: { start: ev.start, duration: ev.dur },
    });
    armedResizeRef.current = { x: e.clientX, y: e.clientY, ev, edge, kind };
  };
  const beginArmedResize = (clientX, clientY) => {
    const armed = armedResizeRef.current;
    armedResizeRef.current = null;
    if (!armed) return;
    tappedRef.current = false;
    beep("lift");
    const mode = armed.kind === "task" ? "task-resize" : `resize-${armed.edge}`;
    const proposal = proposeGesture(mode === "task-resize" ? "resize-end" : mode, {
      start: armed.ev.start,
      duration: armed.ev.dur,
      pointerMinute: minutesAt(clientY ?? armed.y),
      kind: armed.kind,
    });
    interactionRef.current = activateWithMovement(interactionRef.current, {
      start: proposal.start,
      duration: proposal.duration,
    });
    startGesture({
      mode, kind: armed.kind, id: armed.ev.id, start: proposal.start, dur: proposal.duration,
      was: { start: armed.ev.start, dur: armed.ev.dur },
      x: clientX ?? armed.x, y: clientY ?? armed.y,
    });
  };
  beginResizeRef.current = beginArmedResize;

  /* ─── touch: delegated on the stream, driven entirely by touch events ─── */
  useEffect(() => {
    const el = streamNode;
    if (!el) return;
    const press = { t: null };
    const clearPressTimer = (current) => {
      if (!current?.timer) return;
      clearTimeout(current.timer);
      current.timer = null;
    };
    const disarm = () => {
      clearPressTimer(press.t);
      press.t = null;
    };
    /* A scroll cancels the meaning of the press but keeps its record until the
       finger comes up. Otherwise touchend sees an apparently fresh empty tap and
       quick-creates the very event the scroll cancellation was meant to prevent. */
    const cancelPress = () => {
      if (!press.t) return;
      clearPressTimer(press.t);
      press.t.cancelled = true;
    };

    const onStart = (e) => {
      if (e.touches.length !== 1 || gestureRef.current) return;
      /* A scroll event can arrive after the finger moves outside the stream (or
         after a device compositor applies the offset), so establish intent at
         touch start. A tap alone never changes focus; it only authorizes a
         following scroll event to do so. */
      timelineScrollSessionRef.current.begin();
      timelineUserScrollRef.current = timelineScrollSessionRef.current.isActive();
      if (e.target.closest?.("[data-timeline-complete]")) return;
      /* JOIN is an action inside an event card, not a card gesture. The native
         listener owns touch intent before React's synthetic click reaches the
         anchor, so opt links out here as well as at the JSX boundary below.
         Without this guard a mobile tap first arms the event and the delegated
         touchend opens its edit sheet even though the browser is also following
         the meeting URL. */
      if (e.target.closest?.("a[href]")) return;
      const t = e.touches[0];
      const hit = e.target.closest ? e.target.closest("[data-event-id],[data-resize],[data-task-chip]") : null;
      /* A grip is part of the card it sits on, not a target of its own.
         Touching one used to begin the resize on the spot, with no hold and no
         movement, and that one line cost two things. A tap that landed on a grip
         opened and finished a gesture that changed nothing, so the card did not
         open — and since the grips are the top 8px and bottom 12px of every card,
         a third of a short card was dead to the touch, including the strip the
         title sits on. Worse, a finger that began a scroll on a card's bottom
         edge resized the event instead of scrolling the day: a two-hour block
         became thirty minutes, silently, while the day scrolled underneath.
         A grip now arms like everything else on this surface, and the rule is the
         same everywhere: hold to begin a gesture, move to scroll, tap to open. */
      const handle = hit && hit.hasAttribute("data-resize") ? hit : null;
      const node = handle ? handle.closest("[data-event-id],[data-task-chip]") : hit;
      const m = minutesAt(t.clientY);
      const chipId = node && node.getAttribute("data-task-chip");
      const id = node && node.getAttribute("data-event-id");
      const ev = id ? eventsRef.current.find((x) => x.id === id) : null;
      const chip = chipId ? plannedRef.current.find((x) => x.id === chipId) : null;
      const resizing = handle && (ev || chip)
        ? { edge: handle.getAttribute("data-resize-edge") || "end", kind: ev ? "event" : "task" }
        : null;
      const targetKind = resizing ? "resize" : (ev || chipId ? "card" : "empty");
      const p = {
        x: t.clientX, y: t.clientY, ev, chipId, resizing,
        startMin: snapTo(m),
        grab: ev ? m - ev.start : chip?.planned?.startMinute != null ? m - chip.planned.startMinute : 0,
        startScrollTop: el.scrollTop, held: false, cancelled: false, swiping: false,
        lastX: t.clientX, lastY: t.clientY, timer: null,
      };
      p.timer = setTimeout(() => {
        if (!press.t || press.t.cancelled) return;
        press.t.timer = null;
        press.t.held = true;
        beep("lift"); buzz(p.resizing ? 10 : 14);
        if (p.resizing) {
          const block = ev
            ? { start: ev.start, dur: ev.dur }
            : { start: chip.planned.startMinute, dur: chip.planned.estimateMinutes };
          startGesture({
            mode: p.resizing.kind === "task" ? "task-resize" : `resize-${p.resizing.edge}`,
            kind: p.resizing.kind,
            id: ev ? ev.id : chipId, ...block, was: { ...block }, x: p.x, y: p.y,
          });
        }
        else if (p.ev) startGesture({ mode: "move", kind: "event", id: p.ev.id, start: p.ev.start, dur: p.ev.dur, grab: p.grab, was: { start: p.ev.start, dur: p.ev.dur }, x: p.x, y: p.y });
        else if (p.chipId) {
          const task = plannedRef.current.find((item) => item.id === p.chipId);
          const start = task?.planned?.startMinute ?? p.startMin;
          const dur = task?.planned?.estimateMinutes ?? 30;
          startGesture({
            mode: "task", kind: "task", id: p.chipId, start, dur, grab: p.grab,
            originStart: start, originY: p.y, originScrollTop: el.scrollTop,
            was: { start, dur }, x: p.x, y: p.y,
          });
        }
        else startGesture({ mode: "draft", start: p.startMin, dur: 30, x: p.x, y: p.y });
      }, liftDelayForTimelineTarget(targetKind));
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
      if (!t) return;
      p.lastX = t.clientX;
      p.lastY = t.clientY;
      if (p.chipId && !p.resizing && (p.swiping || (t.clientX > p.x && timelineTouchIntent(p, { x: t.clientX, y: t.clientY }) === "horizontal"))) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        cancelPress();
        p.swiping = true;
        setTaskSwipe({ id: p.chipId, offset: Math.max(0, Math.min(96, t.clientX - p.x)) });
        return;
      }
      /* The Action estimate is a dedicated, visible resize control rather than
         a thin edge laid over the card. Once its drag has a deliberate vertical
         direction it can respond immediately: there is no title or checkmark
         underneath for it to steal, and a user should not have to wait out a
         long-press just to extend a fifteen-minute Action. */
      if (p.resizing?.kind === "task" && !p.held && !p.cancelled
        && Math.abs(t.clientY - p.y) > 4
        && Math.abs(t.clientY - p.y) >= Math.abs(t.clientX - p.x)) {
        const task = plannedRef.current.find((item) => item.id === p.chipId);
        if (task?.planned?.startMinute != null) {
          clearPressTimer(p);
          p.held = true;
          armedResizeRef.current = {
            x: p.x, y: p.y,
            ev: { id: task.id, start: task.planned.startMinute, dur: task.planned.estimateMinutes ?? 30 },
            edge: p.resizing.edge,
            kind: "task",
          };
          if (e.cancelable) e.preventDefault();
          beginResizeRef.current(t.clientX, t.clientY);
          return;
        }
      }
      if (Math.abs(t.clientX - p.x) > 12 || Math.abs(t.clientY - p.y) > 12) cancelPress();
      if (Math.abs(t.clientY - p.y) > 4) {
        timelineScrollSessionRef.current.begin();
        timelineUserScrollRef.current = true;
      }
    };

    const onScroll = () => {
      onTimelineScrollPosition(el.scrollTop);
      const p = press.t;
      if (!p) return;
      cancelPress();
    };
    const onWheel = () => {
      timelineScrollSessionRef.current.begin();
      timelineUserScrollRef.current = true;
      timelineScrollSessionRef.current.end();
    };

    const onEnd = (e) => {
      const g = gestureRef.current;
      const p = press.t;
      disarm();
      const t = e.changedTouches && e.changedTouches[0];
      if (p?.swiping) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        gestureEndedAt.current = Date.now();
        const point = { x: t?.clientX ?? p.lastX, y: t?.clientY ?? p.lastY };
        const commits = shouldCommitActionSwipe(p, point);
        setTaskSwipe(null);
        if (commits) completeTaskRef.current(p.chipId);
        return;
      }
      if (g) { finishRef.current(t ? t.clientX : g.x, t ? t.clientY : g.y); return; }
      if (p && !p.held && !p.cancelled) {
        /* A tap handled here opens a sheet. Without this the browser still emits its
           compatibility click ~300ms later, which lands on the freshly-opened sheet's
           backdrop and closes it again — the card appeared not to open at all. */
        if (e.cancelable) e.preventDefault();
        if (p.ev) { beep("click"); setInspect({ kind: "event", id: p.ev.id }); }
        else if (p.chipId) { beep("click"); setInspect({ kind: "task", id: p.chipId }); }
        else { beep("click"); setComposer({ kind: "event", start: startSlot(p.startMin), dur: 60 }); }
      }
    };

    const onCancel = () => {
      disarm();
      setTaskSwipe(null);
      if (gestureRef.current) finishRef.current(0, 0, { cancelled: true });
      else interactionRef.current = cancelArmedInteraction(interactionRef.current);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onCancel);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
    };
  }, [streamNode, ready, viewMode, zoom, dayHourHeight, onTimelineScrollPosition]);

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
    const tcancel = () => {
      if (gestureRef.current) finishRef.current(0, 0, { cancelled: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", tcancel);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.addEventListener("touchmove", tmove, { passive: false });
    document.addEventListener("touchend", tend);
    document.addEventListener("touchcancel", tcancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", tcancel);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.removeEventListener("touchmove", tmove);
      document.removeEventListener("touchend", tend);
      document.removeEventListener("touchcancel", tcancel);
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
      <div role="status" aria-live="polite" aria-atomic="true" style={{ background: THEMES[0].bg, color: THEMES[0].dim, fontFamily: MONO, minHeight: "100vh" }} className="flex items-center justify-center nb-data">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <span>{loadingSlow ? "STILL OPENING THE NOTEBOOK" : "OPENING THE NOTEBOOK"}</span>
          {loadingSlow && (
            <>
              <span data-test="loading-recovery" className="max-w-xs text-xs leading-relaxed">
                Storage is taking longer than expected. Your saved notebook has not been changed.
              </span>
              <button type="button" onClick={() => window.location.reload()} className="nb-tap nb-label px-3 py-2"
                style={{ color: THEMES[0].accent, border: `1px solid ${THEMES[0].accent}`, borderRadius: 999 }}>
                RELOAD
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  eventsRef.current = events;
  dateKeyRef.current = dateKey;
  /* The actions that have a time on the day, mirrored for the native touch
     listeners — same reason as `eventsRef`: they must never read a stale list. */
  plannedRef.current = plannedTasks;

  const inspectItem = inspect && (inspect.kind === "event"
    ? dayEvents.find((event) => event.id === inspect.id)
    : resolveTaskForInspection(dayTasks, db.tasks, inspect.id));
  const holdInspectForExit = (kind, id) => {
    if (inspect?.kind !== kind || inspect.id !== id || !inspectItem) return;
    setInspectExitSnapshot({ kind, id, item: structuredClone(inspectItem) });
  };
  const inspectRecord = inspectItem || (
    inspectExitSnapshot && inspectExitSnapshot.kind === inspect?.kind && inspectExitSnapshot.id === inspect?.id
      ? inspectExitSnapshot.item
      : null
  );
  const inspectIsSubtask = inspect?.kind === "task" && Boolean(inspectRecord?.parentTaskId);
  const inspectParentTask = inspectIsSubtask
    ? db?.tasks.find((task) => task.id === inspectRecord.parentTaskId) ?? null
    : null;
  const inspectSheetTitle = inspect?.kind === "event" ? "EVENT" : inspectIsSubtask ? "SUBTASK" : "ACTION";
  const inspectEditLabel = inspect?.kind === "event" ? "EDIT EVENT" : inspectIsSubtask ? "EDIT SUBTASK" : "EDIT ACTION";
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
  const inspectNoteContext = inspect && inspectRecord
    ? (inspect.kind === "event" ? eventNoteLink(inspectRecord) : taskNoteLink(inspectRecord))
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
    if (!inspect || !inspectRecord) return;
    setDraft((current) => ({ ...(current ?? {}), ...patch }));
    /* §4.6. Touching a field is what starts editing — the pill follows the record
       into its editing state rather than gatekeeping it. */
    setDetailEditing(true);
  };
  const openInspectField = (field, element = null) => {
    setInspectField(field);
    beginDetailEdit(element);
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
  const inspectDraft = draft && inspectRecord
    ? applyDetailDraft(inspect.kind, inspectRecord, draft, dateKey)
    : inspectRecord;

  const commitDraft = (pending = draft) => {
    if (!inspect || !inspectRecord || !hasDetailDraft(pending)) {
      setDetailEditing(false);
      setInspectField(null);
      return false;
    }
    const next = { ...entryPayload(inspect.kind, inspectRecord), ...pending, inline: true };
    if (inspect.kind === "event") {
      /* The record carries the timing it was read with. An inline change to the
         time, the day, or all-day has to rebuild it — passing the old timing
         through would quietly overwrite the very field that was just edited. */
      const day = next.date || dateKey;
      try {
        next.timing = next.allDay
          ? { kind: "all-day", startDate: day, endDateExclusive: addDaysToKey(next.endDate && next.endDate >= day ? next.endDate : day, 1) }
          : inspectRecord.allDay
            ? { kind: "timed", timeZoneMode: "floating", startLocal: addMinutesToLocalDateTime(`${day}T00:00`, next.start), endLocal: addMinutesToLocalDateTime(`${day}T00:00`, next.start + next.dur) }
            : eventTimingFromPosition(inspectRecord, day, next.start, next.dur);
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
        setInspectField(null);
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
    setInspectField(null);
    return true;
  };
  const draggingTask = gesture && gesture.mode === "task" ? dayTasks.find((t) => t.id === gesture.id) : null;
  const timelineDraft = gesture && gesture.mode === "draft"
    ? gesture
    : draftPreview && (!draftPreview.date || draftPreview.date === dateKey) ? draftPreview : null;
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
    { id: "view-day", label: "Day view", keywords: ["timeline", "zoom"], run: runCommand(() => { selectViewMode("timeline"); setZoom("day"); }) },
    { id: "view-week", label: "Week view", keywords: ["zoom", "7"], run: runCommand(() => { selectViewMode("timeline"); setZoom("week"); }) },
    { id: "view-month", label: "Month view", keywords: ["zoom", "grid"], run: runCommand(() => { selectViewMode("timeline"); setMonthCursor(activeDate); setZoom("month"); }) },
    { id: "view-agenda", label: "Agenda view", keywords: ["list", "upcoming"], run: runCommand(() => selectViewMode("agenda")) },
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
      subtasksFor={(t) => (db ? getSubtasksOf(db, parseTaskOccurrenceId(t.id).seriesId) : [])}
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
  const timelineViewFocused = timelineFocused && viewMode === "timeline" && (zoom === "day" || zoom === "week");
  const actionsLayout = viewMode === "actions" ? "nb-actions-full" : (actionsOpen ? "nb-actions-open" : "nb-actions-closed");

  return (
    <div data-test="nav-shell" data-nav-state={navPhase} className="nb-nav-shell" style={{ fontFamily: DISPLAY }}>
      <NavigationShell
        phase={navPhase}
        firstItemRef={navFirstItemRef}
        onTimeline={() => { beep("tick"); selectViewMode("timeline"); closeNavigation(); }}
        onActions={() => { beep("tick"); selectViewMode("actions"); closeNavigation(); }}
        onSetup={() => { beep("click"); setSettings(true); closeNavigation(); }}
        onNotes={() => { beep("click"); setNotebook("all"); closeNavigation(); }}
        onShortcuts={() => { beep("click"); setShortcuts(true); closeNavigation(); }}
        onToday={() => { jumpTo(todayKey); setMonthCursor(new Date()); closeNavigation(); }}
      />
      <div data-test="app-surface" className={`nb-root nb-app-surface ${navOpen ? "nb-app-surface-open" : ""} flex flex-col`}
        onTransitionEnd={finishNavigationOnSurfaceTransition}
        onPointerDown={(event) => {
          if (!navOpen || event.target.closest("[data-test='nav-toggle'], [data-test='mobile-calendar-return']")) return;
          event.preventDefault();
          closeNavigation();
        }}
        style={{ background: T.bg, color: T.text, fontFamily: DISPLAY }}>
      <button data-test="mobile-calendar-return" type="button" aria-label="Return to calendar" onClick={closeNavigation} className="nb-mobile-calendar-return">CALENDAR</button>
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
        .nb-nav-shell{
          --nav-width:304px;
          --nav-gap:18px;
          /* Chosen by looking at it, against .92, .88 and .84. Larger values
             keep the page taller but push more of the Actions column past the
             right edge — .92 loses 43% of it and leaves only a 34px margin, so
             the page reads as a window too small for its contents rather than a
             card set back. At .80 the overhang is 66px, five per cent of the
             page and incidental rather than structural, 88% of the column stays
             on screen, and the 86px of symmetric margin is what makes the
             recession legible as a deliberate one. */
          --nav-page-scale:.80;
          --nav-page-radius:18px;
          --nav-page-shadow:0 18px 48px rgb(0 0 0 / .28);
          --nav-page-duration:340ms;
          --nav-content-duration:260ms;
          --nav-item-stagger:28ms;
          /* Deliberate ease-out, not a spring: every property lands once and
             stays there. Keeping the curve below 1 avoids the bounce that made
             the first pass feel disconnected from the shell. */
          --nav-ease:cubic-bezier(.22,.61,.36,1);
          position:relative;height:100dvh;overflow:clip;overflow-anchor:none;background:#17181b;
        }
        .nb-root{height:100%;overflow:clip;overflow-anchor:none}
        /* The page is pushed aside, not re-measured.
           This used to animate top, right, bottom, left and width on the element
           that contains the entire application, which is a full layout pass per
           frame for the whole tree: measured at 6x CPU throttle it cost a 133ms
           worst frame and twelve dropped ones against a 16.7ms idle baseline.
           It was also doing visible harm. Relaying out to 904px tripled the
           clipping in the Actions tab row — 70px cut when closed, 213px when
           open — so the frame you cannot interact with was the one being
           degraded to make room for the drawer.
           A uniform scale cannot reproduce the old geometry, because insetting
           18px vertically and 322px horizontally changes the page's aspect
           ratio; matching it with transform alone would need scaleX .71 against
           scaleY .92 and every glyph would be squashed. So the shape changes to
           one that does scale: the page keeps its layout at full width, shrinks
           evenly about its left edge and slides clear of the nav, letting its
           right edge run off-screen the way the mobile rail already does. Height
           lands within a few pixels of where it used to (791 against 795), the
           part that leaves the viewport is the column edge that was being
           clipped anyway, and nothing inside is ever re-measured. */
        .nb-app-surface{
          position:absolute;inset:0;z-index:2;height:auto;overflow:clip;overflow-anchor:none;transform:translate3d(0,0,0) scale(1);
          transform-origin:left center;border-radius:0;box-shadow:none;
          transition:transform var(--nav-page-duration) var(--nav-ease),border-radius var(--nav-page-duration) var(--nav-ease),box-shadow var(--nav-page-duration) var(--nav-ease);
        }
        .nb-app-surface-open{transform:translate3d(calc(var(--nav-width) + var(--nav-gap)),0,0) scale(var(--nav-page-scale));border-radius:var(--nav-page-radius);box-shadow:var(--nav-page-shadow)}
        .nb-navigation{position:absolute;z-index:1;inset:0 auto 0 0;width:var(--nav-width);padding:22px 18px;color:#f2f0ea;display:flex;flex-direction:column;overflow:auto}
        .nb-navigation[aria-hidden="true"]{visibility:hidden;pointer-events:none}
        .nb-nav-brand,.nb-nav-item,.nb-nav-membership{opacity:0;transform:translate3d(-10px,0,0);transition:opacity var(--nav-content-duration) var(--nav-ease),transform var(--nav-content-duration) var(--nav-ease)}
        .nb-nav-shell[data-nav-state="open"] .nb-nav-brand,.nb-nav-shell[data-nav-state="open"] .nb-nav-item,.nb-nav-shell[data-nav-state="open"] .nb-nav-membership{opacity:1;transform:translate3d(0,0,0);transition-delay:calc(var(--nav-index, 0) * var(--nav-item-stagger))}
        .nb-nav-shell[data-nav-state="closing"] .nb-nav-brand,.nb-nav-shell[data-nav-state="closing"] .nb-nav-item,.nb-nav-shell[data-nav-state="closing"] .nb-nav-membership{transition-delay:0ms}
        .nb-nav-item{font-family:${MONO};font-size:15px;letter-spacing:.1em;text-align:left;padding:13px 12px;border-radius:10px;color:#c8c7c0}
        .nb-nav-item:hover,.nb-nav-item:focus-visible{background:#2a2b2f;color:#fff;outline:none}
        .nb-nav-membership{margin-top:auto;padding:15px 12px;border:1px solid #37383d;border-radius:12px;color:#aaa9a2}
        .nb-shell-control{color:#f4f2ec;border:1px solid #3a3b40;background:#24252a;border-radius:9px;font-family:${MONO};font-size:13px;letter-spacing:.06em}
        .nb-shell-control:hover,.nb-shell-control:focus-visible{background:#313238;outline:2px solid #f4f2ec;outline-offset:2px}
        .nb-shell-info{border-radius:999px;font-family:${DISPLAY};font-weight:700;letter-spacing:0}
        .nb-mobile-calendar-return{display:none}
        @media(max-width:639px){
          .nb-nav-shell{--nav-width:min(78vw,320px);--nav-gap:11px;--nav-page-scale:.94;--nav-page-radius:16px}
          /* Keep the calendar at its real width while it becomes the return rail.
             Animating width from the viewport to 40px made its complete layout
             reflow on every frame; clip-path reveals a narrowing left slice and
             transform carries that stable slice to the right edge instead. */
          .nb-app-surface{inset:0 auto auto 0;width:100%;height:100%;clip-path:inset(0 0 0 0 round 0);transition:transform var(--nav-page-duration) var(--nav-ease),clip-path var(--nav-page-duration) var(--nav-ease),box-shadow var(--nav-page-duration) var(--nav-ease)}
          .nb-app-surface-open{inset:0 auto auto 0;width:100%;height:100%;transform:translate3d(calc(100% - 49px),0,0);clip-path:inset(14px calc(100% - 44px) 14px 0 round 16px);border-radius:16px;box-shadow:none}
          .nb-app-surface>*:not(.nb-mobile-calendar-return){opacity:1;transition:opacity 150ms ease}
          .nb-app-surface-open>*:not(.nb-mobile-calendar-return){opacity:0;pointer-events:none}
          .nb-mobile-calendar-return{display:flex;position:absolute;z-index:40;inset:14px auto 14px 0;width:44px;align-items:center;justify-content:center;border:0;border-radius:16px;background:${T.accent};color:${T.on};font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:.12em;writing-mode:vertical-rl;transform:rotate(180deg);opacity:0;pointer-events:none;transition:opacity 160ms ease}
          .nb-app-surface-open .nb-mobile-calendar-return{opacity:1;pointer-events:auto;transition-delay:120ms}
          .nb-navigation{padding:18px 12px}
          .nb-hud{padding:.45rem .65rem;gap:.35rem}
          .nb-hud-left{gap:.35rem}
          .nb-hud-left .w-14{width:36px}
          .nb-hud-actions{gap:0}
          .nb-search-wrap{width:32px!important}
          .nb-hud-notes{display:none}
          .nb-hud-settings{display:none}
        }
        .nb-main{padding-bottom:var(--sheet-pad);transition:padding-bottom 260ms var(--motion-settle)}
        @media(min-width:1024px){
          .nb-main{padding-bottom:2rem}
          .nb-main.nb-main-day-timeline{padding-bottom:.75rem}
          .nb-main.nb-actions-open,.nb-main.nb-actions-closed{grid-template-columns:minmax(0,7fr) minmax(0,5fr);column-gap:1.25rem;transition:grid-template-columns 300ms var(--nav-ease),column-gap 300ms var(--nav-ease)}
          .nb-main.nb-actions-closed{grid-template-columns:minmax(0,1fr) minmax(0,0fr);column-gap:0}
          .nb-main.nb-actions-full{grid-template-columns:minmax(0,1fr)}
        }
        /* The ribbon can be a large, real date surface, so a state change may
           spend a frame reconciling its cells before the compositor samples the
           pane. Keep the pane's fade long enough to remain an actual transition
           under that load, and let its visibility follow the same settled edge as
           the grid rather than disappearing halfway through the handoff. */
        .nb-actions-column{min-width:0;overflow-x:hidden;opacity:1;transform:translate3d(0,0,0);visibility:visible;transition:opacity 320ms ease,transform 320ms var(--nav-ease),visibility 0s linear 0s}
        .nb-actions-column.is-collapsed{opacity:0;transform:translate3d(12px,0,0);visibility:hidden;pointer-events:none;transition:opacity 320ms ease,transform 320ms var(--nav-ease),visibility 0s linear 360ms}
        .nb-actions-restore{transform:translate3d(0,-50%,0);opacity:1;visibility:visible;transition:opacity 180ms ease,transform 300ms var(--nav-ease),visibility 0s linear 0s}
        .nb-actions-restore.is-hidden{transform:translate3d(100%,-50%,0);opacity:0;visibility:hidden;pointer-events:none;transition:opacity 180ms ease,transform 240ms var(--nav-ease),visibility 0s linear 300ms}
        .nb-stream{flex:1 1 auto;min-height:0}

        /* ── THE SCALE ──────────────────────────────────────────────────
           A polish, not a reskin. The identity of this app is monospace
           capitals on a ground-plus-one-accent theme, and that survives intact:
           every rail, chip, button and time label is still mono, still tracked
           wide, still shouting. What was actually broken is that *content* was
           set in the same 12px mono as the chrome — an event's title, a note's
           body and a section rail were typographically the same thing, so
           hierarchy had nothing left to carry it but colour.

           So the geometric face takes the content and only the content: titles,
           body, headings. Mono keeps the chrome and the data, which is the half
           it was always right about — "10:00 AM" and "11:30 AM" are the same
           width, and times align down the rail without a single hack.

           Sizes are set against the geometry that already exists rather than a
           theoretical ratio: 16px is what fits a 31px half-hour card once its
           padding is paid for, and picking 17 would have clipped every short
           event on the timeline. */
        .nb-display{font-family:var(--font-data);font-size:var(--t-display);font-weight:var(--t-display-w);letter-spacing:var(--t-display-ls);line-height:.95;font-variant-numeric:tabular-nums}
        .nb-title{font-family:var(--font-display);font-size:var(--t-title);font-weight:var(--t-title-w);letter-spacing:var(--t-title-ls);line-height:1.2;text-wrap:balance}
        .nb-heading{font-family:var(--font-display);font-size:var(--t-heading);font-weight:var(--t-heading-w);letter-spacing:var(--t-heading-ls);line-height:1.3}
        .nb-lead{font-family:var(--font-display);font-size:var(--t-lead);font-weight:var(--t-lead-w);letter-spacing:var(--t-lead-ls);line-height:1.3}
        .nb-body{font-family:var(--font-display);font-size:var(--t-body);font-weight:var(--t-body-w);letter-spacing:var(--t-body-ls);line-height:1.5}
        /* What was written rather than computed. The only warm thing on the
           surface, and it earns that by being rare. */
        .nb-voice{font-family:var(--font-voice);font-size:var(--t-body);font-style:italic;line-height:1.6}
        /* The interface voice. Capitals and wide tracking survive — that
           rhythm is the app's own — but they are set in the geometric now,
           which is where the Timepage resemblance actually lives and what
           separates a label the app is speaking from a number it is reporting.
           13px rather than 12: the difference between a label and a smudge on a
           phone, and what lets a control reach a 44px target without padding
           that looks apologetic. */
        .nb-label{font-family:var(--font-display);font-size:var(--t-label);font-weight:var(--t-label-w);letter-spacing:var(--t-label-ls);text-transform:uppercase;line-height:1.3}
        /* Data keeps the monospace and the tabular figures, which is the whole
           reason monospace survived this change. */
        .nb-data{font-family:var(--font-data);font-size:var(--t-data);font-weight:var(--t-data-w);letter-spacing:var(--t-data-ls);font-variant-numeric:tabular-nums;line-height:1.35}
        .nb-data-b{font-weight:700}
        .nb-micro{font-family:var(--font-data);font-size:var(--t-micro);font-weight:var(--t-micro-w);letter-spacing:var(--t-micro-ls);font-variant-numeric:tabular-nums;line-height:1.3}

        /* ── MATERIAL ───────────────────────────────────────────────────
           Every surface used to be flat with a hairline border, which reads as
           a diagram rather than a thing. Three elevations and no more: flush,
           resting, lifted — each one encoding state (a card at rest, a card in
           your hand, a sheet over the day) rather than decorating it. */
        .nb-e0{box-shadow:inset 0 0 0 1px ${T.line}}
        .nb-e1{box-shadow:var(--e1),var(--sheen)}
        .nb-e2{box-shadow:var(--e2),var(--sheen)}
        /* Nothing responded to being pressed. This is the cheapest line in the
           whole design and it is most of what "tactile" means — imperceptible
           once, and the difference between an interface and an object over a
           day of use. */
        /* Press motion is owned once, by the standalone scale rule below.
           The previous nb-tap transform multiplied with that scale and gave
           every button two different release curves. */
        .nb-tap{transition:opacity 120ms ease}
        /* Hover is a desktop reading aid, not a second selection system. These
           four roles are opt-in: timeline gesture layers, sheet materials, and
           invisible coarse-pointer targets must never inherit decorative state. */
        .nb-hover-control,.nb-hover-tile,.nb-hover-choice,.nb-hover-icon{
          transition:background-color 160ms ease,color 160ms ease,border-color 160ms ease,box-shadow 200ms var(--motion-settle),outline-color 160ms ease;
        }
        @media(hover:hover) and (pointer:fine){
          .nb-hover-control:not(:disabled):not([aria-disabled="true"]):hover{
            background-color:${T.faint}88!important;color:${T.text}!important;
          }
          .nb-hover-control.nb-liquid:not(:disabled):hover{
            background-color:${T.accent}!important;box-shadow:var(--e1),var(--sheen);
          }
          .nb-hover-tile:not(:disabled):not([aria-disabled="true"]):hover{
            box-shadow:var(--e1),var(--sheen),inset 0 0 0 1px ${T.accent}38!important;
          }
          /* An Action is one material surface, including its promoted children.
             The child title still gets a quiet text affordance, never a second
             tile-shaped hover patch that makes the parent look clipped. */
          .nb-action-card .nb-subtask-title:not(:disabled):hover{
            background-color:transparent!important;
          }
          .nb-hover-choice:not(:disabled):not([aria-disabled="true"]):not(.is-selected):hover{
            background-color:${T.accent}12!important;color:${T.accentText}!important;
            box-shadow:inset 0 0 0 1px ${T.accent}52!important;
          }
          .nb-hover-choice.is-selected:not(:disabled):hover{
            box-shadow:inset 0 0 0 1px ${T.on}55!important;
          }
          .nb-hover-icon:not(:disabled):not([aria-disabled="true"]):hover{
            background-color:${T.faint}88!important;color:${T.text}!important;
            box-shadow:inset 0 0 0 1px ${T.line};
          }
          .nb-hover-danger:not(:disabled):hover{
            background-color:transparent!important;color:${NOW_RED}!important;
            box-shadow:inset 0 0 0 1px ${NOW_RED}!important;
          }
        }
        /* A 13px label with a little padding measures about 62 x 25, and the
           floor for a finger is 44 x 44. Fifteen controls had been under it for
           the life of the project and nothing had ever measured them.
           The target grows, the button does not: a centred pseudo-element takes
           the press on behalf of a control that stays exactly the size it was
           drawn. Padding would have worked too and would have cost forty pixels
           of header on a screen where the timeline is already down to 44% —
           the wrong trade on the one surface the app exists to show. */
        @media(pointer:coarse){
          /* The :not() here is load-bearing, not defensive. .nb-tap and
             Tailwind's .absolute are both single-class selectors, so source
             order decides — and this stylesheet is injected after Tailwind's.
             A blanket position:relative therefore *won* against every control
             that was already positioned, and an action chip stretched with
             left-0 right-2 collapsed to its content: 289px wide became 202px,
             in the middle of the timeline, from a rule about touch targets.
             An already-positioned element is a containing block anyway, so it
             never needed the declaration in the first place. */
          .nb-tap:not(.absolute):not(.fixed):not(.sticky){position:relative}
          .nb-tap::after{
            content:"";position:absolute;left:50%;top:50%;
            width:max(100%,44px);height:max(100%,44px);
            transform:translate(-50%,-50%);
          }
        }
        /* A stamp hides its native control, so the focus it takes has to be drawn
           on the wrapper instead — otherwise a keyboard user sees nothing. */
        .nb-stamp{transition:box-shadow 160ms ease}
        .nb-stamp:focus-within{box-shadow:0 1px 0 0 ${T.accent}}
        .nb-row:hover{background:${T.faint}55}
        .nb-cell{transition:opacity 300ms cubic-bezier(.23,1,.32,1),transform 300ms cubic-bezier(.23,1,.32,1)}
        .nb-ribbon-spacer{flex:0 0 auto;width:calc(var(--nb-ribbon-cells) * 4rem)}
        @media(min-width:640px){.nb-ribbon-spacer{width:calc(var(--nb-ribbon-cells) * 5rem)}}
        @media(min-width:1024px){.nb-ribbon-spacer{width:calc(var(--nb-ribbon-cells) * 6rem)}}
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
        .nb-up{animation:nbup 200ms cubic-bezier(.23,1,.32,1)}
        @keyframes nbup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        /* Low-frequency collections get one quiet entrance so a filter change
           does not replace the whole surface on a single frame. Four pixels is
           enough to establish continuity without making readable content travel. */
        .nb-list-enter{animation:nb-list-enter 180ms var(--motion-enter) both;animation-delay:calc(var(--nb-list-index, 0) * 30ms);will-change:transform,opacity}
        @keyframes nb-list-enter{from{opacity:0;transform:translate3d(0,4px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
        /* The three views do move through space, and the switch says so.
           This used to be opacity alone, on the reasoning that a view change is
           a change of lens rather than a page moving. That holds while the only
           way to change view is to press a tab. It stops holding once the views
           can be dragged between: a surface that follows your thumb and then
           cross-fades has told you two different stories about what it is. The
           travel is small — a fourteenth of the width, matching the day turn's
           idiom at 6% — because the direction is the information, not the
           distance.
           Two alternating names so the arriving surface can start its handoff in
           the same render as the view change; --nb-view-dir carries which way. */
        .nb-view-enter-a{animation:nb-view-enter-a 200ms var(--motion-enter) both}
        .nb-view-enter-b{animation:nb-view-enter-b 200ms var(--motion-enter) both}
        @keyframes nb-view-enter-a{from{opacity:0;transform:translate3d(calc(var(--nb-view-dir, 1) * 7%),0,0)}to{opacity:1;transform:translate3d(0,0,0)}}
        @keyframes nb-view-enter-b{from{opacity:0;transform:translate3d(calc(var(--nb-view-dir, 1) * 7%),0,0)}to{opacity:1;transform:translate3d(0,0,0)}}
        /* Completion is a durable state, not a toast. Keep the accent surface
           mounted after its reveal so the card remains visibly complete; the
           same interruptible clip transition reverses when the user reopens it. */
        .nb-action-complete-overlay{opacity:0;clip-path:inset(0 100% 0 0 round 14px);transition:clip-path 260ms cubic-bezier(.23,1,.32,1),opacity 160ms ease;will-change:clip-path,opacity}
        .nb-action-complete-overlay.is-visible{opacity:1;clip-path:inset(0 0 0 0 round 14px)}
        /* Every menu and sheet is the same material as the control that opened it.
           When a trigger can be measured the surface grows from that exact pill;
           first-run and system sheets use the bottom-sheet fallback. */
        .nb-fluid{animation:nbfluid 420ms cubic-bezier(.23,1,.32,1);transform-origin:bottom center;border-radius:24px 24px 0 0;will-change:transform,opacity,clip-path}
        @keyframes nbfluid{
          0%{opacity:0;transform:translateY(26px) scale(.965)}
          55%{opacity:1}
          100%{opacity:1;transform:translateY(0) scale(1)}
        }
        /* A sheet grows from its trigger by being *revealed*, not by being zoomed.
           The panel is at its true size from the first frame, centred over the
           button and clipped to a rounded window exactly the button's size; the
           window opens out to the panel's own edges. Nothing inside is ever
           scaled, so the text is laid out once and never resampled — see
           features/motion/fluidGeometry.js for why that is the whole fix. */
        .nb-fluid[data-fluid-origin="none"]{animation:none;transform:none;clip-path:none}
        .nb-fluid[data-fluid-origin="trigger"]{animation-name:nbfluidorigin;animation-timing-function:cubic-bezier(.22,.85,.28,1);transform-origin:center}
        @keyframes nbfluidorigin{
          0%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y));clip-path:inset(var(--fluid-inset-y) var(--fluid-inset-x) round 999px)}
          100%{opacity:1;transform:translate(0,0);clip-path:inset(0px 0px round 24px)}
        }
        /* The clip is the transition. Fading the body independently made the
           opening shape empty and erased the contents before the closing shape
           reached its card, so the connected morph read as a generic fade. */
        .nb-fluid[data-fluid-origin="trigger"] .nb-notch-body{animation:none;opacity:1}
        .nb-fluid.nb-fluid-closing{animation:nbfluidout 240ms cubic-bezier(.4,0,.4,1) forwards;pointer-events:none}
        .nb-fluid.nb-fluid-closing[data-fluid-origin="trigger"]{animation-name:nbfluidoriginout;animation-duration:300ms}
        @keyframes nbfluidout{0%,30%{opacity:1}100%{opacity:0;transform:translateY(12px) scale(.97);border-radius:30px}}
        /* The exit retraces the entry. It used to travel a quarter of the way back
           and stop at scale(.88), so a sheet that flew out of its card drifted
           vaguely downward on the way out — the two halves of one gesture did not
           describe the same path. Same distance, same clip, reversed. */
        @keyframes nbfluidoriginout{
          0%{opacity:1;transform:translate(0,0);clip-path:inset(0px 0px round 24px)}
          100%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y));clip-path:inset(var(--fluid-inset-y) var(--fluid-inset-x) round 999px)}
        }
        .nb-fluid.nb-fluid-closing[data-fluid-origin="trigger"] .nb-notch-body{animation:none;opacity:1}
        /* The notch is the sheet itself taking on the trigger's material and
           geometry — not a coloured copy fading in front of it. The panel is
           clipped from the real button bounds, transitions from that button's
           theme accent to its own card surface, then lets content arrive after
           the physical move has established the new space. */
        .nb-fluid[data-fluid-origin="notch"]{
          --nb-morph-dur:${MORPH_MS}ms;
          --nb-morph-lead:calc(var(--nb-morph-dur) * ${MORPH_LEAD});
          --nb-morph-step:calc(var(--nb-morph-dur) * ${MORPH_STEP});
          --nb-morph-fade:calc(var(--nb-morph-dur) * ${MORPH_FADE});
          animation-name:nbnotchin,nbnotchwash;animation-duration:var(--nb-morph-dur);
          animation-timing-function:cubic-bezier(.22,.85,.28,1),cubic-bezier(.4,0,.6,1);
          transition:background-color 210ms cubic-bezier(.22,.85,.28,1);
        }
        /* The window stays the button's material until the shape has somewhere to land,
           then washes into the sheet's own surface on the same 320ms the clip runs on.
           This used to be React state on three setTimeouts, which meant a paused frame
           showed whatever the wall clock had reached rather than what the clip was
           doing — the paint and the shape were two different animations wearing one
           name. nbnotchin keeps its own easing; the wash keeps a gentler one. */
        @keyframes nbnotchwash{0%,55%{background-color:var(--morph-accent)}100%{background-color:var(--morph-card)}}
        @keyframes nbnotchin{
          0%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y));clip-path:inset(var(--fluid-inset-y) var(--fluid-inset-x) round 999px)}
          100%{opacity:1;transform:translate(0,0);clip-path:inset(0px 0px round 24px)}
        }
        /* The sheet assembles itself rather than appearing.
           The body used to fade as a single block from 60% of the morph, which
           is the one thing that cannot be tuned into the reference feeling: a
           panel whose contents all arrive together reads as a panel, however
           well-eased. The reference staggers its groups a fifth of the
           container's duration apart, starting a third of the way in and still
           landing after the shape has settled — so the eye follows the sheet
           being built instead of catching it already built.
           Groups are DOM order. The sheet's own header is the first; anything
           inside a .nb-notch-cascade root follows. A sheet that does not opt in
           keeps the old single-block behaviour on the new timing, which is why
           the :has() guard is here rather than a second class on every sheet. */
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body{pointer-events:none}
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="content"] .nb-notch-body,.nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-notch-body{pointer-events:auto}
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:last-child:not(:has(.nb-notch-cascade)){--nb-stage:1}
        ${Array.from({ length: 8 }, (_, n) => `.nb-fluid[data-fluid-origin="notch"] .nb-notch-cascade>*:nth-child(${n + 1}){--nb-stage:${n + 1}}`).join("")}
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-cascade>*:nth-child(n+9){--nb-stage:8}
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:first-child,
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-cascade>*,
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:last-child:not(:has(.nb-notch-cascade)){
          animation:nbnotchgroupin var(--nb-morph-fade) cubic-bezier(.22,.85,.28,1) both;
          animation-delay:calc(var(--nb-morph-lead) + var(--nb-stage,0) * var(--nb-morph-step));
          will-change:transform,opacity;
        }
        /* Opacity only, and deliberately so on both counts.
           The reference animates nothing but opacity on its content groups, and
           a transformed descendant extends its scroller's overflow: the 10px
           rise this replaced was measured into scrollHeight, so the sheet was
           sized ten pixels taller than its content and the morph's clip no
           longer matched the button it grew from. The stagger is what carries
           the arrival; the rise was never doing the work. */
        @keyframes nbnotchgroupin{from{opacity:0}to{opacity:1}}
        .nb-morph-source-label{position:absolute;inset:0;z-index:8;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:.75rem;font-weight:700;letter-spacing:.1em;opacity:1;animation:nbnotchlabelout var(--nb-morph-dur,320ms) cubic-bezier(.23,1,.32,1) both;transition:opacity 100ms cubic-bezier(.23,1,.32,1);will-change:opacity}
        @keyframes nbnotchlabelout{0%,55%{opacity:1}78%,100%{opacity:0}}
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="reveal"] .nb-morph-source-label,.nb-fluid[data-fluid-origin="notch"][data-morph-stage="content"] .nb-morph-source-label,.nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-morph-source-label{opacity:0}
        /* The close runs the container on the same duration as the open — the
           reference makes both 20 frames. The order still inverts, because the
           body's exit transition below is far shorter than the container's: the
           content is gone well before the shape finishes folding, which is what
           stops the collapse reading as the sheet being deleted. It is done that
           way rather than by delaying the container, because the reverse path in
           requestClose owns the unmount clock and a delay here would outlive it. */
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"]:not([data-fluid-reverse="true"]){animation:nbnotchout var(--nb-morph-dur,260ms) cubic-bezier(.4,0,.3,1) forwards}
        @keyframes nbnotchout{
          0%{opacity:1;transform:translate(0,0);clip-path:inset(0px 0px round 24px)}
          100%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y));clip-path:inset(var(--fluid-inset-y) var(--fluid-inset-x) round 999px)}
        }
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-morph-source-label{animation:none;opacity:1;transition-delay:130ms}
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-notch-body{animation:none;opacity:0;transform:translateY(-4px);pointer-events:none;transition-duration:80ms}
        @media(min-width:640px){.nb-fluid{transform-origin:center;border-radius:24px}}
        /* The blur is set once and never animated. A changing blur radius throws
           away the compositor's cached backdrop every frame and re-blurs the whole
           viewport — the most expensive thing on screen, running underneath the
           sheet's own morph, which is what made the first open of a session stutter
           while that pipeline warmed up. Fading the scrim's opacity fades the blur
           in with it, so it costs one blur instead of eighteen and looks the same. */
        .nb-scrim{animation:nbscrim 260ms cubic-bezier(.23,1,.32,1) forwards;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
        @keyframes nbscrim{from{opacity:0}to{opacity:1}}
        .nb-scrim.nb-fluid-closing{animation:nbscrimout 240ms ease forwards}
        @keyframes nbscrimout{0%,25%{opacity:1}100%{opacity:0}}
        .nb-sheet-h{transition:height 320ms cubic-bezier(.2,.8,.25,1)}
        .nb-edit-actions{transition:width 360ms cubic-bezier(.23,1,.32,1),background-color 260ms ease,box-shadow 260ms ease}
        .nb-edit-liquid{transition:left 360ms cubic-bezier(.23,1,.32,1)}
        .nb-edit-face{transition:opacity 200ms ease,transform 360ms cubic-bezier(.23,1,.32,1)}
        /* A multi-select pill has no single selection to slide, so its fill grows in
           and shrinks out with the same spring the traveling pill uses. */
        .nb-chip-fill{transition:transform 260ms cubic-bezier(.23,1,.32,1),opacity 180ms ease}
        /* Toasts leave the way they came instead of vanishing on the frame they are
           dismissed. */
        .nb-toast-out{animation:nbtoastout 200ms cubic-bezier(.4,0,.65,1) forwards;pointer-events:none}
        @keyframes nbtoastout{to{opacity:0;transform:translateY(14px) scale(.96)}}
        /* The mobile sheet's spring overshoots its resting place; the extension below
           keeps the overshoot from showing a gap under the bottom edge. */
        .nb-msheet::after{content:"";position:absolute;top:100%;left:0;right:0;height:40px;background:inherit}
        .nb-detail-editor{animation:nbrise 260ms cubic-bezier(.23,1,.32,1)}
        /* A primary action gets a little more weight under the finger than a
           secondary one — the difference is felt before it is read. */
        .nb-liquid{transition:scale 220ms cubic-bezier(.23,1,.32,1),box-shadow 220ms ease}
        .nb-liquid:active{scale:.94;transition:scale 90ms cubic-bezier(.4,0,.6,1)}
        .nb-rise{animation:nbrise 240ms cubic-bezier(.23,1,.32,1)}
        @keyframes nbrise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .nb-p{animation:nbp 620ms cubic-bezier(.1,.7,.3,1) forwards}
        @keyframes nbp{from{opacity:1;transform:translate(0,0) scale(1)}to{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.2)}}
        .nb-rw{animation:nbrw 900ms cubic-bezier(.2,.8,.3,1) forwards}
        @keyframes nbrw{0%{opacity:0;transform:translateY(20px) scale(.8)}25%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-52px) scale(1)}}
        .nb-blink{animation:nbb 2s ease-in-out infinite}
        @keyframes nbb{0%,100%{opacity:1}50%{opacity:.4}}
        button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,
        a[href]:focus-visible,summary:focus-visible,label[for]:focus-visible,[role="button"]:focus-visible,
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
        button,[role="button"],a[href],summary,label[for],[data-event-id],[data-task-chip]{
          -webkit-tap-highlight-color:transparent;touch-action:manipulation;
           scale:1;
           transition:scale 220ms cubic-bezier(.23,1,.32,1),background-color 200ms ease,color 200ms ease,box-shadow 220ms ease,opacity 160ms ease;
        }
        /* A collision changes every card in its cluster, so lane geometry settles
           as one connected movement. Left and width keep positioning out of
           transform, leaving the standalone press scale and drag transform free
           to do their own jobs. */
        .nb-timeline-lane{
          container-type:inline-size;
          transition:left 240ms var(--motion-lane),width 240ms var(--motion-lane),scale 220ms var(--motion-enter),opacity 160ms ease,box-shadow 200ms var(--motion-settle);
        }
        /* Collision layout can settle after a gesture ends. During the gesture,
           though, the lane is the physical object under the pointer: interpolated
           left/width geometry makes it visibly trail a line across the timeline. */
        .nb-timeline-lane.nb-timeline-lane-active{transition:none}
        /* A shared lane is information in itself. Once a card is narrow, repeat,
           alert, conflict and time badges stop repeating that information and
           yield to the two things the card must preserve: its title and JOIN. */
        @container (max-width:220px){
          .nb-event-secondary{display:none}
          .nb-event-row{column-gap:.375rem}
        }
        @container (max-width:160px){
          .nb-task-time,.nb-task-duration{display:none}
        }
        /* Down is quick and linear, release overshoots and settles — the difference
           between the two is what reads as a physical thing rather than a fade. */
        button:active,[role="button"]:active,a[href]:active,summary:active,[data-event-id]:active,[data-task-chip]:active{
          scale:.965;transition:scale 90ms cubic-bezier(.4,0,.6,1);
        }
        button:disabled,button[disabled]{scale:1!important}
        /* A control that completes something pops rather than just filling in. */
        .nb-pop{animation:nbpop 300ms cubic-bezier(.23,1,.32,1)}
        @keyframes nbpop{0%{scale:1}35%{scale:1.12}100%{scale:1}}

        /* The expanded row has intrinsic height, which made the previous 1fr to
           0fr grid transition discrete in Chromium. Measure the stable inner
           box and interpolate two numeric heights so collapse and restore share
           one interruptible path. */
        /* Focus mode is a two-layer collapse. The outer box owns the one piece of
           layout that must move — the space reclaimed by the timeline — while the
           inner box carries the visual departure. Keeping those paths separate
           prevents the header contents from fading out before the stream has
           actually received the space, which read as an abrupt jump even though
           the measured height was interpolating correctly. Both directions use
           the shell's established no-overshoot ease so a button tap, a scroll,
           and a reversal all retarget the same transition. */
        .nb-app-surface>[data-test="timeline-chrome"].nb-timeline-chrome{min-height:0;overflow:hidden;flex:0 0 auto;opacity:1;transform:none;transition:height 300ms var(--nav-ease)}
        .nb-timeline-chrome-inner{min-height:0;transform:translate3d(0,0,0);opacity:1;transition:transform 300ms var(--nav-ease),opacity 240ms var(--nav-ease)}
        .nb-day-heading{transition:padding 300ms var(--nav-ease),background-color 180ms ease,border-color 180ms ease}
        .nb-day-heading .nb-display{transition:font-size 300ms var(--nav-ease),line-height 300ms var(--nav-ease)}
        .nb-timeline-chrome.is-collapsed{pointer-events:none}
        .nb-timeline-chrome.is-collapsed .nb-timeline-chrome-inner{opacity:0;transform:translate3d(0,-10px,0)}
        @media(max-width:639px){
          .nb-month-navigator.is-month{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:.5rem;row-gap:.25rem;align-items:center}
          .nb-month-navigator.is-month .nb-month-view-mode{justify-content:flex-end}
          .nb-month-navigator.is-month .nb-month-controls{grid-column:1 / -1}
        }
        .nb-day-heading.is-focused{padding-top:.45rem;padding-bottom:.45rem;border-bottom:1px solid ${T.line}}
        .nb-day-heading.is-focused .nb-display{font-size:2rem;line-height:2rem}

        @media(prefers-reduced-motion:reduce){*{animation-name:none!important;animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;scroll-behavior:auto!important}
          .nb-app-surface,.nb-nav-brand,.nb-nav-item,.nb-nav-membership{transition-duration:1ms!important}
          button:active,[role="button"]:active,a[href]:active,[data-event-id]:active,[data-task-chip]:active{scale:1!important}}
        ${preferences?.display.reducedMotion ? `*{animation-name:none!important;animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;scroll-behavior:auto!important}
          button:active,[role="button"]:active,a[href]:active,[data-event-id]:active,[data-task-chip]:active{scale:1!important}` : ""}
      `}</style>

      <div data-test="timeline-chrome" data-collapsed={String(timelineViewFocused)}
        className={`nb-timeline-chrome ${timelineViewFocused ? "is-collapsed" : ""}`}
        style={{ height: timelineViewFocused ? 0 : (timelineChromeHeight == null ? "auto" : timelineChromeHeight) }}>
      <div ref={attachTimelineChromeInner} className="nb-timeline-chrome-inner">
      {/* ══ HUD ══ */}
      <header style={{ background: T.bg, borderBottom: `1px solid ${T.line}`, color: T.text }} className="nb-hud sticky top-0 z-30 px-3 sm:px-5 py-2 flex items-center justify-between gap-3">
        <div className="nb-hud-left flex items-center gap-2 min-w-0">
          <button ref={navToggleRef} data-test="nav-toggle" type="button" aria-label="Toggle primary navigation" aria-controls="planner-navigation" aria-expanded={navOpen}
            onClick={() => { beep("click"); navOpen ? closeNavigation() : openNavigation(); }} className="nb-shell-control nb-tap nb-hover-icon w-8 h-8 flex items-center justify-center" title="Navigation"><MenuIcon /></button>
          <div className="flex items-baseline gap-2 min-w-0">
          {level != null && <>
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">LVL</span>
            <span style={{ fontFamily: MONO }} className="text-sm font-bold">{level}</span>
            <div style={{ background: T.faint }} className="w-14 h-1 mx-1"><div style={{ background: T.accent, width: `${levelPct}%` }} className="h-full" /></div>
          </>}
          {streak != null && streak > 0 && <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{streak}d</span>}
          </div>
        </div>
        <div className="nb-hud-actions flex items-center gap-1 shrink-0">
          <button onClick={() => { jumpTo(todayKey); setMonthCursor(new Date()); }} style={{ fontFamily: MONO, color: T.dim }} className="nb-hud-today nb-tap nb-hover-control px-2 py-1 text-xs tracking-widest">TODAY</button>
          <button onClick={() => { beep("click"); setNotebook("all"); }} style={{ fontFamily: MONO, color: T.dim }} className="nb-hud-notes nb-tap nb-hover-control px-2 py-1 text-xs tracking-widest">NOTES</button>
          <GooeySearch T={T} surface={surface} reduced={reducedMotion}
            onOpen={() => { beep("click"); setSearchQuery(""); setSearch(true); }} />
          <button onClick={() => { beep("click"); setSettings(true); }} style={{ color: T.dim }} className="nb-hud-settings nb-tap nb-hover-icon w-8 h-8 flex items-center justify-center" aria-label="Settings"><MoreIcon /></button>
          <button data-test="new-entry" data-morph-source="new-entry" tabIndex={composer?.morphSource?.id === "new-entry" ? -1 : undefined}
            onClick={() => { beep("click"); setComposer({ kind: "event", start: startSlot(nowMin), dur: 60, notch: true, morphSource: { id: "new-entry", label: "NEW" } }); }}
            style={{ background: T.accent, color: T.on, fontFamily: MONO, visibility: composer?.morphSource?.id === "new-entry" ? "hidden" : undefined }}
            className="nb-tap nb-liquid nb-hover-control px-2 py-1.5 text-xs font-bold tracking-widest">NEW</button>
        </div>
      </header>

      {/* ══ NAVIGATOR ══ */}
      <div onTouchStart={onTouchStartNav} onTouchMove={onTouchMoveNav} style={{ borderBottom: `1px solid ${T.line}` }}>
        <div className={`nb-month-navigator flex items-center justify-between px-3 sm:px-5 py-1.5 ${zoom === "month" ? "is-month" : ""}`}>
          <button data-test="zoom-out" onClick={zoomOut} style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-data shrink-0 whitespace-nowrap" disabled={zoom === "month"}>
            {zoom === "day" || zoom === "week" ? <span className="inline-flex items-center gap-1"><ChevronIcon direction="left" />{zoom === "day" ? "WEEK" : "MONTH"}</span> : `${MO[monthCursor.getMonth()]} ${monthCursor.getFullYear()}`}
          </button>
          <div className="nb-month-view-mode flex items-center gap-2 min-w-0">
            {/* Timeline answers "when, and for how long"; agenda answers "what is
                coming". Same days, same data, two questions. */}
            <PillNav T={T} ariaLabel="View mode" testId="view-mode" value={viewMode}
              compact={compactViewPills}
              icons={{ timeline: CalendarIcon, agenda: ListIcon, actions: CheckIcon }}
              options={[["timeline", "TIMELINE"], ["agenda", "AGENDA"], ["actions", "ACTIONS"]]}
              onPick={(mode, source) => {
                if (mode === viewMode) return;
                beep("tick");
                selectViewMode(mode, source);
              }}
              className="shrink-0" style={{ border: `1px solid ${T.line}` }} />
          </div>
          {zoom === "month" ? (
            <div className="nb-month-controls flex items-center justify-end gap-2">
              <button aria-label="Previous month" onClick={() => { beep("page"); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)); }} style={{ color: T.dimText }} className="nb-tap nb-hover-icon px-2 text-xs flex items-center justify-center"><ChevronIcon direction="left" /></button>
              <button aria-label="Next month" onClick={() => { beep("page"); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)); }} style={{ color: T.dimText }} className="nb-tap nb-hover-icon px-2 text-xs flex items-center justify-center"><ChevronIcon /></button>
              <button data-test="zoom-in" onClick={zoomIn} style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-data" disabled={zoom === "day"}>
                <span className="inline-flex items-center gap-1">WEEK<ChevronIcon /></span>
              </button>
            </div>
          ) : (
            zoom === "week" && (
              <button data-test="zoom-in" onClick={zoomIn} style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-data">
                <span className="inline-flex items-center gap-1">DAY<ChevronIcon /></span>
              </button>
            )
          )}
        </div>

        {zoom === "month" && viewMode !== "actions" && (
          <div className="px-3 sm:px-5 pb-3">
            <div className="grid grid-cols-7 mb-1">{weekdayOrder.map((d) => <span key={d} style={{ fontFamily: MONO, color: T.dimText }} className="text-center nb-data">{WD1[d]}</span>)}</div>
            <div className="grid grid-cols-7 gap-px" style={{ background: T.line }}>
              {monthGrid.map((d, i) => {
                const k = keyOf(d);
                const n = monthDensities?.get(k) ?? densityOf(d);
                const bf = monthBusy?.get(k) ?? busyFractionOf(d);
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
            className="nb-cell nb-hover-tile relative pt-2 pb-3.5"
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

        {/* One rolling ribbon of days, in the day view as well as the week. It keeps
            a generous two-year window mounted, then shifts that window by a year
            at either scroll edge. The date surface is therefore effectively
            unbounded without growing a permanent DOM row or losing scroll place. */}
        {(zoom === "week" || zoom === "day") && viewMode !== "actions" && (
              <div className="flex items-center">
            {zoom === "day" && (
              <button onClick={() => goDay(-1)} aria-label="Previous day" style={{ color: T.dimText }} className="nb-tap nb-hover-icon shrink-0 px-2 sm:px-3 py-1 flex items-center justify-center"><ChevronIcon direction="left" /></button>
            )}
            <div ref={attachRibbon} data-test="day-ribbon" data-ribbon-start={ribbonRange.startKey}
              data-ribbon-end={addDaysToKey(ribbonRange.endKey, -1)} data-ribbon-total-days={ribbonSpan}
              data-ribbon-window-start={ribbonWindowStart} data-ribbon-window-end={ribbonWindowEnd - 1}
              onScroll={onRibbonScroll} style={stripFade} className="nb-x overflow-x-auto flex-1 min-w-0">
            <div className="flex min-w-max">
              <div aria-hidden="true" className="nb-ribbon-spacer" style={{ "--nb-ribbon-cells": ribbonWindowStart }} />
              {ribbonDays.map((d, visibleIndex) => {
                const i = ribbonWindowStart + visibleIndex;
                const k = keyOf(d);
                const on = k === dateKey;
                const n = ribbonDensities.get(k) ?? 0;
                const target = gesture && gesture.overDay === k;
                return (
                  <button key={k} data-day={k} ref={on ? activeRef : null} onClick={() => jumpTo(k)}
                    className="nb-cell nb-tap relative w-16 sm:w-20 lg:w-24 shrink-0 py-2.5"
                    style={{ opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(10px)", transitionDelay: `${Math.min(i, 10) * 14}ms`, boxShadow: target ? `inset 0 0 0 2px ${T.accent}` : "none" }}>
                    {/* Selection is a filled cell and today is an outlined one. Washing
                        every busy day in accent turned the whole strip a muddy tint and
                        made the selected day compete with its neighbours. */}
                    <span className="absolute inset-1" style={{
                      borderRadius: CARD_R,
                      background: on ? T.accent : "transparent",
                      boxShadow: !on && k === todayKey ? `inset 0 0 0 1.5px ${T.faint}` : "none",
                    }} />
                    <span className="relative block">
                      <span style={{ fontFamily: MONO, color: on ? T.on : T.dim }} className="block nb-data">{WD[d.getDay()]}</span>
                      <span style={{ fontFamily: MONO, color: on ? T.on : T.text }} className="block text-xl font-bold tracking-tight">{pad(d.getDate())}</span>
                      <span style={{ fontFamily: MONO, color: on ? T.on : T.dim }} className="block nb-data">{k === todayKey ? "NOW" : MO[d.getMonth()]}</span>
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
              <div aria-hidden="true" className="nb-ribbon-spacer" style={{ "--nb-ribbon-cells": Math.max(0, ribbonSpan - ribbonWindowEnd) }} />
            </div>
            </div>
            {zoom === "day" && (
              <button onClick={() => goDay(1)} aria-label="Next day" style={{ color: T.dimText }} className="nb-tap nb-hover-icon shrink-0 px-2 sm:px-3 py-1 flex items-center justify-center"><ChevronIcon /></button>
            )}
              </div>
        )}
      </div>
      </div>
      </div>

      {/* ══ HERO ══ */}
      <div data-test="day-heading" data-date={dateKey}
        className={`nb-day-heading relative z-20 px-3 sm:px-5 pt-4 pb-3 ${timelineViewFocused ? "is-focused" : ""}`}
        style={{ background: T.bg }}>
        <div className="flex items-end gap-3">
          <span style={{ fontFamily: MONO }} className="nb-display">{pad(activeDate.getDate())}</span>
          <span className="min-w-0 flex-1 pb-1.5">
            <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data">{WD[activeDate.getDay()]} · {MO[activeDate.getMonth()]} {activeDate.getFullYear()}</span>
            <span className="block text-sm font-semibold leading-snug mt-0.5">{briefing}</span>
          </span>
          {viewMode === "timeline" && (zoom === "day" || zoom === "week") && (
            <button type="button" data-test="timeline-focus-toggle"
              aria-label={timelineViewFocused ? "Expand timeline navigation" : "Focus timeline"}
              aria-expanded={!timelineViewFocused}
              aria-keyshortcuts="F"
              onClick={() => { beep("tick"); setTimelineFocusSource("manual"); setTimelineFocused((current) => !current); }}
              className="nb-tap nb-hover-icon mb-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ color: T.dimText, border: `1px solid ${T.line}` }}>
              <span aria-hidden="true" style={{ transform: timelineViewFocused ? "rotate(180deg)" : "none", transition: "transform 220ms cubic-bezier(.77,0,.175,1)" }}><ChevronIcon direction="up" /></span>
            </button>
          )}
        </div>
      </div>

      {/* A report, not an alarm. The moments have gone, and ringing for them now
          would be a lie about what time it is — but saying nothing was worse: the
          notebook knew it had missed something and kept it to itself. It sits in
          the flow of the page rather than floating over it, because unlike a
          toast there is no hurry and nothing underneath it needs reading first. */}
      {missedReport && missedReport.length > 0 && (
        <div className="px-3 sm:px-5 pb-3">
          <div data-test="missed-reminders" className="nb-up flex items-center gap-3 px-3 py-2"
            style={{ background: surface, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
            <span style={{ color: T.dimText }} className="shrink-0"><BellIcon size={13} /></span>
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">WHILE YOU WERE AWAY</span>
            <span className="nb-body truncate flex-1">
              {missedReport.length === 1
                ? missedReport[0].title
                : `${missedReport.length} reminders came due`}
            </span>
            <button data-test="missed-reminders-review" onClick={() => { beep("click"); setMissedSheet(true); }}
              style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-hover-control text-xs font-bold tracking-widest shrink-0 underline">REVIEW</button>
            <button data-test="missed-reminders-dismiss" onClick={() => { beep("tick"); closeMissedReport(); }}
              style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-label shrink-0">CLEAR</button>
          </div>
        </div>
      )}

      {/* Everything is on this device, and export is a manual action in Settings
          nobody performs on a good day. This is the only thing that closes the
          gap between "my planner" and "my planner, if this browser survives" —
          so it is a real prompt, and it is rare enough to be believed: never for
          an empty notebook, never twice for the same content, and "not now"
          holds until the notebook has actually moved on. It yields to the
          storage warning, which is the more urgent problem.

          It sits in the page, like the report above it, and for the same reason:
          it is a standing suggestion, not an alarm. Floating, it was a full-width
          bar lying across the lower third of the timeline on a phone, and it
          stayed there until dismissed — every card behind it was untappable, and
          nothing on screen explained why. Docking it to a corner fixed the wide
          layout and left the narrow one exactly as it was. A nudge with no
          urgency has no business covering the day. */}
      {askForBackup && !storageBad && !firstRun && (
        <div className="px-3 sm:px-5 pb-3">
          <div data-test="backup-nudge" className="nb-up flex items-center gap-3 px-3 py-2"
            style={{ background: surface, color: T.text, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
            <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-label shrink-0">BACK UP</span>
            <span className="nb-body truncate flex-1">This notebook only exists on this device.</span>
            <button data-test="backup-nudge-save" onClick={() => { beep("click"); exportJson(); }}
              style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-hover-control text-xs font-bold tracking-widest shrink-0 underline">SAVE A COPY</button>
            <button data-test="backup-nudge-dismiss"
              onClick={() => { beep("click"); setBackupRecord((current) => recordBackupDismissed(current, { state: db, today: todayKey })); }}
              style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-data shrink-0" aria-label="Not now">NOT NOW</button>
          </div>
        </div>
      )}

      {gestureHintVisible && !firstRun && viewMode === "timeline" && zoom === "day" && (
        <div className="px-3 sm:px-5 pb-3">
          <div data-test="gesture-hint" className="nb-up flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-x-3"
            style={{ background: surface, color: T.text, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
            <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-label shrink-0">GESTURES</span>
            <span className="nb-body min-w-0 flex-1">Hold a slot to create · hold to move · swipe the page to change view.</span>
            <div className="flex items-center gap-3">
            <button onClick={() => { beep("click"); dismissGestureHint(); setShortcuts(true); }}
              style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-hover-control text-xs font-bold tracking-widest shrink-0 underline">SHORTCUTS</button>
            <button data-test="gesture-hint-dismiss" onClick={() => { beep("click"); dismissGestureHint(); }}
              style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-data shrink-0" aria-label="Dismiss gesture hint">GOT IT</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BODY ══ */}
      <main className={`nb-main px-3 sm:px-5 grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 ${viewMode === "timeline" && zoom === "day" ? "nb-main-day-timeline" : ""} ${actionsLayout} ${viewHandoff === 1 ? "nb-view-enter-a" : viewHandoff === 2 ? "nb-view-enter-b" : ""}`}
        style={{ "--sheet-pad": sheetPad, "--nb-view-dir": viewDir }}>
        <section className="flex flex-col min-h-0 min-w-0" onTouchStart={onSwipeStart} onTouchMove={onSwipeMove} onTouchEnd={onSwipeEnd} onTouchCancel={onSwipeEnd}
          style={{
            transform: swipe === 0 ? "none" : `translateX(${swipe * 0.32}px)`,
            transition: snapping || swipe !== 0 ? "none" : "transform 260ms cubic-bezier(.2,.8,.25,1)",
          }}>
          <div key={turn ? turn.k : "first"} className={`nb-page flex flex-col min-h-0 flex-1 ${turn ? (turn.dir > 0 ? "nb-turn-next" : "nb-turn-prev") : ""}`}>

            {viewMode === "actions" ? (
              <div className="nb-s overflow-y-auto min-h-0 flex-1">
                <div className="flex items-center justify-between pb-2">
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">ALL ACTIONS</span>
                  <button onClick={() => selectViewMode("timeline")} style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-hover-control nb-label">BACK TO DAY</button>
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
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label mr-0.5">FIND A SLOT</span>
                  {[30, 60, 120].map((d) => (
                    <button key={d} onClick={() => { beep("tick"); setSlotDur((cur) => (cur === d ? null : d)); }}
                      className={`nb-tap nb-hover-choice ${slotDur === d ? "is-selected" : ""} px-2 py-0.5 text-xs font-bold tracking-widest`}
                      style={{ fontFamily: MONO, borderRadius: 999, background: slotDur === d ? T.accent : "transparent", color: slotDur === d ? T.on : T.dim, border: `1px solid ${slotDur === d ? T.accent : T.line}` }}>
                      {d >= 60 ? `${d / 60}H` : `${d}M`}
                    </button>
                  ))}
                  {slotDur != null && (slotMatches.length === 0 ? (
                    <span style={{ fontFamily: MONO, color: NOW_RED }} className="nb-label">NO OPEN GAPS THIS WEEK</span>
                  ) : (
                    slotMatches.slice(0, 6).map((s) => (
                      <button key={`${s.date}-${s.start}`}
                        data-test="week-slot" data-slot-date={s.date}
                        onClick={() => { beep("click"); if (s.date !== dateKey) jumpTo(s.date); setComposer({ kind: "event", date: s.date, start: s.start, dur: s.dur }); }}
                        className="nb-tap nb-hover-choice px-2 py-0.5 nb-data"
                        style={{ fontFamily: MONO, color: T.accentText, borderRadius: 999, border: `1.5px dashed ${T.accent}` }}>
                        {plannedLabel(s.date, todayKey).toUpperCase()} {tm(s.start)}
                      </button>
                    ))
                  ))}
                </div>
                <WeekGrid
                  T={T} surface={surface} hourRule={hourRule} hourBand={hourBand}
                  week={week} dateKey={dateKey} todayKey={todayKey} nowMin={nowMin} clock={clock}
                  slots={slotMatches}
                  draftPreview={draftPreview}
                  onCreateDraft={(draft) => {
                    beep("click");
                    setDraftPreview(draft);
                    setComposer({ kind: "event", date: draft.date, start: draft.start, dur: draft.dur });
                  }}
                  onTimelineScroll={onTimelineScrollPosition}
                  onTimelineIntent={() => {
                    timelineScrollSessionRef.current.begin();
                    timelineUserScrollRef.current = true;
                    timelineScrollSessionRef.current.end();
                  }}
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
                {allDay.length > 0 && <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">ALL DAY</span>}
                {allDay.map((e) => {
                  const span = e.endDate ? diffDays(e.endDate, e.date) + 1 : 1;
                  const idx = diffDays(dateKey, e.date) + 1;
                  return (
                    <RowWithJoin key={e.id} T={T} surface={surface} link={e.link} title={e.title}
                      padding="px-2.5 py-2"
                      onOpen={() => { beep("click"); setInspect({ kind: "event", id: e.id }); }}>
                      <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                      <span className="nb-lead truncate flex-1">{e.title}</span>
                      {span > 1 && <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">{idx}/{span}</span>}
                    </RowWithJoin>
                  );
                })}
                {dayTasks.some((task) => task.planned.startMinute == null) && (
                  <>
                    <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label mt-1">ANY TIME</span>
                    <div ref={anyTimeRef} style={anyTimeFade} className="flex gap-1.5 overflow-x-auto nb-x pb-0.5">
                      {dayTasks.filter((task) => task.planned.startMinute == null).map((task) => (
                        <button key={task.id}
                          onClick={() => { beep("click"); setInspect({ kind: "task", id: task.id }); }}
                          onPointerDown={(event) => {
                            if (event.pointerType === "mouse" && event.button !== 0) return;
                            startGesture({ mode: "task", kind: "task", id: task.id, x: event.clientX, y: event.clientY });
                          }}
                          className="nb-tap nb-hover-tile shrink-0 flex items-center gap-2 px-2.5 py-1.5 text-left"
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

            <div ref={attachStream} data-test="day-stream" className="nb-s nb-stream overflow-y-auto relative" style={{ background: T.card, borderTopLeftRadius: allDay.length || dayTasks.some((task) => task.planned.startMinute == null) ? 0 : 16, userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
              <div className="relative" style={{ height: dayHeight }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="absolute left-0 right-0 flex items-start pointer-events-none"
                    style={{ top: h * dayHourHeight, height: dayHourHeight }}>
                    {/* The label owns its gutter: rules and banding start after it, so
                        the times read on clean card instead of sitting across the
                        grid lines they annotate. */}
                    {/* The hour yields to the now marker when the marker is on top
                        of it. Two times a few pixels apart is not more
                        information than one — it is the same information,
                        illegible. Fading rather than unmounting so the label
                        returns as the minute moves on. */}
                    <span style={{
                      fontFamily: MONO, color: T.dimText,
                      transform: h === 0 ? "none" : "translateY(-50%)",
                      opacity: isToday && liveTimelineItem && Math.abs(nowMin - h * 60) < nowLabelClearanceMin ? 0 : 1,
                      transition: "opacity 200ms ease",
                    }}
                      className="w-14 shrink-0 pr-3 text-right nb-data">{fmtHour(h, clock)}</span>
                    <div className="flex-1 h-full" style={{
                      /* Depth comes from banding, not from rules. A hairline every hour
                         reads as a table; alternating fills give the same reading
                         without drawing 24 lines across the content. */
                      borderTop: `1px solid ${hourRule}`,
                      background: h % 2 ? hourBand : "transparent",
                    }}>
                    </div>
                  </div>
                ))}

                <div className="absolute inset-0" style={{ touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={canvasDown} onPointerUp={canvasUp} />

                <div className="absolute left-16 right-2 top-0" style={{ height: dayHeight, pointerEvents: "none" }}>
                  {isToday && (
                    <>
                      {/* The rule runs up to the live item and stops there; inside the
                          card the elapsed fill carries the same accent onward, so the
                          line reads as flowing into time already claimed rather than
                          being cut off behind it. With nothing live it spans the full
                          width. */}
                      <div data-test="timeline-now-line" className="absolute pointer-events-none" style={{
                        left: 0,
                        width: liveTimelineItem ? `calc(${laneL}% + 2px)` : "100%",
                        top: mounted ? (nowMin / 1440) * dayHeight : 0,
                        height: 2,
                        background: T.accent,
                        /* The live-time rule belongs to the grid; the matching fill
                           owns its continuation inside either kind of live card.
                           Cards remain the foreground and the time badge below stays
                           above them when it replaces a gutter label. */
                        zIndex: 0,
                         transition: "top 260ms cubic-bezier(.23,1,.32,1), width 260ms cubic-bezier(.23,1,.32,1)",
                      }} />
                      {/* With nothing live the rule crosses empty grid, so the time
                          can sit at the end of it. While a timed item is live its
                          lane is card, and a chip there would land on information it
                          is meant to be reading, so it steps into the hour gutter. */}
                      <span data-test="timeline-now-time" className="absolute px-1.5 py-0.5 nb-data pointer-events-none"
                        style={{
                          fontFamily: MONO, background: T.accent, color: T.on, borderRadius: 4,
                          /* Opaque, because in the gutter it lands on whichever hour
                             label is nearest and has to replace it rather than
                             overprint it. */
                          ...(liveTimelineItem
                            /* Wide enough to cover the whole hour label it replaces,
                               not just overlap part of it and leave a stray digit. */
                            ? { right: "100%", marginRight: 4, whiteSpace: "nowrap", minWidth: 54, textAlign: "right" }
                            : { right: 0 }),
                          top: mounted ? (nowMin / 1440) * dayHeight - 9 : -9,
                          zIndex: 7,
                           transition: "top 260ms cubic-bezier(.23,1,.32,1)",
                        }}>
                        {/* In the gutter it drops the meridiem: the hour labels it
                            sits among already say which half of the day this is, and
                            the full form does not fit the rail. */}
                        {liveTimelineItem ? tm(nowMin).replace(/\s*[AP]M$/i, "") : tm(nowMin)}
                      </span>
                    </>
                  )}

                  {events.map((e) => {
                    const top = (e.start / 1440) * dayHeight;
                    /* Subtract the inter-card gap from a real duration, but never
                       from the minimum itself. The old ordering turned the stated
                       22px floor into 19px — shorter than one line of title text. */
                    const h = Math.max(22, (e.dur / 1440) * dayHeight - 3);
                    const live = isToday && nowMin >= e.start && nowMin < e.start + e.dur;
                    const past = isToday && nowMin >= e.start + e.dur;
                    const pct = live ? ((nowMin - e.start) / e.dur) * 100 : 0;
                    const held = gesture && gesture.id === e.id
                      && (gesture.mode === "move" || gesture.mode === "resize-end" || gesture.mode === "resize-start");
                    const joinUrl = normalizeMeetingLink(e.link);
                    /* A linked card reserves its trailing lane for JOIN. Its padded
                       title line (19.5px), metadata line (17.55px) and gap need just
                       over 51px, so a smaller card must remain one line rather than
                       making the range appear underneath the title. */
                    const hasRoomForLinkedTime = !joinUrl || h >= 52;
                    return (
                      <div key={e.id} data-event-id={e.id} className={`nb-timeline-lane absolute ${held ? "nb-timeline-lane-active" : "nb-hover-tile"}`} style={{ top: top + 2, height: h, left: `${(e.lane / e.cols) * 100}%`, width: `calc(${100 / e.cols}% - 6px)`, zIndex: held ? 20 : 1, opacity: held && gesture.overDay ? 0.35 : 1, pointerEvents: "auto" }}>
                        <div role="button" tabIndex={0} aria-label={e.title}
                          onPointerDown={(ev) => eventDown(ev, e)} onPointerUp={(ev) => eventUp(ev, e)}
                          onKeyDown={(ev) => {
                            if (ev.key !== "Enter" && ev.key !== " ") return;
                            ev.preventDefault();
                            if (clickFollowsGesture()) return;
                            beep("click");
                            setInspect({ kind: "event", id: e.id });
                          }}
                          onContextMenu={(ev) => ev.preventDefault()}
                          className="relative w-full h-full overflow-hidden"
                          style={{
                            background: surface,
                            borderRadius: CARD_R,
                            opacity: past ? 0.74 : 1,
                            boxShadow: held
                              ? `0 10px 28px rgba(0,0,0,.45), inset 0 0 0 2px ${T.accent}`
                              : live ? `inset 0 0 0 1.5px ${T.accent}` : past ? `inset 0 0 0 1px ${T.line}` : "var(--e1)",
                            transform: held ? "scale(1.02)" : "none",
                            transition: "transform 120ms ease, box-shadow 120ms ease, background 200ms ease",
                            touchAction: "pan-y", cursor: "grab",
                          }}>
                          {/* A live event fills with the theme accent as it elapses, so
                              "now" is expressed in the same colour system as everything
                              else instead of an unrelated crimson. */}
                          {live && (
                            <span className="absolute inset-y-0 left-0 pointer-events-none"
                               style={{ width: `${pct}%`, background: `${T.accent}26`, transition: "width 260ms linear" }}>
                              {/* the leading edge is the rule, continued through the card */}
                              <span className="absolute inset-y-0" style={{ right: 0, width: 2, background: T.accent }} />
                            </span>
                          )}
                          <div className={`relative pl-2.5 pr-2.5 ${h < 28 ? "h-full py-0" : "py-1.5"}`} style={{ paddingRight: joinUrl ? 64 : undefined }}>
                            <div className={`nb-event-row flex items-center gap-2 ${h < 28 ? "h-full" : ""}`}>
                              {/* the category dot is the card's only colour, so it stays
                                  legible at 22px height where a left rail would vanish */}
                              <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: held ? T.accent : catColor(e.cat) }} />
                              <span title={e.title} className="nb-lead min-w-0 truncate flex-1">{e.title}</span>
                              {conflictIds.has(e.id) && <span title="Overlaps another event" style={{ color: NOW_RED }} className="nb-event-secondary shrink-0"><WarningIcon /></span>}
                              {e.repeat && <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-event-secondary shrink-0"><RepeatIcon /></span>}
                              {e.alerts && e.alerts.length > 0 && (
                                <span style={{ color: T.dimText }} className="nb-event-secondary shrink-0" title="Has a reminder"><BellIcon /></span>
                              )}
                              {live && <span style={{ fontFamily: MONO, background: T.accent, color: T.on, borderRadius: 4 }} className="nb-event-secondary shrink-0 px-1 nb-data">{Math.round(pct)}%</span>}
                              {held && <span style={{ fontFamily: MONO, background: T.accent, color: T.on, borderRadius: 4 }} className="shrink-0 px-1 nb-data">{gesture.overDay ? fmtDay(gesture.overDay) : tm(e.start)}</span>}
                              {!held && !live && !joinUrl && h < 38 && <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-event-secondary nb-event-short-time nb-data min-w-0 truncate shrink-0">{tm(e.start)} → {tm(e.start + e.dur)}</span>}
                            </div>
                            {h >= 38 && hasRoomForLinkedTime && (
                              <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data truncate mt-0.5 pl-4">
                                {tm(e.start)} → {tm(e.start + e.dur)}
                              </span>
                            )}
                            {h >= 88 && (e.place || e.note) && (
                              <span style={{ color: T.dimText }} className="block text-xs mt-1 truncate pl-4">{e.place || e.note}</span>
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
                          {/* `pan-y`, not `none`, and the same as the card behind
                              them. `none` told the browser this strip handles its
                              own gestures and must never scroll — which was true
                              only while a press on a grip meant a resize the
                              instant it landed. Now that a grip waits for a hold
                              like everything else here, a finger that starts on
                              one and moves is a scroll, and the browser has to be
                              allowed to treat it as one. The hold fires before any
                              movement, so a real resize still claims the gesture
                              first and `preventDefault` keeps it. */}
                          <div data-resize={e.id} data-resize-edge="start" onPointerDown={(ev) => resizeDown(ev, e, "start")} className="absolute inset-x-0 top-0 flex items-start justify-center" style={{ height: h < 28 ? 8 : 8, cursor: "ns-resize", touchAction: "pan-y" }}>
                            <span style={{ background: T.faint, width: 22, height: 2, marginTop: 2, borderRadius: 2 }} />
                          </div>
                          <div data-resize={e.id} data-resize-edge="end" onPointerDown={(ev) => resizeDown(ev, e, "end")} className="absolute inset-x-0 bottom-0 flex items-end justify-center" style={{ height: 12, cursor: "ns-resize", touchAction: "pan-y" }}>
                            <span style={{ background: T.faint, width: 22, height: 2, marginBottom: 3, borderRadius: 2 }} />
                          </div>
                        </div>
                        {joinUrl && (
                          <a href={joinUrl} target="_blank" rel="noopener noreferrer" draggable={false} data-join={e.id}
                            onPointerDownCapture={(ev) => ev.stopPropagation()}
                            onPointerUpCapture={(ev) => ev.stopPropagation()}
                            onPointerCancel={(ev) => ev.stopPropagation()}
                            onTouchStart={(ev) => ev.stopPropagation()}
                            onTouchEnd={(ev) => ev.stopPropagation()}
                            onClick={(ev) => ev.stopPropagation()}
                            aria-label={`Join ${e.title}`}
                            className="absolute inset-y-0 right-1 z-20 inline-flex w-14 items-center justify-center gap-1 text-xs font-bold leading-none tracking-widest"
                            style={{ fontFamily: MONO, color: T.accentText }}>
                            JOIN <ExternalLinkIcon />
                          </a>
                        )}
                      </div>
                    );
                  })}

                  {timelineDraft && (
                    <div data-test="timeline-draft-preview" className="absolute left-0 right-2 pointer-events-none flex items-center justify-center"
                      style={{ top: (timelineDraft.start / 1440) * dayHeight, height: (timelineDraft.dur / 1440) * dayHeight, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1.5px ${T.accent}`, background: `${T.accent}14` }}>
                      <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-data">
                        {tm(timelineDraft.start)} – {tm(timelineDraft.start + timelineDraft.dur)}
                      </span>
                    </div>
                  )}

                  {/* An action with an estimate occupies the time it claims. It used
                      to be drawn 28px tall whatever it said it would take, so a
                      three-hour action and a five-minute one looked identical and the
                      day looked emptier than it was. */}
                  {plannedTasks.map((t) => {
                    const sizing = gesture && gesture.mode === "task-resize" && gesture.id === t.id;
                    const dragging = gesture && gesture.mode === "task" && gesture.id === t.id;
                    const estimate = sizing ? gesture.dur : t.planned.estimateMinutes;
                    const block = isResizable(t, "task");
                    const h = block ? Math.max(28, (estimate / 1440) * dayHeight - 3) : 28;
                    const live = liveAction?.id === t.id;
                    const pct = live ? livePct * 100 : 0;
                    return (
                      <TimelineActionCard key={t.id} task={t}
                        top={((dragging && gesture.start != null ? gesture.start : t.planned.startMinute) / 1440) * dayHeight + 2}
                        height={h} left={`${(t.lane / t.cols) * 100}%`} width={`calc(${100 / t.cols}% - 6px)`}
                        estimate={estimate} block={block} sizing={sizing} dragging={dragging} reducedMotion={reducedMotion}
                        live={live} livePct={pct}
                        subtaskProgress={subtaskProgressByParent.get(parseTaskOccurrenceId(t.id).seriesId) ?? null}
                        swipeOffset={taskSwipe?.id === t.id ? taskSwipe.offset : 0}
                        theme={T} mono={MONO} cardRadius={CARD_R} formatTime={tm} formatDuration={dur}
                        clickFollowsGesture={clickFollowsGesture}
                        onOpen={(id) => { beep("click"); setInspect({ kind: "task", id }); }}
                        onComplete={completeTask}
                        onReopen={reopenTask}
                        onPointerDown={taskDown}
                        onPointerMove={(event, task) => {
                          const active = gestureRef.current;
                          if (!active || active.id !== task.id) return;
                          event.preventDefault();
                          applyMove(event.clientX, event.clientY);
                        }}
                        onPointerUp={taskUp}
                        onResizePointerDown={(ev, task, nextEstimate) => resizeDown(ev, { id: task.id, start: task.planned.startMinute, dur: nextEstimate }, "end", "task")} />
                    );
                  })}

                  {dropMin != null && (
                    <div data-test="timeline-drop-preview" className="absolute left-0 right-2 pointer-events-none" style={{ top: (dropMin / 1440) * dayHeight, zIndex: 0 }}>
                      <div style={{ borderTop: `1px dashed ${T.accent}99`, height: 1 }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            </>
            )}
          </div>
        </section>

        {viewMode !== "actions" && (
          <section id="actions-column" data-test="actions-column" aria-hidden={!actionsOpen} className={`nb-actions-column nb-s hidden lg:block min-h-0 overflow-y-auto relative ${actionsOpen ? "" : "is-collapsed"}`}>
            {actionsPanel}
          </section>
        )}
        {viewMode !== "actions" && (
          <button data-test="actions-restore" aria-hidden={actionsOpen} tabIndex={actionsOpen ? -1 : 0} aria-controls="actions-column" onClick={() => setActionsOpen(true)}
            className={`nb-actions-restore nb-tap hidden lg:block fixed right-0 top-1/2 z-20 px-2 py-4 text-xs font-bold tracking-widest ${actionsOpen ? "is-hidden" : ""}`}
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
         style={{ height: "76vh", background: T.card, borderTop: `1px solid ${T.line}`, transform: sheet ? "translateY(0)" : "translateY(calc(100% - 52px))", transition: "transform 360ms cubic-bezier(.23,1,.32,1)" }}>
        <div className="flex items-center gap-3 px-3 shrink-0" style={{ height: 52 }}>
          <button onClick={() => { beep("tick"); setSheet(!sheet); }} className="nb-tap nb-hover-control flex-1 flex items-center gap-2 text-left" aria-label="Toggle actions">
            <span style={{ background: T.faint }} className="w-8 h-0.5" />
            <span style={{ fontFamily: MONO }} className="nb-label">ACTIONS</span>
            <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-data">{openCount} OPEN</span>
            {isToday && overdue.length > 0 && <span style={{ fontFamily: MONO, color: NOW_RED }} className="nb-data">{overdue.length} LATE</span>}
          </button>
          <button data-test="new-action" data-morph-source="new-action" tabIndex={composer?.morphSource?.id === "new-action" ? -1 : undefined}
            onClick={() => { beep("click"); setComposer({ kind: "task", notch: true, morphSource: { id: "new-action", label: "+ ACTION" } }); }}
            style={{ background: T.accent, color: T.on, fontFamily: MONO, visibility: composer?.morphSource?.id === "new-action" ? "hidden" : undefined }}
            className="nb-tap nb-liquid nb-hover-control px-3 py-1.5 text-xs font-bold tracking-widest">+ ACTION</button>
        </div>
        <div className="nb-s flex-1 overflow-y-auto px-3 pb-6">{actionsPanel}</div>
      </div>
      )}

      {draggingTask && (
        <div data-test="timeline-drag-ghost" className="fixed z-50 pointer-events-none flex min-w-0 items-center gap-2 px-2.5 py-1.5"
          style={{
            left: Math.max(8, Math.min(gesture.x + 14, (typeof window !== "undefined" ? window.innerWidth : 390) - 248)),
            /* Keep the label above the lifted card instead of laying a second
               copy of its title over the card surface. The card follows the
               same grab point, so this leaves a small visual gap at rest. */
            top: gesture.y - 32,
            maxWidth: "calc(100vw - 16px)",
            background: T.card,
            color: T.text,
            border: `1px solid ${T.accent}`,
            borderRadius: CARD_R,
            boxShadow: "0 8px 22px rgba(0,0,0,.28)",
            transform: "translateY(-100%)",
            fontFamily: MONO,
          }}>
          <span className="min-w-0 truncate text-xs font-semibold">{gesture.overDay ? `→ ${fmtDay(gesture.overDay)}` : draggingTask.title}</span>
          {dropMin != null && <span className="shrink-0 px-1 nb-data" style={{ background: T.accent, color: T.on, borderRadius: 4 }}>{tm(dropMin)}</span>}
        </div>
      )}

      {/* A failed write is silent otherwise: everything keeps working on screen while
          nothing reaches the device, and the only sign of it is a line in Settings
          the user has no reason to open. */}
      {storageBad && (
        <div className="fixed inset-x-0 top-14 z-50 flex justify-center px-3 pointer-events-none">
          <div data-test="storage-alert" role="alert" className="nb-up flex items-start sm:items-center gap-3 px-3 py-2 w-full sm:w-auto pointer-events-auto"
            style={{ background: NOW_RED, color: "#FFFFFF", borderRadius: CARD_R }}>
            <span style={{ fontFamily: MONO }} className="nb-label shrink-0">{notebookUnreadable ? "COULD NOT READ" : "NOT SAVING"}</span>
            <span className="text-sm min-w-0 flex-1 leading-snug">{notebookUnreadable
              ? "The stored notebook was not opened. Nothing on the device was overwritten."
              : "Changes are staying in this tab only."}</span>
            <button onClick={() => { beep("click"); exportJson(); }}
              style={{ fontFamily: MONO }} className="text-xs font-bold tracking-widest shrink-0 underline">SAVE A COPY</button>
          </div>
        </div>
      )}

      {alertShown && (
        <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-3 pointer-events-none">
          <div role="alert" className={`${alertLeaving ? "nb-toast-out" : "nb-up"} flex items-center gap-3 px-3 py-2 w-full sm:w-auto ${alertLeaving ? "" : "pointer-events-auto"}`} style={{ background: NOW_RED, color: "#FFFFFF" }}>
            <span style={{ fontFamily: MONO }} className="nb-label shrink-0">REMINDER</span>
            <span className="nb-lead truncate">{alertShown.title}</span>
            <span style={{ fontFamily: MONO }} className="nb-data shrink-0">{alertShown.body}</span>
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
            <span style={{ fontFamily: MONO }} className="nb-data">{undoShown.label}</span>
            {undoShown.payload && <button onClick={runUndo} style={{ fontFamily: MONO, color: T.accentText }} className="text-xs font-bold tracking-widest">UNDO</button>}
          </div>
        </div>
      )}

      {reward && (
        <div className="fixed inset-x-0 top-1/3 z-50 flex justify-center pointer-events-none">
          <span key={reward.k} className="nb-rw text-7xl font-bold tracking-tighter" style={{ fontFamily: MONO, color: T.accentText }}>+{reward.xp}</span>
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
                  style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap inline-flex items-center gap-1 px-2 py-1 text-xs font-bold tracking-widest">OPEN DAY <ChevronIcon /></button>
            )}>
            <div className="flex flex-col gap-1.5">
              {allDayP.length + timedP.length + tasksP.length === 0 && (
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label py-3">NOTHING SCHEDULED — ALL FREE</span>
              )}
              {allDayP.map((e) => (
                <button key={e.id} onClick={() => openFrom("event", e.id)} className="nb-tap nb-hover-tile flex items-center gap-2.5 px-3 py-2.5 text-left" style={{ background: surface, borderRadius: CARD_R }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 text-sm font-semibold truncate">{e.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">ALL DAY</span>
                </button>
              ))}
              {timedP.map((e) => (
                <button key={e.id} onClick={() => openFrom("event", e.id)} className="nb-tap nb-hover-tile flex items-center gap-2.5 px-3 py-2.5 text-left" style={{ background: surface, borderRadius: CARD_R }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{e.title}</span>
                    {e.place && <span style={{ color: T.dimText }} className="block text-xs truncate">{e.place}</span>}
                  </span>
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">{tm(e.start)} · {dur(e.dur)}</span>
                </button>
              ))}
              {tasksP.map((t) => (
                <button key={t.id} onClick={() => openFrom("task", t.id)} className="nb-tap nb-hover-tile flex items-center gap-2.5 px-3 py-2.5 text-left" style={{ background: surface, borderRadius: CARD_R, opacity: t.status === "completed" ? 0.45 : 1 }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, boxShadow: `inset 0 0 0 1.5px ${catColor(t.category)}`, background: t.status === "completed" ? catColor(t.category) : "transparent" }} />
                  <span className="flex-1 text-sm font-semibold truncate" style={{ textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">{t.planned.startMinute != null ? tm(t.planned.startMinute) : "ACTION"}</span>
                </button>
              ))}
            </div>
          </Sheet>
        );
      })()}

      {/* ══ INSPECTOR ══ */}
      {inspectRecord && (
        <Sheet T={T} title={inspectSheetTitle}
          closeSignal={sheetCloseSignals.inspect}
          headerAction={(
            <FluidEditActions T={T} editing={detailEditing} dirty={hasDetailDraft(draft)}
              label={inspectEditLabel}
              onEdit={() => { beep("click"); setDetailEditing(true); setInspectField(null); }}
              onRevert={() => { beep("abort"); setDraft(null); setDetailEditing(false); setInspectField(null); }}
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
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">
                  {(db.taskLists.find((l) => l.id === inspectDraft.listId) || {}).name || "—"} · {inspectDraft.category}
                </span>
              </div>
              {inspectIsSubtask && (
                <button type="button" onClick={() => {
                  if (!inspectParentTask) return;
                  beep("click");
                  setDraft(null);
                  setDetailEditing(false);
                  setInspectField(null);
                  setInspect({ kind: "task", id: inspectParentTask.id });
                }} disabled={!inspectParentTask}
                  aria-label={inspectParentTask ? `Open parent action ${inspectParentTask.title}` : "Parent action unavailable"}
                  className="nb-tap nb-hover-control mt-3 flex max-w-full items-center gap-2 text-left disabled:opacity-60"
                  style={{ color: T.dimText }}>
                  <span style={{ fontFamily: MONO }} className="nb-label shrink-0">PART OF</span>
                  <span className="truncate text-sm" style={{ color: inspectParentTask ? T.text : T.dimText }}>{inspectParentTask?.title ?? "PARENT ACTION UNAVAILABLE"}</span>
                </button>
              )}

              <section aria-label="Checklist" className="flex flex-col gap-1.5 mt-4">
                {((inspectDraft.checklist ?? []).length > 0 || inspectDraft.status !== "completed") && (
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">CHECKLIST</span>
                )}
                {inspectDraft.status !== "completed" && <InlineAdd T={T} surface={surface} onAdd={(v) => addSub(inspect.id, v)} />}
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
                        draft, so they must not imply that Revert can undo them. The
                        Timeline sheet opens in reading mode, though, so mobile gets a
                        labeled control here instead of hiding the capability behind the
                        header's EDIT ACTION affordance. */}
                    {!inspectIsSubtask && <button type="button" onClick={() => promoteSub(inspect.id, item.id)}
                      style={{ color: T.dimText, background: T.faint }}
                      className="nb-tap inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[10px] font-bold tracking-[.08em] sm:hidden"
                      aria-label="Convert step to a subtask" title="Turn this checklist item into tracked child work">MAKE SUBTASK</button>}
                    {detailEditing && !inspectIsSubtask && <button type="button" onClick={() => promoteSub(inspect.id, item.id)} style={{ color: T.dimText }} className="nb-tap nb-hover-icon hidden h-11 w-11 shrink-0 items-center justify-center sm:inline-flex" aria-label="Convert step to a subtask" title="Turn this checklist item into tracked child work"><ArrowUpIcon /></button>}
                    {detailEditing && <button onClick={() => removeSub(inspect.id, item.id)} style={{ color: T.dimText }} className="text-xs px-1" aria-label="Remove step"><CloseIcon /></button>}
                  </div>
                ))}
              </section>

              {(inspectDraft.checklist ?? []).length > 0 && (() => {
                const checklistDone = inspectDraft.checklist.filter((x) => x.done).length;
                return (
                  <div className="flex items-center gap-3 mt-3">
                    <SegmentedProgress T={T} done={checklistDone} total={inspectDraft.checklist.length}
                      ariaLabel={`${checklistDone} of ${inspectDraft.checklist.length} steps done`} className="flex-1" />
                    <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">
                      {checklistDone} / {inspectDraft.checklist.length}
                    </span>
                  </div>
                );
              })()}

              <PromotedSubtasks T={T} subtasks={inspectSubtasks}
                className="mx-0 mt-3"
                onComplete={completeTask} onReopen={reopenTask}
                onOpen={(id) => {
                  beep("click");
                  setDraft(null);
                  setDetailEditing(false);
                  setInspectField(null);
                  setInspect({ kind: "task", id });
                }} />

              <div className="flex items-start gap-3 px-3 py-3 mt-4" style={{ background: surface, borderRadius: CARD_R }}>
                <InlineText T={T} value={inspectDraft.note} placeholder="Add a note" ariaLabel="Note" multiline
                  onCommit={(note) => editEntry({ note })} onBeginEdit={beginDetailEdit} className="text-sm leading-relaxed" />
                <span style={{ color: T.dimText }} className="text-sm shrink-0 pt-0.5"><MoreIcon /></span>
              </div>

              {/* The governing facts, grouped as one card so they read as a block of
                  rules rather than a run of unrelated rows. */}
              <div className="mt-4 overflow-hidden" style={{ background: surface, borderRadius: CARD_R }}>
                {/* §4.6. When it is planned, and when it is due, are edited where
                    they are read. §4.7 keeps the repeat rule behind its own gesture. */}
                <DetailRow T={T} icon={<CalendarIcon />} divider>
                  {detailEditing && inspectField === "planning" ? (
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
                        <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">REPEATS</span>
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
                    <button onClick={() => { beep("click"); openInspectField("planning"); }} className="block w-full text-left" aria-label="Edit planning">
                      <span className="block text-sm">{inspectDraft.planned.date ? plannedLabel(inspectDraft.planned.date, todayKey) : "Unplanned"}</span>
                      <span style={{ color: T.dimText }} className="block text-xs mt-0.5">
                        {inspectDraft.planned.startMinute != null ? tm(inspectDraft.planned.startMinute) : "Any time"}
                        {inspectDraft.planned.estimateMinutes ? ` · ${dur(inspectDraft.planned.estimateMinutes)} estimate` : " · No estimate"}
                        {` · ${inspectDraft.recurrence ? repeatLabel({ ...inspectDraft.recurrence, freq: inspectDraft.recurrence.frequency, byDay: inspectDraft.recurrence.byWeekday }) : "Does not repeat"}`}
                      </span>
                    </button>
                  )}
                </DetailRow>
                <InlineChoiceRow T={T} icon={<BellIcon size={13} />} divider
                  open={inspectField === "reminder"}
                  onToggle={() => openInspectField(inspectField === "reminder" ? null : "reminder")}
                  onBeginEdit={() => openInspectField("reminder")}
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
                <DetailRow T={T} icon={<ClockIcon />} divider>
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">DUE</span>
                    <InlineStamp T={T} dark={dark} type="date" ariaLabel="Deadline"
                      value={inspectDraft.deadline.date || ""} onCommit={(v) => editEntry({ due: v })}
                      display={inspectDraft.deadline.date ? fmtDay(inspectDraft.deadline.date) : "No deadline"}
                      onBeginEdit={() => openInspectField("due")}
                      style={{ color: inspectDraft.deadline.date && inspectDraft.deadline.date < todayKey ? NOW_RED : T.text }}
                      className="text-sm" />
                    {inspectDraft.deadline.date && (
                      <button onClick={() => editEntry({ due: "" })} style={{ color: T.dimText }} className="nb-tap text-xs px-1" aria-label="Clear deadline"><CloseIcon /></button>
                    )}
                  </div>
                </DetailRow>
                {/* §8.2. The label names the attribute; it does not repeat the value
                    the selected chip already carries. */}
                 <InlineChoiceRow T={T} icon={<UiIcon size={13}><path d="m8 2.5 1.2 3.2 3.3 1.1-3.3 1.2L8 11.5l-1.2-3.5-3.3-1.2 3.3-1.1L8 2.5Z" /></UiIcon>} divider
                  open={inspectField === "reward"}
                  onToggle={() => openInspectField(inspectField === "reward" ? null : "reward")}
                  onBeginEdit={() => openInspectField("reward")}
                  label={`Worth ${inspectDraft.reward}`}
                  value={inspectDraft.reward} options={[20, 30, 40, 60].map((xp) => [xp, String(xp)])}
                  onPick={(xp) => editEntry({ xp })} />
                {inspectDraft.status === "waiting" && (
                   <DetailRow T={T} icon={<ClockIcon />} divider={inspectDependsOn.length > 0}>
                    <span className="block text-sm">{inspectDraft.followUpDate ? `Follow up ${fmtDay(inspectDraft.followUpDate)}` : "Waiting, no follow-up date"}</span>
                  </DetailRow>
                )}
                {/* Every edge is listed, satisfied or not, each removable — otherwise a
                    dependency could be added from here but never taken back. */}
                <DetailRow T={T} icon={<MenuIcon />} divider>
                  <button
                    onClick={() => { beep("click"); openInspectField("list"); setListPicker({ taskId: inspect.id, draft: true }); }} className="text-left w-full">
                    <span className="block text-sm">{(db.taskLists.find((l) => l.id === inspectDraft.listId) || {}).name || "—"}</span>
                    <span style={{ color: T.dimText }} className="block text-xs mt-0.5">Tap to move to another list</span>
                  </button>
                </DetailRow>
                 <InlineChoiceRow T={T} icon={<UiIcon size={13}><path d="M8 2.5a5.5 5.5 0 1 0 0 11V2.5Z" /><circle cx="8" cy="8" r="5.5" /></UiIcon>} divider
                  open={inspectField === "category"}
                  onToggle={() => openInspectField(inspectField === "category" ? null : "category")}
                  onBeginEdit={() => openInspectField("category")}
                  label={inspectDraft.category} dot={catColor}
                  value={inspectDraft.category} options={CATS.map((c) => [c, c])}
                  onPick={(cat) => editEntry({ cat })} />
                <DetailRow T={T} icon="#" divider={inspectDependsOn.length > 0}>
                  <TagField T={T} tags={inspectDraft.tags} onBeginEdit={() => openInspectField("tags")} onChange={(tags) => editEntry({ tags })} />
                </DetailRow>
                {inspectDependsOn.map((blocker, i) => (
                   <DetailRow key={blocker.id} T={T} icon={<BlockIcon />} divider={i < inspectDependsOn.length - 1}>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm truncate"
                        style={{ color: blocker.status === "completed" ? T.dim : NOW_RED, textDecoration: blocker.status === "completed" ? "line-through" : "none" }}>
                        Blocked by {blocker.title}
                      </span>
                      {detailEditing && <button onClick={() => unblockTask(inspect.id, blocker.id)} style={{ color: T.dimText }} className="text-xs px-1" aria-label="Remove dependency"><CloseIcon /></button>}
                    </div>
                  </DetailRow>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 mt-4">
                {inspectDraft.status === "completed" ? (
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">COMPLETED</span>
                ) : (
                  <PillNav T={T} ariaLabel="Action status" value={inspectDraft.status}
                    options={[["open", "OPEN"], ["in_progress", "DOING"], ["waiting", "WAITING"]]}
                    onPick={(status) => editEntry({ status })} style={{ border: `1px solid ${T.line}` }} />
                )}
                {/* Dependency edits also write immediately, so the affordance belongs
                    to the editing state rather than the read view. */}
                {detailEditing && <button onClick={() => { beep("click"); setDependencyPicker({ taskId: parseTaskOccurrenceId(inspect.id).seriesId }); }}
                  style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-data shrink-0">+ BLOCK ON</button>}
              </div>

              {earliestStart && inspectDraft.planned.date && inspectDraft.planned.date < earliestStart && (
                <p style={{ fontFamily: MONO, color: NOW_RED }} className="nb-data mt-3">
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
                  display={tm(inspectDraft.start)} onCommit={(v) => v && editEntry({ start: fromHhmm(v) })} onBeginEdit={() => openInspectField("start")}
                  className="text-base font-semibold" />
                <span style={{ color: T.dimText }} className="text-base">–</span>
                <InlineStamp T={T} dark={dark} type="time" ariaLabel="Ends" value={hhmm((inspectDraft.start + inspectDraft.dur) % 1440)}
                  display={tm((inspectDraft.start + inspectDraft.dur) % 1440)}
                  onCommit={(v) => {
                    if (!v) return;
                    const end = fromHhmm(v);
                    editEntry({ dur: durationFromClockRange(inspectDraft.start, end) });
                  }} onBeginEdit={() => openInspectField("duration")} className="text-base font-semibold" />
              </div>
            )}
            <InlineStamp T={T} dark={dark} type="date" ariaLabel="Day"
              value={splitId(inspect.id).date || inspectDraft.date || dateKey}
              display={fmtDay(splitId(inspect.id).date || inspectDraft.date || dateKey)}
              onCommit={(v) => v && editEntry({ date: v })}
              onBeginEdit={() => openInspectField("date")}
              style={{ fontFamily: MONO, color: T.dimText }} className="nb-data mt-1" />
          </div>

          {detailEditing && (inspectField === "date" || inspectField === "start" || inspectField === "duration") && (
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
              <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mt-0.5">
                {inspect.kind === "event" ? "LENGTH" : "REWARD"}
              </span>
            </div>
            <div className="flex-1 text-center py-3" style={{ background: surface, borderRadius: CARD_R }}>
              <span className="block text-2xl font-semibold tracking-tight">
                {inspect.kind === "event"
                  ? (inspectDraft.allDay ? "—" : countdownLabel(dateKey, inspectDraft.start, todayKey, nowMin))
                  : `${(inspectDraft.checklist ?? []).filter((x) => x.done).length}/${(inspectDraft.checklist ?? []).length}`}
              </span>
              <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mt-0.5">
                {inspect.kind === "event" ? "STARTS" : "STEPS"}
              </span>
            </div>
          </div>

          {/* One row per attribute, each one the control for it (§4.6). Collapsed it
              costs a line; touched, it grows the alternatives underneath. */}
          <div className="flex flex-col gap-2">
            <InlineChoice T={T} surface={surface} icon="◑" tint={catColor(inspectDraft.cat)}
              open={inspectField === "category"}
              onToggle={() => openInspectField(inspectField === "category" ? null : "category")}
              onBeginEdit={() => openInspectField("category")}
              label={inspectDraft.cat || "—"} value={inspectDraft.cat} dot={catColor}
              options={CATS.map((c) => [c, c])} onPick={(cat) => editEntry({ cat })} />

            <InlineChoice T={T} surface={surface} icon={<ClockIcon />} label={inspectDraft.allDay ? "All day" : "At a time"}
              open={inspectField === "allDay"}
              onToggle={() => openInspectField(inspectField === "allDay" ? null : "allDay")}
              onBeginEdit={() => openInspectField("allDay")}
              value={inspectDraft.allDay ? "all" : "timed"} options={[["timed", "AT A TIME"], ["all", "ALL DAY"]]}
              onPick={(v) => editEntry({ allDay: v === "all", ...(v === "all" ? {} : { start: inspectDraft.start || 540, dur: inspectDraft.dur || 60 }) })} />

            {inspectDraft.allDay && (
              <InlineField T={T} surface={surface} icon={<ArrowRightIcon />}>
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">THROUGH</span>
                <InlineStamp T={T} dark={dark} type="date" ariaLabel="Last day"
                  value={inspectDraft.endDate || inspectDraft.date || dateKey} min={inspectDraft.date || dateKey}
                  display={fmtDay(inspectDraft.endDate || inspectDraft.date || dateKey)}
                  onCommit={(v) => v && editEntry({ endDate: v })}
                  onBeginEdit={() => openInspectField("endDate")}
                  style={{ fontFamily: MONO }} className="text-sm" />
              </InlineField>
            )}

            {/* §4.7. Recurrence rewrites a series rather than an entry, so it stays
                behind a deliberate gesture with room to explain itself. */}
            {/* §4.6. Repeating is an attribute of the entry like any other, so it is
                chosen here rather than in a form somewhere else. The safety was never
                the separate surface — it is the scope question, which the save still
                asks. */}
            <InlineChoice T={T} surface={surface} icon={<RepeatIcon />}
              open={inspectField === "repeat"}
              onToggle={() => openInspectField(inspectField === "repeat" ? null : "repeat")}
              onBeginEdit={() => openInspectField("repeat")}
              label={inspectDraft.repeat ? repeatLabel(inspectDraft.repeat) : "Does not repeat"}
              value={inspectDraft.repeat?.freq ?? "never"}
              options={REPEATS}
              onPick={(freq) => editEntry({ repeat: repeatFor(freq, inspectDraft.repeat, inspectDraft.date || dateKey) })} />

            <InlineChoice T={T} surface={surface} icon={<BellIcon size={13} />}
              open={inspectField === "reminder"}
              onToggle={() => openInspectField(inspectField === "reminder" ? null : "reminder")}
              onBeginEdit={() => openInspectField("reminder")}
              label={(inspectDraft.alerts || []).length
                ? inspectDraft.alerts.map((a) => (a === 0 ? "When it starts" : `${dur(a)} before`)).join(", ")
                : "No reminder"}
              value={(inspectDraft.alerts || [])[0] ?? "off"}
              options={[["off", "OFF"], [0, "AT TIME"], [5, "5M"], [15, "15M"], [30, "30M"], [60, "60M"]]}
              onPick={(v) => editEntry({ alerts: v === "off" ? [] : [v] })} />

            <InlineField T={T} surface={surface} icon={<LocationIcon />}>
              <InlineText T={T} value={inspectDraft.place} placeholder="Add a place" ariaLabel="Place"
                onCommit={(place) => editEntry({ place })} onBeginEdit={() => openInspectField("place")} className="text-sm" />
            </InlineField>

            <InlineField T={T} surface={surface} icon={<LinkIcon />}>
              <InlineText T={T} value={inspectDraft.link || ""} placeholder="Add a meeting link" ariaLabel="Meeting link"
                onCommit={(link) => editEntry({ link: normalizeMeetingLink(link) })} onBeginEdit={() => openInspectField("link")} className="text-sm" />
              {normalizeMeetingLink(inspectDraft.link) && (
                <a href={normalizeMeetingLink(inspectDraft.link)} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontFamily: MONO, background: T.accent, color: T.on, borderRadius: 999 }}
                  className="nb-tap inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold tracking-widest shrink-0">JOIN <ExternalLinkIcon /></a>
              )}
              {inspectDraft.link && !normalizeMeetingLink(inspectDraft.link) && (
                <span style={{ fontFamily: MONO, color: NOW_RED }} className="nb-label shrink-0">NOT A LINK</span>
              )}
            </InlineField>

            {conflictIds.has(inspect.id) && (
              <Pill T={T} surface={surface} icon={<WarningIcon />} tint={NOW_RED} label="Overlaps another event on this day" />
            )}

            <div className="flex items-start gap-3 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <span style={{ color: T.dimText }} className="text-sm shrink-0 w-4 text-center pt-0.5"><MoreIcon /></span>
              <InlineText T={T} value={inspectDraft.note} placeholder="Add a note" ariaLabel="Note" multiline
                onCommit={(note) => editEntry({ note })} onBeginEdit={() => openInspectField("note")} className="text-sm leading-relaxed" />
            </div>
          </div>

          {!inspectDraft.allDay && minutesUntil(dateKey, inspectDraft.start, todayKey, nowMin) > 0 && (
            <p className="text-center text-sm mt-5" style={{ color: T.dimText }}>
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
                else { inspectDraft.status === "completed" ? reopenTask(inspect.id) : completeTask(inspect.id); requestSheetClose("inspect"); }
              }}
              style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap nb-liquid nb-hover-control w-full py-3 mt-5 text-xs font-bold tracking-widest">
              {inspect.kind === "event" ? "DUPLICATE" : inspectDraft.status === "completed" ? "REOPEN" : "MARK COMPLETE"}
            </button>
            <button onClick={() => removeItem(inspect.kind, inspect.id)} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap nb-hover-danger w-full py-3 mt-2 nb-label">DELETE</button>
          </>}
        </Sheet>
      )}

      {discardAsk && (
        <Sheet T={T} title="UNSAVED CHANGES" onClose={() => { beep("click"); setDiscardAsk(false); }}>
          <h2 className="text-xl font-bold tracking-tight">Discard this edit?</h2>
          <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-1 mb-4">
            The saved {inspect?.kind === "event" ? "event" : "action"} will stay as it was.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => { beep("click"); setDiscardAsk(false); }}
              style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap nb-liquid nb-hover-control py-3 text-xs font-bold tracking-widest">KEEP EDITING</button>
            <button onClick={() => {
              beep("abort");
              setDraft(null);
              setDetailEditing(false);
              setInspectField(null);
              setDiscardAsk(false);
              requestSheetClose("inspect");
            }} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap nb-hover-danger py-3 nb-label">DISCARD CHANGES</button>
          </div>
        </Sheet>
      )}

      {/* §15.4/§7.4. Blocking is advisory: name what is in the way and let the user
          decide, rather than silently completing or flatly refusing. */}
      {confirmComplete && (
        <Sheet T={T} onClose={() => { beep("click"); setConfirmComplete(null); }} title="Still blocked">
          <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-1 mb-3">
            {confirmComplete.reasons.map((reason) => (reason.kind === "dependencies"
              ? `Waiting on ${reason.blockers.map((b) => b.title).join(", ")}.`
              : `${reason.remaining} step${reason.remaining === 1 ? "" : "s"} still open.`)).join(" ")}
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => completeTask(confirmComplete.id, true)}
              style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap nb-liquid nb-hover-control py-3 text-xs font-bold tracking-widest">COMPLETE ANYWAY</button>
            <button onClick={() => { beep("click"); setConfirmComplete(null); }}
              style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap nb-hover-control py-3 nb-label">KEEP IT OPEN</button>
          </div>
        </Sheet>
      )}

      {firstRun && (
        <Sheet T={T} onClose={() => setFirstRun(false)} title="Welcome">
          <h2 className="text-2xl font-bold tracking-tight">Start how you like</h2>
          <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-1 mb-4">
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
            }} style={{ fontFamily: MONO, background: surface, borderRadius: CARD_R }} className="nb-tap py-3 nb-label">START EMPTY</button>
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
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">{getTasksByList(db.tasks, list.id).length}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {dependencyPicker && (
        <Sheet T={T} onClose={() => { beep("click"); setDependencyPicker(null); }} title="What has to happen first?">
          {dependencyPicker.error && (
            <p style={{ fontFamily: MONO, color: NOW_RED }} className="nb-data mb-2">{dependencyPicker.error.toUpperCase()}</p>
          )}
          <div className="flex flex-col max-h-80 overflow-y-auto nb-s">
            {db.tasks
              .filter((candidate) => candidate.id !== dependencyPicker.taskId && candidate.status !== "archived")
              .map((candidate) => (
                <button key={candidate.id} onClick={() => blockOn(dependencyPicker.taskId, candidate.id)}
                  className="nb-row flex items-center gap-2 py-2.5 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0 w-12">
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
          <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">LISTS</span>
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
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">
                  {getTasksByList(db.tasks, list.id).length}
                </span>
                {!list.isSystem && !list.isDefault && (
                  <button onClick={() => { beep("delete"); mutate((d) => { const r = deleteTaskList(d.taskLists, d.tasks, list.id); return { ...d, taskLists: r.lists, tasks: r.tasks }; }); }}
                    style={{ color: T.dimText }} className="text-xs px-1 flex items-center justify-center" aria-label="Delete list"><CloseIcon /></button>
                )}
              </div>
            ))}
          </div>
          <NewListField T={T} onAdd={(name) => { beep("schedule"); mutate((d) => ({ ...d, taskLists: createTaskList(d.taskLists, { id: `list-${uid()}`, name }) })); }} />

          <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-label mt-5">TAGS</span>
          {allTags(db.tasks).length === 0
            ? <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-1">No tags yet. Add them when composing an action.</p>
            : (
              <div className="flex flex-wrap gap-1 mt-1">
                {allTags(db.tasks).map((tag) => (
                  <span key={tag} style={{ fontFamily: MONO, color: T.dimText, border: `1px solid ${T.line}` }} className="px-2 py-1 nb-data">{tag}</span>
                ))}
              </div>
            )}
        </Sheet>
      )}

      {composer && (
        <Sheet T={T} title={composer.id ? "EDIT" : "NEW"} morph={composer.morph ?? (composer.notch ? "notch" : "auto")}
          morphSurface={composer.morphSource ? { ...composer.morphSource, background: T.accent, color: T.on, font: MONO } : null}
          closeSignal={sheetCloseSignals.composer}
          onClose={() => { beep("click"); setComposer(null); }}>
          <Composer T={T} initial={composer} dateLabel={fmtDay(dateKey)} dateKey={dateKey} onSubmit={saveEntry} onTick={() => beep("tick")} weekStart={weekStart} />
        </Sheet>
      )}

      {/* ══ SCOPE ASK ══ */}
      {/* Rendered after the composer so it stacks above it: the question is asked
          while the form is still open, and underneath the form its buttons cannot be
          reached at all. Cancelling returns to the form with the edit intact. */}
      {scopeAsk && (
        <Sheet T={T} title="REPEATING ITEM" closeSignal={sheetCloseSignals.scopeAsk} onClose={() => { beep("click"); setScopeAsk(null); }}>
          <h2 className="text-xl font-bold tracking-tight">This repeats</h2>
          <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-1 mb-4">Change this one day, or every day it appears?</p>
          <div className="flex flex-col gap-2">
            <button onClick={() => (scopeAsk.action === "delete" ? doDelete(scopeAsk.kind, scopeAsk.id, "one") : commitSave(scopeAsk.payload, "one"))}
              style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap py-3 nb-label">THIS DAY ONLY</button>
            {scopeAsk.kind === "event" && canonicalOccurrenceIdentity(scopeAsk.id || scopeAsk.payload?.id) && (
              <button onClick={() => (scopeAsk.action === "delete"
                ? doDelete(scopeAsk.kind, scopeAsk.id, "following")
                : commitSave(scopeAsk.payload, "following"))}
                style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap py-3 nb-label">THIS AND FOLLOWING</button>
            )}
            <button onClick={() => (scopeAsk.action === "delete" ? doDelete(scopeAsk.kind, scopeAsk.id, "all") : commitSave(scopeAsk.payload, "all"))}
              style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap py-3 text-xs font-bold tracking-widest">THE WHOLE SERIES</button>
          </div>
        </Sheet>
      )}

      {noteEdit && (
        <Sheet T={T} title="NOTE" onClose={() => { beep("click"); setNoteEdit(null); }}>
          <NoteEditor T={T} note={noteEdit} onSave={(text, title, provenance) => saveNote(noteEdit, text, title, provenance)} onDelete={() => noteEdit.id && doDelete("note", noteEdit.id, "all")}
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
        <Sheet T={T} title="PALETTE" morph="none" onClose={() => { beep("click"); closePalette(); }}>
          <CommandPalette T={T} surface={surface} query={searchQuery} onQueryChange={setSearchQuery}
            rows={paletteRows} queryIssues={searchProjection.query.issues}
            placeholder="Search, run a command, or type to create"
            footer={quickDraft?.consumed.length ? `READ · ${quickDraft.consumed.join(" · ").toUpperCase()}` : null} />
          {!searchQuery.trim() && <QuickAddHint T={T} />}
        </Sheet>
      )}

      {missedSheet && missedReport && (
        <Sheet T={T} title="WHILE YOU WERE AWAY" onClose={closeMissedReport}>
          <p style={{ color: T.dimText }} className="text-sm mb-3">
            {/* Said plainly, because the alternative is that it looks like a bug.
                A page cannot set an alarm for a time when it is not running, and
                this notebook has no server to send one. */}
            These came due while the notebook was closed. Nothing on this device can
            raise an alert while the app is not open, so they are reported here instead.
          </p>
          <div className="flex flex-col gap-1.5">
            {missedReport.map((reminder) => (
              <div key={reminder.id} data-test="missed-reminder-row" className="px-3 py-2"
                style={{ background: surface, borderRadius: CARD_R }}>
                <div className="flex items-baseline gap-2">
                  <span className="nb-lead truncate flex-1">{reminder.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">
                    {plannedLabel(reminder.scheduledFor.slice(0, 10), todayKey)} {fmtTime(fromHhmm(reminder.scheduledFor.slice(11, 16)), clock)}
                  </span>
                </div>
                {reminder.body && <span style={{ color: T.dimText }} className="block text-xs mt-0.5">{reminder.body}</span>}
              </div>
            ))}
          </div>
          <button onClick={closeMissedReport} style={{ background: T.accent, color: T.on, borderRadius: 999, fontFamily: MONO }}
            className="nb-tap w-full mt-4 py-2.5 text-xs font-bold tracking-widest">GOT IT</button>
        </Sheet>
      )}

      {shortcuts && (
        <Sheet T={T} title="SHORTCUTS" onClose={() => { beep("click"); setShortcuts(false); }}>
          <h2 className="text-2xl font-bold tracking-tight">Keyboard &amp; gestures</h2>
          <ShortcutSheet T={T} surface={surface} />
        </Sheet>
      )}

      {settings && (
        <Sheet T={T} title="SETTINGS" onClose={() => { beep("click"); setSettings(false); }}>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

          <div className="mt-4">
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">FEEDBACK</span>
            <button onClick={() => { beep("tick"); setPreferences((current) => current ? { ...current, feedback: { ...current.feedback, sound: !current.feedback.sound } } : current); }} className="nb-tap nb-hover-choice w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Sound</span>
              <span style={{ fontFamily: MONO, color: preferences.feedback.sound ? T.accent : T.dim }} className="nb-data">{preferences.feedback.sound ? "ON" : "OFF"}</span>
            </button>
            <button data-test="haptics-toggle" onClick={() => { beep("tick"); setPreferences((current) => current ? { ...current, feedback: { ...current.feedback, haptics: !current.feedback.haptics } } : current); }} className="nb-tap nb-hover-choice w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Haptics</span>
              <span style={{ fontFamily: MONO, color: preferences.feedback.haptics ? T.accent : T.dim }} className="nb-data">{preferences.feedback.haptics ? "ON" : "OFF"}</span>
            </button>
            <button onClick={() => { beep("tick"); setPreferences((current) => current ? { ...current, display: { ...current.display, clock: current.display.clock === "24" ? "12" : "24" } } : current); }} className="nb-tap nb-hover-choice w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Clock</span>
              <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-data">{clock === "24" ? "24-HOUR" : "12-HOUR"}</span>
            </button>
            <button data-test="week-start-toggle"
              onClick={() => { beep("tick"); setPreferences((current) => current ? { ...current, display: { ...current.display, weekStart: current.display.weekStart === 1 ? 0 : 1 } } : current); }}
              className="nb-tap nb-hover-choice w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Week starts</span>
              <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-data">{weekStart === 1 ? "MONDAY" : "SUNDAY"}</span>
            </button>
            {/* The limit is stated rather than left to be discovered. A toggle
                called "system notifications" implies the system will notify you,
                and it will not: a page cannot set an alarm for a time when it is
                not running, and a notebook with no server has nothing to send one.
                What arrives instead is a report, the next time the app is open. */}
            <button onClick={askNotifs} className="nb-tap nb-hover-control w-full flex items-start justify-between gap-3 py-2.5 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="min-w-0">
                <span className="block text-sm">System notifications</span>
                <span style={{ color: T.dimText }} className="block text-xs mt-0.5">Only while the app is open. Anything missed is reported next time.</span>
              </span>
              <span style={{ fontFamily: MONO, color: preferences.notifications.systemEnabled ? T.accent : T.dim }} className="nb-data shrink-0 pt-0.5">{preferences.notifications.systemEnabled ? "ON" : "ALLOW"}</span>
            </button>
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">THEME</span>
            <div className="flex flex-col mt-1">
              {THEMES.map((th) => (
                <button key={th.id} onClick={() => { beep("tick"); setPreferences((current) => current ? { ...current, display: { ...current.display, themeId: th.id } } : current); }} className={`nb-tap nb-row nb-hover-choice ${th.id === T.id ? "is-selected" : ""} flex items-center gap-3 py-2 px-1 text-left`} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <span className="flex shrink-0">
                    <span className="w-4 h-6" style={{ background: th.bg }} />
                    <span className="w-4 h-6" style={{ background: th.card }} />
                    <span className="w-4 h-6" style={{ background: th.accent }} />
                  </span>
                  <span className="flex-1 text-sm font-semibold">{th.name}</span>
                  {th.id === T.id && <span className="nb-pop nb-data" style={{ fontFamily: MONO, color: T.accentText }}>ON</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">PACE</span>
            {[
              ["reducedMotion", "Reduce motion", preferences.display.reducedMotion, (current) => ({ ...current, display: { ...current.display, reducedMotion: !current.display.reducedMotion } })],
              ["points", "Points", preferences.motivation.points, (current) => ({ ...current, motivation: { ...current.motivation, points: !current.motivation.points } })],
              ["levels", "Levels", preferences.motivation.levels, (current) => ({ ...current, motivation: { ...current.motivation, levels: !current.motivation.levels } })],
              ["streaks", "Streaks", preferences.motivation.streaks, (current) => ({ ...current, motivation: { ...current.motivation, streaks: !current.motivation.streaks } })],
              ["celebrations", "Celebrations", preferences.motivation.celebrations, (current) => ({ ...current, motivation: { ...current.motivation, celebrations: !current.motivation.celebrations } })],
            ].map(([id, label, enabled, update]) => (
              <button key={id} onClick={() => { beep("tick"); setPreferences((current) => current ? update(current) : current); }} className="nb-tap nb-hover-choice w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
                <span className="text-sm">{label}</span>
                <span style={{ fontFamily: MONO, color: enabled ? T.accent : T.dim }} className="nb-data">{enabled ? "ON" : "OFF"}</span>
              </button>
            ))}
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">YOUR DATA</span>
            <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-1 mb-2">Everything lives on this device. There's no account to sync with — take it with you as a file instead.</p>
            {storageBad && (
              <p style={{ fontFamily: MONO, color: NOW_RED }} className="nb-label mb-2">SAVING TO THIS DEVICE FAILED — EXPORT A COPY</p>
            )}
            {!storageBad && supportingStorageBad && (
              <p data-test="supporting-storage-warning" style={{ fontFamily: MONO, color: T.accentText }} className="nb-label mb-2">
                SOME SUPPORTING SETTINGS COULD NOT BE SAVED — YOUR NOTEBOOK IS STILL AVAILABLE
              </p>
            )}
            {importError && (
              <p style={{ fontFamily: MONO, color: NOW_RED }} className="nb-label mb-2">{importError}</p>
            )}
            <Reveal open={Boolean(pendingImport)}>
              {pendingImportShown && (
                <div className="flex items-center gap-2 mb-2 p-2" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
                  <span className="flex-1 text-xs">Replace the notebook on this device? Theme and other settings stay.</span>
                  <button onClick={() => { setPendingImport(null); beep("abort"); }} style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">CANCEL</button>
                  <button onClick={() => {
                    if (!pendingImport) return;
                    applyReplacedNotebook(replacePlannerNotebook(pendingImport));
                    beep("commit");
                    setSettings(false);
                  }} style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs font-bold tracking-widest">REPLACE</button>
                </div>
              )}
            </Reveal>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportIcs} style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 nb-data">EXPORT .ICS</button>
              <button onClick={exportJson} style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 nb-data">EXPORT .JSON</button>
              <label style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 nb-data cursor-pointer">
                IMPORT .JSON
                <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
              </label>
            </div>
          </div>

          <div className="mt-4">
            <Reveal open={confirmWipe}>
              <div className="flex items-center gap-2 p-2" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
                <span className="flex-1 text-xs">Erase every event, action and note?</span>
                <button onClick={() => setConfirmWipe(false)} style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">KEEP</button>
                <button onClick={wipeAll} style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs font-bold tracking-widest">ERASE</button>
              </div>
            </Reveal>
            <Reveal open={!confirmWipe}>
              <button onClick={() => { beep("click"); setConfirmWipe(true); }} style={{ fontFamily: MONO, color: T.dimText, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 nb-label">START A BLANK NOTEBOOK</button>
            </Reveal>
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">SHORTCUTS</span>
            <div className="mt-1">
              <Row T={T} k="← →" v="PREVIOUS / NEXT DAY" />
              <Row T={T} k="T" v="TODAY" />
              <Row T={T} k="F" v="FOCUS TIMELINE" />
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
    </div>
  );
}

function NavigationShell({ phase, firstItemRef, onTimeline, onActions, onSetup, onNotes, onShortcuts, onToday }) {
  const items = [
    ["Timeline", onTimeline],
    ["Actions", onActions],
    ["Setup", onSetup],
  ];
  const utilityItems = [
    ["Notes", onNotes],
    ["Shortcuts", onShortcuts],
    ["Today", onToday],
  ];
  const hidden = phase === "closed";
  return (
    <aside id="planner-navigation" role="navigation" aria-label="Primary navigation" aria-hidden={hidden} className="nb-navigation">
      <div className="nb-nav-brand mb-7" style={{ "--nav-index": 0 }}>
        <p className="text-xs tracking-[.18em]" style={{ fontFamily: MONO, color: "#8f908b" }}>CALENDAR MASTER</p>
        <p className="text-2xl font-semibold tracking-tight mt-1">Your day, in view.</p>
      </div>
      <div className="flex flex-col gap-1">
        {items.map(([label, onClick], index) => (
          <button key={label} ref={index === 0 ? firstItemRef : null} type="button" onClick={onClick}
            className="nb-nav-item nb-hover-control" style={{ "--nav-index": index + 1 }}>{label}</button>
        ))}
      </div>
      <div className="flex flex-col gap-1 mt-5 pt-5" style={{ borderTop: "1px solid #313237" }}>
        {utilityItems.map(([label, onClick], index) => (
          <button key={label} type="button" onClick={onClick}
            className="nb-nav-item nb-hover-control" style={{ "--nav-index": index + 4 }}>{label}</button>
        ))}
      </div>
      <div className="nb-nav-membership" style={{ "--nav-index": 7 }}>
        <p className="text-xs tracking-[.14em]" style={{ fontFamily: MONO }}>LOCAL FIRST</p>
        <p className="text-base mt-1 leading-snug">Everything in this planner stays on this device.</p>
      </div>
    </aside>
  );
}

/* ═══════════════════════ ACTIONS ═══════════════════════ */

function ActionsPanel({ T, listRef, tasks, notes, onToggleNoteCheck, onExtract, onOpenDeadline, overdue, deadlines, showOverdue, todayKey, gesture, blockersFor, subtasksFor, onPromoteSub, smartView, viewCounts, onSmartView, lists, onManageLists, clock = "12", selection, onToggleSelect, onStartSelect, onCancelSelect, onBulk, onPullOverdue, beep, buzz, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onAddTask, onEditNote, onUnschedule, onJump, onCollapse = null }) {
  const [overdueReviewOpen, setOverdueReviewOpen] = useState(false);
  const smartViewRef = useRef(smartView);
  const smartViewRevealTimer = useRef(null);
  const [smartViewRevealRows, setSmartViewRevealRows] = useState([]);
  const pullable = overdue.filter((t) => t.planned?.date !== todayKey);
  const open = tasks.filter((t) => t.status !== "completed");
  const done = tasks.filter((t) => t.status === "completed");
  useEffect(() => {
    if (!pullable.length) setOverdueReviewOpen(false);
  }, [pullable.length]);
  useLayoutEffect(() => {
    if (smartViewRef.current === smartView) return undefined;
    smartViewRef.current = smartView;
    /* The filtered rows are already in the DOM by this layout pass, but have not
       painted. Mark only the rows actually in the Actions viewport so a person
       who changed filter while scrolled down sees continuity where they are. */
    const root = listRef.current;
    const scroller = root?.closest?.(".nb-s.overflow-y-auto");
    const viewport = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const visible = root
      ? [...root.querySelectorAll("[data-task]")].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.bottom > viewport.top && box.top < viewport.bottom;
      })
      : [];
    const rows = visible.slice(0, 5).map((node) => ({ id: node.dataset.task, status: node.dataset.taskStatus }));
    setSmartViewRevealRows(rows);
    clearTimeout(smartViewRevealTimer.current);
    smartViewRevealTimer.current = setTimeout(() => setSmartViewRevealRows([]), 360);
    return undefined;
  }, [smartView]);
  useEffect(() => () => clearTimeout(smartViewRevealTimer.current), []);
  const revealIndex = (task) => {
    const index = smartViewRevealRows.findIndex((row) => row.id === task.id && row.status === task.status);
    return index === -1 ? null : index;
  };
  return (
    <div ref={listRef}>
      <div className="hidden lg:flex items-baseline justify-between mb-3">
        <h2 className="text-2xl font-bold tracking-tight">Actions</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => (selection ? onCancelSelect() : onStartSelect(null))} style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-label">SELECT</button>
          <button onClick={onManageLists} style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-label">LISTS</button>
          <button onClick={onAddTask} style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-hover-control nb-data">+ ADD</button>
          {onCollapse && (
            <button data-test="actions-collapse" onClick={onCollapse} style={{ fontFamily: MONO, color: T.dimText }}
              className="nb-tap nb-hover-control nb-data" aria-label="Collapse Actions column">COLLAPSE ›</button>
          )}
        </div>
      </div>

      {selection && (
        <div className="flex flex-wrap items-center gap-1 mb-2 px-2 py-2" style={{ boxShadow: `inset 0 0 0 1px ${T.accent}`, borderRadius: CARD_R }}>
          <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-data mr-1">{selection.size} SELECTED</span>
          {[["complete", "COMPLETE"], ["today", "TODAY"], ["defer", "TOMORROW"]].map(([action, label]) => (
            <button key={action} onClick={() => onBulk(action)} className="nb-tap nb-hover-choice px-2 py-1 nb-data"
              style={{ fontFamily: MONO, borderRadius: 999, color: T.text, border: `1px solid ${T.line}` }}>{label}</button>
          ))}
          {/* §11.3. The three that benefit most from being done at once, each
              borrowing the single-task command so the rules stay identical. */}
          <select onChange={(e) => { if (e.target.value) { onBulk("list", e.target.value); e.target.value = ""; } }} defaultValue=""
            style={{ fontFamily: MONO, borderRadius: 999, background: "transparent", color: T.dimText, border: `1px solid ${T.line}` }} className="px-2 py-1 nb-data">
            <option value="">MOVE TO…</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select onChange={(e) => { if (e.target.value) { onBulk("priority", e.target.value); e.target.value = ""; } }} defaultValue=""
            style={{ fontFamily: MONO, borderRadius: 999, background: "transparent", color: T.dimText, border: `1px solid ${T.line}` }} className="px-2 py-1 nb-data">
            <option value="">PRIORITY…</option>
            {["urgent", "high", "normal", "low", "none"].map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}
          </select>
          <button onClick={() => { const t = prompt("Tag to add"); if (t && t.trim()) onBulk("tag", t.trim()); }}
            className="nb-tap nb-hover-choice px-2 py-1 nb-data" style={{ fontFamily: MONO, borderRadius: 999, color: T.text, border: `1px solid ${T.line}` }}>TAG…</button>
          <button onClick={() => onBulk("delete")} className="nb-tap nb-hover-danger px-2 py-1 nb-data"
            style={{ fontFamily: MONO, borderRadius: 999, color: NOW_RED, border: `1px solid ${T.line}` }}>DELETE</button>
          <button onClick={onCancelSelect} style={{ fontFamily: MONO, color: T.dimText }} className="ml-auto nb-label">CANCEL</button>
        </div>
      )}

      <div className="nb-x flex gap-1 overflow-x-auto mb-3 -mx-1 px-1">
        {SMART_VIEWS.map((view) => {
          const on = view.id === smartView;
          const count = viewCounts?.[view.id] ?? 0;
          if (!on && count === 0 && view.id !== "today") return null;
          return (
            <button key={view.id} onClick={() => onSmartView(view.id)} className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} shrink-0 px-2 py-1 nb-label`}
              style={{ fontFamily: MONO, background: on ? T.accent : "transparent", color: on ? T.on : T.dim, border: `1px solid ${on ? T.accent : T.line}` }}>
              {view.label}{count ? ` ${count}` : ""}
            </button>
          );
        })}
      </div>

      {/* Only what PLAN TODAY can actually move is offered: overdue work already
          planned onto today would make the button a visible no-op. */}
      {showOverdue && pullable.length > 0 && (
        <>
        <button data-test="plan-today" onClick={() => { beep("click"); setOverdueReviewOpen((current) => !current); }} className="w-full flex items-center gap-2 px-3 py-2 mb-2 text-left" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }} aria-expanded={overdueReviewOpen}>
          <span style={{ fontFamily: MONO, color: NOW_RED }} className="nb-data shrink-0">{pullable.length} OVERDUE</span>
          <span className="flex-1 text-xs truncate" style={{ color: T.dimText }}>{pullable.map((t) => t.title).join(" · ")}</span>
            <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-label shrink-0">PLAN TODAY</span>
          </button>
          <Reveal open={overdueReviewOpen}>
            <div data-test="overdue-plan-review" className="mb-3 px-3 py-2.5" style={{ background: T.card, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1px ${NOW_RED}`, opacity: overdueReviewOpen ? 1 : 0, transform: overdueReviewOpen ? "translateY(0)" : "translateY(-4px)", transition: "opacity 180ms ease-out, transform 180ms cubic-bezier(.23,1,.32,1)" }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span style={{ fontFamily: MONO, color: NOW_RED }} className="nb-label">OVERDUE WORK</span>
                <button data-test="overdue-plan-cancel" onClick={() => { beep("click"); setOverdueReviewOpen(false); }} style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-label">CANCEL</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {pullable.map((t) => (
                  <div key={t.id} data-test={`overdue-plan-${t.id}`} className="flex items-center gap-2 py-1.5" style={{ borderTop: `1px solid ${T.line}` }}>
                    <button data-test="overdue-plan-open" onClick={() => { beep("click"); setOverdueReviewOpen(false); onInspect(t.id); }} className="nb-tap nb-hover-control min-w-0 flex-1 text-left">
                      <span className="block text-sm font-semibold truncate">{t.title}</span>
                      <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data truncate">
                        DUE {t.deadline?.date || "—"} · WAS {t.planned?.date ? `${plannedLabel(t.planned.date, todayKey)}${t.planned.startMinute != null ? ` ${fmtTime(t.planned.startMinute, clock)}` : ""}` : "UNPLANNED"}{t.planned?.estimateMinutes ? ` · ${dur(t.planned.estimateMinutes)}` : ""}
                      </span>
                    </button>
                    <button data-test="overdue-plan-one" onClick={() => onPullOverdue([t.id])} style={{ fontFamily: MONO, color: T.accentText, border: `1px solid ${T.line}`, borderRadius: 999 }} className="nb-tap nb-hover-choice shrink-0 px-2 py-1 nb-label">PLAN</button>
                  </div>
                ))}
              </div>
              <button data-test="overdue-plan-all" onClick={() => { setOverdueReviewOpen(false); onPullOverdue(); }} style={{ fontFamily: MONO, color: T.on, background: T.accent, borderRadius: 999 }} className="nb-tap mt-2 w-full px-2 py-1.5 nb-label">PLAN ALL TODAY</button>
            </div>
          </Reveal>
        </>
      )}

      {deadlines.length > 0 && (
        <div className="mb-3">
          <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">DEADLINES</span>
          <div className="flex flex-col mt-1">
            {deadlines.slice(0, 4).map((t) => {
              const dLeft = diffDays(t.deadline.date, todayKey);
              return (
                <button key={t.id} data-deadline={t.id} onClick={() => onOpenDeadline(t)} className="nb-row flex items-center gap-2 py-2 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                  {/* The chip sizes to its longest word instead of being clipped to a
                      fixed width, which was overlapping the title. */}
                  <span style={{ fontFamily: MONO, color: dLeft <= 1 ? NOW_RED : T.dim, borderRadius: 999, border: `1px solid ${dLeft <= 1 ? NOW_RED : T.line}` }}
                    className="px-2 py-0.5 nb-data shrink-0 whitespace-nowrap">
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
        <button onClick={onAddTask} className="nb-list-enter w-full py-8 text-center" style={{ border: `1px dashed ${T.faint}`, "--nb-list-index": 0 }}>
          <span style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice">Nothing claimed for this day yet. Add the one thing that matters.</span>
        </button>
      )}

      <div className="flex flex-col gap-2">
        {open.map((t) => (
          <TaskCard key={t.id} T={T} t={t} beep={beep} buzz={buzz} target={gesture && gesture.overTask === t.id} todayKey={todayKey} blockers={blockersFor(t)} subtasks={subtasksFor(t)} onPromoteSub={onPromoteSub} clock={clock} selection={selection} onToggleSelect={onToggleSelect} onStartSelect={onStartSelect}
            onComplete={onComplete} onReopen={onReopen} onDefer={onDefer} onInspect={onInspect} onToggleSub={onToggleSub} onAddSub={onAddSub} onRemoveSub={onRemoveSub} onDragStart={onDragStart} onUnschedule={onUnschedule} listEnterIndex={revealIndex(t)} />
        ))}
      </div>

      {done.length > 0 && (
        <div className="mt-4">
          <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">DONE · {done.length}</span>
          <div className="flex flex-col gap-2 mt-2">
            {done.map((t) => (
              <TaskCard key={t.id} T={T} t={t} beep={beep} buzz={buzz} todayKey={todayKey} blockers={blockersFor(t)} subtasks={subtasksFor(t)} onPromoteSub={onPromoteSub} clock={clock} selection={selection} onToggleSelect={onToggleSelect} onStartSelect={onStartSelect}
                onComplete={onComplete} onReopen={onReopen} onDefer={onDefer} onInspect={onInspect} onToggleSub={onToggleSub} onAddSub={onAddSub} onRemoveSub={onRemoveSub} onDragStart={onDragStart} onUnschedule={onUnschedule} listEnterIndex={revealIndex(t)} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">NOTES</span>
          <button onClick={() => onEditNote(notes[0] ?? null)} style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-data">{notes.length ? "EDIT" : "+ WRITE"}</button>
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
                    ? <button onClick={() => onExtract(n.id, block.id, plainText(block.text))} style={{ fontFamily: MONO, color: T.accentText }} className="nb-data shrink-0">+ ACTION</button>
                    : <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">TRACKED</span>}
                </div>
              ) : (
                <NoteBlock key={block.id} T={T} block={block} ordinal={orderedIndex(all, i)} onOpen={() => onEditNote(n)} />
              )))}
            </div>
          ))}
          {notes.length === 0 && <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice pl-3">No notes on this page yet.</p>}
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
    if (run.mark === "strike") return <span key={i} style={{ textDecoration: "line-through", color: T.dimText }}>{run.text}</span>;
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
    <p style={{ fontFamily: SERIF, color: T.dimText, borderLeft: `2px solid ${T.accent}` }}
      className="nb-voice leading-relaxed py-0.5 pl-2.5 my-1">{marked}</p>
  ) : block.type === "code" ? (
    <span style={{ fontFamily: MONO, background: T.faint, color: T.text, display: "block", whiteSpace: "pre-wrap" }}
      className="text-xs leading-relaxed p-2.5 my-1 overflow-x-auto">{block.text}</span>
  ) : block.type === "bulleted" || block.type === "numbered" ? (
    <span className="flex gap-2 py-0.5">
      <span style={{ fontFamily: MONO, color: T.dimText }} className="text-xs shrink-0 pt-1 tabular-nums">
        {block.type === "numbered" ? `${ordinal}.` : "—"}
      </span>
      <span style={{ fontFamily: SERIF }} className="flex-1 nb-voice leading-relaxed">{marked}</span>
    </span>
  ) : (
    <p style={{ fontFamily: SERIF }} className="nb-voice leading-relaxed py-0.5">{marked}</p>
  );
  return <button onClick={onOpen} className="text-left w-full">{body}</button>;
}

function TaskCard({ T, t, beep, buzz, target, todayKey, blockers = [], subtasks = [], onPromoteSub, clock = "12", selection = null, onToggleSelect, onStartSelect, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onUnschedule, listEnterIndex = null }) {
  const [prog, setProg] = useState(0);
  const [dx, setDx] = useState(0);
  const [burst, setBurst] = useState(null);
  const [quickStepOpen, setQuickStepOpen] = useState(false);
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
  const dueLeft = t.deadline.date ? diffDays(t.deadline.date, todayKey) : null;
  const isDone = t.status === "completed";
  const showChecklistComposer = checklist.length > 0 || subtasks.length === 0 || quickStepOpen;

  return (
    <div data-task={t.id} data-task-status={t.status} className={`relative ${listEnterIndex != null ? "nb-list-enter" : ""}`} style={{ background: "transparent", borderRadius: CARD_R, boxShadow: target ? `inset 0 2px 0 ${T.accent}, var(--e1)` : "var(--e1)", "--nb-list-index": listEnterIndex ?? undefined }}>
        <div data-test="task-completion-backdrop" className="absolute inset-0 flex items-center justify-between px-4"
          style={{ fontFamily: MONO, background: dx > 0 ? T.accent : surface, color: dx > 0 ? T.on : T.dimText, borderRadius: CARD_R }}>
          <span className="nb-data" style={{ color: T.on, opacity: dx > 20 ? 1 : 0 }}>COMPLETE</span>
          <span className="nb-data" style={{ color: T.dimText, opacity: dx < -20 ? 1 : 0 }}>TOMORROW</span>
        </div>

      <article className="nb-action-card nb-hover-tile relative overflow-hidden" style={{ background: surface, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1px ${T.line}`, transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 220ms cubic-bezier(.2,.8,.25,1), box-shadow 200ms cubic-bezier(.2,.8,.25,1)" : "none", opacity: 1, touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div data-test="task-completion-overlay" data-visible={String(isDone)} aria-hidden="true"
          className={`nb-action-complete-overlay absolute inset-0 z-10 flex items-center gap-2 pl-14 pr-4 pointer-events-none ${isDone ? "is-visible" : ""}`}
          style={{ background: T.accent, color: T.on, borderRadius: CARD_R, fontFamily: MONO }}>
          <CheckIcon size={14} />
          <span className="nb-label">COMPLETE</span>
        </div>
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
            className="nb-hover-icon relative z-20 mt-0.5 w-8 h-8 shrink-0 flex items-center justify-center"
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
              <button onClick={() => onInspect(t.id)} className="nb-hover-control text-left w-full">
                <span className="block text-sm font-semibold leading-snug" style={{ color: isDone ? T.dimText : T.text }}>{t.title}</span>
              </button>
              <div className="flex flex-wrap items-center gap-2 mt-1" style={{ fontFamily: MONO }}>
              <span className="inline-flex items-center gap-1.5">
                <span className="shrink-0 rounded-full" style={{ width: 7, height: 7, background: catColor(t.category) }} />
                <span style={{ color: T.dimText }} className="nb-data">{t.category}</span>
                </span>
                {isDone && <span style={{ color: T.accentText, border: `1px solid ${T.accent}`, borderRadius: 999 }} className="px-1.5 py-0.5 nb-label shrink-0">DONE</span>}
              {/* Open is the default and stays quiet; the two states you set on
                  purpose announce themselves, so changing status in the detail view
                  has a visible effect out here on the row. */}
              {!isDone && t.status === "in_progress" && (
                <span style={{ color: T.accentText, border: `1px solid ${T.accent}`, borderRadius: 999 }} className="px-1.5 py-0.5 nb-label shrink-0">DOING</span>
              )}
              {!isDone && t.status === "waiting" && (
                <span style={{ color: T.dimText, border: `1px solid ${T.line}`, borderRadius: 999 }} className="px-1.5 py-0.5 nb-label shrink-0">WAITING</span>
              )}
              {t.recurrence && <span style={{ color: T.dimText }} className="text-xs"><RepeatIcon /></span>}
              {t.planned.startMinute != null && <button onClick={() => onUnschedule(t.id)} style={{ color: T.accentText }} className="nb-hover-control nb-data">{fmtTime(t.planned.startMinute, clock)}</button>}
              {dueLeft != null && <span style={{ color: dueLeft <= 0 ? NOW_RED : T.dim }} className="nb-data">DUE {dueLeft === 0 ? "TODAY" : dueLeft < 0 ? `${-dueLeft}D LATE` : `${dueLeft}D`}</span>}
              {checklist.length > 0 && <span style={{ color: T.dimText }} className="nb-data">{subDone}/{checklist.length}</span>}
              {blockers.length > 0 && (
                <span title={blockers.map((b) => b.title).join(", ")} style={{ color: NOW_RED }} className="nb-data">
                  <span className="inline-flex items-center gap-1"><BlockIcon />BLOCKED BY {blockers.length === 1 ? blockers[0].title : `${blockers.length} TASKS`}</span>
                </span>
              )}
            </div>
            <SegmentedProgress T={T} done={subDone} total={checklist.length}
              className="mt-2" ariaLabel={`${subDone} of ${checklist.length} steps done`} />
          </div>

          <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(t.id, e.clientX, e.clientY); }}
            onContextMenu={(e) => { e.preventDefault(); if (!selection) onStartSelect(t.id); }}
            style={{ color: T.dimText, touchAction: "none" }}
              className="nb-tap shrink-0 w-7 h-8 flex items-center justify-center text-xs" aria-label="Drag to schedule, reorder, or move to another day"><GripIcon /></button>
        </div>

        {!isDone && showChecklistComposer && (
          <section data-test="task-checklist" aria-label="Checklist" className={`pl-8 pr-3 ${checklist.length > 0 ? "pb-3" : "pt-1 pb-2"}`}>
            <div data-test="task-add-step" className="pl-3" style={{ borderLeft: `2px solid ${T.faint}` }}>
              {(checklist.length > 0 || quickStepOpen) && (
                <div style={{ fontFamily: MONO, color: T.dimText }} className="flex items-center gap-2 pt-0.5 nb-data">
                  <span>CHECKLIST</span>
                  {checklist.length > 0 && <span>{subDone}/{checklist.length}</span>}
                </div>
              )}
              <SubComposer T={T} autoFocus={quickStepOpen && checklist.length === 0} onAdd={(v) => onAddSub(t.id, v)} />
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
                  <button type="button" data-test="task-promote-subtask"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onPromoteSub(t.id, s.id); }}
                    style={{ color: T.dimText, touchAction: "manipulation" }}
                    className="nb-tap nb-hover-icon flex h-11 w-11 shrink-0 items-center justify-center"
                    aria-label="Convert step to a subtask" title="Turn this checklist item into tracked child work"><ArrowUpIcon /></button>
                  <button type="button" onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onRemoveSub(t.id, s.id); }}
                    style={{ color: T.dimText, touchAction: "manipulation" }}
                    className="nb-tap nb-hover-icon flex h-11 w-11 shrink-0 items-center justify-center"
                    aria-label="Remove step"><CloseIcon /></button>
                </div>
              ))}
            </div>
          </section>
        )}
        {!isDone && checklist.length === 0 && subtasks.length > 0 && !quickStepOpen && (
          <div className="mx-3 mb-2">
            <button type="button" onClick={() => setQuickStepOpen(true)}
              className="nb-tap nb-hover-control nb-micro inline-flex min-h-11 items-center py-1" style={{ color: T.dimText, minHeight: 44 }}>
              + QUICK STEP
            </button>
          </div>
        )}
        <PromotedSubtasks T={T} subtasks={subtasks}
          onComplete={onComplete} onReopen={onReopen} onOpen={onInspect} />
      </article>
    </div>
  );
}

/* A promoted step is now a task record rather than checklist text. Keep it in the
   parent’s visual tree: it is intentionally absent from top-level day queries, so
   rendering it nowhere would turn a successful promotion into apparent deletion. */
function PromotedSubtasks({ T, subtasks, onComplete, onReopen, onOpen, className = "" }) {
  if (!subtasks.length) return null;
  const done = subtasks.filter((task) => task.status === "completed").length;
  return (
    <section data-test="task-subtasks" aria-label={`Subtasks, ${done} of ${subtasks.length} complete`} className={`mx-3 mb-3 pl-3 ${className}`} style={{ borderLeft: `2px solid ${T.accent}` }}>
      <div style={{ fontFamily: MONO, color: T.dimText }} className="flex items-center gap-2 pb-1 pt-0.5 nb-data">
        <span>SUBTASKS</span>
        <span>{done}/{subtasks.length}</span>
      </div>
      {subtasks.map((subtask) => {
        const complete = subtask.status === "completed";
        const status = complete ? "DONE" : subtask.status === "waiting" ? "WAITING" : subtask.status === "in_progress" ? "DOING" : null;
        return (
          <div key={subtask.id} data-test="task-subtask" data-subtask-id={subtask.id} className="flex min-w-0 items-center gap-2 px-1.5 py-1.5" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10 }}>
            <button type="button" aria-label={complete ? `Reopen ${subtask.title}` : `Complete ${subtask.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); (complete ? onReopen : onComplete)(subtask.id); }}
              className="nb-hover-icon flex h-6 w-6 shrink-0 items-center justify-center" style={{ color: T.accent }}>
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: complete ? T.accent : "transparent", boxShadow: `inset 0 0 0 1px ${complete ? T.accent : T.faint}` }} />
            </button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onOpen(subtask.id); }}
              className="nb-hover-control nb-subtask-title min-w-0 flex-1 py-1 text-left">
              <span className="block truncate text-xs" style={{ color: complete ? T.dim : T.text, textDecoration: complete ? "line-through" : "none" }}>{subtask.title}</span>
              <span style={{ fontFamily: MONO, color: T.dimText }} className="mt-0.5 flex items-center gap-1.5 nb-micro">
                <span>SUBTASK</span>
                {status && <span data-test="task-subtask-status">{status}</span>}
              </span>
            </button>
          </div>
        );
      })}
    </section>
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
function WeekGrid({ T, surface, hourRule, hourBand, week, dateKey, todayKey, nowMin, clock, slots, draftPreview, onCreateDraft, onTimelineScroll, onTimelineIntent, onOpenDay, onOpenEvent, onOpenTask, onSlotPick, onMoveEvent, beep, buzz }) {
  const scrollRef = useRef(null);
  const weekKey = week[0]?.key;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firsts = week.flatMap((d) => d.timed.map((e) => e.start));
    const anchor = week.some((d) => d.key === todayKey) ? nowMin : firsts.length ? Math.min(...firsts) : 480;
    const initialScrollTop = Math.max(0, (anchor / 1440) * DAY_H - 140);
    el.scrollTop = initialScrollTop;
    onTimelineScroll?.(initialScrollTop, { initial: true });
  }, [weekKey, onTimelineScroll]);
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
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const draftPressRef = useRef(null);
  const draftEndedAtRef = useRef(0);
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

  const cancelDraftPress = () => {
    const press = draftPressRef.current;
    if (!press) return;
    clearTimeout(press.timer);
    press.timer = null;
    press.cancelled = true;
  };

  const beginDraft = () => {
    const press = draftPressRef.current;
    if (!press || press.cancelled || draftRef.current) return;
    press.timer = null;
    press.held = true;
    const next = {
      date: press.date,
      start: press.start,
      dur: 30,
      x: press.x,
      y: press.y,
    };
    draftRef.current = next;
    setDraft(next);
    beep?.("lift");
    buzz?.(14);
  };

  const updateDraft = (clientX, clientY) => {
    const current = draftRef.current;
    if (!current) return;
    const next = {
      ...current,
      x: clientX,
      y: clientY,
      /* Creating in a week is anchored to the column where the press began;
         the vertical motion is the duration handle, just like an empty day
         timeline press. A horizontal move can still leave the column without
         silently changing the day being created. */
      dur: proposeGesture("resize-end", {
        start: current.start,
        pointerMinute: minuteAt(clientY),
        kind: "event",
      }).duration,
    };
    draftRef.current = next;
    setDraft(next);
  };

  const finishDraft = () => {
    const current = draftRef.current;
    draftRef.current = null;
    draftPressRef.current = null;
    setDraft(null);
    if (!current) return;
    draftEndedAtRef.current = Date.now();
    onCreateDraft?.({ date: current.date, start: current.start, dur: current.dur });
  };

  const armDraft = (event, day) => {
    if (event.target.closest?.("[data-test='week-event']")) return;
    const { clientX, clientY } = event.touches?.[0] ?? event;
    const rect = event.currentTarget.getBoundingClientRect();
    const start = startSlot(((clientY - rect.top) / DAY_H) * 1440, 5);
    cancelDraftPress();
    const press = {
      date: day,
      start,
      x: clientX,
      y: clientY,
      held: false,
      cancelled: false,
      timer: null,
      pointerType: event.pointerType || "touch",
    };
    press.timer = setTimeout(beginDraft, EMPTY_SPACE_LIFT_MS);
    draftPressRef.current = press;
  };

  const draftPointerDown = (event, day) => {
    if (event.pointerType === "touch" || event.button === 2) return;
    event.stopPropagation();
    armDraft(event, day);
  };

  const draftTouchStart = (event, day) => {
    if (event.touches.length !== 1 || event.target.closest?.("[data-test='week-event']")) return;
    event.stopPropagation();
    armDraft(event, day);
  };

  const draftTouchMove = (event) => {
    if (event.target.closest?.("[data-test='week-event']") && !draftRef.current) return;
    const point = event.touches[0];
    if (!point) return;
    const press = draftPressRef.current;
    if (!draftRef.current) {
      if (press && movedEnoughToCancelHold(press, { x: point.clientX, y: point.clientY })) cancelDraftPress();
      return;
    }
    if (event.cancelable) event.preventDefault();
    updateDraft(point.clientX, point.clientY);
  };

  const draftTouchEnd = (event, day) => {
    if (event.target.closest?.("[data-test='week-event']")) return;
    const press = draftPressRef.current;
    if (draftRef.current) {
      if (event.cancelable) event.preventDefault();
      finishDraft();
      return;
    }
    if (!press) return;
    clearTimeout(press.timer);
    draftPressRef.current = null;
    if (event.cancelable) event.preventDefault();
    if (press.cancelled) {
      /* A cancelled touch must not fall through to the compatibility click on
         the column. Without this, a small scroll that correctly aborts the
         creation hold still opened a one-hour composer when the finger lifted. */
      draftEndedAtRef.current = Date.now();
      return;
    }
    onSlotPick?.({ date: day, start: press.start, dur: 60 });
  };

  useEffect(() => {
    const move = (event) => {
      const press = draftPressRef.current;
      if (!press || press.pointerType === "touch" || draftRef.current) return;
      if (movedEnoughToCancelHold(press, { x: event.clientX, y: event.clientY })) cancelDraftPress();
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    if (!draft) return undefined;
    const move = (event) => { event.preventDefault(); updateDraft(event.clientX, event.clientY); };
    const up = () => finishDraft();
    const cancel = () => {
      draftRef.current = null;
      setDraft(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [Boolean(draft)]);

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
    const cancel = () => {
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging]);

  /* Touch is driven by touch events, not pointer events: a scroll container fires
     pointercancel the instant the browser claims the gesture, which would kill
     every long press before it lifted. Same reason the day timeline does. */
  const touchStart = (e, event, day) => {
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    const { clientX, clientY } = e.touches[0];
    tapRef.current = true;
    clearTimeout(holdRef.current);
    armedRef.current = { x: clientX, y: clientY };
    holdRef.current = setTimeout(() => beginDrag(event, day, clientX, clientY), LIFT_MS);
  };
  const touchMove = (e) => {
    if (!dragRef.current) {
      const t = e.touches[0];
      const armed = armedRef.current;
      if (armed && t && movedEnoughToCancelHold(armed, { x: t.clientX, y: t.clientY })) {
        disarm();
        tapRef.current = false;
      }
      return;
    }
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
    if (e.pointerType === "touch") { e.stopPropagation(); return; }
    if (e.button === 2) return;
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

  useEffect(() => () => {
    clearTimeout(holdRef.current);
    clearTimeout(draftPressRef.current?.timer);
  }, []);

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
                <span style={{ fontFamily: MONO, color: sel ? T.accent : T.dim }} className="block nb-data">{WD[d.getDay()]}</span>
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
            <span className="w-12 shrink-0 self-center pr-2 text-right nb-data" style={{ fontFamily: MONO, color: T.dimText, fontSize: 9 }}>ALL DAY</span>
            {week.map((day) => (
              <div key={day.key} className="flex-1 min-w-0 px-0.5 py-1 flex flex-col gap-0.5" style={{ borderLeft: `1px solid ${hourRule}` }}>
                {day.allDay.map((e) => {
                  const href = normalizeMeetingLink(e.link);
                  return (
                    <div key={e.segmentId ?? e.id} className="relative overflow-hidden" style={{ background: surface, borderRadius: 6 }}>
                      <button onClick={() => onOpenEvent(e.id, day.key)} className="nb-tap flex w-full items-center gap-1 py-0.5 text-left overflow-hidden"
                        style={{ paddingLeft: 6, paddingRight: href ? 20 : 6 }}>
                        <span className="shrink-0 rounded-full" style={{ width: 5, height: 5, background: catColor(e.cat) }} />
                        <span className="font-semibold truncate" style={{ fontSize: 10 }}>{e.title}</span>
                      </button>
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer" draggable={false} data-join={e.id}
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onPointerUp={(ev) => ev.stopPropagation()}
                          onPointerCancel={(ev) => ev.stopPropagation()}
                          onTouchStart={(ev) => ev.stopPropagation()}
                          onTouchEnd={(ev) => ev.stopPropagation()}
                          onClick={(ev) => ev.stopPropagation()}
                          aria-label={`Join ${e.title}`}
                          className="absolute inset-y-0 right-0 z-10 inline-flex w-4 items-center justify-center"
                          style={{ color: T.accentText }}>
                          <ExternalLinkIcon size={10} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <div ref={scrollRef} onTouchStartCapture={() => onTimelineIntent?.()} onWheel={() => onTimelineIntent?.()} onScroll={(event) => {
          /* The scroll container is the reliable cancellation signal on touch:
             a finger can move only a few pixels before the browser starts
             scrolling, which is still a scroll rather than an intentional
             creation hold. Once the draft has lifted, vertical motion belongs
             to its duration update and must not cancel it. */
          if (draftPressRef.current && !draftRef.current) cancelDraftPress();
          onTimelineScroll?.(event.currentTarget.scrollTop);
        }} className="nb-s flex-1 min-h-0 overflow-y-auto">
          <div className="relative flex" style={{ height: DAY_H, userSelect: "none", WebkitUserSelect: "none" }}>
            <div className="relative w-12 shrink-0">
              {Array.from({ length: 24 }).map((_, h) => h > 0 && (
                <span key={h} className="absolute right-2 tracking-widest" style={{ top: h * HOUR_H, transform: "translateY(-50%)", fontFamily: MONO, color: T.dimText, fontSize: 9 }}>{fmtHour(h, clock)}</span>
              ))}
            </div>
            {week.map((day) => {
              const isToday = day.key === todayKey;
              const daySlots = slots.filter((s) => s.date === day.key);
              const dayDraft = draft?.date === day.key ? draft : draftPreview?.date === day.key ? draftPreview : null;
              return (
                <div key={day.key} data-week-day={day.key} className="relative flex-1 min-w-0" style={{
                    borderLeft: `1px solid ${hourRule}`,
                    background: drag?.date === day.key ? `${T.accent}14` : day.key === dateKey ? `${T.accent}08` : "transparent",
                  }}
                  onPointerDown={(event) => draftPointerDown(event, day.key)}
                  onPointerUp={(event) => {
                    if (event.pointerType === "touch") return;
                    const press = draftPressRef.current;
                    if (draftRef.current) { finishDraft(); return; }
                    if (!press) return;
                    clearTimeout(press.timer);
                    draftPressRef.current = null;
                    if (press.cancelled) draftEndedAtRef.current = Date.now();
                  }}
                  onPointerCancel={() => {
                    const press = draftPressRef.current;
                    if (draftRef.current) { draftRef.current = null; setDraft(null); }
                    if (press?.cancelled) draftEndedAtRef.current = Date.now();
                    clearTimeout(press?.timer);
                    draftPressRef.current = null;
                  }}
                  onTouchStart={(event) => draftTouchStart(event, day.key)}
                  onTouchMove={draftTouchMove}
                  onTouchEnd={(event) => draftTouchEnd(event, day.key)}
                  onTouchCancel={() => {
                    cancelDraftPress();
                    draftEndedAtRef.current = Date.now();
                    draftPressRef.current = null;
                  }}
                  onClick={(e) => {
                    /* A drop is not a click on the column underneath it. */
                    if (dragRef.current || Date.now() - draftEndedAtRef.current < 350) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    onSlotPick({ date: day.key, start: startSlot(((e.clientY - rect.top) / DAY_H) * 1440, 30), dur: 60 });
                  }}>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="absolute left-0 right-0 pointer-events-none" style={{ top: h * HOUR_H, height: HOUR_H, borderTop: `1px solid ${hourRule}`, background: h % 2 ? hourBand : "transparent" }} />
                  ))}
                  {dayDraft && (
                    <div data-test="week-draft-preview" className="absolute left-0.5 right-0.5 pointer-events-none flex items-center justify-center"
                      data-date={dayDraft.date} data-start={dayDraft.start} data-duration={dayDraft.dur}
                      style={{ top: (dayDraft.start / 1440) * DAY_H + 1, height: Math.max(16, (dayDraft.dur / 1440) * DAY_H - 2), borderRadius: CARD_R, boxShadow: `inset 0 0 0 1.5px ${T.accent}`, background: `${T.accent}14`, zIndex: 7 }}>
                      <span className="tracking-widest" style={{ fontFamily: MONO, color: T.accentText, fontSize: 9 }}>
                        {fmtTime(dayDraft.start, clock)} – {fmtTime(dayDraft.start + dayDraft.dur, clock)}
                      </span>
                    </div>
                  )}
                  {cardsFor(day).map((e) => {
                    const top = (e.start / 1440) * DAY_H;
                    const h = Math.max(16, (e.dur / 1440) * DAY_H) - 2;
                    const past = !e.lifted && (day.key < todayKey || (isToday && nowMin >= e.start + e.dur));
                    const href = normalizeMeetingLink(e.link);
                    return (
                      <div key={e.segmentId ?? `${e.id}-${e.start}`} className="absolute" style={{
                        top: top + 1, height: h,
                        left: `calc(${(e.lane / e.cols) * 100}% + 2px)`, width: `calc(${100 / e.cols}% - 4px)`,
                        zIndex: e.lifted ? 8 : 2,
                      }}>
                      <button
                        data-test="week-event" data-event-id={e.id}
                        onPointerDown={(ev) => pointerDown(ev, e, day.key)}
                        onPointerUp={(ev) => pointerUp(ev, e, day.key)}
                        onTouchStart={(ev) => touchStart(ev, e, day.key)}
                        onTouchMove={(ev) => { ev.stopPropagation(); touchMove(ev); }}
                        onTouchEnd={(ev) => { ev.stopPropagation(); touchEnd(ev, e, day.key); }}
                        onTouchCancel={(ev) => { ev.stopPropagation(); disarm(); dragRef.current = null; setDrag(null); }}
                        onClick={(ev) => ev.stopPropagation()}
                        className="nb-hover-tile absolute inset-y-0 left-0 text-left overflow-hidden"
                        style={{
                          /* Week columns are ~45px on a phone. A 50px JOIN lane
                             left a 6px title. Keep an icon-sized hit target and
                             give the name the rest of the card. */
                          right: href ? 18 : 0,
                          display: "flex", flexDirection: "column", justifyContent: "flex-start",
                          background: surface, borderRadius: CARD_R,
                          opacity: past ? 0.74 : 1,
                          /* The lifted card rides above everything, is not a drop
                             target for its own hit-test, and says it is lifted. */
                          zIndex: e.lifted ? 8 : 2,
                          pointerEvents: e.lifted ? "none" : "auto",
                          touchAction: "pan-y",
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
                        <span className={`flex flex-1 items-center gap-1 overflow-hidden ${e.cols > 1 || href ? "px-1" : "px-1.5"} pt-0.5 min-w-0`}>
                          {e.cols === 1 && !href && <span className="shrink-0 rounded-full" style={{ width: 5, height: 5, background: catColor(e.cat) }} />}
                          <span className="min-w-0 flex-1 font-semibold leading-tight truncate" style={{ fontSize: 10 }}>{e.title}</span>
                        </span>
                        {(e.lifted || (h >= 30 && e.cols === 1)) && <span className="block truncate tracking-widest" style={{ fontFamily: MONO, color: e.lifted ? T.accent : T.dim, fontSize: 9, paddingLeft: e.lifted && e.cols > 1 ? 4 : (href ? 4 : 15) }}>{fmtTime(e.start, clock)}</span>}
                      </button>
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer" draggable={false} data-join={e.id}
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onPointerUp={(ev) => ev.stopPropagation()}
                          onPointerCancel={(ev) => ev.stopPropagation()}
                          onTouchStart={(ev) => ev.stopPropagation()}
                          onTouchEnd={(ev) => ev.stopPropagation()}
                          onClick={(ev) => ev.stopPropagation()}
                          aria-label={`Join ${e.title}`}
                          className="absolute inset-y-0 right-0 z-10 inline-flex w-4 items-center justify-center"
                          style={{ color: T.accentText }}>
                          <ExternalLinkIcon size={10} />
                        </a>
                      )}
                      </div>
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
                      <span className="tracking-widest pt-0.5" style={{ fontFamily: MONO, color: T.accentText, fontSize: 9 }}>{fmtTime(s.start, clock)}</span>
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
 * The two controls occupy real grid columns. The old absolute overlay made the
 * button reserve a guessed width; on a 360px phone that left an ordinary title
 * only ~85px while the time was centred through both text lines. */

function RowWithJoin({ T, surface, link, title, onOpen, className = "", padding = "px-3 py-2.5", style = {}, children }) {
  const href = normalizeMeetingLink(link);
  return (
    <div className={`nb-hover-tile grid items-stretch ${href ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"}`} style={{ background: surface, borderRadius: CARD_R, boxShadow: "var(--e1)", ...style }}>
      <button onClick={onOpen} className={`nb-tap nb-hover-control min-w-0 w-full flex items-center gap-2.5 text-left ${padding} ${className}`}
        style={{ background: "transparent", borderRadius: CARD_R }}>
        {children}
      </button>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" draggable={false}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Join ${title}`}
          style={{ fontFamily: MONO, color: T.accentText }}
           className="nb-tap nb-hover-control self-center justify-self-end mx-2 inline-flex items-center gap-1 px-1.5 py-1 text-xs font-bold tracking-widest">JOIN <ExternalLinkIcon /></a>
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
            <button onClick={() => onJump(day.key)} className="nb-hover-tile shrink-0 w-16 py-3 text-center" style={{ background: T.bg }}>
              <span className="inline-flex flex-col items-center px-2 py-1"
                style={{ borderRadius: CARD_R, boxShadow: isToday ? `inset 0 0 0 1.5px ${T.text}` : "none" }}>
                <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data">{WD[d.getDay()]}</span>
                <span style={{ fontFamily: MONO }} className="block text-xl font-bold tracking-tight">{pad(d.getDate())}</span>
              </span>
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-2 pr-2 pl-2">
              {count === 0 && <span style={{ fontFamily: MONO, color: T.faint }} className="nb-data py-2">—</span>}
              {day.allDay.map((e) => (
                <RowWithJoin key={e.id} T={T} surface={surface} link={e.link} title={e.title}
                  onOpen={() => onOpenEvent(e.id, day.key)}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold whitespace-normal break-words leading-5">{e.title}</span>
                    <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-label mt-0.5">ALL DAY</span>
                  </span>
                </RowWithJoin>
              ))}
              {day.timed.map((e) => (
                <RowWithJoin key={e.id} T={T} surface={surface} link={e.link} title={e.title}
                  onOpen={() => onOpenEvent(e.id, day.key)}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(e.cat) }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold whitespace-normal break-words leading-5">{e.title}</span>
                    <span className="mt-0.5 flex min-w-0 items-baseline justify-between gap-2">
                      {e.place && <span style={{ color: T.dimText }} className="min-w-0 flex-1 text-xs truncate">{e.place}</span>}
                      <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">{fmtTime(e.start, clock)}</span>
                    </span>
                  </span>
                </RowWithJoin>
              ))}
              {day.tasks.map((t) => (
                <button key={t.id} onClick={() => onOpenTask(t.id, day.key)} className="nb-tap nb-hover-tile flex items-center gap-2.5 px-3 py-2.5 text-left"
                  style={{ background: surface, borderRadius: CARD_R, opacity: t.status === "completed" ? 0.45 : 1 }}>
                  <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, boxShadow: `inset 0 0 0 1.5px ${catColor(t.category)}`, background: t.status === "completed" ? catColor(t.category) : "transparent" }} />
                  <span className="flex-1 text-sm font-semibold truncate" style={{ textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</span>
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">
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
            className="px-2 py-0.5 nb-data" title="Remove tag"
             style={{ fontFamily: MONO, borderRadius: 999, color: T.dimText, border: `1px solid ${T.line}` }}><span>{tag}</span><CloseIcon size={11} /></button>
        ) : (
          <span key={tag} className="px-2 py-0.5 nb-data"
            style={{ fontFamily: MONO, borderRadius: 999, color: T.dimText, border: `1px solid ${T.line}` }}>{tag}</span>
        )
      ))}
      {editable ? (
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} onBlur={add}
          onFocus={(event) => onBeginEdit?.(event.currentTarget)}
          placeholder={tags.length ? "Add tag" : "No tags"} style={{ background: "transparent", border: "none" }}
          className="text-sm py-0.5 flex-1 min-w-20" />
      ) : !tags.length ? <span style={{ color: T.dimText }} className="text-sm">No tags</span> : null}
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
    <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 260ms cubic-bezier(.23,1,.32,1)" }}>
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
      <span style={{ color: T.dimText }} className="text-sm shrink-0">{icon}</span>
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
      <span style={{ color: T.dimText }} className="text-base shrink-0 w-5 text-center">+</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder="Add a step" style={{ background: "transparent", border: "none" }} className="flex-1 text-sm py-0.5" />
      {v.trim() && <button onClick={go} style={{ fontFamily: MONO, color: T.accentText }} className="nb-label">ADD</button>}
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
function InlineChoice({ T, surface, icon, label, options, value, onPick, tint = null, dot = null, children = null, editable = true, onBeginEdit = null, open: openProp = undefined, onToggle = null }) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (next) => {
    if (onToggle) onToggle(typeof next === "function" ? next(open) : next);
    else setUncontrolledOpen(next);
  };
  const optionsRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(optionsRef, [value, options.length, open]);
  useEffect(() => { if (!editable && openProp == null) setUncontrolledOpen(false); }, [editable, openProp]);
  return (
    <div style={{ background: tint ? `${tint}22` : surface, borderRadius: CARD_R }} className="overflow-hidden">
      <button disabled={!editable} onClick={(event) => { if (!open) onBeginEdit?.(event.currentTarget); setOpen(!open); }} className="nb-tap nb-hover-control flex items-center gap-3 px-3 py-2.5 w-full text-left disabled:opacity-100">
        <span style={{ color: tint || T.dim }} className="text-sm shrink-0 w-4 text-center">{icon}</span>
        <span className="flex-1 text-sm truncate" style={{ color: tint || T.text }}>{label}</span>
        {editable && <span style={{ color: T.dimText, transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms cubic-bezier(.2,.8,.25,1)" }}
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
                  className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} relative inline-flex items-center gap-1.5 px-2.5 py-1.5 nb-data`}
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
      <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mb-0.5">{label}</span>
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
      <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mb-1">{label}</span>
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
        <button onClick={onRevert} disabled={!editing} className="nb-data"
          style={{ fontFamily: MONO, color: T.dimText }}>{dirty ? "REVERT" : "CANCEL"}</button>
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
function useCompactViewPills() {
  const query = `(max-width: ${VIEW_PILL_COMPACT_MAX}px)`;
  const [compact, setCompact] = useState(() => (
    typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches)
  ));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const sync = (event) => setCompact(event.matches);
    setCompact(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return compact;
}

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
    <div className="nb-search-wrap relative flex items-center justify-end" style={{ width: 104 }}
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
           transition: reduced ? "none" : "right 300ms cubic-bezier(.23,1,.32,1), opacity 180ms ease",
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
            color: T.dimText,
             transition: reduced ? "none" : "width 300ms cubic-bezier(.23,1,.32,1), background 180ms ease",
          }}>
          <SearchIcon />
          <span style={{
            fontFamily: MONO, color: T.dimText,
            opacity: expanded ? 1 : 0,
            transition: reduced ? "none" : "opacity 180ms ease 120ms",
          }} className="nb-data whitespace-nowrap">⌘K</span>
        </button>
      </div>
    </div>
  );
}

/* The plate travels on `transform`, never on `left`/`width`.
 *
 * It used to transition all four of left, width, top and height, which is a
 * layout pass per frame for the whole tablist and the last layout-property
 * animation left in the chrome — the exception the shared-layout-motion PRD
 * said to land and then replace. This replaces it.
 *
 * Nothing is distorted by the change, because the plate only ever sits on the
 * *active* slot and that slot is the same width wherever it is: compact gives
 * the active tab icon+word and every inactive one icon alone, so the box the
 * indicator occupies is constant in both tiers. Width is therefore a static
 * style and travel is a pure translate. `scaleX` stays for the liquid squash
 * along the direction of travel, which is the one deliberate distortion. */
function LiquidPillIndicator({ T, box, stretch, settled = true, z = 0 }) {
  if (!box) return null;
  return (
    <span aria-hidden="true" data-test="pill-indicator" data-width={Math.round(box.width)} className="absolute" style={{
      left: 0, top: 0, width: box.width, height: box.height,
      background: T.accent, borderRadius: 999, zIndex: z,
      transform: `translate3d(${box.left}px, ${box.top}px, 0) scaleX(${stretch})`,
      transformOrigin: "center",
      transition: settled ? "transform 300ms cubic-bezier(.23,1,.32,1)" : "none",
      willChange: "transform",
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

function PillNav({ T, value, options, onPick, ariaLabel, surface = "transparent",
                   className = "", style = {}, compact = false, icons = null, testId = null }) {
  const wrapRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(wrapRef, [value, options.length, compact]);
  const activeIndex = Math.max(0, options.findIndex(([key]) => key === value));
  const slots = compact ? viewPillSlots({ count: options.length, activeIndex }) : null;

  /* FLIP, with the measure pass removed. Compact slot geometry is a pure
     function of the active index, so both the old and the new left edge are
     known without touching the DOM — which is the whole reason the plate can no
     longer drift from the tab it belongs to. */
  const previousIndex = useRef(activeIndex);
  const [flip, setFlip] = useState(null);
  const [instant, setInstant] = useState(false);
  const reduced = typeof window !== "undefined"
    && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const pick = (key, event) => {
    const source = event.detail === 0 ? "keyboard" : "pointer";
    setInstant(source === "keyboard" || reduced);
    onPick(key, source);
  };
  useLayoutEffect(() => {
    const from = previousIndex.current;
    previousIndex.current = activeIndex;
    if (!compact || from === activeIndex || instant) return undefined;
    setFlip(options.map((_, index) => viewPillFlipOffset({
      count: options.length, fromIndex: from, toIndex: activeIndex, index,
    })));
    const frame = window.requestAnimationFrame(() => setFlip(null));
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, compact, instant, options.length]);

  const indicatorBox = compact
    ? viewPillIndicatorBox({ count: options.length, activeIndex, height: box?.height ?? 25 })
    : box;

  return (
    <div ref={wrapRef} role="tablist" aria-label={ariaLabel} data-test={testId}
      data-motion={instant ? "instant" : "travel"} data-compact={compact ? "icon" : "label"}
      className={`relative flex ${className}`}
      style={{ background: surface, borderRadius: 999, width: compact ? viewPillTrackWidth({ count: options.length }) : undefined, ...style }}>
      <LiquidPillIndicator T={T} box={indicatorBox} stretch={compact ? 1 : stretch} settled={compact ? !flip : settled} />
      {options.map(([key, label], index) => {
        const on = key === value;
        const Icon = compact ? icons?.[key] : null;
        return (
          <button key={String(key)} role="tab" aria-selected={on} aria-label={label}
            data-test={testId ? `${testId}-${key}` : undefined}
            data-active={on ? "true" : "false"}
            data-compact={compact && !on ? "icon" : "label"}
            onClick={(event) => pick(key, event)}
            className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} relative ${compact ? "py-1" : "px-3 py-1"} nb-label`}
            style={{
              color: on ? T.on : T.dim,
              borderRadius: 999,
              zIndex: 1,
              ...(compact ? {
                width: slots[index].width,
                display: "grid",
                gridTemplateColumns: `${VIEW_PILL_ICON}px ${VIEW_PILL_WORD}px`,
                alignItems: "center",
                justifyItems: "center",
                transform: flip ? `translate3d(${flip[index]}px,0,0)` : "none",
                transition: flip || instant ? "none" : "transform 200ms cubic-bezier(.23,1,.32,1), color 260ms ease",
              } : {
                transition: "color 260ms ease",
              }),
            }}>
            {Icon ? <Icon size={13} /> : null}
            <span data-test={testId ? `${testId}-label` : undefined}
              style={{
                whiteSpace: "nowrap",
                ...(compact ? {
                  justifySelf: "start",
                  clipPath: viewPillLabelClip(on),
                  opacity: on ? 1 : 0,
                  transition: instant ? "none" : "clip-path 200ms cubic-bezier(.23,1,.32,1), opacity 160ms ease 40ms",
                } : null),
              }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* §4.4/§4.6. The same expansion inside the task's grouped rules card, which reads as
   one block of rules with its icons on the right — so the choices cannot bring their
   own surface without breaking the group. */
function InlineChoiceRow({ T, icon, label, sub, options, value, onPick, dot = null, divider = false, editable = true, onBeginEdit = null, open: openProp = undefined, onToggle = null }) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (next) => {
    if (onToggle) onToggle(typeof next === "function" ? next(open) : next);
    else setUncontrolledOpen(next);
  };
  const optionsRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(optionsRef, [value, options.length, open]);
  useEffect(() => { if (!editable && openProp == null) setUncontrolledOpen(false); }, [editable, openProp]);
  return (
    <div style={{ borderBottom: divider ? `1px solid ${T.line}` : "none" }}>
      <button disabled={!editable} onClick={(event) => { if (!open) onBeginEdit?.(event.currentTarget); setOpen(!open); }} className="nb-tap nb-hover-control flex items-center gap-3 px-3 py-3 w-full text-left disabled:opacity-100">
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            {dot && <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: dot(value) }} />}
            <span className="block text-sm truncate">{label}</span>
          </span>
          {sub && <span style={{ color: T.dimText }} className="block text-xs mt-0.5">{sub}</span>}
        </span>
        {editable && <span style={{ color: T.dimText, transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms cubic-bezier(.2,.8,.25,1)" }}
          className="text-xs shrink-0">▾</span>}
        <span style={{ color: T.dimText }} className="text-sm shrink-0">{icon}</span>
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
                  className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} relative inline-flex items-center gap-1.5 px-2.5 py-1 nb-data`}
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
      <span style={{ color: T.dimText }} className="nb-data">{k}</span>
      <span className="nb-data">{v}</span>
    </div>
  );
}

function Sheet({ T, onClose, title, children, headerAction = null, beforeClose = null, morph = "auto", morphSurface = null, closeSignal = null }) {
  /* Ignore a backdrop dismissal that arrives in the same tap that opened the sheet.
     Belt and braces alongside preventDefault at the source: any future path that
     opens a sheet from a touch inherits the protection. */
  const openedAt = useRef(Date.now());
  const dialogRef = useRef(null);
  const contentRef = useRef(null);
  const openerRef = useRef(null);
  /* Capture before child layout effects run. Autofocus inside a sheet that is
     still translated onto its trigger will shove overflow ancestors; the
     snapshot is the page as it was, and the layout effect puts it back. */
  const pageScrollRef = useRef(null);
  if (pageScrollRef.current == null && typeof document !== "undefined") {
    pageScrollRef.current = snapshotAncestorScroll(document.documentElement);
  }
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
  const [morphStage, setMorphStage] = useState(morph === "notch" && morphSurface ? "source" : "open");
  const titleId = useRef(`sheet-title-${Math.random().toString(36).slice(2, 9)}`);
  const closeSignalRef = useRef(closeSignal);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { beforeCloseRef.current = beforeClose; }, [beforeClose]);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (beforeCloseRef.current && beforeCloseRef.current() === false) return;
    const panel = dialogRef.current;
    const reduced = typeof window !== "undefined" && (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || (panel && window.getComputedStyle(panel).animationName === "none")
    );
    let closeDuration = morphRef.current === "notch" ? MORPH_MS : 300;
    /* If someone dismisses while the source is still opening, reverse the same
       animation from its rendered position. Restarting a separate exit keyframe
       at a full-size sheet was the subtle snap behind the old close regression. */
    if (!reduced && morphRef.current === "notch" && panel) {
      const entry = panel.getAnimations().find((animation) => (
        animation.animationName === "nbnotchin" || animation.effect?.target === panel
      ));
      const duration = Number(entry?.effect?.getTiming().duration);
      const currentTime = Number(entry?.currentTime);
      const boundedTime = Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime)
        ? Math.max(0, Math.min(duration, currentTime))
        : null;
      const style = window.getComputedStyle(panel);
      const x = panel.style.getPropertyValue("--fluid-x");
      const y = panel.style.getPropertyValue("--fluid-y");
      const insetX = panel.style.getPropertyValue("--fluid-inset-x");
      const insetY = panel.style.getPropertyValue("--fluid-inset-y");
      if (x && y && insetX && insetY && typeof panel.animate === "function") {
        panel.dataset.fluidReverse = "true";
        /* Freeze exactly what is on screen before removing the CSS animation,
           then let WAAPI fold those compositor properties back to the trigger. */
        const from = { transform: style.transform, clipPath: style.clipPath };
        entry?.cancel();
        panel.style.animation = "none";
        panel.style.transform = from.transform;
        panel.style.clipPath = from.clipPath;
        panel.animate([
          from,
          {
            transform: `translate(${x}, ${y})`,
            clipPath: `inset(${insetY} ${insetX} round 999px)`,
          },
        ], {
          duration: boundedTime == null ? MORPH_MS : (boundedTime / duration) * MORPH_MS,
          easing: "cubic-bezier(.4,0,.3,1)",
          fill: "forwards",
        });
        closeDuration = boundedTime == null ? MORPH_MS : (boundedTime / duration) * MORPH_MS;
      }
    }
    closingRef.current = true;
    if (morphRef.current === "notch") setMorphStage("closing");
    setClosing(true);
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), reduced ? 0 : closeDuration);
  }, []);
  useEffect(() => {
    if (closeSignal == null || closeSignalRef.current === closeSignal) return;
    closeSignalRef.current = closeSignal;
    requestClose();
  }, [closeSignal, requestClose]);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;
    const measure = () => {
      const next = Math.min(content.scrollHeight, Math.round(window.innerHeight * .88));
      setSheetHeight(next);
      /* A notch sheet is mid-morph for its opening animation; letting height
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
    if (morph !== "notch" || !morphSurface) {
      setMorphStage("open");
      return undefined;
    }
    /* Geometry owns the first beat. Keep the trigger's label and accent until
       the clip has a real sheet to land in; handing off at 70ms left a hole
       where neither NEW nor the form was the visible material. */
    const panel = dialogRef.current;
    const reduced = typeof window !== "undefined" && (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || (panel && window.getComputedStyle(panel).animationName === "none")
    );
    if (reduced) {
      setMorphStage("open");
      return undefined;
    }
    setMorphStage("source");
    const stage = (next) => { if (!closingRef.current) setMorphStage(next); };
    /* Kept as the same fractions of the container's travel the 320ms version
       used — 56%, 69%, 100% — so stretching MORPH_MS moves these with it rather
       than leaving the handoff stranded at an absolute millisecond that no
       longer means anything in the new timeline. */
    const reveal = window.setTimeout(() => stage("reveal"), MORPH_MS * 0.56);
    const content = window.setTimeout(() => stage("content"), MORPH_MS * 0.69);
    const open = window.setTimeout(() => stage("open"), MORPH_MS);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(content);
      window.clearTimeout(open);
    };
  }, [morph, morphSurface?.id]);

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
    /* The pressed control is the origin — and the only one. There used to be a
       fallback to whatever held focus, which sounds harmless and is not: focus
       lands on a view tab, or stays on the last thing clicked, so a sheet opened
       from the keyboard grew out of a button that had nothing to do with it. A
       press is the only evidence that a particular control opened this; with no
       press, the sheet arrives on its own terms. */
    if (panel && morphRef.current === "none") {
      /* Search is a command palette. It is opened from the keyboard and the
         header hundreds of times a day, so it must not travel and it must not
         borrow a nearby control as an origin. */
      panel.dataset.fluidOrigin = "none";
    }
    const triggerRect = morphRef.current === "none" ? null : recentFluidTriggerRect();
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
      /* The shape the reveal starts from, not a scale to grow the panel by:
         animating a scale magnifies everything inside the panel — see
         fluidGeometry.js. */
      panel.style.setProperty("--fluid-inset-x", `${geometry.insetX}px`);
      panel.style.setProperty("--fluid-inset-y", `${geometry.insetY}px`);
    }
    const frame = window.requestAnimationFrame(() => {
      focusDialogOnOpen(dialogRef.current);
      applyScrollSnapshot(pageScrollRef.current);
    });
    /* Hold page chrome still for the length of the morph. Inner stream and
       ribbon scrollers are descendants, not ancestors, so they stay put. */
    const restorePageScroll = () => applyScrollSnapshot(pageScrollRef.current);
    restorePageScroll();
    window.addEventListener("scroll", restorePageScroll, true);
    const unlock = window.setTimeout(() => window.removeEventListener("scroll", restorePageScroll, true), 480);
    /* `nb-sheet-h` transitions height, and it used to switch on one frame into
       the notch's own 360ms morph — two curves animating the same box, which is
       the bounce. The height transition waits until the shape has finished
       arriving. */
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(unlock);
      window.removeEventListener("scroll", restorePageScroll, true);
      restoreDialogFocus(openerRef.current);
    };
  }, []);
  return (
    <div className={`nb-scrim ${closing ? "nb-fluid-closing" : ""} fixed inset-0 z-50 flex items-end sm:items-center justify-center`} style={{ background: "rgba(0,0,0,0.72)" }} onClick={guardedClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId.current} data-test="sheet" data-sheet-title={title || "Details"} data-morph-source={morphSurface?.id} data-morph-stage={morphStage}
        onKeyDown={(event) => trapDialogTab(event, dialogRef.current)} onClick={(e) => e.stopPropagation()}
        className={`nb-fluid nb-sheet-scroll ${heightReady ? "nb-sheet-h" : ""} ${closing ? "nb-fluid-closing" : ""} relative w-full sm:max-w-md overflow-y-auto nb-s`} style={{ backgroundColor: morph === "notch" && morphSurface && (morphStage === "source" || morphStage === "closing") ? morphSurface.background : T.card, color: T.text, maxHeight: "88vh", height: sheetHeight == null ? "auto" : sheetHeight, "--morph-accent": morph === "notch" && morphSurface ? morphSurface.background : "transparent", "--morph-card": T.card }}>
        {morph === "notch" && morphSurface && (
          <div aria-hidden="true" data-test="morph-source-label" className="nb-morph-source-label" style={{
            color: morphSurface.color,
            fontFamily: morphSurface.font,
          }}>
            {morphSurface.label}
          </div>
        )}
        <div ref={contentRef} className="nb-notch-body">
        <div className="sticky top-0 flex items-center justify-between px-4 sm:px-5 pt-3 pb-2" style={{ background: T.card, zIndex: 3 }}>
          <span id={titleId.current} style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">{title || "Details"}</span>
          <div className="flex items-center gap-1.5">
            {headerAction}
            <button onClick={requestClose} aria-label="Close" style={{ color: T.dimText, fontFamily: MONO }} className="nb-tap nb-hover-icon -mr-1 px-2 py-1 text-sm flex items-center justify-center"><CloseIcon /></button>
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
      {v.trim() && <button onClick={go} style={{ fontFamily: MONO, color: T.accentText }} className="nb-label">ADD</button>}
    </div>
  );
}

function SubComposer({ T, onAdd, autoFocus = false }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV(""); } };
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-3 h-3 shrink-0" style={{ boxShadow: `inset 0 0 0 1px ${T.faint}` }} />
      <input autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Add a step" style={{ background: "transparent", border: "none" }} className="flex-1 text-xs py-0.5" />
      {v.trim() && <button onClick={go} style={{ fontFamily: MONO, color: T.accentText }} className="nb-label">ADD</button>}
    </div>
  );
}

/* §10.2. History is browsable, not just recorded. A revision that no longer matches
   its own checksum is shown but cannot be restored — putting damaged text back in
   place of a good document would be worse than losing the snapshot. */
function NoteHistory({ T, clock, revisions, onRestore }) {
  if (!revisions.length) {
    return <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice py-4">No earlier versions yet. Every save from here keeps one.</p>;
  }
  return (
    <div className="flex flex-col">
      <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice pb-3">
        {revisions.length === 1 ? "One earlier version" : `${revisions.length} earlier versions`}, newest first. Going back keeps the current one too.
      </p>
      {revisions.map((r) => {
        const intact = revisionIsIntact(r);
        const stamp = r.at ? `${fmtDay(r.at.slice(0, 10))} · ${fmtTime(Number(r.at.slice(11, 13)) * 60 + Number(r.at.slice(14, 16)), clock)}` : "UNDATED";
        return (
          <div key={r.id} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0 w-10 tabular-nums">v{r.revision}</span>
            <div className="flex-1 min-w-0">
              <p style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">{stamp}</p>
              <p style={{ fontFamily: SERIF }} className="nb-voice truncate">
                {r.blocks.map((b) => plainText(b.text)).filter(Boolean).join(" · ") || "Empty page"}
              </p>
            </div>
            {intact
              ? <button onClick={() => onRestore(r)} style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-label shrink-0">GO BACK</button>
              : <span style={{ fontFamily: MONO, color: NOW_RED }} className="nb-label shrink-0">DAMAGED</span>}
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
        <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">
          NOTES · {notes.length}
        </span>
        <button onClick={onNew} style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-hover-control nb-data">+ NEW NOTE</button>
      </div>
      {notes.length === 0 ? (
        <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-2">Keep the thinking beside this {kind}, not inside a field it will outgrow.</p>
      ) : (
        <div className="flex flex-col mt-2">
          {notes.map((note, index) => (
            <button key={note.id} onClick={() => onOpen(note)} className="nb-tap nb-row nb-hover-tile nb-list-enter text-left py-2.5" style={{ borderBottom: `1px solid ${T.line}`, "--nb-list-index": Math.min(index, 4) }}>
              <span className="block text-sm truncate">{note.title || noteExcerpt(note, 90) || "Untitled note"}</span>
              <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mt-0.5">
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
        <button onClick={onNew} style={{ fontFamily: MONO, color: T.on, background: T.accent }} className="nb-tap nb-liquid nb-hover-control w-full py-3 mt-4 text-xs font-bold tracking-widest">+ NEW NOTE</button>
      )}
      <div className="flex flex-col mt-3">
        {notes.map((note, index) => (
          <div key={note.id} className="nb-list-enter flex items-center gap-2 py-3" style={{ borderBottom: `1px solid ${T.line}`, "--nb-list-index": Math.min(index, 4) }}>
            <button onClick={() => onOpen(note)} className="nb-tap nb-row nb-hover-tile text-left flex-1 min-w-0">
              <span className="block text-sm truncate">{note.title || noteExcerpt(note, 100) || "Untitled note"}</span>
              <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mt-0.5 truncate">
                {noteContextLabel(note)}{note.pinned ? " · PINNED" : ""}
              </span>
            </button>
            {view !== "archived" && <button onClick={() => onPin(note)} aria-label={note.pinned ? "Unpin note" : "Pin note"}
              style={{ color: note.pinned ? T.accent : T.dim }} className="nb-tap nb-hover-icon p-2 text-sm flex items-center justify-center"><PinIcon filled={note.pinned} /></button>}
            <button onClick={() => onArchive(note)} aria-label={note.archived ? "Restore note" : "Archive note"}
              style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control p-2 nb-data">{note.archived ? "RESTORE" : "ARCHIVE"}</button>
          </div>
        ))}
        {notes.length === 0 && <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice py-6 text-center">
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
  /* Which template this note was started from, carried to the save so the record
     says where it came from. The note model has stored this since v8; until now
     nothing could set it, because nothing could offer a template. */
  const [provenance, setProvenance] = useState(() => note.templateProvenance ?? null);
  useEffect(() => {
    setV(blocksToShorthand(note.blocks ?? []));
    setTitle(note.title ?? "");
    setProvenance(note.templateProvenance ?? null);
  }, [note.id]);
  const canSave = Boolean(title.trim() || v.trim());
  /* Offered on a blank page only. A template is a way to start, not a way to
     restructure something already written — applying one to an existing note
     would either overwrite it or need a merge nobody asked for. */
  const templates = useMemo(() => (note.id ? [] : listBuiltInNoteTemplates()), [note.id]);
  const startFrom = (template) => {
    const started = instantiateBuiltInNoteTemplate(template.id, { createBlockId: uid });
    setV(blocksToShorthand(started.blocks));
    /* The blank template genuinely means blank: no provenance to record, because
       "started from nothing" is what every note without one already says. */
    setProvenance(started.blocks.length ? started.templateProvenance : null);
    if (started.title) setTitle(started.title);
  };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">{note.id ? "EDIT NOTE" : "NEW NOTE"}</span>
        <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data truncate">{noteContextLabel(note)}</span>
        {history > 0 && <button onClick={onHistory} style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-data shrink-0">HISTORY · {history}</button>}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled"
        style={{ background: "transparent", borderBottom: `1px solid ${T.line}`, fontFamily: DISPLAY, width: "100%" }} className="text-xl font-semibold py-3 mt-2" />
      {templates.length > 0 && (
        <div data-test="note-templates" className="flex flex-wrap gap-1.5 mt-3">
          {templates.map((template) => {
            const on = provenance?.id === template.id;
            return (
              <button key={template.id} data-test={`note-template-${template.id}`} onClick={() => startFrom(template)}
                style={{
                  fontFamily: MONO, borderRadius: 999,
                  background: on ? T.accent : "transparent", color: on ? T.on : T.dim,
                  border: `1px solid ${on ? T.accent : T.line}`,
                }} className="nb-tap px-2.5 py-1 nb-data">
                {template.name.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
      <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={6} placeholder="Write it down.&#10;&#10;# Heading   - list   [ ] to-do   > quote&#10;**bold**  *italic*  `code`"
        style={{ background: "transparent", border: `1px solid ${T.line}`, fontFamily: SERIF, resize: "none", width: "100%" }} className="nb-voice leading-relaxed p-3 mt-3" />
      {note.id && <div className="flex gap-2 mt-3">
        <button onClick={onPin} style={{ fontFamily: MONO, color: note.pinned ? T.accent : T.dim, border: `1px solid ${T.line}` }} className="nb-tap flex-1 py-2 nb-data">{note.pinned ? "UNPIN" : "PIN"}</button>
        <button onClick={onArchive} style={{ fontFamily: MONO, color: T.dimText, border: `1px solid ${T.line}` }} className="nb-tap flex-1 py-2 nb-data">{note.archived ? "RESTORE" : "ARCHIVE"}</button>
      </div>}
      <div className="flex gap-2 mt-3">
        {note.id && <button onClick={onDelete} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap flex-1 py-3 nb-label">DELETE</button>}
        <button onClick={() => canSave && onSave(v.trim(), title.trim(), provenance)} disabled={!canSave} style={{ fontFamily: MONO, background: canSave ? T.accent : "transparent", color: canSave ? T.on : T.dim, border: `1px solid ${canSave ? T.accent : T.faint}` }} className="nb-tap flex-1 py-3 text-xs font-bold tracking-widest">SAVE</button>
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
  const inputRef = useRef(null);
  /* A new query is a new list; keeping the old index would leave the highlight
     on whatever happened to slide into that position. */
  useEffect(() => { setActive(0); }, [query, rows.length]);
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const clamp = (index) => (rows.length ? (index + rows.length) % rows.length : 0);
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => clamp(i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => clamp(i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); rows[active]?.run(); }
  };

  useEffect(() => {
    const row = listRef.current?.querySelector('[data-active="true"]');
    scrollChildIntoContainer(row, row?.closest(".nb-sheet-scroll") ?? listRef.current);
  }, [active]);

  let lastGroup = null;
  return (
    <div>
      <input ref={inputRef} data-test="palette-input" value={query} onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown} placeholder={placeholder} aria-label="Search or run a command"
        style={{ background: "transparent", border: `1px solid ${T.line}` }} className="w-full px-3 py-3 text-base font-semibold" />
      {footer && <p style={{ fontFamily: MONO, color: T.dimText }} className="nb-data pt-2">{footer}</p>}
      <div ref={listRef} className="mt-3 flex flex-col" data-test="palette-rows">
        {queryIssues.length > 0 && <p style={{ fontFamily: MONO, color: T.dimText }} className="nb-data py-2">IGNORED FILTER · {queryIssues[0].token.toUpperCase()}</p>}
        {query && rows.length === 0 && <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice py-4">Nothing matches that. Try a shorter word.</p>}
        {rows.map((row, index) => {
          const header = row.group !== lastGroup ? row.group : null;
          lastGroup = row.group;
          const on = index === active;
          return (
            <React.Fragment key={row.key}>
              {header && <p style={{ fontFamily: MONO, color: T.dimText }} className="nb-data pt-3 pb-1">{header}</p>}
              <button data-test={row.testId} data-active={on} onClick={row.run} onMouseEnter={() => setActive(index)}
                className="nb-row flex items-center gap-2 py-2.5 px-2 text-left" style={{
                  borderBottom: `1px solid ${T.line}`,
                  background: on ? surface : "transparent",
                  borderRadius: on ? 8 : 0,
                }}>
                <span style={{ fontFamily: MONO, color: row.tint ?? T.dim }} className="nb-data shrink-0 w-12">{row.badge}</span>
                <span className="flex-1 text-sm truncate">{row.label}</span>
                {row.meta && <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">{row.meta}</span>}
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
            {header && <p style={{ fontFamily: MONO, color: T.dimText }} className="nb-data pt-4 pb-1">{header}</p>}
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
      <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice pt-4">
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
      <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice pb-2">
        Type a whole line and it will be read as one — “Lunch w/ Sara Tue 1pm 45m”.
      </p>
      <div className="flex flex-col gap-0.5">
        {QUICK_ADD_SYNTAX.map((entry) => (
          <div key={entry.token} className="flex items-baseline gap-2">
            <span style={{ fontFamily: MONO, color: T.accentText }} className="text-xs shrink-0 w-44 truncate">{entry.token}</span>
            <span style={{ color: T.dimText }} className="text-xs">{entry.means}</span>
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
    onSubmit({ id: initial.id, date: unplanned && kind === "task" ? null : date, unplanned, kind, title: title.trim(), cat, start: allDay ? 0 : start, dur: allDay ? 0 : len, xp, place, link: normalizeMeetingLink(link), note, at, estimate, due: due || null, allDay, endDate, alerts, repeat: repeat && repeat.freq ? repeat : null, recurrence, timing });
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
    <div data-test="composer" data-composer-kind={kind} className="nb-notch-cascade">
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
        <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mt-1.5">
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
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">FROM</span>
                <input aria-label="Start time" type="time" step={60} value={toTime(start)} onChange={(e) => e.target.value && setStart(fromTime(e.target.value))}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                <span style={{ color: T.dimText }} className="text-sm">&#8594;</span>
                <input aria-label="End time" type="time" step={60} value={endLocal.slice(11)} onChange={(e) => {
                  if (!e.target.value) return;
                  setLen(durationFromClockRange(start, fromTime(e.target.value)));
                }} style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data ml-auto shrink-0">{dur(len)}</span>
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
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">ON</span>
                <input aria-label="Action date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm flex-1" />
              </div>
            )}
          </>
        )}

        <Chips T={T} surface={surface} value={cat} onChange={(v) => { onTick(); setCat(v); }}
          options={CATS.map((c) => [c, c])} dot={catColor} wrap />
      </div>

      <button onClick={() => { onTick(); setMore(!more); }}
        style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap w-full py-3 nb-data">
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
              <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">THROUGH</span>
              <input aria-label="Last event day" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)}
                style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm flex-1" />
            </div>
          )}
          {kind === "event" && !initial.instance && (
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
              <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">ON</span>
                <input aria-label="Event day" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
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
                <span style={{ fontFamily: MONO, color: NOW_RED }} className="px-1 nb-label">DOESN'T LOOK LIKE A LINK</span>
              )}
            </>
          ) : (
            <>
              <Chips T={T} surface={surface} label="REWARD" value={xp} onChange={(v) => { onTick(); setXp(v); }}
                options={[[30, "+30"], [40, "+40"], [50, "+50"], [60, "+60"]]} />
              <DurationPicker T={T} label="ESTIMATE" value={estimate} onPick={(value) => { onTick(); setEstimate(value); }} />
              {!unplanned && (
                <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R }}>
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">AT</span>
                  <input aria-label="Action time" type="time" step={60} value={at != null ? toTime(at) : ""} onChange={(e) => setAt(e.target.value ? fromTime(e.target.value) : null)}
                    style={{ background: "transparent", border: "none", fontFamily: MONO }} className="text-sm" />
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0 ml-auto">DUE</span>
                  <input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)}
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
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">EVERY</span>
                <input type="number" min={1} max={30} value={repeat.interval || 1}
                  onChange={(e) => setRepeat({ ...repeat, interval: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ background: "transparent", border: "none", fontFamily: MONO }} className="w-12 text-sm" />
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">
                  {repeat.freq === "daily" ? "DAYS" : repeat.freq === "weekly" ? "WEEKS" : repeat.freq === "monthly" ? "MONTHS" : "YEARS"}
                </span>
                <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label ml-auto">UNTIL</span>
                <input aria-label="Repeat until" type="date" value={repeat.until || ""} onChange={(e) => setRepeat({ ...repeat, until: e.target.value })}
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
                        onClick={() => toggleDay(i)} className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} relative flex-1 py-1 nb-data`}
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
            className="w-full px-3 py-2.5 nb-voice" />
        </div>
      </div>

      <button onClick={submit} disabled={!ok} className="nb-tap nb-liquid nb-hover-control w-full py-3 mt-2 text-xs font-bold tracking-widest"
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
      {label && <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mb-1">{label}</span>}
      <div ref={wrapRef} className={`relative flex gap-1 ${wrap ? "flex-wrap" : ""}`}>
        {/* Keep the traveling fill behind the control layer. The fill is a visual
            surface; it must never become the paint layer that covers a tile label. */}
        {!multi && <LiquidPillIndicator T={T} box={box} stretch={stretch} settled={settled} z={0} />}
        {options.map(([key, text]) => {
          const on = selected(key);
          return (
            <button key={String(key)} onClick={() => pick(key)} data-active={!multi && on ? "true" : "false"}
              className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} relative ${wrap ? "" : "flex-1"} inline-flex items-center justify-center gap-1.5 px-3 py-2 nb-data`}
              style={{
                fontFamily: MONO, borderRadius: 999,
                zIndex: 1,
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
