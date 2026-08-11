import React from "react";
import { createRoot } from "react-dom/client";
import Planner from "./Planner.jsx";
import { ErrorBoundary } from "./app/ErrorBoundary.jsx";
import "./index.css";

/* The boundary sits outside Planner, not inside it: a crash in Planner's own
   render is exactly the case it exists for, and a boundary within the tree it
   guards goes down with it. */
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Planner />
    </ErrorBoundary>
  </React.StrictMode>
);
