import React, { useEffect, useRef } from "react";

import { progressSegmentStates } from "../motion/progressGeometry.js";

/* A checklist reports a count, not an ordered pipeline. Keeping the segment
   geometry here means the Actions list and its edit sheet cannot drift into
   different progress languages again. */
export default function SegmentedProgress({ T, done, total, ariaLabel, className = "" }) {
  const segmentCount = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const doneCount = Math.max(0, Math.min(segmentCount, Math.floor(Number.isFinite(done) ? done : 0)));
  const previousDone = useRef(doneCount);

  useEffect(() => {
    previousDone.current = doneCount;
  }, [doneCount]);

  if (!segmentCount) return null;

  return (
    <div className={`flex gap-1 ${className}`} role="progressbar"
      aria-valuemin={0} aria-valuemax={segmentCount} aria-valuenow={doneCount}
      aria-label={ariaLabel ?? `${doneCount} of ${segmentCount} steps done`}>
      {progressSegmentStates(doneCount, segmentCount).map((filled, index) => {
        const delay = Math.max(0, index - Math.min(doneCount, previousDone.current)) * 60;
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
  );
}
