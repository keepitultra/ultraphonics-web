import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SettingsModal from './SettingsModal.jsx';

// Meta tags that drive link-unfurl previews; removed while admin pages are mounted.
const PREVIEW_META = [
  ['property', 'og:image'],
  ['property', 'og:image:alt'],
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:url'],
  ['name', 'twitter:card'],
  ['name', 'twitter:image'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
];

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
  { id: 'setlists',  label: 'Setlists',  path: '/setlists',  icon: 'fa-list',          color: '#3b82f6' },
  { id: 'songs',     label: 'Songs',     path: '/songs',     icon: 'fa-music',          color: '#22c55e' },
  { id: 'clients',   label: 'Clients',   path: '/clients',   icon: 'fa-address-book',   color: '#00ddde' },
  { id: 'shows',     label: 'Shows',     path: '/shows',     icon: 'fa-calendar-days',  color: '#a78bfa' },
  { id: 'quotes',    label: 'Quotes',    path: '/quotes',    icon: 'fa-file-invoice-dollar', color: '#ec4899' },
  { id: 'requests',  label: 'Requests',  path: '/requests',  icon: 'fa-hand-point-up',  color: '#f59e0b' },
];

/** @param {{ activeApp: string, children: import('react').ReactNode }} props */
export default function AdminShell({ activeApp, children }) {
  const { open: drawerOpen, toggle, close } = useAdminDrawer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSheetOpen, setAppSheetOpen] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef(/** @type {HTMLDivElement|null} */(null));
  const mobileSheetRef = useRef(/** @type {HTMLDivElement|null} */(null));

  // Close dropdown when clicking outside — avoids z-index conflicts with a backdrop element.
  // Must also exempt the mobile sheet (rendered outside dropdownRef's subtree): otherwise this
  // mousedown handler fires and unmounts the sheet before the tapped button's own click event
  // can fire, so the tap appears to "just close the menu" without ever navigating.
  useEffect(() => {
    if (!appSheetOpen) return;
    /** @param {MouseEvent} e */
    function handleOutsideClick(e) {
      const target = /** @type {Node} */ (e.target);
      if (dropdownRef.current?.contains(target)) return;
      if (mobileSheetRef.current?.contains(target)) return;
      setAppSheetOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [appSheetOpen]);

  // Admin pages should produce no link-unfurl preview. Detach the share meta tags
  // while any admin page is mounted, then re-attach them on unmount.
  useEffect(() => {
    const removed = [];
    for (const [attr, key] of PREVIEW_META) {
      const el = document.querySelector(`meta[${attr}="${key}"]`);
      if (el) { removed.push([el, el.nextSibling, el.parentNode]); el.remove(); }
    }
    return () => {
      for (const [el, before, parent] of removed) {
        if (parent) parent.insertBefore(el, before);
      }
    };
  }, []);

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

          {/* App switcher — active app + chevron on all sizes, opens sheet (mobile) or grid (desktop) */}
          <div className="flex items-center gap-1 flex-1">
            {activeAppDef && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setAppSheetOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors"
                  style={{ color: activeAppDef.color, background: `${activeAppDef.color}18` }}
                >
                  <i className={`fas ${activeAppDef.icon} text-xs`} />
                  {activeAppDef.label}
                  <i className="fas fa-chevron-down text-[10px] ml-0.5 opacity-60" />
                </button>

                {/* Desktop grid dropdown */}
                {appSheetOpen && (
                  <div
                    className="hidden md:block absolute top-full left-0 mt-2 z-50 rounded-2xl overflow-hidden shadow-2xl"
                    style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', minWidth: '264px' }}
                  >
                    <div className="p-3 grid grid-cols-3 gap-1.5">
                      {APPS.map(app => {
                        const active = activeApp === app.id;
                        return (
                          <button
                            key={app.id}
                            onClick={() => { setAppSheetOpen(false); close(); navigate(app.path); }}
                            className="flex flex-col items-center gap-2 p-3 rounded-xl transition-colors"
                            style={active
                              ? { background: `${app.color}18`, border: `1px solid ${app.color}30` }
                              : { background: 'transparent', border: '1px solid transparent' }
                            }
                            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = '#2a2a2a'; } }}
                            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
                          >
                            <i className={`fas ${app.icon} text-base`} style={{ color: app.color }} />
                            <span className="text-xs font-semibold text-white leading-tight">{app.label}</span>
                          </button>
                        );
                      })}
                      <a
                        href={getAblesetUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setAppSheetOpen(false)}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl transition-colors"
                        style={{ background: 'transparent', border: '1px solid transparent' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = '#2a2a2a'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                      >
                        <i className="fas fa-circle-play text-base" style={{ color: '#f43f5e' }} />
                        <span className="text-xs font-semibold text-[#ccc] leading-tight">AbleSet</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
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

      {/* App switcher overlays */}
      {appSheetOpen && (
        <>
          {/* Mobile: dark backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-50"
            onClick={() => setAppSheetOpen(false)}
          />
          {/* Sheet */}
          <div
            ref={mobileSheetRef}
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
