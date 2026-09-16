// Client-side Google Calendar free/busy sync — no server, no stored
// credentials. Firebase Auth's Google sign-in (src/firebase/AuthContext.jsx)
// never yields a refresh token and can't silently reissue an access token, so
// this uses a separate Google Identity Services (GIS) token client instead,
// reusing the same OAuth Web client Firebase already created for this project
// (see GOOGLE_OAUTH_CLIENT_ID in src/firebase-config.js).
//
// Two scopes: calendar.freebusy (busy/free blocks) and
// calendar.calendarlist.readonly (just the list of calendars a member has —
// id, name, color — so SyncCard can let them pick which ones to sync).
// Never calendar.readonly or anything broader: this code can learn when
// someone is busy and what calendars they have, never what they're busy
// doing. Event titles are never requested or stored.

import { GOOGLE_OAUTH_CLIENT_ID } from '../firebase-config.js';

export const SCOPE_FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy';
export const SCOPE_CALENDAR_LIST = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const CALENDAR_SCOPE = `${SCOPE_FREEBUSY} ${SCOPE_CALENDAR_LIST}`;
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SILENT_TIMEOUT_MS = 6000;
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

export class GoogleAuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

let gisPromise = null;
let tokenClient = null;
/** @type {{ accessToken: string, expiresAt: number } | null} */
let cached = null; // memory only — never persisted, see getAccessToken()

/** Injects the GIS script once and resolves with window.google. */
export function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new GoogleAuthError('gis_load_failed', 'Google sign-in script loaded but oauth2 client is missing.'));
    };
    script.onerror = () => reject(new GoogleAuthError('gis_load_failed', 'Could not load Google sign-in script.'));
    document.head.appendChild(script);
  });
  return gisPromise;
}

function ensureConfigured() {
  if (!GOOGLE_OAUTH_CLIENT_ID) {
    throw new GoogleAuthError('not_configured', 'Google Calendar sync is not set up yet — GOOGLE_OAUTH_CLIENT_ID is empty in src/firebase-config.js.');
  }
}

async function ensureTokenClient(google, hint) {
  if (tokenClient) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    scope: CALENDAR_SCOPE,
    hint,
    callback: () => {}, // replaced per-request in getAccessToken()
    error_callback: () => {},
  });
  return tokenClient;
}

export function hasValidToken() {
  return !!cached && cached.expiresAt > Date.now();
}

/**
 * @param {{ interactive: boolean, hint?: string }} opts
 *   interactive:false attempts a silent (prompt:'') reissue and rejects with
 *   GoogleAuthError('interaction_required') if nothing comes back within
 *   SILENT_TIMEOUT_MS — GIS gives no reliable explicit "silent failed" signal
 *   in every browser, so a timeout is the practical detection.
 *   interactive:true shows the Google consent popup and MUST be called from
 *   inside a user gesture (a click handler), or the popup will be blocked.
 * @returns {Promise<{accessToken: string, expiresAt: number}>}
 */
export async function getAccessToken(opts = {}) {
  ensureConfigured();
  if (hasValidToken() && !opts.interactive) return cached;

  const google = await loadGis();
  const client = await ensureTokenClient(google, opts.hint);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    client.callback = (resp) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (resp.error) {
        reject(new GoogleAuthError(resp.error === 'access_denied' ? 'scope_declined' : resp.error, resp.error));
        return;
      }
      if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_FREEBUSY, SCOPE_CALENDAR_LIST)) {
        reject(new GoogleAuthError('scope_declined', 'Calendar access was not granted.'));
        return;
      }
      cached = {
        accessToken: resp.access_token,
        expiresAt: Date.now() + Number(resp.expires_in) * 1000 - TOKEN_EXPIRY_SAFETY_MARGIN_MS,
      };
      resolve(cached);
    };
    client.error_callback = (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const type = err?.type;
      reject(new GoogleAuthError(type === 'popup_failed_to_open' ? 'popup_blocked' : type === 'popup_closed' ? 'popup_closed' : 'unknown', err?.message));
    };

    if (!opts.interactive) {
      // Silent path: no explicit failure callback in some browsers (e.g. when
      // third-party cookies are blocked), so time it out ourselves.
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new GoogleAuthError('interaction_required', 'Silent token refresh did not respond — reconnect required.'));
      }, SILENT_TIMEOUT_MS);
    }

    client.requestAccessToken({ prompt: opts.interactive ? 'consent' : '' });
  });
}

/** Revokes the cached token and clears it, so "Disconnect" actually disconnects. */
export async function disconnect() {
  const google = await loadGis().catch(() => null);
  if (google && cached?.accessToken) {
    await new Promise(resolve => google.accounts.oauth2.revoke(cached.accessToken, resolve));
  }
  cached = null;
}

/**
 * List the calendars a member has access to, for SyncCard's calendar picker.
 * minAccessRole=freeBusyReader is the lowest role in Google's hierarchy
 * (freeBusyReader < reader < writer < owner), so this returns every calendar
 * the member could possibly sync, not just ones they own.
 *
 * @param {string} accessToken
 * @returns {Promise<Array<{id: string, name: string, primary: boolean}>>}
 */
export async function listCalendars(accessToken) {
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=freeBusyReader&fields=items(id,summary,primary)', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) throw new GoogleAuthError('token_expired', 'Google rejected the access token.');
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.error?.message || '';
    throw new Error(`Google Calendar list request failed (${res.status})${detail ? `: ${detail}` : '.'}`);
  }

  const data = await res.json();
  return (data.items || []).map(c => ({ id: c.id, name: c.summary || c.id, primary: !!c.primary }));
}

/**
 * @param {string} accessToken
 * @param {Date} timeMin
 * @param {Date} timeMax
 * @param {string} timeZone IANA zone, e.g. 'America/Detroit'
 * @param {string[]} calendarIds
 * @returns {Promise<Array<{start: string, end: string}>>} RFC3339 busy intervals, merged across calendars
 */
export async function fetchFreeBusy(accessToken, timeMin, timeMax, timeZone, calendarIds) {
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone,
      items: calendarIds.map(id => ({ id })),
    }),
  });

  if (res.status === 401) throw new GoogleAuthError('token_expired', 'Google rejected the access token.');
  if (res.status === 403) {
    const body = await res.json().catch(() => null);
    if (body?.error?.status === 'PERMISSION_DENIED') throw new GoogleAuthError('api_disabled', 'Calendar API is not enabled for this project.');
    throw new GoogleAuthError('forbidden', body?.error?.message);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.error?.message || body?.error?.errors?.map(e => e.reason).join(', ') || '';
    throw new Error(`Google Calendar freeBusy request failed (${res.status})${detail ? `: ${detail}` : '.'}`);
  }

  const data = await res.json();
  const cals = data?.calendars || {};
  if (!Object.keys(cals).length) throw new Error('Google Calendar returned no data for the selected calendars.');

  // A revoked/deleted calendar errors individually without failing the rest
  // of the sync — the other selected calendars' busy data still counts.
  const busy = [];
  for (const cal of Object.values(cals)) {
    if (cal.errors?.length) continue;
    busy.push(...(cal.busy || []));
  }
  return busy;
}

/**
 * Fetch free/busy across a (possibly long) span in 1-month chunks. Google's
 * freeBusy endpoint doesn't silently truncate an overlong range — it hard-
 * rejects with 400 "The requested time range is too long." (confirmed
 * empirically: 3 calendar months alone was already over the line, and the
 * limit isn't documented, so 1 month is the conservative choice rather than
 * chasing the exact undocumented cutoff).
 *
 * @param {string} accessToken
 * @param {Date} timeMin
 * @param {Date} timeMax
 * @param {string} timeZone
 * @param {string[]} calendarIds defaults to just the primary calendar
 */
export async function fetchFreeBusyChunked(accessToken, timeMin, timeMax, timeZone, calendarIds = ['primary']) {
  const busy = [];
  let chunkStart = new Date(timeMin);
  while (chunkStart < timeMax) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setMonth(chunkEnd.getMonth() + 1);
    if (chunkEnd > timeMax) chunkEnd.setTime(timeMax.getTime());
    const chunk = await fetchFreeBusy(accessToken, chunkStart, chunkEnd, timeZone, calendarIds);
    busy.push(...chunk);
    chunkStart = chunkEnd;
  }
  return busy;
}
