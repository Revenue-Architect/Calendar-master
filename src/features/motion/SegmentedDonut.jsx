import { useEffect, useRef } from "react";
import { progressRingSegments, progressSegmentDelay, progressSegmentStates } from "./progressGeometry.js";

function Ring({
  T,
  done,
  total,
  cx,
  cy,
  r,
  strokeWidth,
  ariaLabel,
  testId,
  ring,
}) {
  const segmentCount = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const doneCount = Math.max(0, Math.min(segmentCount, Math.floor(Number.isFinite(done) ? done : 0)));
  const previousDone = useRef(doneCount);

  useEffect(() => {
    previousDone.current = doneCount;
  }, [doneCount]);

  if (!segmentCount) return null;

  const segments = progressRingSegments(segmentCount, { cx, cy, r });
  const states = progressSegmentStates(doneCount, segmentCount);

  return (
    <g
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={segmentCount}
      aria-valuenow={doneCount}
      aria-label={ariaLabel}
      data-test={testId}
      data-ring={ring}
    >
      {segments.map((seg, index) => {
        const filled = states[index];
        const delay = progressSegmentDelay(index, previousDone.current, doneCount);
        const paint = {
          fill: "none",
          strokeWidth,
          strokeLinecap: "butt",
        };
        const fillPaint = {
          ...paint,
          strokeDasharray: seg.length,
          strokeDashoffset: filled ? 0 : seg.length,
          className: "nb-progress-arc",
          style: { transitionDelay: `${delay}ms` },
        };
        if (seg.kind === "circle") {
          return (
            <g key={index}>
              <circle cx={seg.cx} cy={seg.cy} r={seg.r} stroke={T.faint} {...paint} />
              <circle
                cx={seg.cx}
                cy={seg.cy}
                r={seg.r}
                stroke={T.accent}
                transform={`rotate(-90 ${seg.cx} ${seg.cy})`}
                {...fillPaint}
              />
            </g>
          );
        }
        return (
          <g key={index}>
            <path d={seg.d} stroke={T.faint} {...paint} />
            <path d={seg.d} stroke={T.accent} {...fillPaint} />
          </g>
        );
      })}
    </g>
  );
}

export default function SegmentedDonut({ T, tracks, size = 18, className = "" }) {
  if (!tracks.length) return null;
  const dual = tracks.length > 1;
  const outer = tracks[0];
  const inner = dual ? tracks[1] : null;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className}>
      <Ring
        T={T}
        done={outer.done}
        total={outer.total}
        cx={10}
        cy={10}
        r={7.35}
        strokeWidth={dual ? 2 : 2.15}
        ariaLabel={outer.ariaLabel}
        testId={`action-progress-${outer.kind}`}
        ring="outer"
      />
      {inner && (
        <Ring
          T={T}
          done={inner.done}
          total={inner.total}
          cx={10}
          cy={10}
          r={4.05}
          strokeWidth={1.65}
          ariaLabel={inner.ariaLabel}
          testId={`action-progress-${inner.kind}`}
          ring="inner"
        />
      )}
    </svg>
  );
}
