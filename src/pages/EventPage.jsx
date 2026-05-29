import { useParams, Link } from 'react-router-dom';
import { useShow } from '../firebase/useFirestore.js';
import { parseLocalDateOnly, parseTimeToHM, formatCityState } from '../utils.js';

const MAPS_EMBED_BASE = 'https://maps.google.com/maps';

function formatEventDate(dateStr) {
  if (!dateStr) return 'Date TBD';
  const d = parseLocalDateOnly(dateStr);
  if (!d || isNaN(d)) return 'Date TBD';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// Normalises "8:00 PM", "20:00", "8:00" → "8:00 PM" using the shared parser
function formatTime(timeStr) {
  if (!timeStr) return null;
  const { hours, minutes, isAM, isPM } = parseTimeToHM(timeStr);
  if (isNaN(hours)) return null;
  // If the string already carries AM/PM use it; otherwise derive from 24h value
  const usePM = isPM || (!isAM && hours >= 12);
  const hour12 = hours % 12 || 12;
  const ampm = usePM ? 'PM' : 'AM';
  return `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

function buildAddress(show) {
  const parts = [];
  if (show.streetAddress) parts.push(show.streetAddress);
  const cityState = formatCityState(show.city, show.state);
  if (cityState) parts.push(cityState);
  if (show.postalCode) parts.push(show.postalCode);
  return parts.join(', ');
}

// Always lead with venue name so the map pins to the right place
function buildMapsQuery(show) {
  const venue = show.venue?.trim();
  const address = buildAddress(show);
  if (venue && address) return `${venue}, ${address}`;
  return venue || address || null;
}

function buildMapsUrl(show) {
  const q = buildMapsQuery(show);
  if (!q) return null;
  return `${MAPS_EMBED_BASE}?q=${encodeURIComponent(q)}&output=embed`;
}

export default function EventPage() {
  const { id } = useParams();
  const { data: show, loading, error } = useShow(id);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0c0a09' }}>
        <div className="text-stone-400">Loading event…</div>
      </div>
    );
  }

  if (error || !show || !show.published) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0c0a09' }}>
        <p className="text-stone-400 text-lg">Event not found.</p>
        <Link to="/#shows" className="text-teal-400 underline text-sm">← Back to shows</Link>
      </div>
    );
  }

  const venueText = show.venue?.trim() || 'Venue TBD';
  const address = buildAddress(show);
  const cityState = formatCityState(show.city, show.state);
  const startTime = formatTime(show.startTime);
  const endTime = formatTime(show.endTime);
  const timeRange = startTime
    ? endTime ? `${startTime} – ${endTime}` : startTime
    : null;
  const mapsEmbedUrl = buildMapsUrl(show);
  const mapsQuery = buildMapsQuery(show);
  const mapsLinkUrl = mapsQuery ? `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}` : null;

  return (
    <div className="min-h-screen" style={{ color: '#e7e5e4' }}>
      {/* Back button — fixed, same position/size as hamburger-btn */}
      <Link
        to="/#shows"
        style={{ position: 'fixed', top: '1.5rem', left: '1.5rem', zIndex: 1001, padding: '10px', width: 45, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        className="hamburger-back-btn"
        aria-label="Back to all shows"
      >
        <i className="fa-solid fa-arrow-left" style={{ color: 'var(--color-white)', fontSize: '1.2rem', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
      </Link>

      {/* Logo header */}
      <div className="page-header services-page-header">
        <Link to="/">
          <img src="/images/logo-color.png" alt="Ultraphonics Logo" className="page-logo" />
        </Link>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pb-12 space-y-8">
        {/* Title */}
        <div>
          <h1 className="text-3xl font-bold text-white">Ultraphonics Live</h1>
          <p className="text-stone-400 mt-1">at {venueText}</p>
        </div>

        {/* Event details card */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ background: '#1c1917', border: '1px solid #292524' }}
        >
          <div className="flex items-start gap-3">
            <i className="fa-solid fa-calendar-days text-teal-400 mt-0.5 w-5 text-center" />
            <div>
              <p className="font-semibold text-white">{formatEventDate(show.date)}</p>
              {timeRange && <p className="text-stone-400 text-sm">{timeRange}</p>}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <i className="fa-solid fa-location-dot text-teal-400 mt-0.5 w-5 text-center" />
            <div>
              <p className="font-semibold text-white">{venueText}</p>
              {address && (
                mapsLinkUrl
                  ? <a href={mapsLinkUrl} target="_blank" rel="noopener noreferrer" className="text-stone-400 text-sm hover:text-teal-400">{address}</a>
                  : <p className="text-stone-400 text-sm">{address}</p>
              )}
              {!address && cityState && <p className="text-stone-400 text-sm">{cityState}</p>}
            </div>
          </div>

          {show.price != null && (
            <div className="flex items-start gap-3">
              <i className="fa-solid fa-ticket text-teal-400 mt-0.5 w-5 text-center" />
              <p className="text-white">{show.price === 0 ? 'Free admission' : `$${show.price} cover`}</p>
            </div>
          )}
        </div>

        {/* Description */}
        {show.description && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">About this event</h2>
            <p className="text-stone-300 leading-relaxed whitespace-pre-line">{show.description}</p>
          </div>
        )}

        {/* Facebook event link */}
        {show.eventLink && (
          <a
            href={show.eventLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl px-5 py-4 font-semibold transition-colors"
            style={{ background: '#1877f2', color: '#fff' }}
          >
            <img src="/images/facebook-white.png" alt="" className="w-5 h-5 object-contain" />
            View Facebook Event
          </a>
        )}

        {/* Ticket link (if separate from eventLink) */}
        {show.ticketUrl && show.ticketUrl !== show.eventLink && (
          <a
            href={show.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl px-5 py-4 font-semibold text-center transition-colors"
            style={{ background: '#14b8a6', color: '#fff' }}
          >
            Get Tickets
          </a>
        )}

        {/* Map */}
        {mapsEmbedUrl && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Location</h2>
            <div className="rounded-xl overflow-hidden" style={{ height: 300 }}>
              <iframe
                title="Event location map"
                src={mapsEmbedUrl}
                width="100%"
                height="300"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            {mapsLinkUrl && (
              <a
                href={mapsLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-teal-400 text-sm mt-2 hover:underline"
              >
                Open in Google Maps →
              </a>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
