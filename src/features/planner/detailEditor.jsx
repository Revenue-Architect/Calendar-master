/* The two controls the detail sheet grows when it goes into editing mode.
 *
 * `EventScheduleEditor` is when-it-happens — start, end, and the date the end
 * lands on once a duration crosses midnight. `FluidEditActions` is the
 * EDIT / REVERT / SAVE group that morphs between its resting and editing
 * widths. Both are rendered only by the detail sheet, which is why they are
 * one module.
 */
import React from "react";

import { isDark, mixHex } from "../../design/colorMix.js";
import { MONO } from "../../design/typography.js";
import { fromHhmm, hhmm } from "../../shared/time/clockFormat.js";
import { addDaysToKey } from "../../shared/time/dateKey.js";

import { CARD_R } from "./constants.js";
import { durationFromDatedClockRange } from "./detailDraft.js";
import { DurationPicker, LabeledNative } from "./fields.jsx";

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

export {
  EventScheduleEditor,
  FluidEditActions,
};
