'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Search, X, FolderOpen, Sparkles, Play, SlidersHorizontal, Layers, Users, Mountain, Calendar } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { MediaItem, PhotoCard } from '@/components/timeline/PhotoCard';
import { DaySection, TimelineGroup } from '@/components/timeline/DaySection';
import { MomentsCarousel, EventStory } from '@/components/timeline/MomentsCarousel';
import { MomentStoryModal } from '@/components/timeline/MomentStoryModal';
import { CategoryFilterBar } from '@/components/timeline/CategoryFilterBar';
import { ScaleSelector, TimelineScale, GridDensity } from '@/components/timeline/ScaleSelector';
import { BulkActionBar } from '@/components/timeline/BulkActionBar';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { OnThisDaySection } from '@/components/flashbacks/OnThisDaySection';
import { SmartFilterDrawer, SmartFilters, DEFAULT_SMART_FILTERS } from '@/components/timeline/SmartFilterDrawer';
import { AmbientSlideshowModal } from '@/components/timeline/AmbientSlideshowModal';
import { BurstInspectorModal } from '@/components/timeline/BurstInspectorModal';
import { BulkDeleteModal } from '@/components/timeline/BulkDeleteModal';
import { TimelineScrubber } from '@/components/timeline/TimelineScrubber';
import { GoogleDriveBackupModal } from '@/components/sync/GoogleDriveBackupModal';
import { GooglePhotosExportModal } from '@/components/sync/GooglePhotosExportModal';
import { useDragSelect } from '@/hooks/useDragSelect';
import { getApiUrl } from '@/utils/apiUrl';

export default function PhotosPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [timeline, setTimeline] = useState<TimelineGroup[]>([]);
  const [events, setEvents] = useState<EventStory[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState<TimelineScale>('day');
  const [density, setDensity] = useState<GridDensity>('normal');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItem[] | null>(null);
  const [isSemanticSearch, setIsSemanticSearch] = useState(true);
  const [isSemanticResult, setIsSemanticResult] = useState(false);

  // Smart Filters & Ambient Slideshow state
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [smartFilters, setSmartFilters] = useState<SmartFilters>(DEFAULT_SMART_FILTERS);
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(false);
  const [peopleFilter, setPeopleFilter] = useState<'all' | 'with_people' | 'without_people'>('all');
  const [groupByPeople, setGroupByPeople] = useState<boolean>(false);

  // Smart Duplicates & Burst Collapse state
  const [collapseBursts, setCollapseBursts] = useState(true);
  const [inspectingBurstLead, setInspectingBurstLead] = useState<MediaItem | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showGooglePhotosModal, setShowGooglePhotosModal] = useState(false);

  // Google Drive Outbound Backup state
  const [backupModalMediaIds, setBackupModalMediaIds] = useState<number[]>([]);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupModalDefaultFolder, setBackupModalDefaultFolder] = useState<string>('MyMemoryPics / Backups');

  const handleBackupSinglePhoto = useCallback((photo: MediaItem) => {
    setBackupModalMediaIds([photo.id]);
    setBackupModalDefaultFolder('MyMemoryPics / Backups');
    setIsBackupModalOpen(true);
  }, []);

  const handleBackupBulkPhotos = useCallback((ids: number[]) => {
    setBackupModalMediaIds(ids);
    setBackupModalDefaultFolder('MyMemoryPics / Backups');
    setIsBackupModalOpen(true);
  }, []);

  const API_URL = getApiUrl();

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      const categoryParam = activeCategory !== 'all' ? `&category=${activeCategory}` : '';
      const res = await fetch(
        `${API_URL}/api/v1/media/timeline?scale=${scale}${categoryParam}&collapse_bursts=${collapseBursts}`
      );
      if (res.ok) {
        setTimeline(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/search/events`);
      if (res.ok) {
        setEvents(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  };

  const executeSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      setIsSemanticResult(false);
      return;
    }
    try {
      let url = `${API_URL}/api/v1/search?q=${encodeURIComponent(query.trim())}&semantic=${isSemanticSearch}`;
      if (smartFilters.mood !== 'all') url += `&mood=${smartFilters.mood}`;
      if (smartFilters.color !== 'all') url += `&dominant_color=${smartFilters.color}`;
      if (smartFilters.mediaType === 'photos') url += `&media_type=photo`;
      if (smartFilters.mediaType === 'videos') url += `&media_type=video`;
      if (smartFilters.smilingOnly) url += `&smiling_only=true`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        setIsSemanticResult(Boolean(data.is_semantic));
      }
    } catch (e) {
      console.error('Search error:', e);
    }
  };

  // Main timeline & events fetching (isolated from in-memory smart filters to prevent network thrashing)
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    if (!searchQuery.trim()) {
      fetchTimeline();
      fetchEvents();
    }
  }, [isAuthenticated, isLoading, activeCategory, scale, collapseBursts]);

  // Search execution (debounced and reactive to query and smart filter criteria)
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    if (searchQuery.trim()) {
      const timeout = setTimeout(() => {
        executeSearch(searchQuery);
      }, 300);
      return () => clearTimeout(timeout);
    } else {
      setSearchResults(null);
      setIsSemanticResult(false);
    }
  }, [searchQuery, isSemanticSearch, smartFilters, isAuthenticated, isLoading]);

  // Listen to background uploads completing for seamless zero-reload refresh
  useEffect(() => {
    const handleUploaded = () => {
      fetchTimeline();
      fetchEvents();
    };
    window.addEventListener('media-uploaded', handleUploaded);
    return () => window.removeEventListener('media-uploaded', handleUploaded);
  }, []);

  // Selection handlers
  const toggleSelectPhoto = useCallback((id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const toggleSelectGroup = useCallback((groupIds: number[], selectAll: boolean) => {
    if (selectAll) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...groupIds])));
    } else {
      setSelectedIds((prev) => prev.filter((id) => !groupIds.includes(id)));
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  // Bulk Operations
  const handleBatchFavorite = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/media/batch-favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds, is_favorite: true }),
      });
      if (res.ok) {
        setTimeline((prev) =>
          prev.map((group) => ({
            ...group,
            items: group.items.map((item) =>
              selectedIds.includes(item.id) ? { ...item, is_favorite: true } : item
            ),
          }))
        );
        clearSelection();
      }
    } catch (err) {
      console.error('Batch favorite error:', err);
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    setShowBulkDeleteModal(true);
  };

  const executeBatchDelete = async (permanent: boolean) => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/media/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds, permanent }),
      });
      if (res.ok) {
        setTimeline((prev) =>
          prev.map((group) => ({
            ...group,
            items: group.items.filter((item) => !selectedIds.includes(item.id)),
          })).filter((group) => group.items.length > 0)
        );
        clearSelection();
      }
    } catch (err) {
      console.error('Batch delete error:', err);
    }
  };

  const toggleFavorite = useCallback(async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/api/v1/media/${id}/favorite`, { method: 'PATCH' });
      if (res.ok) {
        const updated = await res.json();
        setTimeline((prev) =>
          prev.map((group) => ({
            ...group,
            items: group.items.map((item) =>
              item.id === id ? { ...item, is_favorite: updated.is_favorite } : item
            ),
          }))
        );
        setSelectedPhoto((prev) => (prev && prev.id === id ? { ...prev, is_favorite: updated.is_favorite } : prev));
        setSearchResults((prev) =>
          prev ? prev.map((p) => (p.id === id ? { ...p, is_favorite: updated.is_favorite } : p)) : null
        );
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }, [API_URL]);

  const deletePhoto = useCallback(async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to move this photo to trash? (Zero auto-deletion policy: stays safe until you confirm)')) return;

    try {
      const res = await fetch(`${API_URL}/api/v1/media/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTimeline((prev) =>
          prev.map((group) => ({
            ...group,
            items: group.items.filter((item) => item.id !== id),
          })).filter((group) => group.items.length > 0)
        );
        setSelectedPhoto((prev) => (prev && prev.id === id ? null : prev));
        setSearchResults((prev) => (prev ? prev.filter((p) => p.id !== id) : null));
      }
    } catch (err) {
      console.error('Failed to delete photo:', err);
    }
  }, [API_URL]);

  // Dynamically collect available cameras from library photos
  const allPhotos = useMemo(() => {
    return timeline.flatMap((group) => group.items);
  }, [timeline]);

  const availableCameras = useMemo(() => {
    const cameras = new Set<string>();
    allPhotos.forEach((p) => {
      const name = [p.camera_make, p.camera_model].filter(Boolean).join(' ').trim();
      if (name) cameras.add(name);
    });
    return Array.from(cameras).sort();
  }, [allPhotos]);

  // People & Face presence distribution counts
  const peopleCounts = useMemo(() => {
    const withP = allPhotos.filter((p) => p.has_faces).length;
    return {
      all: allPhotos.length,
      withPeople: withP,
      withoutPeople: allPhotos.length - withP,
    };
  }, [allPhotos]);

  // Apply Smart Filters
  const filteredTimeline = useMemo(() => {
    const isFiltered = 
      peopleFilter !== 'all' ||
      smartFilters.peoplePresence !== 'all' ||
      smartFilters.datePreset !== 'all' ||
      smartFilters.camera !== 'all' ||
      smartFilters.orientation !== 'all' ||
      smartFilters.favoritesOnly ||
      smartFilters.geotaggedOnly ||
      smartFilters.sharpOnly ||
      smartFilters.mood !== 'all' ||
      smartFilters.color !== 'all' ||
      smartFilters.mediaType !== 'all' ||
      smartFilters.smilingOnly ||
      Boolean(smartFilters.startDate) ||
      Boolean(smartFilters.endDate);

    if (!isFiltered) return timeline;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfThisYear = new Date(now.getFullYear(), 0, 1);
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
    const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);

    return timeline.map((group) => {
      const filteredItems = group.items.filter((item) => {
        // People Presence Filter (from top category bar or smart filter drawer)
        const effectivePeopleFilter = peopleFilter !== 'all' ? peopleFilter : smartFilters.peoplePresence;
        if (effectivePeopleFilter === 'with_people' && !item.has_faces) return false;
        if (effectivePeopleFilter === 'without_people' && item.has_faces) return false;

        const itemDate = new Date(item.captured_at);

        // Date Presets
        if (smartFilters.datePreset === '7d' && itemDate < sevenDaysAgo) return false;
        if (smartFilters.datePreset === '30d' && itemDate < thirtyDaysAgo) return false;
        if (smartFilters.datePreset === 'this_year' && itemDate < startOfThisYear) return false;
        if (smartFilters.datePreset === 'last_year' && (itemDate < startOfLastYear || itemDate > endOfLastYear)) return false;
        if (smartFilters.datePreset === 'custom') {
          if (smartFilters.startDate && itemDate < new Date(smartFilters.startDate)) return false;
          if (smartFilters.endDate) {
            const end = new Date(smartFilters.endDate);
            end.setHours(23, 59, 59);
            if (itemDate > end) return false;
          }
        }

        // Camera Filter
        if (smartFilters.camera !== 'all') {
          const cam = [item.camera_make, item.camera_model].filter(Boolean).join(' ').trim();
          if (cam !== smartFilters.camera) return false;
        }

        // Orientation Filter
        if (smartFilters.orientation === 'landscape' && item.width <= item.height) return false;
        if (smartFilters.orientation === 'portrait' && item.height <= item.width) return false;
        if (smartFilters.orientation === 'square' && Math.abs(item.width - item.height) > 20) return false;

        // Attributes
        if (smartFilters.favoritesOnly && !item.is_favorite) return false;
        if (smartFilters.geotaggedOnly && (item.latitude === null || item.latitude === undefined)) return false;
        if (smartFilters.sharpOnly && item.is_blurry) return false;

        // Emotion & Mood Filter
        if (smartFilters.mood !== 'all' && item.mood !== smartFilters.mood) return false;

        // Color Filter
        if (smartFilters.color !== 'all' && item.dominant_color !== smartFilters.color) return false;

        // Format Filter
        if (smartFilters.mediaType === 'photos' && item.is_video) return false;
        if (smartFilters.mediaType === 'videos' && !item.is_video) return false;

        // Smiling faces only
        if (smartFilters.smilingOnly && !item.is_smiling) return false;

        return true;
      });

      return {
        ...group,
        items: filteredItems,
        count: filteredItems.length,
      };
    }).filter((group) => group.items.length > 0);
  }, [timeline, smartFilters, peopleFilter]);

  const allFilteredPhotos = useMemo(() => {
    return filteredTimeline.flatMap((group) => group.items);
  }, [filteredTimeline]);

  // Sub-grouped timelines for 'Group by People' view mode
  const timelineWithPeople = useMemo(() => {
    return filteredTimeline
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => it.has_faces),
        count: g.items.filter((it) => it.has_faces).length,
      }))
      .filter((g) => g.items.length > 0);
  }, [filteredTimeline]);

  const timelineWithoutPeople = useMemo(() => {
    return filteredTimeline
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => !it.has_faces),
        count: g.items.filter((it) => !it.has_faces).length,
      }))
      .filter((g) => g.items.length > 0);
  }, [filteredTimeline]);

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (peopleFilter !== 'all') count++;
    if (smartFilters.peoplePresence !== 'all') count++;
    if (smartFilters.datePreset !== 'all' || smartFilters.startDate || smartFilters.endDate) count++;
    if (smartFilters.camera !== 'all') count++;
    if (smartFilters.orientation !== 'all') count++;
    if (smartFilters.favoritesOnly) count++;
    if (smartFilters.geotaggedOnly) count++;
    if (smartFilters.sharpOnly) count++;
    if (smartFilters.mood !== 'all') count++;
    if (smartFilters.color !== 'all') count++;
    if (smartFilters.mediaType !== 'all') count++;
    if (smartFilters.smilingOnly) count++;
    return count;
  }, [smartFilters]);

  // Lightbox flat list & navigation
  const allFlatPhotos: MediaItem[] =
    searchResults !== null ? searchResults : allFilteredPhotos;
  const currentPhotoIndex = selectedPhoto
    ? allFlatPhotos.findIndex((p) => p.id === selectedPhoto.id)
    : -1;
  const hasPrev = currentPhotoIndex > 0;
  const hasNext = currentPhotoIndex >= 0 && currentPhotoIndex < allFlatPhotos.length - 1;
  const prevPhoto = hasPrev ? allFlatPhotos[currentPhotoIndex - 1] : null;
  const nextPhoto = hasNext ? allFlatPhotos[currentPhotoIndex + 1] : null;

  const navigatePrev = () => {
    if (hasPrev) setSelectedPhoto(allFlatPhotos[currentPhotoIndex - 1]);
  };
  const navigateNext = () => {
    if (hasNext) setSelectedPhoto(allFlatPhotos[currentPhotoIndex + 1]);
  };

  // 2D Marquee Drag-and-Select & Range Selection Hook for Timeline
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
    orderedIds: searchResults ? searchResults.map((p) => p.id) : allFlatPhotos.map((p) => p.id),
    onOpenLightbox: (id) => {
      const found = (searchResults || allFlatPhotos).find((p) => p.id === id);
      if (found) setSelectedPhoto(found);
    },
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20" onPointerDown={handlePointerDown}>
      {/* Search Bar with AI Semantic Toggle */}
      <div className="flex items-center gap-2 max-w-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isSemanticSearch
                ? "✨ AI Semantic Search: Describe visual concepts (e.g. 'sunset at beach', 'green nature')..."
                : "Search by exact keywords, receipts text, camera model, or location..."
            }
            className={`w-full pl-10 pr-9 py-2 sm:py-2.5 text-xs bg-white border rounded-xl shadow-sm transition focus:outline-none ${
              isSemanticSearch
                ? 'border-indigo-300 focus:border-indigo-600 ring-1 ring-indigo-500/10'
                : 'border-slate-200 focus:border-indigo-500'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* AI Semantic Search Toggle Button */}
        <button
          type="button"
          onClick={() => setIsSemanticSearch(!isSemanticSearch)}
          className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs font-semibold transition border shadow-sm flex-shrink-0 ${
            isSemanticSearch
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-indigo-200'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
          title="Toggle between AI Semantic Concept Search and Keyword Search"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isSemanticSearch ? 'text-amber-300' : 'text-slate-400'}`} />
          <span className="hidden sm:inline">{isSemanticSearch ? 'AI Semantic ON' : 'AI Semantic OFF'}</span>
          <span className="sm:hidden font-mono text-[10px]">AI</span>
        </button>
      </div>

      {/* Quick Emotion, Mood & Format Filter Pills (Desktop web view) */}
      <div className="hidden md:flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
        {[
          { id: 'all', label: 'All Moods', emoji: '✨' },
          { id: 'joyful', label: 'Joyful', emoji: '😊' },
          { id: 'serene', label: 'Serene', emoji: '🌅' },
          { id: 'celebratory', label: 'Celebration', emoji: '🎉' },
          { id: 'adventurous', label: 'Adventure', emoji: '⛰️' },
          { id: 'cozy', label: 'Cozy', emoji: '☕' },
          { id: 'dramatic', label: 'Dramatic', emoji: '🎭' },
          { id: 'romantic', label: 'Romantic', emoji: '❤️' },
          { id: 'nostalgic', label: 'Nostalgic', emoji: '🕰️' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setSmartFilters((prev) => ({ ...prev, mood: prev.mood === m.id ? 'all' : m.id }))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition whitespace-nowrap font-medium ${
              smartFilters.mood === m.id
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-transparent shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        ))}

        <div className="h-4 w-px bg-slate-300 mx-1 flex-shrink-0" />

        {/* Video format chip */}
        <button
          onClick={() => setSmartFilters((prev) => ({ ...prev, mediaType: prev.mediaType === 'videos' ? 'all' : 'videos' }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition whitespace-nowrap font-medium ${
            smartFilters.mediaType === 'videos'
              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Videos</span>
        </button>

        {/* Smiling faces chip */}
        <button
          onClick={() => setSmartFilters((prev) => ({ ...prev, smilingOnly: !prev.smilingOnly }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition whitespace-nowrap font-medium ${
            smartFilters.smilingOnly
              ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>😄</span>
          <span>Smiling Faces</span>
        </button>
      </div>

      {/* Desktop Full Memories & Flashbacks (Preserved 100% on desktop web) */}
      {!searchResults && (
        <div className="hidden md:block space-y-6">
          <OnThisDaySection apiUrl={API_URL} onSelectPhoto={(photo) => setSelectedPhoto(photo)} />
          <MomentsCarousel
            events={events}
            apiUrl={API_URL}
            onSelectEvent={(ev) => setSelectedEvent(ev)}
          />
        </div>
      )}

      {/* Mobile Compact Stories Bar (Instagram / Google Photos Style - only ~75px height) */}
      {!searchResults && events.length > 0 && (
        <div className="md:hidden space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Memories & Moments</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {events.map((ev, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedEvent(ev)}
                className="flex-shrink-0 flex flex-col items-center gap-1 w-16 cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-2xl p-0.5 bg-gradient-to-tr from-amber-400 via-rose-500 to-indigo-600 shadow-sm group-hover:scale-105 transition-transform">
                  <img
                    src={`${API_URL}${ev.cover_thumbnail_url}`}
                    alt={ev.title}
                    className="w-full h-full object-cover rounded-[14px]"
                    loading="lazy"
                  />
                </div>
                <span className="text-[10px] text-slate-700 dark:text-slate-300 truncate max-w-[64px] text-center font-medium">
                  {ev.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline Controls Bar: Scale Switcher, Slideshow & Smart Filters */}
      {!searchResults && (
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
          <ScaleSelector
            scale={scale}
            onChangeScale={setScale}
            density={density}
            onChangeDensity={setDensity}
          />

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Smart Burst Collapse Toggle */}
            <button
              onClick={() => setCollapseBursts((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-semibold border transition shadow-sm ${
                collapseBursts
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 shadow-amber-50'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={
                collapseBursts
                  ? 'Burst Collapse is Active (📸 Stacks shown as AI Best Shot). Click to expand all individual photos.'
                  : 'Burst Collapse is Off (Showing all individual photos). Click to collapse burst groups into stacks.'
              }
            >
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">{collapseBursts ? 'Bursts: Collapsed' : 'Bursts: Expanded'}</span>
            </button>

            {/* Ambient Slideshow Launcher */}
            <button
              onClick={() => setIsSlideshowOpen(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-sm"
              title="Play Ambient Slideshow"
            >
              <Play className="w-3.5 h-3.5 fill-indigo-600 text-indigo-600 dark:fill-indigo-400 dark:text-indigo-400" />
              <span className="hidden sm:inline">Slideshow</span>
            </button>

            {/* Smart Filters Drawer Trigger */}
            <button
              onClick={() => setIsFilterDrawerOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-semibold border transition shadow-sm ${
                activeFilterCount > 0
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-100'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Filter by date, camera, orientation, favorites"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-white text-indigo-600 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Category Filter Pills & People Sub-Group Controls */}
      {!searchResults && (
        <CategoryFilterBar
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          peopleFilter={peopleFilter}
          onSelectPeopleFilter={setPeopleFilter}
          peopleCounts={peopleCounts}
          groupByPeople={groupByPeople}
          onToggleGroupByPeople={() => setGroupByPeople((prev) => !prev)}
          onRefresh={fetchTimeline}
          loading={loading}
        />
      )}

      {/* Active Filters Summary Pill when filtered */}
      {!searchResults && activeFilterCount > 0 && (
        <div className="flex items-center justify-between bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 px-4 py-2 rounded-xl text-xs text-indigo-900 dark:text-indigo-200">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>
              Showing <strong>{allFilteredPhotos.length}</strong> matching photos (out of {allPhotos.length} total)
            </span>
          </div>
          <button
            onClick={() => {
              setSmartFilters(DEFAULT_SMART_FILTERS);
              setPeopleFilter('all');
            }}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Search Results Display */}
      {searchResults !== null && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                Search Results ({searchResults.length} matching)
              </h2>
              {isSemanticResult && (
                <span className="flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                  <span>CLIP Vector AI Match</span>
                </span>
              )}
            </div>
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-indigo-600 hover:underline"
            >
              Clear Search
            </button>
          </div>

          {isSemanticResult && (
            <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-50 via-purple-50 to-transparent p-3 rounded-xl border border-indigo-100 text-xs text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span>
                <strong>AI Semantic Search:</strong> Matched photos using 512-dimensional CLIP neural embeddings running 100% offline.
              </span>
            </div>
          )}

          {searchResults.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
              No photos found matching &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {searchResults.map((item) => (
                <PhotoCard
                  key={item.id}
                  item={item}
                  apiUrl={API_URL}
                  isSelected={selectedIds.includes(item.id)}
                  selectionModeActive={selectedIds.length > 0}
                  onSelect={setSelectedPhoto}
                  onToggleSelect={handleItemClick}
                  onPointerDown={handlePointerDown}
                  onToggleFavorite={toggleFavorite}
                  onDelete={deletePhoto}
                  onOpenBurst={(bItem) => setInspectingBurstLead(bItem)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !searchResults && filteredTimeline.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-base">No Photos Match Your Filters</h3>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting or clearing the active filters in the filter drawer.
            </p>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setSmartFilters(DEFAULT_SMART_FILTERS)}
                className="mt-3 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-500 transition"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Chronological Timeline Grouped by Day, Month, or Year */}
      {!searchResults && groupByPeople ? (
        <div className="space-y-8">
          {/* Sub-Group 1: Photos with People */}
          <div className="bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 rounded-3xl p-5 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 dark:border-indigo-900/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Photos with People
                    </h2>
                    <span className="bg-indigo-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                      {timelineWithPeople.reduce((acc, g) => acc + g.items.length, 0)} photos
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Portraits, family memories, candid moments, selfies & gatherings
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const groupIds = timelineWithPeople.flatMap((g) => g.items.map((i) => i.id));
                    const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
                    setSelectedIds((prev) =>
                      allSelected
                        ? prev.filter((id) => !groupIds.includes(id))
                        : Array.from(new Set([...prev, ...groupIds]))
                    );
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-700 transition"
                >
                  {timelineWithPeople.flatMap((g) => g.items.map((i) => i.id)).length > 0 &&
                  timelineWithPeople.flatMap((g) => g.items.map((i) => i.id)).every((id) => selectedIds.includes(id))
                    ? 'Deselect People Photos'
                    : 'Select All People Photos'}
                </button>
              </div>
            </div>

            {timelineWithPeople.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No photos with detected people found in this filter.
              </div>
            ) : (
              <div className="space-y-6">
                {timelineWithPeople.map((group) => (
                  <DaySection
                    key={`people-${group.key || group.date}`}
                    group={group}
                    apiUrl={API_URL}
                    selectedIds={selectedIds}
                    density={density}
                    onSelect={setSelectedPhoto}
                    onToggleSelect={handleItemClick}
                    onPointerDown={handlePointerDown}
                    onToggleSelectGroup={toggleSelectGroup}
                    onToggleFavorite={toggleFavorite}
                    onDelete={deletePhoto}
                    onOpenBurst={(bItem) => setInspectingBurstLead(bItem)}
                    onBackupToDrive={handleBackupSinglePhoto}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sub-Group 2: Photos without People (Nature, Scenery & Objects) */}
          <div className="bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-3xl p-5 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 dark:border-emerald-900/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                  <Mountain className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Photos without People
                    </h2>
                    <span className="bg-emerald-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                      {timelineWithoutPeople.reduce((acc, g) => acc + g.items.length, 0)} photos
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Nature, landscapes, scenery, architecture, travel vistas, receipts & objects
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const groupIds = timelineWithoutPeople.flatMap((g) => g.items.map((i) => i.id));
                    const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
                    setSelectedIds((prev) =>
                      allSelected
                        ? prev.filter((id) => !groupIds.includes(id))
                        : Array.from(new Set([...prev, ...groupIds]))
                    );
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-slate-700 transition"
                >
                  {timelineWithoutPeople.flatMap((g) => g.items.map((i) => i.id)).length > 0 &&
                  timelineWithoutPeople.flatMap((g) => g.items.map((i) => i.id)).every((id) => selectedIds.includes(id))
                    ? 'Deselect Scenery Photos'
                    : 'Select All Scenery Photos'}
                </button>
              </div>
            </div>

            {timelineWithoutPeople.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No scenery or non-people photos found in this filter.
              </div>
            ) : (
              <div className="space-y-6">
                {timelineWithoutPeople.map((group) => (
                  <DaySection
                    key={`scenery-${group.key || group.date}`}
                    group={group}
                    apiUrl={API_URL}
                    selectedIds={selectedIds}
                    density={density}
                    onSelect={setSelectedPhoto}
                    onToggleSelect={handleItemClick}
                    onPointerDown={handlePointerDown}
                    onToggleSelectGroup={toggleSelectGroup}
                    onToggleFavorite={toggleFavorite}
                    onDelete={deletePhoto}
                    onOpenBurst={(bItem) => setInspectingBurstLead(bItem)}
                    onBackupToDrive={handleBackupSinglePhoto}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : !searchResults ? (
        <div className="space-y-8">
          {filteredTimeline.map((group) => (
            <DaySection
              key={group.key || group.date}
              group={group}
              apiUrl={API_URL}
              selectedIds={selectedIds}
              density={density}
              onSelect={setSelectedPhoto}
              onToggleSelect={handleItemClick}
              onPointerDown={handlePointerDown}
              onToggleSelectGroup={toggleSelectGroup}
              onToggleFavorite={toggleFavorite}
              onDelete={deletePhoto}
              onOpenBurst={(bItem) => setInspectingBurstLead(bItem)}
              onBackupToDrive={handleBackupSinglePhoto}
            />
          ))}
        </div>
      ) : null}

      {/* Interactive Vertical Timeline Minimap Scrubber */}
      {!searchResults && filteredTimeline.length > 0 && (
        <TimelineScrubber groups={filteredTimeline} />
      )}

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
        <div className="fixed bottom-20 left-0 right-0 md:left-64 md:right-0 mx-auto w-max z-50 bg-slate-900/95 text-white backdrop-blur-md px-5 py-2.5 rounded-full shadow-2xl border border-indigo-500/50 flex items-center gap-3 animate-pulse pointer-events-none">
          <div className={`w-2.5 h-2.5 rounded-full ${dragMode === 'select' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-bold tracking-wide">
            {dragMode === 'select' ? '✨ Dragging across photos to SELECT' : '🧹 Dragging across photos to DESELECT'}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {selectedIds.length} selected
          </span>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedIds={selectedIds}
        selectedPhotos={allPhotos.filter((p) => selectedIds.includes(p.id))}
        apiUrl={API_URL}
        onClearSelection={clearSelection}
        onBatchFavorite={handleBatchFavorite}
        onBatchDelete={handleBatchDelete}
        onBatchCategoryUpdated={() => {
          fetchTimeline();
          clearSelection();
        }}
        onAlbumAdded={() => {
          clearSelection();
        }}
        onBatchLocationUpdated={() => {
          fetchTimeline();
          clearSelection();
        }}
        onBatchEnhanced={() => {
          fetchTimeline();
          clearSelection();
        }}
        onBatchBackupToDrive={handleBackupBulkPhotos}
        onOpenGooglePhotosHelper={() => setShowGooglePhotosModal(true)}
      />

      {/* Moment & Outing Story Detail Modal */}
      <MomentStoryModal
        event={selectedEvent}
        apiUrl={API_URL}
        selectedIds={selectedIds}
        onClose={() => setSelectedEvent(null)}
        onSelectPhoto={(photo) => setSelectedPhoto(photo)}
        onToggleSelectPhoto={toggleSelectPhoto}
        onToggleSelectAll={(ids) => {
          const allIn = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
          toggleSelectGroup(ids, !allIn);
        }}
        onToggleFavorite={toggleFavorite}
        onDelete={deletePhoto}
      />

      {/* Full-Screen Lightbox Modal with Pan & Zoom, EXIF & Map Drawer, and Face Tagging */}
      <LightboxModal
        photo={selectedPhoto}
        apiUrl={API_URL}
        onClose={() => setSelectedPhoto(null)}
        onToggleFavorite={toggleFavorite}
        onDelete={(id) => {
          setTimeline((prev) =>
            prev.map((group) => ({
              ...group,
              items: group.items.filter((item) => item.id !== id),
            })).filter((group) => group.items.length > 0)
          );
          setSelectedPhoto(null);
          if (searchResults) {
            setSearchResults((prev) => (prev ? prev.filter((p) => p.id !== id) : null));
          }
        }}
        onNavigatePrev={navigatePrev}
        onNavigateNext={navigateNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
        nextPhoto={nextPhoto}
        prevPhoto={prevPhoto}
        onSelectPhoto={(photoOrId) => {
          if (typeof photoOrId === 'number') {
            const found = allPhotos.find((p) => p.id === photoOrId);
            if (found) setSelectedPhoto(found);
          } else {
            setSelectedPhoto(photoOrId);
          }
        }}
        onBackupToDrive={handleBackupSinglePhoto}
      />

      {/* Smart Filters Slide-Out Drawer */}
      <SmartFilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        filters={smartFilters}
        onFiltersChange={setSmartFilters}
        availableCameras={availableCameras}
        matchingCount={allFilteredPhotos.length}
        totalCount={allPhotos.length}
      />

      {/* Ambient Cinematic Slideshow */}
      <AmbientSlideshowModal
        photos={allFilteredPhotos}
        apiUrl={API_URL}
        isOpen={isSlideshowOpen}
        onClose={() => setIsSlideshowOpen(false)}
      />

      {/* Smart Burst Inspector & Redundant Cleaner Modal */}
      <BurstInspectorModal
        leadItem={inspectingBurstLead}
        apiUrl={API_URL}
        isOpen={Boolean(inspectingBurstLead)}
        onClose={() => setInspectingBurstLead(null)}
        onResolved={() => {
          fetchTimeline();
        }}
      />

      {/* Safe vs Permanent Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        itemCount={selectedIds.length}
        itemType="photos"
        filenames={allPhotos.filter((p) => selectedIds.includes(p.id)).map((p) => p.filename)}
        onOpenGooglePhotosHelper={() => setShowGooglePhotosModal(true)}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={executeBatchDelete}
      />

      {/* Google Photos Cloud Deletion Search Helper Modal */}
      <GooglePhotosExportModal
        isOpen={showGooglePhotosModal}
        onClose={() => setShowGooglePhotosModal(false)}
        items={(searchResults || allPhotos).filter((p) => selectedIds.includes(p.id))}
        title="Google Photos Cloud Deletion Helper"
        subtitle="Search and trash selected photos in your Google Photos cloud account"
      />

      {/* Google Drive Outbound Backup Modal */}
      <GoogleDriveBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        mediaIds={backupModalMediaIds}
        defaultFolderName={backupModalDefaultFolder}
        onBackupSuccess={() => {
          fetchTimeline();
          clearSelection();
        }}
      />
    </div>
  );
}
