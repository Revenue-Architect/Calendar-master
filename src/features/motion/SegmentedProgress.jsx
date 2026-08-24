import { useEffect, useRef } from "react";
import { progressSegmentDelay, progressSegmentStates } from "./progressGeometry.js";

export default function SegmentedProgress({
  T,
  done,
  total,
  ariaLabel,
  className = "",
  density = "full",
}) {
  const segmentCount = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const doneCount = Math.max(0, Math.min(segmentCount, Math.floor(Number.isFinite(done) ? done : 0)));
  const previousDone = useRef(doneCount);

  useEffect(() => {
    previousDone.current = doneCount;
  }, [doneCount]);

  if (!segmentCount) return null;

  const compact = density === "compact";
  const gap = compact ? 1 : 4;
  const height = compact ? 2 : 3;

  return (
    <div className={`flex ${className}`} role="progressbar"
      aria-valuemin={0} aria-valuemax={segmentCount} aria-valuenow={doneCount}
      aria-label={ariaLabel ?? `${doneCount} of ${segmentCount} steps done`}
      style={{ gap }}>
      {progressSegmentStates(doneCount, segmentCount).map((filled, index) => {
        const delay = progressSegmentDelay(index, previousDone.current, doneCount);
        return (
          <span key={index} className="flex-1 min-w-0 overflow-hidden"
            style={{ height, borderRadius: 999, background: T.faint }}>
            <span
              className={`nb-progress-fill block h-full w-full ${filled ? "is-filled" : "is-empty"}`}
              style={{
                background: T.accent,
                borderRadius: 999,
                transitionDelay: `${delay}ms`,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}
