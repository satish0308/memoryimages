'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Edit2, 
  Check, 
  Sparkles, 
  RefreshCw, 
  X, 
  ArrowRight, 
  ArrowLeft,
  Trash2, 
  Merge, 
  CheckCircle2, 
  Search, 
  Maximize2,
  Star,
  Eye,
  EyeOff,
  Square,
  CheckSquare,
  Calendar,
  Play,
  Layers,
  Smile,
  ArrowDownUp
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { DaySection, TimelineGroup } from '@/components/timeline/DaySection';
import { ScaleSelector, TimelineScale, GridDensity } from '@/components/timeline/ScaleSelector';
import { TimelineScrubber } from '@/components/timeline/TimelineScrubber';
import { BulkActionBar } from '@/components/timeline/BulkActionBar';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { AmbientSlideshowModal } from '@/components/timeline/AmbientSlideshowModal';
import { BurstInspectorModal } from '@/components/timeline/BurstInspectorModal';
import { BulkDeleteModal } from '@/components/timeline/BulkDeleteModal';
import { GoogleDriveBackupModal } from '@/components/sync/GoogleDriveBackupModal';
import { GooglePhotosExportModal } from '@/components/sync/GooglePhotosExportModal';
import { SearchPersonModal } from '@/components/people/SearchPersonModal';
import { useDragSelect } from '@/hooks/useDragSelect';
import { useAuth } from '@/context/AuthContext';
import { useTaskQueue } from '@/context/TaskQueueContext';
import { getApiUrl } from '@/utils/apiUrl';

interface PersonItem {
  id: number;
  name: string;
  is_pet?: boolean;
  pet_type?: string | null;
  relationship_type?: string | null;
  is_hidden?: boolean;
  photo_count: number;
  faces_count: number;
  avatar_url: string | null;
  cover_thumbnail_url: string | null;
}

interface PeopleStats {
  total_faces: number;
  total_people: number;
  total_pets?: number;
  tagged_faces: number;
  unassigned_faces: number;
  photos_with_faces: number;
}

interface UnnamedFaceItem {
  id: number;
  media_id: number;
  filename: string;
  captured_at: string | null;
  person_id: number | null;
  person_name: string;
  crop_url: string;
  confidence: number;
}

interface MergeSuggestion {
  target_person: {
    id: number;
    name: string;
    faces_count: number;
    avatar_url: string;
    cover_thumbnail_url: string | null;
  };
  source_person: {
    id: number;
    name: string;
    faces_count: number;
    avatar_url: string;
    cover_thumbnail_url: string | null;
  };
  similarity: number;
  confidence_pct: number;
}

const RELATIONSHIP_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'Family', label: '👨‍👩‍👧 Family' },
  { value: 'Friends', label: '🤝 Friends' },
  { value: 'Partner', label: '❤️ Partner' },
  { value: 'Work', label: '💼 Work' },
  { value: 'Self', label: '👤 Self' }
];

export default function PeoplePage() {
  const { token: authContextToken } = useAuth();
  const { activeTasks = [], recentTasks = [] } = useTaskQueue() || {};
  const isFaceDetectActive = activeTasks.some((t) => t.type === 'face_detect_all');
  const isFaceClusterActive = activeTasks.some((t) => t.type === 'face_cluster_all');

  // Directory State
  const [people, setPeople] = useState<PersonItem[]>([]);
  const [stats, setStats] = useState<PeopleStats | null>(null);
  const [unnamedFaces, setUnnamedFaces] = useState<UnnamedFaceItem[]>([]);
  const [activeTab, setActiveTab] = useState<'people' | 'unnamed'>('people');
  const [filterType, setFilterType] = useState<'all' | 'people' | 'pets'>('all');
  const [selectedRelationship, setSelectedRelationship] = useState<string>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [searchNameQuery, setSearchNameQuery] = useState('');

  // Merge Suggestions
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [mergingId, setMergingId] = useState<string | null>(null);

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [isClustering, setIsClustering] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const [isReclusteringUnnamed, setIsReclusteringUnnamed] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Selected Person Full-Screen Life Timeline State
  const [selectedPerson, setSelectedPerson] = useState<PersonItem | null>(null);
  const [personTimeline, setPersonTimeline] = useState<TimelineGroup[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [scale, setScale] = useState<TimelineScale>('day');
  const [density, setDensity] = useState<GridDensity>('normal');
  const [collapseBursts, setCollapseBursts] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);
  const [expressionFilter, setExpressionFilter] = useState<'all' | 'smiling' | 'neutral'>('all');
  const [chronologicalOrder, setChronologicalOrder] = useState<'desc' | 'asc'>('desc');

  // Modals
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [inspectingBurstLead, setInspectingBurstLead] = useState<MediaItem | null>(null);
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showGooglePhotosModal, setShowGooglePhotosModal] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupModalMediaIds, setBackupModalMediaIds] = useState<number[]>([]);

  // Merge modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [isMergingModal, setIsMergingModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Visual Face Search Modal
  const [searchModalFaceId, setSearchModalFaceId] = useState<number | null>(null);
  const [isSearchPersonOpen, setIsSearchPersonOpen] = useState(false);

  const API_URL = getApiUrl();

  const getActiveToken = useCallback(() => {
    return authContextToken || (typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null);
  }, [authContextToken]);

  const buildMediaUrl = useCallback((url: string | null | undefined) => {
    if (!url) return '';
    const token = getActiveToken();
    const prefix = url.startsWith('http') ? '' : API_URL;
    if (!token) return `${prefix}${url}`;
    const separator = url.includes('?') ? '&' : '?';
    return `${prefix}${url}${separator}token=${encodeURIComponent(token)}`;
  }, [API_URL, getActiveToken]);

  const fetchPeople = useCallback(async () => {
    try {
      setLoading(true);
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let url = `${API_URL}/api/v1/people?filter_type=${filterType}&show_hidden=${showHidden}`;
      if (selectedRelationship !== 'all') {
        url += `&relationship=${encodeURIComponent(selectedRelationship)}`;
      }

      const [peopleRes, statsRes] = await Promise.all([
        fetch(url, { headers }),
        fetch(`${API_URL}/api/v1/people/stats`, { headers })
      ]);

      if (peopleRes.ok) setPeople(await peopleRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      console.error('Error fetching people:', e);
    } finally {
      setLoading(false);
    }
  }, [API_URL, filterType, selectedRelationship, showHidden, getActiveToken]);

  const fetchMergeSuggestions = useCallback(async () => {
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/merge-suggestions?similarity_threshold=0.40`, { headers });
      if (res.ok) {
        setMergeSuggestions(await res.json());
      }
    } catch (e) {
      console.error('Error fetching merge suggestions:', e);
    }
  }, [API_URL, getActiveToken]);

  const fetchUnnamedFaces = useCallback(async () => {
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/unnamed-faces?limit=60`, { headers });
      if (res.ok) setUnnamedFaces(await res.json());
    } catch (e) {
      console.error('Error fetching unnamed faces:', e);
    }
  }, [API_URL, getActiveToken]);

  const fetchPersonDetail = useCallback(async (personId: number) => {
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${personId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedPerson(data);
      }
    } catch (err) {
      console.error('Failed to fetch person detail:', err);
    }
  }, [API_URL, getActiveToken]);

  // Fetch Chronological Timeline for Selected Person
  const fetchPersonTimeline = useCallback(async (personId: number) => {
    try {
      setLoadingTimeline(true);
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `${API_URL}/api/v1/media/timeline?person_id=${personId}&scale=${scale}&collapse_bursts=${collapseBursts}`,
        { headers }
      );
      if (res.ok) {
        const data: TimelineGroup[] = await res.json();
        setPersonTimeline(data);
      }
    } catch (err) {
      console.error('Failed to fetch person timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  }, [API_URL, scale, collapseBursts, getActiveToken]);

  useEffect(() => {
    fetchPeople();
    fetchMergeSuggestions();
  }, [fetchPeople, fetchMergeSuggestions]);

  const pollReclusterTask = useCallback(async (taskId: string) => {
    setIsReclusteringUnnamed(true);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/tasks/${taskId}`);
        if (!res.ok) {
          clearInterval(interval);
          setIsReclusteringUnnamed(false);
          if (typeof window !== 'undefined') localStorage.removeItem('memorypics_recluster_task_id');
          return;
        }
        const task = await res.json();
        if (task.status === 'completed') {
          clearInterval(interval);
          setIsReclusteringUnnamed(false);
          if (typeof window !== 'undefined') localStorage.removeItem('memorypics_recluster_task_id');
          fetchPeople();
          fetchMergeSuggestions();
          setStatusMessage('Unnamed groups successfully re-clustered!');
          setTimeout(() => setStatusMessage(null), 4000);
        } else if (task.status === 'failed') {
          clearInterval(interval);
          setIsReclusteringUnnamed(false);
          if (typeof window !== 'undefined') localStorage.removeItem('memorypics_recluster_task_id');
          setStatusMessage(task.error || 'Re-clustering failed.');
        } else {
          setIsReclusteringUnnamed(true);
          setStatusMessage(task.message || `Re-clustering unnamed groups (${task.progress || 0}%)...`);
        }
      } catch (e) {
        // network retry
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [API_URL, fetchPeople, fetchMergeSuggestions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTaskId = localStorage.getItem('memorypics_recluster_task_id');
    if (storedTaskId) {
      pollReclusterTask(storedTaskId);
    } else {
      fetch(`${API_URL}/api/v1/tasks/active`)
        .then((res) => res.json())
        .then((data) => {
          const activeRecluster = (data.active || []).find((t: any) => t.type === 'face_recluster_unnamed');
          if (activeRecluster) {
            localStorage.setItem('memorypics_recluster_task_id', activeRecluster.id);
            pollReclusterTask(activeRecluster.id);
          }
        })
        .catch(() => {});
    }
  }, [API_URL, pollReclusterTask]);

  useEffect(() => {
    if (activeTab === 'unnamed') {
      fetchUnnamedFaces();
    }
  }, [activeTab, fetchUnnamedFaces]);

  // Deep Link URL Sync: on mount or popstate, open person timeline if ?person_id is in query
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const pidStr = params.get('person_id');
    if (pidStr) {
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid)) {
        const found = people.find((p) => p.id === pid);
        if (found) {
          setSelectedPerson(found);
        } else if (!selectedPerson || selectedPerson.id !== pid) {
          fetchPersonDetail(pid);
        }
      }
    }
  }, [people, fetchPersonDetail]);

  // Automatically fetch timeline when selectedPerson, scale, or collapseBursts change
  useEffect(() => {
    if (selectedPerson) {
      fetchPersonTimeline(selectedPerson.id);
    }
  }, [selectedPerson?.id, scale, collapseBursts, fetchPersonTimeline]);

  // Navigation handlers
  const openPersonTimeline = (person: PersonItem) => {
    setSelectedPerson(person);
    setSelectedPhotoIds([]);
    setSelectedPhoto(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('person_id', String(person.id));
      window.history.pushState(null, '', url.toString());
    }
  };

  const closePersonTimeline = () => {
    setSelectedPerson(null);
    setPersonTimeline([]);
    setSelectedPhotoIds([]);
    setSelectedPhoto(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('person_id');
      window.history.pushState(null, '', url.pathname + (url.search ? url.search : ''));
    }
  };

  // Keyboard shortcut: Esc to return to all people when no modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const hasOpenModal =
          Boolean(selectedPhoto) ||
          Boolean(inspectingBurstLead) ||
          isSlideshowOpen ||
          showBulkDeleteModal ||
          showGooglePhotosModal ||
          isBackupModalOpen ||
          showMergeModal ||
          isSearchPersonOpen;

        if (!hasOpenModal && selectedPerson) {
          closePersonTimeline();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedPerson,
    selectedPhoto,
    inspectingBurstLead,
    isSlideshowOpen,
    showBulkDeleteModal,
    showGooglePhotosModal,
    isBackupModalOpen,
    showMergeModal,
    isSearchPersonOpen,
  ]);

  // Filtered & Chronologically Ordered Timeline for Person
  const displayedTimeline = useMemo(() => {
    let list = personTimeline.map((group) => {
      if (expressionFilter === 'all') return group;
      const filteredItems = group.items.filter((it) => {
        if (expressionFilter === 'smiling') return Boolean(it.is_smiling);
        if (expressionFilter === 'neutral') return !it.is_smiling;
        return true;
      });
      return {
        ...group,
        items: filteredItems,
        count: filteredItems.length,
      };
    }).filter((g) => g.items.length > 0);

    if (chronologicalOrder === 'asc') {
      return [...list].reverse().map((g) => ({
        ...g,
        items: [...g.items].reverse(),
      }));
    }
    return list;
  }, [personTimeline, expressionFilter, chronologicalOrder]);

  // Flat array of all photos in current person timeline
  const allPersonPhotos = useMemo(() => {
    return displayedTimeline.flatMap((group) => group.items);
  }, [displayedTimeline]);

  // 2D Drag-and-Select Hook for Person Timeline
  const {
    isDragging: isDragSelecting,
    dragMode,
    marqueeBox,
    handlePointerDown,
    handleItemClick,
  } = useDragSelect({
    selectedIds: selectedPhotoIds,
    setSelectedIds: setSelectedPhotoIds,
    orderedIds: allPersonPhotos.map((p) => p.id),
    onOpenLightbox: (id) => {
      const found = allPersonPhotos.find((p) => p.id === id);
      if (found) setSelectedPhoto(found);
    },
  });

  // Photo Actions for Person Timeline
  const toggleFavorite = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/media/${id}/favorite`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setPersonTimeline((prev) =>
          prev.map((g) => ({
            ...g,
            items: g.items.map((it) => (it.id === id ? { ...it, is_favorite: data.is_favorite } : it)),
          }))
        );
        if (selectedPhoto && selectedPhoto.id === id) {
          setSelectedPhoto((prev) => (prev ? { ...prev, is_favorite: data.is_favorite } : null));
        }
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const deletePhoto = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Move this photo to trash?')) return;
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/media/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        setPersonTimeline((prev) =>
          prev
            .map((g) => ({
              ...g,
              items: g.items.filter((it) => it.id !== id),
            }))
            .filter((g) => g.items.length > 0)
        );
        setSelectedPhotoIds((prev) => prev.filter((pid) => pid !== id));
        if (selectedPhoto && selectedPhoto.id === id) {
          setSelectedPhoto(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete photo:', err);
    }
  };

  const toggleSelectGroup = (groupIds: number[], selectAll: boolean) => {
    setSelectedPhotoIds((prev) => {
      if (selectAll) {
        return Array.from(new Set([...prev, ...groupIds]));
      } else {
        return prev.filter((id) => !groupIds.includes(id));
      }
    });
  };

  const handleBatchFavorite = async () => {
    if (selectedPhotoIds.length === 0) return;
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/media/batch-favorite`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ media_ids: selectedPhotoIds }),
      });
      if (res.ok) {
        const data = await res.json();
        const favSet = new Set(data.favorited_ids || selectedPhotoIds);
        setPersonTimeline((prev) =>
          prev.map((g) => ({
            ...g,
            items: g.items.map((it) => (favSet.has(it.id) ? { ...it, is_favorite: true } : it)),
          }))
        );
      }
    } catch (err) {
      console.error('Failed to batch favorite:', err);
    }
  };

  const executeBatchDelete = async (permanent: boolean) => {
    if (selectedPhotoIds.length === 0) return;
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/media/batch-delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ media_ids: selectedPhotoIds, permanent }),
      });
      if (res.ok) {
        const deletedSet = new Set(selectedPhotoIds);
        setPersonTimeline((prev) =>
          prev
            .map((g) => ({
              ...g,
              items: g.items.filter((it) => !deletedSet.has(it.id)),
            }))
            .filter((g) => g.items.length > 0)
        );
        setSelectedPhotoIds([]);
        setShowBulkDeleteModal(false);
      }
    } catch (err) {
      console.error('Failed to execute batch delete:', err);
    }
  };

  const handleBackupSinglePhoto = (photo: MediaItem) => {
    setBackupModalMediaIds([photo.id]);
    setIsBackupModalOpen(true);
  };

  const handleBackupBulkPhotos = (ids: number[]) => {
    setBackupModalMediaIds(ids);
    setIsBackupModalOpen(true);
  };

  // Lightbox Navigation
  const currentPhotoIndex = selectedPhoto
    ? allPersonPhotos.findIndex((p) => p.id === selectedPhoto.id)
    : -1;
  const hasPrev = currentPhotoIndex > 0;
  const hasNext = currentPhotoIndex !== -1 && currentPhotoIndex < allPersonPhotos.length - 1;
  const prevPhoto = hasPrev ? allPersonPhotos[currentPhotoIndex - 1] : null;
  const nextPhoto = hasNext ? allPersonPhotos[currentPhotoIndex + 1] : null;

  const navigatePrev = () => {
    if (hasPrev) setSelectedPhoto(allPersonPhotos[currentPhotoIndex - 1]);
  };

  const navigateNext = () => {
    if (hasNext) setSelectedPhoto(allPersonPhotos[currentPhotoIndex + 1]);
  };

  // Person Metadata Updates
  const handleSaveName = async (id: number) => {
    if (!editName.trim()) return;
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, name: updated.name } : p)));
        if (selectedPerson && selectedPerson.id === id) {
          setSelectedPerson((prev) => (prev ? { ...prev, name: updated.name } : null));
        }
        setEditingId(null);
        setStatusMessage(`Renamed to "${updated.name}"`);
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateRelationship = async (personId: number, rel: string) => {
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${personId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ relationship_type: rel || null }),
      });
      if (res.ok) {
        setPeople((prev) =>
          prev.map((p) => (p.id === personId ? { ...p, relationship_type: rel || null } : p))
        );
        if (selectedPerson && selectedPerson.id === personId) {
          setSelectedPerson((prev) => (prev ? { ...prev, relationship_type: rel || null } : null));
        }
        setStatusMessage('Relationship category updated!');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error('Update relationship error:', e);
    }
  };

  const handleToggleHidePerson = async (personId: number, shouldHide: boolean) => {
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${personId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_hidden: shouldHide }),
      });
      if (res.ok) {
        if (shouldHide && selectedPerson && selectedPerson.id === personId) {
          closePersonTimeline();
        } else if (selectedPerson && selectedPerson.id === personId) {
          setSelectedPerson((prev) => (prev ? { ...prev, is_hidden: shouldHide } : null));
        }
        fetchPeople();
        setStatusMessage(shouldHide ? 'Person hidden from library' : 'Person unhidden');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error('Hide person error:', e);
    }
  };

  // Quick 1-Click Merge Suggestion
  const handleQuickMerge = async (sourceId: number, targetId: number) => {
    try {
      const pairKey = `${sourceId}-${targetId}`;
      setMergingId(pairKey);
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/merge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source_person_id: sourceId, target_person_id: targetId }),
      });

      if (res.ok) {
        setMergeSuggestions((prev) =>
          prev.filter((s) => s.source_person.id !== sourceId && s.target_person.id !== sourceId)
        );
        fetchPeople();
        setStatusMessage('Profiles merged successfully!');
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        const err = await res.json().catch(() => ({ detail: 'Merge failed.' }));
        if (res.status === 404) {
          setMergeSuggestions((prev) =>
            prev.filter((s) => s.source_person.id !== sourceId && s.target_person.id !== sourceId)
          );
        }
        setStatusMessage(err.detail || 'Merge failed.');
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (e: any) {
      console.error('Quick merge failed:', e);
      setStatusMessage(e?.message || 'Quick merge failed.');
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setMergingId(null);
    }
  };

  // Auto-Clustering with ArcFace 512-d embeddings
  const handleAutoCluster = async () => {
    try {
      setIsClustering(true);
      setStatusMessage('Auto-clustering faces with ArcFace 512-d biometrics...');
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/auto-cluster`, { method: 'POST', headers });
      if (res.ok) {
        fetchPeople();
        fetchMergeSuggestions();
        setStatusMessage('ArcFace clustering complete!');
        setTimeout(() => setStatusMessage(null), 3500);
      } else {
        const err = await res.json().catch(() => ({ detail: 'Clustering failed.' }));
        setStatusMessage(err.detail || 'Clustering failed.');
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('Clustering failed.');
    } finally {
      setIsClustering(false);
    }
  };

  // Deep Scan Library Photos
  const handleScanFaces = async () => {
    try {
      setIsScanning(true);
      setStatusMessage('Starting deep biometric scan across library photos...');
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/scan-faces?max_photos=250`, { method: 'POST', headers });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.status === 'already_up_to_date') {
          setStatusMessage('All photos in your library are already scanned for faces! (0 new photos)');
        } else if (data.status === 'queued') {
          setStatusMessage('Biometric scan running in background! Check Task Queue in header for live progress.');
        } else {
          setStatusMessage('Deep scan complete!');
          fetchPeople();
          fetchMergeSuggestions();
        }
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        const err = await res.json().catch(() => ({ detail: 'Scan failed.' }));
        setStatusMessage(err.detail || 'Scan failed.');
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('Scan failed.');
    } finally {
      setIsScanning(false);
    }
  };

  // Auto-Correct / Re-Check Incorrect Group (e.g. Person 9)
  const handleRecheckGroup = async (personId: number) => {
    try {
      setIsRechecking(true);
      setStatusMessage('Auto-correcting group: checking faces against named people & current strictness...');
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${personId}/recheck`, { method: 'POST', headers });
      if (res.ok) {
        const data = await res.json();
        const recruitedMsg = data.recruited_to_named > 0 ? `recruited ${data.recruited_to_named} to ${data.recruited_names?.join(', ') || 'named people'}, ` : '';
        const clustersMsg = data.new_clusters_created > 0 ? `split into ${data.new_clusters_created} new group(s), ` : '';
        const unassignedMsg = data.unassigned_faces > 0 ? `${data.unassigned_faces} stranger/noise faces cleared` : '';
        setStatusMessage(`Group auto-corrected! (${recruitedMsg}${clustersMsg}${unassignedMsg || 'done'})`);
        setTimeout(() => setStatusMessage(null), 5000);
        closePersonTimeline();
        fetchPeople();
        fetchMergeSuggestions();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Re-check failed.' }));
        setStatusMessage(err.detail || 'Re-check failed.');
      }
    } catch (e: any) {
      console.error(e);
      setStatusMessage(e?.message || 'Re-check failed.');
    } finally {
      setIsRechecking(false);
    }
  };

  // Re-cluster all unnamed groups with current similarity setting (resilient to page refresh)
  const handleReclusterUnnamed = async () => {
    try {
      setIsReclusteringUnnamed(true);
      setStatusMessage('Initiating re-clustering of unnamed groups...');
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/recluster-unnamed?background=true`, { method: 'POST', headers });
      const data = await res.json();
      if (res.ok && data.task_id) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('memorypics_recluster_task_id', data.task_id);
        }
        pollReclusterTask(data.task_id);
      } else if (res.ok) {
        fetchPeople();
        fetchMergeSuggestions();
        setStatusMessage('Unnamed groups successfully re-clustered!');
        setTimeout(() => setStatusMessage(null), 3500);
        setIsReclusteringUnnamed(false);
      } else {
        setStatusMessage(data.detail || 'Re-clustering failed.');
        setIsReclusteringUnnamed(false);
      }
    } catch (e: any) {
      console.error(e);
      setStatusMessage(e?.message || 'Re-clustering failed.');
      setIsReclusteringUnnamed(false);
    }
  };

  // Remove selected photos from current person group ('Not This Person')
  const handleRemoveSelectedFromPerson = async () => {
    if (!selectedPerson || selectedPhotoIds.length === 0) return;
    if (!confirm(`Remove ${selectedPhotoIds.length} photo(s) from ${selectedPerson.name}? (Photos will remain in your library)`)) return;
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${selectedPerson.id}/remove-faces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ media_ids: selectedPhotoIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(`Removed ${data.removed_count || selectedPhotoIds.length} face(s) from ${selectedPerson.name}`);
        setTimeout(() => setStatusMessage(null), 3500);
        if (data.person_deleted) {
          closePersonTimeline();
          fetchPeople();
        } else {
          fetchPersonTimeline(selectedPerson.id);
          fetchPersonDetail(selectedPerson.id);
        }
        setSelectedPhotoIds([]);
      }
    } catch (err) {
      console.error('Failed to remove photos from person:', err);
    }
  };

  const handleToggleIsPet = async (personId: number, isPet: boolean) => {
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/v1/people/${personId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_pet: isPet }),
      });
      if (res.ok) {
        setSelectedPerson((prev) => (prev ? { ...prev, is_pet: isPet } : null));
        fetchPeople();
        setStatusMessage(isPet ? 'Marked as Pet 🐾' : 'Marked as Person 👤');
        setTimeout(() => setStatusMessage(null), 2500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Manual Merge from Modal
  const handleMergePeople = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId || isMergingModal) return;
    try {
      setIsMergingModal(true);
      setModalError(null);
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/merge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_person_id: mergeSourceId,
          target_person_id: mergeTargetId,
        }),
      });
      if (res.ok) {
        setShowMergeModal(false);
        setMergeSourceId(null);
        setMergeTargetId(null);
        setModalError(null);
        if (selectedPerson && selectedPerson.id === mergeSourceId) {
          const target = people.find((p) => p.id === mergeTargetId);
          if (target) {
            setSelectedPerson(target);
            fetchPersonTimeline(target.id);
          } else {
            closePersonTimeline();
          }
        }
        fetchPeople();
        fetchMergeSuggestions();
        setStatusMessage('People successfully merged!');
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        const err = await res.json().catch(() => ({ detail: 'Merge failed.' }));
        setModalError(err.detail || 'Merge failed.');
      }
    } catch (e: any) {
      console.error(e);
      setModalError(e?.message || 'Merge failed.');
    } finally {
      setIsMergingModal(false);
    }
  };

  const openFaceInLightbox = (face: UnnamedFaceItem) => {
    setSelectedPhoto({
      id: face.media_id,
      filename: face.filename,
      category: 'memory',
      width: 1920,
      height: 1080,
      captured_at: face.captured_at || new Date().toISOString(),
      is_favorite: false,
      is_blurry: false,
      thumbnail_url: `/api/v1/media/${face.media_id}/thumbnail?size=256`,
    } as MediaItem);
  };

  // Filtered people by name for directory view
  const filteredPeople = useMemo(() => {
    if (!searchNameQuery.trim()) return people;
    const q = searchNameQuery.toLowerCase().trim();
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, searchNameQuery]);

  // Windowed progressive rendering to prevent DOM freeze with 3,500+ people
  const [visiblePeopleCount, setVisiblePeopleCount] = useState(48);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisiblePeopleCount(48);
  }, [searchNameQuery, filterType, selectedRelationship, showHidden]);

  const displayedPeople = useMemo(() => {
    return filteredPeople.slice(0, visiblePeopleCount);
  }, [filteredPeople, visiblePeopleCount]);

  useEffect(() => {
    if (visiblePeopleCount >= filteredPeople.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisiblePeopleCount((prev) => Math.min(prev + 48, filteredPeople.length));
        }
      },
      { rootMargin: '800px 0px 800px 0px' }
    );
    const el = loadMoreSentinelRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
      observer.disconnect();
    };
  }, [visiblePeopleCount, filteredPeople.length]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      {/* ========================================================
          VIEW MODE A: BIG-SCREEN PERSON LIFE TIMELINE
          ======================================================== */}
      {selectedPerson ? (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Sticky/Hero Navigation Bar */}
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-md transition-all">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              {/* Left: Back button + Profile Avatar + Name + Badges */}
              <div className="flex items-start sm:items-center gap-4">
                {/* Back Button */}
                <button
                  onClick={closePersonTimeline}
                  className="group flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/60 text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 rounded-2xl text-xs font-bold transition shadow-xs flex-shrink-0"
                  title="Return to all people (or press Esc)"
                >
                  <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                  <span className="hidden sm:inline">All People</span>
                  <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-500 dark:text-slate-400">
                    Esc
                  </kbd>
                </button>

                {/* Avatar with Ring */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-slate-900 ring-4 ring-indigo-500/30 flex-shrink-0 shadow-lg">
                  {selectedPerson.avatar_url ? (
                    <img
                      src={buildMediaUrl(selectedPerson.avatar_url)}
                      alt={selectedPerson.name}
                      className="w-full h-full object-cover"
                    />
                  ) : selectedPerson.cover_thumbnail_url ? (
                    <img
                      src={buildMediaUrl(selectedPerson.cover_thumbnail_url)}
                      alt={selectedPerson.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <Users className="w-8 h-8" />
                    </div>
                  )}
                </div>

                {/* Name, Inline Rename, & Badges */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {editingId === selectedPerson.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveName(selectedPerson.id)}
                          className="text-base sm:text-xl font-bold bg-white dark:bg-slate-800 border-2 border-indigo-500 rounded-xl px-2 py-0.5 focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveName(selectedPerson.id)}
                          className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                          title="Save Name"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          setEditingId(selectedPerson.id);
                          setEditName(selectedPerson.name);
                        }}
                        className="group/name flex items-center gap-2 cursor-pointer"
                        title="Click to rename"
                      >
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                          {selectedPerson.name}
                        </h1>
                        <Edit2 className="w-4 h-4 text-slate-400 opacity-60 group-hover/name:opacity-100 group-hover/name:text-indigo-500 transition" />
                      </div>
                    )}

                    {selectedPerson.is_pet && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                        🐾 {selectedPerson.pet_type?.toUpperCase() || 'PET'}
                      </span>
                    )}

                    {selectedPerson.is_hidden && (
                      <span className="text-xs bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold px-2.5 py-0.5 rounded-full shadow-xs">
                        Hidden
                      </span>
                    )}
                  </div>

                  {/* Stats & Metadata summary */}
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                        {collapseBursts && selectedPerson.photo_count && selectedPerson.photo_count > allPersonPhotos.length
                          ? `${allPersonPhotos.length} of ${selectedPerson.photo_count}`
                          : allPersonPhotos.length}
                      </strong>{' '}
                      photos
                      {collapseBursts && selectedPerson.photo_count && selectedPerson.photo_count > allPersonPhotos.length && (
                        <span className="text-indigo-500 dark:text-indigo-400 font-normal ml-1">(bursts stacked)</span>
                      )}
                    </span>
                    <span>•</span>
                    <span>
                      <strong>{personTimeline.length}</strong> time periods
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Full Life Timeline</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Action Buttons (Kiosk, Slideshow, Category, Merge, Hide) */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Relationship Selector Dropdown */}
                <select
                  value={selectedPerson.relationship_type || ''}
                  onChange={(e) => handleUpdateRelationship(selectedPerson.id, e.target.value)}
                  className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:border-indigo-500 shadow-xs"
                >
                  <option value="">No Category</option>
                  <option value="Family">👨‍👩‍👧 Family</option>
                  <option value="Friends">🤝 Friends</option>
                  <option value="Partner">❤️ Partner</option>
                  <option value="Work">💼 Work</option>
                  <option value="Self">👤 Self</option>
                  <option value="Other">🏷️ Other</option>
                </select>

                {/* Pet / Human Toggle Button */}
                <button
                  type="button"
                  onClick={() => handleToggleIsPet(selectedPerson.id, !selectedPerson.is_pet)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition shadow-xs ${
                    selectedPerson.is_pet
                      ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-600'
                  }`}
                  title={selectedPerson.is_pet ? 'Switch category to Person' : 'Switch category to Pet (Dog/Cat)'}
                >
                  <span>🐾</span>
                  <span>{selectedPerson.is_pet ? 'Pet' : 'Person'}</span>
                </button>

                {/* Ambient Kiosk Mode Frame launcher */}
                <Link
                  href={`/kiosk?person_id=${selectedPerson.id}&person_name=${encodeURIComponent(selectedPerson.name)}`}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-500/20 transition active:scale-95"
                  title={`Launch fullscreen ambient digital frame slideshow for ${selectedPerson.name}`}
                >
                  <Play className="w-3.5 h-3.5 fill-white text-white" />
                  <span>Launch Kiosk</span>
                </Link>

                {/* Ambient Slideshow Modal launcher */}
                <button
                  onClick={() => setIsSlideshowOpen(true)}
                  disabled={allPersonPhotos.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-600 rounded-xl text-xs font-semibold transition border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                  title="Play cinematic slideshow of this person's photos"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Slideshow</span>
                </button>

                {/* Auto-Correct Group button */}
                <button
                  onClick={() => handleRecheckGroup(selectedPerson.id)}
                  disabled={isRechecking}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-700 dark:text-slate-300 hover:text-amber-600 rounded-xl text-xs font-semibold transition border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                  title="Auto-correct incorrect group: disbands and re-recruits faces to named people or splits using current strictness"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isRechecking ? 'animate-spin' : ''}`} />
                  <span>{isRechecking ? 'Re-Checking...' : 'Auto-Correct Group'}</span>
                </button>

                {/* Merge Button */}
                <button
                  onClick={() => {
                    setMergeSourceId(selectedPerson.id);
                    setShowMergeModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition border border-slate-200 dark:border-slate-700"
                  title="Merge this person into another identity"
                >
                  <Merge className="w-3.5 h-3.5 text-purple-500" />
                  <span>Merge</span>
                </button>

                {/* Hide / Unhide Toggle */}
                <button
                  onClick={() => handleToggleHidePerson(selectedPerson.id, !selectedPerson.is_hidden)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 rounded-xl text-xs font-semibold transition border border-slate-200 dark:border-slate-700"
                  title={selectedPerson.is_hidden ? 'Unhide this person in library' : 'Hide from library'}
                >
                  {selectedPerson.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{selectedPerson.is_hidden ? 'Unhide' : 'Hide'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Timeline Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 shadow-xs">
            {/* Left: ScaleSelector, GridDensity, Burst Collapse */}
            <div className="flex items-center gap-3 flex-wrap">
              <ScaleSelector
                scale={scale}
                onChangeScale={setScale}
                density={density}
                onChangeDensity={setDensity}
              />

              {/* Burst Collapse Toggle */}
              <button
                onClick={() => setCollapseBursts((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition shadow-xs ${
                  collapseBursts
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
                title="Stack consecutive burst shots into a single best cover photo"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>Bursts: {collapseBursts ? 'Collapsed' : 'Expanded'}</span>
              </button>

              {/* Facial Expression Filter */}
              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5 shadow-xs">
                <button
                  type="button"
                  onClick={() => setExpressionFilter('all')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                    expressionFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Show all expressions"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setExpressionFilter('smiling')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                    expressionFilter === 'smiling'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-500'
                  }`}
                  title="Filter strictly smiling & joyful photos"
                >
                  <Smile className="w-3.5 h-3.5" />
                  <span>Smiling</span>
                </button>
              </div>

              {/* Age Progression / Chronological Direction */}
              <button
                type="button"
                onClick={() => setChronologicalOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition shadow-xs ${
                  chronologicalOrder === 'asc'
                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
                title="Toggle between Newest First and Childhood / Growing Up progression"
              >
                <ArrowDownUp className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  {chronologicalOrder === 'asc' ? '🌱 Growing Up (Childhood First)' : 'Newest First'}
                </span>
              </button>
            </div>

            {/* Right: Selection status & Select All */}
            <div className="flex items-center gap-2">
              {selectedPhotoIds.length > 0 ? (
                <>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <strong className="text-indigo-600 dark:text-indigo-400">{selectedPhotoIds.length}</strong> selected
                  </span>
                  <button
                    onClick={() => setSelectedPhotoIds([])}
                    className="text-xs text-indigo-600 hover:underline font-semibold px-2 py-1"
                  >
                    Deselect All
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSelectedPhotoIds(allPersonPhotos.map((p) => p.id))}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Select All ({allPersonPhotos.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Timeline Groups */}
          {loadingTimeline ? (
            <div className="py-24 text-center text-slate-400 text-sm flex items-center justify-center gap-3">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
              <span>Loading {selectedPerson.name}&apos;s life timeline...</span>
            </div>
          ) : displayedTimeline.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-16 text-center space-y-3">
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-white text-base">No Photos Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                No photos match the current expression or time filters for {selectedPerson.name}.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {displayedTimeline.map((group) => (
                <DaySection
                  key={group.key || group.date}
                  group={group}
                  apiUrl={API_URL}
                  selectedIds={selectedPhotoIds}
                  density={density}
                  onSelect={(photo) => setSelectedPhoto(photo)}
                  onToggleSelect={handleItemClick}
                  onPointerDown={handlePointerDown}
                  onToggleSelectGroup={toggleSelectGroup}
                  onToggleFavorite={toggleFavorite}
                  onDelete={deletePhoto}
                  onOpenBurst={(bItem) => setInspectingBurstLead(bItem)}
                  onBackupToDrive={handleBackupSinglePhoto}
                />
              ))}
            </div>
          )}

          {/* Interactive Vertical Timeline Minimap Scrubber */}
          {personTimeline.length > 0 && <TimelineScrubber groups={personTimeline} />}
        </div>
      ) : (
        /* ========================================================
           VIEW MODE B: ALL PEOPLE & PETS DIRECTORY STUDIO
           ======================================================== */
        <>
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-200/60 dark:border-indigo-900/60 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-lg">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <span>People & Pets Studio</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
                  ArcFace 512-d biometric clustering, relationship categories, and big-screen life timelines.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleAutoCluster}
                  disabled={isClustering || isFaceClusterActive}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                  title="Automatically cluster faces with ArcFace biometric embeddings"
                >
                  <Sparkles
                    className={`w-3.5 h-3.5 ${
                      isClustering || isFaceClusterActive ? 'animate-spin text-amber-300' : ''
                    }`}
                  />
                  <span>
                    {isClustering || isFaceClusterActive ? 'Clustering...' : 'Auto-Cluster Faces'}
                  </span>
                </button>

                <button
                  onClick={handleScanFaces}
                  disabled={isScanning || isFaceDetectActive}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                  title="Scan library photos for new faces"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      isScanning || isFaceDetectActive ? 'animate-spin text-indigo-500' : ''
                    }`}
                  />
                  <span className="hidden sm:inline">
                    {isFaceDetectActive ? 'Scanning Library...' : 'Scan Library'}
                  </span>
                </button>

                <button
                  onClick={handleReclusterUnnamed}
                  disabled={isReclusteringUnnamed}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                  title="Re-cluster all unnamed groups ('Person 1', 'Person 2', ...) using current face similarity strictness, keeping all named people safe"
                >
                  <Sparkles
                    className={`w-3.5 h-3.5 text-purple-500 ${
                      isReclusteringUnnamed ? 'animate-spin' : ''
                    }`}
                  />
                  <span className="hidden sm:inline">
                    {isReclusteringUnnamed ? 'Re-clustering...' : 'Re-cluster Unnamed'}
                  </span>
                </button>

                <button
                  onClick={() => setShowMergeModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-sm transition"
                  title="Merge two duplicate person profiles"
                >
                  <Merge className="w-3.5 h-3.5 text-purple-500" />
                  <span className="hidden sm:inline">Manual Merge</span>
                </button>
              </div>
            </div>

            {/* Real-Time Stats Chips */}
            {stats && (
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-bold text-slate-900 dark:text-white">{stats.total_people}</span>
                  <span>People Identified</span>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-bold text-slate-900 dark:text-white">{stats.total_faces}</span>
                  <span>Faces Detected</span>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {stats.photos_with_faces}
                  </span>
                  <span>Photos with Faces</span>
                </div>

                {stats.total_pets !== undefined && stats.total_pets > 0 && (
                  <>
                    <span className="text-slate-300">•</span>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        {stats.total_pets}
                      </span>
                      <span>Pets (🐾 Dogs & Cats)</span>
                    </div>
                  </>
                )}

                {statusMessage && (
                  <div className="ml-auto flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800 animate-fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{statusMessage}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Merge Suggestions Banner */}
          {mergeSuggestions.length > 0 && !showHidden && (
            <div className="bg-gradient-to-r from-purple-950/70 via-indigo-950/50 to-slate-900 border border-purple-500/40 rounded-3xl p-5 shadow-xl space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                  <h3 className="font-bold text-sm text-white">
                    AI Duplicate Face Suggestions ({mergeSuggestions.length})
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  High-confidence biometric vector matches across people
                </span>
              </div>

              <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {mergeSuggestions.map((s) => (
                  <div
                    key={`${s.source_person.id}-${s.target_person.id}`}
                    className="flex-shrink-0 bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3 flex items-center gap-3 shadow-md"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border-2 border-purple-500/50 shadow-inner">
                        <img
                          src={buildMediaUrl(s.source_person.avatar_url)}
                          alt={s.source_person.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-white max-w-[90px] truncate">
                          {s.source_person.name}
                        </p>
                        <p className="text-[10px] text-slate-400">{s.source_person.faces_count} faces</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center px-1">
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.2 rounded-full">
                        {s.confidence_pct}% Match
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-purple-400 mt-0.5" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border-2 border-indigo-500/50 shadow-inner">
                        <img
                          src={buildMediaUrl(s.target_person.avatar_url)}
                          alt={s.target_person.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-white max-w-[90px] truncate">
                          {s.target_person.name}
                        </p>
                        <p className="text-[10px] text-slate-400">{s.target_person.faces_count} faces</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleQuickMerge(s.source_person.id, s.target_person.id)}
                      disabled={mergingId === `${s.source_person.id}-${s.target_person.id}`}
                      className="ml-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
                    >
                      {mergingId === `${s.source_person.id}-${s.target_person.id}` ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Merge'
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search, Filter Tabs & Relationship Pills */}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Tabs: People vs Untagged Faces */}
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl w-fit">
                <button
                  onClick={() => setActiveTab('people')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    activeTab === 'people'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Identified People & Pets ({people.length})
                </button>
                <button
                  onClick={() => setActiveTab('unnamed')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    activeTab === 'unnamed'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <span>Untagged Faces</span>
                  {stats && stats.unassigned_faces > 0 && (
                    <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                      {stats.unassigned_faces}
                    </span>
                  )}
                </button>
              </div>

              {/* Search Bar for People Directory */}
              {activeTab === 'people' && (
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchNameQuery}
                    onChange={(e) => setSearchNameQuery(e.target.value)}
                    placeholder={`Search ${people.length} people by name...`}
                    className="w-full text-xs pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 shadow-xs"
                  />
                  {searchNameQuery && (
                    <button
                      onClick={() => setSearchNameQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Filter Pills for People Tab */}
            {activeTab === 'people' && (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Relationship Filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {RELATIONSHIP_FILTERS.map((rf) => (
                    <button
                      key={rf.value}
                      onClick={() => setSelectedRelationship(rf.value)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                        selectedRelationship === rf.value
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {rf.label}
                    </button>
                  ))}
                </div>

                {/* Sub-Filters: People / Pets / Hidden */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-1 text-[11px] rounded-lg font-semibold transition ${
                      filterType === 'all'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    All Types
                  </button>
                  <button
                    onClick={() => setFilterType('people')}
                    className={`px-2.5 py-1 text-[11px] rounded-lg font-semibold transition ${
                      filterType === 'people'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    People Only
                  </button>
                  <button
                    onClick={() => setFilterType('pets')}
                    className={`px-2.5 py-1 text-[11px] rounded-lg font-semibold transition ${
                      filterType === 'pets'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    🐾 Pets Only
                  </button>
                  <button
                    onClick={() => setShowHidden(!showHidden)}
                    className={`px-2.5 py-1 text-[11px] rounded-lg font-semibold flex items-center gap-1 transition ${
                      showHidden
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {showHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showHidden ? 'Hidden Shown' : 'Hidden'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tab 1: People & Pets Studio Grid */}
          {activeTab === 'people' && (
            <>
              {loading ? (
                <div className="py-24 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                  <span>Loading identified people...</span>
                </div>
              ) : filteredPeople.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-16 text-center space-y-4">
                  <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white text-base">
                      {searchNameQuery ? `No people found matching "${searchNameQuery}"` : 'No People Identified Yet'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                      {searchNameQuery
                        ? 'Try clearing the search or checking spelling.'
                        : 'Run ArcFace face clustering to automatically identify and group people in your photos.'}
                    </p>
                  </div>
                  {!searchNameQuery && (
                    <button
                      onClick={handleAutoCluster}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition"
                    >
                      Auto-Cluster Faces Now
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {displayedPeople.map((person) => {
                    const avatarSrc = person.avatar_url
                      ? buildMediaUrl(person.avatar_url)
                      : person.cover_thumbnail_url
                      ? buildMediaUrl(person.cover_thumbnail_url)
                      : null;

                    return (
                      <div
                        key={person.id}
                        className="group bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 text-center space-y-3 shadow-sm hover:shadow-xl hover:border-indigo-400 dark:hover:border-indigo-600 transition-all duration-300 relative cursor-pointer"
                        onClick={() => openPersonTimeline(person)}
                      >
                        {/* Face Crop Avatar Circle */}
                        <div className="relative w-24 h-24 mx-auto rounded-full overflow-hidden bg-slate-900 ring-4 ring-slate-100 dark:ring-slate-800 group-hover:ring-indigo-500/50 transition-all duration-300 group-hover:scale-105 shadow-md">
                          {avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt={person.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <Users className="w-8 h-8" />
                            </div>
                          )}

                          {/* Hover Indicator */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="w-5 h-5 text-white drop-shadow-md" />
                          </div>
                        </div>

                        {/* Name & Inline Rename */}
                        <div onClick={(e) => e.stopPropagation()}>
                          {editingId === person.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveName(person.id)}
                                className="w-full text-xs font-bold text-center border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-800 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveName(person.id)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                title="Save Name"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingId(person.id);
                                setEditName(person.name);
                              }}
                              className="group/name flex items-center justify-center gap-1.5 cursor-pointer"
                              title="Click to rename"
                            >
                              <h4 className="font-bold text-xs text-slate-800 dark:text-white truncate max-w-[120px]">
                                {person.name}
                              </h4>
                              <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover/name:opacity-100 transition" />
                            </div>
                          )}

                          {/* Relationship Badge */}
                          {person.relationship_type && (
                            <div className="mt-1 flex justify-center">
                              <span className="text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                                {person.relationship_type}
                              </span>
                            </div>
                          )}

                          {person.is_pet && (
                            <div className="mt-1 flex justify-center">
                              <span className="text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                <span>🐾</span>
                                <span>{person.pet_type?.toUpperCase() || 'PET'}</span>
                              </span>
                            </div>
                          )}

                          {/* Photo Count */}
                          <div className="flex items-center justify-center gap-2 mt-1">
                            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold group-hover:underline">
                              {person.photo_count} {person.photo_count === 1 ? 'photo' : 'photos'}
                            </span>
                          </div>

                          {/* Life Timeline & Kiosk Quick Links */}
                          <div className="flex items-center justify-center gap-1.5 pt-2 mt-1 border-t border-slate-100 dark:border-slate-800">
                            <button
                              onClick={() => openPersonTimeline(person)}
                              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 px-2 py-0.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition"
                              title={`Open ${person.name}'s life timeline with scrubber & zoom`}
                            >
                              <Calendar className="w-3 h-3" />
                              <span>Timeline</span>
                            </button>
                            <Link
                              href={`/kiosk?person_id=${person.id}&person_name=${encodeURIComponent(person.name)}`}
                              className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 px-2 py-0.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/50 transition"
                              title={`Start ambient digital photo frame slideshow for ${person.name}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Kiosk</span>
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {visiblePeopleCount < filteredPeople.length && (
                    <div
                      ref={loadMoreSentinelRef}
                      className="col-span-full py-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                      <span>Loading more people ({visiblePeopleCount} of {filteredPeople.length})...</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Tab 2: Untagged Faces Review Tray with Visual Face Search */}
          {activeTab === 'unnamed' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Detected Faces Awaiting Label ({unnamedFaces.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Click &quot;Search Person&quot; on any face to instantly find and group all matching photos across your library.
                  </p>
                </div>
                <button
                  onClick={fetchUnnamedFaces}
                  className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 rounded-xl hover:bg-slate-50 transition"
                  title="Refresh untagged faces"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {unnamedFaces.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs">
                  All detected faces are assigned to named people!
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {unnamedFaces.map((face) => (
                    <div
                      key={face.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-center space-y-2 shadow-sm hover:shadow-md transition"
                    >
                      <div
                        onClick={() => openFaceInLightbox(face)}
                        className="w-20 h-20 mx-auto rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-100 dark:border-slate-800 shadow-sm cursor-pointer hover:border-indigo-500 transition hover:scale-105 group/crop relative"
                        title="Click to view full photo in full screen"
                      >
                        <img
                          src={buildMediaUrl(face.crop_url)}
                          alt={face.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/crop:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Maximize2 className="w-4 h-4" />
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-400 truncate max-w-[120px] mx-auto">
                        {face.filename}
                      </p>

                      {/* 1-Click Visual Search Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setSearchModalFaceId(face.id);
                          setIsSearchPersonOpen(true);
                        }}
                        className="w-full py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-[10px] font-bold shadow-xs flex items-center justify-center gap-1 transition"
                        title="Search & group all photos of this person in library"
                      >
                        <Search className="w-3 h-3 text-amber-300" />
                        <span>Search Person</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ========================================================
          MODALS & FLOATING CONTROLS
          ======================================================== */}

      {/* Floating 2D Drag Marquee Selection Box */}
      {isDragSelecting && marqueeBox && (
        <div
          className={`fixed pointer-events-none z-50 rounded-lg transition-colors border-2 ${
            dragMode === 'select'
              ? 'border-indigo-500 bg-indigo-500/20 shadow-lg shadow-indigo-500/10'
              : 'border-rose-500 bg-rose-500/20 shadow-lg shadow-rose-500/10'
          }`}
          style={{
            left: `${marqueeBox.left}px`,
            top: `${marqueeBox.top}px`,
            width: `${marqueeBox.width}px`,
            height: `${marqueeBox.height}px`,
          }}
        />
      )}

      {/* Floating Drag Status Pill */}
      {isDragSelecting && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 md:left-[calc(50%+8rem)] z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl backdrop-blur-md border border-slate-700/80 flex items-center gap-2 pointer-events-none animate-fadeIn">
          <div className={`w-2.5 h-2.5 rounded-full ${dragMode === 'select' ? 'bg-indigo-400' : 'bg-rose-400'}`} />
          <span>
            {dragMode === 'select' ? '✨ Dragging across photos to SELECT' : '🧹 Dragging across photos to DESELECT'}
          </span>
          <span className="text-slate-400 font-mono">
            {selectedPhotoIds.length} selected
          </span>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedPerson && selectedPhotoIds.length > 0 && (
        <BulkActionBar
          selectedIds={selectedPhotoIds}
          selectedPhotos={allPersonPhotos.filter((p) => selectedPhotoIds.includes(p.id))}
          apiUrl={API_URL}
          onClearSelection={() => setSelectedPhotoIds([])}
          onBatchFavorite={handleBatchFavorite}
          onBatchDelete={() => setShowBulkDeleteModal(true)}
          onBatchCategoryUpdated={() => {
            if (selectedPerson) fetchPersonTimeline(selectedPerson.id);
            setSelectedPhotoIds([]);
          }}
          onAlbumAdded={() => setSelectedPhotoIds([])}
          onBatchLocationUpdated={() => {
            if (selectedPerson) fetchPersonTimeline(selectedPerson.id);
            setSelectedPhotoIds([]);
          }}
          onBatchEnhanced={() => {
            if (selectedPerson) fetchPersonTimeline(selectedPerson.id);
            setSelectedPhotoIds([]);
          }}
          onBatchBackupToDrive={handleBackupBulkPhotos}
          onOpenGooglePhotosHelper={() => setShowGooglePhotosModal(true)}
          onRemoveFromPerson={handleRemoveSelectedFromPerson}
          removeFromPersonLabel="Not This Person"
        />
      )}

      {/* Full-Screen Lightbox Modal with Next/Prev Arrow Navigation */}
      <LightboxModal
        photo={selectedPhoto}
        apiUrl={API_URL}
        onClose={() => setSelectedPhoto(null)}
        onToggleFavorite={toggleFavorite}
        onDelete={deletePhoto}
        hasPrev={hasPrev}
        hasNext={hasNext}
        nextPhoto={nextPhoto}
        prevPhoto={prevPhoto}
        onNavigatePrev={navigatePrev}
        onNavigateNext={navigateNext}
        onSelectPhoto={(photoOrId) => {
          if (typeof photoOrId === 'number') {
            const found = allPersonPhotos.find((p) => p.id === photoOrId);
            if (found) setSelectedPhoto(found);
          } else {
            setSelectedPhoto(photoOrId);
          }
        }}
        onBackupToDrive={handleBackupSinglePhoto}
      />

      {/* Ambient Cinematic Slideshow Modal */}
      <AmbientSlideshowModal
        photos={allPersonPhotos}
        apiUrl={API_URL}
        isOpen={isSlideshowOpen}
        onClose={() => setIsSlideshowOpen(false)}
      />

      {/* Burst Inspector Modal */}
      <BurstInspectorModal
        leadItem={inspectingBurstLead}
        apiUrl={API_URL}
        isOpen={Boolean(inspectingBurstLead)}
        onClose={() => setInspectingBurstLead(null)}
        onResolved={() => {
          if (selectedPerson) fetchPersonTimeline(selectedPerson.id);
        }}
      />

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        itemCount={selectedPhotoIds.length}
        itemType="photos"
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={executeBatchDelete}
        onOpenGooglePhotosHelper={() => {
          setShowBulkDeleteModal(false);
          setShowGooglePhotosModal(true);
        }}
      />

      {/* Google Photos Cloud Deletion / Search Export Modal */}
      <GooglePhotosExportModal
        isOpen={showGooglePhotosModal}
        onClose={() => setShowGooglePhotosModal(false)}
        items={
          selectedPhotoIds.length > 0
            ? allPersonPhotos
                .filter((p) => selectedPhotoIds.includes(p.id))
                .map((p) => ({
                  id: p.id,
                  filename: p.filename,
                  file_size: p.file_size,
                  captured_at: p.captured_at,
                  thumbnail_url: p.thumbnail_url,
                }))
            : allPersonPhotos.map((p) => ({
                id: p.id,
                filename: p.filename,
                file_size: p.file_size,
                captured_at: p.captured_at,
                thumbnail_url: p.thumbnail_url,
              }))
        }
        title={`Google Photos Query: ${selectedPerson?.name || 'Person Photos'}`}
        subtitle="Search and manage this person's photos in your Google Photos cloud account"
      />

      {/* Google Drive Outbound Backup Modal */}
      <GoogleDriveBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        mediaIds={backupModalMediaIds}
        defaultFolderName={`MyMemoryPics / ${selectedPerson?.name || 'People'}`}
      />

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                <Merge className="w-4 h-4 text-purple-600" />
                <span>Merge Two People</span>
              </div>
              <button
                onClick={() => setShowMergeModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Combine all photos and face detections from the Source person into the Target person.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Merge From (Source person to dissolve):
                </label>
                <select
                  value={mergeSourceId || ''}
                  onChange={(e) => setMergeSourceId(Number(e.target.value))}
                  className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <option value="">Select source person...</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id === mergeTargetId}>
                      {p.name} ({p.photo_count} photos)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Into (Target Person to keep):
                </label>
                <select
                  value={mergeTargetId || ''}
                  onChange={(e) => setMergeTargetId(Number(e.target.value))}
                  className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <option value="">Select target person...</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id === mergeSourceId}>
                      {p.name} ({p.photo_count} photos)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {modalError && (
              <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50">
                {modalError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setModalError(null);
                }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleMergePeople}
                disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId || isMergingModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                {isMergingModal && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isMergingModal ? 'Merging...' : 'Confirm Merge'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Face Search & Grouping Modal */}
      <SearchPersonModal
        isOpen={isSearchPersonOpen}
        onClose={() => setIsSearchPersonOpen(false)}
        apiUrl={API_URL}
        faceId={searchModalFaceId}
        onGrouped={() => {
          fetchPeople();
          fetchUnnamedFaces();
          fetchMergeSuggestions();
        }}
      />
    </div>
  );
}
