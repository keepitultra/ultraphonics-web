import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthGuard from '../../components/AuthGuard.jsx';
import SettingsModal from '../../components/admin/SettingsModal.jsx';
import { useAuth } from '../../firebase/AuthContext.jsx';
import { useSetlists, useSongs, useClients } from '../../firebase/useFirestore.js';

// ─── Card components ────────────────────────────────────────────────────────

function AppCard({ to, color, icon, title, subtitle }) {
  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 px-4 py-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl hover:border-[${color}] transition-all duration-200`}
    >
      <div className={`shrink-0 p-2.5 rounded-lg bg-[${color}]/10 text-[${color}] group-hover:bg-[${color}]/20 transition-colors`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="text-[#888] text-xs">{subtitle}</div>
      </div>
      <i className="fas fa-arrow-right shrink-0 text-[#444] group-hover:text-white transition-colors text-xs" />
    </Link>
  );
}

function ExternalCard({ href, color, icon, title, subtitle }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 px-4 py-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl hover:border-[${color}] transition-all duration-200`}
    >
      <div className={`shrink-0 p-2.5 rounded-lg bg-[${color}]/10 text-[${color}] group-hover:bg-[${color}]/20 transition-colors`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="text-[#888] text-xs truncate">{subtitle}</div>
      </div>
      <i className="fas fa-external-link-alt shrink-0 text-[#444] group-hover:text-white transition-colors text-xs" />
    </a>
  );
}

function LinkRow({ href, icon, label, external = true }) {
  const cls = 'flex items-center gap-2 text-[#888] hover:text-[#00ddde] text-sm transition-colors py-1';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <i className={`fas ${icon} text-xs w-4 text-center`} />
        {label}
        <i className="fas fa-external-link-alt text-[10px] opacity-50" />
      </a>
    );
  }
  return (
    <Link to={href} className={cls}>
      <i className={`fas ${icon} text-xs w-4 text-center`} />
      {label}
    </Link>
  );
}

function ToolLink({ href, icon, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#888] hover:text-white hover:border-[#444] transition-all text-sm"
    >
      <i className={`${icon} text-sm w-4 text-center`} />
      <span>{label}</span>
    </a>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'performance', label: 'Performance', icon: 'fa-music' },
  { id: 'booking',     label: 'Booking',     icon: 'fa-address-book' },
  { id: 'tools',       label: 'Tools',       icon: 'fa-toolbox' },
  { id: 'branding',    label: 'Branding',    icon: 'fa-palette' },
];

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('performance');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ablesetUrl, setAblesetUrl] = useState(
    localStorage.getItem('ableset_url') || 'http://192.168.1.243'
  );
  const { user } = useAuth();

  const { data: setlists = [] } = useSetlists();
  const { data: songs = [] } = useSongs();
  const { data: clients = [] } = useClients();

  const firstName = user?.displayName?.split(' ')[0] || null;
  const activeClientCount = clients.filter(c => c.status === 'Active').length;

  function handleSettingsClose() {
    setAblesetUrl(localStorage.getItem('ableset_url') || 'http://192.168.1.243');
    setSettingsOpen(false);
  }

  return (
    <div className="h-screen flex flex-col bg-[#121212] text-white overflow-hidden">
      {/* Navbar */}
      <nav className="shrink-0 bg-[#1a1a1a] border-b border-[#2a2a2a]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <img src="/assets/images/Ultraphonics-Spiral-512.png" alt="Ultraphonics" className="h-8 w-8" />
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
      <div className="shrink-0 bg-[#1a1a1a]/50 border-b border-[#2a2a2a]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto">
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
        <div className="max-w-5xl mx-auto px-4 pt-5 pb-8">

          {activeTab === 'performance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                <AppCard
                  to="/setlists"
                  color="#3b82f6"
                  icon={<i className="fas fa-list text-base" />}
                  title="Setlists"
                  subtitle={`${setlists.length} saved setlist${setlists.length !== 1 ? 's' : ''}`}
                />
                <AppCard
                  to="/songs"
                  color="#22c55e"
                  icon={<i className="fas fa-music text-base" />}
                  title="Songs"
                  subtitle={`${songs.filter(s => s.active !== false).length} songs in library`}
                />
                <ExternalCard
                  href={ablesetUrl}
                  color="#f43f5e"
                  icon={<i className="fas fa-circle-play text-base" />}
                  title="AbleSet"
                  subtitle={ablesetUrl}
                />
              </div>
            </div>
          )}

          {activeTab === 'booking' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <AppCard
                  to="/clients"
                  color="#06b6d4"
                  icon={<i className="fas fa-address-book text-base" />}
                  title="Client Manager"
                  subtitle={`${activeClientCount} active client${activeClientCount !== 1 ? 's' : ''}`}
                />
                <AppCard
                  to="/clients?mode=shows"
                  color="#a78bfa"
                  icon={<i className="fas fa-calendar-days text-base" />}
                  title="Shows"
                  subtitle="Manage upcoming & past shows"
                />
              </div>

              <div className="border-t border-[#2a2a2a] pt-4 space-y-0.5">
                <p className="text-xs text-[#555] uppercase tracking-wider font-semibold mb-2">Reference Materials</p>
                <LinkRow href="https://docs.google.com/spreadsheets/d/1csJb56jnisEb_37pYMVTOY6kSt6J-HqN5X7IYYRgH20/edit?usp=sharing" icon="fa-table" label="Ultrasheet" />
                <LinkRow href="https://drive.google.com/drive/u/0/folders/1OySLOkCsj3OjSc-RhlZmlAPYN9J-yInD" icon="fa-heart" label="Weddings Flyer" />
                <LinkRow href="https://drive.google.com/drive/u/0/folders/1ZITYFWoKwoxLbY6j_ejq-Cgxg8unlMk4" icon="fa-dollar-sign" label="Event Pricing" />
              </div>
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              <ToolLink href="https://github.com/tdhckmn/ultraphonics" icon="fab fa-github" label="GitHub" />
              <ToolLink href="https://console.firebase.google.com/project/ultraphonics-web/overview" icon="fas fa-fire" label="Firebase" />
              <ToolLink href="https://analytics.google.com/analytics/web/#/a359545509p494449748/reports/intelligenthome" icon="fas fa-chart-line" label="Analytics" />
              <ToolLink href="https://search.google.com/search-console" icon="fab fa-google" label="Search Console" />
              <ToolLink href="https://dashboard.emailjs.com/admin" icon="fas fa-paper-plane" label="EmailJS" />
              <ToolLink href="https://dashboard.mailerlite.com/" icon="fas fa-envelope" label="MailerLite" />
              <ToolLink href="https://discord.com/channels/1450501228462215208" icon="fab fa-discord" label="Discord" />
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <LinkRow href="/branding-guide" icon="fa-palette" label="Brand Guide" external={false} />
                <LinkRow href="/branding-dev-reference" icon="fa-code" label="Developer Reference" external={false} />
                <LinkRow href="/branding-ai-prompt" icon="fa-robot" label="AI Branding Prompt" external={false} />
              </div>

              <div className="border-t border-[#2a2a2a] pt-4">
                <p className="text-xs text-[#555] uppercase tracking-wider font-semibold mb-3">Site Management</p>
                <button
                  onClick={() => {
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then(regs => {
                        regs.forEach(r => r.unregister());
                      });
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
      <footer className="shrink-0 h-9 flex items-center border-t border-[#2a2a2a]">
        <div className="max-w-5xl w-full mx-auto px-4 flex justify-between items-center">
          <p className="text-[#444] text-xs">Ultraphonics Admin Portal</p>
          <p className="text-[#333] text-xs">v4.0</p>
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
