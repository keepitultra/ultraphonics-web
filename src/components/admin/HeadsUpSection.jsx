import { useState, useMemo, useEffect } from 'react';
import { useMembers } from '../../firebase/useFirestore.js';
import { Link } from 'react-router-dom';
import MemberAvatar from '../MemberAvatar.jsx';


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

// Normalizes any date format (YYYY-MM-DD, M/D/YYYY, etc.) to YYYY-MM-DD using
// local date components so timezone offset doesn't shift the day.
function normalizeDateStr(dateStr) {
  if (!dateStr) return '';
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HeadsUpSection({ shows, clients, memberProfiles = {}, onTotalCount }) {
  const members = useMembers();
  const [lookaheadWeeks, setLookaheadWeeks] = useState(() => {
    const v = parseInt(localStorage.getItem('hu_lookahead_weeks') || '4');
    return isNaN(v) ? 4 : v;
  });
  const [overdueMonths, setOverdueMonths] = useState(() => {
    const v = parseInt(localStorage.getItem('hu_overdue_months') || '1');
    return isNaN(v) ? 1 : v;
  });
  const [configOpen, setConfigOpen] = useState(false);

  const { upcomingShows, scheduledContacts, overdueClients } = useMemo(() => {
    const today = new Date();
    const todayStr = localDateStr(today);

    const lookaheadDate = new Date(today);
    lookaheadDate.setDate(lookaheadDate.getDate() + lookaheadWeeks * 7);
    const lookaheadStr = localDateStr(lookaheadDate);

    const overdueDate = new Date(today);
    overdueDate.setMonth(overdueDate.getMonth() - overdueMonths);
    const overdueDateStr = localDateStr(overdueDate);

    // Last past-show date per client (normalized to YYYY-MM-DD for safe comparison)
    const lastShowByClient = {};
    const futureShowClientIds = new Set();
    for (const show of shows) {
      if (show.clientId && show.date) {
        const d = normalizeDateStr(show.date);
        if (!d) continue;
        if (d >= todayStr) {
          futureShowClientIds.add(show.clientId);
        } else {
          if (!lastShowByClient[show.clientId] || d > lastShowByClient[show.clientId]) {
            lastShowByClient[show.clientId] = d;
          }
        }
      }
    }

    const upcomingShows = shows
      .filter(s => {
        const d = normalizeDateStr(s.date);
        return d && d >= todayStr && d <= lookaheadStr;
      })
      .sort((a, b) => normalizeDateStr(a.date).localeCompare(normalizeDateStr(b.date)));

    const scheduledContacts = clients
      .filter(c => c.nextContactDate && c.nextContactDate >= todayStr && c.nextContactDate <= lookaheadStr)
      .sort((a, b) => a.nextContactDate.localeCompare(b.nextContactDate));

    const scheduledContactIds = new Set(scheduledContacts.map(c => c.id));

    const overdueClients = clients
      .filter(c => {
        if (c.status !== 'Active') return false;
        if (scheduledContactIds.has(c.id)) return false;
        if (futureShowClientIds.has(c.id)) return false;
        const lastSignal = [
          c.lastInteraction ? c.lastInteraction.slice(0, 10) : null,
          lastShowByClient[c.id] || null,
        ].filter(Boolean).sort().pop();
        // Exclude never-contacted — only surface clients we've actually worked with
        if (!lastSignal) return false;
        return lastSignal < overdueDateStr;
      })
      .map(c => ({
        ...c,
        _lastSignal: [
          c.lastInteraction ? c.lastInteraction.slice(0, 10) : null,
          lastShowByClient[c.id] || null,
        ].filter(Boolean).sort().pop() || null,
      }))
      .sort((a, b) => (a._lastSignal || '').localeCompare(b._lastSignal || ''));

    return { upcomingShows, scheduledContacts, overdueClients };
  }, [shows, clients, lookaheadWeeks, overdueMonths]);

  const totalCount = upcomingShows.length + scheduledContacts.length + overdueClients.length;

  useEffect(() => { onTotalCount?.(totalCount); }, [totalCount, onTotalCount]);

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-[#555] uppercase tracking-wider font-semibold">Heads Up</p>
          {totalCount > 0 && (
            <span className="text-[10px] bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-full px-2 py-0.5 font-bold tabular-nums">
              {totalCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setConfigOpen(v => !v)}
          className={`text-xs px-2 py-1 rounded-lg transition-colors ${configOpen ? 'text-white bg-white/5' : 'text-[#555] hover:text-[#888]'}`}
          title="Configure thresholds"
        >
          <i className="fas fa-sliders" />
        </button>
      </div>

      {configOpen && (
        <div className="p-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-[#888]">
            Look ahead
            <input
              type="number" min="1" max="52" value={lookaheadWeeks}
              onChange={e => {
                const v = Math.max(1, parseInt(e.target.value) || 1);
                setLookaheadWeeks(v);
                localStorage.setItem('hu_lookahead_weeks', v);
              }}
              className="w-12 px-2 py-1 bg-[#121212] border border-[#2a2a2a] rounded text-white text-xs text-center"
            />
            wks
          </label>
          <label className="flex items-center gap-2 text-xs text-[#888]">
            Overdue after
            <input
              type="number" min="1" max="24" value={overdueMonths}
              onChange={e => {
                const v = Math.max(1, parseInt(e.target.value) || 1);
                setOverdueMonths(v);
                localStorage.setItem('hu_overdue_months', v);
              }}
              className="w-12 px-2 py-1 bg-[#121212] border border-[#2a2a2a] rounded text-white text-xs text-center"
            />
            mo
          </label>
        </div>
      )}

      {totalCount === 0 && (
        <div className="py-10 text-center text-[#444]">
          <i className="fas fa-check-circle text-2xl mb-2 block opacity-30" />
          <p className="text-xs">Nothing urgent right now</p>
        </div>
      )}

      {/* Upcoming Shows */}
      {upcomingShows.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-[#2a2a2a] flex items-center gap-2">
            <i className="fas fa-calendar-days text-[#a78bfa] text-[10px]" />
            <p className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Upcoming Shows</p>
            <span className="ml-auto text-[10px] text-[#555] font-mono">{upcomingShows.length}</span>
          </div>
          {upcomingShows.map(show => (
            <Link
              key={show.id}
              to={`/shows?show=${show.id}`}
              className="flex items-start gap-3 px-4 py-3 border-b border-[#2a2a2a] last:border-b-0 hover:bg-white/5 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{show.venue || 'Unnamed Show'}</div>
                <div className="text-xs text-[#888] mt-0.5">
                  {formatDate(show.date)}{show.startTime ? ` · ${show.startTime}` : ''}
                </div>
                {show.personnel?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {show.personnel.map(name => {
                      const color = members.colorOf(name);
                      return (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 text-[10px] pl-0.5 pr-2 py-0.5 rounded-full font-semibold"
                          style={{
                            background: `${color}15`,
                            color,
                            border: `1px solid ${color}30`,
                          }}
                        >
                          <MemberAvatar name={members.nameOf(name)} profiles={memberProfiles} size={14} color={color} />
                          {members.nameOf(name)}
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
      )}

      {/* Scheduled Contacts */}
      {scheduledContacts.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-[#2a2a2a] flex items-center gap-2">
            <i className="fas fa-calendar-check text-[#22c55e] text-[10px]" />
            <p className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Reach Out — Scheduled</p>
            <span className="ml-auto text-[10px] text-[#555] font-mono">{scheduledContacts.length}</span>
          </div>
          {scheduledContacts.map(client => (
            <Link
              key={client.id}
              to={`/clients?client=${client.id}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a] last:border-b-0 hover:bg-white/5 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{client.name}</div>
                <div className="text-xs text-[#888] mt-0.5">Due {formatDate(client.nextContactDate)}</div>
              </div>
              <i className="fas fa-chevron-right text-[10px] text-[#444] shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* Overdue Outreach */}
      {overdueClients.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-[#2a2a2a] flex items-center gap-2">
            <i className="fas fa-hourglass-half text-[#f59e0b] text-[10px]" />
            <p className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Reach Out — Overdue</p>
            <span className="ml-auto text-[10px] text-[#555] font-mono">{overdueClients.length}</span>
          </div>
          {overdueClients.map(client => (
            <Link
              key={client.id}
              to={`/clients?client=${client.id}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a] last:border-b-0 hover:bg-white/5 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{client.name}</div>
                <div className="text-xs text-[#888] mt-0.5">
                  Last contact {formatDate(client._lastSignal)}
                </div>
              </div>
              <i className="fas fa-chevron-right text-[10px] text-[#444] shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
