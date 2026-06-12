import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { config } from '../config.js';
import { useSongs } from '../firebase/useFirestore.js';

const galleryImages = [
  { src: '/images/UltraphonicsLivePromoPic1.jpg', alt: 'Ultraphonics Live 1' },
  { src: '/images/UltraphonicsLivePromoPic2.jpg', alt: 'Ultraphonics Live 2' },
  { src: '/images/UltraphonicsLivePromoPic3.png', alt: 'Ultraphonics Live 3' },
  { src: '/images/UltraphonicsLivePromoPic4.jpg', alt: 'Ultraphonics Live 4' },
];

const GENRE_COLORS = {
  Pop:     { bg: '#ec489920', text: '#f9a8d4', border: '#ec489940' },
  Soul:    { bg: '#a855f720', text: '#d8b4fe', border: '#a855f740' },
  Rock:    { bg: '#22c55e20', text: '#86efac', border: '#22c55e40' },
  Country: { bg: '#eab30820', text: '#fde047', border: '#eab30840' },
  Other:   { bg: '#6b728020', text: '#d1d5db', border: '#6b728040' },
};

function isValidSong(s) {
  if (!s.showOnWebsite) return false;
  const t = (s.title || s.name || '').trim();
  if (!t) return false;
  if (/^Set\s*\d/i.test(t)) return false;
  if (t.startsWith('-') || t.startsWith('_')) return false;
  return true;
}

function genreLabel(song) {
  const g = (song.genre || '').trim();
  if (!g) return 'Other';
  const lower = g.toLowerCase();
  if (['r&b', 'rnb', 'soul'].includes(lower)) return 'Soul';
  if (['classic rock', 'rock'].includes(lower)) return 'Rock';
  if (['country', 'folk', 'bluegrass'].includes(lower)) return 'Country';
  if (['pop'].includes(lower)) return 'Pop';
  return 'Other';
}

const GENRE_ORDER = ['Rock', 'Pop', 'Soul', 'Country', 'Other'];

export default function MediaKit() {
  const { data: allSongs = [] } = useSongs();
  const [sortBy, setSortBy] = useState('title');

  const songs = useMemo(() => {
    const base = allSongs.filter(isValidSong);
    if (sortBy === 'artist') {
      return base.sort((a, b) => (a.artist || 'zzz').localeCompare(b.artist || 'zzz') || (a.title || '').localeCompare(b.title || ''));
    }
    if (sortBy === 'genre') {
      return base.sort((a, b) => {
        const ga = GENRE_ORDER.indexOf(genreLabel(a));
        const gb = GENRE_ORDER.indexOf(genreLabel(b));
        return ga - gb || (a.title || '').localeCompare(b.title || '');
      });
    }
    return base.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));
  }, [allSongs, sortBy]);

  return (
    <main>
      <div className="page-header services-page-header">
        <Link to="/">
          <img src="/images/logo-color.png" alt="Ultraphonics Logo" className="page-logo" />
        </Link>
        <h1 className="page-title">Media Kit</h1>
        <p className="page-lead">Official photos, promotional assets, and resources.</p>
      </div>

      {/* Song list */}
      <section className="content-section" id="song-selection">
        <h2 className="section-heading">Song List</h2>
        <p className="lead-text">Our full rotating repertoire — {songs.length} songs and counting.</p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.25rem', margin: '1.5rem auto 0', maxWidth: '900px' }}>
          {['title', 'artist', 'genre'].map(opt => (
            <button
              key={opt}
              onClick={() => setSortBy(opt)}
              style={{
                padding: '0.3rem 0.85rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'capitalize',
                border: '1px solid',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: sortBy === opt ? '#14b8a6' : 'transparent',
                color: sortBy === opt ? '#0f172a' : '#6b7280',
                borderColor: sortBy === opt ? '#14b8a6' : '#2a2a2a',
              }}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 mx-auto mt-4 border border-[#2a2a2a] rounded-xl overflow-hidden" style={{ maxWidth: '900px' }}>
          {songs.map((song, i) => {
            const genre = genreLabel(song);
            const colors = GENRE_COLORS[genre] || GENRE_COLORS.Other;
            return (
              <div
                key={song.id || song.title}
                className={i % 2 === 0 ? 'sm:border-r sm:border-r-[#2a2a2a]' : ''}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.6rem 1rem',
                  borderBottom: '1px solid #2a2a2a',
                  background: i % 2 === 0 ? '#1a1a1a' : '#161616',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {song.title || song.name}
                  </div>
                  {song.artist && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {song.artist}
                    </div>
                  )}
                </div>
                <span style={{
                  flexShrink: 0,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '999px',
                  background: colors.bg,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                }}>
                  {genre}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Song request CTA */}
      <section className="content-section" style={{ paddingTop: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <p className="lead-text" style={{ marginBottom: '1rem' }}>Don't see what you're looking for?</p>
          <Link to="/request" className="button">Request a Song</Link>
        </div>
      </section>

      {/* Gallery */}
      <section className="content-section" id="epk-gallery">
        <h2 className="section-heading">Live Photos</h2>
        <div className="gallery-grid">
          {galleryImages.map((img, i) => (
            <div key={i} className="gallery-item">
              <img src={img.src} alt={img.alt} loading="lazy" />
              <a
                href={img.src}
                download
                className="gallery-download-btn"
                aria-label="Download image"
                title="Download"
              >
                ⇩
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Downloads */}
      <section className="content-section" id="epk-downloads">
        <h2 className="section-heading">Promotional Assets</h2>
        <div className="downloads-container" style={{ flexDirection: 'column', alignItems: 'center' }}>
          <a
            href={config.links.mediaKit}
            className="button button-outline"
            target="_blank"
            rel="noopener noreferrer"
            style={{ width: '100%', maxWidth: '350px', textAlign: 'center', margin: 0 }}
          >
            Download Media Kit (Google Drive)
          </a>
          <a
            href={config.links.stagePlot}
            className="button button-outline"
            target="_blank"
            rel="noopener noreferrer"
            style={{ width: '100%', maxWidth: '350px', textAlign: 'center', margin: 0 }}
          >
            Download Stage Plot (PDF)
          </a>
        </div>
      </section>
    </main>
  );
}
