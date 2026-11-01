'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface HistogramViewProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  refreshTrigger?: any;
}

export const HistogramView: React.FC<HistogramViewProps> = ({ canvasRef, refreshTrigger }) => {
  const histCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shadowClipped, setShadowClipped] = useState(false);
  const [highlightClipped, setHighlightClipped] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'rgb' | 'luma' | 'r' | 'g' | 'b'>('rgb');

  useEffect(() => {
    const sourceCanvas = canvasRef.current;
    const targetCanvas = histCanvasRef.current;
    if (!sourceCanvas || !targetCanvas) return;

    const targetCtx = targetCanvas.getContext('2d');
    if (!targetCtx) return;

    // Subsample source canvas to calculate 256-bin histogram quickly without lag
    const sampleW = Math.min(300, sourceCanvas.width);
    const sampleH = Math.min(200, sourceCanvas.height);
    if (sampleW === 0 || sampleH === 0) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = sampleW;
    offscreen.height = sampleH;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;

    offCtx.drawImage(sourceCanvas, 0, 0, sampleW, sampleH);
    let imgData: ImageData;
    try {
      imgData = offCtx.getImageData(0, 0, sampleW, sampleH);
    } catch (e) {
      return; // Security/tainted canvas protection
    }

    const data = imgData.data;
    const rBins = new Uint32Array(256);
    const gBins = new Uint32Array(256);
    const bBins = new Uint32Array(256);
    const lumaBins = new Uint32Array(256);

    let crushedCount = 0;
    let blownCount = 0;
    const totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      rBins[r]++;
      gBins[g]++;
      bBins[b]++;
      lumaBins[luma]++;

      if (r === 0 && g === 0 && b === 0) crushedCount++;
      if (r >= 254 && g >= 254 && b >= 254) blownCount++;
    }

    setShadowClipped(crushedCount / totalPixels > 0.005);
    setHighlightClipped(blownCount / totalPixels > 0.005);

    // Find max frequency to normalize
    let maxCount = 1;
    for (let i = 2; i < 254; i++) {
      if (rBins[i] > maxCount) maxCount = rBins[i];
      if (gBins[i] > maxCount) maxCount = gBins[i];
      if (bBins[i] > maxCount) maxCount = bBins[i];
    }

    // Render histogram curves
    const W = targetCanvas.width;
    const H = targetCanvas.height;
    targetCtx.clearRect(0, 0, W, H);

    // Draw background grid
    targetCtx.fillStyle = '#0f172a';
    targetCtx.fillRect(0, 0, W, H);

    // Grid lines for quarters
    targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    targetCtx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((pct) => {
      targetCtx.beginPath();
      targetCtx.moveTo(W * pct, 0);
      targetCtx.lineTo(W * pct, H);
      targetCtx.stroke();
    });

    const drawCurve = (bins: Uint32Array, strokeColor: string, fillColor?: string) => {
      targetCtx.beginPath();
      targetCtx.moveTo(0, H);
      for (let x = 0; x < 256; x++) {
        const binVal = bins[x];
        const normalized = Math.min(1, binVal / maxCount);
        const y = H - normalized * (H * 0.92);
        const canvasX = (x / 255) * W;
        targetCtx.lineTo(canvasX, y);
      }
      targetCtx.lineTo(W, H);
      targetCtx.closePath();

      if (fillColor) {
        targetCtx.fillStyle = fillColor;
        targetCtx.fill();
      }
      targetCtx.strokeStyle = strokeColor;
      targetCtx.lineWidth = 1.5;
      targetCtx.stroke();
    };

    if (activeChannel === 'rgb') {
      targetCtx.globalCompositeOperation = 'screen';
      drawCurve(rBins, 'rgba(239, 68, 68, 0.9)', 'rgba(239, 68, 68, 0.25)');
      drawCurve(gBins, 'rgba(34, 197, 94, 0.9)', 'rgba(34, 197, 94, 0.25)');
      drawCurve(bBins, 'rgba(59, 130, 246, 0.9)', 'rgba(59, 130, 246, 0.25)');
      targetCtx.globalCompositeOperation = 'source-over';
    } else if (activeChannel === 'luma') {
      drawCurve(lumaBins, 'rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.2)');
    } else if (activeChannel === 'r') {
      drawCurve(rBins, 'rgba(239, 68, 68, 1)', 'rgba(239, 68, 68, 0.35)');
    } else if (activeChannel === 'g') {
      drawCurve(gBins, 'rgba(34, 197, 94, 1)', 'rgba(34, 197, 94, 0.35)');
    } else if (activeChannel === 'b') {
      drawCurve(bBins, 'rgba(59, 130, 246, 1)', 'rgba(59, 130, 246, 0.35)');
    }
  }, [canvasRef, refreshTrigger, activeChannel]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2 shadow-inner">
      {/* Header with Clipping Alerts */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
            RGB Histogram
          </span>
          <div className="flex items-center gap-1">
            {/* Shadow Clipping Alert (Blue dot) */}
            <span
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                shadowClipped
                  ? 'bg-blue-500 shadow-md shadow-blue-500/80 animate-pulse'
                  : 'bg-slate-700'
              }`}
              title={shadowClipped ? 'Shadow Clipping Detected (0 Luma)' : 'Shadows Protected'}
            />
            {/* Highlight Clipping Alert (Red dot) */}
            <span
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                highlightClipped
                  ? 'bg-rose-500 shadow-md shadow-rose-500/80 animate-pulse'
                  : 'bg-slate-700'
              }`}
              title={highlightClipped ? 'Highlight Clipping Detected (255 Luma)' : 'Highlights Protected'}
            />
          </div>
        </div>

        {/* Channel Switcher */}
        <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          {(['rgb', 'luma', 'r', 'g', 'b'] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setActiveChannel(ch)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                activeChannel === ch
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Histogram Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-slate-800">
        <canvas
          ref={histCanvasRef}
          width={280}
          height={90}
          className="w-full h-20 block"
        />
        <div className="absolute bottom-1 inset-x-2 flex justify-between text-[9px] text-slate-500 font-mono pointer-events-none">
          <span>0 (Shadows)</span>
          <span>128 (Mid)</span>
          <span>255 (Highlights)</span>
        </div>
      </div>
    </div>
  );
};
