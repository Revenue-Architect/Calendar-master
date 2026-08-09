import React from "react";
import { createRoot } from "react-dom/client";
import Planner from "./Planner.jsx";
import "./index.css";

/* Planner persists through a host-provided `window.storage`. When the app runs
   standalone there is no host, so back it with localStorage. A real host API,
   if one is present, is left alone. */
if (!window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key);
      return value === null ? null : { value };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
  };
}

const root = document.getElementById("root");

/* Themes live in component state, so mirror the active canvas colour onto
   <body> — otherwise overscroll exposes a mismatched strip on light themes. */
const syncBodyBg = () => {
  const page = root.firstElementChild;
  if (page) document.body.style.background = getComputedStyle(page).backgroundColor;
};
new MutationObserver(syncBodyBg).observe(root, { attributes: true, childList: true, subtree: true });

createRoot(root).render(
  <React.StrictMode>
    <Planner />
  </React.StrictMode>
);
