// Firestore Data Service for Ultraphonics
// Replaces GitHub API for data operations

import { db } from './firebase-config.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  addDoc,
  deleteField
} from 'firebase/firestore';

// Collection names
const COLLECTIONS = {
  SHOWS: 'shows',
  SONGS: 'songs',
  CLIENTS: 'clients',
  SETLISTS: 'setlists',
  QUOTES: 'quotes',
  SONG_REQUESTS: 'songRequests',
  SETTINGS: 'settings',
  MEMBERS: 'members',
  MEMBER_PROFILES: 'memberProfiles'
};

// Site-wide settings live in a single document so the public pages need exactly
// one read to know what's switched on.
const SETTINGS_DOC = 'global';

// ============= SHOWS =============

/**
 * Get all shows
 * @returns {Promise<Array>}
 */
export async function getShows() {
  const snapshot = await getDocs(collection(db, COLLECTIONS.SHOWS));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get a single show by ID
 * @param {string} showId
 * @returns {Promise<Object|null>}
 */
export async function getShow(showId) {
  const docRef = doc(db, COLLECTIONS.SHOWS, showId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Get shows with real-time updates
 * @param {Function} callback - Called with array of shows on each update
 * @returns {Function} Unsubscribe function
 */
export function subscribeToShows(callback) {
  return onSnapshot(collection(db, COLLECTIONS.SHOWS), (snapshot) => {
    const shows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(shows);
  });
}

/**
 * Get published shows only (for public site)
 * @returns {Promise<Array>}
 */
export async function getPublishedShows() {
  const q = query(
    collection(db, COLLECTIONS.SHOWS),
    where('published', '==', true)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to published shows with real-time updates
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function subscribeToPublishedShows(callback) {
  const q = query(
    collection(db, COLLECTIONS.SHOWS),
    where('published', '==', true)
  );
  return onSnapshot(q, (snapshot) => {
    const shows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(shows);
  });
}

/**
 * Save a show (create or update)
 * @param {Object} show
 * @returns {Promise<void>}
 */
export async function saveShow(show) {
  const docRef = doc(db, COLLECTIONS.SHOWS, show.id);
  await setDoc(docRef, {
    ...show,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete a show
 * @param {string} showId
 * @returns {Promise<void>}
 */
export async function deleteShow(showId) {
  const docRef = doc(db, COLLECTIONS.SHOWS, showId);
  await deleteDoc(docRef);
}

/**
 * Save multiple shows in a batch
 * @param {Array} shows
 * @returns {Promise<void>}
 */
export async function saveShowsBatch(shows) {
  const batch = writeBatch(db);
  for (const show of shows) {
    const docRef = doc(db, COLLECTIONS.SHOWS, show.id);
    batch.set(docRef, {
      ...show,
      updatedAt: new Date().toISOString()
    });
  }
  await batch.commit();
}

// ============= SONGS =============

/**
 * Get all songs
 * @returns {Promise<Array>}
 */
export async function getSongs() {
  const snapshot = await getDocs(collection(db, COLLECTIONS.SONGS));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to songs with real-time updates
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSongs(callback) {
  return onSnapshot(collection(db, COLLECTIONS.SONGS), (snapshot) => {
    const songs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(songs);
  });
}

/**
 * Save a song.
 *
 * Merges rather than replaces. The edit form only carries the fields it puts on
 * screen, so a whole-document overwrite silently discarded everything else —
 * most damagingly the AbleSet sync keys (ablesetId/ablesetName/ablesetTime/
 * ablesetSkipped) that compareSongLists() matches on, and the `active` archive
 * flag, which would resurrect an archived song on any edit.
 *
 * Because merge leaves absent keys untouched, removing a field needs to be
 * explicit: pass `null` for any field the caller wants deleted.
 *
 * @param {Object} song - Fields to write. `null` deletes that field.
 * @returns {Promise<void>}
 */
export async function saveSong(song) {
  const songId = song.id || song.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const docRef = doc(db, COLLECTIONS.SONGS, songId);
  const payload = {};
  for (const [key, value] of Object.entries(song)) {
    if (value === undefined) continue;
    payload[key] = value === null ? deleteField() : value;
  }
  payload.id = songId;
  payload.updatedAt = new Date().toISOString();
  await setDoc(docRef, payload, { merge: true });
}

/**
 * Get a single song by ID
 * @param {string} songId
 * @returns {Promise<Object|null>}
 */
export async function getSong(songId) {
  const docRef = doc(db, COLLECTIONS.SONGS, songId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Update a song (partial update)
 * @param {string} songId
 * @param {Object} data
 * @returns {Promise<void>}
 */
export async function updateSong(songId, data) {
  const docRef = doc(db, COLLECTIONS.SONGS, songId);
  await updateDoc(docRef, { ...data, updatedAt: new Date().toISOString() });
}

/**
 * Delete a song
 * @param {string} songId
 * @returns {Promise<void>}
 */
export async function deleteSong(songId) {
  const docRef = doc(db, COLLECTIONS.SONGS, songId);
  await deleteDoc(docRef);
}

/**
 * Sync songs from Ableset import — atomic batch write
 * @param {Array} creates - Full song documents to create
 * @param {Array} updates - { id, data } objects to merge-update
 * @param {Array} archives - Song IDs to set active: false
 * @returns {Promise<number>} Total operations executed
 */
export async function syncSongsBatch(creates, updates, archives) {
  const now = new Date().toISOString();
  const ops = [];
  for (const song of creates) {
    // Auto-generate doc ID for new songs (ablesetId is stored as a field, not as doc ID)
    const autoRef = doc(collection(db, COLLECTIONS.SONGS));
    ops.push({ ref: autoRef, data: { ...song, active: true, updatedAt: now }, merge: false });
  }
  for (const update of updates) {
    const docRef = doc(db, COLLECTIONS.SONGS, update.id);
    ops.push({ ref: docRef, data: { ...update.data, updatedAt: now }, merge: true });
  }
  for (const id of archives) {
    const docRef = doc(db, COLLECTIONS.SONGS, id);
    ops.push({ ref: docRef, data: { active: false, updatedAt: now }, merge: true });
  }
  const BATCH_SIZE = 500;
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.merge) {
        batch.set(op.ref, op.data, { merge: true });
      } else {
        batch.set(op.ref, op.data);
      }
    }
    await batch.commit();
  }
  return ops.length;
}

// ============= CLIENTS =============

/**
 * Get all clients
 * @returns {Promise<Array>}
 */
export async function getClients() {
  const snapshot = await getDocs(collection(db, COLLECTIONS.CLIENTS));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to clients with real-time updates
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function subscribeToClients(callback, onError) {
  return onSnapshot(collection(db, COLLECTIONS.CLIENTS), (snapshot) => {
    const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(clients);
  }, onError);
}

/**
 * Save a client (create or update with merge)
 * @param {Object} client
 * @returns {Promise<void>}
 */
export async function saveClient(client) {
  const now = new Date().toISOString();
  const docRef = doc(db, COLLECTIONS.CLIENTS, client.id);
  // Strip undefined values — Firestore rejects them
  const cleaned = Object.fromEntries(
    Object.entries({ ...client, updatedAt: now, createdAt: client.createdAt || now })
      .filter(([, v]) => v !== undefined)
  );
  await setDoc(docRef, cleaned);
}

/**
 * Get a single client by ID
 * @param {string} clientId
 * @returns {Promise<Object|null>}
 */
export async function getClientDetails(clientId) {
  const docRef = doc(db, COLLECTIONS.CLIENTS, clientId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Get all shows for a specific client
 * @param {string} clientId
 * @returns {Promise<Array>}
 */
export async function getClientShows(clientId) {
  const q = query(
    collection(db, COLLECTIONS.SHOWS),
    where('clientId', '==', clientId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Add an activity log to a client's sub-collection and update lastInteraction
 * @param {string} clientId
 * @param {Object} logData - { type, content, author, authorId, relatedShowId? }
 * @returns {Promise<string>} The new log document ID
 */
export async function addActivityLog(clientId, logData) {
  const now = new Date().toISOString();
  const logId = logData.id || crypto.randomUUID();
  const logRef = doc(db, COLLECTIONS.CLIENTS, clientId, 'activityLogs', logId);
  await setDoc(logRef, {
    id: logId,
    ...logData,
    timestamp: now
  });

  // Update parent client's lastInteraction
  const clientRef = doc(db, COLLECTIONS.CLIENTS, clientId);
  await updateDoc(clientRef, { lastInteraction: now, updatedAt: now });

  return logId;
}

/**
 * Get activity logs for a client with real-time updates
 * @param {string} clientId
 * @param {Function} callback - Called with array of logs on each update
 * @returns {Function} Unsubscribe function
 */
export function subscribeToActivityLogs(clientId, callback, onError) {
  const logsRef = collection(db, COLLECTIONS.CLIENTS, clientId, 'activityLogs');
  const q = query(logsRef, orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(logs);
  }, onError);
}

/**
 * Delete a client (warns if shows are attached)
 * @param {string} clientId
 * @returns {Promise<{deleted: boolean, reason?: string}>}
 */
export async function deleteClient(clientId) {
  // Check for attached shows
  const shows = await getClientShows(clientId);
  if (shows.length > 0) {
    return {
      deleted: false,
      reason: `Cannot delete: ${shows.length} show(s) are linked to this client. Remove or reassign them first.`
    };
  }
  const docRef = doc(db, COLLECTIONS.CLIENTS, clientId);
  await deleteDoc(docRef);
  return { deleted: true };
}

// ============= SETLISTS =============

/**
 * Get all setlists
 * @returns {Promise<Array>}
 */
export async function getSetlists() {
  const snapshot = await getDocs(collection(db, COLLECTIONS.SETLISTS));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get a single setlist by name
 * @param {string} setlistName
 * @returns {Promise<Object|null>}
 */
export async function getSetlist(setlistName) {
  const docRef = doc(db, COLLECTIONS.SETLISTS, setlistName);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Subscribe to setlists with real-time updates
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSetlists(callback) {
  return onSnapshot(collection(db, COLLECTIONS.SETLISTS), (snapshot) => {
    const setlists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(setlists);
  });
}

/**
 * Save a setlist
 * @param {string} id - Document ID (GUID or legacy name)
 * @param {string} name - Display name
 * @param {Array} songs - Array of song objects
 * @param {Object} options - { vocalAssignments, segues }
 * @returns {Promise<void>}
 */
export async function saveSetlist(id, name, songs, options = {}) {
  const docRef = doc(db, COLLECTIONS.SETLISTS, id);
  await setDoc(docRef, {
    name,
    songs,
    // Must use the same marker rule as the UI (src/utils/setlistUtils.js), or
    // "set 1" / "Set1" gets counted as a song here but not on screen.
    songCount: songs.filter(s => !/^Set\s*\d/i.test(s.title || s.lastKnownName || '')).length,
    vocalAssignments: options.vocalAssignments || {},
    segues: options.segues || {},
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete a setlist, and clear the link from any show that pointed at it.
 *
 * Without this a deleted setlist leaves shows holding a reference to a document
 * that no longer exists: the show's Setlist card silently disappears, and if a
 * new setlist is later saved under the same slug the stale show re-adopts it.
 *
 * The unlink and the delete share one batch, so a show can never be left
 * pointing at a setlist that has already gone.
 *
 * Uses '' rather than a missing field to match how the Show editor clears the
 * link (setField('setlistId', '')), so both paths produce identical documents.
 *
 * @param {string} id - Document ID
 * @returns {Promise<number>} how many shows were unlinked
 */
export async function deleteSetlist(id) {
  const linked = await getDocs(
    query(collection(db, COLLECTIONS.SHOWS), where('setlistId', '==', id)),
  );

  const batch = writeBatch(db);
  const now = new Date().toISOString();
  for (const showDoc of linked.docs) {
    batch.update(showDoc.ref, { setlistId: '', updatedAt: now });
  }
  batch.delete(doc(db, COLLECTIONS.SETLISTS, id));
  await batch.commit();

  return linked.size;
}

/**
 * Create a new setlist by copying the songs/segues of an existing one.
 * Vocal assignments are reset — a template's assignments were computed for
 * a different show's personnel and shouldn't carry over.
 * @param {string} newId - Document ID for the new setlist
 * @param {string} newName - Display name for the new setlist
 * @param {string} sourceId - Document ID of the setlist to copy from
 * @returns {Promise<string>} the new setlist's id
 */
export async function duplicateSetlist(newId, newName, sourceId) {
  const source = await getSetlist(sourceId);
  if (!source) throw new Error('Template setlist not found');
  await saveSetlist(newId, newName, source.songs || [], {
    vocalAssignments: {},
    segues: source.segues || {},
  });
  return newId;
}

// ============= BAND MEMBERS =============
// Note: `members` is the band roster (names, colours, roles). It is distinct
// from `allowedUsers`, which is the auth allowlist read by subscribeToMembers()
// below — a member may have no login, and a login may not be a band member.

/**
 * Subscribe to the band roster.
 * @param {Function} callback
 * @param {Function} [onError]
 * @returns {Function} Unsubscribe function
 */
export function subscribeToBandMembers(callback, onError) {
  return onSnapshot(
    collection(db, COLLECTIONS.MEMBERS),
    snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { if (onError) onError(err); },
  );
}

/**
 * Create or update a band member. Merges, so callers only send what changed.
 * @param {string} memberId - stable slug
 * @param {Object} data
 */
export async function saveBandMember(memberId, data) {
  const docRef = doc(db, COLLECTIONS.MEMBERS, memberId);
  await setDoc(docRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Delete a band member. Callers should prefer setting active:false — existing
 * shows and setlists still reference this id and will render it as unknown.
 * @param {string} memberId
 */
export async function deleteBandMember(memberId) {
  await deleteDoc(doc(db, COLLECTIONS.MEMBERS, memberId));
}

// ============= ADMINS =============

/**
 * Whether this uid is a band admin (may manage every member, not just their
 * own). Backed by the `admins` collection, which no client can write — see
 * firestore.rules and scripts/seed-admins.mjs.
 */
export async function isUserAdmin(uid) {
  if (!uid) return false;
  try {
    const snapshot = await getDoc(doc(db, 'admins', uid));
    return snapshot.exists();
  } catch {
    // Treat an unreadable admins doc as "not an admin" — fail closed.
    return false;
  }
}

// ============= MEMBER PROFILES =============
// Public-facing profile pages. Kept apart from `members` so an unpublished
// draft is genuinely unreadable rather than merely hidden by the UI.

/**
 * Subscribe to every profile (admin — reads published and unpublished alike).
 */
export function subscribeToMemberProfiles(callback, onError) {
  return onSnapshot(
    collection(db, COLLECTIONS.MEMBER_PROFILES),
    snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { if (onError) onError(err); },
  );
}

/**
 * Published profiles only. The published filter is required, not an
 * optimisation: the security rule only permits an anonymous read of documents
 * where published == true, so an unfiltered query would be rejected outright.
 */
export function subscribeToPublishedProfiles(callback, onError) {
  return onSnapshot(
    query(collection(db, COLLECTIONS.MEMBER_PROFILES), where('published', '==', true)),
    snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { if (onError) onError(err); },
  );
}

/** One profile by member id. Returns null when missing or unpublished. */
export async function getMemberProfile(memberId) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.MEMBER_PROFILES, memberId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Create or update a profile. Merges, so callers send only what changed. */
export async function saveMemberProfile(memberId, data) {
  await setDoc(
    doc(db, COLLECTIONS.MEMBER_PROFILES, memberId),
    { ...data, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

// ============= SETTINGS =============

/**
 * Subscribe to site-wide settings.
 *
 * Callers should treat a missing document as "everything enabled" — the doc is
 * created lazily on first toggle, so its absence must not switch public
 * features off.
 *
 * @param {Function} callback - receives the settings object (or {} if unset)
 * @param {Function} [onError]
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSettings(callback, onError) {
  const docRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
  return onSnapshot(
    docRef,
    snapshot => callback(snapshot.exists() ? snapshot.data() : {}),
    err => { if (onError) onError(err); },
  );
}

/**
 * Read site-wide settings once.
 * @returns {Promise<Object>} the settings object, or {} if never written
 */
export async function getSettings() {
  const docRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
  const snapshot = await getDoc(docRef);
  return snapshot.exists() ? snapshot.data() : {};
}

/**
 * Merge a partial update into site-wide settings, creating the doc if needed.
 * @param {Object} patch
 * @returns {Promise<void>}
 */
export async function updateSettings(patch) {
  const docRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC);
  await setDoc(docRef, { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

// ============= QUOTES =============

/**
 * Get all quotes
 * @returns {Promise<Array>}
 */
export async function getQuotes() {
  const snapshot = await getDocs(collection(db, COLLECTIONS.QUOTES));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get a single quote by ID
 * @param {string} quoteId
 * @returns {Promise<Object|null>}
 */
export async function getQuote(quoteId) {
  const docRef = doc(db, COLLECTIONS.QUOTES, quoteId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Save a quote
 * @param {Object} quote
 * @returns {Promise<void>}
 */
export async function saveQuote(quote) {
  const docRef = doc(db, COLLECTIONS.QUOTES, quote.id);
  await setDoc(docRef, {
    ...quote,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Subscribe to all allowedUsers member profiles with real-time updates.
 * Each doc contains { firstName, displayName, photoURL, email }
 */
export function subscribeToMembers(callback, onError) {
  return onSnapshot(
    collection(db, 'allowedUsers'),
    (snapshot) => {
      const members = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
      callback(members);
    },
    onError
  );
}

// ============= SONG REQUESTS =============

export async function getWebsiteSongs() {
  const q = query(
    collection(db, COLLECTIONS.SONGS),
    where('showOnWebsite', '==', true)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveSongRequest(title) {
  return await addDoc(collection(db, COLLECTIONS.SONG_REQUESTS), {
    title,
    submittedAt: new Date().toISOString(),
    source: 'web',
    dismissed: false
  });
}

export function subscribeToSongRequests(callback) {
  const q = query(
    collection(db, COLLECTIONS.SONG_REQUESTS),
    orderBy('submittedAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function dismissSongRequest(id) {
  await updateDoc(doc(db, COLLECTIONS.SONG_REQUESTS, id), {
    dismissed: true,
    dismissedAt: new Date().toISOString()
  });
}

export { db, COLLECTIONS };
