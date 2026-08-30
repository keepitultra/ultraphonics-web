// Band availability — pure logic, no Firestore/React imports.
//
// Three states a member can set by hand, plus a fourth the UI derives:
// `unknown` means "never synced, never marked" and must render distinctly
// from `available` — otherwise a member who has never touched this page
// looks identical to one who has confirmed they're free, right at the
// moment someone is deciding whether to book a date. See effectiveState().

import { parseLocalDateOnly } from '../utils.js';

// --- Gig-window / busy-classification tuning ---------------------------

/** Local hours treated as "gig time". A busy block overlapping this window
 * marks the day unavailable; a busy block only outside it marks "maybe". */
export const GIG_WINDOW = { startHour: 17, endHour: 24 };

/** Ignore trivial overlaps so a 5:00-5:15pm errand doesn't blank a Saturday. */
export const MIN_EVENING_OVERLAP_MIN = 30;
export const MIN_DAYTIME_OVERLAP_MIN = 60;

export const AVAILABILITY_STATES = ['available', 'maybe', 'unavailable'];

export const STATE_META = {
  available: { label: 'Available', shortLabel: 'Free', color: '#22c55e', icon: 'fa-check' },
  maybe: { label: 'Potential Conflict', shortLabel: 'Maybe', color: '#f59e0b', icon: 'fa-triangle-exclamation' },
  unavailable: { label: 'Unavailable', shortLabel: 'Busy', color: '#ef4444', icon: 'fa-xmark' },
  unknown: { label: 'Not synced', shortLabel: '?', color: '#666', icon: 'fa-question' },
};

// Higher rank wins when multiple busy intervals land on the same day, and
// when rolling several members' states up into one "worst" summary.
const STATE_RANK = { unknown: 0, available: 1, maybe: 2, unavailable: 3 };

// --- Date helpers ---------------------------------------------------------
// House convention (src/utils.js) stores dates as bare 'YYYY-MM-DD' strings
// and parses them as LOCAL midnight, never UTC, to dodge the day-shift bug.

/**
 * Normalize any date string this app might hand back — canonical 'YYYY-MM-DD'
 * or legacy 'M/D/YYYY' from pre-migration show docs (see
 * scripts/migrate-to-firestore.js) — into a canonical dateKey. Returns null
 * for anything unparseable. Every Map keyed by dateKey (showsByDate,
 * quotesByDate, ...) must run its source date through this, or a legacy-
 * format doc silently vanishes from the calendar instead of erroring.
 */
export function normalizeDateKey(dateStr) {
  const d = parseLocalDateOnly(dateStr);
  if (!d || isNaN(d.getTime())) return null;
  return toDateKey(d);
}

/** Local 'YYYY-MM-DD' for a Date. Never toISOString() — that's UTC. */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
export function monthOf(dateKey) {
  return dateKey ? dateKey.slice(0, 7) : '';
}

/** 'YYYY-MM' + n -> 'YYYY-MM', n may be negative. */
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** True if a <= b for two 'YYYY-MM' strings (plain string compare works). */
export function monthLte(a, b) {
  return a <= b;
}

/** Inclusive iterator over every 'YYYY-MM-DD' from start to end.
 * Uses setDate(+1), not `+86400000`, so it stays correct across DST. */
export function* eachDateKey(startKey, endKey) {
  const start = parseLocalDateOnly(startKey);
  const end = parseLocalDateOnly(endKey);
  if (!start || !end) return;
  const cur = new Date(start);
  while (cur <= end) {
    yield toDateKey(cur);
    cur.setDate(cur.getDate() + 1);
  }
}

/** 42 cells (6 weeks, Sun-first) covering 'YYYY-MM', each with the Date,
 * dateKey, and whether it falls inside the target month. */
export function monthGridDays(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const days = [];
  const cur = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    days.push({
      date: new Date(cur),
      dateKey: toDateKey(cur),
      inMonth: cur.getMonth() === m - 1,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// --- Effective state resolution ------------------------------------------

/**
 * Resolve the state a member is showing on a given day, given their
 * availability/{memberId}__{month} doc (or undefined if none exists yet).
 *
 * Key PRESENCE decides precedence, not truthiness — `manual` may legitimately
 * hold 'available' when a member overrides a synced conflict, so `?? ` chains
 * would be wrong here.
 *
 * @param {{manual?: Record<string,string>, synced?: Record<string,string>, syncedAt?: string} | null | undefined} doc
 * @param {string} dateKey 'YYYY-MM-DD'
 * @returns {'available'|'maybe'|'unavailable'|'unknown'}
 */
export function effectiveState(doc, dateKey) {
  if (doc?.manual && dateKey in doc.manual) return doc.manual[dateKey];
  if (doc?.synced && dateKey in doc.synced) return doc.synced[dateKey];
  if (doc?.syncedAt) return 'available'; // month was covered by a sync; absent = free
  return 'unknown';
}

/**
 * Roll several members' states for one day into a summary.
 *
 * @param {Array<{id:string}>} members
 * @param {Map<string, object>} docsByMember  memberId -> availability doc for that month
 * @param {string} dateKey
 */
export function rollUpDay(members, docsByMember, dateKey) {
  const states = new Map();
  const counts = { available: 0, maybe: 0, unavailable: 0, unknown: 0 };
  let worst = 'available';
  for (const member of members) {
    const state = effectiveState(docsByMember.get(member.id), dateKey);
    states.set(member.id, state);
    counts[state] = (counts[state] || 0) + 1;
    if (STATE_RANK[state] > STATE_RANK[worst]) worst = state;
  }
  return { states, counts, worst };
}

// --- Busy (Google free/busy) -> day-state conversion ----------------------

function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return end > start ? (end - start) / 60000 : 0;
}

function localMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function atHour(dayStart, hour) {
  const d = new Date(dayStart);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function maxState(a, b) {
  if (!a) return b;
  if (!b) return a;
  return STATE_RANK[b] > STATE_RANK[a] ? b : a;
}

/**
 * Convert Google Calendar free/busy intervals into a sparse map of day-states.
 * Only non-'available' days appear in the result, keeping month docs small.
 *
 * Handles: intervals spanning midnight (each covered day is scored
 * independently, half-open at the midnight boundary so an event ending
 * exactly at 00:00 contributes nothing to the next day), all-day/multi-day
 * events (fall out naturally — Google returns them as local midnight to
 * midnight, so every covered day gets full evening overlap -> unavailable),
 * and DST (day boundaries use setDate(+1), overlap math uses real ms).
 *
 * @param {Array<{start:string, end:string}>} busy  RFC3339 pairs from freeBusy
 * @param {{window?: {startHour:number,endHour:number}, minEveningMin?: number, minDaytimeMin?: number}} [opts]
 * @returns {Record<string, 'maybe'|'unavailable'>}
 */
export function busyToDayStates(busy, opts = {}) {
  const window = opts.window || GIG_WINDOW;
  const minEvening = opts.minEveningMin ?? MIN_EVENING_OVERLAP_MIN;
  const minDaytime = opts.minDaytimeMin ?? MIN_DAYTIME_OVERLAP_MIN;
  const out = {};

  for (const interval of busy || []) {
    const s = new Date(interval.start);
    const e = new Date(interval.end);
    if (!(e > s) || isNaN(s) || isNaN(e)) continue;

    let cursor = localMidnight(s);
    while (cursor < e) {
      const dayStart = cursor;
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayOverlap = overlapMinutes(s, e, dayStart, dayEnd);
      if (dayOverlap > 0) {
        const gigStart = atHour(dayStart, window.startHour);
        const gigEnd = window.endHour >= 24 ? dayEnd : atHour(dayStart, window.endHour);
        const eveningOverlap = overlapMinutes(s, e, gigStart, gigEnd);

        let state = null;
        if (eveningOverlap >= minEvening) state = 'unavailable';
        else if (dayOverlap >= minDaytime) state = 'maybe';

        if (state) {
          const key = toDateKey(dayStart);
          out[key] = maxState(out[key], state);
        }
      }
      cursor = dayEnd;
    }
  }

  return out;
}

/** Split a sparse { dateKey: state } map by month, for per-month writes. */
export function splitByMonth(dayStates) {
  const byMonth = new Map();
  for (const [key, state] of Object.entries(dayStates)) {
    const month = monthOf(key);
    if (!byMonth.has(month)) byMonth.set(month, {});
    byMonth.get(month)[key] = state;
  }
  return byMonth;
}

/** Inclusive array of 'YYYY-MM' strings from startMonth to endMonth. */
export function monthsBetween(startMonth, endMonth) {
  const out = [];
  let m = startMonth;
  let guard = 0;
  while (m <= endMonth && guard++ < 1000) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}
