/* The pill navigation: a row of options with a plate that slides to the one
 * that is active.
 *
 * The geometry is all in features/motion/viewPills.js and the travel is
 * useLiquidPill; this is the markup that arranges them. Six surfaces use it —
 * view mode, action status, action planning, notebook views, and the composer's
 * what-to-add — which is why it could not stay a private helper of the file.
 */
import React, { useRef, useState } from "react";

import { useLiquidPill } from "../motion/liquidPill.js";
import {
  VIEW_PILL_ICON,
  VIEW_PILL_WORD,
  viewPillLabelClip,
  viewPillLabelSide,
  viewPillSlotWidth,
  viewPillTrackWidth,
} from "../motion/viewPills.js";
import { LiquidPillIndicator } from "./liquid.jsx";

const isOptionDisabled = (opt) => Boolean(opt && (opt[2]?.disabled || opt.disabled));

export default function PillNav({ T, value, options, onPick, onArm = null, ariaLabel, surface = "transparent",
                   className = "", style = {}, compact = false, icons = null, testId = null }) {
  const wrapRef = useRef(null);
  const { box, stretch, settled } = useLiquidPill(wrapRef, [value, options.length, compact]);
  const activeIndex = Math.max(0, options.findIndex(([key]) => key === value));
  const [instant, setInstant] = useState(false);
  const reduced = typeof window !== "undefined"
    && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const pick = (key, event) => {
    const source = event.detail === 0 ? "keyboard" : "pointer";
    setInstant(source === "keyboard" || reduced);
    onPick(key, source);
  };

  const onKeyDown = (event) => {
    const enabledIndices = [];
    options.forEach((opt, idx) => {
      if (!isOptionDisabled(opt)) enabledIndices.push(idx);
    });
    if (enabledIndices.length === 0) return;

    const currentPos = enabledIndices.indexOf(activeIndex);
    let nextPos = -1;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextPos = currentPos === -1 ? 0 : (currentPos + 1) % enabledIndices.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextPos = currentPos === -1 ? enabledIndices.length - 1 : (currentPos - 1 + enabledIndices.length) % enabledIndices.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextPos = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextPos = enabledIndices.length - 1;
    }

    if (nextPos !== -1) {
      const nextIndex = enabledIndices[nextPos];
      const nextOption = options[nextIndex];
      if (nextOption) {
        const nextKey = nextOption[0];
        setInstant(true);
        onPick(nextKey, "keyboard");
        const buttons = wrapRef.current?.querySelectorAll('[role="tab"]');
        if (buttons && buttons[nextIndex]) {
          buttons[nextIndex].focus();
        }
      }
    }
  };

  const hasSelected = options.some(([key]) => key === value);

  return (
    <div ref={wrapRef} role="tablist" aria-label={ariaLabel} data-test={testId}
      data-motion={instant ? "instant" : "travel"} data-compact={compact ? "icon" : "label"}
      onKeyDown={onKeyDown}
      className={`relative flex ${className}`}
      style={{ background: surface, borderRadius: 999, width: compact ? viewPillTrackWidth({ count: options.length }) : undefined, ...style }}>
      {!compact && <LiquidPillIndicator T={T} box={box} stretch={stretch} settled={settled} />}
      {options.map(([key, label], index) => {
        const on = key === value;
        const disabled = isOptionDisabled(options[index]);
        const isFocusable = on || (!hasSelected && index === 0);
        const Icon = compact ? icons?.[key] : null;
        return (
          <button key={String(key)} role="tab" aria-selected={on} aria-label={label}
            tabIndex={isFocusable ? 0 : -1}
            disabled={disabled}
            data-test={testId ? `${testId}-${key}` : undefined}
            data-active={on ? "true" : "false"}
            data-compact={compact && !on ? "icon" : "label"}
            onPointerDown={onArm && !disabled ? () => onArm(key) : undefined}
            onClick={(event) => { if (!disabled) pick(key, event); }}
            className={`nb-tap nb-hover-choice ${on ? "is-selected" : ""} relative ${compact ? "py-1" : "px-3 py-1"} nb-label`}
            style={{
              color: on ? T.on : T.dim,
              borderRadius: 999,
              zIndex: 1,
              ...(compact ? {
                width: viewPillSlotWidth(on),
                background: on ? T.accent : "transparent",
                display: "grid",
                gridTemplateColumns: `${VIEW_PILL_ICON}px ${VIEW_PILL_WORD}px`,
                alignItems: "center",
                justifyItems: "center",
                /* Contain the word's own overflow rather than leaving it to an
                   ancestor. The grid reserves a full 84px word column inside a
                   30px inactive button on purpose — clip-path is what hides it —
                   but layout width is not hidden by paint, so each inactive tab
                   spilled ~54px upward. Measured at 390px, `.nb-month-navigator`
                   reported 447px of content in a 390px box. Nothing broke,
                   because `.nb-timeline-chrome` happens to clip; that is luck
                   several levels away from the cause, and it would stop being
                   true the moment a row between them stopped clipping.
                   `clip`, not `hidden`: hidden makes the button a scroll
                   container, which moved its measured width by 0.3px — enough to
                   push the plate-alignment guard past its 1px tolerance, and that
                   guard exists for a real past bug. Clipping is all that was
                   wanted; a scroll container was never part of it. */
                overflow: "clip",
                transform: "none",
                /* Reserved-slot width only. Both end states are known before the
                   frame (30 / 114), so this is not the measured 0→auto spring
                   that left the plate 84px behind. The active tab wears the
                   accent; there is no separate plate to chase. */
                transition: instant ? "none" : "width 260ms var(--motion-lane), background-color 200ms ease, color 200ms ease",
              } : {
                transition: "color 260ms ease",
              }),
            }}>
            {/* The sibling's body.
                The FLIP was always running — siblings travel the full slot width
                and ease back — but an inactive tab was a bare glyph, so there was
                nothing on screen whose movement you could read. The reference this
                is modelled on gives every tab a filled surface, and that is what
                makes a switch look like three objects redistributing space rather
                than one highlight sliding behind text.
                Inset two pixels so adjacent surfaces read as separate objects
                without changing a single slot width, and painted only when the tab
                is inactive so it never covers the accent plate. */}
            {compact && !on && (
              <span aria-hidden="true" className="absolute" style={{
                inset: "0 2px", background: T.faint, borderRadius: 999, zIndex: -1,
                transition: instant ? "none" : "background-color 260ms ease, opacity 260ms ease",
              }} />
            )}
            {Icon ? <Icon size={13} /> : null}
            <span data-test={testId ? `${testId}-label` : undefined}
              style={{
                whiteSpace: "nowrap",
                ...(compact ? {
                  justifySelf: "start",
                  clipPath: viewPillLabelClip(on, viewPillLabelSide(index, activeIndex)),
                  opacity: on ? 1 : 0,
                  /* The outgoing word leaves before the incoming one arrives, and
                     both are slower than the pill they sit in. In the reference the
                     departing label is still legible while its pill narrows — it
                     reads as the word being squeezed out rather than switched off,
                     which is only possible if the fade outlasts the first third of
                     the travel. */
                  transition: instant ? "none" : "clip-path 260ms var(--motion-lane), opacity 170ms ease 40ms",
                } : null),
              }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
