// Band member identity.
//
// Members are referenced across shows, setlists and songs by a stable slug id
// ("tom", "sean-duffy"). Historically they were referenced by display name
// ("Tom") or, for guests, by a formatted string ("Sean Duffy (Vocals)").
//
// Everything here resolves ALL THREE forms, so the app behaves identically
// before and after scripts/migrate-members-to-ids.mjs runs. That is what makes
// the migration safe to run, and safe to roll back.

import { PERSONNEL, PERSONNEL_COLORS, LEAD_VOCALISTS, GUEST_COLOR } from '../constants/band.js';
import { safeUrl } from './profileThemes.js';

export { GUEST_COLOR };

export const MEMBER_ROLES = ['Vocals', 'Guitar', 'Bass', 'Drums', 'Keyboards', 'Other'];

/** "Sean Duffy (Vocals)" → "sean-duffy" */
export function slugifyMember(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Strip a trailing instrument hint: "Sean Duffy (Vocals)" → "Sean Duffy" */
export function stripInstrument(raw) {
  return String(raw || '').replace(/\(.*?\)/g, '').trim();
}

/**
 * Roster used when the members collection is empty or unreadable, so the admin
 * never renders a blank, colourless UI while the collection is being set up.
 */
export const FALLBACK_MEMBERS = PERSONNEL.map((name, i) => ({
  id: slugifyMember(name),
  name,
  fullName: '',
  color: PERSONNEL_COLORS[name] || GUEST_COLOR,
  roles: LEAD_VOCALISTS.includes(name) ? ['Vocals'] : [],
  canSingLead: LEAD_VOCALISTS.includes(name),
  type: 'member',
  active: true,
  sortOrder: (i + 1) * 10,
  googleUid: null,
}));

/** A stand-in for a reference we can't resolve, so rendering degrades quietly. */
function unknownMember(key) {
  const name = stripInstrument(key) || String(key);
  return {
    id: String(key),
    name,
    fullName: '',
    color: GUEST_COLOR,
    roles: [],
    canSingLead: false,
    type: 'guest',
    active: true,
    sortOrder: 9999,
    googleUid: null,
    unknown: true,
  };
}

/**
 * Build the lookup used everywhere member references are read or written.
 *
 * @param {Array} members - docs from the `members` collection
 * @param {Map<string,Object>} [authByUid] - allowedUsers docs, for photo/email
 * @param {Map<string,Object>} [profilesById] - memberProfiles docs, for avatars
 */
export function buildMemberIndex(members, authByUid = new Map(), profilesById = new Map()) {
  const source = (members && members.length) ? members : FALLBACK_MEMBERS;

  const all = source
    .map(m => {
      const auth = m.googleUid ? authByUid.get(m.googleUid) : null;
      const profile = profilesById.get(m.id);
      // The picture a member chose for their profile page wins over whatever
      // Google happens to have; the Google photo is only a fallback.
      const avatarUrl = safeUrl(profile?.photoUrl) || auth?.photoURL || '';
      return {
        ...m,
        roles: m.roles || [],
        photoURL: auth?.photoURL || '',
        avatarUrl,
        email: auth?.email || '',
        // Linked means a Google account is both chosen AND still authorised.
        linked: !!(m.googleUid && auth),
        orphanedLink: !!(m.googleUid && !auth),
      };
    })
    .sort((a, b) =>
      (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
      String(a.name).localeCompare(String(b.name)));

  const byId = new Map(all.map(m => [m.id, m]));

  // Legacy keys: display name, full name, and the raw "Name (Instrument)" form.
  const byLegacy = new Map();
  for (const m of all) {
    if (m.name) byLegacy.set(String(m.name).toLowerCase(), m);
    if (m.fullName) byLegacy.set(String(m.fullName).toLowerCase(), m);
  }

  /** Resolve an id, a display name, or a "Name (Instrument)" string. */
  function resolve(key) {
    if (!key) return null;
    const raw = String(key);
    return byId.get(raw)
      || byLegacy.get(raw.toLowerCase())
      || byLegacy.get(stripInstrument(raw).toLowerCase())
      || byId.get(slugifyMember(raw))
      || null;
  }

  /** Like resolve(), but always returns something renderable. */
  function get(key) {
    return resolve(key) || unknownMember(key);
  }

  /** Canonical id to persist for a reference given in any form. */
  function idOf(key) {
    return resolve(key)?.id ?? slugifyMember(key) ?? String(key);
  }

  const active = all.filter(m => m.active !== false);

  return {
    all,
    active,
    byId,
    resolve,
    get,
    idOf,
    nameOf: key => get(key).name,
    colorOf: key => get(key).color,
    /** Members eligible to be assigned lead vocals. */
    leadVocalists: active.filter(m => m.canSingLead),
    bandMembers: active.filter(m => m.type !== 'guest'),
    guests: active.filter(m => m.type === 'guest'),
  };
}

/**
 * Whether a member can sing lead on a song.
 *
 * `songs.vocalCapability` is keyed by member reference, which is a display name
 * before the id migration and a member id after it. Checking both means every
 * caller works in either state without knowing which one it's in.
 *
 * @param {Object} songDoc
 * @param {string} memberId
 * @param {ReturnType<typeof buildMemberIndex>} index
 */
export function hasCapability(songDoc, memberId, index) {
  const cap = songDoc?.vocalCapability;
  if (!cap) return false;
  if (memberId in cap) return !!cap[memberId];
  const name = index?.byId?.get(memberId)?.name;
  if (name && name in cap) return !!cap[name];
  return false;
}

/** The song's preferred vocalist as a member id, whatever form it's stored in. */
export function preferredVocalistId(songDoc, index) {
  const raw = songDoc?.preferredVocalist;
  return raw ? index.idOf(raw) : '';
}

/** Lead vocalists marked capable of singing a song, in roster order. */
export function capableVocalists(songDoc, index) {
  return index.leadVocalists.filter(m => hasCapability(songDoc, m.id, index));
}
