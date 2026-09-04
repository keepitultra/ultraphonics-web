import { useEffect, useState, useMemo } from 'react';
import { buildMemberIndex } from '../utils/members.js';
import { useAuth } from './AuthContext.jsx';
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
  subscribeToMemberProfiles,
  subscribeToPublishedProfiles,
  isUserAdmin,
  subscribeToQuotes,
  subscribeToAvailabilityRange,
  subscribeToAvailabilityMonth,
  subscribeToBandEvents,
  subscribeToGalleryPhotos,
  subscribeToFeaturedGalleryPhotos,
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
  const { data: profiles = [] } = useSubscription(subscribeToMemberProfiles);

  return useMemo(() => {
    const authByUid = new Map(authUsers.map(u => [u.uid, u]));
    const profilesById = new Map(profiles.map(p => [p.id, p]));
    return { ...buildMemberIndex(members, authByUid, profilesById), loading, authUsers };
  }, [members, authUsers, profiles, loading]);
}

/** All member profiles, published or not (admin only). */
export function useMemberProfileDocs() {
  return useSubscription(subscribeToMemberProfiles);
}

/** Published member profiles, joined to their roster entry. Public-safe. */
export function usePublishedProfiles() {
  const { data: profiles = [], loading } = useSubscription(subscribeToPublishedProfiles);
  const members = useMembers();
  return useMemo(() => {
    const joined = profiles
      .map(p => ({ ...p, member: members.byId.get(p.id) }))
      // A profile whose member was deleted or deactivated should stop showing.
      .filter(p => p.member && p.member.active !== false)
      .sort((a, b) => (a.member.sortOrder ?? 999) - (b.member.sortOrder ?? 999));
    return { profiles: joined, loading: loading || members.loading };
  }, [profiles, members, loading]);
}

/**
 * Whether the signed-in user may manage the whole band.
 *
 * Fails closed: until the check resolves, and on any error, `isAdmin` is false,
 * so the UI never briefly offers admin controls to a member.
 */
export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) { setIsAdmin(false); setLoading(false); return; }
    setLoading(true);
    isUserAdmin(user.uid)
      .then(v => { if (!cancelled) { setIsAdmin(v); setLoading(false); } })
      .catch(() => { if (!cancelled) { setIsAdmin(false); setLoading(false); } });
    return () => { cancelled = true; };
  }, [user?.uid]);

  return { isAdmin, loading };
}

/**
 * Real-time quote leads, newest first (admin only).
 *
 * Never call from a public page — the quotes rule denies anonymous reads, so an
 * anonymous mount produces a permission error rather than an empty list.
 */
export function useQuotes() {
  return useSubscription(subscribeToQuotes);
}

/**
 * Real-time availability docs (all members) whose month falls in
 * [startMonth, endMonth] inclusive ('YYYY-MM' strings).
 *
 * Pass stable, monotonically-widening bounds — a new subscription is opened
 * on every change, so re-narrowing the range on scroll-back would thrash.
 * Filter by member client-side; a memberId + month query needs a composite
 * index this repo doesn't ship (see firestore-service.js).
 */
export function useAvailability(startMonth, endMonth) {
  return useSubscription(
    (cb, onError) => subscribeToAvailabilityRange(startMonth, endMonth, cb, onError),
    [startMonth, endMonth],
  );
}

/**
 * Real-time availability docs (all members) for a single month.
 * Use this, not useAvailability(), when only one date matters (e.g. a
 * quote's event date) — pulling a year of docs to answer one date is wasteful.
 */
export function useAvailabilityMonth(month) {
  return useSubscription(
    (cb, onError) => subscribeToAvailabilityMonth(month, cb, onError),
    [month],
  );
}

/**
 * Real-time band events (rehearsals, holds, deadlines, blackouts).
 * Whole-collection, not range-queried — see subscribeToBandEvents for why.
 */
export function useBandEvents() {
  return useSubscription(subscribeToBandEvents);
}

/**
 * Every gallery photo, newest first (admin only — reads the whole collection,
 * which the security rule only permits for an allowlisted user).
 */
export function useGalleryPhotos() {
  const { data, loading, error } = useSubscription(subscribeToGalleryPhotos);
  const photos = useMemo(
    () => [...data].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [data],
  );
  return { photos, loading, error };
}

/**
 * Photos curated for the public website, ordered for display. Public-safe —
 * the underlying query is filtered to featuredForWebsite == true, which is
 * the only slice of this collection an anonymous visitor may read.
 */
export function useFeaturedGalleryPhotos() {
  const { data, loading, error } = useSubscription(subscribeToFeaturedGalleryPhotos);
  const photos = useMemo(
    () => [...data].sort((a, b) =>
      (a.featuredOrder ?? 999) - (b.featuredOrder ?? 999)
      || (b.createdAt || '').localeCompare(a.createdAt || '')),
    [data],
  );
  return { photos, loading, error };
}
