'use client';

import React from 'react';
import { 
  Move, 
  Crop, 
  Bandage, 
  SunMedium, 
  SlidersHorizontal, 
  Type, 
  ZoomIn, 
  Sparkles,
  Contrast
} from 'lucide-react';

export type StudioTool = 'pan' | 'crop' | 'heal' | 'dodge_burn' | 'gradient_mask' | 'text';

interface ProToolbarProps {
  activeTool: StudioTool;
  onSelectTool: (tool: StudioTool) => void;
}

export const ProToolbar: React.FC<ProToolbarProps> = ({ activeTool, onSelectTool }) => {
  const tools = [
    { id: 'pan', label: 'Hand / Pan Tool', hotkey: 'V', icon: Move },
    { id: 'crop', label: 'Crop & Transform', hotkey: 'C', icon: Crop },
    { id: 'heal', label: 'Spot Healing Brush (Blemish Remover)', hotkey: 'J', icon: Bandage },
    { id: 'dodge_burn', label: 'Dodge & Burn Precision Brush', hotkey: 'O', icon: SunMedium },
    { id: 'gradient_mask', label: 'Selective Masks (Radial & Linear)', hotkey: 'G', icon: SlidersHorizontal },
    { id: 'text', label: 'Typography & Watermark Stamp', hotkey: 'T', icon: Type },
  ] as const;

  return (
    <aside className="w-12 border-r border-slate-800 bg-slate-900/95 flex flex-col items-center py-3 gap-2 shrink-0 select-none z-20">
      {tools.map((t) => {
        const Icon = t.icon;
        const isActive = activeTool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTool(t.id as StudioTool)}
            className={`relative p-2.5 rounded-xl transition cursor-pointer group flex items-center justify-center ${
              isActive
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title={`${t.label} (${t.hotkey})`}
          >
            <Icon className="w-4 h-4" />
            <span className="absolute left-1 bottom-1 text-[8px] font-mono font-bold opacity-60">
              {t.hotkey}
            </span>

            {/* Tooltip on Hover */}
            <div className="absolute left-14 px-2 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-lg shadow-xl border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              {t.label} <span className="text-indigo-400 font-mono">({t.hotkey})</span>
            </div>
          </button>
        );
      })}
    </aside>
  );
};
