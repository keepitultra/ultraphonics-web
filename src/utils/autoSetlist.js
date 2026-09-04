// Automatic setlist generation.
//
// Given who's singing, how many sets, and how long each set should run, this
// builds a balanced setlist: songs of the same genre sit together, the same
// singer never takes two songs back to back if anyone else can cover, each set
// lands close to its target duration, and songs the band actually plays a lot
// get favoured over ones that never make the cut.
//
// Deliberately deterministic for a given `seed` so "Regenerate" is a re-roll
// the user controls rather than hidden nondeterminism.

import { GENRE_ORDER, genreLabel } from './genre.js';
import { isSetMarker, songSeconds, songTitle } from './setlistUtils.js';
import { hasCapability, preferredVocalistId } from './members.js';

/** Small deterministic PRNG so a seed reproduces a setlist exactly. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hasVocalData(doc) {
  const cap = doc.vocalCapability;
  return !!doc.preferredVocalist || (!!cap && Object.keys(cap).length > 0);
}

/**
 * @param {Object} opts
 * @param {Array}  opts.songs            All song docs from the library
 * @param {string[]} opts.singers        Selected singers (band members and/or guest names)
 * @param {number} opts.numSets
 * @param {number} opts.setMinutes       Target length of each set
 * @param {Object} opts.genrePrefs       { [genre]: 'preferred' | 'include' | 'exclude' }
 * @param {number} opts.popularityBias   0..1 — how hard to favour frequently-played songs
 * @param {Map<string,number>} opts.popularity  songId → number of setlists it appears in
 * @param {boolean} opts.includeUnknownVocals   Allow songs with no capability data
 * @param {Object} opts.members          Member index from buildMemberIndex()
 * @param {number} opts.seed
 * @returns {{ rows:Array, vocalAssignments:Object, sets:Array, warnings:string[], stats:Object }}
 */
export function generateSetlist({
  songs = [],
  singers = [],
  numSets = 3,
  setMinutes = 45,
  genrePrefs = {},
  popularityBias = 0.5,
  popularity = new Map(),
  includeUnknownVocals = false,
  members,
  seed = 1,
}) {
  const rng = mulberry32(seed);
  const warnings = [];

  if (!singers.length) {
    return { rows: [], vocalAssignments: {}, sets: [], warnings: ['Select at least one singer.'], stats: {} };
  }

  // A guest/sub has no per-song capability data, so they're treated as able to
  // cover anything — which is the point of booking one.
  const guests = singers.filter(id => members.get(id).type === 'guest');
  const leadIds = members.leadVocalists.map(m => m.id);

  // ── 1. Candidate pool ───────────────────────────────────────────────────
  let excludedGenre = 0, excludedNoSinger = 0, excludedNoData = 0;

  const pool = [];
  for (const doc of songs) {
    if (doc.active === false || isSetMarker(doc)) continue;

    const genre = genreLabel(doc);
    const pref = genrePrefs[genre] || 'include';
    if (pref === 'exclude') { excludedGenre++; continue; }

    // Band members need an explicit capability tick; a guest sub is assumed to
    // cover anything, which is the whole point of booking one.
    const capableBand = leadIds.filter(v => singers.includes(v) && hasCapability(doc, v, members));
    let capable = [...capableBand, ...guests];

    if (!capable.length) {
      if (!hasVocalData(doc)) {
        if (!includeUnknownVocals) { excludedNoData++; continue; }
        capable = [...singers];
      } else {
        excludedNoSinger++;
        continue;
      }
    }

    pool.push({
      doc,
      id: doc.id,
      title: songTitle(doc),
      genre,
      seconds: songSeconds(doc),
      capable,
      preferred: preferredVocalistId(doc, members),
      plays: popularity.get(doc.id) || 0,
    });
  }

  if (!pool.length) {
    warnings.push('No songs match these settings — try including more genres or singers.');
    return { rows: [], vocalAssignments: {}, sets: [], warnings, stats: { excludedGenre, excludedNoSinger, excludedNoData } };
  }

  // ── 2. Score ────────────────────────────────────────────────────────────
  // Preferred genres get a full point of head start; popularity can claw a
  // proven crowd-pleaser back above it; jitter keeps repeat runs from being
  // identical while never overpowering the two real signals.
  const maxPlays = Math.max(1, ...pool.map(s => s.plays));
  for (const s of pool) {
    const genreWeight = genrePrefs[s.genre] === 'preferred' ? 1 : 0;
    s.score = genreWeight + popularityBias * (s.plays / maxPlays) + rng() * 0.55;
  }
  pool.sort((a, b) => b.score - a.score);

  // ── 3. Select enough songs to fill every set ────────────────────────────
  const targetPerSet = setMinutes * 60;
  const targetTotal = numSets * targetPerSet;
  const selected = [];
  let acc = 0;
  for (const s of pool) {
    if (acc >= targetTotal) break;
    selected.push(s);
    acc += s.seconds;
  }
  if (acc < targetTotal) {
    warnings.push(
      `Only ${Math.round(acc / 60)} min of eligible material available — the sets will come up short of the ${numSets * setMinutes} min requested.`,
    );
  }

  // ── 4. Deal into sets, one genre at a time ──────────────────────────────
  // Processing genre-by-genre means each set receives its songs in contiguous
  // same-genre runs; always dealing into the currently-shortest set keeps the
  // set durations close together without a separate rebalancing pass.
  const genreRank = g => {
    const pref = genrePrefs[g] === 'preferred' ? 0 : 1;
    return pref * 100 + Math.max(0, GENRE_ORDER.indexOf(g));
  };
  const genres = [...new Set(selected.map(s => s.genre))].sort((a, b) => genreRank(a) - genreRank(b));

  const buckets = Array.from({ length: numSets }, () => ({ seconds: 0, songs: [] }));
  for (const g of genres) {
    for (const song of selected.filter(s => s.genre === g)) {
      const target = buckets.reduce((min, b) => (b.seconds < min.seconds ? b : min), buckets[0]);
      target.songs.push(song);
      target.seconds += song.seconds;
    }
  }

  // ── 5. Order within each set ────────────────────────────────────────────
  // Songs are already in same-genre runs. Lead with the preferred genre, and
  // when there's enough of it, bookend the set with it as well so the closer
  // lands as hard as the opener — the nearest thing to pacing we can infer
  // without energy data.
  for (const bucket of buckets) {
    const byGenre = new Map();
    for (const song of bucket.songs) {
      if (!byGenre.has(song.genre)) byGenre.set(song.genre, []);
      byGenre.get(song.genre).push(song);
    }
    const ordered = [...byGenre.keys()].sort((a, b) => genreRank(a) - genreRank(b));
    const lead = ordered[0];
    const leadSongs = byGenre.get(lead) || [];

    let closer = [];
    if (genrePrefs[lead] === 'preferred' && leadSongs.length >= 4 && ordered.length > 1) {
      closer = leadSongs.splice(Math.ceil(leadSongs.length / 2));
    }
    bucket.songs = [...ordered.flatMap(g => byGenre.get(g)), ...closer];
  }

  // ── 6. Assign singers, avoiding back-to-back repeats ────────────────────
  const vocalAssignments = {};
  const counts = Object.fromEntries(singers.map(s => [s, 0]));
  let unassigned = 0;

  for (const bucket of buckets) {
    // A set break is a real break — the spacing rule restarts with each set.
    let prev = null, prev2 = null;
    for (let i = 0; i < bucket.songs.length; i++) {
      const song = bucket.songs[i];
      // One-step lookahead: if the next song has exactly one possible singer,
      // don't hand this song to that same person — otherwise they're stranded
      // into singing both, which greedy assignment does constantly.
      const next = bucket.songs[i + 1];
      const nextSole = next && next.capable.length === 1 ? next.capable[0] : null;

      let best = null, bestPenalty = Infinity;
      for (const c of song.capable) {
        let p = (counts[c] || 0) * 10;          // spread the load
        if (c === prev) p += 1000;              // never twice in a row if avoidable
        if (c === nextSole) p += 400;           // don't strand the next song's only singer
        if (c === prev2) p += 60;               // and prefer a gap of two
        if (c === song.preferred) p -= 25;      // honour the song's preferred singer
        p += rng() * 4;                         // break ties differently each re-roll
        if (p < bestPenalty) { bestPenalty = p; best = c; }
      }
      if (!best) { unassigned++; continue; }
      vocalAssignments[song.id] = [best];
      counts[best] = (counts[best] || 0) + 1;
      prev2 = prev;
      prev = best;
      song.singer = best;
    }
  }

  // ── 7. Emit setlist rows ────────────────────────────────────────────────
  // Reuse the library's real "Set N" marker docs where they exist so the rows
  // behave exactly like hand-built ones; synthesise only what's missing.
  const markerDocs = new Map();
  for (const doc of songs) {
    if (!isSetMarker(doc)) continue;
    const n = (songTitle(doc).match(/^Set\s*(\d+)/i) || [])[1];
    if (n && !markerDocs.has(Number(n))) markerDocs.set(Number(n), doc);
  }

  const rows = [];
  const sets = [];
  buckets.forEach((bucket, i) => {
    const n = i + 1;
    const markerDoc = markerDocs.get(n);
    const name = markerDoc ? songTitle(markerDoc) : `Set ${n}`;
    rows.push({
      id: markerDoc ? markerDoc.id : `set-marker-${n}`,
      lastKnownName: name,
      title: name,
    });
    for (const song of bucket.songs) {
      rows.push({ id: song.id, lastKnownName: song.title, title: song.title });
    }
    sets.push({
      name: `Set ${n}`,
      count: bucket.songs.length,
      seconds: bucket.seconds,
      songs: bucket.songs,
    });
  });

  if (unassigned) {
    warnings.push(`${unassigned} song(s) ended up with no singer — look for the amber warning icon.`);
  }
  if (excludedNoData && !includeUnknownVocals) {
    warnings.push(`${excludedNoData} song(s) skipped: no vocal capability data yet.`);
  }
  if (excludedNoSinger) {
    warnings.push(`${excludedNoSinger} song(s) skipped: none of the selected singers can cover them.`);
  }

  return {
    rows,
    vocalAssignments,
    sets,
    warnings,
    stats: {
      poolSize: pool.length,
      selected: selected.length,
      excludedGenre,
      excludedNoSinger,
      excludedNoData,
      singerCounts: counts,
      totalSeconds: buckets.reduce((n, b) => n + b.seconds, 0),
    },
  };
}
