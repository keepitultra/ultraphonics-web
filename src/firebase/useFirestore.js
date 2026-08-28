import { useEffect, useState, useMemo } from 'react';
import { buildMemberIndex } from '../utils/members.js';
import {
  getPublishedShows,
  subscribeToPublishedShows,
  getShows,
  subscribeToShows,
  getShow,
  getSongs,
  subscribeToSongs,
  getClients,
  subscribeToClients,
  getSetlists,
  subscribeToSetlists,
  getSetlist,
  subscribeToMembers,
  subscribeToSettings,
  subscribeToBandMembers,
} from '../firestore-service.js';

// ── Generic real-time subscription hook ─────────────────────
function useSubscription(subscribeFn, deps = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    let unsubscribe;
    try {
      unsubscribe = subscribeFn(
        (items) => { setData(items); setLoading(false); },
        (err)   => { setError(err);  setLoading(false); }
      );
    } catch (err) {
      setError(err);
      setLoading(false);
    }
    return () => unsubscribe?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

// ── Public-facing hooks ──────────────────────────────────────

/** Real-time published shows (home page, events) */
export function usePublishedShows() {
  return useSubscription(subscribeToPublishedShows);
}

/** Fetch a single show by ID (public event page) */
export function useShow(showId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!showId) return;
    setLoading(true);
    getShow(showId)
      .then((show) => { setData(show); setLoading(false); })
      .catch((err) => { setError(err); setLoading(false); });
  }, [showId]);

  return { data, loading, error };
}

/** Fetch a single setlist by ID (public setlist share page — never subscribes to the full collection) */
export function useSetlist(setlistId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!setlistId) { setLoading(false); return; }
    setLoading(true);
    getSetlist(setlistId)
      .then((setlist) => { setData(setlist); setLoading(false); })
      .catch((err) => { setError(err); setLoading(false); });
  }, [setlistId]);

  return { data, loading, error };
}

// ── Admin hooks ──────────────────────────────────────────────

/** Real-time all shows (admin) */
export function useShows() {
  return useSubscription(subscribeToShows);
}

/** Real-time songs (admin) */
export function useSongs() {
  return useSubscription(subscribeToSongs);
}

/** Real-time clients (admin) */
export function useClients() {
  return useSubscription(subscribeToClients);
}

/** Real-time setlists (admin) */
export function useSetlists() {
  return useSubscription(subscribeToSetlists);
}

/**
 * Real-time member profiles from allowedUsers collection.
 * Returns a map of { [firstName]: { photoURL, displayName, uid } }
 * so components can look up a member's photo by their first name.
 */
export function useMemberProfiles() {
  const { data: members } = useSubscription(subscribeToMembers);
  const map = {};
  for (const m of members) {
    const key = m.firstName || m.displayName?.split(' ')[0] || '';
    if (key) map[key] = { photoURL: m.photoURL || '', displayName: m.displayName || key, uid: m.uid };
  }
  return map;
}

/**
 * Real-time site settings, with the flags the public pages care about resolved.
 *
 * Fails OPEN: while loading, if the settings doc has never been written, or if
 * the read errors, `songRequestsEnabled` is true. Requests being switched off
 * is the rare, deliberate state — a transient failure must never be what takes
 * the public "Request a Song" flow down.
 *
 * `loaded` distinguishes "known enabled" from "not answered yet", so a page can
 * hold off rendering a closed-state message it might immediately retract.
 */
export function useSettings() {
  const [settings, setSettings] = useState(/** @type {Object|null} */ (null));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToSettings(
      data => { setSettings(data); setLoaded(true); },
      () => { setSettings({}); setLoaded(true); },
    );
    return unsubscribe;
  }, []);

  return {
    settings: settings || {},
    loaded,
    songRequestsEnabled: settings?.songRequestsEnabled !== false,
  };
}

/**
 * The band roster.
 *
 * Public-safe: reads only the `members` collection, which is world-readable.
 * Deliberately does NOT touch `allowedUsers` — anonymous visitors can never
 * read that, and the shared setlist link renders for anonymous visitors.
 *
 * Returns the index from buildMemberIndex(), so callers can resolve a member by
 * id, display name, or legacy "Name (Instrument)" string — see
 * src/utils/members.js for why all three must keep working.
 */
export function useMembers() {
  const { data: members = [], loading } = useSubscription(subscribeToBandMembers);
  return useMemo(
    () => ({ ...buildMemberIndex(members), loading }),
    [members, loading],
  );
}

/**
 * The band roster joined to Google account profiles (photo, email, link state).
 *
 * Admin-only — reading the whole `allowedUsers` collection requires an
 * allowlisted account. Use useMembers() anywhere a signed-out visitor can land.
 */
export function useMembersWithAccounts() {
  const { data: members = [], loading } = useSubscription(subscribeToBandMembers);
  const { data: authUsers = [] } = useSubscription(subscribeToMembers);

  return useMemo(() => {
    const authByUid = new Map(authUsers.map(u => [u.uid, u]));
    return { ...buildMemberIndex(members, authByUid), loading, authUsers };
  }, [members, authUsers, loading]);
}
