function recurrenceToRepeat(recurrence) {
  if (!recurrence) return null;
  return {
    freq: recurrence.frequency,
    interval: recurrence.interval ?? 1,
    ...(recurrence.byWeekday ? { byDay: recurrence.byWeekday.map((value) => (
      typeof value === "number" ? value : value.weekday
    )) } : {}),
    ...(recurrence.until ? { until: recurrence.until } : {}),
  };
}

export function projectTaskSearchResult(task) {
  return {
    ...task,
    kind: "task",
    date: task.planned?.date ?? null,
    repeat: recurrenceToRepeat(task.recurrence),
  };
}

export function projectNoteSearchResult(note, title) {
  return { ...note, kind: "note", title, date: note.date ?? null };
}

export function searchResultDateLabel(result, formatDate) {
  if (result.repeat) return "↻";
  if (result.date) return formatDate(result.date);
  return result.kind === "task" ? "INBOX" : "NOTE";
}
