import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as storage from "./storage.js";
import { migrateV4ToV5 } from "./domains/calendar/migrations/migrateV4ToV5.js";
import { validatePlannerStateV5 } from "./domains/calendar/migrations/validatePlannerStateV5.js";
import { loadPlannerState, savePlannerState } from "./platform/persistence/plannerStateStore.js";
import {
  createEvent as createCalendarEvent,
  deleteEvent as deleteCalendarEvent,
  getOccurrencesForRange,
  legacyEventInputToCanonical,
  parseOccurrenceId,
  previewRecurrence,
  cancelOccurrence,
  modifyOccurrence,
  moveOccurrence,
  restoreOccurrence,
  splitSeries,
  moveEvent as moveCalendarEvent,
  packEventLanes,
  resizeEvent as resizeCalendarEvent,
  restoreEvent as restoreCalendarEvent,
  updateEvent as updateCalendarEvent,
} from "./domains/calendar/index.js";
import { addDays, addDaysToKey, diffDays, keyOf, parseKey } from "./shared/time/dateKey.js";
import { addMinutesToLocalDateTime, localDateTimeToEpochMinutes } from "./shared/time/localDateTime.js";
import { getOffsetCandidates } from "./shared/time/timezone.js";

/* ═══════════════════════ TOKENS ═══════════════════════ */

const THEMES = [
  { id: "obsidian-acid", name: "Obsidian / Acid", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#CCFF00", on: "#000000" },
  { id: "obsidian-cyan", name: "Obsidian / Cyan", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#00F0FF", on: "#000000" },
  { id: "ink-violet", name: "Ink / Violet", bg: "#0C0B12", card: "#15131E", line: "#221F2E", text: "#F1EFF7", dim: "#7C778C", faint: "#2B2739", accent: "#A855F7", on: "#FFFFFF" },
  { id: "ember", name: "Ember / Orange", bg: "#0B0908", card: "#151110", line: "#211B18", text: "#F5F1EE", dim: "#857C75", faint: "#2C2521", accent: "#FF5500", on: "#FFFFFF" },
  { id: "signal", name: "Obsidian / Crimson", bg: "#0A0A0C", card: "#121216", line: "#1E1E26", text: "#F2F2F5", dim: "#797987", faint: "#2A2A34", accent: "#FF2A55", on: "#FFFFFF" },
  { id: "raw-amber", name: "Raw Paper / Amber", bg: "#1A1917", card: "#221F1C", line: "#2C2822", text: "#F0EBE1", dim: "#8B8477", faint: "#38332B", accent: "#D97706", on: "#FFFFFF" },
  { id: "cream-terracotta", name: "Cream / Terracotta", bg: "#F4F1EA", card: "#FFFFFF", line: "#E4DED2", text: "#14141A", dim: "#79736A", faint: "#DED7C9", accent: "#C85A32", on: "#FFFFFF" },
  { id: "cream-sage", name: "Cream / Sage", bg: "#F4F1EA", card: "#FFFFFF", line: "#E4DED2", text: "#14141A", dim: "#79736A", faint: "#DED7C9", accent: "#789078", on: "#000000" },
  { id: "cream-slate", name: "Cream / Slate", bg: "#F1F2F4", card: "#FFFFFF", line: "#E1E3E7", text: "#14141A", dim: "#71757C", faint: "#D8DBE0", accent: "#5B7C99", on: "#FFFFFF" },
  { id: "linen-dusty", name: "Linen / Dusty Rose", bg: "#F7F3F4", card: "#FFFFFF", line: "#E9E0E2", text: "#1A1418", dim: "#7C7074", faint: "#E0D4D7", accent: "#C48B9F", on: "#000000" },
];

const CATS = ["DEEP WORK", "ADMIN", "BODY", "PEOPLE", "RITUAL"];
const HOUR_H = 58;
const DAY_H = HOUR_H * 24;
const XP_PER_LEVEL = 300;
const HOLD_MS = 420;
const LIFT_MS = 300;
const SNAP = 5;
const NOW_RED = "#C43A56";
const NOW_LINE = "#B33450";
const NOW_INK = "#5E1628";
const ALERT_CHOICES = [0, 5, 15, 30, 60];
const DAY_LETTERS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const SERIF = "Georgia, Cambria, Times New Roman, serif";

/* ═══════════════════════ UTILS ═══════════════════════ */

const pad = (n) => String(n).padStart(2, "0");
const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WD1 = ["S", "M", "T", "W", "T", "F", "S"];
const MO = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const hhmm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m) % 60)}`;
const uid = () => Math.random().toString(36).slice(2, 9);
const isDark = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.5;
};
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${Math.round(m)}m`);
const snapTo = (m, s = SNAP) => Math.max(0, Math.min(1440, Math.round(m / s) * s));
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const splitId = (id) => { const i = String(id).indexOf("@"); return i === -1 ? { base: id, date: null } : { base: id.slice(0, i), date: id.slice(i + 1) }; };
const fmtDay = (k) => { const d = parseKey(k); return `${WD[d.getDay()]} ${pad(d.getDate())} ${MO[d.getMonth()]}`; };

const recurrenceToRepeat = (recurrence) => recurrence ? {
  freq: recurrence.frequency,
  interval: recurrence.interval || 1,
  ...(recurrence.byWeekday ? { byDay: recurrence.byWeekday.map((value) => typeof value === "number" ? value : value.weekday) } : {}),
  until: recurrence.until || "",
  ...(recurrence.count ? { count: recurrence.count } : {}),
  endMode: recurrence.count ? "count" : recurrence.until ? "until" : "never",
  missingDatePolicy: recurrence.missingDatePolicy || "skip",
  ...(recurrence.frequency === "monthly" ? { monthlyMode: recurrence.byWeekday?.some((value) => typeof value === "object" && value.ordinal === -1) ? "last-weekday" : "day" } : {}),
} : null;

function eventForUi(event) {
  if (!event?.timing) return event;
  const repeat = recurrenceToRepeat(event.recurrence);
  if (event.timing.kind === "all-day") {
    return {
      ...event,
      date: event.date || event.timing.startDate,
      allDay: true,
      start: 0,
      dur: event.dur || 1440,
      endDate: addDaysToKey(event.timing.endDateExclusive, -1),
      repeat,
    };
  }
  const start = localDateTimeToEpochMinutes(event.timing.startLocal);
  const end = localDateTimeToEpochMinutes(event.timing.endLocal);
  return {
    ...event,
    date: event.date || event.timing.startLocal.slice(0, 10),
    allDay: false,
    start: event.start ?? ((start % 1440) + 1440) % 1440,
    dur: event.dur || end - start,
    endDate: event.timing.endLocal.slice(0, 10),
    repeat,
    timeZoneMode: event.timing.timeZoneMode,
    timeZone: event.timing.timeZone || "",
  };
}

function canonicalOccurrenceIdentity(id) {
  try { return parseOccurrenceId(id); } catch { return null; }
}

function eventTimingFromPosition(event, date, start = event.start, duration = event.dur) {
  if (event.timing.kind === "all-day") {
    const span = diffDays(event.timing.endDateExclusive, event.timing.startDate);
    return { kind: "all-day", startDate: date, endDateExclusive: addDaysToKey(date, span) };
  }
  const startLocal = addMinutesToLocalDateTime(`${date}T00:00`, start);
  const endLocal = addMinutesToLocalDateTime(startLocal, duration);
  if (event.timing.timeZoneMode === "floating") {
    return { kind: "timed", timeZoneMode: "floating", startLocal, endLocal };
  }
  const chooseOffset = (local, preferred) => {
    const candidates = getOffsetCandidates(local, event.timing.timeZone);
    if (!candidates.length) throw new RangeError(`${local} does not exist in ${event.timing.timeZone}`);
    const preferredCandidate = candidates.find((candidate) => candidate.offset === preferred);
    if (preferredCandidate) return preferredCandidate.offset;
    if (candidates.length === 1) return candidates[0].offset;
    throw new RangeError(`${local} is ambiguous; use the event editor to select an offset`);
  };
  return {
    kind: "timed", timeZoneMode: "zoned", startLocal, endLocal,
    timeZone: event.timing.timeZone,
    startOffset: chooseOffset(startLocal, event.timing.startOffset),
    endOffset: chooseOffset(endLocal, event.timing.endOffset),
  };
}

/* ─── recurrence ─── */
function taskOccursOn(item, dateKey) {
  if (dateKey < item.date) return false;
  const r = item.repeat;
  if (!r) return item.date === dateKey;
  if (r.until && dateKey > r.until) return false;
  const n = Math.max(1, r.interval || 1);
  const a = parseKey(dateKey), b = parseKey(item.date);
  if (r.freq === "daily") return diffDays(dateKey, item.date) % n === 0;
  if (r.freq === "weekly") {
    const days = r.byDay && r.byDay.length ? r.byDay : [b.getDay()];
    if (!days.includes(a.getDay())) return false;
    const wa = Math.floor((a - addDays(b, -b.getDay())) / (7 * 86400000));
    return wa % n === 0;
  }
  if (r.freq === "monthly") {
    if (a.getDate() !== b.getDate()) return false;
    return ((a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth())) % n === 0;
  }
  return false;
}

function expandTasks(items, dateKey, overrides) {
  const out = [];
  items.forEach((it) => {
    if (!it.repeat) {
      if (it.date === dateKey) out.push(it);
      else if (it.allDay && it.endDate && it.date <= dateKey && dateKey <= it.endDate) out.push(it);
      return;
    }
    if (!taskOccursOn(it, dateKey)) return;
    const oid = `${it.id}@${dateKey}`;
    const ov = overrides[oid];
    if (ov && ov.deleted) return;
    out.push({ ...it, ...(ov || {}), id: oid, seriesId: it.id, date: dateKey, instance: true });
  });
  return out;
}

const repeatLabel = (r) => {
  if (!r) return "";
  const n = r.interval || 1;
  if (r.freq === "daily") return n === 1 ? "Every day" : `Every ${n} days`;
  if (r.freq === "weekly") {
    const d = (r.byDay || []).map((i) => DAY_LETTERS[i]).join(" ");
    return `${n === 1 ? "Weekly" : `Every ${n} weeks`}${d ? ` · ${d}` : ""}`;
  }
  if (r.freq === "monthly") return n === 1 ? "Monthly" : `Every ${n} months`;
  if (r.freq === "yearly") return n === 1 ? "Yearly" : `Every ${n} years`;
  return "";
};

/* ═══════════════════════ SOUND ═══════════════════════ */

function useSynth(enabled) {
  const ref = useRef(null);
  const ctx = () => {
    try {
      if (!ref.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ref.current = new AC();
      }
      if (ref.current.state === "suspended") ref.current.resume();
      return ref.current;
    } catch (e) { return null; }
  };
  return useCallback((kind, p = 0) => {
    if (!enabled) return;
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const tone = (type, f0, f1, d, g0, delay = 0) => {
      const o = c.createOscillator(), g = c.createGain();
      const t = t0 + delay;
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(g0, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + d + 0.03);
    };
    const paper = (secs, cut, gain) => {
      const len = Math.max(1, Math.floor(c.sampleRate * secs));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.1) * (0.55 + 0.45 * Math.sin(t * 34));
      }
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = cut; bp.Q.value = 0.7;
      const g = c.createGain(); g.gain.value = gain;
      src.connect(bp); bp.connect(g); g.connect(c.destination);
      src.start(t0);
    };
    switch (kind) {
      case "click": tone("triangle", 450, 120, 0.025, 0.16); break;
      case "tick": tone("sine", 800, 400, 0.015, 0.09); break;
      case "ratchet": tone("sine", 520 + 620 * p, 320 + 500 * p, 0.014, 0.05 + 0.07 * p); break;
      case "abort": tone("triangle", 300, 160, 0.05, 0.07); break;
      case "lift": tone("sine", 300, 520, 0.05, 0.09); break;
      case "drop": tone("triangle", 520, 240, 0.045, 0.12); break;
      case "commit":
        tone("sine", 523.25, 659.25, 0.12, 0.2);
        tone("triangle", 783.99, 1046.5, 0.16, 0.2);
        tone("sine", 1046.5, 1318.5, 0.18, 0.09, 0.06);
        break;
      case "levelup": [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone("triangle", f, f * 1.02, 0.14, 0.16, i * 0.07)); break;
      case "alert": [880, 1174.66].forEach((f, i) => tone("sine", f, f, 0.16, 0.16, i * 0.18)); break;
      case "page": paper(0.26, 2300, 0.26); tone("sine", 180, 90, 0.06, 0.05); break;
      case "schedule": tone("square", 660, 880, 0.03, 0.07); break;
      case "defer": tone("sine", 420, 220, 0.09, 0.11); break;
      case "delete": tone("sawtooth", 240, 50, 0.06, 0.14); break;
      default: break;
    }
  }, [enabled]);
}

/* ═══════════════════════ SEED ═══════════════════════ */

function seed() {
  const t = new Date();
  const k = (n) => keyOf(addDays(t, n));
  return {
    themeId: "obsidian-acid",
    sound: true,
    notifs: false,
    xp: 690,
    overrides: {},
    events: [
      { id: uid(), date: k(-30), title: "Morning pages", start: 420, dur: 30, cat: "RITUAL", place: "Kitchen table", note: "Three pages, longhand, no editing.", repeat: { freq: "daily", interval: 1 }, alerts: [] },
      { id: uid(), date: k(-28), title: "Standup", start: 690, dur: 25, cat: "PEOPLE", place: "Video", note: "", repeat: { freq: "weekly", interval: 1, byDay: [1, 2, 3, 4, 5] }, alerts: [5] },
      { id: uid(), date: k(0), title: "Deep block — pricing model", start: 540, dur: 120, cat: "DEEP WORK", place: "Desk", note: "Rebuild the tiering sheet. No inbox until this ships.", alerts: [15] },
      { id: uid(), date: k(0), title: "Lunch and a walk", start: 780, dur: 55, cat: "BODY", place: "Riverside loop", note: "", alerts: [] },
      { id: uid(), date: k(0), title: "Client review — Nordwell", start: 900, dur: 90, cat: "PEOPLE", place: "Room 4", note: "Bring the migration timeline and the two open risks.", alerts: [30] },
      { id: uid(), date: k(0), title: "Notes sync", start: 930, dur: 30, cat: "ADMIN", place: "", note: "", alerts: [] },
      { id: uid(), date: k(0), title: "Inbox sweep", start: 1050, dur: 30, cat: "ADMIN", place: "", note: "", alerts: [] },
      { id: uid(), date: k(1), title: "Roadmap workshop", start: 600, dur: 180, cat: "DEEP WORK", place: "Studio", note: "", alerts: [] },
      { id: uid(), date: k(2), title: "Offsite — Ridgeway", allDay: true, endDate: k(4), start: 0, dur: 0, cat: "PEOPLE", place: "Ridgeway House", note: "Pack the plotter prints.", alerts: [] },
      { id: uid(), date: k(3), title: "Dentist", start: 665, dur: 45, cat: "ADMIN", place: "", note: "", alerts: [60] },
      { id: uid(), date: k(5), title: "Dinner — Ana and Theo", start: 1140, dur: 120, cat: "PEOPLE", place: "Osteria", note: "", alerts: [] },
    ],
    tasks: [
      { id: uid(), date: k(0), at: null, due: k(0), order: 0, title: "Ship the pricing model v2", cat: "DEEP WORK", xp: 60, done: false, note: "The whole day bends around this one.", subs: [
        { id: uid(), title: "Pull last quarter's cohort data", done: true },
        { id: uid(), title: "Rebuild the tier math", done: false },
        { id: uid(), title: "Sanity-check against three live accounts", done: false },
      ] },
      { id: uid(), date: k(0), at: null, due: k(2), order: 1, title: "Send Nordwell the migration timeline", cat: "PEOPLE", xp: 40, done: false, note: "", subs: [
        { id: uid(), title: "Confirm cutover weekend", done: false },
        { id: uid(), title: "Attach the risk register", done: false },
      ] },
      { id: uid(), date: k(-20), at: 1140, due: null, order: 2, title: "Walk 8k steps", cat: "BODY", xp: 30, done: false, note: "", subs: [], repeat: { freq: "daily", interval: 1 } },
      { id: uid(), date: k(0), at: null, due: null, order: 3, title: "Reconcile receipts", cat: "ADMIN", xp: 30, done: true, note: "", subs: [] },
      { id: uid(), date: k(-1), at: null, due: k(-1), order: 4, title: "Chase the Vela invoice", cat: "ADMIN", xp: 30, done: false, note: "", subs: [] },
      { id: uid(), date: k(1), at: null, due: k(1), order: 5, title: "Draft the workshop agenda", cat: "DEEP WORK", xp: 50, done: false, note: "", subs: [] },
      { id: uid(), date: k(-1), at: null, due: null, order: 6, title: "Close the books", cat: "ADMIN", xp: 40, done: true, note: "", subs: [] },
      { id: uid(), date: k(-2), at: null, due: null, order: 7, title: "Weekly review", cat: "RITUAL", xp: 40, done: true, note: "", subs: [] },
    ],
    notes: [
      { id: uid(), date: k(0), text: "The pricing work keeps stalling in the same place — the moment it touches legacy accounts. Worth naming that out loud tomorrow instead of routing around it again." },
    ],
  };
}

/* ═══════════════════════ APP ═══════════════════════ */

export default function Planner() {
  const [db, setDb] = useState(null);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  const [zoom, setZoom] = useState("week");
  const [dateKey, setDateKey] = useState(keyOf(new Date()));
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [sheet, setSheet] = useState(false);
  const [inspect, setInspect] = useState(null);
  const [composer, setComposer] = useState(null);
  const [noteEdit, setNoteEdit] = useState(null);
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(false);
  const [scopeAsk, setScopeAsk] = useState(null);
  const [reward, setReward] = useState(null);
  const [levelFlash, setLevelFlash] = useState(null);
  const [undo, setUndo] = useState(null);
  const [gesture, setGesture] = useState(null);
  const [turn, setTurn] = useState(null);
  const [swipe, setSwipe] = useState(0);
  const [alertToast, setAlertToast] = useState(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [storageBad, setStorageBad] = useState(!storage.writable);
  const [saveBlocked, setSaveBlocked] = useState(false);

  const stripRef = useRef(null);
  const activeRef = useRef(null);
  const streamRef = useRef(null);
  const listRef = useRef(null);
  const saveT = useRef(null);
  const undoT = useRef(null);
  const prevLevel = useRef(null);
  const pinch = useRef(null);
  const swipeRef = useRef(null);
  const holdRef = useRef(null);
  const gestureRef = useRef(null);
  const tappedRef = useRef(false);
  const firedRef = useRef(new Set());

  useEffect(() => { gestureRef.current = gesture; }, [gesture]);
  const startGesture = (g) => { gestureRef.current = g; setGesture(g); };
  const endGesture = () => { gestureRef.current = null; setGesture(null); };

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const loaded = await loadPlannerState(storage);
        const state = loaded.state || migrateV4ToV5(seed());
        if (!loaded.state) await savePlannerState(storage, state);
        if (!dead) { setDb(state); setStorageBad(false); setReady(true); }
      } catch (error) {
        /* Either the device can't be written to, or what's already stored is
           unreadable. Open a fresh notebook in memory so the app is still usable —
           without it `ready` flips while `db` stays null and the loader never
           clears — but leave autosave off. Overwriting here would seed straight over
           data that is damaged rather than gone, and export stays the way out. */
        if (!dead) { setDb(migrateV4ToV5(seed())); setSaveBlocked(true); setStorageBad(true); setReady(true); }
      }
    })();
    return () => { dead = true; };
  }, []);

  useEffect(() => { if (ready) { const r = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(r); } }, [ready]);

  useEffect(() => {
    if (!ready || !db || saveBlocked) return;
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      savePlannerState(storage, db).then(() => setStorageBad(false), () => setStorageBad(true));
    }, 400);
    return () => clearTimeout(saveT.current);
  }, [db, ready]);

  useEffect(() => { const i = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(i); }, []);

  const T = useMemo(() => THEMES.find((t) => t.id === (db && db.themeId)) || THEMES[0], [db]);
  const beep = useSynth(db ? db.sound : true);

  /* The theme lives in state, so the page around the app has to follow it: the body
     (otherwise overscroll shows a mismatched strip), the browser chrome on mobile,
     and color-scheme — which is what makes the native date and time pickers in the
     composer legible instead of dark-on-dark. */
  useEffect(() => {
    document.body.style.background = T.bg;
    document.documentElement.style.colorScheme = isDark(T.bg) ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", T.bg);
  }, [T]);

  const todayKey = keyOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = dateKey === todayKey;
  const activeDate = parseKey(dateKey);
  const ov = (db && db.overrides) || {};

  const days = useMemo(() => { const s = addDays(new Date(), -2); return Array.from({ length: 14 }, (_, i) => addDays(s, i)); }, [todayKey]);
  const monthGrid = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthCursor]);

  const dayEvents = useMemo(() => (db
    ? getOccurrencesForRange(db, dateKey, addDaysToKey(dateKey, 1), { segments: true }).map(eventForUi)
    : []), [db, dateKey]);
  const timed = useMemo(() => dayEvents.filter((e) => !e.allDay), [dayEvents]);
  const allDay = useMemo(() => dayEvents.filter((e) => e.allDay), [dayEvents]);
  const dayTasks = useMemo(() => {
    const list = db ? expandTasks(db.tasks, dateKey, ov) : [];
    return list.sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [db, dateKey, ov]);
  const notes = useMemo(() => (db ? db.notes.filter((n) => n.date === dateKey) : []), [db, dateKey]);
  const openCount = dayTasks.filter((t) => !t.done).length;

  /* Overdue means unfinished work that still needs doing — a debt. A missed day of a
     recurring task isn't one: you don't owe yesterday's walk on top of today's, and
     today's instance is already on the page. So recurring instances are left out, the
     same way deadlines already skip them, and the streak carries the "did you keep it
     up" signal instead. Without this a single daily habit reads as 14 overdue items
     that PULL IN can't clear. */
  const overdue = useMemo(() => {
    if (!db) return [];
    const out = [];
    for (let i = 1; i <= 14; i++) {
      const k = keyOf(addDays(now, -i));
      expandTasks(db.tasks, k, ov).forEach((t) => { if (!t.done && !t.instance) out.push(t); });
    }
    return out;
  }, [db, todayKey, ov]);

  const deadlines = useMemo(() => {
    if (!db) return [];
    return db.tasks
      .filter((t) => t.due && !t.done && !t.repeat && t.due >= todayKey && diffDays(t.due, todayKey) <= 10)
      .sort((a, b) => (a.due < b.due ? -1 : 1));
  }, [db, todayKey]);

  const events = useMemo(() => {
    const g = gesture;
    const list = timed.map((e) => (g && g.id === e.id && (g.mode === "move" || g.mode === "resize") ? { ...e, start: g.start, dur: g.dur } : e));
    return packEventLanes(list);
  }, [timed, gesture]);

  const xp = db ? db.xp : 0;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelPct = ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100;

  const streak = useMemo(() => {
    if (!db) return 0;
    const doneOn = (k) => expandTasks(db.tasks, k, ov).some((t) => t.done);
    let n = 0, cur = new Date(now);
    if (!doneOn(keyOf(cur))) cur = addDays(cur, -1);
    while (n < 60 && doneOn(keyOf(cur))) { n++; cur = addDays(cur, -1); }
    return n;
  }, [db, todayKey, ov]);

  useEffect(() => {
    if (prevLevel.current !== null && level > prevLevel.current) {
      beep("levelup"); buzz([12, 40, 12]);
      setLevelFlash(level);
      const t = setTimeout(() => setLevelFlash(null), 2400);
      prevLevel.current = level;
      return () => clearTimeout(t);
    }
    prevLevel.current = level;
  }, [level]);

  useEffect(() => {
    if (ready && zoom === "week" && activeRef.current && stripRef.current) {
      stripRef.current.scrollTo({ left: activeRef.current.offsetLeft - 24, behavior: mounted ? "smooth" : "auto" });
    }
  }, [dateKey, ready, zoom]);

  useEffect(() => {
    if (!ready || !streamRef.current) return;
    const first = timed.slice().sort((a, b) => a.start - b.start)[0];
    const anchor = isToday ? nowMin : first ? first.start : 480;
    streamRef.current.scrollTop = Math.max(0, (anchor / 1440) * DAY_H - 140);
  }, [ready, dateKey, turn]);

  const mutate = (fn) => setDb((d) => (d ? fn({ ...d }) : d));

  /* ─── reminders ─── */
  useEffect(() => {
    if (!db) return;
    const todays = getOccurrencesForRange(db, todayKey, addDaysToKey(todayKey, 1), { segments: true })
      .map(eventForUi)
      .filter((e) => !e.allDay && e.alerts && e.alerts.length);
    todays.forEach((e) => {
      (e.alerts || []).forEach((a) => {
        const fireAt = e.start - a;
        const key = `${e.id}|${a}`;
        if (firedRef.current.has(key)) return;
        if (nowMin >= fireAt && nowMin < fireAt + 2) {
          firedRef.current.add(key);
          const body = a === 0 ? `Starting now · ${hhmm(e.start)}` : `In ${dur(a)} · ${hhmm(e.start)}`;
          beep("alert"); buzz([10, 60, 10]);
          setAlertToast({ title: e.title, body, k: uid() });
          setTimeout(() => setAlertToast(null), 8000);
          try {
            if (db.notifs && "Notification" in window && Notification.permission === "granted") new Notification(e.title, { body });
          } catch (err) {}
        }
      });
    });
  }, [now, db, todayKey]);

  const askNotifs = async () => {
    try {
      if (!("Notification" in window)) return;
      const p = await Notification.requestPermission();
      mutate((d) => ({ ...d, notifs: p === "granted" }));
      beep(p === "granted" ? "commit" : "abort");
    } catch (e) {}
  };

  const densityOf = useCallback((d) => {
    if (!db) return 0;
    const k = keyOf(d);
    return getOccurrencesForRange(db, k, addDaysToKey(k, 1)).length + expandTasks(db.tasks, k, ov).filter((t) => !t.done).length;
  }, [db, ov]);

  const briefing = useMemo(() => {
    if (!db) return "";
    const sorted = timed.slice().sort((a, b) => a.start - b.start);
    if (dateKey < todayKey) return `Archive · ${sorted.length} events, ${dayTasks.filter((t) => t.done).length} done`;
    if (dateKey > todayKey) return sorted.length ? `${sorted.length} events · first at ${hhmm(sorted[0].start)}` : `${openCount} actions waiting, nothing scheduled`;
    const live = sorted.find((e) => nowMin >= e.start && nowMin < e.start + e.dur);
    if (live) return `${live.title} · ${dur(live.start + live.dur - nowMin)} left`;
    const next = sorted.find((e) => e.start > nowMin);
    if (next) return `${dur(next.start - nowMin)} free until ${next.title}`;
    return openCount ? `Nothing left scheduled · ${openCount} open ${openCount === 1 ? "action" : "actions"}` : "Day's clear. Nothing scheduled, nothing open.";
  }, [db, dateKey, todayKey, nowMin, timed, openCount, dayTasks]);

  const suggested = useMemo(() => {
    const busy = [...timed.map((e) => [e.start, e.start + e.dur]), ...dayTasks.filter((t) => t.at != null).map((t) => [t.at, t.at + 30])];
    const free = [];
    for (let h = 6; h <= 22; h++) {
      const s = h * 60, e = s + 60;
      if (!busy.some(([a, b]) => s < b && e > a)) free.push(h);
    }
    const anchor = isToday ? nowMin / 60 : 9;
    return free.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor)).slice(0, 2);
  }, [timed, dayTasks, isToday, nowMin]);

  const liveEvent = isToday ? events.find((e) => nowMin >= e.start && nowMin < e.start + e.dur) : null;
  const livePct = liveEvent ? (nowMin - liveEvent.start) / liveEvent.dur : 0;
  const laneL = liveEvent ? (liveEvent.lane / liveEvent.cols) * 100 : 0;
  const laneW = liveEvent ? 100 / liveEvent.cols : 100;

  /* ─── day turning ─── */
  const goDay = useCallback((n) => {
    beep("page");
    setTurn({ dir: n, k: uid() });
    setDateKey((k) => keyOf(addDays(parseKey(k), n)));
  }, [beep]);
  const jumpTo = (k) => {
    if (k === dateKey) return;
    beep("page");
    setTurn({ dir: k > dateKey ? 1 : -1, k: uid() });
    setDateKey(k);
  };

  const onSwipeStart = (e) => { if (e.touches.length !== 1 || gestureRef.current) return; swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, live: false }; };
  const onSwipeMove = (e) => {
    const s = swipeRef.current;
    if (!s || e.touches.length !== 1 || gestureRef.current) return;
    const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
    if (!s.live && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.4) { s.live = true; clearTimeout(holdRef.current); }
    if (s.live) setSwipe(Math.max(-140, Math.min(140, dx)));
  };
  const onSwipeEnd = () => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (s && s.live) { if (swipe < -64) goDay(1); else if (swipe > 64) goDay(-1); }
    setSwipe(0);
  };

  useEffect(() => {
    const h = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (inspect || composer || settings || noteEdit || scopeAsk) return;
      if (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); setSearch(true); return; }
      if (search) return;
      if (e.key === "ArrowRight") goDay(1);
      if (e.key === "ArrowLeft") goDay(-1);
      if (e.key === "t" || e.key === "T") jumpTo(todayKey);
      if (e.key === "n" || e.key === "N") setComposer({ kind: "event", start: snapTo(nowMin, 15), dur: 60 });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dateKey, inspect, composer, settings, noteEdit, search, scopeAsk, goDay, todayKey, nowMin]);

  /* ─── writes (series-aware) ─── */
  const flash = (label, payload) => {
    clearTimeout(undoT.current);
    setUndo({ label, payload, k: uid() });
    undoT.current = setTimeout(() => setUndo(null), 6000);
  };

  const patchItem = (kind, id, patch, scope = "one") => {
    if (kind === "event") {
      mutate((d) => updateCalendarEvent(d, id, patch, {
        scope: scope === "all" ? "series" : "occurrence",
      }).state);
      return;
    }
    const { base, date } = splitId(id);
    mutate((d) => {
      if (!date) {
        d.tasks = d.tasks.map((x) => (x.id === base ? { ...x, ...patch } : x));
        return d;
      }
      if (scope === "all") {
        d.tasks = d.tasks.map((x) => (x.id === base ? { ...x, ...patch } : x));
      } else {
        d.overrides = { ...d.overrides, [`${base}@${date}`]: { ...(d.overrides[`${base}@${date}`] || {}), ...patch } };
      }
      return d;
    });
  };

  const findTask = (id) => dayTasks.find((t) => t.id === id) || (db && db.tasks.find((t) => t.id === id));

  const completeTask = (id) => {
    const t = findTask(id);
    if (!t || t.done) return;
    beep("commit"); buzz([8, 30, 14]);
    setReward({ xp: t.xp, k: uid() });
    setTimeout(() => setReward(null), 900);
    patchItem("task", id, { done: true });
    mutate((d) => ({ ...d, xp: d.xp + t.xp }));
  };
  const reopenTask = (id) => {
    const t = findTask(id);
    if (!t || !t.done) return;
    beep("click");
    patchItem("task", id, { done: false });
    mutate((d) => ({ ...d, xp: Math.max(0, d.xp - t.xp) }));
  };
  const deferTask = (id, n = 1) => {
    const t = findTask(id);
    if (!t) return;
    beep("defer"); buzz(10);
    const { base, date } = splitId(id);
    if (date) {
      mutate((d) => {
        d.overrides = { ...d.overrides, [`${base}@${date}`]: { ...(d.overrides[`${base}@${date}`] || {}), deleted: true } };
        d.tasks = [...d.tasks, { ...t, id: uid(), repeat: null, instance: false, seriesId: undefined, date: keyOf(addDays(parseKey(date), n)) }];
        return d;
      });
    } else {
      patchItem("task", id, { date: keyOf(addDays(parseKey(t.date), n)) });
      flash(n > 0 ? "Moved to tomorrow" : "Moved back", { type: "task-date", id, n: -n });
    }
  };
  const moveToDay = (kind, id, targetKey) => {
    beep("drop"); buzz(8);
    const item = kind === "event" ? dayEvents.find((e) => e.id === id) : findTask(id);
    if (!item) return;
    const { base, date } = splitId(id);
    if (kind === "event") {
      const canonical = canonicalOccurrenceIdentity(id);
      const scope = canonical || date ? "occurrence" : "series";
      if (canonical) {
        const result = moveOccurrence(db, id, eventTimingFromPosition(item, targetKey), { id: uid() });
        setDb(result.state);
        flash(`Moved to ${fmtDay(targetKey)}`, { type: "restore-calendar-occurrence", snapshot: result.removed });
        return;
      }
      mutate((d) => moveCalendarEvent(d, id, { date: targetKey }, { scope }).state);
      flash(`Moved to ${fmtDay(targetKey)}`, {
        type: "calendar-event-move",
        id,
        target: { date: item.date, start: item.start },
        scope,
      });
      return;
    }
    if (date) {
      mutate((d) => {
        d.overrides = { ...d.overrides, [`${base}@${date}`]: { ...(d.overrides[`${base}@${date}`] || {}), deleted: true } };
        d.tasks = [...d.tasks, { ...item, id: uid(), repeat: null, seriesId: undefined, instance: false, date: targetKey }];
        return d;
      });
    } else {
      patchItem(kind, id, { date: targetKey });
      flash(`Moved to ${fmtDay(targetKey)}`, { type: "back-date", kind, id, date: item.date });
    }
  };
  const pullOverdue = () => {
    beep("schedule");
    const ids = overdue.map((t) => ({ id: t.id, date: t.date }));
    mutate((d) => { d.tasks = d.tasks.map((t) => (ids.find((x) => x.id === t.id) ? { ...t, date: todayKey } : t)); return d; });
    flash(`${ids.length} pulled to today`, { type: "task-restore-dates", ids });
  };
  const duplicateEvent = (id) => {
    const e = dayEvents.find((x) => x.id === id);
    if (!e) return;
    beep("schedule");
    const nid = uid();
    const copy = { ...e };
    delete copy.id;
    delete copy.seriesId;
    delete copy.recurrenceDate;
    delete copy.recurrenceAnchor;
    delete copy.instance;
    delete copy.timing;
    delete copy.recurrence;
    delete copy.segmentId;
    mutate((d) => createCalendarEvent(d, {
      ...copy,
      repeat: null,
      date: dateKey,
      start: e.allDay ? 0 : Math.min(1440 - e.dur, e.start + (e.dur || 60)),
    }, { id: nid }).state);
    setInspect(null);
    flash("Duplicated", { type: "drop-event", id: nid });
  };
  const scheduleTask = (id, at) => { beep("schedule"); buzz(8); patchItem("task", id, { at }); };
  const reorderTask = (id, targetId) => {
    beep("tick");
    mutate((d) => {
      const list = [...d.tasks].sort((a, b) => (a.order || 0) - (b.order || 0));
      const from = list.findIndex((t) => t.id === splitId(id).base);
      const to = list.findIndex((t) => t.id === splitId(targetId).base);
      if (from === -1 || to === -1 || from === to) return d;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      const orderMap = {};
      list.forEach((t, i) => { orderMap[t.id] = i; });
      d.tasks = d.tasks.map((t) => ({ ...t, order: orderMap[t.id] != null ? orderMap[t.id] : t.order }));
      return d;
    });
  };
  const toggleSub = (taskId, subId) => {
    const t = findTask(taskId);
    if (!t) return;
    beep("tick");
    patchItem("task", taskId, { subs: t.subs.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)) });
  };
  const addSub = (taskId, title) => {
    const t = findTask(taskId);
    if (!t) return;
    beep("tick");
    patchItem("task", taskId, { subs: [...t.subs, { id: uid(), title, done: false }] }, "all");
  };
  const removeSub = (taskId, subId) => {
    const t = findTask(taskId);
    if (!t) return;
    beep("delete");
    patchItem("task", taskId, { subs: t.subs.filter((s) => s.id !== subId) }, "all");
  };

  const doDelete = (kind, id, scope) => {
    beep("delete");
    const { base, date } = splitId(id);
    let removed = null;
    if (kind === "event") {
      const canonical = canonicalOccurrenceIdentity(id);
      let result;
      if (canonical && scope === "one") {
        result = cancelOccurrence(db, id, { id: uid() });
      } else if (canonical && scope === "following") {
        const newSeriesId = uid();
        const split = splitSeries(db, id, {}, { newSeriesId });
        const deleted = deleteCalendarEvent(split.state, newSeriesId, { scope: "series" });
        result = {
          ...deleted,
          removed: { kind: "planner-state", state: structuredClone(db) },
        };
      } else {
        result = deleteCalendarEvent(db, canonical ? canonical.seriesId : id, { scope: "series" });
      }
      removed = result.removed;
      setDb(result.state);
      setInspect(null); setScopeAsk(null);
      flash(scope === "one" && date ? "This one skipped" : "Deleted", {
        type: canonical && scope === "one"
          ? "restore-calendar-occurrence"
          : canonical && scope === "following"
            ? "restore-planner-state"
            : "restore-calendar-event",
        snapshot: removed,
      });
      return;
    }
    mutate((d) => {
      if (date && scope === "one") {
        d.overrides = { ...d.overrides, [`${base}@${date}`]: { ...(d.overrides[`${base}@${date}`] || {}), deleted: true } };
        return d;
      }
      if (kind === "task") {
        removed = d.tasks.find((x) => x.id === base);
        if (removed && removed.done) d.xp = Math.max(0, d.xp - removed.xp);
        d.tasks = d.tasks.filter((x) => x.id !== base);
      }
      if (kind === "note") { removed = d.notes.find((n) => n.id === base); d.notes = d.notes.filter((n) => n.id !== base); }
      return d;
    });
    setInspect(null); setNoteEdit(null); setScopeAsk(null);
    flash(scope === "one" && date ? "This one skipped" : "Deleted", date && scope === "one" ? { type: "unskip", key: `${base}@${date}` } : { type: "restore", kind, item: removed });
  };

  const removeItem = (kind, id) => {
    const { date } = splitId(id);
    if (date || (kind === "event" && canonicalOccurrenceIdentity(id))) setScopeAsk({ action: "delete", kind, id });
    else doDelete(kind, id, "all");
  };

  const runUndo = () => {
    if (!undo) return;
    const p = undo.payload;
    beep("click");
    mutate((d) => {
      if (p.type === "restore" && p.item) {
        if (p.kind === "task") { d.tasks = [...d.tasks, p.item]; if (p.item.done) d.xp += p.item.xp; }
        if (p.kind === "note") d.notes = [...d.notes, p.item];
      }
      if (p.type === "restore-calendar-event") return restoreCalendarEvent(d, p.snapshot).state;
      if (p.type === "restore-calendar-occurrence") return restoreOccurrence(d, p.snapshot).state;
      if (p.type === "restore-planner-state" && p.snapshot?.state) return structuredClone(p.snapshot.state);
      if (p.type === "drop-event") return deleteCalendarEvent(d, p.id, { scope: "series" }).state;
      if (p.type === "unskip") { const o = { ...d.overrides }; delete o[p.key]; d.overrides = o; }
      if (p.type === "task-date") d.tasks = d.tasks.map((t) => (t.id === p.id ? { ...t, date: keyOf(addDays(parseKey(t.date), p.n)) } : t));
      if (p.type === "back-date") d.tasks = d.tasks.map((x) => (x.id === p.id ? { ...x, date: p.date } : x));
      if (p.type === "calendar-event-move") return moveCalendarEvent(d, p.id, p.target, { scope: p.scope }).state;
      if (p.type === "task-restore-dates") d.tasks = d.tasks.map((t) => { const m = p.ids.find((x) => x.id === t.id); return m ? { ...t, date: m.date } : t; });
      if (p.type === "event-time") return updateCalendarEvent(d, p.id, { start: p.start, dur: p.dur }, { scope: p.scope }).state;
      return d;
    });
    setUndo(null);
  };

  const commitSave = (p, scope) => {
    beep(p.id ? "click" : "schedule");
    const patch = p.kind === "event"
      ? { title: p.title, start: p.start, dur: p.dur, cat: p.cat, place: p.place, note: p.note, allDay: p.allDay, endDate: p.endDate || null, repeat: p.repeat, recurrence: p.recurrence, timing: p.timing, alerts: p.alerts }
      : { title: p.title, cat: p.cat, xp: p.xp, at: p.at, due: p.due, note: p.note, repeat: p.repeat };
    if (p.date && scope !== "one") patch.date = p.date;
    if (p.id && p.kind === "event") {
      const canonical = canonicalOccurrenceIdentity(p.id);
      mutate((d) => {
        if (!canonical) return updateCalendarEvent(d, p.id, patch, { scope: scope === "all" ? "series" : "occurrence" }).state;
        const eventInput = legacyEventInputToCanonical({ ...patch, date: p.date || dateKey });
        if (scope === "one") {
          const { timing, recurrence, ...metadata } = eventInput;
          return moveOccurrence(d, p.id, timing, { id: uid(), patch: metadata }).state;
        }
        if (scope === "following") {
          return splitSeries(d, p.id, {
            ...eventInput,
            recurrence: eventInput.recurrence,
          }, { newSeriesId: uid() }).state;
        }
        const base = d.events.find((event) => event.id === canonical.seriesId);
        let seriesTiming = eventInput.timing;
        if (base?.timing.kind === "timed" && eventInput.timing.kind === "timed") {
          const baseDate = base.timing.startLocal.slice(0, 10);
          const duration = localDateTimeToEpochMinutes(eventInput.timing.endLocal) - localDateTimeToEpochMinutes(eventInput.timing.startLocal);
          const startLocal = `${baseDate}${eventInput.timing.startLocal.slice(10)}`;
          seriesTiming = {
            ...eventInput.timing,
            startLocal,
            endLocal: addMinutesToLocalDateTime(startLocal, duration),
            startOffset: undefined,
            endOffset: undefined,
          };
        } else if (base?.timing.kind === "all-day" && eventInput.timing.kind === "all-day") {
          const span = diffDays(eventInput.timing.endDateExclusive, eventInput.timing.startDate);
          seriesTiming = { kind: "all-day", startDate: base.timing.startDate, endDateExclusive: addDaysToKey(base.timing.startDate, span) };
        }
        return updateCalendarEvent(d, canonical.seriesId, { ...patch, date: undefined, timing: seriesTiming }, { scope: "series" }).state;
      });
    } else if (p.id) patchItem(p.kind, p.id, patch, scope);
    else {
      mutate((d) => {
        if (p.kind === "event") return createCalendarEvent(d, {
          date: p.date || dateKey,
          ...patch,
          alerts: p.alerts || [],
        }, { id: uid() }).state;
        else {
          const maxOrder = d.tasks.reduce((m, t) => Math.max(m, t.order || 0), 0);
          d.tasks = [...d.tasks, { id: uid(), date: p.date || dateKey, done: false, subs: [], order: maxOrder + 1, ...patch }];
        }
        return d;
      });
    }
    setComposer(null); setInspect(null); setScopeAsk(null);
  };
  const saveEntry = (p) => {
    const { date } = splitId(p.id || "");
    if (p.id && (date || canonicalOccurrenceIdentity(p.id))) setScopeAsk({ action: "save", payload: p });
    else commitSave(p, "all");
  };

  const saveNote = (id, text) => {
    beep("click");
    mutate((d) => {
      if (id) d.notes = d.notes.map((n) => (n.id === id ? { ...n, text } : n));
      else d.notes = [...d.notes, { id: uid(), date: dateKey, text }];
      return d;
    });
    setNoteEdit(null);
  };

  /* ─── export / import ─── */
  const download = (name, text, mime) => {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      beep("commit");
    } catch (e) { beep("abort"); }
  };
  const exportJson = () => download(`planner-${todayKey}.json`, JSON.stringify(db, null, 2), "application/json");
  const exportIcs = () => {
    const esc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Not Boring Moleskine Planner//EN"];
    db.events.forEach((e) => {
      const view = eventForUi(e);
      lines.push("BEGIN:VEVENT", `UID:${e.id}@planner`, `SUMMARY:${esc(e.title)}`);
      if (view.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${e.timing.startDate.replace(/-/g, "")}`);
        lines.push(`DTEND;VALUE=DATE:${e.timing.endDateExclusive.replace(/-/g, "")}`);
      } else {
        lines.push(
          `DTSTART:${e.timing.startLocal.replace(/[-:]/g, "")}00`,
          `DTEND:${e.timing.endLocal.replace(/[-:]/g, "")}00`,
        );
      }
      if (view.repeat) {
        const r = view.repeat;
        let rule = `FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval || 1}`;
        if (r.freq === "weekly" && r.byDay && r.byDay.length) rule += `;BYDAY=${r.byDay.map((i) => DAY_LETTERS[i]).join(",")}`;
        if (r.until) rule += `;UNTIL=${r.until.replace(/-/g, "")}T235900Z`;
        lines.push(`RRULE:${rule}`);
      }
      if (e.place) lines.push(`LOCATION:${esc(e.place)}`);
      if (e.note) lines.push(`DESCRIPTION:${esc(e.note)}`);
      (e.alerts || []).forEach((a) => lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:-PT${a}M`, `DESCRIPTION:${esc(e.title)}`, "END:VALARM"));
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    download(`planner-${todayKey}.ics`, lines.join("\r\n"), "text/calendar");
  };
  const importJson = (file) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        if (parsed && parsed.events) setPendingImport(parsed.schemaVersion === 5 ? validatePlannerStateV5(parsed) : migrateV4ToV5(parsed));
        else beep("abort");
      } catch (e) { beep("abort"); }
    };
    r.readAsText(file);
  };
  const wipeAll = () => {
    beep("delete");
    setDb(migrateV4ToV5({ themeId: T.id, sound: db.sound, notifs: db.notifs, xp: 0, overrides: {}, events: [], tasks: [], notes: [] }));
    setConfirmWipe(false);
    setSettings(false);
  };

  /* ─── zoom ─── */
  const zoomOut = () => { if (zoom === "day") { setZoom("week"); beep("tick"); } else if (zoom === "week") { setMonthCursor(activeDate); setZoom("month"); beep("tick"); } };
  const zoomIn = () => { if (zoom === "month") { setZoom("week"); beep("tick"); } else if (zoom === "week") { setZoom("day"); beep("tick"); } };
  const onTouchStartNav = (e) => { if (e.touches.length === 2) pinch.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); };
  const onTouchMoveNav = (e) => {
    if (e.touches.length !== 2 || !pinch.current) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (d / pinch.current > 1.3) { zoomIn(); pinch.current = d; }
    else if (d / pinch.current < 0.77) { zoomOut(); pinch.current = d; }
  };

  /* ─── stream gestures ─── */
  const minutesAt = (clientY) => {
    const el = streamRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return ((clientY - r.top + el.scrollTop) / DAY_H) * 1440;
  };
  const hitAttr = (x, y, attr) => {
    try {
      const el = document.elementFromPoint(x, y);
      const m = el && el.closest(`[${attr}]`);
      return m ? m.getAttribute(attr) : null;
    } catch (e) { return null; }
  };

  /* live mirrors so the native listeners below never read stale data */
  const eventsRef = useRef([]);
  const dateKeyRef = useRef(dateKey);
  const applyRef = useRef(() => {});
  const finishRef = useRef(() => {});

  const applyMove = (x, y) => {
    const g = gestureRef.current;
    if (!g) return;
    const overDay = hitAttr(x, y, "data-day");
    const overTask = hitAttr(x, y, "data-task");
    const m = minutesAt(y);
    const next = { ...g, x, y, overDay, overTask };
    if (g.mode === "move" && !overDay) next.start = Math.max(0, Math.min(1440 - g.dur, snapTo(m - g.grab)));
    if (g.mode === "resize") next.dur = Math.max(10, Math.min(1440 - g.start, snapTo(m - g.start)));
    if (g.mode === "draft") next.dur = Math.max(15, snapTo(m - g.start) || 15);
    gestureRef.current = next;
    setGesture(next);
  };

  const finishGesture = (x, y) => {
    const g = gestureRef.current;
    endGesture();
    if (!g) return;
    const key = dateKeyRef.current;
    if (g.mode === "move") {
      if (g.overDay && g.overDay !== key) moveToDay("event", g.id, g.overDay);
      else {
        beep("drop"); buzz(8);
        const canonical = canonicalOccurrenceIdentity(g.id);
        if (canonical) {
          const item = eventsRef.current.find((event) => event.id === g.id);
          const timing = eventTimingFromPosition(item, key, g.start, g.dur);
          const result = moveOccurrence(db, g.id, timing, { id: uid() });
          setDb(result.state);
          flash(`Moved to ${hhmm(g.start)}`, { type: "restore-calendar-occurrence", snapshot: result.removed });
        } else {
          const scope = splitId(g.id).date ? "occurrence" : "series";
          mutate((d) => moveCalendarEvent(d, g.id, { start: g.start }, { scope }).state);
          flash(`Moved to ${hhmm(g.start)}`, { type: "event-time", id: g.id, start: g.was.start, dur: g.was.dur, scope });
        }
      }
    } else if (g.mode === "resize") {
      beep("drop");
      const canonical = canonicalOccurrenceIdentity(g.id);
      if (canonical) {
        const item = eventsRef.current.find((event) => event.id === g.id);
        const timing = eventTimingFromPosition(item, key, g.start, g.dur);
        const result = moveOccurrence(db, g.id, timing, { id: uid() });
        setDb(result.state);
        flash(`Set to ${dur(g.dur)}`, { type: "restore-calendar-occurrence", snapshot: result.removed });
      } else {
        const scope = splitId(g.id).date ? "occurrence" : "series";
        mutate((d) => resizeCalendarEvent(d, g.id, g.dur, { scope }).state);
        flash(`Set to ${dur(g.dur)}`, { type: "event-time", id: g.id, start: g.was.start, dur: g.was.dur, scope });
      }
    } else if (g.mode === "draft") {
      beep("click");
      setComposer({ kind: "event", start: g.start, dur: g.dur });
    } else if (g.mode === "task") {
      if (g.overDay && g.overDay !== key) moveToDay("task", g.id, g.overDay);
      else if (g.overTask && g.overTask !== g.id) reorderTask(g.id, g.overTask);
      else {
        const el = streamRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) scheduleTask(g.id, snapTo(minutesAt(y), 15));
        }
      }
    }
  };

  applyRef.current = applyMove;
  finishRef.current = finishGesture;

  /* mouse / pen only — touch is handled by the delegated listeners below,
     because a scroll container fires pointercancel the instant the browser
     claims the gesture, which would kill every long press. */
  const canvasDown = (e) => {
    if (e.button === 2 || e.pointerType === "touch") return;
    const startMin = snapTo(minutesAt(e.clientY));
    tappedRef.current = true;
    holdRef.current = setTimeout(() => {
      tappedRef.current = false;
      beep("lift"); buzz(12);
      startGesture({ mode: "draft", start: startMin, dur: 30 });
    }, LIFT_MS);
  };
  const canvasUp = (e) => {
    if (e.pointerType === "touch") return;
    clearTimeout(holdRef.current); holdRef.current = null;
    if (gestureRef.current) return;
    if (tappedRef.current) {
      tappedRef.current = false;
      beep("click");
      setComposer({ kind: "event", start: snapTo(minutesAt(e.clientY), 15), dur: 60 });
    }
  };
  const eventDown = (e, ev) => {
    if (e.pointerType === "touch") return;
    e.stopPropagation();
    const grab = minutesAt(e.clientY) - ev.start;
    tappedRef.current = true;
    holdRef.current = setTimeout(() => {
      tappedRef.current = false;
      beep("lift"); buzz(14);
      startGesture({ mode: "move", kind: "event", id: ev.id, start: ev.start, dur: ev.dur, grab, was: { start: ev.start, dur: ev.dur }, x: e.clientX, y: e.clientY });
    }, LIFT_MS);
  };
  const eventUp = (e, ev) => {
    if (e.pointerType === "touch") return;
    clearTimeout(holdRef.current); holdRef.current = null;
    if (gestureRef.current) return;
    if (tappedRef.current) { tappedRef.current = false; e.stopPropagation(); beep("click"); setInspect({ kind: "event", id: ev.id }); }
  };
  const resizeDown = (e, ev) => {
    if (e.pointerType === "touch") return;
    e.stopPropagation();
    clearTimeout(holdRef.current); holdRef.current = null;
    tappedRef.current = false;
    beep("lift");
    startGesture({ mode: "resize", kind: "event", id: ev.id, start: ev.start, dur: ev.dur, was: { start: ev.start, dur: ev.dur } });
  };

  /* ─── touch: delegated on the stream, driven entirely by touch events ─── */
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    const press = { t: null };
    const disarm = () => { if (press.t) { clearTimeout(press.t.timer); press.t = null; } };

    const onStart = (e) => {
      if (e.touches.length !== 1 || gestureRef.current) return;
      const t = e.touches[0];
      const node = e.target.closest ? e.target.closest("[data-event-id],[data-resize]") : null;
      const m = minutesAt(t.clientY);
      if (node && node.hasAttribute("data-resize")) {
        const ev = eventsRef.current.find((x) => x.id === node.getAttribute("data-resize"));
        if (ev) { beep("lift"); buzz(10); startGesture({ mode: "resize", kind: "event", id: ev.id, start: ev.start, dur: ev.dur, was: { start: ev.start, dur: ev.dur }, x: t.clientX, y: t.clientY }); }
        return;
      }
      const id = node && node.getAttribute("data-event-id");
      const ev = id ? eventsRef.current.find((x) => x.id === id) : null;
      const p = { x: t.clientX, y: t.clientY, ev, startMin: snapTo(m), grab: ev ? m - ev.start : 0, held: false, timer: null };
      p.timer = setTimeout(() => {
        if (!press.t) return;
        press.t.held = true;
        beep("lift"); buzz(14);
        if (p.ev) startGesture({ mode: "move", kind: "event", id: p.ev.id, start: p.ev.start, dur: p.ev.dur, grab: p.grab, was: { start: p.ev.start, dur: p.ev.dur }, x: p.x, y: p.y });
        else startGesture({ mode: "draft", start: p.startMin, dur: 30, x: p.x, y: p.y });
      }, LIFT_MS);
      press.t = p;
    };

    const onMove = (e) => {
      if (gestureRef.current) {
        e.preventDefault();
        const t = e.touches[0];
        if (t) applyRef.current(t.clientX, t.clientY);
        return;
      }
      const p = press.t;
      if (!p) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - p.x) > 12 || Math.abs(t.clientY - p.y) > 12) disarm();
    };

    const onEnd = (e) => {
      const g = gestureRef.current;
      const p = press.t;
      disarm();
      const t = e.changedTouches && e.changedTouches[0];
      if (g) { finishRef.current(t ? t.clientX : g.x, t ? t.clientY : g.y); return; }
      if (p && !p.held) {
        if (p.ev) { beep("click"); setInspect({ kind: "event", id: p.ev.id }); }
        else { beep("click"); setComposer({ kind: "event", start: snapTo(p.startMin, 15), dur: 60 }); }
      }
    };

    const onCancel = (e) => {
      const g = gestureRef.current;
      disarm();
      if (g) { const t = e.changedTouches && e.changedTouches[0]; finishRef.current(t ? t.clientX : g.x, t ? t.clientY : g.y); }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [ready]);

  /* mouse / pen tracking, plus touch tracking for drags that begin outside the stream */
  useEffect(() => {
    if (!gesture) return;
    const move = (e) => applyRef.current(e.clientX, e.clientY);
    const up = (e) => finishRef.current(e.clientX, e.clientY);
    const tmove = (e) => {
      if (!gestureRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      if (t) applyRef.current(t.clientX, t.clientY);
    };
    const tend = (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      const g = gestureRef.current;
      if (g) finishRef.current(t ? t.clientX : g.x, t ? t.clientY : g.y);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.addEventListener("touchmove", tmove, { passive: false });
    document.addEventListener("touchend", tend);
    document.addEventListener("touchcancel", tend);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("touchmove", tmove);
      document.removeEventListener("touchend", tend);
      document.removeEventListener("touchcancel", tend);
    };
  }, [gesture && gesture.mode, gesture && gesture.id]);

  if (!ready || !db) {
    return (
      <div style={{ background: THEMES[0].bg, color: THEMES[0].dim, fontFamily: MONO, minHeight: "100vh" }} className="flex items-center justify-center text-xs tracking-widest">
        OPENING THE NOTEBOOK
      </div>
    );
  }

  eventsRef.current = events;
  dateKeyRef.current = dateKey;

  const inspectItem = inspect && (inspect.kind === "event" ? dayEvents.find((e) => e.id === inspect.id) : dayTasks.find((t) => t.id === inspect.id));
  const draggingTask = gesture && gesture.mode === "task" ? dayTasks.find((t) => t.id === gesture.id) : null;
  const dropMin = gesture && gesture.mode === "task" && !gesture.overDay && !gesture.overTask && streamRef.current
    ? (() => {
        const r = streamRef.current.getBoundingClientRect();
        if (gesture.y < r.top || gesture.y > r.bottom) return null;
        return snapTo(minutesAt(gesture.y), 15);
      })()
    : null;

  const actionsPanel = (
    <ActionsPanel
      T={T} listRef={listRef} tasks={dayTasks} notes={notes} overdue={overdue} deadlines={deadlines} showOverdue={isToday}
      todayKey={todayKey} gesture={gesture} onPullOverdue={pullOverdue} beep={beep}
      onComplete={completeTask} onReopen={reopenTask} onDefer={deferTask}
      onInspect={(id) => setInspect({ kind: "task", id })} onToggleSub={toggleSub} onAddSub={addSub} onRemoveSub={removeSub}
      onDragStart={(id, x, y) => { startGesture({ mode: "task", kind: "task", id, x, y }); setSheet(false); buzz(6); beep("lift"); }}
      onAddTask={() => { beep("click"); setComposer({ kind: "task" }); }}
      onEditNote={(n) => { beep("click"); setNoteEdit(n || { text: "" }); }}
      onUnschedule={(id) => scheduleTask(id, null)}
      onJump={jumpTo}
    />
  );

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: SANS, minHeight: "100vh" }}>
      <style>{`
        .nb-s::-webkit-scrollbar{width:5px;height:5px}
        .nb-s::-webkit-scrollbar-thumb{background:${T.faint}}
        .nb-s::-webkit-scrollbar-track{background:transparent}
        .nb-x::-webkit-scrollbar{display:none}
        .nb-x{-ms-overflow-style:none;scrollbar-width:none}
        .nb-stream{height:48vh;min-height:300px}
        @media(min-width:1024px){.nb-stream{height:auto;max-height:620px}}
        .nb-tap{transition:transform 90ms ease,opacity 120ms ease}
        .nb-tap:active{transform:scale(0.96)}
        .nb-row:hover{background:${T.faint}55}
        .nb-cell{transition:opacity 420ms cubic-bezier(.2,.7,.3,1),transform 420ms cubic-bezier(.2,.7,.3,1)}
        .nb-morph{transition:top 620ms cubic-bezier(.2,.8,.25,1),height 620ms cubic-bezier(.2,.8,.25,1),width 620ms cubic-bezier(.2,.8,.25,1),left 620ms cubic-bezier(.2,.8,.25,1),background 620ms ease,box-shadow 620ms ease}
        .nb-page{transform-origin:left center;backface-visibility:hidden}
        .nb-turn-next{animation:turnnext 380ms cubic-bezier(.22,.75,.3,1)}
        @keyframes turnnext{0%{opacity:.15;transform:perspective(1400px) rotateY(-19deg) translateX(11%) scale(.97)}60%{opacity:1}100%{opacity:1;transform:none}}
        .nb-turn-prev{animation:turnprev 380ms cubic-bezier(.22,.75,.3,1);transform-origin:right center}
        @keyframes turnprev{0%{opacity:.15;transform:perspective(1400px) rotateY(19deg) translateX(-11%) scale(.97)}60%{opacity:1}100%{opacity:1;transform:none}}
        .nb-up{animation:nbup 200ms cubic-bezier(.2,.9,.3,1.1)}
        @keyframes nbup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .nb-p{animation:nbp 620ms cubic-bezier(.1,.7,.3,1) forwards}
        @keyframes nbp{from{opacity:1;transform:translate(0,0) scale(1)}to{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.2)}}
        .nb-rw{animation:nbrw 900ms cubic-bezier(.2,.8,.3,1) forwards}
        @keyframes nbrw{0%{opacity:0;transform:translateY(20px) scale(.8)}25%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-52px) scale(1)}}
        .nb-blink{animation:nbb 2s ease-in-out infinite}
        @keyframes nbb{0%,100%{opacity:1}50%{opacity:.4}}
        .nb-liquid{background:repeating-linear-gradient(105deg, rgba(233,120,148,0.14) 0px, rgba(233,120,148,0.14) 10px, rgba(255,255,255,0) 10px, rgba(255,255,255,0) 30px);background-size:200% 100%;animation:nbliq 9s linear infinite}
        @keyframes nbliq{from{background-position:0% 0}to{background-position:200% 0}}
        .nb-liquid-2{background:radial-gradient(120% 70% at 20% 120%, rgba(255,150,175,0.16) 0%, rgba(255,150,175,0) 60%),radial-gradient(90% 60% at 75% -20%, rgba(120,20,45,0.5) 0%, rgba(120,20,45,0) 70%);animation:nbliq2 7s ease-in-out infinite alternate}
        @keyframes nbliq2{from{transform:translateX(-3%) scaleY(1)}to{transform:translateX(3%) scaleY(1.04)}}
        .nb-edge{background:linear-gradient(90deg, rgba(196,58,86,0) 0%, rgba(206,74,104,0.55) 55%, rgba(226,104,132,0.85) 100%);animation:nbedge 3.4s ease-in-out infinite}
        @keyframes nbedge{0%,100%{opacity:.75;transform:scaleX(1)}50%{opacity:1;transform:scaleX(1.35)}}
        button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid ${T.accent};outline-offset:2px}
        input,textarea,select{color:${T.text}}
        input::placeholder,textarea::placeholder{color:${T.dim}}
        @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
      `}</style>

      {/* ══ HUD ══ */}
      <header style={{ background: T.bg, borderBottom: `1px solid ${T.line}` }} className="sticky top-0 z-30 px-3 sm:px-5 py-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">LVL</span>
          <span style={{ fontFamily: MONO }} className="text-sm font-bold">{level}</span>
          <div style={{ background: T.faint }} className="w-14 h-1 mx-1"><div style={{ background: T.accent, width: `${levelPct}%` }} className="h-full" /></div>
          {streak > 0 && <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{streak}d</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { jumpTo(todayKey); setMonthCursor(new Date()); }} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap px-2 py-1 text-xs tracking-widest">TODAY</button>
          <button onClick={() => { beep("click"); setSearch(true); }} style={{ color: T.dim }} className="nb-tap w-8 h-8 text-sm" aria-label="Search">⌕</button>
          <button onClick={() => { beep("click"); setSettings(true); }} style={{ color: T.dim }} className="nb-tap w-8 h-8 text-sm" aria-label="Settings">⋯</button>
          <button onClick={() => { beep("click"); setComposer({ kind: "event", start: snapTo(nowMin, 15), dur: 60 }); }} style={{ background: T.accent, color: T.on, fontFamily: MONO }} className="nb-tap px-2 py-1.5 text-xs font-bold tracking-widest">NEW</button>
        </div>
      </header>

      {/* ══ NAVIGATOR ══ */}
      <div onTouchStart={onTouchStartNav} onTouchMove={onTouchMoveNav} style={{ borderBottom: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between px-3 sm:px-5 py-1.5">
          <button onClick={zoomOut} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap text-xs tracking-widest" disabled={zoom === "month"}>
            {zoom === "day" ? "◂ 14 DAYS" : zoom === "week" ? "◂ MONTH" : `${MO[monthCursor.getMonth()]} ${monthCursor.getFullYear()}`}
          </button>
          <div className="flex items-center gap-2">
            {zoom === "month" && (
              <>
                <button onClick={() => { beep("page"); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)); }} style={{ color: T.dim }} className="nb-tap px-2 text-xs">◂</button>
                <button onClick={() => { beep("page"); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)); }} style={{ color: T.dim }} className="nb-tap px-2 text-xs">▸</button>
              </>
            )}
            <button onClick={zoomIn} style={{ fontFamily: MONO, color: T.dim }} className="nb-tap text-xs tracking-widest" disabled={zoom === "day"}>
              {zoom === "month" ? "14 DAYS ▸" : zoom === "week" ? "DAY ▸" : ""}
            </button>
          </div>
        </div>

        {zoom === "month" && (
          <div className="px-3 sm:px-5 pb-3">
            <div className="grid grid-cols-7 mb-1">{WD1.map((d, i) => <span key={i} style={{ fontFamily: MONO, color: T.dim }} className="text-center text-xs tracking-widest">{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-px" style={{ background: T.line }}>
              {monthGrid.map((d, i) => {
                const k = keyOf(d);
                const n = densityOf(d);
                const inMonth = d.getMonth() === monthCursor.getMonth();
                const sel = k === dateKey;
                return (
                  <button key={k} data-day={k} onClick={() => { jumpTo(k); setZoom("week"); }} className="nb-cell relative py-2.5"
                    style={{ background: T.bg, opacity: mounted ? (inMonth ? 1 : 0.32) : 0, transitionDelay: `${Math.min(i, 24) * 8}ms` }}>
                    <span className="absolute inset-0" style={{ background: T.accent, opacity: n ? Math.min(0.75, 0.14 + n * 0.13) : 0 }} />
                    <span className="relative text-xs font-semibold" style={{ fontFamily: MONO, color: n > 2 ? T.on : T.text }}>{d.getDate()}</span>
                    {sel && <span className="absolute inset-0" style={{ boxShadow: `inset 0 0 0 2px ${T.accent}` }} />}
                    {k === todayKey && <span className="absolute left-1 top-1 w-1 h-1" style={{ background: NOW_RED }} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {zoom === "week" && (
          <div ref={stripRef} className="nb-x overflow-x-auto">
            <div className="flex min-w-max">
              {days.map((d, i) => {
                const k = keyOf(d);
                const on = k === dateKey;
                const n = densityOf(d);
                const target = gesture && gesture.overDay === k;
                return (
                  <button key={k} data-day={k} ref={on ? activeRef : null} onClick={() => jumpTo(k)}
                    className="nb-cell nb-tap relative w-16 sm:w-20 lg:w-24 shrink-0 py-2.5"
                    style={{ opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(10px)", transitionDelay: `${i * 26}ms`, boxShadow: target ? `inset 0 0 0 2px ${T.accent}` : "none" }}>
                    <span className="absolute inset-y-0 left-0 right-px" style={{ background: T.accent, opacity: on ? 1 : n ? Math.min(0.5, 0.1 + n * 0.1) : 0 }} />
                    <span className="relative block" style={{ color: on || n > 3 ? T.on : T.text }}>
                      <span style={{ fontFamily: MONO, color: on ? T.on : T.dim }} className="block text-xs tracking-widest">{WD[d.getDay()]}</span>
                      <span style={{ fontFamily: MONO }} className="block text-xl font-bold tracking-tight">{pad(d.getDate())}</span>
                      <span style={{ fontFamily: MONO, color: on ? T.on : T.dim }} className="block text-xs tracking-widest">{k === todayKey ? "NOW" : MO[d.getMonth()]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {zoom === "day" && (
          <div className="flex items-center justify-between px-3 sm:px-5 pb-2">
            <button onClick={() => goDay(-1)} style={{ color: T.dim }} className="nb-tap px-3 py-1">◂</button>
            <span style={{ fontFamily: MONO }} className="text-sm font-bold tracking-widest">{fmtDay(dateKey)}</span>
            <button onClick={() => goDay(1)} style={{ color: T.dim }} className="nb-tap px-3 py-1">▸</button>
          </div>
        )}
      </div>

      {/* ══ HERO ══ */}
      <div className="px-3 sm:px-5 pt-4 pb-3">
        <div className="flex items-end gap-3">
          <span style={{ fontFamily: MONO }} className="text-6xl sm:text-7xl font-bold tracking-tighter leading-none">{pad(activeDate.getDate())}</span>
          <span className="pb-1.5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest">{WD[activeDate.getDay()]} · {MO[activeDate.getMonth()]} {activeDate.getFullYear()}</span>
            <span className="block text-sm font-semibold leading-snug mt-0.5">{briefing}</span>
          </span>
        </div>
      </div>

      {/* ══ BODY ══ */}
      <main className="px-3 sm:px-5 grid grid-cols-1 lg:grid-cols-12 gap-5 pb-24 lg:pb-8">
        <section className="lg:col-span-7" onTouchStart={onSwipeStart} onTouchMove={onSwipeMove} onTouchEnd={onSwipeEnd} onTouchCancel={onSwipeEnd}
          style={{ transform: `translateX(${swipe * 0.32}px)`, transition: swipe === 0 ? "transform 260ms cubic-bezier(.2,.8,.25,1)" : "none" }}>
          <div key={turn ? turn.k : "first"} className={`nb-page ${turn ? (turn.dir > 0 ? "nb-turn-next" : "nb-turn-prev") : ""}`}>

            {allDay.length > 0 && (
              <div style={{ background: T.card, borderTopLeftRadius: 16, borderBottom: `1px solid ${T.line}` }} className="px-2 py-2 flex flex-col gap-1">
                {allDay.map((e) => {
                  const span = e.endDate ? diffDays(e.endDate, e.date) + 1 : 1;
                  const idx = diffDays(dateKey, e.date) + 1;
                  return (
                    <button key={e.id} onClick={() => { beep("click"); setInspect({ kind: "event", id: e.id }); }} className="nb-tap flex items-center gap-2 px-2 py-1.5 text-left" style={{ background: T.accent, color: T.on }}>
                      <span style={{ fontFamily: MONO }} className="text-xs tracking-widest">ALL DAY</span>
                      <span className="text-xs font-semibold truncate flex-1">{e.title}</span>
                      {span > 1 && <span style={{ fontFamily: MONO }} className="text-xs tracking-widest shrink-0">{idx}/{span}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div ref={streamRef} className="nb-s nb-stream overflow-y-auto relative" style={{ background: T.card, borderTopLeftRadius: allDay.length ? 0 : 16, userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
              <div className="relative" style={{ height: DAY_H }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="absolute left-0 right-0 flex items-start pointer-events-none" style={{ top: h * HOUR_H, height: HOUR_H, borderTop: `1px solid ${T.line}` }}>
                    <span style={{ fontFamily: MONO, color: T.dim }} className="w-11 sm:w-12 shrink-0 pt-1 pl-2 text-xs tracking-widest">{pad(h)}</span>
                    {suggested.includes(h) && !gesture && (
                      <span style={{ fontFamily: MONO, color: T.dim, border: `1px dashed ${T.faint}` }} className="flex-1 mr-2 mt-1.5 py-1 text-center text-xs tracking-widest">FREE — TAP TO ADD, HOLD TO SIZE</span>
                    )}
                  </div>
                ))}

                <div className="absolute inset-0" style={{ touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={canvasDown} onPointerUp={canvasUp} />

                <div className="absolute left-11 sm:left-12 right-0 top-0" style={{ height: DAY_H, pointerEvents: "none" }}>
                  {isToday && (
                    <>
                      <div className="nb-morph absolute overflow-hidden pointer-events-none" style={{
                        left: liveEvent ? `${laneL}%` : 0,
                        top: mounted ? (liveEvent ? (liveEvent.start / 1440) * DAY_H + 2 : (nowMin / 1440) * DAY_H) : 0,
                        height: mounted ? (liveEvent ? Math.max(24, (liveEvent.dur / 1440) * DAY_H) - 3 : 2) : 2,
                        width: liveEvent ? `calc((${laneW}% - 6px) * ${livePct})` : "calc(100% - 8px)",
                        background: liveEvent
                          ? `linear-gradient(100deg, ${NOW_INK} 0%, #7C1F38 42%, #97294A 78%, #A93055 100%)`
                          : NOW_LINE,
                        boxShadow: liveEvent ? "inset 0 0 22px rgba(0,0,0,0.35)" : "0 0 5px rgba(179,52,80,0.55)",
                      }}>
                        {liveEvent && (
                          <>
                            <span className="nb-liquid absolute inset-0" />
                            <span className="nb-liquid-2 absolute inset-0" />
                            <span className="nb-edge absolute inset-y-0" style={{ right: 0, width: 14 }} />
                          </>
                        )}
                      </div>
                      <span className="nb-morph absolute px-1 text-xs tracking-widest pointer-events-none"
                        style={{ fontFamily: MONO, background: liveEvent ? "transparent" : NOW_LINE, color: liveEvent ? NOW_RED : "#FFFFFF", right: 8, top: mounted ? (liveEvent ? (liveEvent.start / 1440) * DAY_H + 4 : (nowMin / 1440) * DAY_H - 9) : -9 }}>
                        {hhmm(nowMin)}
                      </span>
                    </>
                  )}

                  {events.map((e) => {
                    const top = (e.start / 1440) * DAY_H;
                    const h = Math.max(22, (e.dur / 1440) * DAY_H) - 3;
                    const live = isToday && nowMin >= e.start && nowMin < e.start + e.dur;
                    const past = isToday && nowMin >= e.start + e.dur;
                    const pct = live ? ((nowMin - e.start) / e.dur) * 100 : 0;
                    const held = gesture && gesture.id === e.id && (gesture.mode === "move" || gesture.mode === "resize");
                    return (
                      <div key={e.id} data-event-id={e.id} className="absolute" style={{ top: top + 2, height: h, left: `${(e.lane / e.cols) * 100}%`, width: `calc(${100 / e.cols}% - 6px)`, zIndex: held ? 20 : 1, opacity: held && gesture.overDay ? 0.35 : 1, pointerEvents: "auto" }}>
                        <div onPointerDown={(ev) => eventDown(ev, e)} onPointerUp={(ev) => eventUp(ev, e)} onContextMenu={(ev) => ev.preventDefault()}
                          className="relative w-full h-full overflow-hidden"
                          style={{
                            background: live ? "transparent" : T.bg,
                            opacity: past ? 0.42 : 1,
                            boxShadow: held ? `0 8px 24px rgba(0,0,0,.45), inset 0 0 0 2px ${T.accent}` : live ? `inset 0 0 0 1px ${NOW_RED}` : "none",
                            transform: held ? "scale(1.02)" : "none",
                            transition: "transform 120ms ease, box-shadow 120ms ease",
                            touchAction: "pan-y", cursor: "grab",
                          }}>
                          {!live && <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: held ? T.accent : T.faint }} />}
                          <div className="relative pl-2.5 pr-2 py-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold truncate">{e.title}</span>
                              {e.repeat && <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs shrink-0">↻</span>}
                              {e.alerts && e.alerts.length > 0 && <span style={{ color: T.dim }} className="text-xs shrink-0">◔</span>}
                              {live && <span style={{ fontFamily: MONO, background: NOW_RED, color: "#FFFFFF" }} className="shrink-0 px-1 text-xs tracking-widest">{Math.round(pct)}%</span>}
                              {held && <span style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="shrink-0 px-1 text-xs tracking-widest">{gesture.overDay ? fmtDay(gesture.overDay) : hhmm(e.start)}</span>}
                            </div>
                            {h >= 38 && <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest truncate">{hhmm(e.start)}–{hhmm(e.start + e.dur)} · {dur(e.dur)}</span>}
                            {h >= 88 && (e.place || e.note) && <span style={{ fontFamily: SERIF, color: T.dim }} className="block text-xs italic mt-1 truncate">{e.place || e.note}</span>}
                          </div>
                          {h >= 32 && (
                            <div data-resize={e.id} onPointerDown={(ev) => resizeDown(ev, e)} className="absolute inset-x-0 bottom-0 flex items-end justify-center" style={{ height: 10, cursor: "ns-resize", touchAction: "none" }}>
                              <span style={{ background: T.faint, width: 22, height: 2, marginBottom: 2 }} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {gesture && gesture.mode === "draft" && (
                    <div className="absolute left-0 right-2 pointer-events-none" style={{ top: (gesture.start / 1440) * DAY_H, height: (gesture.dur / 1440) * DAY_H, background: `${T.accent}33`, boxShadow: `inset 0 0 0 2px ${T.accent}` }}>
                      <span style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="absolute left-0 top-0 px-1 text-xs tracking-widest">{hhmm(gesture.start)} · {dur(gesture.dur)}</span>
                    </div>
                  )}

                  {dayTasks.filter((t) => t.at != null).map((t) => (
                    <button key={t.id} onClick={() => { beep("click"); setInspect({ kind: "task", id: t.id }); }} className="nb-tap absolute left-0 right-2 text-left overflow-hidden"
                      style={{ top: (t.at / 1440) * DAY_H + 2, height: 26, border: `1px dashed ${T.faint}`, opacity: t.done ? 0.4 : 1, zIndex: 5, pointerEvents: "auto" }}>
                      <span className="flex items-center gap-2 px-2 py-0.5">
                        <span className="w-2 h-2 shrink-0" style={{ background: t.done ? T.accent : "transparent", boxShadow: `inset 0 0 0 1px ${T.accent}` }} />
                        <span className="text-xs font-semibold truncate" style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                        <span style={{ fontFamily: MONO, color: T.dim }} className="ml-auto text-xs tracking-widest">{hhmm(t.at)}</span>
                      </span>
                    </button>
                  ))}

                  {dropMin != null && (
                    <div className="absolute left-0 right-2 pointer-events-none" style={{ top: (dropMin / 1440) * DAY_H, zIndex: 30 }}>
                      <div style={{ background: T.accent, height: 2 }} />
                      <span style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="absolute right-0 -top-2 px-1 text-xs tracking-widest">{hhmm(dropMin)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="hidden lg:block lg:col-span-5">{actionsPanel}</section>
      </main>

      {/* ══ MOBILE SHEET ══ */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex flex-col"
        style={{ height: "76vh", background: T.card, borderTop: `1px solid ${T.line}`, transform: sheet ? "translateY(0)" : "translateY(calc(100% - 52px))", transition: "transform 260ms cubic-bezier(.2,.8,.25,1)" }}>
        <div className="flex items-center gap-3 px-3 shrink-0" style={{ height: 52 }}>
          <button onClick={() => { beep("tick"); setSheet(!sheet); }} className="flex-1 flex items-center gap-2 text-left" aria-label="Toggle actions">
            <span style={{ background: T.faint }} className="w-8 h-0.5" />
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest">ACTIONS</span>
            <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">{openCount} OPEN</span>
            {isToday && overdue.length > 0 && <span style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest">{overdue.length} LATE</span>}
          </button>
          <button onClick={() => { beep("click"); setComposer({ kind: "task" }); }} style={{ background: T.accent, color: T.on, fontFamily: MONO }} className="nb-tap px-3 py-1.5 text-xs font-bold tracking-widest">+ ACTION</button>
        </div>
        <div className="nb-s flex-1 overflow-y-auto px-3 pb-6">{actionsPanel}</div>
      </div>

      {draggingTask && (
        <div className="fixed z-50 pointer-events-none px-2 py-1" style={{ left: gesture.x - 60, top: gesture.y - 18, background: T.accent, color: T.on }}>
          <span className="text-xs font-semibold">{gesture.overDay ? `→ ${fmtDay(gesture.overDay)}` : draggingTask.title}</span>
        </div>
      )}

      {alertToast && (
        <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-3 pointer-events-none">
          <div className="nb-up flex items-center gap-3 px-3 py-2 w-full sm:w-auto" style={{ background: NOW_RED, color: "#FFFFFF" }}>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest shrink-0">REMINDER</span>
            <span className="text-sm font-semibold truncate">{alertToast.title}</span>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest shrink-0">{alertToast.body}</span>
          </div>
        </div>
      )}

      {undo && (
        <div className="fixed inset-x-0 z-50 flex justify-center pointer-events-none" style={{ bottom: 68 }}>
          <div className="nb-up flex items-center gap-3 px-3 py-2 pointer-events-auto" style={{ background: T.text, color: T.bg }}>
            <span style={{ fontFamily: MONO }} className="text-xs tracking-widest">{undo.label}</span>
            <button onClick={runUndo} style={{ fontFamily: MONO, color: T.accent }} className="text-xs font-bold tracking-widest">UNDO</button>
          </div>
        </div>
      )}

      {reward && (
        <div className="fixed inset-x-0 top-1/3 z-50 flex justify-center pointer-events-none">
          <span key={reward.k} className="nb-rw text-7xl font-bold tracking-tighter" style={{ fontFamily: MONO, color: T.accent }}>+{reward.xp}</span>
        </div>
      )}
      {levelFlash && (
        <div className="fixed inset-x-0 top-20 z-50 flex justify-center pointer-events-none">
          <span style={{ background: T.accent, color: T.on, fontFamily: MONO }} className="nb-up px-3 py-1.5 text-xs font-bold tracking-widest">LEVEL {levelFlash}</span>
        </div>
      )}

      {/* ══ INSPECTOR ══ */}
      {inspectItem && (
        <Sheet T={T} title={inspect.kind === "event" ? "EVENT" : "ACTION"} onClose={() => { beep("click"); setInspect(null); }}>
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">{inspect.kind === "event" ? "EVENT" : "ACTION"} · {inspectItem.cat}{inspectItem.repeat ? " · ↻" : ""}</span>
          <h2 className="text-2xl font-bold tracking-tight leading-tight mt-2">{inspectItem.title}</h2>
          <div className="mt-4">
            {inspect.kind === "event" ? (
              <>
                <Row T={T} k="WINDOW" v={inspectItem.allDay ? "ALL DAY" : `${hhmm(inspectItem.start)} – ${hhmm(inspectItem.start + inspectItem.dur)}`} />
                {!inspectItem.allDay && <Row T={T} k="LENGTH" v={dur(inspectItem.dur)} />}
                {inspectItem.allDay && inspectItem.endDate && <Row T={T} k="THROUGH" v={fmtDay(inspectItem.endDate)} />}
                <Row T={T} k="PLACE" v={inspectItem.place || "—"} />
                <Row T={T} k="ALERTS" v={(inspectItem.alerts || []).length ? inspectItem.alerts.map((a) => (a === 0 ? "AT TIME" : dur(a))).join(", ") : "NONE"} />
              </>
            ) : (
              <>
                <Row T={T} k="REWARD" v={`+${inspectItem.xp} XP`} />
                <Row T={T} k="STATE" v={inspectItem.done ? "DONE" : "OPEN"} />
                <Row T={T} k="SCHEDULED" v={inspectItem.at != null ? hhmm(inspectItem.at) : "UNSCHEDULED"} />
                <Row T={T} k="DUE" v={inspectItem.due ? fmtDay(inspectItem.due) : "NO DEADLINE"} />
                <Row T={T} k="STEPS" v={`${inspectItem.subs.filter((s) => s.done).length}/${inspectItem.subs.length}`} />
              </>
            )}
            <Row T={T} k="REPEATS" v={inspectItem.repeat ? repeatLabel(inspectItem.repeat).toUpperCase() : "ONCE"} />
            <Row T={T} k="DATE" v={fmtDay(dateKey)} />
          </div>
          {inspectItem.note && <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic leading-relaxed mt-4">{inspectItem.note}</p>}
          <div className="flex gap-2 mt-5">
            <button onClick={() => removeItem(inspect.kind, inspect.id)} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap flex-1 py-3 text-xs tracking-widest">DELETE</button>
            <button onClick={() => { beep("click"); setComposer({ ...inspectItem, kind: inspect.kind, id: inspectItem.id }); }} style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap flex-1 py-3 text-xs font-bold tracking-widest">EDIT</button>
          </div>
          <button
            onClick={() => {
              if (inspect.kind === "event") duplicateEvent(inspect.id);
              else { inspectItem.done ? reopenTask(inspect.id) : completeTask(inspect.id); setInspect(null); }
            }}
            style={{ fontFamily: MONO, border: `1px solid ${T.line}`, color: T.text }} className="nb-tap w-full py-3 mt-2 text-xs tracking-widest">
            {inspect.kind === "event" ? "DUPLICATE" : inspectItem.done ? "REOPEN" : "MARK COMPLETE"}
          </button>
        </Sheet>
      )}

      {/* ══ SCOPE ASK ══ */}
      {scopeAsk && (
        <Sheet T={T} title="REPEATING ITEM" onClose={() => { beep("click"); setScopeAsk(null); }}>
          <h2 className="text-xl font-bold tracking-tight">This repeats</h2>
          <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-1 mb-4">Change this one day, or every day it appears?</p>
          <div className="flex flex-col gap-2">
            <button onClick={() => (scopeAsk.action === "delete" ? doDelete(scopeAsk.kind, scopeAsk.id, "one") : commitSave(scopeAsk.payload, "one"))}
              style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap py-3 text-xs tracking-widest">THIS DAY ONLY</button>
            {scopeAsk.kind === "event" && canonicalOccurrenceIdentity(scopeAsk.id || scopeAsk.payload?.id) && (
              <button onClick={() => (scopeAsk.action === "delete"
                ? doDelete(scopeAsk.kind, scopeAsk.id, "following")
                : commitSave(scopeAsk.payload, "following"))}
                style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap py-3 text-xs tracking-widest">THIS AND FOLLOWING</button>
            )}
            <button onClick={() => (scopeAsk.action === "delete" ? doDelete(scopeAsk.kind, scopeAsk.id, "all") : commitSave(scopeAsk.payload, "all"))}
              style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap py-3 text-xs font-bold tracking-widest">THE WHOLE SERIES</button>
          </div>
        </Sheet>
      )}

      {composer && (
        <Sheet T={T} title={composer.id ? "EDIT" : "NEW"} onClose={() => { beep("click"); setComposer(null); }}>
          <Composer T={T} initial={composer} dateLabel={fmtDay(dateKey)} dateKey={dateKey} onSubmit={saveEntry} onTick={() => beep("tick")} />
        </Sheet>
      )}

      {noteEdit && (
        <Sheet T={T} title="NOTE" onClose={() => { beep("click"); setNoteEdit(null); }}>
          <NoteEditor T={T} note={noteEdit} onSave={(text) => saveNote(noteEdit.id, text)} onDelete={() => noteEdit.id && doDelete("note", noteEdit.id, "all")} />
        </Sheet>
      )}

      {search && (
        <Sheet T={T} title="SEARCH" onClose={() => { beep("click"); setSearch(false); }}>
          <SearchPanel T={T} db={db} todayKey={todayKey} onPick={(item) => {
            setSearch(false);
            const occurrence = item.kind === "event" && item.recurrence
              ? nextCalendarOccurrence(item, todayKey)
              : null;
            const target = item.kind === "note" ? item.date : occurrence ? occurrence.timing.kind === "all-day" ? occurrence.timing.startDate : occurrence.timing.startLocal.slice(0, 10) : item.repeat ? nextOccurrence(item, todayKey) : item.date;
            jumpTo(target);
            if (item.kind !== "note") setTimeout(() => setInspect({ kind: item.kind, id: occurrence?.id || (item.repeat ? `${item.id}@${target}` : item.id) }), 60);
          }} />
        </Sheet>
      )}

      {settings && (
        <Sheet T={T} title="SETTINGS" onClose={() => { beep("click"); setSettings(false); }}>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

          <div className="mt-4">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">FEEDBACK</span>
            <button onClick={() => { beep("tick"); mutate((d) => ({ ...d, sound: !d.sound })); }} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">Sound</span>
              <span style={{ fontFamily: MONO, color: db.sound ? T.accent : T.dim }} className="text-xs tracking-widest">{db.sound ? "ON" : "OFF"}</span>
            </button>
            <button onClick={askNotifs} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="text-sm">System notifications</span>
              <span style={{ fontFamily: MONO, color: db.notifs ? T.accent : T.dim }} className="text-xs tracking-widest">{db.notifs ? "ON" : "ALLOW"}</span>
            </button>
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">THEME</span>
            <div className="flex flex-col mt-1">
              {THEMES.map((th) => (
                <button key={th.id} onClick={() => { beep("tick"); mutate((d) => ({ ...d, themeId: th.id })); }} className="nb-row flex items-center gap-3 py-2 px-1 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <span className="flex shrink-0">
                    <span className="w-4 h-6" style={{ background: th.bg }} />
                    <span className="w-4 h-6" style={{ background: th.card }} />
                    <span className="w-4 h-6" style={{ background: th.accent }} />
                  </span>
                  <span className="flex-1 text-sm font-semibold">{th.name}</span>
                  {th.id === T.id && <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">ON</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">YOUR DATA</span>
            <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic mt-1 mb-2">Everything lives on this device. There's no account to sync with — take it with you as a file instead.</p>
            {storageBad && (
              <p style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest mb-2">SAVING TO THIS DEVICE FAILED — EXPORT A COPY</p>
            )}
            {pendingImport && (
              <div className="flex items-center gap-2 mb-2 p-2" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
                <span className="flex-1 text-xs">Replace everything on this device?</span>
                <button onClick={() => { setPendingImport(null); beep("abort"); }} style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">CANCEL</button>
                <button onClick={() => { setDb(pendingImport); setPendingImport(null); beep("commit"); setSettings(false); }} style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs font-bold tracking-widest">REPLACE</button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={exportIcs} style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 text-xs tracking-widest">EXPORT .ICS</button>
              <button onClick={exportJson} style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 text-xs tracking-widest">EXPORT .JSON</button>
              <label style={{ fontFamily: MONO, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 text-xs tracking-widest cursor-pointer">
                IMPORT .JSON
                <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
              </label>
            </div>
          </div>

          <div className="mt-4">
            {confirmWipe ? (
              <div className="flex items-center gap-2 p-2" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
                <span className="flex-1 text-xs">Erase every event, action and note?</span>
                <button onClick={() => setConfirmWipe(false)} style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">KEEP</button>
                <button onClick={wipeAll} style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs font-bold tracking-widest">ERASE</button>
              </div>
            ) : (
              <button onClick={() => { beep("click"); setConfirmWipe(true); }} style={{ fontFamily: MONO, color: T.dim, border: `1px solid ${T.line}` }} className="nb-tap px-3 py-2 text-xs tracking-widest">START A BLANK NOTEBOOK</button>
            )}
          </div>

          <div className="mt-5">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">SHORTCUTS</span>
            <div className="mt-1">
              <Row T={T} k="← →" v="PREVIOUS / NEXT DAY" />
              <Row T={T} k="T" v="TODAY" />
              <Row T={T} k="N" v="NEW EVENT" />
              <Row T={T} k="/" v="SEARCH" />
            </div>
          </div>

          <button onClick={() => { beep("click"); setSettings(false); }} style={{ fontFamily: MONO, background: T.accent, color: T.on }} className="nb-tap w-full py-3 mt-5 text-xs font-bold tracking-widest">DONE</button>
        </Sheet>
      )}
    </div>
  );
}

function nextOccurrence(item, fromKey) {
  for (let i = 0; i < 400; i++) {
    const k = keyOf(addDays(parseKey(fromKey), i));
    if (taskOccursOn(item, k)) return k;
  }
  return item.date;
}

function nextCalendarOccurrence(item, fromKey) {
  return previewRecurrence(item, 100).find((occurrence) => {
    const date = occurrence.timing.kind === "all-day" ? occurrence.timing.startDate : occurrence.timing.startLocal.slice(0, 10);
    return date >= fromKey;
  }) || null;
}

/* ═══════════════════════ ACTIONS ═══════════════════════ */

function ActionsPanel({ T, listRef, tasks, notes, overdue, deadlines, showOverdue, todayKey, gesture, onPullOverdue, beep, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onAddTask, onEditNote, onUnschedule, onJump }) {
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  return (
    <div ref={listRef}>
      <div className="hidden lg:flex items-baseline justify-between mb-3">
        <h2 className="text-2xl font-bold tracking-tight">Actions</h2>
        <button onClick={onAddTask} style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest">+ ADD</button>
      </div>

      {showOverdue && overdue.length > 0 && (
        <button onClick={onPullOverdue} className="w-full flex items-center gap-2 px-3 py-2 mb-2 text-left" style={{ boxShadow: `inset 0 0 0 1px ${NOW_RED}` }}>
          <span style={{ fontFamily: MONO, color: NOW_RED }} className="text-xs tracking-widest shrink-0">{overdue.length} OVERDUE</span>
          <span className="flex-1 text-xs truncate" style={{ color: T.dim }}>{overdue.map((t) => t.title).join(" · ")}</span>
          <span style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest shrink-0">PULL IN</span>
        </button>
      )}

      {deadlines.length > 0 && (
        <div className="mb-3">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">DEADLINES</span>
          <div className="flex flex-col mt-1">
            {deadlines.slice(0, 4).map((t) => {
              const dLeft = diffDays(t.due, todayKey);
              return (
                <button key={t.id} onClick={() => onJump(t.date)} className="nb-row flex items-center gap-2 py-1.5 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <span style={{ fontFamily: MONO, color: dLeft <= 1 ? NOW_RED : T.dim }} className="text-xs tracking-widest shrink-0 w-14">{dLeft === 0 ? "TODAY" : dLeft === 1 ? "TOMORROW" : `${dLeft}D`}</span>
                  <span className="flex-1 text-xs truncate">{t.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <button onClick={onAddTask} className="w-full py-8 text-center" style={{ border: `1px dashed ${T.faint}` }}>
          <span style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic">Nothing claimed for this day yet. Add the one thing that matters.</span>
        </button>
      )}

      <div className="flex flex-col gap-2">
        {open.map((t) => (
          <TaskCard key={t.id} T={T} t={t} beep={beep} target={gesture && gesture.overTask === t.id} todayKey={todayKey}
            onComplete={onComplete} onReopen={onReopen} onDefer={onDefer} onInspect={onInspect} onToggleSub={onToggleSub} onAddSub={onAddSub} onRemoveSub={onRemoveSub} onDragStart={onDragStart} onUnschedule={onUnschedule} />
        ))}
      </div>

      {done.length > 0 && (
        <div className="mt-4">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">DONE · {done.length}</span>
          <div className="flex flex-col gap-2 mt-2">
            {done.map((t) => (
              <TaskCard key={t.id} T={T} t={t} beep={beep} todayKey={todayKey}
                onComplete={onComplete} onReopen={onReopen} onDefer={onDefer} onInspect={onInspect} onToggleSub={onToggleSub} onAddSub={onAddSub} onRemoveSub={onRemoveSub} onDragStart={onDragStart} onUnschedule={onUnschedule} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">NOTES</span>
          <button onClick={() => onEditNote(null)} style={{ fontFamily: MONO, color: T.accent }} className="nb-tap text-xs tracking-widest">+ WRITE</button>
        </div>
        <div className="flex flex-col gap-3 mt-2">
          {notes.map((n) => (
            <button key={n.id} onClick={() => onEditNote(n)} className="text-left pl-3" style={{ borderLeft: `2px solid ${T.faint}` }}>
              <p style={{ fontFamily: SERIF }} className="text-sm italic leading-relaxed">{n.text}</p>
            </button>
          ))}
          {notes.length === 0 && <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic pl-3">No notes on this page yet.</p>}
        </div>
      </div>
    </div>
  );
}

function TaskCard({ T, t, beep, target, todayKey, onComplete, onReopen, onDefer, onInspect, onToggleSub, onAddSub, onRemoveSub, onDragStart, onUnschedule }) {
  const [prog, setProg] = useState(0);
  const [dx, setDx] = useState(0);
  const [burst, setBurst] = useState(null);
  const raf = useRef(null), t0 = useRef(0), lastTick = useRef(0), holding = useRef(false);
  const sw = useRef(null);

  const stopHold = (aborted) => {
    cancelAnimationFrame(raf.current);
    if (holding.current && aborted && prog > 0.15) beep("abort");
    holding.current = false;
    setProg(0);
  };
  const startHold = () => {
    if (t.done) return;
    holding.current = true;
    t0.current = performance.now();
    lastTick.current = 0;
    const loop = (now) => {
      const p = Math.min(1, (now - t0.current) / HOLD_MS);
      setProg(p);
      const step = 0.17 - 0.11 * p;
      if (p - lastTick.current >= step) { lastTick.current = p; beep("ratchet", p); buzz(3); }
      if (p >= 1) { holding.current = false; setProg(0); fire(); return; }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  const fire = () => { setBurst(uid()); setTimeout(() => setBurst(null), 640); onComplete(t.id); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onDown = (e) => { sw.current = { x: e.clientX, y: e.clientY, live: false }; };
  const onMove = (e) => {
    if (!sw.current) return;
    const ddx = e.clientX - sw.current.x, ddy = e.clientY - sw.current.y;
    if (!sw.current.live && Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy)) { sw.current.live = true; stopHold(false); }
    if (sw.current.live) setDx(Math.max(-140, Math.min(140, ddx)));
  };
  const onUp = () => {
    if (sw.current && sw.current.live) {
      if (dx > 96 && !t.done) fire();
      else if (dx < -96) onDefer(t.id, 1);
    }
    sw.current = null;
    setDx(0);
  };

  const subDone = t.subs.filter((s) => s.done).length;
  const subPct = t.subs.length ? (subDone / t.subs.length) * 100 : 0;
  const dueLeft = t.due ? diffDays(t.due, todayKey) : null;

  return (
    <div data-task={t.id} className="relative overflow-hidden" style={{ background: T.bg, boxShadow: target ? `inset 0 2px 0 ${T.accent}` : "none" }}>
      <div className="absolute inset-0 flex items-center justify-between px-4" style={{ fontFamily: MONO }}>
        <span className="text-xs tracking-widest" style={{ color: T.accent, opacity: dx > 20 ? 1 : 0 }}>COMPLETE</span>
        <span className="text-xs tracking-widest" style={{ color: T.dim, opacity: dx < -20 ? 1 : 0 }}>TOMORROW</span>
      </div>

      <article className="relative" style={{ background: T.card, transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 220ms cubic-bezier(.2,.8,.25,1)" : "none", opacity: t.done ? 0.55 : 1, touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: t.done ? T.accent : T.faint }} />

        <div className="flex items-start gap-3 p-3 pl-4">
          <button onPointerDown={(e) => { e.stopPropagation(); if (!t.done) startHold(); }} onPointerUp={(e) => { e.stopPropagation(); if (t.done) onReopen(t.id); else stopHold(true); }}
            onPointerLeave={() => stopHold(true)} onPointerCancel={() => stopHold(true)}
            className="relative mt-0.5 w-8 h-8 shrink-0 flex items-center justify-center" aria-label={t.done ? "Reopen" : "Hold to complete"} style={{ touchAction: "none" }}>
            <svg width="32" height="32" viewBox="0 0 32 32" className="absolute inset-0">
              <circle cx="16" cy="16" r="13" fill="none" stroke={T.faint} strokeWidth="2" />
              <circle cx="16" cy="16" r="13" fill="none" stroke={T.accent} strokeWidth="3" strokeDasharray={2 * Math.PI * 13} strokeDashoffset={2 * Math.PI * 13 * (1 - (t.done ? 1 : prog))} transform="rotate(-90 16 16)" />
            </svg>
            <span className="relative" style={{ width: 10, height: 10, background: t.done ? T.accent : "transparent", transform: `scale(${1 + prog * 0.5})` }} />
            {burst && Array.from({ length: 10 }).map((_, i) => {
              const a = (i / 10) * Math.PI * 2;
              return <span key={burst + i} className="nb-p absolute" style={{ width: 4, height: 4, background: T.accent, "--tx": `${Math.cos(a) * 34}px`, "--ty": `${Math.sin(a) * 34}px` }} />;
            })}
          </button>

          <div className="flex-1 min-w-0">
            <button onClick={() => onInspect(t.id)} className="text-left w-full">
              <span className="block text-sm font-semibold leading-snug" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? T.dim : T.text }}>{t.title}</span>
            </button>
            <div className="flex flex-wrap items-center gap-2 mt-1" style={{ fontFamily: MONO }}>
              <span style={{ color: T.dim }} className="text-xs tracking-widest">{t.cat}</span>
              {t.repeat && <span style={{ color: T.dim }} className="text-xs">↻</span>}
              {t.at != null && <button onClick={() => onUnschedule(t.id)} style={{ color: T.accent }} className="text-xs tracking-widest">{hhmm(t.at)}</button>}
              {dueLeft != null && <span style={{ color: dueLeft <= 0 ? NOW_RED : T.dim }} className="text-xs tracking-widest">DUE {dueLeft === 0 ? "TODAY" : dueLeft < 0 ? `${-dueLeft}D LATE` : `${dueLeft}D`}</span>}
              {t.subs.length > 0 && <span style={{ color: T.dim }} className="text-xs tracking-widest">{subDone}/{t.subs.length}</span>}
            </div>
            {t.subs.length > 0 && (
              <div className="h-0.5 mt-2" style={{ background: T.faint }}>
                <div className="h-full" style={{ background: T.accent, width: `${subPct}%`, transition: "width 220ms ease" }} />
              </div>
            )}
          </div>

          <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(t.id, e.clientX, e.clientY); }} style={{ color: T.dim, touchAction: "none" }}
            className="nb-tap shrink-0 w-7 h-8 text-xs" aria-label="Drag to schedule, reorder, or move to another day">⣿</button>
        </div>

        {t.subs.length > 0 && !t.done && (
          <div className="pl-8 pr-3 pb-3">
            <div className="pl-3" style={{ borderLeft: `2px solid ${T.faint}` }}>
              {t.subs.map((s) => (
                <div key={s.id} className="nb-row flex items-center gap-2 w-full py-1.5">
                  <button onClick={() => onToggleSub(t.id, s.id)} className="flex items-center gap-2 flex-1 text-left">
                    <span className="w-3 h-3 shrink-0" style={{ background: s.done ? T.accent : "transparent", boxShadow: `inset 0 0 0 1px ${s.done ? T.accent : T.faint}` }} />
                    <span className="text-xs" style={{ textDecoration: s.done ? "line-through" : "none", color: s.done ? T.dim : T.text }}>{s.title}</span>
                  </button>
                  <button onClick={() => onRemoveSub(t.id, s.id)} style={{ color: T.dim }} className="text-xs px-1" aria-label="Remove step">✕</button>
                </div>
              ))}
              <SubComposer T={T} onAdd={(v) => onAddSub(t.id, v)} />
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

/* ═══════════════════════ PIECES ═══════════════════════ */

function Row({ T, k, v }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${T.line}`, fontFamily: MONO }}>
      <span style={{ color: T.dim }} className="text-xs tracking-widest">{k}</span>
      <span className="text-xs tracking-widest">{v}</span>
    </div>
  );
}

function Sheet({ T, onClose, title, children }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.8)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title || "Details"} onClick={(e) => e.stopPropagation()}
        className="nb-up w-full sm:max-w-md overflow-y-auto nb-s" style={{ background: T.card, color: T.text, maxHeight: "88vh" }}>
        <div className="sticky top-0 flex items-center justify-between px-4 sm:px-5 pt-3 pb-2" style={{ background: T.card, zIndex: 3 }}>
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">{title || ""}</span>
          <button onClick={onClose} aria-label="Close" style={{ color: T.dim, fontFamily: MONO }} className="nb-tap -mr-1 px-2 py-1 text-sm">✕</button>
        </div>
        <div className="px-4 sm:px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

function SubComposer({ T, onAdd }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV(""); } };
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-3 h-3 shrink-0" style={{ boxShadow: `inset 0 0 0 1px ${T.faint}` }} />
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Add a step" style={{ background: "transparent", border: "none" }} className="flex-1 text-xs py-0.5" />
      {v.trim() && <button onClick={go} style={{ fontFamily: MONO, color: T.accent }} className="text-xs tracking-widest">ADD</button>}
    </div>
  );
}

function NoteEditor({ T, note, onSave, onDelete }) {
  const [v, setV] = useState(note.text || "");
  return (
    <div>
      <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">{note.id ? "EDIT NOTE" : "NEW NOTE"}</span>
      <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={6} placeholder="What was this day actually like?"
        style={{ background: "transparent", border: `1px solid ${T.line}`, fontFamily: SERIF, resize: "none", width: "100%" }} className="text-sm italic leading-relaxed p-3 mt-2" />
      <div className="flex gap-2 mt-4">
        {note.id && <button onClick={onDelete} style={{ fontFamily: MONO, color: NOW_RED, border: `1px solid ${T.line}` }} className="nb-tap flex-1 py-3 text-xs tracking-widest">DELETE</button>}
        <button onClick={() => v.trim() && onSave(v.trim())} disabled={!v.trim()} style={{ fontFamily: MONO, background: v.trim() ? T.accent : "transparent", color: v.trim() ? T.on : T.dim, border: `1px solid ${v.trim() ? T.accent : T.faint}` }} className="nb-tap flex-1 py-3 text-xs font-bold tracking-widest">SAVE</button>
      </div>
    </div>
  );
}

function SearchPanel({ T, db, todayKey, onPick }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const hit = (x) => [x.title, x.note, x.place, x.text].filter(Boolean).some((f) => String(f).toLowerCase().includes(s));
    return [
      ...db.events.filter(hit).map((e) => ({ ...eventForUi(e), kind: "event" })),
      ...db.tasks.filter(hit).map((t) => ({ ...t, kind: "task" })),
      ...db.notes.filter(hit).map((n) => ({ ...n, kind: "note", title: n.text.slice(0, 60) })),
    ].slice(0, 30);
  }, [q, db]);

  return (
    <div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything"
        style={{ background: "transparent", border: `1px solid ${T.line}` }} className="w-full px-3 py-3 text-base font-semibold" />
      <div className="mt-3 flex flex-col">
        {q && results.length === 0 && <p style={{ fontFamily: SERIF, color: T.dim }} className="text-sm italic py-4">Nothing matches that. Try a shorter word.</p>}
        {results.map((r) => (
          <button key={r.kind + r.id} onClick={() => onPick(r)} className="nb-row flex items-center gap-2 py-2.5 text-left" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0 w-12">{r.kind === "event" ? "EVT" : r.kind === "task" ? "ACT" : "NOTE"}</span>
            <span className="flex-1 text-sm truncate">{r.title}</span>
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest shrink-0">{r.repeat ? "↻" : fmtDay(r.date).slice(4)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({ T, initial, dateLabel, dateKey, onSubmit, onTick }) {
  const editing = !!initial.id;
  const [kind, setKind] = useState(initial.kind || "event");
  const [title, setTitle] = useState(initial.title || "");
  const [cat, setCat] = useState(initial.cat || CATS[0]);
  const [start, setStart] = useState(initial.start != null ? initial.start : 540);
  const [len, setLen] = useState(initial.dur != null && initial.dur > 0 ? initial.dur : 60);
  const [xp, setXp] = useState(initial.xp || 30);
  const [place, setPlace] = useState(initial.place || "");
  const [note, setNote] = useState(initial.note || "");
  const [at, setAt] = useState(initial.at != null ? initial.at : null);
  const [due, setDue] = useState(initial.due || "");
  const [allDay, setAllDay] = useState(!!initial.allDay);
  const [endDate, setEndDate] = useState(initial.endDate || "");
  const [alerts, setAlerts] = useState(initial.alerts || []);
  const [repeat, setRepeat] = useState(initial.repeat || null);
  const [date, setDate] = useState(initial.date || dateKey);
  const [timeZoneMode, setTimeZoneMode] = useState(initial.timeZoneMode || "floating");
  const [timeZone, setTimeZone] = useState(initial.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [startOffset, setStartOffset] = useState(initial.timing?.startOffset || "");
  const [endOffset, setEndOffset] = useState(initial.timing?.endOffset || "");
  const field = { background: "transparent", border: `1px solid ${T.line}` };
  const startLocal = `${date}T${`${pad(Math.floor(start / 60))}:${pad(start % 60)}`}`;
  const endLocal = addMinutesToLocalDateTime(startLocal, len);
  const offsetInfo = useMemo(() => {
    if (allDay || timeZoneMode !== "zoned") return { start: [], end: [], valid: true };
    try {
      const startCandidates = getOffsetCandidates(startLocal, timeZone);
      const endCandidates = getOffsetCandidates(endLocal, timeZone);
      return { start: startCandidates, end: endCandidates, valid: startCandidates.length > 0 && endCandidates.length > 0 };
    } catch { return { start: [], end: [], valid: false }; }
  }, [allDay, timeZoneMode, startLocal, endLocal, timeZone]);
  const recurrence = repeat?.freq ? {
    frequency: repeat.freq,
    interval: repeat.interval || 1,
    weekStart: 0,
    ...(repeat.freq === "weekly" ? { byWeekday: repeat.byDay || [parseKey(date).getDay()] } : {}),
    ...(repeat.freq === "monthly" && repeat.monthlyMode === "last-weekday" ? { byWeekday: [{ weekday: parseKey(date).getDay(), ordinal: -1 }] } : {}),
    ...(repeat.freq === "monthly" && repeat.monthlyMode !== "last-weekday" ? { byMonthDay: [parseKey(date).getDate()] } : {}),
    ...(repeat.freq === "yearly" ? { byMonth: [parseKey(date).getMonth() + 1], byMonthDay: [parseKey(date).getDate()] } : {}),
    ...(repeat.endMode === "count" ? { count: Math.max(1, Number(repeat.count) || 1) } : repeat.until ? { until: repeat.until } : {}),
    missingDatePolicy: repeat.missingDatePolicy || "skip",
  } : null;
  const timing = allDay
    ? { kind: "all-day", startDate: date, endDateExclusive: addDaysToKey(endDate && endDate >= date ? endDate : date, 1) }
    : {
      kind: "timed", timeZoneMode, startLocal, endLocal,
      ...(timeZoneMode === "zoned" ? {
        timeZone,
        ...(offsetInfo.start.length > 1 ? { startOffset: startOffset || offsetInfo.start[0].offset } : {}),
        ...(offsetInfo.end.length > 1 ? { endOffset: endOffset || offsetInfo.end[0].offset } : {}),
      } : {}),
    };
  const ok = title.trim().length > 0 && (allDay || offsetInfo.valid);
  const preview = useMemo(() => {
    if (kind !== "event" || !recurrence || !ok) return [];
    try {
      return previewRecurrence({ id: "preview", title: title.trim(), calendarId: "calendar-default", timing, recurrence }, 5);
    } catch { return []; }
  }, [kind, recurrence && JSON.stringify(recurrence), JSON.stringify(timing), ok]);
  const submit = () => {
    if (!ok) return;
    onSubmit({ id: initial.id, date, kind, title: title.trim(), cat, start: allDay ? 0 : start, dur: allDay ? 0 : len, xp, place, note, at, due: due || null, allDay, endDate, alerts, repeat: repeat && repeat.freq ? repeat : null, recurrence, timing });
  };
  const toTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fromTime = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const setFreq = (f) => { onTick(); setRepeat(f ? { freq: f, interval: 1, byDay: f === "weekly" ? [parseKey(date).getDay()] : undefined, until: (repeat && repeat.until) || "", endMode: "never", missingDatePolicy: "skip" } : null); };
  const toggleDay = (i) => {
    onTick();
    const days = (repeat.byDay || []).includes(i) ? repeat.byDay.filter((d) => d !== i) : [...(repeat.byDay || []), i].sort();
    setRepeat({ ...repeat, byDay: days });
  };

  return (
    <div>
      {!editing && (
        <div className="flex" style={{ borderBottom: `1px solid ${T.line}` }}>
          {["event", "task"].map((k) => (
            <button key={k} onClick={() => { onTick(); setKind(k); }} className="flex-1 py-2 text-xs tracking-widest"
              style={{ fontFamily: MONO, color: kind === k ? T.text : T.dim, boxShadow: kind === k ? `inset 0 -2px 0 ${T.accent}` : "none" }}>
              {k === "event" ? "EVENT" : "ACTION"}
            </button>
          ))}
        </div>
      )}

      <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-2">{editing ? "EDITING" : dateLabel}</span>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder={kind === "event" ? "What's happening?" : "What gets finished?"} style={field} className="w-full px-3 py-3 text-base font-semibold mt-2 mb-3" />
      {!initial.instance && (
        <label className="flex items-center gap-2 mb-3">
          <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">ON</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ ...field, fontFamily: MONO }} className="px-2 py-1 text-sm" />
        </label>
      )}

      {kind === "event" ? (
        <>
          <button onClick={() => { onTick(); setAllDay(!allDay); }} className="flex items-center gap-2 mb-3">
            <span className="w-4 h-4" style={{ background: allDay ? T.accent : "transparent", boxShadow: `inset 0 0 0 1px ${allDay ? T.accent : T.faint}` }} />
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">ALL DAY</span>
          </button>

          {allDay ? (
            <label className="flex flex-col gap-1 mb-3">
              <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">THROUGH (OPTIONAL)</span>
              <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} style={{ ...field, fontFamily: MONO }} className="px-2 py-2 text-sm" />
            </label>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <label className="flex flex-col gap-1">
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">START TIME</span>
                  <input type="time" step={60} value={toTime(start)} onChange={(e) => e.target.value && setStart(fromTime(e.target.value))} style={{ ...field, fontFamily: MONO }} className="px-2 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1">
                  <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">END TIME</span>
                  <input type="time" step={60} value={endLocal.slice(11)} onChange={(e) => {
                    if (!e.target.value) return;
                    const proposed = `${endLocal.slice(0, 10)}T${e.target.value}`;
                    setLen(Math.max(5, localDateTimeToEpochMinutes(proposed) - localDateTimeToEpochMinutes(startLocal)));
                  }} style={{ ...field, fontFamily: MONO }} className="px-2 py-2 text-sm" />
                </label>
              </div>
              <label className="flex items-center gap-2 mb-2">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">END DATE</span>
                <input type="date" min={date} value={endLocal.slice(0, 10)} onChange={(e) => {
                  if (!e.target.value) return;
                  const proposed = `${e.target.value}T${endLocal.slice(11)}`;
                  setLen(Math.max(5, localDateTimeToEpochMinutes(proposed) - localDateTimeToEpochMinutes(startLocal)));
                }} style={{ ...field, fontFamily: MONO }} className="px-2 py-1 text-sm" />
              </label>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">MIN</span>
                <input type="number" min={5} max={1440} step={5} value={len} onChange={(e) => setLen(Math.max(5, Number(e.target.value) || 5))} style={{ ...field, fontFamily: MONO }} className="w-20 px-2 py-1 text-sm" />
                {[15, 30, 45, 60, 90, 120].map((d) => (
                  <button key={d} onClick={() => { onTick(); setLen(d); }} style={{ fontFamily: MONO, color: len === d ? T.accent : T.dim }} className="text-xs tracking-widest">{d}</button>
                ))}
              </div>
              <div className="mb-3">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">TIME BASIS</span>
                <div className="flex gap-1 mt-1">
                  {["floating", "zoned"].map((mode) => (
                    <button key={mode} onClick={() => setTimeZoneMode(mode)} className="flex-1 py-1 text-xs tracking-widest"
                      style={{ fontFamily: MONO, background: timeZoneMode === mode ? T.accent : "transparent", color: timeZoneMode === mode ? T.on : T.dim, border: `1px solid ${timeZoneMode === mode ? T.accent : T.line}` }}>{mode.toUpperCase()}</button>
                  ))}
                </div>
                {timeZoneMode === "zoned" && (
                  <>
                    <input list="planner-timezones" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} placeholder="IANA timezone" style={{ ...field, fontFamily: MONO }} className="w-full px-2 py-2 text-sm mt-2" />
                    <datalist id="planner-timezones"><option value="America/Toronto" /><option value="America/New_York" /><option value="America/Los_Angeles" /><option value="Europe/London" /><option value="UTC" /></datalist>
                    {!offsetInfo.valid && <span style={{ fontFamily: MONO, color: NOW_RED }} className="block text-xs tracking-widest mt-1">THIS LOCAL TIME DOES NOT EXIST IN THAT ZONE</span>}
                    {offsetInfo.start.length > 1 && <select value={startOffset || offsetInfo.start[0].offset} onChange={(e) => setStartOffset(e.target.value)} style={{ ...field, fontFamily: MONO }} className="w-full px-2 py-2 text-sm mt-2">{offsetInfo.start.map((candidate) => <option key={candidate.offset} value={candidate.offset}>START {candidate.offset}</option>)}</select>}
                    {offsetInfo.end.length > 1 && <select value={endOffset || offsetInfo.end[0].offset} onChange={(e) => setEndOffset(e.target.value)} style={{ ...field, fontFamily: MONO }} className="w-full px-2 py-2 text-sm mt-2">{offsetInfo.end.map((candidate) => <option key={candidate.offset} value={candidate.offset}>END {candidate.offset}</option>)}</select>}
                  </>
                )}
                <span style={{ fontFamily: MONO, color: T.dim }} className="block text-xs tracking-widest mt-2">{dur(len)} · {date === endLocal.slice(0, 10) ? "SAME DAY" : `${date} → ${endLocal.slice(0, 10)}`}</span>
              </div>
              <div className="mb-3">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">REMIND ME</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ALERT_CHOICES.map((a) => {
                    const on = alerts.includes(a);
                    return (
                      <button key={a} onClick={() => { onTick(); setAlerts(on ? alerts.filter((x) => x !== a) : [...alerts, a].sort((p, q) => p - q)); }}
                        className="px-2 py-1 text-xs tracking-widest" style={{ fontFamily: MONO, background: on ? T.accent : "transparent", color: on ? T.on : T.dim, border: `1px solid ${on ? T.accent : T.line}` }}>
                        {a === 0 ? "AT TIME" : `${a}M`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="mb-3">
            <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">REWARD</span>
            <div className="flex gap-1 mt-1">
              {[30, 40, 50, 60].map((v) => (
                <button key={v} onClick={() => { onTick(); setXp(v); }} className="flex-1 py-2 text-xs tracking-widest"
                  style={{ fontFamily: MONO, background: xp === v ? T.accent : "transparent", color: xp === v ? T.on : T.dim, border: `1px solid ${xp === v ? T.accent : T.line}` }}>+{v}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <label className="flex flex-col gap-1">
              <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">DO IT AT</span>
              <input type="time" step={60} value={at != null ? toTime(at) : ""} onChange={(e) => setAt(e.target.value ? fromTime(e.target.value) : null)} style={{ ...field, fontFamily: MONO }} className="px-2 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">DUE BY</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...field, fontFamily: MONO }} className="px-2 py-2 text-sm" />
            </label>
          </div>
        </>
      )}

      <div className="mb-3">
        <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">REPEATS</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {[["", "ONCE"], ["daily", "DAILY"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"]].map(([f, label]) => {
            const on = (repeat ? repeat.freq : "") === f;
            return (
              <button key={label} onClick={() => setFreq(f)} className="px-2 py-1 text-xs tracking-widest"
                style={{ fontFamily: MONO, background: on ? T.accent : "transparent", color: on ? T.on : T.dim, border: `1px solid ${on ? T.accent : T.line}` }}>{label}</button>
            );
          })}
        </div>
        {repeat && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">EVERY</span>
              <input type="number" min={1} max={30} value={repeat.interval || 1} onChange={(e) => setRepeat({ ...repeat, interval: Math.max(1, Number(e.target.value) || 1) })} style={{ ...field, fontFamily: MONO }} className="w-16 px-2 py-1 text-sm" />
              <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">{repeat.freq === "daily" ? "DAYS" : repeat.freq === "weekly" ? "WEEKS" : repeat.freq === "monthly" ? "MONTHS" : "YEARS"}</span>
            </div>
            {repeat.freq === "weekly" && (
              <div className="flex gap-1">
                {DAY_LETTERS.map((d, i) => {
                  const on = (repeat.byDay || []).includes(i);
                  return (
                    <button key={d} onClick={() => toggleDay(i)} className="flex-1 py-1 text-xs tracking-widest"
                      style={{ fontFamily: MONO, background: on ? T.accent : "transparent", color: on ? T.on : T.dim, border: `1px solid ${on ? T.accent : T.line}` }}>{d[0]}</button>
                  );
                })}
              </div>
            )}
            {repeat.freq === "monthly" && (
              <div className="flex gap-1">
                {[['day', `DAY ${parseKey(date).getDate()}`], ['last-weekday', `LAST ${WD[parseKey(date).getDay()]}`]].map(([mode, label]) => (
                  <button key={mode} onClick={() => setRepeat({ ...repeat, monthlyMode: mode })} className="flex-1 py-1 text-xs tracking-widest"
                    style={{ fontFamily: MONO, background: (repeat.monthlyMode || "day") === mode ? T.accent : "transparent", color: (repeat.monthlyMode || "day") === mode ? T.on : T.dim, border: `1px solid ${(repeat.monthlyMode || "day") === mode ? T.accent : T.line}` }}>{label}</button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-1">
              {[['never', 'NEVER'], ['until', 'UNTIL'], ['count', 'COUNT']].map(([mode, label]) => (
                <button key={mode} onClick={() => setRepeat({ ...repeat, endMode: mode, until: mode === "until" ? repeat.until : "" })} className="py-1 text-xs tracking-widest"
                  style={{ fontFamily: MONO, background: (repeat.endMode || "never") === mode ? T.accent : "transparent", color: (repeat.endMode || "never") === mode ? T.on : T.dim, border: `1px solid ${(repeat.endMode || "never") === mode ? T.accent : T.line}` }}>{label}</button>
              ))}
            </div>
            {repeat.endMode === "until" && <input type="date" min={date} value={repeat.until || ""} onChange={(e) => setRepeat({ ...repeat, until: e.target.value })} style={{ ...field, fontFamily: MONO }} className="px-2 py-1 text-sm" />}
            {repeat.endMode === "count" && <input type="number" min={1} value={repeat.count || 5} onChange={(e) => setRepeat({ ...repeat, count: Math.max(1, Number(e.target.value) || 1) })} style={{ ...field, fontFamily: MONO }} className="px-2 py-1 text-sm" />}
            {(repeat.freq === "monthly" || repeat.freq === "yearly") && (
              <label className="flex items-center gap-2">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">MISSING DATE</span>
                <select value={repeat.missingDatePolicy || "skip"} onChange={(e) => setRepeat({ ...repeat, missingDatePolicy: e.target.value })} style={{ ...field, fontFamily: MONO }} className="px-2 py-1 text-sm"><option value="skip">SKIP</option><option value="clamp">LAST DAY</option></select>
              </label>
            )}
            {kind === "event" && preview.length > 0 && (
              <div style={{ borderTop: `1px solid ${T.line}` }} className="pt-2">
                <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">NEXT FIVE</span>
                <span style={{ fontFamily: MONO, color: T.text }} className="block text-xs mt-1">{preview.map((item) => item.recurrenceAnchor?.slice(0, 10)).join(" · ")}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-3">
        <span style={{ fontFamily: MONO, color: T.dim }} className="text-xs tracking-widest">CATEGORY</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {CATS.map((c) => (
            <button key={c} onClick={() => { onTick(); setCat(c); }} className="px-2 py-1 text-xs tracking-widest"
              style={{ fontFamily: MONO, background: cat === c ? T.accent : "transparent", color: cat === c ? T.on : T.dim, border: `1px solid ${cat === c ? T.accent : T.line}` }}>{c}</button>
          ))}
        </div>
      </div>

      {kind === "event" && <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Where (optional)" style={field} className="w-full px-3 py-2 text-sm mb-3" />}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Notes (optional)" style={{ ...field, fontFamily: SERIF, resize: "none" }} className="w-full px-3 py-2 text-sm italic mb-3" />

      <button onClick={submit}
        disabled={!ok} className="nb-tap w-full py-3 text-xs font-bold tracking-widest"
        style={{ fontFamily: MONO, background: ok ? T.accent : "transparent", color: ok ? T.on : T.dim, border: `1px solid ${ok ? T.accent : T.faint}` }}>
        {editing ? "SAVE CHANGES" : kind === "event" ? "ADD TO TIMELINE" : "ADD ACTION"}
      </button>
    </div>
  );
}
