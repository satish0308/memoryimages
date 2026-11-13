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
  const [activeMenu, setActiveMenu] = useState<'album' | 'category' | 'location' | 'enhance' | 'timeshift' | null>(null);
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
  const [shiftHours, setShiftHours] = useState<number>(0);
  const [shiftDays, setShiftDays] = useState<number>(0);
  const [exactDatetime, setExactDatetime] = useState<string>('');
  const [timeShiftMode, setTimeShiftMode] = useState<'relative' | 'exact'>('relative');

  // Fetch albums when selection begins
  useEffect(() => {
    if (selectedIds && selectedIds.length > 0 && albums.length === 0) {
      fetch(`${apiUrl}/api/v1/albums`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setAlbums(data))
        .catch((e) => console.error(e));
    }
  }, [selectedIds, albums.length, apiUrl]);

  // Early return if no photos selected
  if (!selectedIds || selectedIds.length === 0) {
    return null;
  }

  const toggleMenu = (menu: 'album' | 'category' | 'location' | 'enhance' | 'timeshift') => {
    setActiveMenu((prev) => (prev === menu ? null : menu));
  };

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
        setActiveMenu(null);
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
        setActiveMenu(null);
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
        setActiveMenu(null);
        onClearSelection();
        if (onBatchLocationUpdated) onBatchLocationUpdated();
      }
    } catch (e) {
      console.error('Error propagating locations:', e);
    } finally {
      setLoadingAction(null);
    }
  };

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
        setActiveMenu(null);
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

  // Bulk Download ZIP
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
      setActiveMenu(null);
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
        setActiveMenu(null);
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
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[96vw] w-max animate-slideUp">
      {/* =========================================================================
          MAIN FLOATING ACTION BAR PILL (Centrally Aligned & Responsive)
         ========================================================================= */}
      <div className="bg-slate-900/95 dark:bg-neutral-900/95 backdrop-blur-xl text-white px-2.5 sm:px-4 py-2 rounded-2xl sm:rounded-full shadow-2xl border border-slate-700/80 flex items-center justify-center gap-1.5 sm:gap-2 max-w-[96vw] overflow-x-auto no-scrollbar momentum-scroll">
        
        {/* Selection Count Badge & Clear (X) Button */}
        <div className="flex items-center gap-1.5 pr-2 sm:pr-3 border-r border-slate-700/80 shrink-0">
          <span className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-xs">
            {selectedIds.length}
          </span>
          <span className="text-xs font-semibold text-slate-200 hidden sm:inline">
            Selected
          </span>
          <button
            onClick={onClearSelection}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition ml-0.5"
            title="Deselect All (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* =========================================================================
            CORE HERO ACTION BUTTONS (Delete, Favorite, Backup, Share, Cast, Export)
           ========================================================================= */}
        
        {/* 1. Delete (Danger Action - High Priority Front Placement) */}
        <button
          onClick={onBatchDelete}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-sm hover:scale-[1.02] shrink-0"
          title="Move Selected to Trash"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        {/* 2. Favorite All */}
        <button
          onClick={onBatchFavorite}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition shrink-0"
          title="Favorite All Selected"
        >
          <Heart className="w-3.5 h-3.5 text-rose-400" />
          <span className="hidden sm:inline">Favorite</span>
        </button>

        {/* 3. Google Drive Bulk Backup */}
        {onBatchBackupToDrive && (
          <button
            onClick={() => onBatchBackupToDrive(selectedIds)}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/90 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-700/60 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50 shrink-0"
            title="Backup selected photos to Google Drive"
          >
            <Cloud className="w-3.5 h-3.5 text-indigo-400" />
            <span>Backup</span>
          </button>
        )}

        {/* 4. Instant Share Link */}
        <button
          onClick={handleBatchShare}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50 shrink-0"
          title="Share selected photos via an instant public link & QR code"
        >
          {loadingAction === 'share' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Share2 className="w-3.5 h-3.5 text-white" />
          )}
          <span>Share</span>
        </button>

        {/* 5. Cast Slideshow to Smart TV Lounge */}
        <button
          onClick={() => castPlaylist(selectedIds)}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm transition shrink-0"
          title="Cast selected photos to Smart TV Lounge as a live slideshow"
        >
          <Tv className="w-3.5 h-3.5 text-blue-200" />
          <span>Cast</span>
        </button>

        {/* 6. Export ZIP Archive */}
        <button
          onClick={handleBulkDownload}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50 shrink-0"
          title="Download all selected photos as a ZIP archive"
        >
          {loadingAction === 'download' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span className="hidden sm:inline">Export</span>
        </button>

        {/* Divider between core actions and organization tools */}
        <div className="w-px h-5 bg-slate-700/80 mx-0.5 shrink-0" />

        {/* =========================================================================
            ORGANIZATION & EDIT DROPDOWN TRIGGERS
           ========================================================================= */}

        {/* Album Dropdown Trigger */}
        <button
          onClick={() => toggleMenu('album')}
          disabled={loadingAction !== null}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            activeMenu === 'album'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title="Add to Album"
        >
          <FolderPlus className="w-3.5 h-3.5 text-indigo-400" />
          <span>Album</span>
          <ChevronUp className={`w-3 h-3 transition-transform ${activeMenu === 'album' ? 'rotate-180' : ''}`} />
        </button>

        {/* Category Dropdown Trigger */}
        <button
          onClick={() => toggleMenu('category')}
          disabled={loadingAction !== null}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            activeMenu === 'category'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title="Change Category"
        >
          <Tag className="w-3.5 h-3.5 text-emerald-400" />
          <span>Category</span>
          <ChevronUp className={`w-3 h-3 transition-transform ${activeMenu === 'category' ? 'rotate-180' : ''}`} />
        </button>

        {/* AI Enhance Dropdown Trigger */}
        <button
          onClick={() => toggleMenu('enhance')}
          disabled={loadingAction !== null}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            activeMenu === 'enhance'
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title="AI Image Enhancement"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>Enhance</span>
          <ChevronUp className={`w-3 h-3 transition-transform ${activeMenu === 'enhance' ? 'rotate-180' : ''}`} />
        </button>

        {/* Location Dropdown Trigger */}
        <button
          onClick={() => toggleMenu('location')}
          disabled={loadingAction !== null}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            activeMenu === 'location'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title="Assign Location or Propagate Geotags"
        >
          <MapPin className="w-3.5 h-3.5 text-emerald-400" />
          <span>Location</span>
          <ChevronUp className={`w-3 h-3 transition-transform ${activeMenu === 'location' ? 'rotate-180' : ''}`} />
        </button>

        {/* Time Shift Dropdown Trigger */}
        <button
          onClick={() => toggleMenu('timeshift')}
          disabled={loadingAction !== null}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            activeMenu === 'timeshift'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title="Adjust Captured Date or Camera Clock Drift"
        >
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span>Time Shift</span>
          <ChevronUp className={`w-3 h-3 transition-transform ${activeMenu === 'timeshift' ? 'rotate-180' : ''}`} />
        </button>

        {/* 1-Click Creative Collage & Print Studio */}
        {selectedIds.length >= 2 && selectedIds.length <= 16 && (
          <button
            onClick={() => {
              const url = `/collage?ids=${selectedIds.join(',')}`;
              window.open(url, '_blank') || window.location.assign(url);
            }}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition hover:scale-105 shrink-0"
            title="Open Creative Collage & Print Studio in dedicated full page"
          >
            <Layout className="w-3.5 h-3.5 text-pink-200" />
            <span>Collage</span>
          </button>
        )}

        {/* 1-Click AI Highlight Reel */}
        {selectedIds.length >= 2 && selectedIds.length <= 25 && (
          <button
            onClick={() => setShowHighlightReelModal(true)}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white rounded-xl text-xs font-semibold shadow-md transition hover:scale-105 shrink-0"
            title="Create Cinematic Highlight Reel with Ken Burns motion & soundtrack"
          >
            <Film className="w-3.5 h-3.5 text-indigo-200" />
            <span>Reel</span>
          </button>
        )}

        {/* Google Photos Cloud Deletion Query Helper */}
        {onOpenGooglePhotosHelper && (
          <button
            onClick={onOpenGooglePhotosHelper}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 hover:text-white border border-indigo-600/50 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50 shrink-0"
            title="Search and trash selected photos in Google Photos cloud"
          >
            <Search className="w-3.5 h-3.5 text-indigo-300" />
            <span>GPhotos</span>
          </button>
        )}

        {/* Remove from Person / Not This Person */}
        {onRemoveFromPerson && (
          <button
            onClick={onRemoveFromPerson}
            disabled={loadingAction !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/90 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition shadow-xs shrink-0"
            title="Remove selected photos from this person"
          >
            <X className="w-3.5 h-3.5 text-amber-200" />
            <span>{removeFromPersonLabel || 'Not This Person'}</span>
          </button>
        )}
      </div>

      {/* =========================================================================
          POPOVER MENUS (Rendered Outside the Scrollable Track to Eliminate Clipping)
         ========================================================================= */}
      {activeMenu && (
        <>
          {/* Backdrop to close menu on outside click */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveMenu(null)}
          />

          {/* Floating Centered Menu Container */}
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+8.5rem)] md:bottom-20 left-1/2 -translate-x-1/2 z-50 w-[92vw] sm:w-auto min-w-[300px] max-w-sm bg-slate-900 border border-slate-700/80 rounded-2xl p-3 shadow-2xl text-white animate-fadeIn">
            
            {/* Header with Title and Close Button */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {activeMenu === 'album' && 'Add to Album'}
                {activeMenu === 'category' && 'Move to Category'}
                {activeMenu === 'enhance' && 'AI Image Enhancement'}
                {activeMenu === 'location' && 'Assign Location'}
                {activeMenu === 'timeshift' && 'Batch Time Shifter'}
              </span>
              <button
                onClick={() => setActiveMenu(null)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 1. Album Menu Content */}
            {activeMenu === 'album' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] text-slate-400">Select an album or create new:</span>
                  <button
                    onClick={() => setShowNewAlbumInput(!showNewAlbumInput)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Album</span>
                  </button>
                </div>

                {showNewAlbumInput && (
                  <form onSubmit={handleCreateNewAlbum} className="space-y-1.5 p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                    <input
                      type="text"
                      value={newAlbumName}
                      onChange={(e) => setNewAlbumName(e.target.value)}
                      placeholder="New album title..."
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!newAlbumName.trim()}
                      className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition"
                    >
                      Create & Add {selectedIds.length} Photos
                    </button>
                  </form>
                )}

                <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                  {albums.length === 0 ? (
                    <p className="text-xs text-slate-400 p-2 text-center">No albums found</p>
                  ) : (
                    albums.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => handleAddPhotosToAlbum(a.id)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-white truncate transition flex items-center justify-between border border-transparent hover:border-slate-700"
                      >
                        <span className="truncate font-medium">{a.name}</span>
                        <Plus className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-2" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 2. Category Menu Content */}
            {activeMenu === 'category' && (
              <div className="space-y-1.5">
                <button
                  onClick={() => handleBatchCategory('memory')}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-white flex items-center gap-2.5 transition border border-transparent hover:border-slate-700"
                >
                  <span className="text-base">📸</span>
                  <div>
                    <p className="font-semibold text-slate-200">Memories</p>
                    <p className="text-[10px] text-slate-400">Regular camera photos & family moments</p>
                  </div>
                </button>
                <button
                  onClick={() => handleBatchCategory('screenshot')}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-white flex items-center gap-2.5 transition border border-transparent hover:border-slate-700"
                >
                  <span className="text-base">📱</span>
                  <div>
                    <p className="font-semibold text-slate-200">Screenshots</p>
                    <p className="text-[10px] text-slate-400">App captures & screen recordings</p>
                  </div>
                </button>
                <button
                  onClick={() => handleBatchCategory('document_bill')}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-white flex items-center gap-2.5 transition border border-transparent hover:border-slate-700"
                >
                  <span className="text-base">🧾</span>
                  <div>
                    <p className="font-semibold text-slate-200">Bills & Documents</p>
                    <p className="text-[10px] text-slate-400">Receipts, bills, and OCR documents</p>
                  </div>
                </button>
                <button
                  onClick={() => handleBatchCategory('meme_junk')}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-white flex items-center gap-2.5 transition border border-transparent hover:border-slate-700"
                >
                  <span className="text-base">💬</span>
                  <div>
                    <p className="font-semibold text-slate-200">Memes / Clutter</p>
                    <p className="text-[10px] text-slate-400">Forwarded graphics & jokes</p>
                  </div>
                </button>
              </div>
            )}

            {/* 3. AI Enhance Menu Content */}
            {activeMenu === 'enhance' && (
              <div className="space-y-1.5">
                <button
                  onClick={() => handleBatchEnhance('auto_magic')}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-white flex items-center gap-2.5 transition border border-transparent hover:border-slate-700"
                >
                  <span className="text-base">🪄</span>
                  <div>
                    <p className="font-semibold text-slate-200">Auto Magic Balance</p>
                    <p className="text-[10px] text-slate-400">Gray-World AWB + CLAHE contrast boost</p>
                  </div>
                </button>
                <button
                  onClick={() => handleBatchEnhance('shadow_lift')}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-white flex items-center gap-2.5 transition border border-transparent hover:border-slate-700"
                >
                  <span className="text-base">☀️</span>
                  <div>
                    <p className="font-semibold text-slate-200">Shadow Recovery</p>
                    <p className="text-[10px] text-slate-400">Brightens backlit & dark faces</p>
                  </div>
                </button>
                <button
                  onClick={() => handleBatchEnhance('dehaze')}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-white flex items-center gap-2.5 transition border border-transparent hover:border-slate-700"
                >
                  <span className="text-base">🌫️</span>
                  <div>
                    <p className="font-semibold text-slate-200">De-Haze & Clear Sky</p>
                    <p className="text-[10px] text-slate-400">Removes atmospheric haze & fog</p>
                  </div>
                </button>
                <div className="h-px bg-slate-800 my-1" />
                <button
                  onClick={() => handleBatchEnhance('revert')}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-rose-300 flex items-center gap-2.5 transition border border-transparent hover:border-slate-700"
                >
                  <span className="text-base">↩️</span>
                  <div>
                    <p className="font-semibold text-rose-300">Revert to Original</p>
                    <p className="text-[10px] text-slate-400">Reset adjustments back to masters</p>
                  </div>
                </button>
              </div>
            )}

            {/* 4. Location Menu Content */}
            {activeMenu === 'location' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Quick Place Presets:</p>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => handleBatchLocation('Pottalkulam, Tamil Nadu, India', 8.077913, 77.551231)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-950/60 hover:bg-slate-800 text-xs text-emerald-300 font-medium flex items-center justify-between transition"
                    >
                      <span>📍 Kanyakumari / Pottalkulam</span>
                      <span className="text-[10px] text-slate-400">Sunrise</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchLocation('Bengaluru, Karnataka, India', 12.931643, 77.545616)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-950/60 hover:bg-slate-800 text-xs text-indigo-300 font-medium flex items-center justify-between transition"
                    >
                      <span>📍 Bengaluru, Karnataka</span>
                      <span className="text-[10px] text-slate-400">Tech Hub</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchLocation('Thalaiyuthu, Tamil Nadu, India', 8.727996, 77.686714)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-950/60 hover:bg-slate-800 text-xs text-amber-300 font-medium flex items-center justify-between transition"
                    >
                      <span>📍 Thalaiyuthu / Tirunelveli</span>
                      <span className="text-[10px] text-slate-400">Heritage</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <input
                    type="text"
                    placeholder="Custom city or location name..."
                    value={customLocName}
                    onChange={(e) => setCustomLocName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Lat (e.g. 12.97)"
                      value={customLat}
                      onChange={(e) => setCustomLat(e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-[11px]"
                    />
                    <input
                      type="text"
                      placeholder="Lon (e.g. 77.59)"
                      value={customLon}
                      onChange={(e) => setCustomLon(e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-[11px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBatchLocation(customLocName, customLat ? parseFloat(customLat) : undefined, customLon ? parseFloat(customLon) : undefined)}
                    disabled={!customLocName.trim() && (!customLat || !customLon)}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-xs"
                  >
                    Apply Custom Location
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={handlePropagateLocations}
                    className="w-full py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Auto-Link Outing Geotags</span>
                  </button>
                </div>
              </div>
            )}

            {/* 5. Time Shifter Menu Content */}
            {activeMenu === 'timeshift' && (
              <div className="space-y-3">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTimeShiftMode('relative')}
                    className={`flex-1 py-1 rounded-lg text-xs font-semibold transition ${
                      timeShiftMode === 'relative' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Relative Shift (±)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeShiftMode('exact')}
                    className={`flex-1 py-1 rounded-lg text-xs font-semibold transition ${
                      timeShiftMode === 'exact' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Exact Date
                  </button>
                </div>

                {timeShiftMode === 'relative' ? (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Quick Clock Drift Presets:</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShiftHours((h) => h + 1)}
                        className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-cyan-300 font-mono text-center transition"
                      >
                        +1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => setShiftHours((h) => h - 1)}
                        className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-cyan-300 font-mono text-center transition"
                      >
                        -1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => setShiftDays((d) => d + 1)}
                        className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-indigo-300 font-mono text-center transition"
                      >
                        +1 Day
                      </button>
                      <button
                        type="button"
                        onClick={() => setShiftDays((d) => d - 1)}
                        className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-indigo-300 font-mono text-center transition"
                      >
                        -1 Day
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Shift Hours</label>
                        <input
                          type="number"
                          value={shiftHours}
                          onChange={(e) => setShiftHours(parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Shift Days</label>
                        <input
                          type="number"
                          value={shiftDays}
                          onChange={(e) => setShiftDays(parseInt(e.target.value, 10) || 0)}
                          className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
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
                      className="w-full px-2.5 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleBatchTimeShift}
                  disabled={loadingAction === 'timeshift' || (timeShiftMode === 'relative' && shiftHours === 0 && shiftDays === 0) || (timeShiftMode === 'exact' && !exactDatetime)}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {loadingAction === 'timeshift' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                  <span>Apply Time Shift</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

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
