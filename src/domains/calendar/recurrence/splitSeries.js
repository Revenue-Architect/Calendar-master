export function resolveOccurrenceAlias(aliases, occurrenceId, maxHops = 32) {
  const targets = new Map((aliases || []).map((alias) => [alias.from, alias.to]));
  const seen = new Set([occurrenceId]);
  let current = occurrenceId;
  let hops = 0;
  while (targets.has(current)) {
    current = targets.get(current);
    hops += 1;
    if (seen.has(current)) return { status: "cycle", occurrenceId };
    if (hops > maxHops) return { status: "limit", occurrenceId };
    seen.add(current);
  }
  return { status: hops ? "resolved" : "unchanged", occurrenceId: current, hops };
}

export function assertAliasSet(aliases) {
  const sources = new Set();
  for (const alias of aliases || []) {
    if (!alias || typeof alias.from !== "string" || typeof alias.to !== "string" || !alias.from || !alias.to) {
      throw new TypeError("occurrence aliases require from and to IDs");
    }
    if (sources.has(alias.from)) throw new Error(`occurrence alias ${alias.from} is duplicated`);
    sources.add(alias.from);
    if (resolveOccurrenceAlias(aliases, alias.from).status === "cycle") {
      throw new Error("occurrence alias cycle is not allowed");
    }
  }
  return aliases;
}
