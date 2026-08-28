/**
 * Clears shows whose `setlistId` points at a setlist that no longer exists.
 *
 * Going forward deleteSetlist() unlinks shows atomically, so this only exists
 * to repair references orphaned before that behaviour landed — and as a safety
 * net if a setlist is ever deleted straight from the Firebase console, which
 * bypasses the app entirely.
 *
 * Safe to re-run: it only touches shows whose target is genuinely missing.
 *
 * Run: node scripts/fix-dangling-setlist-ids.mjs [--dry-run]
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
initializeApp({ credential: cert(require('./service-account.json')) });
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  const setlistIds = new Set((await db.collection('setlists').get()).docs.map(d => d.id));
  const shows = (await db.collection('shows').get()).docs;

  const dangling = shows.filter(d => {
    const id = d.data().setlistId;
    return id && !setlistIds.has(id);
  });

  const linkedCount = shows.filter(d => d.data().setlistId).length;
  console.log(`shows=${shows.length}  withSetlistId=${linkedCount}  dangling=${dangling.length}\n`);

  if (!dangling.length) {
    console.log('Nothing to fix.');
    process.exit(0);
  }

  for (const d of dangling) {
    const s = d.data();
    console.log(`  ${d.id}`);
    console.log(`      ${[s.venue, s.date].filter(Boolean).join(' — ') || '(no venue/date)'}`);
    console.log(`      setlistId "${s.setlistId}" -> "" (setlist not found)`);
  }

  if (DRY_RUN) {
    console.log(`\nDry run: ${dangling.length} show(s) would be cleared.`);
    process.exit(0);
  }

  // Matches how the Show editor clears the link, so both paths agree.
  const batch = db.batch();
  const now = new Date().toISOString();
  for (const d of dangling) batch.update(d.ref, { setlistId: '', updatedAt: now });
  await batch.commit();
  console.log(`\nDone: ${dangling.length} show(s) cleared.`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
