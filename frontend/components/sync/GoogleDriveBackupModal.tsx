'use client';

import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  X, 
  Check, 
  AlertCircle, 
  Loader2, 
  FolderPlus, 
  ShieldCheck, 
  ExternalLink,
  Layers,
  ArrowRight,
  Folder,
  RotateCw
} from 'lucide-react';

interface PreCheckItem {
  id: number;
  filename: string;
  folder_name?: string;
  backed_up_at?: string;
}

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaIds: number[];
  defaultFolderName?: string;
  onBackupSuccess?: () => void;
}

export const GoogleDriveBackupModal: React.FC<GoogleDriveBackupModalProps> = ({
  isOpen,
  onClose,
  mediaIds,
  defaultFolderName = 'MyMemoryPics / Backups',
  onBackupSuccess,
}) => {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [folderName, setFolderName] = useState(defaultFolderName);
  const [existingFolders, setExistingFolders] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

  // Pre-check state
  const [isPreChecking, setIsPreChecking] = useState(false);
  const [preCheckData, setPreCheckData] = useState<{
    total_selected: number;
    ready_count: number;
    already_backed_up_count: number;
    ready_items: PreCheckItem[];
    already_backed_up_items: PreCheckItem[];
  } | null>(null);
  const [preCheckError, setPreCheckError] = useState<string | null>(null);

  // Backup Execution state
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [forceRebackup, setForceRebackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState<{
    current: number;
    total: number;
    statusText: string;
  }>({ current: 0, total: 0, statusText: '' });
  const [backupResult, setBackupResult] = useState<{
    backed_up_count: number;
    skipped_count: number;
    failed_count: number;
    folder_name: string;
    folder_id?: string;
    failed?: { id: number; filename: string; error: string }[];
  } | null>(null);

  useEffect(() => {
    if (defaultFolderName) {
      setFolderName(defaultFolderName);
    }
  }, [defaultFolderName]);

  // Load pre-check and suggested folders whenever modal opens
  useEffect(() => {
    if (!isOpen || mediaIds.length === 0) {
      setPreCheckData(null);
      setBackupResult(null);
      setPreCheckError(null);
      setIsBackingUp(false);
      return;
    }

    const token = localStorage.getItem('token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // 1. Fetch Pre-Check Analysis
    setIsPreChecking(true);
    fetch(`${API_URL}/api/v1/sync/google/backup/pre-check`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ media_ids: mediaIds }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Failed to check backup status');
        }
        return res.json();
      })
      .then((data) => {
        setPreCheckData(data);
      })
      .catch((err) => {
        setPreCheckError(err.message);
      })
      .finally(() => {
        setIsPreChecking(false);
      });

    // 2. Fetch User's Existing Google Drive Folders
    setIsLoadingFolders(true);
    fetch(`${API_URL}/api/v1/sync/google/folders`, { headers })
      .then(async (res) => {
        if (res.ok) {
          const folders = await res.json();
          if (Array.isArray(folders)) {
            setExistingFolders(folders.slice(0, 8));
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingFolders(false);
      });
  }, [isOpen, mediaIds, API_URL]);

  if (!isOpen) return null;

  const handleStartBackup = async () => {
    if (!folderName.trim()) return;

    setIsBackingUp(true);
    setBackupResult(null);

    const token = localStorage.getItem('token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const itemsToProcess = preCheckData?.ready_count || mediaIds.length;
    setBackupProgress({
      current: 1,
      total: itemsToProcess,
      statusText: `Connecting to Google Drive and resolving folder "${folderName}"...`,
    });

    try {
      const res = await fetch(`${API_URL}/api/v1/sync/google/backup`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          media_ids: mediaIds,
          folder_name: folderName.trim(),
          force: forceRebackup,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Backup execution failed');
      }

      const result = await res.json();
      setBackupResult(result);

      // Trigger UI update across gallery / albums
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('media-uploaded'));
      }
      if (onBackupSuccess) {
        onBackupSuccess();
      }
    } catch (err: any) {
      setPreCheckError(err.message || 'An error occurred during backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white border border-slate-200/90 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-400/30">
              <Cloud className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">Backup to Google Drive</h2>
              <p className="text-[11px] text-slate-400">
                100% bit-for-bit lossless masters · EXIF intact
              </p>
            </div>
          </div>

          {!isBackingUp && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Error Banner */}
          {preCheckError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Google Drive Connection Required</p>
                <p className="mt-0.5 text-rose-700 leading-relaxed">{preCheckError}</p>
                {preCheckError.includes('/sync') && (
                  <a
                    href="/sync"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-2 font-bold text-rose-900 underline hover:text-rose-950"
                  >
                    <span>Connect Google Account in /sync</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Loading Pre-Check */}
          {isPreChecking && !preCheckError && (
            <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <span>Checking backup status for {mediaIds.length} items...</span>
            </div>
          )}

          {/* Pre-Check & Configuration View */}
          {!isPreChecking && !backupResult && (
            <>
              {/* Target Folder Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Google Drive Destination Folder
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    disabled={isBackingUp}
                    placeholder="e.g. MyMemoryPics / Family Vacations"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                  <Folder className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-400">
                  Folder will be automatically created in your Google Drive if it doesn't exist.
                </p>

                {/* Suggested Existing Folders */}
                {existingFolders.length > 0 && !isBackingUp && (
                  <div className="pt-1">
                    <p className="text-[10px] font-semibold text-slate-500 mb-1.5">
                      Or select an existing folder in your Drive:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {existingFolders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFolderName(f.name)}
                          className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition ${
                            folderName === f.name
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                              : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-600'
                          }`}
                        >
                          📁 {f.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Duplicate Protection & Pre-Check Status Pills */}
              {preCheckData && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">Selected Photos:</span>
                    <span className="font-bold text-slate-900">{preCheckData.total_selected}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                        Ready to Backup
                      </p>
                      <p className="text-base font-extrabold text-emerald-900 mt-0.5">
                        {preCheckData.ready_count}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                        Already Backed Up
                      </p>
                      <p className="text-base font-extrabold text-indigo-900 mt-0.5">
                        {preCheckData.already_backed_up_count}
                      </p>
                    </div>
                  </div>

                  {/* Corner Case Notice: Duplicate Protection */}
                  {preCheckData.already_backed_up_count > 0 && (
                    <div className="text-[11px] text-slate-600 bg-white p-3 rounded-xl border border-slate-200 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                      <div className="leading-snug">
                        <span className="font-bold text-slate-800">Duplicate Protection Active: </span>
                        <span>
                          {preCheckData.already_backed_up_count}{' '}
                          {preCheckData.already_backed_up_count === 1 ? 'photo has' : 'photos have'}{' '}
                          already been backed up. To prevent duplicates in your Drive, they will be{' '}
                          <span className="font-bold text-indigo-700">automatically skipped</span>.
                        </span>
                      </div>
                    </div>
                  )}

                  {preCheckData.already_backed_up_count > 0 && (
                    <label className="flex items-center gap-2 pt-1 text-[11px] text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forceRebackup}
                        onChange={(e) => setForceRebackup(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      <span>Force re-backup already backed up photos anyway</span>
                    </label>
                  )}
                </div>
              )}

              {/* In-Progress Telemetry */}
              {isBackingUp && (
                <div className="space-y-2 py-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5 text-indigo-600">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Backing up to Google Drive...</span>
                    </span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      {backupProgress.current} / {backupProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300"
                      style={{
                        width: `${Math.round(
                          (backupProgress.current / Math.max(1, backupProgress.total)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    {backupProgress.statusText}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Backup Finished Result Summary */}
          {backupResult && (
            <div className="py-4 space-y-4 text-center animate-fadeIn">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <Check className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900">Backup Complete!</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Successfully stored master copies in Google Drive folder:
                  <span className="font-bold text-slate-800 ml-1">"{backupResult.folder_name}"</span>
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Uploaded</p>
                  <p className="text-base font-extrabold text-emerald-600 mt-0.5">
                    {backupResult.backed_up_count}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Skipped</p>
                  <p className="text-base font-extrabold text-indigo-600 mt-0.5">
                    {backupResult.skipped_count}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Failed</p>
                  <p className="text-base font-extrabold text-slate-400 mt-0.5">
                    {backupResult.failed_count}
                  </p>
                </div>
              </div>

              {backupResult.folder_id && (
                <a
                  href={`https://drive.google.com/drive/folders/${backupResult.folder_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
                >
                  <span>Open Folder in Google Drive</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          {!backupResult ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isBackingUp}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleStartBackup}
                disabled={Boolean(
                  isBackingUp ||
                  isPreChecking ||
                  !folderName.trim() ||
                  (preCheckData && preCheckData.ready_count === 0 && !forceRebackup)
                )}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 active:scale-95"
              >
                {isBackingUp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Backing up...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4" />
                    <span>
                      {preCheckData && preCheckData.ready_count === 0 && !forceRebackup
                        ? 'All Backed Up'
                        : `Start Backup (${preCheckData?.ready_count ?? mediaIds.length})`}
                    </span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
