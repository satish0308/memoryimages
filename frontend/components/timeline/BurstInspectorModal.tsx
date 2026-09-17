'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Award, 
  Sparkles, 
  Trash2, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Zap, 
  Smile, 
  Camera, 
  Maximize2,
  AlertCircle,
  Layers,
  Clock,
  HardDrive
} from 'lucide-react';
import { MediaItem } from './PhotoCard';

export interface BurstClusterItem {
  id: number;
  filename: string;
  file_size: number;
  width: number;
  height: number;
  captured_at: string | null;
  camera_model: string | null;
  perceptual_hash: string | null;
  thumbnail_url: string;
  preview_url: string;
  sharpness_score: number;
  expression_score: number;
  resolution_score: number;
  composite_score: number;
  raw_blurriness: number;
  is_smiling: boolean;
  is_blurry: boolean;
  is_favorite: boolean;
  is_best_shot: boolean;
}

export interface BurstClusterData {
  id: string;
  cluster_type: 'burst' | 'duplicate';
  count: number;
  duration_seconds: number;
  best_shot_id: number;
  captured_at: string | null;
  reclaimable_bytes: number;
  reclaimable_mb: number;
  items: BurstClusterItem[];
}

interface BurstInspectorModalProps {
  leadItem: MediaItem | null;
  apiUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onResolved?: (keptId: number, deletedIds: number[]) => void;
}

export const BurstInspectorModal: React.FC<BurstInspectorModalProps> = ({
  leadItem,
  apiUrl,
  isOpen,
  onClose,
  onResolved,
}) => {
  const [cluster, setCluster] = useState<BurstClusterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedKeepId, setSelectedKeepId] = useState<number | null>(null);
  const [activePreviewId, setActivePreviewId] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');

  const fetchBurstData = useCallback(async () => {
    if (!leadItem) return;
    try {
      setLoading(true);
      const res = await fetch(`${apiUrl}/api/v1/media/${leadItem.id}/burst`);
      if (res.ok) {
        const data: BurstClusterData = await res.json();
        setCluster(data);
        setSelectedKeepId(data.best_shot_id);
        setActivePreviewId(data.best_shot_id);
      } else {
        // Fallback: If not found as cluster, create a single item representation
        setCluster(null);
      }
    } catch (e) {
      console.error('Failed to load burst sequence:', e);
      setCluster(null);
    } finally {
      setLoading(false);
    }
  }, [leadItem, apiUrl]);

  useEffect(() => {
    if (isOpen && leadItem) {
      fetchBurstData();
    } else {
      setCluster(null);
      setSelectedKeepId(null);
      setActivePreviewId(null);
    }
  }, [isOpen, leadItem, fetchBurstData]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || !cluster) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currIdx = cluster.items.findIndex((i) => i.id === activePreviewId);
        const nextIdx = (currIdx + 1) % cluster.items.length;
        setActivePreviewId(cluster.items[nextIdx].id);
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currIdx = cluster.items.findIndex((i) => i.id === activePreviewId);
        const prevIdx = (currIdx - 1 + cluster.items.length) % cluster.items.length;
        setActivePreviewId(cluster.items[prevIdx].id);
      }
      if (e.key === ' ' && activePreviewId) {
        // Spacebar toggles keep
        e.preventDefault();
        setSelectedKeepId(activePreviewId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, cluster, activePreviewId, onClose]);

  if (!isOpen || !leadItem) return null;

  const currentItem = cluster?.items.find((i) => i.id === activePreviewId) || cluster?.items[0];
  const isBest = currentItem?.id === cluster?.best_shot_id;
  const isKeepingCurrent = currentItem?.id === selectedKeepId;

  const handleResolve = async () => {
    if (!cluster || !selectedKeepId) return;

    const deleteIds = cluster.items
      .filter((i) => i.id !== selectedKeepId)
      .map((i) => i.id);

    if (deleteIds.length === 0) {
      onClose();
      return;
    }

    const confirmMsg = `Keep photo #${selectedKeepId} and move the other ${deleteIds.length} redundant shot(s) to trash?\n\n(Adhering strictly to Zero Auto-Deletion: moved to trash safely with user confirmation).`;
    if (!confirm(confirmMsg)) return;

    try {
      setResolving(true);
      const res = await fetch(`${apiUrl}/api/v1/triage/bursts/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keep_media_id: selectedKeepId,
          delete_media_ids: deleteIds,
        }),
      });

      if (res.ok) {
        if (onResolved) onResolved(selectedKeepId, deleteIds);
        onClose();
      }
    } catch (e) {
      console.error('Failed to resolve burst:', e);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
      <div className="relative w-full max-w-5xl h-[92vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between text-white flex-shrink-0 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  {cluster?.cluster_type === 'burst' ? 'Burst Sequence Inspector' : 'Duplicate Cluster'}
                </h2>
                {cluster && (
                  <span className="bg-amber-500/20 text-amber-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-500/30">
                    📸 {cluster.count} shots
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {cluster?.cluster_type === 'burst'
                  ? `Captured in ${cluster.duration_seconds}s. AI automatically evaluated sharpness, focus, and smiles.`
                  : 'Near-identical shots grouped by perceptual similarity.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
              <button
                onClick={() => setViewMode('single')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  viewMode === 'single' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Inspect
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Grid
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full transition"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Sparkles className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-xs">Analyzing burst sequence focus, sharpness, and expressions...</p>
          </div>
        )}

        {/* Content Body */}
        {!loading && cluster && viewMode === 'single' && currentItem && (
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* Left/Center: Large Photo Viewport */}
            <div className="flex-1 relative bg-black/60 flex items-center justify-center overflow-hidden group">
              <img
                src={`${apiUrl}${currentItem.preview_url}`}
                alt={currentItem.filename}
                className="max-h-full max-w-full object-contain transition-all"
              />

              {/* Prev / Next Chevrons */}
              <button
                onClick={() => {
                  const currIdx = cluster.items.findIndex((i) => i.id === activePreviewId);
                  const prevIdx = (currIdx - 1 + cluster.items.length) % cluster.items.length;
                  setActivePreviewId(cluster.items[prevIdx].id);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/50 hover:bg-black/80 text-white rounded-full transition opacity-0 group-hover:opacity-100"
                title="Previous shot (Left arrow)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                onClick={() => {
                  const currIdx = cluster.items.findIndex((i) => i.id === activePreviewId);
                  const nextIdx = (currIdx + 1) % cluster.items.length;
                  setActivePreviewId(cluster.items[nextIdx].id);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/50 hover:bg-black/80 text-white rounded-full transition opacity-0 group-hover:opacity-100"
                title="Next shot (Right arrow)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Status Badges on Viewport */}
              <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
                {isBest && (
                  <div className="bg-amber-500 text-slate-950 text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 border border-amber-300 animate-pulse">
                    <Award className="w-3.5 h-3.5" />
                    <span>AI Best Shot Picked</span>
                  </div>
                )}
                {isKeepingCurrent && (
                  <div className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-md flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Will Keep This Shot</span>
                  </div>
                )}
              </div>

              {/* Shot Index counter */}
              <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md text-white text-[11px] px-2.5 py-1 rounded-lg">
                Shot {cluster.items.findIndex((i) => i.id === activePreviewId) + 1} of {cluster.items.length}
              </div>
            </div>

            {/* Right Panel: Technical AI Quality Scorecard */}
            <div className="w-full md:w-80 bg-slate-950 border-t md:border-t-0 md:border-l border-slate-800 p-5 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    AI Quality Breakdown
                  </h3>
                  <p className="text-sm font-bold text-white mt-1 truncate" title={currentItem.filename}>
                    {currentItem.filename}
                  </p>
                </div>

                {/* Overall Composite Score Meter */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-medium">Overall AI Score</span>
                    <span className={`text-sm font-bold font-mono ${isBest ? 'text-amber-400' : 'text-slate-200'}`}>
                      {currentItem.composite_score.toFixed(1)} / 100
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isBest
                          ? 'bg-gradient-to-r from-amber-500 to-amber-300'
                          : 'bg-indigo-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(5, currentItem.composite_score))}%` }}
                    />
                  </div>
                  {isBest && (
                    <p className="text-[11px] text-amber-300/90 flex items-center gap-1 pt-1">
                      <Sparkles className="w-3 h-3" />
                      Highest overall score in burst
                    </p>
                  )}
                </div>

                {/* Technical Metrics List */}
                <div className="space-y-2 text-xs">
                  {/* Focus & Sharpness */}
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block font-medium">Focus / Sharpness</span>
                      <span className="text-[11px] text-slate-500">
                        Laplacian raw: {currentItem.raw_blurriness}
                      </span>
                    </div>
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded ${
                        currentItem.sharpness_score >= 70
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : currentItem.sharpness_score >= 40
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {currentItem.sharpness_score.toFixed(0)}/100
                    </span>
                  </div>

                  {/* Facial Expression & Smile */}
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block font-medium">Expression & Smile</span>
                      <span className="text-[11px] text-slate-500">
                        {currentItem.is_smiling ? 'Bright smile detected' : 'Neutral expression'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 font-semibold">
                      {currentItem.is_smiling ? (
                        <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                          <Smile className="w-3 h-3" />
                          <span>Smiling</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Neutral</span>
                      )}
                    </div>
                  </div>

                  {/* Resolution & MP */}
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block font-medium">Resolution</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {currentItem.width} × {currentItem.height}
                      </span>
                    </div>
                    <span className="text-slate-300 font-mono text-[11px]">
                      {((currentItem.width * currentItem.height) / 1_000_000).toFixed(1)} MP
                    </span>
                  </div>

                  {/* File Size */}
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">File Size</span>
                    <span className="text-slate-300 font-mono text-[11px]">
                      {(currentItem.file_size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>

                {/* Keep Shot Toggle Button */}
                <button
                  type="button"
                  onClick={() => setSelectedKeepId(currentItem.id)}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    isKeepingCurrent
                      ? 'bg-indigo-600 text-white shadow-lg'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  <Check className={`w-4 h-4 ${isKeepingCurrent ? 'stroke-[3]' : ''}`} />
                  <span>{isKeepingCurrent ? 'Selected to Keep' : 'Select This Shot to Keep'}</span>
                </button>
              </div>

              {/* Tips */}
              <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-900 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                <span>
                  Tip: Use Left/Right arrow keys or click the filmstrip below to quickly scrub through the shots.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Grid View Mode */}
        {!loading && cluster && viewMode === 'grid' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {cluster.items.map((item, idx) => {
                const isItemBest = item.id === cluster.best_shot_id;
                const isSelectedToKeep = item.id === selectedKeepId;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setActivePreviewId(item.id);
                      setViewMode('single');
                    }}
                    className={`group relative rounded-2xl overflow-hidden cursor-pointer border-2 transition-all flex flex-col bg-slate-800/40 hover:scale-[1.01] ${
                      isSelectedToKeep
                        ? 'border-indigo-500 ring-2 ring-indigo-500/50 shadow-xl'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="relative aspect-square bg-black overflow-hidden">
                      <img
                        src={`${apiUrl}${item.preview_url}`}
                        alt={item.filename}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />

                      {/* Best Badge */}
                      {isItemBest && (
                        <div className="absolute top-2 left-2 bg-amber-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          <span>AI Best</span>
                        </div>
                      )}

                      {/* Select Keep Checkbox */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedKeepId(item.id);
                        }}
                        className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition ${
                          isSelectedToKeep
                            ? 'bg-indigo-600 text-white ring-2 ring-white'
                            : 'bg-black/50 text-transparent border border-white/60 hover:bg-black/70'
                        }`}
                        title="Select to keep"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                    </div>

                    <div className="p-3 space-y-1 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-white truncate">#{idx + 1}</span>
                        <span className="font-mono text-amber-400 font-bold text-[11px]">
                          Score: {item.composite_score.toFixed(0)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Sharp: {item.sharpness_score.toFixed(0)}</span>
                        <span>{item.is_smiling ? '😊 Smile' : 'Neutral'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filmstrip Scrubber (visible in single view) */}
        {!loading && cluster && viewMode === 'single' && (
          <div className="h-24 bg-slate-950 border-t border-slate-800 px-6 flex items-center gap-3 overflow-x-auto flex-shrink-0">
            {cluster.items.map((item, idx) => {
              const isItemActive = item.id === activePreviewId;
              const isItemBest = item.id === cluster.best_shot_id;
              const isItemKept = item.id === selectedKeepId;

              return (
                <button
                  key={item.id}
                  onClick={() => setActivePreviewId(item.id)}
                  className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden transition-all border-2 ${
                    isItemActive
                      ? 'border-indigo-500 scale-105 shadow-md ring-2 ring-indigo-500/50'
                      : 'border-slate-800 opacity-70 hover:opacity-100 hover:border-slate-600'
                  }`}
                >
                  <img
                    src={`${apiUrl}${item.thumbnail_url}`}
                    alt={item.filename}
                    className="w-full h-full object-cover"
                  />
                  {isItemBest && (
                    <div className="absolute top-1 left-1 bg-amber-500 text-slate-950 text-[8px] font-bold px-1 rounded shadow-sm">
                      ★
                    </div>
                  )}
                  {isItemKept && (
                    <div className="absolute bottom-1 right-1 w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Modal Footer & 1-Click Action Bar */}
        <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              Keeping 1 shot, soft-deleting{' '}
              <strong className="text-white">{(cluster?.count || 1) - 1}</strong> redundant shots will free{' '}
              <strong className="text-emerald-400 font-mono">
                {cluster?.reclaimable_mb.toFixed(2)} MB
              </strong>
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
              disabled={resolving || !cluster || cluster.items.length <= 1}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg transition disabled:opacity-50 hover:scale-[1.02]"
            >
              <Trash2 className="w-4 h-4" />
              <span>
                {resolving
                  ? 'Cleaning...'
                  : `Keep Shot #${selectedKeepId} & Trash Remaining ${(cluster?.count || 1) - 1} Shots`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
