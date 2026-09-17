'use client';

import React, { useState } from 'react';
import { X, CheckCircle, Trash2, Award, Sparkles, AlertCircle, Eye, Smile } from 'lucide-react';

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
        <div className="p-6 border-b border-slate-800 flex items-center justify-between text-white flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Duplicate Resolver & Best-Shot Picker</span>
            </div>
            <h2 className="text-lg font-bold mt-1">
              Compare {cluster.items.length} Similar / Duplicate Photos
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review technical sharpness, resolution, and details to keep the finest shot.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Side-by-Side Comparison Grid */}
        <div className="flex-1 overflow-y-auto p-6">
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
