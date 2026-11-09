'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getApiUrl } from '@/utils/apiUrl';
import { 
  Sparkles, 
  ArrowLeft, 
  Layers, 
  Users, 
  MapPin, 
  Calendar, 
  Image as ImageIcon, 
  Download, 
  Play, 
  Check, 
  X,
  Trash2, 
  ExternalLink,
  Camera,
  Compass,
  Info,
  CheckCircle2,
  Clock,
  Search
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { AmbientSlideshowModal } from '@/components/timeline/AmbientSlideshowModal';
import { BulkDeleteModal } from '@/components/timeline/BulkDeleteModal';
import { GooglePhotosExportModal } from '@/components/sync/GooglePhotosExportModal';
import { useDragSelect } from '@/hooks/useDragSelect';

interface SimilarTargetPhoto {
  id: number;
  filename: string;
  width: number;
  height: number;
  captured_at: string | null;
  camera_make: string | null;
  camera_model: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  is_favorite: boolean;
  is_blurry: boolean;
  mood: string | null;
  mood_score: number;
  is_smiling: boolean;
  dominant_color: string | null;
  color_hex: string | null;
  thumbnail_url: string;
  preview_url: string;
  people?: { id: number; name: string }[];
}

interface SimilarResultItem extends MediaItem {
  match_badge?: string;
  similarity_score?: number;
  matched_facets?: string[];
  facet_scores?: Record<string, number>;
}

interface SimilarResponseData {
  target_photo: SimilarTargetPhoto;
  counts: {
    all: number;
    visual: number;
    people: number;
    location: number;
    time: number;
  };
  results: SimilarResultItem[];
  facets: {
    visual: SimilarResultItem[];
    people: SimilarResultItem[];
    location: SimilarResultItem[];
    time: SimilarResultItem[];
  };
}

function SimilarPhotosContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mediaId = searchParams.get('id');

  const [data, setData] = useState<SimilarResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFacet, setActiveFacet] = useState<'all' | 'visual' | 'people' | 'location' | 'time'>('all');

  // Lightbox & Slideshow state
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showGooglePhotosModal, setShowGooglePhotosModal] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);

  const API_URL = getApiUrl();

  const getAuthUrl = useCallback((urlPath: string) => {
    if (!urlPath) return '';
    const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
    const fullUrl = urlPath.startsWith('http') ? urlPath : `${API_URL}${urlPath}`;
    if (!token) return fullUrl;
    const separator = fullUrl.includes('?') ? '&' : '?';
    return `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
  }, [API_URL]);

  const loadSimilarPhotos = useCallback(async (facet: string = 'all') => {
    if (!mediaId) {
      setError('No target photo ID provided.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';

      const res = await fetch(`${API_URL}/api/v1/media/${mediaId}/similar?facet=${facet}&limit=100${tokenParam}`, {
        headers,
      });

      if (res.ok) {
        const json: SimilarResponseData = await res.json();
        setData(json);
      } else if (res.status === 404) {
        setError('Target photo not found or has been removed.');
      } else {
        setError('Failed to compute similarity for this photo.');
      }
    } catch (e) {
      console.error('Error fetching similar photos:', e);
      setError('Network error while searching for similar photos.');
    } finally {
      setLoading(false);
    }
  }, [mediaId, API_URL]);

  useEffect(() => {
    loadSimilarPhotos('all');
  }, [loadSimilarPhotos]);

  const displayedItems = React.useMemo(() => {
    if (!data) return [];
    if (activeFacet === 'all') return data.results;
    return data.facets[activeFacet] || [];
  }, [data, activeFacet]);

  // 2D Marquee Drag-and-Select & Range Selection Hook for Similar AI
  const {
    isDragging: isDragSelecting,
    dragMode,
    marqueeBox,
    handlePointerDown,
    handleItemClick,
    handleItemDoubleClick,
  } = useDragSelect({
    selectedIds,
    setSelectedIds,
    orderedIds: displayedItems.map((p) => p.id),
    onOpenLightbox: (id) => {
      const found = displayedItems.find((p) => p.id === id);
      if (found) setSelectedPhoto(found);
    },
  });

  // Selection handlers
  const handleToggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (displayedItems.length === 0) return;
    if (selectedIds.length === displayedItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayedItems.map((p) => p.id));
    }
  };

  const handleExecuteBatchDelete = async (permanent: boolean) => {
    if (selectedIds.length === 0) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      const res = await fetch(`${API_URL}/api/v1/media/batch-delete${tokenParam}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ media_ids: selectedIds, permanent }),
      });

      if (res.ok) {
        const deletedSet = new Set(selectedIds);
        setData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            results: prev.results.filter((p) => !deletedSet.has(p.id)),
            facets: {
              visual: prev.facets.visual.filter((p) => !deletedSet.has(p.id)),
              people: prev.facets.people.filter((p) => !deletedSet.has(p.id)),
              location: prev.facets.location.filter((p) => !deletedSet.has(p.id)),
              time: prev.facets.time.filter((p) => !deletedSet.has(p.id)),
            },
          };
        });
        setSelectedIds([]);
        setShowBulkDeleteModal(false);
      }
    } catch (e) {
      console.error('Failed batch delete:', e);
    }
  };

  const handleExportZip = async () => {
    const exportIds = selectedIds.length > 0 ? selectedIds : displayedItems.map((p) => p.id);
    if (exportIds.length === 0) return;

    try {
      setIsExportingZip(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      const res = await fetch(`${API_URL}/api/v1/albums/export-zip${tokenParam}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ media_ids: exportIds }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `similar_to_${data?.target_photo.filename || 'photo'}_export.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (e) {
      console.error('Failed to export ZIP:', e);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      // If this discovery tab was opened from the gallery in a new tab, closing it returns directly to the gallery
      if (window.opener && !window.opener.closed) {
        try {
          window.close();
        } catch (_) {}
      }
      // Guaranteed navigation fallback: if tab remains open or was opened directly, return to main gallery timeline
      router.push('/');
    }
  };

  return (
    <div 
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none"
      onPointerDown={(e) => handlePointerDown(e)}
    >
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl transition shadow-sm border border-slate-700"
            title="Return to Timeline / Gallery"
          >
            <ArrowLeft className="w-4 h-4 text-slate-300" />
            <span className="text-xs font-semibold">Back to Gallery</span>
          </button>

          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.close();
                // If browser blocks closing, navigate to home
                router.push('/');
              }
            }}
            className="p-2 bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition border border-slate-700/60 text-xs hidden sm:flex items-center gap-1"
            title="Close this discovery tab"
          >
            <X className="w-4 h-4" />
            <span className="text-[11px]">Close Tab</span>
          </button>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Visual & Contextual Discovery</span>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 font-mono font-medium">
                  AI Multi-Vector
                </span>
              </h1>
              <p className="text-xs text-slate-400 truncate max-w-sm sm:max-w-md">
                {data ? `Matching photos for “${data.target_photo.filename}”` : 'Finding related memories...'}
              </p>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {displayedItems.length > 0 && (
            <>
              <button
                onClick={handleExportZip}
                disabled={isExportingZip}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition disabled:opacity-50"
                title="Download matching photos as ZIP"
              >
                <Download className="w-3.5 h-3.5 text-slate-300" />
                <span>{isExportingZip ? 'Exporting...' : 'Export ZIP'}</span>
              </button>

              <button
                onClick={() => setIsSlideshowOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Play Slideshow</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Loading State */}
        {loading && (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Sparkles className="w-10 h-10 text-indigo-400 animate-spin" />
            <p className="text-sm font-medium">Computing CLIP visual similarity, ArcFace biometrics & GPS distances...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="py-20 text-center max-w-md mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <Info className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-white">Could Not Find Similar Photos</h2>
            <p className="text-xs text-slate-400">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Return to Timeline
            </button>
          </div>
        )}

        {/* Success / Data State */}
        {!loading && data && (
          <>
            {/* Reference Target Photo Hero Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col md:flex-row gap-6 items-center">
              <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden bg-black flex-shrink-0 border-2 border-indigo-500/50 shadow-lg group cursor-pointer"
                   onClick={() => setSelectedPhoto(data.target_photo as any)}>
                <img
                  src={getAuthUrl(data.target_photo.thumbnail_url)}
                  alt={data.target_photo.filename}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-md text-amber-300 rounded-md text-[10px] font-bold border border-amber-400/30">
                  Target Photo
                </span>
              </div>

              <div className="flex-1 space-y-3 w-full">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-indigo-400 font-bold">Anchor Photo</span>
                    <span className="text-xs text-slate-500">•</span>
                    <span className="text-xs font-mono text-slate-400">
                      {data.target_photo.width} × {data.target_photo.height}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-0.5 truncate" title={data.target_photo.filename}>
                    {data.target_photo.filename}
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {/* Capture Date */}
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                    <span className="text-slate-500 block text-[10px] flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" /> Captured
                    </span>
                    <span className="font-medium text-slate-200 text-xs mt-0.5 block truncate">
                      {data.target_photo.captured_at
                        ? new Date(data.target_photo.captured_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Unknown Date'}
                    </span>
                  </div>

                  {/* Location */}
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                    <span className="text-slate-500 block text-[10px] flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-400" /> Location
                    </span>
                    <span className="font-medium text-slate-200 text-xs mt-0.5 block truncate" title={data.target_photo.location_name || 'No GPS'}>
                      {data.target_photo.location_name || 'No GPS assigned'}
                    </span>
                  </div>

                  {/* Camera */}
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                    <span className="text-slate-500 block text-[10px] flex items-center gap-1">
                      <Camera className="w-3 h-3 text-blue-400" /> Camera
                    </span>
                    <span className="font-medium text-slate-200 text-xs mt-0.5 block truncate">
                      {data.target_photo.camera_model || 'Unknown Camera'}
                    </span>
                  </div>

                  {/* People */}
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                    <span className="text-slate-500 block text-[10px] flex items-center gap-1">
                      <Users className="w-3 h-3 text-violet-400" /> People
                    </span>
                    <span className="font-medium text-slate-200 text-xs mt-0.5 block truncate">
                      {data.target_photo.people && data.target_photo.people.length > 0
                        ? data.target_photo.people.map((p) => p.name).join(', ')
                        : 'No tagged faces'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Facet Filter Pills & Multi-Select Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* All Similar */}
                <button
                  onClick={() => setActiveFacet('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                    activeFacet === 'all'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>All Matches</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeFacet === 'all' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {data.counts.all}
                  </span>
                </button>

                {/* Visual / Graphics */}
                <button
                  onClick={() => setActiveFacet('visual')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                    activeFacet === 'visual'
                      ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Visual & Graphics</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeFacet === 'visual' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {data.counts.visual}
                  </span>
                </button>

                {/* People & Faces */}
                <button
                  onClick={() => setActiveFacet('people')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                    activeFacet === 'people'
                      ? 'bg-violet-600 text-white border-violet-500 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-violet-400" />
                  <span>Same People</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeFacet === 'people' ? 'bg-violet-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {data.counts.people}
                  </span>
                </button>

                {/* Location */}
                <button
                  onClick={() => setActiveFacet('location')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                    activeFacet === 'location'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Nearby Location</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeFacet === 'location' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {data.counts.location}
                  </span>
                </button>

                {/* Same Outing */}
                <button
                  onClick={() => setActiveFacet('time')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                    activeFacet === 'time'
                      ? 'bg-cyan-600 text-white border-cyan-500 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Same Outing</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeFacet === 'time' ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {data.counts.time}
                  </span>
                </button>
              </div>

              {/* Multi-Select & Batch Toolbar */}
              {displayedItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition"
                  >
                    {selectedIds.length === displayedItems.length ? 'Deselect All' : `Select All (${displayedItems.length})`}
                  </button>

                  <button
                    onClick={() => setShowGooglePhotosModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-700/60 rounded-xl text-xs font-semibold shadow-sm transition"
                    title="Generate Google Photos cloud deletion search query"
                  >
                    <Search className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Google Photos Query {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</span>
                  </button>

                  {selectedIds.length > 0 && (
                    <button
                      onClick={() => setShowBulkDeleteModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold shadow-md transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete ({selectedIds.length})</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Results Grid */}
            {displayedItems.length === 0 ? (
              <div className="bg-slate-900 border border-dashed border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto space-y-3">
                <div className="w-12 h-12 bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white">No matches found for this filter</h3>
                <p className="text-xs text-slate-400">
                  Try switching to &ldquo;All Matches&rdquo; or another dimension above.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
                {displayedItems.map((item) => {
                  const isSelected = selectedIds.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      data-media-id={item.id}
                      onPointerDown={(e) => handlePointerDown(e, item.id)}
                      onClick={(e) => handleItemClick(item.id, e, displayedItems.map(p => p.id))}
                      onDoubleClick={(e) => handleItemDoubleClick(item.id, e)}
                      title="Single-click to select • Double-click to view full image • Click & drag to multi-select"
                      className={`group relative bg-slate-900 border rounded-2xl overflow-hidden cursor-pointer shadow-md transition-all hover:scale-[1.01] hover:border-slate-600 flex flex-col select-none ${
                        isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/50 shadow-indigo-500/20'
                          : 'border-slate-800'
                      }`}
                    >
                      {/* Image Thumbnail */}
                      <div className="relative aspect-square bg-black overflow-hidden">
                        <img
                          src={getAuthUrl(item.thumbnail_url)}
                          alt={item.filename}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform select-none pointer-events-none"
                          loading="lazy"
                          draggable={false}
                        />

                        {/* Match Badge Pill */}
                        {item.match_badge && (
                          <div className="absolute top-2 left-2 max-w-[85%] bg-slate-950/85 backdrop-blur-md text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-amber-400/30 truncate shadow-md flex items-center gap-1 pointer-events-none">
                            <Sparkles className="w-3 h-3 text-amber-400 flex-shrink-0" />
                            <span className="truncate">{item.match_badge}</span>
                          </div>
                        )}

                        {/* Multi-Select Checkbox */}
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleItemClick(item.id, e, displayedItems.map(p => p.id));
                          }}
                          className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition z-10 ${
                            isSelected
                              ? 'bg-indigo-600 text-white ring-2 ring-white shadow-md'
                              : 'bg-black/40 text-transparent border border-white/60 hover:bg-black/70 group-hover:text-white/40'
                          }`}
                          title={isSelected ? 'Deselect photo' : 'Select photo'}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                      </div>

                      {/* Card Metadata Footer */}
                      <div className="p-2.5 space-y-1 bg-slate-900 flex-1 flex flex-col justify-between text-xs">
                        <div>
                          <p className="font-semibold text-white truncate text-[11px]" title={item.filename}>
                            {item.filename}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {item.captured_at
                              ? new Date(item.captured_at).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : 'Unknown Date'}
                            {item.location_name ? ` • ${item.location_name}` : ''}
                          </p>
                        </div>

                        {/* Similarity Score meter */}
                        {typeof item.similarity_score === 'number' && item.similarity_score > 0 && (
                          <div className="pt-1.5 flex items-center gap-1.5">
                            <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-amber-500 to-indigo-500 h-full rounded-full"
                                style={{ width: `${Math.min(100, Math.max(10, item.similarity_score * 100))}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 font-bold">
                              {Math.round(item.similarity_score * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Lightbox Modal for Photo Inspection */}
      {selectedPhoto && (
        <LightboxModal
          photo={selectedPhoto}
          apiUrl={API_URL}
          onClose={() => setSelectedPhoto(null)}
          onToggleFavorite={() => {}}
          onDelete={() => {}}
        />
      )}

      {/* Ambient Cinematic Slideshow */}
      <AmbientSlideshowModal
        photos={displayedItems}
        apiUrl={API_URL}
        isOpen={isSlideshowOpen}
        onClose={() => setIsSlideshowOpen(false)}
      />

      {/* 2D Marquee Drag Selection Visual Rectangle Overlay */}
      {marqueeBox && (
        <div
          style={{
            position: 'fixed',
            left: `${marqueeBox.left}px`,
            top: `${marqueeBox.top}px`,
            width: `${marqueeBox.width}px`,
            height: `${marqueeBox.height}px`,
          }}
          className={`pointer-events-none z-50 rounded border-2 ${
            dragMode === 'select'
              ? 'border-indigo-500 bg-indigo-500/20 shadow-indigo-500/10'
              : 'border-rose-500 bg-rose-500/20 shadow-rose-500/10'
          } shadow-lg backdrop-blur-[0.5px] transition-none`}
        />
      )}

      {/* Active Line-Drag Selection Floating Pill */}
      {isDragSelecting && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-md px-5 py-2.5 rounded-full shadow-2xl border border-indigo-500/50 flex items-center gap-3 animate-pulse pointer-events-none">
          <div className={`w-2.5 h-2.5 rounded-full ${dragMode === 'select' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-bold tracking-wide">
            {dragMode === 'select' ? '✨ Dragging across photos to SELECT' : '🧹 Dragging across photos to DESELECT'}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {selectedIds.length} selected
          </span>
        </div>
      )}

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        itemCount={selectedIds.length}
        itemType="photos"
        filenames={displayedItems.filter((p) => selectedIds.includes(p.id)).map((p) => p.filename)}
        onOpenGooglePhotosHelper={() => setShowGooglePhotosModal(true)}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleExecuteBatchDelete}
      />

      {/* Google Photos Cloud Deletion Search Helper Modal */}
      <GooglePhotosExportModal
        isOpen={showGooglePhotosModal}
        onClose={() => setShowGooglePhotosModal(false)}
        items={
          selectedIds.length > 0
            ? displayedItems.filter((p) => selectedIds.includes(p.id))
            : displayedItems
        }
        title="Similar Clutter Google Photos Deletion Helper"
        subtitle="Search and trash similar photos in your Google Photos cloud account"
      />
    </div>
  );
}

export default function SimilarPhotosPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <Sparkles className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    }>
      <SimilarPhotosContent />
    </Suspense>
  );
}
