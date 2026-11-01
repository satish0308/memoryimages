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
  Check, 
  MapPin, 
  Sparkles, 
  Share2,
  Layout
} from 'lucide-react';
import { ShareEventModal } from '../albums/ShareEventModal';
import { MediaItem } from './PhotoCard';

interface AlbumOption {
  id: number;
  name: string;
}

interface BulkActionBarProps {
  selectedIds: number[];
  selectedPhotos?: MediaItem[];
  apiUrl: string;
  onClearSelection: () => void;
  onBatchFavorite: () => void;
  onBatchDelete: () => void;
  onBatchCategoryUpdated?: () => void;
  onAlbumAdded?: () => void;
  onBatchLocationUpdated?: () => void;
  onBatchEnhanced?: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedIds,
  selectedPhotos = [],
  apiUrl,
  onClearSelection,
  onBatchFavorite,
  onBatchDelete,
  onBatchCategoryUpdated,
  onAlbumAdded,
  onBatchLocationUpdated,
  onBatchEnhanced,
}) => {
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [showAlbumMenu, setShowAlbumMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showEnhanceMenu, setShowEnhanceMenu] = useState(false);
  const [customLocName, setCustomLocName] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLon, setCustomLon] = useState('');
  const [showNewAlbumInput, setShowNewAlbumInput] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [sharedAlbum, setSharedAlbum] = useState<{
    id: number;
    name: string;
    share_token?: string | null;
    is_public?: boolean;
    allow_guest_uploads?: boolean;
  } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    if (selectedIds.length > 0) {
      fetch(`${apiUrl}/api/v1/albums`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setAlbums(data))
        .catch((e) => console.error(e));
    }
  }, [selectedIds.length, apiUrl]);

  const handleBatchLocation = async (locName: string, lat?: number, lon?: number) => {
    try {
      setLoadingAction('location');
      const res = await fetch(`${apiUrl}/api/v1/media/batch-location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_ids: selectedIds,
          location_name: locName || null,
          latitude: lat ?? null,
          longitude: lon ?? null,
        }),
      });
      if (res.ok) {
        setShowLocationModal(false);
        setCustomLocName('');
        setCustomLat('');
        setCustomLon('');
        onClearSelection();
        if (onBatchLocationUpdated) onBatchLocationUpdated();
      }
    } catch (e) {
      console.error('Error updating locations:', e);
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePropagateLocations = async () => {
    try {
      setLoadingAction('propagate');
      const res = await fetch(`${apiUrl}/api/v1/media/propagate-locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_gap_hours: 4.0 }),
      });
      if (res.ok) {
        setShowLocationModal(false);
        onClearSelection();
        if (onBatchLocationUpdated) onBatchLocationUpdated();
      }
    } catch (e) {
      console.error('Error propagating locations:', e);
    } finally {
      setLoadingAction(null);
    }
  };

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
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      const res = await fetch(`${apiUrl}/api/v1/media/bulk-download${tokenParam}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ media_ids: selectedIds, preset: 'optimized' }),
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

  // Bulk AI Photo Enhancement
  const handleBatchEnhance = async (preset: string = 'auto_magic') => {
    try {
      setLoadingAction('enhance');
      setShowEnhanceMenu(false);
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      const res = await fetch(`${apiUrl}/api/v1/media/batch-enhance${tokenParam}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          media_ids: selectedIds,
          preset: preset,
        }),
      });

      if (res.ok) {
        if (onBatchEnhanced) onBatchEnhanced();
        onClearSelection();
      }
    } catch (e) {
      console.error('Batch enhance error:', e);
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

  // Bulk Instant Bundle Share
  const handleBatchShare = async () => {
    try {
      setLoadingAction('share');
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      const res = await fetch(`${apiUrl}/api/v1/media/batch-share${tokenParam}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ media_ids: selectedIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setSharedAlbum({
          id: data.album_id,
          name: data.name,
          share_token: data.share_token,
          is_public: true,
          allow_guest_uploads: false,
        });
        setShowShareModal(true);
        if (onAlbumAdded) onAlbumAdded();
      }
    } catch (e) {
      console.error('Batch share error:', e);
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
        {/* Bulk Share */}
        <button
          onClick={handleBatchShare}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
          title="Share selected photos via an instant public link & QR code"
        >
          {loadingAction === 'share' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Share2 className="w-3.5 h-3.5 text-white" />
          )}
          <span>Share</span>
        </button>

        {/* 1-Click Creative Collage & Print Studio */}
        {selectedIds.length >= 2 && selectedIds.length <= 16 && (
          <button
            onClick={() => {
              const url = `/collage?ids=${selectedIds.join(',')}`;
              window.open(url, '_blank') || window.location.assign(url);
            }}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition hover:scale-105"
            title="Open Creative Collage & Print Studio in dedicated full page / tab"
          >
            <Layout className="w-3.5 h-3.5 text-pink-200" />
            <span>Collage Studio</span>
            <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded-full font-bold">
              {selectedIds.length}
            </span>
          </button>
        )}

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

        {/* Bulk AI Enhance Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowEnhanceMenu(!showEnhanceMenu);
              setShowAlbumMenu(false);
              setShowCategoryMenu(false);
              setShowLocationModal(false);
            }}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            title="Auto-enhance lighting, shadows, and clarity across selected photos"
          >
            {loadingAction === 'enhance' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>AI Enhance</span>
            <ChevronUp className={`w-3 h-3 transition-transform ${showEnhanceMenu ? 'rotate-180' : ''}`} />
          </button>

          {showEnhanceMenu && (
            <div className="absolute bottom-full mb-2 left-0 w-60 bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-2xl space-y-1 z-50 animate-fadeIn">
              <p className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                AI Enhancement ({selectedIds.length} photos)
              </p>
              <button
                onClick={() => handleBatchEnhance('auto_magic')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-700 text-xs text-white flex items-center gap-2 transition"
              >
                <span>🪄</span>
                <div>
                  <p className="font-semibold text-slate-200">Auto Magic Balance</p>
                  <p className="text-[10px] text-slate-400">Gray-World AWB + CLAHE contrast</p>
                </div>
              </button>
              <button
                onClick={() => handleBatchEnhance('shadow_lift')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-700 text-xs text-white flex items-center gap-2 transition"
              >
                <span>☀️</span>
                <div>
                  <p className="font-semibold text-slate-200">Shadow Recovery</p>
                  <p className="text-[10px] text-slate-400">Brightens backlit & dark faces</p>
                </div>
              </button>
              <button
                onClick={() => handleBatchEnhance('dehaze')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-700 text-xs text-white flex items-center gap-2 transition"
              >
                <span>🌫️</span>
                <div>
                  <p className="font-semibold text-slate-200">De-Haze & Clear Sky</p>
                  <p className="text-[10px] text-slate-400">Removes atmospheric fog</p>
                </div>
              </button>
              <div className="h-px bg-slate-700 my-1" />
              <button
                onClick={() => handleBatchEnhance('revert')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-700 text-xs text-rose-300 flex items-center gap-2 transition"
              >
                <span>↩️</span>
                <span>Revert to Original (Reset)</span>
              </button>
            </div>
          )}
        </div>

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

        {/* Location & Places Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowLocationModal(!showLocationModal);
              setShowCategoryMenu(false);
              setShowAlbumMenu(false);
            }}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
            title="Bulk assign location or propagate geotags"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>Location</span>
            <ChevronUp className={`w-3 h-3 transition-transform ${showLocationModal ? 'rotate-180' : ''}`} />
          </button>

          {showLocationModal && (
            <div className="absolute bottom-full mb-2 left-0 w-72 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl space-y-3 z-50">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-slate-400">
                  Assign Location ({selectedIds.length} photos)
                </p>
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Quick Trip Place Presets */}
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400">Trip & Outing Presets:</p>
                <button
                  type="button"
                  onClick={() => handleBatchLocation('Pottalkulam, Tamil Nadu, India', 8.077913, 77.551231)}
                  className="w-full text-left px-2 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-700 text-[11px] text-emerald-300 font-medium flex items-center justify-between"
                >
                  <span>📍 Kanyakumari / Pottalkulam</span>
                  <span className="text-[9px] text-slate-400">Sunrise</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchLocation('Bengaluru, Karnataka, India', 12.931643, 77.545616)}
                  className="w-full text-left px-2 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-700 text-[11px] text-indigo-300 font-medium flex items-center justify-between"
                >
                  <span>📍 Bengaluru, Karnataka</span>
                  <span className="text-[9px] text-slate-400">Sept 22</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchLocation('Thalaiyuthu, Tamil Nadu, India', 8.727996, 77.686714)}
                  className="w-full text-left px-2 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-700 text-[11px] text-amber-300 font-medium flex items-center justify-between"
                >
                  <span>📍 Thalaiyuthu / Tirunelveli</span>
                  <span className="text-[9px] text-slate-400">Oct 24</span>
                </button>
              </div>

              {/* Custom Place Input */}
              <div className="space-y-1.5 pt-1 border-t border-slate-700/60">
                <input
                  type="text"
                  placeholder="Custom city or place name..."
                  value={customLocName}
                  onChange={(e) => setCustomLocName(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-emerald-500"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Lat (opt)"
                    value={customLat}
                    onChange={(e) => setCustomLat(e.target.value)}
                    className="w-1/2 px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-emerald-500 font-mono text-[10px]"
                  />
                  <input
                    type="text"
                    placeholder="Lon (opt)"
                    value={customLon}
                    onChange={(e) => setCustomLon(e.target.value)}
                    className="w-1/2 px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-emerald-500 font-mono text-[10px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleBatchLocation(customLocName, customLat ? parseFloat(customLat) : undefined, customLon ? parseFloat(customLon) : undefined)}
                  disabled={!customLocName.trim() && (!customLat || !customLon)}
                  className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-[11px] font-semibold transition"
                >
                  Apply Custom Location
                </button>
              </div>

              {/* 1-Click Outing Propagation */}
              <div className="pt-1 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={handlePropagateLocations}
                  className="w-full py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Auto-Link Outing Geotags</span>
                </button>
              </div>
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

      {/* Instant Bundle Share Modal */}
      <ShareEventModal
        album={sharedAlbum}
        apiUrl={apiUrl}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShareUpdated={() => {}}
      />
    </div>
  );
};
