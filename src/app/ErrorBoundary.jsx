import React from "react";

/* The last thing standing between a render error and someone's notebook.
 *
 * Everything lives on this device. That changes what a crash means: in a cloud
 * app a white screen is an outage you wait out, but here the user's own instinct
 * — clear site data, reload, see if that fixes it — is the one action that
 * destroys everything they have. A blank page actively invites it.
 *
 * So the fallback has one job beyond apologising: get the notebook off the
 * device before anyone starts troubleshooting. It reads storage directly rather
 * than taking state from the app, because the app is precisely what has just
 * failed — a crash caused by a bad record still leaves that record exportable,
 * and an export is worth having even when it is the thing that broke.
 *
 * It also refuses to trust its own surroundings: no theme (that lives in the
 * state that may be gone), no shared components (any of them could be the
 * thing that threw), no imports beyond React. Plain markup and inline styles,
 * so the only way this screen fails is if React itself is broken.
 */

/* The planner's keys, oldest first. Whichever is present is the real notebook —
   a crash during a migration is exactly when this matters most. */
const STATE_KEYS = ["nbmp:state:v8", "nbmp:state:v7", "nbmp:state:v6", "nbmp:state:v5", "nbmp:state:v4"];

const GROUND = "#0A0A0C";
const INK = "#F4F4F5";
const DIM = "#797987";
const ACCENT = "#CCFF00";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function readNotebook() {
  for (const key of STATE_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return { key, raw };
    } catch {
      /* Storage itself may be the thing that is broken. Keep looking. */
    }
  }
  return null;
}

function downloadNotebook(found) {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([found.raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `planner-recovery-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  /* Revoked on the next frame rather than immediately: Safari has cancelled the
     download when the URL went away in the same tick. */
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, saved: false };
  }

  static getDerivedStateFromError(error) {
    return { error, saved: false };
  }

  componentDidCatch(error, info) {
    /* Console only. There is nowhere to send this — the app has no network — and
       writing a crash report into the same storage that may have caused it is
       how a bad record becomes a boot loop. */
    // eslint-disable-next-line no-console
    console.error("Planner crashed", error, info?.componentStack);
  }

  render() {
    const { error, saved } = this.state;
    if (!error) return this.props.children;

    const found = readNotebook();
    const button = {
      fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
      padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer",
    };

    return (
      <div role="alert" style={{
        minHeight: "100dvh", background: GROUND, color: INK,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        fontFamily: "var(--font-display, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif)",
      }}>
        <div style={{ maxWidth: 460, width: "100%" }}>
          <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.14em", color: ACCENT, margin: 0 }}>
            SOMETHING BROKE
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
            The planner stopped drawing
          </h1>

          {found ? (
            <>
              <p style={{ fontSize: 15, lineHeight: 1.5, color: INK, margin: "12px 0 0" }}>
                Your notebook is still on this device. Save a copy before anything
                else — clearing site data would erase it, and that is the first
                thing most fixes ask you to do.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
                <button type="button" autoFocus
                  onClick={() => { downloadNotebook(found); this.setState({ saved: true }); }}
                  style={{ ...button, background: ACCENT, color: "#0A0A0C" }}>
                  {saved ? "SAVE ANOTHER COPY" : "SAVE A COPY"}
                </button>
                <button type="button" onClick={() => window.location.reload()}
                  style={{ ...button, background: "transparent", color: INK, boxShadow: "inset 0 0 0 1px #2A2A34" }}>
                  RELOAD
                </button>
              </div>
              {saved && (
                <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", color: ACCENT, marginTop: 12 }}>
                  SAVED · SETTINGS → IMPORT RESTORES IT
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 15, lineHeight: 1.5, margin: "12px 0 0" }}>
                No saved notebook was found on this device, so there is nothing to
                rescue — reloading is safe.
              </p>
              <button type="button" autoFocus onClick={() => window.location.reload()}
                style={{ ...button, background: ACCENT, color: "#0A0A0C", marginTop: 20 }}>
                RELOAD
              </button>
            </>
          )}

          {/* Last, small, and not the point — but the only thing that makes the
              crash reportable, so it is on screen rather than in a console
              nobody opens on a phone. */}
          <details style={{ marginTop: 24 }}>
            <summary style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", color: DIM, cursor: "pointer" }}>
              WHAT HAPPENED
            </summary>
            <pre style={{
              fontFamily: MONO, fontSize: 11, lineHeight: 1.5, color: DIM,
              whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 10,
            }}>
              {String(error?.stack || error?.message || error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
