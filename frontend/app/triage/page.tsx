'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Sparkles, 
  Clock, 
  FileText, 
  Copy, 
  EyeOff, 
  Trash2, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  HardDrive,
  Check,
  Award,
  DollarSign,
  ArrowRight,
  ExternalLink,
  Search,
  CheckSquare,
  Square,
  BookmarkCheck,
  Zap,
  Image as ImageIcon,
  Smile,
  Maximize2
} from 'lucide-react';

import { 
  DuplicateResolverModal, 
  DuplicateCluster 
} from '@/components/triage/DuplicateResolverModal';
import { BillInspectorModal } from '@/components/triage/BillInspectorModal';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { MediaItem } from '@/components/timeline/PhotoCard';

interface TriageOverview {
  total_screenshots: number;
  expiring_screenshots: number;
  total_bills_receipts: number;
  total_blurry: number;
  total_memes: number;
  reclaimable_bytes: number;
  reclaimable_mb: number;
}

interface ScreenshotItem {
  id: number;
  filename: string;
  captured_at: string;
  expires_at: string | null;
  days_left: number | null;
  is_expired: boolean;
  file_size: number;
  thumbnail_url: string;
}

interface BillItem {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  extracted_text?: string;
  thumbnail_url: string;
}

interface BlurryItem {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  blurriness_score?: number;
  thumbnail_url: string;
}

interface LargeFileItem {
  id: number;
  filename: string;
  category: string;
  file_size: number;
  file_size_mb: number;
  width: number;
  height: number;
  captured_at: string;
  thumbnail_url: string;
}

interface MemeItem {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  thumbnail_url: string;
}

type TriageTab = 'screenshots' | 'bills' | 'duplicates' | 'blurry' | 'large_files' | 'memes';

export default function TriagePage() {
  const [overview, setOverview] = useState<TriageOverview | null>(null);
  const [activeTab, setActiveTab] = useState<TriageTab>('screenshots');

  // Data Collections
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCluster[]>([]);
  const [blurryPhotos, setBlurryPhotos] = useState<BlurryItem[]>([]);
  const [largeFiles, setLargeFiles] = useState<LargeFileItem[]>([]);
  const [memes, setMemes] = useState<MemeItem[]>([]);

  // Selection & Filters
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [billSearchQuery, setBillSearchQuery] = useState('');
  const [screenshotFilter, setScreenshotFilter] = useState<'all' | 'expired' | 'recent'>('all');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isResolvingAll, setIsResolvingAll] = useState(false);

  // Modals
  const [activeCompareCluster, setActiveCompareCluster] = useState<DuplicateCluster | null>(null);
  const [inspectingBillId, setInspectingBillId] = useState<number | null>(null);
  const [inspectingPhoto, setInspectingPhoto] = useState<MediaItem | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/overview`);
      if (res.ok) setOverview(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [API_URL]);

  const fetchScreenshots = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/screenshots`);
      if (res.ok) setScreenshots(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const fetchBills = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/bills`);
      if (res.ok) setBills(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const fetchDuplicates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/duplicates`);
      if (res.ok) setDuplicates(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const fetchBlurry = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/media?limit=200`);
      if (res.ok) {
        const data = await res.json();
        const blurry = (data.items || []).filter((i: any) => i.is_blurry);
        setBlurryPhotos(
          blurry.map((i: any) => ({
            ...i,
            thumbnail_url: `/api/v1/media/${i.id}/thumbnail?size=256`,
          }))
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const fetchLargeFiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/large-files?min_mb=3.0`);
      if (res.ok) setLargeFiles(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const fetchMemes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/memes`);
      if (res.ok) setMemes(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchOverview();
    setSelectedIds([]);
    if (activeTab === 'screenshots') fetchScreenshots();
    else if (activeTab === 'bills') fetchBills();
    else if (activeTab === 'duplicates') fetchDuplicates();
    else if (activeTab === 'blurry') fetchBlurry();
    else if (activeTab === 'large_files') fetchLargeFiles();
    else if (activeTab === 'memes') fetchMemes();
  }, [activeTab, fetchOverview, fetchScreenshots, fetchBills, fetchDuplicates, fetchBlurry, fetchLargeFiles, fetchMemes]);

  // Current items for active tab selection
  const currentTabItemIds = useMemo(() => {
    if (activeTab === 'screenshots') {
      return screenshots
        .filter((s) => {
          if (screenshotFilter === 'expired') return s.is_expired;
          if (screenshotFilter === 'recent') return !s.is_expired;
          return true;
        })
        .map((s) => s.id);
    }
    if (activeTab === 'bills') return bills.map((b) => b.id);
    if (activeTab === 'blurry') return blurryPhotos.map((b) => b.id);
    if (activeTab === 'large_files') return largeFiles.map((l) => l.id);
    if (activeTab === 'memes') return memes.map((m) => m.id);
    return [];
  }, [activeTab, screenshots, screenshotFilter, bills, blurryPhotos, largeFiles, memes]);

  const isAllSelected = currentTabItemIds.length > 0 && currentTabItemIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...currentTabItemIds])));
    }
  };

  const toggleSelect = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  // 1-Click Move to Permanent Memories
  const handleMoveToMemories = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/move-to-memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(`Moved ${data.count || selectedIds.length} items to permanent Memories.`);
        setSelectedIds([]);
        refreshCurrentTab();
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 3500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Mark as Sharp / Dismiss Blur
  const handleMarkAsSharp = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/mark-sharp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(`Marked ${data.count || selectedIds.length} items as sharp.`);
        setSelectedIds([]);
        fetchBlurry();
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 3500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Snooze screenshots
  const handleSnooze = async (days: number = 30) => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds, days }),
      });
      if (res.ok) {
        setSelectedIds([]);
        fetchScreenshots();
        fetchOverview();
        setStatusMessage(`Snoozed ${selectedIds.length} screenshots for +${days} days.`);
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Safe manual batch delete (Zero auto-deletion policy)
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `Move ${selectedIds.length} items to trash? (Zero Auto-Deletion Guarantee: Items remain safely restorable).`
      )
    )
      return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds }),
      });
      if (res.ok) {
        setStatusMessage(`Moved ${selectedIds.length} items to trash.`);
        setSelectedIds([]);
        refreshCurrentTab();
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 3500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Auto-resolve all duplicates
  const handleResolveAllDuplicates = async () => {
    if (duplicates.length === 0) return;
    if (
      !confirm(
        `Auto-resolve ${duplicates.length} duplicate clusters? For each cluster, the highest resolution and sharpness photo will be kept, and redundant copies moved to trash.`
      )
    )
      return;
    try {
      setIsResolvingAll(true);
      const res = await fetch(`${API_URL}/api/v1/triage/resolve-all-duplicates`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(
          `Resolved ${data.clusters_resolved} clusters! Cleaned ${data.deleted_duplicates} duplicate copies.`
        );
        fetchDuplicates();
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsResolvingAll(false);
    }
  };

  const refreshCurrentTab = () => {
    if (activeTab === 'screenshots') fetchScreenshots();
    else if (activeTab === 'bills') fetchBills();
    else if (activeTab === 'duplicates') fetchDuplicates();
    else if (activeTab === 'blurry') fetchBlurry();
    else if (activeTab === 'large_files') fetchLargeFiles();
    else if (activeTab === 'memes') fetchMemes();
  };

  // Filtered bills by OCR search
  const filteredBills = useMemo(() => {
    if (!billSearchQuery.trim()) return bills;
    const q = billSearchQuery.toLowerCase();
    return bills.filter(
      (b) => b.filename.toLowerCase().includes(q) || (b.extracted_text && b.extracted_text.toLowerCase().includes(q))
    );
  }, [bills, billSearchQuery]);

  // Filtered screenshots by age
  const filteredScreenshots = useMemo(() => {
    if (screenshotFilter === 'expired') return screenshots.filter((s) => s.is_expired);
    if (screenshotFilter === 'recent') return screenshots.filter((s) => !s.is_expired);
    return screenshots;
  }, [screenshots, screenshotFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-purple-500/10 border border-amber-200/60 dark:border-amber-900/60 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-lg">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Smart Triage & Safe Manual Review
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              <b>Zero Auto-Deletion Guarantee:</b> Photos are never deleted automatically under any circumstances.
              The triage engine intelligently classifies screenshots, bills/receipts, blurry shots, and duplicate bursts so you can inspect candidates and decide what to keep.
            </p>
          </div>

          {/* Quick Storage Stat Box */}
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-3 flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Reclaimable Space</p>
              <p className="text-lg font-black text-slate-800 dark:text-white">
                {overview?.reclaimable_mb || 0} MB
              </p>
            </div>
          </div>
        </div>

        {/* Status Notification Toast */}
        {statusMessage && (
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/60 px-4 py-2 rounded-2xl border border-emerald-200 dark:border-emerald-800 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Triage Overview Tabs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Screenshots Tab */}
        <button
          onClick={() => setActiveTab('screenshots')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === 'screenshots'
              ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 dark:border-blue-700 ring-2 ring-blue-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Clock className="w-4 h-4 text-blue-500" />
            Screenshots
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {overview?.total_screenshots || 0}
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate">
            {overview?.expiring_screenshots || 0} expiring soon
          </p>
        </button>

        {/* Bills & Receipts Tab */}
        <button
          onClick={() => setActiveTab('bills')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === 'bills'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <FileText className="w-4 h-4 text-emerald-500" />
            Receipts / Bills
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {overview?.total_bills_receipts || 0}
          </p>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">OCR Text Vault</p>
        </button>

        {/* Duplicates Tab */}
        <button
          onClick={() => setActiveTab('duplicates')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === 'duplicates'
              ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-400 dark:border-purple-700 ring-2 ring-purple-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Copy className="w-4 h-4 text-purple-500" />
            Duplicates
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {duplicates.length}
          </p>
          <p className="text-[10px] text-purple-700 dark:text-purple-400 font-medium">pHash Clusters</p>
        </button>

        {/* Blurry Tab */}
        <button
          onClick={() => setActiveTab('blurry')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === 'blurry'
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-400 dark:border-amber-700 ring-2 ring-amber-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <EyeOff className="w-4 h-4 text-amber-500" />
            Blurry Shots
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {overview?.total_blurry || 0}
          </p>
          <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">Low Sharpness</p>
        </button>

        {/* Large Files Tab */}
        <button
          onClick={() => setActiveTab('large_files')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === 'large_files'
              ? 'bg-red-50 dark:bg-red-950/50 border-red-400 dark:border-red-700 ring-2 ring-red-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <HardDrive className="w-4 h-4 text-red-500" />
            Large Files
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {largeFiles.length}
          </p>
          <p className="text-[10px] text-red-700 dark:text-red-400 font-medium">Storage Hogs (&gt;3MB)</p>
        </button>

        {/* Memes Tab */}
        <button
          onClick={() => setActiveTab('memes')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === 'memes'
              ? 'bg-pink-50 dark:bg-pink-950/50 border-pink-400 dark:border-pink-700 ring-2 ring-pink-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Smile className="w-4 h-4 text-pink-500" />
            Memes / Junk
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {overview?.total_memes || 0}
          </p>
          <p className="text-[10px] text-pink-700 dark:text-pink-400 font-medium">Social Graphics</p>
        </button>
      </div>

      {/* Selection Control & Batch Action Floating Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white rounded-2xl px-5 py-3 flex items-center justify-between shadow-2xl sticky top-4 z-20 animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold bg-indigo-600 px-2.5 py-0.5 rounded-full">
              {selectedIds.length} Selected
            </span>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Deselect All
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Move to Memories */}
            <button
              onClick={handleMoveToMemories}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition"
              title="Reclassify selected items into permanent memories"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Keep as Memories</span>
            </button>

            {/* Snooze (Screenshots) */}
            {activeTab === 'screenshots' && (
              <button
                onClick={() => handleSnooze(30)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Snooze +30d</span>
              </button>
            )}

            {/* Mark as Sharp (Blurry) */}
            {activeTab === 'blurry' && (
              <button
                onClick={handleMarkAsSharp}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Mark Sharp / Keep</span>
              </button>
            )}

            {/* Delete Selected */}
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 1: Screenshots Review Tray */}
      {activeTab === 'screenshots' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All In View'}</span>
              </button>
              <span className="text-xs text-slate-500">
                {filteredScreenshots.length} screenshots found
              </span>
            </div>

            {/* Age Filter Chips */}
            <div className="flex items-center gap-1.5">
              {(['all', 'expired', 'recent'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setScreenshotFilter(filter)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition capitalize ${
                    screenshotFilter === filter
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {filter === 'all' ? 'All Screenshots' : filter === 'expired' ? '30+ Days Old' : 'Recent'}
                </button>
              ))}
            </div>
          </div>

          {filteredScreenshots.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No screenshots match the filter criteria. Your library is clean!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredScreenshots.map((s) => {
                const isSelected = selectedIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() =>
                      setInspectingPhoto({
                        id: s.id,
                        filename: s.filename,
                        category: 'screenshot',
                        width: 1080,
                        height: 1920,
                        captured_at: s.captured_at,
                        is_favorite: false,
                        is_blurry: false,
                        thumbnail_url: s.thumbnail_url,
                      })
                    }
                    className={`group relative aspect-[9/16] bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm ${
                      isSelected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${s.thumbnail_url}`}
                      alt={s.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Top Overlay Badge & Checkbox */}
                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md shadow-sm ${
                          s.is_expired ? 'bg-amber-600 text-white' : 'bg-black/60 text-white'
                        }`}
                      >
                        {s.is_expired ? '30+ days' : 'Recent'}
                      </span>
                      <div
                        onClick={(e) => toggleSelect(s.id, e)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-blue-600 border-white text-white shadow-md scale-110'
                            : 'bg-black/40 border-white/60 text-transparent hover:bg-black/60'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Bottom Vignette */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[11px] font-semibold truncate leading-tight">{s.filename}</p>
                      <p className="text-[9px] text-slate-300 font-mono mt-0.5">
                        {((s.file_size || 0) / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Bills & Receipts Vault */}
      {activeTab === 'bills' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              <span className="text-xs text-slate-500">
                {filteredBills.length} documents identified
              </span>
            </div>

            {/* OCR Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search vendor, amount, or OCR text..."
                value={billSearchQuery}
                onChange={(e) => setBillSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {filteredBills.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No bills or receipts matched your query.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredBills.map((b) => {
                const isSelected = selectedIds.includes(b.id);
                return (
                  <div
                    key={b.id}
                    onClick={() => setInspectingBillId(b.id)}
                    className={`group relative aspect-[3/4] bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between ${
                      isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${b.thumbnail_url}`}
                      alt={b.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />

                    {/* Top Checkbox & Receipt Badge */}
                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <span className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                        Receipt
                      </span>
                      <div
                        onClick={(e) => toggleSelect(b.id, e)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-emerald-600 border-white text-white shadow-md scale-110'
                            : 'bg-black/40 border-white/60 text-transparent hover:bg-black/60'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Bottom Metadata & OCR Inspect link */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 text-white">
                      <p className="font-semibold text-xs truncate leading-tight">{b.filename}</p>
                      <p className="text-[10px] text-slate-300 mt-0.5">
                        {new Date(b.captured_at).toLocaleDateString()}
                      </p>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-300 font-semibold group-hover:underline">
                        <span>Inspect OCR Text</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Duplicate Clusters & Bursts */}
      {activeTab === 'duplicates' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Duplicate & Burst Clusters ({duplicates.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Exact or near-identical photos grouped by perceptual hash (pHash).
              </p>
            </div>

            {duplicates.length > 0 && (
              <button
                onClick={handleResolveAllDuplicates}
                disabled={isResolvingAll}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 ${isResolvingAll ? 'animate-spin' : ''}`} />
                <span>{isResolvingAll ? 'Resolving...' : 'Auto-Resolve All Clusters (Keep Best)'}</span>
              </button>
            )}
          </div>

          {duplicates.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No duplicate clusters detected in your library!
            </div>
          ) : (
            <div className="space-y-4">
              {duplicates.map((cluster, idx) => (
                <div
                  key={idx}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        Cluster #{idx + 1} ({cluster.count} matching images)
                      </span>
                      <p className="text-xs text-slate-400 font-mono">
                        Perceptual Hash: {cluster.hash}
                      </p>
                    </div>

                    <button
                      onClick={() => setActiveCompareCluster(cluster)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                    >
                      <Award className="w-3.5 h-3.5 text-amber-300" />
                      <span>Compare & Pick Best Shot</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {cluster.items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setActiveCompareCluster(cluster)}
                        className="group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border border-slate-200 dark:border-slate-800 hover:border-indigo-500 transition-all hover:scale-[1.02]"
                      >
                        <img
                          src={`${API_URL}${item.thumbnail_url}`}
                          alt={item.filename}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-md font-mono">
                          {((item.file_size || 0) / (1024 * 1024)).toFixed(1)}MB
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Blurry Shots Review */}
      {activeTab === 'blurry' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-amber-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              <span className="text-xs text-slate-500">
                {blurryPhotos.length} low-sharpness photos flagged
              </span>
            </div>
          </div>

          {blurryPhotos.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No blurry photos detected in library! All images meet sharpness thresholds.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {blurryPhotos.map((b) => {
                const isSelected = selectedIds.includes(b.id);
                return (
                  <div
                    key={b.id}
                    onClick={() =>
                      setInspectingPhoto({
                        id: b.id,
                        filename: b.filename,
                        category: 'memory',
                        width: 1920,
                        height: 1080,
                        captured_at: b.captured_at,
                        is_favorite: false,
                        is_blurry: true,
                        thumbnail_url: b.thumbnail_url,
                      })
                    }
                    className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm ${
                      isSelected ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${b.thumbnail_url}`}
                      alt={b.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Sharpness Badge & Checkbox */}
                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <span className="bg-amber-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                        Sharpness: {b.blurriness_score ? b.blurriness_score.toFixed(0) : 'Low'}
                      </span>
                      <div
                        onClick={(e) => toggleSelect(b.id, e)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-amber-600 border-white text-white shadow-md scale-110'
                            : 'bg-black/40 border-white/60 text-transparent hover:bg-black/60'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[11px] font-semibold truncate">{b.filename}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Large Files / Storage Hogs */}
      {activeTab === 'large_files' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-red-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              <span className="text-xs text-slate-500">
                {largeFiles.length} photos exceeding 3 MB
              </span>
            </div>
          </div>

          {largeFiles.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No oversized files detected!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {largeFiles.map((l) => {
                const isSelected = selectedIds.includes(l.id);
                return (
                  <div
                    key={l.id}
                    onClick={() =>
                      setInspectingPhoto({
                        id: l.id,
                        filename: l.filename,
                        category: l.category,
                        width: l.width,
                        height: l.height,
                        captured_at: l.captured_at,
                        is_favorite: false,
                        is_blurry: false,
                        thumbnail_url: l.thumbnail_url,
                      })
                    }
                    className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm ${
                      isSelected ? 'border-red-500 ring-2 ring-red-500/30' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${l.thumbnail_url}`}
                      alt={l.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* File Size Badge & Checkbox */}
                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <span className="bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                        {l.file_size_mb} MB
                      </span>
                      <div
                        onClick={(e) => toggleSelect(l.id, e)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-red-600 border-white text-white shadow-md scale-110'
                            : 'bg-black/40 border-white/60 text-transparent hover:bg-black/60'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white">
                      <p className="text-[11px] font-semibold truncate leading-tight">{l.filename}</p>
                      <p className="text-[9px] text-slate-300 font-mono mt-0.5">
                        {l.width} x {l.height} px
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 6: Memes & Social Graphics */}
      {activeTab === 'memes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-pink-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              <span className="text-xs text-slate-500">{memes.length} memes & graphics detected</span>
            </div>
          </div>

          {memes.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No memes or junk graphics in your library.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {memes.map((m) => {
                const isSelected = selectedIds.includes(m.id);
                return (
                  <div
                    key={m.id}
                    onClick={() =>
                      setInspectingPhoto({
                        id: m.id,
                        filename: m.filename,
                        category: 'meme_junk',
                        width: 1080,
                        height: 1080,
                        captured_at: m.captured_at,
                        is_favorite: false,
                        is_blurry: false,
                        thumbnail_url: m.thumbnail_url,
                      })
                    }
                    className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm ${
                      isSelected ? 'border-pink-500 ring-2 ring-pink-500/30' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${m.thumbnail_url}`}
                      alt={m.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <span className="bg-pink-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                        Meme
                      </span>
                      <div
                        onClick={(e) => toggleSelect(m.id, e)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-pink-600 border-white text-white shadow-md scale-110'
                            : 'bg-black/40 border-white/60 text-transparent hover:bg-black/60'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white">
                      <p className="text-[11px] font-semibold truncate leading-tight">{m.filename}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Duplicate Resolver Comparison Modal */}
      <DuplicateResolverModal
        cluster={activeCompareCluster}
        apiUrl={API_URL}
        onClose={() => setActiveCompareCluster(null)}
        onResolved={() => {
          fetchDuplicates();
          fetchOverview();
        }}
      />

      {/* Bill & Receipt OCR Inspector Modal */}
      <BillInspectorModal
        billId={inspectingBillId}
        apiUrl={API_URL}
        onClose={() => setInspectingBillId(null)}
        onCategoryChanged={() => {
          fetchBills();
          fetchOverview();
        }}
      />

      {/* Full-Resolution Inspection Lightbox Modal */}
      <LightboxModal
        photo={inspectingPhoto}
        apiUrl={API_URL}
        onClose={() => setInspectingPhoto(null)}
        onToggleFavorite={() => {}}
        onDelete={(id) => {
          setInspectingPhoto(null);
          refreshCurrentTab();
          fetchOverview();
        }}
      />
    </div>
  );
}
