import { useState } from 'react';
import { useAuth } from '../../firebase/AuthContext.jsx';

export default function SettingsModal({ onClose }) {
  const { user, logout } = useAuth();
  const [ablesetIp, setAblesetIp] = useState(
    localStorage.getItem('ableset_url') || 'http://192.168.69.138'
  );

  function saveAblesetIp(val) {
    const trimmed = val.trim();
    setAblesetIp(trimmed);
    localStorage.setItem('ableset_url', trimmed);
  }

  async function handleSignOut() {
    await logout();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] w-full max-w-md rounded-xl shadow-2xl border border-[#2a2a2a] overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[#2a2a2a]">
          <p className="text-base font-bold text-white">Settings</p>
          <button onClick={onClose} className="text-[#888] hover:text-white transition-colors p-1">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {user && (
            <div className="p-3 bg-[#121212] rounded-lg flex items-center gap-3">
              {user.photoURL
                ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full shrink-0 object-cover" />
                : <div className="w-9 h-9 bg-[#008c8d] rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white">{(user.displayName || user.email || '?')[0].toUpperCase()}</div>
              }
              <div className="min-w-0">
                {user.displayName && <div className="text-white text-sm font-semibold truncate">{user.displayName}</div>}
                <div className="text-[#888] text-xs truncate">{user.email}</div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-2">
              AbleSet / Live Charts Host
            </label>
            <input
              type="text"
              value={ablesetIp}
              onChange={e => saveAblesetIp(e.target.value)}
              placeholder="http://192.168.1.243"
              className="w-full px-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm font-mono focus:outline-none focus:border-[#00ddde]"
            />
            <p className="text-[#555] text-xs mt-1.5">
              Used for AbleSet tile and Live Charts URL. Saved immediately.
            </p>
          </div>

          <div className="pt-1 space-y-2 border-t border-[#2a2a2a]">
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2.5 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 hover:bg-red-900/50 font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <i className="fas fa-sign-out-alt" /> Sign Out
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white hover:bg-[#222] font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <i className="fas fa-sync-alt" /> Clear Cache &amp; Reload
            </button>
          </div>
        </div>

        <div className="border-t border-[#2a2a2a] px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#2a2a2a] rounded-lg text-white hover:bg-[#333] font-semibold transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
