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

const STATE_KEY = "nbmp:state:v8";
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
  { id: "week", reach: async (page) => { await page.locator('[data-test="zoom-out"]').click(); await page.waitForTimeout(650); } },
  { id: "month", reach: async (page) => { await page.locator('[data-test="zoom-out"]').click(); await page.waitForTimeout(650); } },
  { id: "sheet", reach: async (page) => {
      await page.locator('[data-test="zoom-in"]').click(); await page.waitForTimeout(350);
      await page.locator('[data-test="zoom-in"]').click(); await page.waitForTimeout(450);
      await page.locator('[data-test="new-entry"]').click(); await page.waitForTimeout(900);
    } },
];

/* A day with something in it. Built by hand rather than seeded through the
   domain, because a contact sheet wants the same pixels every run and a seeded
   notebook drifts with the clock. */
function notebook() {
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const at = (h, m, dur) => ({
    kind: "timed", timeZoneMode: "floating",
    startLocal: `${key}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    endLocal: `${key}T${String(h + Math.floor((m + dur) / 60)).padStart(2, "0")}:${String((m + dur) % 60).padStart(2, "0")}`,
  });
  return {
    schemaVersion: 8,
    calendars: [{ id: "calendar-default", name: "Personal", color: "#CCFF00", visible: true, readOnly: false }],
    events: [
      { id: "e1", calendarId: "calendar-default", title: "Standup", category: "PEOPLE", timing: at(9, 30, 30), link: "https://meet.example.com/abc-defg", alerts: [10] },
      { id: "e2", calendarId: "calendar-default", title: "Client Review — Nordwell", category: "DEEP", timing: at(11, 0, 90), place: "Room 4" },
      { id: "e3", calendarId: "calendar-default", title: "Lunch and a walk", category: "BODY", timing: at(13, 0, 55) },
      { id: "e4", calendarId: "calendar-default", title: "Migration checkpoint", category: "ADMIN", timing: at(15, 30, 45) },
    ],
    tasks: [
      { id: "t1", title: "Ship the pricing model v2", status: "open", category: "DEEP", planned: { date: key, startMinute: null, estimateMinutes: null }, checklist: [], tags: [] },
      { id: "t2", title: "Send Nordwell the migration deadline", status: "open", category: "ADMIN", planned: { date: key, startMinute: null, estimateMinutes: null }, checklist: [], tags: [] },
      { id: "t3", title: "Draft the retention note", status: "open", category: "DEEP", planned: { date: key, startMinute: 17 * 60, estimateMinutes: 60 }, checklist: [], tags: [] },
    ],
    notes: [],
    lists: [],
  };
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const state = notebook();
  const frames = [];

  for (const size of WIDTHS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        hasTouch: size.mobile,
        isMobile: size.mobile,
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
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
      await page.waitForSelector('[data-test="day-stream"]');
      await page.waitForTimeout(500);

      for (const surface of SURFACES) {
        try {
          await surface.reach(page);
        } catch {
          /* A surface that cannot be reached at this width is worth seeing as a
             gap in the sheet rather than a crashed run. */
        }
        const name = `${size.id}-${theme.id}-${surface.id}.png`;
        await page.screenshot({ path: path.join(OUT, name) });
        frames.push({ file: name, width: size.id, theme: theme.id, label: theme.name, surface: surface.id });
      }
      await context.close();
      process.stdout.write(`  ${size.id} · ${theme.id}\n`);
    }
  }

  await writeFile(path.join(OUT, "index.html"), sheet(frames), "utf8");
  await browser.close();
  console.log(`\n${frames.length} frames → ${path.join(OUT, "index.html")}`);
}

function sheet(frames) {
  const byWidth = (w) => frames.filter((f) => f.width === w);
  const group = (w) => {
    const themes = [...new Set(byWidth(w).map((f) => f.theme))];
    return themes.map((id) => {
      const rows = byWidth(w).filter((f) => f.theme === id);
      return `<section><h2>${rows[0].label}<span>${id}</span></h2><div class="row">${
        rows.map((f) => `<figure><img src="${f.file}" loading="lazy" alt="${f.theme} ${f.surface}"><figcaption>${f.surface}</figcaption></figure>`).join("")
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
  figcaption{color:#6b7079;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;margin-top:.4rem}
</style>
<h1>Contact sheet</h1>
<p class="meta">${frames.length} frames · ${new Date().toISOString()} · look for illegible dim text, shadows that vanish or smear, and capitals that should not be capitals</p>
<h3>Phone · 393px</h3>${group("phone")}
<h3>Desktop · 1280px</h3>${group("desk")}`;
}

main().catch((error) => { console.error(error); process.exit(1); });
