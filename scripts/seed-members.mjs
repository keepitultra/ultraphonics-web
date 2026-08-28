/**
 * Seeds the `members` collection from the hardcoded roster in
 * src/constants/band.js, plus any guest strings already present on shows.
 *
 * Member IDs are stable slugs ("tom", "sean-duffy") and are what every other
 * collection will reference after scripts/migrate-members-to-ids.mjs runs.
 * The display `name` is therefore free to change at any time without touching
 * historical data.
 *
 * Additive and idempotent: existing member docs are left alone unless --force.
 *
 * Run: node scripts/seed-members.mjs [--dry-run] [--force]
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
initializeApp({ credential: cert(require('./service-account.json')) });
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// Mirrors src/constants/band.js at the time of seeding.
const PERSONNEL = ['Anthony', 'Tom', 'Lester', 'David', 'Shelley', 'Kelsey'];
const PERSONNEL_COLORS = {
  Anthony: '#f59e0b', Tom: '#22c55e', Lester: '#a78bfa',
  David: '#e879f9', Shelley: '#fb923c', Kelsey: '#38bdf8',
};
const LEAD_VOCALISTS = ['Tom', 'Shelley', 'Kelsey', 'David'];
const GUEST_COLOR = '#78716c';

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, '')      // drop a trailing "(Guitar)" instrument hint
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Sean Duffy (Vocals)" -> { name: 'Sean Duffy', role: 'Vocals' } */
function parseGuest(raw) {
  const m = String(raw).match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m ? { name: m[1].trim(), role: m[2].trim() } : { name: String(raw).trim(), role: '' };
}

async function run() {
  const existing = new Map(
    (await db.collection('members').get()).docs.map(d => [d.id, d.data()]),
  );

  const docs = [];

  PERSONNEL.forEach((name, i) => {
    const canSingLead = LEAD_VOCALISTS.includes(name);
    docs.push({
      id: slugify(name),
      data: {
        name,
        fullName: '',
        color: PERSONNEL_COLORS[name] || GUEST_COLOR,
        // Roles are a guess only where the data actually tells us something:
        // lead-vocalist capability is real, instruments are not recorded
        // anywhere yet and are left for the Members page to fill in.
        roles: canSingLead ? ['Vocals'] : [],
        canSingLead,
        type: 'member',
        active: true,
        sortOrder: (i + 1) * 10,
        googleUid: null,
      },
    });
  });

  // Guests already referenced by shows, so migration has somewhere to map them.
  const shows = await db.collection('shows').get();
  const guestRaw = new Set();
  for (const s of shows.docs) {
    for (const p of s.data().personnel || []) {
      if (!PERSONNEL.includes(p)) guestRaw.add(p);
    }
  }

  let order = (PERSONNEL.length + 1) * 10;
  for (const raw of [...guestRaw].sort()) {
    const { name, role } = parseGuest(raw);
    docs.push({
      id: slugify(raw),
      data: {
        name,
        fullName: '',
        color: GUEST_COLOR,
        roles: role ? [role] : [],
        canSingLead: role.toLowerCase() === 'vocals',
        type: 'guest',
        active: true,
        sortOrder: order,
        googleUid: null,
      },
      from: raw,
    });
    order += 10;
  }

  console.log(`Found ${existing.size} existing member doc(s).\n`);
  const toWrite = [];
  for (const d of docs) {
    const already = existing.has(d.id);
    const action = already && !FORCE ? 'skip' : already ? 'overwrite' : 'create';
    if (action !== 'skip') toWrite.push(d);
    const label = d.from ? `${d.data.name}  (from ${JSON.stringify(d.from)})` : d.data.name;
    console.log(
      `  ${action.padEnd(9)} ${d.id.padEnd(12)} ${label.padEnd(34)} ` +
      `${d.data.type.padEnd(6)} lead=${d.data.canSingLead ? 'y' : 'n'} ${d.data.color}`,
    );
  }

  if (DRY_RUN) {
    console.log(`\nDry run: ${toWrite.length} doc(s) would be written.`);
    process.exit(0);
  }
  if (!toWrite.length) {
    console.log('\nNothing to write.');
    process.exit(0);
  }

  const batch = db.batch();
  for (const d of toWrite) {
    batch.set(db.collection('members').doc(d.id), {
      ...d.data,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
  await batch.commit();
  console.log(`\nDone: ${toWrite.length} member(s) written.`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
