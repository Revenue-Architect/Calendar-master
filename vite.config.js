import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BUILD_ID = process.env.VITE_BUILD_ID || "calendar-master-0.1.0";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    /* Keep the lifecycle trail useful in a shipped bundle while allowing CI or
       a release job to stamp a commit/build identifier without touching app
       code. */
    "globalThis.__PLANNER_BUILD_ID__": JSON.stringify(BUILD_ID),
  },
  build: {
    /* The artifact ships as one HTML file with the CSS and JS inlined, and its
       CSP blocks every external request — so a font emitted as a separate asset
       would 404 and the whole interface would silently fall back. Raising the
       limit past the subset's 26 kB makes Vite base64 it into the stylesheet,
       which is the only form that survives. Keep this above the font's size:
       if it ever drops below, the failure is invisible in dev and total in the
       artifact. `tests/e2e/typography.spec.js` asserts the face actually loaded. */
    assetsInlineLimit: 64 * 1024,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    watch: {
      /* Generated artifact and QA output are products, not source. Watching
         them makes an artifact build reload an open development document and
         is the source of a particularly confusing blank/white refresh. */
      ignored: [
        "**/artifact/**",
        "**/dist/**",
        "**/test-results/**",
        "**/playwright-report/**",
        "**/reports/**",
        "**/screenshots/**",
      ],
    },
  },
});
