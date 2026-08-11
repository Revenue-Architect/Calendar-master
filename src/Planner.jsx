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
import {
  fluidMorphFromRects,
  fluidPillBox,
  fluidPillStretch,
} from "./features/motion/fluidGeometry.js";
import { progressSegmentStates } from "./features/motion/progressGeometry.js";
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• TOKENS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

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

/* Â§4.6/Â§4.7. The frequencies an entry can be set to from its own detail view. The
   fuller rule â€” selected weekdays, an end date, a count â€” still belongs to the
   composer, which has the room to explain it. */
const REPEATS = [["never", "NEVER"], ["daily", "DAILY"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"]];

/* Changing the frequency keeps whatever else the rule already said, so switching
   weekly â†’ monthly and back does not quietly drop an end date. */
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
   holds, rather than being tinted per theme â€” a category keeps the same colour
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
   times â€” and at that distance the marker *is* the hour, so there is nothing
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
  { group: "MOVING", keys: ["â†", "â†’"], does: "Previous / next day" },
  { group: "MOVING", keys: ["T"], does: "Jump to today" },
  { group: "MOVING", keys: ["["], does: "Zoom out â€” day, week, month" },
  { group: "MOVING", keys: ["]"], does: "Zoom in" },
  { group: "MAKING", keys: ["N"], does: "New event" },
  { group: "MAKING", keys: ["A"], does: "New action" },
  { group: "MAKING", keys: ["âŒ˜K", "/"], does: "Search, run a command, or type to create" },
  { group: "ACTIONS", keys: ["C"], does: "Complete the first open action" },
  { group: "ACTIONS", keys: ["D"], does: "Defer the first open action by a day" },
  { group: "ELSEWHERE", keys: ["âŒ˜Z"], does: "Undo the last change" },
  { group: "ELSEWHERE", keys: ["?"], does: "This list" },
  { group: "ELSEWHERE", keys: ["Esc"], does: "Close whatever is open" },
];

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const SERIF = "Georgia, Cambria, Times New Roman, serif";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• UTILS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const pad = (n) => String(n).padStart(2, "0");
const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WD1 = ["S", "M", "T", "W", "T", "F", "S"];
const MO = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/* The clock is a display choice, never a stored one â€” minutes since midnight stay
   the single representation, so switching format can never move an event. */
const h12 = (h) => (h % 12 === 0 ? 12 : h % 12);
const meridiem = (h) => (h < 12 ? "AM" : "PM");
const fmtTime = (m, clock) => {
  const hour = Math.floor(m / 60) % 24;
  const minute = Math.round(m) % 60;
  if (clock === "24") return `${pad(hour)}:${pad(minute)}`;
  return `${h12(hour)}:${pad(minute)} ${meridiem(hour)}`;
};
/* The rail drops ":00" â€” an hour label is a ruler mark, not a timestamp. */
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
   23:53 rounded up to it and built "â€¦T24:00", which the time model rejects â€” from
   inside render, so the whole page went blank. A new entry begins in the last slot
   the day actually has. */
const startSlot = (m, s = 15) => Math.min(snapTo(m, s), 1440 - s);
/* The wire form a native time input speaks, independent of the 12/24 display clock. */
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fromHhmm = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const buzzDevice = (p) => { try { navigator.vibrate×O:ßËh‘éì¶»§q«^vÃBˆYˆ
Ú[™OOH™]™[ˆ\™XÝ\œ™[˜ÙH[ÚÊH™]\›ˆ×NÃBˆžHÃBˆ™]\›ˆ™]šY]Ô™XÝ\œ™[˜ÙJÈYˆœ™]šY]È‹]Nˆ]Kš[J
KØ[[™\’Yˆ˜Ø[[™\‹YY˜][‹[Z[™Ë™XÝ\œ™[˜ÙHKJNÃBˆHØ]ÚÈ™]\›ˆ×NÈCBˆKÚÚ[™™XÝ\œ™[˜ÙH	‰ˆ”ÓÓ‹œÝš[™ÚYžJ™XÝ\œ™[˜ÙJK”ÓÓ‹œÝš[™ÚYžJ[Z[™ÊKÚ×JNÃBˆÛÛœÝÝX›Z]H

HOˆÃBˆYˆ
[ÚÊH™]\›ŽÃBˆÛ”ÝX›Z]
ÈYˆ[š]X[šY]Nˆ[œ[›™Y	‰ˆÚ[™OOH\ÚÈˆÈ[ˆ]K[œ[›™YÚ[™]Nˆ]Kš[J
KØ]Ý\ˆ[^HÈˆÝ\\Žˆ[^HÈˆ[‹XÙK[šÎˆ›Ü›X[^™SYY][™Ó[šÊ[šÊH[šËš[J
K›ÝK]\Ý[X]KYNˆYH[[^K[™]K[\Ë™\X]ˆ™\X]	‰ˆ™\X]™œ™\HÈ™\X]ˆ[™XÝ\œ™[˜ÙK[Z[™ÈJNÃBˆNÃBˆÛÛœÝÕ[YHH
JHOˆ	ÜY
X]™›ÛÜŠHÈŒ
J_N‰ÜY
H	HŒ
_XÃBˆÛÛœÝœ›ÛU[YHH
ÊHOˆÈÛÛœÝÚWHHËœÜ]
ŽˆŠK›X\
[X™\ŠNÈ™]\›ˆ
ˆŒ
ÈNÈNÃBˆÛÛœÝÙ]œ™\HH
ŠHOˆÈÛ•XÚÊ
NÈÙ]™\X]
ˆÈÈœ™\Nˆ‹[\˜[ˆKžQ^NˆˆOOHÙYZÛHˆÈÜ\œÙRÙ^J]JK™Ù]^J
WHˆ[™Yš[™Y[[ˆ
™\X]	‰ˆ™\X][[
Hˆ‹[™[ÙNˆ›™]™\ˆ‹Z\ÜÚ[™Ñ]TÛXÞNˆœÚÚ\ˆHˆ[
NÈNÃBˆÛÛœÝÙÙÛQ^HH
JHOˆÃBˆÛ•XÚÊ
NÃBˆÛÛœÝ^\ÈH
™\X]˜žQ^H×JKš[˜ÛY\ÊJHÈ™\X]˜žQ^K™š[\Š

HOˆOOHJHˆË‹‹Š™\X]˜žQ^H×JKWKœÛÜ

NÃBˆÙ]™\X]
È‹‹œ™\X]žQ^Nˆ^\ÈJNÃBˆNÃBƒBˆ™]\›ˆ
Bˆ]ˆ]K]\ÝH˜ÛÛ\ÜÙ\ˆˆ]KXÛÛ\ÜÙ\‹ZÚ[™^ÚÚ[™OƒBˆÈYY][™È	‰ˆ
Bˆ[˜]ˆ^ÕH\šXSX™[H•Ú]ÈYˆ˜[YO^ÚÚ[™CBˆÜ[ÛœÏ^ÖÖÈ™]™[‹‘U‘S•—KÈ\ÚÈ‹PÕSÓˆ—W_CBˆÛ”XÚÏ^ÊÊHOˆÈÛ•XÚÊ
NÈÙ]Ú[™
ÊNÈ_CBˆÝ\™˜XÙO^ÜÝ\™˜XÙ_HÛ\ÜÓ˜[YOH›X‹LHLHËY[É˜]Û—N™›^LHÉ˜]Û—NœKLKHˆÏƒBˆ
_CBƒBˆ]ˆÛ\ÜÓ˜[YO^Ø	ÚÚ[™OOH™]™[ˆÈ^XÙ[\ˆˆˆˆŸHLÈ‹MOƒBˆ[œ]]]Ñ›ØÝ\È˜[YO^Ý]_HÛÚ[™ÙO^ÊJHOˆÙ]]JK\™Ù]˜[YJ_HÛ’Ù^QÝÛ^ÊJHOˆÈYˆ
KšÙ^HOOH‘[\ˆŠHÝX›Z]

NÈ_CBˆXÙZÛ\^ÚÚ[™OOH™]™[ˆÈ•Ú]	ÜÈ\[š[™ÏÈˆˆ•Ú]Ù]Èš[š\ÚYÈŸCBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™Hˆ_CBˆÛ\ÜÓ˜[YO^ØËY[^Lž›ÛX›Û˜XÚÚ[™Ë]YÚXY[™Ë]YÚ	ÚÚ[™OOH™]™[ˆÈ^XÙ[\ˆˆˆˆŸXHÏƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH˜›ØÚÈ^^È˜XÚÚ[™Ë]ÚY\Ý]LKHƒBˆÙY][™ÈÈ‘QUS‘Èˆˆ]SX™[CBˆÜÜ[ƒBˆÙ]ƒBƒBˆËÊˆÛ›HÚ]H[žHØ[››Ý^\ÝÚ]Ý]ˆ]™\ž][™È[ÙHØZ]È™Z[™Bˆ“[Ü™HÜ[ÛœÈ‹ÛÈY[™ÈH[™È\ÈÛ™HXÚ\Ú[Ûˆ[™™Yš[š[™È]\È[›Ý\‹ˆ
‹ßCBˆ]ˆÛ\ÜÓ˜[YOH™›^›^XÛÛØ\LˆƒBˆÚÚ[™OOH™]™[ˆÈ
BˆƒBˆÚ\È^ÕHÝ\™˜XÙO^ÜÝ\™˜XÙ_H˜[YO^Ø[^HÈ˜[ˆˆ[YYŸHÛÚ[™ÙO^ÊŠHOˆÈÛ•XÚÊ
NÈÙ][^JˆOOH˜[ŠNÈ_CBˆÜ[ÛœÏ^ÖÖÈ[YY‹UHSQH—KÈ˜[‹SVH—W_HÏƒBˆÈX[^H	‰ˆ
Bˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LˆLÈKL‹HˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÝ\™˜XÙK›Ü™\”˜Y]\ÎˆÐT‘Ôˆ_OƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\ÝÚš[šËL‘”“ÓOÜÜ[ƒBˆ[œ]\OH[YHˆÝ\^ÍŒH˜[YO^ÝÕ[YJÝ\
_HÛÚ[™ÙO^ÊJHOˆK\™Ù]˜[YH	‰ˆÙ]Ý\
œ›ÛU[YJK\™Ù]˜[YJJ_CBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™H‹›Û˜[Z[NˆSÓ“È_HÛ\ÜÓ˜[YOH^\ÛHˆÏƒBˆÜ[ˆÝ[O^ÞÈÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^\ÛH‰ˆÎNMÏÜÜ[ƒBˆ[œ]\OH[YHˆÝ\^ÍŒH˜[YO^Ù[™ØØ[œÛXÙJLJ_HÛÚ[™ÙO^ÊJHOˆÃBˆYˆ
YK\™Ù]˜[YJH™]\›ŽÃBˆÙ][Š\˜][Û‘œ›ÛPÛØÚÔ˜[™ÙJÝ\œ›ÛU[YJK\™Ù]˜[YJJJNÃBˆ_HÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™H‹›Û˜[Z[NˆSÓ“È_HÛ\ÜÓ˜[YOH^\ÛHˆÏƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\Ý[X]]ÈÚš[šËLžÙ\Š[Š_OÜÜ[ƒBˆÙ]ƒBˆ
_CBˆÈX[^H	‰ˆ
BˆÚ\È^ÕHÝ\™˜XÙO^ÜÝ\™˜XÙ_H˜[YO^Û[ŸHÛÚ[™ÙO^ÊŠHOˆÈÛ•XÚÊ
NÈÙ][ŠŠNÈ_CBˆÜ[ÛœÏ^ÖÖÌÌŒÌH—KÍŒŒR—KÎLŒRÌ—KÌLŒŒ’—W_HÏƒBˆ
_CBˆÏƒBˆ
Hˆ
BˆƒBˆÚ\È^ÕHÝ\™˜XÙO^ÜÝ\™˜XÙ_H˜[YO^Ý[œ[›™YÈš[˜›Þˆˆ™^HŸHÛÚ[™ÙO^ÊŠHOˆÈÛ•XÚÊ
NÈÙ][œ[›™Y
ˆOOHš[˜›ÞŠNÈ_CBˆÜ[ÛœÏ^ÖÖÈ™^H‹“ÓˆHVH—KÈš[˜›Þ‹’S“Ö—W_HÏƒBˆÈ][œ[›™Y	‰ˆ
Bˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LˆLÈKL‹HˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÝ\™˜XÙK›Ü™\”˜Y]\ÎˆÐT‘Ôˆ_OƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\ÝÚš[šËL“ÓÜÜ[ƒBˆ[œ]\OH™]Hˆ˜[YO^Ù]_HÛÚ[™ÙO^ÊJHOˆK\™Ù]˜[YH	‰ˆÙ]]JK\™Ù]˜[YJ_CBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™H‹›Û˜[Z[NˆSÓ“È_HÛ\ÜÓ˜[YOH^\ÛH›^LHˆÏƒBˆÙ]ƒBˆ
_CBˆÏƒBˆ
_CBƒBˆÚ\È^ÕHÝ\™˜XÙO^ÜÝ\™˜XÙ_H˜[YO^ØØ]HÛÚ[™ÙO^ÊŠHOˆÈÛ•XÚÊ
NÈÙ]Ø]
ŠNÈ_CBˆÜ[ÛœÏ^ÐÐUË›X\

ÊHOˆØË×J_HÝ^ØØ]ÛÛÜŸHÜ˜\ÏƒBˆÙ]ƒBƒBˆ]ÛˆÛÛXÚÏ^Ê
HOˆÈÛ•XÚÊ
NÈÙ][Ü™J[[Ü™JNÈ_CBˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH›˜‹]\ËY[KLÈ^^È˜XÚÚ[™Ë]ÚY\ÝƒBˆÛ[Ü™HÈ‘‘UÑTˆÔSÓ”Èˆˆ“SÔ‘HÔSÓ”ÈŸCBˆØ]ÛƒBƒBˆ]ˆ]K[[Ü™K\[™[Ý[O^ÞÃBˆX^ZYÚˆ[Ü™HÈMŒˆBˆÜXÚ]Nˆ[Ü™HÈHˆBˆÝ™\™›ÝÎˆšY[ˆ‹Bˆ˜[œÚ][ÛŽˆ›X^ZZYÚÎ\ÈÝXšXËX™^šY\ŠŒ‹ŽŒKJKÜXÚ]H\ÈX\ÙH‹Bˆ_OƒBˆ]ˆÛ\ÜÓ˜[YOH™›^›^XÛÛØ\Lˆ‹LHƒBˆÚÚ[™OOH™]™[ˆ	‰ˆ[^H	‰ˆ
Bˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LˆLÈKL‹HˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÝ\™˜XÙK›Ü™\”˜Y]\ÎˆÐT‘Ôˆ_OƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\ÝÚš[šËL•“ÕQÒÜÜ[ƒBˆ[œ]\OH™]Hˆ˜[YO^Ù[™]_HZ[^Ù]_HÛÚ[™ÙO^ÊJHOˆÙ][™]JK\™Ù]˜[YJ_CBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™H‹›Û˜[Z[NˆSÓ“È_HÛ\ÜÓ˜[YOH^\ÛH›^LHˆÏƒBˆÙ]ƒBˆ
_CBˆÚÚ[™OOH™]™[ˆ	‰ˆZ[š]X[š[œÝ[˜ÙH	‰ˆ
Bˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LˆLÈKL‹HˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÝ\™˜XÙK›Ü™\”˜Y]\ÎˆÐT‘Ôˆ_OƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\ÝÚš[šËL“ÓÜÜ[ƒBˆ[œ]\OH™]Hˆ˜[YO^Ù]_HÛÚ[™ÙO^ÊJHOˆK\™Ù]˜[YH	‰ˆÙ]]JK\™Ù]˜[YJ_CBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™H‹›Û˜[Z[NˆSÓ“È_HÛ\ÜÓ˜[YOH^\ÛH›^LHˆÏƒBˆÙ]ƒBˆ
_CBƒBˆÚÚ[™OOH™]™[ˆÈ
BˆƒBˆÚ\È^ÕHÝ\™˜XÙO^ÜÝ\™˜XÙ_HX™[H”‘SRS‘QHˆ][H˜[YO^Ø[\ßCBˆÛÚ[™ÙO^ÊŠHOˆÈÛ•XÚÊ
NÈÙ][\ÊŠNÈ_CBˆÜ[ÛœÏ^ÐST•ÐÒÒPÑTË›X\

JHOˆØKHOOHÈUSQHˆˆ	Ø_SXJ_HÜ˜\ÏƒBˆ[œ]˜[YO^ÜXÙ_HÛÚ[™ÙO^ÊJHOˆÙ]XÙJK\™Ù]˜[YJ_HXÙZÛ\H•Ú\™HƒBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÝ\™˜XÙK›Ü™\Žˆ››Û™H‹›Ü™\”˜Y]\ÎˆÐT‘Ôˆ_HÛ\ÜÓ˜[YOHËY[LÈKL‹H^\ÛHˆÏƒBˆ[œ]˜[YO^Û[šßHÛÚ[™ÙO^ÊJHOˆÙ][šÊK\™Ù]˜[YJ_HXÙZÛ\H“YY][™È[šÈ8 %YY]›ÛÛKX[\ø )ˆˆ[œ][ÙOH\›ƒBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÝ\™˜XÙK›Ü™\Žˆ››Û™H‹›Ü™\”˜Y]\ÎˆÐT‘Ôˆ_HÛ\ÜÓ˜[YOHËY[LÈKL‹H^\ÛHˆÏƒBˆÈ[[šÓÚÈ	‰ˆ
BˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ“Õ×Ô‘Q_HÛ\ÜÓ˜[YOHœLH^^È˜XÚÚ[™Ë]ÚY\Ý‘ÑTÓ‰ÕÓÒÈRÑHHS’ÏÜÜ[ƒBˆ
_CBˆÏƒBˆ
Hˆ
BˆƒBˆÚ\È^ÕHÝ\™˜XÙO^ÜÝ\™˜XÙ_HX™[H”‘UÐT‘ˆ˜[YO^ÞHÛÚ[™ÙO^ÊŠHOˆÈÛ•XÚÊ
NÈÙ]
ŠNÈ_CBˆÜ[ÛœÏ^ÖÖÌÌŠÌÌ—KÍŠÍ—KÍLŠÍL—KÍŒŠÍŒ—W_HÏƒBˆ\˜][Û”XÚÙ\ˆ^ÕHX™[H‘TÕSPUHˆ˜[YO^Ù\Ý[X]_HÛ”XÚÏ^Ê˜[YJHOˆÈÛ•XÚÊ
NÈÙ]\Ý[X]J˜[YJNÈ_HÏƒBˆÈ][œ[›™Y	‰ˆ
Bˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LˆLÈKL‹HˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÝ\™˜XÙK›Ü™\”˜Y]\ÎˆÐT‘Ôˆ_OƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\ÝÚš[šËLUÜÜ[ƒBˆ[œ]\OH[YHˆÝ\^ÍŒH˜[YO^Ø]OH[ÈÕ[YJ]
HˆˆŸHÛÚ[™ÙO^ÊJHOˆÙ]]
K\™Ù]˜[YHÈœ›ÛU[YJK\™Ù]˜[YJHˆ[
_CBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™H‹›Û˜[Z[NˆSÓ“È_HÛ\ÜÓ˜[YOH^\ÛHˆÏƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\ÝÚš[šËL[X]]È‘QOÜÜ[ƒBˆ[œ]\OH™]Hˆ˜[YO^ÙY_HÛÚ[™ÙO^ÊJHOˆÙ]YJK\™Ù]˜[YJ_CBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™H‹›Û˜[Z[NˆSÓ“È_HÛ\ÜÓ˜[YOH^\ÛHˆÏƒBˆÙ]ƒBˆ
_CBˆÏƒBˆ
_CBƒBˆÚ\È^ÕHÝ\™˜XÙO^ÜÝ\™˜XÙ_HX™[H”‘TPUÈˆ˜[YO^Ü™\X]È™\X]™œ™\HˆˆŸCBˆÛÚ[™ÙO^ÊŠHOˆÙ]œ™\JŠ_CBˆÜ[ÛœÏ^ÖÖÈˆ‹“ÓÑH—KÈ™Z[H‹‘RSH—KÈÙYZÛH‹•ÑQRÓH—KÈ›[ÛH‹“SÓ•H—KÈžYX\›H‹–QPT“H—W_HÜ˜\ÏƒBƒBˆÜ™\X]	‰ˆ
Bˆ]ˆÛ\ÜÓ˜[YOH™›^›^XÛÛØ\LˆLÈKL‹HˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÝ\™˜XÙK›Ü™\”˜Y]\ÎˆÐT‘Ôˆ_OƒBˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LˆƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\Ý‘U‘T–OÜÜ[ƒBˆ[œ]\OH›[X™\ˆˆZ[^Ì_HX^^ÌÌH˜[YO^Ü™\X]š[\˜[_CBˆÛÚ[™ÙO^ÊJHOˆÙ]™\X]
È‹‹œ™\X][\˜[ˆX]›X^
K[X™\ŠK\™Ù]˜[YJHJHJ_CBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™H‹›Û˜[Z[NˆSÓ“È_HÛ\ÜÓ˜[YOHËLLˆ^\ÛHˆÏƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\ÝƒBˆÜ™\X]™œ™\HOOH™Z[HˆÈ‘VTÈˆˆ™\X]™œ™\HOOHÙYZÛHˆÈ•ÑQRÔÈˆˆ™\X]™œ™\HOOH›[ÛHˆÈ“SÓ•Èˆˆ–QPT”ÈŸCBˆÜÜ[ƒBˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH^^È˜XÚÚ[™Ë]ÚY\Ý[X]]È•S•SÜÜ[ƒBˆ[œ]\OH™]Hˆ˜[YO^Ü™\X][[ˆŸHÛÚ[™ÙO^ÊJHOˆÙ]™\X]
È‹‹œ™\X][[ˆK\™Ù]˜[YHJ_CBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹›Ü™\Žˆ››Û™H‹›Û˜[Z[NˆSÓ“È_HÛ\ÜÓ˜[YOH^\ÛHˆÏƒBˆÙ]ƒBˆËÊˆÙ[XÝYÙYZÙ^Hš[ÈÝ^HÛÝ[X›H[™[™\[™[ˆXXÚÚ\ˆÝÛœÈ]ÈÝ]K[™›È™ZYÚ›Üš[™ÈÙ[XÝ[ÛˆÚ[™Ù\È[›Ý\‹ˆ
‹ßBˆÜ™\X]™œ™\HOOHÙYZÛHˆ	‰ˆ
Bˆ]ˆÛ\ÜÓ˜[YOH™›^Ø\LH‚ˆÐ\œ˜^K™œ›ÛJÈ[™ÝˆÈK
ËÙ™œÙ]
HOˆ
ÙYZÔÝ\
ÈÙ™œÙ]
H	HÊK›X\

JHOˆÃBˆÛÛœÝHVWÓUT”ÖÚWNÃBˆÛÛœÝÛˆH
™\X]˜žQ^H×JKš[˜ÛY\ÊJNÃBˆ™]\›ˆ
Bˆ]ÛˆÙ^O^ÙH]K]\ÝHÙYZÙ^KXÚ\ˆ]K]ÙYZÙ^O^Ú_H]K[Û^ÛÛˆÈYHˆˆ™˜[ÙHŸCBˆ\šXK\™\ÜÙY^ÛÛŸH\šXK[X™[^ÑVWÓUT”ÖÚW_CBˆÛÛXÚÏ^Ê
HOˆÙÙÛQ^JJ_HÛ\ÜÓ˜[YOH›˜‹]\™[]]™H›^LHKLH^^È˜XÚÚ[™Ë]ÚY\ÝƒBˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“Ë›Ü™\”˜Y]\ÎˆNNK˜XÚÙÜ›Ý[™ˆ˜[œÜ\™[‹ÛÛÜŽˆÛˆÈ›Ûˆˆ™[KBˆ›Ü™\Žˆ\ÛÛY	ÛÛˆÈ˜[œÜ\™[ˆˆ›[™_X˜[œÚ][ÛŽˆ˜ÛÛÜˆŒ\ÈX\ÙK›Ü™\‹XÛÛÜˆN\ÈX\ÙHˆ_OƒBˆ\]ZYš[^ÕHÛ^ÛÛŸHÏƒBˆÜ[ˆÛ\ÜÓ˜[YOHœ™[]]™HˆÝ[O^ÞÈ’[™^ˆˆ_OžÙÌ_OÜÜ[ƒBˆØ]ÛƒBˆ
NÃBˆJ_CBˆÙ]ƒBˆ
_CBˆÙ]ƒBˆ
_CBƒBˆ^\™XH˜[YO^Û›Ý_HÛÚ[™ÙO^ÊJHOˆÙ]›ÝJK\™Ù]˜[YJ_H›ÝÜÏ^ÌŸHXÙZÛ\H“›Ý\ÈƒBˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÝ\™˜XÙK›Ü™\Žˆ››Û™H‹›Ü™\”˜Y]\ÎˆÐT‘Ô‹›Û˜[Z[NˆÑT’Q‹™\Ú^™Nˆ››Û™Hˆ_CBˆÛ\ÜÓ˜[YOHËY[LÈKL‹H^\ÛH][XÈˆÏƒBˆÙ]ƒBˆÙ]ƒBƒBˆ]ÛˆÛÛXÚÏ^ÜÝX›Z]H\ØX›Y^È[ÚßHÛ\ÜÓ˜[YOH›˜‹]\ËY[KLÈ]Lˆ^^È›ÛX›Û˜XÚÚ[™Ë]ÚY\ÝƒBˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“Ë›Ü™\”˜Y]\ÎˆÐT‘Ô‹˜XÚÙÜ›Ý[™ˆÚÈÈ˜XØÙ[ˆÝ\™˜XÙKÛÛÜŽˆÚÈÈ›Ûˆˆ™[K›Ü™\Žˆ››Û™H‹˜[œÚ][ÛŽˆ˜˜XÚÙÜ›Ý[™N\ÈX\ÙHˆ_OƒBˆÙY][™ÈÈ”ÐU‘HÒS‘ÑTÈˆˆÚ[™OOH™]™[ˆÈQÈSQSS‘HˆˆQPÕSÓˆŸCBˆØ]ÛƒBˆÙ]ƒBˆ
NÃBŸCBƒB‹ÊˆÛ™HÚ\›ÝËÛ™HÚ\KˆZ^[™È[ÈÚ]›ÞYšY[ÈXZÙ\È[œ™[]YÛÛ›ÛÃBˆÛÚÈZÙHY™™\™[Ú[™ÈÙˆ[™ËÛÈ]™\ž][™ÈÙ[XÝX›H\™H\ÈH[ˆ
‹ÃB™[˜Ý[ÛˆÚ\ÊÈÝ\™˜XÙKX™[˜[YKÛÚ[™ÙKÜ[ÛœË][HH˜[ÙKÜ˜\H˜[ÙKÝH[JHÃBˆÛÛœÝÙ[XÝYH
Ù^JHOˆ
][HÈ
˜[YHÏÈ×JKš[˜ÛY\ÊÙ^JHˆ˜[YHOOHÙ^JNÃBˆÛÛœÝÜ˜\™YˆH\ÙT™YŠ[
NÃBˆÛÛœÝÈ›ÞÝ™]ÚÙ]YHH\ÙS\]ZY[
Ü˜\™Y‹Û][HÈLHˆ˜[YKÜ[ÛœË›[™ÝJNÃBˆÛÛœÝXÚÈH
Ù^JHOˆÃBˆYˆ
[][JH™]\›ˆÛÚ[™ÙJÙ^JNÃBˆÛÛœÝÙ]H™]ÈÙ]
˜[YHÏÈ×JNÃBˆYˆ
Ù]š\ÊÙ^JJHÙ]™[]JÙ^JNÈ[ÙHÙ]˜Y
Ù^JNÃBˆÛÚ[™ÙJË‹‹œÙ]KœÛÜ

KŠHOˆHHŠJNÃBˆNÃBˆ™]\›ˆ
Bˆ]ƒBˆÛX™[	‰ˆÜ[ˆÝ[O^ÞÈ›Û˜[Z[NˆSÓ“ËÛÛÜŽˆ™[H_HÛ\ÜÓ˜[YOH˜›ØÚÈ^^È˜XÚÚ[™Ë]ÚY\ÝX‹LHžÛX™[OÜÜ[ŸCBˆ]ˆ™Y^ÝÜ˜\™YŸHÛ\ÜÓ˜[YO^Ø™[]]™H›^Ø\LH	ÝÜ˜\È™›^]Ü˜\ˆˆˆŸXOƒBˆÈ[][H	‰ˆ\]ZY[[™XØ]Üˆ^ÕH›Þ^Ø›ÞHÝ™]Ú^ÜÝ™]ÚHÙ]Y^ÜÙ]YH^Ì_HÏŸCBˆÛÜ[ÛœË›X\

ÚÙ^K^JHOˆÃBˆÛÛœÝÛˆHÙ[XÝY
Ù^JNÃBˆ™]\›ˆ
Bˆ]ÛˆÙ^O^ÔÝš[™ÊÙ^J_HÛÛXÚÏ^Ê
HOˆXÚÊÙ^J_H]KXXÝ]™O^È[][H	‰ˆÛˆÈYHˆˆ™˜[ÙHŸCBˆÛ\ÜÓ˜[YO^Ø˜‹]\™[]]™H	ÝÜ˜\Èˆˆˆ™›^LHŸH[›[™KY›^][\ËXÙ[\ˆ\ÝYžKXÙ[\ˆØ\LKHLÈKLˆ^^È˜XÚÚ[™Ë]ÚY\ÝCBˆÝ[O^ÞÃBˆ›Û˜[Z[NˆSÓ“Ë›Ü™\”˜Y]\ÎˆNNKBˆ˜XÚÙÜ›Ý[™ˆ][H[ÛˆÈÝ\™˜XÙHˆ˜[œÜ\™[‹BˆÛÛÜŽˆÛˆÈ›Ûˆˆ™[KBˆ˜[œÚ][ÛŽˆ˜˜XÚÙÜ›Ý[™N\ÈX\ÙKÛÛÜˆŒ\ÈX\ÙK˜[œÙ›Ü›HLŒ\ÈX\ÙH‹Bˆ_OƒBˆÛ][H	‰ˆ\]ZYš[^ÕHÛ^ÛÛŸHÏŸCBˆÜ[ˆÛ\ÜÓ˜[YOHœ™[]]™H[›[™KY›^][\ËXÙ[\ˆØ\LKHˆÝ[O^ÞÈ’[™^ˆˆ_OƒBˆÙÝ	‰ˆÜ[ˆÛ\ÜÓ˜[YOHœ›Ý[™YY[Úš[šËLˆÝ[O^ÞÈÚYˆËZYÚˆË˜XÚÙÜ›Ý[™ˆÛˆÈ›ÛˆˆÝ
Ù^JH_HÏŸCBˆÝ^CBˆÜÜ[ƒBˆØ]ÛƒBˆ
NÃBˆJ_CBˆÙ]ƒBˆÙ]ƒBˆ
NÃBŸCB