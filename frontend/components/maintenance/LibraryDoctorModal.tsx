'use client';

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  MapPin, 
  Users, 
  Layers, 
  HardDrive, 
  RefreshCw, 
  ArrowRight,
  ShieldCheck,
  Check,
  Clock,
  Loader2
} from 'lucide-react';
import { useTaskQueue } from '@/context/TaskQueueContext';

interface HealthAction {
  action: string;
  title: string;
  description: string;
  impact: string;
  button_label: string;
}

interface HealthMetrics {
  missing_clip: number;
  indexed_clip: number;
  missing_gps: number;
  geotagged: number;
  missing_1080p: number;
  ready_1080p: number;
  passerby_face_clusters: number;
}

interface HealthData {
  health_score: number;
  grade: string;
  total_media: number;
  total_storage: string;
  total_bytes: number;
  metrics: HealthMetrics;
  recommended_actions: HealthAction[];
}

interface LibraryDoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
}

export const LibraryDoctorModal: React.FC<LibraryDoctorModalProps> = ({
  isOpen,
  onClose,
  apiUrl,
}) => {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixingAction, setFixingAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { activeTasks = [], refreshTasks } = useTaskQueue() || {};

  const activeClipTask = activeTasks.find(
    (t) => t.type === 'clip_index_all' && (t.status === 'running' || t.status === 'pending')
  );
  const activeRendTask = activeTasks.find(
    (t) => t.type === 'pregenerate_1080p_renditions' && (t.status === 'running' || t.status === 'pending')
  );

  const fetchHealth = async (showSpinner: boolean = true) => {
    try {
      if (showSpinner) setLoading(true);
      const token = typeof window !== 'undefined' 
        ? (localStorage.getItem('memorypics_token') || localStorage.getItem('token')) 
        : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/v1/maintenance/health-check`, {
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to load library health data:', e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth(true);
      setActionMessage(null);
      if (refreshTasks) refreshTasks();
    }
  }, [isOpen, apiUrl]);

  // Auto-refresh while active tasks are running
  useEffect(() => {
    if (!isOpen) return;
    const hasActive = activeClipTask || activeRendTask;
    if (!hasActive) return;

    const interval = setInterval(() => {
      fetchHealth(false);
      if (refreshTasks) refreshTasks();
    }, 2500);

    return () => clearInterval(interval);
  }, [isOpen, activeClipTask, activeRendTask]);

  const handleExecuteFix = async (action: string) => {
    try {
      setFixingAction(action);
      setActionMessage(null);
      const token = typeof window !== 'undefined' 
        ? (localStorage.getItem('memorypics_token') || localStorage.getItem('token')) 
        : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/v1/maintenance/fix/${action}`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });

      if (res.ok) {
        const result = await res.json();
        setActionMessage(result.message || 'Action executed successfully!');
        // Refresh health data and active task queue
        fetchHealth(false);
        if (refreshTasks) refreshTasks();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed to execute remedy.' }));
        setActionMessage(`Error: ${err.detail || 'Execution failed.'}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e?.message || 'Execution failed.'}`);
    } finally {
      setFixingAction(null);
    }
  };

  if (!isOpen) return null;

  const total = data?.total_media || 1;
  const clipPct = data ? Math.round((data.metrics.indexed_clip / total) * 100) : 0;
  const rendPct = data ? Math.round((data.metrics.ready_1080p / total) * 100) : 0;
  const gpsPct = data ? Math.round((data.metrics.geotagged / total) * 100) : 0;

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40';
    if (score >= 75) return 'text-indigo-500 border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40';
    if (score >= 60) return 'text-amber-500 border-amber-500 bg-amber-50 dark:bg-amber-950/40';
    return 'text-rose-500 border-rose-500 bg-rose-50 dark:bg-rose-950/40';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Library Doctor
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                  v0.5.0 Diagnostics
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AI index integrity, geolocation density & archive optimization
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchHealth(true)}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              title="Re-run diagnostic scan"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !data ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 mx-auto text-emerald-500 animate-spin" />
              <p className="text-xs text-slate-400 font-medium">Running deep diagnostic audit across media...</p>
            </div>
          ) : data ? (
            <>
              {/* Top Score & Storage Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center ${getScoreColor(data.health_score)}`}>
                  <span className="text-4xl font-extrabold tracking-tight">
                    {data.health_score}%
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider mt-1">
                    Health Score
                  </span>
                  <span className="text-[11px] font-medium opacity-80 mt-0.5">
                    {data.grade}
                  </span>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <span>Total Media</span>
                  </div>
                  <div className="mt-2">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {data.total_media.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400">Photos & Videos active</p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                    <HardDrive className="w-4 h-4 text-purple-500" />
                    <span>Library Footprint</span>
                  </div>
                  <div className="mt-2">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {data.total_storage}
                    </p>
                    <p className="text-[11px] text-slate-400">Total disk volume</p>
                  </div>
                </div>
              </div>

              {/* Status Message */}
              {actionMessage && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>{actionMessage}</span>
                </div>
              )}

              {/* Coverage Meters */}
              <div className="space-y-3 bg-slate-50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Archive Intelligence Coverage
                </h3>

                <div className="space-y-3.5">
                  {/* Multimodal CLIP Index */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Natural Language CLIP Semantic Search
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {data.metrics.indexed_clip.toLocaleString()} / {data.total_media.toLocaleString()} ({clipPct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${clipPct}%` }} />
                    </div>
                  </div>

                  {/* 1080p Renditions */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        1080p WebP Instant Pre-Generations
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {data.metrics.ready_1080p.toLocaleString()} / {data.total_media.toLocaleString()} ({rendPct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${rendPct}%` }} />
                    </div>
                  </div>

                  {/* GPS Geotags */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" />
                        World Map Geotag Coverage
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {data.metrics.geotagged.toLocaleString()} / {data.total_media.toLocaleString()} ({gpsPct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-rose-500 h-full rounded-full transition-all duration-500" style={{ width: `${gpsPct}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommended 1-Click Remedies */}
              {data.recommended_actions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Recommended Health Remedies ({data.recommended_actions.length})
                  </h3>

                  <div className="space-y-2.5">
                    {data.recommended_actions.map((act) => {
                      const activeTask = act.action === 'clip' ? activeClipTask : act.action === 'renditions' ? activeRendTask : null;

                      return (
                        <div
                          key={act.action}
                          className="p-4 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:border-emerald-500/50 transition"
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                {act.title}
                              </h4>
                              {activeTask && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  {activeTask.status === 'running' ? 'Active' : 'Queued'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {act.description}
                            </p>
                          </div>

                          {activeTask ? (
                            <div className="flex-shrink-0 flex flex-col items-start sm:items-end gap-1.5 min-w-[200px] p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                              <div className="flex items-center justify-between w-full text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                <span className="flex items-center gap-1.5">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                                  {activeTask.status === 'running' ? `Running (${activeTask.progress}%)` : 'Queued in Worker'}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                  {activeTask.current_step > 0 
                                    ? `${activeTask.current_step.toLocaleString()} / ${(activeTask.total_steps || 0).toLocaleString()}`
                                    : 'In Queue'}
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                                <div 
                                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                                  style={{ width: `${Math.max(4, activeTask.progress)}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                                {activeTask.message || 'Processing in background...'}
                              </p>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleExecuteFix(act.action)}
                              disabled={fixingAction === act.action}
                              className="flex-shrink-0 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm shadow-emerald-600/20"
                            >
                              {fixingAction === act.action ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Fixing...</span>
                                </>
                              ) : (
                                <>
                                  <span>{act.button_label}</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
