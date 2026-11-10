'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar, CheckCircle2, Circle, CalendarDays, Layers } from 'lucide-react';
import { PhotoCard, MediaItem } from './PhotoCard';

export interface TimelineGroup {
  key?: string;
  date: string;
  scale?: string;
  count: number;
  items: MediaItem[];
}

// Keep TimelineDay as alias for backwards compatibility
export type TimelineDay = TimelineGroup;

interface DaySectionProps {
  group: TimelineGroup;
  apiUrl: string;
  selectedIds?: number[];
  density?: 'compact' | 'normal' | 'large';
  onSelect: (item: MediaItem) => void;
  onToggleSelect?: (id: number, e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent, id: number) => void;
  onToggleSelectGroup?: (groupIds: number[], selectAll: boolean) => void;
  onToggleFavorite: (id: number, e: React.MouseEvent) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
  onOpenBurst?: (item: MediaItem, e: React.MouseEvent) => void;
  onBackupToDrive?: (item: MediaItem, e: React.MouseEvent) => void;
}

const DaySectionComponent: React.FC<DaySectionProps> = ({
  group,
  apiUrl,
  selectedIds = [],
  density = 'normal',
  onSelect,
  onToggleSelect,
  onPointerDown,
  onToggleSelectGroup,
  onToggleFavorite,
  onDelete,
  onOpenBurst,
  onBackupToDrive,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    // Viewport Virtualization: Generous 1200px buffer above & below the viewport
    // Keeps DOM node count strictly capped to ~500 items instead of 25,000+
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsVisible(entry.isIntersecting);
      },
      {
        rootMargin: '1200px 0px 1200px 0px',
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const groupItemIds = useMemo(() => group.items.map((i) => i.id), [group.items]);
  const isAllGroupSelected =
    groupItemIds.length > 0 && groupItemIds.every((id) => selectedSet.has(id));
  const someGroupSelected =
    !isAllGroupSelected && groupItemIds.some((id) => selectedSet.has(id));

  const handleGroupSelectToggle = () => {
    if (onToggleSelectGroup) {
      onToggleSelectGroup(groupItemIds, !isAllGroupSelected);
    }
  };

  const getGridCols = () => {
    switch (density) {
      case 'compact':
        return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2';
      case 'large':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
      case 'normal':
      default:
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3';
    }
  };

  const renderIcon = () => {
    if (group.scale === 'year') {
      return <Layers className="w-4 h-4 text-indigo-500" />;
    }
    if (group.scale === 'month') {
      return <CalendarDays className="w-4 h-4 text-indigo-500" />;
    }
    return <Calendar className="w-4 h-4 text-slate-400" />;
  };

  // Estimated height calculation based on item count and density to avoid any layout shifts
  const colsCount = density === 'compact' ? 8 : density === 'large' ? 3 : 5;
  const rowsCount = Math.ceil(group.items.length / colsCount);
  const rowHeight = density === 'compact' ? 120 : density === 'large' ? 260 : 180;
  const estimatedHeight = Math.max(160, rowsCount * rowHeight);

  // Row virtualization / chunking to maintain 60fps scrolling even on huge month/year groups
  const CHUNK_SIZE = 36;
  const chunks = useMemo(() => {
    if (group.items.length <= CHUNK_SIZE) return [group.items];
    const res: MediaItem[][] = [];
    for (let i = 0; i < group.items.length; i += CHUNK_SIZE) {
      res.push(group.items.slice(i, i + CHUNK_SIZE));
    }
    return res;
  }, [group.items]);

  return (
    <section
      ref={sectionRef}
      id={`timeline-group-${group.key || group.date}`}
      className="space-y-3 scroll-mt-20"
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: `0 ${estimatedHeight}px`,
      }}
    >
      {/* Sticky Header with Group Select All Toggle (Always in DOM for Timeline Scrubber minimap) */}
      <div className="flex items-center justify-between text-slate-700 dark:text-slate-200 sticky top-0 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md py-2.5 z-10 border-b border-slate-200/60 dark:border-slate-800 px-1">
        <div className="flex items-center gap-2">
          {renderIcon()}
          <h2 className="font-bold text-sm tracking-tight text-slate-800 dark:text-white">{group.date}</h2>
          <span className="text-xs text-slate-400 font-normal">
            ({group.count} {group.count === 1 ? 'photo' : 'photos'})
          </span>
        </div>

        {/* Group Selection Action */}
        <button
          type="button"
          onClick={handleGroupSelectToggle}
          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition ${
            isAllGroupSelected
              ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200'
              : someGroupSelected
              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800'
          }`}
          title={isAllGroupSelected ? 'Deselect all in group' : 'Select all in group'}
        >
          {isAllGroupSelected ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>
            {isAllGroupSelected
              ? 'Deselect All'
              : `Select All (${group.count})`}
          </span>
        </button>
      </div>

      {/* Grid of Photos: Rendered row chunks with contentVisibility containment */}
      {isVisible ? (
        <div className="space-y-3">
          {chunks.map((chunk, chunkIdx) => {
            const chunkRows = Math.ceil(chunk.length / colsCount);
            const chunkHeight = chunkRows * rowHeight;
            return (
              <div
                key={chunkIdx}
                className={`grid ${getGridCols()}`}
                style={{
                  contentVisibility: 'auto',
                  containIntrinsicSize: `0 ${chunkHeight}px`,
                }}
              >
                {chunk.map((item) => (
                  <PhotoCard
                    key={item.id}
                    item={item}
                    apiUrl={apiUrl}
                    isSelected={selectedSet.has(item.id)}
                    onSelect={onSelect}
                    onToggleSelect={onToggleSelect}
                    onPointerDown={onPointerDown}
                    onToggleFavorite={onToggleFavorite}
                    onDelete={onDelete}
                    onOpenBurst={onOpenBurst}
                    onBackupToDrive={onBackupToDrive}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{ height: `${estimatedHeight}px` }}
          className="w-full rounded-2xl bg-slate-100/20 dark:bg-slate-800/10 pointer-events-none"
        />
      )}
    </section>
  );
};

export const DaySection = React.memo(DaySectionComponent);
