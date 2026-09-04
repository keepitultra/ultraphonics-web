import { useState, useEffect } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Tracks a CSS breakpoint via matchMedia — same 767px cutoff as the
 * .admin-drawer mobile-overlay rule in assets/css/styles.css. Admin pages
 * whose mobile layout replaces the sidebar-drawer pattern entirely (list is
 * the primary view, detail/edit opens as a fullscreen overlay) need this
 * split in JS rather than pure CSS, since which elements exist in the DOM
 * differs between the two layouts, not just how they're positioned.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}
