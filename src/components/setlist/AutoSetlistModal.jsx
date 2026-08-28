import { useState, useMemo, useEffect } from 'react';
import MemberAvatar from '../MemberAvatar.jsx';
import { GENRE_ORDER, GENRE_COLORS } from '../../utils/genre.js';
import { generateSetlist } from '../../utils/autoSetlist.js';
import { formatDuration, formatLongDuration } from '../../utils/setlistUtils.js';
import { useMembers } from '../../firebase/useFirestore.js';

const PREFS_KEY = 'ultraphonics.autoSetlist.prefs';

const DEFAULT_PREFS = {
  singers: null, // filled from the live roster on first open
  numSets: 3,
  setMinutes: 45,
  genrePrefs: Object.fromEntries(GENRE_ORDER.map(g => [g, 'include'])),
  popularityBias: 60,
  includeUnknownVocals: false,
};

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (!saved) return DEFAULT_PREFS;
    return {
      ...DEFAULT_PREFS,
      ...saved,
      singers: null, // always re-derived from the gig on open
      genrePrefs: { ...DEFAULT_PREFS.genrePrefs, ...(saved.genrePrefs || {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Auto Setlist — pick the parameters, preview what comes out, then either
 * re-roll it or drop it into the editor. Nothing is written to Firestore here;
 * "Use This Setlist" hands rows back to the editor as unsaved changes so the
 * generator can never clobber a saved setlist on its own.
 */
export default function AutoSetlistModal({ songs, popularity, guestOptions = [], profiles = {}, showPersonnel = [], showLabel = '', onApply, onClose }) {
  const members = useMembers();
  const [prefs, setPrefs] = useState(loadPrefs);

  // Prefill from whoever is actually on the gig. Only people who can sing lead
  // (or are guest subs) are eligible, so a drummer on the roster is ignored.
  // With no linked show, or nobody on it who can sing, fall back to the full
  // lead-vocalist roster rather than opening with an empty, unusable selection.
  const eligibleFromGig = useMemo(() => {
    if (!showPersonnel.length || !members.leadVocalists.length) return [];
    return showPersonnel
      .map(p => members.get(p))
      .filter(m => m.canSingLead || m.type === 'guest')
      .map(m => m.id);
  }, [showPersonnel, members]);

  const [prefilledFromGig, setPrefilledFromGig] = useState(false);

  useEffect(() => {
    if (prefs.singers !== null || !members.leadVocalists.length) return;
    const seeded = eligibleFromGig.length ? eligibleFromGig : members.leadVocalists.map(m => m.id);
    setPrefilledFromGig(eligibleFromGig.length > 0);
    setPrefs(p => ({ ...p, singers: seeded }));
  }, [members.leadVocalists, eligibleFromGig, prefs.singers]);
  const [phase, setPhase] = useState('settings'); // settings | preview
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));

  // `singers` is deliberately excluded: it belongs to the gig, not to a saved
  // preference. Persisting it would leak one show's lineup into the next.
  useEffect(() => {
    try {
      const { singers, ...persisted } = prefs;
      localStorage.setItem(PREFS_KEY, JSON.stringify(persisted));
    } catch { /* private mode */ }
  }, [prefs]);

  const set = (k, v) => setPrefs(p => ({ ...p, [k]: v }));

  const result = useMemo(() => generateSetlist({
    songs,
    singers: prefs.singers || [],
    numSets: prefs.numSets,
    setMinutes: prefs.setMinutes,
    genrePrefs: prefs.genrePrefs,
    popularityBias: prefs.popularityBias / 100,
    popularity,
    includeUnknownVocals: prefs.includeUnknownVocals,
    members,
    seed,
  }), [songs, popularity, prefs, seed, members]);

  // Anyone who can sing lead, plus guests on this gig who aren't already members
  const singerOptions = [
    ...members.leadVocalists.map(m => m.id),
    ...guestOptions.map(g => members.idOf(g)).filter(id => !members.byId.has(id) || members.get(id).type === 'guest'),
  ].filter((id, i, arr) => arr.indexOf(id) === i);
  const selectedSingers = prefs.singers || [];
  const canGenerate = selectedSingers.length > 0;

  function toggleSinger(name) {
    setPrefs(p => ({
      ...p,
      singers: (p.singers || []).includes(name)
        ? (p.singers || []).filter(s => s !== name)
        : [...(p.singers || []), name],
    }));
  }

  function cycleGenre(g) {
    const order = ['include', 'preferred', 'exclude'];
    setPrefs(p => ({
      ...p,
      genrePrefs: { ...p.genrePrefs, [g]: order[(order.indexOf(p.genrePrefs[g] || 'include') + 1) % 3] },
    }));
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-[#1a1a1a] w-full max-w-2xl max-h-full rounded-2xl shadow-2xl border border-[#2a2a2a] flex flex-col overflow-hidden text-left">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-[#2a2a2a]">
          <div className="min-w-0">
            <p className="text-base font-bold text-white flex items-center gap-2">
              <i className="fas fa-wand-magic-sparkles text-[#3b82f6]" />
              Auto Setlist
            </p>
            <p className="text-[11px] text-[#888] mt-0.5">
              {phase === 'settings' ? 'Choose who\'s singing and how long you\'re playing' : 'Preview — nothing is saved until you apply'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-11 h-11 flex items-center justify-center text-[#888] hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            aria-label="Close"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {phase === 'settings'
            ? <SettingsPane
                prefs={prefs}
                members={members}
                selectedSingers={selectedSingers}
                prefilledFromGig={prefilledFromGig}
                showLabel={showLabel}
                set={set}
                profiles={profiles}
                singerOptions={singerOptions}
                guestOptions={guestOptions}
                toggleSinger={toggleSinger}
                cycleGenre={cycleGenre}
                stats={result.stats}
              />
            : <PreviewPane result={result} profiles={profiles} members={members} />}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#2a2a2a] px-5 py-3 flex items-center gap-3">
          {phase === 'settings' ? (
            <>
              <button
                onClick={onClose}
                className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-[#888] hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <div className="flex-1" />
              <button
                onClick={() => { setSeed(Math.floor(Math.random() * 1e9)); setPhase('preview'); }}
                disabled={!canGenerate}
                className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-[#1d4ed8] hover:bg-[#1e40af] text-white transition-colors disabled:bg-[#2a2a2a] disabled:text-[#555] disabled:cursor-not-allowed flex items-center gap-2"
              >
                <i className="fas fa-wand-magic-sparkles" />
                Generate
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setPhase('settings')}
                className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-[#888] hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <i className="fas fa-sliders" />
                Settings
              </button>
              <button
                onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
                className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-[#ccc] bg-[#2a2a2a] hover:bg-[#333] transition-colors flex items-center gap-2"
              >
                <i className="fas fa-rotate" />
                Re-roll
              </button>
              <div className="flex-1" />
              <button
                onClick={() => onApply(result)}
                disabled={!result.rows.length}
                className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-[#1d4ed8] hover:bg-[#1e40af] text-white transition-colors disabled:bg-[#2a2a2a] disabled:text-[#555] disabled:cursor-not-allowed flex items-center gap-2"
              >
                <i className="fas fa-check" />
                Use This
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────
function SettingsPane({ prefs, set, profiles, singerOptions, guestOptions, toggleSinger, cycleGenre, stats, members, selectedSingers, prefilledFromGig, showLabel }) {
  return (
    <div className="p-5 space-y-6">
      {/* Singers */}
      <Section label="Who's singing" hint={`${selectedSingers.length} selected`}>
        <div className="flex flex-wrap gap-2">
          {singerOptions.map(id => {
            const m = members.get(id);
            const name = m.name;
            const color = m.color;
            const on = selectedSingers.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggleSinger(id)}
                className="min-h-[44px] flex items-center gap-2 px-3 rounded-xl text-sm font-semibold transition-all"
                style={on
                  ? { background: `${color}25`, color, border: `1px solid ${color}70` }
                  : { color: '#777', border: '1px solid #2a2a2a', background: '#121212' }}
              >
                <MemberAvatar name={name} profiles={profiles} color={color} size={24} />
                {name}
                {on && <i className="fas fa-check text-[10px]" />}
              </button>
            );
          })}
        </div>
        {prefilledFromGig && (
          <p className="text-[11px] text-[#3b82f6] mt-2">
            <i className="fas fa-calendar-days mr-1 text-[10px]" />
            Prefilled from {showLabel || 'the linked gig'} — adjust if needed.
          </p>
        )}
        {!prefilledFromGig && (
          <p className="text-[11px] text-[#555] mt-2">
            No gig lineup to prefill from — showing everyone who can sing lead.
          </p>
        )}
      </Section>

      {/* Sets & length */}
      <div className="grid grid-cols-2 gap-5">
        <Section label="Sets">
          <Stepper
            value={prefs.numSets}
            min={1}
            max={6}
            onChange={v => set('numSets', v)}
            format={v => `${v}`}
          />
        </Section>
        <Section label="Minutes per set">
          <Stepper
            value={prefs.setMinutes}
            min={15}
            max={120}
            step={5}
            onChange={v => set('setMinutes', v)}
            format={v => `${v}m`}
          />
        </Section>
      </div>
      <p className="-mt-3 text-[11px] text-[#888]">
        Target: <span className="text-white font-semibold">{formatLongDuration(prefs.numSets * prefs.setMinutes * 60)}</span> of music across {prefs.numSets} set{prefs.numSets !== 1 ? 's' : ''}.
      </p>

      {/* Genres */}
      <Section label="Genres" hint="tap to cycle">
        <div className="flex flex-wrap gap-2">
          {GENRE_ORDER.map(g => {
            const state = prefs.genrePrefs[g] || 'include';
            const c = GENRE_COLORS[g];
            const style = state === 'preferred'
              ? { background: c.bg, color: c.text, border: `1px solid ${c.border}`, boxShadow: `inset 0 0 0 1px ${c.border}` }
              : state === 'exclude'
                ? { background: '#121212', color: '#4a4a4a', border: '1px solid #2a2a2a', textDecoration: 'line-through' }
                : { background: '#121212', color: '#aaa', border: '1px solid #2a2a2a' };
            return (
              <button
                key={g}
                onClick={() => cycleGenre(g)}
                className="min-h-[44px] px-3 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
                style={style}
              >
                {state === 'preferred' && <i className="fas fa-star text-[10px]" />}
                {state === 'exclude' && <i className="fas fa-ban text-[10px]" />}
                {g}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[#555] mt-2">
          <span className="text-[#aaa]">Include</span> → <span className="text-[#aaa]">★ Preferred</span> (weighted heavily, leads each set) → <span className="text-[#aaa]">Excluded</span>
        </p>
      </Section>

      {/* Popularity */}
      <Section label="Favour songs we play often" hint={`${prefs.popularityBias}%`}>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={prefs.popularityBias}
          onChange={e => set('popularityBias', parseInt(e.target.value, 10))}
          className="w-full accent-[#3b82f6] h-11"
        />
        <div className="flex justify-between text-[11px] text-[#555]">
          <span>Mix it up</span>
          <span>Stick to the hits</span>
        </div>
      </Section>

      {/* Unknown vocals */}
      <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={prefs.includeUnknownVocals}
          onChange={e => set('includeUnknownVocals', e.target.checked)}
          className="mt-1 w-5 h-5 rounded accent-[#3b82f6]"
        />
        <span className="text-sm text-[#ccc]">
          Include songs with no vocal capability data
          <span className="block text-[11px] text-[#888] mt-0.5">
            {stats.excludedNoData
              ? `${stats.excludedNoData} song(s) are being skipped right now — they'd be assignable to anyone.`
              : 'Every eligible song already has capability data.'}
          </span>
        </span>
      </label>

      <div className="text-[11px] text-[#555] border-t border-[#2a2a2a] pt-4">
        {stats.poolSize ?? 0} song(s) eligible with these settings.
      </div>
    </div>
  );
}

// ── Preview ───────────────────────────────────────────────────────────────
function PreviewPane({ result, profiles, members }) {
  const { sets, warnings, stats } = result;

  return (
    <div>
      {warnings.length > 0 && (
        <div className="m-5 mb-0 p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-300 flex gap-2">
              <i className="fas fa-triangle-exclamation mt-0.5 shrink-0" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}

      {/* Singer load */}
      <div className="px-5 pt-5 flex flex-wrap gap-2">
        {Object.entries(stats.singerCounts || {}).map(([id, n]) => {
          const m = members.get(id);
          const name = m.name;
          const color = m.color;
          return (
            <span
              key={id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}
            >
              <MemberAvatar name={name} profiles={profiles} color={color} size={18} />
              {n} song{n !== 1 ? 's' : ''}
            </span>
          );
        })}
      </div>

      {sets.map(set => (
        <div key={set.name} className="mt-5">
          <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 px-5 py-2 bg-[#212121] border-y border-[#2a2a2a]">
            <span className="text-sm font-bold text-white uppercase tracking-wide">{set.name}</span>
            <span className="text-[11px] text-[#888] font-mono">
              {set.count} songs · ~{formatLongDuration(set.seconds)}
            </span>
          </div>
          {set.songs.map((song, i) => {
            const singer = song.singer ? members.get(song.singer) : null;
            const gc = GENRE_COLORS[song.genre] || GENRE_COLORS.Other;
            return (
              <div key={`${song.id}-${i}`} className="flex items-center gap-3 px-5 py-2 border-b border-[#232323]">
                <span className="w-5 shrink-0 text-[10px] text-[#555] font-mono text-right">{i + 1}</span>
                <span className="flex-1 min-w-0 text-sm text-white truncate">{song.title}</span>
                <span
                  className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: gc.bg, color: gc.text, border: `1px solid ${gc.border}` }}
                >
                  {song.genre}
                </span>
                <span className="shrink-0 text-[10px] text-[#666] font-mono w-9 text-right">{formatDuration(song.seconds)}</span>
                {singer
                  ? <MemberAvatar name={singer.name} profiles={profiles} color={singer.color} size={22} />
                  : <i className="fas fa-triangle-exclamation text-amber-400 text-xs w-[22px] text-center" title="No singer available" />}
              </div>
            );
          })}
        </div>
      ))}

      {!sets.length && (
        <div className="p-12 text-center text-[#555]">
          <i className="fas fa-music text-4xl mb-3 block opacity-20" />
          <p className="text-sm">Nothing matched those settings.</p>
        </div>
      )}
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────
function Section({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs font-semibold text-[#888] uppercase tracking-wider">{label}</p>
        {hint && <span className="text-[11px] text-[#555]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stepper({ value, min, max, step = 1, onChange, format }) {
  const btn = 'w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-[#2a2a2a] text-white hover:bg-[#333] transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center gap-2 max-w-[200px]">
      <button className={btn} onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label="Decrease">
        <i className="fas fa-minus text-xs" />
      </button>
      <span className="flex-1 text-center text-lg font-bold text-white tabular-nums">{format(value)}</span>
      <button className={btn} onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label="Increase">
        <i className="fas fa-plus text-xs" />
      </button>
    </div>
  );
}
