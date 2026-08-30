import { useState } from 'react';
import { parseTimeToHM } from '../../utils.js';
import { saveBandEvent, deleteBandEvent } from '../../firestore-service.js';

const EVENT_TYPES = [
  { value: 'rehearsal', label: 'Rehearsal', color: '#14b8a6' },
  { value: 'hold', label: 'Hold', color: '#f59e0b' },
  { value: 'deadline', label: 'Deadline', color: '#ec4899' },
  { value: 'blackout', label: 'Blackout', color: '#ef4444' },
];

const INPUT = 'w-full px-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm focus:outline-none focus:border-[#14b8a6]';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** 'HH:MM' (24h, from <input type="time">) -> 'H:MM AM/PM', matching the
 * shows/{startTime,endTime} storage convention (see ShowManager.jsx). */
function fromTimeInputValue(val) {
  if (!val) return '';
  const [hStr, mStr] = val.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}

/** 'H:MM AM/PM' -> 'HH:MM' (24h) for <input type="time">, via the shared parser. */
function toTimeInputValue(val) {
  if (!val) return '';
  const { hours, minutes } = parseTimeToHM(val);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function blank(date) {
  return {
    id: null, type: 'rehearsal', title: '', date: date || '', endDate: date || '',
    allDay: true, startTime: '', endTime: '', location: '', memberIds: [],
  };
}

/**
 * Create/edit modal for band events (rehearsals, holds, deadlines, blackouts).
 * Shared band-operational records, not per-person claims — any allowlisted
 * user may create, edit, or delete one (see firestore.rules).
 *
 * @param {{ open: boolean, onClose: () => void, initialDate: string, event?: object,
 *   members: Array<{id:string,name:string}>, createdBy: string }} props
 */
export default function BandEventModal({ open, onClose, initialDate, event, members, createdBy }) {
  const [form, setForm] = useState(() => event ? { ...blank(initialDate), ...event } : blank(initialDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleMember(id) {
    setForm(prev => ({
      ...prev,
      memberIds: prev.memberIds.includes(id) ? prev.memberIds.filter(m => m !== id) : [...prev.memberIds, id],
    }));
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.date) { setError('Date is required.'); return; }
    if (form.endDate && form.endDate < form.date) { setError('End date must be on or after the start date.'); return; }
    setBusy(true);
    setError('');
    try {
      await saveBandEvent({
        id: form.id || uuid(),
        type: form.type,
        title: form.title.trim(),
        date: form.date,
        endDate: form.endDate || form.date,
        allDay: form.allDay,
        startTime: form.allDay ? '' : form.startTime,
        endTime: form.allDay ? '' : form.endTime,
        location: form.location,
        memberIds: form.memberIds,
        relatedQuoteId: form.relatedQuoteId || null,
        relatedShowId: form.relatedShowId || null,
        createdBy: form.createdBy || createdBy,
      });
      onClose(true);
    } catch (err) {
      setError(err.message || 'Could not save — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!form.id || !confirm('Delete this event?')) return;
    setBusy(true);
    try {
      await deleteBandEvent(form.id);
      onClose(true);
    } catch (err) {
      setError(err.message || 'Could not delete — try again.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => onClose(false)}>
      <div
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4 text-left"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">{form.id ? 'Edit event' : 'New band event'}</h3>
          <button onClick={() => onClose(false)} className="text-[#666] hover:text-white text-lg leading-none">&times;</button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map(t => {
            const on = form.type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setField('type', t.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={on ? { background: `${t.color}26`, color: t.color, border: `1px solid ${t.color}55` } : { color: '#777', border: '1px solid #2a2a2a' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">Title</label>
          <input value={form.title} onChange={e => setField('title', e.target.value)} placeholder="Load-in rehearsal" className={INPUT} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">Start date</label>
            <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">End date</label>
            <input type="date" value={form.endDate} onChange={e => setField('endDate', e.target.value)} className={INPUT} />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.allDay} onChange={e => setField('allDay', e.target.checked)} className="w-4 h-4 rounded accent-[#14b8a6]" />
          <span className="text-sm text-[#ccc]">All day</span>
        </label>

        {!form.allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">Start time</label>
              <input type="time" value={toTimeInputValue(form.startTime)} onChange={e => setField('startTime', fromTimeInputValue(e.target.value))} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">End time</label>
              <input type="time" value={toTimeInputValue(form.endTime)} onChange={e => setField('endTime', fromTimeInputValue(e.target.value))} className={INPUT} />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">Location</label>
          <input value={form.location} onChange={e => setField('location', e.target.value)} className={INPUT} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">Who's needed (blank = whole band)</label>
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => {
              const on = form.memberIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMember(m.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                  style={on ? { background: `${m.color}26`, color: m.color, border: `1px solid ${m.color}55` } : { color: '#777', border: '1px solid #2a2a2a' }}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-400 bg-red-950/30 rounded p-2">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {form.id && (
            <button onClick={handleDelete} disabled={busy} className="px-3 py-2 rounded-lg text-sm font-semibold text-red-400 border border-red-900/50 hover:bg-red-950/30 disabled:opacity-50">
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => onClose(false)} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-[#888] border border-[#2a2a2a]">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: '#14b8a626', color: '#14b8a6', border: '1px solid #14b8a655' }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
