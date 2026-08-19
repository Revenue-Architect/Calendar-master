/* A length of time, as a person would say it.
 *
 * Minutes are the single stored representation everywhere in this app — an
 * event's `dur`, a task's estimate, a reminder's offset are all plain numbers.
 * This is the one place that turns one into words, so "90" reads as "1h 30m"
 * identically on a card, in a sheet and in a toast.
 *
 * It rounds rather than truncates below the hour, because a 44.6-minute gap
 * that renders as "44m" reads as a measurement error to someone who just set
 * it to 45.
 */
export const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${Math.round(m)}m`);
