/* §4.6. The value is the field.
 *
 * These render as the record reads until they are touched, then take the
 * control in place — same surface, same box, so nothing reflows and focusing a
 * field never feels like arriving somewhere else.
 *
 * QuickAddHint sits with them because it is what the quick-add field says when
 * it has nothing to show yet.
 */
import React, { useEffect, useRef, useState } from "react";

import { parseInline } from "../../domains/notes/index.js";
import { dur } from "../../shared/time/duration.js";
import { MONO, SERIF } from "../../design/typography.js";
import { useLiquidPill } from "../motion/liquidPill.js";
import { CARD_R } from "./constants.js";
import { rowSpan } from "./editorRowSpan.js";
import { CloseIcon } from "./icons.jsx";
import { LiquidPillIndicator } from "./liquid.jsx";
import PillNav from "./PillNav.jsx";
import { QUICK_ADD_SYNTAX } from "./quickAdd.js";

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
function InlineChoice({ T, surface, icon, label, options, value, onPick, tint = null, dot = null, children = null, editable = true, onBeginEdit = null, open: openProp = undefined, onToggle = null, span = "full" }) {
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
    <div style={{ background: tint ? `${tint}22` : surface, borderRadius: CARD_R, ...rowSpan(span, open) }} className="overflow-hidden">
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

/* §4.4/§4.6. The same expansion inside the task's grouped rules card, which reads as
   one block of rules with its icons on the right — so the choices cannot bring their
   own surface without breaking the group. */
function InlineChoiceRow({ T, icon, label, sub, options, value, onPick, dot = null, divider = false, editable = true, onBeginEdit = null, open: openProp = undefined, onToggle = null, span = "full" }) {
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
    <div style={{ borderBottom: divider ? `1px solid ${T.line}` : "none", ...rowSpan(span, open) }}>
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
function InlineField({ T, surface, icon, children, tint = null, span = "full" }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: tint ? `${tint}22` : surface, borderRadius: CARD_R, ...rowSpan(span) }}>
      <span style={{ color: tint || T.dim }} className="text-sm shrink-0 w-4 text-center">{icon}</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">{children}</div>
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

export {
  DurationPicker,
  Inline,
  InlineAdd,
  InlineChoice,
  InlineChoiceRow,
  InlineField,
  InlineNative,
  InlineStamp,
  InlineText,
  LabeledNative,
  NewListField,
  QuickAddHint,
  TagField,
};
