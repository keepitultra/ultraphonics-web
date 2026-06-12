import { useState } from 'react';
import { version } from '../../../package.json';
import { Link } from 'react-router-dom';
import AuthGuard from '../../components/AuthGuard.jsx';
import SettingsModal from '../../components/admin/SettingsModal.jsx';
import { useAuth } from '../../firebase/AuthContext.jsx';
import { useSetlists, useSongs, useClients } from '../../firebase/useFirestore.js';

// ── App tile (large, colored accent) ────────────────────────────────────────
function AppTile({ to, href, color, icon, title, subtitle }) {
  const body = (
    <div className="group relative flex flex-col items-center justify-center gap-3 p-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden hover:bg-[#1f1f1f] transition-all duration-200 h-full min-h-[200px] text-center">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: color }} />
      <div className="text-4xl" style={{ color }}>{icon}</div>
      <div>
        <div className="text-base font-bold text-white leading-tight">{title}</div>
        <div className="text-[#666] text-sm mt-1 leading-snug">{subtitle}</div>
      </div>
      <i className="fas fa-arrow-right absolute bottom-4 right-4 text-[#333] group-hover:text-[#555] transition-colors text-xs" />
    </div>
  );
  if (to) return <Link to={to} className="block">{body}</Link>;
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

function SectionHeading({ label }) {
  return <p className="text-xs text-[#555] uppercase tracking-wider font-semibold mb-2">{label}</p>;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function AdminDashboard() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ablesetUrl, setAblesetUrl] = useState(
    localStorage.getItem('ableset_url') || 'http://192.168.69.138'
  );
  const { user } = useAuth();

  const { data: setlists = [] } = useSetlists();
  const { data: songs    = [] } = useSongs();
  const { data: clients  = [] } = useClients();

  const firstName         = user?.displayName?.split(' ')[0] || null;
  const activeClientCount = clients.filter(c => c.status === 'Active').length;

  function handleSettingsClose() {
    setAblesetUrl(localStorage.getItem('ableset_url') || 'http://192.168.69.138');
    setSettingsOpen(false);
  }

  return (
    <div className="h-screen flex flex-col text-white overflow-hidden">
      {/* Ambient orbs */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden="true">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
      </div>

      {/* Navbar */}
      <nav className="shrink-0 bg-[#1a1a1a] border-b border-[#2a2a2a] px-4">
        <div className="flex items-center justify-between h-14 max-w-5xl mx-auto">
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
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 pt-6 pb-8 space-y-8">

          {/* Performance */}
          <section className="space-y-3">
            <SectionHeading label="Performance" />
            <div className="grid grid-cols-2 gap-3">
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
                to="/requests"
                color="#f59e0b"
                icon={<i className="fas fa-hand-point-up" />}
                title="Song Requests"
                subtitle="Live fan requests"
              />
              <AppTile
                href={ablesetUrl}
                color="#f43f5e"
                icon={<i className="fas fa-circle-play" />}
                title="AbleSet"
                subtitle={ablesetUrl}
              />
            </div>
          </section>

          {/* Booking */}
          <section className="space-y-3">
            <SectionHeading label="Booking" />
            <div className="grid grid-cols-2 gap-3">
              <AppTile
                to="/clients"
                color="#06b6d4"
                icon={<i className="fas fa-address-book" />}
                title="Client Manager"
                subtitle={`${activeClientCount} active client${activeClientCount !== 1 ? 's' : ''}`}
              />
              <AppTile
                to="/shows"
                color="#a78bfa"
                icon={<i className="fas fa-calendar-days" />}
                title="Shows"
                subtitle="Manage upcoming & past shows"
              />
            </div>
            <div className="border-t border-[#2a2a2a] pt-3 space-y-0.5">
              <SectionHeading label="Reference Materials" />
              <LinkRow href="https://docs.google.com/spreadsheets/d/1csJb56jnisEb_37pYMVTOY6kSt6J-HqN5X7IYYRgH20/edit?usp=sharing" icon="fas fa-table" label="Ultrasheet" />
              <LinkRow href="https://drive.google.com/drive/u/0/folders/1OySLOkCsj3OjSc-RhlZmlAPYN9J-yInD" icon="fas fa-heart" label="Weddings Flyer" />
              <LinkRow href="https://drive.google.com/drive/u/0/folders/1ZITYFWoKwoxLbY6j_ejq-Cgxg8unlMk4" icon="fas fa-dollar-sign" label="Event Pricing" />
            </div>
          </section>

          {/* Services */}
          <section className="border-t border-[#2a2a2a] pt-6 space-y-0.5">
            <SectionHeading label="Services" />
            <LinkRow href="https://github.com/tdhckmn/ultraphonics" icon="fab fa-github" label="GitHub" />
            <LinkRow href="https://console.firebase.google.com/project/ultraphonics-web/overview" icon="fas fa-fire" label="Firebase" />
            <LinkRow href="https://analytics.google.com/analytics/web/#/a359545509p494449748/reports/intelligenthome" icon="fas fa-chart-line" label="Analytics" />
            <LinkRow href="https://search.google.com/search-console" icon="fab fa-google" label="Search Console" />
            <LinkRow href="https://dashboard.emailjs.com/admin" icon="fas fa-paper-plane" label="EmailJS" />
            <LinkRow href="https://dashboard.mailerlite.com/" icon="fas fa-envelope" label="MailerLite" />
            <LinkRow href="https://discord.com/channels/1450501228462215208" icon="fab fa-discord" label="Discord" />
            <LinkRow href="https://tiny.cc" icon="fas fa-link" label="tiny.cc" />
          </section>

          {/* Branding */}
          <section className="border-t border-[#2a2a2a] pt-6 space-y-0.5">
            <SectionHeading label="Branding" />
            <LinkRow to="/branding-guide" icon="fas fa-palette" label="Brand Guide" />
            <LinkRow to="/branding-dev-reference" icon="fas fa-code" label="Developer Reference" />
            <LinkRow to="/branding-ai-prompt" icon="fas fa-robot" label="AI Branding Prompt" />
          </section>

          {/* Utility */}
          <section className="border-t border-[#2a2a2a] pt-6">
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
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="shrink-0 h-9 flex items-center border-t border-[#2a2a2a] bg-[#121212]/60">
        <div className="max-w-xl w-full mx-auto px-4 flex justify-between items-center">
          <p className="text-[#444] text-xs">Ultraphonics Admin Portal</p>
          <p className="text-[#333] text-xs">v{version}</p>
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
