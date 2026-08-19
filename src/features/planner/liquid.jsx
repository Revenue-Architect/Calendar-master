/* The liquid chip family.
 *
 * A fill that scales up behind a selected chip, a plate that travels to sit
 * under the active one, and the chip row itself. The travel arithmetic is not
 * here — it is useLiquidPill in features/motion, which these call.
 */
import React, { useRef } from "react";

import { useLiquidPill } from "../motion/liquidPill.js";
import { MONO } from "../../design/typography.js";

/* The plate travels on `transform`, never on `left`/`width`.
 *
 * It used to transition all four of left, width, top and height, which is a
 * layout pass per frame for the whole tablist and the last layout-property
 * animation left in the chrome — the exception the shared-layout-motion PRD
 * said to land and then replace. This replaces it.
 *
 * Nothing is distorted by the change, because the plate only ever sits on the
 * *active* slot and that slot is the same width wherever it is: compact gives
 * the active tab icon+word and every inactive one icon alone, so the box the
 * indicator occupies is constant in both tiers. Width is therefore a static
 * style and travel is a pure translate. `scaleX` stays for the liquid squash
 * along the direction of travel, which is the one deliberate distortion. */
function LiquidPillIndicator({ T, box, stretch, settled = true, z = 0 }) {
  if (!box) return null;
  return (
    <span aria-hidden="true" data-test="pill-indicator" data-width={Math.round(box.width)} className="absolute" style={{
      left: 0, top: 0, width: box.width, height: box.height,
      background: T.accent, borderRadius: 999, zIndex: z,
      transform: `translate3d(${box.left}px, ${box.top}px, 0) scaleX(${stretch})`,
      transformOrigin: "center",
      /* Same duration and same curve as the siblings, so the plate and the tabs
         it travels between are one gesture rather than two overlapping ones. */
      transition: settled ? "transform 260ms var(--motion-lane)" : "none",
      willChange: "transform",
      pointerEvents: "none",
    }} />
  );
}

/* The liquid idiom for a multi-select pill: there is no single selection to slide,
   so each pill's fill grows in and shrinks out with the same spring instead. */
function LiquidFill({ T, on, radius = 999 }) {
  return (
    <span aria-hidden="true" className="nb-chip-fill absolute inset-0"
      style={{ background: T.accent, borderRadius: radius,
        transform: on ? "scale(1)" : "scale(.55)", opacity: on ? 1 : 0 }} />
  );
}

/* One chip row, one shape. Mixing pills with boxed fields makes unrelated controls
   look like different kinds of thing, so everything selectable here is a pill. */
function Chips({ T, surface, label, value, onChange, options, multi = false, wrap = false, dot = null }) {
  const selected = (key) => (multi ? (value ?? []).includes(key) : value === key);
  const wrapRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(wrapRef, [multi ? -1 : value, options.length]);
  const pick = (key) => {
    if (!multi) return onChange(key);
    const set = new Set(value ?? []);
    if (set.has(key)) set.delete(key); else set.add(key);
    onChange([...set].sort((a, b) => a - b));
  };
  return (
    <div>
      {label && <span style={{ fontFamily: MONO, color: T.dimText }} className="block nb-data mb-1">{label}</span>}
      <div ref={wrapRef} className={`relative flex gap-1 ${wrap ? "flex-wrap" : ""}`}>
        {/* Keep the traveling fill behind the control layer. The fill is a visual
            surface; it must never become the paint layer that covers a tile label. */}
        {!multi && <LiquidPillIndicator T={T} box={box} stretch={stretch} settled={settled} z={0} />}
        {options.map(([key, text]) => {
          const on = selected(key);
          return (
            <button key={String(key)} onClick={() => pick(key)} data-active={!multi && on ? "true" : "false"}
              className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} relative ${wrap ? "" : "flex-1"} inline-flex items-center justify-center gap-1.5 px-3 py-2 nb-data`}
              style={{
                fontFamily: MONO, borderRadius: 999,
                zIndex: 1,
                background: multi || !on ? surface : "transparent",
                color: on ? T.on : T.dim,
                transition: "background 180ms ease, color 260ms ease, transform 120ms ease",
              }}>
              {multi && <LiquidFill T={T} on={on} />}
              <span className="relative inline-flex items-center gap-1.5" style={{ zIndex: 2 }}>
                {dot && <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: on ? T.on : dot(key) }} />}
                {text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export {
  Chips,
  LiquidFill,
  LiquidPillIndicator,
};
