import { useEffect, useState } from 'react';
import {
  getPublishedShows,
  subscribeToPublishedShows,
  getShows,
  subscribeToShows,
  getSongs,
  subscribeToSongs,
  getClients,
  subscribeToClients,
  getSetlists,
  subscribeToSetlists,
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
