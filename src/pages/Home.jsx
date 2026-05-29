import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePublishedShows } from '../firebase/useFirestore.js';
import { trackEvent } from '../analytics.js';
import { config } from '../config.js';
import Modal from '../components/Modal.jsx';
import ShowCard from '../components/ShowCard.jsx';
import {
  parseLocalDateOnly,
  parseTimeToHM,
  dateToIsoWithLocalTz,
  toIsoWithTz,
  firstUrl,
  formatCityState,
} from '../utils.js';

const { tipping } = config;
const SITE = 'https://www.ultraphonicsmusic.com/';

export default function Home() {
  const { data: shows, loading } = usePublishedShows();
  const [tipOpen, setTipOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [searchParams] = useSearchParams();

  // Auto-open request modal for campaign URLs
  useEffect(() => {
    if (searchParams.get('utm_campaign') === '2026_survey_post') {
      const t = setTimeout(() => {
        setRequestOpen(true);
        trackEvent('request_modal_auto_open', { source: 'campaign_url' });
      }, 500);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // UTM / QR tracking
  useEffect(() => {
    const source = searchParams.get('utm_source') || searchParams.get('src');
    const medium = searchParams.get('utm_medium');
    if (source === 'qr_code' || source === 'qr') {
      trackEvent('campaign_visit', { source: 'qr_code', medium: medium || 'offline' });
    } else if (source === 'email') {
      trackEvent('campaign_visit', { source: 'email', medium: medium || 'newsletter' });
    }
  }, [searchParams]);

  // Section intersection tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            trackEvent('section_view', { section_name: entry.target.id });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    ['shows', 'services'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Mobile video autoplay
  const desktopVideoRef = useRef(null);
  const mobileVideoRef = useRef(null);
  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    const video = isMobile ? mobileVideoRef.current : desktopVideoRef.current;
    if (!video) return;
    const play = () => {
      if (video.paused) {
        video.play().catch((e) => {
          document.addEventListener('touchstart', () => video.play().catch(() => {}), {
            once: true,
          });
        });
      }
    };
    play();
    if (isMobile) {
      video.load();
      setTimeout(play, 100);
      const onVisible = () => { if (!document.hidden && video.paused) play(); };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }
  }, []);

  // Inject JSON-LD structured data
  useEffect(() => {
    if (loading || !shows.length) return;
    const DEFAULT_IMAGE = SITE + 'assets/images/logo-color.png';
    const musicGroup = {
      '@id': SITE + '#musicgroup',
      '@type': 'MusicGroup',
      name: 'Ultraphonics',
      alternateName: 'Ultraphonics Music',
      url: SITE,
      image: DEFAULT_IMAGE,
      logo: DEFAULT_IMAGE,
      genre: ['Rock', 'Pop', 'Country', 'Soul'],
      description:
        'Ultraphonics is a high-energy variety band playing Rock, Pop, Country & Soul for weddings, events, and bars in Detroit, Ann Arbor, and Toledo.',
      sameAs: [
        'https://www.facebook.com/UltraphonicsMusic',
        'https://www.instagram.com/ultraphonicsmusic',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'info@ultraphonicsmusic.com',
        contactType: 'booking',
      },
    };

    const events = shows
      .filter((s) => s.published && !s.isPrivate && s.startTime)
      .map((s) => {
        const startDateIso = toIsoWithTz(s.date, s.startTime);
        if (!startDateIso) return null;
        let endDateIso;
        if (s.endTime) {
          const startBase = parseLocalDateOnly(s.date);
          const { hours: sh, minutes: sm } = parseTimeToHM(s.startTime);
          const { hours: eh, minutes: em } = parseTimeToHM(s.endTime);
          const endBase = new Date(startBase.getTime());
          endBase.setHours(eh, em, 0, 0);
          if (endBase <= new Date(startBase.getFullYear(), startBase.getMonth(), startBase.getDate(), sh, sm, 0, 0)) {
            endBase.setDate(endBase.getDate() + 1);
          }
          endDateIso = dateToIsoWithLocalTz(endBase);
        }
        const address = { '@type': 'PostalAddress', addressCountry: 'US' };
        if (s.streetAddress) address.streetAddress = s.streetAddress;
        if (s.city) address.addressLocality = s.city;
        if (s.state) address.addressRegion = s.state;
        if (s.postalCode) address.postalCode = s.postalCode;
        const location = { '@type': 'Place', name: s.venue?.trim() || 'Venue TBD', address };
        const cityState = formatCityState(s.city, s.state);
        const description =
          s.description ||
          (cityState
            ? `Live performance by Ultraphonics at ${s.venue || 'venue TBD'} in ${cityState}.`
            : `Live performance by Ultraphonics at ${s.venue || 'venue TBD'}.`);
        const offerUrl = firstUrl(s.ticketUrl, s.eventLink);
        const hasPrice = typeof s.price === 'number';
        const offers =
          offerUrl || hasPrice
            ? {
                '@type': 'Offer',
                url: offerUrl || SITE + '#shows',
                ...(hasPrice ? { price: s.price } : {}),
                priceCurrency: s.currency || 'USD',
                availability: 'https://schema.org/InStock',
              }
            : undefined;
        const eventUrl = SITE + 'events/' + s.id;
        return {
          '@type': 'Event',
          name: `Ultraphonics at ${s.venue?.trim() || 'TBD'}`,
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          eventStatus: 'https://schema.org/EventScheduled',
          startDate: startDateIso,
          ...(endDateIso ? { endDate: endDateIso } : {}),
          location,
          image: s.image || DEFAULT_IMAGE,
          description,
          organizer: { '@type': 'Organization', name: s.organizerName || s.venue || 'Ultraphonics' },
          performer: { '@id': SITE + '#musicgroup' },
          ...(offers ? { offers } : {}),
          url: eventUrl,
        };
      })
      .filter(Boolean);

    const graph = { '@context': 'https://schema.org', '@graph': [musicGroup, ...events] };
    const existing = document.getElementById('ld-json-ultraphonics');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'ld-json-ultraphonics';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(graph);
    document.head.appendChild(script);
    return () => document.getElementById('ld-json-ultraphonics')?.remove();
  }, [shows, loading]);

  // Konami code → admin
  useEffect(() => {
    const code = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA'];
    let i = 0;
    const handler = (e) => {
      if (e.code === code[i]) { i++; if (i === code.length) { window.location.href = '/admin'; i = 0; } }
      else { i = 0; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const currentYear = new Date().getFullYear();
  const upcomingShows = shows
    .filter((s) => s.published && new Date(s.date).getFullYear() === currentYear)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const { venmo, cashApp, payPal, tipAmount, note } = tipping;
  const encodedNote = encodeURIComponent(note);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const venmoHref = isIOS
    ? `venmo://paycharge?txn=pay&recipients=${venmo}&amount=${tipAmount}&note=${encodedNote}`
    : `https://account.venmo.com/u/${venmo}?txn=pay&amount=${tipAmount}&note=${encodedNote}`;

  return (
    <main>
      {/* Hero */}
      <section className="hero">
        <video
          ref={desktopVideoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="hero-video hero-video-desktop"
        >
          <source src="/videos/hero-brightside.mp4" type="video/mp4" />
        </video>
        <video
          ref={mobileVideoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="hero-video hero-video-mobile"
        >
          <source src="/videos/hero-mobile-brightside.mp4" type="video/mp4" />
        </video>
        <div className="hero-content">
          <img src="/images/logo-color.png" alt="Ultraphonics Logo" className="logo" />
          <h1 className="band-name">Ultraphonics</h1>
          <h2 className="tagline">High-Energy Live Band for Events, Weddings &amp; Bars</h2>
          <h3 className="genres">Rock • Pop • Country • Soul</h3>
          <div className="button-container">
            <Link to="/quote" className="button" id="book-button">
              Book Us
            </Link>
            <button
              className="button"
              id="tip-button"
              onClick={() => { trackEvent('tip_modal_open'); setTipOpen(true); }}
            >
              Tip the Band
            </button>
          </div>
          <div className="social-icons">
            <a
              href="https://www.facebook.com/UltraphonicsMusic"
              className="fb-link"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('social_click', { platform: 'Facebook' })}
            >
              <img src="/images/facebook.png" alt="Facebook" />
            </a>
            <a
              href="https://www.instagram.com/ultraphonicsmusic"
              className="insta-link"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('social_click', { platform: 'Instagram' })}
            >
              <img src="/images/instagram.png" alt="Instagram" />
            </a>
            <a
              href="https://www.youtube.com/@ultraphonicsmusic"
              className="yt-link"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('social_click', { platform: 'YouTube' })}
            >
              <img src="/images/youtube.png" alt="YouTube" />
            </a>
          </div>
        </div>
      </section>

      {/* Services teaser */}
      <section className="content-section" id="services">
        <div className="services">
          <h2 className="section-heading">Live Entertainment for Any Occasion</h2>
          <p className="lead-text">
            From weddings to corporate events, we bring danceable entertainment tailored to your
            needs.
          </p>
          <div className="button-container">
            <Link to="/services" className="button button-outline">
              View Services
            </Link>
            <Link to="/quote" className="button">
              Request a Quote
            </Link>
          </div>
        </div>
      </section>

      {/* Featured video */}
      <section className="content-section" id="featured-video">
        <div className="featured-video-container">
          <iframe
            className="featured-video"
            src="https://www.youtube.com/embed/lv2gxioTDeQ?enablejsapi=1&origin=https://www.ultraphonicsmusic.com"
            title="Ultraphonics Video"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </section>

      {/* Weddings promo */}
      <section className="weddings-promo-section">
        <div className="weddings-promo-overlay" />
        <div className="weddings-promo-content">
          <h2 className="weddings-promo-title">
            Your Perfect Day Deserves the Perfect Soundtrack
          </h2>
          <p className="weddings-promo-text">
            From ceremony to last dance, we'll make your wedding unforgettable with professional
            live music that keeps the dance floor packed.
          </p>
          <Link
            to="/weddings"
            className="button"
            id="weddings-promo-button"
            onClick={() =>
              trackEvent('weddings_promo_click', {
                page: 'home',
                button_text: 'Explore Wedding Services',
                button_location: 'weddings_promo_section',
              })
            }
          >
            Explore Wedding Services
          </Link>
        </div>
      </section>

      {/* Show schedule */}
      <section className="content-section" id="events">
        <div id="shows">
          {!loading && upcomingShows.length > 0 && (
            <>
              <h2 className="section-heading">{currentYear} Events</h2>
              {upcomingShows.map((show) => (
                <ShowCard key={show.id} show={show} />
              ))}
            </>
          )}
          {!loading && upcomingShows.length === 0 && (
            <p>Check back soon for new show dates!</p>
          )}
        </div>
      </section>

      {/* Tip modal */}
      <Modal
        isOpen={tipOpen}
        onClose={() => setTipOpen(false)}
        title="Tip the Band"
      >
        <p>Choose your preferred payment method:</p>
        <div className="modal-buttons">
          <a
            href={`https://cash.app/$${cashApp}/${tipAmount}`}
            target="_blank"
            rel="noopener noreferrer"
            className="button"
            onClick={() => trackEvent('tip_click', { method: 'CashApp' })}
          >
            <img src="/images/cashapp-icon.svg" alt="Cash App Logo" className="button-logo" />
            Cash App
          </a>
          <a
            href={venmoHref}
            target="_blank"
            rel="noopener noreferrer"
            className="button"
            onClick={() => trackEvent('tip_click', { method: 'Venmo' })}
          >
            <img src="/images/venmo-icon.svg" alt="Venmo Logo" className="button-logo" />
            Venmo
          </a>
          <a
            href={`https://paypal.me/${payPal}/${tipAmount}`}
            target="_blank"
            rel="noopener noreferrer"
            className="button"
            onClick={() => trackEvent('tip_click', { method: 'PayPal' })}
          >
            <img src="/images/paypal-icon.svg" alt="PayPal Logo" className="button-logo" />
            PayPal
          </a>
        </div>
      </Modal>

      {/* Song request modal */}
      <Modal
        isOpen={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request a Song"
      >
        <p>Help us build our 2026 setlist!</p>
        <div className="modal-buttons">
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSfxJJDYJbBtGoU7K4s7GDWror464fVPXn5dncp7m6mq89Xuzw/viewform?usp=dialog"
            target="_blank"
            rel="noopener noreferrer"
            className="button"
            onClick={() => { trackEvent('request_click', { type: 'Setlist Form' }); setRequestOpen(false); }}
          >
            2026 Setlist Request
          </a>
          <a
            href="https://www.facebook.com/UltraphonicsMusic"
            target="_blank"
            rel="noopener noreferrer"
            className="button"
            onClick={() => {
              trackEvent('request_click', { type: 'Facebook Message' });
              setRequestOpen(false);
              setTimeout(() => { setTipOpen(true); trackEvent('tip_modal_open', { source: 'request_flow' }); }, 300);
            }}
          >
            <img src="/images/facebook-white.png" alt="Facebook Logo" className="button-logo" />
            Message Us on Facebook
          </a>
        </div>
      </Modal>
    </main>
  );
}
