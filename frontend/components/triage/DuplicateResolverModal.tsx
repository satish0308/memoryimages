'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  CheckCircle, 
  Trash2, 
  Award, 
  Sparkles, 
  AlertCircle, 
  Eye, 
  Smile, 
  LayoutGrid, 
  SlidersHorizontal, 
  Zap, 
  ArrowLeftRight, 
  Play, 
  Pause,
  ChevronDown
} from 'lucide-react';

export interface DuplicateItem {
  id: number;
  filename: string;
  file_size: number;
  width?: number;
  height?: number;
  blurriness_score?: number;
  is_blurry?: boolean;
  captured_at: string;
  thumbnail_url: string;
  // Enhanced AI Scoring
  sharpness_score?: number;
  expression_score?: number;
  resolution_score?: number;
  composite_score?: number;
  is_smiling?: boolean;
  is_best_shot?: boolean;
}

export interface DuplicateCluster {
  id?: string;
  hash: string;
  count: number;
  cluster_type?: 'burst' | 'duplicate';
  duration_seconds?: number;
  best_shot_id?: number;
  reclaimable_mb?: number;
  items: DuplicateItem[];
}

interface DuplicateResolverModalProps {
  cluster: DuplicateCluster | null;
  apiUrl: string;
  onClose: () => void;
  onResolved: (keptId: number, deletedIds: number[]) => void;
}

export const DuplicateResolverModal: React.FC<DuplicateResolverModalProps> = ({
  cluster,
  apiUrl,
  onClose,
  onResolved,
}) => {
  if (!cluster || cluster.items.length < 2) return null;

  // Determine the recommended best shot from AI or sharpness fallback
  const bestShotId =
    cluster.best_shot_id ||
    cluster.items.find((i) => i.is_best_shot)?.id ||
    [...cluster.items].sort((a, b) => {
      const scoreA = (a.composite_score || a.blurriness_score || 0);
      const scoreB = (b.composite_score || b.blurriness_score || 0);
      return scoreB - scoreA;
    })[0]?.id ||
    cluster.items[0].id;

  const [selectedKeepId, setSelectedKeepId] = useState<number>(bestShotId);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'split' | 'flicker'>('cards');

  // Comparison state for Split Slider and Flicker Studio
  const [compareTargetId, setCompareTargetId] = useState<number>(() => {
    const others = cluster.items.filter((i) => i.id !== bestShotId);
    return others.length > 0 ? others[0].id : cluster.items[1].id;
  });
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [flickerIndex, setFlickerIndex] = useState<number>(0);
  const [isAutoFlickering, setIsAutoFlickering] = useState<boolean>(false);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  const itemA = cluster.items.find((i) => i.id === selectedKeepId) || cluster.items[0];
  const itemB = cluster.items.find((i) => i.id === compareTargetId) || cluster.items[1] || cluster.items[0];

  // Auto-flicker interval loop
  useEffect(() => {
    if (!isAutoFlickering || viewMode !== 'flicker') return;
    const interval = setInterval(() => {
      setFlickerIndex((prev) => (prev === 0 ? 1 : 0));
    }, 450);
    return () => clearInterval(interval);
  }, [isAutoFlickering, viewMode]);

  // Spacebar hotkey to toggle flicker in flicker mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode === 'flicker' && e.code === 'Space') {
        e.preventDefault();
        setFlickerIndex((prev) => (prev === 0 ? 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  // Drag interaction for Split Slider
  const handleSliderMouseMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!sliderContainerRef.current) return;
    const rect = sliderContainerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pos = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pos);
  };

  const handleResolve = async () => {
    const deleteIds = cluster.items.filter((i) => i.id !== selectedKeepId).map((i) => i.id);
    if (
      !confirm(
        `Keep photo #${selectedKeepId} and move ${deleteIds.length} redundant duplicate(s) to trash?\n(Strictly adhering to Zero Auto-Deletion: moved to trash only upon your confirmation).`
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${apiUrl}/api/v1/triage/resolve-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keep_media_id: selectedKeepId,
          delete_media_ids: deleteIds,
        }),
      });
      if (res.ok) {
        onResolved(selectedKeepId, deleteIds);
        onClose();
      }
    } catch (e) {
      console.error('Resolve duplicates error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 text-white flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Duplicate Resolver & Best-Shot Studio</span>
            </div>
            <h2 className="text-lg font-bold mt-0.5">
              Compare {cluster.items.length} Similar / Duplicate Photos
            </h2>
            <p className="text-xs text-slate-400">
              Inspect pixel sharpness, open eyes, and subtle differences to keep the finest shot.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Switcher */}
            <div className="flex items-center p-1 bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                  viewMode === 'cards'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Grid Card Comparison"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                  viewMode === 'split'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Split Curtain Slider"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Split Slider</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('flicker')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                  viewMode === 'flicker'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Flicker Studio: Rapid Alternation"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Flicker</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full transition"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* MODE 1: Standard Cards Grid */}
          {viewMode === 'cards' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {cluster.items.map((item) => {
                const isRecommended = item.id === bestShotId;
                const isSelected = item.id === selectedKeepId;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedKeepId(item.id)}
                    className={`relative rounded-2xl overflow-hidden cursor-pointer transition border-2 flex flex-col ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/20 shadow-xl ring-2 ring-indigo-500/50'
                        : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                    }`}
                  >
                    {/* Image Viewport */}
                    <div className="relative aspect-square bg-black overflow-hidden group">
                      <img
                        src={`${apiUrl}/api/v1/media/${item.id}/thumbnail?size=1080`}
                        alt={item.filename}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />

                      {/* Best Shot Badge */}
                      {isRecommended && (
                        <div className="absolute top-3 left-3 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          <span>Recommended Best Shot</span>
                        </div>
                      )}

                      {/* Radio Select Checkmark */}
                      <div className="absolute top-3 right-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center transition ${
                            isSelected
                              ? 'bg-indigo-600 text-white ring-2 ring-white'
                              : 'bg-black/50 text-transparent border border-white/50'
                          }`}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    {/* Technical Metrics Card */}
                    <div className="p-4 space-y-2 text-xs flex-1 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <p className="font-semibold text-white truncate" title={item.filename}>
                          {item.filename}
                        </p>

                        <div className="grid grid-cols-2 gap-2 text-slate-300 text-[11px] pt-1">
                          <div>
                            <span className="text-slate-500 block">AI Quality Score</span>
                            <span className="font-mono font-bold text-amber-400">
                              {item.composite_score ? `${item.composite_score.toFixed(1)}/100` : 'Standard'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Sharpness</span>
                            <span
                              className={`font-mono font-semibold ${
                                (item.sharpness_score || item.blurriness_score || 0) > 70
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              {item.sharpness_score
                                ? `${item.sharpness_score.toFixed(0)}/100`
                                : item.blurriness_score
                                ? item.blurriness_score.toFixed(1)
                                : 'Normal'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Expression</span>
                            <span className="flex items-center gap-1">
                              {item.is_smiling ? (
                                <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                                  <Smile className="w-3 h-3" />
                                  <span>Smiling</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">Neutral</span>
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Resolution</span>
                            <span className="font-mono">
                              {item.width && item.height ? `${item.width}×${item.height}` : 'Standard'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedKeepId(item.id);
                        }}
                        className={`w-full py-2 rounded-xl text-xs font-semibold transition mt-2 ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {isSelected ? '✓ Keeping This Shot' : 'Select to Keep'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* MODE 2: Split Curtain Comparison Slider */}
          {viewMode === 'split' && (
            <div className="flex flex-col items-center space-y-4">
              {/* Secondary Photo Picker (if cluster has >2 items) */}
              {cluster.items.length > 2 && (
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/50">
                  <span>Compare Photo A with:</span>
                  <select
                    value={compareTargetId}
                    onChange={(e) => setCompareTargetId(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs"
                  >
                    {cluster.items
                      .filter((i) => i.id !== selectedKeepId)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.filename} (Score: {i.composite_score?.toFixed(0) || i.sharpness_score?.toFixed(0) || 'Standard'})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Slider Viewport Container */}
              <div
                ref={sliderContainerRef}
                onMouseMove={(e) => e.buttons === 1 && handleSliderMouseMove(e)}
                onTouchMove={handleSliderMouseMove}
                onClick={handleSliderMouseMove}
                className="relative w-full h-[52vh] max-h-[520px] bg-black rounded-2xl overflow-hidden cursor-ew-resize select-none border border-slate-800 shadow-2xl"
              >
                {/* Photo B (Right / Underneath) */}
                <img
                  src={`${apiUrl}/api/v1/media/${itemB.id}/thumbnail?size=1080`}
                  alt={itemB.filename}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />

                {/* Photo A (Left / Clipped Overlay) */}
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
                >
                  <img
                    src={`${apiUrl}/api/v1/media/${itemA.id}/thumbnail?size=1080`}
                    alt={itemA.filename}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>

                {/* Vertical Divider Line & Floating Drag Handle */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] pointer-events-none"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-slate-900 shadow-xl flex items-center justify-center border-2 border-indigo-600">
                    <ArrowLeftRight className="w-4 h-4" />
                  </div>
                </div>

                {/* Corner Labels */}
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-semibold text-white border border-white/20 flex items-center gap-1.5 pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>Left: Photo #{itemA.id} (Keeping)</span>
                </div>

                <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-semibold text-white border border-white/20 flex items-center gap-1.5 pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Right: Photo #{itemB.id}</span>
                </div>
              </div>

              {/* Slider Scrub Bar & Quick Choose Actions */}
              <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/40 p-3 rounded-2xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedKeepId(itemA.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                    selectedKeepId === itemA.id
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Keep Left (#{itemA.id})</span>
                </button>

                <div className="flex-1 max-w-xs flex items-center gap-2 w-full px-2">
                  <span className="text-[10px] text-slate-500">A</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderPos}
                    onChange={(e) => setSliderPos(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-ew-resize"
                  />
                  <span className="text-[10px] text-slate-500">B</span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedKeepId(itemB.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                    selectedKeepId === itemB.id
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Keep Right (#{itemB.id})</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE 3: Flicker Comparison Studio */}
          {viewMode === 'flicker' && (
            <div className="flex flex-col items-center space-y-4">
              {/* Secondary Photo Picker (if > 2 items) */}
              {cluster.items.length > 2 && (
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/50">
                  <span>Alternate against:</span>
                  <select
                    value={compareTargetId}
                    onChange={(e) => setCompareTargetId(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs"
                  >
                    {cluster.items
                      .filter((i) => i.id !== selectedKeepId)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.filename} (Score: {i.composite_score?.toFixed(0) || i.sharpness_score?.toFixed(0) || 'Standard'})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Rapid Flicker Viewport */}
              <div 
                onClick={() => setFlickerIndex((prev) => (prev === 0 ? 1 : 0))}
                className="relative w-full h-[52vh] max-h-[520px] bg-black rounded-2xl overflow-hidden cursor-pointer select-none border border-slate-800 shadow-2xl flex items-center justify-center group"
                title="Click or press Spacebar to flicker between photos"
              >
                <img
                  src={`${apiUrl}/api/v1/media/${flickerIndex === 0 ? itemA.id : itemB.id}/thumbnail?size=1080`}
                  alt={flickerIndex === 0 ? itemA.filename : itemB.filename}
                  className="w-full h-full object-contain"
                />

                {/* State Pill */}
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-xs font-bold text-white shadow-lg pointer-events-none">
                  <span
                    className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                      flickerIndex === 0 ? 'bg-indigo-500' : 'bg-amber-400'
                    }`}
                  />
                  <span>
                    {flickerIndex === 0
                      ? `Photo A: #${itemA.id} (${selectedKeepId === itemA.id ? 'KEEPING' : 'Duplicate'})`
                      : `Photo B: #${itemB.id} (${selectedKeepId === itemB.id ? 'KEEPING' : 'Duplicate'})`}
                  </span>
                </div>

                <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[11px] text-slate-300 border border-white/10 pointer-events-none">
                  Click viewport or press <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white font-mono">Space</kbd> to toggle
                </div>
              </div>

              {/* Flicker Control Bar */}
              <div className="w-full flex flex-wrap items-center justify-between gap-3 bg-slate-800/40 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onMouseDown={() => setFlickerIndex(1)}
                    onMouseUp={() => setFlickerIndex(0)}
                    onTouchStart={() => setFlickerIndex(1)}
                    onTouchEnd={() => setFlickerIndex(0)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition select-none"
                  >
                    Hold to Flicker
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAutoFlickering(!isAutoFlickering)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      isAutoFlickering
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {isAutoFlickering ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isAutoFlickering ? 'Stop Loop' : 'Auto Flicker'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedKeepId(itemA.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      selectedKeepId === itemA.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Keep Photo A (#{itemA.id})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedKeepId(itemB.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      selectedKeepId === itemB.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Keep Photo B (#{itemB.id})
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="p-5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>
              Keeping photo <strong>#{selectedKeepId}</strong> and moving other{' '}
              {cluster.items.length - 1} redundant duplicates to trash.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleResolve}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg transition disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>Keep Best & Trash {cluster.items.length - 1} Duplicates</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
