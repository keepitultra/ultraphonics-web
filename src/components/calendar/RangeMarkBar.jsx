import { useState } from 'react';
import { AVAILABILITY_STATES, STATE_META } from '../../utils/availability.js';
import { markAvailabilityRange } from '../../firestore-service.js';

const WEEKDAYS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
];

const INPUT = 'w-full px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm focus:outline-none focus:border-[#14b8a6]';

/**
 * "Mark a range" — the reliable, accessible path for setting availability
 * across several days at once (native <input type="date"> gives an iPad
 * roller, no drag-select needed). A live tap-anchor-tap flow directly on the
 * scroller is a nice-to-have for later; this covers the full feature today.
 *
 * Who gets marked is the highest-risk mistake here, so it's never implicit:
 * non-admins can only mark themselves (also enforced by firestore.rules);
 * admins get a member picker that turns the card amber when marking someone
 * else, so it's visually obvious whose calendar is about to change.
 *
 * @param {{
 *   open: boolean, onClose: () => void,
 *   members: Array<{id:string,name:string,color:string}>, isAdmin: boolean,
 *   ownMemberId: string|null, markingMemberId: string, onChangeMarkingMember: (id:string) => void,
 *   defaultDate: string,
 * }} props
 */
export default function RangeMarkBar({ open, onClose, members, isAdmin, ownMemberId, markingMemberId, onChangeMarkingMember, defaultDate }) {
  const [start, setStart] = useState(defaultDate);
  const [end, setEnd] = useState(defaultDate);
  const [weekdays, setWeekdays] = useState([]); // empty = every day
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (!open) return null;

  const markingMember = members.find(m => m.id === markingMemberId);
  const amber = isAdmin && !!ownMemberId && markingMemberId !== ownMemberId;

  function toggleWeekday(v) {
    setWeekdays(prev => (prev.includes(v) ? prev.filter(d => d !== v) : [...prev, v]));
  }

  async function commit(state) {
    if (!markingMemberId || !start || !end) return;
    if (start > end) { setMessage('Start date must be before end date.'); return; }
    setBusy(true);
    setMessage('');
    try {
      await markAvailabilityRange(markingMemberId, start, end, state, {
        weekdays: weekdays.length ? weekdays : undefined,
      });
      setMessage(state === null ? 'Cleared.' : `Marked ${STATE_META[state].label.toLowerCase()}.`);
    } catch (err) {
      setMessage(err.message || 'Could not save — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => onClose()}>
      <div
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl w-full max-w-sm max-h-[85vh] overflow-y-auto p-5 space-y-2.5 text-left"
        style={amber ? { background: '#1a1a1a', borderColor: '#f59e0b40' } : {}}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: amber ? '#f59e0b' : 'white' }}>Mark availability</h3>
          <button onClick={onClose} className="text-[#666] hover:text-white text-lg leading-none">&times;</button>
        </div>

        {isAdmin && (
          <select
            value={markingMemberId}
            onChange={e => onChangeMarkingMember(e.target.value)}
            className={INPUT}
          >
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {amber && <p className="text-[11px] text-[#f59e0b]">Marking {markingMember?.name}'s calendar, not your own.</p>}

        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className={INPUT} />
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className={INPUT} />
        </div>

        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map(d => {
            const on = weekdays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleWeekday(d.value)}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                style={on
                  ? { background: '#14b8a626', color: '#14b8a6', border: '1px solid #14b8a655' }
                  : { color: '#777', border: '1px solid #2a2a2a' }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        {weekdays.length > 0 && (
          <p className="text-[10px] text-[#666]">Only {weekdays.map(v => WEEKDAYS[v].label).join(', ')} in range.</p>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {AVAILABILITY_STATES.map(state => (
            <button
              key={state}
              type="button"
              disabled={busy}
              onClick={() => commit(state)}
              className="py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ background: `${STATE_META[state].color}20`, color: STATE_META[state].color, border: `1px solid ${STATE_META[state].color}50` }}
            >
              {STATE_META[state].label}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => commit(null)}
            className="py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 text-[#888] border border-[#2a2a2a]"
          >
            Clear
          </button>
        </div>

        {message && <p className="text-[11px] text-[#888]">{message}</p>}
      </div>
    </div>
  );
}
