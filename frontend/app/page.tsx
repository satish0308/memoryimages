'use client';

import { useState, useEffect } from 'react';
import { Search, X, FolderOpen, CheckSquare } from 'lucide-react';

import { MediaItem, PhotoCard } from '@/components/timeline/PhotoCard';
import { DaySection, TimelineGroup } from '@/components/timeline/DaySection';
import { MomentsCarousel, EventStory } from '@/components/timeline/MomentsCarousel';
import { MomentStoryModal } from '@/components/timeline/MomentStoryModal';
import { CategoryFilterBar } from '@/components/timeline/CategoryFilterBar';
import { ScaleSelector, TimelineScale, GridDensity } from '@/components/timeline/ScaleSelector';
import { BulkActionBar } from '@/components/timeline/BulkActionBar';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { OnThisDaySection } from '@/components/flashbacks/OnThisDaySection';

export default function PhotosPage() {
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

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      const categoryParam = activeCategory !== 'all' ? `&category=${activeCategory}` : '';
      const res = await fetch(`${API_URL}/api/v1/media/timeline?scale=${scale}${categoryParam}`);
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
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (e) {
      console.error('Search error:', e);
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      fetchTimeline();
      fetchEvents();
    } else {
      const timeout = setTimeout(() => {
        executeSearch(searchQuery);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [activeCategory, scale, searchQuery]);

  // Selection handlers
  const toggleSelectPhoto = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectGroup = (groupIds: number[], selectAll: boolean) => {
    if (selectAll) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...groupIds])));
    } else {
      setSelectedIds((prev) => prev.filter((id) => !groupIds.includes(id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

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

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `Move ${selectedIds.length} photos to trash? (Zero auto-deletion policy: photos remain until you explicitly delete)`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/media/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds, permanent: false }),
      });
      if (res.ok) {
        setTimeline((prev) =>
          prev
            .map((group) => ({
              ...group,
              items: group.items.filter((item) => !selectedIds.includes(item.id)),
            }))
            .filter((group) => group.items.length > 0)
        );
        clearSelection();
      }
    } catch (err) {
      console.error('Batch delete error:', err);
    }
  };

  const toggleFavorite = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/api/v1/media/${id}/favorite`, { method: 'PATCH' });
      if (res.ok) {
        setTimeline((prev) =>
          prev.map((group) => ({
            ...group,
            items: group.items.map((item) =>
              item.id === id ? { ...item, is_favorite: !item.is_favorite } : item
            ),
          }))
        );
        if (selectedPhoto && selectedPhoto.id === id) {
          setSelectedPhoto((prev) => (prev ? { ...prev, is_favorite: !prev.is_favorite } : null));
        }
        if (selectedEvent) {
          setSelectedEvent((prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items?.map((item) =>
                    item.id === id ? { ...item, is_favorite: !item.is_favorite } : item
                  ),
                }
              : null
          );
        }
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  const deletePhoto = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Move photo to trash? (Zero auto-deletion policy: photos remain until explicitly deleted)')) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/media/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTimeline((prev) =>
          prev
            .map((group) => ({
              ...group,
              items: group.items.filter((item) => item.id !== id),
            }))
            .filter((group) => group.items.length > 0)
        );
        if (searchResults) {
          setSearchResults((prev) => (prev ? prev.filter((i) => i.id !== id) : null));
        }
        if (selectedPhoto && selectedPhoto.id === id) {
          setSelectedPhoto(null);
        }
        if (selectedEvent) {
          setSelectedEvent((prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items?.filter((i) => i.id !== id),
                  photo_count: Math.max(0, prev.photo_count - 1),
                }
              : null
          );
        }
      }
    } catch (err) {
      console.error('Error deleting photo:', err);
    }
  };

  // Lightbox flat list & navigation
  const allFlatPhotos: MediaItem[] =
    searchResults !== null ? searchResults : timeline.flatMap((g) => g.items);
  const currentPhotoIndex = selectedPhoto
    ? allFlatPhotos.findIndex((p) => p.id === selectedPhoto.id)
    : -1;
  const hasPrev = currentPhotoIndex > 0;
  const hasNext = currentPhotoIndex >= 0 && currentPhotoIndex < allFlatPhotos.length - 1;

  const navigatePrev = () => {
    if (hasPrev) setSelectedPhoto(allFlatPhotos[currentPhotoIndex - 1]);
  };
  const navigateNext = () => {
    if (hasNext) setSelectedPhoto(allFlatPhotos[currentPhotoIndex + 1]);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Search Bar */}
      <div className="relative max-w-xl">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by keywords, receipts text, camera model, or location..."
          className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none shadow-sm transition"
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

      {/* Nostalgia Flashbacks: "On This Day" */}
      {!searchResults && (
        <OnThisDaySection apiUrl={API_URL} onSelectPhoto={(photo) => setSelectedPhoto(photo)} />
      )}

      {/* Highlights & Outing Stories Carousel */}
      {!searchResults && (
        <MomentsCarousel
          events={events}
          apiUrl={API_URL}
          onSelectEvent={(ev) => setSelectedEvent(ev)}
        />
      )}

      {/* Timeline Controls Bar: Scale Switcher (Days/Months/Years) & Grid Density */}
      {!searchResults && (
        <ScaleSelector
          scale={scale}
          onChangeScale={setScale}
          density={density}
          onChangeDensity={setDensity}
        />
      )}

      {/* Category Filter Pills */}
      {!searchResults && (
        <CategoryFilterBar
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          onRefresh={fetchTimeline}
          loading={loading}
        />
      )}

      {/* Search Results Display */}
      {searchResults !== null && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">
              Search Results ({searchResults.length} matching)
            </h2>
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-indigo-600 hover:underline"
            >
              Clear Search
            </button>
          </div>

          {searchResults.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
              No photos found matching "{searchQuery}".
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {searchResults.map((item) => (
                <PhotoCard
                  key={item.id}
                  item={item}
                  apiUrl={API_URL}
                  isSelected={selectedIds.includes(item.id)}
                  onSelect={setSelectedPhoto}
                  onToggleSelect={toggleSelectPhoto}
                  onToggleFavorite={toggleFavorite}
                  onDelete={deletePhoto}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !searchResults && timeline.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-base">No Photos Found</h3>
            <p className="text-xs text-slate-500 mt-1">
              Place photos into <code className="bg-slate-100 px-1 py-0.5 rounded">./data/originals</code>{' '}
              or connect Google Drive in the Sync tab.
            </p>
          </div>
        </div>
      )}

      {/* Main Chronological Timeline Grouped by Day, Month, or Year */}
      {!searchResults && (
        <div className="space-y-8">
          {timeline.map((group) => (
            <DaySection
              key={group.key || group.date}
              group={group}
              apiUrl={API_URL}
              selectedIds={selectedIds}
              density={density}
              onSelect={setSelectedPhoto}
              onToggleSelect={toggleSelectPhoto}
              onToggleSelectGroup={toggleSelectGroup}
              onToggleFavorite={toggleFavorite}
              onDelete={deletePhoto}
            />
          ))}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedIds={selectedIds}
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

      {/* Full-Screen Lightbox Modal with Pan & Zoom & Navigation */}
      <LightboxModal
        photo={selectedPhoto}
        apiUrl={API_URL}
        onClose={() => setSelectedPhoto(null)}
        onToggleFavorite={toggleFavorite}
        onDelete={deletePhoto}
        onNavigatePrev={navigatePrev}
        onNavigateNext={navigateNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
      />
    </div>
  );
}
