/* The planner's fixed vocabulary: the words, colours and orderings the UI
 * offers, none of which depend on state, theme or time.
 *
 * They were scattered through 115 lines of Planner.jsx, interleaved with
 * layout numbers and gesture thresholds that genuinely are Planner's own.
 * Each one arrives here byte-exact, with the comment that explains it.
 *
 * catColor travels with CAT_COLOR because it is the only thing that reads it;
 * splitting them would leave Planner importing a table to define a one-line
 * accessor over it.
 */

/* §4.6/§4.7. The frequencies an entry can be set to from its own detail view. The
   fuller rule — selected weekdays, an end date, a count — still belongs to the
   composer, which has the room to explain it. */
const REPEATS = [["never", "NEVER"], ["daily", "DAILY"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"]];

const CATS = ["DEEP WORK", "ADMIN", "BODY", "PEOPLE", "RITUAL"];

/* Category colour is the one hue an event card carries, so it has to read on both a
   near-black and a cream ground. These sit in the mid-luminance band where that
   holds, rather than being tinted per theme — a category keeps the same colour
   wherever you see it, which is what makes the dot scannable. */
const CAT_COLOR = {
  "DEEP WORK": "#E0A33E",
  ADMIN: "#5E8BC7",
  BODY: "#45A877",
  PEOPLE: "#D4456B",
  RITUAL: "#9B6FD4",
};
const catColor = (cat) => CAT_COLOR[cat] || "#8A8A96";

/* The order the three surfaces lie in, left to right. It is the one place that
   knows a view has neighbours, and both the switch animation's direction and
   the swipe's target come from it. */
const VIEW_ORDER = ["timeline", "agenda", "actions"];

const ALERT_CHOICES = [0, 5, 15, 30, 60];
const DAY_LETTERS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/* Every shortcut the keydown handler implements, in one list, because a shortcut
   nobody can find is a shortcut nobody has. The cheat sheet renders this rather
   than a second hand-written copy, so the two cannot drift apart. */
const SHORTCUTS = [
  { group: "MOVING", keys: ["←", "→"], does: "Previous / next day" },
  { group: "MOVING", keys: ["T"], does: "Jump to today" },
  { group: "MOVING", keys: ["F"], does: "Focus timeline" },
  { group: "MOVING", keys: ["["], does: "Zoom out — day, week, month" },
  { group: "MOVING", keys: ["]"], does: "Zoom in" },
  { group: "MAKING", keys: ["N"], does: "New event" },
  { group: "MAKING", keys: ["A"], does: "New action" },
  { group: "MAKING", keys: ["⌘K", "/"], does: "Search, run a command, or type to create" },
  { group: "ACTIONS", keys: ["C"], does: "Complete the first open action" },
  { group: "ACTIONS", keys: ["D"], does: "Defer the first open action by a day" },
  { group: "GESTURES", keys: ["HOLD"], does: "Hold an empty slot to create" },
  { group: "GESTURES", keys: ["DRAG"], does: "Hold and drag an event or action to move it" },
  { group: "GESTURES", keys: ["EDGE"], does: "Drag an event edge to resize it" },
  { group: "GESTURES", keys: ["SWIPE →"], does: "Swipe a scheduled action right to complete it" },
  { group: "GESTURES", keys: ["SCROLL"], does: "Scroll the timeline without creating" },
  { group: "ELSEWHERE", keys: ["⌘Z"], does: "Undo the last change" },
  { group: "ELSEWHERE", keys: ["?"], does: "This list" },
  { group: "ELSEWHERE", keys: ["Esc"], does: "Close whatever is open" },
];

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WD1 = ["S", "M", "T", "W", "T", "F", "S"];
const MO = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/* The corner every planner surface is cut to. It stayed in Planner through
   Phase 3 as a layout number rather than vocabulary, which was the right call
   while Planner was its only reader. Phase 4 changes that: Pill, RowWithJoin,
   InlineField and InlineChoice all need it, and none of them can leave while it
   is defined in the file they are leaving. the RIBBON_* window stays
   behind — that is Planner's own scrolling state. HOUR_H did too, on the
   grounds that "the timeline is not going anywhere"; Phase 5 moves WeekGrid,
   so it is going somewhere, and the geometry goes with it. */

/* Timeline geometry and the gesture thresholds that read it. HOUR_H is the
   height of one hour and everything else here is derived from or measured
   against it, which is why they travel together. */
const CARD_R = 14;

const HOUR_H = 68;
const DAY_H = HOUR_H * 24;
const HOLD_MS = 420;
const LIFT_MS = 300;
/* Where a drag stops following the finger one-for-one and starts resisting. Not
   a limit — past this the page keeps moving, just less of it. */
const SWIPE_SOFT_LIMIT = 140;

export {
  ALERT_CHOICES,
  CARD_R,
  CAT_COLOR,
  CATS,
  DAY_H,
  DAY_LETTERS,
  HOLD_MS,
  HOUR_H,
  LIFT_MS,
  MO,
  REPEATS,
  SHORTCUTS,
  SWIPE_SOFT_LIMIT,
  VIEW_ORDER,
  WD,
  WD1,
  catColor,
};
