'use client';

import React, { useState, useEffect } from 'react';
import { 
  Trash2, 
  AlertTriangle, 
  X, 
  ShieldCheck, 
  Flame, 
  CheckCircle2, 
  RotateCcw, 
  CloudOff,
  Loader2
} from 'lucide-react';

export interface BulkDeleteModalProps {
  isOpen: boolean;
  itemCount: number;
  itemType?: string; // e.g. "items", "photos", "memes", "screenshots"
  onClose: () => void;
  onConfirm: (permanent: boolean) => Promise<void> | void;
}

export const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({
  isOpen,
  itemCount,
  itemType = 'items',
  onClose,
  onConfirm,
}) => {
  const [deleteMode, setDeleteMode] = useState<'soft' | 'hard'>('soft');
  const [confirmHardDelete, setConfirmHardDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset state whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setDeleteMode('soft');
      setConfirmHardDelete(false);
      setIsDeleting(false);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  const handleAction = async () => {
    if (deleteMode === 'hard' && !confirmHardDelete) return;
    try {
      setIsDeleting(true);
      await onConfirm(deleteMode === 'hard');
    } finally {
      setIsDeleting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${
              deleteMode === 'hard' 
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400' 
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
            } transition-colors`}>
              {deleteMode === 'hard' ? (
                <Flame className="w-5 h-5 animate-pulse" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Delete {itemCount} {itemType}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose your preferred deletion method
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Option 1: Soft Delete (Move to Trash) */}
          <div
            onClick={() => !isDeleting && setDeleteMode('soft')}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
              deleteMode === 'soft'
                ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === 'soft'}
                  onChange={() => setDeleteMode('soft')}
                  disabled={isDeleting}
                  className="w-4 h-4 text-indigo-600 accent-indigo-600 cursor-pointer"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Move to Trash
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Safely Restorable
                    </span>
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Items are hidden from your gallery and timeline, but kept safe in Trash.
                  If synced from Google Drive, files are moved to Google Drive Trash so you can easily restore them at any time.
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Zero Auto-Deletion Guarantee: 100% restorable</span>
                </div>
              </div>
            </div>
          </div>

          {/* Option 2: Hard Delete (Permanent Purge) */}
          <div
            onClick={() => !isDeleting && setDeleteMode('hard')}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
              deleteMode === 'hard'
                ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === 'hard'}
                  onChange={() => setDeleteMode('hard')}
                  disabled={isDeleting}
                  className="w-4 h-4 text-rose-600 accent-rose-600 cursor-pointer"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Permanent Delete
                    <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Flame className="w-3 h-3" />
                      Irreversible
                    </span>
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Permanently deletes items from MyMemoryPics database <strong className="text-rose-600 dark:text-rose-400">AND permanently deletes them from Google Drive / storage</strong>.
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                  <CloudOff className="w-3.5 h-3.5" />
                  <span>Cloud files removed immediately from Google Drive</span>
                </div>
              </div>
            </div>

            {/* Checkbox confirmation when hard delete is selected */}
            {deleteMode === 'hard' && (
              <div 
                className="mt-3.5 pt-3 border-t border-rose-200 dark:border-rose-900/50 space-y-2 animate-fadeIn"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-100/70 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>
                    This cannot be undone. Files will be purged permanently from both your Google Drive and local storage.
                  </span>
                </div>
                <label className="flex items-center gap-2.5 pt-1 text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmHardDelete}
                    onChange={(e) => setConfirmHardDelete(e.target.checked)}
                    disabled={isDeleting}
                    className="w-4 h-4 text-rose-600 accent-rose-600 rounded cursor-pointer"
                  />
                  <span>
                    I understand and confirm permanent deletion of {itemCount} {itemType}.
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-3 p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleAction}
            disabled={isDeleting || (deleteMode === 'hard' && !confirmHardDelete)}
            className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed ${
              deleteMode === 'hard'
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
            }`}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {deleteMode === 'hard' ? 'Deleting Permanently from Drive...' : 'Moving to Trash...'}
                </span>
              </>
            ) : deleteMode === 'hard' ? (
              <>
                <Flame className="w-3.5 h-3.5" />
                <span>Permanently Delete ({itemCount})</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move to Trash ({itemCount})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
