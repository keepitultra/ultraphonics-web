/**
 * One-off migration: normalise show startTime / endTime to "H:MM AM/PM" format.
 *
 * Handles:
 *   "20:00"  → "8:00 PM"
 *   "20"     → "8:00 PM"
 *   "8PM"    → "8:00 PM"
 *   "6:30pm" → "6:30 PM"
 *   "8 PM"   → "8:00 PM"   (already correct, kept as-is after round-trip)
 *
 * Run: node scripts/normalize-show-times.mjs [--dry-run]
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

function parseAndFormat(str) {
  if (!str) return null;
  const s = str.trim();

  // "H:MM AM/PM" or "H AM/PM" — may have space or not
  const ampmMatch = s.match(/^(\d{1,2})(?::(\d{2}))?(?:\s*)(am|pm)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const pm = ampmMatch[3].toLowerCase() === 'pm';
    // Normalise edge cases
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  // "HH:MM" or "H:MM" 24-hour (no AM/PM)
  const hmMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    let h = parseInt(hmMatch[1], 10);
    const m = parseInt(hmMatch[2], 10);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  // Bare hour e.g. "20" or "8"
  const bareMatch = s.match(/^(\d{1,2})$/);
  if (bareMatch) {
    let h = parseInt(bareMatch[1], 10);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:00 ${suffix}`;
  }

  return null; // unrecognised — leave untouched
}

async function run() {
  console.log(DRY_RUN ? '--- DRY RUN ---' : '--- LIVE RUN ---');
  const snap = await db.collection('shows').get();
  let fixed = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const updates = {};

    for (const field of ['startTime', 'endTime']) {
      const raw = data[field];
      if (!raw) continue;
      const normalised = parseAndFormat(raw);
      if (normalised && normalised !== raw) {
        updates[field] = normalised;
        console.log(`  ${docSnap.id}  ${field}: "${raw}" → "${normalised}"`);
      }
    }

    if (Object.keys(updates).length > 0) {
      fixed++;
      if (!DRY_RUN) await docSnap.ref.update(updates);
    }
  }

  console.log(DRY_RUN
    ? `\nDry run: ${fixed} show(s) would be updated.`
    : `\nDone: ${fixed} show(s) updated.`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
