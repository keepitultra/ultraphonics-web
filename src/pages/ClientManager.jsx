import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard.jsx';
import AdminShell from '../components/admin/AdminShell.jsx';
import { useAuth } from '../firebase/AuthContext.jsx';
import { useClients, useSetlists, useShows } from '../firebase/useFirestore.js';
import {
  saveClient, deleteClient, getClientShows, getClientDetails,
  saveShow, deleteShow, addActivityLog, subscribeToActivityLogs,
} from '../firestore-service.js';

// ── Constants ──────────────────────────────────────────────────────────────
const PERSONNEL = ['Anthony', 'Tom', 'Lester', 'David', 'Shelley', 'Kelsey'];
const PERSONNEL_COLORS = {
  Anthony: '#f59e0b', Tom: '#22c55e', Lester: '#a78bfa',
  David: '#e879f9', Shelley: '#fb923c', Kelsey: '#38bdf8',
};
const STATUS_COLORS = {
  Lead: { bg: '#ca8a04', text: '#fef08a', border: '#a16207' },
  Active: { bg: '#16a34a', text: '#bbf7d0', border: '#15803d' },
  Past: { bg: '#374151', text: '#d1d5db', border: '#4b5563' },
  'Do Not Book': { bg: '#991b1b', text: '#fecaca', border: '#7f1d1d' },
};
const LOG_ICONS = { note: 'fa-note-sticky', call: 'fa-phone', email: 'fa-envelope', meeting: 'fa-handshake', quote: 'fa-file-invoice-dollar', show: 'fa-music' };
const LOG_COLORS = { note: '#888', call: '#22c55e', email: '#3b82f6', meeting: '#a78bfa', quote: '#f59e0b', show: '#00ddde' };

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Past;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ background: `${c.bg}30`, color: c.text, borderColor: c.border }}>
      {status}
    </span>
  );
}

function PersonnelBubble({ name }) {
  const color = PERSONNEL_COLORS[name] || '#888';
  return (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
      style={{ background: `${color}25`, color, border: `1px solid ${color}50` }}
      title={name}
    >
      {name[0]}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n) {
  if (!n) return '—';
  return `$${Number(n).toLocaleString()}`;
}

// ── Input styles ─────────────────────────────────────────────────────────
const INPUT = 'w-full px-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm focus:outline-none focus:border-[#00ddde]';
const SELECT = INPUT;

// ── Main component ─────────────────────────────────────────────────────────
export default function ClientManagerPage() {
  return (
    <AuthGuard>
      <ClientManager />
    </AuthGuard>
  );
}

function ClientManager() {
  const { user } = useAuth();
  const { data: clients = [] } = useClients();
  const { data: allShows = [] } = useShows();
  const { data: setlists = [] } = useSetlists();
  const [searchParams, setSearchParams] = useSearchParams();

  const mode = searchParams.get('mode') || 'clients'; // clients | shows
  const selectedClientId = searchParams.get('client') || null;
  const selectedShowId = searchParams.get('show') || null;

  // Left panel filters
  const [clientSearch, setClientSearch] = useState('');
  const [clientStatusFilter, setClientStatusFilter] = useState('All');
  const [clientTypeFilter, setClientTypeFilter] = useState('All');
  const [clientSort, setClientSort] = useState('Name A-Z');
  const [showSearch, setShowSearch] = useState('');
  const [showYear, setShowYear] = useState(String(new Date().getFullYear()));
  const [showSortDir, setShowSortDir] = useState('desc');

  // Right panel state
  const [clientDetailTab, setClientDetailTab] = useState('profile');
  const [clientShows, setClientShows] = useState(/** @type {any[]} */ ([]));
  const [activityLogs, setActivityLogs] = useState(/** @type {any[]} */ ([]));
  const [logType, setLogType] = useState('note');
  const [logContent, setLogContent] = useState('');
  const [addingLog, setAddingLog] = useState(false);

  // Modals / forms
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showEditMode, setShowEditMode] = useState(false);
  const [showForm, setShowForm] = useState(/** @type {any} */ (null));
  const [showDirty, setShowDirty] = useState(false);
  const [savingShow, setSavingShow] = useState(false);
  const [calendarDropdown, setCalendarDropdown] = useState(false);

  const selectedClient = clients.find(c => c.id === selectedClientId) || null;
  const selectedShow = allShows.find(s => s.id === selectedShowId) || null;

  // Load client shows when client changes
  useEffect(() => {
    if (!selectedClientId) { setClientShows([]); return; }
    getClientShows(selectedClientId).then(setClientShows).catch(() => {});
  }, [selectedClientId, allShows]);

  // Subscribe to activity logs when client tab is activity
  useEffect(() => {
    if (!selectedClientId || clientDetailTab !== 'activity') return;
    const unsub = subscribeToActivityLogs(
      selectedClientId,
      logs => setActivityLogs(logs),
      err => console.error('Activity logs error:', err),
    );
    return unsub;
  }, [selectedClientId, clientDetailTab]);

  // ── Navigation helpers ─────────────────────────────────────────────────
  function selectClient(id) {
    setSearchParams({ client: id }, { replace: false });
    setClientDetailTab('profile');
  }

  function selectShow(id) {
    setSearchParams({ mode: 'shows', show: id }, { replace: false });
    setShowEditMode(false);
  }

  function setMode(m) {
    setSearchParams(m === 'clients' ? {} : { mode: m }, { replace: false });
  }

  // ── Client filtering ───────────────────────────────────────────────────
  const filteredClients = clients
    .filter(c => {
      if (clientStatusFilter !== 'All' && c.status !== clientStatusFilter) return false;
      if (clientTypeFilter !== 'All' && c.type !== clientTypeFilter) return false;
      const text = `${c.name || ''} ${c.contactName || ''}`.toLowerCase();
      return text.includes(clientSearch.toLowerCase());
    })
    .sort((a, b) => {
      if (clientSort === 'Name A-Z') return (a.name || '').localeCompare(b.name || '');
      if (clientSort === 'Name Z-A') return (b.name || '').localeCompare(a.name || '');
      if (clientSort === 'Last Contact') return (b.lastInteraction || '').localeCompare(a.lastInteraction || '');
      if (clientSort === 'Last Updated') return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      return 0;
    });

  // ── Show filtering ─────────────────────────────────────────────────────
  const showYears = [...new Set(allShows.map(s => {
    const d = new Date(s.date);
    return isNaN(d.getTime()) ? null : String(d.getFullYear());
  }).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

  const filteredShows = allShows
    .filter(s => {
      const yr = (() => { const d = new Date(s.date); return isNaN(d.getTime()) ? '' : String(d.getFullYear()); })();
      if (showYear && yr !== showYear) return false;
      const text = `${s.venue || ''} ${s.city || ''} ${s.state || ''}`.toLowerCase();
      return text.includes(showSearch.toLowerCase());
    })
    .sort((a, b) => {
      const ta = new Date(a.date).getTime() || 0;
      const tb = new Date(b.date).getTime() || 0;
      return showSortDir === 'desc' ? tb - ta : ta - tb;
    });

  // ── Add log ────────────────────────────────────────────────────────────
  async function handleAddLog() {
    if (!logContent.trim() || !selectedClientId) return;
    setAddingLog(true);
    try {
      await addActivityLog(selectedClientId, { type: logType, content: logContent.trim(), author: user?.displayName || 'Admin', authorId: user?.uid });
      setLogContent('');
    } catch (err) { alert('Failed to add log: ' + err.message); }
    finally { setAddingLog(false); }
  }

  // ── Delete client ──────────────────────────────────────────────────────
  async function handleDeleteClient() {
    if (!window.confirm('Delete this client? This cannot be undone.')) return;
    const result = await deleteClient(selectedClientId);
    if (!result.deleted) { alert('Cannot delete: ' + result.reason); return; }
    setSearchParams({}, { replace: true });
  }

  // ── Show form helpers ──────────────────────────────────────────────────
  function openNewShow(client) {
    const id = uuid();
    const defaults = {
      id,
      venue: client?.type === 'Venue' ? client.name : '',
      clientId: client?.id || '',
      city: '', state: '',
      date: '', startTime: client?.defaultStartTime || '', endTime: client?.defaultEndTime || '',
      eventLink: '', setlistId: '',
      itinerary: client?.defaultItinerary || '',
      notes: client?.defaultNotes || '',
      personnel: [], eventHandler: '',
      payout: client?.rate || '',
      isPrivate: false, published: false,
    };
    if (client?.address) {
      const parts = client.address.split(',');
      if (parts.length >= 2) {
        defaults.city = parts[parts.length - 2]?.trim() || '';
        const stateZip = parts[parts.length - 1]?.trim().split(' ');
        defaults.state = stateZip[0] || '';
      }
    }
    setShowForm(defaults);
    setShowEditMode(true);
    setShowDirty(false);
    setSearchParams({ mode: 'shows', show: id }, { replace: false });
  }

  function openEditShow(show) {
    setShowForm({
      ...show,
      personnel: show.personnel || [],
      payout: show.payout || '',
    });
    setShowEditMode(true);
    setShowDirty(false);
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
      await saveShow({ ...showForm, updatedAt: new Date().toISOString() });
      setShowEditMode(false);
      setShowDirty(false);
      // Refresh client shows if we know the client
      if (showForm.clientId) getClientShows(showForm.clientId).then(setClientShows).catch(() => {});
    } catch (err) { alert('Save failed: ' + err.message); }
    finally { setSavingShow(false); }
  }

  function handleCancelShowEdit() {
    if (showDirty && !window.confirm('Discard changes?')) return;
    setShowEditMode(false);
    setShowDirty(false);
    if (!selectedShow && !allShows.find(s => s.id === selectedShowId)) {
      setSearchParams({ mode: 'shows' }, { replace: true });
    }
  }

  async function handleDeleteShow() {
    if (!window.confirm('Delete this show?')) return;
    await deleteShow(selectedShowId);
    setSearchParams({ mode: 'shows' }, { replace: true });
  }

  // ── Calendar export ────────────────────────────────────────────────────
  function openGoogleCalendar(show) {
    function pad(n) { return String(n).padStart(2, '0'); }
    function toGcalDate(dateStr, timeStr) {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const match = timeStr?.match(/(\d+):(\d+)\s*(am|pm)?/i);
      if (!match) return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
      let h = parseInt(match[1]);
      const m = parseInt(match[2]);
      const ampm = match[3]?.toLowerCase();
      if (ampm === 'pm' && h !== 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
    }
    const start = toGcalDate(show.date, show.startTime);
    const end = toGcalDate(show.date, show.endTime) || start;
    const url = new URL('https://calendar.google.com/calendar/render');
    url.searchParams.set('action', 'TEMPLATE');
    url.searchParams.set('text', show.venue || 'Show');
    url.searchParams.set('dates', `${start}/${end}`);
    url.searchParams.set('location', [show.venue, show.city, show.state].filter(Boolean).join(', '));
    const details = [
      `${window.location.origin}/clients?mode=shows&show=${show.id}`,
      show.itinerary && `\n\nItinerary:\n${show.itinerary}`,
      show.notes && `\n\nNotes:\n${show.notes}`,
      show.personnel?.length && `\n\nPersonnel: ${show.personnel.join(', ')}`,
    ].filter(Boolean).join('');
    url.searchParams.set('details', details);
    window.open(url.toString(), '_blank');
    setCalendarDropdown(false);
  }

  function downloadIcs(show) {
    function toIcsDate(dateStr, timeStr) {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const match = timeStr?.match(/(\d+):(\d+)\s*(am|pm)?/i);
      function pad(n) { return String(n).padStart(2, '0'); }
      if (!match) return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
      let h = parseInt(match[1]);
      const m = parseInt(match[2]);
      const ampm = match[3]?.toLowerCase();
      if (ampm === 'pm' && h !== 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
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
      `URL:${window.location.origin}/clients?mode=shows&show=${show.id}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(show.venue || 'show').replace(/\s+/g, '-')}.ics`;
    a.click();
    setCalendarDropdown(false);
  }

  // ── Left panel ──────────────────────────────────────────────────────────
  const leftPanel = (
    <div className="flex flex-col overflow-hidden bg-[#1a1a1a] border-r border-[#2a2a2a]">
      {/* Mode toggle */}
      <div className="shrink-0 flex border-b border-[#2a2a2a]">
        {['clients', 'shows'].map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors capitalize ${
              mode === m ? 'text-[#00ddde] border-b-2 border-[#00ddde]' : 'text-[#888] hover:text-white'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'clients' && (
        <>
          {/* Client controls */}
          <div className="shrink-0 p-3 border-b border-[#2a2a2a] space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-xs pointer-events-none" />
                <input type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Search..." className="w-full pl-8 pr-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs placeholder-[#555] focus:outline-none focus:border-[#00ddde]" />
              </div>
              <button onClick={() => setClientFormOpen(true)} className="shrink-0 px-3 py-2 bg-[#008c8d] hover:bg-[#00a8a9] text-white rounded-lg text-xs font-semibold transition-colors">
                <i className="fas fa-plus" />
              </button>
            </div>
            <div className="flex gap-2">
              <select value={clientStatusFilter} onChange={e => setClientStatusFilter(e.target.value)} className="flex-1 px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-[#888] text-xs focus:outline-none focus:border-[#00ddde]">
                {['All','Lead','Active','Past','Do Not Book'].map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={clientTypeFilter} onChange={e => setClientTypeFilter(e.target.value)} className="flex-1 px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-[#888] text-xs focus:outline-none focus:border-[#00ddde]">
                {['All','Venue','Planner','Private','Corporate'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <select value={clientSort} onChange={e => setClientSort(e.target.value)} className="w-full px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-[#888] text-xs focus:outline-none focus:border-[#00ddde]">
              {['Name A-Z','Name Z-A','Last Contact','Last Updated'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Client list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {filteredClients.map(c => (
              <button
                key={c.id}
                onClick={() => selectClient(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-[#2a2a2a] transition-colors flex items-start gap-3 ${
                  selectedClientId === c.id ? 'bg-[#00ddde]/10 border-l-2 border-l-[#00ddde]' : 'hover:bg-white/5'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{c.name}</div>
                  {c.contactName && <div className="text-xs text-[#888] truncate">{c.contactName}</div>}
                  <div className="text-xs text-[#555] mt-0.5">{c.type}</div>
                </div>
                <StatusBadge status={c.status || 'Active'} />
              </button>
            ))}
            {filteredClients.length === 0 && (
              <div className="p-8 text-center text-[#555]">
                <i className="fas fa-address-book text-2xl mb-2 block opacity-20" />
                <p className="text-sm">No clients found</p>
              </div>
            )}
          </div>
          <div className="shrink-0 px-4 py-2 border-t border-[#2a2a2a]">
            <span className="text-xs text-[#555] font-mono">{filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}</span>
          </div>
        </>
      )}

      {mode === 'shows' && (
        <>
          {/* Show controls */}
          <div className="shrink-0 p-3 border-b border-[#2a2a2a] space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-xs pointer-events-none" />
                <input type="text" value={showSearch} onChange={e => setShowSearch(e.target.value)} placeholder="Search shows..." className="w-full pl-8 pr-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs placeholder-[#555] focus:outline-none focus:border-[#00ddde]" />
              </div>
              <button onClick={() => openNewShow(null)} className="shrink-0 px-3 py-2 bg-[#008c8d] hover:bg-[#00a8a9] text-white rounded-lg text-xs font-semibold transition-colors">
                <i className="fas fa-plus" />
              </button>
            </div>
            <div className="flex gap-2">
              <select value={showYear} onChange={e => setShowYear(e.target.value)} className="flex-1 px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-[#888] text-xs focus:outline-none focus:border-[#00ddde]">
                <option value="">All years</option>
                {showYears.map(y => <option key={y}>{y}</option>)}
              </select>
              <select value={showSortDir} onChange={e => setShowSortDir(e.target.value)} className="flex-1 px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-[#888] text-xs focus:outline-none focus:border-[#00ddde]">
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>
          </div>

          {/* Show list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {filteredShows.map(s => (
              <button
                key={s.id}
                onClick={() => selectShow(s.id)}
                className={`w-full text-left px-4 py-3 border-b border-[#2a2a2a] transition-colors ${
                  selectedShowId === s.id ? 'bg-[#00ddde]/10 border-l-2 border-l-[#00ddde]' : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{s.venue || 'Unnamed Show'}</div>
                    {(s.city || s.state) && <div className="text-xs text-[#888]">{[s.city, s.state].filter(Boolean).join(', ')}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-semibold text-[#00ddde]">{formatDate(s.date)}</div>
                    {s.isPrivate && <span className="text-[10px] text-[#888]">Private</span>}
                  </div>
                </div>
              </button>
            ))}
            {filteredShows.length === 0 && (
              <div className="p-8 text-center text-[#555]">
                <i className="fas fa-calendar text-2xl mb-2 block opacity-20" />
                <p className="text-sm">No shows found</p>
              </div>
            )}
          </div>
          <div className="shrink-0 px-4 py-2 border-t border-[#2a2a2a]">
            <span className="text-xs text-[#555] font-mono">{filteredShows.length} show{filteredShows.length !== 1 ? 's' : ''}</span>
          </div>
        </>
      )}
    </div>
  );

  // ── Right panel ────────────────────────────────────────────────────────
  const rightPanel = (
    <div className="flex flex-col overflow-hidden bg-[#121212]">
      {/* Client detail */}
      {mode === 'clients' && !selectedClientId && (
        <EmptyState icon="fa-address-book" message="Select a client to view details" />
      )}

      {mode === 'clients' && selectedClientId && selectedClient && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Client header */}
          <div className="shrink-0 px-5 py-3.5 border-b border-[#2a2a2a] flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white truncate">{selectedClient.name}</h2>
                <StatusBadge status={selectedClient.status || 'Active'} />
              </div>
              {selectedClient.type && <p className="text-xs text-[#888]">{selectedClient.type}</p>}
            </div>
            <div className="shrink-0 flex items-center gap-1">
              <button onClick={() => openNewShow(selectedClient)} className="px-3 py-1.5 bg-[#008c8d]/20 border border-[#008c8d]/40 text-[#00ddde] rounded-lg text-xs font-semibold hover:bg-[#008c8d]/30 transition-colors">
                <i className="fas fa-plus mr-1" />Show
              </button>
              <button onClick={() => { setEditingClient(selectedClient); setClientFormOpen(true); }} className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                <i className="fas fa-pen text-sm" />
              </button>
              <button onClick={handleDeleteClient} className="p-2 text-red-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                <i className="fas fa-trash text-sm" />
              </button>
            </div>
          </div>

          {/* Client tabs */}
          <div className="shrink-0 flex border-b border-[#2a2a2a]">
            {['profile','financials','activity'].map(tab => (
              <button
                key={tab}
                onClick={() => setClientDetailTab(tab)}
                className={`px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors capitalize ${
                  clientDetailTab === tab ? 'text-[#00ddde] border-b-2 border-[#00ddde]' : 'text-[#888] hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Client tab content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            {clientDetailTab === 'profile' && <ClientProfile client={selectedClient} />}
            {clientDetailTab === 'financials' && <ClientFinancials shows={clientShows} onShowClick={id => selectShow(id)} />}
            {clientDetailTab === 'activity' && (
              <ClientActivity
                logs={activityLogs}
                logType={logType}
                logContent={logContent}
                adding={addingLog}
                onTypeChange={setLogType}
                onContentChange={setLogContent}
                onAdd={handleAddLog}
                user={user}
              />
            )}
          </div>
        </div>
      )}

      {/* Shows mode — empty */}
      {mode === 'shows' && !selectedShowId && !showEditMode && (
        <EmptyState icon="fa-calendar-days" message="Select a show or create a new one" />
      )}

      {/* Shows mode — edit form */}
      {mode === 'shows' && showEditMode && showForm && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-5 py-3.5 border-b border-[#2a2a2a] flex items-center gap-3">
            <button onClick={handleCancelShowEdit} className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors">
              <i className="fas fa-times text-sm" />
            </button>
            <h2 className="flex-1 text-sm font-bold text-white">{showForm.id && allShows.find(s => s.id === showForm.id) ? 'Edit Show' : 'New Show'}</h2>
            <button onClick={handleSaveShow} disabled={savingShow} className="px-4 py-2 bg-[#008c8d] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
              {savingShow ? <><i className="fas fa-spinner fa-spin" /> Saving</> : <><i className="fas fa-check" /> Save</>}
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <ShowEditForm
              form={showForm}
              setField={setShowField}
              clients={clients}
              setlists={setlists}
              onClientChange={autoFillFromClient}
            />
          </div>
        </div>
      )}

      {/* Shows mode — detail view */}
      {mode === 'shows' && !showEditMode && selectedShowId && selectedShow && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-5 py-3.5 border-b border-[#2a2a2a] flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-white truncate">{selectedShow.venue || 'Unnamed Show'}</h2>
              {selectedShow.city && <p className="text-xs text-[#888]">{[selectedShow.city, selectedShow.state].filter(Boolean).join(', ')}</p>}
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {/* Personnel bubbles */}
              <div className="flex items-center gap-1 mr-2">
                {(selectedShow.personnel || []).map(p => <PersonnelBubble key={p} name={p} />)}
              </div>

              {/* Calendar dropdown */}
              <div className="relative">
                <button onClick={() => setCalendarDropdown(v => !v)} className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors" title="Add to calendar">
                  <i className="fas fa-calendar-plus text-sm" />
                </button>
                {calendarDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-20 min-w-[160px]">
                    <button onClick={() => openGoogleCalendar(selectedShow)} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors flex items-center gap-2">
                      <i className="fab fa-google text-[#4285f4] text-xs" />Google Calendar
                    </button>
                    <button onClick={() => downloadIcs(selectedShow)} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors flex items-center gap-2">
                      <i className="fas fa-download text-[#888] text-xs" />Download .ics
                    </button>
                  </div>
                )}
              </div>

              <button onClick={() => openEditShow(selectedShow)} className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                <i className="fas fa-pen text-sm" />
              </button>
              <button onClick={handleDeleteShow} className="p-2 text-red-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                <i className="fas fa-trash text-sm" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <ShowDetail show={selectedShow} clients={clients} setlists={setlists} />
          </div>
        </div>
      )}

      {/* Show not found */}
      {mode === 'shows' && !showEditMode && selectedShowId && !selectedShow && (
        <EmptyState icon="fa-circle-question" message="Show not found" />
      )}
    </div>
  );

  return (
    <AdminShell activeApp="clients">
      <div className="flex-1 min-h-0 grid overflow-hidden" style={{ gridTemplateColumns: '320px 1fr' }}>
        {leftPanel}
        {rightPanel}
      </div>

      {/* Client form modal */}
      {clientFormOpen && (
        <ClientFormModal
          client={editingClient}
          onClose={() => { setClientFormOpen(false); setEditingClient(null); }}
          onSaved={id => { setClientFormOpen(false); setEditingClient(null); if (id) selectClient(id); }}
        />
      )}
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

// ── Client Profile tab ─────────────────────────────────────────────────────
function ClientProfile({ client }) {
  return (
    <div className="space-y-4 max-w-xl">
      <Card title="Contact">
        <InfoRow label="Contact" value={client.contactName} />
        <InfoRow label="Type" value={client.type} />
        {client.preferredContact && <InfoRow label="Preferred" value={client.preferredContact} />}
        {client.email && <InfoRow label="Email"><a href={`mailto:${client.email}`} className="text-[#00ddde] hover:underline">{client.email}</a></InfoRow>}
        {client.phone && <InfoRow label="Phone"><a href={`tel:${client.phone}`} className="text-[#00ddde] hover:underline">{client.phone}</a></InfoRow>}
        {client.website && <InfoRow label="Website"><a href={client.website} target="_blank" rel="noopener noreferrer" className="text-[#00ddde] hover:underline truncate">{client.website}</a></InfoRow>}
        {client.address && <InfoRow label="Address"><a href={`https://maps.google.com/?q=${encodeURIComponent(client.address)}`} target="_blank" rel="noopener noreferrer" className="text-[#00ddde] hover:underline">{client.address}</a></InfoRow>}
      </Card>

      {(client.rate || client.paymentTerms) && (
        <Card title="Rate & Terms">
          {client.rate && <InfoRow label="Default Rate" value={formatCurrency(client.rate)} />}
          {client.paymentTerms && <InfoRow label="Terms" value={client.paymentTerms} />}
        </Card>
      )}

      {(client.defaultStartTime || client.defaultEndTime || client.defaultItinerary) && (
        <Card title="Show Defaults">
          {client.defaultStartTime && <InfoRow label="Start" value={client.defaultStartTime} />}
          {client.defaultEndTime && <InfoRow label="End" value={client.defaultEndTime} />}
          {client.defaultItinerary && <InfoRow label="Itinerary"><pre className="text-xs text-[#ccc] whitespace-pre-wrap font-sans">{client.defaultItinerary}</pre></InfoRow>}
        </Card>
      )}

      {client.venueDetails && (
        <Card title="Venue / Logistics">
          <pre className="text-xs text-[#ccc] whitespace-pre-wrap font-sans">{client.venueDetails}</pre>
        </Card>
      )}

      {client.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {client.tags.map(t => (
            <span key={t} className="text-xs px-2.5 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-[#888]">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Client Financials tab ──────────────────────────────────────────────────
function ClientFinancials({ shows, onShowClick }) {
  const paid = shows.filter(s => s.payout > 0);
  const total = paid.reduce((sum, s) => sum + Number(s.payout || 0), 0);
  const avg = paid.length ? Math.round(total / paid.length) : 0;

  return (
    <div className="space-y-4 max-w-xl">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Revenue', value: formatCurrency(total) },
          { label: 'Total Shows', value: shows.length },
          { label: 'Avg Payout', value: avg ? formatCurrency(avg) : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-white">{value}</div>
            <div className="text-xs text-[#888] mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
        {shows.length === 0 && <p className="p-4 text-sm text-[#555] text-center">No shows yet</p>}
        {[...shows].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(s => (
          <button
            key={s.id}
            onClick={() => onShowClick(s.id)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a] hover:bg-white/5 transition-colors text-left last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{s.venue}</div>
              <div className="text-xs text-[#888]">{formatDate(s.date)}</div>
            </div>
            {s.payout ? <span className="text-sm font-bold text-green-400">{formatCurrency(s.payout)}</span> : <span className="text-sm text-[#555]">—</span>}
            {s.isPrivate && <span className="text-[10px] text-[#555]">Private</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Client Activity tab ────────────────────────────────────────────────────
function ClientActivity({ logs, logType, logContent, adding, onTypeChange, onContentChange, onAdd, user }) {
  return (
    <div className="space-y-4 max-w-xl">
      {user && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {['note','call','email','meeting'].map(t => (
              <button
                key={t}
                onClick={() => onTypeChange(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize"
                style={logType === t
                  ? { background: `${LOG_COLORS[t]}20`, color: LOG_COLORS[t], border: `1px solid ${LOG_COLORS[t]}50` }
                  : { color: '#888', border: '1px solid transparent' }
                }
              >
                <i className={`fas ${LOG_ICONS[t]} mr-1.5`} />{t}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            value={logContent}
            onChange={e => onContentChange(e.target.value)}
            placeholder="Add a note..."
            className="w-full px-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#00ddde] resize-none"
          />
          <button
            onClick={onAdd}
            disabled={adding || !logContent.trim()}
            className="px-4 py-2 bg-[#008c8d] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {adding ? 'Adding...' : 'Add Log'}
          </button>
        </div>
      )}

      <div className="space-y-0 relative">
        {logs.map((log, i) => {
          const color = LOG_COLORS[log.type] || '#888';
          return (
            <div key={log.id || i} className="flex gap-4 pl-2">
              <div className="flex flex-col items-center">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10" style={{ background: `${color}20`, border: `1px solid ${color}50` }}>
                  <i className={`fas ${LOG_ICONS[log.type] || 'fa-note-sticky'} text-[10px]`} style={{ color }} />
                </div>
                {i < logs.length - 1 && <div className="w-px flex-1 min-h-[16px] mt-1 mb-1" style={{ background: '#2a2a2a' }} />}
              </div>
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-semibold capitalize" style={{ color }}>{log.type}</span>
                  <span className="text-[10px] text-[#555]">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                    {log.author && ` · ${log.author}`}
                  </span>
                </div>
                <p className="text-sm text-[#ccc] whitespace-pre-wrap">{log.content}</p>
              </div>
            </div>
          );
        })}
        {logs.length === 0 && (
          <p className="text-sm text-[#555] py-4">No activity yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Show Detail ────────────────────────────────────────────────────────────
function ShowDetail({ show, clients, setlists }) {
  const client = clients.find(c => c.id === show.clientId);
  const setlist = setlists.find(s => s.id === show.setlistId);

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-2 flex-wrap">
        {show.isPrivate && <Badge>Private</Badge>}
        {show.published && <Badge color="#22c55e">Published</Badge>}
      </div>

      <Card title="Date & Time">
        <InfoRow label="Date" value={formatDate(show.date)} accent />
        {show.startTime && <InfoRow label="Time" value={`${show.startTime}${show.endTime ? ` – ${show.endTime}` : ''}`} />}
      </Card>

      <Card title="Venue">
        {client && <InfoRow label="Client"><a className="text-[#00ddde] hover:underline" onClick={e => { e.preventDefault(); }}>{client.name}</a></InfoRow>}
        {show.venue && <InfoRow label="Venue" value={show.venue} />}
        {(show.city || show.state) && (
          <InfoRow label="Location">
            <a href={`https://maps.google.com/?q=${encodeURIComponent([show.venue, show.city, show.state].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="text-[#00ddde] hover:underline">
              {[show.city, show.state].filter(Boolean).join(', ')}
            </a>
          </InfoRow>
        )}
      </Card>

      {(show.eventLink || setlist || show.eventHandler) && (
        <Card title="Details">
          {show.eventLink && <InfoRow label="Event Link"><a href={show.eventLink} target="_blank" rel="noopener noreferrer" className="text-[#00ddde] hover:underline truncate">{show.eventLink}</a></InfoRow>}
          {setlist && <InfoRow label="Setlist"><a href={`/setlists?id=${show.setlistId}`} className="text-[#00ddde] hover:underline">{setlist.name}</a></InfoRow>}
          {show.eventHandler && <InfoRow label="Handler" value={show.eventHandler} />}
        </Card>
      )}

      {show.personnel?.length > 0 && (
        <Card title="Personnel">
          <div className="flex flex-wrap gap-2">
            {show.personnel.map(p => (
              <div key={p} className="flex items-center gap-1.5">
                <PersonnelBubble name={p} />
                <span className="text-sm text-[#ccc]">{p}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {show.itinerary && (
        <Card title="Itinerary">
          <pre className="text-xs text-[#ccc] whitespace-pre-wrap font-sans">{show.itinerary}</pre>
        </Card>
      )}

      {show.notes && (
        <Card title="Notes">
          <pre className="text-xs text-[#ccc] whitespace-pre-wrap font-sans">{show.notes}</pre>
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

// ── Show Edit Form ─────────────────────────────────────────────────────────
function ShowEditForm({ form, setField, clients, setlists, onClientChange }) {
  return (
    <div className="space-y-4 max-w-xl pb-8">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Date *">
          <input type="date" value={form.date || ''} onChange={e => setField('date', e.target.value)} className={INPUT} />
        </FormField>
        <FormField label="Client">
          <select value={form.clientId || ''} onChange={e => { setField('clientId', e.target.value); onClientChange(e.target.value); }} className={SELECT}>
            <option value="">— Select client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Venue Name">
        <input type="text" value={form.venue || ''} onChange={e => setField('venue', e.target.value)} className={INPUT} placeholder="Venue / event name" />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="City">
          <input type="text" value={form.city || ''} onChange={e => setField('city', e.target.value)} className={INPUT} />
        </FormField>
        <FormField label="State">
          <input type="text" value={form.state || ''} onChange={e => setField('state', e.target.value)} className={INPUT} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Start Time">
          <input type="text" value={form.startTime || ''} onChange={e => setField('startTime', e.target.value)} className={INPUT} placeholder="8:00 PM" />
        </FormField>
        <FormField label="End Time">
          <input type="text" value={form.endTime || ''} onChange={e => setField('endTime', e.target.value)} className={INPUT} placeholder="11:00 PM" />
        </FormField>
      </div>
      <FormField label="Event Link">
        <input type="url" value={form.eventLink || ''} onChange={e => setField('eventLink', e.target.value)} className={INPUT} placeholder="https://..." />
      </FormField>
      <FormField label="Setlist">
        <select value={form.setlistId || ''} onChange={e => setField('setlistId', e.target.value)} className={SELECT}>
          <option value="">— Select setlist —</option>
          {setlists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={selected
                  ? { background: `${color}25`, color, border: `1px solid ${color}60` }
                  : { color: '#888', border: '1px solid #2a2a2a' }
                }
              >
                {p}
              </button>
            );
          })}
        </div>
      </FormField>
      <FormField label="Event Handler">
        <select value={form.eventHandler || ''} onChange={e => setField('eventHandler', e.target.value)} className={SELECT}>
          <option value="">— None —</option>
          {PERSONNEL.map(p => <option key={p}>{p}</option>)}
        </select>
      </FormField>
      <FormField label="Base Payout ($)">
        <input type="number" value={form.payout || ''} onChange={e => setField('payout', e.target.value)} className={INPUT} placeholder="0" style={{ maxWidth: 160 }} />
      </FormField>
      <div className="flex flex-wrap gap-5 pt-1">
        <CheckboxField label="Private Event" checked={!!form.isPrivate} onChange={v => setField('isPrivate', v)} />
        <CheckboxField label="Published on Website" checked={!!form.published} onChange={v => setField('published', v)} />
      </div>
    </div>
  );
}

// ── Client Form Modal ──────────────────────────────────────────────────────
function ClientFormModal({ client, onClose, onSaved }) {
  const [form, setFormState] = useState(client ? { ...client } : {
    name: '', type: 'Venue', status: 'Lead', contactName: '', preferredContact: '', email: '', phone: '',
    website: '', address: '', rate: '', paymentTerms: '', venueDetails: '',
    defaultStartTime: '', defaultEndTime: '', defaultItinerary: '', defaultNotes: '',
    tags: '',
  });
  const [saving, setSaving] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);

  function setField(k, v) { setFormState(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name?.trim()) { alert('Name is required.'); return; }
    setSaving(true);
    try {
      const id = form.id || uuid();
      const tags = typeof form.tags === 'string'
        ? form.tags.split(',').map(t => t.trim()).filter(Boolean)
        : form.tags || [];
      await saveClient({ ...form, id, tags });
      onSaved(id);
    } catch (err) { alert('Save failed: ' + err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-[#1a1a1a] w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl shadow-2xl border border-[#2a2a2a] overflow-hidden max-h-[95vh] flex flex-col">
        <div className="shrink-0 flex justify-between items-center px-5 py-4 border-b border-[#2a2a2a]">
          <p className="text-base font-bold text-white">{client ? 'Edit Client' : 'New Client'}</p>
          <button onClick={onClose} className="text-[#888] hover:text-white p-1"><i className="fas fa-times" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <FormField label="Client / Venue Name *">
            <input type="text" value={form.name || ''} onChange={e => setField('name', e.target.value)} className={INPUT} placeholder="e.g. The Fillmore" autoFocus />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type">
              <select value={form.type || ''} onChange={e => setField('type', e.target.value)} className={SELECT}>
                {['Venue','Planner','Private','Corporate'].map(t => <option key={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select value={form.status || ''} onChange={e => setField('status', e.target.value)} className={SELECT}>
                {['Lead','Active','Past','Do Not Book'].map(s => <option key={s}>{s}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Contact Name">
            <input type="text" value={form.contactName || ''} onChange={e => setField('contactName', e.target.value)} className={INPUT} />
          </FormField>
          <FormField label="Preferred Contact">
            <select value={form.preferredContact || ''} onChange={e => setField('preferredContact', e.target.value)} className={SELECT}>
              {['','None','Phone','Email','Facebook','Website Form','In Person'].map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email">
              <input type="email" value={form.email || ''} onChange={e => setField('email', e.target.value)} className={INPUT} />
            </FormField>
            <FormField label="Phone">
              <input type="tel" value={form.phone || ''} onChange={e => setField('phone', e.target.value)} className={INPUT} />
            </FormField>
          </div>
          <FormField label="Website">
            <input type="url" value={form.website || ''} onChange={e => setField('website', e.target.value)} className={INPUT} placeholder="https://..." />
          </FormField>
          <FormField label="Address">
            <input type="text" value={form.address || ''} onChange={e => setField('address', e.target.value)} className={INPUT} placeholder="123 Main St, Ann Arbor, MI 48104" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Default Rate ($)">
              <input type="number" value={form.rate || ''} onChange={e => setField('rate', e.target.value)} className={INPUT} />
            </FormField>
            <FormField label="Payment Terms">
              <input type="text" value={form.paymentTerms || ''} onChange={e => setField('paymentTerms', e.target.value)} className={INPUT} placeholder="Day of show" />
            </FormField>
          </div>
          <FormField label="Venue / Logistics Notes">
            <textarea rows={3} value={form.venueDetails || ''} onChange={e => setField('venueDetails', e.target.value)} className={INPUT + ' resize-y'} placeholder="Load-in, parking, stage requirements..." />
          </FormField>
          <FormField label="Tags (comma-separated)">
            <input type="text" value={typeof form.tags === 'string' ? form.tags : (form.tags || []).join(', ')} onChange={e => setField('tags', e.target.value)} className={INPUT} placeholder="wedding, corporate, repeat" />
          </FormField>

          {/* Show defaults collapsible */}
          <button onClick={() => setShowDefaults(v => !v)} className="flex items-center gap-2 text-sm text-[#888] hover:text-white transition-colors">
            <i className={`fas fa-chevron-right text-xs transition-transform ${showDefaults ? 'rotate-90' : ''}`} />
            Show Defaults (auto-fill on new show)
          </button>
          {showDefaults && (
            <div className="pl-4 space-y-3 border-l border-[#2a2a2a]">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Default Start Time">
                  <input type="text" value={form.defaultStartTime || ''} onChange={e => setField('defaultStartTime', e.target.value)} className={INPUT} placeholder="8:00 PM" />
                </FormField>
                <FormField label="Default End Time">
                  <input type="text" value={form.defaultEndTime || ''} onChange={e => setField('defaultEndTime', e.target.value)} className={INPUT} placeholder="11:00 PM" />
                </FormField>
              </div>
              <FormField label="Default Itinerary">
                <textarea rows={3} value={form.defaultItinerary || ''} onChange={e => setField('defaultItinerary', e.target.value)} className={INPUT + ' resize-y'} />
              </FormField>
              <FormField label="Default Notes">
                <textarea rows={2} value={form.defaultNotes || ''} onChange={e => setField('defaultNotes', e.target.value)} className={INPUT + ' resize-y'} />
              </FormField>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-[#2a2a2a] px-5 py-3 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-[#2a2a2a] rounded-lg text-white hover:bg-[#333] text-sm font-semibold transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[#008c8d] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
            {saving ? <><i className="fas fa-spinner fa-spin" /> Saving</> : <><i className="fas fa-check" /> Save</>}
          </button>
        </div>
      </div>
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
      <span className={`text-sm flex-1 ${accent ? 'text-[#00ddde] font-semibold' : 'text-[#ccc]'}`}>
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
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 rounded accent-[#008c8d]" />
      <span className="text-sm text-[#ccc]">{label}</span>
    </label>
  );
}
