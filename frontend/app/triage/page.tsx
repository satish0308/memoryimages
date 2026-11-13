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
  Filter,
  Users
} from 'lucide-react';

import { DuplicateResolverModal, DuplicateCluster } from '@/components/triage/DuplicateResolverModal';
import { BillInspectorModal } from '@/components/triage/BillInspectorModal';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { BulkDeleteModal } from '@/components/timeline/BulkDeleteModal';
import { GooglePhotosExportModal } from '@/components/sync/GooglePhotosExportModal';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { useAuth } from '@/context/AuthContext';
import { useDragSelect } from '@/hooks/useDragSelect';
import { getApiUrl } from '@/utils/apiUrl';

interface TriageOverview {
  total_screenshots: number;
  expiring_screenshots: number;
  screenshots_with_people?: number;
  screenshots_text_only?: number;
  total_bills_receipts: number;
  total_blurry: number;
  blurry_with_people?: number;
  blurry_without_people?: number;
  total_pocket_shots?: number;
  total_motion_blur?: number;
  total_bokeh?: number;
  total_memes: number;
  memes_with_people?: number;
  memes_without_people?: number;
  total_wallpapers?: number;
  wallpapers_with_people?: number;
  wallpapers_without_people?: number;
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
  has_faces?: boolean;
  face_count?: number;
  has_text?: boolean;
  text_preview?: string | null;
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
  has_faces?: boolean;
  face_count?: number;
  has_text?: boolean;
  text_preview?: string | null;
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
  has_faces?: boolean;
  face_count?: number;
  has_text?: boolean;
  text_preview?: string | null;
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
  has_faces?: boolean;
  face_count?: number;
  has_text?: boolean;
  text_preview?: string | null;
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
  has_faces?: boolean;
  face_count?: number;
  has_text?: boolean;
  text_preview?: string | null;
}

interface MemeItem {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  thumbnail_url: string;
  source_type?: string;
  source_id?: string | null;
  has_faces?: boolean;
  face_count?: number;
  has_text?: boolean;
  text_preview?: string | null;
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
  const [billContentType, setBillContentType] = useState<'all' | 'without_people' | 'with_people'>('all');

  const [screenshotFilter, setScreenshotFilter] = useState<'all' | 'expired' | 'recent'>('all');
  const [screenshotOrientation, setScreenshotOrientation] = useState<'all' | 'portrait' | 'desktop'>('all');
  const [screenshotContentType, setScreenshotContentType] = useState<'all' | 'text_only' | 'with_people'>('all');
  const [screenshotGrouping, setScreenshotGrouping] = useState<'content' | 'week' | 'month' | 'year' | 'all'>('content');

  const [wallpaperFilter, setWallpaperFilter] = useState<'all' | '4k' | '2k' | '1080p' | 'ultrawide'>('all');
  const [wallpaperContentType, setWallpaperContentType] = useState<'all' | 'without_people' | 'with_people' | 'with_text'>('all');
  const [wallpaperGrouping, setWallpaperGrouping] = useState<'content' | 'resolution' | 'month' | 'year' | 'all'>('content');

  const [blurFilter, setBlurFilter] = useState<'all' | 'motion_blur' | 'out_of_focus' | 'black_pocket'>('all');
  const [blurryContentType, setBlurryContentType] = useState<'all' | 'without_people' | 'with_people'>('all');
  const [blurryGrouping, setBlurryGrouping] = useState<'content' | 'blur_type' | 'month' | 'year' | 'all'>('content');

  const [largeFileContentType, setLargeFileContentType] = useState<'all' | 'without_people' | 'with_people' | 'with_text'>('all');
  const [largeFileGrouping, setLargeFileGrouping] = useState<'content' | 'month' | 'year' | 'all'>('content');

  const [memeContentType, setMemeContentType] = useState<'all' | 'without_people' | 'with_people' | 'with_text'>('all');
  const [memeGrouping, setMemeGrouping] = useState<'content' | 'week' | 'month' | 'year' | 'all'>('content');

  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'without_people' | 'with_people'>('all');

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

  const API_URL = getApiUrl();
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
        setWallpapers((prev) => prev.filter((w) => w.id !== mediaId));
        setMemes((prev) => prev.filter((m) => m.id !== mediaId));
        setLargeFiles((prev) => prev.filter((l) => l.id !== mediaId));
        setBills((prev) => prev.filter((b) => b.id !== mediaId));
        setBlurryPhotos((prev) => prev.filter((b) => b.id !== mediaId));
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRescueGroup = async (mediaIds: number[]) => {
    if (mediaIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/category`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ media_ids: mediaIds, category: 'memory' }),
      });
      if (res.ok) {
        setStatusMessage(`Rescued ${mediaIds.length} personal photos with human faces to Personal Memories!`);
        const idSet = new Set(mediaIds);
        setScreenshots((prev) => prev.filter((s) => !idSet.has(s.id)));
        setWallpapers((prev) => prev.filter((w) => !idSet.has(w.id)));
        setMemes((prev) => prev.filter((m) => !idSet.has(m.id)));
        setLargeFiles((prev) => prev.filter((l) => !idSet.has(l.id)));
        setBills((prev) => prev.filter((b) => !idSet.has(b.id)));
        setBlurryPhotos((prev) => prev.filter((b) => !idSet.has(b.id)));
        fetchOverview();
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (e) {
      console.error('Error rescuing group:', e);
      setStatusMessage('Failed to rescue group.');
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

  const refreshCurrentTab = useCallback(() => {
    if (activeTab === 'screenshots') fetchScreenshots();
    else if (activeTab === 'wallpapers') fetchWallpapers();
    else if (activeTab === 'bills') fetchBills();
    else if (activeTab === 'duplicates') fetchDuplicates();
    else if (activeTab === 'blurry') fetchBlurry();
    else if (activeTab === 'large_files') fetchLargeFiles();
    else if (activeTab === 'memes') fetchMemes();
  }, [activeTab, fetchScreenshots, fetchWallpapers, fetchBills, fetchDuplicates, fetchBlurry, fetchLargeFiles, fetchMemes]);

  // Filtered bills by OCR search and People vs Document content type
  const filteredBills = useMemo(() => {
    let list = bills;
    if (billSearchQuery.trim()) {
      const q = billSearchQuery.toLowerCase();
      list = list.filter(
        (b) => b.filename.toLowerCase().includes(q) || (b.extracted_text && b.extracted_text.toLowerCase().includes(q))
      );
    }
    if (billContentType === 'with_people') {
      list = list.filter((b) => Boolean(b.has_faces));
    } else if (billContentType === 'without_people') {
      list = list.filter((b) => !b.has_faces);
    }
    return list;
  }, [bills, billSearchQuery, billContentType]);

  // Filtered screenshots by age, orientation, and content type (People vs Text)
  const filteredScreenshots = useMemo(() => {
    let list = screenshots;
    if (screenshotFilter === 'expired') list = list.filter((s) => s.is_expired);
    else if (screenshotFilter === 'recent') list = list.filter((s) => !s.is_expired);

    if (screenshotOrientation === 'portrait') {
      list = list.filter((s) => s.is_portrait || (s.height && s.width && s.height >= s.width));
    } else if (screenshotOrientation === 'desktop') {
      list = list.filter((s) => s.is_landscape || (s.height && s.width && s.width > s.height));
    }

    if (screenshotContentType === 'text_only') {
      list = list.filter((s) => !s.has_faces);
    } else if (screenshotContentType === 'with_people') {
      list = list.filter((s) => Boolean(s.has_faces));
    }
    return list;
  }, [screenshots, screenshotFilter, screenshotOrientation, screenshotContentType]);

  // Filtered wallpapers by content type (Artwork/Scenery vs People vs Text)
  const filteredWallpapers = useMemo(() => {
    let list = wallpapers;
    if (wallpaperContentType === 'with_people') {
      list = list.filter((w) => Boolean(w.has_faces));
    } else if (wallpaperContentType === 'without_people') {
      list = list.filter((w) => !w.has_faces);
    } else if (wallpaperContentType === 'with_text') {
      list = list.filter((w) => Boolean(w.has_text));
    }
    return list;
  }, [wallpapers, wallpaperContentType]);

  // Filtered blurry photos by content type (People vs Scenery/Objects)
  const filteredBlurry = useMemo(() => {
    let list = blurryPhotos;
    if (blurryContentType === 'with_people') {
      list = list.filter((b) => Boolean(b.has_faces));
    } else if (blurryContentType === 'without_people') {
      list = list.filter((b) => !b.has_faces);
    }
    return list;
  }, [blurryPhotos, blurryContentType]);

  // Filtered large files by content type (People vs Non-People vs Text)
  const filteredLargeFiles = useMemo(() => {
    let list = largeFiles;
    if (largeFileContentType === 'with_people') {
      list = list.filter((l) => Boolean(l.has_faces));
    } else if (largeFileContentType === 'without_people') {
      list = list.filter((l) => !l.has_faces);
    } else if (largeFileContentType === 'with_text') {
      list = list.filter((l) => Boolean(l.has_text));
    }
    return list;
  }, [largeFiles, largeFileContentType]);

  // Filtered memes by content type (Graphics/Text vs People)
  const filteredMemes = useMemo(() => {
    let list = memes;
    if (memeContentType === 'with_people') {
      list = list.filter((m) => Boolean(m.has_faces));
    } else if (memeContentType === 'without_people') {
      list = list.filter((m) => !m.has_faces);
    } else if (memeContentType === 'with_text') {
      list = list.filter((m) => Boolean(m.has_text));
    }
    return list;
  }, [memes, memeContentType]);

  // Filtered duplicate clusters (People vs Non-People)
  const filteredDuplicates = useMemo(() => {
    if (duplicateFilter === 'all') return duplicates;
    if (duplicateFilter === 'with_people') {
      return duplicates.filter((c) => c.has_people || c.items.some((i) => i.has_faces));
    }
    return duplicates.filter((c) => !c.has_people && !c.items.some((i) => i.has_faces));
  }, [duplicates, duplicateFilter]);

  // Current items for active tab selection
  const currentTabItemIds = useMemo(() => {
    if (activeTab === 'screenshots') return filteredScreenshots.map((s) => s.id);
    if (activeTab === 'wallpapers') return filteredWallpapers.map((w) => w.id);
    if (activeTab === 'bills') return filteredBills.map((b) => b.id);
    if (activeTab === 'blurry') return filteredBlurry.map((b) => b.id);
    if (activeTab === 'large_files') return filteredLargeFiles.map((l) => l.id);
    if (activeTab === 'memes') return filteredMemes.map((m) => m.id);
    if (activeTab === 'duplicates') return filteredDuplicates.flatMap((d) => d.items.map((i) => i.id));
    return [];
  }, [activeTab, filteredScreenshots, filteredWallpapers, filteredBills, filteredBlurry, filteredLargeFiles, filteredMemes, filteredDuplicates]);

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

  // Drag-and-Select & Range Selection Hook (with 2D Row/Column Marquee & Double-Click Big View)
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
    orderedIds: currentTabItemIds,
    onOpenLightbox: (id) => {
      const allItems = [
        ...screenshots,
        ...wallpapers,
        ...bills,
        ...blurryPhotos,
        ...largeFiles,
        ...memes,
        ...duplicates.flatMap((d) => d.items),
      ];
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
          source_type: 'source_type' in found ? (found.source_type as any) : 'local',
          source_id: 'source_id' in found ? (found.source_id as any) : undefined,
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

  // Grouped collections for Wallpaper triage views
  const wallpaperGroups = useMemo(() => {
    if (wallpaperGrouping === 'content') {
      const withPeople = filteredWallpapers.filter((w) => w.has_faces);
      const withoutPeople = filteredWallpapers.filter((w) => !w.has_faces);
      const groups: TriageTimeGroup<WallpaperItem>[] = [];

      if (withPeople.length > 0) {
        groups.push({
          key: 'with_people',
          label: '👥 Wallpapers & Artwork With Detected Human Faces',
          items: withPeople,
          totalBytes: withPeople.reduce((acc, w) => acc + (w.file_size || 0), 0),
        });
      }

      if (withoutPeople.length > 0) {
        groups.push({
          key: 'without_people',
          label: '🎨 Digital Artwork, Landscapes & Scenery (No People)',
          items: withoutPeople,
          totalBytes: withoutPeople.reduce((acc, w) => acc + (w.file_size || 0), 0),
        });
      }

      return groups;
    }

    if (wallpaperGrouping === 'resolution') {
      const map = new Map<string, WallpaperItem[]>();
      map.set('4K UHD (≥3840w)', []);
      map.set('2K QHD (2560–3839w)', []);
      map.set('1080p FHD (1920w)', []);
      map.set('Ultrawide (≥2.1:1)', []);
      map.set('Other High-Res', []);

      for (const w of filteredWallpapers) {
        const ratio = w.width / (w.height || 1);
        if (ratio >= 2.1) map.get('Ultrawide (≥2.1:1)')!.push(w);
        else if (w.width >= 3840) map.get('4K UHD (≥3840w)')!.push(w);
        else if (w.width >= 2560) map.get('2K QHD (2560–3839w)')!.push(w);
        else if (w.width === 1920) map.get('1080p FHD (1920w)')!.push(w);
        else map.get('Other High-Res')!.push(w);
      }

      const resGroups: TriageTimeGroup<WallpaperItem>[] = [];
      map.forEach((items, label) => {
        if (items.length > 0) {
          resGroups.push({
            key: label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            label,
            items,
            totalBytes: items.reduce((acc, w) => acc + (w.file_size || 0), 0),
          });
        }
      });
      return resGroups;
    }

    return groupItemsByTime(filteredWallpapers, wallpaperGrouping as TimeGrouping);
  }, [filteredWallpapers, wallpaperGrouping]);

  // Grouped collections for Meme triage views
  const memeGroups = useMemo(() => {
    if (memeGrouping === 'content') {
      const withPeople = filteredMemes.filter((m) => m.has_faces);
      const withoutPeople = filteredMemes.filter((m) => !m.has_faces);
      const groups: TriageTimeGroup<MemeItem>[] = [];

      if (withPeople.length > 0) {
        groups.push({
          key: 'with_people',
          label: '👥 Memes & Reaction Faces (With Detected People)',
          items: withPeople,
          totalBytes: withPeople.reduce((acc, m) => acc + (m.file_size || 0), 0),
        });
      }

      if (withoutPeople.length > 0) {
        groups.push({
          key: 'without_people',
          label: '📄 Graphic Memes, Quotes & Junk (No People)',
          items: withoutPeople,
          totalBytes: withoutPeople.reduce((acc, m) => acc + (m.file_size || 0), 0),
        });
      }

      return groups;
    }

    return groupItemsByTime(filteredMemes, memeGrouping as TimeGrouping);
  }, [filteredMemes, memeGrouping]);

  // Grouped collections for Screenshot triage views
  const screenshotGroups = useMemo(() => {
    if (screenshotGrouping === 'content') {
      const textOnly = filteredScreenshots.filter((s) => !s.has_faces);
      const withPeople = filteredScreenshots.filter((s) => s.has_faces);
      const groups: TriageTimeGroup<ScreenshotItem>[] = [];

      if (textOnly.length > 0) {
        groups.push({
          key: 'text_only',
          label: '📄 Text, Documents & App UI (No Human Faces)',
          items: textOnly,
          totalBytes: textOnly.reduce((acc, s) => acc + (s.file_size || 0), 0),
        });
      }

      if (withPeople.length > 0) {
        groups.push({
          key: 'with_people',
          label: '👥 Memories & Social Media (With Detected Human Faces)',
          items: withPeople,
          totalBytes: withPeople.reduce((acc, s) => acc + (s.file_size || 0), 0),
        });
      }

      return groups;
    }

    return groupItemsByTime(filteredScreenshots, screenshotGrouping as TimeGrouping);
  }, [filteredScreenshots, screenshotGrouping]);

  // Grouped collections for Blurry triage views
  const blurryGroups = useMemo(() => {
    if (blurryGrouping === 'content') {
      const withPeople = filteredBlurry.filter((b) => b.has_faces);
      const withoutPeople = filteredBlurry.filter((b) => !b.has_faces);
      const groups: TriageTimeGroup<BlurryItem>[] = [];

      if (withPeople.length > 0) {
        groups.push({
          key: 'with_people',
          label: '👥 Blurry Photos of People (Important: Review Before Deleting!)',
          items: withPeople,
          totalBytes: withPeople.reduce((acc, b) => acc + (b.file_size || 0), 0),
        });
      }

      if (withoutPeople.length > 0) {
        groups.push({
          key: 'without_people',
          label: '📷 Blurry Objects, Documents & Scenery',
          items: withoutPeople,
          totalBytes: withoutPeople.reduce((acc, b) => acc + (b.file_size || 0), 0),
        });
      }

      return groups;
    }

    if (blurryGrouping === 'blur_type') {
      const map = new Map<string, BlurryItem[]>();
      map.set('💨 Motion Shake', []);
      map.set('🔍 Out of Focus', []);
      map.set('🌑 Dark / Pocket', []);
      map.set('Other Blurry', []);

      for (const b of filteredBlurry) {
        if (b.blur_type === 'motion_blur') map.get('💨 Motion Shake')!.push(b);
        else if (b.blur_type === 'black_pocket') map.get('🌑 Dark / Pocket')!.push(b);
        else if (b.blur_type === 'out_of_focus') map.get('🔍 Out of Focus')!.push(b);
        else map.get('Other Blurry')!.push(b);
      }

      const groups: TriageTimeGroup<BlurryItem>[] = [];
      map.forEach((items, label) => {
        if (items.length > 0) {
          groups.push({
            key: label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            label,
            items,
            totalBytes: items.reduce((acc, b) => acc + (b.file_size || 0), 0),
          });
        }
      });
      return groups;
    }

    return groupItemsByTime(filteredBlurry, blurryGrouping as TimeGrouping);
  }, [filteredBlurry, blurryGrouping]);

  // Grouped collections for Large Files triage views
  const largeFileGroups = useMemo(() => {
    if (largeFileGrouping === 'content') {
      const withPeople = filteredLargeFiles.filter((l) => l.has_faces);
      const withoutPeople = filteredLargeFiles.filter((l) => !l.has_faces);
      const groups: TriageTimeGroup<LargeFileItem>[] = [];

      if (withPeople.length > 0) {
        groups.push({
          key: 'with_people',
          label: '👥 Large Photos of People (High-Resolution Memories)',
          items: withPeople,
          totalBytes: withPeople.reduce((acc, l) => acc + (l.file_size || 0), 0),
        });
      }

      if (withoutPeople.length > 0) {
        groups.push({
          key: 'without_people',
          label: '📁 Large Artwork, Scenery & Storage Hogs (>3MB)',
          items: withoutPeople,
          totalBytes: withoutPeople.reduce((acc, l) => acc + (l.file_size || 0), 0),
        });
      }

      return groups;
    }

    return groupItemsByTime(filteredLargeFiles, largeFileGrouping as TimeGrouping);
  }, [filteredLargeFiles, largeFileGrouping]);

  return (
    <div className="w-full max-w-[2560px] mx-auto px-4 sm:px-6 md:px-8 space-y-6 pb-16" onPointerDown={(e) => handlePointerDown(e)}>
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
          <div className="flex items-center gap-1.5 text-[10px] mt-1 truncate">
            <span className="text-slate-500 font-medium">📄 {overview?.screenshots_text_only ?? screenshots.filter(s => !s.has_faces).length}</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold">👥 {overview?.screenshots_with_people ?? screenshots.filter(s => s.has_faces).length}</span>
          </div>
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
          <div className="flex items-center gap-1.5 text-[10px] mt-1 truncate">
            <span className="text-slate-500 font-medium">🎨 {overview?.wallpapers_without_people ?? wallpapers.filter(w => !w.has_faces).length}</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold">👥 {overview?.wallpapers_with_people ?? wallpapers.filter(w => w.has_faces).length}</span>
          </div>
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
          <div className="flex items-center gap-1.5 text-[10px] mt-1 truncate">
            <span className="text-slate-500 font-medium">📄 {bills.filter(b => !b.has_faces).length}</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold">👥 {bills.filter(b => b.has_faces).length}</span>
          </div>
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
          <div className="flex items-center gap-1.5 text-[10px] mt-1 truncate">
            <span className="text-slate-500 font-medium">🖼️ {duplicates.filter(c => !c.has_people && !c.items.some(i => i.has_faces)).length}</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold">👥 {duplicates.filter(c => c.has_people || c.items.some(i => i.has_faces)).length}</span>
          </div>
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
          <div className="flex items-center gap-1.5 text-[10px] mt-1 truncate">
            <span className="text-slate-500 font-medium">📷 {overview?.blurry_without_people ?? blurryPhotos.filter(b => !b.has_faces).length}</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold">👥 {overview?.blurry_with_people ?? blurryPhotos.filter(b => b.has_faces).length}</span>
          </div>
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
          <div className="flex items-center gap-1.5 text-[10px] mt-1 truncate">
            <span className="text-slate-500 font-medium">📁 {largeFiles.filter(l => !l.has_faces).length}</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold">👥 {largeFiles.filter(l => l.has_faces).length}</span>
          </div>
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
          <div className="flex items-center gap-1.5 text-[10px] mt-1 truncate">
            <span className="text-slate-500 font-medium">📄 {overview?.memes_without_people ?? memes.filter(m => !m.has_faces).length}</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold">👥 {overview?.memes_with_people ?? memes.filter(m => m.has_faces).length}</span>
          </div>
        </button>
      </div>

      {/* Selection Control & Batch Action Floating Bar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-4 z-30 max-w-5xl mx-auto bg-slate-900/95 backdrop-blur-md text-white rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xl border border-slate-700/80 animate-fade-in">
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
          className={`border-2 rounded-lg pointer-events-none z-50 shadow-lg ${
            dragMode === 'select'
              ? 'border-indigo-500 bg-indigo-500/20'
              : 'border-rose-500 bg-rose-500/20'
          }`}
        />
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
              {/* Content Type Filter: All vs Text-Only vs People */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                {(['all', 'text_only', 'with_people'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setScreenshotContentType(type)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      screenshotContentType === type
                        ? type === 'with_people'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : type === 'text_only'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'all'
                      ? `All (${screenshots.length})`
                      : type === 'text_only'
                      ? `📄 Text & UI (${screenshots.filter((s) => !s.has_faces).length})`
                      : `👥 People (${screenshots.filter((s) => s.has_faces).length})`}
                  </button>
                ))}
              </div>

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

              {/* Grouping Selector */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                <span className="px-2 py-1 text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-slate-400" />
                  Group:
                </span>
                {(['content', 'week', 'month', 'year', 'all'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setScreenshotGrouping(mode)}
                    className={`px-2 py-1 rounded-lg font-semibold transition capitalize cursor-pointer ${
                      screenshotGrouping === mode
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'content' ? '👥 People vs Text' : mode === 'all' ? 'All (Flat)' : mode}
                  </button>
                ))}
              </div>

              {screenshotGrouping !== 'all' && screenshotGroups.length > 0 && (
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
                const visibleItems = screenshotGrouping === 'all' ? group.items : group.items.slice(0, limit);
                const hasMore = visibleItems.length < group.items.length;

                return (
                  <div
                    key={group.key}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs transition-all"
                  >
                    {/* Time or Content Group Header */}
                    {screenshotGrouping !== 'all' && (
                      <div
                        onClick={() => toggleGroupCollapse(group.key)}
                        className={`flex items-center justify-between p-3.5 border-b cursor-pointer transition ${
                          group.key === 'with_people'
                            ? 'bg-purple-50/80 dark:bg-purple-950/30 border-purple-200/60 dark:border-purple-900/40 hover:bg-purple-100/70'
                            : group.key === 'text_only'
                            ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-900/40 hover:bg-amber-100/60'
                            : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                          <div className="flex items-center gap-2">
                            {group.key === 'with_people' ? (
                              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            ) : group.key === 'text_only' ? (
                              <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <Calendar className="w-4 h-4 text-blue-500" />
                            )}
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</span>
                          </div>
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            group.key === 'with_people'
                              ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                              : group.key === 'text_only'
                              ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                              : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                          }`}>
                            {group.items.length} {group.items.length === 1 ? 'screenshot' : 'screenshots'}
                          </span>
                          {group.totalBytes > 0 && (
                            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                              {(group.totalBytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* Quick Rescue Button for People screenshots group */}
                          {group.key === 'with_people' && (
                            <button
                              onClick={() => handleRescueGroup(groupIds)}
                              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                              title="Rescue all personal memories with people in this group to Personal Memories"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Rescue All People ({group.items.length})</span>
                            </button>
                          )}

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
                              {isGroupAllSelected ? 'Deselect Group' : 'Select Group'} ({group.items.length})
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
                                onPointerDown={(e) => handlePointerDown(e, s.id)}
                                onClick={(e) => handleItemClick(s.id, e, currentTabItemIds)}
                                onDoubleClick={(e) => handleItemDoubleClick(s.id, e)}
                                title="Click to select/deselect • Double-click to view full image"
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
                                  <div className="flex items-center gap-1">
                                    <span
                                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md shadow-sm ${
                                        s.is_expired ? 'bg-amber-600 text-white' : 'bg-black/60 text-white'
                                      }`}
                                    >
                                      {s.is_expired ? '30+ days' : 'Recent'}
                                    </span>
                                    {s.has_faces ? (
                                      <span
                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md shadow-sm bg-purple-600/95 text-white flex items-center gap-0.5"
                                        title={`${s.face_count || 1} detected human face${(s.face_count || 1) > 1 ? 's' : ''}`}
                                      >
                                        <Users className="w-2.5 h-2.5" />
                                        <span>{s.face_count} {s.face_count === 1 ? 'Person' : 'People'}</span>
                                      </span>
                                    ) : (
                                      <span
                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md shadow-sm bg-slate-700/80 text-slate-200 flex items-center gap-0.5"
                                        title="No human faces detected - pure text / app UI"
                                      >
                                        <FileText className="w-2.5 h-2.5" />
                                        <span>Text/UI</span>
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    data-selection-checkbox="true"
                                    onPointerDown={(e) => e.stopPropagation()}
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
                                  </button>
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
                <span>{isAllSelected ? 'Deselect All' : 'Select All In View'}</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {filteredWallpapers.length} widescreen wallpapers & artwork identified
                {wallpaperGrouping !== 'all' && wallpaperGroups.length > 0 && (
                  <span className="text-indigo-600 dark:text-indigo-400 font-semibold ml-1">
                    ({wallpaperGroups.length} {wallpaperGrouping === 'resolution' ? 'resolutions' : wallpaperGrouping === 'content' ? 'sections' : wallpaperGrouping === 'month' ? 'months' : 'years'})
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Content Type Filter: All vs Artwork & Scenery vs With People vs Text */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                {(['all', 'without_people', 'with_people', 'with_text'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setWallpaperContentType(type)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      wallpaperContentType === type
                        ? type === 'with_people'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : type === 'with_text'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'all'
                      ? `All (${wallpapers.length})`
                      : type === 'without_people'
                      ? `🎨 Art & Scenery (${wallpapers.filter((w) => !w.has_faces).length})`
                      : type === 'with_people'
                      ? `👥 People (${wallpapers.filter((w) => w.has_faces).length})`
                      : `📄 Text (${wallpapers.filter((w) => w.has_text).length})`}
                  </button>
                ))}
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

              {/* Grouping Selector */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                <span className="px-2 py-1 text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-slate-400" />
                  Group:
                </span>
                {(['content', 'resolution', 'month', 'year', 'all'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setWallpaperGrouping(mode)}
                    className={`px-2 py-1 rounded-lg font-semibold transition capitalize cursor-pointer ${
                      wallpaperGrouping === mode
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'content' ? '👥 People vs Art' : mode === 'resolution' ? '📐 Resolution' : mode === 'all' ? 'All (Flat)' : mode}
                  </button>
                ))}
              </div>

              {wallpaperGrouping !== 'all' && wallpaperGroups.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => collapseAllGroups(wallpaperGroups.map((g) => g.key))}
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

          {loadingWallpapers ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              Loading widescreen wallpapers...
            </div>
          ) : filteredWallpapers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No widescreen wallpapers or artwork match the selected filter criteria.
            </div>
          ) : (
            <div className="space-y-4">
              {wallpaperGroups.map((group) => {
                const isCollapsed = collapsedGroupKeys.has(group.key);
                const groupIds = group.items.map((w) => w.id);
                const isGroupAllSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
                const groupSelectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
                const limit = expandedGroupLimits[group.key] || 48;
                const visibleItems = wallpaperGrouping === 'all' ? group.items : group.items.slice(0, limit);
                const hasMore = visibleItems.length < group.items.length;

                return (
                  <div
                    key={group.key}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs transition-all"
                  >
                    {/* Header */}
                    {wallpaperGrouping !== 'all' && (
                      <div
                        onClick={() => toggleGroupCollapse(group.key)}
                        className={`flex items-center justify-between p-3.5 border-b cursor-pointer transition ${
                          group.key === 'with_people'
                            ? 'bg-purple-50/80 dark:bg-purple-950/30 border-purple-200/60 dark:border-purple-900/40 hover:bg-purple-100/70'
                            : 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200/60 dark:border-indigo-900/40 hover:bg-indigo-100/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                          <div className="flex items-center gap-2">
                            {group.key === 'with_people' ? (
                              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <Layers className="w-4 h-4 text-indigo-500" />
                            )}
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</span>
                          </div>
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            group.key === 'with_people'
                              ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                              : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          }`}>
                            {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                          </span>
                          {group.totalBytes > 0 && (
                            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                              {(group.totalBytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* Quick Rescue Button for People wallpapers group */}
                          {group.key === 'with_people' && (
                            <button
                              onClick={() => handleRescueGroup(groupIds)}
                              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                              title="Rescue all personal memories with people in this group to Personal Memories"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Rescue All People ({group.items.length})</span>
                            </button>
                          )}

                          <button
                            onClick={() => toggleSelectGroup(groupIds)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs ${
                              isGroupAllSelected
                                ? 'bg-indigo-600 text-white'
                                : groupSelectedCount > 0
                                ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isGroupAllSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            <span>
                              {isGroupAllSelected ? 'Deselect Group' : 'Select Group'} ({group.items.length})
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cards Grid */}
                    {!isCollapsed && (
                      <div className="p-3.5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {visibleItems.map((w) => {
                            const isSelected = selectedIds.includes(w.id);
                            const is4K = w.width >= 3840;
                            const is2K = w.width >= 2560 && w.width < 3840;
                            const isUltrawide = (w.width / (w.height || 1)) >= 2.1;

                            return (
                              <div
                                key={w.id}
                                data-media-id={w.id}
                                onPointerDown={(e) => handlePointerDown(e, w.id)}
                                onClick={(e) => handleItemClick(w.id, e, currentTabItemIds)}
                                onDoubleClick={(e) => handleItemDoubleClick(w.id, e)}
                                title="Click to select/deselect • Double-click to view full image"
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

                                {/* Top Badges & Checkbox */}
                                <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md bg-black/60 text-white shadow-sm">
                                      {isUltrawide ? 'Ultrawide' : is4K ? '4K UHD' : is2K ? '2K QHD' : `${w.width}×${w.height}`}
                                    </span>
                                    {w.has_faces && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md bg-purple-600/90 text-white shadow-sm flex items-center gap-1">
                                        <Users className="w-2.5 h-2.5" />
                                        <span>{w.face_count && w.face_count > 1 ? `${w.face_count} Faces` : 'People'}</span>
                                      </span>
                                    )}
                                    {w.has_text && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md bg-amber-600/90 text-white shadow-sm flex items-center gap-1">
                                        <FileText className="w-2.5 h-2.5" />
                                        <span>Text</span>
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    data-selection-checkbox="true"
                                    onPointerDown={(e) => e.stopPropagation()}
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
                                  </button>
                                </div>

                                {/* Bottom Vignette */}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                  <p className="text-[11px] font-semibold truncate leading-tight">{w.filename}</p>
                                  <div className="flex items-center justify-between text-[9px] text-slate-300 font-mono mt-0.5">
                                    <span>{((w.file_size || 0) / 1024).toFixed(0)} KB</span>
                                    <span>{w.width} × {w.height}</span>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRescueSingle(w.id);
                                    }}
                                    className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shadow-xs transition pointer-events-auto"
                                    title="Not artwork: Move to Personal Memories"
                                  >
                                    <BookmarkCheck className="w-3 h-3" />
                                    <span>{w.has_faces ? 'Rescue to Memories' : 'Keep as Memory'}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Show More */}
                        {hasMore && (
                          <div className="pt-2 text-center flex items-center justify-center gap-2">
                            <button
                              onClick={() =>
                                setExpandedGroupLimits((prev) => ({
                                  ...prev,
                                  [group.key]: (prev[group.key] || 48) + 96,
                                }))
                              }
                              className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:border-indigo-800 rounded-xl text-xs font-semibold transition cursor-pointer"
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

      {/* Tab 3: Bills & Receipts Vault */}
      {activeTab === 'bills' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All In View'}</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {filteredBills.length} documents identified
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Content Type Filter: All vs Receipts/Docs vs With People */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                {(['all', 'without_people', 'with_people'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setBillContentType(type)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      billContentType === type
                        ? type === 'with_people'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'all'
                      ? `All (${bills.length})`
                      : type === 'without_people'
                      ? `📄 Documents (${bills.filter((b) => !b.has_faces).length})`
                      : `👥 With People (${bills.filter((b) => b.has_faces).length})`}
                  </button>
                ))}
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
          </div>

          {filteredBills.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No bills or receipts matched your filter or search query.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredBills.map((b) => {
                const isSelected = selectedIds.includes(b.id);
                return (
                  <div
                    key={b.id}
                    data-media-id={b.id}
                    onPointerDown={(e) => handlePointerDown(e, b.id)}
                    onClick={(e) => handleItemClick(b.id, e, currentTabItemIds)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setInspectingBillId(b.id);
                    }}
                    title="Click to select/deselect • Double-click to inspect OCR"
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

                    {/* Top Checkbox & Badges */}
                    <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                      <div className="flex items-center gap-1">
                        <span className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                          Receipt
                        </span>
                        {b.has_faces && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md bg-purple-600/90 text-white shadow-sm flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" />
                            <span>{b.face_count && b.face_count > 1 ? `${b.face_count}` : 'People'}</span>
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        data-selection-checkbox="true"
                        onPointerDown={(e) => e.stopPropagation()}
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
                      </button>
                    </div>

                    {/* Bottom Metadata & OCR Inspect link */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 text-white">
                      <p className="font-semibold text-xs truncate leading-tight">{b.filename}</p>
                      <p className="text-[10px] text-slate-300 mt-0.5">
                        {new Date(b.captured_at).toLocaleDateString()}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1 text-emerald-300 font-semibold group-hover:underline">
                          <span>Inspect OCR</span>
                          <ArrowRight className="w-3 h-3" />
                        </div>
                        {b.has_faces && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRescueSingle(b.id);
                            }}
                            className="px-1.5 py-0.5 bg-purple-600/90 hover:bg-purple-500 text-white rounded text-[9px] font-bold transition"
                            title="Move to Personal Memories"
                          >
                            Rescue
                          </button>
                        )}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Duplicate & Burst Clusters ({filteredDuplicates.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Exact or near-identical photos grouped by perceptual hash (pHash).
                </p>
              </div>

              {/* People vs Non-People Filter Chips for Duplicates */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                {(['all', 'without_people', 'with_people'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setDuplicateFilter(type)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      duplicateFilter === type
                        ? type === 'with_people'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'all'
                      ? `All Clusters (${duplicates.length})`
                      : type === 'without_people'
                      ? `🖼️ Non-People (${duplicates.filter((c) => !c.has_people && !c.items.some((i) => i.has_faces)).length})`
                      : `👥 With People (${duplicates.filter((c) => c.has_people || c.items.some((i) => i.has_faces)).length})`}
                  </button>
                ))}
              </div>
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

          {filteredDuplicates.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No duplicate clusters match your filter criteria!
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDuplicates.map((cluster, idx) => {
                const clusterHasPeople = cluster.has_people || cluster.items.some((i) => i.has_faces);
                return (
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
                        {clusterHasPeople && (
                          <span className="text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>With People</span>
                          </span>
                        )}
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
                    {cluster.items.map((item) => {
                      const isSelected = selectedIds.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          data-media-id={item.id}
                          onPointerDown={(e) => handlePointerDown(e, item.id)}
                          onClick={(e) => handleItemClick(item.id, e, currentTabItemIds)}
                          onDoubleClick={(e) => handleItemDoubleClick(item.id, e)}
                          title="Click to select/deselect • Double-click to view full image • Click & drag to multi-select"
                          className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm select-none ${
                            isSelected
                              ? 'border-indigo-600 ring-2 ring-indigo-500/40'
                              : item.is_best_shot
                              ? 'border-amber-400 dark:border-amber-500 shadow-md ring-1 ring-amber-400/40'
                              : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                          }`}
                        >
                          <img
                            src={`${API_URL}${item.thumbnail_url}`}
                            alt={item.filename}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform select-none pointer-events-none"
                            loading="lazy"
                            draggable={false}
                          />

                          {/* Multi-Select Checkbox */}
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

                          {item.has_faces && (
                            <div className="absolute top-2 left-9 bg-purple-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-md flex items-center gap-0.5 z-10">
                              <Users className="w-2.5 h-2.5" />
                              <span>People</span>
                            </div>
                          )}

                          {item.is_best_shot && (
                            <div className="absolute top-1.5 right-1.5 bg-amber-500 text-slate-950 text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-md flex items-center gap-0.5 z-10">
                              <Award className="w-2.5 h-2.5" />
                              <span>Best Shot</span>
                            </div>
                          )}
                          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-md font-mono pointer-events-none">
                            {((item.file_size || 0) / (1024 * 1024)).toFixed(1)}MB
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-amber-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All In View'}</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {filteredBlurry.length} photos flagged
                {blurryGrouping !== 'all' && blurryGroups.length > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1">
                    ({blurryGroups.length} sections)
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Content Type Filter: All vs People vs Scenery/Objects */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                {(['all', 'without_people', 'with_people'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setBlurryContentType(type)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      blurryContentType === type
                        ? type === 'with_people'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'all'
                      ? `All (${blurryPhotos.length})`
                      : type === 'without_people'
                      ? `📷 Objects/Scenery (${blurryPhotos.filter((b) => !b.has_faces).length})`
                      : `👥 With People (${blurryPhotos.filter((b) => b.has_faces).length})`}
                  </button>
                ))}
              </div>

              {/* Quality Sub-Filters */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
                <button
                  onClick={() => setBlurFilter('all')}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    blurFilter === 'all'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All Types
                </button>
                <button
                  onClick={() => setBlurFilter('motion_blur')}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    blurFilter === 'motion_blur'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  💨 Motion
                </button>
                <button
                  onClick={() => setBlurFilter('out_of_focus')}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    blurFilter === 'out_of_focus'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  🔍 Focus
                </button>
                <button
                  onClick={() => setBlurFilter('black_pocket')}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    blurFilter === 'black_pocket'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  🌑 Dark
                </button>
              </div>

              {/* Grouping Selector */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                <span className="px-2 py-1 text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-slate-400" />
                  Group:
                </span>
                {(['content', 'blur_type', 'month', 'year', 'all'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setBlurryGrouping(mode)}
                    className={`px-2 py-1 rounded-lg font-semibold transition capitalize cursor-pointer ${
                      blurryGrouping === mode
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'content' ? '👥 People vs Scenery' : mode === 'blur_type' ? '🔍 Blur Type' : mode === 'all' ? 'All (Flat)' : mode}
                  </button>
                ))}
              </div>

              {/* Quick 1-Click Action for accidental pocket shots */}
              {overview && (overview.total_pocket_shots ?? 0) > 0 && (
                <button
                  onClick={handleCleanPocketShots}
                  disabled={isCleaningPockets}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-semibold border border-rose-500/30 transition shadow-sm cursor-pointer"
                  title="1-Click Soft Delete of pitch-black pocket / lens-cap shots"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clean {overview.total_pocket_shots} Dark</span>
                </button>
              )}
            </div>
          </div>

          {filteredBlurry.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No photos found matching this filter! All images meet quality thresholds.
            </div>
          ) : (
            <div className="space-y-4">
              {blurryGroups.map((group) => {
                const isCollapsed = collapsedGroupKeys.has(group.key);
                const groupIds = group.items.map((b) => b.id);
                const isGroupAllSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
                const groupSelectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
                const limit = expandedGroupLimits[group.key] || 48;
                const visibleItems = blurryGrouping === 'all' ? group.items : group.items.slice(0, limit);
                const hasMore = visibleItems.length < group.items.length;

                return (
                  <div
                    key={group.key}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs transition-all"
                  >
                    {/* Header */}
                    {blurryGrouping !== 'all' && (
                      <div
                        onClick={() => toggleGroupCollapse(group.key)}
                        className={`flex items-center justify-between p-3.5 border-b cursor-pointer transition ${
                          group.key === 'with_people'
                            ? 'bg-purple-50/80 dark:bg-purple-950/30 border-purple-200/60 dark:border-purple-900/40 hover:bg-purple-100/70'
                            : 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-900/40 hover:bg-amber-100/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                          <div className="flex items-center gap-2">
                            {group.key === 'with_people' ? (
                              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-amber-500" />
                            )}
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</span>
                          </div>
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            group.key === 'with_people'
                              ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          }`}>
                            {group.items.length} {group.items.length === 1 ? 'photo' : 'photos'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* Quick Keep / Rescue Button for People in blurry group */}
                          {group.key === 'with_people' && (
                            <button
                              onClick={() => handleRescueGroup(groupIds)}
                              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                              title="Keep all photos with people safely in Personal Memories"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Keep All People ({group.items.length})</span>
                            </button>
                          )}

                          <button
                            onClick={() => toggleSelectGroup(groupIds)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs ${
                              isGroupAllSelected
                                ? 'bg-amber-600 text-white'
                                : groupSelectedCount > 0
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isGroupAllSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            <span>
                              {isGroupAllSelected ? 'Deselect Group' : 'Select Group'} ({group.items.length})
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cards Grid */}
                    {!isCollapsed && (
                      <div className="p-3.5 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {visibleItems.map((b) => {
                            const isSelected = selectedIds.includes(b.id);
                            return (
                              <div
                                key={b.id}
                                data-media-id={b.id}
                                onPointerDown={(e) => handlePointerDown(e, b.id)}
                                onClick={(e) => handleItemClick(b.id, e, currentTabItemIds)}
                                onDoubleClick={(e) => handleItemDoubleClick(b.id, e)}
                                title="Click to select/deselect • Double-click to view full image"
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

                                {/* Badges & Checkbox */}
                                <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                                  <div className="flex items-center gap-1">
                                    <span className="bg-amber-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                      {b.blur_type === 'motion_blur'
                                        ? '💨 Motion'
                                        : b.blur_type === 'black_pocket'
                                        ? '🌑 Dark'
                                        : `Sharpness: ${b.blurriness_score ? b.blurriness_score.toFixed(0) : 'Low'}`}
                                    </span>
                                    {b.has_faces && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md bg-purple-600/90 text-white shadow-sm flex items-center gap-0.5">
                                        <Users className="w-2.5 h-2.5" />
                                        <span>{b.face_count && b.face_count > 1 ? `${b.face_count}` : 'People'}</span>
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    data-selection-checkbox="true"
                                    onPointerDown={(e) => e.stopPropagation()}
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
                                  </button>
                                </div>

                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                  <p className="text-[11px] font-semibold truncate leading-tight">{b.filename}</p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRescueSingle(b.id);
                                    }}
                                    className="mt-1 w-full flex items-center justify-center gap-1 py-0.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded text-[10px] font-bold shadow-xs transition pointer-events-auto"
                                    title="Not blurry / keep as memory"
                                  >
                                    <BookmarkCheck className="w-3 h-3" />
                                    <span>Keep in Memories</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-red-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All In View'}</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {filteredLargeFiles.length} photos exceeding 3 MB
                {largeFileGrouping !== 'all' && largeFileGroups.length > 0 && (
                  <span className="text-red-600 dark:text-red-400 font-semibold ml-1">
                    ({largeFileGroups.length} sections)
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Content Type Filter: All vs Media vs With People vs Text */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                {(['all', 'without_people', 'with_people', 'with_text'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setLargeFileContentType(type)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      largeFileContentType === type
                        ? type === 'with_people'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : type === 'with_text'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-red-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'all'
                      ? `All (${largeFiles.length})`
                      : type === 'without_people'
                      ? `📁 Media/Scenery (${largeFiles.filter((l) => !l.has_faces).length})`
                      : type === 'with_people'
                      ? `👥 People (${largeFiles.filter((l) => l.has_faces).length})`
                      : `📄 Text (${largeFiles.filter((l) => l.has_text).length})`}
                  </button>
                ))}
              </div>

              {/* Grouping Selector */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                <span className="px-2 py-1 text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-slate-400" />
                  Group:
                </span>
                {(['content', 'month', 'year', 'all'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setLargeFileGrouping(mode)}
                    className={`px-2 py-1 rounded-lg font-semibold transition capitalize cursor-pointer ${
                      largeFileGrouping === mode
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'content' ? '👥 People vs Files' : mode === 'all' ? 'All (Flat)' : mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredLargeFiles.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No oversized files match your filter criteria!
            </div>
          ) : (
            <div className="space-y-4">
              {largeFileGroups.map((group) => {
                const isCollapsed = collapsedGroupKeys.has(group.key);
                const groupIds = group.items.map((l) => l.id);
                const isGroupAllSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
                const groupSelectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
                const limit = expandedGroupLimits[group.key] || 48;
                const visibleItems = largeFileGrouping === 'all' ? group.items : group.items.slice(0, limit);
                const hasMore = visibleItems.length < group.items.length;

                return (
                  <div
                    key={group.key}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs transition-all"
                  >
                    {/* Header */}
                    {largeFileGrouping !== 'all' && (
                      <div
                        onClick={() => toggleGroupCollapse(group.key)}
                        className={`flex items-center justify-between p-3.5 border-b cursor-pointer transition ${
                          group.key === 'with_people'
                            ? 'bg-purple-50/80 dark:bg-purple-950/30 border-purple-200/60 dark:border-purple-900/40 hover:bg-purple-100/70'
                            : 'bg-red-50/60 dark:bg-red-950/30 border-red-200/60 dark:border-red-900/40 hover:bg-red-100/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                          <div className="flex items-center gap-2">
                            {group.key === 'with_people' ? (
                              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <HardDrive className="w-4 h-4 text-red-500" />
                            )}
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</span>
                          </div>
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            group.key === 'with_people'
                              ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                              : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                          }`}>
                            {group.items.length} {group.items.length === 1 ? 'file' : 'files'}
                          </span>
                          {group.totalBytes > 0 && (
                            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                              {(group.totalBytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* Quick Keep / Rescue Button for People in large files group */}
                          {group.key === 'with_people' && (
                            <button
                              onClick={() => handleRescueGroup(groupIds)}
                              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                              title="Keep all high-resolution photos with people safely in Personal Memories"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Keep All People ({group.items.length})</span>
                            </button>
                          )}

                          <button
                            onClick={() => toggleSelectGroup(groupIds)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs ${
                              isGroupAllSelected
                                ? 'bg-red-600 text-white'
                                : groupSelectedCount > 0
                                ? 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isGroupAllSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            <span>
                              {isGroupAllSelected ? 'Deselect Group' : 'Select Group'} ({group.items.length})
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cards Grid */}
                    {!isCollapsed && (
                      <div className="p-3.5 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {visibleItems.map((l) => {
                            const isSelected = selectedIds.includes(l.id);
                            return (
                              <div
                                key={l.id}
                                data-media-id={l.id}
                                onPointerDown={(e) => handlePointerDown(e, l.id)}
                                onClick={(e) => handleItemClick(l.id, e, currentTabItemIds)}
                                onDoubleClick={(e) => handleItemDoubleClick(l.id, e)}
                                title="Click to select/deselect • Double-click to view full image"
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

                                {/* Badges & Checkbox */}
                                <div className="absolute top-2 inset-x-2 flex justify-between items-center pointer-events-auto">
                                  <div className="flex items-center gap-1">
                                    <span className="bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                      {l.file_size_mb} MB
                                    </span>
                                    {l.has_faces && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md bg-purple-600/90 text-white shadow-sm flex items-center gap-0.5">
                                        <Users className="w-2.5 h-2.5" />
                                        <span>{l.face_count && l.face_count > 1 ? `${l.face_count}` : 'People'}</span>
                                      </span>
                                    )}
                                    {l.has_text && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md bg-amber-600/90 text-white shadow-sm flex items-center gap-0.5">
                                        <FileText className="w-2.5 h-2.5" />
                                        <span>Text</span>
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    data-selection-checkbox="true"
                                    onPointerDown={(e) => e.stopPropagation()}
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
                                  </button>
                                </div>

                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                  <p className="text-[11px] font-semibold truncate leading-tight">{l.filename}</p>
                                  <p className="text-[9px] text-slate-300 font-mono mt-0.5">
                                    {l.width} x {l.height} px
                                  </p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRescueSingle(l.id);
                                    }}
                                    className="mt-1 w-full flex items-center justify-center gap-1 py-0.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded text-[10px] font-bold shadow-xs transition pointer-events-auto"
                                    title="Keep in Memories"
                                  >
                                    <BookmarkCheck className="w-3 h-3" />
                                    <span>Keep in Memories</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-pink-600" /> : <Square className="w-4 h-4 text-slate-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All In View'}</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {filteredMemes.length} memes & social graphics detected
                {memeGrouping !== 'all' && memeGroups.length > 0 && (
                  <span className="text-pink-600 dark:text-pink-400 font-semibold ml-1">
                    ({memeGroups.length} {memeGrouping === 'content' ? 'sections' : memeGrouping === 'week' ? 'weeks' : memeGrouping === 'year' ? 'years' : 'months'})
                  </span>
                )}
              </span>
            </div>

            {/* Content Filter, Grouping & Collapse Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Content Type Filter: All vs Graphics/Text vs People vs Text */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                {(['all', 'without_people', 'with_people', 'with_text'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setMemeContentType(type)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      memeContentType === type
                        ? type === 'with_people'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : type === 'with_text'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-pink-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'all'
                      ? `All (${memes.length})`
                      : type === 'without_people'
                      ? `📄 Graphics & Text (${memes.filter((m) => !m.has_faces).length})`
                      : type === 'with_people'
                      ? `👥 People (${memes.filter((m) => m.has_faces).length})`
                      : `📄 Text (${memes.filter((m) => m.has_text).length})`}
                  </button>
                ))}
              </div>

              {/* Grouping Selector */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                <span className="px-2 py-1 text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-slate-400" />
                  Group:
                </span>
                {(['content', 'week', 'month', 'year', 'all'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setMemeGrouping(mode)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition capitalize cursor-pointer ${
                      memeGrouping === mode
                        ? 'bg-pink-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'content' ? '👥 People vs Graphics' : mode === 'all' ? 'All (Flat)' : mode}
                  </button>
                ))}
              </div>

              {memeGrouping !== 'all' && memeGroups.length > 0 && (
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
          ) : filteredMemes.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No memes match the selected filter criteria.
            </div>
          ) : (
            <div className="space-y-4">
              {memeGroups.map((group) => {
                const isCollapsed = collapsedGroupKeys.has(group.key);
                const groupIds = group.items.map((m) => m.id);
                const isGroupAllSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
                const groupSelectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
                const limit = expandedGroupLimits[group.key] || 48;
                const visibleItems = memeGrouping === 'all' ? group.items : group.items.slice(0, limit);
                const hasMore = visibleItems.length < group.items.length;

                return (
                  <div
                    key={group.key}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs transition-all"
                  >
                    {/* Header */}
                    {memeGrouping !== 'all' && (
                      <div
                        onClick={() => toggleGroupCollapse(group.key)}
                        className={`flex items-center justify-between p-3.5 border-b cursor-pointer transition ${
                          group.key === 'with_people'
                            ? 'bg-purple-50/80 dark:bg-purple-950/30 border-purple-200/60 dark:border-purple-900/40 hover:bg-purple-100/70'
                            : 'bg-pink-50/60 dark:bg-pink-950/30 border-pink-200/60 dark:border-pink-900/40 hover:bg-pink-100/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                          <div className="flex items-center gap-2">
                            {group.key === 'with_people' ? (
                              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <Smile className="w-4 h-4 text-pink-500" />
                            )}
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</span>
                          </div>
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            group.key === 'with_people'
                              ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                              : 'bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300'
                          }`}>
                            {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                          </span>
                          {group.totalBytes > 0 && (
                            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                              {(group.totalBytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* Quick Rescue Button for People in Memes */}
                          {group.key === 'with_people' && (
                            <button
                              onClick={() => handleRescueGroup(groupIds)}
                              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                              title="Rescue all personal photos with people misclassified as memes to Personal Memories"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Rescue All People ({group.items.length})</span>
                            </button>
                          )}

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
                                ? `Deselect ${memeGrouping === 'content' ? 'Section' : memeGrouping === 'week' ? 'Week' : memeGrouping === 'year' ? 'Year' : 'Month'}`
                                : `Select ${memeGrouping === 'content' ? 'Section' : memeGrouping === 'week' ? 'Week' : memeGrouping === 'year' ? 'Year' : 'Month'}`}{' '}
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
                                onPointerDown={(e) => handlePointerDown(e, m.id)}
                                onClick={(e) => handleItemClick(m.id, e, currentTabItemIds)}
                                onDoubleClick={(e) => handleItemDoubleClick(m.id, e)}
                                title="Click to select/deselect • Double-click to view full image"
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
                                  <div className="flex items-center gap-1">
                                    <span className="bg-pink-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                      Meme
                                    </span>
                                    {m.has_faces ? (
                                      <span
                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md shadow-sm bg-purple-600 text-white flex items-center gap-0.5"
                                        title={`${m.face_count || 1} face(s) detected - Possible Personal Photo`}
                                      >
                                        <Users className="w-2.5 h-2.5" />
                                        <span>{m.face_count || 1} {m.face_count === 1 ? 'Person' : 'People'}</span>
                                      </span>
                                    ) : m.has_text ? (
                                      <span
                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md shadow-sm bg-amber-600 text-white flex items-center gap-0.5"
                                        title="Text overlay detected"
                                      >
                                        <FileText className="w-2.5 h-2.5" />
                                        <span>Text</span>
                                      </span>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    data-selection-checkbox="true"
                                    onPointerDown={(e) => e.stopPropagation()}
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
                                  </button>
                                </div>

                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white">
                                  <p className="text-[11px] font-semibold truncate leading-tight">{m.filename}</p>
                                  {m.has_faces && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRescueSingle(m.id);
                                      }}
                                      className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shadow-xs transition pointer-events-auto"
                                      title="Keep this photo: Move to Personal Memories"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Keep as Memory</span>
                                    </button>
                                  )}
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
