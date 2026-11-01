'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';

export interface CurvePoint {
  x: number; // 0 to 255
  y: number; // 0 to 255
}

export interface ToneCurves {
  rgb: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export const DEFAULT_CURVE_POINTS: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 64, y: 64 },
  { x: 128, y: 128 },
  { x: 192, y: 192 },
  { x: 255, y: 255 },
];

export const DEFAULT_TONE_CURVES: ToneCurves = {
  rgb: [...DEFAULT_CURVE_POINTS],
  red: [...DEFAULT_CURVE_POINTS],
  green: [...DEFAULT_CURVE_POINTS],
  blue: [...DEFAULT_CURVE_POINTS],
};

interface ToneCurveEditorProps {
  curves: ToneCurves;
  onChange: (newCurves: ToneCurves) => void;
}

export const ToneCurveEditor: React.FC<ToneCurveEditorProps> = ({ curves, onChange }) => {
  const [activeChannel, setActiveChannel] = useState<'rgb' | 'red' | 'green' | 'blue'>('rgb');
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDragging = useRef<boolean>(false);

  const currentPoints = curves[activeChannel] || DEFAULT_CURVE_POINTS;

  // Monotone cubic spline interpolation to draw smooth curve
  const generatePathData = useCallback((points: CurvePoint[]): string => {
    if (points.length < 2) return '';
    const sorted = [...points].sort((a, b) => a.x - b.x);

    // SVG coordinates: (0, 255) maps to (0, 200) with Y flipped: svgY = 200 - (y / 255) * 200
    const toSvg = (p: CurvePoint) => ({
      x: (p.x / 255) * 200,
      y: 200 - (p.y / 255) * 200,
    });

    const svgPoints = sorted.map(toSvg);
    let d = `M ${svgPoints[0].x} ${svgPoints[0].y}`;

    for (let i = 0; i < svgPoints.length - 1; i++) {
      const p0 = svgPoints[Math.max(0, i - 1)];
      const p1 = svgPoints[i];
      const p2 = svgPoints[i + 1];
      const p3 = svgPoints[Math.min(svgPoints.length - 1, i + 2)];

      // Catmull-Rom to Cubic Bezier conversion
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    return d;
  }, []);

  const handleMouseDown = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPointIdx(idx);
    isDragging.current = true;
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || selectedPointIdx === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const clientY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const newX = Math.round((clientX / rect.width) * 255);
    const newY = Math.round((1 - clientY / rect.height) * 255);

    const updated = [...currentPoints];
    // Keep first point at x=0, last point at x=255
    if (selectedPointIdx === 0) {
      updated[0] = { x: 0, y: Math.max(0, Math.min(255, newY)) };
    } else if (selectedPointIdx === currentPoints.length - 1) {
      updated[currentPoints.length - 1] = { x: 255, y: Math.max(0, Math.min(255, newY)) };
    } else {
      // Clamp between adjacent points
      const minX = updated[selectedPointIdx - 1].x + 5;
      const maxX = updated[selectedPointIdx + 1].x - 5;
      updated[selectedPointIdx] = {
        x: Math.max(minX, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(255, newY)),
      };
    }

    onChange({
      ...curves,
      [activeChannel]: updated,
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // Presets
  const applyPreset = (presetName: string) => {
    let newPoints: CurvePoint[] = [...DEFAULT_CURVE_POINTS];
    if (presetName === 's_curve') {
      newPoints = [
        { x: 0, y: 0 },
        { x: 64, y: 48 },
        { x: 128, y: 128 },
        { x: 192, y: 208 },
        { x: 255, y: 255 },
      ];
    } else if (presetName === 'high_contrast') {
      newPoints = [
        { x: 0, y: 0 },
        { x: 64, y: 36 },
        { x: 128, y: 128 },
        { x: 192, y: 220 },
        { x: 255, y: 255 },
      ];
    } else if (presetName === 'matte_film') {
      newPoints = [
        { x: 0, y: 35 },
        { x: 64, y: 68 },
        { x: 128, y: 128 },
        { x: 192, y: 190 },
        { x: 255, y: 235 },
      ];
    }
    onChange({
      ...curves,
      [activeChannel]: newPoints,
    });
  };

  const getChannelColor = () => {
    switch (activeChannel) {
      case 'red': return '#ef4444';
      case 'green': return '#22c55e';
      case 'blue': return '#3b82f6';
      default: return '#ffffff';
    }
  };

  return (
    <div 
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 select-none"
      onMouseMove={handleSvgMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Channel Selector Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Tone Curves
        </span>
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {(['rgb', 'red', 'green', 'blue'] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => {
                setActiveChannel(ch);
                setSelectedPointIdx(null);
              }}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold uppercase transition ${
                activeChannel === ch
                  ? ch === 'red'
                    ? 'bg-red-600 text-white'
                    : ch === 'green'
                    ? 'bg-green-600 text-white'
                    : ch === 'blue'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Interactive Tone Curve Graph */}
      <div className="relative aspect-square max-w-[240px] mx-auto bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
        {/* Background 4x4 Grid */}
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 pointer-events-none">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="border-r border-b border-white/5" />
          ))}
        </div>

        {/* Diagonal Baseline */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <line x1="0" y1="100%" x2="100%" y2="0" stroke="rgba(255,255,255,0.1)" strokeDasharray="3,3" />
        </svg>

        {/* Interactive Spline Curve */}
        <svg
          ref={svgRef}
          viewBox="0 0 200 200"
          className="relative w-full h-full cursor-crosshair"
        >
          {/* Curve Path */}
          <path
            d={generatePathData(currentPoints)}
            fill="none"
            stroke={getChannelColor()}
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Interactive Control Points */}
          {currentPoints.map((pt, idx) => {
            const cx = (pt.x / 255) * 200;
            const cy = 200 - (pt.y / 255) * 200;
            const isSelected = selectedPointIdx === idx;
            return (
              <g key={idx} onMouseDown={(e) => handleMouseDown(idx, e)}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="8"
                  className="fill-transparent cursor-pointer"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected ? "6" : "4.5"}
                  fill={isSelected ? '#6366f1' : getChannelColor()}
                  stroke="#0f172a"
                  strokeWidth="2"
                  className="cursor-pointer transition-all hover:scale-125"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* 1-Click Curve Presets */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-[10px] text-slate-500 font-medium">Presets:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyPreset('s_curve')}
            className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition"
          >
            S-Curve
          </button>
          <button
            type="button"
            onClick={() => applyPreset('high_contrast')}
            className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition"
          >
            Contrast
          </button>
          <button
            type="button"
            onClick={() => applyPreset('matte_film')}
            className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition"
          >
            Matte Film
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...curves, [activeChannel]: [...DEFAULT_CURVE_POINTS] })}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition"
            title="Reset Channel Curve"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
