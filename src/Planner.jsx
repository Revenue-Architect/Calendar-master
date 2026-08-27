import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as storage from "./storage.js";
import { createNote as createNoteCommand, deleteNoteWithAttachments, dropRevisionsFor, getDailyNote, getNotebookNotes, getNotesForEntity, markBlockExtracted, migrateV6ToV7, migrateV7ToV8, recordRevision, restoredNote, restoreDeletedNoteWithAttachments, revisionsFor, archiveNote as archiveNoteCommand, pinNote as pinNoteCommand, toggleChecklistBlock, updateNote as updateNoteCommand } from "./domains/notes/index.js";
import { migrateV4ToV5 } from "./domains/calendar/migrations/migrateV4ToV5.js";
import { addTaskDependency, blockingReasons, deleteTaskList, getEarliestResponsibleStart, getTasksByList, removeTaskDependency, resolveSmartView, smartViewCounts, completeTask as completeTaskCommand, countOpen, createTask as createTaskCommand, deferTask as deferTaskCommand, getBlockedTasks, getDayTasks, getSubtasksOf, getTaskBlockers, moveTaskToList, renameTaskList, getUpcomingRange, migrateV5ToV6, normalizeTaskInput, parseTaskOccurrenceId, planTask as planTaskCommand, promoteChecklistItem as promoteChecklistItemCommand, removeTaskException, reopenTask as reopenTaskCommand, scheduleTask as scheduleTaskCommand, updateTask as updateTaskCommand, upsertTaskException } from "./domains/tasks/index.js";
import { loadPlannerState, readPlannerRecoverySnapshot, savePlannerState } from "./platform/persistence/plannerStateStore.js";
import { createBlankPlannerState } from "./platform/persistence/plannerStateImport.js";
import { readPlannerImportText } from "./platform/persistence/plannerStateRead.js";
import { replacePlannerNotebook, wipePlannerNotebook } from "./platform/persistence/plannerNotebookReplace.js";
import { projectPlannerSearch, resolvePlannerSearchPick, searchResultDateLabel } from "./features/search/searchProjection.js";
import { describeQuickAdd, parseQuickAdd, quickAddToEntry } from "./features/planner/quickAdd.js";
import { matchCommands } from "./features/planner/commandPalette.js";
import { getDayTasksWithCarry } from "./features/planner/carryForward.js";
import { rowSpan } from "./features/planner/editorRowSpan.js";
import { planOverdueForDate, pullableOverdue } from "./features/planner/overduePull.js";
import { planWhenOptions } from "./features/planner/planWhen.js";
import { AUTO_COMPLETE_DELAY_MS, autoCompleteStillValid, togglesLastOpenStep } from "./features/planner/autoComplete.js";
import { recordBackupDismissed, recordBackupTaken, shouldPromptBackup } from "./features/planner/backupReminder.js";
import { normalizeMeetingLink } from "./features/planner/meetingLink.js";
import { applyTaskCompleteUndo, createTaskCompleteUndoPayload, isTaskCompleteUndo } from "./features/planner/taskCompleteUndo.js";
import { gestureChangedAnything, DIRECT_DRAG_ACTIVATION_PX, isResizable, liftDelayForTimelineTarget, movedEnoughToActivateDirectDrag, movedEnoughToCancelHold, pointerButtonsHeld, proposeGesture, shouldCommitActionSwipe, timelineBlockHeight, timelineTouchIntent } from "./features/planner/timelineGesture.js";
import { INTERACTION_ORIGINS, INTERACTION_OWNERS, activateWithMovement, armInteraction, cancelActiveInteraction, cancelArmedInteraction, clickFollowsCancelledArm, createIdleInteraction, createScrollSession, settleInteraction, timelineChromeIntent, rubberBand, shouldCommitSwipe, restoreCancelledInteraction, recordTimelineGestureProposalHistory, timelineTouchReleaseIntent, updateInteractionProposal } from "./features/planner/timelineInteractionState.js";
import { canExposeActionTouchResize, classifyTimelineTouchTarget, TOUCH_TARGET_KINDS } from "./features/planner/timelineTouchTarget.js";
import { acquireTimelineTouchScrollLock, createTimelineTouchScrollLock, releaseTimelineTouchScrollLock } from "./features/planner/timelineTouchScrollLock.js";
import { loadBackupRecord, saveBackupRecord } from "./platform/persistence/backupStore.js";
import { textToNoteBlocks } from "./features/notes/noteText.js";
import { eventNoteLink, taskNoteLink } from "./features/notes/contextLink.js";
import { applyBulkTaskAction, createTaskMutationUndoPayload, deleteTaskFromPlannerState, restoreDeletedTaskInPlannerState, restoreTaskPlannedDates } from "./features/planner/taskMutations.js";
import { resolveTaskForInspection } from "./features/planner/taskInspection.js";
import { eventForUi } from "./features/planner/eventPresentation.js";
import { projectPlannerDay } from "./features/planner/dayProjection.js";
import { findOpenSlots } from "./features/planner/slotSearch.js";
import { RIBBON_RADIUS_DAYS, RIBBON_RENDER_BUFFER_DAYS, RIBBON_RENDER_WINDOW_DAYS } from "./features/planner/ribbonViewport.js";
import useRibbonViewport from "./features/planner/useRibbonViewport.js";
import useEdgeFade from "./features/planner/useEdgeFade.js";
import { busyFractionForDay, busyFractionsForRange, monthDensitiesForRange, projectDayPeek, projectPlannerWeek } from "./features/planner/weekProjection.js";
import { applyDetailDraft, buildDetailEntryPayload, buildTaskWritePatch, durationFromClockRange, hasDetailDraft } from "./features/planner/detailDraft.js";
import { BellIcon, CalendarIcon, CheckIcon, ChevronIcon, ExternalLinkIcon, ListIcon, MoreIcon, RepeatIcon, WarningIcon } from "./features/planner/icons.jsx";
import { RowWithJoin } from "./features/planner/rows.jsx";
import PillNav from "./features/planner/PillNav.jsx";
import { Agenda } from "./features/planner/Agenda.jsx";
import { WeekGrid } from "./features/planner/WeekGrid.jsx";
import { ActionsPanel } from "./features/planner/ActionsPanel.jsx";
import { NavigationFrame, NavigationToggle } from "./features/planner/navigation.jsx";
import { GooeySearch } from "./features/planner/gooey.jsx";
import { CARD_R, CATS, DAY_LETTERS, HOLD_MS, HOUR_H, LIFT_MS, MO, SWIPE_SOFT_LIMIT, VIEW_ORDER, WD, WD1, catColor } from "./features/planner/constants.js";
import { fmtDay, plannedLabel } from "./features/planner/dateLabels.js";
import TimelineActionCard from "./features/planner/TimelineActionCard.jsx";
import TimelineEventResizeControls from "./features/planner/TimelineEventResizeControls.jsx";
import TimelineAnyTimeShelf from "./features/planner/TimelineAnyTimeShelf.jsx";
import { HAPTIC_PATTERNS, triggerDeviceHaptic } from "./features/feedback/haptics.js";
import { VIEW_SLIDE_MS } from "./features/motion/morphTiming.js";
import { installFluidTriggerListeners } from "./features/motion/fluidTrigger.js";
import { navPageFit } from "./features/motion/navPageFit.js";
import PlannerSurfaceHost from "./features/planner/PlannerSurfaceHost.jsx";
import { plannerStyles } from "./features/motion/plannerStyles.js";
import { DISPLAY, MONO } from "./design/typography.js";
import { isDark, mixHex } from "./design/colorMix.js";
import { VIEW_PILL_COMPACT_MAX } from "./features/motion/viewPills.js";
import { deliverReminder, dismissReminder, getDueReminders, getExpiredReminders, getMissedReminders, getReminderIntents, markRemindersMissed, reconcileReminders, snoozeReminder } from "./domains/reminders/index.js";
import { loadReminderRecords, saveReminderRecords } from "./platform/persistence/reminderStore.js";
import { loadPreferences, savePreferences } from "./platform/persistence/preferencesStore.js";
import { loadDiagnostics, saveDiagnostics } from "./platform/persistence/diagnosticsStore.js";
import { createDiagnosticsLedger, recordDiagnostic, shouldRecordStorageDiagnostic, storageDiagnosticOperation } from "./platform/diagnostics/diagnostics.js";
import { preferencesFromLegacyState } from "./platform/preferences/preferences.js";
import { awardTaskCompletion, createMotivationLedger, getMotivationSummary, reverseLatestTaskAward } from "./domains/gamification/index.js";
import { loadMotivationLedger, saveMotivationLedger } from "./platform/persistence/gamificationStore.js";
import { classifyStorageFailures } from "./platform/resilience/storageStatus.js";
import { createEvent as createCalendarEvent, deleteEvent as deleteCalendarEvent, getVisibleOccurrencesForRange, legacyEventInputToCanonical, parseOccurrenceId, cancelOccurrence, moveOccurrence, restoreOccurrence, splitSeries, moveEvent as moveCalendarEvent, packEventLanes, resizeEvent as resizeCalendarEvent, restoreEvent as restoreCalendarEvent, updateEvent as updateCalendarEvent, eventsToIcs } from "./domains/calendar/index.js";
import { addDays, addDaysToKey, diffDays, isDateKey, keyOf, parseKey } from "./shared/time/dateKey.js";
import { uid } from "./shared/ids.js";
import { addMinutesToLocalDateTime, localDateTimeToEpochMinutes } from "./shared/time/localDateTime.js";
import { getOffsetCandidates } from "./shared/time/timezone.js";
import { dur } from "./shared/time/duration.js";
import { fmtHour, fmtTime, fromHhmm, hhmm, pad } from "./shared/time/clockFormat.js";
import { snapTo, startSlot } from "./shared/time/snap.js";
import { NOW_RED, THEMES } from "./design/themes.js";
import { readable } from "./design/contrast.js";

/* ═══════════════════════ TOKENS ═══════════════════════ */

const GESTURE_HINT_KEY = "nbmp:ui:gestureHintSeen";

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

/* How long the load-in fade will wait for a frame before giving up and simply
   showing the content. Long enough that a healthy page always animates on the
   first rAF instead of snapping, short enough that a frame-starved one is never
   left blank for a visible beat. */
const REVEAL_FALLBACK_MS = 120;
/* A short phone window can leave less vertical room than a three-hour card at
   the preferred scale. Forty-four pixels still gives an hour a real touch-sized
   row; below that, density starts making the timeline less usable than scrolling. */
const MIN_DAY_HOUR_H = 44;

function ribbonRangeAround(anchorKey) {
  return {
    startKey: addDaysToKey(anchorKey, -RIBBON_RADIUS_DAYS),
    endKey: addDaysToKey(anchorKey, RIBBON_RADIUS_DAYS + 1),
  };
}

/* ═══════════════════════ UTILS ═══════════════════════ */

/* The pressed-trigger snapshot lives in features/motion/fluidTrigger.js, which
   also owns the listeners that feed it. Installed here because Planner is the
   composition root and this is a document-level concern, not a component one. */
installFluidTriggerListeners();
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
  const [planAsk, setPlanAsk] = useState(null);
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
  /* A view change mounts its neighbour for exactly as long as the travel takes.
     The old handoff faded one pane in over 27px, which is a cut with a settle
     rather than a slide — nothing moved *between* the two views because only one
     of them ever existed. Both have to be on screen for a pane width of travel
     to mean anything, and neither should outlive the transition: the timeline is
     the expensive surface and keeping a spare permanently resident to animate it
     twice a minute is the trade this avoids. */
  const [slide, setSlide] = useState(null);
  const [slideProgress, setSlideProgress] = useState(0);
  const [sliding, setSliding] = useState(false);
  const slideTimer = useRef(null);
  const slideArmedRef = useRef(null);
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
  /* Scroll bookkeeping resets on a day turn because the stream really is a new
     node — the page wrapper is keyed on the turn, so the old session, the old
     scroll top and the old auto-position flag all belong to an element that no
     longer exists. */
  useEffect(() => {
    timelineScrollSessionRef.current?.expire?.();
    timelineAutoPositionRef.current = false;
  }, [dateKey, viewMode, zoom]);
  /* Focus does not reset on a day turn, only when the surface itself changes.
     Resetting it on dateKey meant every swipe through the days forced the heading
     back open, so moving along the day axis kept interrupting itself — collapse,
     swipe, pop open, collapse again. Stepping between days is travel within one
     surface; the chrome should hold whatever state the reader put it in and let
     the scroll rule decide, which it will the moment the new day lands at its
     top. Changing view or zoom is a different surface and does start clean. */
  useEffect(() => {
    setTimelineFocused(false);
    setTimelineFocusSource(null);
  }, [viewMode, zoom]);
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

  const ribbon = useRibbonViewport({
    enabled: ready && viewMode !== "actions" && (zoom === "week" || zoom === "day"),
    ready,
    mounted,
    selectedDateKey: dateKey,
    zoom,
    viewMode,
    ribbonRange,
    ribbonSpan,
    ribbonWindowStart,
    setRibbonWindowStart,
    setRibbonRange,
  });
  const {
    attachRibbon,
    attachActiveRibbon,
    onScroll: onRibbonScroll,
    edges: ribbonEdges,
    keyboardAnchorIndex: ribbonKeyboardAnchor,
    positionState: ribbonPositionState,
    setWindow: setRibbonWindow,
    ensureDateVisible: ensureRibbonDateVisible,
  } = ribbon;
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
  const timelineScrollSessionRef = useRef(createScrollSession());
  const interactionRef = useRef(createIdleInteraction());
  const timelineTouchScrollLockRef = useRef(createTimelineTouchScrollLock());
  const [streamNode, setStreamNode] = useState(null);
  const [dayHourHeight, setDayHourHeight] = useState(HOUR_H);
  const dayHeight = dayHourHeight * 24;
  const nowLabelClearanceMin = Math.round((18 / dayHourHeight) * 60);
  const attachStream = useCallback((node) => {
    const previous = streamRef.current;
    if (previous && previous !== node) {
      const lock = timelineTouchScrollLockRef.current.snapshot();
      if (lock?.node === previous) timelineTouchScrollLockRef.current.releaseNode(lock.sequence, previous);
    }
    streamRef.current = node;
    timelineScrollTopRef.current = node?.scrollTop ?? 0;
    setStreamNode(node);
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

  /* The load-in fade is an enhancement. It must never be the thing that decides
     whether content is visible, and for a while it was: `mounted` gates the
     opacity of every ribbon cell, every month cell and the now-line, and it was
     set from a single `requestAnimationFrame`. rAF is a paint callback, not a
     timer — a document that never composites, such as a tab restored in the
     background, never runs it. Loading the app unpainted therefore left the week
     header ribbon blank with no way back.
     Nobody is watching an unpainted page, so there is no beat worth staging
     there; reveal at once and let it be already-arrived when it is first shown.
     The timer covers the other case, a visible page starved of frames, where the
     fade is merely late rather than absent. */
  useEffect(() => {
    if (!ready) return;
    if (document.visibilityState === "hidden") {
      setMounted(true);
      return;
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    const safety = setTimeout(() => setMounted(true), REVEAL_FALLBACK_MS);
    return () => { cancelAnimationFrame(frame); clearTimeout(safety); };
  }, [ready]);

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
  /* Mounting the arriving pane is the expensive part of a view change, and doing
     it on the click put roughly 190ms of blocked main thread between the press
     and the first frame of travel — a pause, then a slide, which is worse than
     no slide at all. A press is the earliest honest signal that a view change is
     coming, and the ~100ms before the click lands is enough to absorb it: the
     pane mounts at its starting offset with transitions still off, so nothing
     moves and nothing is committed until the click actually arrives. Releasing
     elsewhere leaves a mounted neighbour that costs one frame to drop.
     Declared here rather than beside the slide state it writes, because it reads
     reducedMotion and viewMode and would sit in their temporal dead zone there. */
  const armSlide = useCallback((mode) => {
    if (reducedMotion || mode === viewMode) return;
    const from = VIEW_ORDER.indexOf(viewMode);
    const to = VIEW_ORDER.indexOf(mode);
    if (from === -1 || to === -1) return;
    window.clearTimeout(slideTimer.current);
    slideArmedRef.current = mode;
    setSliding(false);
    setSlide({ from: viewMode, to: mode, dir: to > from ? 1 : -1 });
    setSlideProgress(to > from ? 0 : 1);
    /* A press that never becomes a click — released off the control, or turned
       into a scroll — would otherwise leave the neighbour mounted indefinitely.
       Long enough not to race a slow tap, short enough that the spare pane is
       never resident for anything but the gesture that asked for it. */
    slideTimer.current = window.setTimeout(() => {
      slideArmedRef.current = null;
      setSlide(null);
      setSliding(false);
    }, 900);
  }, [reducedMotion, viewMode]);
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
    const dir = to > from ? 1 : -1;
    if (from !== -1 && to !== -1 && from !== to) setViewDir(dir);
    /* Both panes mount, the track starts showing the one being left, and a frame
       later it travels a full width to the one arriving. Two frames, not one:
       the first commits the pane at its starting offset, and a transition that
       starts in the same frame the element appears in has nothing to move from. */
    if (source === "pointer" && !reducedMotion && from !== -1 && to !== -1 && from !== to) {
      window.clearTimeout(slideTimer.current);
      /* Already warmed by armSlide on the press: the pane is mounted and sitting
         at the start offset, so all that is left is to let it travel. */
      setSlide((current) => (current && current.to === mode && current.from === viewMode
        ? current
        : { from: viewMode, to: mode, dir }));
      setSlideProgress((current) => (slideArmedRef.current === mode ? current : (dir > 0 ? 0 : 1)));
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        setSliding(true);
        setSlideProgress(dir > 0 ? 1 : 0);
      }));
      slideTimer.current = window.setTimeout(() => {
        setSlide(null); setSliding(false); slideArmedRef.current = null;
      }, VIEW_SLIDE_MS + 40);
    }
    setViewMode(mode);
    if (mode === "actions") setSheet(false);
  }, [reducedMotion, viewMode]);
  useEffect(() => () => window.clearTimeout(slideTimer.current), []);
  const tm = (m) => fmtTime(m, clock);

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
    ensureRibbonDateVisible(dateKey);
    setRibbonRange(ribbonRangeAround(dateKey));
  }, [dateKey, ensureRibbonDateVisible, ribbonRange.endKey, ribbonRange.startKey]);
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
  const flexibleTasks = useMemo(
    () => dayTasks.filter((task) => task.planned.startMinute == null),
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
    const g = gesture; const actionMinDur = (44 / dayHeight) * 1440;
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
        dur: resizingTask && g.id === task.id ? Math.max(g.dur, actionMinDur) : Math.max(task.planned.estimateMinutes ?? 30, actionMinDur),
        timelineKind: "task",
        timelineKey: `task:${task.id}`,
      })),
    ];
    const packed = packEventLanes(list).map((item) => item.timelineKind === "task" ? { ...item, dur: resizingTask && g.id === item.id ? g.dur : (item.planned.estimateMinutes ?? 30) } : item);
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
  }, [timed, scheduledTasks, gesture, dayHeight]);
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

  /* A view switch is the gesture of last resort: it only gets the finger when
     nothing nearer to it wanted one.
     The handler sits on the section wrapping every surface in the app, so
     without this it answers for touches that were never meant for it. Two were
     reproducible and both felt like the app misfiring rather than navigating:
     swiping an Action card right to complete it left the task open and threw
     the view sideways, and dragging the ANY TIME row — a horizontal scroller —
     navigated instead of scrolling. The card is the harder of the two, because
     it handles its swipe with pointer events while this handler listens to
     touch, and one finger on glass emits both streams, so neither handler can
     see the other by inspecting its own events.
     Ownership is therefore declared rather than inferred. An element that means
     to keep horizontal movement for itself says so with data-owns-swipe, and a
     touch starting anywhere inside one never becomes a view switch. Declared
     beats heuristic here: testing overflow-x would catch the two known cases
     and silently miss the next control someone adds. */
  const onSwipeStart = (e) => {
    if (e.touches.length !== 1 || gestureRef.current) return;
    if (e.target instanceof Element && e.target.closest("[data-owns-swipe]")) return;
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, live: false, at: Date.now() };
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
      s.dx = rubberBand(dx, SWIPE_SOFT_LIMIT);
      setSwipe(s.dx);
    }
  };
  /* A horizontal drag turns the day. On every surface, with no exceptions.
     Two earlier passes got this wrong in opposite directions — first by giving
     the gesture to the view list everywhere, then by splitting it per surface —
     and both were reasoning about the views instead of reading what they show.
     All three are anchored to the selected day: the Timeline is that day,
     Agenda's window is measured from it, and the Actions default smart view
     lists that day's tasks. So there is no surface where turning the day is
     meaningless, and no honest reason for the same gesture to mean two things.
     Changing view is the pill nav's job, which is always on screen and is one
     tap. Keeping the two apart is also what stops a view switch competing with
     the card swipes, the horizontal scrollers and the timeline's own gestures —
     a whole class of conflict that simply cannot occur if the gesture only ever
     has one meaning. */
  const onSwipeEnd = () => {
    const s = swipeRef.current;
    swipeRef.current = null;
    /* Distance or velocity, whichever the hand offered. A flick that covers half
       the threshold in a fifth of the time is a deliberate turn; requiring the
       full 64px meant confident gestures were silently dropped. */
    if (s && s.live && shouldCommitSwipe({ delta: s.dx, elapsedMs: Date.now() - s.at, distanceThreshold: 64 })) {
      /* Drop the drag offset in the same commit as the turn and without a
         transition. Springing the page back while the turn animation plays
         animates two transforms against each other on nested elements, which is
         the jump. Only the turn should play. */
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
        || shortcuts || planAsk) return;
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
  }, [dateKey, inspect, composer, settings, noteEdit, noteHistory, notebook, search, scopeAsk, goDay, todayKey, nowMin, dayTasks, undo, firstRun, confirmComplete, dependencyPicker, listPicker, pendingImport, peekDay, shortcuts, planAsk, viewMode, zoom]);

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
  const pullOverdue = (ids = null, dateKey = todayKey) => {
    const candidates = pullableOverdue(overdue, dateKey);
    const selected = ids == null ? null : new Set(ids);
    const entries = selected ? candidates.filter((entry) => selected.has(entry.id)) : candidates;
    if (!entries.length) return;
    beep("schedule");
    const before = structuredClone(db);
    mutate((d) => planOverdueForDate(d, entries, dateKey, { makeId: uid }).state);
    flash(`${entries.length} planned for ${plannedLabel(dateKey, todayKey).toLowerCase()}`, { type: "restore-planner-state", snapshot: { state: before } });
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

  const applyMove = (x, y, event) => {
    if (event && !pointerButtonsHeld(event)) {
      abortGesture();
      return;
    }
    const g = gestureRef.current;
    if (!g) return;
    if (g.touchId != null && g.owner === INTERACTION_OWNERS.dayStream) {
      const lock = timelineTouchScrollLockRef.current;
      if (!lock.enforce(g.interactionSequence, { node: streamRef.current, touchId: g.touchId })) return;
    }
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
      const pointerMinute = m + (Number.isFinite(g.resizePointerOffset)
        ? (g.resizePointerOffset / dayHeight) * 1440
        : 0);
      next.dur = proposeGesture("resize-end", { start: g.start, pointerMinute, kind: g.kind }).duration;
    } else if (g.mode === "resize-start") {
      /* Measured from where the gesture began, not from the last frame, so a
         chain of roundings can never walk the end of the block away. */
      const pointerMinute = m + (Number.isFinite(g.resizePointerOffset)
        ? (g.resizePointerOffset / dayHeight) * 1440
        : 0);
      const resized = proposeGesture("resize-start", {
        start: g.was.start, duration: g.was.dur, pointerMinute, kind: g.kind,
      });
      next.start = resized.start;
      next.dur = resized.duration;
    }
    if (g.touchId != null && interactionRef.current.phase === "active") {
      interactionRef.current = updateInteractionProposal(interactionRef.current, {
        start: next.start,
        duration: next.dur,
        date: dateKeyRef.current,
      });
      next.proposalChanged = recordTimelineGestureProposalHistory(
        g,
        next,
        interactionRef.current,
        dateKeyRef.current,
      );
    }
    gestureRef.current = next;
    setGesture(next);
  };
  /* Day and week timelines have different scroll nodes, but focus mode is one
     piece of navigation. Keep the direction/restore rule here so the two views
     cannot drift: leaving the first hour-row collapses the chrome, and only
     movement back into that row restores it. Initial positioning is explicitly
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
    /* A manual toggle sets focus for now, not forever. This used to short-circuit
       on `timelineFocusSource === "manual"`, which latched: once the control had
       been pressed, no later scroll could ever restore the chrome again, and the
       ribbon stayed collapsed until a view change or reload reset the source.
       Deliberate intent still wins over layout noise — the session check below is
       what distinguishes a real gesture from a resize or an anchor correction —
       but a real gesture is always allowed to take the wheel back. */
    if (!timelineScrollSessionRef.current?.isActive?.()) {
      timelineScrollTopRef.current = nextScrollTop;
      return;
    }
    const previousScrollTop = timelineScrollTopRef.current;
    timelineScrollTopRef.current = nextScrollTop;
    /* Focus mode is one piece of navigation, so it reads the same at every width.
       This was gated to `(max-width:1023px)`, which left a desktop window
       scrolling its hours away under a header it had stopped needing — and in week
       view that header is a second copy of the day names the grid already prints
       across its own columns, so it was the most redundant strip on the screen. */
    if (!(viewMode === "timeline" && (zoom === "day" || zoom === "week"))) return;
    /* The verdict is a pure function so it can be tested; see
       timelineChromeIntent for why restore is intent-based rather than
       position-based, and what the previous asymmetry cost. */
    const intent = timelineChromeIntent({
      previousScrollTop,
      nextScrollTop,
      triggerPx: dayHourHeight,
    });
    if (intent === "none") return;
    setTimelineFocused(intent === "collapse");
    setTimelineFocusSource("auto");
  }, [dayHourHeight, viewMode, zoom, timelineFocusSource]);

  const abortGesture = () => {
    const lock = timelineTouchScrollLockRef.current.snapshot();
    if (lock) timelineTouchScrollLockRef.current.release(lock.sequence, { node: lock.node, touchId: lock.touchId });
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
    if (timelineTouchReleaseIntent(g, interactionRef.current, dateKeyRef.current) === "inspect") {
      const kind = g.kind === "task" ? "task" : "event";
      const id = g.id;
      abortGesture();
      beep("click");
      if (id) setInspect({ kind, id });
      return;
    }
    if (g?.touchId != null) {
      releaseTimelineTouchScrollLock(timelineTouchScrollLockRef.current, g.interactionSequence, g.touchId);
      interactionRef.current = settleInteraction(interactionRef.current);
    }
    endGesture();
    if (!g) return;
    /* A drag that ends inside the control it began in still produces a click.
       Letting go of an action's grip would otherwise open the action it had just
       finished resizing. */
    gestureEndedAt.current = Date.now();
    const key = dateKeyRef.current;
    if (g.mode === "move") {
      if (!g.overDay && !gestureChangedAnything(
        { start: g.was?.start ?? g.start, duration: g.was?.dur ?? g.dur },
        { start: g.start, duration: g.dur },
      )) return;
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
  /* A card press is a click candidate until desktop movement makes intent clear.
     Touch keeps its separate hold/scroll arbitration below; mouse/pen cards
     activate from movement and apply that same frame immediately. */
  const armedRef = useRef(null);
  const disarmHold = useCallback(() => {
    clearTimeout(holdRef.current);
    holdRef.current = null;
    armedRef.current = null;
  }, []);
  const armHold = (x, y, fire, activateOnMove = null) => {
    disarmHold();
    armedRef.current = { x, y, activateOnMove };
    /* A desktop card candidate is movement-only. The timer belongs to genuine
       hold interactions such as empty-space creation; giving it to a card
       would auto-lift a stationary mouse press and swallow the click. */
    if (activateOnMove) return;
    holdRef.current = setTimeout(() => {
      const armed = armedRef.current;
      if (!armed) return;
      armedRef.current = null;
      fire();
    }, LIFT_MS);
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
      if (armed.activateOnMove && !pointerButtonsHeld(e)) {
        disarmHold();
        tappedRef.current = false;
        return;
      }
      if (armed.activateOnMove && movedEnoughToActivateDirectDrag(armed, { x: e.clientX, y: e.clientY })) {
        disarmHold();
        tappedRef.current = false;
        armed.activateOnMove(e.clientX, e.clientY, e);
        return;
      }
      if (movedEnoughToCancelHold(armed, { x: e.clientX, y: e.clientY })) {
        disarmHold();
        tappedRef.current = false;
      }
    };
    /* Whatever the release lands on, an edge that was never dragged is not held
       any more. */
    const drop = () => {
      armedResizeRef.current = null;
    };
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
    /* A task can be picked up from the Actions panel and released over this
       canvas. This handler owns canvas-created event/draft gestures only; the
       shared window drop handler owns that cross-surface task drop. */
    if (gestureRef.current?.mode === "task") return;
    if (gestureRef.current) {
      const live = gestureRef.current;
      const moved = gestureChangedAnything(
        { start: live.was?.start ?? live.start, duration: live.was?.dur ?? live.dur },
        { start: live.start, duration: live.dur },
      );
      if (!moved) {
        abortGesture();
        tappedRef.current = false;
        e.stopPropagation();
        /* The canvas owns draft gestures, not Events. An unchanged draft is
           cancelled on release; there is no Event identity to inspect here. */
        return;
      }
      finishGesture(e.clientX, e.clientY);
      return;
    }
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
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    tappedRef.current = true;
    const beginMove = (x = clientX, y = clientY, pointerEvent = null) => {
      tappedRef.current = false;
      if (pointerId != null) target.setPointerCapture?.(pointerId);
      beep("lift"); buzz(14);
      startGesture({ mode: "move", kind: "event", id: ev.id, start: ev.start, dur: ev.dur, grab, was: { start: ev.start, dur: ev.dur }, x, y });
      if (pointerEvent) applyRef.current(x, y, pointerEvent);
    };
    armHold(clientX, clientY, () => beginMove(), beginMove);
  };
  const eventUp = (e, ev) => {
    if (e.pointerType === "touch") return;
    if (e.target.closest?.("a[href], [data-join]")) {
      disarmHold();
      tappedRef.current = false;
      return;
    }
    disarmHold();
    if (gestureRef.current) {
      const live = gestureRef.current;
      const moved = gestureChangedAnything(
        { start: live.was?.start ?? live.start, duration: live.was?.dur ?? live.dur },
        { start: live.start, duration: live.dur },
      );
      if (!moved) {
        abortGesture();
        tappedRef.current = false;
        e.stopPropagation();
        beep("click");
        setInspect({ kind: "event", id: ev.id });
        return;
      }
      finishGesture(e.clientX, e.clientY);
      return;
    }
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
    const beginMove = (x = e.clientX, y = e.clientY, pointerEvent = null) => {
      tappedRef.current = false;
      if (pointerId != null) target.setPointerCapture?.(pointerId);
      beep("lift"); buzz(14);
      startGesture({
        mode: "task", kind: "task", id: task.id, start, dur: duration, grab,
        originStart: start, originY: e.clientY, originScrollTop: streamRef.current?.scrollTop ?? 0,
        was: { start, dur: duration }, x, y,
      });
      if (pointerEvent) applyRef.current(x, y, pointerEvent);
    };
    armHold(e.clientX, e.clientY, () => beginMove(), beginMove);
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
    const g = {
      mode, kind: armed.kind, id: armed.ev.id, start: proposal.start, dur: proposal.duration,
      was: { start: armed.ev.start, dur: armed.ev.dur },
      x: clientX ?? armed.x, y: clientY ?? armed.y,
      ...(armed.touchId != null ? {
        touchId: armed.touchId,
        owner: INTERACTION_OWNERS.dayStream,
        interactionSequence: interactionRef.current.sequence,
      } : {}),
    };
    startGesture(g);
    if (armed.touchId != null) acquireTimelineTouchScrollLock(timelineTouchScrollLockRef.current, streamRef.current, interactionRef.current.sequence, armed.touchId);
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
      if (interactionRef.current.phase === "armed") {
        interactionRef.current = cancelArmedInteraction(interactionRef.current);
      }
    };
    const cancelTouchSequence = () => {
      if (gestureRef.current || interactionRef.current.phase === "active") finishRef.current(0, 0, { cancelled: true });
      else cancelPress();
      /* A cancelled touch cannot lend its scroll authority to a later
         layout-driven scroll event. Real vertical intent is opened below from
         touchmove/native scroll, never speculatively at touchstart. */
      timelineScrollSessionRef.current.expire();
      disarm(); setTaskSwipe(null);
    };
    const onStart = (e) => {
      if (e.touches.length !== 1) { cancelTouchSequence(); return; }
      if (gestureRef.current) return;
      /* Resolve transformed-control edge hits from the actual client point. */
      const target = classifyTimelineTouchTarget(document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY) ?? e.target);
      if (target.kind === TOUCH_TARGET_KINDS.complete) return;
      /* JOIN is an action inside an event card, not a card gesture. The native
         listener owns touch intent before React's synthetic click reaches the
         anchor, so opt links out here as well as at the JSX boundary below.
         Without this guard a mobile tap first arms the event and the delegated
         touchend opens its edit sheet even though the browser is also following
         the meeting URL. */
      if (target.kind === TOUCH_TARGET_KINDS.link) return;
      const t = e.touches[0];
      const node = target.node?.closest?.("[data-event-id],[data-task-chip]")
        ?? (target.node?.matches?.("[data-event-id],[data-task-chip]") ? target.node : null);
      const m = minutesAt(t.clientY);
      const chipId = node && node.getAttribute("data-task-chip");
      const id = node && node.getAttribute("data-event-id");
      const ev = id ? eventsRef.current.find((x) => x.id === id) : null;
      const chip = chipId ? plannedRef.current.find((x) => x.id === chipId) : null;
      const resizing = target.kind === TOUCH_TARGET_KINDS.eventResize && ev
        ? { edge: target.edge, kind: "event" }
        : target.kind === TOUCH_TARGET_KINDS.actionEstimate && chip
          ? { edge: "end", kind: "task" }
          : null;
      /* Event edges retain the proven hold-to-own contract: an immediate
         vertical movement from an edge remains a Timeline scroll. The explicit
         Action estimate can own from deliberate vertical movement. */
      const direct = target.kind === TOUCH_TARGET_KINDS.actionEstimate;
      const targetKind = direct ? "direct" : (ev || chipId ? "card" : "empty");
      const controlRect = target.node?.getBoundingClientRect?.();
      const resizePointerOffset = resizing && controlRect
        ? (resizing.edge === "start" ? controlRect.top - t.clientY : controlRect.bottom - t.clientY)
        : 0;
      const p = {
        x: t.clientX, y: t.clientY, ev, chipId, resizing, direct, resizePointerOffset,
        startMin: snapTo(m),
        grab: ev ? m - ev.start : chip?.planned?.startMinute != null ? m - chip.planned.startMinute : 0,
        startScrollTop: el.scrollTop, held: false, cancelled: false, swiping: false,
        lastX: t.clientX, lastY: t.clientY, touchId: t.identifier, timer: null, activate: null,
      };
      if (ev || chip) {
        const before = ev ? { start: ev.start, duration: ev.dur, date: dateKeyRef.current }
          : { start: chip.planned.startMinute, duration: chip.planned.estimateMinutes ?? 30, date: chip.planned.date ?? dateKeyRef.current };
        interactionRef.current = armInteraction(interactionRef.current, {
          owner: INTERACTION_OWNERS.dayStream, surface: "day", input: "touch",
          origin: ev
            ? (resizing?.edge === "start" ? INTERACTION_ORIGINS.eventStart
              : resizing?.edge === "end" ? INTERACTION_ORIGINS.eventEnd
                : INTERACTION_ORIGINS.eventBody)
            : (resizing ? INTERACTION_ORIGINS.actionResize
              : INTERACTION_ORIGINS.actionBody),
          mode: resizing ? (resizing.kind === "task" ? "task-resize" : `resize-${resizing.edge}`) : ev ? "move" : "task",
          id: ev?.id ?? chipId,
          before,
        });
      }
      const activateTouchGesture = (x = p.x, y = p.y) => {
        if (!press.t || press.t.cancelled) return;
        press.t.timer = null;
        press.t.held = true;
        beep("lift"); buzz(p.resizing ? 10 : 14);
        if (p.resizing) {
          const block = ev
            ? { start: ev.start, dur: ev.dur }
            : { start: chip.planned.startMinute, dur: chip.planned.estimateMinutes };
          const active = activateWithMovement(interactionRef.current, { start: block.start, duration: block.dur, date: dateKeyRef.current });
          interactionRef.current = active;
          startGesture({
            mode: p.resizing.kind === "task" ? "task-resize" : `resize-${p.resizing.edge}`,
            kind: p.resizing.kind,
            id: ev ? ev.id : chipId, ...block, was: { ...block }, x: p.x, y: p.y,
            resizePointerOffset: p.resizePointerOffset,
            touchId: p.touchId, owner: INTERACTION_OWNERS.dayStream, interactionSequence: active.sequence,
          });
          acquireTimelineTouchScrollLock(timelineTouchScrollLockRef.current, streamRef.current, active.sequence, p.touchId);
        }
        else if (p.ev) {
          const active = activateWithMovement(interactionRef.current, { start: p.ev.start, duration: p.ev.dur, date: dateKeyRef.current });
          interactionRef.current = active;
          startGesture({ mode: "move", kind: "event", id: p.ev.id, start: p.ev.start, dur: p.ev.dur, grab: p.grab, was: { start: p.ev.start, dur: p.ev.dur }, x: p.x, y: p.y, touchId: p.touchId, owner: INTERACTION_OWNERS.dayStream, interactionSequence: active.sequence });
          acquireTimelineTouchScrollLock(timelineTouchScrollLockRef.current, streamRef.current, active.sequence, p.touchId);
        }
        else if (p.chipId) {
          const task = plannedRef.current.find((item) => item.id === p.chipId);
          const start = task?.planned?.startMinute ?? p.startMin;
          const dur = task?.planned?.estimateMinutes ?? 30;
          const active = activateWithMovement(interactionRef.current, { start, duration: dur, date: task?.planned?.date ?? dateKeyRef.current });
          interactionRef.current = active;
          startGesture({
            mode: "task", kind: "task", id: p.chipId, start, dur, grab: p.grab,
            originStart: start, originY: p.y, originScrollTop: el.scrollTop,
            was: { start, dur }, x: p.x, y: p.y, touchId: p.touchId, owner: INTERACTION_OWNERS.dayStream, interactionSequence: active.sequence,
          });
          acquireTimelineTouchScrollLock(timelineTouchScrollLockRef.current, streamRef.current, active.sequence, p.touchId);
        }
        else startGesture({ mode: "draft", start: p.startMin, dur: 30, x: p.x, y: p.y });
        if (p.direct && gestureRef.current) applyRef.current(x, y);
      };
      p.activate = activateTouchGesture;
      if (!direct) p.timer = setTimeout(activateTouchGesture, liftDelayForTimelineTarget(targetKind));
      press.t = p;
    };

    const onMove = (e) => {
      const g = gestureRef.current;
      if (g) {
        const t = e.touches[0];
        if (e.touches.length !== 1 || !t || (g.touchId != null && t.identifier !== g.touchId)) {
          e.preventDefault();
          e.stopPropagation();
          cancelTouchSequence();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        timelineTouchScrollLockRef.current.enforce(g.interactionSequence, { node: el, touchId: g.touchId });
        applyRef.current(t.clientX, t.clientY);
        return;
      }
      const p = press.t;
      if (!p) return;
      const t = e.touches[0];
      if (!t) return;
      p.lastX = t.clientX;
      p.lastY = t.clientY;
      if (p.direct && !p.held && !p.cancelled) {
        const dx = t.clientX - p.x;
        const dy = t.clientY - p.y;
        const moved = p.resizing
          ? Math.abs(dy) >= DIRECT_DRAG_ACTIVATION_PX && Math.abs(dy) >= Math.abs(dx)
          : movedEnoughToActivateDirectDrag(p, { x: t.clientX, y: t.clientY });
        if (moved) {
          clearPressTimer(p);
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          p.activate?.(t.clientX, t.clientY);
        }
        return;
      }
      if (p.chipId && !p.resizing && (p.swiping || (t.clientX > p.x && timelineTouchIntent(p, { x: t.clientX, y: t.clientY }) === "horizontal"))) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        cancelPress();
        p.swiping = true;
        setTaskSwipe({ id: p.chipId, offset: Math.max(0, Math.min(96, t.clientX - p.x)) });
        return;
      }
      if (movedEnoughToCancelHold(p, { x: t.clientX, y: t.clientY })) cancelPress();
      if (Math.abs(t.clientY - p.y) > 4) {
        timelineScrollSessionRef.current.begin();
      }
    };

    const onScroll = () => {
      const lock = timelineTouchScrollLockRef.current.snapshot();
      if (lock && lock.node === el && timelineTouchScrollLockRef.current.enforce(lock.sequence, { node: el, touchId: lock.touchId })) return;
      const p = press.t;
      /* A native scroll is definitive user intent even if Chromium delivered it
         before our threshold-crossing touchmove. Authorize this scroll only,
         then close the session with the touch sequence below. */
      if (p) {
        timelineScrollSessionRef.current.begin();
      }
      onTimelineScrollPosition(el.scrollTop);
      if (!p) return;
      cancelPress();
    };
    const onWheel = () => {
      timelineScrollSessionRef.current.begin();
      timelineScrollSessionRef.current.end();
    };

    const onEnd = (e) => {
      const g = gestureRef.current;
      const p = press.t;
      const t = e.changedTouches && e.changedTouches[0];
      const touchId = t?.identifier;
      if ((g?.touchId != null && touchId !== g.touchId)
        || (p?.touchId != null && touchId != null && touchId !== p.touchId)) { cancelTouchSequence(); return; }
      disarm();
      /* Keep bounded momentum only after a real scroll called begin(); a
         stationary tap cannot authorize a later layout-driven scroll. */
      timelineScrollSessionRef.current.end();
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
        interactionRef.current = cancelArmedInteraction(interactionRef.current);
        if (e.cancelable) e.preventDefault();
        if (p.ev) { beep("click"); setInspect({ kind: "event", id: p.ev.id }); }
        else if (p.chipId) { beep("click"); setInspect({ kind: "task", id: p.chipId }); }
        else { beep("click"); setComposer({ kind: "event", start: startSlot(p.startMin), dur: 60 }); }
      }
    };

    const onCancel = () => {
      cancelTouchSequence();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onCancel);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      timelineScrollSessionRef.current.expire();
      const lock = timelineTouchScrollLockRef.current.snapshot();
      if (lock?.node === el) timelineTouchScrollLockRef.current.releaseNode(lock.sequence, el);
      if (gestureRef.current?.owner === INTERACTION_OWNERS.dayStream) finishRef.current(0, 0, { cancelled: true });
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
    };
  }, [streamNode, ready, viewMode, zoom, dayHourHeight, onTimelineScrollPosition]);

  /* mouse / pen tracking for drags that begin outside the stream */
  useEffect(() => {
    if (!gesture) return;
    const move = (e) => applyRef.current(e.clientX, e.clientY, e);
    const up = (e) => finishRef.current(e.clientX, e.clientY);
    const tcancel = () => gestureRef.current && finishRef.current(0, 0, { cancelled: true });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", tcancel);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", tcancel);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [gesture && gesture.mode, gesture && gesture.id]);

  /* Toasts and inline confirmations hold their content for one beat after they are
     dismissed, so they can animate out instead of vanishing on the spot. */
  const [undoShown, undoLeaving] = usePresence(undo);
  const [alertShown, alertLeaving] = usePresence(alertToast);
  const [levelShown, levelLeaving] = usePresence(levelFlash);
  const [pendingImportShown] = usePresence(pendingImport, 320);

  useEffect(() => {
    if (!inspect) return undefined;
    const live = gestureRef.current;
    if (live && live.mode !== "draft") abortGesture();
    return undefined;
  }, [inspect]);

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
      todayKey={todayKey} gesture={gesture} onPullOverdue={pullOverdue} onAskPlan={(ids) => { beep("click"); setPlanAsk({ ids }); }} beep={beep} buzz={buzz}
      onComplete={completeTask} onReopen={reopenTask} onDefer={deferTask}
      onInspect={(id) => setInspect({ kind: "task", id })} onToggleSub={toggleSub} onAddSub={addSub} onRemoveSub={removeSub}
      onDragStart={(id, x, y) => {
        if (viewMode === "actions") return;
        startGesture({ mode: "task", kind: "task", id, x, y });
        setSheet(false); buzz(6); beep("lift");
      }}
      hidingAdd={composer?.morphSource?.id === "actions-add"}
      onAddTask={(source) => {
        beep("click");
        setComposer(source?.id
          ? { kind: "task", notch: true, morphSource: source }
          : { kind: "task", morph: "none" });
      }}
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

  const surfaceHostProps = {
    T,
    addSub,
    applyReplacedNotebook,
    askNotifs,
    beep,
    beginDetailEdit,
    blockOn,
    canonicalOccurrenceIdentity,
    clock,
    closeInspector,
    closeMissedReport,
    closePalette,
    commitDraft,
    commitSave,
    completeTask,
    composer,
    confirmComplete,
    confirmWipe,
    conflictIds,
    countdownLabel,
    dark,
    dateKey,
    db,
    deleteTaskList,
    dependencyPicker,
    detailEditing,
    discardAsk,
    doDelete,
    draft,
    duplicateEvent,
    dur,
    durationFromClockRange,
    earliestStart,
    editEntry,
    eventForUi,
    exportIcs,
    exportJson,
    firstRun,
    fmtDay,
    fmtTime,
    fromHhmm,
    getNotebookNotes,
    getTasksByList,
    hasDetailDraft,
    hhmm,
    importError,
    importJson,
    inspect,
    inspectDependsOn,
    inspectDraft,
    inspectEditLabel,
    inspectField,
    inspectIsSubtask,
    inspectParentTask,
    inspectRecord,
    inspectSheetTitle,
    inspectSubtasks,
    jumpTo,
    linkedNotes,
    listManager,
    listPicker,
    minutesUntil,
    missedReport,
    missedSheet,
    mutate,
    newContextualNote,
    noteEdit,
    noteHistory,
    notebook,
    nowMin,
    normalizeMeetingLink,
    openInspectField,
    paletteRows,
    parseTaskOccurrenceId,
    peekDay,
    pendingImport,
    pendingImportShown,
    planAsk,
    planWhenOptions,
    plannedLabel,
    preferences,
    promoteSub,
    projectDayPeek,
    pullOverdue,
    quickDraft,
    removeItem,
    removeSub,
    renameTaskList,
    reopenTask,
    repeatFor,
    repeatLabel,
    replacePlannerNotebook,
    requestSheetClose,
    restoreNoteRevision,
    revisionsFor,
    rowSpan,
    saveEntry,
    saveNote,
    scopeAsk,
    search,
    searchProjection,
    searchQuery,
    setComposer,
    setConfirmComplete,
    setConfirmWipe,
    setDependencyPicker,
    setDetailEditing,
    setDiscardAsk,
    setDraft,
    setFirstRun,
    setInspect,
    setInspectField,
    setList,
    setListManager,
    setListPicker,
    setMotivationLedger,
    setNoteArchived,
    setNoteEdit,
    setNoteHistory,
    setNotePinned,
    setNotebook,
    setPeekDay,
    setPendingImport,
    setPlanAsk,
    setPreferences,
    setScopeAsk,
    setSearchQuery,
    setSettings,
    setShortcuts,
    setZoom,
    settings,
    sheetCloseSignals,
    shortcuts,
    splitId,
    storageBad,
    supportingStorageBad,
    surface,
    tm,
    todayKey,
    toggleSub,
    uid,
    unblockTask,
    weekStart,
    wipeAll,
  };
  return (
    <NavigationFrame
      reducedMotion={reducedMotion}
      shellStyle={{ fontFamily: DISPLAY }}
      surfaceStyle={{ background: T.bg, color: T.text, fontFamily: DISPLAY }}
      onTimeline={() => { beep("tick"); selectViewMode("timeline"); }}
      onActions={() => { beep("tick"); selectViewMode("actions"); }}
      onSetup={() => { beep("click"); setSettings(true); }}
      onNotes={() => { beep("click"); setNotebook("all"); }}
      onShortcuts={() => { beep("click"); setShortcuts(true); }}
      onToday={() => { jumpTo(todayKey); setMonthCursor(new Date()); }}
    >
      <style>{plannerStyles({ T, preferences })}</style>

      <div data-test="timeline-chrome" data-collapsed={String(timelineViewFocused)}
        className={`nb-timeline-chrome ${timelineViewFocused ? "is-collapsed" : ""}`}
        style={{ height: timelineViewFocused ? 0 : (timelineChromeHeight == null ? "auto" : timelineChromeHeight) }}>
      <div ref={attachTimelineChromeInner} className="nb-timeline-chrome-inner">
      {/* ══ HUD ══ */}
      <header style={{ background: T.bg, borderBottom: `1px solid ${T.line}`, color: T.text, paddingTop: "max(0.5rem, env(safe-area-inset-top))", paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }} className="nb-hud sticky top-0 z-30 px-3 sm:px-5 py-2 flex items-center justify-between gap-3">
        <div className="nb-hud-left flex items-center gap-2 min-w-0">
          <NavigationToggle onPress={() => beep("click")} />
          <div className="flex items-baseline gap-2 min-w-0">
          {level != null && <>
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">Level</span>
            <span style={{ fontFamily: MONO }} className="text-sm font-bold">{level}</span>
            <div style={{ background: T.faint }} className="w-14 h-1 mx-1"><div style={{ background: T.accent, width: `${levelPct}%` }} className="h-full" /></div>
          </>}
          {streak != null && streak > 0 && <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{streak}d</span>}
          </div>
        </div>
        <div className="nb-hud-actions flex items-center gap-1 shrink-0">
          <button onClick={() => { jumpTo(todayKey); setMonthCursor(new Date()); }} style={{ fontFamily: MONO, color: T.dim }} className="nb-hud-today nb-tap nb-hover-control px-2 py-1 text-xs tracking-widest">TODAY</button>
          <button data-test="hud-notes" onClick={() => {
            beep("click");
            const phone = typeof window !== "undefined" && Boolean(window.matchMedia?.("(max-width: 639.98px)").matches);
            if (phone) {
              const daily = getDailyNote(db.notes, dateKey);
              setNoteEdit(daily || { kind: "daily", date: dateKey, blocks: [] });
            } else {
              setNotebook("all");
            }
          }} style={{ fontFamily: MONO, color: T.dim }} className="nb-hud-notes nb-tap nb-hover-control px-2 py-1 text-xs tracking-widest">
            <span className="sm:hidden">WRITE</span><span className="hidden sm:inline">NOTES</span>
          </button>
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
            {/* A filled bezel, not a bare outline. The reference reads as three
                objects sharing one tray; with only a hairline the pills float on
                the page and the tray is merely implied. Card behind, faint on the
                inactive pills, accent on the active one gives three legible steps
                instead of two. No padding on the tray: compact slot geometry is
                computed from zero, so insetting it would offset every pill from
                its own plate. */}
            <PillNav T={T} ariaLabel="View mode" testId="view-mode" value={viewMode}
              onArm={armSlide}
              compact={compactViewPills}
              icons={{ timeline: CalendarIcon, agenda: ListIcon, actions: CheckIcon }}
              options={[["timeline", "TIMELINE"], ["agenda", "AGENDA"], ["actions", "ACTIONS"]]}
              onPick={(mode, source) => {
                if (mode === viewMode) return;
                beep("tick");
                selectViewMode(mode, source);
              }}
              className="shrink-0" style={{ background: T.card, border: `1px solid ${T.line}` }} />
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
                    style={{ background: T.bg, opacity: inMonth ? 1 : 0.32, transitionDelay: `${Math.min(i, 24) * 8}ms` }}>
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
            <div className="relative flex-1 min-w-0" data-test="ribbon-viewport"
              data-ribbon-position={ribbonPositionState.status}>
            <div ref={attachRibbon} data-test="day-ribbon" data-ribbon-start={ribbonRange.startKey}
              data-ribbon-end={addDaysToKey(ribbonRange.endKey, -1)} data-ribbon-total-days={ribbonSpan}
              data-ribbon-window-start={ribbonWindowStart} data-ribbon-window-end={ribbonWindowEnd - 1}
              data-owns-swipe="scroller"
              onScroll={onRibbonScroll} className="nb-x overflow-x-auto flex-1 min-w-0">
            <div className="flex min-w-max">
              <div aria-hidden="true" className="nb-ribbon-spacer" style={{ "--nb-ribbon-cells": ribbonWindowStart }} />
              {ribbonDays.map((d, visibleIndex) => {
                const i = ribbonWindowStart + visibleIndex;
                const k = keyOf(d);
                const on = k === dateKey;
                const n = ribbonDensities.get(k) ?? 0;
                const target = gesture && gesture.overDay === k;
                /* One roving tab stop for the whole strip, not one per rendered day.
                   `ribbonKeyboardAnchorIndex` owns which day holds it, and why. */
                return (
                  <button key={k} data-day={k} ref={on ? attachActiveRibbon : null} onClick={() => jumpTo(k)}
                    tabIndex={i === ribbonKeyboardAnchor ? 0 : -1}
                    className="nb-cell nb-tap relative w-16 sm:w-20 lg:w-24 shrink-0 py-2.5"
                    style={{ transitionDelay: `${Math.min(i, 10) * 14}ms`, boxShadow: target ? `inset 0 0 0 2px ${T.accent}` : "none" }}>
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
            {ribbonEdges.start && <span data-test="ribbon-edge-start" aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-5"
              style={{ background: `linear-gradient(90deg, ${T.bg}, transparent)` }} />}
            {ribbonEdges.end && <span data-test="ribbon-edge-end" aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-6"
              style={{ background: `linear-gradient(270deg, ${T.bg}, transparent)` }} />}
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
            <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label shrink-0">While you were away</span>
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
            <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-label shrink-0">Back up</span>
            <span className="nb-body truncate flex-1">This notebook only exists on this device.</span>
            <button data-test="backup-nudge-save" onClick={() => { beep("click"); exportJson(); }}
              style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-hover-control text-xs font-bold tracking-widest shrink-0 underline">SAVE A COPY</button>
            <button data-test="backup-nudge-dismiss"
              onClick={() => { beep("click"); setBackupRecord((current) => recordBackupDismissed(current, { state: db, today: todayKey })); }}
              style={{ fontFamily: MONO, color: T.dimText }} className="nb-tap nb-hover-control nb-data shrink-0" aria-label="Not now">NOT NOW</button>
          </div>
        </div>
      )}

      {gestureHintVisible && !firstRun && viewMode === "timeline" && zoom === "day" && !(missedReport && missedReport.length) && !askForBackup && (
        <div className="px-3 sm:px-5 pb-3">
          <div data-test="gesture-hint" className="nb-up flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-x-3"
            style={{ background: surface, color: T.text, borderRadius: CARD_R, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
            <span style={{ fontFamily: MONO, color: T.accentText }} className="nb-label shrink-0">Gestures</span>
            {/* This hint only ever shows on the Timeline at day zoom, so it
                describes the Timeline's own axis. */}
            <span className="nb-body min-w-0 flex-1">Hold a slot to create · swipe an Action right to complete · swipe the day left or right.</span>
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
          {/* One pane at rest, two while a switch is travelling. The track holds
              them in the order they lie in, so the arriving view comes from the
              side it actually sits on. */}
          {/* The offset is written as a real transform, not through a custom
              property inside calc(). An unregistered custom property is not an
              interpolatable type, so a transform that reads one recomputes in a
              jump instead of transitioning — the track sat still for the whole
              300ms and then teleported. Deriving it to 0 whenever no slide is
              live also makes a stranded offset unrepresentable: the single pane
              cannot be left translated off-screen because there is nothing to
              leave behind. */}
          <div className={`nb-view-track ${sliding ? "is-sliding" : ""}`}
            style={{ transform: `translate3d(${(slide ? slideProgress : 0) * -100}%,0,0)` }}>
          {(slide ? (slide.dir > 0 ? [slide.from, slide.to] : [slide.to, slide.from]) : [viewMode]).map((mode) => (
          <div key={mode} className="nb-view-pane" aria-hidden={slide ? mode !== viewMode : undefined} inert={slide && mode !== viewMode ? true : undefined}>

            {mode === "actions" ? (
              <div className="nb-s overflow-y-auto min-h-0 flex-1">
                <div className="flex items-center justify-between pb-2">
                  <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-label">ALL ACTIONS</span>
                  <button onClick={() => selectViewMode("timeline")} style={{ fontFamily: MONO, color: T.accentText }} className="nb-tap nb-hover-control nb-label">BACK TO DAY</button>
                </div>
                {actionsPanel}
              </div>
            ) : mode === "agenda" ? (
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
              <TimelineAnyTimeShelf
                tasks={flexibleTasks}
                T={T}
                mono={MONO}
                surface={surface}
                anyTimeRef={anyTimeRef}
                anyTimeFade={anyTimeFade}
                onOpenTask={(id) => { beep("click"); setInspect({ kind: "task", id }); }}
                onTaskPointerDown={(event, task) => {
                  if (event.pointerType === "mouse" && event.button !== 0) return;
                  startGesture({ mode: "task", kind: "task", id: task.id, x: event.clientX, y: event.clientY });
                }}
              />
            </div>

            <div ref={attachStream} data-test="day-stream" className="nb-s nb-stream overflow-y-auto relative" style={{ background: T.card, borderTopLeftRadius: 0, userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
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
                    const joinUrl = normalizeMeetingLink(e.link);
                    const live = isToday && nowMin >= e.start && nowMin < e.start + e.dur;
                    const past = isToday && nowMin >= e.start + e.dur;
                    const pct = live ? ((nowMin - e.start) / e.dur) * 100 : 0;
                    const held = gesture && gesture.id === e.id
                      && (gesture.mode === "move" || gesture.mode === "resize-end" || gesture.mode === "resize-start");
                    /* A linked card reserves its trailing lane for JOIN. Its padded
                       title line (19.5px), metadata line (17.55px) and gap need just
                       over 51px, so a smaller card must remain one line rather than
                       making the range appear underneath the title. */
                    const hasRoomForLinkedTime = !joinUrl || h >= 52;
                    /* The card hides while the editor is wearing it. The sheet grows out
                       of this card's rect, so leaving the card in place put two copies of
                       one thing on screen at once and the morph read as a panel arriving
                       over the card rather than the card becoming the panel. NEW has
                       always done this with its own trigger; the editor never did, which
                       is most of why it felt disconnected. */
                    return (
                      <div key={e.id} data-event-id={e.id} className={`nb-timeline-lane absolute ${held ? "nb-timeline-lane-active" : "nb-hover-tile"}`} style={{ visibility: inspect?.kind === "event" && inspect.id === e.id ? "hidden" : undefined, top: top + 2, height: h, left: `${(e.lane / e.cols) * 100}%`, width: `calc(${100 / e.cols}% - 6px)`, zIndex: held ? 20 : 1, opacity: held && gesture.overDay ? 0.35 : 1, pointerEvents: "auto" }}>
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
                          <div className={`relative pl-2.5 ${joinUrl ? "pr-16" : "pr-2.5"} ${h < 28 ? "h-full py-0" : "py-1.5"}`}>
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
                          {/* Thin, full-width boundary strips keep resize ownership
                              predictable at every duration. The asymmetric 8/12px
                              edges leave the readable middle as the move surface. */}
                          <TimelineEventResizeControls event={e} theme={T} onPointerDown={resizeDown} />
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
                    const laneWidth = streamNode
                      ? (Math.max(0, streamNode.clientWidth - 72) / Math.max(1, t.cols)) - 6
                      : 0;
                    const resizeEligible = canExposeActionTouchResize({ width: laneWidth, hasEstimate: block }) || sizing;
                    const h = block ? timelineBlockHeight(estimate, dayHeight) : 44;
                    const live = liveAction?.id === t.id;
                    const pct = live ? livePct * 100 : 0;
                    return (
                      <TimelineActionCard key={t.id} task={t}
                        top={((dragging && gesture.start != null ? gesture.start : t.planned.startMinute) / 1440) * dayHeight + 2}
                        height={h} left={`${(t.lane / t.cols) * 100}%`} width={`calc(${100 / t.cols}% - 6px)`}
                        estimate={estimate} block={block} resizeEligible={resizeEligible} sizing={sizing} dragging={dragging} reducedMotion={reducedMotion}
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
          ))}
          </div>
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
         style={{ height: "76vh", background: T.card, borderTop: `1px solid ${T.line}`, transform: sheet ? "translateY(0)" : "translateY(calc(100% - 52px))", transition: "transform 360ms cubic-bezier(.23,1,.32,1)", paddingBottom: "env(safe-area-inset-bottom)" }}>
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

      <PlannerSurfaceHost {...surfaceHostProps} />
    </NavigationFrame>
  );
}

/* ═══════════════════════ PIECES ═══════════════════════ */

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
