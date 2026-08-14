import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard.jsx';
import AdminShell, { useAdminDrawer } from '../components/admin/AdminShell.jsx';
import AddressAutocomplete from '../components/AddressAutocomplete.jsx';
import { useShows, useSetlists, useClients, useMemberProfiles } from '../firebase/useFirestore.js';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { saveShow, deleteShow, saveSetlist, duplicateSetlist } from '../firestore-service.js';
import { slugify, makeUniqueSlug } from '../utils.js';
import { PERSONNEL, PERSONNEL_COLORS } from '../constants/band.js';

const ACCENT    = '#a78bfa';
const ACCENT_BG = '#7c3aed';

// ── Input styles ─────────────────────────────────────────────────────────
const INPUT = 'w-full px-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm focus:outline-none focus:border-[#a78bfa]';
const SELECT = INPUT;

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(iso[2]) - 1]} ${parseInt(iso[3])}, ${iso[1]}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function extractYear(dateStr) {
  if (!dateStr) return null;
  const iso = dateStr.match(/^(\d{4})-/);
  if (iso) return iso[1];
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : String(d.getFullYear());
}

function formatTime12(timeStr) {
  if (!timeStr) return '';
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return timeStr;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[4]?.toLowerCase();
  if (ampm) return `${h}:${m} ${ampm.toUpperCase()}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

function formatCurrency(n) {
  if (!n) return '—';
  return `$${Number(n).toLocaleString()}`;
}

function openGoogleCalendar(show) {
  function pad(n) { return String(n).padStart(2, '0'); }
  function toGcalDate(dateStr, timeStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const match = timeStr?.match(/(\d+):(\d+)\s*(am|pm)?/i);
    if (!match) return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}`;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = match[3]?.toLowerCase();
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(h)}${pad(m)}00`;
  }
  const start = toGcalDate(show.date, show.startTime);
  const end = toGcalDate(show.date, show.endTime) || start;
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', show.venue || 'Show');
  url.searchParams.set('dates', `${start}/${end}`);
  url.searchParams.set('location', [show.venue, show.city, show.state].filter(Boolean).join(', '));
  const details = [
    `${window.location.origin}/shows?show=${show.id}`,
    show.itinerary && `\n\nItinerary:\n${show.itinerary}`,
    show.notes && `\n\nNotes:\n${show.notes}`,
    show.personnel?.length && `\n\nPersonnel: ${show.personnel.join(', ')}`,
  ].filter(Boolean).join('');
  url.searchParams.set('details', details);
  window.open(url.toString(), '_blank');
}

function openCreateFacebookEvent(show) {
  const lines = [
    `Ultraphonics Live at ${show.venue || 'TBD'}`,
    show.date ? `Date: ${formatDate(show.date)}` : '',
    show.startTime ? `Time: ${[formatTime12(show.startTime), show.endTime && formatTime12(show.endTime)].filter(Boolean).join(' – ')}` : '',
    [show.streetAddress, show.city, show.state, show.postalCode].filter(Boolean).join(', '),
    show.description || '',
  ].filter(Boolean).join('\n');
  navigator.clipboard?.writeText(lines).catch(() => {});
  window.open('https://www.facebook.com/events/create', '_blank');
}

function downloadIcs(show) {
  function toIcsDate(dateStr, timeStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const match = timeStr?.match(/(\d+):(\d+)\s*(am|pm)?/i);
    function pad(n) { return String(n).padStart(2, '0'); }
    if (!match) return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}`;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = match[3]?.toLowerCase();
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(h)}${pad(m)}00`;
  }
  const start = toIcsDate(show.date, show.startTime);
  const end = toIcsDate(show.date, show.endTime) || start;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ultraphonics//EN',
    'BEGIN:VEVENT',
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${show.venue || 'Show'}`,
    `LOCATION:${[show.venue, show.city, show.state].filter(Boolean).join(', ')}`,
    `DESCRIPTION:${(show.itinerary || '').replace(/\n/g, '\\n')}`,
    `URL:${window.location.origin}/shows?show=${show.id}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(show.venue || 'show').replace(/\s+/g, '-')}.ics`;
  a.click();
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ShowManagerPage() {
  return (
    <AuthGuard>
      <ShowManager />
    </AuthGuard>
  );
}

function ShowManager() {
  const { open: drawerOpen, close: closeDrawer } = useAdminDrawer();
  const { data: allShows = [] } = useShows();
  const { data: setlists = [] } = useSetlists();
  const { data: clients = [] } = useClients();
  const memberProfiles = useMemberProfiles();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawShowId = searchParams.get('show') || null;
  const selectedShowId = rawShowId === 'new' ? null : rawShowId;
  const editParam = searchParams.get('edit') === '1';
  const clientIdParam = searchParams.get('clientId') || null;

  const [showSearch, setShowSearch] = useState('');
  const [showYear, setShowYear] = useState(() => localStorage.getItem('sm_showYear') ?? String(new Date().getFullYear()));
  const [showSortDir, setShowSortDir] = useState('asc');
  const [personnelFilter, setPersonnelFilter] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sm_personnelFilter') || '[]'); } catch { return []; }
  });

  function togglePersonnelFilter(name) {
    setPersonnelFilter(prev => {
      const next = prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name];
      localStorage.setItem('sm_personnelFilter', JSON.stringify(next));
      return next;
    });
  }
  const [monthAccordion, setMonthAccordion] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sm_accordion') || '{}'); } catch { return {}; }
  });

  function toggleMonth(key) {
    setMonthAccordion(prev => {
      const next = { ...prev, [key]: !(prev[key] !== false) };
      localStorage.setItem('sm_accordion', JSON.stringify(next));
      return next;
    });
  }

  const [showEditMode, setShowEditMode] = useState(editParam);
  const [showForm, setShowForm] = useState(null);
  const [showDirty, setShowDirty] = useState(false);
  const [savingShow, setSavingShow] = useState(false);

  const selectedShow = allShows.find(s => s.id === selectedShowId) || null;

  // Sync edit mode with URL
  useEffect(() => {
    setShowEditMode(editParam);
  }, [editParam]);

  // Handle ?show=new (optionally with ?clientId=...)
  useEffect(() => {
    if (rawShowId !== 'new') return;
    const id = uuid();
    const defaults = {
      id,
      venue: '', clientId: clientIdParam || '', city: '', state: '',
      date: '', startTime: '', endTime: '',
      eventLink: '', setlistId: '',
      itinerary: '', notes: '',
      personnel: [], eventHandler: '',
      payout: '',
      isPrivate: false, published: false,
    };
    if (clientIdParam) {
      const c = clients.find(x => x.id === clientIdParam);
      if (c) {
        if (c.type === 'Venue') defaults.venue = c.name;
        if (c.address) {
          const parts = c.address.split(',');
          if (parts.length >= 2) {
            defaults.city = parts[parts.length - 2]?.trim() || '';
            const stateZip = parts[parts.length - 1]?.trim().split(' ');
            defaults.state = stateZip[0] || '';
          }
        }
        if (c.defaultStartTime) defaults.startTime = c.defaultStartTime;
        if (c.defaultEndTime) defaults.endTime = c.defaultEndTime;
        if (c.defaultItinerary) defaults.itinerary = c.defaultItinerary;
        if (c.defaultNotes) defaults.notes = c.defaultNotes;
        if (c.rate) defaults.payout = c.rate;
      }
    }
    setShowForm(defaults);
    setShowEditMode(true);
    setShowDirty(false);
    setSearchParams({ show: id, edit: '1' }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawShowId, clients.length]);

  // ── Show filtering ─────────────────────────────────────────────────────────
  const showYears = [...new Set(allShows.map(s => extractYear(s.date)).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

  const filteredShows = allShows
    .filter(s => {
      const yr = extractYear(s.date) || '';
      if (showYear && yr !== showYear) return false;
      if (personnelFilter.length > 0 && !(s.personnel || []).some(p => personnelFilter.includes(p))) return false;
      const text = `${s.venue || ''} ${s.city || ''} ${s.state || ''}`.toLowerCase();
      return text.includes(showSearch.toLowerCase());
    })
    .sort((a, b) => {
      const ta = new Date(a.date).getTime() || 0;
      const tb = new Date(b.date).getTime() || 0;
      return showSortDir === 'desc' ? tb - ta : ta - tb;
    });

  // Group by "MMMM YYYY"
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const showGroups = filteredShows.reduce((acc, s) => {
    let year, month;
    const iso = s.date?.match(/^(\d{4})-(\d{2})/);
    if (iso) {
      year = iso[1]; month = iso[2];
    } else if (s.date) {
      const d = new Date(s.date);
      if (!isNaN(d.getTime())) {
        year = String(d.getFullYear());
        month = String(d.getMonth() + 1).padStart(2, '0');
      }
    }
    const label = year ? `${MONTH_NAMES[parseInt(month) - 1]} ${year}` : 'Unknown';
    const key = year ? `${year}-${month}` : 'unknown';
    if (!acc[key]) acc[key] = { label, shows: [] };
    acc[key].shows.push(s);
    return acc;
  }, {});
  const showGroupKeys = Object.keys(showGroups).sort((a, b) => showSortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b));
  const isSearching = showSearch.trim().length > 0;
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  // ── Navigation ─────────────────────────────────────────────────────────────
  function selectShow(id) {
    setSearchParams({ show: id }, { replace: false });
    setShowEditMode(false);
    closeDrawer();
  }

  // ── Show form helpers ──────────────────────────────────────────────────────
  function openNewShow() {
    const id = uuid();
    const defaults = {
      id,
      venue: '', clientId: '', city: '', state: '',
      date: '', startTime: '', endTime: '',
      eventLink: '', setlistId: '',
      itinerary: '', notes: '',
      personnel: [], eventHandler: '',
      payout: '',
      isPrivate: false, published: false,
    };
    setShowForm(defaults);
    setShowEditMode(true);
    setShowDirty(false);
    setSearchParams({ show: id, edit: '1' }, { replace: false });
  }

  function openEditShow(show) {
    setShowForm({
      ...show,
      personnel: show.personnel || [],
      payout: show.payout || '',
    });
    setShowEditMode(true);
    setShowDirty(false);
    setSearchParams({ show: show.id, edit: '1' }, { replace: false });
  }

  function setShowField(k, v) {
    setShowForm(f => ({ ...f, [k]: v }));
    setShowDirty(true);
  }

  function autoFillFromClient(clientId) {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const updates = { clientId };
    if (c.type === 'Venue') updates.venue = c.name;
    if (c.address) {
      const parts = c.address.split(',');
      if (parts.length >= 2) {
        updates.city = parts[parts.length - 2]?.trim() || '';
        const stateZip = parts[parts.length - 1]?.trim().split(' ');
        updates.state = stateZip[0] || '';
      }
    }
    if (c.defaultStartTime) updates.startTime = c.defaultStartTime;
    if (c.defaultEndTime) updates.endTime = c.defaultEndTime;
    if (c.defaultItinerary) updates.itinerary = c.defaultItinerary;
    if (c.defaultNotes) updates.notes = c.defaultNotes;
    if (c.rate) updates.payout = c.rate;
    setShowForm(f => ({ ...f, ...updates }));
    setShowDirty(true);
  }

  async function handleSaveShow() {
    if (!showForm.date) { alert('Date is required.'); return; }
    setSavingShow(true);
    try {
      const { _pendingSetlist, ...cleanForm } = showForm;
      if (_pendingSetlist) {
        if (!_pendingSetlist.name?.trim()) throw new Error('Setlist name is required.');
        if (_pendingSetlist.type === 'copy' && !_pendingSetlist.sourceId) throw new Error('Choose a template setlist.');
        const newSetlistId = makeUniqueSlug(_pendingSetlist.name, new Set(setlists.map(s => s.id)));
        if (_pendingSetlist.type === 'blank') await saveSetlist(newSetlistId, _pendingSetlist.name, [], {});
        else await duplicateSetlist(newSetlistId, _pendingSetlist.name, _pendingSetlist.sourceId);
        cleanForm.setlistId = newSetlistId;
      }
      // On first save of a new show, swap the temp UUID for a slug based on venue + date
      const isNew = !allShows.find(s => s.id === cleanForm.id);
      let saveId = cleanForm.id;
      if (isNew) {
        const base = [cleanForm.venue, cleanForm.date].filter(Boolean).join('-');
        saveId = makeUniqueSlug(base || 'show', new Set(allShows.map(s => s.id)));
      }
      await saveShow({ ...cleanForm, id: saveId, updatedAt: new Date().toISOString() });
      setShowEditMode(false);
      setShowDirty(false);
      setSearchParams({ show: saveId }, { replace: true });
    } catch (err) { alert('Save failed: ' + err.message); }
    finally { setSavingShow(false); }
  }

  function handleCancelShowEdit() {
    if (showDirty && !window.confirm('Discard changes?')) return;
    setShowEditMode(false);
    setShowDirty(false);
    if (!selectedShow && !allShows.find(s => s.id === selectedShowId)) {
      setSearchParams({}, { replace: true });
    } else if (selectedShowId) {
      setSearchParams({ show: selectedShowId }, { replace: true });
    }
  }

  async function handleDeleteShow() {
    if (!window.confirm('Delete this show?')) return;
    await deleteShow(selectedShowId);
    setSearchParams({}, { replace: true });
  }

  // ── Left panel ─────────────────────────────────────────────────────────────
  const leftPanel = (
    <div className={`admin-drawer flex flex-col overflow-hidden bg-[#1a1a1a] border-r border-[#2a2a2a]${drawerOpen ? ' drawer-open' : ''}`}>
      {/* Show controls */}
      <div className="shrink-0 p-3 border-b border-[#2a2a2a] space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-xs pointer-events-none" />
            <input type="text" value={showSearch} onChange={e => setShowSearch(e.target.value)} placeholder="Search shows..." className="w-full pl-8 pr-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs placeholder-[#555] focus:outline-none focus:border-[#a78bfa]" />
          </div>
          <button onClick={openNewShow} className="shrink-0 px-3 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-xs font-semibold transition-colors">
            <i className="fas fa-plus" />
          </button>
        </div>
        <div className="flex gap-2">
          <select value={showYear} onChange={e => { setShowYear(e.target.value); localStorage.setItem('sm_showYear', e.target.value); }} className="flex-1 px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-[#888] text-xs focus:outline-none focus:border-[#a78bfa]">
            <option value="">All years</option>
            {showYears.map(y => <option key={y}>{y}</option>)}
          </select>
          <select value={showSortDir} onChange={e => setShowSortDir(e.target.value)} className="flex-1 px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-[#888] text-xs focus:outline-none focus:border-[#a78bfa]">
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERSONNEL.map(p => {
            const selected = personnelFilter.includes(p);
            const color = PERSONNEL_COLORS[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePersonnelFilter(p)}
                title={`Filter to shows with ${p}`}
                className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-semibold transition-all"
                style={selected
                  ? { background: `${color}25`, color, border: `1px solid ${color}60` }
                  : { color: '#888', border: '1px solid #2a2a2a' }
                }
              >
                <MemberAvatar name={p} profiles={memberProfiles} color={color} size={14} />
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Show list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {showGroupKeys.length === 0 && (
          <div className="p-8 text-center text-[#555]">
            <i className="fas fa-calendar text-2xl mb-2 block opacity-20" />
            <p className="text-sm">No shows found</p>
          </div>
        )}
        {showGroupKeys.map(key => {
          const { label, shows } = showGroups[key];
          const defaultOpen = key >= currentMonthKey;
          const isOpen = isSearching || (key in monthAccordion ? monthAccordion[key] !== false : defaultOpen);
          return (
            <div key={key}>
              <button
                onClick={() => toggleMonth(key)}
                className="w-full flex items-center justify-between px-4 py-2 bg-[#121212] hover:bg-[#1f1f1f] border-b border-[#2a2a2a] sticky top-0 z-10 transition-colors"
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#888]">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#555] font-mono">{shows.length}</span>
                  <i className={`fas fa-chevron-right text-[10px] text-[#555] transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
                </div>
              </button>
              {isOpen && shows.map(s => (
                <button
                  key={s.id}
                  onClick={() => selectShow(s.id)}
                  className={`w-full text-left px-4 py-3 border-b border-[#2a2a2a] transition-colors ${
                    selectedShowId === s.id ? 'bg-[#a78bfa]/10 border-l-2 border-l-[#a78bfa]' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{s.venue || 'Unnamed Show'}</div>
                      {(s.city || s.state) && <div className="text-xs text-[#888]">{[s.city, s.state].filter(Boolean).join(', ')}</div>}
                      {s.personnel?.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          {s.personnel.slice(0, 5).map(p => (
                            <MemberAvatar key={p} name={p} profiles={memberProfiles} color={PERSONNEL_COLORS[p] || '#888'} size={18} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-semibold text-[#a78bfa]">{formatDate(s.date)}</div>
                      {s.isPrivate && <span className="text-[10px] text-[#888]">Private</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="shrink-0 px-4 py-2 border-t border-[#2a2a2a]">
        <span className="text-xs text-[#555] font-mono">{filteredShows.length} show{filteredShows.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );

  // ── Right panel ────────────────────────────────────────────────────────────
  const rightPanel = (
    <div className="flex flex-col overflow-hidden bg-[#121212]">
      {!selectedShowId && !showEditMode && (
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-base font-bold mb-5" style={{ color: '#a78bfa' }}>Shows</p>
            <i className="fas fa-calendar-days text-5xl mb-4 block opacity-20 text-[#555]" />
            <p className="text-sm text-[#555]">Select a show or create a new one</p>
            <button onClick={openNewShow} className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold transition-colors" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', color: '#a78bfa' }}>
              <i className="fas fa-plus mr-1.5" />New Show
            </button>
          </div>
        </div>
      )}

      {/* Edit form */}
      {showEditMode && showForm && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-5 py-3.5 border-b border-[#2a2a2a] flex items-center gap-3">
            <button onClick={handleCancelShowEdit} className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors">
              <i className="fas fa-times text-sm" />
            </button>
            <h2 className="flex-1 text-sm font-bold text-white">{showForm.id && allShows.find(s => s.id === showForm.id) ? 'Edit Show' : 'New Show'}</h2>
            <button onClick={handleSaveShow} disabled={savingShow} className="px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
              {savingShow ? <><i className="fas fa-spinner fa-spin" /> Saving</> : <><i className="fas fa-check" /> Save</>}
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <div className="max-w-2xl mx-auto">
              <ShowEditForm
                form={showForm}
                setField={setShowField}
                setFields={updates => setShowForm(f => ({ ...f, ...updates }))}
                clients={clients}
                setlists={setlists}
                onClientChange={autoFillFromClient}
                memberProfiles={memberProfiles}
              />
            </div>
          </div>
        </div>
      )}

      {/* Detail view */}
      {!showEditMode && selectedShowId && selectedShow && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-5 py-3.5 border-b border-[#2a2a2a] flex items-center gap-3">
            <div className="flex-1 min-w-0 overflow-hidden">
              <h2 className="text-base font-bold text-white text-left truncate w-full">
                {[selectedShow.venue, formatDate(selectedShow.date)].filter(Boolean).join(', ') || 'Unnamed Show'}
              </h2>
              {selectedShow.personnel?.length > 0 && (
                <div className="flex items-center justify-start gap-1 mt-1.5 flex-wrap">
                  {selectedShow.personnel.map(p => <MemberAvatar key={p} name={p} profiles={memberProfiles} color={PERSONNEL_COLORS[p] || '#888'} size={24} />)}
                </div>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-1">
              <button onClick={() => openEditShow(selectedShow)} className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                <i className="fas fa-pen text-sm" />
              </button>
              <button onClick={handleDeleteShow} className="p-2 text-red-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                <i className="fas fa-trash text-sm" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <div className="max-w-xl mx-auto space-y-4">
              {/* Action buttons */}
              <div className={`grid gap-2`} style={{ gridTemplateColumns: selectedShow.published && !selectedShow.isPrivate ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' }}>
                {selectedShow.published && !selectedShow.isPrivate && (
                  <a
                    href={`/events/${selectedShow.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-colors"
                    style={{ background: '#1c1917', border: '1px solid #292524', color: '#ccc' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = '#a78bfa'}
                    onMouseOut={e => e.currentTarget.style.borderColor = '#292524'}
                  >
                    <i className="fas fa-globe text-[#a78bfa] text-base" />
                    Event Page
                  </a>
                )}
                <button
                  onClick={() => openGoogleCalendar(selectedShow)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-colors"
                  style={{ background: '#1c1917', border: '1px solid #292524', color: '#ccc' }}
                  onMouseOver={e => e.currentTarget.style.borderColor = '#4285f4'}
                  onMouseOut={e => e.currentTarget.style.borderColor = '#292524'}
                >
                  <i className="fab fa-google text-[#4285f4] text-base" />
                  Google Cal
                </button>
                <button
                  onClick={() => downloadIcs(selectedShow)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-colors"
                  style={{ background: '#1c1917', border: '1px solid #292524', color: '#ccc' }}
                  onMouseOver={e => e.currentTarget.style.borderColor = '#a78bfa'}
                  onMouseOut={e => e.currentTarget.style.borderColor = '#292524'}
                >
                  <i className="fas fa-file-arrow-down text-[#a78bfa] text-base" />
                  Download .ics
                </button>
                {selectedShow.eventLink ? (
                  <a
                    href={selectedShow.eventLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-colors"
                    style={{ background: '#1c1917', border: '1px solid #292524', color: '#ccc' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = '#1877f2'}
                    onMouseOut={e => e.currentTarget.style.borderColor = '#292524'}
                  >
                    <i className="fab fa-facebook text-[#1877f2] text-base" />
                    FB Event
                  </a>
                ) : (
                  <button
                    onClick={() => openCreateFacebookEvent(selectedShow)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-colors"
                    style={{ background: '#1c1917', border: '1px solid #292524', color: '#ccc' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = '#1877f2'}
                    onMouseOut={e => e.currentTarget.style.borderColor = '#292524'}
                  >
                    <i className="fab fa-facebook text-[#1877f2] text-base" />
                    Create FB Event
                  </button>
                )}
              </div>
              <ShowDetail show={selectedShow} clients={clients} setlists={setlists} memberProfiles={memberProfiles} onPublish={async () => {
                if (!window.confirm('Publish this event on the website?')) return;
                await saveShow({ ...selectedShow, published: true, updatedAt: new Date().toISOString() });
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Show not found */}
      {!showEditMode && selectedShowId && !selectedShow && (
        <EmptyState icon="fa-circle-question" message="Show not found" />
      )}
    </div>
  );

  return (
    <AdminShell activeApp="shows">
      <div className="admin-page-grid flex-1 min-h-0 grid overflow-hidden">
        {leftPanel}
        {rightPanel}
      </div>
    </AdminShell>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────
function EmptyState({ icon, message }) {
  return (
    <div className="flex-1 flex items-center justify-center text-[#555] h-full">
      <div className="text-center">
        <i className={`fas ${icon} text-5xl mb-4 block opacity-20`} />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}

// ── Show Detail ────────────────────────────────────────────────────────────
function ShowDetail({ show, clients, setlists, memberProfiles = {}, onPublish }) {
  const client = clients.find(c => c.id === show.clientId);
  const setlist = setlists.find(s => s.id === show.setlistId);

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-2 flex-wrap">
        {show.isPrivate && <Badge>Private</Badge>}
        {show.published
          ? <Badge color="#22c55e">Published</Badge>
          : <button onClick={onPublish} title="Publish this event on the website"><Badge color="#f59e0b">Unpublished</Badge></button>
        }
      </div>

      <Card title="Date & Time">
        <InfoRow label="Date" value={formatDate(show.date)} accent />
        {show.startTime && (
          <InfoRow label="Time" value={[formatTime12(show.startTime), show.endTime && formatTime12(show.endTime)].filter(Boolean).join(' – ')} />
        )}
      </Card>

      <Card title="Venue">
        {client && <InfoRow label="Client"><a className="text-[#a78bfa] hover:underline" href={`/clients?client=${client.id}`}>{client.name}</a></InfoRow>}
        {show.venue && <InfoRow label="Venue" value={show.venue} />}
        {(show.streetAddress || show.city || show.state) && (() => {
          const fullAddr = [show.streetAddress, show.city, show.state, show.postalCode].filter(Boolean).join(', ');
          const mapsQ = [show.venue, fullAddr].filter(Boolean).join(', ');
          return (
            <InfoRow label="Location">
              <a href={`https://maps.google.com/?q=${encodeURIComponent(mapsQ)}`} target="_blank" rel="noopener noreferrer" className="text-[#a78bfa] hover:underline">
                {fullAddr}
              </a>
            </InfoRow>
          );
        })()}
      </Card>

      {setlist && (
        <Card title="Setlist">
          <div className="flex justify-center">
            <a href={`/setlists?id=${show.setlistId}`} className="flex items-center gap-2 text-[#a78bfa] hover:underline text-sm font-semibold">
              <i className="fas fa-list text-xs" />
              {setlist.name}
            </a>
          </div>
        </Card>
      )}

      {(show.personnel?.length > 0 || show.eventHandler) && (
        <Card title="Personnel">
          <div className="flex flex-wrap justify-center gap-2">
            {show.personnel?.map(p => (
              <div key={p} className="flex items-center gap-1.5">
                <MemberAvatar name={p} profiles={memberProfiles} color={PERSONNEL_COLORS[p] || '#888'} size={28} />
                <span className="text-sm text-[#ccc]">{p}</span>
              </div>
            ))}
          </div>
          {show.eventHandler && (
            <div className="mt-2 pt-2 border-t border-[#2a2a2a] flex justify-center">
              <span className="text-xs text-[#555] mr-2">Handler</span>
              <span className="text-xs text-[#ccc]">{show.eventHandler}</span>
            </div>
          )}
        </Card>
      )}

      {show.itinerary && (
        <Card title="Itinerary">
          <pre className="text-sm text-[#ccc] whitespace-pre-wrap font-sans">{show.itinerary}</pre>
        </Card>
      )}

      {show.notes && (
        <Card title="Notes">
          <pre className="text-sm text-[#ccc] whitespace-pre-wrap font-sans">{show.notes}</pre>
        </Card>
      )}

      {show.payout && (
        <Card title="Payout">
          <span className="text-2xl font-bold text-green-400">{formatCurrency(show.payout)}</span>
        </Card>
      )}
    </div>
  );
}

const GUEST_INSTRUMENTS = ['Guitar', 'Bass', 'Drums', 'Vocals', 'Keyboards', 'Other'];

// Convert stored time strings (any format) → "HH:MM" for <input type="time">
function toTimeInputValue(str) {
  if (!str) return '';
  const match = str.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return '';
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[4]?.toLowerCase();
  if (ampm === 'pm' && h !== 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}

// Convert "HH:MM" from <input type="time"> → "H:MM AM/PM" for storage
function fromTimeInputValue(val) {
  if (!val) return '';
  const [hStr, mStr] = val.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

// ── Show Edit Form ─────────────────────────────────────────────────────────
function ShowEditForm({ form, setField, setFields, clients, setlists, onClientChange, memberProfiles = {} }) {
  const [guestName, setGuestName] = useState('');
  const [guestInstrument, setGuestInstrument] = useState('Guitar');
  const [addingGuest, setAddingGuest] = useState(false);

  const activeClients = clients.filter(c => (c.status || 'Active') === 'Active').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const selectedClient = clients.find(c => c.id === form.clientId);

  function addGuest() {
    const name = guestName.trim();
    if (!name) return;
    const tag = `${name} (${guestInstrument})`;
    const current = form.personnel || [];
    if (!current.includes(tag)) setField('personnel', [...current, tag]);
    setGuestName('');
    setGuestInstrument('Guitar');
    setAddingGuest(false);
  }

  const READONLY_INPUT = `${INPUT} opacity-60 cursor-default`;

  return (
    <div className="space-y-4 max-w-xl pb-8">
      <div className="flex flex-wrap items-center gap-5 pb-1">
        <CheckboxField label="Published on Website" checked={!!form.published} onChange={v => setField('published', v)} />
        <CheckboxField label="Private Event" checked={!!form.isPrivate} onChange={v => setField('isPrivate', v)} />
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs font-semibold text-[#888] uppercase tracking-wider whitespace-nowrap">Payout ($)</label>
          <input type="number" value={form.payout || ''} onChange={e => setField('payout', e.target.value)} className={INPUT} placeholder="0" style={{ width: 100 }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Date *">
          <input type="date" value={form.date || ''} onChange={e => setField('date', e.target.value)} className={INPUT} />
        </FormField>
        <FormField label="Client">
          <select value={form.clientId || ''} onChange={e => { setField('clientId', e.target.value); onClientChange(e.target.value); }} className={SELECT}>
            <option value="">— Select client —</option>
            {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <FormField label="Start Time">
          <input type="time" value={toTimeInputValue(form.startTime)} onChange={e => setField('startTime', fromTimeInputValue(e.target.value))} className={INPUT} />
        </FormField>
        <FormField label="End Time">
          <input type="time" value={toTimeInputValue(form.endTime)} onChange={e => setField('endTime', fromTimeInputValue(e.target.value))} className={INPUT} />
        </FormField>
      </div>
      <FormField label="Venue Name">
        <input type="text" value={selectedClient?.name || form.venue || ''} readOnly className={READONLY_INPUT} placeholder="Auto-filled from client" />
      </FormField>
      <FormField label="Street Address">
        <input type="text" value={selectedClient?.streetAddress || selectedClient?.address || form.streetAddress || ''} readOnly className={READONLY_INPUT} placeholder="Managed on client record" />
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="City">
          <input type="text" value={selectedClient?.city || form.city || ''} readOnly className={READONLY_INPUT} />
        </FormField>
        <FormField label="State">
          <input type="text" value={selectedClient?.state || form.state || ''} readOnly className={READONLY_INPUT} />
        </FormField>
        <FormField label="Zip">
          <input type="text" value={selectedClient?.postalCode || form.postalCode || ''} readOnly className={READONLY_INPUT} />
        </FormField>
      </div>
      <FormField label="Public Description">
        <textarea rows={3} value={form.description || ''} onChange={e => setField('description', e.target.value)} className={INPUT + ' resize-y'} placeholder="Shown on the public event page…" />
      </FormField>
      <FormField label="Event Link">
        <input type="url" value={form.eventLink || ''} onChange={e => setField('eventLink', e.target.value)} className={INPUT} placeholder="https://..." />
      </FormField>
      <FormField label="Setlist">
        {form.setlistId ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex-1 min-w-0 px-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm truncate">
              {setlists.find(s => s.id === form.setlistId)?.name || form.setlistId}
            </span>
            <a
              href={`/setlists?id=${form.setlistId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs font-semibold text-[#a78bfa] hover:underline whitespace-nowrap"
            >
              Open <i className="fas fa-arrow-up-right-from-square text-[10px] ml-0.5" />
            </a>
            <button
              type="button"
              onClick={() => setField('setlistId', '')}
              className="px-3 py-2 text-xs font-semibold text-[#888] hover:text-white transition-colors whitespace-nowrap"
            >
              Unlink
            </button>
          </div>
        ) : form._pendingSetlist ? (
          <div className="space-y-2">
            <input
              type="text"
              value={form._pendingSetlist.name}
              onChange={e => setField('_pendingSetlist', { ...form._pendingSetlist, name: e.target.value })}
              placeholder="Setlist name"
              className={INPUT}
            />
            {form._pendingSetlist.type === 'copy' && (
              <select
                value={form._pendingSetlist.sourceId || ''}
                onChange={e => setField('_pendingSetlist', { ...form._pendingSetlist, sourceId: e.target.value })}
                className={SELECT}
              >
                <option value="">— Choose a setlist to copy —</option>
                {setlists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-[#555]">Will be created when you save this show.</p>
              <button
                type="button"
                onClick={() => setField('_pendingSetlist', null)}
                className="px-3 py-1.5 text-xs font-semibold text-[#888] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setField('_pendingSetlist', { type: 'blank', name: form.venue ? `${form.venue} Setlist` : 'New Setlist' })}
              className="px-3 py-2 bg-[#7c3aed]/15 border border-[#7c3aed]/40 text-[#a78bfa] rounded-lg text-xs font-semibold hover:bg-[#7c3aed]/25 transition-colors"
            >
              <i className="fas fa-plus mr-1.5" />New Blank Setlist
            </button>
            <button
              type="button"
              onClick={() => setField('_pendingSetlist', { type: 'copy', name: form.venue ? `${form.venue} Setlist` : 'New Setlist', sourceId: '' })}
              className="px-3 py-2 text-[#888] hover:text-white border border-[#2a2a2a] rounded-lg text-xs font-semibold transition-colors"
            >
              <i className="fas fa-copy mr-1.5" />Copy From Template
            </button>
          </div>
        )}
      </FormField>
      <FormField label="Itinerary">
        <textarea rows={4} value={form.itinerary || ''} onChange={e => setField('itinerary', e.target.value)} className={INPUT + ' resize-y'} placeholder="Load-in at 6pm, soundcheck 7pm..." />
      </FormField>
      <FormField label="Notes">
        <textarea rows={3} value={form.notes || ''} onChange={e => setField('notes', e.target.value)} className={INPUT + ' resize-y'} />
      </FormField>
      <FormField label="Personnel">
        <div className="flex flex-wrap gap-2">
          {PERSONNEL.map(p => {
            const selected = (form.personnel || []).includes(p);
            const color = PERSONNEL_COLORS[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  const current = form.personnel || [];
                  setField('personnel', selected ? current.filter(x => x !== p) : [...current, p]);
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={selected
                  ? { background: `${color}25`, color, border: `1px solid ${color}60` }
                  : { color: '#888', border: '1px solid #2a2a2a' }
                }
              >
                <MemberAvatar name={p} profiles={memberProfiles} color={color} size={20} />
                {p}
              </button>
            );
          })}
          {/* Guest musicians already added */}
          {(form.personnel || []).filter(p => !PERSONNEL.includes(p)).map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setField('personnel', (form.personnel || []).filter(x => x !== g))}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: '#78716c25', color: '#a8a29e', border: '1px solid #78716c60' }}
            >
              <i className="fas fa-user-music text-[10px]" />
              {g}
              <i className="fas fa-times text-[9px] ml-0.5 opacity-60" />
            </button>
          ))}
          {/* Add guest button */}
          {!addingGuest && (
            <button
              type="button"
              onClick={() => setAddingGuest(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ color: '#888', border: '1px dashed #3a3a3a' }}
            >
              <i className="fas fa-plus text-[10px]" />
              Guest
            </button>
          )}
        </div>
        {addingGuest && (
          <div className="mt-2 flex gap-2 items-end">
            <div className="flex-1">
              <input
                autoFocus
                type="text"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addGuest(); if (e.key === 'Escape') setAddingGuest(false); }}
                placeholder="Guest name"
                className={INPUT}
              />
            </div>
            <div>
              <select value={guestInstrument} onChange={e => setGuestInstrument(e.target.value)} className={SELECT} style={{ minWidth: 120 }}>
                {GUEST_INSTRUMENTS.map(i => <option key={i}>{i}</option>)}
              </select>
            </div>
            <button type="button" onClick={addGuest} className="px-3 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-xs font-semibold transition-colors">Add</button>
            <button type="button" onClick={() => setAddingGuest(false)} className="px-3 py-2 text-[#888] hover:text-white rounded-lg text-xs transition-colors">Cancel</button>
          </div>
        )}
      </FormField>
      <FormField label="Event Handler">
        <select value={form.eventHandler || ''} onChange={e => setField('eventHandler', e.target.value)} className={SELECT}>
          <option value="">— None —</option>
          {PERSONNEL.map(p => <option key={p}>{p}</option>)}
        </select>
      </FormField>
    </div>
  );
}

// ── Shared small components ────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
      {title && <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-3">{title}</p>}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, children, accent }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-[#555] w-24 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm flex-1 ${accent ? 'text-[#a78bfa] font-semibold' : 'text-[#ccc]'}`}>
        {children || value || '—'}
      </span>
    </div>
  );
}

function Badge({ children, color = '#888' }) {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ color, borderColor: `${color}40`, background: `${color}15` }}>
      {children}
    </span>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 rounded accent-[#7c3aed]" />
      <span className="text-sm text-[#ccc]">{label}</span>
    </label>
  );
}
