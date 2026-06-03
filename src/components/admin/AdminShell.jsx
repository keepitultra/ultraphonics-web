import { useState, createContext, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SettingsModal from './SettingsModal.jsx';

const DEFAULT_ABLESET = 'http://192.168.69.138';
function getAblesetUrl() {
  return localStorage.getItem('ableset_url') || DEFAULT_ABLESET;
}

export const AdminDrawerContext = createContext({ open: false, toggle: () => {}, close: () => {} });
export function useAdminDrawer() { return useContext(AdminDrawerContext); }

export function AdminDrawerProvider({ children }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen(v => !v);
  const close  = () => setOpen(false);
  return (
    <AdminDrawerContext.Provider value={{ open, toggle, close }}>
      {children}
    </AdminDrawerContext.Provider>
  );
}

const APPS = [
  { id: 'setlists', label: 'Setlists', path: '/setlists', icon: 'fa-list',   color: '#3b82f6' },
  { id: 'songs',    label: 'Songs',    path: '/songs',    icon: 'fa-music',        color: '#22c55e' },
  { id: 'clients',  label: 'Clients',  path: '/clients',  icon: 'fa-address-book', color: '#00ddde' },
  { id: 'shows',    label: 'Shows',    path: '/shows',    icon: 'fa-calendar-days',color: '#a78bfa' },
];

/** @param {{ activeApp: string, children: import('react').ReactNode }} props */
export default function AdminShell({ activeApp, children }) {
  const { open: drawerOpen, toggle, close } = useAdminDrawer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSheetOpen, setAppSheetOpen] = useState(false);
  const navigate = useNavigate();

  const activeAppDef = APPS.find(a => a.id === activeApp);

  return (
    <div className="h-screen flex flex-col bg-[#121212] text-white overflow-hidden">
      {/* Top nav */}
      <nav className="shrink-0 bg-[#1a1a1a] border-b border-[#2a2a2a] z-40">
        <div className="flex items-center h-12 px-4 gap-4">
          {/* Hamburger — mobile only */}
          <button
            onClick={toggle}
            className="md:hidden p-2 -ml-2 text-[#888] hover:text-white rounded-md hover:bg-white/5 transition-colors"
            title="Toggle menu"
          >
            <i className="fas fa-bars text-sm" />
          </button>

          {/* Logo / back to admin */}
          <Link
            to="/admin"
            className="shrink-0 flex items-center gap-2 text-[#888] hover:text-white transition-colors"
            title="Admin Dashboard"
          >
            <img src="/images/Ultraphonics-Spiral-512.png" alt="" className="h-6 w-6" />
          </Link>

          <div className="w-px h-4 bg-[#2a2a2a] shrink-0" />

          {/* App switcher — desktop: all tabs; mobile: active tab + chevron */}
          <div className="flex items-center gap-1 flex-1 overflow-x-auto">

            {/* Mobile: show only active app with dropdown chevron */}
            {activeAppDef && (
              <button
                onClick={() => setAppSheetOpen(true)}
                className="md:hidden flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors"
                style={{ color: activeAppDef.color, background: `${activeAppDef.color}18` }}
              >
                <i className={`fas ${activeAppDef.icon} text-xs`} />
                {activeAppDef.label}
                <i className="fas fa-chevron-down text-[10px] ml-0.5 opacity-60" />
              </button>
            )}

            {/* Desktop: all tabs */}
            {APPS.map(app => {
              const active = activeApp === app.id;
              return (
                <button
                  key={app.id}
                  onClick={() => { close(); navigate(app.path); }}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md whitespace-nowrap transition-colors"
                  style={active
                    ? { color: app.color, background: `${app.color}18` }
                    : { color: '#888' }
                  }
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'transparent'; } }}
                >
                  <i className={`fas ${app.icon} text-xs`} />
                  {app.label}
                </button>
              );
            })}
            {/* AbleSet — desktop only, styled like other tabs */}
            <a
              href={getAblesetUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md whitespace-nowrap transition-colors"
              style={{ color: '#888' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'transparent'; }}
            >
              <i className="fas fa-circle-play text-xs" />
              AbleSet
            </a>
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
        {/* Mobile sidebar backdrop */}
        {drawerOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-30 md:hidden"
            onClick={close}
          />
        )}
        {children}
      </div>

      {/* Mobile app-switcher bottom sheet */}
      {appSheetOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-50 md:hidden"
            onClick={() => setAppSheetOpen(false)}
          />
          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 md:hidden rounded-t-2xl overflow-hidden"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[#3a3a3a]" />
            </div>
            <div className="px-4 pb-6 pt-2 space-y-1">
              {APPS.map(app => {
                const active = activeApp === app.id;
                return (
                  <button
                    key={app.id}
                    onClick={() => { setAppSheetOpen(false); close(); navigate(app.path); }}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-colors text-left"
                    style={active
                      ? { color: app.color, background: `${app.color}18`, border: `1px solid ${app.color}30` }
                      : { color: '#ccc', background: 'transparent', border: '1px solid transparent' }
                    }
                  >
                    <i className={`fas ${app.icon} text-base w-5 text-center`} style={{ color: app.color }} />
                    <span className="text-base font-semibold">{app.label}</span>
                    {active && <i className="fas fa-check ml-auto text-xs" style={{ color: app.color }} />}
                  </button>
                );
              })}
              <div className="h-px bg-[#2a2a2a] my-1" />
              <a
                href={getAblesetUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setAppSheetOpen(false)}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-colors"
                style={{ color: '#ccc', border: '1px solid transparent' }}
                onTouchStart={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onTouchEnd={e => e.currentTarget.style.background = 'transparent'}
              >
                <i className="fas fa-circle-play text-base w-5 text-center" style={{ color: '#f43f5e' }} />
                <span className="text-base font-semibold">AbleSet</span>
                <i className="fas fa-arrow-up-right-from-square ml-auto text-xs opacity-40" />
              </a>
            </div>
          </div>
        </>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
