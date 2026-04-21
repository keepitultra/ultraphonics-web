import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthGuard from '../../components/AuthGuard.jsx';
import SettingsModal from '../../components/admin/SettingsModal.jsx';
import { useAuth } from '../../firebase/AuthContext.jsx';
import { useSetlists, useSongs, useClients } from '../../firebase/useFirestore.js';

// ── App tile (large, colored accent) ────────────────────────────────────────
function AppTile({ to, href, color, icon, title, subtitle }) {
  const body = (
    <div className="group relative flex flex-col gap-2.5 p-5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden hover:bg-[#1f1f1f] transition-all duration-200 h-full min-h-[118px]">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: color }} />
      <div className="text-2xl mt-1" style={{ color }}>{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-bold text-white leading-tight">{title}</div>
        <div className="text-[#666] text-xs mt-0.5 leading-snug">{subtitle}</div>
      </div>
      <i className="fas fa-arrow-right absolute bottom-4 right-4 text-[#333] group-hover:text-[#555] transition-colors text-xs" />
    </div>
  );
  if (to)   return <Link to={to} className="block">{body}</Link>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="block">{body}</a>;
}

// ── Small link row ───────────────────────────────────────────────────────────
function LinkRow({ href, to, icon, label }) {
  const cls = 'flex items-center gap-2.5 text-[#666] hover:text-[#00ddde] text-sm transition-colors py-1.5';
  const ico = <i className={`${icon} text-xs w-4 text-center shrink-0`} />;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {ico}{label}
        <i className="fas fa-external-link-alt text-[9px] opacity-40 ml-1" />
      </a>
    );
  }
  return <Link to={to} className={cls}>{ico}{label}</Link>;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'performance', label: 'Performance', icon: 'fa-music' },
  { id: 'booking',     label: 'Booking',     icon: 'fa-address-book' },
  { id: 'tools',       label: 'Tools',       icon: 'fa-toolbox' },
];

// ── Dashboard ────────────────────────────────────────────────────────────────
function AdminDashboard() {
  const [activeTab, setActiveTab]   = useState('performance');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ablesetUrl, setAblesetUrl] = useState(
    localStorage.getItem('ableset_url') || 'http://192.168.1.243'
  );
  const { user } = useAuth();

  const { data: setlists = [] } = useSetlists();
  const { data: songs    = [] } = useSongs();
  const { data: clients  = [] } = useClients();

  const firstName        = user?.displayName?.split(' ')[0] || null;
  const activeClientCount = clients.filter(c => c.status === 'Active').length;

  function handleSettingsClose() {
    setAblesetUrl(localStorage.getItem('ableset_url') || 'http://192.168.1.243');
    setSettingsOpen(false);
  }

  return (
    <div className="h-screen flex flex-col text-white overflow-hidden">
      {/* Ambient orbs — same as public pages */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden="true">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
      </div>

      {/* Navbar */}
      <nav className="shrink-0 bg-[#1a1a1a] border-b border-[#2a2a2a]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <img src="/images/Ultraphonics-Spiral-512.png" alt="Ultraphonics" className="h-8 w-8" />
              <span className="font-bold text-lg text-white">
                {firstName ? `Hey, ${firstName}!` : 'Admin'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <a
                href="https://discord.com/channels/1450501228462215208"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <i className="fab fa-discord text-sm" />
              </a>
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <i className="fas fa-gear text-sm" />
              </button>
              <a
                href={`/?qa=true&cachebust=${Date.now()}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[#888] hover:text-white text-sm rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="hidden sm:inline">View Site</span>
                <i className="fas fa-arrow-right-from-bracket text-sm" />
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Tab bar */}
      <div className="shrink-0 bg-[#121212]/60 border-b border-[#2a2a2a]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex overflow-x-auto">
            {TABS.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-5 py-3.5 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${
                  activeTab === id
                    ? 'border-[#00ddde] text-[#00ddde]'
                    : 'border-transparent text-[#888] hover:text-white'
                }`}
              >
                <i className={`fas ${icon} mr-2 text-xs`} />{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-8">

          {/* ── Performance ──────────────────────────────────────────────── */}
          {activeTab === 'performance' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <AppTile
                to="/setlists"
                color="#3b82f6"
                icon={<i className="fas fa-list" />}
                title="Setlists"
                subtitle={`${setlists.length} saved setlist${setlists.length !== 1 ? 's' : ''}`}
              />
              <AppTile
                to="/songs"
                color="#22c55e"
                icon={<i className="fas fa-music" />}
                title="Songs"
                subtitle={`${songs.filter(s => s.active !== false).length} songs in library`}
              />
              <AppTile
                href={ablesetUrl}
                color="#f43f5e"
                icon={<i className="fas fa-circle-play" />}
                title="AbleSet"
                subtitle={ablesetUrl}
              />
            </div>
          )}

          {/* ── Booking ───────────────────────────────────────────────────── */}
          {activeTab === 'booking' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <AppTile
                  to="/clients"
                  color="#06b6d4"
                  icon={<i className="fas fa-address-book" />}
                  title="Client Manager"
                  subtitle={`${activeClientCount} active client${activeClientCount !== 1 ? 's' : ''}`}
                />
                <AppTile
                  to="/clients?mode=shows"
                  color="#14b8a6"
                  icon={<i className="fas fa-calendar-days" />}
                  title="Shows"
                  subtitle="Manage upcoming & past shows"
                />
              </div>

              <div className="border-t border-[#2a2a2a] pt-4 space-y-0.5">
                <p className="text-xs text-[#555] uppercase tracking-wider font-semibold mb-2">Reference Materials</p>
                <LinkRow href="https://docs.google.com/spreadsheets/d/1csJb56jnisEb_37pYMVTOY6kSt6J-HqN5X7IYYRgH20/edit?usp=sharing" icon="fas fa-table" label="Ultrasheet" />
                <LinkRow href="https://drive.google.com/drive/u/0/folders/1OySLOkCsj3OjSc-RhlZmlAPYN9J-yInD" icon="fas fa-heart" label="Weddings Flyer" />
                <LinkRow href="https://drive.google.com/drive/u/0/folders/1ZITYFWoKwoxLbY6j_ejq-Cgxg8unlMk4" icon="fas fa-dollar-sign" label="Event Pricing" />
              </div>
            </div>
          )}

          {/* ── Tools ────────────────────────────────────────────────────── */}
          {activeTab === 'tools' && (
            <div className="space-y-6">
              {/* App tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <AppTile
                  href="https://github.com/tdhckmn/ultraphonics"
                  color="#6b7280"
                  icon={<i className="fab fa-github" />}
                  title="GitHub"
                  subtitle="Source & releases"
                />
                <AppTile
                  href="https://console.firebase.google.com/project/ultraphonics-web/overview"
                  color="#f59e0b"
                  icon={<i className="fas fa-fire" />}
                  title="Firebase"
                  subtitle="Firestore & hosting"
                />
                <AppTile
                  href="https://analytics.google.com/analytics/web/#/a359545509p494449748/reports/intelligenthome"
                  color="#f97316"
                  icon={<i className="fas fa-chart-line" />}
                  title="Analytics"
                  subtitle="Traffic & engagement"
                />
                <AppTile
                  href="https://search.google.com/search-console"
                  color="#3b82f6"
                  icon={<i className="fab fa-google" />}
                  title="Search Console"
                  subtitle="SEO & indexing"
                />
              </div>

              {/* Link rows */}
              <div className="border-t border-[#2a2a2a] pt-4 space-y-0.5">
                <p className="text-xs text-[#555] uppercase tracking-wider font-semibold mb-2">Services</p>
                <LinkRow href="https://studio.firebase.google.com/project/ultraphonics-web" icon="fas fa-wand-magic-sparkles" label="Firebase Studio" />
                <LinkRow href="https://dashboard.emailjs.com/admin" icon="fas fa-paper-plane" label="EmailJS" />
                <LinkRow href="https://dashboard.mailerlite.com/" icon="fas fa-envelope" label="MailerLite" />
                <LinkRow href="https://discord.com/channels/1450501228462215208" icon="fab fa-discord" label="Discord" />
              </div>

              <div className="border-t border-[#2a2a2a] pt-4 space-y-0.5">
                <p className="text-xs text-[#555] uppercase tracking-wider font-semibold mb-2">Branding</p>
                <LinkRow to="/branding-guide" icon="fas fa-palette" label="Brand Guide" />
                <LinkRow to="/branding-dev-reference" icon="fas fa-code" label="Developer Reference" />
                <LinkRow to="/branding-ai-prompt" icon="fas fa-robot" label="AI Branding Prompt" />
              </div>

              <div className="border-t border-[#2a2a2a] pt-4">
                <button
                  onClick={() => {
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
                    }
                    window.location.reload(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#888] hover:text-white hover:border-[#444] transition-all text-sm"
                >
                  <i className="fas fa-rotate" /> Force Refresh Site
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="shrink-0 h-9 flex items-center border-t border-[#2a2a2a] bg-[#121212]/60">
        <div className="max-w-5xl w-full mx-auto px-4 flex justify-between items-center">
          <p className="text-[#444] text-xs">Ultraphonics Admin Portal</p>
          <p className="text-[#333] text-xs">v5.0</p>
        </div>
      </footer>

      {settingsOpen && <SettingsModal onClose={handleSettingsClose} />}
    </div>
  );
}

export default function AdminRouter() {
  return (
    <AuthGuard>
      <AdminDashboard />
    </AuthGuard>
  );
}
