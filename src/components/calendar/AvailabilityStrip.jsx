import { useMembersWithAccounts, useShows, useBandEvents, useAvailabilityMonth } from '../../firebase/useFirestore.js';
import { saveBandEvent, deleteBandEvent } from '../../firestore-service.js';
import { monthOf, rollUpDay, STATE_META } from '../../utils/availability.js';
import MemberAvatar from '../MemberAvatar.jsx';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * "Can we play this date?" — a compact availability read-out for a quote's
 * event date, so a lead can be answered without leaving the quote. Owns its
 * own data (a single month of availability, not a year) so dropping this
 * into QuoteManager costs nothing extra upstream.
 *
 * @param {{ date: string, quoteId: string, quoteName: string, accent: string, createdBy: string }} props
 */
export default function AvailabilityStrip({ date, quoteId, quoteName, accent, createdBy }) {
  const { bandMembers, loading: membersLoading } = useMembersWithAccounts();
  const { data: shows = [] } = useShows();
  const { data: bandEvents = [] } = useBandEvents();
  const { data: monthDocs = [] } = useAvailabilityMonth(monthOf(date));

  if (membersLoading) return null;

  const docsByMember = new Map(monthDocs.map(d => [d.memberId, d]));
  const { states, counts, worst } = rollUpDay(bandMembers, docsByMember, date);
  const worstMeta = STATE_META[worst];

  const conflictShow = shows.find(s => s.date === date);
  const dayEvents = bandEvents.filter(e => e.date && date >= e.date && date <= (e.endDate || e.date));
  const existingHold = bandEvents.find(e => e.type === 'hold' && e.relatedQuoteId === quoteId);

  async function toggleHold() {
    if (existingHold) {
      await deleteBandEvent(existingHold.id);
      return;
    }
    await saveBandEvent({
      id: uuid(),
      type: 'hold',
      title: `Hold — ${quoteName || 'lead'}`,
      date,
      endDate: date,
      allDay: true,
      memberIds: [],
      relatedQuoteId: quoteId,
      createdBy,
    });
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold">Availability for this date</p>
        <a href={`/calendar?date=${date}`} className="text-[11px] hover:underline" style={{ color: accent }}>
          Open in Calendar <i className="fas fa-arrow-up-right-from-square text-[9px] ml-0.5" />
        </a>
      </div>

      <p className="text-sm font-semibold" style={{ color: worstMeta.color }}>
        {counts.available} available · {counts.maybe} maybe · {counts.unavailable} unavailable
        {counts.unknown > 0 ? ` · ${counts.unknown} not synced` : ''}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {bandMembers.map(m => {
          const state = states.get(m.id) || 'unknown';
          const meta = STATE_META[state];
          return (
            <div key={m.id} className="flex flex-col items-center gap-1" title={`${m.name} — ${meta.label}`}>
              <div className="rounded-full" style={{ boxShadow: `0 0 0 2px ${meta.color}${state === 'unknown' ? '80' : ''}` }}>
                <MemberAvatar name={m.name} photoUrl={m.avatarUrl} color={m.color} size={28} />
              </div>
              <span className="text-[9px] text-[#666] max-w-[44px] truncate">{m.name}</span>
            </div>
          );
        })}
      </div>

      {conflictShow && (
        <a href={`/shows?show=${conflictShow.id}`} className="block text-xs px-3 py-2 rounded-lg bg-[#a78bfa]/10 border border-[#a78bfa]/30 text-[#a78bfa] hover:bg-[#a78bfa]/15">
          <i className="fas fa-calendar-days mr-1.5" />Show already booked — {conflictShow.venue || 'see details'}
        </a>
      )}

      {dayEvents.filter(e => e.id !== existingHold?.id).length > 0 && (
        <div className="space-y-1">
          {dayEvents.filter(e => e.id !== existingHold?.id).map(e => (
            <p key={e.id} className="text-xs text-[#888]">
              <i className="fas fa-circle text-[6px] mr-1.5 align-middle" />{e.title || e.type}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={toggleHold}
        className="w-full py-2 rounded-lg text-xs font-semibold transition-colors"
        style={existingHold
          ? { background: '#f59e0b26', color: '#f59e0b', border: '1px solid #f59e0b55' }
          : { background: `${accent}18`, color: accent, border: `1px solid ${accent}40` }}
      >
        {existingHold ? 'Release hold' : 'Hold this date'}
      </button>
    </div>
  );
}
