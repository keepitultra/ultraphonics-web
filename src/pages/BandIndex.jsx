import { Link } from 'react-router-dom';
import { usePublishedProfiles } from '../firebase/useFirestore.js';
import { safeUrl, themeFor } from '../utils/profileThemes.js';

export default function BandIndex() {
  const { profiles, loading } = usePublishedProfiles();

  return (
    <div className="content-section text-left" style={{ minHeight: '60vh' }}>
      <h2 className="section-heading">Meet the Band</h2>

      {loading && <p className="text-center text-[#888] text-sm">Loading…</p>}

      {!loading && profiles.length === 0 && (
        <p className="text-center text-[#888] text-sm max-w-md mx-auto">
          Band profiles are on their way — check back soon.
        </p>
      )}

      <div className="grid gap-5 max-w-4xl mx-auto"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        {profiles.map(p => {
          const m = p.member;
          const theme = themeFor(p);
          const photo = safeUrl(p.photoUrl);
          return (
            <Link
              key={p.id}
              to={`/band/${p.id}`}
              className="rounded-2xl overflow-hidden transition-transform hover:-translate-y-1 block"
              style={{ background: theme.panel, border: `1px solid ${theme.border}` }}
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
              <div className="p-4">
                <p className="font-bold text-lg leading-tight" style={{ color: m.color }}>{m.name}</p>
                <p className="text-xs mt-1" style={{ color: theme.muted }}>
                  {(m.roles || []).join(' · ') || 'Ultraphonics'}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
