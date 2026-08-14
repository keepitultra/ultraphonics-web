/**
 * One-off migration: seed songs/{id}.vocalCapability + preferredVocalist from the
 * singer capability table (Tom/Shelley/Kelsey/David booleans + Preferred column).
 *
 * Matches rows to existing songs by a normalised title (lowercase, punctuation
 * stripped, whitespace collapsed) — same normalisation the in-app "Import
 * Vocalist Capability Table" tool (SongManager.jsx) uses. Rows that don't
 * resolve to exactly one song are reported, never guessed.
 *
 * Run: node scripts/import-vocal-capability.mjs [--dry-run]
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');

const LEAD_VOCALISTS = ['Tom', 'Shelley', 'Kelsey', 'David'];

const TABLE = `Song Name\tTom\tShelley\tKelsey\tDavid\tPreferred
24K Magic\tFALSE\tTRUE\tTRUE\tTRUE\tDavid
Aeroplane\tTRUE\tFALSE\tFALSE\tTRUE\tTom
Ain't It Fun\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
All the small things\tTRUE\tFALSE\tFALSE\tFALSE\tDavid
Any Man Of Mine\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Attention\tFALSE\tTRUE\tFALSE\tTRUE\tDavid
Before He Cheats\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Beer Never Broke My Heart\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Brown Eyed Lover\tTRUE\tFALSE\tFALSE\tFALSE\tDavid
Country Girl\tFALSE\tFALSE\tFALSE\tTRUE\tDavid
Dancing in the moonlight\tTRUE\tTRUE\tFALSE\tFALSE\tTom
December 1963\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
Don't Start Now\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Don't Stop Believing\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Drive\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Espresso\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Flowers\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Higher\tTRUE\tFALSE\tTRUE\tTRUE\tDavid
Hit Me With You Best Shot\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
I Had Some Help\tTRUE\tTRUE\tFALSE\tTRUE\tDavid
I Want It That Way\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
I Wanna Dance With Somebody\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Interstate Love Song\tTRUE\tFALSE\tFALSE\tFALSE\tTom
Isn't She Lovely\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
Juice\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Lose Control\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
Lose Yourself\tFALSE\tFALSE\tFALSE\tTRUE\tDavid
Man! I Feel Like A Woman\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Mary Jane's Last Dance\tTRUE\tFALSE\tFALSE\tFALSE\tTom
Mash_About Damn Time/ Superstition\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
MmmBop\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Mr. Brightside\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
My Own Worst Enemy\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Need A Favor\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Neon Moon\tTRUE\tTRUE\tTRUE\tTRUE\tDavid
Pink Pony Club\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Pony\tFALSE\tFALSE\tFALSE\tTRUE\tDavid
Redneck Woman\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Semi-Charmed Life\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Sex On Fire\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
Shut Up And Dance With Me\tFALSE\tTRUE\tTRUE\tTRUE\tDavid
Something To Talk About\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Sparks Fly\tTRUE\tTRUE\tFALSE\tFALSE\tShelley
Sugar We're Goin Down\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Sweetness\tTRUE\tFALSE\tFALSE\tFALSE\tTom
Tennessee Whiskey\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
The Way You Make Me Feel\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Tipsy\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Toxic\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Treasure\tFALSE\tTRUE\tFALSE\tTRUE\tDavid
Uptown Funk\tFALSE\tTRUE\tTRUE\tTRUE\tDavid
Valerie\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Wagon Wheel\tFALSE\tFALSE\tFALSE\tTRUE\tDavid
Watermelon Sugar\tTRUE\tFALSE\tTRUE\tTRUE\tDavid
What's Up?\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Wish I Knew You\tTRUE\tFALSE\tFALSE\tTRUE\tDavid`;

function normalizeTitle(str) {
  return (str || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function truthy(cell) {
  return ['y', 'yes', 'true', 'x', '1'].includes((cell || '').trim().toLowerCase());
}

function parseVocalTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = lines.slice(1); // skip header
  return rows.map(line => {
    const cells = line.split('\t');
    const [title, tom, shelley, kelsey, david, preferred] = cells;
    return {
      title: (title || '').trim(),
      capability: { Tom: truthy(tom), Shelley: truthy(shelley), Kelsey: truthy(kelsey), David: truthy(david) },
      preferred: LEAD_VOCALISTS.find(v => v.toLowerCase() === (preferred || '').trim().toLowerCase()) || '',
    };
  }).filter(r => r.title);
}

async function run() {
  console.log(DRY_RUN ? '--- DRY RUN ---' : '--- LIVE RUN ---');

  const rows = parseVocalTable(TABLE);
  console.log(`Parsed ${rows.length} row(s) from the table.\n`);

  const snap = await db.collection('songs').get();
  const dbSongs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const byTitle = new Map();
  for (const s of dbSongs) {
    const t = normalizeTitle(s.title || s.name || '');
    if (!t) continue;
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(s);
  }

  const matched = [], unmatched = [], ambiguous = [];
  for (const row of rows) {
    const candidates = byTitle.get(normalizeTitle(row.title)) || [];
    if (candidates.length === 1) matched.push({ row, song: candidates[0] });
    else if (candidates.length === 0) unmatched.push(row);
    else ambiguous.push({ row, candidates });
  }

  console.log(`Matched: ${matched.length}  Unmatched: ${unmatched.length}  Ambiguous: ${ambiguous.length}\n`);

  if (unmatched.length > 0) {
    console.log('--- UNMATCHED (no song with this title found) ---');
    for (const row of unmatched) console.log(`  "${row.title}"`);
    console.log('');
  }

  if (ambiguous.length > 0) {
    console.log('--- AMBIGUOUS (multiple songs share this normalised title) ---');
    for (const { row, candidates } of ambiguous) {
      console.log(`  "${row.title}" ->`);
      for (const c of candidates) console.log(`      ${c.id}  "${c.title || c.name}"`);
    }
    console.log('');
  }

  console.log('--- MATCHED ---');
  for (const { row, song } of matched) {
    const caps = LEAD_VOCALISTS.filter(v => row.capability[v]).join(', ') || 'none';
    console.log(`  ${song.id}  "${song.title || song.name}"  capable=[${caps}]  preferred=${row.preferred || '—'}`);
  }

  if (!DRY_RUN) {
    console.log('\nWriting...');
    const batch = db.batch();
    for (const { row, song } of matched) {
      const ref = db.collection('songs').doc(song.id);
      const data = { vocalCapability: row.capability, updatedAt: new Date().toISOString() };
      if (row.preferred) data.preferredVocalist = row.preferred;
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
    console.log(`Done: ${matched.length} song(s) updated.`);
  } else {
    console.log(`\nDry run: ${matched.length} song(s) would be updated. Re-run without --dry-run to write.`);
  }

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
