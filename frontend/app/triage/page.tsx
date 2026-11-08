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
  Maximize2,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Layers,
  ShieldCheck,
  Tag,
  Filter
} from 'lucide-react';

import { DuplicateResolverModal, DuplicateCluster } from '@/components/triage/DuplicateResolverModal';
import { BillInspectorModal } from '@/components/triage/BillInspectorModal';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { BulkDeleteModal } from '@/components/timeline/BulkDeleteModal';
import { GooglePhotosExportModal } from '@/components/sync/GooglePhotosExportModal';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { useAuth } from '@/context/AuthContext';
import { useDragSelect } from '@/hooks/useDragSelect';

interface TriageOverview {
  total_screenshots: number;
  expiring_screenshots: number;
  total_bills_receipts: number;
  total_blurry: number;
  total_pocket_shots?: number;
  total_motion_blur?: number;
  total_bokeh?: number;
  total_memes: number;
  total_wallpapers?: number;
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
  source_type?: string;
  source_id?: string | null;
  width?: number;
  height?: number;
  is_portrait?: boolean;
  is_landscape?: boolean;
}

interface WallpaperItem {
  id: number;
  filename: string;
  width: number;
  height: number;
  file_size: number;
  captured_at: string;
  category: string;
  thumbnail_url: string;
  source_type?: string;
  source_id?: string | null;
}

interface BillItem {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  extracted_text?: string;
  thumbnail_url: string;
  source_type?: string;
  source_id?: string | null;
}

interface BlurryItem {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  blur_type?: string;
  blurriness_score?: number;
  is_blurry?: boolean;
  is_bokeh?: boolean;
  is_enhanced?: boolean;
  thumbnail_url: string;
  source_type?: string;
  source_id?: string | null;
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
  source_type?: string;
  source_id?: string | null;
}

interface MemeItem {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  thumbnail_url: string;
  source_type?: string;
  source_id?: string | null;
}

export type TimeGrouping = 'week' | 'month' | 'year' | 'all';

interface TriageTimeGroup<T> {
  key: string;
  label: string;
  items: T[];
  totalBytes: number;
}

function groupItemsByTime<T extends { id: number; captured_at: string; file_size?: number }>(
  items: T[],
  grouping: TimeGrouping
): TriageTimeGroup<T>[] {
  if (grouping === 'all') {
    const totalBytes = items.reduce((acc, i) => acc + (i.file_size || 0), 0);
    return [{
      key: 'all',
      label: 'All Items',
      items,
      totalBytes,
    }];
  }

  const map = new Map<string, { label: string; items: T[]; totalBytes: number }>();

  for (const item of items) {
    let key = 'undated';
    let label = 'Undated / Unknown';

    if (item.captured_at) {
      const normalizedDateStr = item.captured_at.includes('T')
        ? item.captured_at
        : item.captured_at.replace(' ', 'T');
      const d = new Date(normalizedDateStr);

      if (!isNaN(d.getTime())) {
        if (grouping === 'year') {
          key = `${d.getFullYear()}`;
          label = `${d.getFullYear()}`;
        } else if (grouping === 'month') {
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } else if (grouping === 'week') {
          const day = d.getDay();
          const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(d);
          monday.setDate(diffToMonday);
          monday.setHours(0, 0, 0, 0);

          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);

          const monMonth = monday.toLocaleDateString('en-US', { month: 'short' });
          const sunMonth = sunday.toLocaleDateString('en-US', { month: 'short' });
          const yearStr = sunday.getFullYear();

          key = monday.toISOString().slice(0, 10);
          if (monMonth === sunMonth) {
            label = `${monMonth} ${monday.getDate()} – ${sunday.getDate()}, ${yearStr}`;
          } else {
            label = `${monMonth} ${monday.getDate()} – ${sunMonth} ${sunday.getDate()}, ${yearStr}`;
          }
        }
      }
    }

    if (!map.has(key)) {
      map.set(key, { label, items: [], totalBytes: 0 });
    }
    const group = map.get(key)!;
    group.items.push(item);
    group.totalBytes += (item.file_size || 0);
  }

  const sortedKeys = Array.from(map.keys()).sort((a, b) => {
    if (a === 'undated') return 1;
    if (b === 'undated') return -1;
    return b.localeCompare(a);
  });

  return sortedKeys.map((k) => ({
    key: k,
    label: map.get(k)!.label,
    items: map.get(k)!.items,
    totalBytes: map.get(k)!.totalBytes,
  }));
}

type TriageTab = 'screenshots' | 'wallpapers' | 'bills' | 'duplicates' | 'blurry' | 'large_files' | 'memes';

export default function TriagePage() {
  const [overview, setOverview] = useState<TriageOverview | null>(null);
  const [activeTab, setActiveTab] = useState<TriageTab>('screenshots');

  // Data Collections
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCluster[]>([]);
  const [blurryPhotos, setBlurryPhotos] = useState<BlurryItem[]>([]);
  const [largeFiles, setLargeFiles] = useState<LargeFileItem[]>([]);
  const [memes, setMemes] = useState<MemeItem[]>([]);

  // Selection & Filters
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWallpapers, setLoadingWallpapers] = useState(false);
  const [billSearchQuery, setBillSearchQuery] = useState('');
  const [screenshotFilter, setScreenshotFilter] = useState<'all' | 'expired' | 'recent'>('all');
  const [screenshotOrientation, setScreenshotOrientation] = useState<'all' | 'portrait' | 'desktop'>('all');
  const [wallpaperFilter, setWallpaperFilter] = useState<'all' | '4k' | '2k' | '1080p' | 'ultrawide'>('all');
  const [blurFilter, setBlurFilter] = useState<'all' | 'motion_blur' | 'out_of_focus' | 'black_pocket'>('all');
  const [isCleaningPockets, setIsCleaningPockets] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isResolvingAll, setIsResolvingAll] = useState(false);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showGooglePhotosModal, setShowGooglePhotosModal] = useState(false);

  const getSelectedItemsData = useCallback(() => {
    const allItems = [...screenshots, ...wallpapers, ...bills, ...blurryPhotos, ...largeFiles, ...memes];
    const itemMap = new Map<number, { id: number; filename: string; file_size?: number; captured_at?: string }>();
    for (const item of allItems) {
      if (selectedIds.includes(item.id)) {
        itemMap.set(item.id, {
          id: item.id,
          filename: item.filename,
          file_size: item.file_size,
          captured_at: 'captured_at' in item ? (item.captured_at as string) : undefined
        });
      }
    }
    return Array.from(itemMap.values());
  }, [screenshots, wallpapers, bills, blurryPhotos, largeFiles, memes, selectedIds]);

  // Time Grouping & Collapse States
  const [timeGrouping, setTimeGrouping] = useState<TimeGrouping>('month');
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(new Set());
  const [expandedGroupLimits, setExpandedGroupLimits] = useState<Record<string, number>>({});

  const toggleSelectGroup = (groupIds: number[]) => {
    const isAllGroupSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
    if (isAllGroupSelected) {
      setSelectedIds((prev) => prev.filter((id) => !groupIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...groupIds])));
    }
  };

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const collapseAllGroups = (keys: string[]) => {
    setCollapsedGroupKeys(new Set(keys));
  };

  const expandAllGroups = () => {
    setCollapsedGroupKeys(new Set());
  };

  // Modals
  const [activeCompareCluster, setActiveCompareCluster] = useState<DuplicateCluster | null>(null);
  const [inspectingBillId, setInspectingBillId] = useState<number | null>(null);
  const [inspectingPhoto, setInspectingPhoto] = useState<MediaItem | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const { token: authContextToken } = useAuth();

  const getActiveToken = useCallback(() => {
    return authContextToken || (typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null);
  }, [authContextToken]);

  const authHeaders = useCallback((extra: Record<string, string> = {}) => {
    const token = getActiveToken();
    const headers: Record<string, string> = { ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, [getActiveToken]);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/overview`, { headers: authHeaders() });
      if (res.ok) setOverview(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [API_URL, authHeaders]);

  const fetchScreenshots = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/screenshots`, { headers: authHeaders() });
      if (res.ok) setScreenshots(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL, authHeaders]);

  const fetchBills = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/bills`, { headers: authHeaders() });
      if (res.ok) setBills(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL, authHeaders]);

  const fetchDuplicates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/duplicates`, { headers: authHeaders() });
      if (res.ok) setDuplicates(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL, authHeaders]);

  const fetchBlurry = useCallback(async () => {
    try {
      setLoading(true);
      const url = blurFilter !== 'all'
        ? `${API_URL}/api/v1/triage/blurry?blur_type=${blurFilter}`
        : `${API_URL}/api/v1/triage/blurry`;
      const res = await fetch(url, { headers: authHeaders() });
      if (res.ok) {
        setBlurryPhotos(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL, blurFilter, authHeaders]);

  const handleCleanPocketShots = async () => {
    try {
      setIsCleaningPockets(true);
      const res = await fetch(`${API_URL}/api/v1/triage/pocket-shots/cleanup`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(`Cleaned ${data.count} accidental dark / pocket shots`);
        fetchOverview();
        fetchBlurry();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCleaningPockets(false);
    }
  };

  const fetchLargeFiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/large-files?min_mb=3.0`, { headers: authHeaders() });
      if (res.ok) setLargeFiles(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL, authHeaders]);

  const fetchMemes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/memes`, { headers: authHeaders() });
      if (res.ok) setMemes(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API_URL, authHeaders]);

  const fetchWallpapers = useCallback(async () => {
    try {
      setLoadingWallpapers(true);
      const res = await fetch(`${API_URL}/api/v1/triage/wallpapers?resolution=${wallpaperFilter}`, {
        headers: authHeaders(),
      });
      if (res.ok) setWallpapers(await res.json());
    } catch (e) {
      console.error('Error fetching wallpapers:', e);
    } finally {
      setLoadingWallpapers(false);
    }
  }, [API_URL, wallpaperFilter, authHeaders]);

  const handleReclassifyScreenshots = async () => {
    try {
      setIsReclassifying(true);
      const res = await fetch(`${API_URL}/api/v1/triage/reclassify-screenshots`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(
          `Auto-Rescue Complete! Rescued ${data.rescued_to_memories} real photos to Memories, moved ${data.moved_to_documents} to Documents, and kept ${data.retained_screenshots} genuine screenshots.`
        );
        fetchScreenshots();
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 8000);
      }
    } catch (e) {
      console.error('Error reclassifying screenshots:', e);
      setStatusMessage('Failed to auto-rescue false positive screenshots.');
    } finally {
      setIsReclassifying(false);
    }
  };

  const handleChangeCategory = async (targetCategory: string) => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/category`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ media_ids: selectedIds, category: targetCategory }),
      });
      if (res.ok) {
        const catLabel =
          targetCategory === 'memory' ? 'Personal Memories' :
          targetCategory === 'screenshot' ? 'Screenshots' :
          targetCategory === 'document_bill' ? 'Receipts / Documents' : 'Memes / Clutter';
        setStatusMessage(`Successfully moved ${selectedIds.length} items to ${catLabel}!`);
        setSelectedIds([]);
        setShowCategoryMenu(false);
        refreshCurrentTab();
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (e) {
      console.error('Change category error:', e);
      setStatusMessage('Failed to update category.');
    }
  };

  const handleRescueSingle = async (mediaId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/category`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ media_ids: [mediaId], category: 'memory' }),
      });
      if (res.ok) {
        setStatusMessage('Rescued photo back to Personal Memories!');
        setScreenshots((prev) => prev.filter((s) => s.id !== mediaId));
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchOverview();
    setSelectedIds([]);
    if (activeTab === 'screenshots') fetchScreenshots();
    else if (activeTab === 'wallpapers') fetchWallpapers();
    else if (activeTab === 'bills') fetchBills();
    else if (activeTab === 'duplicates') fetchDuplicates();
    else if (activeTab === 'blurry') fetchBlurry();
    else if (activeTab === 'large_files') fetchLargeFiles();
    else if (activeTab === 'memes') fetchMemes();
  }, [activeTab, fetchOverview, fetchScreenshots, fetchWallpapers, fetchBills, fetchDuplicates, fetchBlurry, fetchLargeFiles, fetchMemes]);

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
    if (activeTab === 'wallpapers') return wallpapers.map((w) => w.id);
    if (activeTab === 'bills') return bills.map((b) => b.id);
    if (activeTab === 'blurry') return blurryPhotos.map((b) => b.id);
    if (activeTab === 'large_files') return largeFiles.map((l) => l.id);
    if (activeTab === 'memes') return memes.map((m) => m.id);
    return [];
  }, [activeTab, screenshots, screenshotFilter, wallpapers, bills, blurryPhotos, largeFiles, memes]);

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

  // Drag-and-Select & Range Selection Hook
  const {
    isDragging: isDragSelecting,
    dragMode,
    handleItemPointerDown,
    handleItemPointerEnter,
    handleTouchMove,
    handleItemClick,
  } = useDragSelect({
    selectedIds,
    setSelectedIds,
    onInspect: (id) => {
      const allItems = [...screenshots, ...wallpapers, ...bills, ...blurryPhotos, ...largeFiles, ...memes];
      const found = allItems.find((i) => i.id === id);
      if (found) {
        setInspectingPhoto({
          id: found.id,
          filename: found.filename,
          category: 'category' in found ? (found.category as string) : 'memory',
          width: 'width' in found ? (found.width as number) : 1920,
          height: 'height' in found ? (found.height as number) : 1080,
          captured_at: found.captured_at,
          is_favorite: false,
          is_blurry: false,
          thumbnail_url: found.thumbnail_url,
          source_type: found.source_type,
          source_id: found.source_id,
        });
      }
    },
  });

  // Invert Selection for currently visible tab items
  const handleInvertSelection = () => {
    const currentSet = new Set(selectedIds);
    const inverted = currentTabItemIds.filter((id) => !currentSet.has(id));
    const nonTabSelected = selectedIds.filter((id) => !currentTabItemIds.includes(id));
    setSelectedIds([...nonTabSelected, ...inverted]);
  };

  // Select Next N items (e.g. 50)
  const handleSelectNextN = (count: number = 50) => {
    const currentSet = new Set(selectedIds);
    const unselected = currentTabItemIds.filter((id) => !currentSet.has(id));
    const toAdd = unselected.slice(0, count);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...toAdd])));
  };

  // 1-Click Move to Permanent Memories
  const handleMoveToMemories = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/move-to-memories`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
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
        headers: authHeaders({ 'Content-Type': 'application/json' }),
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
        headers: authHeaders({ 'Content-Type': 'application/json' }),
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

  // Safe manual batch delete (Supports Soft Trash & Permanent Cloud Delete)
  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    setShowBulkDeleteModal(true);
  };

  const executeBatchDelete = async (permanent: boolean) => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/batch-delete`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ media_ids: selectedIds, permanent }),
      });
      if (res.ok) {
        setStatusMessage(
          permanent
            ? `Permanently deleted ${selectedIds.length} items from MyMemoryPics and Google Drive.`
            : `Moved ${selectedIds.length} items to trash (safely restorable).`
        );
        setSelectedIds([]);
        refreshCurrentTab();
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (e) {
      console.error('Batch delete error:', e);
      setStatusMessage('Failed to delete selected items.');
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
      const res = await fetch(`${API_URL}/api/v1/triage/resolve-all-duplicates`, { 
        method: 'POST',
        headers: authHeaders()
      });
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
    else if (activeTab === 'wallpapers') fetchWallpapers();
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

  // Filtered screenshots by age and orientation
  const filteredScreenshots = useMemo(() => {
    let list = screenshots;
    if (screenshotFilter === 'expired') list = list.filter((s) => s.is_expired);
    else if (screenshotFilter === 'recent') list = list.filter((s) => !s.is_expired);

    if (screenshotOrientation === 'portrait') {
      list = list.filter((s) => s.is_portrait || (s.height && s.width && s.height >= s.width));
    } else if (screenshotOrientation === 'desktop') {
      list = list.filter((s) => s.is_landscape || (s.height && s.width && s.width > s.height));
    }
    return list;
  }, [screenshots, screenshotFilter, screenshotOrientation]);

  // Time-grouped collections for Week / Month / Year triage views
  const memeGroups = useMemo(() => {
    return groupItemsByTime(memes, timeGrouping);
  }, [memes, timeGrouping]);

  const screenshotGroups = useMemo(() => {
    return groupItemsByTime(filteredScreenshots, timeGrouping);
  }, [filteredScreenshots, timeGrouping]);

  const blurryGroups = useMemo(() => {
    return groupItemsByTime(blurryPhotos, timeGrouping);
  }, [blurryPhotos, timeGrouping]);

  const largeFileGroups = useMemo(() => {
    return groupItemsByTime(largeFiles, timeGrouping);
  }, [largeFiles, timeGrouping]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16" onTouchMove={handleTouchMove}>
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
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

        {/* Wallpapers & Artwork Tab */}
        <button
          onClick={() => setActiveTab('wallpapers')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === 'wallpapers'
              ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-700 ring-2 ring-indigo-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Layers className="w-4 h-4 text-indigo-500" />
            Wallpapers & Art
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {overview?.total_wallpapers !== undefined ? overview.total_wallpapers : wallpapers.length}
          </p>
          <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium truncate">4K/2K Widescreen</p>
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

        {/* Duplicates & Bursts Tab */}
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
            Duplicates & Bursts
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {duplicates.length}
          </p>
          <p className="text-[10px] text-purple-700 dark:text-purple-400 font-medium">AI Best Picked</p>
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
              className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
            >
              Deselect All
            </button>
            <button
              onClick={handleInvertSelection}
              className="text-xs text-slate-400 hover:text-white underline cursor-pointer hidden sm:inline"
              title="Invert selection on visible tab items"
            >
              Invert
            </button>
            {currentTabItemIds.length > selectedIds.length && (
              <button
                onClick={() => handleSelectNextN(50)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer hidden md:inline"
                title="Select next 50 unselected items in view"
              >
                + Next 50
              </button>
            )}
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

            {/* Change Category Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition border border-slate-700"
              >
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>Move to...</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {showCategoryMenu && (
                <div className="absolute right-0 bottom-full mb-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-slate-800 dark:text-white text-xs">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-100 dark:border-slate-700/60">
                    Reclassify {selectedIds.length} Selected
                  </div>
                  <button
                    onClick={() => handleChangeCategory('memory')}
                    className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5 transition"
                  >
                    <BookmarkCheck className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Personal Memory</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Regular photos & library items</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleChangeCategory('document_bill')}
                    className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5 transition"
                  >
                    <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Document / Receipt</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Bills, text slides, diagrams</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleChangeCategory('screenshot')}
                    className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5 transition"
                  >
                    <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Screenshot</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Mobile screen captures (30d expiry)</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleChangeCategory('meme_junk')}
                    className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5 transition"
                  >
                    <Smile className="w-4 h-4 text-pink-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Meme / Social Junk</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Social forwards & junk graphics</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

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

            {/* Google Photos Search Export */}
            <button
              onClick={() => setShowGooglePhotosModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition shadow-sm"
              title="Export Google Photos search query for selected items"
            >
              <Search className="w-3.5 h-3.5 text-blue-400" />
              <span>Google Photos Query ({selectedIds.length})</span>
            </button>

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

      {/* Active Line-Drag Selection Floating Pill */}
      {isDragSelecting && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-md px-5 py-2.5 rounded-full shadow-2xl border border-indigo-500/50 flex items-center gap-3 animate-pulse pointer-events-none">
          <div className={`w-2.5 h-2.5 rounded-full ${dragMode === 'select' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-bold tracking-wide">
            {dragMode === 'select' ? '✨ Dragging across photos to SELECT' : '🧹 Dragging across photos to DESELECT'}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {selectedIds.length} selected
          </span>
        </div>
      )}

      {/* Tab 1: Screenshots Review Tray */}
      {activeTab === 'screenshots' && (
        <div className="space-y-4">
          {/* False Positive Cleanup Banner */}
          <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-emerald-500/10 border border-blue-200 dark:border-blue-900 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Screenshots False Positives Cleanup
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Coursework diagrams, 16:9 wallpapers, and photos with detected human faces were previously misclassified as screenshots.
                </p>
              </div>
            </div>
            <button
              onClick={handleReclassifyScreenshots}
              disabled={isReclassifying}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs shrink-0 cursor-pointer"
            >
              <Zap className={`w-3.5 h-3.5 ${isReclassifying ? 'animate-spin' : ''}`} />
              <span>{isReclassifying ? 'Rescuing Photos...' : 'Auto-Rescue False Positives'}</span>
            </button>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All In View'}</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {filteredScreenshots.length} screenshots found
                {timeGrouping !== 'all' && screenshotGroups.length > 0 && (
                  <span className="text-blue-600 dark:text-blue-400 font-semibold ml-1">
                    ({screenshotGroups.length} {timeGrouping === 'week' ? 'weeks' : timeGrouping === 'year' ? 'years' : 'months'})
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Orientation Filter Chips */}
              <div className="flex items-center gap-1">
                {(['all', 'portrait', 'desktop'] as const).map((ori) => (
                  <button
                    key={ori}
                    onClick={() => setScreenshotOrientation(ori)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition capitalize cursor-pointer ${
                      screenshotOrientation === ori
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {ori === 'all' ? 'All' : ori === 'portrait' ? '📱 Mobile' : '💻 Desktop'}
                  </button>
                ))}
              </div>

              {/* Age Filter Chips */}
              <div className="flex items-center gap-1">
                {(['all', 'expired', 'recent'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setScreenshotFilter(filter)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition capitalize cursor-pointer ${
                      screenshotFilter === filter
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter === 'expired' ? '30+ Days Old' : 'Recent'}
                  </button>
                ))}
              </div>

              {/* Time Grouping Selector */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                <span className="px-2 py-1 text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Group:
                </span>
                {(['week', 'month', 'year', 'all'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTimeGrouping(mode)}
                    className={`px-2 py-1 rounded-lg font-semibold transition capitalize cursor-pointer ${
                      timeGrouping === mode
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'all' ? 'All (Flat)' : mode}
                  </button>
                ))}
              </div>

              {timeGrouping !== 'all' && screenshotGroups.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => collapseAllGroups(screenshotGroups.map((g) => g.key))}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
                    title="Collapse all sections"
                  >
                    Collapse All
                  </button>
                  <button
                    onClick={expandAllGroups}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
                    title="Expand all sections"
                  >
                    Expand All
                  </button>
                </div>
              )}
            </div>
          </div>

          {filteredScreenshots.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No screenshots match the filter criteria. Your library is clean!
            </div>
          ) : (
            <div className="space-y-4">
              {screenshotGroups.map((group) => {
                const isCollapsed = collapsedGroupKeys.has(group.key);
                const groupIds = group.items.map((s) => s.id);
                const isGroupAllSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
                const groupSelectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
                const limit = expandedGroupLimits[group.key] || 48;
                const visibleItems = timeGrouping === 'all' ? group.items : group.items.slice(0, limit);
                const hasMore = visibleItems.length < group.items.length;

                return (
                  <div
                    key={group.key}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs transition-all"
                  >
                    {/* Time Group Header */}
                    {timeGrouping !== 'all' && (
                      <div
                        onClick={() => toggleGroupCollapse(group.key)}
                        className="flex items-center justify-between p-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</span>
                          </div>
                          <span className="text-[11px] font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 rounded-full">
                            {group.items.length} {group.items.length === 1 ? 'screenshot' : 'screenshots'}
                          </span>
                          {group.totalBytes > 0 && (
                            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                              {(group.totalBytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleSelectGroup(groupIds)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs ${
                              isGroupAllSelected
                                ? 'bg-blue-600 text-white'
                                : groupSelectedCount > 0
                                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-800'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isGroupAllSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            <span>
                              {isGroupAllSelected
                                ? `Deselect ${timeGrouping === 'week' ? 'Week' : timeGrouping === 'year' ? 'Year' : 'Month'}`
                                : `Select ${timeGrouping === 'week' ? 'Week' : timeGrouping === 'year' ? 'Year' : 'Month'}`}{' '}
                              ({group.items.length})
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cards Grid */}
                    {!isCollapsed && (
                      <div className="p-3.5 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {visibleItems.map((s) => {
                            const isSelected = selectedIds.includes(s.id);
                            return (
                              <div
                                key={s.id}
                                data-media-id={s.id}
                                onPointerDown={(e) => handleItemPointerDown(s.id, e)}
                                onPointerEnter={() => handleItemPointerEnter(s.id)}
                                onClick={(e) => handleItemClick(s.id, e, currentTabItemIds)}
                                className={`group relative aspect-[9/16] bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm select-none ${
                                  isSelected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-transparent'
                                }`}
                              >
                                <img
                                  src={`${API_URL}${s.thumbnail_url}`}
                                  alt={s.filename}
                                  className="w-full h-full object-cover select-none pointer-events-none"
                                  loading="lazy"
                                  draggable={false}
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
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      handleItemPointerDown(s.id, e);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSelect(s.id, e);
                                    }}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
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
                                  <div className="flex items-center justify-between text-[9px] text-slate-300 font-mono mt-0.5">
                                    <span>{((s.file_size || 0) / 1024).toFixed(0)} KB</span>
                                    {s.width && s.height && <span>{s.width}×{s.height}</span>}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRescueSingle(s.id);
                                    }}
                                    className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shadow-xs transition pointer-events-auto"
                                    title="Not a screenshot: Move to Personal Memories"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Not a Screenshot</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Show More for Large Groups */}
                        {hasMore && (
                          <div className="pt-2 text-center flex items-center justify-center gap-2">
                            <button
                              onClick={() =>
                                setExpandedGroupLimits((prev) => ({
                                  ...prev,
                                  [group.key]: (prev[group.key] || 48) + 96,
                                }))
                              }
                              className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:border-blue-800 rounded-xl text-xs font-semibold transition cursor-pointer"
                            >
                              Show more in {group.label} ({group.items.length - visibleItems.length} remaining)
                            </button>
                            <button
                              onClick={() =>
                                setExpandedGroupLimits((prev) => ({
                                  ...prev,
                                  [group.key]: group.items.length,
                                }))
                              }
                              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
                            >
                              Show all ({group.items.length})
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Wallpapers & Artwork Tray */}
      {activeTab === 'wallpapers' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {wallpapers.length} widescreen wallpapers & artwork identified
              </span>
            </div>

            {/* Resolution Filter Chips */}
            <div className="flex items-center gap-1">
              {(['all', '4k', '2k', '1080p', 'ultrawide'] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => setWallpaperFilter(res)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition capitalize cursor-pointer ${
                    wallpaperFilter === res
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {res === 'all' ? 'All Resolutions' : res.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {loadingWallpapers ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              Loading widescreen wallpapers...
            </div>
          ) : wallpapers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No widescreen wallpapers or artwork match the selected resolution filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {wallpapers.map((w) => {
                const isSelected = selectedIds.includes(w.id);
                const is4K = w.width >= 3840;
                const is2K = w.width >= 2560 && w.width < 3840;
                const isUltrawide = (w.width / (w.height || 1)) >= 2.1;

                return (
                  <div
                    key={w.id}
                    data-media-id={w.id}
                    onPointerDown={(e) => handleItemPointerDown(w.id, e)}
                    onPointerEnter={() => handleItemPointerEnter(w.id)}
                    onClick={(e) => handleItemClick(w.id, e, currentTabItemIds)}
                    className={`group relative aspect-[16/9] bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm select-none ${
                      isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${w.thumbnail_url}`}
                      alt={w.filename}
                      className="w-full h-full object-cover select-none pointer-events-none"
                      loading="lazy"
                      draggable={false}
                    />

                    {/* Top Overlay Badge & Selection */}
                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md bg-black/60 text-white shadow-sm">
                        {isUltrawide ? 'Ultrawide' : is4K ? '4K UHD' : is2K ? '2K QHD' : `${w.width}×${w.height}`}
                      </span>
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleItemPointerDown(w.id, e);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(w.id, e);
                        }}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 border-white text-white shadow-md scale-110'
                            : 'bg-black/40 border-white/60 text-transparent hover:bg-black/60'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Bottom Vignette */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[11px] font-semibold truncate leading-tight">{w.filename}</p>
                      <div className="flex items-center justify-between text-[9px] text-slate-300 font-mono mt-0.5">
                        <span>{((w.file_size || 0) / 1024).toFixed(0)} KB</span>
                        <span>{w.width} × {w.height}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Bills & Receipts Vault */}
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
                    data-media-id={b.id}
                    onPointerDown={(e) => handleItemPointerDown(b.id, e)}
                    onPointerEnter={() => handleItemPointerEnter(b.id)}
                    onClick={(e) => {
                      if (selectedIds.length > 0 || e.shiftKey) {
                        handleItemClick(b.id, e, currentTabItemIds);
                      } else {
                        setInspectingBillId(b.id);
                      }
                    }}
                    className={`group relative aspect-[3/4] bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm flex flex-col justify-between select-none ${
                      isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${b.thumbnail_url}`}
                      alt={b.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 select-none pointer-events-none"
                      loading="lazy"
                      draggable={false}
                    />

                    {/* Top Checkbox & Receipt Badge */}
                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <span className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                        Receipt
                      </span>
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleItemPointerDown(b.id, e);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(b.id, e);
                        }}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
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
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {cluster.cluster_type === 'burst' ? '📸 Rapid Burst Sequence' : '👯 Duplicate Cluster'} #{idx + 1}
                        </span>
                        <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                          {cluster.count} shots
                        </span>
                        {cluster.duration_seconds !== undefined && cluster.duration_seconds > 0 && (
                          <span className="text-xs text-slate-400">
                            ({cluster.duration_seconds}s interval)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Cluster ID: {cluster.hash || cluster.id}
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
                        className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border transition-all hover:scale-[1.02] ${
                          item.is_best_shot
                            ? 'border-amber-400 dark:border-amber-500 shadow-md ring-1 ring-amber-400/40'
                            : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                        }`}
                      >
                        <img
                          src={`${API_URL}${item.thumbnail_url}`}
                          alt={item.filename}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                        {item.is_best_shot && (
                          <div className="absolute top-1.5 left-1.5 bg-amber-500 text-slate-950 text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-md flex items-center gap-0.5">
                            <Award className="w-2.5 h-2.5" />
                            <span>Best Shot</span>
                          </div>
                        )}
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
          {/* Bokeh Preservation Notice */}
          <div className="bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-slate-900/30 border border-purple-500/30 rounded-2xl p-3.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5 text-purple-200">
              <span className="text-base">✨</span>
              <div>
                <p className="font-semibold text-purple-300">Subject-Aware Bokeh & Portrait Protection</p>
                <p className="text-slate-400 text-[11px]">
                  Artistic shallow depth-of-field portraits are automatically distinguished from accidental blur and preserved safely in Memories.
                </p>
              </div>
            </div>
            {overview && (overview.total_bokeh ?? 0) > 0 && (
              <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2.5 py-1 rounded-full font-bold text-xs">
                {overview.total_bokeh} Portraits Preserved
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-amber-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>

              {/* Sub-Filters */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setBlurFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    blurFilter === 'all'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All ({blurryPhotos.length})
                </button>
                <button
                  onClick={() => setBlurFilter('motion_blur')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    blurFilter === 'motion_blur'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  💨 Motion Shake
                </button>
                <button
                  onClick={() => setBlurFilter('out_of_focus')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    blurFilter === 'out_of_focus'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  🔍 Out of Focus
                </button>
                <button
                  onClick={() => setBlurFilter('black_pocket')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    blurFilter === 'black_pocket'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  🌑 Dark / Pocket
                </button>
              </div>
            </div>

            {/* Quick 1-Click Action for accidental pocket shots */}
            {overview && (overview.total_pocket_shots ?? 0) > 0 && (
              <button
                onClick={handleCleanPocketShots}
                disabled={isCleaningPockets}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-semibold border border-rose-500/30 transition shadow-sm"
                title="1-Click Soft Delete of pitch-black pocket / lens-cap shots"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clean {overview.total_pocket_shots} Dark Pocket Shots</span>
              </button>
            )}
          </div>

          {blurryPhotos.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No photos found matching this quality filter! All images meet sharpness thresholds.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {blurryPhotos.map((b) => {
                const isSelected = selectedIds.includes(b.id);
                return (
                  <div
                    key={b.id}
                    data-media-id={b.id}
                    onPointerDown={(e) => handleItemPointerDown(b.id, e)}
                    onPointerEnter={() => handleItemPointerEnter(b.id)}
                    onClick={(e) => handleItemClick(b.id, e, currentTabItemIds)}
                    className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm select-none ${
                      isSelected ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${b.thumbnail_url}`}
                      alt={b.filename}
                      className="w-full h-full object-cover select-none pointer-events-none"
                      loading="lazy"
                      draggable={false}
                    />

                    {/* Sharpness Badge & Checkbox */}
                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <span className="bg-amber-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                        {b.blur_type === 'motion_blur'
                          ? '💨 Motion Shake'
                          : b.blur_type === 'black_pocket'
                          ? '🌑 Dark Shot'
                          : `Sharpness: ${b.blurriness_score ? b.blurriness_score.toFixed(0) : 'Low'}`}
                      </span>
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleItemPointerDown(b.id, e);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(b.id, e);
                        }}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
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
                    data-media-id={l.id}
                    onPointerDown={(e) => handleItemPointerDown(l.id, e)}
                    onPointerEnter={() => handleItemPointerEnter(l.id)}
                    onClick={(e) => handleItemClick(l.id, e, currentTabItemIds)}
                    className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm select-none ${
                      isSelected ? 'border-red-500 ring-2 ring-red-500/30' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${l.thumbnail_url}`}
                      alt={l.filename}
                      className="w-full h-full object-cover select-none pointer-events-none"
                      loading="lazy"
                      draggable={false}
                    />

                    {/* File Size Badge & Checkbox */}
                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <span className="bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                        {l.file_size_mb} MB
                      </span>
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleItemPointerDown(l.id, e);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(l.id, e);
                        }}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-pink-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {memes.length} memes & graphics detected
                {timeGrouping !== 'all' && memeGroups.length > 0 && (
                  <span className="text-pink-600 dark:text-pink-400 font-semibold ml-1">
                    ({memeGroups.length} {timeGrouping === 'week' ? 'weeks' : timeGrouping === 'year' ? 'years' : 'months'})
                  </span>
                )}
              </span>
            </div>

            {/* Time Grouping & Collapse Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                <span className="px-2 py-1 text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Group:
                </span>
                {(['week', 'month', 'year', 'all'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTimeGrouping(mode)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition capitalize cursor-pointer ${
                      timeGrouping === mode
                        ? 'bg-pink-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'all' ? 'All (Flat)' : mode}
                  </button>
                ))}
              </div>

              {timeGrouping !== 'all' && memeGroups.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => collapseAllGroups(memeGroups.map((g) => g.key))}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
                    title="Collapse all sections"
                  >
                    Collapse All
                  </button>
                  <button
                    onClick={expandAllGroups}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
                    title="Expand all sections"
                  >
                    Expand All
                  </button>
                </div>
              )}
            </div>
          </div>

          {memes.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No memes or junk graphics in your library.
            </div>
          ) : (
            <div className="space-y-4">
              {memeGroups.map((group) => {
                const isCollapsed = collapsedGroupKeys.has(group.key);
                const groupIds = group.items.map((m) => m.id);
                const isGroupAllSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
                const groupSelectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
                const limit = expandedGroupLimits[group.key] || 48;
                const visibleItems = timeGrouping === 'all' ? group.items : group.items.slice(0, limit);
                const hasMore = visibleItems.length < group.items.length;

                return (
                  <div
                    key={group.key}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs transition-all"
                  >
                    {/* Time Group Header */}
                    {timeGrouping !== 'all' && (
                      <div
                        onClick={() => toggleGroupCollapse(group.key)}
                        className="flex items-center justify-between p-3.5 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-pink-500" />
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</span>
                          </div>
                          <span className="text-[11px] font-semibold bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 px-2.5 py-0.5 rounded-full">
                            {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                          </span>
                          {group.totalBytes > 0 && (
                            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                              {(group.totalBytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleSelectGroup(groupIds)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs ${
                              isGroupAllSelected
                                ? 'bg-pink-600 text-white'
                                : groupSelectedCount > 0
                                ? 'bg-pink-100 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 border border-pink-300 dark:border-pink-800'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isGroupAllSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            <span>
                              {isGroupAllSelected
                                ? `Deselect ${timeGrouping === 'week' ? 'Week' : timeGrouping === 'year' ? 'Year' : 'Month'}`
                                : `Select ${timeGrouping === 'week' ? 'Week' : timeGrouping === 'year' ? 'Year' : 'Month'}`}{' '}
                              ({group.items.length})
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cards Grid */}
                    {!isCollapsed && (
                      <div className="p-3.5 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {visibleItems.map((m) => {
                            const isSelected = selectedIds.includes(m.id);
                            return (
                              <div
                                key={m.id}
                                data-media-id={m.id}
                                onPointerDown={(e) => handleItemPointerDown(m.id, e)}
                                onPointerEnter={() => handleItemPointerEnter(m.id)}
                                onClick={(e) => handleItemClick(m.id, e, currentTabItemIds)}
                                className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm select-none ${
                                  isSelected ? 'border-pink-500 ring-2 ring-pink-500/30' : 'border-transparent'
                                }`}
                              >
                                <img
                                  src={`${API_URL}${m.thumbnail_url}`}
                                  alt={m.filename}
                                  className="w-full h-full object-cover select-none pointer-events-none"
                                  loading="lazy"
                                  draggable={false}
                                />

                                <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                                  <span className="bg-pink-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                    Meme
                                  </span>
                                  <div
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      handleItemPointerDown(m.id, e);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSelect(m.id, e);
                                    }}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
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

                        {/* Show More for Large Groups */}
                        {hasMore && (
                          <div className="pt-2 text-center flex items-center justify-center gap-2">
                            <button
                              onClick={() =>
                                setExpandedGroupLimits((prev) => ({
                                  ...prev,
                                  [group.key]: (prev[group.key] || 48) + 96,
                                }))
                              }
                              className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-pink-50 dark:hover:bg-pink-950/40 text-pink-600 dark:text-pink-400 border border-slate-200 dark:border-slate-700 hover:border-pink-300 dark:border-pink-800 rounded-xl text-xs font-semibold transition cursor-pointer"
                            >
                              Show more in {group.label} ({group.items.length - visibleItems.length} remaining)
                            </button>
                            <button
                              onClick={() =>
                                setExpandedGroupLimits((prev) => ({
                                  ...prev,
                                  [group.key]: group.items.length,
                                }))
                              }
                              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
                            >
                              Show all ({group.items.length})
                            </button>
                          </div>
                        )}
                      </div>
                    )}
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

      {/* Safe vs Permanent Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        itemCount={selectedIds.length}
        filenames={getSelectedItemsData().map((i) => i.filename)}
        onOpenGooglePhotosHelper={() => setShowGooglePhotosModal(true)}
        itemType={
          activeTab === 'memes' ? 'memes & graphics' :
          activeTab === 'screenshots' ? 'screenshots' :
          activeTab === 'blurry' ? 'blurry photos' :
          activeTab === 'bills' ? 'receipts / bills' :
          activeTab === 'large_files' ? 'large files' : 'items'
        }
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={executeBatchDelete}
      />

      {/* Google Photos Deletion Search Helper Modal */}
      <GooglePhotosExportModal
        isOpen={showGooglePhotosModal}
        onClose={() => setShowGooglePhotosModal(false)}
        items={getSelectedItemsData()}
        title="Triage Google Photos Deletion Helper"
        subtitle="Search and trash selected clutter items in your Google Photos cloud account"
      />
    </div>
  );
}
