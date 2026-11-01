'use client';

import React, { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ColorWheelGrading, DEFAULT_COLOR_GRADING } from '@/utils/hslUtils';

interface ColorGradingWheelsProps {
  grading: ColorWheelGrading;
  onChange: (newGrading: ColorWheelGrading) => void;
}

export const ColorGradingWheels: React.FC<ColorGradingWheelsProps> = ({ grading, onChange }) => {
  const [activeZone, setActiveZone] = useState<'shadows' | 'midtones' | 'highlights'>('shadows');
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef<boolean>(false);

  const currentZone = grading[activeZone];

  const updateZoneParam = (param: 'hue' | 'saturation' | 'luminance', value: number) => {
    onChange({
      ...grading,
      [activeZone]: {
        ...currentZone,
        [param]: value,
      },
    });
  };

  const handleWheelMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDragging.current = true;
    updatePuckFromEvent(e);
  };

  const handleWheelMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    updatePuckFromEvent(e);
  };

  const handleWheelMouseUp = () => {
    isDragging.current = false;
  };

  const updatePuckFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const clickX = e.clientX - rect.left - centerX;
    const clickY = e.clientY - rect.top - centerY;

    const radius = rect.width / 2;
    const dist = Math.min(radius, Math.sqrt(clickX * clickX + clickY * clickY));

    // Calculate Hue in degrees (0 - 360)
    let angleRad = Math.atan2(clickY, clickX);
    let angleDeg = Math.round((angleRad * 180) / Math.PI);
    if (angleDeg < 0) angleDeg += 360;

    // Saturation percentage (0 - 100)
    const sat = Math.round((dist / radius) * 100);

    onChange({
      ...grading,
      [activeZone]: {
        ...currentZone,
        hue: angleDeg,
        saturation: sat,
      },
    });
  };

  // Puck position
  const puckDist = (currentZone.saturation / 100) * 44; // 44px radius for 90px wheel
  const puckRad = (currentZone.hue * Math.PI) / 180;
  const puckX = 45 + Math.cos(puckRad) * puckDist;
  const puckY = 45 + Math.sin(puckRad) * puckDist;

  return (
    <div 
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 select-none"
      onMouseMove={handleWheelMouseMove}
      onMouseUp={handleWheelMouseUp}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Color Grading (3-Way Wheels)
        </span>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_COLOR_GRADING)}
          className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition"
          title="Reset All Color Grading"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Zone Switcher (Shadows / Midtones / Highlights) */}
      <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
        {(['shadows', 'midtones', 'highlights'] as const).map((z) => {
          const hasColor = grading[z].saturation > 0 || grading[z].luminance !== 0;
          return (
            <button
              key={z}
              type="button"
              onClick={() => setActiveZone(z)}
              className={`py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeZone === z
                  ? 'bg-slate-800 text-white shadow ring-1 ring-white/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{z}</span>
              {hasColor && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
            </button>
          );
        })}
      </div>

      {/* Circular Color Wheel & Puck */}
      <div className="flex items-center justify-center gap-6 py-2">
        <div
          ref={wheelRef}
          onMouseDown={handleWheelMouseDown}
          className="relative w-[90px] h-[90px] rounded-full border border-slate-700/80 cursor-crosshair shadow-lg overflow-hidden shrink-0"
          style={{
            background: 'conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)',
          }}
        >
          {/* Radial mask to blend center to neutral gray */}
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(128,128,128,1) 0%, rgba(128,128,128,0) 85%)',
            }}
          />

          {/* Draggable Tint Puck */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full border-2 border-white bg-slate-900 shadow-md transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${puckX}px`, top: `${puckY}px` }}
          />
        </div>

        {/* Numeric Readout */}
        <div className="text-xs space-y-1 text-slate-400 font-mono">
          <div>Hue: <span className="text-white font-bold">{currentZone.hue}°</span></div>
          <div>Sat: <span className="text-white font-bold">{currentZone.saturation}%</span></div>
          <div>Luma: <span className="text-white font-bold">{currentZone.luminance > 0 ? `+${currentZone.luminance}` : currentZone.luminance}</span></div>
        </div>
      </div>

      {/* Luminance Slider */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-400 font-medium">Luminance Balance</span>
          <span className="font-mono font-bold text-indigo-400">
            {currentZone.luminance > 0 ? `+${currentZone.luminance}` : currentZone.luminance}
          </span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          value={currentZone.luminance}
          onChange={(e) => updateZoneParam('luminance', Number(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
      </div>
    </div>
  );
};
