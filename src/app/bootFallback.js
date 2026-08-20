/* Dependency-free DOM fallback used when the module graph or root creation
 * fails before React can render ErrorBoundary. It intentionally reports no
 * error message or user content: failures are classified in bootLifecycle. */

export const BOOT_SHELL_ID = "planner-boot-shell";
export const BOOT_FAILURE_ID = "planner-bootstrap-failure";

const GROUND = "#0A0A0C";
const INK = "#F4F4F5";
const DIM = "#A1A1AA";
const ACCENT = "#CCFF00";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function rootOf(documentLike) {
  try { return documentLike?.getElementById?.("root") || null; } catch { return null; }
}

export function removeBootShell(documentLike = globalThis.document) {
  try { documentLike?.getElementById?.(BOOT_SHELL_ID)?.remove?.(); } catch { /* no-op */ }
}

export function showBootstrapFailure(documentLike = globalThis.document) {
  const root = rootOf(documentLike);
  if (!root || !documentLike?.createElement) return false;
  removeBootShell(documentLike);
  let failure = documentLike.getElementById(BOOT_FAILURE_ID);
  if (failure) return true;

  failure = documentLike.createElement("div");
  failure.id = BOOT_FAILURE_ID;
  failure.setAttribute("role", "alert");
  failure.style.cssText = [
    `min-height:100dvh`, `box-sizing:border-box`, `padding:32px 24px`,
    `display:flex`, `align-items:center`, `justify-content:center`,
    `background:${GROUND}`, `color:${INK}`, `font-family:${MONO}`,
  ].join(";");

  const card = documentLike.createElement("div");
  card.style.cssText = "max-width:440px;width:100%;";
  const eyebrow = documentLike.createElement("p");
  eyebrow.textContent = "NOTEBOOK";
  eyebrow.style.cssText = `margin:0;color:${ACCENT};font-size:11px;letter-spacing:.16em;font-weight:700;`;
  const title = documentLike.createElement("h1");
  title.textContent = "The notebook is still here";
  title.style.cssText = `margin:10px 0 0;font-family:system-ui,sans-serif;font-size:28px;line-height:1.15;`;
  const copy = documentLike.createElement("p");
  copy.textContent = "The planner could not finish opening. Your local notebook has not been changed.";
  copy.style.cssText = `margin:12px 0 0;color:${DIM};font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;`;
  const button = documentLike.createElement("button");
  button.type = "button";
  button.textContent = "RELOAD";
  button.style.cssText = `margin-top:22px;padding:12px 16px;border:0;border-radius:10px;background:${ACCENT};color:${GROUND};font:700 12px ${MONO};letter-spacing:.1em;cursor:pointer;`;
  button.addEventListener("click", () => {
    try { globalThis.location?.reload?.(); } catch { /* host may deny reload */ }
  });
  card.append(eyebrow, title, copy, button);
  failure.appendChild(card);
  root.appendChild(failure);
  button.focus?.();
  return true;
}
