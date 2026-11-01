'use client';

import React from 'react';
import { Circle, Minus, RotateCcw } from 'lucide-react';

export interface RadialMaskSettings {
  enabled: boolean;
  centerX: number; // 0 to 100%
  centerY: number; // 0 to 100%
  radiusX: number; // 10 to 100%
  radiusY: number; // 10 to 100%
  feather: number; // 10 to 100%
  invert: boolean;
  exposure: number; // -100 to 100
  warmth: number;   // -100 to 100
}

export interface LinearMaskSettings {
  enabled: boolean;
  positionY: number; // 0 to 100%
  angle: number;     // -90 to 90 degrees
  feather: number;   // 10 to 100%
  exposure: number;  // -100 to 100
  warmth: number;    // -100 to 100
}

export const DEFAULT_RADIAL_MASK: RadialMaskSettings = {
  enabled: false,
  centerX: 50,
  centerY: 50,
  radiusX: 40,
  radiusY: 40,
  feather: 50,
  invert: false,
  exposure: 20,
  warmth: 10,
};

export const DEFAULT_LINEAR_MASK: LinearMaskSettings = {
  enabled: false,
  positionY: 35,
  angle: 0,
  feather: 40,
  exposure: -25,
  warmth: -10,
};

interface MasksPanelProps {
  radial: RadialMaskSettings;
  linear: LinearMaskSettings;
  onUpdateRadial: (r: RadialMaskSettings) => void;
  onUpdateLinear: (l: LinearMaskSettings) => void;
}

export const MasksPanel: React.FC<MasksPanelProps> = ({
  radial,
  linear,
  onUpdateRadial,
  onUpdateLinear,
}) => {
  return (
    <div className="space-y-4 select-none">
      {/* 1. Radial Spotlight Mask */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Circle className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Radial Spotlight Mask
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={radial.enabled}
              onChange={(e) => onUpdateRadial({ ...radial, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {radial.enabled && (
          <div className="space-y-3 pt-2 text-xs border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Target Area</span>
              <button
                type="button"
                onClick={() => onUpdateRadial({ ...radial, invert: !radial.invert })}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                  radial.invert
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                {radial.invert ? 'Outside (Vignette)' : 'Inside (Spotlight)'}
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Mask Exposure</span>
                <span className="font-mono font-bold text-indigo-400">
                  {radial.exposure > 0 ? `+${radial.exposure}` : radial.exposure}
                </span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={radial.exposure}
                onChange={(e) => onUpdateRadial({ ...radial, exposure: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Mask Warmth</span>
                <span className="font-mono font-bold text-indigo-400">
                  {radial.warmth > 0 ? `+${radial.warmth}` : radial.warmth}
                </span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={radial.warmth}
                onChange={(e) => onUpdateRadial({ ...radial, warmth: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Feather Falloff</span>
                <span className="font-mono font-bold text-indigo-400">{radial.feather}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={radial.feather}
                onChange={(e) => onUpdateRadial({ ...radial, feather: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Linear Horizon Sky Mask */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Linear Horizon Sky Mask
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={linear.enabled}
              onChange={(e) => onUpdateLinear({ ...linear, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-cyan-600"></div>
          </label>
        </div>

        {linear.enabled && (
          <div className="space-y-3 pt-2 text-xs border-t border-slate-800">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Sky Exposure</span>
                <span className="font-mono font-bold text-cyan-400">
                  {linear.exposure > 0 ? `+${linear.exposure}` : linear.exposure}
                </span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={linear.exposure}
                onChange={(e) => onUpdateLinear({ ...linear, exposure: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Horizon Position Y</span>
                <span className="font-mono font-bold text-cyan-400">{linear.positionY}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={95}
                value={linear.positionY}
                onChange={(e) => onUpdateLinear({ ...linear, positionY: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Feather Width</span>
                <span className="font-mono font-bold text-cyan-400">{linear.feather}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={90}
                value={linear.feather}
                onChange={(e) => onUpdateLinear({ ...linear, feather: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
