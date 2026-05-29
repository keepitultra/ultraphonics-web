import { useEffect, useState } from 'react';
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
  subscribeToMembers,
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
