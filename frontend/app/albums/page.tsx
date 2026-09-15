'use client';

import { useState, useEffect } from 'react';
import { FolderPlus, BookOpen, Trash2, ArrowLeft, Image as ImageIcon, Plus } from 'lucide-react';
import { PhotoCard, MediaItem } from '@/components/timeline/PhotoCard';
import { LightboxModal } from '@/components/timeline/LightboxModal';

interface AlbumItem {
  id: number;
  name: string;
  description: string | null;
  photo_count: number;
  cover_thumbnail_url: string | null;
  created_at: string;
}

interface AlbumDetail extends AlbumItem {
  photos: MediaItem[];
}

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumDetail | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [newAlbumDesc, setNewAlbumDesc] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchAlbums = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/albums`);
      if (res.ok) setAlbums(await res.json());
    } catch (e) {
      console.error('Error fetching albums:', e);
    } finally {
      setLoading(false);
    }
  };

  const openAlbum = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/albums/${id}`);
      if (res.ok) setSelectedAlbum(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;

    try {
      const res = await fetch(`${API_URL}/api/v1/albums`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAlbumName.trim(), description: newAlbumDesc.trim() || null })
      });
      if (res.ok) {
        setNewAlbumName('');
        setNewAlbumDesc('');
        setShowCreateModal(false);
        fetchAlbums();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAlbum = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this album? (Photos will remain safely in your library)')) return;

    try {
      const res = await fetch(`${API_URL}/api/v1/albums/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedAlbum && selectedAlbum.id === id) setSelectedAlbum(null);
        fetchAlbums();
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAlbums();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedAlbum && (
            <button
              onClick={() => setSelectedAlbum(null)}
              className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition"
              title="Back to Albums"
            >
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              {selectedAlbum ? selectedAlbum.name : 'Albums & Collections'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedAlbum
                ? `${selectedAlbum.photo_count} photos in this album`
                : 'Create smart custom sets for vacations, family events, and projects'}
            </p>
          </div>
        </div>

        {!selectedAlbum && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Create Album
          </button>
        )}
      </div>

      {/* Albums Grid */}
      {!selectedAlbum && (
        <>
          {albums.length === 0 && !loading && (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                <FolderPlus className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-slate-800 text-sm">No Albums Yet</h3>
              <p className="text-xs text-slate-500">
                Click "Create Album" above to start grouping your favorite memories together.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {albums.map((album) => (
              <div
                key={album.id}
                onClick={() => openAlbum(album.id)}
                className="group bg-white border border-slate-200 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition flex flex-col"
              >
                {/* Album Cover Photo */}
                <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
                  {album.cover_thumbnail_url ? (
                    <img
                      src={`${API_URL}${album.cover_thumbnail_url}`}
                      alt={album.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                  )}

                  {/* Delete Button on Hover */}
                  <button
                    onClick={(e) => handleDeleteAlbum(album.id, e)}
                    className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition backdrop-blur-sm"
                    title="Delete Album"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Album Info */}
                <div className="p-3">
                  <h4 className="font-semibold text-xs text-slate-800 truncate group-hover:text-indigo-600 transition">
                    {album.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {album.photo_count} photo{album.photo_count !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Album Photos View */}
      {selectedAlbum && (
        <div className="space-y-4">
          {selectedAlbum.photos.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs">
              No photos currently added to this album.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {selectedAlbum.photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  item={photo}
                  apiUrl={API_URL}
                  onSelect={setSelectedPhoto}
                  onToggleFavorite={() => {}}
                  onDelete={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Album Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateAlbum}
            className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl animate-fadeIn"
          >
            <h3 className="font-bold text-sm text-slate-900">Create New Album</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Album Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Summer Vacation, Family Trip"
                  value={newAlbumName}
                  onChange={(e) => setNewAlbumName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Description (Optional)</label>
                <textarea
                  placeholder="What is this collection about?"
                  value={newAlbumDesc}
                  onChange={(e) => setNewAlbumDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lightbox Modal */}
      <LightboxModal
        photo={selectedPhoto}
        apiUrl={API_URL}
        onClose={() => setSelectedPhoto(null)}
        onToggleFavorite={() => {}}
        onDelete={() => {}}
      />
    </div>
  );
}
