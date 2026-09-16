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
  SlidersHorizontal
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
    Boolean(filters.startDate) ||
    Boolean(filters.endDate);

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
                Narrow down timeline by camera, date & quality
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
          
          {/* 1. Date Range */}
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

          {/* 2. Photo Orientation */}
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

          {/* 3. Camera / Device */}
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

          {/* 4. Special Attribute Toggles */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Attributes & Flags
            </div>

            <div className="space-y-2">
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
            <span>Show {matchingCount} Photos</span>
            <span className="text-indigo-200 text-[10px]">({totalCount} total)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
