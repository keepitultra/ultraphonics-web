import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../utils/useIsMobile.js';
import AuthGuard from '../components/AuthGuard.jsx';
import AdminShell, { useAdminDrawer } from '../components/admin/AdminShell.jsx';
import AddressAutocomplete from '../components/AddressAutocomplete.jsx';
import { useAuth } from '../firebase/AuthContext.jsx';
import { useClients } from '../firebase/useFirestore.js';
import {
  saveClient, deleteClient, getClientShows, getClientDetails,
  addActivityLog, subscribeToActivityLogs,
} from '../firestore-service.js';

// ── Constants ──────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  Lead: { bg: '#ca8a04', text: '#fef08a', border: '#a16207' },
  Active: { bg: '#16a34a', text: '#bbf7d0', border: '#15803d' },
  Past: { bg: '#374151', text: '#d1d5db', border: '#4b5563' },
  'Do Not Book': { bg: '#991b1b', text: '#fecaca', border: '#7f1d1d' },
};
const LOG_ICONS = { note: 'fa-note-sticky', call: 'fa-phone', email: 'fa-envelope', meeting: 'fa-handshake', quote: 'fa-file-invoice-dollar', show: 'fa-music' };
const LOG_COLORS = { note: '#888', call: '#22c55e', email: '#3b82f6', meeting: '#a78bfa', quote: '#f59e0b', show: '#00ddde' };
const STATUS_FILTERS = ['All', 'Lead', 'Active', 'Past', 'Do Not Book'];
const ALL_FILTER_COLOR = { bg: '#00ddde', text: '#99f6f6', border: '#00a8a9' };

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

function StatusFilterChip({ status, active, onClick }) {
  const c = status === 'All' ? ALL_FILTER_COLOR : (STATUS_COLORS[status] || STATUS_COLORS.Past);
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors"
      style={active
        ? { background: `${c.bg}25`, color: c.text, borderColor: c.border }
        : { background: 'transparent', color: '#666', borderColor: '#2a2a2a' }
      }
    >
      {status}
    </button>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // ISO date-only strings (YYYY-MM-DD) must be parsed without a Date object
  // to avoid UTC→local shift (new Date("2024-10-10") = UTC midnight = Oct 9 in US timezones)
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(iso[2]) - 1]} ${parseInt(iso[3])}, ${iso[1]}`;
  }
  // Legacy US-format dates ("M/D/YYYY") parse as local time — safe to use directly
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
  const navigate = useNavigate();
  const { open: drawerOpen, close: closeDrawer } = useAdminDrawer();
  const { data: clients = [] } = useClients();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const selectedClientId = searchParams.get('client') || null;

  // Left panel filters
  const [clientSearch, setClientSearch] = useState('');
  const [clientStatusFilter, setClientStatusFilter] = useState(() => localStorage.getItem('cm_clientStatus') ?? 'Active');
  const [clientTypeFilter, setClientTypeFilter] = useState('All');
  const [clientSort, setClientSort] = useState('Name A-Z');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const hasExtraFilters = clientTypeFilter !== 'All' || clientSort !== 'Name A-Z';

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

  const selectedClient = clients.find(c => c.id === selectedClientId) || null;

  // Load client shows when client changes
  useEffect(() => {
    if (!selectedClientId) { setClientShows([]); return; }
    getClientShows(selectedClientId).then(setClientShows).catch(() => {});
  }, [selectedClientId]);

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
    closeDrawer();
  }

  // Closes the mobile fullscreen detail view, back to the client list.
  function closeMobileDetail() {
    setSearchParams({}, { replace: true });
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

  // ── Left panel ──────────────────────────────────────────────────────────
  const leftPanel = (
    <div className={isMobile
      ? 'flex-1 min-h-0 flex flex-col overflow-hidden bg-[#1a1a1a]'
      : `admin-drawer flex flex-col overflow-hidden bg-[#1a1a1a] border-r border-[#2a2a2a]${drawerOpen ? ' drawer-open' : ''}`
    }>
      {/* Client controls */}
      <div className="shrink-0 p-3 border-b border-[#2a2a2a] space-y-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-xs pointer-events-none" />
            <input
              type="text"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-8 pr-8 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs placeholder-[#555] focus:outline-none focus:border-[#00ddde]"
            />
            {clientSearch && (
              <button
                onClick={() => setClientSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-[#555] hover:text-white transition-colors"
                title="Clear search"
              >
                <i className="fas fa-circle-xmark text-xs" />
              </button>
            )}
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setFilterPanelOpen(v => !v)}
              className={`relative w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${
                filterPanelOpen ? 'bg-[#00ddde]/10 border-[#00ddde]/40 text-[#00ddde]' : 'bg-[#121212] border-[#2a2a2a] text-[#888] hover:text-white'
              }`}
              title="Type & sort"
            >
              <i className="fas fa-sliders text-xs" />
              {hasExtraFilters && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#00ddde]" />
              )}
            </button>
            {filterPanelOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFilterPanelOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 w-52 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl p-3 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#555] mb-1.5">Type</label>
                    <select value={clientTypeFilter} onChange={e => setClientTypeFilter(e.target.value)} className="w-full px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs focus:outline-none focus:border-[#00ddde]">
                      {['All','Venue','Planner','Private','Corporate'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#555] mb-1.5">Sort</label>
                    <select value={clientSort} onChange={e => setClientSort(e.target.value)} className="w-full px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs focus:outline-none focus:border-[#00ddde]">
                      {['Name A-Z','Name Z-A','Last Contact','Last Updated'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setClientFormOpen(true)} className="shrink-0 w-9 h-9 flex items-center justify-center bg-[#008c8d] hover:bg-[#00a8a9] text-white rounded-lg text-xs font-semibold transition-colors" title="New client">
            <i className="fas fa-plus" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map(s => (
            <StatusFilterChip
              key={s}
              status={s}
              active={clientStatusFilter === s}
              onClick={() => { setClientStatusFilter(s); localStorage.setItem('cm_clientStatus', s); }}
            />
          ))}
        </div>
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
    </div>
  );

  // ── Right panel ────────────────────────────────────────────────────────
  const rightPanel = (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#121212]">
      {!selectedClientId && (
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-base font-bold mb-5" style={{ color: '#00ddde' }}>Clients</p>
            <i className="fas fa-address-book text-5xl mb-4 block opacity-20 text-[#555]" />
            <p className="text-sm text-[#555]">Select a client to view details</p>
            <button onClick={() => setClientFormOpen(true)} className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold transition-colors" style={{ background: 'rgba(0,221,222,0.08)', border: '1px solid rgba(0,221,222,0.25)', color: '#00ddde' }}>
              <i className="fas fa-plus mr-1.5" />New Client
            </button>
          </div>
        </div>
      )}

      {selectedClientId && selectedClient && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Client header */}
          <div className="shrink-0 px-5 py-3.5 border-b border-[#2a2a2a] flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-base font-bold text-white truncate">{selectedClient.name}</div>
                <StatusBadge status={selectedClient.status || 'Active'} />
              </div>
              {selectedClient.type && <p className="text-xs text-[#888]">{selectedClient.type}</p>}
            </div>
            <div className="shrink-0 flex items-center gap-1">
              <button onClick={() => navigate(`/shows?show=new&clientId=${selectedClient.id}`)} title="New show" className="px-3 py-1.5 bg-[#008c8d]/20 border border-[#008c8d]/40 text-[#00ddde] rounded-lg text-xs font-semibold hover:bg-[#008c8d]/30 transition-colors">
                <i className="fas fa-plus sm:mr-1" /><span className="hidden sm:inline">Show</span>
              </button>
              <button onClick={() => { setEditingClient(selectedClient); setClientFormOpen(true); }} className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                <i className="fas fa-pen text-sm" />
              </button>
              <button onClick={handleDeleteClient} className="p-2 text-red-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                <i className="fas fa-trash text-sm" />
              </button>
              {isMobile && (
                <button onClick={closeMobileDetail} className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors" title="Close">
                  <i className="fas fa-times text-sm" />
                </button>
              )}
            </div>
          </div>

          {/* Client tabs */}
          <div className="shrink-0 flex overflow-x-auto border-b border-[#2a2a2a]">
            {['profile','shows','financials','activity'].map(tab => (
              <button
                key={tab}
                onClick={() => setClientDetailTab(tab)}
                className={`shrink-0 whitespace-nowrap px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors capitalize ${
                  clientDetailTab === tab ? 'text-[#00ddde] border-b-2 border-[#00ddde]' : 'text-[#888] hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Client tab content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <div className="max-w-2xl mx-auto">
            {clientDetailTab === 'profile' && <ClientProfile client={selectedClient} />}
            {clientDetailTab === 'shows' && <ClientShows shows={clientShows} onShowClick={id => navigate('/shows?show=' + id)} />}
            {clientDetailTab === 'financials' && <ClientFinancials shows={clientShows} onShowClick={id => navigate('/shows?show=' + id)} />}
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
        </div>
      )}
    </div>
  );

  return (
    <AdminShell activeApp="clients" hideDrawerToggle={isMobile}>
      {isMobile ? (
        <>
          {/* Mobile: the client list is the primary view */}
          {leftPanel}
          {/* Fullscreen "L2" view — closed with the X in its header */}
          {selectedClientId && (
            <div className="fixed inset-0 z-50 bg-[#121212] flex flex-col">
              {rightPanel}
            </div>
          )}
        </>
      ) : (
        /* Desktop: two-column layout */
        <div className="admin-page-grid flex-1 min-h-0 grid overflow-hidden">
          {leftPanel}
          {rightPanel}
        </div>
      )}

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
        {client.nextContactDate && <InfoRow label="Next Contact" value={formatDate(client.nextContactDate)} accent />}
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
// ── Client Shows tab ──────────────────────────────────────────────────────
function ClientShows({ shows, onShowClick }) {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...shows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const upcoming = sorted.filter(s => (s.date || '') >= today);
  const past = sorted.filter(s => (s.date || '') < today);

  function ShowRow({ s }) {
    return (
      <button
        onClick={() => onShowClick(s.id)}
        className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a] hover:bg-white/5 transition-colors text-left last:border-b-0"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{s.venue || 'Unnamed Show'}</div>
          <div className="text-xs text-[#888]">{formatDate(s.date)}{s.startTime ? ` · ${s.startTime}` : ''}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {s.isPrivate && <span className="text-[10px] text-[#555]">Private</span>}
          {s.published && !s.isPrivate && <span className="text-[10px] text-[#00ddde]">Public</span>}
          <i className="fas fa-chevron-right text-[10px] text-[#444]" />
        </div>
      </button>
    );
  }

  if (shows.length === 0) {
    return <p className="text-sm text-[#555] py-4">No shows yet.</p>;
  }

  return (
    <div className="space-y-5 max-w-xl">
      {upcoming.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#555] mb-2">Upcoming</p>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
            {[...upcoming].reverse().map(s => <ShowRow key={s.id} s={s} />)}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#555] mb-2">Past</p>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
            {past.map(s => <ShowRow key={s.id} s={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

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

// ── Client Form Modal ──────────────────────────────────────────────────────
function ClientFormModal({ client, onClose, onSaved }) {
  const [form, setFormState] = useState(client ? { ...client } : {
    name: '', type: 'Venue', status: 'Lead', contactName: '', preferredContact: '', email: '', phone: '',
    website: '', address: '', rate: '', paymentTerms: '', venueDetails: '',
    defaultStartTime: '', defaultEndTime: '', defaultItinerary: '', defaultNotes: '',
    tags: '', nextContactDate: '',
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
          <FormField label="Next Contact Date">
            <input type="date" value={form.nextContactDate || ''} onChange={e => setField('nextContactDate', e.target.value)} className={INPUT} />
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
            <AddressAutocomplete
              value={form.address || ''}
              onChange={v => setField('address', v)}
              onPlace={({ formattedAddress, streetAddress, city, state, postalCode, lat, lng }) => {
                setFormState(f => ({
                  ...f,
                  address: formattedAddress,
                  streetAddress,
                  city: city || f.city,
                  state: state || f.state,
                  postalCode: postalCode || f.postalCode,
                  ...(lat != null ? { lat, lng } : {}),
                }));
              }}
              className={INPUT}
              placeholder="123 Main St, Ann Arbor, MI 48104"
              types={['geocode', 'establishment']}
            />
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
