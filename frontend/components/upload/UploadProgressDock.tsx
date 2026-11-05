'use client';

import React from 'react';
import { 
  Upload, 
  X, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RotateCw, 
  Film, 
  Camera, 
  FileCheck,
  Check,
  HardDrive
} from 'lucide-react';
import { useUpload, UploadQueueItem } from '@/context/UploadContext';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const UploadProgressDock: React.FC = () => {
  const {
    isDockOpen,
    isDockMinimized,
    toggleDockMinimized,
    closeDock,
    queue,
    uploadedCount,
    totalCount,
    overallProgress,
    uploadSpeed,
    estimatedTime,
    uploadedBytes,
    totalBytes,
    isUploading,
    retryFailed,
    resumeFailed,
    cancelUpload,
  } = useUpload();

  if (!isDockOpen || queue.length === 0) return null;

  const failedItems = queue.filter((i) => i.status === 'error');
  const duplicateItems = queue.filter((i) => i.status === 'duplicate');
  const completedItems = queue.filter((i) => i.status === 'completed');
  const allCompleted = uploadedCount === totalCount && totalCount > 0 && !isUploading;

  // Minimized Compact Bar
  if (isDockMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 bg-slate-900/95 hover:bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md transition-all hover:scale-[1.02] cursor-pointer animate-slideUp">
        <div onClick={toggleDockMinimized} className="flex items-center gap-3">
          {isUploading ? (
            <div className="relative flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              <span className="absolute text-[8px] font-bold text-indigo-200">
                {overallProgress}%
              </span>
            </div>
          ) : allCompleted ? (
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Check className="w-3.5 h-3.5" />
            </div>
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-400" />
          )}

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">
                {isUploading
                  ? `Uploading ${uploadedCount}/${totalCount} (${overallProgress}%)`
                  : allCompleted
                  ? duplicateItems.length > 0 && completedItems.length > 0
                    ? `Processed ${totalCount} (${completedItems.length} new, ${duplicateItems.length} in library)`
                    : duplicateItems.length === totalCount
                    ? `All ${totalCount} items already in library`
                    : `Uploaded ${totalCount} items`
                  : `${failedItems.length} failed · Ready to resume`}
              </span>
              {isUploading && uploadSpeed && (
                <span className="text-[10px] text-indigo-300 font-mono bg-indigo-950/70 px-1.5 py-0.5 rounded border border-indigo-700/40">
                  {uploadSpeed}
                </span>
              )}
            </div>
            {isUploading && estimatedTime && (
              <p className="text-[10px] text-slate-400 font-medium">{estimatedTime}</p>
            )}
          </div>
        </div>

        {failedItems.length > 0 && !isUploading && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              resumeFailed();
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg transition active:scale-95 shadow-sm ml-1"
            title="Resume failed uploads"
          >
            <RotateCw className="w-3 h-3" />
            <span>Resume</span>
          </button>
        )}

        <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
          <button
            onClick={toggleDockMinimized}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            title="Expand detailed queue"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          {!isUploading && (
            <button
              onClick={closeDock}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              title="Close dock"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expanded Detailed Dock
  return (
    <div className="fixed bottom-5 right-5 z-50 w-96 max-w-[calc(100vw-2.5rem)] bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[30rem] animate-slideUp backdrop-blur-md">
      {/* Dock Header */}
      <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {isUploading ? (
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />
          ) : allCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <h3 className="text-xs font-bold leading-tight truncate">
              {isUploading
                ? `Uploading ${uploadedCount} of ${totalCount} items`
                : allCompleted
                ? duplicateItems.length > 0 && completedItems.length > 0
                  ? `All ${totalCount} items processed (${completedItems.length} new, ${duplicateItems.length} in library)`
                  : duplicateItems.length === totalCount
                  ? `All ${totalCount} items already in library`
                  : `All ${totalCount} items uploaded`
                : `${uploadedCount}/${totalCount} completed · ${failedItems.length} failed`}
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)} · {overallProgress}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={toggleDockMinimized}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition"
            title="Minimize dock"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          {!isUploading ? (
            <button
              onClick={closeDock}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={cancelUpload}
              className="px-2 py-0.5 text-[10px] font-semibold bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-700/40 rounded-lg transition"
              title="Cancel ongoing uploads"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar & Real-Time Telemetry */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200/80">
        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              allCompleted
                ? 'bg-emerald-500'
                : failedItems.length > 0 && !isUploading
                ? 'bg-amber-500'
                : 'bg-gradient-to-r from-indigo-500 to-purple-600'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {isUploading && (
          <div className="flex items-center justify-between mt-2 text-[11px] font-semibold text-slate-600">
            <span className="font-mono text-indigo-600">{uploadSpeed}</span>
            <span className="text-slate-400 font-medium">{estimatedTime}</span>
          </div>
        )}

        {/* Resumption Action Bar for Failed Items */}
        {failedItems.length > 0 && !isUploading && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/80">
            <span className="text-[11px] font-bold text-red-600">
              {failedItems.length} {failedItems.length === 1 ? 'file' : 'files'} failed
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={resumeFailed}
                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl shadow-sm transition active:scale-95"
                title="Resume only failed items"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Resume {failedItems.length} Failed</span>
              </button>
              <button
                onClick={retryFailed}
                className="text-[10px] text-slate-500 hover:text-slate-800 underline transition"
                title="Open failed files in staging modal"
              >
                Inspect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Per-File Queue */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-60">
        {queue.map((item) => (
          <div key={item.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Type Icon */}
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                {item.category === 'video' ? (
                  <Film className="w-3.5 h-3.5 text-purple-600" />
                ) : item.category === 'raw' ? (
                  <Camera className="w-3.5 h-3.5 text-rose-600" />
                ) : (
                  <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
                )}
              </div>

              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate text-[11px]" title={item.name}>
                  {item.name}
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {formatBytes(item.size)}
                </p>
              </div>
            </div>

            {/* Status Indicator */}
            <div className="flex-shrink-0">
              {item.status === 'completed' && (
                <div className="flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="hidden sm:inline">Done</span>
                </div>
              )}
              {item.status === 'duplicate' && (
                <div
                  className="flex items-center gap-1 text-indigo-600 font-bold text-[10px]"
                  title="Already in library · Zero duplicate storage used"
                >
                  <FileCheck className="w-4 h-4 text-indigo-500" />
                  <span className="hidden sm:inline">In Library</span>
                </div>
              )}
              {item.status === 'uploading' && (
                <div className="flex items-center gap-1.5 text-indigo-600 font-bold text-[10px]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{item.progress}%</span>
                </div>
              )}
              {item.status === 'queued' && (
                <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  Queued
                </span>
              )}
              {item.status === 'error' && (
                <div className="relative group flex items-center">
                  <span className="flex items-center gap-1 text-red-600 text-[10px] font-bold cursor-help">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    <span>Failed</span>
                  </span>
                  {item.error && (
                    <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block z-50 bg-slate-900 text-white text-[11px] rounded-xl px-3 py-1.5 shadow-2xl max-w-xs whitespace-normal pointer-events-none border border-slate-700 leading-snug">
                      {item.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* User Protection Guarantee Footer */}
      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <span>Bit-for-bit lossless masters</span>
        <span>EXIF preserved</span>
        <span>Source folder untouched</span>
      </div>
    </div>
  );
};
