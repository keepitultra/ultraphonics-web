import { Link } from 'react-router-dom';
import { usePublishedProfiles } from '../firebase/useFirestore.js';
import { safeUrl, themeFor } from '../utils/profileThemes.js';

export default function BandIndex() {
  const { profiles, loading } = usePublishedProfiles();

  return (
    // `main` is what centres .content-section — it is flex/align-items:center in
    // styles.css, and every other page relies on it. Without it the section
    // pins to the left edge on any viewport wider than 800px.
    <main>
      <section className="content-section" style={{ minHeight: '60vh' }}>
        <h2 className="section-heading">Meet the Band</h2>

      {loading && <p className="text-center text-[#888] text-sm">Loading…</p>}

      {!loading && profiles.length === 0 && (
        <p className="text-center text-[#888] text-sm max-w-md mx-auto">
          Band profiles are on their way — check back soon.
        </p>
      )}

        <BandGrid profiles={profiles} />
      </section>
    </main>
  );
}

/**
 * The roster grid. Exported separately so its layout can be exercised at any
 * member count without publishing real people's profiles to do it.
 */
export function BandGrid({ profiles }) {
  return (
    // Flex wrap rather than grid: CSS Grid centres the whole track set, so a
    // part-full last row still starts in column one and leaves the final card
    // stranded on the left. Flex centres each row independently.
    <div className="flex flex-wrap justify-center gap-5">
      {profiles.map(p => {
        const m = p.member;
        const theme = themeFor(p);
        const photo = safeUrl(p.photoUrl);
        return (
          <Link
            key={p.id}
            to={`/band/${p.id}`}
            className="rounded-2xl overflow-hidden transition-transform hover:-translate-y-1 block"
            // Fixed width, not flex-grow: a growing card sizes itself to how
            // full its row happens to be, so a lone card on the last row ends
            // up visibly larger than the row above it. clamp keeps two-up on
            // phones and a consistent size everywhere else.
            style={{
              background: theme.panel,
              border: `1px solid ${theme.border}`,
              flex: '0 0 auto',
              width: 'clamp(140px, 45%, 200px)',
            }}
          >
            <div className="aspect-square w-full flex items-center justify-center overflow-hidden"
              style={{ background: `${m.color}18` }}>
              {photo ? (
                <img src={photo} alt={m.name} referrerPolicy="no-referrer" loading="lazy"
                  className="w-full h-full object-cover" />
              ) : (
                <span className="font-bold" style={{ color: m.color, fontSize: 64 }}>{m.name[0]}</span>
              )}
            </div>
            <div className="p-4 text-center">
              <p className="font-bold text-lg leading-tight" style={{ color: m.color }}>{m.name}</p>
              <p className="text-xs mt-1" style={{ color: theme.muted }}>
                {(m.roles || []).join(' \u00b7 ') || 'Ultraphonics'}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
