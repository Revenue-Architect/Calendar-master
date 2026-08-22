/* Every theme, every width, every surface — on one page.
 *
 * A typography and material change touches every pixel in every one of fifteen
 * themes, and no unit test can see any of it. The browser suite proves that a
 * button still opens a sheet; it has nothing to say about whether a dim label on
 * a cream ground is now illegible, or whether a shadow tuned for obsidian reads
 * as a smear on linen.
 *
 * So this is not an assertion. It is the thing a person actually looks at:
 * 15 themes × 2 widths × 4 surfaces = 120 frames, assembled into a single page,
 * captured before a change and after it, and compared by eye.
 *
 *   node scripts/contact-sheet.mjs --out before
 *   …make the change…
 *   node scripts/contact-sheet.mjs --out after
 *
 * Each run writes PNGs plus an index.html. Open the two side by side.
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import { THEMES } from "../src/design/themes.js";

const BASE = process.env.SHEET_BASE || "http://127.0.0.1:4321";
const OUT = path.resolve(process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "contact-sheet");
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

/* The fixture below is deliberately v4-shaped. Store it under the matching
   legacy key so loadPlannerState exercises the real migration chain instead of
   treating an old object as a malformed v8 notebook. */
const STATE_KEY = "nbmp:state:v4";
const PREFS_KEY = "nbmp:preferences:v1";

const WIDTHS = [
  { id: "phone", width: 393, height: 844, mobile: true },
  { id: "desk", width: 1280, height: 900, mobile: false },
];

/* The four surfaces worth looking at, ordered so each one is reachable from the
   last by a click. Reloading between them was costing three page loads per
   theme per width — ninety loads that bought nothing, on a tool whose whole
   value is being cheap enough to run on every visual change. */
const SURFACES = [
  { id: "day", reach: async () => {} },
  { id: "week", reach: async (page) => { await page.locator('[data-test="zoom-out"]').click(); } },
  { id: "month", reach: async (page) => { await page.locator('[data-test="zoom-out"]').click(); } },
  { id: "sheet", reach: async (page) => {
      await page.locator('[data-test="zoom-in"]').click();
      await page.locator('[data-test="zoom-in"]').click();
      await page.locator('[data-test="new-entry"]').click();
    } },
];

/* A day with something in it. Built by hand rather than seeded through the
   domain, because a contact sheet wants the same pixels every run and a seeded
   notebook drifts with the clock. */
function notebook() {
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const at = (h, m, dur) => ({ date: key, start: h * 60 + m, dur });
  return {
    /* This fixture intentionally uses the compact legacy shape below. Let the
       app's real v4→v8 migration path normalize it instead of labelling a
       v4-shaped object as v8 (which correctly triggers the unreadable-notebook
       recovery UI and makes every contact-sheet frame a false negative). */
    schemaVersion: 4,
    overrides: {},
    calendars: [{ id: "calendar-default", name: "Personal", color: "#CCFF00", visible: true, readOnly: false }],
    events: [
      { id: "e1", calendarId: "calendar-default", title: "Standup", cat: "PEOPLE", ...at(9, 30, 30), link: "https://meet.example.com/abc-defg", alerts: [10] },
      { id: "e2", calendarId: "calendar-default", title: "Client Review — Nordwell", cat: "DEEP", ...at(11, 0, 90), place: "Room 4" },
      { id: "e3", calendarId: "calendar-default", title: "Lunch and a walk", cat: "BODY", ...at(13, 0, 55) },
      { id: "e4", calendarId: "calendar-default", title: "Migration checkpoint", cat: "ADMIN", ...at(15, 30, 45) },
    ],
    tasks: [
      { id: "t1", date: key, at: null, due: key, order: 0, title: "Ship the pricing model v2", cat: "DEEP", xp: 60, done: false, note: "", subs: [] },
      { id: "t2", date: key, at: null, due: null, order: 1, title: "Send Nordwell the migration deadline", cat: "ADMIN", xp: 40, done: false, note: "", subs: [] },
      { id: "t3", date: key, at: 17 * 60, due: null, order: 2, title: "Draft the retention note", cat: "DEEP", xp: 50, done: false, note: "", subs: [] },
    ],
    notes: [],
    lists: [],
  };
}

function errorMessage(error) {
  return String(error?.message ?? error).replace(/\s+/g, " ").trim();
}

function surfaceMatches(state, surfaceId) {
  if (surfaceId === "day") return state.zoom === "day" && !state.sheetVisible;
  if (surfaceId === "week") return state.zoom === "week" && !state.sheetVisible;
  if (surfaceId === "month") return state.zoom === "month" && !state.sheetVisible;
  if (surfaceId === "sheet") {
    return state.sheetVisible
      && state.composerVisible
      && state.sheetOrigin === "notch"
      && state.sheetSource === "new-entry"
      && state.sheetStage === "open";
  }
  return false;
}

function describeSurfaceState(state) {
  const details = [
    `zoom=${state.zoom}`,
    `day=${state.dayStreamVisible}`,
    `week=${state.weekGridVisible}`,
    `month=${state.monthNavigatorVisible}`,
    `sheet=${state.sheetVisible}`,
  ];
  if (state.sheetVisible) details.push(`origin=${state.sheetOrigin ?? "none"}`, `source=${state.sheetSource ?? "none"}`, `stage=${state.sheetStage ?? "none"}`);
  return details.join(", ");
}

/* Read the state the product is actually rendering. This deliberately uses the
   same stable DOM contracts as the E2E suite instead of inferring a view from
   the requested filename or from elapsed animation time. */
async function readSurfaceState(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      if (!node) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden"
        && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const dayStream = document.querySelector('[data-test="day-stream"]');
    const weekGrid = document.querySelector('[data-test="week-grid"]');
    const monthNavigator = document.querySelector(".nb-month-navigator.is-month");
    const ribbon = document.querySelector('[data-test="day-ribbon"]');
    const sheet = document.querySelector('[data-test="sheet"]');
    const composer = document.querySelector('[data-test="composer"]');
    const weekDays = [...document.querySelectorAll("[data-week-day]")].filter(visible).length;
    const monthCells = monthNavigator
      ? [...document.querySelectorAll("button[data-day]")].filter(visible).length
      : 0;
    const dayStreamVisible = visible(dayStream);
    const weekGridVisible = visible(weekGrid) && weekDays >= 7;
    const monthNavigatorVisible = visible(monthNavigator) && monthCells >= 28;
    const sheetVisible = visible(sheet);
    const composerVisible = visible(composer);
    const zoom = monthNavigatorVisible ? "month"
      : weekGridVisible ? "week"
        : dayStreamVisible ? "day" : "unknown";
    return {
      zoom,
      dayStreamVisible,
      weekGridVisible,
      monthNavigatorVisible,
      ribbonVisible: visible(ribbon),
      weekDays,
      monthCells,
      sheetVisible,
      composerVisible,
      sheetOrigin: sheet?.getAttribute("data-fluid-origin") ?? null,
      sheetSource: sheet?.getAttribute("data-morph-source") ?? null,
      sheetStage: sheet?.getAttribute("data-morph-stage") ?? null,
    };
  });
}

/* Waiting is only a synchronization aid; success still requires the positive
   state predicate below. A screenshot is never allowed to stand in for state. */
async function verifySurface(page, surfaceId) {
  try {
    await page.waitForFunction((expected) => {
      const visible = (node) => {
        if (!node) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden"
          && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      };
      const dayStream = document.querySelector('[data-test="day-stream"]');
      const weekGrid = document.querySelector('[data-test="week-grid"]');
      const monthNavigator = document.querySelector(".nb-month-navigator.is-month");
      const ribbon = document.querySelector('[data-test="day-ribbon"]');
      const sheet = document.querySelector('[data-test="sheet"]');
      const composer = document.querySelector('[data-test="composer"]');
      const weekVisible = visible(weekGrid)
        && [...document.querySelectorAll("[data-week-day]")].filter(visible).length >= 7;
      const monthVisible = visible(monthNavigator)
        && [...document.querySelectorAll("button[data-day]")].filter(visible).length >= 28;
      const dayVisible = visible(dayStream) && !weekVisible && !monthVisible;
      const sheetVisible = visible(sheet);
      const composerVisible = visible(composer);
      if (expected === "day") return dayVisible && !sheetVisible;
      if (expected === "week") return weekVisible && !sheetVisible;
      if (expected === "month") return monthVisible && !sheetVisible;
      return sheetVisible && composerVisible
        && sheet.getAttribute("data-fluid-origin") === "notch"
        && sheet.getAttribute("data-morph-source") === "new-entry"
        && sheet.getAttribute("data-morph-stage") === "open"
        && Boolean(ribbon || dayVisible || weekVisible || monthVisible);
    }, surfaceId, { timeout: 5_000 });
  } catch (error) {
    const state = await readSurfaceState(page);
    throw new Error(`expected ${surfaceId} state; current state was ${describeSurfaceState(state)}`, { cause: error });
  }
  const state = await readSurfaceState(page);
  if (!surfaceMatches(state, surfaceId)) {
    throw new Error(`expected ${surfaceId} state; current state was ${describeSurfaceState(state)}`);
  }
  return state;
}

function recordFor(size, theme, surface) {
  return {
    viewport: size.id,
    width: size.width,
    height: size.height,
    theme: theme.id,
    surface: surface.id,
    status: "failed",
  };
}

async function writeManifest(out, records, expected) {
  const passed = records.filter((record) => record.status === "passed").length;
  const failed = records.filter((record) => record.status === "failed").length;
  await writeFile(path.join(out, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    expected,
    frames: records.length,
    passed,
    failed,
    records,
  }, null, 2), "utf8");
}

async function diagnostic(page, out, record) {
  const name = `${record.viewport}-${record.theme}-${record.surface}-FAILED.png`;
  try {
    await page.screenshot({ path: path.join(out, name) });
    record.diagnosticFile = name;
  } catch (error) {
    record.diagnosticError = errorMessage(error);
  }
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const expected = THEMES.length * WIDTHS.length * SURFACES.length;
  const records = [];
  await writeManifest(OUT, records, expected);

  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const state = notebook();

  for (const size of WIDTHS) {
    for (const theme of THEMES) {
      let context = null;
      let page = null;
      try {
        context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          hasTouch: size.mobile,
          isMobile: size.mobile,
          deviceScaleFactor: 2,
        });
        page = await context.newPage();
        await page.goto(BASE);
        await page.evaluate(([sk, pk, s, id]) => {
          window.localStorage.clear();
          window.localStorage.setItem(sk, JSON.stringify(s));
          window.localStorage.setItem(pk, JSON.stringify({
            schemaVersion: 1,
            display: { themeId: id, clock: "12", weekStart: 0, reducedMotion: false },
            feedback: { sound: false, haptics: false },
          }));
        }, [STATE_KEY, PREFS_KEY, state, theme.id]);
        await page.reload();
        await verifySurface(page, "day");

        for (const surface of SURFACES) {
          const record = recordFor(size, theme, surface);
          try {
            await surface.reach(page);
            await verifySurface(page, surface.id);
            const name = `${size.id}-${theme.id}-${surface.id}.png`;
            await page.screenshot({ path: path.join(OUT, name) });
            record.status = "passed";
            record.file = name;
          } catch (error) {
            record.error = errorMessage(error);
            if (page) await diagnostic(page, OUT, record);
          }
          records.push(record);
          await writeManifest(OUT, records, expected);
          process.stdout.write(`  ${size.id} · ${theme.id} · ${surface.id} · ${record.status}\n`);
        }
      } catch (error) {
        const message = `setup failed: ${errorMessage(error)}`;
        for (const surface of SURFACES) {
          const record = recordFor(size, theme, surface);
          record.error = message;
          if (page) await diagnostic(page, OUT, record);
          records.push(record);
          await writeManifest(OUT, records, expected);
          process.stdout.write(`  ${size.id} · ${theme.id} · ${surface.id} · failed\n`);
        }
      } finally {
        await context?.close();
      }
    }
  }

  await browser.close();
  const passed = records.filter((record) => record.status === "passed").length;
  const failed = records.filter((record) => record.status === "failed").length;
  await writeManifest(OUT, records, expected);
  await writeFile(path.join(OUT, "index.html"), sheet(records, expected), "utf8");
  console.log(`\n${records.length} requested · ${passed} verified · ${failed} failed → ${path.join(OUT, "index.html")}`);
  if (records.length !== expected || passed !== expected || failed !== 0) {
    throw new Error(`visual matrix failed: expected ${expected} records and passes, got ${records.length} records, ${passed} passes, ${failed} failures`);
  }
}

function sheet(frames, expected) {
  const byWidth = (w) => frames.filter((f) => f.viewport === w);
  const group = (w) => {
    const themes = [...new Set(byWidth(w).map((f) => f.theme))];
    return themes.map((id) => {
      const rows = byWidth(w).filter((f) => f.theme === id);
      return `<section><h2>${id}<span>${rows[0]?.width ?? ""}×${rows[0]?.height ?? ""}</span></h2><div class="row">${
        rows.map((f) => {
          const asset = f.file ?? f.diagnosticFile;
          const image = asset
            ? `<img src="${asset}" loading="lazy" alt="${f.theme} ${f.surface} ${f.status}">`
            : `<div class="failed">NO CAPTURE</div>`;
          return `<figure class="${f.status}">${image}<figcaption>${f.surface} · ${f.status}</figcaption></figure>`;
        }).join("")
      }</div></section>`;
    }).join("");
  };
  return `<!doctype html><meta charset="utf-8"><title>Contact sheet</title>
<style>
  body{background:#15161a;color:#e8e9ec;font:13px ui-monospace,Menlo,Consolas,monospace;margin:0;padding:2rem}
  h1{font-size:1.4rem;letter-spacing:.02em;margin:0 0 .3rem}
  p.meta{color:#8b8f99;margin:0 0 2.5rem}
  h2{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#c7cad2;
     margin:2.5rem 0 .75rem;display:flex;gap:.75rem;align-items:baseline}
  h2 span{color:#6b7079;font-size:.7rem;letter-spacing:.06em;text-transform:none}
  h3{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:#8b8f99;
     border-bottom:1px solid #2a2c33;padding-bottom:.5rem;margin:3.5rem 0 0}
  .row{display:flex;gap:1rem;overflow-x:auto;padding-bottom:.5rem}
  figure{margin:0;flex:none}
  img{display:block;height:420px;width:auto;border-radius:6px;background:#000;
      box-shadow:0 2px 10px rgb(0 0 0 / .5)}
  figure.failed img{outline:3px solid #ff405e}
  .failed{height:420px;width:280px;display:grid;place-items:center;border:3px solid #ff405e;color:#ff8092;background:#2b1018}
  figcaption{color:#6b7079;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;margin-top:.4rem}
  figure.failed figcaption{color:#ff8092}
</style>
<h1>Contact sheet</h1>
<p class="meta">${frames.length}/${expected} requested · ${frames.filter((f) => f.status === "passed").length} positively verified · ${frames.filter((f) => f.status === "failed").length} failed · ${new Date().toISOString()} · look for illegible dim text, shadows that vanish or smear, and capitals that should not be capitals</p>
<h3>Phone · 393px</h3>${group("phone")}
<h3>Desktop · 1280px</h3>${group("desk")}`;
}

main().catch((error) => { console.error(error); process.exit(1); });
