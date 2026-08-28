/**
 * One-off migration: seed songs/{id}.duration (seconds) for the whole library.
 *
 * Durations are best-guess *live arrangement* lengths — generally a little
 * shorter than the studio recording, since the band trims intros/outros.
 * They're written with durationEstimated:true so the Songs page can flag them
 * as guesses; editing a duration by hand clears that flag.
 *
 * AbleSet's `time` field is deliberately ignored — it's a timeline position,
 * not a song length (the one populated value in the library is ~2.9 hours).
 *
 * Songs already carrying a hand-entered duration (durationEstimated falsy) are
 * never overwritten. Set markers ("Set 1"…) are skipped.
 *
 * Run: node scripts/backfill-song-durations.mjs [--dry-run] [--force]
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// Fallback when a song isn't in the table below (roughly the library median).
const DEFAULT_SECONDS = 225;

// Keyed by normalised title — see normalizeTitle() — so the table survives
// songs being re-created with new doc ids by an AbleSet re-import.
const DURATIONS = {
  'watermelon sugar': 180, 'livin on a prayer': 245, 'wagon wheel': 260,
  'tennessee whiskey': 290, 'drive': 230, 'sweet caroline': 215,
  'too sweet': 240, '24k magic': 225, 'satisfaction': 220,
  'i want it that way': 210, 'sin wagon': 215, 'old time rock and roll': 195,
  'semi charmed life': 250, 'pink pony club': 250,
  'something to talk about': 220, 'espresso': 175, 'higher ground': 220,
  'wish i knew you': 245, 'lose control': 210, 'come together': 250,
  'levitating': 205, 'neon moon': 235, 'aeroplane': 265, 'flowers': 200,
  'losing my religion': 255, 'as good as i once was': 250,
  'hit me with you best shot': 175, "ain't it fun": 275,
  'i love rock and roll': 180, 'smooth': 275,
  'black horse and a cherry tree': 175, 'let me blow ya mind': 225,
  'i feel it coming': 250, 'brown eyed lover': 225, 'before he cheats': 205,
  'mmmbop': 230, 'higher': 280, 'the way you make me feel': 265,
  'superstition': 255, 'i had some help': 235, 'interstate love song': 195,
  'beer never broke my heart': 195, 'pony': 240, 'lose yourself': 290,
  'unholy': 165, "don't start now": 190,
  'you shook me all night long': 215, "boot scootin' boogie": 200,
  'redneck woman': 210, 'love shack': 285, "don't stop believing": 250,
  'mr brightside': 225, 'no diggity': 265, 'treasure': 185,
  'girls just want to have fun': 235, 'about damn time': 200,
  'any man of mine': 235, 'uptown funk': 260, 'sparks fly': 245,
  'chicken fried': 235, 'hey ya': 230, "mary jane's last dance": 260,
  'my own worst enemy': 170, 'man i feel like a woman': 225,
  'dancing in the moonlight': 190, 'attention': 210, 'wonderwall': 250,
  'friends in low places': 260, 'shut up and dance with me': 200,
  "sweet child o' mine": 320, '9 to 5': 175,
  'i wanna dance with somebody': 265, 'no woman no cry': 280,
  'summer of 69': 220, 'are you gonna be my girl': 210, 'shake it off': 215,
  "can't stop the feeling": 230, 'country girl': 220, "isn't she lovely": 260,
  'juice': 195, 'need a favor': 210, 'play that funky music': 265,
  "what's up": 270, "say it ain't so": 250, 'sweetness': 220,
  'rock & roll': 220, 'valerie': 215, 'dreams': 245, 'sex on fire': 205,
  'tipsy': 175, 'helena': 205, 'all the small things': 170,
  "ain't no sunshine": 165, "sugar we're goin down": 225, 'toxic': 200,
  'december 1963': 215, 'a thousand miles': 230, 'miss you': 265,
  // Mashups / medleys run long
  'mash_about damn time/ superstition': 300,
  'mash_about damn time/superstition': 300,
  'mash_classic rock medley': 360,
};

function normalizeTitle(t) {
  return (t || '')
    .toLowerCase()
    .replace(/[.,!?"”“’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSetMarker(title) {
  return /^Set\s*\d/i.test(title || '');
}

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function run() {
  const snap = await db.collection('songs').get();
  const songs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const writes = [], skippedManual = [], markers = [], guessed = [];

  for (const song of songs) {
    const title = song.title || song.name || '';
    if (isSetMarker(title)) { markers.push(title); continue; }
    if (song.duration && !song.durationEstimated && !FORCE) { skippedManual.push(song); continue; }

    const key = normalizeTitle(title);
    const known = DURATIONS[key];
    const seconds = known ?? DEFAULT_SECONDS;
    if (known === undefined) guessed.push(title);
    writes.push({ song, seconds });
  }

  console.log(`Songs: ${songs.length}  |  set markers skipped: ${markers.length}`);
  if (skippedManual.length) {
    console.log(`\n--- SKIPPED (hand-entered duration already set) ---`);
    for (const s of skippedManual) console.log(`  ${fmt(s.duration)}  "${s.title || s.name}"`);
  }
  if (guessed.length) {
    console.log(`\n--- NOT IN TABLE (using ${fmt(DEFAULT_SECONDS)} default) ---`);
    for (const t of guessed) console.log(`  "${t}"`);
  }

  console.log(`\n--- TO WRITE (${writes.length}) ---`);
  const total = writes.reduce((n, w) => n + w.seconds, 0);
  for (const { song, seconds } of writes) {
    console.log(`  ${fmt(seconds)}  "${song.title || song.name}"`);
  }
  console.log(`\nLibrary total: ${fmt(total)}  |  mean: ${fmt(Math.round(total / (writes.length || 1)))}`);

  if (DRY_RUN) {
    console.log(`\nDry run: ${writes.length} song(s) would be updated. Re-run without --dry-run to write.`);
    process.exit(0);
  }

  console.log('\nWriting...');
  const batch = db.batch();
  for (const { song, seconds } of writes) {
    batch.set(
      db.collection('songs').doc(song.id),
      { duration: seconds, durationEstimated: true, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`Done: ${writes.length} song(s) updated.`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
