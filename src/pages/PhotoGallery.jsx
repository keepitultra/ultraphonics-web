import { useRef, useState } from 'react';
import AuthGuard from '../components/AuthGuard.jsx';
import AdminShell from '../components/admin/AdminShell.jsx';
import { useAuth } from '../firebase/AuthContext.jsx';
import { useGalleryPhotos, useShows, useMembersWithAccounts } from '../firebase/useFirestore.js';
import { createGalleryPhoto, saveGalleryPhoto, deleteGalleryPhoto } from '../firestore-service.js';
import { uploadToCloudinary, cloudinaryThumbUrl } from '../utils/cloudinaryUpload.js';

const ACCENT = '#00ddde';

function GalleryContent() {
  const { user } = useAuth();
  const { photos, loading } = useGalleryPhotos();
  const { data: shows = [] } = useShows();
  const members = useMembersWithAccounts();
  const ownMember = members.all.find(m => m.googleUid && m.googleUid === user?.uid) || null;

  const [uploading, setUploading] = useState([]); // [{name, status: 'uploading'|'error', error?}]
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setUploading(files.map(f => ({ name: f.name, status: 'uploading' })));

    // Small concurrency cap so a big batch doesn't hammer Cloudinary's free tier at once.
    const CONCURRENCY = 3;
    let index = 0;
    async function worker() {
      while (index < files.length) {
        const i = index++;
        const file = files[i];
        try {
          const result = await uploadToCloudinary(file);
          await createGalleryPhoto({
            url: result.url,
            publicId: result.publicId,
            width: result.width,
            height: result.height,
            caption: '',
            uploadedBy: ownMember?.id || '',
            linkedShowId: null,
            featuredForWebsite: false,
          });
          setUploading(prev => prev.filter((_, idx) => idx !== i));
        } catch (err) {
          setUploading(prev => prev.map((u, idx) => idx === i ? { ...u, status: 'error', error: err.message } : u));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function toggleFeatured(photo) {
    await saveGalleryPhoto(photo.id, { featuredForWebsite: !photo.featuredForWebsite });
  }

  async function updateCaption(photo, caption) {
    if (caption === (photo.caption || '')) return;
    await saveGalleryPhoto(photo.id, { caption });
  }

  async function updateLinkedShow(photo, showId) {
    await saveGalleryPhoto(photo.id, { linkedShowId: showId || null });
  }

  async function handleDelete(photo) {
    if (!window.confirm('Remove this photo from the gallery?\n\nIt will disappear from any member profile or show it was set on, and the file will no longer be shown here (though it is not deleted from Cloudinary).')) return;
    await deleteGalleryPhoto(photo.id);
  }

  return (
    <AdminShell activeApp="gallery" hideDrawerToggle>
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#121212] text-left">
        <div className="max-w-5xl mx-auto p-5 space-y-5">
          <div>
            <h1 className="text-lg font-bold text-white">Photo Gallery</h1>
            <p className="text-sm text-[#888] mt-1">
              Upload photos here, then pick from them as a member's profile picture, a show's cover
              photo, or feature them on the public website.
            </p>
          </div>

          {/* Upload dropzone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
            style={{
              borderColor: dragOver ? ACCENT : '#2a2a2a',
              background: dragOver ? `${ACCENT}0d` : '#1a1a1a',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
            />
            <i className="fas fa-cloud-arrow-up text-3xl mb-2 block" style={{ color: ACCENT }} />
            <p className="text-sm text-white font-semibold">Drop photos here, or click to choose files</p>
            <p className="text-xs text-[#666] mt-1">JPG, PNG or WebP</p>
          </div>

          {uploading.length > 0 && (
            <div className="space-y-1.5">
              {uploading.map((u, i) => (
                <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
                  {u.status === 'uploading'
                    ? <i className="fas fa-spinner fa-spin text-[#888]" />
                    : <i className="fas fa-triangle-exclamation text-red-400" />}
                  <span className="text-[#ccc] truncate flex-1">{u.name}</span>
                  {u.status === 'error' && <span className="text-red-400 truncate">{u.error}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Grid */}
          {loading && <p className="text-sm text-[#555]">Loading…</p>}
          {!loading && photos.length === 0 && (
            <div className="text-center py-16">
              <i className="fas fa-images text-5xl mb-4 block opacity-20 text-[#555]" />
              <p className="text-sm text-[#555]">No photos yet — drop some in above.</p>
            </div>
          )}
          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map(photo => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  shows={shows}
                  uploaderName={members.nameOf(photo.uploadedBy)}
                  onToggleFeatured={() => toggleFeatured(photo)}
                  onCaptionBlur={caption => updateCaption(photo, caption)}
                  onLinkedShowChange={showId => updateLinkedShow(photo, showId)}
                  onDelete={() => handleDelete(photo)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function PhotoCard({ photo, shows, uploaderName, onToggleFeatured, onCaptionBlur, onLinkedShowChange, onDelete }) {
  const [caption, setCaption] = useState(photo.caption || '');

  return (
    <div className="rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#1a1a1a] flex flex-col">
      <div className="relative aspect-square">
        <img
          src={cloudinaryThumbUrl(photo.publicId, { width: 400, height: 400 })}
          alt={photo.caption || ''}
          className="w-full h-full object-cover"
        />
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600/80 transition-colors"
          title="Remove from gallery"
        >
          <i className="fas fa-trash text-xs" />
        </button>
        {photo.featuredForWebsite && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00ddde]/90 text-[#0f172a]">
            Featured
          </span>
        )}
      </div>
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <input
          value={caption}
          onChange={e => setCaption(e.target.value)}
          onBlur={() => onCaptionBlur(caption)}
          placeholder="Caption…"
          className="w-full px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs focus:outline-none focus:border-[#00ddde]"
        />
        <select
          value={photo.linkedShowId || ''}
          onChange={e => onLinkedShowChange(e.target.value)}
          className="w-full px-2 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-xs focus:outline-none focus:border-[#00ddde]"
        >
          <option value="">— Not linked to a show —</option>
          {shows.map(s => <option key={s.id} value={s.id}>{s.venue || s.id}</option>)}
        </select>
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <button onClick={onToggleFeatured} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: photo.featuredForWebsite ? ACCENT : '#888' }}>
            <div
              className="w-8 h-[18px] shrink-0 rounded-full transition-colors flex items-center"
              style={{ background: photo.featuredForWebsite ? ACCENT : '#2a2a2a' }}
            >
              <div className={`w-3 h-3 bg-white rounded-full transition-transform mx-0.5 ${photo.featuredForWebsite ? 'translate-x-[14px]' : 'translate-x-0'}`} />
            </div>
            Featured
          </button>
          {uploaderName && <span className="text-[10px] text-[#555] truncate" title={`Uploaded by ${uploaderName}`}>{uploaderName}</span>}
        </div>
      </div>
    </div>
  );
}

export default function PhotoGallery() {
  return (
    <AuthGuard>
      <GalleryContent />
    </AuthGuard>
  );
}
