// Quote-request field contract.
//
// The single source of truth for what a quote document contains. Pure: no
// React, no Firestore, so it can be unit-tested and reused by both the public
// form and the admin inbox.
//
// IMPORTANT: QUOTE_OPTIONS is mirrored by hand in firestore.rules. Adding an
// option here without redeploying rules silently rejects every submission that
// uses it.

/** form `name` attribute → document key. Also the create-rule's key whitelist. */
export const QUOTE_FIELDS = [
  { form: 'name',             key: 'name',           kind: 'text' },
  { form: 'email',            key: 'email',          kind: 'text' },
  { form: 'phone',            key: 'phone',          kind: 'text' },
  { form: 'event_type',       key: 'eventType',      kind: 'text' },
  { form: 'event_type_other', key: 'eventTypeOther', kind: 'text' },
  { form: 'date',             key: 'date',           kind: 'text' },
  { form: 'location',         key: 'location',       kind: 'text' },
  { form: 'venue',            key: 'venue',          kind: 'text' },
  { form: 'setting',          key: 'setting',        kind: 'text' },
  { form: 'guests',           key: 'guests',         kind: 'text' },
  { form: 'duration',         key: 'duration',       kind: 'text' },
  { form: 'hard_stop',        key: 'hardStop',       kind: 'text' },
  { form: 'band_size',        key: 'bandSize',       kind: 'text' },
  { form: 'open_to_rec',      key: 'openToRec',      kind: 'bool' },
  { form: 'services',         key: 'services',       kind: 'list' },
  { form: 'genres',           key: 'genres',         kind: 'list' },
  { form: 'sound',            key: 'sound',          kind: 'text' },
  { form: 'lighting',         key: 'lighting',       kind: 'text' },
  { form: 'budget',           key: 'budget',         kind: 'text' },
  { form: 'urgency',          key: 'urgency',        kind: 'text' },
  { form: 'notes',            key: 'notes',          kind: 'text' },
];

export const QUOTE_OPTIONS = {
  eventType: ['Wedding', 'Corporate', 'Private Party', 'Festival', 'Other'],
  setting:   ['Indoor', 'Outdoor', 'Both'],
  guests:    ['Under 50', '50-100', '100-200', '200+'],
  duration:  ['1-2 hrs', '3-4 hrs', '4-5 hrs', '5+ hrs'],
  hardStop:  ['No', 'Yes', 'Unsure'],
  bandSize:  ['Solo/Duo', 'Small (3-4)', 'Medium (5-6)', 'Large (7+)'],
  services:  ['Live Band', 'Cocktail Hour', 'Ceremony', 'MC Services'],
  genres:    ['Rock', 'Pop', 'Motown', 'Country', '90s'],
  sound:     ['Band Provides', 'Venue Provides', 'Unsure'],
  lighting:  ['Basic', 'Enhanced', 'None'],
  budget:    ['Under $2k', '$2k-$4k', '$4k-$6k', '$6k+', 'Prefer not to say'],
  urgency:   ['Information Gathering', 'Ready to Book', 'Immediate'],
};

export const QUOTE_STATUSES = ['New', 'Contacted', 'Quoted', 'Won', 'Lost'];

// Deliberately separate from ClientManager's STATUS_COLORS, which falls through
// to grey for anything it doesn't recognise — all five would look identical.
export const QUOTE_STATUS_COLORS = {
  New:       '#ec4899',
  Contacted: '#3b82f6',
  Quoted:    '#f59e0b',
  Won:       '#22c55e',
  Lost:      '#78716c',
};

/**
 * Read the quote form into a plain document body.
 *
 * Whitelist-driven rather than iterating FormData, so the hidden quote_id and
 * admin_link inputs (which exist only to reach the email template) can never
 * leak into the document and trip the rule's exact-key-set check.
 *
 * Every key is always present — '' / [] / false for blanks — because the rule
 * requires hasAll(), and it keeps the admin UI free of undefined checks.
 */
export function serializeQuoteForm(formEl) {
  const data = new FormData(formEl);
  const out = {};
  for (const { form, key, kind } of QUOTE_FIELDS) {
    if (kind === 'list') out[key] = data.getAll(form).map(String);
    else if (kind === 'bool') out[key] = data.get(form) === 'Yes';
    else out[key] = (data.get(form) ?? '').toString().trim();
  }

  // Campaign provenance — scripts/utm-links.json already drives traffic here,
  // so knowing which campaign produced a lead is worth the four extra fields.
  const params = new URLSearchParams(window.location.search);
  out.utmSource   = (params.get('utm_source') || '').slice(0, 100);
  out.utmMedium   = (params.get('utm_medium') || '').slice(0, 100);
  out.utmCampaign = (params.get('utm_campaign') || '').slice(0, 120);
  out.referrer    = (document.referrer || '').slice(0, 300);
  return out;
}

/** Reject a promise that never settles, so a stalled write can't strand the UI. */
export function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); }),
  ]);
}

/** "Ann Arbor, MI" → { city: 'Ann Arbor', state: 'MI' } */
export function parseCityState(location) {
  const raw = String(location || '').trim();
  if (!raw) return { city: '', state: '' };
  const idx = raw.lastIndexOf(',');
  if (idx === -1) return { city: raw, state: '' };
  const city = raw.slice(0, idx).trim();
  const tail = raw.slice(idx + 1).trim();
  return { city, state: tail.length === 2 ? tail.toUpperCase() : tail };
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Business-shaped leads name the organisation; personal ones name the person. */
const ORG_EVENTS = ['Corporate', 'Festival'];

const CLIENT_TYPE_BY_EVENT = {
  Wedding: 'Private',
  'Private Party': 'Private',
  Other: 'Private',
  Corporate: 'Corporate',
  Festival: 'Venue',
};

/**
 * Map a quote onto CRM client fields. Does NOT set `id` — the caller supplies
 * one, so this stays pure and the id can never be reused across conversions.
 */
export function quoteToClient(quote) {
  const isOrg = ORG_EVENTS.includes(quote.eventType);
  const { city, state } = parseCityState(quote.location);

  const logistics = [
    ['Venue', quote.venue],
    ['Setting', quote.setting],
    ['Guests', quote.guests],
    ['Duration', quote.duration],
    ['Hard stop', quote.hardStop],
    ['Sound', quote.sound],
    ['Lighting', quote.lighting],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);

  const tags = [
    String(quote.eventType || '').toLowerCase().replace(/\s+/g, '-'),
    'web-lead',
    quote.utmCampaign || null,
  ].filter(Boolean);

  return {
    name: isOrg ? (quote.venue || quote.name) : quote.name,
    // Only set separately for organisations — otherwise the list row would
    // render the same name twice, which reads as a bug.
    contactName: isOrg ? quote.name : '',
    type: CLIENT_TYPE_BY_EVENT[quote.eventType] || 'Private',
    status: 'Lead',
    preferredContact: 'Website Form',
    email: quote.email || '',
    phone: quote.phone || '',
    city,
    state,
    // ClientProfile renders `address` as a Maps link, so leading with the venue
    // name makes it an actually searchable query.
    address: [quote.venue, quote.location].filter(Boolean).join(', '),
    venueDetails: logistics.join('\n'),
    tags,
    // Puts the lead straight into the dashboard's Heads Up "Scheduled Contacts".
    nextContactDate: todayLocal(),
  };
}

/** The digest an admin wants before picking up the phone. */
export function buildQuoteLogContent(quote) {
  const lines = [];
  const head = [
    quote.eventType === 'Other' && quote.eventTypeOther ? `Other (${quote.eventTypeOther})` : quote.eventType,
    quote.date,
    quote.location,
  ].filter(Boolean).join(' · ');
  lines.push(`Quote request — ${head}`);

  const detail = [quote.guests, quote.duration, quote.bandSize,
    quote.budget && `Budget ${quote.budget}`, quote.urgency].filter(Boolean).join(' · ');
  if (detail) lines.push(detail);

  if (quote.services?.length) lines.push(`Services: ${quote.services.join(', ')}`);
  if (quote.genres?.length) lines.push(`Genres: ${quote.genres.join(', ')}`);
  if (quote.openToRec) lines.push('Open to recommendations: Yes');
  if (quote.notes) lines.push('', `"${quote.notes}"`);

  const utm = [quote.utmSource, quote.utmMedium, quote.utmCampaign].filter(Boolean).join(' / ');
  if (utm) lines.push('', `Source: ${utm}`);
  return lines.join('\n');
}
