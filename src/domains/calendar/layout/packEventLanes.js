function eventEnd(event) {
  return event.start + event.dur;
}

export function packEventLanes(events) {
  const sorted = [...events].sort((left, right) => (
    left.start - right.start
    || right.dur - left.dur
    || String(left.id).localeCompare(String(right.id))
  ));
  const packed = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    const laneEnds = [];
    const assigned = cluster.map((event) => {
      let lane = laneEnds.findIndex((end) => end <= event.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(eventEnd(event));
      } else {
        laneEnds[lane] = eventEnd(event);
      }
      return { event, lane };
    });
    for (const { event, lane } of assigned) {
      packed.push({ ...event, lane, cols: laneEnds.length });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const event of sorted) {
    if (cluster.length && event.start >= clusterEnd) flush();
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, eventEnd(event));
  }
  if (cluster.length) flush();

  return packed;
}
