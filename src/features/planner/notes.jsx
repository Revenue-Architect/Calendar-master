/* The notebook's own surfaces: a block as it reads on the page, the history
 * behind a note, the notes attached to an entity, the notebook list, and the
 * editor itself.
 *
 * They moved as one group because they are one concept and they share
 * helpers: `orderedIndex` numbers a run of list items and `noteContextLabel`
 * names a note's origin. The label has no caller outside this file, so it
 * stays private; `orderedIndex` is still used by ActionsPanel and is exported
 * until that moves too.
 */
import React, { useEffect, useMemo, useState } from "react";

import { NOW_RED } from "../../design/themes.js";
import { DISPLAY, MONO, SERIF } from "../../design/typography.js";
import {
  blocksToShorthand,
  instantiateBuiltInNoteTemplate,
  listBuiltInNoteTemplates,
  noteExcerpt,
  plainText,
  revisionIsIntact,
} from "../../domains/notes/index.js";
import { uid } from "../../shared/ids.js";
import { fmtTime } from "../../shared/time/clockFormat.js";

import PillNav from "./PillNav.jsx";
import { fmtDay } from "./dateLabels.js";
import { Inline } from "./fields.jsx";
import { PinIcon } from "./icons.jsx";

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

export {
  EntityNotes,
  NoteBlock,
  NoteEditor,
  NoteHistory,
  NotebookPanel,
  orderedIndex,
};
