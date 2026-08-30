import { useState } from 'react';
import { getAccessToken, fetchFreeBusyChunked, hasValidToken, disconnect, GoogleAuthError } from '../../services/googleCalendar.js';
import { saveSyncedMonth } from '../../firestore-service.js';
import { busyToDayStates, splitByMonth, monthOf, addMonths } from '../../utils/availability.js';

const SYNC_MONTHS_BACK = 1;
const SYNC_MONTHS_FORWARD = 12;

const ERROR_COPY = {
  not_configured: 'Google Calendar sync isn’t set up for this site yet — ask an admin.',
  interaction_required: 'Google needs you to reconnect.',
  popup_blocked: 'Your browser blocked the Google sign-in popup — allow popups for this site and try again.',
  popup_closed: null, // user just closed it — not an error worth showing
  scope_declined: 'Calendar access wasn’t granted — this only reads when you’re busy, never event details.',
  token_expired: 'Google session expired — reconnecting.',
  api_disabled: 'Calendar API isn’t enabled for this project yet — ask an admin.',
};

function errorMessage(err) {
  if (err instanceof GoogleAuthError) return ERROR_COPY[err.code] ?? `Google sign-in error (${err.code}).`;
  return err?.message || 'Something went wrong — try again.';
}

/**
 * "Connect Google Calendar" — client-side, on-demand sync of free/busy only.
 * Only the signed-in member can sync their own calendar (the token lives in
 * their own browser); there is deliberately no way for anyone else to trigger
 * this on someone's behalf.
 *
 * @param {{ open: boolean, onClose: () => void, member: {id:string,name:string}|null,
 *   userEmail: string, syncedDocsByMonth: Map<string,object> }} props
 */
export default function SyncCard({ open, onClose, member, userEmail, syncedDocsByMonth }) {
  const [status, setStatus] = useState('idle'); // idle | syncing | error
  const [message, setMessage] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(() => latestSyncedAt(syncedDocsByMonth));

  if (!open) return null;

  if (!member) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl w-full max-w-sm p-5 text-sm text-[#888] text-left" onClick={e => e.stopPropagation()}>
          <i className="fab fa-google mr-1.5" />Sign in as a linked band member to sync a calendar.
        </div>
      </div>
    );
  }

  async function runSync(interactive) {
    setStatus('syncing');
    setMessage('');
    try {
      const { accessToken } = await getAccessToken({ interactive, hint: userEmail });

      const thisMonth = monthOf(new Date().toISOString().slice(0, 10));
      const startMonth = addMonths(thisMonth, -SYNC_MONTHS_BACK);
      const endMonth = addMonths(thisMonth, SYNC_MONTHS_FORWARD);
      const timeMin = new Date(); timeMin.setMonth(timeMin.getMonth() - SYNC_MONTHS_BACK, 1);
      const timeMax = new Date(); timeMax.setMonth(timeMax.getMonth() + SYNC_MONTHS_FORWARD + 1, 1);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const busy = await fetchFreeBusyChunked(accessToken, timeMin, timeMax, tz);
      const dayStates = busyToDayStates(busy);
      const byMonth = splitByMonth(dayStates);

      // Cover every month in the sync span even if it has no busy days this
      // time, so a now-empty month still gets its stale `synced` entries
      // pruned (see saveSyncedMonth) instead of staying red forever.
      let month = startMonth;
      while (month <= endMonth) {
        const prevDoc = syncedDocsByMonth.get(month);
        await saveSyncedMonth(member.id, month, byMonth.get(month) || {}, prevDoc?.synced || {}, tz);
        month = addMonths(month, 1);
      }

      setStatus('idle');
      setLastSyncedAt(new Date().toISOString());
      setMessage('Synced.');
    } catch (err) {
      setStatus('error');
      const msg = errorMessage(err);
      if (msg) setMessage(msg);
      else setStatus('idle'); // e.g. popup_closed — silent no-op, not an error banner
    }
  }

  async function handleDisconnect() {
    await disconnect();
    setStatus('idle');
    setMessage('Disconnected. Existing synced days stay until your next sync.');
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl w-full max-w-sm p-5 space-y-2.5 text-left"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <i className="fab fa-google" style={{ color: '#14b8a6' }} />Google Calendar
          </h3>
          <button onClick={onClose} className="text-[#666] hover:text-white text-lg leading-none">&times;</button>
        </div>

        {hasValidToken() && (
          <button onClick={handleDisconnect} className="text-[#666] hover:text-white text-[11px]">Disconnect</button>
        )}

        {lastSyncedAt ? (
          <p className="text-[11px] text-[#555]">Last synced {new Date(lastSyncedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
        ) : (
          <p className="text-[11px] text-[#555]">Not synced yet — busy days from your calendar will show up automatically once you connect.</p>
        )}

        <button
          type="button"
          disabled={status === 'syncing'}
          onClick={() => runSync(!hasValidToken())}
          className="w-full py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          style={{ background: '#14b8a626', color: '#14b8a6', border: '1px solid #14b8a655' }}
        >
          {status === 'syncing' ? 'Syncing…' : lastSyncedAt ? 'Sync again' : 'Connect Google Calendar'}
        </button>

        {message && (
          <p className="text-[11px]" style={{ color: status === 'error' ? '#ef4444' : '#666' }}>{message}</p>
        )}
        <p className="text-[10px] text-[#444]">Only reads busy/free time — never event titles.</p>
      </div>
    </div>
  );
}

function latestSyncedAt(syncedDocsByMonth) {
  let latest = null;
  for (const doc of syncedDocsByMonth.values()) {
    if (doc?.syncedAt && (!latest || doc.syncedAt > latest)) latest = doc.syncedAt;
  }
  return latest;
}
