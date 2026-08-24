/* Every rule the planner draws itself with, as one function.
 *
 * It was 646 lines inside Planner's render return, rebuilt on every render and
 * unreachable from anywhere else. docs/spec/structure.md has named this file
 * since before it existed.
 *
 * A function rather than a constant because the sheet is not static: it reads
 * the active theme, the morph timings, and whether the reader asked for reduced
 * motion. Those are the only four things it needs, so those are the only things
 * it takes — everything else it uses is a shared token it imports directly.
 *
 * Do not reflow the CSS. It arrived here as a byte-exact move so that the
 * commit could be read as a relocation, and the parsed-rule fingerprint before
 * and after is the proof it was one. A backtick inside a CSS comment ends the
 * template literal and breaks the build; that has happened three times, and
 * leaving the comments alone is what stops it happening a fourth.
 */
import { NOW_RED } from "../../design/themes.js";
import { DISPLAY, MONO } from "../../design/typography.js";
import {
  MORPH_FADE,
  MORPH_LEAD,
  MORPH_HANDOFF_MS,
  MORPH_HANDOFF_SLIDE_PX,
  MORPH_CONTENT_BLUR_PX,
  MORPH_CONTENT_SCALE,
  MORPH_MS,
  MORPH_CLOSE_MS,
  MORPH_STEP,
  SHEET_ENTRY_MS,
  VIEW_SLIDE_MS,
} from "./morphTiming.js";

export function plannerStyles({ T, preferences }) {
  return `
        /* A touch browser zooms the whole viewport when it focuses a field whose
           text is under 16px, and every sheet here autofocuses one. Standalone
           the viewport meta suppresses it; embedded, the host writes <head> and
           it does not — so the fix belongs on the fields themselves. Desktop
           keeps the small type; a coarse pointer gets 16px, which is easier to
           hit anyway. */
        @media (pointer: coarse){
          input,textarea,select,[contenteditable="true"]{font-size:16px}
        }
        .nb-s::-webkit-scrollbar{width:5px;height:5px}
        .nb-s::-webkit-scrollbar-thumb{background:${T.faint};border-radius:999px}
        .nb-s::-webkit-scrollbar-track{background:transparent}
        /* A scrollbar is drawn in the padding box, which is square, so on a panel
           with a 24px radius it runs straight through the curve and reads as a
           sliver sitting outside the sheet. Holding the track back past the
           corners keeps the whole bar inside the shape it belongs to. */
        .nb-sheet-scroll::-webkit-scrollbar-track{margin:22px 0}
        .nb-sheet-scroll{scrollbar-width:thin;scrollbar-color:${T.faint} transparent}
        .nb-x::-webkit-scrollbar{display:none}
        .nb-x{-ms-overflow-style:none;scrollbar-width:none}
        /* The page is exactly one viewport tall at every width, so the day surface
           flexes into the space that is left instead of stopping at an arbitrary
           cap partway down a large screen. Each pane scrolls inside itself. */
        .nb-nav-shell{
          --nav-width:304px;
          --nav-gap:18px;
          /* Direct viewport frame insets on the viewport mask and travel on the carrier */
          --nav-headroom:4px;
          --nav-margin-top:24px;
          --nav-margin-right:22px;
          --nav-margin-bottom:24px;
          --nav-frame-top:var(--nav-margin-top);
          --nav-frame-right:var(--nav-margin-right);
          --nav-frame-bottom:var(--nav-margin-bottom);
          --nav-frame-left:calc(var(--nav-width) + var(--nav-gap));
          --nav-carrier-x:calc(var(--nav-width) + var(--nav-gap));
          --nav-carrier-y:calc(var(--nav-margin-top) - var(--nav-headroom));
          --nav-page-x:calc(var(--nav-width) + var(--nav-gap));
          --nav-page-y:calc(var(--nav-margin-top) - var(--nav-headroom));
          --nav-clip-top:var(--nav-headroom);
          --nav-clip-right:var(--nav-margin-right);
          --nav-clip-bottom:calc(var(--nav-margin-bottom) + var(--nav-page-y));
          --nav-page-radius:22px;
          --nav-mask-top:24px;
          --nav-mask-right:22px;
          --nav-mask-bottom:24px;
          --nav-mask-left:322px;
          --nav-mask-radius:22px;
          --nav-page-duration:520ms;
          --nav-content-duration:260ms;
          --nav-item-stagger:30ms;
          --nav-ease:cubic-bezier(.22,.61,.36,1);
          position:relative;height:100dvh;overflow:clip;overflow-anchor:none;background:#17181b;
        }
        .nb-root{height:100%;overflow:clip;overflow-anchor:none}
        .nb-nav-viewport,
        .nb-nav-motion-viewport{
          position:absolute;inset:0;z-index:2;height:100%;overflow:clip;overflow-anchor:none;clip-path:inset(0 0 0 0 round 0);
        }
        .nb-nav-shell[data-nav-state="open"] .nb-nav-viewport,
        .nb-nav-shell[data-nav-state="open"] .nb-nav-motion-viewport,
        .nb-nav-shell[data-nav-state="opening"] .nb-nav-viewport,
        .nb-nav-shell[data-nav-state="opening"] .nb-nav-motion-viewport,
        .nb-nav-motion-viewport.nb-nav-motion-viewport-open{
          clip-path:inset(var(--nav-frame-top) var(--nav-frame-right) var(--nav-frame-bottom) var(--nav-frame-left) round var(--nav-page-radius));
        }
        .nb-nav-carrier,
        .nb-nav-motion-carrier{
          position:absolute;inset:0;width:100%;height:100%;transform:translate3d(0,0,0);transform-origin:left center;
        }
        /* The stage is deliberately un-clipped while a navigation run is
           active. These shell-coloured walls move with compositor transforms
           into the open margins so the planner surface keeps one raster
           instead of a changing clip-path. */
        .nb-nav-motion-mask{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:visible}
        .nb-nav-motion-mask>i{position:absolute;display:block;background:#17181b;transform:translate3d(0,0,0)}
        .nb-nav-motion-mask>[data-nav-mask="top"]{top:0;left:0;right:0;height:var(--nav-mask-top);transform:translate3d(0,calc(-1 * var(--nav-mask-top)),0)}
        .nb-nav-motion-mask>[data-nav-mask="right"]{top:var(--nav-mask-top);right:0;bottom:var(--nav-mask-bottom);width:var(--nav-mask-right);transform:translate3d(var(--nav-mask-right),0,0)}
        .nb-nav-motion-mask>[data-nav-mask="bottom"]{left:0;right:0;bottom:0;height:var(--nav-mask-bottom);transform:translate3d(0,var(--nav-mask-bottom),0)}
        .nb-nav-motion-mask>[data-nav-mask="left"]{top:var(--nav-mask-top);bottom:var(--nav-mask-bottom);left:0;width:var(--nav-mask-left);transform:translate3d(calc(-1 * var(--nav-mask-left)),0,0)}
        .nb-nav-motion-mask>[data-nav-mask="top-left"],.nb-nav-motion-mask>[data-nav-mask="top-right"],.nb-nav-motion-mask>[data-nav-mask="bottom-left"],.nb-nav-motion-mask>[data-nav-mask="bottom-right"]{width:var(--nav-mask-radius);height:var(--nav-mask-radius)}
        .nb-nav-motion-mask>[data-nav-mask="top-left"]{left:var(--nav-mask-left);top:var(--nav-mask-top);border-bottom-right-radius:var(--nav-mask-radius);transform-origin:100% 100%;transform:translate3d(calc(-1 * (var(--nav-mask-left) + var(--nav-mask-radius))),calc(-1 * (var(--nav-mask-top) + var(--nav-mask-radius))),0)}
        .nb-nav-motion-mask>[data-nav-mask="top-right"]{right:var(--nav-mask-right);top:var(--nav-mask-top);border-bottom-left-radius:var(--nav-mask-radius);transform-origin:0 100%;transform:translate3d(calc(var(--nav-mask-right) + var(--nav-mask-radius)),calc(-1 * (var(--nav-mask-top) + var(--nav-mask-radius))),0)}
        .nb-nav-motion-mask>[data-nav-mask="bottom-left"]{left:var(--nav-mask-left);bottom:var(--nav-mask-bottom);border-top-right-radius:var(--nav-mask-radius);transform-origin:100% 0;transform:translate3d(calc(-1 * (var(--nav-mask-left) + var(--nav-mask-radius))),calc(var(--nav-mask-bottom) + var(--nav-mask-radius)),0)}
        .nb-nav-motion-mask>[data-nav-mask="bottom-right"]{right:var(--nav-mask-right);bottom:var(--nav-mask-bottom);border-top-left-radius:var(--nav-mask-radius);transform-origin:0 0;transform:translate3d(calc(var(--nav-mask-right) + var(--nav-mask-radius)),calc(var(--nav-mask-bottom) + var(--nav-mask-radius)),0)}
        /* Desktop travel only. Rounding the corner tile with border-radius paints
           a filled pie that bites into the card. Punch a circular hole at the
           interior corner instead so the tile is the outer rounding. Do not
           "simplify" this back to border-radius. Mobile keeps the original fill. */
        @media(min-width:640px){
          .nb-nav-motion-mask>[data-nav-mask="top-left"]{border-bottom-right-radius:0;background:radial-gradient(circle farthest-side at 100% 100%,transparent 0 calc(100% - 0.5px),#17181b 100%)}
          .nb-nav-motion-mask>[data-nav-mask="top-right"]{border-bottom-left-radius:0;background:radial-gradient(circle farthest-side at 0 100%,transparent 0 calc(100% - 0.5px),#17181b 100%)}
          .nb-nav-motion-mask>[data-nav-mask="bottom-left"]{border-top-right-radius:0;background:radial-gradient(circle farthest-side at 100% 0,transparent 0 calc(100% - 0.5px),#17181b 100%)}
          .nb-nav-motion-mask>[data-nav-mask="bottom-right"]{border-top-left-radius:0;background:radial-gradient(circle farthest-side at 0 0,transparent 0 calc(100% - 0.5px),#17181b 100%)}
        }
        .nb-nav-shell[data-nav-state="open"] .nb-nav-carrier,
        .nb-nav-shell[data-nav-state="open"] .nb-nav-motion-carrier,
        .nb-nav-shell[data-nav-state="opening"] .nb-nav-carrier,
        .nb-nav-shell[data-nav-state="opening"] .nb-nav-motion-carrier,
        .nb-nav-motion-carrier.nb-nav-motion-carrier-open{
          transform:translate3d(var(--nav-carrier-x),var(--nav-carrier-y),0);
        }
        .nb-app-surface{
          position:relative;width:100%;height:100%;overflow:clip;overflow-anchor:none;box-shadow:none;
        }
        .nb-navigation{position:absolute;z-index:4;inset:0 auto 0 0;width:var(--nav-width);padding:22px 18px;color:#f2f0ea;display:flex;flex-direction:column;overflow:auto;transform:translate3d(-36%,0,0)}
        .nb-nav-shell[data-nav-state="open"] .nb-navigation,
        .nb-nav-shell[data-nav-state="opening"] .nb-navigation{transform:translate3d(0,0,0)}
        .nb-navigation[aria-hidden="true"]{pointer-events:none}
        .nb-nav-shell .nb-nav-brand,.nb-nav-shell .nb-nav-item,.nb-nav-shell .nb-nav-membership{opacity:0;transform:translate3d(-14px,0,0);transition:background-color 160ms ease,color 160ms ease}
        .nb-nav-shell[data-nav-state="open"] .nb-nav-brand,.nb-nav-shell[data-nav-state="open"] .nb-nav-item,.nb-nav-shell[data-nav-state="open"] .nb-nav-membership,
        .nb-nav-shell[data-nav-state="opening"] .nb-nav-brand,.nb-nav-shell[data-nav-state="opening"] .nb-nav-item,.nb-nav-shell[data-nav-state="opening"] .nb-nav-membership{opacity:1;transform:translate3d(0,0,0)}
        /* The drawer rests at translate3d(-36%,0,0), so most of it still sits over
           the page when closed; it reads as absent only because its content is
           faded out. This separator lives on a group wrapper rather than on a
           faded item, so an unconditional border painted a hairline across the
           left of the app at every viewport. Keep the 1px so layout is identical
           in both states and reveal it with the same states as the content. */
        .nb-nav-shell .nb-nav-divide{border-top:1px solid transparent}
        .nb-nav-shell[data-nav-state="open"] .nb-nav-divide,
        .nb-nav-shell[data-nav-state="opening"] .nb-nav-divide{border-top-color:#313237}
        .nb-nav-item{font-family:${MONO};font-size:15px;letter-spacing:.1em;text-align:left;padding:13px 12px;border-radius:10px;color:#c8c7c0}
        .nb-nav-item:hover,.nb-nav-item:focus-visible{background:#2a2b2f;color:#fff;outline:none}
        .nb-nav-membership{margin-top:auto;padding:15px 12px;border:1px solid #37383d;border-radius:12px;color:#aaa9a2}
        .nb-shell-control{color:#f4f2ec;border:1px solid #3a3b40;background:#24252a;border-radius:9px;font-family:${MONO};font-size:13px;letter-spacing:.06em}
        .nb-shell-control:hover,.nb-shell-control:focus-visible{background:#313238;outline:2px solid #f4f2ec;outline-offset:2px}
        .nb-shell-info{border-radius:999px;font-family:${DISPLAY};font-weight:700;letter-spacing:0}
        .nb-mobile-calendar-return{display:none}
        @media(max-width:639px){
          .nb-nav-shell{--nav-width:min(78vw,320px);--nav-gap:11px;--nav-page-scale:.94;--nav-page-radius:16px;--nav-rail-width:44px;--nav-rail-edge-gap:0px}
          .nb-nav-motion-viewport{clip-path:inset(0 0 0 0 round 0)}
          .nb-nav-motion-carrier{transform:translate3d(0,0,0)}
          /* All four corners, not two. At rest the viewport clip is exactly
             coincident with the rail and supplied half of this rounding for
             free, but applyProgress sets that clip to none for the duration of
             travel. A rail that rounds only its own two corners therefore turns
             square on the other side for every frame of both motions and snaps
             back at the terminal frame. Owning all four is a no-op at rest and
             the whole fix in flight. */
          .nb-mobile-calendar-return{display:flex;position:absolute;z-index:40;inset:14px auto 14px 0;width:var(--nav-rail-width);align-items:center;justify-content:center;border:0;border-radius:16px;background:${T.accent};color:${T.on};font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:.12em;writing-mode:vertical-rl;visibility:visible;transform:translate3d(calc(0px - var(--nav-rail-width)),0,0) rotate(180deg);pointer-events:none;touch-action:manipulation;transition:none}
          .nb-mobile-calendar-return::after{content:"";position:absolute;inset:0;border-radius:inherit;background:#000;opacity:0;pointer-events:none;transition:opacity 100ms ease}
          .nb-hud-settings{display:none}
        }
        .nb-main{padding-bottom:var(--sheet-pad)}
        @media(min-width:1024px){
          .nb-main{padding-bottom:2rem}
          .nb-main.nb-main-day-timeline{padding-bottom:.75rem}
          .nb-main.nb-actions-open,.nb-main.nb-actions-closed{grid-template-columns:minmax(0,7fr) minmax(0,5fr);column-gap:1.25rem;transition:grid-template-columns 300ms var(--nav-ease),column-gap 300ms var(--nav-ease)}
          .nb-main.nb-actions-closed{grid-template-columns:minmax(0,1fr) minmax(0,0fr);column-gap:0}
          .nb-main.nb-actions-full{grid-template-columns:minmax(0,1fr)}
        }
        /* The ribbon can be a large, real date surface, so a state change may
           spend a frame reconciling its cells before the compositor samples the
           pane. Keep the pane's fade long enough to remain an actual transition
           under that load, and let its visibility follow the same settled edge as
           the grid rather than disappearing halfway through the handoff. */
        /* The column leaves past its own right edge and comes back from it. It used
           to travel 12px and fade the rest of the way, which is not a departure —
           it is a dissolve with a nudge attached. Full self-width travel means the
           collapsed state has nothing left to hide, and the accent ACTIONS tab it
           folds into is the thing it visibly went behind. */
        .nb-actions-column{min-width:0;overflow-x:hidden;transform:translate3d(0,0,0);visibility:visible;transition:transform 320ms var(--nav-ease),visibility 0s linear 0s}
        .nb-actions-column.is-collapsed{transform:translate3d(100%,0,0);visibility:hidden;pointer-events:none;transition:transform 320ms var(--nav-ease),visibility 0s linear 360ms}
        .nb-actions-restore{transform:translate3d(0,-50%,0);visibility:visible;transition:transform 300ms var(--nav-ease),visibility 0s linear 0s}
        .nb-actions-restore.is-hidden{transform:translate3d(100%,-50%,0);visibility:hidden;pointer-events:none;transition:transform 240ms var(--nav-ease),visibility 0s linear 300ms}
        .nb-stream{flex:1 1 auto;min-height:0}

        /* ── THE SCALE ──────────────────────────────────────────────────
           A polish, not a reskin. The identity of this app is monospace
           capitals on a ground-plus-one-accent theme, and that survives intact:
           every rail, chip, button and time label is still mono, still tracked
           wide, still shouting. What was actually broken is that *content* was
           set in the same 12px mono as the chrome — an event's title, a note's
           body and a section rail were typographically the same thing, so
           hierarchy had nothing left to carry it but colour.

           So the geometric face takes the content and only the content: titles,
           body, headings. Mono keeps the chrome and the data, which is the half
           it was always right about — "10:00 AM" and "11:30 AM" are the same
           width, and times align down the rail without a single hack.

           Sizes are set against the geometry that already exists rather than a
           theoretical ratio: 16px is what fits a 31px half-hour card once its
           padding is paid for, and picking 17 would have clipped every short
           event on the timeline. */
        .nb-display{font-family:var(--font-data);font-size:var(--t-display);font-weight:var(--t-display-w);letter-spacing:var(--t-display-ls);line-height:.95;font-variant-numeric:tabular-nums}
        .nb-title{font-family:var(--font-display);font-size:var(--t-title);font-weight:var(--t-title-w);letter-spacing:var(--t-title-ls);line-height:1.2;text-wrap:balance}
        .nb-heading{font-family:var(--font-display);font-size:var(--t-heading);font-weight:var(--t-heading-w);letter-spacing:var(--t-heading-ls);line-height:1.3}
        .nb-lead{font-family:var(--font-display);font-size:var(--t-lead);font-weight:var(--t-lead-w);letter-spacing:var(--t-lead-ls);line-height:1.3}
        .nb-body{font-family:var(--font-display);font-size:var(--t-body);font-weight:var(--t-body-w);letter-spacing:var(--t-body-ls);line-height:1.5}
        /* What was written rather than computed. The only warm thing on the
           surface, and it earns that by being rare. */
        .nb-voice{font-family:var(--font-voice);font-size:var(--t-body);font-style:italic;line-height:1.6}
        /* The interface voice. Capitals and wide tracking survive — that
           rhythm is the app's own — but they are set in the geometric now,
           which is where the Timepage resemblance actually lives and what
           separates a label the app is speaking from a number it is reporting.
           13px rather than 12: the difference between a label and a smudge on a
           phone, and what lets a control reach a 44px target without padding
           that looks apologetic. */
        .nb-label{font-family:var(--font-display);font-size:var(--t-label);font-weight:var(--t-label-w);letter-spacing:var(--t-label-ls);text-transform:uppercase;line-height:1.3}
        /* Data keeps the monospace and the tabular figures, which is the whole
           reason monospace survived this change. */
        .nb-data{font-family:var(--font-data);font-size:var(--t-data);font-weight:var(--t-data-w);letter-spacing:var(--t-data-ls);font-variant-numeric:tabular-nums;line-height:1.35}
        .nb-data-b{font-weight:700}
        .nb-micro{font-family:var(--font-data);font-size:var(--t-micro);font-weight:var(--t-micro-w);letter-spacing:var(--t-micro-ls);font-variant-numeric:tabular-nums;line-height:1.3}

        /* ── MATERIAL ───────────────────────────────────────────────────
           Every surface used to be flat with a hairline border, which reads as
           a diagram rather than a thing. Three elevations and no more: flush,
           resting, lifted — each one encoding state (a card at rest, a card in
           your hand, a sheet over the day) rather than decorating it. */
        .nb-e0{box-shadow:inset 0 0 0 1px ${T.line}}
        .nb-e1{box-shadow:var(--e1),var(--sheen)}
        .nb-e2{box-shadow:var(--e2),var(--sheen)}
        /* Nothing responded to being pressed. This is the cheapest line in the
           whole design and it is most of what "tactile" means — imperceptible
           once, and the difference between an interface and an object over a
           day of use. */
        /* Press motion is owned once, by the standalone scale rule below.
           The previous nb-tap transform multiplied with that scale and gave
           every button two different release curves. */
        .nb-tap{transition:opacity 120ms ease}
        /* Hover is a desktop reading aid, not a second selection system. These
           four roles are opt-in: timeline gesture layers, sheet materials, and
           invisible coarse-pointer targets must never inherit decorative state. */
        .nb-hover-control,.nb-hover-tile,.nb-hover-choice,.nb-hover-icon{
          transition:background-color 160ms ease,color 160ms ease,border-color 160ms ease,box-shadow 200ms var(--motion-settle),outline-color 160ms ease;
        }
        @media(hover:hover) and (pointer:fine){
          .nb-hover-control:not(:disabled):not([aria-disabled="true"]):hover{
            background-color:${T.faint}88!important;color:${T.text}!important;
          }
          .nb-hover-control.nb-liquid:not(:disabled):hover{
            background-color:${T.accent}!important;box-shadow:var(--e1),var(--sheen);
          }
          .nb-hover-tile:not(:disabled):not([aria-disabled="true"]):hover{
            box-shadow:var(--e1),var(--sheen),inset 0 0 0 1px ${T.accent}38!important;
          }
          /* An Action is one material surface, including its promoted children.
             The child title still gets a quiet text affordance, never a second
             tile-shaped hover patch that makes the parent look clipped. */
          .nb-action-card .nb-subtask-title:not(:disabled):hover{
            background-color:transparent!important;
          }
          .nb-hover-choice:not(:disabled):not([aria-disabled="true"]):not(.is-selected):hover{
            background-color:${T.accent}12!important;color:${T.accentText}!important;
            box-shadow:inset 0 0 0 1px ${T.accent}52!important;
          }
          .nb-hover-choice.is-selected:not(:disabled):hover{
            box-shadow:inset 0 0 0 1px ${T.on}55!important;
          }
          .nb-hover-icon:not(:disabled):not([aria-disabled="true"]):hover{
            background-color:${T.faint}88!important;color:${T.text}!important;
            box-shadow:inset 0 0 0 1px ${T.line};
          }
          .nb-hover-danger:not(:disabled):hover{
            background-color:transparent!important;color:${NOW_RED}!important;
            box-shadow:inset 0 0 0 1px ${NOW_RED}!important;
          }
        }
        /* A 13px label with a little padding measures about 62 x 25, and the
           floor for a finger is 44 x 44. Fifteen controls had been under it for
           the life of the project and nothing had ever measured them.
           The target grows, the button does not: a centred pseudo-element takes
           the press on behalf of a control that stays exactly the size it was
           drawn. Padding would have worked too and would have cost forty pixels
           of header on a screen where the timeline is already down to 44% —
           the wrong trade on the one surface the app exists to show. */
        @media(pointer:coarse){
          /* The :not() here is load-bearing, not defensive. .nb-tap and
             Tailwind's .absolute are both single-class selectors, so source
             order decides — and this stylesheet is injected after Tailwind's.
             A blanket position:relative therefore *won* against every control
             that was already positioned, and an action chip stretched with
             left-0 right-2 collapsed to its content: 289px wide became 202px,
             in the middle of the timeline, from a rule about touch targets.
             An already-positioned element is a containing block anyway, so it
             never needed the declaration in the first place. */
          .nb-tap:not(.absolute):not(.fixed):not(.sticky){position:relative}
          .nb-tap::after{
            content:"";position:absolute;left:50%;top:50%;
            width:max(100%,44px);height:max(100%,44px);
            transform:translate(-50%,-50%);
          }
        }
        /* A stamp hides its native control, so the focus it takes has to be drawn
           on the wrapper instead — otherwise a keyboard user sees nothing. */
        .nb-stamp{transition:box-shadow 160ms ease}
        .nb-stamp:focus-within{box-shadow:0 1px 0 0 ${T.accent}}
        .nb-row:hover{background:${T.faint}55}
        /* The most-seen animation in the app, so it gets the least of one, and it is
           an enhancement rather than a gate.
           These cells used to open at zero opacity and wait on a "mounted" flag set
           from a requestAnimationFrame. A document that never composites never runs
           that callback, so loading the app unpainted left fifty-six ribbon cells
           invisible with no way back. The resting state is now simply visible; the
           entrance is a starting-style the browser applies if it can, and a browser
           that cannot just shows the cell. Nothing about being seen depends on an
           animation having run — see tests/e2e/reveal-without-paint.spec.js.
           The entrance moves the cell and nothing else. A clip was tried here and is
           wrong for the same reason the opacity was: measured in a document that never
           composites, the cells held at inset(0 100% 0 0) — fully clipped, which is
           invisible by a different property. Any entrance whose start state hides the
           element re-creates the bug. A translate cannot: if the transition never runs,
           the cell simply sits six pixels low, which nobody will ever notice. */
        .nb-cell{transition:transform 300ms cubic-bezier(.23,1,.32,1),opacity 300ms cubic-bezier(.23,1,.32,1)}
        @starting-style{.nb-cell{transform:translateY(6px)}}
        .nb-ribbon-spacer{flex:0 0 auto;width:calc(var(--nb-ribbon-cells) * 4rem)}
        @media(min-width:640px){.nb-ribbon-spacer{width:calc(var(--nb-ribbon-cells) * 5rem)}}
        @media(min-width:1024px){.nb-ribbon-spacer{width:calc(var(--nb-ribbon-cells) * 6rem)}}
        .nb-page{transform-origin:left center;backface-visibility:hidden}
        /* A day arrives from the side it came from, and it arrives quickly.
           This used to be a rotateY through a 1400px perspective — a page-flip
           mime that read as cheap for the same reason stock 3D transitions
           always do: the day is not a physical sheet, and pretending it is
           draws attention to the effect instead of to the day. A fast slide
           says the same thing (you moved, this way) in a quarter of a second
           and then gets out of the way. The paper sound carries the metaphor;
           the motion just needs to be direction and speed. */
        .nb-turn-next{animation:turnnext 240ms cubic-bezier(.22,.9,.28,1)}
        @keyframes turnnext{0%{opacity:.4;transform:translate3d(6%,0,0)}55%{opacity:1}100%{opacity:1;transform:translate3d(0,0,0)}}
        .nb-turn-prev{animation:turnprev 240ms cubic-bezier(.22,.9,.28,1)}
        @keyframes turnprev{0%{opacity:.4;transform:translate3d(-6%,0,0)}55%{opacity:1}100%{opacity:1;transform:translate3d(0,0,0)}}
        .nb-up{animation:nbup 200ms cubic-bezier(.23,1,.32,1)}
        /* Travel plus a clip on the leading edge: the surface rises into view from
           under the one below it rather than materialising in place. */
        @keyframes nbup{from{clip-path:inset(100% 0 0 0);transform:translateY(14px)}to{clip-path:inset(0 0 0 0);transform:translateY(0)}}
        /* Low-frequency collections get one quiet entrance so a filter change
           does not replace the whole surface on a single frame. Four pixels is
           enough to establish continuity without making readable content travel. */
        /* Uncovered off the rail they hang from, not faded up. The agenda draws a day
           rail down the left with its cards attached to the right of it, so sweeping
           the clip left-to-right reads as the day extruding its own contents. The
           30ms step and 180ms body keep the whole run under 300ms; this must never
           be driven by scrolling, only by a real list change. */
        .nb-list-enter{animation:nb-list-enter 180ms var(--motion-enter) both;animation-delay:calc(var(--nb-list-index, 0) * 30ms);will-change:clip-path,transform}
        @keyframes nb-list-enter{from{clip-path:inset(0 100% 0 0);transform:translate3d(0,4px,0)}to{clip-path:inset(0 0 0 0);transform:translate3d(0,0,0)}}
        /* The three views do move through space, and the switch says so.
           This used to be opacity alone, on the reasoning that a view change is
           a change of lens rather than a page moving. That holds while the only
           way to change view is to press a tab. It stops holding once the views
           can be dragged between: a surface that follows your thumb and then
           cross-fades has told you two different stories about what it is. The
           travel is small — a fourteenth of the width, matching the day turn's
           idiom at 6% — because the direction is the information, not the
           distance.
           Two alternating names so the arriving surface can start its handoff in
           the same render as the view change; --nb-view-dir carries which way. */
        /* The track carries both panes past the window; the window is the section.
           overflow-x is clipped rather than hidden so this never becomes a scroll
           container — the timeline inside owns the only scrolling here. */
        .nb-main>section{overflow-x:clip}
        .nb-view-track{display:flex;flex:1 1 auto;min-height:0;min-width:0;transition-timing-function:var(--motion-lane)}
        .nb-view-track.is-sliding{transition:transform ${VIEW_SLIDE_MS}ms var(--motion-lane);will-change:transform}
        .nb-view-pane{flex:0 0 100%;min-width:0;min-height:0;display:flex;flex-direction:column}
        /* Reduced motion keeps the handoff but not the journey: the pane it lands
           on is the same one, arrived at without travel. */
        @media(prefers-reduced-motion:reduce){.nb-view-track.is-sliding{transition:none}}
        /* nb-view-enter-a/b no longer paints anything. It stays because it is the
           marker for "this view change was an animated pointer pick", which is a
           contract motion.spec.js asserts in both directions, and it still means
           exactly that — it is set under the same condition as the slide. Giving
           it back an opacity fade would flash the whole of .nb-main, the desktop
           Actions column included, underneath a track that is already carrying
           the motion. The alternating pair is kept so the marker changes identity
           on consecutive switches. */
        /* Completion is a durable state, not a toast. Keep the accent surface
           mounted after its reveal so the card remains visibly complete; the
           same interruptible clip transition reverses when the user reopens it. */
        .nb-action-complete-overlay{opacity:0;clip-path:inset(0 100% 0 0 round 14px);transition:clip-path 260ms cubic-bezier(.23,1,.32,1),opacity 160ms ease;will-change:clip-path,opacity}
        .nb-action-complete-overlay.is-visible{opacity:1;clip-path:inset(0 0 0 0 round 14px)}
        /* Every menu and sheet is the same material as the control that opened it.
           When a trigger can be measured the surface grows from that exact pill;
           first-run and system sheets use the bottom-sheet fallback. */
         .nb-fluid{animation:nbfluid ${SHEET_ENTRY_MS}ms cubic-bezier(.23,1,.32,1);transform-origin:bottom center;border-radius:24px 24px 0 0;will-change:transform,opacity,clip-path}
        /* The one surface with no origin and no way to have one: nothing was pressed
           to open first-run, so there is no rect to grow from. It comes from the edge
           instead, a full self-height so the distance is right at any size, and it
           stays opaque the whole way — the scrim darkening underneath is what gives
           the solid card something to arrive against.
           No scale. Scaling resamples every glyph inside the panel, which is the whole
           reason fluidGeometry reveals sheets by clip rather than zooming them. */
        @keyframes nbfluid{
          from{transform:translateY(100%)}
          to{transform:translateY(0)}
        }
        /* A sheet grows from its trigger by being *revealed*, not by being zoomed.
           The panel is at its true size from the first frame, edge-aligned to the
           measured button and clipped to a rounded window exactly the button's
           size; the window opens out to the panel's own edges. Nothing inside is
           ever scaled, so the text is laid out once and never resampled — see
           features/motion/fluidGeometry.js for the pure anchor arithmetic. */
        .nb-fluid[data-fluid-origin="none"]{animation:none;transform:none;clip-path:none}
        .nb-fluid[data-fluid-origin="trigger"]{animation-name:nbfluidorigin;animation-timing-function:cubic-bezier(.22,.85,.28,1);transform-origin:center}
        /* The corner has to stop being a pill early, or the whole reveal reads as a
           hole rather than a card.
           Interpolating the trigger's radius straight to the sheet's kept it near
           999px for most of the run, and a 999px corner on a window that is already
           several hundred pixels wide is an ellipse. Watched frame by frame, what the
           eye saw was a soft circular portal opening onto a finished sheet — which is
           exactly the "appears out of nowhere" this was supposed to fix. The window
           keeps the trigger's own corner through the first 15%, then becomes
           card-cornered by 35% and stays there for the rest of the travel. */
         @keyframes nbfluidorigin{
           0%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y));clip-path:inset(var(--fluid-inset-y) var(--fluid-inset-x) round var(--fluid-radius, 999px))}
           22%{clip-path:inset(calc(var(--fluid-inset-y) * .48) calc(var(--fluid-inset-x) * .48) round 24px)}
           100%{opacity:1;transform:translate(0,0);clip-path:inset(0px 0px round 24px)}
        }
        /* The clip is the transition. Fading the body independently made the
           opening shape empty and erased the contents before the closing shape
           reached its card, so the connected morph read as a generic fade. */
        .nb-fluid[data-fluid-origin="trigger"] .nb-notch-body{animation:none;opacity:1}
        .nb-fluid.nb-fluid-closing{animation:nbfluidout 240ms cubic-bezier(.4,0,.4,1) forwards;pointer-events:none}
        .nb-fluid.nb-fluid-closing[data-fluid-origin="trigger"]{animation-name:nbfluidoriginout;animation-duration:300ms}
        @keyframes nbfluidout{from{transform:translateY(0)}to{transform:translateY(100%)}}
        /* The exit retraces the entry. It used to travel a quarter of the way back
           and stop at scale(.88), so a sheet that flew out of its card drifted
           vaguely downward on the way out — the two halves of one gesture did not
           describe the same path. Same distance, same clip, reversed. */
         @keyframes nbfluidoriginout{
           0%{opacity:1;transform:translate(0,0);clip-path:inset(0px 0px round 24px)}
           100%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y));clip-path:inset(var(--fluid-inset-y) var(--fluid-inset-x) round var(--fluid-radius, 999px))}
        }
        .nb-fluid.nb-fluid-closing[data-fluid-origin="trigger"] .nb-notch-body{animation:none;opacity:1}
        /* The notch is the sheet itself taking on the trigger's material and
           geometry — not a coloured copy fading in front of it. The panel is
           clipped from the real button bounds, transitions from that button's
           theme accent to its own card surface, then lets content arrive after
           the physical move has established the new space. */
        .nb-fluid[data-fluid-origin="notch"]{
          --nb-morph-dur:${MORPH_MS}ms;
          --nb-morph-close:${MORPH_CLOSE_MS}ms;
          --nb-morph-handoff:${MORPH_HANDOFF_MS}ms;
          --nb-morph-slide:${MORPH_HANDOFF_SLIDE_PX}px;
          --nb-morph-content-scale:${MORPH_CONTENT_SCALE};
          --nb-morph-content-blur:${MORPH_CONTENT_BLUR_PX}px;
          --nb-morph-lead:calc(var(--nb-morph-dur) * ${MORPH_LEAD});
          --nb-morph-step:calc(var(--nb-morph-dur) * ${MORPH_STEP});
          --nb-morph-fade:calc(var(--nb-morph-dur) * ${MORPH_FADE});
          overflow-x:clip;
          animation-name:nbnotchin,nbnotchwash;animation-duration:var(--nb-morph-dur);
          animation-timing-function:cubic-bezier(.22,.85,.28,1),cubic-bezier(.4,0,.6,1);
          transition:background-color 210ms cubic-bezier(.22,.85,.28,1);
        }
        /* The window stays the button's material until the shape has somewhere to land,
           then washes into the sheet's own surface on the same 320ms the clip runs on.
           This used to be React state on three setTimeouts, which meant a paused frame
           showed whatever the wall clock had reached rather than what the clip was
           doing — the paint and the shape were two different animations wearing one
           name. nbnotchin keeps its own easing; the wash keeps a gentler one.
           The wash used to hold accent to 55% and finish at 100%, which put it
           squarely on top of the content cascade: watched paused at half way, the
           whole form was rendered part-opaque over a solid lime slab, chips reading
           lime-on-lime, and only afterwards did the surface turn dark underneath
           already-visible content. That is a colour flash, not a material carry. The
           surface now finishes becoming the card before the first group arrives, so
           content lands on the sheet rather than on the button. */
        @keyframes nbnotchwash{0%,10%{background-color:var(--morph-accent)}32%,100%{background-color:var(--morph-card)}}
        /* The wall clock has the last word on the resting paint.
           A CSS animation in the running state outranks the inline background whether
           or not its clock is advancing, so an animation that stalls — a backgrounded
           tab, a device that drops it, a cancel mid-flight — pins the sheet to its 0%
           keyframe, which is the trigger's accent, and nothing recovers it: the right
           colour is sitting in the style attribute being outranked. Shipped once and
           reverted, as a composer stuck solid red.
           The stage machine runs on setTimeout and was observed reaching "open" on a
           page whose animation clock never moved at all, so it is the thing that can
           be trusted to end this. An important author declaration is the only kind
           that beats an animation, which is exactly why it is used here and nowhere
           else. At MORPH_MS the morph is over by definition: this is a no-op when the
           animation ran and a repair when it did not. Content gets the same guarantee
           for the same reason — a stalled cascade leaves the form clipped away, and a
           stalled clip leaves the whole sheet invisible at the button's size.
           Not transform, deliberately: that is the one of these a drag can legitimately
           own at rest, and pinning it would cost a gesture to insure against a stall. */
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"]{clip-path:none!important}
        /* The surface is guaranteed from "reveal" rather than "open": the wash is
           finished at 46% of the morph (~175ms) and reveal fires at 56% (~213ms), so
           there is nothing left for the animation to say about colour by then. The
           clip is not included here because it legitimately runs to 100%. */
        .nb-fluid[data-fluid-origin="notch"]:is([data-morph-stage="reveal"],[data-morph-stage="content"],[data-morph-stage="open"]){background-color:var(--morph-card)!important}
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-notch-cascade>*,
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-notch-body>:first-child{clip-path:none!important}
        /* Same corner defect the editor had, in the keyframe that fix never reached.
           Interpolating NEW's pill radius straight to the sheet's 24px keeps it near
           999px while the window is already hundreds of pixels wide, and a 999px
           corner on a 336px box is a circle: a quarter of the way in, the composer
           was a lime disc blooming mid-screen with no relationship to the button it
           came from. The window keeps the button's own corner through the first
           15%, then becomes card-cornered by 35% and stays there for the rest of
           the travel. */
        @keyframes nbnotchin{
          0%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y));clip-path:inset(var(--fluid-inset-top) var(--fluid-inset-right) var(--fluid-inset-bottom) var(--fluid-inset-left) round var(--fluid-radius, 999px))}
          10%{transform:translate(calc(var(--fluid-x) * .86),calc(var(--fluid-y) * .86));clip-path:inset(calc(var(--fluid-inset-top) * .86) calc(var(--fluid-inset-right) * .86) calc(var(--fluid-inset-bottom) * .86) calc(var(--fluid-inset-left) * .86) round var(--fluid-radius, 999px))}
          20%{transform:translate(calc(var(--fluid-x) * .72),calc(var(--fluid-y) * .72));clip-path:inset(calc(var(--fluid-inset-top) * .72) calc(var(--fluid-inset-right) * .72) calc(var(--fluid-inset-bottom) * .72) calc(var(--fluid-inset-left) * .72) round var(--fluid-radius, 999px))}
          32%{transform:translate(calc(var(--fluid-x) * .48),calc(var(--fluid-y) * .48));clip-path:inset(calc(var(--fluid-inset-top) * .48) calc(var(--fluid-inset-right) * .48) calc(var(--fluid-inset-bottom) * .48) calc(var(--fluid-inset-left) * .48) round var(--fluid-target-radius, 24px))}
          45%{transform:translate(calc(var(--fluid-x) * .34),calc(var(--fluid-y) * .34));clip-path:inset(calc(var(--fluid-inset-top) * .34) calc(var(--fluid-inset-right) * .34) calc(var(--fluid-inset-bottom) * .34) calc(var(--fluid-inset-left) * .34) round var(--fluid-target-radius, 24px))}
          72%{transform:translate(calc(var(--fluid-x) * .08),calc(var(--fluid-y) * .08));clip-path:inset(calc(var(--fluid-inset-top) * .08) calc(var(--fluid-inset-right) * .08) calc(var(--fluid-inset-bottom) * .08) calc(var(--fluid-inset-left) * .08) round var(--fluid-target-radius, 24px))}
          88%,100%{opacity:1;transform:translate(0,0);clip-path:inset(0px 0px 0px 0px round var(--fluid-target-radius, 24px))}
        }
        /* The sheet assembles itself rather than appearing.
           The body used to fade as a single block from 60% of the morph, which
           is the one thing that cannot be tuned into the reference feeling: a
           panel whose contents all arrive together reads as a panel, however
           well-eased. The reference staggers its groups a fifth of the
           container's duration apart, starting a third of the way in and still
           landing after the shape has settled — so the eye follows the sheet
           being built instead of catching it already built.
           Groups are DOM order. The sheet's own header is the first; anything
           inside a .nb-notch-cascade root follows. A sheet that does not opt in
           keeps the old single-block behaviour on the new timing, which is why
           the :has() guard is here rather than a second class on every sheet. */
        /* V3 treats the Composer as one destination plane. The existing cascade
           markup stays in place for structure and non-notch surfaces, but its
           notch-entry animations are suppressed so eight independent wipes do
           not fight the single reference-like handoff below. */
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body{
          pointer-events:none;
          transform-origin:top right;
          animation:nbnotchbodyin var(--nb-morph-handoff) cubic-bezier(.34,1.15,.64,1) both;
          /* The body is hidden until this point, then resolves during the
             source's exit window so the two identities briefly overlap. */
          animation-delay:calc(var(--nb-morph-dur) * .28);
          will-change:transform,opacity,filter;
        }
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body > :first-child,
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-cascade > *,
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body > :last-child:not(:has(.nb-notch-cascade)){
          animation:none!important;
          clip-path:none!important;
          will-change:auto;
        }
        @keyframes nbnotchbodyin{
          0%{opacity:0;transform:translateX(calc(var(--nb-morph-slide) * 1.125)) scale(var(--nb-morph-content-scale));filter:blur(var(--nb-morph-content-blur))}
          18%{opacity:.32}
          46%{opacity:.9}
          64%,100%{opacity:1;transform:translateX(0) scale(1);filter:blur(0)}
        }
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="content"] .nb-notch-body,.nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-notch-body{pointer-events:auto}
        /* The wall-clock stage is authoritative once the morph deadline has
           passed. This is deliberately scoped to the settled state: it repairs
           a stalled body animation without stealing the opening interpolation
           or the reversible closing animation. */
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-notch-body{animation:none!important;opacity:1!important;transform:none!important;filter:none!important;will-change:auto!important}
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:last-child:not(:has(.nb-notch-cascade)){--nb-stage:1}
        ${Array.from({ length: 8 }, (_, n) => `.nb-fluid[data-fluid-origin="notch"] .nb-notch-cascade>*:nth-child(${n + 1}){--nb-stage:${n + 1}}`).join("")}
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-cascade>*:nth-child(n+9){--nb-stage:8}
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:first-child,
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-cascade>*,
        .nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:last-child:not(:has(.nb-notch-cascade)){
          animation:nbnotchgroupin var(--nb-morph-fade) cubic-bezier(.22,.85,.28,1) backwards;
          animation-delay:calc(var(--nb-morph-lead) + var(--nb-stage,0) * var(--nb-morph-step));
          will-change:clip-path;
        }
        /* Notch entry is owned by the single body plane. Once the wall-clock
           stage reaches open, the legacy cascade descendants are explicitly
           idle too; otherwise the later generic rule above can leave a dead
           clip-path compositor hint promoted for the lifetime of the sheet. */
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-notch-body>:first-child,
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-notch-cascade>*,
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-notch-body>:last-child:not(:has(.nb-notch-cascade)){
          animation:none!important;
          clip-path:none!important;
          will-change:auto!important;
        }
        /* Each group is uncovered, not faded in. This was the last fade left on the
           composer and the one the eye actually catches, because eight of them finish
           together against a surface that is still settling.
           Still not a transform: a transformed descendant extends its scroller's
           overflow, and the 10px rise this replaced was measured into scrollHeight,
           which sized the sheet taller than its content and broke the clip's match to
           the button. clip-path has no layout effect at all, so the wipe buys the
           material feeling without reopening that bug. The stagger and its delays are
           untouched; content still waits for the shape to have somewhere to land.
           Fill mode is backwards rather than both so the clip is applied through the
           delay and then released entirely -- a group left permanently clipped to its
           own box would cut off anything it later opens. */
        @keyframes nbnotchgroupin{from{clip-path:inset(-14px -14px 100% -14px)}to{clip-path:inset(-14px -14px -14px -14px)}}
        .nb-morph-source-label{position:absolute;left:var(--fluid-inset-left,0px);top:var(--fluid-inset-top,0px);width:var(--fluid-source-width,100%);height:var(--fluid-source-height,100%);box-sizing:border-box;z-index:8;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:.75rem;font-weight:700;letter-spacing:.1em;opacity:1;animation:nbnotchlabelout var(--nb-morph-handoff,200ms) cubic-bezier(.34,1.15,.64,1) both;transition:opacity 100ms cubic-bezier(.23,1,.32,1);will-change:transform,opacity,filter}
        /* The label is the button's own word, so it leaves with the button's own
           colour. It occupies the measured source window rather than the full
           destination panel; an edge-anchored clip must not hide the identity in
           the middle of the true-size Sheet at frame zero. It remains decorative
           and non-interactive, then hands off as the first content group arrives. */
        @keyframes nbnotchlabelout{0%,18%{opacity:1;transform:translateX(0) scale(1);filter:blur(0)}58%{opacity:.28;transform:translateX(calc(var(--nb-morph-slide) * -.72)) scale(var(--nb-morph-content-scale));filter:blur(var(--nb-morph-content-blur))}100%{opacity:0;transform:translateX(calc(-1 * var(--nb-morph-slide))) scale(var(--nb-morph-content-scale));filter:blur(var(--nb-morph-content-blur))}}
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="reveal"] .nb-morph-source-label,.nb-fluid[data-fluid-origin="notch"][data-morph-stage="content"] .nb-morph-source-label{opacity:0}
        /* Once the handoff is settled, remove the transient label transform and
           filter rather than leaving the animation's fill value on a hidden
           node. Closing sheets enter a separate "closing" stage, so their
           reversible label-in animation still owns these properties. */
        .nb-fluid[data-fluid-origin="notch"][data-morph-stage="open"] .nb-morph-source-label{animation:none!important;opacity:0;transform:none!important;filter:none!important;will-change:auto!important}
        /* Close spends the existing lead *inside* MORPH_MS: the form leaves for
           --nb-morph-lead, then the lime object folds for the rest. Adding a
           133ms lead on top of 350 would fail the fortieth-time test. In-flight
           reverse (data-fluid-reverse) does not take this delay — the form is
           mid-arrival and leaves with the shape. Unmount stays at MORPH_MS. */
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"]:not([data-fluid-reverse="true"]){
          animation:nbnotchout var(--nb-morph-close,${MORPH_CLOSE_MS}ms) cubic-bezier(.4,0,.3,1) forwards;
        }
        @keyframes nbnotchout{
          0%{opacity:1;transform:translate(0,0);clip-path:inset(0px 0px 0px 0px round var(--fluid-target-radius, 24px))}
          100%{opacity:1;transform:translate(var(--fluid-x),var(--fluid-y));clip-path:inset(var(--fluid-inset-top) var(--fluid-inset-right) var(--fluid-inset-bottom) var(--fluid-inset-left) round var(--fluid-radius, 999px))}
        }
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-notch-body{
          animation:nbnotchbodyout var(--nb-morph-close,${MORPH_CLOSE_MS}ms) cubic-bezier(.22,1,.36,1) both;
          pointer-events:none;
        }
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-notch-cascade>* ,
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-notch-body>:first-child{
          animation:none!important;
          pointer-events:none;
        }
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"] .nb-morph-source-label{
          animation:nbnotchlabelin var(--nb-morph-close,${MORPH_CLOSE_MS}ms) cubic-bezier(.22,1,.36,1) both;
          pointer-events:none;
        }
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"][data-fluid-reverse="true"] .nb-notch-body,
        .nb-fluid.nb-fluid-closing[data-fluid-origin="notch"][data-fluid-reverse="true"] .nb-morph-source-label{
          animation:none!important;
        }
        @keyframes nbnotchbodyout{
          0%{opacity:1;transform:translateX(0) scale(1);filter:blur(0)}
          64%,100%{opacity:0;transform:translateX(var(--nb-morph-slide)) scale(var(--nb-morph-content-scale));filter:blur(var(--nb-morph-content-blur))}
        }
        @keyframes nbnotchlabelin{
          0%{opacity:0;transform:translateX(calc(-1 * var(--nb-morph-slide))) scale(var(--nb-morph-content-scale));filter:blur(var(--nb-morph-content-blur))}
          64%,100%{opacity:1;transform:translateX(0) scale(1);filter:blur(0)}
        }
                .nb-composer-ask{animation:nbask 180ms cubic-bezier(.23,1,.32,1)}
        @keyframes nbask{from{clip-path:inset(100% 0 0 0);transform:translateY(6px)}to{clip-path:inset(0 0 0 0);transform:none}}
        @media(prefers-reduced-motion:reduce){.nb-composer-ask{animation:none}}
        @media(min-width:640px){.nb-fluid{transform-origin:center;border-radius:24px}}
        /* The blur is set once and never animated. A changing blur radius throws
           away the compositor's cached backdrop every frame and re-blurs the whole
           viewport — the most expensive thing on screen, running underneath the
           sheet's own morph, which is what made the first open of a session stutter
           while that pipeline warmed up. Fading the scrim's opacity fades the blur
           in with it, so it costs one blur instead of eighteen and looks the same. */
        .nb-scrim{animation:nbscrim 260ms cubic-bezier(.23,1,.32,1) forwards;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
        @keyframes nbscrim{from{opacity:0}to{opacity:1}}
        .nb-scrim.nb-fluid-closing{animation:nbscrimout 240ms ease forwards}
        .nb-scrim.nb-fluid-closing:has(> .nb-fluid[data-fluid-origin="notch"]){animation:nbscrimout var(--nb-morph-close,${MORPH_CLOSE_MS}ms) ease forwards}
        @keyframes nbscrimout{0%,25%{opacity:1}100%{opacity:0}}
        .nb-sheet-h{transition:height 320ms cubic-bezier(.2,.8,.25,1)}
        .nb-edit-actions{transition:width 360ms cubic-bezier(.23,1,.32,1),background-color 260ms ease,box-shadow 260ms ease}
        .nb-edit-liquid{transition:left 360ms cubic-bezier(.23,1,.32,1)}
        .nb-edit-face{transition:opacity 200ms ease,transform 360ms cubic-bezier(.23,1,.32,1)}
        /* A multi-select pill has no single selection to slide, so its fill grows in
           and shrinks out with the same spring the traveling pill uses. */
        .nb-chip-fill{transition:transform 260ms cubic-bezier(.23,1,.32,1)}
        /* Toasts leave the way they came instead of vanishing on the frame they are
           dismissed. */
        .nb-toast-out{animation:nbtoastout 200ms cubic-bezier(.4,0,.65,1) forwards;pointer-events:none}
        /* A toast leaves the edge it arrived from. Symmetry is what makes
           swipe-to-dismiss legible — and an undo toast that exits downward tells you
           where undo went. Clipping the bottom edge as it travels means it slides
           under the rail instead of thinning out over it. */
        @keyframes nbtoastout{to{clip-path:inset(100% 0 0 0);transform:translateY(14px)}}
        /* The mobile sheet's spring overshoots its resting place; the extension below
           keeps the overshoot from showing a gap under the bottom edge. */
        .nb-msheet::after{content:"";position:absolute;top:100%;left:0;right:0;height:40px;background:inherit}
        .nb-detail-editor{animation:nbrise 260ms cubic-bezier(.23,1,.32,1)}
        /* A primary action gets a little more weight under the finger than a
           secondary one — the difference is felt before it is read. */
        .nb-liquid{transition:scale 220ms cubic-bezier(.23,1,.32,1),box-shadow 220ms ease}
        .nb-liquid:active{scale:.94;transition:scale 90ms cubic-bezier(.4,0,.6,1)}
        .nb-rise{animation:nbrise 240ms cubic-bezier(.23,1,.32,1)}
        @keyframes nbrise{from{clip-path:inset(100% 0 0 0);transform:translateY(12px)}to{clip-path:inset(0 0 0 0);transform:translateY(0)}}
        .nb-p{animation:nbp 620ms cubic-bezier(.1,.7,.3,1) forwards}
        @keyframes nbp{from{opacity:1;transform:translate(0,0) scale(1)}to{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.2)}}
        .nb-rw{animation:nbrw 900ms cubic-bezier(.2,.8,.3,1) forwards}
        @keyframes nbrw{0%{opacity:0;transform:translateY(20px) scale(.8)}25%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-52px) scale(1)}}
        .nb-blink{animation:nbb 2s ease-in-out infinite}
        @keyframes nbb{0%,100%{opacity:1}50%{opacity:.4}}
        button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,
        a[href]:focus-visible,summary:focus-visible,label[for]:focus-visible,[role="button"]:focus-visible,
        [data-event-id]:focus-visible,[data-task-chip]:focus-visible{outline:2px solid ${T.accent};outline-offset:2px}
        input,textarea,select{color:${T.text}}
        input::placeholder,textarea::placeholder{color:${T.dim}}

        /* ── Press ──────────────────────────────────────────────────────────────
           Everything you can press answers the press. This is set on the elements
           themselves rather than a class on 123 call sites, so a control added
           later is never silently dead to the touch.

           It animates the standalone \`scale\` property, not \`transform\`. Cards are
           positioned, dragged and paged with transforms, and animating one
           transform against another is exactly what made the page swipe judder —
           \`scale\` composites on its own and cannot fight them. */
        button,[role="button"],a[href],summary,label[for],[data-event-id],[data-task-chip]{
          -webkit-tap-highlight-color:transparent;touch-action:manipulation;
           scale:1;
           transition:scale 220ms cubic-bezier(.23,1,.32,1),background-color 200ms ease,color 200ms ease,box-shadow 220ms ease,opacity 160ms ease;
        }
        /* A collision changes every card in its cluster, so lane geometry settles
           as one connected movement. Left and width keep positioning out of
           transform, leaving the standalone press scale and drag transform free
           to do their own jobs. */
        .nb-timeline-lane{
          container-type:inline-size;
          transition:left 240ms var(--motion-lane),width 240ms var(--motion-lane),scale 220ms var(--motion-enter),opacity 160ms ease,box-shadow 200ms var(--motion-settle);
        }
        /* Collision layout can settle after a gesture ends. During the gesture,
           though, the lane is the physical object under the pointer: interpolated
           left/width geometry makes it visibly trail a line across the timeline. */
        .nb-timeline-lane.nb-timeline-lane-active{transition:none}
        /* A shared lane is information in itself. Once a card is narrow, repeat,
           alert, conflict and time badges stop repeating that information and
           yield to the two things the card must preserve: its title and JOIN. */
        @container (max-width:220px){
          .nb-event-secondary{display:none}
          .nb-event-row{column-gap:.375rem}
        }
        @container (max-width:160px){
          .nb-task-time,.nb-task-duration{display:none}
        }
        /* Down is quick and linear, release overshoots and settles — the difference
           between the two is what reads as a physical thing rather than a fade. */
        button:active,[role="button"]:active,a[href]:active,summary:active,[data-event-id]:active,[data-task-chip]:active{
          scale:.965;transition:scale 90ms cubic-bezier(.4,0,.6,1);
        }
        button.nb-mobile-calendar-return:active{scale:1!important}
        button.nb-mobile-calendar-return:active::after{opacity:.16}
        button:disabled,button[disabled]{scale:1!important}
        /* A control that completes something pops rather than just filling in. */
        .nb-pop{animation:nbpop 300ms cubic-bezier(.23,1,.32,1)}
        @keyframes nbpop{0%{scale:1}35%{scale:1.12}100%{scale:1}}

        /* The expanded row has intrinsic height, which made the previous 1fr to
           0fr grid transition discrete in Chromium. Measure the stable inner
           box and interpolate two numeric heights so collapse and restore share
           one interruptible path. */
        /* Focus mode is a two-layer collapse. The outer box owns the one piece of
           layout that must move — the space reclaimed by the timeline — while the
           inner box carries the visual departure. Keeping those paths separate
           prevents the header contents from fading out before the stream has
           actually received the space, which read as an abrupt jump even though
           the measured height was interpolating correctly. Both directions use
           the shell's established no-overshoot ease so a button tap, a scroll,
           and a reversal all retarget the same transition. */
        .nb-app-surface>[data-test="timeline-chrome"].nb-timeline-chrome{min-height:0;overflow:hidden;flex:0 0 auto;opacity:1;transform:none;transition:height 300ms var(--nav-ease)}
        .nb-timeline-chrome-inner{min-height:0;transform:translate3d(0,0,0);opacity:1;transition:transform 300ms var(--nav-ease),opacity 240ms var(--nav-ease)}
        .nb-day-heading{transition:background-color 180ms ease,border-color 180ms ease}
        .nb-day-heading .nb-display{transition:font-size 300ms var(--nav-ease),line-height 300ms var(--nav-ease)}
        .nb-timeline-chrome.is-collapsed{pointer-events:none}
        /* B4 in the de-fade plan, deliberately NOT converted. Removing the inner's
           opacity broke five tests — all four timeline-chrome-scroll cases and the
           focus-mode header check — because the collapsed header is asserted as
           faded, not merely as clipped by a zero-height box. The fade is load-bearing
           here, not decoration; converting it needs those contracts rewritten first. */
        .nb-timeline-chrome.is-collapsed .nb-timeline-chrome-inner{opacity:0;transform:translate3d(0,-10px,0)}
        @media(max-width:639px){
          .nb-month-navigator.is-month{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:.5rem;row-gap:.25rem;align-items:center}
          .nb-month-navigator.is-month .nb-month-view-mode{justify-content:flex-end}
          .nb-month-navigator.is-month .nb-month-controls{grid-column:1 / -1}
        }
        .nb-day-heading.is-focused{padding-top:.45rem;padding-bottom:.45rem;border-bottom:1px solid ${T.line}}
        .nb-day-heading.is-focused .nb-display{font-size:2rem;line-height:2rem}
        .nb-progress-fill{transform-origin:left center;transform:scaleX(0);transition:transform 200ms var(--motion-enter)}
        .nb-progress-fill.is-filled{transform:scaleX(1)}
        .nb-action-progress-compact{display:flex;flex-direction:column;gap:2px;pointer-events:none}

        @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.nb-fluid,.nb-view-track,.nb-msheet,.nb-timeline-chrome,.nb-timeline-chrome-inner,.nb-morph-source-label,.nb-up,.nb-list-enter{animation:none!important;transform:none!important}.nb-progress-fill{transition:none!important}.nb-fluid,.nb-msheet,.nb-timeline-chrome-inner,.nb-morph-source-label{transition:opacity 160ms ease!important}.nb-fluid[data-fluid-origin="notch"] .nb-notch-body{animation:none!important;transition:none!important;opacity:1!important;transform:none!important;filter:none!important;will-change:auto!important}.nb-fluid[data-fluid-origin="notch"] .nb-morph-source-label{animation:none!important;transition:none!important;opacity:0!important;transform:none!important;filter:none!important;pointer-events:none!important;will-change:auto!important}.nb-fluid[data-fluid-origin="notch"] .nb-notch-cascade>*,.nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:first-child,.nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:last-child:not(:has(.nb-notch-cascade)){will-change:auto!important}.nb-view-track.is-sliding,.nb-app-surface,.nb-nav-viewport,.nb-nav-carrier,.nb-nav-motion-viewport,.nb-nav-motion-carrier,.nb-mobile-calendar-return,.nb-mobile-calendar-return::after,.nb-navigation,.nb-nav-brand,.nb-nav-item,.nb-nav-membership{transition:none!important;animation:none!important}
          button:active,[role="button"]:active,a[href]:active,[data-event-id]:active,[data-task-chip]:active{scale:1!important}}
        ${preferences?.display.reducedMotion ? `.nb-fluid,.nb-view-track,.nb-msheet,.nb-timeline-chrome,.nb-timeline-chrome-inner,.nb-morph-source-label{animation:none!important;transform:none!important}.nb-progress-fill{transition:none!important}.nb-fluid,.nb-msheet,.nb-timeline-chrome-inner,.nb-morph-source-label{transition:opacity 160ms ease!important}.nb-fluid[data-fluid-origin="notch"] .nb-notch-body{animation:none!important;transition:none!important;opacity:1!important;transform:none!important;filter:none!important;will-change:auto!important}.nb-fluid[data-fluid-origin="notch"] .nb-morph-source-label{animation:none!important;transition:none!important;opacity:0!important;transform:none!important;filter:none!important;pointer-events:none!important;will-change:auto!important}.nb-fluid[data-fluid-origin="notch"] .nb-notch-cascade>*,.nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:first-child,.nb-fluid[data-fluid-origin="notch"] .nb-notch-body>:last-child:not(:has(.nb-notch-cascade)){will-change:auto!important}.nb-view-track.is-sliding,.nb-app-surface,.nb-nav-viewport,.nb-nav-carrier,.nb-nav-motion-viewport,.nb-nav-motion-carrier,.nb-mobile-calendar-return,.nb-mobile-calendar-return::after,.nb-navigation,.nb-nav-brand,.nb-nav-item,.nb-nav-membership{transition:none!important;animation:none!important}
          button:active,[role="button"]:active,a[href]:active,[data-event-id]:active,[data-task-chip]:active{scale:1!important}` : ""}
      `;
}
