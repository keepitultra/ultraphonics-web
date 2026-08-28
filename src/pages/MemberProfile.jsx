import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMemberProfile } from '../firestore-service.js';
import { useMembers } from '../firebase/useFirestore.js';
import { THEMES, FONTS, PATTERNS, SOCIAL_PLATFORMS, safeUrl, themeFor, fontFor, patternFor } from '../utils/profileThemes.js';

/** External image, hardened: only http(s), no referrer leak, graceful failure. */
function ProfilePhoto({ url, name, accent, size = 190 }) {
  const [failed, setFailed] = useState(false);
  const safe = safeUrl(url);
  if (!safe || failed) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl font-bold shrink-0"
        style={{ width: size, height: size, background: `${accent}22`, color: accent, border: `2px solid ${accent}55`, fontSize: size * 0.4 }}
      >
        {name?.[0] || '?'}
      </div>
    );
  }
  return (
    <img
      src={safe}
      alt={name}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      loading="lazy"
      className="rounded-2xl object-cover shrink-0"
      style={{ width: size, height: size, border: `2px solid ${accent}55` }}
    />
  );
}

export default function MemberProfile() {
  const { memberId } = useParams();
  const members = useMembers();
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    let cancelled = false;
    getMemberProfile(memberId)
      .then(p => { if (!cancelled) setProfile(p); })
      // An unpublished profile is denied by the rules, which is a normal
      // outcome here, not an error worth surfacing.
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [memberId]);

  const member = members.resolve(memberId);
  const loading = profile === undefined || members.loading;

  if (loading) {
    return <div className="min-h-screen bg-[#0f1115] flex items-center justify-center text-[#555] text-sm">Loading…</div>;
  }

  if (!profile || !profile.published || !member || member.active === false) {
    return (
      <div className="min-h-screen bg-[#0f1115] flex flex-col items-center justify-center text-center px-6">
        <i className="fas fa-user-slash text-4xl text-[#333] mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">No profile here</h1>
        <p className="text-[#888] text-sm mb-6">This page isn&rsquo;t published.</p>
        <Link to="/band" className="px-5 py-3 rounded-xl bg-[#1f2937] text-white text-sm font-semibold hover:bg-[#2b3646] transition-colors">
          Meet the band
        </Link>
      </div>
    );
  }

  const theme = themeFor(profile);
  const font = fontFor(profile);
  const pattern = patternFor(profile);
  const accent = member.color || theme.muted;
  const artists = (profile.favoriteArtists || []).filter(Boolean);
  const socials = SOCIAL_PLATFORMS
    .map(p => ({ ...p, url: safeUrl(profile.socials?.[p.key]) }))
    .filter(p => p.url);

  const panel = {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.glow ? `0 0 24px -8px ${accent}66` : 'none',
  };

  return (
    <div
      className="min-h-screen text-left"
      style={{
        background: theme.bg,
        backgroundImage: pattern.css === 'none' ? undefined : pattern.css,
        backgroundSize: pattern.size,
        color: theme.text,
        fontFamily: font.stack,
      }}
    >
      <div className="max-w-3xl mx-auto px-4 pb-12 pt-24 sm:pt-28">

        <Link to="/band" className="inline-flex items-center gap-2 text-sm mb-6 hover:underline" style={{ color: theme.muted }}>
          <i className="fas fa-chevron-left text-xs" /> Meet the band
        </Link>

        {/* Header card */}
        <div className="rounded-2xl p-5 sm:p-7 flex flex-col sm:flex-row gap-6 items-center sm:items-start" style={panel}>
          <ProfilePhoto url={profile.photoUrl} name={member.name} accent={accent} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight" style={{ color: accent }}>
              {member.name}
            </h1>
            {member.fullName && member.fullName !== member.name && (
              <p className="text-sm mt-0.5" style={{ color: theme.muted }}>{member.fullName}</p>
            )}
            {(member.roles || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start mt-3">
                {member.roles.map(r => (
                  <span key={r} className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}>
                    {r}
                  </span>
                ))}
              </div>
            )}
            {profile.status && (
              <p className="mt-3 text-sm italic" style={{ color: theme.muted }}>
                &ldquo;{profile.status}&rdquo;
              </p>
            )}
            {socials.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start mt-4">
                {socials.map(s => (
                  <a
                    key={s.key}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    title={s.label}
                    aria-label={s.label}
                    className="w-11 h-11 flex items-center justify-center rounded-xl transition-transform hover:scale-110"
                    style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}44` }}
                  >
                    <i className={s.icon} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bio — rendered as text; newlines preserved, markup never interpreted */}
        {profile.bio && (
          <div className="rounded-2xl p-5 sm:p-7 mt-5" style={panel}>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: theme.muted }}>
              About me
            </h2>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{profile.bio}</p>
          </div>
        )}

        {artists.length > 0 && (
          <div className="rounded-2xl p-5 sm:p-7 mt-5" style={panel}>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: theme.muted }}>
              On repeat
            </h2>
            <div className="flex flex-wrap gap-2">
              {artists.map((a, i) => (
                <span key={`${a}-${i}`} className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: `${accent}18`, border: `1px solid ${accent}33` }}>
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link to="/" className="text-xs hover:underline" style={{ color: theme.muted }}>
            ultraphonics.com
          </Link>
        </div>
      </div>
    </div>
  );
}
