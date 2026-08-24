import { MONO } from "../../design/typography.js";
import { checklistProgress } from "../../domains/tasks/index.js";
import SegmentedDonut from "../motion/SegmentedDonut.jsx";
import SegmentedProgress from "../motion/SegmentedProgress.jsx";
import "../motion/progressGeometry.js";

function checklistTrack(value) {
  if (Array.isArray(value) || value == null) return checklistProgress(value);
  return {
    done: Math.max(0, Number(value.done) || 0),
    total: Math.max(0, Number(value.total) || 0),
  };
}

function subtaskTrack(value) {
  if (Array.isArray(value)) {
    const required = value.filter((child) => child.status !== "cancelled");
    const done = required.filter((child) => child.status === "completed").length;
    return { done, total: required.length };
  }
  if (value == null) return { done: 0, total: 0 };
  return {
    done: Math.max(0, Number(value.done) || 0),
    total: Math.max(0, Number(value.total) || 0),
  };
}

export default function ActionProgress({
  T,
  title = "Action",
  checklist,
  subtasks,
  density = "full",
  className = "",
  style,
}) {
  const check = checklistTrack(checklist);
  const kids = subtaskTrack(subtasks);
  const tracks = [];
  if (check.total > 0) {
    tracks.push({
      kind: "checklist",
      label: "STEPS",
      done: check.done,
      total: check.total,
      ariaLabel: `${title}: ${check.done} of ${check.total} checklist steps complete`,
    });
  }
  if (kids.total > 0) {
    tracks.push({
      kind: "subtasks",
      label: "SUBTASKS",
      done: kids.done,
      total: kids.total,
      ariaLabel: `${title}: ${kids.done} of ${kids.total} subtasks complete`,
    });
  }
  if (!tracks.length) return null;

  const compact = density === "compact";
  if (compact) {
    return (
      <div
        data-test="timeline-action-progress"
        data-density="compact"
        className={`nb-action-progress-donut ${className}`}
        style={style}
      >
        <SegmentedDonut T={T} tracks={tracks} size={18} />
      </div>
    );
  }

  return (
    <div
      data-test="action-progress"
      data-density={density}
      className={`flex flex-col gap-1.5 ${className}`}
      style={style}
    >
      {tracks.map((track) => (
        <div
          key={track.kind}
          data-test={`action-progress-${track.kind}`}
          className="flex items-center gap-2 min-w-0"
        >
          <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">{track.label}</span>
          <span style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">{track.done} / {track.total}</span>
          <SegmentedProgress
            T={T}
            done={track.done}
            total={track.total}
            ariaLabel={track.ariaLabel}
            density={density}
            className="flex-1 min-w-0"
          />
        </div>
      ))}
    </div>
  );
}
