import { useState, useRef, useEffect, useMemo } from 'react';
import { makeUniqueSlug } from '../utils.js';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import Sortable from 'sortablejs';
import AdminShell, { useAdminDrawer } from '../components/admin/AdminShell.jsx';
import { useAuth } from '../firebase/AuthContext.jsx';
import { useSetlists, useSetlist, useSongs, useShows, useMembers, useMembersWithAccounts } from '../firebase/useFirestore.js';
import MemberAvatar from '../components/MemberAvatar.jsx';
import AutoSetlistModal from '../components/setlist/AutoSetlistModal.jsx';
import { saveSetlist, deleteSetlist } from '../firestore-service.js';
import { hasCapability, preferredVocalistId } from '../utils/members.js';
import { useIsMobile } from '../utils/useIsMobile.js';
import {
  isSetMarker, cleanSetName, songTitle,
  formatLongDuration, buildSetBreakdown, summarizeSetlist,
  buildPopularityMap, indexSongs, tuningOf, vocalistIds,
} from '../utils/setlistUtils.js';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Caps a list of vocalist avatars for cramped mobile rows: up to `max` shown,
 * the rest collapsed into a "+N" count so the drag handle / remove button
 * never gets crowded out. Desktop has room to just show everyone. */
function capVocalists(vocalists, isMobile, max = 2) {
  if (!isMobile || vocalists.length <= max) return { shown: vocalists, overflow: 0 };
  return { shown: vocalists.slice(0, max), overflow: vocalists.length - max };
}

// ── Main component ────────────────────────────────────────────────────────
// Anonymous visitors only ever get a name-labeled share link (?id=...) and
// can never browse the setlist library, so they're routed to a stripped-down
// read-only view instead of the full admin builder below.
export default function SetlistManager() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const selectedId = searchParams.get('id');

  if (authLoading) {
    return <div className="min-h-screen bg-[#121212]" />;
  }

  if (!user) {
    return <PublicSetlistView id={selectedId} />;
  }

  return <AdminSetlistManager />;
}

// ── Public read-only view ───────────────────────────────────────────────
// No login prompt, no list of other setlists, no library — just the one
// setlist a band member explicitly shared via its id.
function PublicSetlistView({ id }) {
  const navigate = useNavigate();
  const { data: setlist, loading, error } = useSetlist(id);
  const { data: allSongs = [] } = useSongs();
  const members = useMembers();

  useEffect(() => {
    if (!id) { navigate('/', { replace: true }); return; }
    if (!loading && (error || !setlist)) { navigate('/', { replace: true }); }
  }, [id, loading, error, setlist, navigate]);

  const songsById = useMemo(() => indexSongs(allSongs), [allSongs]);

  if (!id || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212]">
        {loading && <p className="text-[#555] text-sm">Loading setlist…</p>}
      </div>
    );
  }

  if (!setlist) return null; // redirecting home

  const songs = setlist.songs || [];

  return (
    <div className="min-h-screen bg-[#121212] text-white flex flex-col text-left">
      <div className="shrink-0 px-4 py-3 border-b border-[#2a2a2a] flex items-center gap-3">
        <Link to="/" className="shrink-0">
          <img src="/images/Ultraphonics-Spiral-512.png" alt="Ultraphonics" className="h-7 w-7" />
        </Link>
        <p className="flex-1 min-w-0 text-sm font-bold text-white truncate">{setlist.name}</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          {songs.length === 0 && (
            <div className="py-16 text-center text-[#555]">
              <i className="fas fa-music text-4xl mb-3 block opacity-20" />
              <p className="text-sm">This setlist is empty</p>
            </div>
          )}
          <SetlistRows
            songs={songs}
            songsById={songsById}
            vocalAssignments={setlist.vocalAssignments || {}}
            segues={setlist.segues || {}}
            members={members}
          />
        </div>
      </div>

      {songs.length > 0 && (
        <div className="shrink-0 px-4 py-2 border-t border-[#2a2a2a] bg-[#1a1a1a] text-center">
          <span className="text-xs text-[#888] font-mono">{summarizeSetlist(songs, songsById)}</span>
        </div>
      )}
    </div>
  );
}

// ── Read-only setlist rows ────────────────────────────────────────────────
// Shared by the public share link and the admin viewer so the two can't drift.
function SetlistRows({ songs, songsById, vocalAssignments, segues, members, linkTo, warnFor }) {
  const isMobile = useIsMobile();
  const { sets } = buildSetBreakdown(songs, songsById);
  const setByStart = new Map(sets.map(s => [s.start, s]));

  return (
    <>
      {songs.map((song, idx) => {
        if (isSetMarker(song)) {
          const info = setByStart.get(idx);
          return (
            <div key={`${song.id}-${idx}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5 border-b border-[#2a2a2a] bg-[#1a1a1a]">
              <span className="text-sm font-bold text-[#888] uppercase tracking-wide">
                {cleanSetName(songTitle(song))}
              </span>
              {info && info.count > 0 && (
                <span className="shrink-0 text-[11px] text-[#666] font-mono">
                  {info.count} songs · {info.estimated ? '~' : ''}{formatLongDuration(info.seconds)}
                </span>
              )}
            </div>
          );
        }

        const vocalists = vocalistIds(vocalAssignments[song.id]).map(id => members.get(id));
        const { shown: shownVocalists, overflow } = capVocalists(vocalists, isMobile);
        const doc = songsById.get(song.id);
        const title = songTitle(song);
        const tuning = doc ? tuningOf(doc) : 'Standard';

        return (
          <div key={`${song.id}-${idx}`} className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a] hover:bg-white/5">
            {linkTo ? (
              <Link to={linkTo(song)} className="flex-1 min-w-0 text-sm text-white hover:text-[#3b82f6] transition-colors truncate font-medium">
                {title}
              </Link>
            ) : (
              <span className="flex-1 min-w-0 text-sm text-white font-medium truncate">{title}</span>
            )}
            <div className="shrink-0 flex items-center gap-1.5">
              {tuning !== 'Standard' && <TinyBadge color="#a78bfa">{tuning}</TinyBadge>}
              {doc?.capo > 0 && <TinyBadge color="#f59e0b">Capo {doc.capo}</TinyBadge>}
              {segues[song.id] && <TinyBadge color="#3b82f6">~</TinyBadge>}
              {warnFor?.(song, doc) && (
                <i className="fas fa-triangle-exclamation text-amber-400 text-xs" title="No present singer capable of this song" />
              )}
              {vocalists.length > 0 ? (
                <div className="flex items-center -space-x-1.5" title={overflow ? vocalists.map(v => v.name).join(', ') : undefined}>
                  {shownVocalists.map(v => (
                    <MemberAvatar key={v.id} name={v.name} color={v.color} size={24} className="ring-2 ring-[#121212]" />
                  ))}
                  {overflow > 0 && (
                    <span
                      className="rounded-full flex items-center justify-center font-bold ring-2 ring-[#121212]"
                      style={{ width: 24, height: 24, fontSize: 10, background: '#2a2a2a', color: '#aaa' }}
                    >
                      +{overflow}
                    </span>
                  )}
                </div>
              ) : (
                <span className="w-6" />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Admin builder ────────────────────────────────────────────────────────
function AdminSetlistManager() {
  const { user } = useAuth();
  const { data: setlists = [] } = useSetlists();
  const { open: drawerOpen, close: closeDrawer } = useAdminDrawer();
  const { data: allSongs = [] } = useSongs();
  const { data: allShows = [] } = useShows();
  const members = useMembersWithAccounts();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const selectedId = searchParams.get('id');
  const triggerNew = searchParams.get('new') === '1';
  // Which gig (if any) this setlist is dedicated to — drives Auto-Assign and the warning badges
  const linkedShow = allShows.find(s => s.setlistId === selectedId) || null;

  // Setlist state
  const [setlistSongs, setSetlistSongs] = useState(/** @type {any[]} */ ([]));
  const [setlistName, setSetlistName] = useState('');
  const [vocalAssignments, setVocalAssignments] = useState({});
  const [segues, setSegues] = useState({});
  const [mode, setMode] = useState('view'); // view | edit
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const editing = mode === 'edit';

  // Snapshot of the last saved/loaded state, so Cancel can genuinely revert
  const snapshotRef = useRef({ songs: [], name: '', vocalAssignments: {}, segues: {} });

  // Left panel
  const [leftTab, setLeftTab] = useState('setlists');
  const [libSearch, setLibSearch] = useState('');
  const [libSort, setLibSort] = useState('title'); // title | plays
  const [showSetMarkersOnly, setShowSetMarkersOnly] = useState(false);

  // Mobile-only: which pane of the fullscreen editor is showing. Desktop shows
  // the setlist and library side by side, so this is meaningless there.
  const [mobileEditTab, setMobileEditTab] = useState('setlist'); // setlist | songs

  // Modals / menus
  const [propsModalSong, setPropsModalSong] = useState(null);
  const [autoModalOpen, setAutoModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Derived data
  const songsById = useMemo(() => indexSongs(allSongs), [allSongs]);
  const popularity = useMemo(() => buildPopularityMap(setlists), [setlists]);
  // The gig's lineup, resolved to members. Single source for the header strip,
  // Auto Assign, and the Auto Setlist prefill so they can never disagree.
  const gigPersonnel = useMemo(
    () => (linkedShow?.personnel || []).map(p => members.get(p)),
    [linkedShow, members],
  );

  // Drag refs
  const libraryRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const setlistRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const librarySortable = useRef(/** @type {import('sortablejs') | null} */ (null));
  const setlistSortable = useRef(/** @type {import('sortablejs') | null} */ (null));
  const allSongsRef = useRef(allSongs);
  useEffect(() => { allSongsRef.current = allSongs; }, [allSongs]);

  // Load setlist when selectedId changes OR when setlists data first arrives
  const selected = setlists.find(s => s.id === selectedId);
  const loadedIdRef = useRef(null);
  // See the "Editing is only meaningful..." effect below for why this exists.
  const newSetlistPendingRef = useRef(false);
  useEffect(() => {
    if (!selected) return;
    // Already loaded this exact setlist — don't reload (avoids wiping edits on re-render)
    if (loadedIdRef.current === selected.id) return;
    loadedIdRef.current = selected.id;
    if (isDirty && !window.confirm('Load a new setlist? Unsaved changes will be lost.')) return;
    applyLoaded(selected);
  }, [selectedId, selected]);

  function applyLoaded(doc) {
    const next = {
      songs: doc.songs || [],
      name: doc.name || '',
      vocalAssignments: doc.vocalAssignments || {},
      segues: doc.segues || {},
    };
    snapshotRef.current = next;
    setSetlistSongs(next.songs);
    setSetlistName(next.name);
    setVocalAssignments(next.vocalAssignments);
    setSegues(next.segues);
    setMode('view');
    setIsDirty(false);
  }

  // Trigger new setlist from Quick Launch
  useEffect(() => {
    if (triggerNew) handleNew();
  }, []);

  // beforeunload
  useEffect(() => {
    const handler = e => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Setlist sortable — reordering only exists in edit mode
  useEffect(() => {
    if (!setlistRef.current || !editing) return;
    setlistSortable.current = Sortable.create(setlistRef.current, {
      group: 'songs',
      animation: 150,
      handle: '.drag-handle',
      delay: 200,
      delayOnTouchOnly: true,
      ghostClass: 'sortable-ghost',
      onAdd(evt) {
        const songId = evt.item.dataset.id;
        evt.item.remove();
        const song = allSongsRef.current.find(s => s.id === songId);
        if (!song) return;
        const newIndex = evt.newIndex ?? 0;
        setSetlistSongs(prev => {
          const next = [...prev];
          next.splice(newIndex, 0, rowFor(song));
          return next;
        });
        setIsDirty(true);
      },
      onUpdate(evt) {
        const oldIndex = evt.oldIndex ?? 0;
        const newIndex = evt.newIndex ?? 0;
        setSetlistSongs(prev => {
          const next = [...prev];
          const [moved] = next.splice(oldIndex, 1);
          next.splice(newIndex, 0, moved);
          return next;
        });
        setIsDirty(true);
      },
    });
    return () => { if (setlistSortable.current?.el) setlistSortable.current.destroy(); setlistSortable.current = null; };
  }, [editing]);

  // Library sortable — only mounted alongside the library tab in edit mode
  useEffect(() => {
    if (!libraryRef.current) return;
    librarySortable.current = Sortable.create(libraryRef.current, {
      group: { name: 'songs', pull: 'clone', put: false },
      sort: false,
      delay: 200,
      delayOnTouchOnly: true,
      animation: 0,
    });
    return () => { if (librarySortable.current?.el) librarySortable.current.destroy(); librarySortable.current = null; };
  }, [leftTab, editing]);

  // Editing is only meaningful with a setlist loaded. Guards e.g. the browser
  // back button landing on a bare /setlists while mode was still 'edit'.
  //
  // handleNew() sets mode 'edit' and a brand-new id together, but the id
  // travels through react-router's setSearchParams while mode is a plain
  // useState — they don't always land in the same commit, so there's one
  // transient render where mode is already 'edit' but selectedId hasn't
  // caught up yet. Without the guard below, this effect fires on exactly
  // that render and immediately flips back to 'view', permanently — the new
  // id then arrives one render later with edit mode already undone.
  // newSetlistPendingRef marks that transient window so it's ignored once.
  useEffect(() => {
    if (!selectedId && editing) {
      if (newSetlistPendingRef.current) { newSetlistPendingRef.current = false; return; }
      setMode('view');
    }
  }, [selectedId, editing]);

  // ── Actions ───────────────────────────────────────────────────────────

  function rowFor(song) {
    const title = songTitle(song);
    return { id: song.id, lastKnownName: title, title };
  }

  function handleNew() {
    if (isDirty && !window.confirm('Start a new setlist? Unsaved changes will be lost.')) return;
    const id = uuid();
    loadedIdRef.current = id;
    newSetlistPendingRef.current = true;
    snapshotRef.current = { songs: [], name: 'New Setlist', vocalAssignments: {}, segues: {} };
    setSetlistSongs([]);
    setSetlistName('New Setlist');
    setVocalAssignments({});
    setSegues({});
    setMode('edit');
    setIsDirty(true);
    setLeftTab('library');
    setMobileEditTab('songs'); // nothing to reorder yet — start where the action is
    setSearchParams({ id }, { replace: false });
  }

  function handleDelete(id) {
    // Name the shows that will lose their link, so unlinking is never a surprise.
    const linked = allShows.filter(sh => sh.setlistId === id);
    const warning = linked.length
      ? `\n\nThis will also unlink it from ${linked.length === 1 ? 'this show' : 'these shows'}:\n` +
        linked.map(sh => `  • ${[sh.venue, sh.date].filter(Boolean).join(' — ') || sh.id}`).join('\n')
      : '';
    if (!window.confirm(`Delete this setlist?${warning}`)) return;
    deleteSetlist(id).then(() => {
      if (selectedId === id) {
        loadedIdRef.current = null;
        setSearchParams({}, { replace: true });
        setSetlistSongs([]);
        setSetlistName('');
        setMode('view');
        setIsDirty(false);
      }
    }).catch(err => alert('Delete failed: ' + err.message));
  }

  async function handleSave() {
    if (!setlistName.trim()) { alert('Setlist name is required.'); return; }
    setSaving(true);
    try {
      // On first save of a new setlist, swap the temp UUID for a name-based slug
      const isNew = !setlists.find(s => s.id === selectedId);
      const saveId = isNew
        ? makeUniqueSlug(setlistName, new Set(setlists.map(s => s.id)))
        : selectedId;
      await saveSetlist(saveId, setlistName, setlistSongs, { vocalAssignments, segues });
      snapshotRef.current = { songs: setlistSongs, name: setlistName, vocalAssignments, segues };
      setIsDirty(false);
      // Saving is the end of an editing session — drop straight back to the
      // clean read-only view rather than leaving edit chrome on screen.
      setMode('view');
      if (saveId !== selectedId) {
        loadedIdRef.current = saveId;
        setSearchParams({ id: saveId }, { replace: true });
      }
    } catch (err) { alert('Save failed: ' + err.message); }
    finally { setSaving(false); }
  }

  function handleCancelEdit() {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    const snap = snapshotRef.current;
    setSetlistSongs(snap.songs);
    setSetlistName(snap.name);
    setVocalAssignments(snap.vocalAssignments);
    setSegues(snap.segues);
    setIsDirty(false);
    setMode('view');
    setLeftTab('setlists');
  }

  function handleDuplicate() {
    const id = uuid();
    const name = `${setlistName} (Copy)`;
    loadedIdRef.current = id;
    // The copy carries the songs already in state; only the name changes. Cancel
    // leaves the copy on screen unsaved rather than blanking it.
    snapshotRef.current = { songs: setlistSongs, name, vocalAssignments, segues };
    setSetlistName(name);
    setIsDirty(true);
    setMode('edit');
    setMobileEditTab('setlist'); // songs already carried over — show them
    setMenuOpen(false);
    setSearchParams({ id }, { replace: false });
  }

  function removeFromSetlist(idx) {
    setSetlistSongs(prev => {
      const removed = prev[idx];
      const next = prev.filter((_, i) => i !== idx);
      // Drop the vocalist pick too, unless the song still appears elsewhere
      if (removed && !next.some(s => s.id === removed.id)) {
        setVocalAssignments(va => {
          if (!(removed.id in va)) return va;
          const copy = { ...va };
          delete copy[removed.id];
          return copy;
        });
        setSegues(sg => {
          if (!(removed.id in sg)) return sg;
          const copy = { ...sg };
          delete copy[removed.id];
          return copy;
        });
      }
      return next;
    });
    setIsDirty(true);
  }

  // Recompute every band-member vocal assignment from who's actually on the gig's
  // roster. Manually-cast guests are left alone.
  function handleAutoAssign() {
    if (!linkedShow) return;
    if (Object.keys(vocalAssignments).length > 0 && !window.confirm('Recompute singer assignments based on this gig\'s lineup? Existing picks (except guests) will be replaced.')) return;
    const present = new Set((linkedShow.personnel || []).map(p => members.idOf(p)));
    const leadIds = members.leadVocalists.map(m => m.id);
    const next = { ...vocalAssignments };
    let attempted = 0, assigned = 0, unresolved = 0, missingData = 0;
    for (const song of setlistSongs) {
      if (isSetMarker(song)) continue;
      const current = vocalistIds(next[song.id]);
      // Preserve manually-cast guests; band-member picks are recomputed.
      if (current.length > 0 && current.some(id => members.get(id).type === 'guest')) continue;
      const songDoc = songsById.get(song.id);
      if (!songDoc) continue;
      attempted++;
      if (!songDoc.preferredVocalist && !songDoc.vocalCapability) missingData++;
      const preferred = preferredVocalistId(songDoc, members);
      if (preferred && present.has(preferred)) { next[song.id] = [preferred]; assigned++; continue; }
      const capable = leadIds.filter(v => present.has(v) && hasCapability(songDoc, v, members));
      if (capable.length > 0) { next[song.id] = [capable[0]]; assigned++; }
      else { delete next[song.id]; unresolved++; }
    }
    setVocalAssignments(next);
    setIsDirty(true);

    // Auto-assign can legitimately compute "nothing changed" (no capability data yet,
    // no one on the roster, or every song already has a manual guest) — say so explicitly
    // instead of leaving it looking like the button did nothing.
    if (attempted === 0) {
      alert('Nothing to auto-assign — every song already has a manually-assigned guest vocalist.');
    } else if (missingData === attempted) {
      alert(`None of the ${attempted} song(s) in this setlist have vocalist capability data yet. Go to Songs → the mic icon above the song list to import the capability table, then try again.`);
    } else if (present.size === 0) {
      alert('Nobody is marked as playing this gig yet. Add personnel on the show first, then re-run Auto-Assign.');
    } else {
      alert(`Assigned ${assigned} song(s).${unresolved ? ` ${unresolved} song(s) have no available singer for this lineup — look for the amber warning icon.` : ' All songs covered.'}`);
    }
  }

  function handleApplyGenerated(result) {
    setSetlistSongs(result.rows);
    setVocalAssignments(result.vocalAssignments);
    setSegues({});
    setIsDirty(true);
    setAutoModalOpen(false);
    setMobileEditTab('setlist'); // show what got generated
    if (result.warnings.length) alert(result.warnings.join('\n'));
  }

  function openAutoSetlist() {
    if (setlistSongs.length && !window.confirm('Replace this setlist with a generated one? You can still cancel before saving.')) return;
    setAutoModalOpen(true);
  }

  // A song has no viable singer for this gig: linked to a show, nobody assigned yet,
  // and nobody present is marked capable of it.
  function hasNoAssignmentWarning(song, songDoc) {
    if (!linkedShow || vocalistIds(vocalAssignments[song.id]).length > 0) return false;
    const present = new Set((linkedShow.personnel || []).map(p => members.idOf(p)));
    return !members.leadVocalists.some(m => present.has(m.id) && hasCapability(songDoc, m.id, members));
  }

  // Closes the mobile fullscreen view, back to the setlists list.
  function closeMobileDetail() {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    setIsDirty(false);
    setSearchParams({}, { replace: true });
  }

  function handleShare() {
    setMenuOpen(false);
    const url = `${window.location.origin}/setlists?id=${selectedId}`;
    if (navigator.share) navigator.share({ title: setlistName, url });
    else navigator.clipboard.writeText(url).then(() => alert('Link copied!'));
  }

  function handleDownloadJson() {
    setMenuOpen(false);
    const data = { id: selectedId, name: setlistName, songs: setlistSongs, vocalAssignments, segues };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${setlistName.replace(/\s+/g, '-')}.json`;
    a.click();
  }

  // ── Library songs ──────────────────────────────────────────────────────
  const inSetlistIds = new Set(setlistSongs.map(s => s.id));
  const libFiltered = allSongs
    .filter(s => s.active !== false)
    .filter(s => {
      if (showSetMarkersOnly) return isSetMarker(s);
      const text = `${songTitle(s)} ${s.artist || ''}`.toLowerCase();
      return text.includes(libSearch.toLowerCase());
    })
    .sort((a, b) => libSort === 'plays'
      ? (popularity.get(b.id) || 0) - (popularity.get(a.id) || 0) || songTitle(a).localeCompare(songTitle(b))
      : songTitle(a).localeCompare(songTitle(b)));

  // Song library, to add into the setlist being edited. Desktop shows this
  // as a drag source next to the setlist; mobile shows it as its own
  // "Add Songs" tab with a tap-to-add button (see mobileEditTab).
  const libraryPanel = (
    <>
      <div className="shrink-0 p-3 border-b border-[#2a2a2a] space-y-2">
        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-xs pointer-events-none" />
          <input
            type="text"
            value={libSearch}
            onChange={e => setLibSearch(e.target.value)}
            placeholder="Search songs..."
            className="w-full pl-8 pr-3 min-h-[44px] bg-[#121212] border border-[#2a2a2a] rounded-xl text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#3b82f6]"
          />
        </div>
        <div className="flex gap-1 p-1 bg-[#121212] rounded-xl border border-[#2a2a2a]">
          {[['title', 'A–Z'], ['plays', 'Most played']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLibSort(key)}
              className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition-colors ${
                libSort === key ? 'bg-[#2a2a2a] text-white' : 'text-[#777] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-xs text-[#888] hover:text-white transition-colors min-h-[32px]">
          <input
            type="checkbox"
            checked={showSetMarkersOnly}
            onChange={e => setShowSetMarkersOnly(e.target.checked)}
            className="rounded w-4 h-4"
          />
          Set Markers only
        </label>
      </div>
      <div ref={libraryRef} className="flex-1 min-h-0 overflow-y-auto">
        {libFiltered.map(song => {
          const alreadyIn = inSetlistIds.has(song.id);
          const plays = popularity.get(song.id) || 0;
          return (
            <div
              key={song.id}
              data-id={song.id}
              className={`flex items-center gap-3 px-3 py-2.5 border-b border-[#2a2a2a] transition-colors ${
                alreadyIn ? 'opacity-40' : 'hover:bg-white/5 cursor-grab'
              }`}
            >
              <i className="fas fa-grip-vertical text-[#444] text-xs shrink-0" />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate ${isSetMarker(song) ? 'text-[#3b82f6]' : 'text-white'}`}>
                  {songTitle(song)}
                </div>
                {song.artist && !isSetMarker(song) && <div className="text-xs text-[#888] truncate">{song.artist}</div>}
              </div>
              {plays > 0 && !isSetMarker(song) && (
                <span className="shrink-0 text-[10px] text-[#666] font-mono" title={`In ${plays} setlist${plays !== 1 ? 's' : ''}`}>
                  ×{plays}
                </span>
              )}
              {!alreadyIn && (
                <button
                  onClick={() => {
                    setSetlistSongs(prev => [...prev, rowFor(song)]);
                    setIsDirty(true);
                  }}
                  className="shrink-0 w-11 h-11 flex items-center justify-center bg-[#1d4ed8]/20 border border-[#1d4ed8]/40 text-[#3b82f6] rounded-xl transition-colors hover:bg-[#1d4ed8]/40"
                  title="Add to setlist"
                >
                  <i className="fas fa-plus text-xs" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  // ── Left panel ────────────────────────────────────────────────────────
  // The mobile editor doesn't let you browse other setlists mid-edit (see
  // mobileEditTab) — editing there is a focused fullscreen task with its own
  // Setlist/Add Songs tabs — so this panel is always just the setlists list
  // on mobile, regardless of the editing state.
  const leftPanel = (
    <div className={isMobile
      ? 'flex-1 min-h-0 flex flex-col overflow-hidden bg-[#1a1a1a] text-left'
      : `admin-drawer flex flex-col overflow-hidden bg-[#1a1a1a] border-r border-[#2a2a2a] text-left${drawerOpen ? ' drawer-open' : ''}`
    }>
      {/* The song library is only useful while editing — in view mode the panel
          is just the list of setlists, with no tab bar to decide about. */}
      {editing && !isMobile ? (
        <div className="shrink-0 flex border-b border-[#2a2a2a]">
          {['setlists', 'library'].map(tab => (
            <button
              key={tab}
              onClick={() => setLeftTab(tab)}
              className={`flex-1 min-h-[44px] text-xs font-semibold uppercase tracking-wider transition-colors capitalize ${
                leftTab === tab
                  ? 'text-[#3b82f6] border-b-2 border-[#3b82f6]'
                  : 'text-[#888] hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      ) : (
        <div className="shrink-0 px-4 min-h-[44px] flex items-center border-b border-[#2a2a2a]">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#888]">Setlists</span>
        </div>
      )}

      {(!editing || leftTab === 'setlists' || isMobile) && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {setlists.length === 0 && (
              <div className="p-8 text-center text-[#555]">
                <i className="fas fa-list text-3xl mb-3 block opacity-20" />
                <p className="text-sm">No setlists yet</p>
              </div>
            )}
            {[...setlists].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map(sl => {
              const isActive = selectedId === sl.id;
              const count = sl.songs ? sl.songs.filter(s => !isSetMarker(s)).length : (sl.songCount ?? 0);
              return (
                <div
                  key={sl.id}
                  className={`flex items-stretch border-b border-[#2a2a2a] transition-colors ${
                    isActive ? 'bg-[#3b82f6]/10 border-l-2 border-l-[#3b82f6]' : 'hover:bg-white/5'
                  }`}
                >
                  <button
                    onClick={() => {
                      if (isDirty && selectedId !== sl.id && !window.confirm('Load different setlist? Unsaved changes will be lost.')) return;
                      setSearchParams({ id: sl.id }, { replace: false });
                      closeDrawer();
                    }}
                    className="flex-1 min-w-0 text-left px-4 py-3"
                  >
                    <div className="text-sm font-semibold text-white truncate">{sl.name}</div>
                    <div className="text-xs text-[#888] mt-0.5">
                      {count} songs
                      {sl.updatedAt && ` · ${new Date(sl.updatedAt).toLocaleDateString()}`}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDelete(sl.id)}
                    className="shrink-0 w-11 flex items-center justify-center text-[#555] hover:text-red-400 transition-colors"
                    title="Delete setlist"
                  >
                    <i className="fas fa-trash text-xs" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="shrink-0 p-3 border-t border-[#2a2a2a]">
            <button
              onClick={handleNew}
              className="w-full min-h-[44px] bg-[#1d4ed8]/20 border border-[#1d4ed8]/40 text-[#3b82f6] rounded-xl text-sm font-semibold hover:bg-[#1d4ed8]/30 transition-colors"
            >
              <i className="fas fa-plus mr-1.5" />New Setlist
            </button>
          </div>
        </>
      )}

      {editing && !isMobile && leftTab === 'library' && libraryPanel}
    </div>
  );

  // ── Right panel ────────────────────────────────────────────────────────
  const hasSetlist = !!selectedId;

  const rightPanel = (
    <div className={`relative flex-1 min-h-0 flex flex-col overflow-hidden text-left ${editing ? 'bg-[#141821]' : 'bg-[#121212]'}`}>
      {/* Edit mode gets an unmistakable banner across the top so there's never
          any doubt about which mode you're in. */}
      {hasSetlist && editing && (
        <div className="shrink-0 bg-[#1d4ed8] px-4 py-1.5 flex items-center gap-2">
          <i className="fas fa-pen-to-square text-white text-[11px]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-white">Editing</span>
          <span className="text-[11px] text-white/60">— drag to reorder, tap a singer to change</span>
        </div>
      )}

      {hasSetlist && (
        <div className={`shrink-0 px-4 py-3 border-b ${editing ? 'border-[#2b3348]' : 'border-[#2a2a2a]'}`}>
          <div className="flex items-center gap-2">
            {editing ? (
              <input
                type="text"
                value={setlistName}
                onChange={e => { setSetlistName(e.target.value); setIsDirty(true); }}
                placeholder="Setlist name"
                className="flex-1 min-w-0 px-3 min-h-[44px] bg-[#0f1218] border border-[#3b82f6]/50 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-[#3b82f6]"
              />
            ) : (
              <div className="flex-1 min-w-0 text-sm font-bold text-white truncate">{setlistName}</div>
            )}

            {!editing && (
              <div className="shrink-0 flex items-center gap-2">
                <button
                  onClick={() => { setMode('edit'); setLeftTab('library'); setMobileEditTab('setlist'); }}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-bold bg-[#1d4ed8] hover:bg-[#1e40af] text-white transition-colors flex items-center gap-2"
                >
                  <i className="fas fa-pen-to-square" />
                  Edit
                </button>
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(o => !o)}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-[#888] hover:text-white hover:bg-white/5 transition-colors"
                    title="More actions"
                  >
                    <i className="fas fa-ellipsis-vertical" />
                  </button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-40 w-52 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl overflow-hidden">
                        <MenuItem icon="fa-share-nodes" label="Share link" onClick={handleShare} />
                        <MenuItem icon="fa-download" label="Download JSON" onClick={handleDownloadJson} />
                        <MenuItem icon="fa-copy" label="Duplicate" onClick={handleDuplicate} />
                        <MenuItem icon="fa-trash" label="Delete" danger onClick={() => { setMenuOpen(false); handleDelete(selectedId); }} />
                      </div>
                    </>
                  )}
                </div>
                {isMobile && (
                  <button
                    onClick={closeMobileDetail}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-[#888] hover:text-white hover:bg-white/5 transition-colors"
                    title="Close"
                  >
                    <i className="fas fa-times" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Edit-mode tools sit on their own row at a fixed size, so nothing
              reflows when a setlist gains or loses its linked show. */}
          {editing && (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={openAutoSetlist}
                className="min-h-[44px] px-3 rounded-xl text-xs font-bold bg-[#3b82f6]/15 border border-[#3b82f6]/40 text-[#3b82f6] hover:bg-[#3b82f6]/25 transition-colors flex items-center gap-2"
              >
                <i className="fas fa-wand-magic-sparkles" />
                Auto Setlist
              </button>
              <button
                onClick={handleAutoAssign}
                disabled={!linkedShow}
                title={linkedShow ? 'Recompute singers from this gig\'s lineup' : 'Link this setlist to a show to auto-assign singers'}
                className="min-h-[44px] px-3 rounded-xl text-xs font-bold bg-white/5 border border-[#2b3348] text-[#ccc] hover:bg-white/10 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className="fas fa-users" />
                Auto Assign
              </button>
            </div>
          )}

          {linkedShow && (
            <>
              <Link to={`/shows?show=${linkedShow.id}`} className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-[#888] hover:text-[#3b82f6] transition-colors">
                <i className="fas fa-calendar-days" />
                {[linkedShow.venue, linkedShow.date].filter(Boolean).join(' — ') || 'Linked show'}
              </Link>

              {/* Who's actually on this gig. Auto Assign and Auto Setlist both
                  work from exactly this list, so it needs to be visible. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-[#666]">On this gig</span>
                {gigPersonnel.length === 0 ? (
                  <span className="text-[11px] text-amber-400/90">
                    <i className="fas fa-triangle-exclamation mr-1 text-[10px]" />
                    nobody assigned yet — add personnel on the show
                  </span>
                ) : gigPersonnel.map(m => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}35` }}
                    title={m.canSingLead ? `${m.name} — can sing lead` : m.name}
                  >
                    <MemberAvatar name={m.name} photoUrl={m.avatarUrl} color={m.color} size={16} />
                    {m.name}
                    {m.canSingLead && <i className="fas fa-microphone text-[8px] opacity-70" />}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Body */}
      <div className={`flex-1 min-h-0 overflow-y-auto ${editing ? 'pb-24' : ''}`}>
        {!hasSetlist && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-base font-bold mb-5" style={{ color: '#3b82f6' }}>Setlists</p>
              <i className="fas fa-list text-5xl mb-4 block opacity-20 text-[#555]" />
              <p className="text-sm text-[#555]">Select or create a setlist</p>
              <button onClick={handleNew} className="mt-4 min-h-[44px] px-4 rounded-xl text-sm font-semibold transition-colors" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: '#3b82f6' }}>
                <i className="fas fa-plus mr-1.5" />New Setlist
              </button>
            </div>
          </div>
        )}

        {hasSetlist && setlistSongs.length === 0 && (
          <div className="h-full flex items-center justify-center text-[#555]">
            <div className="text-center px-6">
              <i className="fas fa-music text-4xl mb-3 block opacity-20" />
              <p className="text-sm">
                {editing
                  ? (isMobile ? 'Tap Add Songs, or build one automatically' : 'Drag songs in from the library, or build one automatically')
                  : 'This setlist is empty'}
              </p>
              {editing && (
                <button
                  onClick={openAutoSetlist}
                  className="mt-4 min-h-[44px] px-5 rounded-xl text-sm font-bold bg-[#1d4ed8] hover:bg-[#1e40af] text-white transition-colors inline-flex items-center gap-2"
                >
                  <i className="fas fa-wand-magic-sparkles" />
                  Auto Setlist
                </button>
              )}
            </div>
          </div>
        )}

        {/* Read-only view — identical rendering to the public share link */}
        {hasSetlist && !editing && setlistSongs.length > 0 && (
          <SetlistRows
            songs={setlistSongs}
            songsById={songsById}
            vocalAssignments={vocalAssignments}
            segues={segues}
            members={members}
            linkTo={song => `/songs?id=${song.id}&back=${encodeURIComponent(`/setlists?id=${selectedId}`)}`}
            warnFor={hasNoAssignmentWarning}
          />
        )}

        {/* Editable rows */}
        <div ref={setlistRef} className={editing ? 'min-h-[2px]' : 'hidden'}>
          {editing && setlistSongs.map((song, idx) => {
            const marker = isSetMarker(song);
            const vocalists = vocalistIds(vocalAssignments[song.id]).map(id => members.get(id));
            const { shown: shownVocalists, overflow } = capVocalists(vocalists, isMobile);
            const doc = songsById.get(song.id);
            const tuning = doc ? tuningOf(doc) : 'Standard';

            if (marker) {
              return (
                <div
                  key={`${song.id}-${idx}`}
                  data-id={song.id}
                  className="flex items-center gap-2 px-3 py-2 border-b border-[#2b3348] bg-[#1b2130]"
                >
                  <i className="drag-handle fas fa-grip-vertical text-[#4a5570] cursor-grab text-sm w-8 text-center" />
                  <span className="flex-1 text-sm font-bold text-[#8fa3c8] uppercase tracking-wide">
                    {cleanSetName(songTitle(song))}
                  </span>
                  <button onClick={() => removeFromSetlist(idx)} className="w-11 h-11 flex items-center justify-center text-[#555] hover:text-red-400 transition-colors rounded-lg" title="Remove">
                    <i className="fas fa-times text-sm" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={`${song.id}-${idx}`}
                data-id={song.id}
                className="flex items-center gap-2 px-3 py-1.5 border-b border-[#232a38] hover:bg-white/5"
              >
                <i className="drag-handle fas fa-grip-vertical text-[#4a5570] cursor-grab text-sm w-8 text-center shrink-0" />

                <span className="flex-1 min-w-0 text-sm text-white truncate font-medium">
                  {songTitle(song)}
                </span>

                <div className="shrink-0 flex items-center gap-1.5">
                  {tuning !== 'Standard' && <TinyBadge color="#a78bfa">{tuning}</TinyBadge>}
                  {doc?.capo > 0 && <TinyBadge color="#f59e0b">Capo {doc.capo}</TinyBadge>}
                  {segues[song.id] && <TinyBadge color="#3b82f6">~</TinyBadge>}
                </div>

                <button
                  onClick={() => setPropsModalSong({ song, idx })}
                  className="shrink-0 min-w-11 h-11 flex items-center justify-center gap-1 rounded-xl hover:bg-white/10 transition-colors px-1"
                  title={vocalists.length ? `Vocalists: ${vocalists.map(v => v.name).join(', ')} — tap to change` : 'No vocalist assigned — tap to assign'}
                >
                  {vocalists.length > 0 ? (
                    <div className="flex items-center -space-x-1.5">
                      {shownVocalists.map(v => (
                        <MemberAvatar key={v.id} name={v.name} color={v.color} size={26} className="ring-2 ring-[#141821]" />
                      ))}
                      {overflow > 0 && (
                        <span
                          className="rounded-full flex items-center justify-center font-bold ring-2 ring-[#141821]"
                          style={{ width: 26, height: 26, fontSize: 10, background: '#2a2a2a', color: '#aaa' }}
                        >
                          +{overflow}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="w-[26px] h-[26px] flex items-center justify-center rounded-full bg-amber-400/15 border border-amber-400/50">
                      <i className="fas fa-triangle-exclamation text-amber-400 text-[10px]" />
                    </span>
                  )}
                </button>

                <button
                  onClick={() => removeFromSetlist(idx)}
                  className="shrink-0 w-11 h-11 flex items-center justify-center text-[#555] hover:text-red-400 transition-colors rounded-lg"
                  title="Remove"
                >
                  <i className="fas fa-times text-sm" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats footer — hidden in edit mode, where the action bar takes the space */}
      {hasSetlist && !editing && setlistSongs.length > 0 && (
        <div className="shrink-0 px-4 py-2.5 border-t border-[#2a2a2a] bg-[#1a1a1a]">
          <span className="text-xs text-[#888] font-mono">{summarizeSetlist(setlistSongs, songsById)}</span>
        </div>
      )}

      {/* Fixed edit action bar — same two buttons in the same places, always */}
      {hasSetlist && editing && (
        <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-[#2b3348] bg-[#0f1218]/95 backdrop-blur px-4 py-3 flex items-center gap-3">
          <button
            onClick={handleCancelEdit}
            className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-[#aaa] hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <span className="flex-1 min-w-0 text-[11px] text-[#7d8aa5] font-mono truncate">
            {isDirty ? 'Unsaved changes' : 'No changes'}
            {setlistSongs.length > 0 && ` · ${summarizeSetlist(setlistSongs, songsById)}`}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="min-h-[44px] w-[7.5rem] shrink-0 justify-center rounded-xl text-sm font-bold bg-[#1d4ed8] hover:bg-[#1e40af] text-white transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {saving
              ? <><i className="fas fa-spinner fa-spin" /> Saving</>
              : <><i className="fas fa-floppy-disk" /> Save</>}
          </button>
        </div>
      )}
    </div>
  );

  const setlistSongCount = setlistSongs.filter(s => !isSetMarker(s)).length;

  return (
    <AdminShell activeApp="setlists" hideDrawerToggle={isMobile}>
      {isMobile ? (
        <>
          {/* Mobile: the setlist list is the primary view */}
          {leftPanel}
          {/* Fullscreen "L2" view/edit — closed with the X (view) or Cancel/Save (edit) */}
          {hasSetlist && (
            <div className="fixed inset-0 z-50 bg-[#121212] flex flex-col">
              {editing && (
                <div className="shrink-0 flex border-b border-[#2b3348] bg-[#141821]">
                  <button
                    onClick={() => setMobileEditTab('setlist')}
                    className={`flex-1 min-h-[44px] text-xs font-semibold uppercase tracking-wider transition-colors ${
                      mobileEditTab === 'setlist' ? 'text-[#3b82f6] border-b-2 border-[#3b82f6]' : 'text-[#888] hover:text-white'
                    }`}
                  >
                    Setlist{setlistSongCount > 0 ? ` (${setlistSongCount})` : ''}
                  </button>
                  <button
                    onClick={() => setMobileEditTab('songs')}
                    className={`flex-1 min-h-[44px] text-xs font-semibold uppercase tracking-wider transition-colors ${
                      mobileEditTab === 'songs' ? 'text-[#3b82f6] border-b-2 border-[#3b82f6]' : 'text-[#888] hover:text-white'
                    }`}
                  >
                    Add Songs
                  </button>
                </div>
              )}

              {/* Kept mounted (just hidden) rather than conditionally rendered while
                  editing, so the Sortable.js drag-reorder instance below never has
                  to be torn down and recreated as the tabs switch. */}
              <div className={editing && mobileEditTab !== 'setlist' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                {rightPanel}
              </div>

              {editing && (
                <div className={mobileEditTab !== 'songs' ? 'hidden' : 'flex-1 min-h-0 flex flex-col overflow-hidden bg-[#1a1a1a]'}>
                  {libraryPanel}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Desktop: two-column layout, library and setlist side by side while editing */
        <div className="admin-page-grid flex-1 min-h-0 grid overflow-hidden">
          {leftPanel}
          {rightPanel}
        </div>
      )}

      {propsModalSong && (
        <SongPropertiesModal
          song={propsModalSong.song}
          vocalAssignments={vocalAssignments}
          segues={segues}
          members={members}
          guestOptions={(linkedShow?.personnel || []).filter(p => members.get(p).type === 'guest')}
          onSaveLocal={(songId, { vocalists, segue }) => {
            setVocalAssignments(prev => {
              const next = { ...prev };
              if (vocalists.length) next[songId] = vocalists;
              else delete next[songId];
              return next;
            });
            setSegues(prev => {
              const next = { ...prev };
              if (segue) next[songId] = true;
              else delete next[songId];
              return next;
            });
            setIsDirty(true);
          }}
          onClose={() => setPropsModalSong(null)}
        />
      )}

      {autoModalOpen && (
        <AutoSetlistModal
          songs={allSongs}
          popularity={popularity}
          guestOptions={(linkedShow?.personnel || []).filter(p => members.get(p).type === 'guest')}
          showPersonnel={gigPersonnel.map(m => m.id)}
          showLabel={linkedShow ? ([linkedShow.venue, linkedShow.date].filter(Boolean).join(' — ') || 'this gig') : ''}
          onApply={handleApplyGenerated}
          onClose={() => setAutoModalOpen(false)}
        />
      )}

      <style>{`
        .sortable-ghost { opacity: 0.3; background: #3b82f620 !important; }
      `}</style>
    </AdminShell>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────
function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full min-h-[44px] px-4 flex items-center gap-3 text-sm font-medium transition-colors ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-[#ccc] hover:bg-white/5 hover:text-white'
      }`}
    >
      <i className={`fas ${icon} w-4 text-center text-xs`} />
      {label}
    </button>
  );
}

function TinyBadge({ children, color }) {
  return (
    <span
      className="text-[9px] font-semibold px-1 py-0.5 rounded"
      style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}
    >
      {children}
    </span>
  );
}

// ── Song Properties Modal ─────────────────────────────────────────────────
// Capo/tuning are global song properties, edited on the Songs page — this
// modal only handles what's specific to this one setlist: who's singing it
// and whether it segues into the next song.
function SongPropertiesModal({ song, vocalAssignments, segues, guestOptions = [], members, onSaveLocal, onClose }) {
  // Existing data may hold legacy names or a single id; normalise to ids so selection matches.
  const [vocalists, setVocalists] = useState(
    vocalistIds(vocalAssignments[song.id]).map(id => members.idOf(id)));
  const [segue, setSegue] = useState(!!segues[song.id]);

  function toggleVocalist(id) {
    setVocalists(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  }

  function handleSave() {
    onSaveLocal(song.id, { vocalists, segue });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] w-full max-w-sm rounded-2xl shadow-2xl border border-[#2a2a2a] overflow-hidden text-left">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[#2a2a2a]">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{songTitle(song)}</p>
            <p className="text-[10px] text-[#888] uppercase tracking-wide mt-0.5">Song Properties</p>
          </div>
          <button onClick={onClose} className="shrink-0 w-11 h-11 flex items-center justify-center text-[#888] hover:text-white rounded-lg"><i className="fas fa-times" /></button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-wider font-semibold mb-2">Vocalists (this setlist)</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setVocalists([])}
                disabled={vocalists.length === 0}
                className="min-h-[44px] px-3 rounded-xl text-xs font-semibold transition-colors text-[#888] hover:text-white hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Clear
              </button>
              {[...members.bandMembers.map(m => m.id), ...guestOptions.map(g => members.idOf(g))]
                .filter((id, i, arr) => arr.indexOf(id) === i)
                .map(id => {
                  const m = members.get(id);
                  const isActive = vocalists.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggleVocalist(id)}
                      className="min-h-[44px] flex items-center gap-1.5 px-2.5 rounded-xl text-xs font-semibold transition-all"
                      style={isActive
                        ? { background: `${m.color}30`, color: m.color, border: `1px solid ${m.color}60` }
                        : { color: '#888', border: '1px solid transparent' }
                      }
                    >
                      <MemberAvatar name={m.name} color={m.color} size={22} />
                      {m.name}
                      {isActive && <i className="fas fa-check text-[10px]" />}
                    </button>
                  );
                })}
            </div>
            {guestOptions.length === 0 && (
              <p className="text-[10px] text-[#555] mt-1.5">Add guest musicians on this gig's show to offer them here.</p>
            )}
          </div>

          <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
            <div
              onClick={() => setSegue(v => !v)}
              className={`w-12 h-7 rounded-full transition-colors flex items-center cursor-pointer ${segue ? 'bg-[#1d4ed8]' : 'bg-[#2a2a2a]'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-1 ${segue ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
            <span className="text-sm text-[#ccc]">Segue into next song</span>
          </label>
        </div>

        <div className="border-t border-[#2a2a2a] px-5 py-3 flex gap-3 justify-end">
          <button onClick={onClose} className="min-h-[44px] px-4 bg-[#2a2a2a] rounded-xl text-white hover:bg-[#333] text-sm font-semibold transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="min-h-[44px] px-5 bg-[#1d4ed8] hover:bg-[#1e40af] text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
