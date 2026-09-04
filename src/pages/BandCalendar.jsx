import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard.jsx';
import AdminShell from '../components/admin/AdminShell.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { useAuth } from '../firebase/AuthContext.jsx';
import { useMembersWithAccounts, useShows, useBandEvents, useAvailability, useQuotes, useIsAdmin } from '../firebase/useFirestore.js';
import { markAvailabilityRange } from '../firestore-service.js';
import {
  toDateKey, monthOf, addMonths, monthsBetween, eachDateKey, normalizeDateKey,
  rollUpDay, STATE_META, AVAILABILITY_STATES,
} from '../utils/availability.js';
import CalendarScroller from '../components/calendar/CalendarScroller.jsx';
import RangeMarkBar from '../components/calendar/RangeMarkBar.jsx';
import BandEventModal from '../components/calendar/BandEventModal.jsx';
import SyncCard from '../components/calendar/SyncCard.jsx';

// Matches the 'calendar' entry in AdminShell's APPS table
export const CALENDAR_ACCENT = '#14b8a6';

const MAX_RENDERED_MONTHS = 48;
const MOBILE_QUERY = '(max-width: 767px)';

const EVENT_TYPE_COLOR = {
  rehearsal: '#14b8a6',
  hold: '#f59e0b',
  deadline: '#ec4899',
  blackout: '#ef4444',
};

/** Parses 'YYYY-MM-DD' as local, avoiding the UTC-midnight day shift. */
function formatDateKey(dateKey) {
  if (!dateKey) return '';
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function monthCount(startMonth, endMonth) {
  let n = 0;
  let m = startMonth;
  while (m <= endMonth && n < 1000) { n++; m = addMonths(m, 1); }
  return n;
}

/** Tracks a CSS breakpoint via matchMedia — same 767px cutoff as the
 * .admin-drawer mobile-overlay rule in assets/css/styles.css, since this page
 * doesn't use that drawer system (see leftPanel below) and needs its own
 * mobile/desktop split in JS to decide whether a day tap opens a modal. */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

function Legend() {
  const items = ['available', 'maybe', 'unavailable', 'unknown'];
  return (
    <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-b border-[#2a2a2a] flex-wrap">
      {items.map(key => {
        const meta = STATE_META[key];
        return (
          <span key={key} className="flex items-center gap-1.5 text-[10px] text-[#888]">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: meta.color, opacity: key === 'unknown' ? 0.5 : 1 }} />
            {meta.shortLabel}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The "⋯" overflow — houses the controls that are useful but not worth
 * permanent toolbar real estate: jumping to an arbitrary year, filtering the
 * grid to one member, and opening the range-marking modal. Closes on an
 * outside click, same pattern as AdminShell's app-switcher dropdown.
 */
function OverflowMenu({
  yearOptions, onJumpToYear, memberFilter, onChangeMemberFilter, members, canEdit, onOpenMarkModal,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const SELECT = 'w-full px-2 py-1.5 rounded-lg text-sm bg-[#121212] border border-[#2a2a2a] text-[#ccc]';

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title="More"
        className="px-3 py-2 rounded-lg text-[#888] border border-[#2a2a2a] hover:text-white hover:border-[#3a3a3a] transition-colors"
      >
        <i className="fas fa-ellipsis-vertical text-sm" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl overflow-hidden shadow-2xl p-3 space-y-3 text-left"
          style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          <div>
            <label className="block text-[10px] text-[#666] uppercase tracking-wider font-semibold mb-1">Jump to year</label>
            <select
              onChange={e => { onJumpToYear(Number(e.target.value)); setOpen(false); }}
              defaultValue=""
              className={SELECT}
            >
              <option value="" disabled>Choose a year…</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-[#666] uppercase tracking-wider font-semibold mb-1">Filter</label>
            <select value={memberFilter} onChange={e => onChangeMemberFilter(e.target.value)} className={SELECT}>
              <option value="all">All members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {canEdit && (
            <>
              <div className="h-px bg-[#2a2a2a]" />
              <button
                onClick={() => { setOpen(false); onOpenMarkModal(); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-[#ccc] hover:bg-white/5 transition-colors"
              >
                <i className="fas fa-calendar-check text-xs" style={{ color: CALENDAR_ACCENT }} />
                Mark availability
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DayDetailPanel({
  dateKey, shows, events, quotes, members, memberIndex, docsByMemberForMonth,
  canEdit, markingMember, onSetDay, settingDay, onEditEvent,
}) {
  if (!dateKey) {
    return <div className="p-4 text-sm text-[#555]">Select a day to see details.</div>;
  }
  const { states, counts, worst } = rollUpDay(members, docsByMemberForMonth, dateKey);
  const worstMeta = STATE_META[worst];
  const myState = markingMember ? (states.get(markingMember.id) || 'unknown') : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
      <div>
        <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-1">Selected day</p>
        <h3 className="text-base font-bold text-white">{formatDateKey(dateKey)}</h3>
      </div>

      {canEdit && markingMember && (
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-2">
            {markingMember.name}'s availability this day
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {AVAILABILITY_STATES.map(state => {
              const on = myState === state;
              const meta = STATE_META[state];
              return (
                <button
                  key={state}
                  type="button"
                  disabled={settingDay}
                  onClick={() => onSetDay(state)}
                  className="py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  style={on
                    ? { background: meta.color, color: '#121212' }
                    : { background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}40` }}
                >
                  {meta.label}
                </button>
              );
            })}
            <button
              type="button"
              disabled={settingDay}
              onClick={() => onSetDay(null)}
              className="py-1.5 rounded-lg text-xs font-semibold text-[#888] border border-[#2a2a2a] disabled:opacity-50 col-span-2"
            >
              Clear (revert to synced/unknown)
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-2">Whole band</p>
        <p className="text-xs mb-2" style={{ color: worstMeta.color }}>
          {counts.available} available · {counts.maybe} maybe · {counts.unavailable} unavailable
          {counts.unknown > 0 ? ` · ${counts.unknown} not synced` : ''}
        </p>
        <div className="space-y-1.5">
          {members.map(m => {
            const state = states.get(m.id) || 'unknown';
            const meta = STATE_META[state];
            return (
              <div key={m.id} className="flex items-center gap-2">
                <MemberAvatar name={m.name} photoUrl={m.avatarUrl} color={m.color} size={20} />
                <span className="text-sm text-[#ccc] flex-1 truncate">{m.name}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: meta.color, background: `${meta.color}18` }}>
                  {meta.shortLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {shows.length > 0 && (
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-2">Shows</p>
          <div className="space-y-2">
            {shows.map(s => (
              <Link
                key={s.id}
                to={`/shows?show=${s.id}`}
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[#151515] border border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{s.venue || 'Unnamed show'}</div>
                  <div className="text-xs text-[#888] mt-0.5 truncate">
                    {[s.startTime, [s.city, s.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                  </div>
                  {s.personnel?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {s.personnel.map(p => {
                        const m = memberIndex.get(p);
                        return (
                          <span
                            key={p}
                            className="inline-flex items-center gap-1 text-[10px] pl-0.5 pr-2 py-0.5 rounded-full font-semibold"
                            style={{ background: `${m.color}15`, color: m.color, border: `1px solid ${m.color}30` }}
                          >
                            <MemberAvatar name={m.name} photoUrl={m.avatarUrl} size={14} color={m.color} />
                            {m.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <i className="fas fa-chevron-right text-[10px] text-[#444] mt-1.5 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-2">Band events</p>
          <div className="space-y-1.5">
            {events.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={() => onEditEvent?.(e)}
                className="block w-full text-left text-sm truncate hover:underline"
                style={{ color: EVENT_TYPE_COLOR[e.type] || '#888' }}
              >
                <i className="fas fa-circle text-[6px] mr-1.5 align-middle" />{e.title || e.type}
              </button>
            ))}
          </div>
        </div>
      )}

      {quotes.length > 0 && (
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-2">Leads for this date</p>
          <div className="space-y-1.5">
            {quotes.map(q => (
              <Link key={q.id} to={`/quotes?id=${q.id}`} className="block text-sm text-[#ec4899] hover:underline truncate">
                <i className="fas fa-file-invoice-dollar text-xs mr-1.5" />{q.name || 'Untitled lead'}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Mobile-only day detail: the drawer sidebar doesn't render below 768px (see
 * leftPanel), so a tapped day surfaces the same DayDetailPanel content here
 * instead — a bottom sheet on phones, matching the house modal chrome used by
 * BandEventModal/RangeMarkBar/SyncCard. */
function DayDetailModal({ open, onClose, ...panelProps }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-t-2xl sm:rounded-xl w-full sm:max-w-md sm:m-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-end px-3 pt-2">
          <button onClick={onClose} className="text-[#666] hover:text-white text-xl leading-none p-1">&times;</button>
        </div>
        <DayDetailPanel {...panelProps} />
      </div>
    </div>
  );
}

function BandCalendarContent() {
  const { user } = useAuth();
  const memberIndex = useMembersWithAccounts();
  const { bandMembers, loading: membersLoading } = memberIndex;
  const { data: shows = [] } = useShows();
  const { data: bandEvents = [] } = useBandEvents();
  const { isAdmin } = useIsAdmin();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const todayKey = toDateKey(new Date());
  const todayMonth = monthOf(todayKey);

  // selectedDate is local state, not derived straight from searchParams: an
  // earlier version read it live from the URL, and setSearchParams() (which
  // goes through the router's own navigate()) doesn't always land in the same
  // commit as the rest of the click handler's state updates — a day tap could
  // paint one frame with the old date/availability before the URL caught up
  // and everything "clicked into place". Local state updates synchronously
  // with dayModalOpen instead; the URL is kept as a mirror (for deep links
  // like QuoteManager's "Open in Calendar") via the effect below, not as the
  // source of truth the UI renders from.
  const [selectedDate, setSelectedDate] = useState(() => searchParams.get('date') || todayKey);
  useEffect(() => {
    const urlDate = searchParams.get('date');
    if (urlDate && urlDate !== selectedDate) setSelectedDate(urlDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [rangeStart, setRangeStart] = useState(() => addMonths(todayMonth, -2));
  const [rangeEnd, setRangeEnd] = useState(() => addMonths(todayMonth, 14));
  // Fixed at mount — whichever month should be in view on page load (today,
  // or a deep-linked ?date=). Deliberately not reactive to later clicks.
  const [initialMonth] = useState(() => monthOf(selectedDate));
  const [pendingScrollTarget, setPendingScrollTarget] = useState(null);
  const [memberFilter, setMemberFilter] = useState('all'); // 'all' | memberId
  const [markingMemberOverride, setMarkingMemberOverride] = useState(null);
  const [settingDay, setSettingDay] = useState(false);
  const [eventModal, setEventModal] = useState(null); // null | { initialDate, event }
  const [markModalOpen, setMarkModalOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [dayModalOpen, setDayModalOpen] = useState(false);

  // If the window is resized/rotated past the breakpoint while the mobile day
  // sheet is open, don't leave it stranded — it has no desktop equivalent.
  useEffect(() => {
    if (!isMobile) setDayModalOpen(false);
  }, [isMobile]);

  const { data: availabilityDocs = [] } = useAvailability(rangeStart, rangeEnd);
  const { data: quotes = [] } = useQuotes();

  const scrollerRef = useRef(null);
  const ownMember = bandMembers.find(m => m.googleUid && m.googleUid === user?.uid) || null;

  // Non-admins can only ever mark themselves — enforced again by firestore.rules,
  // this is just the UI reflecting that. Admins may pick anyone, defaulting to
  // their own member record (or the first member, if they have none).
  const markingMemberId = isAdmin
    ? (markingMemberOverride || ownMember?.id || bandMembers[0]?.id || '')
    : (ownMember?.id || '');
  const canEdit = !!markingMemberId;

  const visibleMembers = useMemo(
    () => (memberFilter === 'all' ? bandMembers : bandMembers.filter(m => m.id === memberFilter)),
    [bandMembers, memberFilter],
  );

  const months = useMemo(() => monthsBetween(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  const showsByDate = useMemo(() => {
    const map = new Map();
    for (const s of shows) {
      // Some shows still carry a legacy 'M/D/YYYY' date from the original
      // Firestore migration and were never re-saved through ShowManager's
      // <input type="date"> (which always writes ISO) — normalize or they
      // silently vanish from the calendar instead of erroring.
      const key = normalizeDateKey(s.date);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [shows]);

  const quotesByDate = useMemo(() => {
    const map = new Map();
    for (const q of quotes) {
      const key = normalizeDateKey(q.date);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(q);
    }
    return map;
  }, [quotes]);

  const eventsByDate = useMemo(() => {
    const map = new Map();
    for (const e of bandEvents) {
      if (!e.date) continue;
      for (const key of eachDateKey(e.date, e.endDate || e.date)) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(e);
      }
    }
    return map;
  }, [bandEvents]);

  const availabilityByMonth = useMemo(() => {
    const map = new Map();
    for (const doc of availabilityDocs) {
      if (!map.has(doc.month)) map.set(doc.month, new Map());
      map.get(doc.month).set(doc.memberId, doc);
    }
    return map;
  }, [availabilityDocs]);

  const selectedMonth = monthOf(selectedDate);
  const docsByMemberForSelectedMonth = availabilityByMonth.get(selectedMonth) || new Map();

  const ownMemberDocsByMonth = useMemo(() => {
    const map = new Map();
    if (!ownMember) return map;
    for (const [month, byMember] of availabilityByMonth) {
      const doc = byMember.get(ownMember.id);
      if (doc) map.set(month, doc);
    }
    return map;
  }, [availabilityByMonth, ownMember]);

  const hasSyncedOnce = [...ownMemberDocsByMonth.values()].some(d => d.syncedAt);

  const handleSelectDate = useCallback((dateKey) => {
    setSelectedDate(dateKey);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('date', dateKey);
      return next;
    }, { replace: true });
    // Desktop keeps the static sidebar in view at all times; mobile has no
    // sidebar at all (see leftPanel), so a tap needs to surface details itself.
    if (isMobile) setDayModalOpen(true);
  }, [setSearchParams, isMobile]);

  const extendPast = useCallback(() => {
    setRangeStart(prev => {
      if (monthCount(prev, rangeEnd) >= MAX_RENDERED_MONTHS) return prev;
      return addMonths(prev, -12);
    });
  }, [rangeEnd]);

  const extendFuture = useCallback(() => {
    setRangeEnd(prev => {
      if (monthCount(rangeStart, prev) >= MAX_RENDERED_MONTHS) return prev;
      return addMonths(prev, 12);
    });
  }, [rangeStart]);

  useEffect(() => {
    if (pendingScrollTarget && months.includes(pendingScrollTarget)) {
      scrollerRef.current?.scrollToMonth(pendingScrollTarget, { smooth: true });
      setPendingScrollTarget(null);
    }
  }, [pendingScrollTarget, months]);

  function goToToday() {
    setPendingScrollTarget(todayMonth);
  }

  function jumpToYear(year) {
    const target = `${year}-01`;
    setRangeStart(prev => (target < prev ? target : prev));
    setRangeEnd(prev => (`${year}-12` > prev ? `${year}-12` : prev));
    setPendingScrollTarget(target);
  }

  async function handleSetDay(state) {
    if (!markingMemberId || !selectedDate) return;
    setSettingDay(true);
    try {
      await markAvailabilityRange(markingMemberId, selectedDate, selectedDate, state);
    } catch (err) {
      alert(err.message || 'Could not save — try again.');
    } finally {
      setSettingDay(false);
    }
  }

  function handleCloseEventModal() {
    setEventModal(null);
  }

  const yearOptions = [];
  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 2; y <= thisYear + 3; y++) yearOptions.push(y);

  const dayDetailProps = {
    dateKey: selectedDate,
    shows: showsByDate.get(selectedDate) || [],
    events: eventsByDate.get(selectedDate) || [],
    quotes: quotesByDate.get(selectedDate) || [],
    members: bandMembers,
    memberIndex,
    docsByMemberForMonth: docsByMemberForSelectedMonth,
    canEdit,
    markingMember: bandMembers.find(m => m.id === markingMemberId) || null,
    onSetDay: handleSetDay,
    settingDay,
    onEditEvent: e => setEventModal({ initialDate: e.date, event: e }),
  };

  // Desktop-only static sidebar — deliberately not the shared .admin-drawer
  // mobile-overlay system (compare ShowManager/QuoteManager): on a phone this
  // page has no side panel at all, a tapped day opens DayDetailModal instead.
  const leftPanel = (
    <div className="hidden md:flex md:flex-col overflow-hidden bg-[#1a1a1a] border-r border-[#2a2a2a] text-left">
      <DayDetailPanel {...dayDetailProps} />
    </div>
  );

  const rightPanel = (
    <div className="flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a]">
        <button
          onClick={goToToday}
          className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: `${CALENDAR_ACCENT}26`, color: CALENDAR_ACCENT }}
        >
          Today
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setSyncModalOpen(true)}
          title="Sync Google Calendar"
          className="shrink-0 px-3 py-2 rounded-lg text-sm font-semibold transition-colors relative"
          style={{ background: `${CALENDAR_ACCENT}18`, color: CALENDAR_ACCENT, border: `1px solid ${CALENDAR_ACCENT}40` }}
        >
          <i className="fab fa-google mr-1.5" />Sync
          {hasSyncedOnce && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#14b8a6]" />
          )}
        </button>
        <button
          onClick={() => setEventModal({ initialDate: selectedDate, event: null })}
          className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-[#888] border border-[#2a2a2a] hover:text-white hover:border-[#3a3a3a] transition-colors"
        >
          <i className="fas fa-plus text-xs mr-1.5" />Event
        </button>
        <OverflowMenu
          yearOptions={yearOptions}
          onJumpToYear={jumpToYear}
          memberFilter={memberFilter}
          onChangeMemberFilter={setMemberFilter}
          members={bandMembers}
          canEdit={canEdit}
          onOpenMarkModal={() => setMarkModalOpen(true)}
        />
      </div>
      <Legend />
      {membersLoading ? (
        <div className="flex-1 flex items-center justify-center text-[#555]">Loading…</div>
      ) : (
        <CalendarScroller
          ref={scrollerRef}
          months={months}
          initialMonth={initialMonth}
          members={visibleMembers}
          availabilityByMonth={availabilityByMonth}
          showsByDate={showsByDate}
          eventsByDate={eventsByDate}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          todayKey={todayKey}
          onNeedPast={extendPast}
          onNeedFuture={extendFuture}
        />
      )}
    </div>
  );

  return (
    <AdminShell activeApp="calendar" hideDrawerToggle>
      <div className="admin-page-grid flex-1 min-h-0 grid overflow-hidden">
        {leftPanel}
        {rightPanel}
      </div>
      {eventModal && (
        <BandEventModal
          open
          onClose={handleCloseEventModal}
          initialDate={eventModal.initialDate}
          event={eventModal.event}
          members={bandMembers}
          createdBy={ownMember?.name || user?.displayName || 'Admin'}
        />
      )}
      {canEdit && markModalOpen && (
        <RangeMarkBar
          open
          onClose={() => setMarkModalOpen(false)}
          members={bandMembers}
          isAdmin={isAdmin}
          ownMemberId={ownMember?.id || null}
          markingMemberId={markingMemberId}
          onChangeMarkingMember={setMarkingMemberOverride}
          defaultDate={selectedDate}
        />
      )}
      {syncModalOpen && (
        <SyncCard
          open
          onClose={() => setSyncModalOpen(false)}
          member={ownMember}
          userEmail={user?.email || ''}
          syncedDocsByMonth={ownMemberDocsByMonth}
        />
      )}
      <DayDetailModal open={dayModalOpen} onClose={() => setDayModalOpen(false)} {...dayDetailProps} />
    </AdminShell>
  );
}

export default function BandCalendar() {
  return (
    <AuthGuard>
      <BandCalendarContent />
    </AuthGuard>
  );
}
