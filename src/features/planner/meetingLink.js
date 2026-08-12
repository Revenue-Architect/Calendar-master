/* A meeting link is stored as a full http(s) URL or as empty.
 *
 * Bare domains get `https://` prefixed so "meet.example.com/abc" still opens.
 * Anything that is not http(s) with a hostname that looks like a domain yields
 * "" — never javascript:, never a relative path, never the raw junk the user
 * typed. Renderers can put the stored value straight into `href`.
 *
 * Callers must persist the return value, not `normalized || raw`. Keeping an
 * unparseable string "so the user can fix it later" is how a Join button
 * later wraps a value it cannot open. An empty field is the honest stored
 * form of "this is not a link".
 */

export function normalizeMeetingLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".")) {
      return url.href;
    }
  } catch {
    /* not a URL */
  }
  return "";
}
