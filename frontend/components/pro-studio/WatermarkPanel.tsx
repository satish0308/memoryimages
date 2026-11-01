'use client';

import React from 'react';
import { Type } from 'lucide-react';

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  fontFamily: 'sans' | 'serif' | 'mono' | 'script';
  fontSize: number; // 12 to 72
  opacity: number;  // 10 to 100
  color: string;
  dropShadow: boolean;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
}

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  text: '© MyMemoryPics',
  fontFamily: 'sans',
  fontSize: 24,
  opacity: 75,
  color: '#ffffff',
  dropShadow: true,
  position: 'bottom-right',
};

interface WatermarkPanelProps {
  watermark: WatermarkSettings;
  onChange: (w: WatermarkSettings) => void;
}

export const WatermarkPanel: React.FC<WatermarkPanelProps> = ({ watermark, onChange }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Typography & Watermark
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={watermark.enabled}
            onChange={(e) => onChange({ ...watermark, enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-purple-600"></div>
        </label>
      </div>

      {watermark.enabled && (
        <div className="space-y-3.5 pt-2 text-xs border-t border-slate-800">
          {/* Text Input */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400">Watermark Text</label>
            <input
              type="text"
              value={watermark.text}
              onChange={(e) => onChange({ ...watermark, text: e.target.value })}
              placeholder="e.g. © 2026 Your Name"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Font Family */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400">Font Style</label>
            <div className="grid grid-cols-4 gap-1">
              {[
                { id: 'sans', label: 'Sans', style: 'font-sans' },
                { id: 'serif', label: 'Serif', style: 'font-serif' },
                { id: 'mono', label: 'Mono', style: 'font-mono' },
                { id: 'script', label: 'Script', style: 'italic' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onChange({ ...watermark, fontFamily: f.id as any })}
                  className={`py-1 rounded-lg text-xs font-semibold transition ${f.style} ${
                    watermark.fontFamily === f.id
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Position Anchor */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400">Position Anchor</label>
            <select
              value={watermark.position}
              onChange={(e) => onChange({ ...watermark, position: e.target.value as any })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="top-right">Top Right</option>
              <option value="top-left">Top Left</option>
              <option value="center">Center Stamp</option>
            </select>
          </div>

          {/* Font Size & Opacity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Size</span>
                <span className="font-mono text-purple-400 font-bold">{watermark.fontSize}px</span>
              </div>
              <input
                type="range"
                min={12}
                max={72}
                value={watermark.fontSize}
                onChange={(e) => onChange({ ...watermark, fontSize: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Opacity</span>
                <span className="font-mono text-purple-400 font-bold">{watermark.opacity}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={watermark.opacity}
                onChange={(e) => onChange({ ...watermark, opacity: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
