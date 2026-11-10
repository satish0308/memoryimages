'use client';

import React from 'react';
import { Calendar, CalendarDays, Layers, Grid2X2, Grid3X3, LayoutGrid } from 'lucide-react';

export type TimelineScale = 'day' | 'month' | 'year';
export type GridDensity = 'compact' | 'normal' | 'large';

interface ScaleSelectorProps {
  scale: TimelineScale;
  onChangeScale: (scale: TimelineScale) => void;
  density: GridDensity;
  onChangeDensity: (density: GridDensity) => void;
}

export const ScaleSelector: React.FC<ScaleSelectorProps> = ({
  scale,
  onChangeScale,
  density,
  onChangeDensity,
}) => {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {/* Timeline Scale Switcher: Days | Months | Years */}
      <div className="flex items-center bg-slate-200/80 p-1 rounded-xl shadow-inner">
        <button
          type="button"
          onClick={() => onChangeScale('day')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition ${
            scale === 'day'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Daily timeline view"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Days</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeScale('month')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition ${
            scale === 'month'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Monthly timeline view"
        >
          <CalendarDays className="w-3.5 h-3.5" />
          <span>Months</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeScale('year')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition ${
            scale === 'year'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Yearly macro view"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Years</span>
        </button>
      </div>

      {/* Grid Thumbnail Zoom / Density: Compact | Normal | Large (Desktop web only) */}
      <div className="hidden sm:flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl shadow-inner">
        <button
          type="button"
          onClick={() => onChangeDensity('compact')}
          className={`p-1.5 rounded-lg transition ${
            density === 'compact'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
          title="Compact zoom (more photos per row)"
        >
          <Grid3X3 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onChangeDensity('normal')}
          className={`p-1.5 rounded-lg transition ${
            density === 'normal'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
          title="Standard grid zoom"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onChangeDensity('large')}
          className={`p-1.5 rounded-lg transition ${
            density === 'large'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
          title="Large zoom (detailed cards)"
        >
          <Grid2X2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
