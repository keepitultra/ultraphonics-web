/**
 * Seeds the allowedUsers Firestore collection.
 * Each document ID is a Firebase Auth UID; content is an empty object.
 *
 * This script temporarily opens the allowedUsers write rule, seeds the docs,
 * then relocks the rule — all in one run.
 *
 * Run with: node scripts/seed-allowed-users.js
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch } from 'firebase/firestore';

const RULES_PATH = new URL('../firestore.rules', import.meta.url).pathname;

const ALLOWED_UIDS = [
  'RLPzHKAyrCawih9kYu7DFjBvZZJ2',
  'RnIfDhxXKWQi0It5lysnzwI6eX22',
  'K24pXZ54rkg6LYrGfbZyph1uVgh1',
  '2yskiBxV7xePvmRudevfD4dsuv73',
  '1a1GmbCFhWUI8lb25glJ9pjZwy72',
  '2qsEFHB1BbUwcZOLRngCURNu9FM2',
  'z5MWuNYwkDhrWH4hYYUCADBVrAk1',
  'Ty04DDEf3sbaGgnAqSVi6xO7NjV2',
];

const firebaseConfig = {
  apiKey: "AIzaSyCqMRpeWfpj3Sv2SSd3nT5GkwK7NC3Ir7s",
  authDomain: "ultraphonics-web.firebaseapp.com",
  projectId: "ultraphonics-web",
  storageBucket: "ultraphonics-web.firebasestorage.app",
  messagingSenderId: "729950319293",
  appId: "1:729950319293:web:b75843574cc5bcec813dd4",
};

const LOCKED_RULE = 'allow write: if false;';
const OPEN_RULE   = 'allow write: if true;';

function patchRules(from, to) {
  const content = readFileSync(RULES_PATH, 'utf8');
  if (!content.includes(from)) throw new Error(`Rule pattern not found: ${from}`);
  writeFileSync(RULES_PATH, content.replace(from, to));
}

function deployRules() {
  console.log('Deploying rules...');
  execSync('firebase deploy --only firestore:rules', { stdio: 'inherit' });
}

// 1. Open the write rule and deploy
console.log('Opening allowedUsers write rule...');
patchRules(LOCKED_RULE, OPEN_RULE);
deployRules();

try {
  // 2. Seed via client SDK (no auth needed when rule is `if true`)
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const batch = writeBatch(db);
  for (const uid of ALLOWED_UIDS) {
    batch.set(doc(db, 'allowedUsers', uid), {});
  }
  console.log(`\nWriting ${ALLOWED_UIDS.length} allowed users...`);
  await batch.commit();
  console.log('Seed complete.');
} finally {
  // 3. Always relock, even if seed fails
  console.log('\nRelocking allowedUsers write rule...');
  patchRules(OPEN_RULE, LOCKED_RULE);
  deployRules();
  console.log('\nDone. allowedUsers is locked.');
}

process.exit(0);
