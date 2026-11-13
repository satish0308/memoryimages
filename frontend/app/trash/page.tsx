'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { 
  Trash2, 
  RotateCcw, 
  Search, 
  Download, 
  Copy, 
  Check, 
  AlertTriangle, 
  CheckSquare, 
  Square, 
  RefreshCw, 
  HardDrive, 
  Layers, 
  ExternalLink, 
  ShieldCheck, 
  Filter, 
  SlidersHorizontal,
  ChevronDown,
  Maximize2,
  Calendar,
  Image as ImageIcon,
  ArrowUpDown,
  FolderOpen,
  Info,
  X,
  FileCode,
  Clock
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { getApiUrl } from '@/utils/apiUrl';
import { useDragSelect } from '@/hooks/useDragSelect';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { GooglePhotosExportModal } from '@/components/sync/GooglePhotosExportModal';
import { MediaItem } from '@/components/timeline/PhotoCard';

interface TrashItem {
  id: number;
  filename: string;
  original_path: string;
  host_path: string;
  file_size: number;
  width: number;
  height: number;
  mime_type?: string;
  captured_at: string | null;
  thumbnail_url: string;
  marked_for_deletion_at: string | null;
  pending_disk_deletion: boolean;
  is_deleted: boolean;
  file_exists_in_mount: boolean;
  camera_make?: string | null;
  camera_model?: string | null;
}

interface PurgeResponse {
  total_count: number;
  total_size_bytes: number;
  items: TrashItem[];
  host_prefix: string;
  container_prefix: string;
  purge_script_path: string;
}

type FilterType = 'all' | 'mount_queue' | 'soft_deleted';
type SortField = 'date' | 'size' | 'filename';

export default function TrashGalleryPage() {
  const { token: authContextToken } = useAuth();
  const API_URL = getApiUrl();

  // State
  const [data, setData] = useState<PurgeResponse | null>(null);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  
  // Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [gridDensity, setGridDensity] = useState<'compact' | 'comfortable'>('compact');

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals & Inspection
  const [inspectingPhoto, setInspectingPhoto] = useState<MediaItem | null>(null);
  const [showGooglePhotosModal, setShowGooglePhotosModal] = useState(false);
  const [showConfirmRestoreAll, setShowConfirmRestoreAll] = useState(false);
  const [showConfirmPurgeSelected, setShowConfirmPurgeSelected] = useState(false);
  const [showConfirmPurgeAll, setShowConfirmPurgeAll] = useState(false);
  const [copiedHostScript, setCopiedHostScript] = useState(false);
  const [copiedPaths, setCopiedPaths] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Auth Header Helper
  const getActiveToken = useCallback(() => {
    return authContextToken || (typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null);
  }, [authContextToken]);

  const authHeaders = useCallback((extra: Record<string, string> = {}) => {
    const token = getActiveToken();
    const headers: Record<string, string> = { ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, [getActiveToken]);

  // Fetch Data from Backend
  const fetchTrashItems = useCallback(async (search?: string) => {
    try {
      setLoading(true);
      const queryParam = search !== undefined ? search : searchQuery;
      const url = new URL(`${API_URL}/api/v1/system/purge/pending`);
      url.searchParams.set('limit', '1000');
      if (queryParam.trim()) {
        url.searchParams.set('search', queryParam.trim());
      }

      const res = await fetch(url.toString(), {
        headers: authHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to load trash items (${res.status})`);
      }

      const json: PurgeResponse = await res.json();
      setData(json);
      setItems(json.items || []);
    } catch (err: any) {
      console.error('Error fetching trash queue:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to fetch trash queue' });
    } finally {
      setLoading(false);
    }
  }, [API_URL, authHeaders, searchQuery]);

  useEffect(() => {
    fetchTrashItems();
  }, [fetchTrashItems]);

  // Filtered & Sorted items
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    // Filter type
    if (activeFilter === 'mount_queue') {
      result = result.filter((i) => i.pending_disk_deletion);
    } else if (activeFilter === 'soft_deleted') {
      result = result.filter((i) => i.is_deleted && !i.pending_disk_deletion);
    }

    // Sort
    result.sort((a, b) => {
      if (sortField === 'date') {
        const dateA = a.marked_for_deletion_at || a.captured_at || '';
        const dateB = b.marked_for_deletion_at || b.captured_at || '';
        return sortAsc ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      }
      if (sortField === 'size') {
        return sortAsc ? a.file_size - b.file_size : b.file_size - a.file_size;
      }
      if (sortField === 'filename') {
        return sortAsc ? a.filename.localeCompare(b.filename) : b.filename.localeCompare(a.filename);
      }
      return 0;
    });

    return result;
  }, [items, activeFilter, sortField, sortAsc]);

  const orderedIds = useMemo(() => filteredAndSortedItems.map((i) => i.id), [filteredAndSortedItems]);

  // Selected item objects
  const selectedItems = useMemo(() => {
    const set = new Set(selectedIds);
    return items.filter((i) => set.has(i.id));
  }, [items, selectedIds]);

  const selectedSizeBytes = useMemo(() => {
    return selectedItems.reduce((acc, curr) => acc + (curr.file_size || 0), 0);
  }, [selectedItems]);

  // Drag-and-Select Hook Integration
  const {
    isDragging: isDragSelecting,
    dragMode,
    marqueeBox,
    handlePointerDown,
    handleItemClick,
    handleItemDoubleClick,
  } = useDragSelect({
    selectedIds,
    setSelectedIds,
    orderedIds,
    onOpenLightbox: (id) => {
      const found = items.find((i) => i.id === id);
      if (found) {
        setInspectingPhoto({
          id: found.id,
          filename: found.filename,
          category: 'deleted',
          width: found.width || 1920,
          height: found.height || 1080,
          captured_at: found.captured_at || found.marked_for_deletion_at || new Date().toISOString(),
          is_favorite: false,
          is_blurry: false,
          file_size: found.file_size,
          camera_make: found.camera_make,
          camera_model: found.camera_model,
          thumbnail_url: found.thumbnail_url,
        });
      }
    },
  });

  // Selection actions
  const handleSelectAll = () => {
    setSelectedIds(orderedIds);
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleInvertSelection = () => {
    const currentSet = new Set(selectedIds);
    const inverted = orderedIds.filter((id) => !currentSet.has(id));
    setSelectedIds(inverted);
  };

  const handleSelectNextN = (count: number = 50) => {
    const currentSet = new Set(selectedIds);
    const unselected = orderedIds.filter((id) => !currentSet.has(id));
    const toAdd = unselected.slice(0, count);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...toAdd])));
  };

  // Restore Action
  const handleRestore = async (mediaIds: number[] | 'all') => {
    try {
      setIsProcessingAction(true);
      const isAll = mediaIds === 'all';
      const body = isAll ? { cancel_all: true } : { media_ids: mediaIds };

      const res = await fetch(`${API_URL}/api/v1/system/purge/cancel`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('Failed to restore files');
      }

      const resJson = await res.json();
      const count = resJson.restored_count || (isAll ? data?.total_count : mediaIds.length);
      setStatusMessage({
        type: 'success',
        text: `Successfully restored ${count} photo${count === 1 ? '' : 's'} back to your active library!`,
      });

      if (isAll) {
        setSelectedIds([]);
        setShowConfirmRestoreAll(false);
      } else {
        setSelectedIds((prev) => prev.filter((id) => !(mediaIds as number[]).includes(id)));
      }

      await fetchTrashItems();
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Error restoring items:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Restore failed' });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Force Purge Action (permanent removal from DB & thumbnails)
  const handlePurgePermanent = async (confirmAll: boolean) => {
    try {
      setIsProcessingAction(true);
      const body = confirmAll
        ? { confirm_all: true, force: true }
        : { media_ids: selectedIds, force: true };

      const res = await fetch(`${API_URL}/api/v1/system/purge/confirm`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('Failed to purge records');
      }

      const resJson = await res.json();
      setStatusMessage({
        type: 'success',
        text: `Permanently purged ${resJson.purged_count} record(s) and AI index caches from database!`,
      });

      setSelectedIds([]);
      setShowConfirmPurgeSelected(false);
      setShowConfirmPurgeAll(false);
      await fetchTrashItems();
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Error purging items:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Permanent purge failed' });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Copy Host Paths
  const handleCopyHostPaths = () => {
    const targetItems = selectedItems.length > 0 ? selectedItems : filteredAndSortedItems;
    const paths = targetItems.map((i) => i.host_path).join('\n');
    navigator.clipboard.writeText(paths);
    setCopiedPaths(true);
    setStatusMessage({
      type: 'info',
      text: `Copied ${targetItems.length} host file path(s) to clipboard!`,
    });
    setTimeout(() => {
      setCopiedPaths(false);
      setStatusMessage(null);
    }, 3000);
  };

  // Download Shell Script
  const handleDownloadPurgeScript = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/system/purge/script`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to generate script');
      const text = await res.text();
      const blob = new Blob([text], { type: 'application/x-sh' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'delete_files_marked_as_deleted.sh';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage({ type: 'success', text: 'Downloaded host deletion shell script!' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Failed to download script' });
    }
  };

  // Format Bytes helper
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const totalCount = data?.total_count || 0;
  const totalSizeBytes = data?.total_size_bytes || 0;

  return (
    <div className="max-w-[1700px] mx-auto p-4 sm:p-6 space-y-6 pb-24" onPointerDown={(e) => handlePointerDown(e)}>
      {/* 2D Marquee Drag-to-Select Box */}
      {isDragSelecting && marqueeBox && marqueeBox.width > 2 && marqueeBox.height > 2 && (
        <div
          style={{
            position: 'fixed',
            left: marqueeBox.left,
            top: marqueeBox.top,
            width: marqueeBox.width,
            height: marqueeBox.height,
          }}
          className={`border-2 rounded-lg pointer-events-none z-50 shadow-xl ${
            dragMode === 'select'
              ? 'border-indigo-500 bg-indigo-500/20'
              : 'border-rose-500 bg-rose-500/20'
          }`}
        />
      )}

      {/* Active Line-Drag Selection Floating Pill */}
      {isDragSelecting && (
        <div className="fixed bottom-20 left-0 right-0 md:left-64 md:right-0 mx-auto w-max z-50 bg-slate-900/95 text-white backdrop-blur-md px-5 py-2.5 rounded-full shadow-2xl border border-indigo-500/50 flex items-center gap-3 animate-pulse pointer-events-none">
          <div className={`w-2.5 h-2.5 rounded-full ${dragMode === 'select' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-bold tracking-wide">
            {dragMode === 'select' ? '✨ Dragging across photos to SELECT' : '🧹 Dragging across photos to DESELECT'}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {selectedIds.length} selected
          </span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-indigo-500/10 border border-rose-200/70 dark:border-rose-900/50 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-inner">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Trash & Purge Queue
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                    Full Gallery View
                  </span>
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Review, restore, or export files marked for deletion. Double-click any photo for full inspection.
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs">
                <HardDrive className="w-3.5 h-3.5 text-rose-500" />
                <span>{totalCount.toLocaleString()} queued items</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>{formatBytes(totalSizeBytes)} reclaimable</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-medium text-emerald-700 dark:text-emerald-300 shadow-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Protected Read-Only Mount (:ro)</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 rounded-xl text-xs font-semibold text-indigo-700 dark:text-indigo-300 shadow-xs">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>30-Day Retention Policy</span>
              </span>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowGooglePhotosModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-semibold shadow-xs transition"
              title="Generate batch search queries for Google Photos trash"
            >
              <Search className="w-3.5 h-3.5 text-indigo-500" />
              <span>Google Photos Query</span>
            </button>

            <button
              type="button"
              onClick={handleCopyHostPaths}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold shadow-xs transition"
              title="Copy host file paths to clipboard"
            >
              {copiedPaths ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copiedPaths ? 'Copied Paths!' : 'Copy File Paths'}</span>
            </button>

            {totalCount > 0 && (
              <button
                type="button"
                onClick={() => setShowConfirmRestoreAll(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore All</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchTrashItems()}
              className="p-2 hover:bg-white/80 dark:hover:bg-slate-800 rounded-xl text-slate-500 border border-slate-200 dark:border-slate-700 transition"
              title="Refresh queue"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Host Terminal Purge Instructions Banner */}
      <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>Host Drive Deletion Command (Manual Execution Required)</span>
          </div>
          <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
            Because host directories are mounted read-only, physical files cannot be erased by the web UI directly. Run this command in your host terminal to safely delete queued files from disk:
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-black/60 border border-slate-700 rounded-xl px-3 py-1.5 font-mono text-xs text-emerald-400 select-all">
            <span>./scripts/delete_files_marked_as_deleted.sh</span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText('./scripts/delete_files_marked_as_deleted.sh');
              setCopiedHostScript(true);
              setTimeout(() => setCopiedHostScript(false), 2500);
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm transition"
            title="Copy command to clipboard"
          >
            {copiedHostScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedHostScript ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPurgeScript}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-medium transition"
            title="Download deletion shell script"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.sh</span>
          </button>
        </div>
      </div>

      {/* Status Feedback Toast */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between border shadow-sm animate-fadeIn ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200'
              : 'bg-blue-50 text-blue-900 border-blue-200'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 hover:bg-black/5 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Control Bar: Filters, Search, Density, Batch Selection */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              All Deleted ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('mount_queue')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeFilter === 'mount_queue'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Read-Only Mount Queue ({items.filter((i) => i.pending_disk_deletion).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('soft_deleted')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeFilter === 'soft_deleted'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Soft Trash ({items.filter((i) => i.is_deleted && !i.pending_disk_deletion).length})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px] max-w-sm w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by filename or path..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  fetchTrashItems(searchQuery);
                }
              }}
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  fetchTrashItems('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Secondary controls: Selection actions & Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Selection helpers */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 mr-1">Select:</span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium transition"
            >
              All ({orderedIds.length})
            </button>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium transition"
              >
                None
              </button>
            )}
            <button
              type="button"
              onClick={handleInvertSelection}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium transition"
            >
              Invert
            </button>
            <button
              type="button"
              onClick={() => handleSelectNextN(50)}
              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-lg font-medium transition"
            >
              + Next 50
            </button>
            <span className="text-[11px] text-slate-400 ml-2 hidden sm:inline">
              (Tip: Click & drag mouse across photos to multi-select)
            </span>
          </div>

          {/* Sort & Grid Density */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="bg-transparent text-xs text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="date">Deletion Date</option>
                <option value="size">File Size</option>
                <option value="filename">Filename</option>
              </select>
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 text-[10px] font-bold"
                title={sortAsc ? 'Ascending' : 'Descending'}
              >
                {sortAsc ? '▲ ASC' : '▼ DESC'}
              </button>
            </div>

            {/* Density toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setGridDensity('compact')}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                  gridDensity === 'compact'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title="6-8 columns grid"
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => setGridDensity('comfortable')}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                  gridDensity === 'comfortable'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title="3-4 columns grid"
              >
                Large
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {!loading && filteredAndSortedItems.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-16 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center shadow-inner">
            <CheckSquare className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              No photos in trash queue
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchQuery
                ? `No items matched "${searchQuery}". Try a different keyword.`
                : 'Your trash queue is completely empty! Any photos queued for deletion will appear here with full previews.'}
            </p>
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                fetchTrashItems('');
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
            >
              Clear Search
            </button>
          )}
        </div>
      )}

      {/* Photo Gallery Grid */}
      {filteredAndSortedItems.length > 0 && (
        <div
          className={`grid gap-3.5 select-none ${
            gridDensity === 'compact'
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7'
          }`}
        >
          {filteredAndSortedItems.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <div
                key={item.id}
                data-media-id={item.id}
                onPointerDown={(e) => handlePointerDown(e, item.id)}
                onClick={(e) => handleItemClick(item.id, e, orderedIds)}
                onDoubleClick={(e) => handleItemDoubleClick(item.id, e)}
                title="Single click to select • Double-click to inspect full photo"
                className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm select-none ${
                  isSelected
                    ? 'border-indigo-600 ring-2 ring-indigo-500/30'
                    : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Thumbnail Image */}
                <img
                  src={`${API_URL}${item.thumbnail_url}`}
                  alt={item.filename}
                  loading="lazy"
                  className="w-full h-full object-cover pointer-events-none transition group-hover:scale-105 duration-300"
                />

                {/* Selection Checkbox */}
                <div className="absolute top-2 left-2 z-10 transition">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center backdrop-blur-md shadow-md transition ${
                      isSelected
                        ? 'bg-indigo-600 text-white ring-2 ring-white/80'
                        : 'bg-black/40 text-white/70 group-hover:bg-black/60 group-hover:text-white'
                    }`}
                  >
                    {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                  </div>
                </div>

                {/* Top Right: Status Badge & Quick Restore */}
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition">
                  {/* Quick Restore Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore([item.id]);
                    }}
                    title="Restore this photo back to library"
                    className="p-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white backdrop-blur-md shadow-md opacity-0 group-hover:opacity-100 transition transform hover:scale-110"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  {/* Read-Only Badge */}
                  {item.pending_disk_deletion && (
                    <span
                      title="Queued on read-only mount: Protected until OS script executed"
                      className="p-1 rounded-lg bg-rose-600/90 text-white backdrop-blur-md text-[10px] font-bold shadow-md"
                    >
                      :ro
                    </span>
                  )}
                </div>

                {/* Bottom Overlay Gradient with Metadata */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 pt-6 text-white pointer-events-none">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[11px] font-semibold truncate leading-tight drop-shadow-xs">
                      {item.filename}
                    </p>
                    {item.marked_for_deletion_at && (
                      <span className="text-[9px] font-mono text-amber-300 flex-shrink-0 bg-black/40 px-1 py-0.5 rounded">
                        {Math.max(1, 30 - Math.floor((Date.now() - new Date(item.marked_for_deletion_at).getTime()) / (1000 * 60 * 60 * 24)))}d left
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-300 mt-1 font-mono">
                    <span>{formatBytes(item.file_size)}</span>
                    {item.width && item.height && (
                      <span className="opacity-80">
                        {item.width}×{item.height}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] md:bottom-6 left-0 right-0 md:left-64 md:right-0 mx-auto z-40 bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl px-4 sm:px-5 py-2.5 sm:py-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3 animate-fadeIn w-max max-w-[94vw]">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-xs font-bold whitespace-nowrap">
              {selectedIds.length} photo{selectedIds.length === 1 ? '' : 's'} selected
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              ({formatBytes(selectedSizeBytes)})
            </span>
          </div>

          {/* Action: Restore Selected */}
          <button
            type="button"
            disabled={isProcessingAction}
            onClick={() => handleRestore(selectedIds)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-xs transition disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Selected</span>
          </button>

          {/* Action: Google Photos Query */}
          <button
            type="button"
            onClick={() => setShowGooglePhotosModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-xs transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Google Photos Query</span>
          </button>

          {/* Action: Copy File Paths */}
          <button
            type="button"
            onClick={handleCopyHostPaths}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Paths</span>
          </button>

          {/* Action: Permanent Purge from DB */}
          <button
            type="button"
            disabled={isProcessingAction}
            onClick={() => setShowConfirmPurgeSelected(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold shadow-xs transition disabled:opacity-50"
            title="Permanently remove records from database (run host script for disk)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purge DB Records</span>
          </button>

          {/* Deselect button */}
          <button
            type="button"
            onClick={handleDeselectAll}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            title="Deselect all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmation Modal: Restore All */}
      {showConfirmRestoreAll && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Restore All {totalCount.toLocaleString()} Photos?
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                All photos currently queued for deletion will be restored back to your active photo library immediately.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmRestoreAll(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => handleRestore('all')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition shadow-sm disabled:opacity-50"
              >
                {isProcessingAction ? 'Restoring...' : 'Yes, Restore All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Permanent Purge Selected */}
      {showConfirmPurgeSelected && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Permanently Purge {selectedIds.length} DB Record(s)?
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                This will permanently remove the database rows, AI embeddings, and cached thumbnails for the selected {selectedIds.length} photos.
              </p>
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-3 text-[11px] text-amber-900 dark:text-amber-300 mt-3">
                <b>Note:</b> If files reside on a read-only host mount, run <code className="font-mono font-bold">./scripts/delete_files_marked_as_deleted.sh</code> on your host terminal to remove the physical files from disk.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmPurgeSelected(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => handlePurgePermanent(false)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition shadow-sm disabled:opacity-50"
              >
                {isProcessingAction ? 'Purging...' : 'Permanently Purge Records'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Resolution Inspection Lightbox Modal */}
      <LightboxModal
        photo={inspectingPhoto}
        apiUrl={API_URL}
        onClose={() => setInspectingPhoto(null)}
        onToggleFavorite={() => {}}
        onDelete={(id) => {
          // In trash view, deleting permanently purges
          setInspectingPhoto(null);
          setSelectedIds([id]);
          setShowConfirmPurgeSelected(true);
        }}
      />

      {/* Google Photos Deletion Search Helper Modal */}
      <GooglePhotosExportModal
        isOpen={showGooglePhotosModal}
        onClose={() => setShowGooglePhotosModal(false)}
        items={selectedItems.length > 0 ? selectedItems : filteredAndSortedItems}
        title="Google Photos Cloud Deletion Helper"
        subtitle="Search and trash matched items in your Google Photos account"
      />
    </div>
  );
}
