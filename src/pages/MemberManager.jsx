import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard.jsx';
import { useAuth } from '../firebase/AuthContext.jsx';
import AdminShell, { useAdminDrawer } from '../components/admin/AdminShell.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { useMembersWithAccounts, useMemberProfileDocs, useIsAdmin } from '../firebase/useFirestore.js';
import { saveBandMember, deleteBandMember, saveMemberProfile } from '../firestore-service.js';
import { MEMBER_ROLES, slugifyMember, GUEST_COLOR } from '../utils/members.js';
import { THEMES, FONTS, PATTERNS, SOCIAL_PLATFORMS, safeUrl, parseYouTubeId, DEFAULT_THEME, DEFAULT_FONT, DEFAULT_PATTERN } from '../utils/profileThemes.js';

const PALETTE = [
  '#22c55e', '#3b82f6', '#f59e0b', '#e879f9', '#fb923c', '#38bdf8',
  '#a78bfa', '#f43f5e', '#14b8a6', '#eab308', '#ec4899', '#78716c',
];

const INPUT = 'w-full px-3 py-2.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm focus:outline-none focus:border-[#00ddde]';

function MembersContent() {
  const navigate = useNavigate();
  const { open: drawerOpen, close: closeDrawer } = useAdminDrawer();
  const { all, authUsers, loading } = useMembersWithAccounts();
  const { data: profileDocs = [] } = useMemberProfileDocs();
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  // The member record this signed-in user owns, if any.
  const ownMember = all.find(m => m.googleUid && m.googleUid === user?.uid) || null;
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('m');

  const [form, setForm] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = isAdmin
    ? (all.find(m => m.id === selectedId) || null)
    : ownMember;

  // A member landing here goes straight to their own details — there is no
  // roster to browse, so keep the URL in step with what is actually shown.
  useEffect(() => {
    if (adminLoading || isAdmin || !ownMember) return;
    if (searchParams.get('m') !== ownMember.id) {
      setSearchParams({ m: ownMember.id }, { replace: true });
    }
  }, [adminLoading, isAdmin, ownMember, searchParams, setSearchParams]);

  // Load the selected member into the form whenever the selection changes.
  useEffect(() => {
    if (isNew) return;
    if (!selected) { setForm(null); return; }
    setForm({
      id: selected.id,
      name: selected.name || '',
      fullName: selected.fullName || '',
      color: selected.color || GUEST_COLOR,
      roles: selected.roles || [],
      canSingLead: !!selected.canSingLead,
      type: selected.type || 'member',
      active: selected.active !== false,
      sortOrder: selected.sortOrder ?? 999,
      googleUid: selected.googleUid || '',
    });
    const prof = profileDocs.find(p => p.id === selected.id) || {};
    setProfile({
      published: !!prof.published,
      photoUrl: prof.photoUrl || '',
      status: prof.status || '',
      bio: prof.bio || '',
      favoriteArtists: (prof.favoriteArtists || []).join('\n'),
      interests: (prof.interests || []).join('\n'),
      musicUrl: prof.musicUrl || '',
      musicTitle: prof.musicTitle || '',
      socials: { ...(prof.socials || {}) },
      theme: prof.theme || DEFAULT_THEME,
      font: prof.font || DEFAULT_FONT,
      pattern: prof.pattern || DEFAULT_PATTERN,
    });
    setDirty(false);
  }, [selectedId, selected?.updatedAt, profileDocs]);

  function select(id) {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setIsNew(false);
    setDirty(false);
    setSearchParams({ m: id }, { replace: false });
    closeDrawer();
  }

  function addNew() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setIsNew(true);
    setDirty(true);
    setForm({
      id: '', name: '', fullName: '', color: PALETTE[0], roles: [],
      canSingLead: false, type: 'member', active: true,
      sortOrder: (all.length + 1) * 10, googleUid: '',
    });
    setProfile({
      published: false, photoUrl: '', status: '', bio: '', favoriteArtists: '', interests: '',
      musicUrl: '', musicTitle: '',
      socials: {}, theme: DEFAULT_THEME, font: DEFAULT_FONT, pattern: DEFAULT_PATTERN,
    });
    setSearchParams({}, { replace: false });
  }

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };
  const setProf = (k, v) => { setProfile(p => ({ ...p, [k]: v })); setDirty(true); };
  const setSocial = (k, v) => {
    setProfile(p => ({ ...p, socials: { ...p.socials, [k]: v } }));
    setDirty(true);
  };

  function toggleRole(role) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }));
    setDirty(true);
  }

  async function handleSave() {
    if (!form?.name.trim()) { alert('Name is required.'); return; }
    // The id is the permanent reference used by shows, setlists and songs, so
    // it is derived once at creation and never changes when the name is edited.
    const id = isNew ? slugifyMember(form.name) : form.id;
    if (!id) { alert('That name does not produce a valid id. Try adding letters or numbers.'); return; }
    if (isNew && all.some(m => m.id === id)) {
      alert(`A member with the id "${id}" already exists.`);
      return;
    }
    setSaving(true);
    try {
      await saveBandMember(id, {
        name: form.name.trim(),
        fullName: form.fullName.trim(),
        color: form.color,
        roles: form.roles,
        canSingLead: form.canSingLead,
        type: form.type,
        active: form.active,
        sortOrder: Number(form.sortOrder) || 999,
        googleUid: form.googleUid || null,
      });
      await saveMemberProfile(id, {
        published: !!profile.published,
        photoUrl: profile.photoUrl.trim(),
        status: profile.status.trim(),
        bio: profile.bio.trim(),
        favoriteArtists: profile.favoriteArtists
          .split('\n').map(a => a.trim()).filter(Boolean).slice(0, 24),
        interests: profile.interests
          .split('\n').map(a => a.trim()).filter(Boolean).slice(0, 24),
        musicUrl: profile.musicUrl.trim(),
        musicTitle: profile.musicTitle.trim(),
        socials: Object.fromEntries(
          Object.entries(profile.socials).filter(([, url]) => url && url.trim()).map(([k, url]) => [k, url.trim()]),
        ),
        theme: profile.theme,
        font: profile.font,
        pattern: profile.pattern,
      });
      setIsNew(false);
      setDirty(false);
      setSearchParams({ m: id }, { replace: true });
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm(
      `Delete ${selected.name}?\n\nShows, setlists and songs that reference this member will show them as an unknown name. Setting them inactive instead keeps that history readable.`,
    )) return;
    try {
      await deleteBandMember(selected.id);
      setSearchParams({}, { replace: true });
      setForm(null);
    } catch (err) { alert('Delete failed: ' + err.message); }
  }

  // Google accounts not already claimed by another member
  const takenUids = new Set(all.filter(m => m.googleUid && m.id !== form?.id).map(m => m.googleUid));
  const availableAccounts = authUsers.filter(u => !takenUids.has(u.uid));

  // ── Left: roster ───────────────────────────────────────────────────────
  const leftPanel = (
    <div className={`admin-drawer flex flex-col overflow-hidden bg-[#1a1a1a] border-r border-[#2a2a2a] text-left${drawerOpen ? ' drawer-open' : ''}`}>
      <div className="shrink-0 px-4 min-h-[44px] flex items-center justify-between border-b border-[#2a2a2a]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#888]">Members</span>
        <span className="text-[11px] text-[#555]">{all.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && <p className="p-4 text-sm text-[#555]">Loading…</p>}
        {all.map(m => (
          <button
            key={m.id}
            onClick={() => select(m.id)}
            className={`w-full text-left px-4 py-3 border-b border-[#2a2a2a] flex items-center gap-3 transition-colors ${
              selectedId === m.id ? 'bg-white/5 border-l-2 border-l-[#00ddde]' : 'hover:bg-white/5'
            }`}
          >
            <MemberAvatar name={m.name} color={m.color} size={32} profiles={m.photoURL ? { [m.name]: { photoURL: m.photoURL } } : {}} />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold truncate ${m.active === false ? 'text-[#666] line-through' : 'text-white'}`}>
                {m.name}
              </div>
              <div className="text-[11px] text-[#888] truncate">
                {m.type === 'guest' ? 'Guest' : 'Member'}
                {m.roles?.length ? ` · ${m.roles.join(', ')}` : ''}
              </div>
            </div>
            {m.linked && <i className="fab fa-google text-[10px] text-[#22c55e]" title="Google account linked" />}
            {m.orphanedLink && <i className="fas fa-link-slash text-[10px] text-amber-400" title="Linked account is no longer authorised" />}
          </button>
        ))}
      </div>
      <div className="shrink-0 p-3 border-t border-[#2a2a2a]">
        <button
          onClick={addNew}
          className="w-full min-h-[44px] bg-[#00ddde]/15 border border-[#00ddde]/40 text-[#00ddde] rounded-xl text-sm font-semibold hover:bg-[#00ddde]/25 transition-colors"
        >
          <i className="fas fa-plus mr-1.5" />Add Member
        </button>
      </div>
    </div>
  );

  // ── Right: editor ──────────────────────────────────────────────────────
  const rightPanel = (
    <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden bg-[#121212] text-left">
      <div className="shrink-0 px-4 py-3 border-b border-[#2a2a2a] flex items-center gap-2">
        <button
          onClick={() => navigate('/admin')}
          className="shrink-0 w-11 h-11 flex items-center justify-center text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          title="Back to admin"
        >
          <i className="fas fa-arrow-left text-sm" />
        </button>
        <h1 className="flex-1 min-w-0 text-base font-bold text-white truncate">
          {!isAdmin ? 'My Details' : isNew ? 'New Member' : selected ? selected.name : 'Member Management'}
        </h1>
        {isAdmin && !isNew && selected && (
          <button
            onClick={handleDelete}
            className="shrink-0 w-11 h-11 flex items-center justify-center text-[#555] hover:text-red-400 rounded-lg transition-colors"
            title="Delete member"
          >
            <i className="fas fa-trash text-sm" />
          </button>
        )}
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto ${form ? 'pb-24' : ''}`}>
        {!form && (
          <div className="h-full flex items-center justify-center text-center px-6">
            <div>
              <i className="fas fa-users text-5xl mb-4 block opacity-20 text-[#555]" />
              <p className="text-sm text-[#555]">Select a member, or add a new one</p>
            </div>
          </div>
        )}

        {form && profile && (
          <div className="p-5 space-y-6 max-w-xl">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Display name *">
                <input className={INPUT} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Tom" />
              </Field>
              <Field label="Full name">
                <input className={INPUT} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Tom Hickman" />
              </Field>
            </div>

            {/* The id is what all historical data points at, so surface it and
                make clear that renaming never disturbs it. */}
            <div className="text-[11px] text-[#555] -mt-2">
              {isNew
                ? <>Reference id will be <code className="text-[#888] bg-[#1a1a1a] px-1 rounded">{slugifyMember(form.name) || '…'}</code> — permanent once saved.</>
                : <>Reference id <code className="text-[#888] bg-[#1a1a1a] px-1 rounded">{form.id}</code> — renaming above is safe, shows and setlists keep pointing here.</>}
            </div>

            <Field label="Colour">
              <div className="flex flex-wrap gap-2 items-center">
                {PALETTE.map(c => (
                  <button
                    key={c}
                    onClick={() => set('color', c)}
                    className="w-9 h-9 rounded-full transition-transform hover:scale-110"
                    style={{ background: c, outline: form.color === c ? '2px solid white' : 'none', outlineOffset: 2 }}
                    title={c}
                  />
                ))}
                <input
                  value={form.color}
                  onChange={e => set('color', e.target.value)}
                  className="w-24 px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs font-mono focus:outline-none focus:border-[#00ddde]"
                />
                <MemberAvatar name={form.name || '?'} color={form.color} size={36} />
              </div>
            </Field>

            {isAdmin ? <Field label="Roles">
              <div className="flex flex-wrap gap-2">
                {MEMBER_ROLES.map(r => {
                  const on = form.roles.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => toggleRole(r)}
                      className="min-h-[44px] px-3 rounded-xl text-sm font-semibold transition-colors"
                      style={on
                        ? { background: `${form.color}25`, color: form.color, border: `1px solid ${form.color}70` }
                        : { color: '#888', background: '#121212', border: '1px solid #2a2a2a' }}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </Field> : (form.roles.length > 0 && (
              <Field label="Roles">
                <div className="flex flex-wrap gap-2">
                  {form.roles.map(r => (
                    <span key={r} className="min-h-[36px] px-3 flex items-center rounded-xl text-sm font-semibold"
                      style={{ background: `${form.color}18`, color: form.color, border: `1px solid ${form.color}44` }}>
                      {r}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-[#555] mt-1.5">Set by the band admin.</p>
              </Field>
            ))}

            {isAdmin && <div className="space-y-3">
              <Toggle
                checked={form.canSingLead}
                onChange={v => set('canSingLead', v)}
                color={form.color}
                label="Can sing lead"
                hint="Offered by Auto Assign and the Auto Setlist generator."
              />
              <Toggle
                checked={form.type === 'guest'}
                onChange={v => set('type', v ? 'guest' : 'member')}
                color={form.color}
                label="Guest / sub"
                hint="Guests are shown separately and assumed able to cover any song."
              />
              <Toggle
                checked={form.active}
                onChange={v => set('active', v)}
                color={form.color}
                label="Active"
                hint="Inactive members stay readable in past shows but are no longer offered."
              />
            </div>}

            {isAdmin && <Field label="Sort order">
              <input
                type="number"
                className={INPUT}
                style={{ maxWidth: 120 }}
                value={form.sortOrder}
                onChange={e => set('sortOrder', e.target.value)}
              />
            </Field>}

            {/* ── Public profile page ─────────────────────────────────── */}
            <div className="pt-4 border-t border-[#2a2a2a] space-y-5">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider">
                  Public Profile Page
                </label>
                {profile.published && !isNew && (
                  <a
                    href={`/band/${form.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#00ddde] hover:underline"
                  >
                    View live <i className="fas fa-arrow-up-right-from-square text-[9px]" />
                  </a>
                )}
              </div>

              <Toggle
                checked={profile.published}
                onChange={v => setProf('published', v)}
                color={form.color}
                label="Publish this page"
                hint={profile.published
                  ? `Live at /band/${form.id || '…'} and listed on the Band page.`
                  : 'Off — the page returns "no profile here" and is left off the Band index.'}
              />

              <p className="text-[11px] text-[#7a6a3a] bg-amber-400/5 border border-amber-400/20 rounded-lg p-2.5">
                <i className="fas fa-circle-info mr-1" />
                Everything below is written for the public. Links and text are shown
                as plain text — HTML and scripts are never run — but don&rsquo;t put
                anything private here.
              </p>

              <Field label="Photo URL">
                <input
                  className={INPUT}
                  value={profile.photoUrl}
                  onChange={e => setProf('photoUrl', e.target.value)}
                  placeholder="https://.../photo.jpg"
                />
                {profile.photoUrl && !safeUrl(profile.photoUrl) && (
                  <p className="text-[11px] text-red-400 mt-1">
                    Needs to be a full http:// or https:// link.
                  </p>
                )}
                {safeUrl(profile.photoUrl) && (
                  <img
                    src={safeUrl(profile.photoUrl)}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="mt-2 w-24 h-24 rounded-xl object-cover border border-[#2a2a2a]"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </Field>

              <Field label="Status line">
                <input
                  className={INPUT}
                  maxLength={120}
                  value={profile.status}
                  onChange={e => setProf('status', e.target.value)}
                  placeholder="currently overplaying the bridge"
                />
              </Field>

              <Field label="Bio">
                <textarea
                  rows={5}
                  className={INPUT + ' resize-y'}
                  maxLength={2000}
                  value={profile.bio}
                  onChange={e => setProf('bio', e.target.value)}
                  placeholder="Tell people who you are..."
                />
                <p className="text-[11px] text-[#555] mt-1">{profile.bio.length}/2000</p>
              </Field>

              <Field label="Favourite artists (one per line)">
                <textarea
                  rows={4}
                  className={INPUT + ' resize-y'}
                  value={profile.favoriteArtists}
                  onChange={e => setProf('favoriteArtists', e.target.value)}
                  placeholder={'Fleetwood Mac\nStevie Wonder\nParamore'}
                />
              </Field>

              <Field label="Interests (one per line)">
                <textarea
                  rows={4}
                  className={INPUT + ' resize-y'}
                  value={profile.interests}
                  onChange={e => setProf('interests', e.target.value)}
                  placeholder={'Beer\nSoftware development\nVintage pedals'}
                />
              </Field>

              <Field label="Music player (YouTube link)">
                <input
                  className={INPUT}
                  value={profile.musicUrl}
                  onChange={e => setProf('musicUrl', e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                {profile.musicUrl.trim() && !parseYouTubeId(profile.musicUrl) && (
                  <p className="text-[11px] text-red-400 mt-1">
                    Not a YouTube video link. Paste a watch, youtu.be, or shorts URL.
                  </p>
                )}
                {parseYouTubeId(profile.musicUrl) && (
                  <div className="flex items-center gap-2 mt-2">
                    <img
                      src={`https://i.ytimg.com/vi/${parseYouTubeId(profile.musicUrl)}/mqdefault.jpg`}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-lg object-cover border border-[#2a2a2a]"
                    />
                    <p className="text-[11px] text-[#22c55e]">
                      <i className="fas fa-check mr-1" />Player will show on your page.
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-[#555] mt-1.5">
                  Leave blank for no player. It never autoplays &mdash; visitors press play.
                </p>
              </Field>

              <Field label="Player track label">
                <input
                  className={INPUT}
                  maxLength={80}
                  value={profile.musicTitle}
                  onChange={e => setProf('musicTitle', e.target.value)}
                  placeholder="Song name — Artist"
                />
              </Field>

              <Field label="Socials">
                <div className="space-y-2">
                  {SOCIAL_PLATFORMS.map(sp => {
                    const value = profile.socials[sp.key] || '';
                    const bad = value.trim() && !safeUrl(value);
                    return (
                      <div key={sp.key} className="flex items-center gap-2">
                        <i className={`${sp.icon} w-5 text-center text-[#888]`} title={sp.label} />
                        <input
                          className={INPUT + (bad ? ' border-red-500/60' : '')}
                          value={value}
                          onChange={e => setSocial(sp.key, e.target.value)}
                          placeholder={`${sp.label} URL`}
                        />
                      </div>
                    );
                  })}
                </div>
              </Field>

              <Field label="Theme">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(THEMES).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => setProf('theme', key)}
                      className="min-h-[44px] px-3 rounded-xl text-sm font-semibold transition-all"
                      style={{
                        background: t.panel,
                        color: t.text,
                        border: profile.theme === key ? `2px solid ${form.color}` : `1px solid ${t.border}`,
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Font">
                  <select className={INPUT} value={profile.font} onChange={e => setProf('font', e.target.value)}>
                    {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                  </select>
                </Field>
                <Field label="Background">
                  <select className={INPUT} value={profile.pattern} onChange={e => setProf('pattern', e.target.value)}>
                    {Object.entries(PATTERNS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            {/* Google account link — the basis for calendar invites later */}
            {isAdmin && <div className="pt-4 border-t border-[#2a2a2a]">
              <Field label="Google account">
                <select
                  className={INPUT}
                  value={form.googleUid || ''}
                  onChange={e => set('googleUid', e.target.value)}
                >
                  <option value="">— Not linked —</option>
                  {availableAccounts.map(u => (
                    <option key={u.uid} value={u.uid}>
                      {u.email || u.displayName || `(profile not synced yet) ${u.uid.slice(0, 10)}…`}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#555] mt-1.5">
                  {authUsers.length === 0
                    ? 'No authorised accounts are readable yet — deploy the updated Firestore rules, then have each member sign in once.'
                    : availableAccounts.some(u => !u.email)
                      ? 'Accounts without an email have not signed in since profile syncing was fixed. Their details fill in on next sign-in.'
                      : 'Used to match this member to their Google identity for calendar invites.'}
                </p>
              </Field>
            </div>}
          </div>
        )}
      </div>

      {form && (
        <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-[#2a2a2a] bg-[#0f0f0f]/95 backdrop-blur px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => { if (!dirty || window.confirm('Discard unsaved changes?')) { setIsNew(false); setDirty(false); setSearchParams(selectedId ? { m: selectedId } : {}, { replace: true }); if (!selectedId) setForm(null); } }}
            className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-[#aaa] hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <span className="flex-1 text-[11px] text-[#666] font-mono truncate">
            {dirty ? 'Unsaved changes' : 'No changes'}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="min-h-[44px] w-[7.5rem] shrink-0 justify-center rounded-xl text-sm font-bold bg-[#008c8d] hover:bg-[#00a8a9] text-white transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {saving ? <><i className="fas fa-spinner fa-spin" /> Saving</> : <><i className="fas fa-floppy-disk" /> Save</>}
          </button>
        </div>
      )}
    </div>
  );

  if (adminLoading) {
    return <AdminShell activeApp="members"><div className="flex-1" /></AdminShell>;
  }

  // A member whose account has not been linked to a roster entry has nothing
  // to edit. Say so plainly rather than showing an empty form.
  if (!isAdmin && !ownMember) {
    return (
      <AdminShell activeApp="members">
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="max-w-sm">
            <i className="fas fa-user-lock text-4xl text-[#333] mb-4 block" />
            <h1 className="text-lg font-bold text-white mb-2">Your account isn&rsquo;t linked yet</h1>
            <p className="text-sm text-[#888]">
              {user?.email} isn&rsquo;t connected to a band member record, so there&rsquo;s
              nothing here to edit. Ask Tom to link it on the Members page.
            </p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell activeApp="members">
      {isAdmin ? (
        <div className="admin-page-grid flex-1 min-h-0 grid overflow-hidden">
          {leftPanel}
          {rightPanel}
        </div>
      ) : (
        // Single pane: a member manages only themselves, so there is no roster
        // to browse and the sidebar would be an empty column.
        <div className="flex-1 min-h-0 flex overflow-hidden">{rightPanel}</div>
      )}
    </AdminShell>
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

function Toggle({ checked, onChange, label, hint, color }) {
  return (
    <button onClick={() => onChange(!checked)} className="w-full flex items-start gap-3 text-left min-h-[44px]">
      <div
        className="w-11 h-6 shrink-0 mt-0.5 rounded-full transition-colors flex items-center"
        style={{ background: checked ? color : '#2a2a2a' }}
      >
        <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{label}</div>
        {hint && <div className="text-[11px] text-[#888] mt-0.5">{hint}</div>}
      </div>
    </button>
  );
}

export default function MemberManager() {
  return (
    <AuthGuard>
      <MembersContent />
    </AuthGuard>
  );
}
