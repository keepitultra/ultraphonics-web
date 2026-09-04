import { useState } from 'react';
import { useGalleryPhotos } from '../../firebase/useFirestore.js';
import { cloudinaryThumbUrl } from '../../utils/cloudinaryUpload.js';

/**
 * Modal for picking an existing gallery photo — used from MemberManager
 * (profile picture) and ShowManager (cover photo) instead of pasting a raw
 * URL. Admin-only: reads the whole galleryPhotos collection, which the
 * security rule permits for any allowlisted user.
 *
 * @param {{ open: boolean, onClose: () => void, onSelect: (photo: object) => void }} props
 */
export default function PhotoPickerModal({ open, onClose, onSelect }) {
  const { photos, loading } = useGalleryPhotos();
  const [search, setSearch] = useState('');

  if (!open) return null;

  const filtered = photos.filter(p =>
    !search.trim() || (p.caption || '').toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] w-full max-w-2xl rounded-xl shadow-2xl border border-[#2a2a2a] overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[#2a2a2a] gap-3">
          <p className="text-base font-bold text-white shrink-0">Choose a photo</p>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search captions..."
            className="flex-1 px-3 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-white text-sm focus:outline-none focus:border-[#00ddde]"
          />
          <button onClick={onClose} className="shrink-0 text-[#888] hover:text-white transition-colors p-1">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading && <p className="text-sm text-[#555] text-center py-8">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-12">
              <i className="fas fa-images text-4xl mb-3 block opacity-20 text-[#555]" />
              <p className="text-sm text-[#555]">
                {photos.length === 0 ? 'No photos in the gallery yet — upload some from the Gallery page.' : 'No photos match that search.'}
              </p>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filtered.map(photo => (
                <button
                  key={photo.id}
                  onClick={() => { onSelect(photo); onClose(); }}
                  className="aspect-square rounded-lg overflow-hidden border border-[#2a2a2a] hover:border-[#00ddde] transition-colors relative group"
                  title={photo.caption || ''}
                >
                  <img
                    src={cloudinaryThumbUrl(photo.publicId, { width: 200, height: 200 })}
                    alt={photo.caption || ''}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <i className="fas fa-check text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
