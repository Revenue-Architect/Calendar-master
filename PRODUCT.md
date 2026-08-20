# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Primary user: one person planning their own day. They open the planner to capture something, see the next hours, and finish what is owed.

Secondary, reserved: a founder or operator whose personal system may later become a team product. Collaboration roles exist in the product vocabulary and are not required now.

## Product Purpose

Calendar Master is a connected day planner. Your Google and Outlook calendars arrive
as one timeline; the mail that quietly creates work becomes a proposed event you
accept or dismiss; Actions and Notes stay first-class domains beside them rather than
second-class labels on an event.

Success is a day that can be captured, seen and finished in one place — including the
half of it that arrived by email — and a day that still reads correctly with no signal.

## Positioning

The product philosophy is a combination of Moleskine Timepage and Moleskine Actions,
with a touch of the Not Boring apps by Andy. Neighbouring products cannot truthfully
claim the pairing this one is built on: a unified calendar client can show you every
event across every account and still not know what is *owed*; a task app knows what is
owed and cannot see Thursday. This does both, over the accounts you already use.

The mechanism is canonical and connected. Provider payloads are **mapped, never stored
raw** — a Google or Outlook event becomes a Calendar Master event carrying its
provenance, so recurrence, overdue and planning rules stay ours rather than being
inherited from whichever API answered. Planned date and deadline remain independent;
only the deadline makes something overdue.

## Operating Context

Opened many times a day, on a phone and on a desk, often mid-gesture, and increasingly
on a day whose shape was decided by other people in email.

The server holds the record; the device holds a working copy. **Offline is a normal
state, not an error** — the day stays readable, writes queue, and the queue drains when
signal returns. Connection status and sync state are visible and recoverable rather
than silent. A render failure must still offer a copy read from storage, not from the
crashed app.

Typical ritual: glance the day, triage what mail proposed overnight, capture with `N` /
`A` / `⌘K`, swipe or tap to complete, inspect only when something needs a decision.
Timeline answers when and for how long. Agenda answers what is coming. Actions is work
without calendar chrome.

## Capabilities and Constraints

**What is built today:** everything in Confirmed *except* the two connected rows, which
are committed and unbuilt. `src/` currently makes no network calls at all — two runtime
dependencies, both React, and a `localStorage` notebook. Read that gap as the roadmap,
not as a description.

Confirmed:

- Events, Actions, and Notes as separate domains with a shared day.
- **Connected accounts (committed, unbuilt).** Google and Microsoft calendars read into
  one timeline. Provider events map into the domain model carrying provenance; the app
  model stays authoritative for Actions, Notes and planning, and external calendars stay
  authoritative for provider-owned fields under an explicit mapping policy.
- **Mail proposes, never writes (committed, unbuilt).** Gmail and Outlook mail is read to
  detect bookable things — invitations, "can we meet Thursday", booking and travel
  confirmations — and each becomes a proposal the user accepts or dismisses. Nothing
  enters the day without a confirmation, and a model is never the recurrence engine,
  occurrence-identity authority, or conflict resolver.
- A local working copy and a durable outbox. Reads work offline; writes queue and drain.
  Connection and sync state are visible and recoverable rather than silent.
- Schema v8 notebook on device today; host `window.storage` when embedded, `localStorage`
  otherwise. This becomes the cache layer rather than the record when sync lands.
- Sheets reveal from the control that opened them. Keyboard `n` / `a` and command-palette
  create do not morph.
- One owner per gesture. Cancel is never commit.
- Day/Week JOIN opens the meeting, not the Event sheet.
- Inbox capture is title-only and fast. Quick add parses a whole line; whatever it cannot
  finish opens the composer prefilled.
- Recurring events and tasks, reminders, XP / levels / streaks, fifteen themes, ICS
  export, JSON backup with preview before replace.
- Daily notes: at most one primary per user/date; additional day-linked notes require an
  explicit add. Viewing a date does not create an empty note.
- `src/Planner.jsx` is the composition root and must not grow. New behavior extracts
  beside the owner.

Undecided:

- **The provider layer.** A unified API (Nylas is the leading candidate) against writing
  Google and Microsoft adapters directly. The decision is deferred behind a provider
  interface so it can be made on evidence rather than early; see the cross-platform PRD.
- Whether CalDAV, Apple, Todoist or Google Tasks ever follow the first two providers.
- When, if ever, the reserved 10% collaboration path becomes real product.
- Adaptive OS skins are scheduled as a native shell (Expo / platform nav). Until that
  ships, this Vite app remains the web client and must not invent iOS chrome.

## Brand Commitments

Name: Calendar Master (repo and product). The shipped UI also calls itself Planner.

Voice of the interface: short, capital rails (`NEW`, `ADD A NOTE`, `PLAN TODAY`), serif asides for written notes. Binding philosophy: Timepage + Moleskine Actions, with a touch of Not Boring. Do not expand that into a palette or type recipe here.

Do not fabricate testimonials, customer counts, or a public brand system that is not in the repo.

## Evidence on Hand

- Living product spec: `docs/product/planner-foundation.md`
- Visual rules already shipped: `DESIGN.md` (not rewritten by this file)
- Interaction contracts: `docs/interaction-contracts/planner-interactions.md`
- Architecture: `docs/adr/0001-domain-oriented-modular-monolith.md`
- Connected-product intent and phasing: `docs/superpowers/specs/2026-08-11-calendar-master-cross-platform-prd.md`
- Runnable app: Vite / React 19, `npm run dev`, Playwright e2e, single-file artifact via `npm run build:artifact`

Absences future work must not fabricate: press quotes, user research quotes, pricing, a
second product name, provider certification status, connected-account counts, or sync
reliability numbers. Connected calendars are now a committed direction — do not describe
them as shipped until they are.

## Product Principles

1. Personal-first, connected, offline-capable. One person's real accounts in one place —
   and a day that still reads with no signal.
2. Forty times a day. A move that delights once and fricts by lunch has failed.
3. Time and work are different questions. The timeline is duration; Actions is what is owed.
4. Nothing enters the day unconfirmed. Mail and models propose; the person disposes.
5. Reveal, do not stretch. A sheet is the same object as its trigger, at true size.
6. Extract beside the owner. New behavior does not grow the composition root.

## Accessibility & Inclusion

Coarse-pointer controls must reach 44×44 without growing drawn chrome. Keyboard-initiated create stays instant. `prefers-reduced-motion` and the in-app Reduce motion preference skip travel. Every theme must stay legible on both its grounds. No further WCAG target was set in this interview.
