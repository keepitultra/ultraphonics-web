import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SettingsModal from './SettingsModal.jsx';

const APPS = [
  { id: 'setlists', label: 'Setlists', path: '/setlists' },
  { id: 'songs',    label: 'Songs',    path: '/songs' },
  { id: 'clients',  label: 'Clients',  path: '/clients' },
];

/** @param {{ activeApp: string, children: import('react').ReactNode }} props */
export default function AdminShell({ activeApp, children }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col bg-[#121212] text-white overflow-hidden">
      {/* Top nav */}
      <nav className="shrink-0 bg-[#1a1a1a] border-b border-[#2a2a2a] z-40">
        <div className="flex items-center h-12 px-4 gap-4">
          {/* Logo / back to admin */}
          <Link
            to="/admin"
            className="shrink-0 flex items-center gap-2 text-[#888] hover:text-white transition-colors"
            title="Admin Dashboard"
          >
            <img src="/assets/images/Ultraphonics-Spiral-512.png" alt="" className="h-6 w-6" />
          </Link>

          <div className="w-px h-4 bg-[#2a2a2a] shrink-0" />

          {/* App switcher */}
          <div className="flex items-center gap-1 flex-1 overflow-x-auto">
            {APPS.map(app => (
              <button
                key={app.id}
                onClick={() => navigate(app.path)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-md whitespace-nowrap transition-colors ${
                  activeApp === app.id
                    ? 'text-[#00ddde] bg-[#00ddde]/10'
                    : 'text-[#888] hover:text-white hover:bg-white/5'
                }`}
              >
                {app.label}
              </button>
            ))}
          </div>

          {/* Right actions */}
          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 text-[#888] hover:text-white rounded-md hover:bg-white/5 transition-colors"
              title="Settings"
            >
              <i className="fas fa-gear text-sm" />
            </button>
            <a
              href={`/?qa=true&cachebust=${Date.now()}`}
              className="p-2 text-[#888] hover:text-white rounded-md hover:bg-white/5 transition-colors"
              title="View public site"
            >
              <i className="fas fa-arrow-right-from-bracket text-sm" />
            </a>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {children}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
