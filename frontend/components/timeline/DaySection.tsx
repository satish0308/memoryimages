'use client';

import React from 'react';
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
  onToggleSelectGroup?: (groupIds: number[], selectAll: boolean) => void;
  onToggleFavorite: (id: number, e: React.MouseEvent) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
  onOpenBurst?: (item: MediaItem, e: React.MouseEvent) => void;
}

export const DaySection: React.FC<DaySectionProps> = ({
  group,
  apiUrl,
  selectedIds = [],
  density = 'normal',
  onSelect,
  onToggleSelect,
  onToggleSelectGroup,
  onToggleFavorite,
  onDelete,
  onOpenBurst,
}) => {
  const groupItemIds = group.items.map((i) => i.id);
  const isAllGroupSelected =
    groupItemIds.length > 0 && groupItemIds.every((id) => selectedIds.includes(id));
  const someGroupSelected =
    !isAllGroupSelected && groupItemIds.some((id) => selectedIds.includes(id));

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

  return (
    <section className="space-y-3">
      {/* Sticky Header with Group Select All Toggle */}
      <div className="flex items-center justify-between text-slate-700 sticky top-0 bg-slate-50/95 backdrop-blur-md py-2.5 z-10 border-b border-slate-200/60 px-1">
        <div className="flex items-center gap-2">
          {renderIcon()}
          <h2 className="font-bold text-sm tracking-tight text-slate-800">{group.date}</h2>
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
              ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
              : someGroupSelected
              ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
          }`}
          title={isAllGroupSelected ? 'Deselect all in group' : 'Select all in group'}
        >
          {isAllGroupSelected ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
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

      {/* Grid of Photos with dynamic density */}
      <div className={`grid ${getGridCols()}`}>
        {group.items.map((item) => (
          <PhotoCard
            key={item.id}
            item={item}
            apiUrl={apiUrl}
            isSelected={selectedIds.includes(item.id)}
            onSelect={onSelect}
            onToggleSelect={onToggleSelect}
            onToggleFavorite={onToggleFavorite}
            onDelete={onDelete}
            onOpenBurst={onOpenBurst}
          />
        ))}
      </div>
    </section>
  );
};
