// Shared setlist helpers.
//
// A "set" is not a first-class Firestore entity — it's a pseudo-song row whose
// title matches /^Set\s*\d/i, dragged in from the song library like any other
// row. Everything here derives set structure from that convention, so the
// storage format never had to change.

/** Fallback when a song has no duration recorded (roughly the library median). */
export const DEFAULT_SONG_SECONDS = 225;

export function isSetMarker(song) {
  if (!song) return false;
  const title = typeof song === 'string' ? song : (song.title || song.lastKnownName || song.name || '');
  return /^Set\s*\d/i.test(title);
}

/** Strip legacy bracket annotations e.g. "Set 1 [teal]" → "Set 1" */
export function cleanSetName(name) {
  return (name || '').replace(/\s*\[.*?\]/g, '').trim();
}

export function songTitle(song) {
  return song?.title || song?.lastKnownName || song?.name || '';
}

/** 225 → "3:45". Negative/NaN collapse to "0:00". */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 4335 → "1h 12m", 2700 → "45m". For set/total summaries. */
export function formatLongDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** "3:45" | "225" | "3:45.5" → 225. Returns null when unparseable. */
export function parseDurationInput(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const m = raw.match(/^(\d+):([0-5]?\d)(?:\.\d+)?$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Duration of one setlist row, in seconds. Set markers take no time; songs
 * with no recorded duration fall back to the library median so a set estimate
 * degrades gracefully instead of reading as zero.
 */
export function songSeconds(songDoc) {
  if (!songDoc) return DEFAULT_SONG_SECONDS;
  if (isSetMarker(songDoc)) return 0;
  const d = Number(songDoc.duration);
  return Number.isFinite(d) && d > 0 ? d : DEFAULT_SONG_SECONDS;
}

/** Map of songId → song doc, for O(1) joins inside render loops. */
export function indexSongs(songs) {
  const map = new Map();
  for (const s of songs || []) map.set(s.id, s);
  return map;
}

/**
 * Break a flat setlist row array into its sets.
 *
 * Rows appearing before the first marker land in a leading unnamed section so
 * their duration is never silently dropped. Returns per-set counts and
 * estimated durations plus the totals.
 *
 * @returns {{ sets: Array<{name:string, count:number, seconds:number, start:number, end:number, estimated:boolean}>, totalSeconds:number, totalCount:number, hasMarkers:boolean, estimated:boolean }}
 */
export function buildSetBreakdown(setlistSongs, songsById) {
  const rows = setlistSongs || [];
  const lookup = songsById instanceof Map ? songsById : indexSongs(songsById);
  const sets = [];
  let current = null;
  let totalSeconds = 0, totalCount = 0, hasMarkers = false, estimated = false;

  const openSection = (name, start) => {
    current = { name, count: 0, seconds: 0, start, end: start, estimated: false };
    sets.push(current);
  };

  rows.forEach((row, idx) => {
    if (isSetMarker(row)) {
      hasMarkers = true;
      openSection(cleanSetName(songTitle(row)), idx);
      return;
    }
    if (!current) openSection('', idx);
    const doc = lookup.get(row.id);
    const secs = songSeconds(doc);
    if (!doc || !(Number(doc.duration) > 0) || doc.durationEstimated) {
      current.estimated = true;
      estimated = true;
    }
    current.count += 1;
    current.seconds += secs;
    current.end = idx;
    totalCount += 1;
    totalSeconds += secs;
  });

  return { sets, totalSeconds, totalCount, hasMarkers, estimated };
}

/** "Set 1 (8 · 32m) • Set 2 (9 · 36m)" — the footer summary line. */
export function summarizeSetlist(setlistSongs, songsById) {
  const { sets, totalSeconds, totalCount, hasMarkers } = buildSetBreakdown(setlistSongs, songsById);
  if (!totalCount) return '';
  if (!hasMarkers) {
    return `${totalCount} song${totalCount !== 1 ? 's' : ''} · ${formatLongDuration(totalSeconds)}`;
  }
  const parts = sets
    .filter(s => s.count > 0)
    .map(s => `${s.name || 'Intro'} (${s.count} · ${formatLongDuration(s.seconds)})`);
  return `${parts.join(' • ')} — ${formatLongDuration(totalSeconds)} total`;
}

/**
 * How many setlists each song appears in, computed live from every setlist doc
 * rather than stored on the song. No migration, no drift when setlists are
 * edited or deleted — the cost is one pass over data the page already loads.
 *
 * @returns {Map<string, number>} songId → setlist count
 */
export function buildPopularityMap(setlists) {
  const counts = new Map();
  for (const sl of setlists || []) {
    // A song listed twice in one setlist still only counts once for that setlist.
    const seen = new Set();
    for (const row of sl.songs || []) {
      if (!row?.id || isSetMarker(row) || seen.has(row.id)) continue;
      seen.add(row.id);
      counts.set(row.id, (counts.get(row.id) || 0) + 1);
    }
  }
  return counts;
}
