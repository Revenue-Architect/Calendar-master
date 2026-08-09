export function resolveTaskForInspection(dayTasks, tasks, id) {
  return dayTasks.find((task) => task.id === id)
    ?? tasks.find((task) => task.id === id)
    ?? null;
}
