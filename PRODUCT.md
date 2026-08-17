# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Primary user: one person planning their own day. They open the planner to capture something, see the next hours, and finish what is owed.

Secondary, reserved: a founder or operator whose personal system may later become a team product. Collaboration roles exist in the product vocabulary and are not required now.

## Product Purpose

Calendar Master is a personal-first day planner. Events, Actions, and Notes stay independently correct and immediately usable on this device.

Success is a day that can be captured, seen, and finished without leaving the notebook, and a crash that still exports the notebook.

## Positioning

The product philosophy is a combination of Moleskine Timepage and Moleskine Actions, with a touch of the Not Boring apps by Andy. Neighboring calendars that are either a grid of months or a list of tasks cannot truthfully claim that pairing: a timed day you can read as one shape, and work that stays owed until it is planned or done.

The mechanism is local and canonical. Provider payloads never become domain records. Planned date and deadline are independent; only the deadline makes something overdue.

## Operating Context

Opened many times a day, on a phone and on a desk, often mid-gesture. The notebook is the only copy unless the user exports one. Clearing site data destroys it. A render failure must still offer a copy read from storage, not from the crashed app.

Typical ritual: glance the day, capture with `N` / `A` / `⌘K`, swipe or tap to complete, inspect only when something needs a decision. Timeline answers when and for how long. Agenda answers what is coming. Actions is work without calendar chrome.

## Capabilities and Constraints

Confirmed:

- Events, Actions, and Notes as separate domains with a shared day.
- On-device schema v8 notebook. Host `window.storage` when embedded; `localStorage` otherwise.
- Sheets reveal from the control that opened them. Keyboard `n` / `a` and command-palette create do not morph.
- One owner per gesture. Cancel is never commit.
- Day/Week JOIN opens the meeting, not the Event sheet.
- Inbox capture is title-only and fast. Quick add parses a whole line; whatever it cannot finish opens the composer prefilled.
- Recurring events and tasks, reminders, XP / levels / streaks, fifteen themes, ICS export, JSON backup with preview before replace.
- Daily notes: at most one primary per user/date; additional day-linked notes require an explicit add. Viewing a date does not create an empty note.
- `src/Planner.jsx` is the composition root and must not grow. New behavior extracts beside the owner.
- Provider sync (Google, Graph, CalDAV, Todoist) is deferred.

Undecided:

- When, if ever, the reserved 10% collaboration path becomes real product.
- Adaptive OS skins are scheduled as a native shell (Expo / platform nav). Until that ships, this Vite app remains the web client and must not invent iOS chrome.

## Brand Commitments

Name: Calendar Master (repo and product). The shipped UI also calls itself Planner.

Voice of the interface: short, capital rails (`NEW`, `ADD A NOTE`, `PLAN TODAY`), serif asides for written notes. Binding philosophy: Timepage + Moleskine Actions, with a touch of Not Boring. Do not expand that into a palette or type recipe here.

Do not fabricate testimonials, customer counts, or a public brand system that is not in the repo.

## Evidence on Hand

- Living product spec: `docs/product/planner-foundation.md`
- Visual rules already shipped: `DESIGN.md` (not rewritten by this file)
- Interaction contracts: `docs/interaction-contracts/planner-interactions.md`
- Architecture: `docs/adr/0001-domain-oriented-modular-monolith.md`
- Cross-platform intent: `docs/superpowers/specs/2026-08-11-calendar-master-cross-platform-prd.md`
- Runnable app: Vite / React 19, `npm run dev`, Playwright e2e, single-file artifact via `npm run build:artifact`

Absences future work must not fabricate: press quotes, user research quotes, pricing, a second product name, network-backed calendars.

## Product Principles

1. Personal-first, local-first. The notebook on this device is the product.
2. Forty times a day. A move that delights once and fricts by lunch has failed.
3. Time and work are different questions. The timeline is duration; Actions is what is owed.
4. Reveal, do not stretch. A sheet is the same object as its trigger, at true size.
5. Extract beside the owner. New behavior does not grow the composition root.

## Accessibility & Inclusion

Coarse-pointer controls must reach 44×44 without growing drawn chrome. Keyboard-initiated create stays instant. `prefers-reduced-motion` and the in-app Reduce motion preference skip travel. Every theme must stay legible on both its grounds. No further WCAG target was set in this interview.
