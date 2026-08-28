import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getNotebookNotes,
  revisionsFor,
} from "../../domains/notes/index.js";
import { allTags, createTaskList, deleteTaskList, getTasksByList, renameTaskList, parseTaskOccurrenceId } from "../../domains/tasks/index.js";
import { replacePlannerNotebook } from "../../platform/persistence/plannerNotebookReplace.js";
import { rowSpan } from "./editorRowSpan.js";
import { planWhenOptions } from "./planWhen.js";
import { normalizeMeetingLink } from "./meetingLink.js";
import { eventForUi } from "./eventPresentation.js";
import { projectDayPeek } from "./weekProjection.js";
import { durationFromClockRange, hasDetailDraft } from "./detailDraft.js";
import ActionProgress from "./ActionProgress.jsx";
import { ArrowRightIcon, ArrowUpIcon, BellIcon, BlockIcon, CalendarIcon, ChevronIcon, ClockIcon, CloseIcon, ExternalLinkIcon, LinkIcon, LocationIcon, MenuIcon, MoreIcon, RepeatIcon, UiIcon, WarningIcon } from "./icons.jsx";
import { DetailRow, Pill, Row } from "./rows.jsx";
import PillNav from "./PillNav.jsx";
import { PromotedSubtasks } from "./subtasks.jsx";
import { EntityNotes, NoteEditor, NoteHistory, NotebookPanel } from "./notes.jsx";
import { CommandPalette, ShortcutSheet } from "./commandSurfaces.jsx";
import { EventScheduleEditor, FluidEditActions } from "./detailEditor.jsx";
import { Composer } from "./Composer.jsx";
import { DurationPicker, InlineAdd, InlineChoice, InlineChoiceRow, InlineField, InlineStamp, InlineText, LabeledNative, NewListField, QuickAddHint, TagField } from "./fields.jsx";
import { CARD_R, CATS, REPEATS, catColor } from "./constants.js";
import { fmtDay, plannedLabel } from "./dateLabels.js";
import Reveal from "../motion/Reveal.jsx";
import Sheet from "../motion/Sheet.jsx";
import EventInspectorSurface from "./EventInspectorSurface.jsx";
import EventTimelineLens from "./EventTimelineLens.jsx";
import { MONO, SERIF } from "../../design/typography.js";
import { createMotivationLedger } from "../../domains/gamification/index.js";
import { uid } from "../../shared/ids.js";
import { dur } from "../../shared/time/duration.js";
import { fmtTime, fromHhmm, hhmm } from "../../shared/time/clockFormat.js";
import { NOW_RED, THEMES } from "../../design/themes.js";
import { controlMorphKey, noteMorphKey, slotMorphKey, taskMorphKey } from "../motion/morphKeys.js";
import { createEventMorphOrigin } from "../motion/eventMorphOrigin.js";
import { morphRegistry } from "../motion/morphRegistry.js";
import {
  createMorphCloseSnapshotRelease,
  startCloseWithLatestSource,
} from "../motion/closeActiveMorph.js";
import { isDestinationContentRevealed } from "../motion/morphInterpolate.js";
import { MorphSurface } from "../motion/MorphSurface.js";
import { MORPH_STATES, createMorphTransaction } from "../motion/morphTransaction.js";
import { MORPH_TIMING } from "../motion/morphTokens.js";
import { useMorphDestination } from "../motion/useMorphSource.js";

const MORPH_ACTIVE_STATES = new Set([
  MORPH_STATES.MEASURING,
  MORPH_STATES.OPENING,
  MORPH_STATES.OPEN,
  MORPH_STATES.RECONFIGURING,
  MORPH_STATES.VALIDATING,
  MORPH_STATES.COMMITTING,
  MORPH_STATES.DESTINATION_WAIT,
  MORPH_STATES.CLOSING,
  MORPH_STATES.CANCELLING,
]);

function isMorphActive(state) {
  return MORPH_ACTIVE_STATES.has(state);
}

function surfaceKind({
  settings,
  shortcuts,
  search,
  missedSheet,
  noteHistory,
  notebook,
  noteEdit,
  scopeAsk,
  composer,
  listManager,
  listPicker,
  dependencyPicker,
  firstRun,
  confirmComplete,
  planAsk,
  discardAsk,
  inspectRecord,
  peekDay,
}) {
  if (settings) return "settings";
  if (shortcuts) return "shortcuts";
  if (search) return "search";
  if (missedSheet) return "missed-report";
  if (noteHistory) return "note-history";
  if (notebook) return "notebook";
  if (noteEdit) return "note";
  if (scopeAsk) return "scope";
  if (composer) return "composer";
  if (listManager) return "list-manager";
  if (listPicker) return "list-picker";
  if (dependencyPicker) return "dependency-picker";
  if (confirmComplete) return "confirm-complete";
  if (planAsk) return "plan";
  if (discardAsk) return "discard";
  if (firstRun) return "first-run";
  if (inspectRecord) return "inspector";
  if (peekDay) return "month-peek";
  return "idle";
}

function makeMotionDescriptor({ composer, inspect, inspectRecord, noteEdit, peekDay, dateKey }) {
  if (noteEdit?.id) {
    return {
      target: "note",
      kind: "note",
      key: noteMorphKey({ noteId: noteEdit.id, context: "planner" }),
      meta: { surface: "note", id: noteEdit.id },
    };
  }
  if (composer) {
    if (composer.morphSource?.id) {
      return {
        target: "composer",
        kind: "control",
        key: controlMorphKey({ controlId: composer.morphSource.id, view: "composer" }),
        meta: { surface: "composer", controlId: composer.morphSource.id },
      };
    }
    return {
      target: "composer",
      kind: "slot",
      key: slotMorphKey({
        view: "day",
        dateKey,
        startMinute: composer.start ?? 0,
        lane: "composer",
      }),
      meta: { surface: "composer", dateKey, startMinute: composer.start ?? 0 },
    };
  }
  if (inspectRecord && inspect?.kind === "event") {
    /* Keyboard activation is intentionally semantic, not spatial. It reaches
       the same Inspector without borrowing geometry from the focused card. */
    if (inspect.motion === "instant") return null;
    const id = inspectRecord.id || inspect.id;
    if (id) {
      const origin = inspect.morphOrigin;
      if (origin?.key && origin.eventId === id) {
        return {
          target: "inspector",
          kind: "event",
          key: origin.key,
          meta: { surface: "inspector", id, dateKey: origin.dateKey, view: origin.view, lane: origin.lane },
        };
      }
      return null;
    }
  }
  if (inspectRecord && inspect?.kind === "task") {
    const id = inspectRecord.id || inspect.id;
    if (id) {
      return {
        target: "inspector",
        kind: "task",
        key: taskMorphKey({ taskId: id, view: "timeline", listId: inspectRecord.listId }),
        meta: { surface: "inspector", id },
      };
    }
  }
  if (peekDay && dateKey) {
    return {
      target: "month-peek",
      kind: "slot",
      key: slotMorphKey({ view: "month", dateKey: peekDay, startMinute: 0, lane: "month-peek" }),
      meta: { surface: "month-peek", dateKey: peekDay },
    };
  }
  return null;
}

export default function PlannerSurfaceHost(props) {
  const {
    T,
    addSub,
    applyReplacedNotebook,
    askNotifs,
    beep,
    beginDetailEdit,
    blockOn,
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
  } = props;

  /* These helpers remain Planner-owned because the same domain formatting is
     used by the timeline. Alias the handoff locally so the extracted surface
     does not reach back into Planner's module scope. */
  const canonicalOccurrenceIdentity = props.canonicalOccurrenceIdentity;
  const countdownLabel = props.countdownLabel;
  const minutesUntil = props.minutesUntil;
  const repeatFor = props.repeatFor;
  const repeatLabel = props.repeatLabel;
  const splitId = props.splitId;

  /* An Event disclosure is part of the read surface first: opening Repeat or
     Alerts must reveal more of the same object, not immediately replace the
     lower read actions with the editing shell. A choice still enters edit mode
     when it is actually changed through editEntry. This also lets the physical
     carrier and its Timeline Lens grow for the disclosure itself. */
  const toggleEventDisclosure = useCallback((field) => {
    setInspectField((current) => (current === field ? null : field));
  }, [setInspectField]);

  const motion = useMemo(
    () => makeMotionDescriptor({ composer, inspect, inspectRecord, noteEdit, peekDay, dateKey }),
    [composer, inspect, inspectRecord, noteEdit, peekDay, dateKey],
  );
  const motionKey = motion?.key || null;
  const isEventInspector = inspect?.kind === "event" && motion?.target === "inspector" && motion?.kind === "event";
  const hasEventMorphSource = isEventInspector && Boolean(
    morphRegistry.resolveMorphNode?.(motionKey, "source")
    || morphRegistry.getLastMorphSnapshot?.(motionKey, "source"),
  );
  const usesPhysicalEventInspector = Boolean(isEventInspector && hasEventMorphSource);
  const [eventMorphSourceSnapshot, setEventMorphSourceSnapshot] = useState(null);
  useLayoutEffect(() => {
    if (!usesPhysicalEventInspector || !motionKey) {
      setEventMorphSourceSnapshot(null);
      return;
    }
    const source = morphRegistry.getMorphSnapshot(motionKey, "source");
    setEventMorphSourceSnapshot((previous) => {
      const sameSource = previous?.key === source?.key
        && previous?.rect?.left === source?.rect?.left
        && previous?.rect?.top === source?.rect?.top
        && previous?.rect?.width === source?.rect?.width
        && previous?.rect?.height === source?.rect?.height;
      return sameSource ? previous : source;
    });
  }, [motionKey, usesPhysicalEventInspector]);
  /* The destination must never mount at Sheet's centered fallback and then be
     corrected a frame later.  Hold the visual Inspector until the semantic
     Event snapshot for this exact transaction exists; its first destination
     layout is therefore already the contextual source-anchored layout. */
  const physicalEventInspectorReady = !usesPhysicalEventInspector
    || (eventMorphSourceSnapshot?.key === motionKey && Boolean(eventMorphSourceSnapshot?.rect));
  const destinationRef = useMorphDestination({
    key: motionKey,
    kind: motion?.kind || "event",
    meta: motion?.meta,
    enabled: Boolean(motionKey),
  });
  const [eventMorphDestinationNode, setEventMorphDestinationNode] = useState(null);
  const eventMorphDestinationRef = useCallback((node) => {
    destinationRef(node);
    setEventMorphDestinationNode((previous) => (previous === node ? previous : node));
  }, [destinationRef]);
  const closeSnapshotReleaseRef = useRef(null);
  if (!closeSnapshotReleaseRef.current) {
    closeSnapshotReleaseRef.current = createMorphCloseSnapshotRelease({ registry: morphRegistry });
  }
  const transactionRef = useRef(null);
  const eventMorphCloseRef = useRef(null);
  const eventMorphCloseTimerRef = useRef(null);
  const [transactionSnapshot, setTransactionSnapshot] = useState(() => ({
    state: MORPH_STATES.IDLE,
    runId: 0,
    key: null,
    sourceSnapshot: null,
    targetSnapshot: null,
    inFlightProgress: 0,
  }));
  if (!transactionRef.current) {
    transactionRef.current = createMorphTransaction({
      onStateChange: (snapshot) => {
        closeSnapshotReleaseRef.current.onTransactionStateChange(snapshot);
        const pendingClose = eventMorphCloseRef.current;
        if (pendingClose && snapshot.runId > pendingClose.runId) {
          window.clearTimeout(eventMorphCloseTimerRef.current);
          eventMorphCloseTimerRef.current = null;
          eventMorphCloseRef.current = null;
        } else if (pendingClose
          && snapshot.state === MORPH_STATES.IDLE
          && snapshot.runId === pendingClose.runId) {
          window.clearTimeout(eventMorphCloseTimerRef.current);
          eventMorphCloseTimerRef.current = null;
          eventMorphCloseRef.current = null;
          pendingClose.complete();
        }
        setTransactionSnapshot(snapshot);
      },
    });
  }
  const transaction = transactionRef.current;

  useEffect(() => () => {
    window.clearTimeout(eventMorphCloseTimerRef.current);
  }, []);

  const closePhysicalEventInspector = () => {
    const current = transaction.getSnapshot();
    if (!isMorphActive(current.state) || eventMorphCloseRef.current?.runId === current.runId) {
      if (current.state === MORPH_STATES.IDLE) setInspect(null);
      return;
    }
    if (!startCloseWithLatestSource({ transaction, snapshot: current, registry: morphRegistry })) {
      setInspect(null);
      return;
    }
    closeSnapshotReleaseRef.current.trackClose({ key: current.key, runId: current.runId });
    eventMorphCloseRef.current = {
      runId: current.runId,
      complete: () => setInspect(null),
    };
    window.clearTimeout(eventMorphCloseTimerRef.current);
    eventMorphCloseTimerRef.current = window.setTimeout(
      () => transaction.settleClose(current.runId),
      MORPH_TIMING.OBJECT_CLOSE_MS + 80,
    );
  };

  useEffect(() => {
    let timer = null;
    const current = transaction.getSnapshot();

    if (!motionKey) {
      if (isMorphActive(current.state)) {
        const runId = current.runId;
        if (startCloseWithLatestSource({ transaction, snapshot: current, registry: morphRegistry })) {
          closeSnapshotReleaseRef.current.trackClose({ key: current.key, runId });
          timer = window.setTimeout(() => transaction.settleClose(runId), MORPH_TIMING.OBJECT_CLOSE_MS);
        }
      }
      return () => { if (timer != null) window.clearTimeout(timer); };
    }

    if (current.key && current.key !== motionKey && isMorphActive(current.state)) {
      const runId = current.runId;
      if (startCloseWithLatestSource({ transaction, snapshot: current, registry: morphRegistry })) {
        closeSnapshotReleaseRef.current.trackClose({ key: current.key, runId });
      }
      transaction.settleClose(runId);
    }

    const next = transaction.getSnapshot();
    if (next.key === motionKey && isMorphActive(next.state)) {
      return undefined;
    }

    const source = morphRegistry.getMorphSnapshot(motionKey, "source");
    if (!source?.rect) return undefined;
    const runId = transaction.startOpen({ key: motionKey, source });
    if (!runId) return undefined;
    timer = window.setTimeout(() => transaction.settleOpen(runId), MORPH_TIMING.OBJECT_OPEN_MS);
    return () => { if (timer != null) window.clearTimeout(timer); };
  }, [motionKey, motion?.kind, motion?.target, transaction]);

  const destinationSnapshot = motionKey
    ? morphRegistry.getMorphSnapshot(motionKey, "destination")
    : null;
  const motionContentReady = isDestinationContentRevealed({
    progress: transactionSnapshot.inFlightProgress,
    state: transactionSnapshot.state,
    fromRect: transactionSnapshot.sourceSnapshot?.rect,
    toRect: destinationSnapshot?.rect,
  });
  const InspectorSurface = inspect?.kind === "event" ? EventInspectorSurface : Sheet;

  return (
    <>
      <span aria-hidden="true" data-test="planner-surface-host" data-planner-surface-host=""
        data-surface-kind={surfaceKind({
        settings,
        shortcuts,
        search,
        missedSheet,
        noteHistory,
        notebook,
        noteEdit,
        scopeAsk,
        composer,
        listManager,
        listPicker,
        dependencyPicker,
        firstRun,
        confirmComplete,
        planAsk,
        discardAsk,
        inspectRecord,
        peekDay,
        })}
        data-motion-state={transactionSnapshot.state}
        data-motion-content-ready={motionContentReady ? "true" : "false"}
        style={{ display: "none" }} />
      {/* ══ MONTH PEEK ══ */}
      {peekDay && db && (() => {
        const { allDay: allDayP, timed: timedP, tasks: tasksP } = projectDayPeek(db, peekDay, { mapEvent: eventForUi });
        const openFrom = (kind, id) => {
          setPeekDay(null); beep("click");
          if (peekDay !== dateKey) jumpTo(peekDay);
          setTimeout(() => setInspect({ kind, id }), peekDay !== dateKey ? 80 : 0);
        };
        return (
          <Sheet T={T} destinationRef={motion?.target === "month-peek" ? destinationRef : null} title={fmtDay(peekDay)} onClose={() => setPeekDay(null)}
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
      {inspectRecord && physicalEventInspectorReady && (
        <InspectorSurface T={T} destinationRef={usesPhysicalEventInspector ? eventMorphDestinationRef : null} title={inspectSheetTitle}
          physical={usesPhysicalEventInspector}
          instant={inspect?.motion === "instant"}
          objectMorphSource={usesPhysicalEventInspector ? eventMorphSourceSnapshot : null}
          motionState={usesPhysicalEventInspector ? transactionSnapshot.state : null}
          onMorphClose={usesPhysicalEventInspector ? closePhysicalEventInspector : null}
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
                    {/* Promotion writes the record immediately, same as the Actions
                        list — Revert does not cover it. Keep the control visible in
                        read mode so Timeline and the list share one convert path. */}
                    {!inspectIsSubtask && <button type="button" onClick={() => promoteSub(inspect.id, item.id)}
                      style={{ color: T.dimText, background: T.faint }}
                      className="nb-tap inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[10px] font-bold tracking-[.08em] sm:hidden"
                      aria-label="Convert step to a subtask" title="Turn this checklist item into tracked child work">MAKE SUBTASK</button>}
                    {!inspectIsSubtask && <button type="button" onClick={() => promoteSub(inspect.id, item.id)} style={{ color: T.dimText }} className="nb-tap nb-hover-icon hidden h-11 w-11 shrink-0 items-center justify-center sm:inline-flex" aria-label="Convert step to a subtask" title="Turn this checklist item into tracked child work"><ArrowUpIcon /></button>}
                    {detailEditing && <button onClick={() => removeSub(inspect.id, item.id)} style={{ color: T.dimText }} className="text-xs px-1" aria-label="Remove step"><CloseIcon /></button>}
                  </div>
                ))}
              </section>

              <ActionProgress T={T} title={inspectDraft.title} checklist={inspectDraft.checklist}
                subtasks={inspectSubtasks} className="mt-3" />

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
                    <div className="flex flex-col gap-3">
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
                {/* Paired inside the group rather than each on its own line. Planning
                    above keeps the full width because it carries two lines and opens an
                    editing form; these four carry one bounded value each and were
                    spending a whole row on it. See rowSpan: the split is a min-width
                    floor, so a pair becomes two rows when the content stops fitting. */}
                <div data-test="row-pair" className="flex flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <InlineChoiceRow T={T} icon={<BellIcon size={13} />} span="half"
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
                  <DetailRow T={T} icon={<ClockIcon />} span="half">
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
                </div>
                {/* §8.2. The label names the attribute; it does not repeat the value
                    the selected chip already carries. */}
                {/* Category moved up from below the list row to partner the reward:
                    both are one bounded value, and leaving it stranded seven rows down
                    was the last full-width row that did not need to be one. */}
                <div data-test="row-pair" className="flex flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <InlineChoiceRow T={T} icon={<UiIcon size={13}><path d="m8 2.5 1.2 3.2 3.3 1.1-3.3 1.2L8 11.5l-1.2-3.5-3.3-1.2 3.3-1.1L8 2.5Z" /></UiIcon>} span="half"
                    open={inspectField === "reward"}
                    onToggle={() => openInspectField(inspectField === "reward" ? null : "reward")}
                    onBeginEdit={() => openInspectField("reward")}
                    label={`Worth ${inspectDraft.reward}`}
                    value={inspectDraft.reward} options={[20, 30, 40, 60].map((xp) => [xp, String(xp)])}
                    onPick={(xp) => editEntry({ xp })} />
                  <InlineChoiceRow T={T} icon={<UiIcon size={13}><path d="M8 2.5a5.5 5.5 0 1 0 0 11V2.5Z" /><circle cx="8" cy="8" r="5.5" /></UiIcon>} span="half"
                    open={inspectField === "category"}
                    onToggle={() => openInspectField(inspectField === "category" ? null : "category")}
                    onBeginEdit={() => openInspectField("category")}
                    label={inspectDraft.category} dot={catColor}
                    value={inspectDraft.category} options={CATS.map((c) => [c, c])}
                    onPick={(cat) => editEntry({ cat })} />
                </div>
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
          <div className={`${usesPhysicalEventInspector ? "text-left" : "text-center"} pt-1 pb-4`}>
            <div className={`flex items-center ${usesPhysicalEventInspector ? "justify-start" : "justify-center"} gap-2`}>
              <span data-morph-marker aria-hidden="true" className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(inspectDraft.cat) }} />
              <span data-morph-title className="min-w-0">
                <InlineText T={T} value={inspectDraft.title} ariaLabel="Event title"
                  onCommit={(title) => editEntry({ title })}
                  onBeginEdit={beginDetailEdit}
                  className="text-2xl font-bold tracking-tight leading-tight" style={{ textAlign: usesPhysicalEventInspector ? "left" : "center" }} />
              </span>
            </div>
            <div data-morph-meta>
              {inspectDraft.allDay ? (
                <p className="text-base font-semibold mt-1.5">All day</p>
              ) : (
                <div className={`flex items-center ${usesPhysicalEventInspector ? "justify-start" : "justify-center"} gap-1.5 mt-1.5`}>
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
            </div>
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
          <div className="flex gap-2 pb-5 mt-1">
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
                  ? (inspectDraft.allDay ? "—" : countdownLabel(dateKey, inspectDraft.start, todayKey, nowMin, inspectDraft.dur))
                  : `${(inspectDraft.checklist ?? []).filter((x) => x.done).length}/${(inspectDraft.checklist ?? []).length}`}
              </span>
              <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mt-0.5">
                {inspect.kind === "event" ? "STARTS" : "STEPS"}
              </span>
            </div>
          </div>

          {/* One row per attribute, each one the control for it (§4.6). Collapsed it
              costs a line; touched, it grows the alternatives underneath. */}
          {/* A wrapping band, not a column. The four bounded fields pair two-up and
              the ones whose content has no fixed length keep the full width — see
              rowSpan for why the split is a min-width floor rather than a
              breakpoint. */}
          <div data-test="attribute-band" className="flex flex-wrap gap-2 pt-1">
            <InlineChoice T={T} surface={surface} icon="◑" tint={catColor(inspectDraft.cat)} span="half"
              open={inspectField === "category"}
              onToggle={() => toggleEventDisclosure("category")}
              label={inspectDraft.cat || "—"} value={inspectDraft.cat} dot={catColor}
              options={CATS.map((c) => [c, c])} onPick={(cat) => editEntry({ cat })} />

            <InlineChoice T={T} surface={surface} icon={<ClockIcon />} label={inspectDraft.allDay ? "All day" : "At a time"} span="half"
              open={inspectField === "allDay"}
              onToggle={() => toggleEventDisclosure("allDay")}
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
            <InlineChoice T={T} surface={surface} icon={<RepeatIcon />} span="half"
              open={inspectField === "repeat"}
              onToggle={() => toggleEventDisclosure("repeat")}
              label={inspectDraft.repeat ? repeatLabel(inspectDraft.repeat) : "Does not repeat"}
              value={inspectDraft.repeat?.freq ?? "never"}
              options={REPEATS}
              onPick={(freq) => editEntry({ repeat: repeatFor(freq, inspectDraft.repeat, inspectDraft.date || dateKey) })} />

            <InlineChoice T={T} surface={surface} icon={<BellIcon size={13} />} span="half"
              open={inspectField === "reminder"}
              onToggle={() => toggleEventDisclosure("reminder")}
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

            {/* Full width by declaration, not by accident: the band wraps now, so a
                child with no basis shrinks to its own text. */}
            <div className="flex items-start gap-3 px-3 py-2.5" style={{ background: surface, borderRadius: CARD_R, ...rowSpan("full") }}>
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

          {/* The accent is the sheet's one loud voice, and it belongs to the action
              you opened the sheet to take. On an Action that is complete/reopen. On
              an Event it is not DUPLICATE — a rare errand that was outshouting the
              EDIT EVENT pill — so events get a quiet control instead. */}
          {!detailEditing && <>
            <EntityNotes T={T} notes={linkedNotes} kind={inspect.kind}
              onNew={newContextualNote}
              onOpen={(note) => { beep("click"); setInspect(null); setNoteEdit(note); }} />
            <button
              data-test="inspect-primary"
              onClick={() => {
                if (inspect.kind === "event") duplicateEvent(inspect.id);
                else { inspectDraft.status === "completed" ? reopenTask(inspect.id) : completeTask(inspect.id); requestSheetClose("inspect"); }
              }}
              style={inspect.kind === "event"
                ? { fontFamily: MONO, color: T.text, border: `1px solid ${T.line}` }
                : { fontFamily: MONO, background: T.accent, color: T.on }}
              className={`nb-tap nb-hover-control w-full py-3 mt-5 text-xs font-bold tracking-widest${inspect.kind === "event" ? "" : " nb-liquid"}`}>
              {inspect.kind === "event" ? "DUPLICATE" : inspectDraft.status === "completed" ? "REOPEN" : "MARK COMPLETE"}
            </button>
            <button onClick={() => removeItem(inspect.kind, inspect.id)} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap nb-hover-danger w-full py-3 mt-2 nb-label">DELETE</button>
          </>}
        </InspectorSurface>
      )}

      {discardAsk && (
        <Sheet T={T} title="UNSAVED CHANGES" onClose={() => { beep("click"); setDiscardAsk(false); }}>
          <h2 className="text-xl font-bold tracking-tight">Discard this edit?</h2>
          <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-1 mb-4">
            The saved {inspect?.kind === "event" ? "event" : "action"} will stay as it was.
          </p>
          <div className="flex flex-col gap-3">
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
      {planAsk && (
        <Sheet T={T} onClose={() => { beep("click"); setPlanAsk(null); }} title="PLAN">
          <div data-test="plan-when">
            <h2 className="text-xl font-bold tracking-tight">When should this land?</h2>
            <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-1 mb-4">
              Today is one option. The plan stays a choice until you pick it.
            </p>
            <div className="flex flex-col gap-3">
              {planWhenOptions(todayKey, { weekStart }).map((option) => option.id === "custom" ? (
                <label key={option.id} style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap relative py-3 text-center text-xs font-bold tracking-widest">
                  {option.label}
                  <input type="date" aria-label="Pick a day" className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => {
                      if (!e.target.value) return;
                      pullOverdue(planAsk.ids, e.target.value);
                      setPlanAsk(null);
                    }} />
                </label>
              ) : (
                <button key={option.id} onClick={() => { pullOverdue(planAsk.ids, option.date); setPlanAsk(null); }}
                  style={{ fontFamily: MONO, background: option.id === "today" ? T.accent : "transparent", color: option.id === "today" ? T.on : T.text, border: option.id === "today" ? "none" : `1px solid ${T.line}` }}
                  className="nb-tap nb-liquid nb-hover-control py-3 text-xs font-bold tracking-widest">{option.label}</button>
              ))}
            </div>
          </div>
        </Sheet>
      )}

      {confirmComplete && (
        <Sheet T={T} onClose={() => { beep("click"); setConfirmComplete(null); }} title="Still blocked">
          <p style={{ fontFamily: SERIF, color: T.dimText }} className="nb-voice mt-1 mb-3">
            {confirmComplete.reasons.map((reason) => (reason.kind === "dependencies"
              ? `Waiting on ${reason.blockers.map((b) => b.title).join(", ")}.`
              : `${reason.remaining} step${reason.remaining === 1 ? "" : "s"} still open.`)).join(" ")}
          </p>
          <div className="flex flex-col gap-3">
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
          <div className="flex flex-col gap-3">
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
        <Sheet T={T} destinationRef={motion?.target === "composer" ? destinationRef : null} title={composer.id ? "EDIT" : "NEW"} morph={composer.morph ?? (composer.notch ? "notch" : "auto")}
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
          <div className="flex flex-col gap-3">
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
        <Sheet T={T} destinationRef={motion?.target === "note" ? destinationRef : null} title="NOTE" onClose={() => { beep("click"); setNoteEdit(null); }}>
          <NoteEditor T={T} note={noteEdit} onSave={(text, title, provenance) => saveNote(noteEdit, text, title, provenance)} onDelete={() => noteEdit.id && doDelete("note", noteEdit.id, "all")}
            history={noteEdit.id ? revisionsFor(db.noteRevisions, noteEdit.id).length : 0}
            onHistory={() => { beep("click"); setNoteHistory(noteEdit.id); }}
            onPin={() => noteEdit.id && setNotePinned(noteEdit)}
            onArchive={() => noteEdit.id && setNoteArchived(noteEdit, !noteEdit.archived)} />
        </Sheet>
      )}

      {notebook && (
        <Sheet T={T} destinationRef={motion?.target === "notebook" ? destinationRef : null} title="NOTEBOOK" onClose={() => { beep("click"); setNotebook(null); }}>
          <NotebookPanel T={T} view={notebook} notes={getNotebookNotes(db.notes, notebook)}
            onView={(view) => { beep("tick"); setNotebook(view); }}
            onNew={() => { beep("click"); setNotebook(null); setNoteEdit({ kind: "standalone", blocks: [] }); }}
            onOpen={(note) => { beep("click"); setNotebook(null); setNoteEdit(note); }}
            onPin={setNotePinned}
            onArchive={(note) => setNoteArchived(note, !note.archived)} />
        </Sheet>
      )}

      {noteHistory && (
        <Sheet T={T} destinationRef={motion?.target === "note-history" ? destinationRef : null} title="HISTORY" onClose={() => { beep("click"); setNoteHistory(null); }}>
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
            <div className="flex flex-wrap gap-2 pt-1">
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

      <EventTimelineLens
        enabled={usesPhysicalEventInspector && eventMorphSourceSnapshot?.key === motionKey}
        sourceSnapshot={eventMorphSourceSnapshot}
        surfaceNode={eventMorphDestinationNode}
        state={transactionSnapshot.state}
        reducedMotion={typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)}
      />
      <MorphSurface
        transactionSnapshot={transactionSnapshot}
        registry={morphRegistry}
        transaction={transaction}
        hideAtRest={usesPhysicalEventInspector}
      />
    </>
  );
}
