'use client';

import React from 'react';
import { 
  X, 
  RotateCcw, 
  Heart, 
  MapPin, 
  Sparkles, 
  Camera, 
  Calendar, 
  Maximize2, 
  Smartphone, 
  Square,
  SlidersHorizontal,
  Film,
  Smile,
  Palette,
  Play
} from 'lucide-react';

export interface SmartFilters {
  datePreset: 'all' | '7d' | '30d' | 'this_year' | 'last_year' | 'custom';
  startDate: string;
  endDate: string;
  camera: string;
  orientation: 'all' | 'landscape' | 'portrait' | 'square';
  favoritesOnly: boolean;
  geotaggedOnly: boolean;
  sharpOnly: boolean;
  // AI Emotion, Mood & Visual filters
  mood: string;
  color: string;
  mediaType: 'all' | 'photos' | 'videos';
  smilingOnly: boolean;
}

export const DEFAULT_SMART_FILTERS: SmartFilters = {
  datePreset: 'all',
  startDate: '',
  endDate: '',
  camera: 'all',
  orientation: 'all',
  favoritesOnly: false,
  geotaggedOnly: false,
  sharpOnly: false,
  mood: 'all',
  color: 'all',
  mediaType: 'all',
  smilingOnly: false,
};

interface SmartFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SmartFilters;
  onFiltersChange: (filters: SmartFilters) => void;
  availableCameras: string[];
  matchingCount: number;
  totalCount: number;
}

export const SmartFilterDrawer: React.FC<SmartFilterDrawerProps> = ({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  availableCameras,
  matchingCount,
  totalCount,
}) => {
  if (!isOpen) return null;

  const update = (partial: Partial<SmartFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const handleReset = () => {
    onFiltersChange(DEFAULT_SMART_FILTERS);
  };

  const isFiltered = 
    filters.datePreset !== 'all' ||
    filters.camera !== 'all' ||
    filters.orientation !== 'all' ||
    filters.favoritesOnly ||
    filters.geotaggedOnly ||
    filters.sharpOnly ||
    filters.mood !== 'all' ||
    filters.color !== 'all' ||
    filters.mediaType !== 'all' ||
    filters.smilingOnly ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate);

  const MOOD_OPTIONS = [
    { id: 'all', label: 'All Moods', emoji: '✨' },
    { id: 'joyful', label: 'Joyful & Happy', emoji: '😊' },
    { id: 'serene', label: 'Serene & Calm', emoji: '🌅' },
    { id: 'celebratory', label: 'Celebratory', emoji: '🎉' },
    { id: 'adventurous', label: 'Adventurous', emoji: '⛰️' },
    { id: 'cozy', label: 'Cozy & Warm', emoji: '☕' },
    { id: 'dramatic', label: 'Dramatic', emoji: '🎭' },
    { id: 'romantic', label: 'Romantic', emoji: '❤️' },
    { id: 'nostalgic', label: 'Nostalgic', emoji: '🕰️' },
  ];

  const COLOR_OPTIONS = [
    { id: 'all', label: 'All Colors', hex: 'transparent' },
    { id: 'blue', label: 'Ocean Blue', hex: '#3B82F6' },
    { id: 'green', label: 'Lush Green', hex: '#10B981' },
    { id: 'gold', label: 'Golden Amber', hex: '#F59E0B' },
    { id: 'red', label: 'Crimson Red', hex: '#EF4444' },
    { id: 'orange', label: 'Sunset Orange', hex: '#F97316' },
    { id: 'purple', label: 'Royal Purple', hex: '#8B5CF6' },
    { id: 'monochrome', label: 'Black & White', hex: '#64748B' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-fadeIn">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-slideLeft">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Smart Filters</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Filter by emotion, mood, colors, camera & format
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Filter Options */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">
          
          {/* 1. Media Type (Photos vs Videos) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Film className="w-3.5 h-3.5" />
              <span>Media Format</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'all', label: 'All Formats' },
                { id: 'photos', label: 'Photos Only' },
                { id: 'videos', label: 'Videos Only' },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => update({ mediaType: fmt.id as SmartFilters['mediaType'] })}
                  className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
                    filters.mediaType === fmt.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. AI Emotion & Mood */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Emotion & Atmosphere</span>
              </div>
              {filters.mood !== 'all' && (
                <button
                  onClick={() => update({ mood: 'all' })}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline capitalize"
                >
                  Clear Mood
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => update({ mood: m.id })}
                  className={`flex items-center gap-1.5 py-2 px-2 rounded-xl text-xs font-medium border transition ${
                    filters.mood === m.id
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-transparent shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="text-sm">{m.emoji}</span>
                  <span className="truncate text-[11px] font-semibold">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Color Palette Swatches */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-purple-500" />
                <span>Color Palette</span>
              </div>
              {filters.color !== 'all' && (
                <button
                  onClick={() => update({ color: 'all' })}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline capitalize"
                >
                  Clear Color
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => update({ color: c.id })}
                  className={`flex items-center gap-2 py-1.5 px-2 rounded-xl border text-xs font-medium transition ${
                    filters.color === c.id
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent shadow-xs ring-2 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {c.id !== 'all' ? (
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/50 shadow-xs flex-shrink-0"
                      style={{ backgroundColor: c.hex }}
                    />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-dashed border-slate-400 flex-shrink-0" />
                  )}
                  <span className="truncate text-[11px]">{c.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Date Range */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>Capture Date</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'all', label: 'All Time' },
                { id: '7d', label: 'Past 7 Days' },
                { id: '30d', label: 'Past 30 Days' },
                { id: 'this_year', label: 'This Year' },
                { id: 'last_year', label: 'Last Year' },
                { id: 'custom', label: 'Custom' },
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => update({ datePreset: preset.id as SmartFilters['datePreset'] })}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition ${
                    filters.datePreset === preset.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {filters.datePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">From Date</label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => update({ startDate: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">To Date</label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => update({ endDate: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 5. Photo Orientation */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Orientation</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'all', label: 'All', icon: Maximize2 },
                { id: 'landscape', label: 'Landscape', icon: Maximize2 },
                { id: 'portrait', label: 'Portrait', icon: Smartphone },
                { id: 'square', label: 'Square', icon: Square },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => update({ orientation: item.id as SmartFilters['orientation'] })}
                    className={`flex flex-col items-center gap-1.5 py-2 px-1 rounded-xl border text-xs font-medium transition ${
                      filters.orientation === item.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px]">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. Camera / Device */}
          {availableCameras.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Camera className="w-3.5 h-3.5" />
                <span>Camera Device</span>
              </div>

              <select
                value={filters.camera}
                onChange={(e) => update({ camera: e.target.value })}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Devices & Cameras</option>
                {availableCameras.map((cam) => (
                  <option key={cam} value={cam}>
                    {cam}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 7. Special Attribute Toggles */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Attributes & Flags
            </div>

            <div className="space-y-2">
              {/* Smiling Faces Only */}
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition">
                <div className="flex items-center gap-2.5">
                  <Smile className={`w-4 h-4 ${filters.smilingOnly ? 'text-amber-500' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">Smiling Faces Only</span>
                </div>
                <input
                  type="checkbox"
                  checked={filters.smilingOnly}
                  onChange={(e) => update({ smilingOnly: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>

              {/* Favorites Only */}
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition">
                <div className="flex items-center gap-2.5">
                  <Heart className={`w-4 h-4 ${filters.favoritesOnly ? 'text-red-500 fill-red-500' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">Favorites Only</span>
                </div>
                <input
                  type="checkbox"
                  checked={filters.favoritesOnly}
                  onChange={(e) => update({ favoritesOnly: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>

              {/* Geotagged Only */}
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition">
                <div className="flex items-center gap-2.5">
                  <MapPin className={`w-4 h-4 ${filters.geotaggedOnly ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">Geotagged (with GPS location)</span>
                </div>
                <input
                  type="checkbox"
                  checked={filters.geotaggedOnly}
                  onChange={(e) => update({ geotaggedOnly: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>

              {/* Hide Blurry */}
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition">
                <div className="flex items-center gap-2.5">
                  <Sparkles className={`w-4 h-4 ${filters.sharpOnly ? 'text-amber-500' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">Sharp Shots Only (Exclude Blurry)</span>
                </div>
                <input
                  type="checkbox"
                  checked={filters.sharpOnly}
                  onChange={(e) => update({ sharpOnly: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer with Actions & Match Count */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between gap-3">
          {isFiltered && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset All
            </button>
          )}

          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-md flex items-center justify-center gap-2"
          >
            <span>Show {matchingCount} Items</span>
            <span className="text-indigo-200 text-[10px]">({totalCount} total)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
