/**
 * Migration: Slugify show document IDs in Firestore
 *
 * Generates slug IDs from "venue-date" (e.g. "bier-stube-2025-08-15"),
 * creates the new document, then deletes the old UUID doc.
 * Shows that already have a slug-style ID are skipped.
 *
 * Requires: scripts/service-account.json (Firebase Console → Project Settings → Service accounts)
 *
 * Dry-run:  node scripts/slugify-show-ids.mjs --dry-run
 * Apply:    node scripts/slugify-show-ids.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serviceAccount = require('./service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function makeUniqueSlug(base, existingIds) {
  const slug = slugify(base);
  if (!existingIds.has(slug)) return slug;
  let n = 2;
  while (existingIds.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

async function run() {
  console.log(DRY_RUN ? '--- DRY RUN ---' : '--- LIVE RUN ---');

  const snap = await db.collection('shows').get();
  const shows = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  console.log(`Fetched ${shows.length} shows`);

  const existingIds = new Set(shows.map(s => s.id));
  const toMigrate = shows.filter(s => UUID_RE.test(s.id));
  console.log(`${shows.length - toMigrate.length} already slug-style, ${toMigrate.length} to migrate\n`);

  if (toMigrate.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  for (const show of toMigrate) {
    existingIds.delete(show.id);
    const base = [show.venue, show.date].filter(Boolean).join(' ');
    const newId = makeUniqueSlug(base || 'show', existingIds);
    existingIds.add(newId);

    console.log(`  ${show.id}  →  ${newId}  (${show.venue || '—'}, ${show.date || '—'})`);

    if (!DRY_RUN) {
      await db.collection('shows').doc(newId).set({ ...show, id: newId });
      await db.collection('shows').doc(show.id).delete();
    }
  }

  console.log(DRY_RUN
    ? `\nDry run complete — no changes written.`
    : `\nMigrated ${toMigrate.length} shows.`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
