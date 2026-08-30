import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard.jsx';
import AdminShell, { useAdminDrawer } from '../components/admin/AdminShell.jsx';
import { useAuth } from '../firebase/AuthContext.jsx';
import { useQuotes, useClients } from '../firebase/useFirestore.js';
import {
  getQuote, updateQuoteStatus, linkQuoteToClient, updateQuote,
  saveClient, updateClient, addActivityLog,
} from '../firestore-service.js';
import {
  QUOTE_STATUSES, QUOTE_STATUS_COLORS,
  quoteToClient, buildQuoteLogContent,
} from '../utils/quoteForm.js';
import { playChime } from '../utils/chime.js';

const ACCENT = '#ec4899';
const INPUT = 'w-full px-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm focus:outline-none focus:border-[#ec4899]';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Parses YYYY-MM-DD as local, avoiding the UTC-midnight day shift. */
function formatDate(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function receivedAtMs(quote) {
  const r = quote.receivedAt;
  if (r?.toMillis) return r.toMillis();
  if (r?.seconds) return r.seconds * 1000;
  return Date.parse(quote.createdAt || 0) || 0;
}

function timeAgo(ms) {
  if (!ms) return '';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function daysUntil(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export default function QuoteManagerPage() {
  return <AuthGuard><QuoteManager /></AuthGuard>;
}

function QuoteManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { open: drawerOpen, close: closeDrawer } = useAdminDrawer();
  const { data: quotes = [], loading } = useQuotes();
  const { data: clients = [] } = useClients();
  const [searchParams, setSearchParams] = useSearchParams();

  // Emails carry ?id=; every other admin page uses a named param, so accept both.
  const selectedId = searchParams.get('id') || searchParams.get('quote');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('qm_status') || 'All');
  const [sortBy, setSortBy] = useState('received');
  const [convertOpen, setConvertOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { localStorage.setItem('qm_status', statusFilter); }, [statusFilter]);

  // Chime only when the New count rises. Starting at null means the first
  // snapshot never fires it.
  const prevNewCount = useRef(null);
  const newCount = quotes.filter(q => q.status === 'New').length;
  useEffect(() => {
    if (loading) return;
    if (prevNewCount.current !== null && newCount > prevNewCount.current) playChime();
    prevNewCount.current = newCount;
  }, [newCount, loading]);

  const counts = useMemo(() => {
    const c = { All: quotes.length };
    for (const s of QUOTE_STATUSES) c[s] = quotes.filter(q => q.status === s).length;
    return c;
  }, [quotes]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes
      .filter(q => statusFilter === 'All' || q.status === statusFilter)
      .filter(q => !term || `${q.name} ${q.email} ${q.venue} ${q.location}`.toLowerCase().includes(term))
      .sort((a, b) => {
        if (sortBy === 'event') return String(a.date).localeCompare(String(b.date));
        if (sortBy === 'name') return String(a.name).localeCompare(String(b.name));
        return receivedAtMs(b) - receivedAtMs(a);
      });
  }, [quotes, statusFilter, search, sortBy]);

  const quote = quotes.find(q => q.id === selectedId) || null;

  const emailMatch = useMemo(() => {
    const e = (quote?.email || '').trim().toLowerCase();
    if (!e) return null;
    return clients.find(c => (c.email || '').trim().toLowerCase() === e) || null;
  }, [clients, quote?.email]);

  const linkedClient = quote?.convertedClientId
    ? clients.find(c => c.id === quote.convertedClientId) || null
    : null;

  function select(id) {
    setSearchParams({ id }, { replace: false });
    closeDrawer();
  }

  async function setStatus(status) {
    if (!quote) return;
    try { await updateQuoteStatus(quote.id, status, user); }
    catch (err) { alert('Could not update status: ' + err.message); }
  }

  async function handleDelete() {
    if (!quote) return;
    if (!window.confirm(`Delete the lead from ${quote.name}? This cannot be undone.`)) return;
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../firebase-config.js');
      await deleteDoc(doc(db, 'quotes', quote.id));
      setSearchParams({}, { replace: true });
    } catch (err) { alert('Delete failed: ' + err.message); }
  }

  /**
   * Convert order matters and must not change: create/patch the client, THEN
   * record the link, THEN log. If the link write fails you get a real client
   * with an unlinked quote — visible and recoverable. Writing the link first
   * would leave a quote pointing at a client that never existed.
   */
  async function convert({ mode, existingClient, overrides }) {
    if (!quote || busy) return;
    setBusy(true);
    try {
      // The live snapshot is not transactional — re-read before writing so a
      // double-click or a second tab cannot produce two clients.
      const fresh = await getQuote(quote.id);
      if (fresh?.convertedClientId) {
        setConvertOpen(false);
        navigate(`/clients?client=${fresh.convertedClientId}`);
        return;
      }

      let clientId;
      if (mode === 'link' && existingClient) {
        clientId = existingClient.id;
        // Fill blanks only. saveClient is a full overwrite and would drop any
        // field this snapshot happens not to carry.
        const patch = {};
        if (!existingClient.phone && quote.phone) patch.phone = quote.phone;
        if (!existingClient.email && quote.email) patch.email = quote.email;
        if (existingClient.status === 'Past') patch.status = 'Lead';
        patch.nextContactDate = new Date().toISOString().slice(0, 10);
        patch.tags = Array.from(new Set([
          ...(existingClient.tags || []),
          String(quote.eventType || '').toLowerCase().replace(/\s+/g, '-'),
          'web-lead',
        ].filter(Boolean)));
        await updateClient(clientId, patch);
      } else {
        clientId = uuid();
        // overrides carry the admin's corrections to the guessed name/type/tags.
        await saveClient({ ...quoteToClient(quote), ...(overrides || {}), id: clientId });
      }

      await linkQuoteToClient(quote.id, clientId, user);
      await addActivityLog(clientId, {
        type: 'quote',
        quoteId: quote.id,
        content: buildQuoteLogContent(quote),
        author: user?.displayName || 'Admin',
        authorId: user?.uid,
      });
      if (quote.status === 'New') await updateQuote(quote.id, { status: 'Contacted' });

      setConvertOpen(false);
      navigate(`/clients?client=${clientId}`);
    } catch (err) {
      alert('Could not add to CRM: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  // ── Left ────────────────────────────────────────────────────────────────
  const leftPanel = (
    <div className={`admin-drawer flex flex-col overflow-hidden bg-[#1a1a1a] border-r border-[#2a2a2a] text-left${drawerOpen ? ' drawer-open' : ''}`}>
      <div className="shrink-0 p-3 border-b border-[#2a2a2a] space-y-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, venue…"
          className={INPUT}
        />
        <div className="flex flex-wrap gap-1">
          {['All', ...QUOTE_STATUSES].map(s => {
            const on = statusFilter === s;
            const color = s === 'All' ? ACCENT : QUOTE_STATUS_COLORS[s];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                style={on
                  ? { background: `${color}26`, color, border: `1px solid ${color}55` }
                  : { color: '#777', border: '1px solid #2a2a2a' }}
              >
                {s} {counts[s] ?? 0}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-[#888] text-xs focus:outline-none">
            <option value="received">Newest</option>
            <option value="event">Event date</option>
            <option value="name">Name A–Z</option>
          </select>
          <span className="flex items-center gap-1.5 text-[#555] text-[10px]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && <p className="p-4 text-sm text-[#555]">Loading…</p>}
        {!loading && visible.length === 0 && (
          <div className="p-8 text-center text-[#555]">
            <i className="fas fa-file-invoice-dollar text-3xl mb-3 block opacity-20" />
            <p className="text-sm">No leads here</p>
          </div>
        )}
        {visible.map(q => {
          const isNew = q.status === 'New';
          return (
            <button
              key={q.id}
              onClick={() => select(q.id)}
              className={`w-full text-left px-4 py-3 border-b border-[#2a2a2a] transition-colors ${
                selectedId === q.id ? 'bg-white/5' : 'hover:bg-white/5'
              }`}
              style={isNew ? { borderLeft: `2px solid ${ACCENT}`, background: `${ACCENT}0d` } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={`text-sm truncate ${isNew ? 'font-bold text-white' : 'font-semibold text-[#ddd]'}`}>
                    {q.name}
                  </div>
                  <div className="text-[11px] text-[#888] truncate mt-0.5">
                    {q.eventType}{q.date ? ` · ${formatDate(q.date)}` : ''}
                  </div>
                  <div className="text-[11px] text-[#666] truncate">{q.location}</div>
                </div>
                <QuoteStatusBadge status={q.status} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="shrink-0 px-4 py-2 border-t border-[#2a2a2a] text-[11px] text-[#555]">
        {visible.length} of {quotes.length} lead{quotes.length !== 1 ? 's' : ''}
      </div>
    </div>
  );

  // ── Right ───────────────────────────────────────────────────────────────
  const days = quote ? daysUntil(quote.date) : null;

  const rightPanel = (
    <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden bg-[#121212] text-left">
      {!quote && (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <i className="fas fa-file-invoice-dollar text-5xl mb-4 block opacity-20 text-[#555]" />
            <p className="text-sm text-[#555]">Select a lead</p>
          </div>
        </div>
      )}

      {quote && (
        <>
          <div className="shrink-0 px-4 py-3 border-b border-[#2a2a2a]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="flex-1 min-w-0 text-base font-bold text-white truncate">{quote.name}</h1>
              <QuoteStatusBadge status={quote.status} />
              <select
                value={quote.status}
                onChange={e => setStatus(e.target.value)}
                className="px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs focus:outline-none focus:border-[#ec4899]"
              >
                {QUOTE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {quote.email && (
                <a href={`mailto:${quote.email}`} title="Email" className="w-9 h-9 flex items-center justify-center rounded-lg text-[#888] hover:text-white hover:bg-white/5">
                  <i className="fas fa-envelope text-sm" />
                </a>
              )}
              {quote.phone && (
                <a href={`tel:${quote.phone}`} title="Call" className="w-9 h-9 flex items-center justify-center rounded-lg text-[#888] hover:text-white hover:bg-white/5">
                  <i className="fas fa-phone text-sm" />
                </a>
              )}
              <button onClick={handleDelete} title="Delete lead"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[#555] hover:text-red-400 hover:bg-white/5">
                <i className="fas fa-trash text-sm" />
              </button>
            </div>

            <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-[#888]">
              <span>Received {timeAgo(receivedAtMs(quote))}</span>
              {days !== null && (
                <span className="px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}35` }}>
                  {days < 0 ? `${Math.abs(days)} days ago` : days === 0 ? 'Today' : `in ${days} days`}
                </span>
              )}
            </div>

            <div className="mt-3">
              {linkedClient ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => navigate(`/clients?client=${linkedClient.id}`)}
                    className="min-h-[40px] px-4 rounded-xl text-sm font-bold bg-[#00ddde]/15 border border-[#00ddde]/40 text-[#00ddde] hover:bg-[#00ddde]/25 transition-colors"
                  >
                    <i className="fas fa-address-book mr-1.5" />View {linkedClient.name}
                  </button>
                  <button onClick={() => setConvertOpen(true)} className="text-[11px] text-[#666] hover:text-white underline">
                    Convert again
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setConvertOpen(true)}
                    disabled={busy}
                    className="min-h-[40px] px-4 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-60"
                    style={{ background: ACCENT }}
                  >
                    <i className="fas fa-user-plus mr-1.5" />Add to CRM
                  </button>
                  {quote.convertedClientId && (
                    <span className="text-[11px] text-amber-400">
                      <i className="fas fa-triangle-exclamation mr-1" />Linked client no longer exists
                    </span>
                  )}
                  {emailMatch && (
                    <span className="text-[11px] text-[#888]">
                      Matches existing client <strong className="text-[#ccc]">{emailMatch.name}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 max-w-2xl">
            <Card title="Contact">
              <InfoRow label="Name" value={quote.name} />
              <InfoRow label="Email">
                <a className="text-[#ec4899] hover:underline" href={`mailto:${quote.email}`}>{quote.email}</a>
              </InfoRow>
              <InfoRow label="Phone">
                {quote.phone ? <a className="text-[#ec4899] hover:underline" href={`tel:${quote.phone}`}>{quote.phone}</a> : '—'}
              </InfoRow>
            </Card>

            <Card title="Event">
              <InfoRow label="Type" value={quote.eventType === 'Other' && quote.eventTypeOther
                ? `Other (${quote.eventTypeOther})` : quote.eventType} />
              <InfoRow label="Date" value={formatDate(quote.date)} accent />
              <InfoRow label="Location" value={quote.location} />
              <InfoRow label="Venue" value={quote.venue} />
              <InfoRow label="Setting" value={quote.setting} />
            </Card>

            <Card title="Logistics">
              <InfoRow label="Guests" value={quote.guests} />
              <InfoRow label="Duration" value={quote.duration} />
              <InfoRow label="Hard stop" value={quote.hardStop} />
            </Card>

            <Card title="Band & Music">
              <InfoRow label="Band size" value={quote.bandSize} />
              <InfoRow label="Open to recs" value={quote.openToRec ? 'Yes' : 'No'} />
              <InfoRow label="Services"><Pills items={quote.services} /></InfoRow>
              <InfoRow label="Genres"><Pills items={quote.genres} /></InfoRow>
            </Card>

            <Card title="Production & Budget">
              <InfoRow label="Sound" value={quote.sound} />
              <InfoRow label="Lighting" value={quote.lighting} />
              <InfoRow label="Budget" value={quote.budget} accent />
              <InfoRow label="Urgency" value={quote.urgency} />
            </Card>

            {quote.notes && (
              <Card title="Notes">
                <pre className="whitespace-pre-wrap font-sans text-sm text-[#ccc]">{quote.notes}</pre>
              </Card>
            )}

            <Card title="Source">
              <InfoRow label="Received" value={new Date(receivedAtMs(quote)).toLocaleString()} />
              <InfoRow label="Campaign" value={[quote.utmSource, quote.utmMedium, quote.utmCampaign].filter(Boolean).join(' / ')} />
              <InfoRow label="Referrer" value={quote.referrer} />
            </Card>
          </div>
        </>
      )}

      {convertOpen && quote && (
        <ConvertQuoteModal
          quote={quote}
          emailMatch={linkedClient ? null : emailMatch}
          busy={busy}
          onConvert={convert}
          onClose={() => setConvertOpen(false)}
        />
      )}
    </div>
  );

  return (
    <AdminShell activeApp="quotes">
      <div className="admin-page-grid flex-1 min-h-0 grid overflow-hidden">
        {leftPanel}
        {rightPanel}
      </div>
    </AdminShell>
  );
}

// ── Convert ───────────────────────────────────────────────────────────────
function ConvertQuoteModal({ quote, emailMatch, busy, onConvert, onClose }) {
  const mapped = quoteToClient(quote);
  const [form, setForm] = useState({
    name: mapped.name, type: mapped.type, tags: (mapped.tags || []).join(', '),
  });
  // Matching on email alone false-positives on shared inboxes, so linking is
  // always an explicit choice with the match shown.
  const [mode, setMode] = useState(emailMatch ? 'link' : 'create');

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] w-full max-w-md rounded-2xl border border-[#2a2a2a] shadow-2xl overflow-hidden text-left">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[#2a2a2a]">
          <p className="text-base font-bold text-white">Add to CRM</p>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-[#888] hover:text-white rounded-lg">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {emailMatch && (
            <div className="p-3 rounded-xl border" style={{ background: '#00ddde10', borderColor: '#00ddde40' }}>
              <p className="text-[11px] uppercase tracking-wider text-[#00ddde] font-bold mb-1">Existing client, same email</p>
              <p className="text-sm text-white font-semibold">{emailMatch.name}</p>
              <p className="text-[11px] text-[#888] mt-0.5">
                {emailMatch.type} · {emailMatch.status}{emailMatch.phone ? ` · ${emailMatch.phone}` : ''}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setMode('link')}
                  className="flex-1 min-h-[40px] px-3 rounded-xl text-xs font-bold transition-colors"
                  style={mode === 'link'
                    ? { background: '#00ddde25', color: '#00ddde', border: '1px solid #00ddde60' }
                    : { color: '#888', border: '1px solid #2a2a2a' }}>
                  Link to this client
                </button>
                <button onClick={() => setMode('create')}
                  className="flex-1 min-h-[40px] px-3 rounded-xl text-xs font-bold transition-colors"
                  style={mode === 'create'
                    ? { background: `${ACCENT}25`, color: ACCENT, border: `1px solid ${ACCENT}60` }
                    : { color: '#888', border: '1px solid #2a2a2a' }}>
                  Create new anyway
                </button>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">Client name</label>
                <input className={INPUT} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <p className="text-[11px] text-[#555] mt-1">
                  Guessed from the event type — a wedding names the person, a corporate booking the organisation.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">Type</label>
                <select className={INPUT} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {['Venue', 'Planner', 'Private', 'Corporate'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">Tags</label>
                <input className={INPUT} value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
              </div>
              <p className="text-[11px] text-[#555]">
                Email, phone, city, venue details and today&rsquo;s follow-up date are carried across automatically,
                and the full request is saved to the client&rsquo;s activity log.
              </p>
            </>
          )}
        </div>

        <div className="border-t border-[#2a2a2a] px-5 py-3 flex gap-3 justify-end">
          <button onClick={onClose} className="min-h-[40px] px-4 rounded-xl text-sm font-semibold text-[#aaa] hover:text-white hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={() => onConvert({
              mode,
              existingClient: emailMatch,
              overrides: mode === 'create'
                ? { name: form.name.trim(), type: form.type, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) }
                : null,
            })}
            disabled={busy}
            className="min-h-[40px] px-5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-60"
            style={{ background: mode === 'link' ? '#008c8d' : ACCENT }}
          >
            {busy ? <><i className="fas fa-spinner fa-spin mr-1.5" />Working</>
                  : mode === 'link' ? 'Link to client' : 'Create client'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────
function QuoteStatusBadge({ status }) {
  const color = QUOTE_STATUS_COLORS[status] || '#888';
  return (
    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${color}20`, color, border: `1px solid ${color}45` }}>
      {status || 'New'}
    </span>
  );
}

function Pills({ items }) {
  if (!items?.length) return <span className="text-[#555]">—</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map(i => (
        <span key={i} className="text-[11px] px-2 py-0.5 rounded"
          style={{ background: `${ACCENT}15`, color: '#ddd', border: `1px solid ${ACCENT}30` }}>{i}</span>
      ))}
    </span>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-[#2a2a2a]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">{title}</span>
      </div>
      <div className="p-4 space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, children, accent }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="w-28 shrink-0 text-[#666] text-xs pt-0.5">{label}</span>
      <span className={`flex-1 min-w-0 ${accent ? 'font-semibold' : ''}`} style={accent ? { color: ACCENT } : { color: '#ddd' }}>
        {children || value || <span className="text-[#555]">—</span>}
      </span>
    </div>
  );
}
