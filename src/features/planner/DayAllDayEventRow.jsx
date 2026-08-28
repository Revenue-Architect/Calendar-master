import React from "react";

import { MONO } from "../../design/typography.js";
import EventMorphSource from "../motion/EventMorphSource.jsx";
import { catColor } from "./constants.js";
import { ChevronIcon } from "./icons.jsx";
import { RowWithJoin } from "./rows.jsx";

export default function DayAllDayEventRow({ T, surface, event, dateKey, span, index, onOpen }) {
  return (
    <EventMorphSource event={event} dateKey={dateKey} view="day" lane="allday">
      <RowWithJoin T={T} surface={surface} link={event.link} title={event.title}
        data-event-timeline-lens-target="all-day-event"
        padding="px-2.5 py-2" onOpen={(interactionEvent) => onOpen(event, {
          keyboard: interactionEvent?.detail === 0,
        })}>
        <span data-morph-marker className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(event.cat) }} />
        <span data-morph-title className="nb-lead truncate flex-1">{event.title}</span>
        <span data-event-morph-disclosure aria-hidden="true" style={{ color: T.dimText }} className="shrink-0"><ChevronIcon direction="down" size={10} /></span>
        {span > 1 && <span data-morph-meta style={{ fontFamily: MONO, color: T.dimText }} className="nb-data shrink-0">{index}/{span}</span>}
      </RowWithJoin>
    </EventMorphSource>
  );
}
