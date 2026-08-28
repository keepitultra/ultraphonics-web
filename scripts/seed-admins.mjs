/**
 * Seeds the `admins` collection — the source of truth for who may manage the
 * whole band rather than just themselves.
 *
 * Deliberately Admin-SDK only: the security rules deny all client writes to
 * this collection, because allowedUsers is self-updatable and a role flag
 * stored there could be granted by a member to themselves.
 *
 * Run: node scripts/seed-admins.mjs [--dry-run]
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
initializeApp({ credential: cert(require('./service-account.json')) });
const db = getFirestore();
const DRY_RUN = process.argv.includes('--dry-run');

const ADMIN_EMAILS = [
  'thomasdhickman@gmail.com',
  'ultraphonicsmusic@gmail.com', // shared band account
];

async function run() {
  const users = (await db.collection('allowedUsers').get()).docs.map(d => ({ uid: d.id, ...d.data() }));
  const matched = users.filter(u => u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()));
  const missing = ADMIN_EMAILS.filter(e => !matched.some(u => u.email.toLowerCase() === e));

  for (const u of matched) console.log(`  admin: ${u.email}  ${u.uid}`);
  for (const e of missing) console.log(`  MISSING: no synced allowedUsers doc for ${e} — they must sign in once first`);

  if (DRY_RUN) { console.log(`\nDry run: ${matched.length} admin(s) would be written.`); process.exit(0); }

  const batch = db.batch();
  for (const u of matched) {
    batch.set(db.collection('admins').doc(u.uid), { email: u.email, updatedAt: new Date().toISOString() });
  }
  await batch.commit();
  console.log(`\nDone: ${matched.length} admin(s) written.`);
  process.exit(missing.length ? 1 : 0);
}
run().catch(err => { console.error(err); process.exit(1); });
