import React from "react";
import { createRoot } from "react-dom/client";
import Planner from "./Planner.jsx";
import { ErrorBoundary } from "./app/ErrorBoundary.jsx";
import { removeBootShell, showBootstrapFailure } from "./app/bootFallback.js";
import { markRootCommitted, recordBootstrapFailure, startBootLifecycle } from "./app/bootLifecycle.js";
import "./index.css";

startBootLifecycle();

function RootCommitMarker({ children }) {
  React.useEffect(() => {
    markRootCommitted();
    removeBootShell();
    globalThis.__plannerBootCommit?.();
  }, []);
  return children;
}

/* The boundary sits outside Planner, not inside it: a crash in Planner's own
   render is exactly the case it exists for, and a boundary within the tree it
   guards goes down with it. */
try {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("root element is missing");
  createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <RootCommitMarker>
          <Planner />
        </RootCommitMarker>
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch {
  recordBootstrapFailure("root-create");
  showBootstrapFailure();
  globalThis.__plannerShowBootstrapFailure?.();
}
