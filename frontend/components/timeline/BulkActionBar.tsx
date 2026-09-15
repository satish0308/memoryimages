'use client';

import React, { useState, useEffect } from 'react';
import { 
  FolderPlus, 
  Heart, 
  Trash2, 
  X, 
  ChevronUp, 
  Download, 
  Tag, 
  Plus, 
  Loader2,
  Check
} from 'lucide-react';

interface AlbumOption {
  id: number;
  name: string;
}

interface BulkActionBarProps {
  selectedIds: number[];
  apiUrl: string;
  onClearSelection: () => void;
  onBatchFavorite: () => void;
  onBatchDelete: () => void;
  onBatchCategoryUpdated?: () => void;
  onAlbumAdded?: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedIds,
  apiUrl,
  onClearSelection,
  onBatchFavorite,
  onBatchDelete,
  onBatchCategoryUpdated,
  onAlbumAdded,
}) => {
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [showAlbumMenu, setShowAlbumMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showNewAlbumInput, setShowNewAlbumInput] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  useEffect(() => {
    if (selectedIds.length > 0) {
      fetch(`${apiUrl}/api/v1/albums`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setAlbums(data))
        .catch((e) => console.error(e));
    }
  }, [selectedIds.length, apiUrl]);

  if (selectedIds.length === 0) return null;

  // Bulk Add to Existing Album
  const handleAddPhotosToAlbum = async (albumId: number) => {
    try {
      setLoadingAction('album');
      const res = await fetch(`${apiUrl}/api/v1/albums/${albumId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds }),
      });
      if (res.ok) {
        setShowAlbumMenu(false);
        onClearSelection();
        if (onAlbumAdded) onAlbumAdded();
      }
    } catch (e) {
      console.error('Error adding to album:', e);
    } finally {
      setLoadingAction(null);
    }
  };

  // Quick Create New Album & Add Selected
  const handleCreateNewAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;
    try {
      setLoadingAction('album');
      const res = await fetch(`${apiUrl}/api/v1/albums`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAlbumName.trim() }),
      });
      if (res.ok) {
        const album = await res.json();
        await handleAddPhotosToAlbum(album.id);
        setNewAlbumName('');
        setShowNewAlbumInput(false);
      }
    } catch (e) {
      console.error('Error creating album:', e);
      setLoadingAction(null);
    }
  };

  // Bulk Download ZIP of Selected Photos (Bulk copy/export)
  const handleBulkDownload = async () => {
    try {
      setLoadingAction('download');
      const res = await fetch(`${apiUrl}/api/v1/media/bulk-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mymemorypics_export_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Download error:', e);
    } finally {
      setLoadingAction(null);
    }
  };

  // Bulk Category Update
  const handleBatchCategory = async (category: string) => {
    try {
      setLoadingAction('category');
      const res = await fetch(`${apiUrl}/api/v1/media/batch-category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds, category }),
      });
      if (res.ok) {
        setShowCategoryMenu(false);
        if (onBatchCategoryUpdated) onBatchCategoryUpdated();
      }
    } catch (e) {
      console.error('Category update error:', e);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-wrap items-center gap-3 max-w-[95vw] animate-slideUp">
      {/* Selected Counter */}
      <div className="flex items-center gap-2 pr-3 border-r border-slate-700 flex-shrink-0">
        <span className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
          {selectedIds.length}
        </span>
        <span className="text-xs font-semibold text-slate-200 hidden sm:inline">
          Selected
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 relative flex-wrap">
        {/* Bulk Download (ZIP) */}
        <button
          onClick={handleBulkDownload}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
          title="Download all selected photos as a ZIP archive"
        >
          {loadingAction === 'download' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span>Export ZIP</span>
        </button>

        {/* Add to Album Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowAlbumMenu(!showAlbumMenu);
              setShowCategoryMenu(false);
            }}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Album</span>
            <ChevronUp className={`w-3 h-3 transition-transform ${showAlbumMenu ? 'rotate-180' : ''}`} />
          </button>

          {showAlbumMenu && (
            <div className="absolute bottom-full mb-2 left-0 w-56 bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-2xl space-y-1.5 z-50">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Add to Album
                </span>
                <button
                  onClick={() => setShowNewAlbumInput(!showNewAlbumInput)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  <span>New</span>
                </button>
              </div>

              {showNewAlbumInput && (
                <form onSubmit={handleCreateNewAlbum} className="px-2 py-1 space-y-1">
                  <input
                    type="text"
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    placeholder="New album title..."
                    className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-semibold"
                  >
                    Create & Add
                  </button>
                </form>
              )}

              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {albums.length === 0 ? (
                  <p className="text-xs text-slate-400 px-2 py-1">No albums found</p>
                ) : (
                  albums.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleAddPhotosToAlbum(a.id)}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-700 text-xs text-white truncate transition flex items-center justify-between"
                    >
                      <span className="truncate">{a.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Change Category / Organize Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowCategoryMenu(!showCategoryMenu);
              setShowAlbumMenu(false);
            }}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
            title="Bulk reorganize category"
          >
            <Tag className="w-3.5 h-3.5 text-emerald-400" />
            <span>Category</span>
            <ChevronUp className={`w-3 h-3 transition-transform ${showCategoryMenu ? 'rotate-180' : ''}`} />
          </button>

          {showCategoryMenu && (
            <div className="absolute bottom-full mb-2 left-0 w-48 bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-2xl space-y-1 z-50">
              <p className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                Move to Category
              </p>
              <button
                onClick={() => handleBatchCategory('memory')}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-700 text-xs text-white flex items-center gap-2"
              >
                <span>📸</span> <span>Memories</span>
              </button>
              <button
                onClick={() => handleBatchCategory('screenshot')}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-700 text-xs text-white flex items-center gap-2"
              >
                <span>📱</span> <span>Screenshots</span>
              </button>
              <button
                onClick={() => handleBatchCategory('document_bill')}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-700 text-xs text-white flex items-center gap-2"
              >
                <span>🧾</span> <span>Bills & Docs</span>
              </button>
              <button
                onClick={() => handleBatchCategory('meme_junk')}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-700 text-xs text-white flex items-center gap-2"
              >
                <span>💬</span> <span>Memes / Clutter</span>
              </button>
            </div>
          )}
        </div>

        {/* Favorite All */}
        <button
          onClick={onBatchFavorite}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
          title="Favorite All Selected"
        >
          <Heart className="w-3.5 h-3.5 text-red-400" />
          <span className="hidden sm:inline">Favorite</span>
        </button>

        {/* Delete Selected (Safe confirmation) */}
        <button
          onClick={onBatchDelete}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/90 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition"
          title="Move Selected to Trash"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        {/* Clear Selection */}
        <button
          onClick={onClearSelection}
          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition"
          title="Deselect All"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
