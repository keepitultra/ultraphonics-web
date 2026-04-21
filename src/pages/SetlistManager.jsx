import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import Sortable from 'sortablejs';
import AdminShell, { useAdminDrawer } from '../components/admin/AdminShell.jsx';
import { useAuth } from '../firebase/AuthContext.jsx';
import { useSetlists, useSongs } from '../firebase/useFirestore.js';
import { saveSetlist, deleteSetlist, updateSong } from '../firestore-service.js';

// ── Constants ─────────────────────────────────────────────────────────────
const VOCALISTS = ['Anthony', 'Tom', 'Lester', 'David', 'Shelley', 'Kelsey'];
const VOCALIST_COLORS = {
  Anthony: '#f59e0b', Tom: '#22c55e', Lester: '#a78bfa',
  David: '#e879f9', Shelley: '#fb923c', Kelsey: '#38bdf8',
};

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function isSetMarker(song) {
  return /^Set\s*\d/i.test(song.title || song.lastKnownName || '');
}

// Compute stats: "Set 1 (8) • Set 2 (9)"
function generateStats(songs) {
  const sections = [];
  let current = null;
  for (const s of songs) {
    if (isSetMarker(s)) {
      if (current) sections.push(current);
      current = { name: s.title || s.lastKnownName, count: 0 };
    } else if (current) {
      current.count++;
    }
  }
  if (current) sections.push(current);
  if (!sections.length) {
    const total = songs.filter(s => !isSetMarker(s)).length;
    return total ? `${total} song${total !== 1 ? 's' : ''}` : '';
  }
  return sections.map(s => `${s.name} (${s.count})`).join(' \u2022 ');
}

// ── Main component ────────────────────────────────────────────────────────
export default function SetlistManager() {
  const { user } = useAuth();
  const { data: setlists = [] } = useSetlists();
  const { open: drawerOpen, close: closeDrawer } = useAdminDrawer();
  const { data: allSongs = [] } = useSongs();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedId = searchParams.get('id');
  const triggerNew = searchParams.get('new') === '1';

  // Setlist state
  const [setlistSongs, setSetlistSongs] = useState(/** @type {any[]} */ ([]));
  const [setlistName, setSetlistName] = useState('');
  const [vocalAssignments, setVocalAssignments] = useState({});
  const [segues, setSegues] = useState({});
  const [viewMode, setViewMode] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef(null);

  // Left panel
  const [leftTab, setLeftTab] = useState('setlists');
  const [libSearch, setLibSearch] = useState('');
  const [showSetMarkersOnly, setShowSetMarkersOnly] = useState(false);

  // Song properties modal
  const [propsModalSong, setPropsModalSong] = useState(null);

  // Mobile layout
  const [mobileTab, setMobileTab] = useState('library'); // library | setlist

  // Drag refs
  const libraryRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const setlistRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const librarySortable = useRef(/** @type {import('sortablejs') | null} */ (null));
  const setlistSortable = useRef(/** @type {import('sortablejs') | null} */ (null));
  const setlistSongsRef = useRef(setlistSongs);
  useEffect(() => { setlistSongsRef.current = setlistSongs; }, [setlistSongs]);
  const viewModeRef = useRef(viewMode);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  const allSongsRef = useRef(allSongs);
  useEffect(() => { allSongsRef.current = allSongs; }, [allSongs]);

  // Load setlist when selectedId changes
  const selected = setlists.find(s => s.id === selectedId);
  useEffect(() => {
    if (!selected) return;
    if (isDirty && !window.confirm('Load a new setlist? Unsaved changes will be lost.')) return;
    setSetlistSongs(selected.songs || []);
    setSetlistName(selected.name || '');
    setVocalAssignments(selected.vocalAssignments || {});
    setSegues(selected.segues || {});
    setViewMode(true);
    setIsDirty(false);
  }, [selectedId]);

  // Trigger new setlist from Quick Launch
  useEffect(() => {
    if (triggerNew) {
      handleNew();
    }
  }, []);

  // beforeunload
  useEffect(() => {
    const handler = e => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Setlist sortable — always init when setlistRef mounts
  useEffect(() => {
    if (!setlistRef.current) return;
    if (setlistSortable.current?.el) setlistSortable.current.destroy();
    setlistSortable.current = null;
    setlistSortable.current = Sortable.create(setlistRef.current, {
      group: 'songs',
      animation: 150,
      handle: '.drag-handle',
      delay: 200,
      delayOnTouchOnly: true,
      disabled: viewModeRef.current,
      ghostClass: 'sortable-ghost',
      onAdd(evt) {
        const songId = evt.item.dataset.id;
        evt.item.remove();
        const song = allSongsRef.current.find(s => s.id === songId);
        if (!song) return;
        const newIndex = evt.newIndex ?? 0;
        setSetlistSongs(prev => {
          const next = [...prev];
          next.splice(newIndex, 0, { id: song.id, lastKnownName: song.title || song.name || '', title: song.title || song.name || '' });
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
  }, [viewMode]);

  // Library sortable — only init when library tab is mounted
  useEffect(() => {
    if (!libraryRef.current) return;
    if (librarySortable.current?.el) librarySortable.current.destroy();
    librarySortable.current = null;
    librarySortable.current = Sortable.create(libraryRef.current, {
      group: { name: 'songs', pull: 'clone', put: false },
      sort: false,
      delay: 200,
      delayOnTouchOnly: true,
      animation: 0,
    });
    return () => { if (librarySortable.current?.el) librarySortable.current.destroy(); librarySortable.current = null; };
  }, [leftTab]);

  // Update sortable disabled state when viewMode changes
  useEffect(() => {
    setlistSortable.current?.option('disabled', viewMode);
  }, [viewMode]);

  // ── Actions ───────────────────────────────────────────────────────────

  function handleNew() {
    if (isDirty && !window.confirm('Start a new setlist? Unsaved changes will be lost.')) return;
    const id = uuid();
    setSetlistSongs([]);
    setSetlistName('New Setlist');
    setVocalAssignments({});
    setSegues({});
    setViewMode(false);
    setIsDirty(true);
    setSearchParams({ id }, { replace: false });
  }

  function handleDelete(id) {
    if (!window.confirm('Delete this setlist?')) return;
    deleteSetlist(id).then(() => {
      if (selectedId === id) {
        setSearchParams({}, { replace: true });
        setSetlistSongs([]);
        setSetlistName('');
        setIsDirty(false);
      }
    }).catch(err => alert('Delete failed: ' + err.message));
  }

  async function handleSave() {
    if (!setlistName.trim()) { alert('Setlist name is required.'); return; }
    setSaving(true);
    try {
      await saveSetlist(selectedId, setlistName, setlistSongs, { vocalAssignments, segues });
      setIsDirty(false);
    } catch (err) { alert('Save failed: ' + err.message); }
    finally { setSaving(false); }
  }

  function handleDuplicate() {
    const id = uuid();
    const name = `${setlistName} (Copy)`;
    setSetlistSongs([...setlistSongs]);
    setSetlistName(name);
    setVocalAssignments({ ...vocalAssignments });
    setSegues({ ...segues });
    setIsDirty(true);
    setSearchParams({ id }, { replace: false });
  }

  function removeFromSetlist(idx) {
    setSetlistSongs(prev => prev.filter((_, i) => i !== idx));
    setIsDirty(true);
  }

  function handleShare() {
    const url = `${window.location.origin}/setlists?id=${selectedId}`;
    if (navigator.share) {
      navigator.share({ title: setlistName, url });
    } else {
      navigator.clipboard.writeText(url).then(() => alert('Link copied!'));
    }
  }

  function handleDownloadJson() {
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
      const text = `${s.title || s.name || ''} ${s.artist || ''}`.toLowerCase();
      return text.includes(libSearch.toLowerCase());
    })
    .sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));

  // ── Left panel ────────────────────────────────────────────────────────
  const leftPanel = (
    <div className={`admin-drawer flex flex-col overflow-hidden bg-[#1a1a1a] border-r border-[#2a2a2a]${drawerOpen ? ' drawer-open' : ''}`}>
      {/* Sub-tabs */}
      <div className="shrink-0 flex border-b border-[#2a2a2a]">
        {['setlists', 'library'].map(tab => (
          <button
            key={tab}
            onClick={() => setLeftTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors capitalize ${
              leftTab === tab
                ? 'text-[#00ddde] border-b-2 border-[#00ddde]'
                : 'text-[#888] hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Setlists sub-tab */}
      {leftTab === 'setlists' && (
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
              return (
                <button
                  key={sl.id}
                  onClick={() => {
                    if (isDirty && selectedId !== sl.id && !window.confirm('Load different setlist? Unsaved changes will be lost.')) return;
                    setSearchParams({ id: sl.id }, { replace: false });
                    closeDrawer();
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-[#2a2a2a] transition-colors ${
                    isActive
                      ? 'bg-[#00ddde]/10 border-l-2 border-l-[#00ddde]'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{sl.name}</div>
                      <div className="text-xs text-[#888] mt-0.5">
                        {sl.songCount ?? (sl.songs || []).filter(s => !isSetMarker(s)).length} songs
                        {sl.updatedAt && ` · ${new Date(sl.updatedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    {user && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(sl.id); }}
                        className="shrink-0 p-1.5 text-[#555] hover:text-red-400 transition-colors rounded"
                      >
                        <i className="fas fa-trash text-xs" />
                      </button>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {user && (
            <div className="shrink-0 p-3 border-t border-[#2a2a2a]">
              <button
                onClick={handleNew}
                className="w-full py-2 bg-[#008c8d]/20 border border-[#008c8d]/40 text-[#00ddde] rounded-lg text-sm font-semibold hover:bg-[#008c8d]/30 transition-colors"
              >
                <i className="fas fa-plus mr-1.5" />New Setlist
              </button>
            </div>
          )}
        </>
      )}

      {/* Library sub-tab */}
      {leftTab === 'library' && (
        <>
          <div className="shrink-0 p-3 border-b border-[#2a2a2a] space-y-2">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-xs pointer-events-none" />
              <input
                type="text"
                value={libSearch}
                onChange={e => setLibSearch(e.target.value)}
                placeholder="Search songs..."
                className="w-full pl-8 pr-3 py-2 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#00ddde]"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#888] hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={showSetMarkersOnly}
                onChange={e => setShowSetMarkersOnly(e.target.checked)}
                className="rounded"
              />
              Set Markers only
            </label>
          </div>
          <div ref={libraryRef} className="flex-1 min-h-0 overflow-y-auto">
            {libFiltered.map(song => {
              const alreadyIn = inSetlistIds.has(song.id);
              return (
                <div
                  key={song.id}
                  data-id={song.id}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-[#2a2a2a] transition-colors ${
                    alreadyIn ? 'opacity-40' : 'hover:bg-white/5 cursor-grab'
                  }`}
                >
                  {!viewMode && (
                    <i className="fas fa-grip-vertical text-[#444] text-xs shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${isSetMarker(song) ? 'text-[#00ddde]' : 'text-white'}`}>
                      {song.title || song.name}
                    </div>
                    {song.artist && !isSetMarker(song) && <div className="text-xs text-[#888] truncate">{song.artist}</div>}
                  </div>
                  {user && !viewMode && !alreadyIn && (
                    <button
                      onClick={() => {
                        setSetlistSongs(prev => [...prev, { id: song.id, lastKnownName: song.title || song.name || '', title: song.title || song.name || '' }]);
                        setIsDirty(true);
                      }}
                      className="shrink-0 w-6 h-6 flex items-center justify-center bg-[#008c8d]/20 border border-[#008c8d]/40 text-[#00ddde] rounded transition-colors hover:bg-[#008c8d]/40"
                    >
                      <i className="fas fa-plus text-[10px]" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // ── Right panel (setlist builder) ──────────────────────────────────────
  const stats = generateStats(setlistSongs);
  const hasSetlist = !!selectedId;

  const rightPanel = (
    <div className="flex flex-col overflow-hidden bg-[#121212]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[#2a2a2a] flex items-center gap-2">
        {/* Name */}
        {editingName && user ? (
          <input
            ref={nameInputRef}
            type="text"
            value={setlistName}
            onChange={e => { setSetlistName(e.target.value); setIsDirty(true); }}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditingName(false); }}
            className="flex-1 px-2 py-1 bg-[#1a1a1a] border border-[#00ddde] rounded text-white text-sm font-bold focus:outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => { if (user && !viewMode) { setEditingName(true); } }}
            className={`flex-1 text-left text-sm font-bold text-white truncate ${user && !viewMode ? 'hover:text-[#00ddde] cursor-text' : 'cursor-default'}`}
            title={user && !viewMode ? 'Click to rename' : ''}
          >
            {setlistName || <span className="text-[#555] font-normal">No setlist selected</span>}
            {user && !viewMode && setlistName && <i className="fas fa-pen text-[10px] text-[#555] ml-2" />}
          </button>
        )}

        {hasSetlist && (
          <div className="shrink-0 flex items-center gap-1">
            <IconBtn onClick={handleShare} icon="fa-share-nodes" title="Share" />
            <IconBtn onClick={handleDownloadJson} icon="fa-download" title="Download JSON" />
            {user && (
              <>
                <IconBtn
                  onClick={() => { setViewMode(v => !v); }}
                  icon={viewMode ? 'fa-pen-to-square' : 'fa-eye'}
                  title={viewMode ? 'Switch to Edit' : 'Switch to View'}
                  active={!viewMode}
                />
                {!viewMode && (
                  <>
                    <IconBtn onClick={handleDuplicate} icon="fa-copy" title="Duplicate" />
                    <button
                      onClick={handleSave}
                      disabled={saving || !isDirty}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                        isDirty
                          ? 'bg-[#008c8d] hover:bg-[#00a8a9] text-white'
                          : 'bg-[#2a2a2a] text-[#555] cursor-not-allowed'
                      } disabled:opacity-50`}
                    >
                      {saving
                        ? <><i className="fas fa-spinner fa-spin" /> Saving</>
                        : <><i className="fas fa-floppy-disk" /> Save{isDirty ? '*' : ''}</>
                      }
                    </button>
                    <IconBtn onClick={handleNew} icon="fa-plus" title="New Setlist" />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Setlist body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!hasSetlist && (
          <div className="h-full flex items-center justify-center text-[#555]">
            <div className="text-center">
              <i className="fas fa-list text-5xl mb-4 block opacity-20" />
              <p className="text-sm">Select or create a setlist</p>
              {user && (
                <button onClick={handleNew} className="mt-4 px-4 py-2 bg-[#008c8d]/20 border border-[#008c8d]/40 text-[#00ddde] rounded-lg text-sm font-semibold hover:bg-[#008c8d]/30 transition-colors">
                  <i className="fas fa-plus mr-1.5" />New Setlist
                </button>
              )}
            </div>
          </div>
        )}

        {hasSetlist && setlistSongs.length === 0 && (
          <div className="h-full flex items-center justify-center text-[#555]">
            <div className="text-center">
              <i className="fas fa-music text-4xl mb-3 block opacity-20" />
              <p className="text-sm">{viewMode ? 'This setlist is empty' : 'Drag songs here or tap + in the library'}</p>
            </div>
          </div>
        )}

        <div ref={setlistRef} className="min-h-[2px]">
          {setlistSongs.map((song, idx) => {
            const marker = isSetMarker(song);
            const vocalist = vocalAssignments[song.id];
            const vocalistColor = VOCALIST_COLORS[vocalist];
            const hasSegue = segues[song.id];

            if (marker) {
              return (
                <div
                  key={`${song.id}-${idx}`}
                  data-id={song.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-[#2a2a2a] bg-[#1a1a1a] border-l-2 border-l-[#00ddde]"
                >
                  {!viewMode && (
                    <i className="drag-handle fas fa-grip-vertical text-[#444] cursor-grab text-sm" />
                  )}
                  <span className="flex-1 text-sm font-bold text-[#00ddde] uppercase tracking-wide">
                    {song.title || song.lastKnownName}
                  </span>
                  {!viewMode && user && (
                    <button onClick={() => removeFromSetlist(idx)} className="p-1.5 text-[#555] hover:text-red-400 transition-colors rounded">
                      <i className="fas fa-times text-xs" />
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div
                key={`${song.id}-${idx}`}
                data-id={song.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-[#2a2a2a] hover:bg-white/5 group"
              >
                {!viewMode && (
                  <i className="drag-handle fas fa-grip-vertical text-[#444] cursor-grab text-sm shrink-0" />
                )}

                {viewMode ? (
                  <Link
                    to={`/songs?id=${song.id}&back=${encodeURIComponent(`/setlists?id=${selectedId}`)}`}
                    className="flex-1 min-w-0 text-sm text-white hover:text-[#00ddde] transition-colors truncate font-medium"
                  >
                    {song.title || song.lastKnownName}
                  </Link>
                ) : (
                  <span className="flex-1 min-w-0 text-sm text-white truncate font-medium">
                    {song.title || song.lastKnownName}
                  </span>
                )}

                {/* Indicators */}
                <div className="shrink-0 flex items-center gap-1.5">
                  {vocalist && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${vocalistColor}20`, color: vocalistColor, border: `1px solid ${vocalistColor}40` }}
                    >
                      {vocalist[0]}
                    </span>
                  )}
                  {/* Find song in allSongs for badges */}
                  {(() => {
                    const s = allSongs.find(x => x.id === song.id);
                    if (!s) return null;
                    return (
                      <>
                        {s.eflat && <TinyBadge color="#a78bfa">Eb</TinyBadge>}
                        {s.dropD && <TinyBadge color="#818cf8">Drop</TinyBadge>}
                        {s.capo > 0 && <TinyBadge color="#f59e0b">Capo {s.capo}</TinyBadge>}
                      </>
                    );
                  })()}
                  {hasSegue && <TinyBadge color="#00ddde">~</TinyBadge>}
                </div>

                {!viewMode && user && (
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => setPropsModalSong({ song, idx })}
                      className="p-1.5 text-[#555] hover:text-white transition-colors rounded"
                      title="Song properties"
                    >
                      <i className="fas fa-pen text-xs" />
                    </button>
                    <button
                      onClick={() => removeFromSetlist(idx)}
                      className="p-1.5 text-[#555] hover:text-red-400 transition-colors rounded"
                      title="Remove"
                    >
                      <i className="fas fa-times text-xs" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats footer */}
      {hasSetlist && setlistSongs.length > 0 && (
        <div className="shrink-0 px-4 py-2 border-t border-[#2a2a2a] bg-[#1a1a1a]">
          <span className="text-xs text-[#888] font-mono">{stats}</span>
        </div>
      )}
    </div>
  );

  return (
    <AdminShell activeApp="setlists">
      {/* Desktop two-column */}
      <div className="admin-page-grid flex-1 min-h-0 grid overflow-hidden">
        {leftPanel}
        {rightPanel}
      </div>

      {/* Song Properties Modal */}
      {propsModalSong && (
        <SongPropertiesModal
          song={propsModalSong.song}
          idx={propsModalSong.idx}
          allSongs={allSongs}
          vocalAssignments={vocalAssignments}
          segues={segues}
          onSaveLocal={(songId, { vocalist, segue }) => {
            setVocalAssignments(prev => {
              const next = { ...prev };
              if (vocalist) next[songId] = vocalist;
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
          onSaveGlobal={async (songId, data) => {
            await updateSong(songId, data);
          }}
          onClose={() => setPropsModalSong(null)}
        />
      )}

      <style>{`
        .sortable-ghost { opacity: 0.3; background: #00ddde20 !important; }
      `}</style>
    </AdminShell>
  );
}

// ── Icon button ───────────────────────────────────────────────────────────
function IconBtn({ onClick, icon, title, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition-colors text-sm ${
        active
          ? 'text-[#00ddde] bg-[#00ddde]/10'
          : 'text-[#888] hover:text-white hover:bg-white/5'
      }`}
    >
      <i className={`fas ${icon}`} />
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
function SongPropertiesModal({ song, allSongs, vocalAssignments, segues, onSaveLocal, onSaveGlobal, onClose }) {
  const songData = allSongs.find(s => s.id === song.id) || {};
  const [vocalist, setVocalist] = useState(vocalAssignments[song.id] || '');
  const [segue, setSegue] = useState(!!segues[song.id]);
  const [capo, setCapo] = useState(songData.capo ?? 0);
  const [dropD, setDropD] = useState(songData.dropD || false);
  const [eflat, setEflat] = useState(songData.eflat || false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      onSaveLocal(song.id, { vocalist, segue });
      await onSaveGlobal(song.id, { capo: parseInt(capo) || 0, dropD, eflat });
      onClose();
    } catch (err) { alert('Save failed: ' + err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] w-full max-w-sm rounded-xl shadow-2xl border border-[#2a2a2a] overflow-hidden">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[#2a2a2a]">
          <div>
            <p className="text-sm font-bold text-white">{song.title || song.lastKnownName}</p>
            <p className="text-[10px] text-[#888] uppercase tracking-wide mt-0.5">Song Properties</p>
          </div>
          <button onClick={onClose} className="text-[#888] hover:text-white p-1"><i className="fas fa-times" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Vocalist */}
          <div>
            <p className="text-xs text-[#888] uppercase tracking-wider font-semibold mb-2">Vocalist (this setlist)</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setVocalist('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  vocalist === '' ? 'bg-[#2a2a2a] text-white border border-[#555]' : 'text-[#888] hover:text-white hover:bg-white/5'
                }`}
              >
                None
              </button>
              {VOCALISTS.map(v => {
                const color = VOCALIST_COLORS[v];
                const isActive = vocalist === v;
                return (
                  <button
                    key={v}
                    onClick={() => setVocalist(v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={isActive
                      ? { background: `${color}30`, color, border: `1px solid ${color}60` }
                      : { color: '#888', border: '1px solid transparent' }
                    }
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Segue */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setSegue(v => !v)}
              className={`w-10 h-6 rounded-full transition-colors flex items-center cursor-pointer ${segue ? 'bg-[#008c8d]' : 'bg-[#2a2a2a]'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${segue ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <span className="text-sm text-[#ccc]">Segue into next song</span>
          </label>

          <div className="border-t border-[#2a2a2a] pt-4">
            <p className="text-xs text-[#888] uppercase tracking-wider font-semibold mb-3">Global Song Settings</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-[#ccc] w-16 shrink-0">Capo</label>
                <input
                  type="number" min="0" max="12" value={capo}
                  onChange={e => setCapo(e.target.value)}
                  className="w-20 px-3 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm focus:outline-none focus:border-[#00ddde]"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={dropD} onChange={e => setDropD(e.target.checked)} className="w-4 h-4 rounded accent-[#008c8d]" />
                <span className="text-sm text-[#ccc]">Drop D</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={eflat} onChange={e => setEflat(e.target.checked)} className="w-4 h-4 rounded accent-[#008c8d]" />
                <span className="text-sm text-[#ccc]">Eb tuning</span>
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-[#2a2a2a] px-5 py-3 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-[#2a2a2a] rounded-lg text-white hover:bg-[#333] text-sm font-semibold transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#008c8d] hover:bg-[#00a8a9] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
