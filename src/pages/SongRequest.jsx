import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { config } from '../config.js';
import { saveSongRequest, getWebsiteSongs } from '../firestore-service.js';
import { trackEvent } from '../analytics.js';
import { GENRE_COLORS, genreLabel } from '../utils/genre.js';
import { useSettings } from '../firebase/useFirestore.js';

const { tipping } = config;

function toTitleCase(str) {
  return str.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export default function SongRequest() {
  const [songs, setSongs] = useState([]);
  const [loadingError, setLoadingError] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(/** @type {{id: string, title: string, artist?: string} | null} */(null));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedTitle, setSubmittedTitle] = useState('');
  const searchRef = useRef(null);
  const navigate = useNavigate();
  const { songRequestsEnabled, loaded: settingsLoaded } = useSettings();

  useEffect(() => {
    getWebsiteSongs()
      .then(data => setSongs(data.sort((a, b) => a.title.localeCompare(b.title))))
      .catch(() => setLoadingError(true));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return songs;
    const lower = query.toLowerCase();
    return songs.filter(s =>
      s.title?.toLowerCase().includes(lower) ||
      s.artist?.toLowerCase().includes(lower)
    );
  }, [query, songs]);

  // When the search yields no matches, allow submitting the typed text as a free request
  const freeTextTitle = !selected && filtered.length === 0 && query.trim()
    ? toTitleCase(query)
    : null;

  const submitTitle = selected ? selected.title : freeTextTitle;

  async function handleSubmit() {
    if (!submitTitle || submitting) return;
    setSubmitting(true);
    try {
      await saveSongRequest(submitTitle);
      trackEvent('song_request_submit', {
        title: submitTitle,
        source: selected ? 'catalog' : 'free_text',
      });
      setSubmittedTitle(submitTitle);
      setSubmitted(true);
    } catch (err) {
      console.error('Song request failed', err);
      trackEvent('song_request_error', { title: submitTitle });
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (submitted) window.scrollTo(0, 0);
  }, [submitted]);

  const venmoHref = /iPhone|iPad|iPod/.test(navigator.userAgent)
    ? `venmo://paycharge?txn=pay&recipients=${tipping.venmo}&amount=${tipping.tipAmount}&note=${encodeURIComponent(tipping.note)}`
    : `https://account.venmo.com/u/${tipping.venmo}?txn=pay&amount=${tipping.tipAmount}&note=${encodeURIComponent(tipping.note)}`;

  // Requests switched off in admin. Gated on `settingsLoaded` so the page never
  // flashes this message before the real answer arrives. Someone mid-flow who
  // already submitted still sees their confirmation below.
  if (settingsLoaded && !songRequestsEnabled && !submitted) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-stone-800 flex items-center justify-center mb-6">
          <i className="fas fa-music text-stone-500 text-3xl" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Requests are closed</h1>
        <p className="text-stone-400 text-base max-w-sm">
          Sorry — we&rsquo;re not taking song requests right now. Come find us at the
          next show!
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-8 px-6 py-3 rounded-2xl font-bold text-base text-white bg-stone-800 hover:bg-stone-700 transition-colors"
        >
          Back to the site
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-teal-500/20 flex items-center justify-center mb-6">
          <i className="fas fa-check text-teal-400 text-3xl" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Request Received!</h1>
        <p className="text-xl text-teal-400 font-semibold mb-1">{submittedTitle}</p>
        <p className="text-stone-400 mb-10">We'll do our best to play it tonight.</p>

        <p className="text-stone-300 font-semibold mb-4 text-lg">Enjoying the show? Tip the band!</p>
        <div className="flex flex-col gap-3 w-full max-w-xs mb-10">
          <a
            href={`https://cash.app/$${tipping.cashApp}/${tipping.tipAmount}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-bold text-base"
            style={{ background: '#00d632', color: '#000' }}
            onClick={() => trackEvent('tip_click', { method: 'CashApp', source: 'song_request' })}
          >
            <img src="/images/cashapp-icon.svg" alt="" className="w-5 h-5" />
            Cash App
          </a>
          <a
            href={venmoHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-bold text-base text-white"
            style={{ background: '#3d95ce' }}
            onClick={() => trackEvent('tip_click', { method: 'Venmo', source: 'song_request' })}
          >
            <img src="/images/venmo-icon.svg" alt="" className="w-5 h-5" />
            Venmo
          </a>
          <a
            href={`https://paypal.me/${tipping.payPal}/${tipping.tipAmount}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-bold text-base text-white"
            style={{ background: '#003087' }}
            onClick={() => trackEvent('tip_click', { method: 'PayPal', source: 'song_request' })}
          >
            <img src="/images/paypal-icon.svg" alt="" className="w-5 h-5" />
            PayPal
          </a>
        </div>
        <button
          onClick={() => {
            trackEvent('song_request_repeat');
            setSubmitted(false);
            setSelected(null);
            setSubmittedTitle('');
            setQuery('');
          }}
          className="text-teal-400 text-sm underline underline-offset-2"
        >
          Request another song
        </button>
      </div>
    );
  }

  return (
    <div className="bg-stone-950 flex flex-col overflow-hidden" style={{ height: '100dvh' }}>

      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-stone-400 hover:text-white transition-colors py-1 mb-4"
        >
          <i className="fas fa-chevron-left text-sm" />
          <span className="text-sm font-medium">Back</span>
        </button>
        <div className="text-center px-2">
          <p className="text-2xl font-bold text-white leading-tight">
            What do you want to hear?
          </p>
          <p className="text-stone-500 text-xs mt-1">Pick a song from our setlist</p>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 pb-2">
        <div className="relative">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search songs or artists..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            className="w-full bg-stone-900 text-white px-4 pr-9 py-3 rounded-xl outline-none
              border border-stone-700 focus:border-teal-400
              focus:shadow-[0_0_12px_rgba(20,184,166,0.3)]
              placeholder:text-stone-600 text-sm transition-all"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setSelected(null); searchRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 p-1"
              aria-label="Clear search"
            >
              <i className="fas fa-xmark text-sm" />
            </button>
          )}
        </div>
      </div>

      {/* Count */}
      <div className="shrink-0 px-5 pb-1.5">
        {songs.length > 0 && (
          <p className="text-stone-600 text-xs">
            {query.trim()
              ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
              : `${songs.length} songs available`}
          </p>
        )}
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-y-auto">
        {loadingError ? (
          <div className="flex flex-col items-center justify-center h-40 text-stone-600 text-sm">
            <i className="fas fa-circle-exclamation text-2xl mb-3 opacity-40" />
            <p>Couldn't load songs. Try refreshing.</p>
          </div>
        ) : songs.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-stone-600 text-sm">Loading setlist…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-6">
            <p className="text-stone-400 text-sm font-medium">Not in our setlist yet.</p>
            <p className="text-stone-600 text-sm mt-1">Hit the button below to request it anyway!</p>
          </div>
        ) : (
          <ul className="px-4 pb-28 space-y-1.5">
            {filtered.map(song => {
              const isSelected = selected?.id === song.id;
              return (
                <li key={song.id}>
                  <button
                    onClick={() => {
                      const next = isSelected ? null : song;
                      setSelected(next);
                      if (next) trackEvent('song_request_song_select', { title: song.title });
                    }}
                    className="w-full text-left px-4 py-3.5 rounded-xl transition-all flex items-center gap-3"
                    style={isSelected
                      ? { background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.4)' }
                      : { background: '#1a1a1a', border: '1px solid #2a2a2a' }
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate leading-snug ${isSelected ? 'text-teal-300' : 'text-white'}`}>
                        {song.title}
                      </p>
                      {song.artist && (
                        <p className="text-stone-500 text-sm truncate mt-0.5">{song.artist}</p>
                      )}
                    </div>
                    {song.genre && !isSelected && (() => {
                      const label = genreLabel(song);
                      const colors = GENRE_COLORS[label] || GENRE_COLORS.Other;
                      return (
                        <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                          {label}
                        </span>
                      );
                    })()}
                    {isSelected && (
                      <i className="fas fa-circle-check shrink-0 text-teal-400 text-lg" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sticky submit bar */}
      <div className="shrink-0 px-4 pt-3 pb-8 border-t border-stone-900 bg-stone-950">
        <button
          onClick={handleSubmit}
          disabled={!submitTitle || submitting}
          className="w-full py-4 rounded-2xl font-bold text-lg transition-all"
          style={{
            background: submitTitle ? '#14b8a6' : '#1a1a1a',
            color: submitTitle ? '#0f172a' : '#444',
            border: submitTitle ? 'none' : '1px solid #2a2a2a',
            cursor: submitTitle ? 'pointer' : 'default',
          }}
        >
          {submitting
            ? 'Sending…'
            : submitTitle
              ? `Request "${submitTitle}"`
              : 'Select a song above'}
        </button>
      </div>

    </div>
  );
}
