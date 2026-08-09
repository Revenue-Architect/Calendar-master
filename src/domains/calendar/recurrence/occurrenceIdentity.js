function encode(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function makeOccurrenceId(seriesId, anchor) {
  if (typeof seriesId !== "string" || !seriesId) throw new TypeError("series ID is required");
  if (typeof anchor !== "string" || !anchor) throw new TypeError("recurrence anchor is required");
  return `occ.v1.${encode(seriesId)}.${encode(anchor)}`;
}

export function parseOccurrenceId(id) {
  const match = /^occ\.v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(id));
  if (!match) throw new TypeError("occurrence ID is invalid");
  try {
    return { seriesId: decode(match[1]), anchor: decode(match[2]) };
  } catch {
    throw new TypeError("occurrence ID is invalid");
  }
}
