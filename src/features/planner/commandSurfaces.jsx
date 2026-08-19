/* The two things the command sheet can be showing.
 *
 * `CommandPalette` is the one input over what you have and what you can do;
 * `ShortcutSheet` is the key list. They share a sheet and a `surface` prop,
 * and nothing else in the planner renders either, so they move together.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { MONO, SERIF } from "../../design/typography.js";
import { scrollChildIntoContainer } from "../accessibility/dialogFocus.js";

import { SHORTCUTS } from "./constants.js";

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

export {
  CommandPalette,
  ShortcutSheet,
};
