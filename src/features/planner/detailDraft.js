function owns(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function hasDetailDraft(draft) {
  return Boolean(draft && Object.keys(draft).length);
}

export function applyDetailDraft(kind, item, draft, fallbackDate) {
  if (!hasDetailDraft(draft)) return item;

  if (kind === "task") {
    const plannedDate = draft.unplanned
      ? null
      : (draft.date ?? item.planned.date ?? fallbackDate);

    return {
      ...item,
      title: draft.title ?? item.title,
      category: draft.cat ?? item.category,
      reward: draft.xp ?? item.reward,
      note: draft.note ?? item.note,
      status: draft.status ?? item.status,
      listId: draft.listId ?? item.listId,
      tags: draft.tags ?? item.tags,
      reminders: draft.reminders ?? item.reminders,
      planned: {
        ...item.planned,
        date: plannedDate,
        startMinute: draft.unplanned
          ? null
          : (owns(draft, "at") ? draft.at : item.planned.startMinute),
        estimateMinutes: owns(draft, "estimate")
          ? draft.estimate
          : item.planned.estimateMinutes,
      },
      deadline: {
        ...item.deadline,
        date: owns(draft, "due") ? (draft.due || null) : item.deadline.date,
      },
      recurrence: owns(draft, "repeat")
        ? (draft.repeat
          ? { ...draft.repeat, frequency: draft.repeat.freq ?? draft.repeat.frequency }
          : null)
        : item.recurrence,
    };
  }

  return {
    ...item,
    title: draft.title ?? item.title,
    cat: draft.cat ?? item.cat,
    place: draft.place ?? item.place,
    link: draft.link ?? item.link,
    note: draft.note ?? item.note,
    start: draft.start ?? item.start,
    dur: draft.dur ?? item.dur,
    date: draft.date ?? item.date,
    allDay: owns(draft, "allDay") ? draft.allDay : item.allDay,
    endDate: draft.endDate ?? item.endDate,
    alerts: draft.alerts ?? item.alerts,
    repeat: owns(draft, "repeat") ? draft.repeat : item.repeat,
  };
}

export function buildDetailEntryPayload(kind, item, fallbackDate) {
  if (kind === "event") return { ...item, kind, id: item.id };

  return {
    kind: "task",
    id: item.id,
    title: item.title,
    cat: item.category,
    xp: item.reward,
    at: item.planned.startMinute,
    estimate: item.planned.estimateMinutes,
    due: item.deadline.date || "",
    date: item.planned.date || fallbackDate,
    unplanned: !item.planned.date,
    note: item.note,
    status: item.status,
    followUpDate: item.followUpDate ?? null,
    listId: item.listId,
    tags: item.tags ?? [],
    reminders: item.reminders ?? [],
    repeat: item.recurrence
      ? {
        ...item.recurrence,
        freq: item.recurrence.frequency,
        byDay: item.recurrence.byWeekday,
      }
      : null,
  };
}

export function buildTaskWritePatch(payload, fallbackDate) {
  return {
    title: payload.title,
    category: payload.cat,
    reward: payload.xp,
    note: payload.note,
    planned: {
      date: payload.unplanned ? null : (payload.date || fallbackDate),
      startMinute: payload.unplanned ? null : (payload.at ?? null),
      estimateMinutes: payload.estimate ?? null,
    },
    deadline: { date: payload.due || null, minute: null },
    recurrence: payload.repeat
      ? {
        ...payload.repeat,
        frequency: payload.repeat.freq ?? payload.repeat.frequency,
        missedPolicy: payload.repeat.missedPolicy ?? "skip",
      }
      : null,
    ...(payload.status ? {
      status: payload.status,
      followUpDate: payload.status === "waiting" ? (payload.followUpDate ?? null) : null,
    } : {}),
    ...(payload.listId ? { listId: payload.listId } : {}),
    ...(Array.isArray(payload.tags) ? { tags: payload.tags } : {}),
    ...(Array.isArray(payload.reminders) ? { reminders: payload.reminders } : {}),
  };
}

export function durationFromClockRange(startMinute, endMinute) {
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute >= 1440) {
    throw new RangeError("startMinute must be an integer from 0 through 1439");
  }
  if (!Number.isInteger(endMinute) || endMinute < 0 || endMinute >= 1440) {
    throw new RangeError("endMinute must be an integer from 0 through 1439");
  }
  return (endMinute > startMinute ? endMinute : endMinute + 1440) - startMinute;
}

export function durationFromDatedClockRange(startDate, startMinute, endDate, endMinute) {
  const clockDuration = durationFromClockRange(startMinute, endMinute);
  const daySpan = diffDays(endDate, startDate);
  if (daySpan < 0) throw new RangeError("endDate cannot be before startDate");
  if (daySpan === 0) return clockDuration;
  return daySpan * 1440 + endMinute - startMinute;
}
import { diffDays } from "../../shared/time/dateKey.js";
