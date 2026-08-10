const FILTER_NAMES = Object.freeze({
  type: "types",
  status: "statuses",
  tag: "tags",
  date: "dates",
  list: "lists",
  calendar: "calendars",
});

const EMPTY_FILTERS = Object.freeze({
  types: [],
  statuses: [],
  tags: [],
  dates: [],
  lists: [],
  calendars: [],
});

export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function emptyFilters() {
  return Object.fromEntries(Object.keys(EMPTY_FILTERS).map((name) => [name, []]));
}

function pushWords(terms, value) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return;
  terms.push(...normalized.split(" "));
}

export function parseSearchQuery(raw) {
  const source = String(raw ?? "");
  const terms = [];
  const filters = emptyFilters();
  const issues = [];
  const tokenPattern = /"([^"]*)"|(\S+)/g;

  for (const match of source.matchAll(tokenPattern)) {
    if (match[1] != null) {
      const phrase = normalizeSearchText(match[1]);
      if (phrase) terms.push(phrase);
      continue;
    }

    const token = match[2];
    const separator = token.indexOf(":");
    if (separator <= 0 || separator === token.length - 1) {
      pushWords(terms, token);
      continue;
    }

    const name = token.slice(0, separator).toLocaleLowerCase();
    const field = FILTER_NAMES[name];
    if (!field) {
      issues.push({ token, reason: "unsupported-filter" });
      continue;
    }

    const value = normalizeSearchText(token.slice(separator + 1));
    if (value) filters[field].push(value);
  }

  return {
    text: normalizeSearchText(source),
    terms,
    filters,
    issues,
  };
}
