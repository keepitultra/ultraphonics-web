// Presets for public member profile pages.
//
// Deliberately data, not CSS: members pick a preset key and everything is
// applied as inline styles from these values. Nothing a member types is ever
// interpreted as markup or stylesheet, which is what keeps a page strangers
// visit free of injection.

export const THEMES = {
  neon:    { label: 'Neon',    bg: '#0a0118', panel: '#160b2e', text: '#f4ecff', muted: '#a78bfa', border: '#7c3aed66', glow: true },
  chrome:  { label: 'Chrome',  bg: '#0f1115', panel: '#1a1f28', text: '#e8edf5', muted: '#8fa3bf', border: '#3b4a5f88', glow: false },
  sparkle: { label: 'Sparkle', bg: '#1a0620', panel: '#2b0d33', text: '#ffe9f7', muted: '#f0a6d8', border: '#ec489966', glow: true },
  denim:   { label: 'Denim',   bg: '#0b1220', panel: '#152238', text: '#e6eefc', muted: '#7ea6d8', border: '#3b82f666', glow: false },
  y2k:     { label: 'Y2K',     bg: '#04121a', panel: '#0a2230', text: '#dffaff', muted: '#5fe6ea', border: '#00ddde66', glow: true },
  sunset:  { label: 'Sunset',  bg: '#1a0d05', panel: '#2e1608', text: '#ffeede', muted: '#fbbf6b', border: '#f59e0b66', glow: false },
};

export const DEFAULT_THEME = 'chrome';

export const FONTS = {
  montserrat: { label: 'Montserrat', stack: "'Montserrat', sans-serif" },
  serif:      { label: 'Serif',      stack: "Georgia, 'Times New Roman', serif" },
  mono:       { label: 'Typewriter', stack: "'Courier New', Courier, monospace" },
  loud:       { label: 'Loud',       stack: "'Arial Black', 'Helvetica Neue', Impact, sans-serif" },
};

export const DEFAULT_FONT = 'montserrat';

// Tiled backgrounds as pure CSS gradients — no image requests, no external hosts.
export const PATTERNS = {
  none:    { label: 'None',    css: 'none' },
  stars:   { label: 'Stars',   css: 'radial-gradient(circle at 20% 30%, #ffffff22 1px, transparent 1px), radial-gradient(circle at 70% 60%, #ffffff18 1px, transparent 1px)', size: '90px 90px, 130px 130px' },
  grid:    { label: 'Grid',    css: 'linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px)', size: '28px 28px' },
  stripes: { label: 'Stripes', css: 'repeating-linear-gradient(45deg, #ffffff0d 0 10px, transparent 10px 20px)', size: 'auto' },
  dots:    { label: 'Dots',    css: 'radial-gradient(#ffffff14 1.5px, transparent 1.5px)', size: '18px 18px' },
};

export const DEFAULT_PATTERN = 'none';

/** Known socials, in render order. Keys are what we persist. */
export const SOCIAL_PLATFORMS = [
  { key: 'instagram',  label: 'Instagram',  icon: 'fab fa-instagram' },
  { key: 'facebook',   label: 'Facebook',   icon: 'fab fa-facebook' },
  { key: 'tiktok',     label: 'TikTok',     icon: 'fab fa-tiktok' },
  { key: 'youtube',    label: 'YouTube',    icon: 'fab fa-youtube' },
  { key: 'spotify',    label: 'Spotify',    icon: 'fab fa-spotify' },
  { key: 'soundcloud', label: 'SoundCloud', icon: 'fab fa-soundcloud' },
  { key: 'bandcamp',   label: 'Bandcamp',   icon: 'fab fa-bandcamp' },
  { key: 'x',          label: 'X',          icon: 'fab fa-x-twitter' },
  { key: 'website',    label: 'Website',    icon: 'fas fa-globe' },
];

/**
 * Only http(s) URLs survive. Anything else — javascript:, data:, vbscript: —
 * returns null so it is never placed in an href or src. Member-supplied links
 * are rendered to the public, so this is the boundary that matters.
 */
export function safeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null;
  } catch {
    return null;
  }
}

export function themeFor(profile) {
  return THEMES[profile?.theme] || THEMES[DEFAULT_THEME];
}
export function fontFor(profile) {
  return FONTS[profile?.font] || FONTS[DEFAULT_FONT];
}
export function patternFor(profile) {
  return PATTERNS[profile?.pattern] || PATTERNS[DEFAULT_PATTERN];
}

/**
 * Pull an 11-character video id out of any ordinary YouTube URL.
 *
 * Runs through safeUrl() first, so only http(s) links are ever considered, and
 * the host must actually be YouTube — a member cannot point the player at an
 * arbitrary origin. Returns null when there is nothing valid to play, which is
 * what keeps the player hidden until it has been configured.
 */
export function parseYouTubeId(raw) {
  const href = safeUrl(raw);
  if (!href) return null;

  let url;
  try { url = new URL(href); } catch { return null; }

  const host = url.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  const isYouTube = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host);
  if (!isYouTube) return null;

  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v');
  } else {
    const m = url.pathname.match(/^\/(?:embed|shorts|v|live)\/([^/?#]+)/);
    if (m) id = m[1];
  }

  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
