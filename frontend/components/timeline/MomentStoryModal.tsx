'use client';

import React, { useEffect, useState } from 'react';
import { X, Calendar, Compass, Download, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { EventStory } from './MomentsCarousel';
import { MediaItem, PhotoCard } from './PhotoCard';

interface MomentStoryModalProps {
  event: EventStory | null;
  apiUrl: string;
  selectedIds?: number[];
  onClose: () => void;
  onSelectPhoto: (photo: MediaItem) => void;
  onToggleSelectPhoto?: (id: number, e: React.MouseEvent) => void;
  onToggleSelectAll?: (ids: number[]) => void;
  onToggleFavorite: (id: number, e: React.MouseEvent) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
}

export const MomentStoryModal: React.FC<MomentStoryModalProps> = ({
  event,
  apiUrl,
  selectedIds = [],
  onClose,
  onSelectPhoto,
  onToggleSelectPhoto,
  onToggleSelectAll,
  onToggleFavorite,
  onDelete,
}) => {
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (event) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  const photos: MediaItem[] = event.items || [];
  const allEventIds = event.media_ids || photos.map((p) => p.id);
  const isAllSelected =
    allEventIds.length > 0 && allEventIds.every((id) => selectedIds.includes(id));

  const handleExportZip = async () => {
    try {
      setDownloadingZip(true);
      const res = await fetch(`${apiUrl}/api/v1/media/bulk-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: allEventIds }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}_moment.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Error exporting moment zip:', e);
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
        {/* Hero Header with Banner */}
        <div className="relative h-48 sm:h-64 w-full flex-shrink-0 overflow-hidden">
          <img
            src={`${apiUrl}${event.cover_thumbnail_url}`}
            alt={event.title}
            className="w-full h-full object-cover brightness-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2.5 bg-black/60 hover:bg-black/90 text-white rounded-full transition shadow-lg"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Event Title & Metadata */}
          <div className="absolute bottom-4 left-6 right-6 flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1 text-white">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                <Compass className="w-4 h-4" />
                <span>Moment & Outing Story</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold">{event.title}</h1>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{event.date}</span>
                </div>
                <span>•</span>
                <span>{event.photo_count} photos</span>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-2">
              {onToggleSelectAll && (
                <button
                  type="button"
                  onClick={() => onToggleSelectAll(allEventIds)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    isAllSelected
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-700'
                  }`}
                >
                  {isAllSelected ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExportZip}
                disabled={downloadingZip}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-sm disabled:opacity-50"
                title="Download all photos from this moment"
              >
                {downloadingZip ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Export ZIP</span>
              </button>
            </div>
          </div>
        </div>

        {/* Photos Grid Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
            <span>Moments Timeline ({photos.length} photos)</span>
            <span>Click any photo to inspect in high-resolution lightbox</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                item={photo}
                apiUrl={apiUrl}
                isSelected={selectedIds.includes(photo.id)}
                onSelect={onSelectPhoto}
                onToggleSelect={onToggleSelectPhoto}
                onToggleFavorite={onToggleFavorite}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
