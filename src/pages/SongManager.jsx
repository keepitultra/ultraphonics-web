import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard.jsx';
import AdminShell, { useAdminDrawer } from '../components/admin/AdminShell.jsx';
import { useAuth } from '../firebase/AuthContext.jsx';
import { useSongs } from '../firebase/useFirestore.js';
import { getSongs, saveSong, deleteSong, syncSongsBatch } from '../firestore-service.js';
import { parseSongData } from '../utils/lyricParser.ts';
import { useMembersWithAccounts } from '../firebase/useFirestore.js';
import { formatDuration, parseDurationInput } from '../utils/setlistUtils.js';

// ── Constants ─────────────────────────────────────────────────────────────
const GENRE_ORDER = ['Pop', 'Soul', 'Rock', 'Country', 'Other'];
const GENRE_MAP = {
  pop: 'Pop', soul: 'Soul', 'r&b': 'Soul', rnb: 'Soul',
  rock: 'Rock', 'classic rock': 'Rock',
  country: 'Country', folk: 'Country', bluegrass: 'Country',
};
const KEY_OPTIONS = [
  'C','Cm','C#','C#m','Db','Dbm','D','Dm','D#','D#m','Eb','Ebm',
  'E','Em','F','Fm','F#','F#m','Gb','Gbm','G','Gm','G#','G#m',
  'Ab','Abm','A','Am','A#','A#m','Bb','Bbm','B','Bm',
];

// ── AbleSet import utilities ──────────────────────────────────────────────
function parseSongName(nameString) {
  const tokens = nameString.split(' - ').map(t => t.trim());
  const result = { title: tokens[0] || nameString, artist: '', key: '', tags: [], meta: { isDrop: false, capo: 0, isEflat: false } };
  if (tokens.length <= 1) return result;
  const lastToken = tokens[tokens.length - 1];
  if (KEY_OPTIONS.includes(lastToken)) { result.key = lastToken; tokens.pop(); }
  const artistTokens = [];
  tokens.slice(1).forEach(token => {
    const lower = token.toLowerCase();
    if (lower.includes('drop')) { result.meta.isDrop = true; result.tags.push('Drop'); }
    else if (lower.includes('capo')) { const m = token.match(/capo\s*(\d+)/i); result.meta.capo = m ? parseInt(m[1]) : 0; result.tags.push('Capo'); }
    else if (lower.includes('eb')) { result.meta.isEflat = true; result.tags.push('Eb'); }
    else artistTokens.push(token);
  });
  result.artist = artistTokens.join(', ');
  if (result.key) result.tags.unshift(result.key);
  return result;
}

function compareSongLists(importList, dbSongs) {
  const dbByAblesetId = new Map(), dbByDocId = new Map(), dbByTitle = new Map();
  for (const s of dbSongs) {
    if (s.ablesetId) dbByAblesetId.set(s.ablesetId, s);
    dbByDocId.set(s.id, s);
    if (!s.ablesetId) {
      const t = (s.title || s.name || '').toLowerCase().trim();
      if (t) { if (!dbByTitle.has(t)) dbByTitle.set(t, []); dbByTitle.get(t).push(s); }
    }
  }
  const matchedIds = new Set(), toCreate = [], toUpdate = [], toArchive = [];
  for (const imp of importList) {
    let existing = dbByAblesetId.get(imp.id), isLegacy = false, isNameMatch = false;
    if (!existing) { existing = dbByDocId.get(imp.id); if (existing) isLegacy = true; }
    if (!existing) {
      const t = parseSongName(imp.lastKnownName).title.toLowerCase().trim();
      const candidates = dbByTitle.get(t) || [];
      if (candidates.length === 1) { existing = candidates[0]; isNameMatch = true; }
    }
    if (!existing) { toCreate.push(imp); }
    else {
      matchedIds.add(imp.id);
      if (existing.ablesetName !== imp.lastKnownName || existing.ablesetTime !== imp.time || (existing.ablesetSkipped || false) !== (imp.skipped || false) || isLegacy || isNameMatch)
        toUpdate.push({ existing, imported: imp, isLegacy, isNameMatch });
    }
  }
  for (const s of dbSongs) {
    if (s.ablesetId && !matchedIds.has(s.ablesetId) && s.active !== false) toArchive.push(s);
  }
  return { toCreate, toUpdate, toArchive };
}

// NOTE: AbleSet's `time` is a timeline position, not a song length — it is kept
// as `ablesetTime` for sync diffing but must never be written to `duration`,
// which drives set-length estimates. Durations are seeded by
// scripts/backfill-song-durations.mjs and edited by hand on this page.
function buildSongDocument(imported) {
  const parsed = parseSongName(imported.lastKnownName);
  return { ablesetId: imported.id, ablesetName: imported.lastKnownName, ablesetTime: imported.time || 0, ablesetSkipped: imported.skipped || false, title: parsed.title, artist: parsed.artist, key: parsed.key, active: true, capo: parsed.meta.capo, eflat: parsed.meta.isEflat, dropD: parsed.meta.isDrop };
}

/**
 * Re-key a vocalCapability map to member ids. Pre-migration these keys are
 * display names; idOf() is idempotent so post-migration data passes through
 * unchanged and editing a song never mixes the two forms.
 */
function normaliseCapability(cap, members) {
  const out = {};
  for (const [key, value] of Object.entries(cap || {})) out[members.idOf(key)] = value;
  return out;
}

function genreFor(song) {
  return GENRE_MAP[(song.genre || '').toLowerCase().trim()] || 'Other';
}

// ── Vocalist capability import ──────────────────────────────────────────────
const DEFAULT_VOCAL_TABLE = `Song Name\tTom\tShelley\tKelsey\tDavid\tPreferred
24K Magic\tFALSE\tTRUE\tTRUE\tTRUE\tDavid
Aeroplane\tTRUE\tFALSE\tFALSE\tTRUE\tTom
Ain't It Fun\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
All the small things\tTRUE\tFALSE\tFALSE\tFALSE\tDavid
Any Man Of Mine\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Attention\tFALSE\tTRUE\tFALSE\tTRUE\tDavid
Before He Cheats\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Beer Never Broke My Heart\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Brown Eyed Lover\tTRUE\tFALSE\tFALSE\tFALSE\tDavid
Country Girl\tFALSE\tFALSE\tFALSE\tTRUE\tDavid
Dancing in the moonlight\tTRUE\tTRUE\tFALSE\tFALSE\tTom
December 1963\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
Don't Start Now\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Don't Stop Believing\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Drive\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Espresso\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Flowers\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Higher\tTRUE\tFALSE\tTRUE\tTRUE\tDavid
Hit Me With You Best Shot\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
I Had Some Help\tTRUE\tTRUE\tFALSE\tTRUE\tDavid
I Want It That Way\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
I Wanna Dance With Somebody\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Interstate Love Song\tTRUE\tFALSE\tFALSE\tFALSE\tTom
Isn't She Lovely\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
Juice\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Lose Control\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
Lose Yourself\tFALSE\tFALSE\tFALSE\tTRUE\tDavid
Man! I Feel Like A Woman\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Mary Jane's Last Dance\tTRUE\tFALSE\tFALSE\tFALSE\tTom
Mash_About Damn Time/ Superstition\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
MmmBop\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Mr. Brightside\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
My Own Worst Enemy\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Need A Favor\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Neon Moon\tTRUE\tTRUE\tTRUE\tTRUE\tDavid
Pink Pony Club\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Pony\tFALSE\tFALSE\tFALSE\tTRUE\tDavid
Redneck Woman\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Semi-Charmed Life\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Sex On Fire\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
Shut Up And Dance With Me\tFALSE\tTRUE\tTRUE\tTRUE\tDavid
Something To Talk About\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Sparks Fly\tTRUE\tTRUE\tFALSE\tFALSE\tShelley
Sugar We're Goin Down\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Sweetness\tTRUE\tFALSE\tFALSE\tFALSE\tTom
Tennessee Whiskey\tFALSE\tFALSE\tTRUE\tTRUE\tDavid
The Way You Make Me Feel\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Tipsy\tTRUE\tFALSE\tFALSE\tTRUE\tDavid
Toxic\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Treasure\tFALSE\tTRUE\tFALSE\tTRUE\tDavid
Uptown Funk\tFALSE\tTRUE\tTRUE\tTRUE\tDavid
Valerie\tFALSE\tTRUE\tFALSE\tFALSE\tShelley
Wagon Wheel\tFALSE\tFALSE\tFALSE\tTRUE\tDavid
Watermelon Sugar\tTRUE\tFALSE\tTRUE\tTRUE\tDavid
What's Up?\tFALSE\tTRUE\tTRUE\tFALSE\tShelley
Wish I Knew You\tTRUE\tFALSE\tFALSE\tTRUE\tDavid`;

function normalizeTitle(str) {
  return (str || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function truthy(cell) {
  return ['y', 'yes', 'true', 'x', '1'].includes((cell || '').trim().toLowerCase());
}

function parseVocalTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = lines.slice(1); // skip header row
  return rows.map(line => {
    let cells = line.split('\t');
    if (cells.length < 6) cells = line.split(/\s{2,}/); // fallback for space-aligned paste
    const [title, tom, shelley, kelsey, david, preferred] = cells;
    return {
      title: (title || '').trim(),
      capability: { Tom: truthy(tom), Shelley: truthy(shelley), Kelsey: truthy(kelsey), David: truthy(david) },
      preferred: (preferred || '').trim(),
    };
  }).filter(r => r.title);
}

function matchVocalRows(rows, dbSongs) {
  const byTitle = new Map();
  for (const s of dbSongs) {
    const t = normalizeTitle(s.title || s.name || '');
    if (!t) continue;
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(s);
  }
  const matched = [], unmatched = [], ambiguous = [];
  rows.forEach((row, i) => {
    const candidates = byTitle.get(normalizeTitle(row.title)) || [];
    const entry = { ...row, key: i, songId: candidates.length === 1 ? candidates[0].id : '' };
    if (candidates.length === 1) matched.push(entry);
    else if (candidates.length === 0) unmatched.push(entry);
    else ambiguous.push(entry);
  });
  return { matched, unmatched, ambiguous };
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── PDF helpers ───────────────────────────────────────────────────────────
function safeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadSongPdf(song, opts) {
  const { html, footnotes } = parseSongData(song.lyrics || '', false, 0);
  const isDark = opts.background === 'dark';
  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const fg = isDark ? '#e0e0e0' : '#111111';
  const muted = isDark ? '#888888' : '#555555';
  const chordColor = isDark ? '#22c55e' : '#16a34a';
  const harmonyColor = isDark ? '#a78bfa' : '#7c3aed';
  const sectionBg = isDark ? '#2a2a2a' : '#f0f0f0';
  const fontSizeMap = { sm: '11px', md: '13px', lg: '16px', xl: '20px' };
  const fontSize = fontSizeMap[opts.fontSize] || '13px';
  const title = safeHtml(song.title || song.name || 'Song');
  const artist = song.artist ? safeHtml(song.artist) : '';
  const metaParts = [];
  if (song.key) metaParts.push(`Key: ${safeHtml(song.key)}`);
  if (song.capo > 0) metaParts.push(`Capo: ${song.capo}`);
  if (song.eflat) metaParts.push('Eb Tuning');
  if (song.dropD) metaParts.push('Drop D');

  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
@page { size: ${opts.orientation}; margin: 0.75in; }
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Courier New', monospace; font-size: ${fontSize}; background: ${bg}; color: ${fg}; line-height: 1.6; }
.song-title { font-family: Arial, sans-serif; font-size: calc(${fontSize} * 1.7); font-weight: 700; margin-bottom: 4px; }
.song-artist { font-family: Arial, sans-serif; font-size: calc(${fontSize} * 1.1); color: ${muted}; margin-bottom: 6px; }
.song-meta { font-family: Arial, sans-serif; font-size: calc(${fontSize} * 0.85); color: ${muted}; margin-bottom: 20px; display: flex; gap: 14px; flex-wrap: wrap; }
.lp-line { margin-bottom: 2px; }
.lp-section { font-family: Arial, sans-serif; font-size: calc(${fontSize} * 0.8); font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: ${muted}; margin-top: 20px; margin-bottom: 6px; display: inline-block; padding: 2px 6px; background: ${sectionBg}; border-radius: 3px; }
.lp-cw { display: inline-flex; flex-direction: column; vertical-align: top; margin-right: 1px; }
.lp-chord { color: ${chordColor}; font-weight: 700; font-size: calc(${fontSize} * 0.85); line-height: 1.2; }
.lp-harmony { color: ${harmonyColor}; font-style: italic; }
.lp-footnote { color: ${chordColor}; font-size: 0.7em; vertical-align: super; }
.lp-empty { color: ${muted}; font-style: italic; }
.footnotes { margin-top: 28px; padding-top: 12px; border-top: 1px solid ${muted}44; }
.footnotes-title { font-family: Arial, sans-serif; font-size: calc(${fontSize} * 0.8); text-transform: uppercase; letter-spacing: 0.1em; color: ${muted}; font-weight: 700; margin-bottom: 8px; }
.footnotes ol { padding-left: 20px; }
.footnotes li { color: ${muted}; margin-bottom: 4px; }
</style>
</head>
<body>
<div class="song-title">${title}</div>
${artist ? `<div class="song-artist">${artist}</div>` : ''}
${metaParts.length ? `<div class="song-meta">${metaParts.join('<span style="margin: 0 4px; opacity: 0.4">·</span>')}</div>` : ''}
${html}
${footnotes.length ? `<div class="footnotes"><div class="footnotes-title">Performance Notes</div><ol>${footnotes.map(n => `<li>${safeHtml(n)}</li>`).join('')}</ol></div>` : ''}
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Please allow popups to download the PDF.'); return; }
  win.document.write(doc);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ── Shared input styles ───────────────────────────────────────────────────
const INPUT = 'w-full px-3 py-2.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm focus:outline-none focus:border-[#22c55e]';

// ── Badge ─────────────────────────────────────────────────────────────────
function Badge({ children, color = '#888' }) {
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: `${color}55`, background: `${color}15` }}
    >
      {children}
    </span>
  );
}

// ── Song row ──────────────────────────────────────────────────────────────
function SongRow({ song, isActive, onSelect }) {
  const isArch = song.active === false;
  return (
    <button
      onClick={() => onSelect(song.id)}
      className={`w-full text-left px-4 py-2.5 border-b border-[#2a2a2a] transition-colors flex items-center gap-3 ${
        isActive ? 'bg-[#22c55e]/10 border-l-2 border-l-[#22c55e]' : 'hover:bg-white/5'
      } ${isArch ? 'opacity-40' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{song.title || song.name}</div>
        {song.artist && <div className="text-xs text-[#888] truncate">{song.artist}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-1 flex-wrap justify-end">
        {isArch && <Badge color="#ef4444">Arch</Badge>}
        {song.eflat && <Badge color="#a78bfa">Eb</Badge>}
        {song.dropD && <Badge color="#818cf8">Drop</Badge>}
        {song.capo > 0 && <Badge color="#f59e0b">Capo {song.capo}</Badge>}
        {song.key && <Badge color="#22c55e">{song.key}</Badge>}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────
// The song library includes full lyrics/chords, so — unlike setlists, which
// have a deliberate public share view — this page has no anonymous use case
// and is gated behind login just like Clients/Shows/Requests.
export default function SongManager() {
  return (
    <AuthGuard>
      <SongManagerInner />
    </AuthGuard>
  );
}

function SongManagerInner() {
  const { user } = useAuth();
  const { data: songs = [] } = useSongs();
  const members = useMembersWithAccounts();
  const { open: drawerOpen, close: closeDrawer } = useAdminDrawer();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedId = searchParams.get('id');
  const backUrl = searchParams.get('back');

  const [mode, setMode] = useState('view'); // view | edit
  const [editForm, setEditFormState] = useState({});
  const [isNewSong, setIsNewSong] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [songSort, setSongSort] = useState(() => localStorage.getItem('song_sort') || 'genre');
  const [accordion, setAccordion] = useState(() => {
    try { return JSON.parse(localStorage.getItem('song_accordion') || '{}'); } catch { return {}; }
  });
  const [importOpen, setImportOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showImportTrigger, setShowImportTrigger] = useState(false);
  const [vocalImportOpen, setVocalImportOpen] = useState(false);
  const [vocalImportText, setVocalImportText] = useState(DEFAULT_VOCAL_TABLE);
  const [vocalImportPreview, setVocalImportPreview] = useState(null);
  const [vocalImportSyncing, setVocalImportSyncing] = useState(false);
  const [pdfPanelOpen, setPdfPanelOpen] = useState(false);
  const [pdfOpts, setPdfOpts] = useState({ background: 'light', fontSize: 'md', orientation: 'portrait' });
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef(null);
  const pdfPanelRef = useRef(null);

  useEffect(() => {
    if (!pdfPanelOpen) return;
    function handleOutside(e) {
      if (pdfPanelRef.current && !pdfPanelRef.current.contains(e.target)) setPdfPanelOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [pdfPanelOpen]);

  const selected = songs.find(s => s.id === selectedId) || null;

  // ── Accordion ─────────────────────────────────────────────────────────
  function toggleAccordion(genre) {
    setAccordion(prev => {
      const next = { ...prev, [genre]: !(prev[genre] !== false) };
      localStorage.setItem('song_accordion', JSON.stringify(next));
      return next;
    });
  }

  // ── Filtered & grouped songs ──────────────────────────────────────────
  const filtered = songs.filter(s => {
    const text = `${s.title || s.name || ''} ${s.artist || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  }).sort((a, b) => {
    const aArch = a.active === false, bArch = b.active === false;
    if (aArch !== bArch) return aArch ? 1 : -1;
    return (a.title || a.name || '').localeCompare(b.title || b.name || '');
  });

  const groups = {};
  GENRE_ORDER.forEach(g => (groups[g] = []));
  filtered.forEach(s => groups[genreFor(s)].push(s));
  const isSearching = search.trim() !== '';

  // ── Select song ───────────────────────────────────────────────────────
  function selectSong(id) {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    setIsDirty(false);
    setMode('view');
    setSearchParams({ id }, { replace: false });
    closeDrawer();
  }

  // ── Enter edit ────────────────────────────────────────────────────────
  function enterEdit() {
    if (!selected) return;
    setEditFormState({
      title: selected.title || selected.name || '',
      artist: selected.artist || '',
      genre: selected.genre || '',
      key: selected.key || '',
      capo: selected.capo ?? 0,
      duration: selected.duration ? formatDuration(selected.duration) : '',
      eflat: selected.eflat || false,
      dropD: selected.dropD || false,
      chartUrl: selected.chartUrl || '',
      lyrics: selected.lyrics || '',
      notes: typeof selected.notes === 'string' ? selected.notes : (selected.notes || []).join('\n'),
      showOnWebsite: selected.showOnWebsite || false,
      vocalCapability: normaliseCapability(selected.vocalCapability, members),
      preferredVocalist: selected.preferredVocalist ? members.idOf(selected.preferredVocalist) : '',
    });
    setMode('edit');
  }

  function setField(k, v) {
    setEditFormState(f => ({ ...f, [k]: v }));
    setIsDirty(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!editForm.title?.trim()) { alert('Title is required.'); return; }
    setSaving(true);
    try {
      const seconds = parseDurationInput(editForm.duration);
      if (editForm.duration?.trim() && seconds === null) {
        alert('Duration must look like 3:45 (minutes:seconds).');
        setSaving(false);
        return;
      }
      // saveSong merges, so fields the user cleared have to be sent as an
      // explicit null to be removed — simply omitting them leaves the old value.
      const data = { ...editForm, id: selectedId, capo: parseInt(editForm.capo) || 0 };
      if (seconds === null) { data.duration = null; data.durationEstimated = null; }
      else { data.duration = seconds; data.durationEstimated = false; }
      if (!data.artist) data.artist = null;
      if (!data.genre) data.genre = null;
      if (!data.chartUrl) data.chartUrl = null;
      if (!data.notes) data.notes = null;
      if (!data.preferredVocalist) data.preferredVocalist = null;
      await saveSong(data);
      setIsDirty(false);
      setIsNewSong(false);
      setMode('view');
    } catch (err) { alert('Save failed: ' + err.message); }
    finally { setSaving(false); }
  }

  // ── Delete ────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!window.confirm('Delete this song? This cannot be undone.')) return;
    try {
      await deleteSong(selectedId);
      setSearchParams({}, { replace: true });
      setMode('view');
    } catch (err) { alert('Delete failed: ' + err.message); }
  }

  // ── Add new ───────────────────────────────────────────────────────────
  function addNew() {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    const id = uuid();
    setIsNewSong(true);
    setIsDirty(true);
    setEditFormState({ title: '', artist: '', genre: '', key: '', capo: 0, duration: '', eflat: false, dropD: false, chartUrl: '', lyrics: '', notes: '', showOnWebsite: false, vocalCapability: {}, preferredVocalist: '' });
    setMode('edit');
    setSearchParams({ id }, { replace: false });
  }

  // ── Cancel edit ───────────────────────────────────────────────────────
  function cancelEdit() {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    setIsDirty(false);
    if (isNewSong) {
      setIsNewSong(false);
      setSearchParams({}, { replace: true });
    }
    setMode('view');
  }

  // ── AbleSet import ────────────────────────────────────────────────────
  function handleFileImport(file) {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.json', '.ableset'].includes(ext)) { alert('Please upload a .json or .ableset file.'); return; }
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        let parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) {
          if (parsed.songs && Array.isArray(parsed.songs)) parsed = parsed.songs;
          else { alert('Invalid file format.'); return; }
        }
        if (!parsed.every(s => s.id && s.lastKnownName !== undefined)) { alert('Invalid AbleSet format.'); return; }
        const dbSongs = await getSongs();
        const diff = compareSongLists(parsed, dbSongs);
        const createDocs = diff.toCreate.map(buildSongDocument);
        const updateDocs = diff.toUpdate.map(u => {
          const d = { firebaseId: u.existing.id, displayTitle: u.existing.title || u.existing.ablesetName, ablesetName: u.imported.lastKnownName, ablesetTime: u.imported.time || 0, ablesetSkipped: u.imported.skipped || false, isNameMatch: u.isNameMatch || false };
          if (u.isLegacy || u.isNameMatch) d.ablesetId = u.imported.id;
          return d;
        });
        setPendingDiff({ ...diff, createDocs, updateDocs });
        setImportOpen(true);
        setShowImportTrigger(false);
      } catch (err) { alert('Failed to parse file: ' + err.message); }
    };
    reader.readAsText(file);
  }

  async function executeSync() {
    if (!pendingDiff) return;
    setSyncing(true);
    try {
      const creates = pendingDiff.createDocs || [];
      const updates = (pendingDiff.updateDocs || []).map(u => {
        const data = { ablesetName: u.ablesetName, ablesetTime: u.ablesetTime, ablesetSkipped: u.ablesetSkipped };
        if (u.ablesetId) data.ablesetId = u.ablesetId;
        return { id: u.firebaseId, data };
      });
      const archives = (pendingDiff.toArchive || []).map(s => s.id);
      const count = await syncSongsBatch(creates, updates, archives);
      setImportOpen(false);
      setPendingDiff(null);
      alert(`Sync complete. ${count} operation(s) executed.`);
    } catch (err) { alert('Sync failed: ' + err.message); }
    finally { setSyncing(false); }
  }

  // ── Vocalist capability import ────────────────────────────────────────
  async function parseVocalImport() {
    const rows = parseVocalTable(vocalImportText);
    if (rows.length === 0) { alert('No rows found — check the pasted data.'); return; }
    const dbSongs = await getSongs();
    setVocalImportPreview(matchVocalRows(rows, dbSongs));
  }

  function resolveVocalRow(bucket, key, songId) {
    setVocalImportPreview(prev => ({
      ...prev,
      [bucket]: prev[bucket].map(r => r.key === key ? { ...r, songId } : r),
    }));
  }

  async function executeVocalImport() {
    if (!vocalImportPreview) return;
    const resolved = [...vocalImportPreview.matched, ...vocalImportPreview.unmatched, ...vocalImportPreview.ambiguous]
      .filter(r => r.songId);
    if (resolved.length === 0) { alert('Nothing to import.'); return; }
    setVocalImportSyncing(true);
    try {
      const updates = resolved.map(r => ({ id: r.songId, data: { vocalCapability: r.capability, preferredVocalist: r.preferred } }));
      const count = await syncSongsBatch([], updates, []);
      setVocalImportOpen(false);
      setVocalImportPreview(null);
      alert(`Vocalist data updated for ${count} song(s).`);
    } catch (err) { alert('Import failed: ' + err.message); }
    finally { setVocalImportSyncing(false); }
  }

  const handleDragEnter = useCallback(e => {
    if (!user) return;
    e.preventDefault(); dragCounterRef.current++;
    if (dragCounterRef.current === 1) setDragOver(true);
  }, [user]);
  const handleDragLeave = useCallback(e => {
    e.preventDefault(); dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragOver(false);
  }, []);
  const handleDrop = useCallback(e => {
    e.preventDefault(); dragCounterRef.current = 0; setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileImport(file);
  }, [songs]);

  // ── Left panel ────────────────────────────────────────────────────────
  const leftPanel = (
    <div
      className={`admin-drawer flex flex-col overflow-hidden bg-[#1a1a1a] border-r border-[#2a2a2a] relative${drawerOpen ? ' drawer-open' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 bg-[#22c55e]/10 border-2 border-dashed border-[#22c55e] rounded flex items-center justify-center z-30 pointer-events-none">
          <div className="text-center">
            <i className="fas fa-cloud-arrow-up text-3xl text-[#22c55e] mb-2 block" />
            <p className="text-[#22c55e] font-semibold text-sm">Drop AbleSet JSON here</p>
          </div>
        </div>
      )}

      {/* Search + add */}
      <div className="shrink-0 p-3 border-b border-[#2a2a2a] space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-xs pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search songs..."
            className="w-full pl-8 pr-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#22c55e]"
          />
        </div>
        {user && (
          <button
            onClick={addNew}
            className="shrink-0 px-3 py-2 bg-[#16a34a] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
            title="Add Song"
          >
            <i className="fas fa-plus text-xs" />
            <span className="hidden sm:inline">Add</span>
          </button>
        )}
        {user && (
          <button
            onClick={() => setShowImportTrigger(v => !v)}
            className="shrink-0 p-2 text-[#888] hover:text-white bg-[#121212] border border-[#2a2a2a] rounded-lg transition-colors"
            title="Import from AbleSet"
          >
            <i className="fas fa-file-import text-xs" />
          </button>
        )}
        {user && (
          <button
            onClick={() => { setVocalImportPreview(null); setVocalImportOpen(true); }}
            className="shrink-0 p-2 text-[#888] hover:text-white bg-[#121212] border border-[#2a2a2a] rounded-lg transition-colors"
            title="Import Vocalist Capability Table"
          >
            <i className="fas fa-microphone-lines text-xs" />
          </button>
        )}
      </div>
      <select
        value={songSort}
        onChange={e => { setSongSort(e.target.value); localStorage.setItem('song_sort', e.target.value); }}
        className="w-full px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-[#888] text-xs focus:outline-none focus:border-[#22c55e]"
      >
        <option value="genre">Sort by Genre</option>
        <option value="alpha">Sort Alphabetically</option>
      </select>
      </div>

      {/* AbleSet import trigger */}
      {showImportTrigger && user && (
        <div className="shrink-0 mx-3 mt-2 p-3 bg-[#121212] border border-[#2a2a2a] rounded-lg">
          <p className="text-xs text-[#888] mb-2">Upload .json or .ableset to sync library</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-3 py-2 bg-[#16a34a]/20 border border-[#16a34a]/50 text-[#22c55e] rounded-lg text-xs font-semibold hover:bg-[#16a34a]/30 transition-colors"
          >
            <i className="fas fa-folder-open mr-1.5" />Choose File
          </button>
        </div>
      )}

      {/* Song list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="p-10 text-center text-[#555]">
            <i className="fas fa-search text-2xl mb-3 block opacity-30" />
            <p className="text-sm">No songs found</p>
          </div>
        )}

        {/* Genre view */}
        {songSort === 'genre' && GENRE_ORDER.map(genre => {
          const genreSongs = groups[genre];
          if (!genreSongs.length) return null;
          const isOpen = isSearching || (accordion[genre] !== false);
          return (
            <div key={genre}>
              <button
                onClick={() => toggleAccordion(genre)}
                className="w-full flex items-center justify-between px-4 py-2 bg-[#121212] hover:bg-[#1f1f1f] border-b border-[#2a2a2a] sticky top-0 z-10 transition-colors"
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#888]">{genre}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#555] font-mono">{genreSongs.length}</span>
                  <i className={`fas fa-chevron-right text-[10px] text-[#555] transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
                </div>
              </button>
              {isOpen && genreSongs.map(song => <SongRow key={song.id} song={song} isActive={selectedId === song.id} onSelect={selectSong} />)}
            </div>
          );
        })}

        {/* Alphabetical view */}
        {songSort === 'alpha' && filtered.map(song => (
          <SongRow key={song.id} song={song} isActive={selectedId === song.id} onSelect={selectSong} />
        ))}
      </div>

      {/* Footer count */}
      <div className="shrink-0 px-4 py-2 border-t border-[#2a2a2a]">
        <span className="text-xs text-[#555] font-mono">{filtered.length} song{filtered.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );

  // ── Right panel ───────────────────────────────────────────────────────
  const rightPanel = (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Empty state */}
      {!selectedId && mode !== 'edit' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-base font-bold mb-5" style={{ color: '#22c55e' }}>Songs</p>
            <i className="fas fa-music text-5xl mb-4 block opacity-20 text-[#555]" />
            <p className="text-sm text-[#555]">Select a song to view details</p>
            {user && (
              <button onClick={addNew} className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold transition-colors" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                <i className="fas fa-plus mr-1.5" />New Song
              </button>
            )}
          </div>
        </div>
      )}

      {/* View mode */}
      {selectedId && selected && mode === 'view' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Header – title/artist only */}
          <div className="shrink-0 px-5 py-3.5 border-b border-[#2a2a2a] flex items-start gap-3">
            {backUrl && (
              <button
                onClick={() => navigate(decodeURIComponent(backUrl))}
                className="shrink-0 p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors mt-0.5"
                title="Back"
              >
                <i className="fas fa-arrow-left text-sm" />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white truncate">{selected.title || selected.name}</h2>
              {selected.artist && <p className="text-sm text-[#888]">{selected.artist}</p>}
            </div>
          </div>

          {/* Action bar */}
          <div className="shrink-0 px-4 py-1.5 border-b border-[#2a2a2a] flex items-center gap-1.5">
            {/* PDF download */}
            <div className="relative" ref={pdfPanelRef}>
              <button
                onClick={() => setPdfPanelOpen(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border rounded-lg transition-colors ${
                  pdfPanelOpen
                    ? 'bg-[#22c55e]/10 border-[#22c55e]/40 text-[#22c55e]'
                    : 'text-[#888] hover:text-white border-[#2a2a2a] hover:border-[#555]'
                }`}
              >
                <i className="fas fa-file-pdf" />
                PDF
                <i className={`fas fa-chevron-down text-[9px] transition-transform duration-150 ${pdfPanelOpen ? 'rotate-180' : ''}`} />
              </button>
              {pdfPanelOpen && (
                <div className="absolute top-full left-0 mt-1.5 z-50 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl p-4 w-60">
                  <PdfOptionGroup label="Background">
                    <PdfOptionBtn active={pdfOpts.background === 'light'} onClick={() => setPdfOpts(o => ({ ...o, background: 'light' }))}>Light</PdfOptionBtn>
                    <PdfOptionBtn active={pdfOpts.background === 'dark'} onClick={() => setPdfOpts(o => ({ ...o, background: 'dark' }))}>Dark</PdfOptionBtn>
                  </PdfOptionGroup>
                  <PdfOptionGroup label="Text Size">
                    <PdfOptionBtn active={pdfOpts.fontSize === 'sm'} onClick={() => setPdfOpts(o => ({ ...o, fontSize: 'sm' }))}>Small</PdfOptionBtn>
                    <PdfOptionBtn active={pdfOpts.fontSize === 'md'} onClick={() => setPdfOpts(o => ({ ...o, fontSize: 'md' }))}>Med</PdfOptionBtn>
                    <PdfOptionBtn active={pdfOpts.fontSize === 'lg'} onClick={() => setPdfOpts(o => ({ ...o, fontSize: 'lg' }))}>Large</PdfOptionBtn>
                    <PdfOptionBtn active={pdfOpts.fontSize === 'xl'} onClick={() => setPdfOpts(o => ({ ...o, fontSize: 'xl' }))}>XL</PdfOptionBtn>
                  </PdfOptionGroup>
                  <PdfOptionGroup label="Orientation">
                    <PdfOptionBtn active={pdfOpts.orientation === 'portrait'} onClick={() => setPdfOpts(o => ({ ...o, orientation: 'portrait' }))}>Portrait</PdfOptionBtn>
                    <PdfOptionBtn active={pdfOpts.orientation === 'landscape'} onClick={() => setPdfOpts(o => ({ ...o, orientation: 'landscape' }))}>Landscape</PdfOptionBtn>
                  </PdfOptionGroup>
                  <button
                    onClick={() => { downloadSongPdf(selected, pdfOpts); setPdfPanelOpen(false); }}
                    className="w-full mt-2 px-4 py-2 bg-[#16a34a] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-download" /> Download
                  </button>
                </div>
              )}
            </div>

            {/* Chart link */}
            {selected.chartUrl && (
              <a
                href={selected.chartUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[#888] hover:text-white border border-[#2a2a2a] hover:border-[#555] rounded-lg transition-colors"
                title="View Chart"
              >
                <i className="fas fa-external-link-alt" /> Chart
              </a>
            )}

            <div className="flex-1" />

            {/* Edit / Delete */}
            {user && (
              <>
                <button
                  onClick={enterEdit}
                  className="p-1.5 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                  title="Edit"
                >
                  <i className="fas fa-pen text-sm" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 text-red-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                  title="Delete"
                >
                  <i className="fas fa-trash text-sm" />
                </button>
              </>
            )}
          </div>

          {/* Metadata strip */}
          <div className="shrink-0 px-5 py-2.5 border-b border-[#2a2a2a] flex flex-wrap gap-x-5 gap-y-1">
            {selected.key && <MetaItem label="Key" value={selected.key} accent />}
            {selected.capo > 0 && <MetaItem label="Capo" value={`Fret ${selected.capo}`} />}
            <MetaItem label="Tuning" value={selected.eflat ? 'Eb' : selected.dropD ? 'Drop D' : 'Standard'} />
            {selected.genre && <MetaItem label="Genre" value={selected.genre} />}
            {selected.duration > 0 && (
              <MetaItem
                label="Length"
                value={`${selected.durationEstimated ? '~' : ''}${formatDuration(selected.duration)}`}
              />
            )}
          </div>

          {/* Lyrics */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <SongView song={selected} />
          </div>
        </div>
      )}

      {/* Song not found (URL has id but song not in list) */}
      {selectedId && !selected && mode === 'view' && (
        <div className="flex-1 flex items-center justify-center text-[#555]">
          <div className="text-center">
            <i className="fas fa-circle-question text-4xl mb-3 block opacity-30" />
            <p className="text-sm">Song not found</p>
          </div>
        </div>
      )}

      {/* Edit mode */}
      {mode === 'edit' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-5 py-3.5 border-b border-[#2a2a2a] flex items-center gap-3">
            <button onClick={cancelEdit} className="p-2 text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors">
              <i className="fas fa-times text-sm" />
            </button>
            <h2 className="flex-1 text-base font-bold text-white">{isNewSong ? 'New Song' : 'Edit Song'}</h2>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[#16a34a] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <><i className="fas fa-spinner fa-spin" /> Saving...</> : <><i className="fas fa-check" /> Save</>}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <SongForm form={editForm} setField={setField} leadVocalists={members.leadVocalists} />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <AdminShell activeApp="songs">
      {/* Two-column layout */}
      <div className="admin-page-grid flex-1 min-h-0 grid overflow-hidden">
        {leftPanel}
        <div className="flex flex-col overflow-hidden bg-[#121212]">
          {rightPanel}
        </div>
      </div>

      {/* AbleSet Import Modal */}
      {importOpen && pendingDiff && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) { setImportOpen(false); setPendingDiff(null); } }}
        >
          <div className="bg-[#1a1a1a] w-full max-w-lg rounded-xl shadow-2xl border border-[#2a2a2a] overflow-hidden max-h-[85vh] flex flex-col">
            <div className="shrink-0 px-5 py-4 border-b border-[#2a2a2a] flex justify-between items-center">
              <p className="text-base font-bold text-white"><i className="fas fa-sync text-[#22c55e] mr-2" />AbleSet Sync Preview</p>
              <button onClick={() => { setImportOpen(false); setPendingDiff(null); }} className="text-[#888] hover:text-white p-1">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Add', color: '#22c55e', count: pendingDiff.toCreate.length },
                  { label: 'Update', color: '#3b82f6', count: pendingDiff.toUpdate.length },
                  { label: 'Archive', color: '#ef4444', count: pendingDiff.toArchive.length },
                ].map(({ label, color, count }) => (
                  <div key={label} className="rounded-lg p-3 text-center border" style={{ borderColor: `${color}33`, background: `${color}10` }}>
                    <div className="text-2xl font-bold" style={{ color }}>{count}</div>
                    <div className="text-xs font-semibold uppercase mt-1" style={{ color }}>{label}</div>
                  </div>
                ))}
              </div>

              {pendingDiff.toCreate.length === 0 && pendingDiff.toUpdate.length === 0 && pendingDiff.toArchive.length === 0 && (
                <p className="text-[#888] text-center py-4 text-sm">Everything is already in sync.</p>
              )}

              {pendingDiff.createDocs?.length > 0 && (
                <DiffSection title="New Songs" color="#22c55e" icon="fa-plus-circle">
                  {pendingDiff.createDocs.map((s, i) => (
                    <DiffRow key={i}>{s.title}</DiffRow>
                  ))}
                </DiffSection>
              )}
              {pendingDiff.updateDocs?.length > 0 && (
                <DiffSection title="Updated" color="#3b82f6" icon="fa-pen-to-square">
                  {pendingDiff.updateDocs.map((s, i) => (
                    <DiffRow key={i} meta={s.isNameMatch ? 'linked' : 'updated'}>{s.displayTitle}</DiffRow>
                  ))}
                </DiffSection>
              )}
              {pendingDiff.toArchive?.length > 0 && (
                <DiffSection title="To Archive" color="#ef4444" icon="fa-box-archive">
                  {pendingDiff.toArchive.map(s => (
                    <DiffRow key={s.id} meta="archive">{s.title || s.ablesetName}</DiffRow>
                  ))}
                </DiffSection>
              )}

              <p className="text-[#555] text-xs mt-3">
                <i className="fas fa-info-circle mr-1" />Archived songs are marked inactive, not deleted.
              </p>
            </div>
            <div className="shrink-0 border-t border-[#2a2a2a] px-5 py-3 flex gap-3 justify-end">
              <button
                onClick={() => { setImportOpen(false); setPendingDiff(null); }}
                className="px-4 py-2 bg-[#2a2a2a] rounded-lg text-white hover:bg-[#333] text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeSync}
                disabled={syncing || (pendingDiff.toCreate.length + pendingDiff.toUpdate.length + pendingDiff.toArchive.length === 0)}
                className="px-4 py-2 bg-[#16a34a] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <i className="fas fa-sync" />{syncing ? 'Syncing...' : 'Confirm Sync'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vocalist Capability Import Modal */}
      {vocalImportOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setVocalImportOpen(false); }}
        >
          <div className="bg-[#1a1a1a] w-full max-w-2xl rounded-xl shadow-2xl border border-[#2a2a2a] overflow-hidden max-h-[85vh] flex flex-col">
            <div className="shrink-0 px-5 py-4 border-b border-[#2a2a2a] flex justify-between items-center">
              <p className="text-base font-bold text-white"><i className="fas fa-microphone-lines text-[#22c55e] mr-2" />Import Vocalist Capability Table</p>
              <button onClick={() => setVocalImportOpen(false)} className="text-[#888] hover:text-white p-1">
                <i className="fas fa-times" />
              </button>
            </div>

            {!vocalImportPreview ? (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  <p className="text-xs text-[#888]">
                    Tab-separated: <code className="bg-[#2a2a2a] px-1 rounded">Song Name, Tom, Shelley, Kelsey, David, Preferred</code>. Paste updated data to re-run.
                  </p>
                  <textarea
                    rows={16}
                    value={vocalImportText}
                    onChange={e => setVocalImportText(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs font-mono resize-y focus:outline-none focus:border-[#22c55e]"
                  />
                </div>
                <div className="shrink-0 border-t border-[#2a2a2a] px-5 py-3 flex gap-3 justify-end">
                  <button onClick={() => setVocalImportOpen(false)} className="px-4 py-2 bg-[#2a2a2a] rounded-lg text-white hover:bg-[#333] text-sm font-semibold transition-colors">
                    Cancel
                  </button>
                  <button onClick={parseVocalImport} className="px-4 py-2 bg-[#16a34a] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
                    <i className="fas fa-magnifying-glass" />Parse & Match
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: 'Matched', color: '#22c55e', count: vocalImportPreview.matched.length },
                      { label: 'Unmatched', color: '#f59e0b', count: vocalImportPreview.unmatched.length },
                      { label: 'Ambiguous', color: '#ef4444', count: vocalImportPreview.ambiguous.length },
                    ].map(({ label, color, count }) => (
                      <div key={label} className="rounded-lg p-3 text-center border" style={{ borderColor: `${color}33`, background: `${color}10` }}>
                        <div className="text-2xl font-bold" style={{ color }}>{count}</div>
                        <div className="text-xs font-semibold uppercase mt-1" style={{ color }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {vocalImportPreview.matched.length > 0 && (
                    <DiffSection title="Matched" color="#22c55e" icon="fa-check-circle">
                      {vocalImportPreview.matched.map(r => (
                        <DiffRow key={r.key} meta={r.preferred || undefined}>{r.title}</DiffRow>
                      ))}
                    </DiffSection>
                  )}

                  {(vocalImportPreview.unmatched.length > 0 || vocalImportPreview.ambiguous.length > 0) && (
                    <div className="mb-4">
                      <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5 text-[#f59e0b]">
                        <i className="fas fa-triangle-exclamation" />Needs Review
                      </h4>
                      <div className="space-y-1.5">
                        {[...vocalImportPreview.unmatched, ...vocalImportPreview.ambiguous].map(r => {
                          const bucket = vocalImportPreview.unmatched.includes(r) ? 'unmatched' : 'ambiguous';
                          return (
                            <div key={r.key} className="flex items-center justify-between gap-3 px-3 py-1.5 bg-[#121212] rounded text-sm">
                              <span className="text-white truncate flex-1">{r.title}</span>
                              <select
                                value={r.songId}
                                onChange={e => resolveVocalRow(bucket, r.key, e.target.value)}
                                className="px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white text-xs focus:outline-none focus:border-[#22c55e]"
                                style={{ maxWidth: 220 }}
                              >
                                <option value="">— Skip —</option>
                                {songs.map(s => <option key={s.id} value={s.id}>{s.title || s.name}</option>)}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-[#555] text-xs mt-3">
                    <i className="fas fa-info-circle mr-1" />Only rows with a matched song will be written; ambiguous rows must be resolved or skipped.
                  </p>
                </div>
                <div className="shrink-0 border-t border-[#2a2a2a] px-5 py-3 flex gap-3 justify-end">
                  <button onClick={() => setVocalImportPreview(null)} className="px-4 py-2 bg-[#2a2a2a] rounded-lg text-white hover:bg-[#333] text-sm font-semibold transition-colors">
                    Back
                  </button>
                  <button
                    onClick={executeVocalImport}
                    disabled={vocalImportSyncing || vocalImportPreview.ambiguous.some(r => !r.songId)}
                    className="px-4 py-2 bg-[#16a34a] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <i className="fas fa-check" />{vocalImportSyncing ? 'Importing...' : 'Confirm Import'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".json,.ableset" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) handleFileImport(f); e.target.value = ''; }} />
    </AdminShell>
  );
}

// ── MetaItem ──────────────────────────────────────────────────────────────
function MetaItem({ label, value, accent }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-[#555]">{label}:</span>
      <span className={`text-xs font-semibold ${accent ? 'text-[#22c55e]' : 'text-[#ccc]'}`}>{value}</span>
    </div>
  );
}

// ── SongView ──────────────────────────────────────────────────────────────
function SongView({ song }) {
  const { html, footnotes } = parseSongData(song.lyrics || '', false, 0);
  return (
    <div>
      {song.lyrics ? (
        <div
          className="text-sm text-[#ddd] leading-relaxed font-mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="text-[#555] text-sm italic">No lyrics yet.</p>
      )}
      {footnotes.length > 0 && (
        <div className="mt-6 pt-4 border-t border-[#2a2a2a]">
          <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-2">Performance Notes</p>
          <ol className="space-y-1">
            {footnotes.map((note, i) => (
              <li key={i} className="text-sm text-[#aaa]">
                <span className="text-[#22c55e] font-bold mr-2">{i + 1}.</span>{note}
              </li>
            ))}
          </ol>
        </div>
      )}
      {song.notes && (
        <div className="mt-6 pt-4 border-t border-[#2a2a2a]">
          <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-2">Notes</p>
          <p className="text-sm text-[#aaa] whitespace-pre-wrap">
            {typeof song.notes === 'string' ? song.notes : song.notes.join('\n')}
          </p>
        </div>
      )}
    </div>
  );
}

// ── SongForm ──────────────────────────────────────────────────────────────
function SongForm({ form, setField, leadVocalists }) {
  return (
    <div className="space-y-4 max-w-2xl pb-8">
      <Field label="Title *">
        <input type="text" value={form.title || ''} onChange={e => setField('title', e.target.value)} className={INPUT} placeholder="Song title" />
      </Field>
      <Field label="Artist / Original By">
        <input type="text" value={form.artist || ''} onChange={e => setField('artist', e.target.value)} className={INPUT} placeholder="Artist name" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Genre">
          <select value={form.genre || ''} onChange={e => setField('genre', e.target.value)} className={INPUT}>
            <option value="">— Select —</option>
            {GENRE_ORDER.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Original Key">
          <select value={form.key || ''} onChange={e => setField('key', e.target.value)} className={INPUT}>
            <option value="">None</option>
            {KEY_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Capo">
          <input type="number" min="0" max="12" value={form.capo ?? 0} onChange={e => setField('capo', e.target.value)} className={INPUT} style={{ maxWidth: 120 }} />
        </Field>
        <Field label="Length (m:ss)">
          <input
            type="text"
            inputMode="numeric"
            value={form.duration || ''}
            onChange={e => setField('duration', e.target.value)}
            className={INPUT}
            style={{ maxWidth: 120 }}
            placeholder="3:45"
          />
          <p className="text-[11px] text-[#555] mt-1">Used to estimate set lengths.</p>
        </Field>
      </div>
      <div className="flex flex-wrap gap-5">
        <CheckField label="Eb Tuning (half-step down)" checked={!!form.eflat} onChange={v => setField('eflat', v)} />
        <CheckField label="Drop D Tuning" checked={!!form.dropD} onChange={v => setField('dropD', v)} />
        <CheckField label="Show on Public Website" checked={!!form.showOnWebsite} onChange={v => setField('showOnWebsite', v)} />
      </div>
      <Field label="Chart URL (PDF)">
        <input type="url" value={form.chartUrl || ''} onChange={e => setField('chartUrl', e.target.value)} className={INPUT} placeholder="https://..." />
      </Field>
      <Field label="Can Sing Lead">
        <div className="flex flex-wrap gap-5">
          {leadVocalists.map(m => (
            <CheckField
              key={m.id}
              label={m.name}
              checked={!!form.vocalCapability?.[m.id]}
              onChange={val => setField('vocalCapability', { ...form.vocalCapability, [m.id]: val })}
            />
          ))}
        </div>
      </Field>
      <Field label="Preferred Vocalist">
        <select value={form.preferredVocalist || ''} onChange={e => setField('preferredVocalist', e.target.value)} className={INPUT} style={{ maxWidth: 220 }}>
          <option value="">— None —</option>
          {leadVocalists.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Lyrics">
        <p className="text-xs text-[#555] mb-1.5">
          <code className="bg-[#2a2a2a] px-1 rounded">[Chord]</code> chords &nbsp;
          <code className="bg-[#2a2a2a] px-1 rounded">[Section]</code> headers &nbsp;
          <code className="bg-[#2a2a2a] px-1 rounded">**harmony**</code> &nbsp;
          <code className="bg-[#2a2a2a] px-1 rounded">[[note]]</code> footnotes
        </p>
        <textarea
          rows={20}
          value={form.lyrics || ''}
          onChange={e => setField('lyrics', e.target.value)}
          className={INPUT + ' font-mono text-xs resize-y'}
          placeholder={'[Intro]\n[G]I found a [Em]love for [D]me...'}
        />
      </Field>
      <Field label="Performance Notes">
        <textarea rows={4} value={form.notes || ''} onChange={e => setField('notes', e.target.value)} className={INPUT + ' resize-y'} placeholder="Notes for the band..." />
      </Field>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function CheckField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-[#16a34a]"
      />
      <span className="text-sm text-[#ccc]">{label}</span>
    </label>
  );
}

function PdfOptionGroup({ label, children }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#555] mb-1.5">{label}</p>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

function PdfOptionBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors font-semibold ${
        active
          ? 'bg-[#22c55e]/15 border-[#22c55e]/50 text-[#22c55e]'
          : 'border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#555]'
      }`}
    >
      {children}
    </button>
  );
}

function DiffSection({ title, color, icon, children }) {
  return (
    <div className="mb-4">
      <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color }}>
        <i className={`fas ${icon}`} />{title}
      </h4>
      <div className="space-y-1 max-h-40 overflow-y-auto">{children}</div>
    </div>
  );
}

function DiffRow({ children, meta }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-[#121212] rounded text-sm">
      <span className="text-white truncate">{children}</span>
      {meta && <span className="text-[#888] text-xs ml-2 shrink-0">{meta}</span>}
    </div>
  );
}
