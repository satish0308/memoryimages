'use client';

import React from 'react';
import { 
  X, 
  Sparkles, 
  Users, 
  User, 
  Shield, 
  FolderSync, 
  HardDrive, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Play, 
  RotateCw, 
  Trash2,
  Cpu,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useTaskQueue, TaskItem } from '@/context/TaskQueueContext';

const TASK_ICONS: Record<string, React.ReactNode> = {
  clip_index_all: <Sparkles className="w-4 h-4 text-purple-500" />,
  face_detect_all: <User className="w-4 h-4 text-blue-500" />,
  face_cluster_all: <Users className="w-4 h-4 text-indigo-500" />,
  db_backup_create: <Shield className="w-4 h-4 text-emerald-500" />,
  media_scan: <FolderSync className="w-4 h-4 text-amber-500" />,
  s3_sync_library: <HardDrive className="w-4 h-4 text-cyan-500" />,
};

export const TaskQueueDrawer: React.FC = () => {
  const { 
    activeTasks, 
    recentTasks, 
    isWsConnected, 
    redisAvailable, 
    isDrawerOpen, 
    closeDrawer, 
    dispatchTask, 
    cancelTask, 
    clearHistory,
    refreshTasks 
  } = useTaskQueue();

  if (!isDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex justify-end animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={closeDrawer}
      />

      {/* Slide-out Panel */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col z-10">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                Background AI Worker
              </h2>
              <div className="flex items-center gap-2 text-[10px] mt-0.5">
                <span className={`flex items-center gap-1 font-medium ${isWsConnected ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isWsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isWsConnected ? 'WebSocket Live' : 'Polling Fallback'}
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {redisAvailable ? 'Redis Queue Online' : 'Local Queue'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => refreshTasks()}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Refresh queue status"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              onClick={closeDrawer}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Active / Running Tasks Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Active Queue ({activeTasks.length})
              </h3>
              {activeTasks.length > 0 && (
                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 animate-pulse">
                  Worker processing...
                </span>
              )}
            </div>

            {activeTasks.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-center py-6">
                <div className="w-8 h-8 rounded-full bg-slate-200/60 dark:bg-slate-700/60 flex items-center justify-center mx-auto mb-2 text-slate-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">All tasks completed</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Worker queue is idle and waiting for jobs.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900/50 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                          {TASK_ICONS[task.type] || <Sparkles className="w-4 h-4 text-indigo-500" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white">
                            {task.name}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                            <span>ID: {task.id}</span>
                            <span>•</span>
                            <span className="capitalize font-semibold text-indigo-600 dark:text-indigo-400">
                              {task.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => cancelTask(task.id)}
                        className="px-2 py-1 text-[10px] font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition"
                        title="Cancel this task"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[240px]">
                          {task.message}
                        </span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          {task.progress}%
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-300 relative overflow-hidden"
                          style={{ width: `${Math.max(4, task.progress)}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-[shimmer_1.5s_infinite] bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem]" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Launchers Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Quick Dispatch AI Jobs
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => dispatchTask('clip_index_all')}
                className="p-3 bg-purple-50/60 dark:bg-purple-950/20 hover:bg-purple-100/60 dark:hover:bg-purple-900/40 border border-purple-200/80 dark:border-purple-900/40 rounded-xl text-left transition flex flex-col justify-between space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <Play className="w-3 h-3 text-purple-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Index CLIP</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Semantic search vectors</div>
                </div>
              </button>

              <button
                onClick={() => dispatchTask('face_detect_all')}
                className="p-3 bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-100/60 dark:hover:bg-blue-900/40 border border-blue-200/80 dark:border-blue-900/40 rounded-xl text-left transition flex flex-col justify-between space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <Play className="w-3 h-3 text-blue-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Detect Faces</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">UltraFace ONNX scanner</div>
                </div>
              </button>

              <button
                onClick={() => dispatchTask('face_cluster_all')}
                className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 border border-indigo-200/80 dark:border-indigo-900/40 rounded-xl text-left transition flex flex-col justify-between space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <Play className="w-3 h-3 text-indigo-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Cluster People</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Vision grouping</div>
                </div>
              </button>

              <button
                onClick={() => dispatchTask('db_backup_create', { export_to_s3: true })}
                className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 border border-emerald-200/80 dark:border-emerald-900/40 rounded-xl text-left transition flex flex-col justify-between space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <Play className="w-3 h-3 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Backup DB</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">WAL + MinIO S3 export</div>
                </div>
              </button>

              <button
                onClick={() => dispatchTask('s3_sync_library')}
                className="p-3 bg-cyan-50/60 dark:bg-cyan-950/20 hover:bg-cyan-100/60 dark:hover:bg-cyan-900/40 border border-cyan-200/80 dark:border-cyan-900/40 rounded-xl text-left transition flex flex-col justify-between space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <HardDrive className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <Play className="w-3 h-3 text-cyan-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">MinIO S3 Sync</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Bucket object sync</div>
                </div>
              </button>

              <button
                onClick={() => dispatchTask('media_scan')}
                className="p-3 bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 border border-amber-200/80 dark:border-amber-900/40 rounded-xl text-left transition flex flex-col justify-between space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <FolderSync className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <Play className="w-3 h-3 text-amber-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Scan Storage</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Local folder scanner</div>
                </div>
              </button>
            </div>
          </div>

          {/* Task History Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Recent Task History ({recentTasks.length})
              </h3>
              {recentTasks.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium transition"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {recentTasks.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No recent tasks logged.</p>
            ) : (
              <div className="space-y-2">
                {recentTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {t.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                      {t.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                      {t.status === 'cancelled' && <AlertCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}

                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate text-[11px]">
                          {t.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {t.message || t.error || 'Finished'}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
                      {t.completed_at ? new Date(t.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
