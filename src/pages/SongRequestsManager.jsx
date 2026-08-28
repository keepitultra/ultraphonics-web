import { useState, useEffect, useRef } from 'react';
import AuthGuard from '../components/AuthGuard.jsx';
import AdminShell, { useAdminDrawer } from '../components/admin/AdminShell.jsx';
import { subscribeToSongRequests, dismissSongRequest } from '../firestore-service.js';

// Matches the 'requests' entry in AdminShell's APPS table
const REQUESTS_ACCENT = '#f59e0b';

// Keep screen awake while this page is open
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock = null;

    async function acquire() {
      try { lock = await navigator.wakeLock.request('screen'); } catch {}
    }

    acquire();
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release();
    };
  }, []);
}

// Simple ascending C-E-G chime via Web Audio API
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch {}
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function RequestsContent() {
  const { open, toggle } = useAdminDrawer();
  const [requests, setRequests] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const prevPendingCount = useRef(null);
  useWakeLock();

  useEffect(() => {
    return subscribeToSongRequests(incoming => {
      setRequests(incoming);
      const pending = incoming.filter(r => !r.dismissed).length;
      if (prevPendingCount.current !== null && pending > prevPendingCount.current) {
        playChime();
      }
      prevPendingCount.current = pending;
    });
  }, []);

  const pending = requests.filter(r => !r.dismissed);
  const displayed = showAll ? requests : pending;

  return (
    <AdminShell activeApp="requests">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a]">
          <button
            onClick={() => setShowAll(false)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={!showAll ? { background: `${REQUESTS_ACCENT}26`, color: REQUESTS_ACCENT } : { color: '#888' }}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setShowAll(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={showAll ? { background: `${REQUESTS_ACCENT}26`, color: REQUESTS_ACCENT } : { color: '#888' }}
          >
            All ({requests.length})
          </button>
          <div className="ml-auto flex items-center gap-2 text-[#555] text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live
          </div>
        </div>

        {/* Request list */}
        <div className="flex-1 overflow-y-auto">
          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-[#444]">
              <i className="fas fa-music text-5xl mb-4 opacity-20" />
              <p className="text-lg">{showAll ? 'No requests yet' : 'No pending requests'}</p>
              <p className="text-sm mt-1 opacity-60">New requests will appear here instantly</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#1e1e1e]">
              {displayed.map(req => (
                <li
                  key={req.id}
                  className="flex items-center gap-4 px-5 py-5 transition-colors"
                  style={req.dismissed ? { opacity: 0.4 } : {}}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-2xl font-bold text-white truncate">{req.title}</p>
                    <p className="text-[#555] text-sm mt-0.5">{formatTime(req.submittedAt)}</p>
                  </div>
                  {!req.dismissed && (
                    <button
                      onClick={() => dismissSongRequest(req.id)}
                      className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                      style={{ background: '#1e1e1e', color: '#888', border: '1px solid #2a2a2a' }}
                      onMouseEnter={e => { e.currentTarget.style.background = `${REQUESTS_ACCENT}1f`; e.currentTarget.style.color = REQUESTS_ACCENT; e.currentTarget.style.borderColor = `${REQUESTS_ACCENT}40`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#1e1e1e'; e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#2a2a2a'; }}
                    >
                      Done
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

export default function SongRequestsManager() {
  return (
    <AuthGuard>
      <RequestsContent />
    </AuthGuard>
  );
}
