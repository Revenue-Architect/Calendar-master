/* Why this is in features/motion and not features/planner: it renders no
 * content of its own and exists only for the transition — the same reason
 * Sheet.jsx lives here. The comment below is the one it arrived with.
 */
import React from "react";

/* An inline surface that grows open and folds closed instead of popping — the same
   grid-rows idiom the choice rows use, shared by the Settings confirmations. */
export default function Reveal({ open, children }) {
  return (
    <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 260ms cubic-bezier(.23,1,.32,1)" }}>
      <div className="overflow-hidden" inert={!open} style={{ minHeight: 0, visibility: open ? "visible" : "hidden", transition: `visibility 0s linear ${open ? 0 : 300}ms` }}>
        {children}
      </div>
    </div>
  );
}
