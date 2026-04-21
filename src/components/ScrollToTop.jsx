import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    // Retry until the element exists and has settled into position.
    // Needed because sections below async-loaded data shift as content loads.
    const id = hash.slice(1);
    let attempts = 0;
    let lastTop = -1;
    let stableCount = 0;

    function tryScroll() {
      const el = document.getElementById(id);
      if (!el) {
        if (attempts++ < 15) setTimeout(tryScroll, 100);
        return;
      }
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (top === lastTop) {
        stableCount++;
      } else {
        stableCount = 0;
        lastTop = top;
      }
      // Scroll once position has been stable for 2 consecutive checks
      if (stableCount >= 2) {
        window.scrollTo({ top: top - 80, behavior: 'smooth' });
      } else if (attempts++ < 20) {
        setTimeout(tryScroll, 100);
      }
    }

    tryScroll();
  }, [pathname, hash]);

  return null;
}
