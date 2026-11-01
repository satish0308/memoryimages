'use client';

import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { HslSettings, HslChannel, DEFAULT_HSL_CHANNEL, DEFAULT_HSL_SETTINGS } from '@/utils/hslUtils';

interface HslColorMixerProps {
  settings: HslSettings;
  onChange: (newSettings: HslSettings) => void;
}

const COLOR_TABS = [
  { key: 'red', label: 'Red', color: '#ef4444' },
  { key: 'orange', label: 'Orange', color: '#f97316' },
  { key: 'yellow', label: 'Yellow', color: '#eab308' },
  { key: 'green', label: 'Green', color: '#22c55e' },
  { key: 'aqua', label: 'Aqua', color: '#06b6d4' },
  { key: 'blue', label: 'Blue', color: '#3b82f6' },
  { key: 'purple', label: 'Purple', color: '#a855f7' },
  { key: 'magenta', label: 'Magenta', color: '#ec4899' },
] as const;

export const HslColorMixer: React.FC<HslColorMixerProps> = ({ settings, onChange }) => {
  const [activeColor, setActiveColor] = useState<keyof HslSettings>('red');
  const currentChannel = settings[activeColor] || DEFAULT_HSL_CHANNEL;

  const updateParam = (param: keyof HslChannel, val: number) => {
    onChange({
      ...settings,
      [activeColor]: {
        ...currentChannel,
        [param]: val,
      },
    });
  };

  const resetCurrentChannel = () => {
    onChange({
      ...settings,
      [activeColor]: { ...DEFAULT_HSL_CHANNEL },
    });
  };

  const currentColorMeta = COLOR_TABS.find((c) => c.key === activeColor)!;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 select-none">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
          8-Channel HSL Mixer
        </span>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_HSL_SETTINGS)}
          className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition"
          title="Reset All HSL Channels"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset All</span>
        </button>
      </div>

      {/* 8 Spectral Color Buttons */}
      <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
        {COLOR_TABS.map((tab) => {
          const ch = settings[tab.key as keyof HslSettings];
          const hasShift = ch.hue !== 0 || ch.saturation !== 0 || ch.luminance !== 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveColor(tab.key as keyof HslSettings)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeColor === tab.key
                  ? 'bg-slate-800 text-white shadow ring-1 ring-white/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tab.color }}
              />
              <span className="truncate text-[11px]">{tab.label}</span>
              {hasShift && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 ml-auto" />
              )}
            </button>
          );
        })}
      </div>

      {/* 3 Parameter Sliders (Hue, Saturation, Luminance) */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: currentColorMeta.color }}
            />
            {currentColorMeta.label} Channel
          </span>
          <button
            type="button"
            onClick={resetCurrentChannel}
            className="text-[10px] text-slate-400 hover:text-rose-400 transition"
          >
            Reset
          </button>
        </div>

        {/* Hue Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Hue Shift</span>
            <span className="font-mono font-bold text-indigo-400">
              {currentChannel.hue > 0 ? `+${currentChannel.hue}` : currentChannel.hue}
            </span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            value={currentChannel.hue}
            onChange={(e) => updateParam('hue', Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        {/* Saturation Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Saturation</span>
            <span className="font-mono font-bold text-indigo-400">
              {currentChannel.saturation > 0 ? `+${currentChannel.saturation}` : currentChannel.saturation}
            </span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            value={currentChannel.saturation}
            onChange={(e) => updateParam('saturation', Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        {/* Luminance Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Luminance</span>
            <span className="font-mono font-bold text-indigo-400">
              {currentChannel.luminance > 0 ? `+${currentChannel.luminance}` : currentChannel.luminance}
            </span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            value={currentChannel.luminance}
            onChange={(e) => updateParam('luminance', Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>
      </div>
    </div>
  );
};
