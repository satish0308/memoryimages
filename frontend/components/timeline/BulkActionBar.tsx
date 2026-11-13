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
  Layout,
  Film,
  Cloud,
  Search,
  Clock,
  Tv
} from 'lucide-react';
import { ShareEventModal } from '../albums/ShareEventModal';
import { HighlightReelModal } from '../studio/HighlightReelModal';
import { MediaItem } from './PhotoCard';
import { useCast } from '@/context/CastContext';

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
  onBatchBackupToDrive?: (mediaIds: number[]) => void;
  onOpenGooglePhotosHelper?: () => void;
  onRemoveFromPerson?: () => void;
  removeFromPersonLabel?: string;
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
  onBatchBackupToDrive,
  onOpenGooglePhotosHelper,
  onRemoveFromPerson,
  removeFromPersonLabel,
}) => {
  const { castPlaylist } = useCast();
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
  const [showHighlightReelModal, setShowHighlightReelModal] = useState(false);

  // Batch Time Shifter State
  const [showTimeShiftModal, setShowTimeShiftModal] = useState(false);
  const [shiftHours, setShiftHours] = useState<number>(0);
  const [shiftDays, setShiftDays] = useState<number>(0);
  const [exactDatetime, setExactDatetime] = useState<string>('');
  const [timeShiftMode, setTimeShiftMode] = useState<'relative' | 'exact'>('relative');

  const handleBatchTimeShift = async () => {
    try {
      setLoadingAction('timeshift');
      const payload: any = { media_ids: selectedIds };
      if (timeShiftMode === 'relative') {
        payload.shift_hours = shiftHours;
        payload.shift_days = shiftDays;
      } else if (exactDatetime) {
        payload.target_datetime = new Date(exactDatetime).toISOString();
      }

      const res = await fetch(`${apiUrl}/api/v1/media/batch-time-shift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowTimeShiftModal(false);
        setShiftHours(0);
        setShiftDays(0);
        setExactDatetime('');
        onClearSelection();
        if (onAlbumAdded) onAlbumAdded();
      }
    } catch (e) {
      console.error('Error shifting time:', e);
    } finally {
      setLoadingAction(null);
    }
  };

  useEffect(() => {
    // Only fetch albums once when selection begins rather than spamming on every photo click
    if (selectedIds.length > 0 && albums.length === 0) {
      fetch(`${apiUrl}/api/v1/albums`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setAlbums(data))
        .catch((e) => console.error(e));
    }
  }, [selectedIds.length > 0, albums.length, apiUrl]);

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
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] md:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white px-3 sm:px-5 py-2 sm:py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-2 sm:gap-3 max-w-[96vw] animate-slideUp overflow-x-auto no-scrollbar">
      {/* Selected Counter */}
      <div className="flex items-center gap-2 pr-2.5 sm:pr-3 border-r border-slate-700 shrink-0">
        <span className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
          {selectedIds.length}
        </span>
        <span className="text-xs font-semibold text-slate-200 hidden sm:inline">
          Selected
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2 relative flex-nowrap md:flex-wrap shrink-0">
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

        {/* 1-Click AI Highlight Reel */}
        {selectedIds.length >= 2 && selectedIds.length <= 25 && (
          <button
            onClick={() => setShowHighlightReelModal(true)}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white rounded-xl text-xs font-semibold shadow-md transition hover:scale-105"
            title="Create Cinematic Highlight Reel with Ken Burns motion & soundtrack"
          >
            <Film className="w-3.5 h-3.5 text-indigo-200" />
            <span>Highlight Reel</span>
            <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded-full font-bold">
              {selectedIds.length}
            </span>
          </button>
        )}

        {/* Cast Slideshow to Smart TV Lounge */}
        {selectedIds.length > 0 && (
          <button
            onClick={() => castPlaylist(selectedIds)}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition hover:scale-105"
            title="Cast selected photos to Smart TV Lounge as a live slideshow"
          >
            <Tv className="w-3.5 h-3.5 text-blue-200" />
            <span>Cast Slideshow</span>
            <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded-full font-bold">
              {selectedIds.length}
            </span>
          </button>
        )}

        {/* Google Drive Bulk Backup */}
        {onBatchBackupToDrive && (
          <button
            onClick={() => onBatchBackupToDrive(selectedIds)}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-300 hover:text-white border border-indigo-700/50 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            title="Backup selected photos to Google Drive with lossless quality"
          >
            <Cloud className="w-3.5 h-3.5 text-indigo-400" />
            <span>Backup to Drive</span>
            <span className="text-[10px] bg-indigo-800 text-indigo-200 px-1.5 py-0.2 rounded-full font-bold">
              {selectedIds.length}
            </span>
          </button>
        )}

        {/* Google Photos Cloud Deletion Query Helper */}
        {onOpenGooglePhotosHelper && (
          <button
            onClick={onOpenGooglePhotosHelper}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-200 hover:text-white border border-indigo-600/50 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            title="Search and trash selected photos in Google Photos cloud"
          >
            <Search className="w-3.5 h-3.5 text-indigo-300" />
            <span>Google Photos Query</span>
            <span className="text-[10px] bg-indigo-700 text-indigo-100 px-1.5 py-0.2 rounded-full font-bold">
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

        {/* Time Shifter Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowTimeShiftModal(!showTimeShiftModal);
              setShowLocationModal(false);
              setShowCategoryMenu(false);
              setShowAlbumMenu(false);
            }}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
            title="Adjust captured date or fix camera clock drift"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Time Shift</span>
            <ChevronUp className={`w-3 h-3 transition-transform ${showTimeShiftModal ? 'rotate-180' : ''}`} />
          </button>

          {showTimeShiftModal && (
            <div className="absolute bottom-full mb-2 left-0 w-80 bg-slate-800 border border-slate-700 rounded-xl p-3.5 shadow-2xl space-y-3 z-50">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-slate-400">
                  Batch Time Shifter ({selectedIds.length} photos)
                </p>
                <button
                  onClick={() => setShowTimeShiftModal(false)}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Mode switch */}
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setTimeShiftMode('relative')}
                  className={`flex-1 py-1 rounded text-[11px] font-semibold transition ${
                    timeShiftMode === 'relative' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Relative Shift (±)
                </button>
                <button
                  type="button"
                  onClick={() => setTimeShiftMode('exact')}
                  className={`flex-1 py-1 rounded text-[11px] font-semibold transition ${
                    timeShiftMode === 'exact' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Exact Date
                </button>
              </div>

              {timeShiftMode === 'relative' ? (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-400">Quick Clock Drift Presets:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShiftHours((h) => h + 1)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-700 rounded text-[11px] text-cyan-300 font-mono text-center"
                    >
                      +1 Hour
                    </button>
                    <button
                      type="button"
                      onClick={() => setShiftHours((h) => h - 1)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-700 rounded text-[11px] text-cyan-300 font-mono text-center"
                    >
                      -1 Hour
                    </button>
                    <button
                      type="button"
                      onClick={() => setShiftDays((d) => d + 1)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-700 rounded text-[11px] text-indigo-300 font-mono text-center"
                    >
                      +1 Day
                    </button>
                    <button
                      type="button"
                      onClick={() => setShiftDays((d) => d - 1)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-700 rounded text-[11px] text-indigo-300 font-mono text-center"
                    >
                      -1 Day
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Shift Hours</label>
                      <input
                        type="number"
                        value={shiftHours}
                        onChange={(e) => setShiftHours(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Shift Days</label>
                      <input
                        type="number"
                        value={shiftDays}
                        onChange={(e) => setShiftDays(parseInt(e.target.value, 10) || 0)}
                        className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-[10px] text-slate-400">Target Timestamp</label>
                  <input
                    type="datetime-local"
                    value={exactDatetime}
                    onChange={(e) => setExactDatetime(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-white"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleBatchTimeShift}
                disabled={loadingAction === 'timeshift' || (timeShiftMode === 'relative' && shiftHours === 0 && shiftDays === 0) || (timeShiftMode === 'exact' && !exactDatetime)}
                className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-[11px] font-semibold transition flex items-center justify-center gap-1.5"
              >
                {loadingAction === 'timeshift' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                <span>Apply Time Shift</span>
              </button>
            </div>
          )}
        </div>

        {/* Remove from Person / Not this person */}
        {onRemoveFromPerson && (
          <button
            onClick={onRemoveFromPerson}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/90 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition shadow-xs"
            title="Remove selected photos from this person (keeps photos in library)"
          >
            <X className="w-3.5 h-3.5 text-amber-200" />
            <span>{removeFromPersonLabel || 'Not This Person'}</span>
          </button>
        )}

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

      {/* AI Highlight Reel Studio Modal */}
      {showHighlightReelModal && (
        <HighlightReelModal
          isOpen={showHighlightReelModal}
          onClose={() => setShowHighlightReelModal(false)}
          title="Highlight Reel"
          subtitle={`${selectedIds.length} Selected Moments`}
          items={selectedPhotos.length ? selectedPhotos : selectedIds.map((id) => ({ id } as MediaItem))}
        />
      )}
    </div>
  );
};
