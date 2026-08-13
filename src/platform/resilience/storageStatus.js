const CANONICAL_STORAGE_SCOPES = new Set(["planner", "device"]);

export function isCanonicalStorageScope(scope) {
  return CANONICAL_STORAGE_SCOPES.has(scope);
}

export function classifyStorageFailures(failures) {
  const scopes = [...(failures || [])];
  return {
    canonical: scopes.some(isCanonicalStorageScope),
    supporting: scopes.filter((scope) => !isCanonicalStorageScope(scope)),
  };
}
