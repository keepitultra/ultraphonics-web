/**
 * Rewrites every member reference from a display name to a stable member id.
 *
 *   shows.personnel[]           "Tom"                  -> "tom"
 *   shows.eventHandler          "Tom"                  -> "tom"
 *   setlists.vocalAssignments   { songId: "Shelley" }  -> { songId: "shelley" }
 *   songs.vocalCapability KEYS  { "David": true }      -> { "david": true }
 *   songs.preferredVocalist     "David"                -> "david"
 *
 * IMPORTANT — deploy first. The app resolves ids AND legacy names (see
 * src/utils/members.js), but only from the build that includes useMembers().
 * An older deployed build reads names directly and will render raw slugs with
 * no colours. Deploy the current build and firestore.rules BEFORE running this.
 *
 * Idempotent: ids resolve to themselves, so re-running is a no-op.
 * Writes a full JSON backup of every affected document before touching anything.
 *
 * Run: node scripts/migrate-members-to-ids.mjs [--dry-run] [--out <dir>]
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
initializeApp({ credential: cert(require('./service-account.json')) });
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');
const outIdx = process.argv.indexOf('--out');
const OUT_DIR = outIdx > -1 ? process.argv[outIdx + 1] : `./member-migration-backup-${Date.now()}`;

function slugify(name) {
  return String(name || '').toLowerCase().replace(/\(.*?\)/g, '').trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const strip = raw => String(raw || '').replace(/\(.*?\)/g, '').trim();

/**
 * Same resolution order as buildMemberIndex() in src/utils/members.js:
 * exact id, then display/full name, then the slug of the raw string.
 */
function makeResolver(members) {
  const byId = new Map(members.map(m => [m.id, m]));
  const byName = new Map();
  for (const m of members) {
    if (m.name) byName.set(String(m.name).toLowerCase(), m.id);
    if (m.fullName) byName.set(String(m.fullName).toLowerCase(), m.id);
  }
  return function idOf(key) {
    if (!key) return { id: key, matched: false };
    const raw = String(key);
    if (byId.has(raw)) return { id: raw, matched: true, already: true };
    const byDisplay = byName.get(raw.toLowerCase()) || byName.get(strip(raw).toLowerCase());
    if (byDisplay) return { id: byDisplay, matched: true };
    const slug = slugify(raw);
    if (byId.has(slug)) return { id: slug, matched: true };
    return { id: slug || raw, matched: false };
  };
}

async function run() {
  const members = (await db.collection('members').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  if (!members.length) {
    console.error('No members found. Run scripts/seed-members.mjs first.');
    process.exit(1);
  }
  const idOf = makeResolver(members);
  console.log(`Roster: ${members.map(m => `${m.id}(${m.name})`).join(', ')}\n`);

  const unmatched = new Set();
  const backup = { shows: {}, setlists: {}, songs: {} };
  const writes = [];
  let refShows = 0, refSetlists = 0, refCapability = 0, refPreferred = 0, refHandler = 0;

  // ── shows ────────────────────────────────────────────────────────────
  for (const d of (await db.collection('shows').get()).docs) {
    const data = d.data();
    const patch = {};
    if (Array.isArray(data.personnel)) {
      const next = data.personnel.map(p => {
        const r = idOf(p);
        if (!r.matched) unmatched.add(p);
        if (!r.already) refShows++;
        return r.id;
      });
      if (JSON.stringify(next) !== JSON.stringify(data.personnel)) patch.personnel = next;
    }
    if (data.eventHandler) {
      const r = idOf(data.eventHandler);
      if (!r.matched) unmatched.add(data.eventHandler);
      if (r.id !== data.eventHandler) { patch.eventHandler = r.id; refHandler++; }
    }
    if (Object.keys(patch).length) {
      backup.shows[d.id] = { personnel: data.personnel ?? null, eventHandler: data.eventHandler ?? null };
      writes.push({ ref: d.ref, patch });
    }
  }

  // ── setlists ─────────────────────────────────────────────────────────
  for (const d of (await db.collection('setlists').get()).docs) {
    const data = d.data();
    const va = data.vocalAssignments || {};
    const next = {};
    let changed = false;
    for (const [songId, ref] of Object.entries(va)) {
      const r = idOf(ref);
      if (!r.matched) unmatched.add(ref);
      if (!r.already) refSetlists++;
      next[songId] = r.id;
      if (r.id !== ref) changed = true;
    }
    if (changed) {
      backup.setlists[d.id] = { vocalAssignments: va };
      writes.push({ ref: d.ref, patch: { vocalAssignments: next } });
    }
  }

  // ── songs ────────────────────────────────────────────────────────────
  for (const d of (await db.collection('songs').get()).docs) {
    const data = d.data();
    const patch = {};
    const cap = data.vocalCapability;
    if (cap && Object.keys(cap).length) {
      // Two passes so an existing id-keyed entry always wins over a legacy
      // name-keyed one, rather than depending on object key order.
      const next = {};
      for (const [key, value] of Object.entries(cap)) {
        const r = idOf(key);
        if (!r.matched) unmatched.add(key);
        if (!r.already) { refCapability++; next[r.id] = value; }
      }
      for (const [key, value] of Object.entries(cap)) {
        if (idOf(key).already) next[key] = value;
      }
      const before = Object.keys(cap).sort().join('|');
      const after = Object.keys(next).sort().join('|');
      if (before !== after) patch.vocalCapability = next;
    }
    if (data.preferredVocalist) {
      const r = idOf(data.preferredVocalist);
      if (!r.matched) unmatched.add(data.preferredVocalist);
      if (r.id !== data.preferredVocalist) { patch.preferredVocalist = r.id; refPreferred++; }
    }
    if (Object.keys(patch).length) {
      backup.songs[d.id] = {
        vocalCapability: data.vocalCapability ?? null,
        preferredVocalist: data.preferredVocalist ?? null,
      };
      writes.push({ ref: d.ref, patch });
    }
  }

  console.log('References to rewrite');
  console.log(`  shows.personnel         ${refShows}`);
  console.log(`  shows.eventHandler      ${refHandler}`);
  console.log(`  setlists.vocalAssign.   ${refSetlists}`);
  console.log(`  songs.vocalCapability   ${refCapability}  (object keys)`);
  console.log(`  songs.preferredVocalist ${refPreferred}`);
  console.log(`  ---------------------------------`);
  console.log(`  total                   ${refShows + refHandler + refSetlists + refCapability + refPreferred}`);
  console.log(`  documents to write      ${writes.length}\n`);

  if (unmatched.size) {
    console.log('UNMATCHED — no member has this name; a slug will be written instead.');
    console.log('Add these on the Members page first if they should be real members:');
    for (const u of unmatched) console.log(`  ${JSON.stringify(u)} -> ${slugify(u)}`);
    console.log('');
  }

  if (DRY_RUN) {
    console.log('Dry run — nothing written.');
    process.exit(0);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const backupPath = `${OUT_DIR}/before-migration.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup of original values written to ${backupPath}`);

  // update() replaces each named field outright. set(..., {merge:true}) would
  // deep-merge `vocalCapability`, leaving the old name keys alongside the new
  // id keys — the exact corruption this migration exists to remove.
  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + CHUNK)) batch.update(w.ref, w.patch);
    await batch.commit();
  }
  console.log(`Done: ${writes.length} document(s) migrated.`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
