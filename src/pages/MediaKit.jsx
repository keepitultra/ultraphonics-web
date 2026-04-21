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
  Pop:     { bg: '#3b82f620', text: '#93c5fd', border: '#3b82f640' },
  Soul:    { bg: '#f59e0b20', text: '#fcd34d', border: '#f59e0b40' },
  Rock:    { bg: '#ef444420', text: '#fca5a5', border: '#ef444440' },
  Country: { bg: '#22c55e20', text: '#86efac', border: '#22c55e40' },
  Other:   { bg: '#6b728020', text: '#d1d5db', border: '#6b728040' },
};

function isValidSong(s) {
  if (s.active === false) return false;
  const t = (s.title || s.name || '').trim();
  if (!t) return false;
  if (/^Set\s*\d/i.test(t)) return false;
  if (t.startsWith('-') || t.startsWith('_')) return false;
  if (!(s.genre || '').trim()) return false;
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

export default function MediaKit() {
  const { data: allSongs = [] } = useSongs();
  const songs = allSongs
    .filter(isValidSong)
    .sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));

  return (
    <main>
      <div className="page-header services-page-header">
        <Link to="/">
          <img src="/images/logo-color.png" alt="Ultraphonics Logo" className="page-logo" />
        </Link>
        <h1 className="page-title">Media Kit</h1>
        <p className="page-lead">Official photos, promotional assets, and resources.</p>
      </div>

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

      {/* Song list */}
      <section className="content-section" id="song-selection">
        <h2 className="section-heading">Song List</h2>
        <p className="lead-text">Our full rotating repertoire — {songs.length} songs and counting.</p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0',
          maxWidth: '900px',
          margin: '2rem auto 0',
          border: '1px solid #2a2a2a',
          borderRadius: '0.75rem',
          overflow: 'hidden',
        }}>
          {songs.map((song, i) => {
            const genre = genreLabel(song);
            const colors = GENRE_COLORS[genre] || GENRE_COLORS.Other;
            return (
              <div
                key={song.id || song.title}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.6rem 1rem',
                  borderBottom: i < songs.length - 2 ? '1px solid #2a2a2a' : 'none',
                  borderRight: i % 2 === 0 ? '1px solid #2a2a2a' : 'none',
                  background: i % 2 === 0 ? '#1a1a1a' : '#161616',
                }}
              >
                <span style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: 500, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {song.title || song.name}
                </span>
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
    </main>
  );
}
