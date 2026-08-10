/* Which commands a typed fragment means, and in what order.
 *
 * The palette is one input over two different things — the things you have
 * (search results) and the things you can do (commands) — so the ranking has to
 * be predictable enough that muscle memory works. Four tiers, strongest first:
 *
 *   1. the label starts with what you typed        "new e"  → New event
 *   2. a word inside the label starts with it      "event"  → New event
 *   3. the label contains it anywhere              "vent"   → New event
 *   4. the letters appear in order, as an acronym  "ne"     → New event
 *
 * Within a tier, shorter labels win — a fragment is more likely to mean the
 * smaller word it fully covers — and ties fall back to declared order, so the
 * list never reshuffles between two keystrokes that scored the same.
 *
 * Keywords let a command answer to words that are not in its label ("dark" and
 * "light" finding Switch theme) without those words having to be shown.
 */

const EXACT = 0;
const WORD_PREFIX = 1;
const SUBSTRING = 2;
const SUBSEQUENCE = 3;
const NO_MATCH = 4;

function normalize(value) {
  return String(value ?? "").toLowerCase().trim();
}

/* Letters in order but not adjacent: "nev" matches "new event". Cheap because
   the needle is a fragment somebody is typing, never a document. */
function isSubsequence(needle, haystack) {
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return needle.length === 0;
}

function tierFor(query, text) {
  if (!text) return NO_MATCH;
  if (text.startsWith(query)) return EXACT;
  if (text.split(/[\s/-]+/).some((word) => word.startsWith(query))) return WORD_PREFIX;
  if (text.includes(query)) return SUBSTRING;
  if (isSubsequence(query, text)) return SUBSEQUENCE;
  return NO_MATCH;
}

/** The best tier this command answers to, or NO_MATCH. */
function scoreCommand(command, query) {
  const candidates = [command.label, ...(command.keywords ?? [])].map(normalize);
  return Math.min(...candidates.map((candidate) => tierFor(query, candidate)));
}

/**
 * Rank commands against a typed fragment.
 *
 * An empty query returns the commands in declared order, which is what the
 * palette shows the moment it opens — the list is a menu before it is a filter.
 *
 * @param {Array}  commands  `{ id, label, keywords? }` in the order they should
 *                           appear when nothing is typed
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.limit]
 * @returns {Array} the matching commands, best first
 */
export function matchCommands(commands, query, { limit = 8 } = {}) {
  const list = Array.isArray(commands) ? commands : [];
  const needle = normalize(query);
  if (!needle) return list.slice(0, limit);

  return list
    .map((command, order) => ({ command, order, tier: scoreCommand(command, needle) }))
    .filter((entry) => entry.tier !== NO_MATCH)
    .sort((left, right) => (
      left.tier - right.tier
      || normalize(left.command.label).length - normalize(right.command.label).length
      || left.order - right.order
    ))
    .slice(0, limit)
    .map((entry) => entry.command);
}
