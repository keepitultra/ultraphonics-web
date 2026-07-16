import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, setConsent, initAnalytics } from '../analytics.js';
import { config } from '../config.js';

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(() => getConsent() === null);

  if (!visible) return null;

  function handleAccept() {
    setConsent('granted');
    initAnalytics(config);
    setVisible(false);
  }

  function handleDecline() {
    setConsent('denied');
    setVisible(false);
  }

  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <p className="cookie-banner-text">
        We use cookies for site analytics to understand how visitors use this site.{' '}
        <Link to="/privacy">Learn more</Link>.
      </p>
      <div className="cookie-banner-actions">
        <button type="button" className="button-outline" onClick={handleDecline}>
          Decline
        </button>
        <button type="button" className="button" onClick={handleAccept}>
          Accept
        </button>
      </div>
    </div>
  );
}
