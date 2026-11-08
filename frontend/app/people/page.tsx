'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  Edit2, 
  Check, 
  UserPlus, 
  Sparkles, 
  RefreshCw, 
  X, 
  ArrowRight, 
  Trash2, 
  Merge, 
  CheckCircle2, 
  Search, 
  Maximize2,
  Star,
  Eye,
  EyeOff,
  UserCheck,
  ChevronDown,
  Square,
  CheckSquare
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { SearchPersonModal } from '@/components/people/SearchPersonModal';
import { GooglePhotosExportModal } from '@/components/sync/GooglePhotosExportModal';
import { useDragSelect } from '@/hooks/useDragSelect';
import { useAuth } from '@/context/AuthContext';
import { useTaskQueue } from '@/context/TaskQueueContext';

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

interface PersonPhotoItem {
  id: number;
  filename: string;
  category: string;
  captured_at: string;
  location_name: string | null;
  is_favorite: boolean;
  thumbnail_url: string;
  file_size?: number;
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
  const [people, setPeople] = useState<PersonItem[]>([]);
  const [stats, setStats] = useState<PeopleStats | null>(null);
  const [unnamedFaces, setUnnamedFaces] = useState<UnnamedFaceItem[]>([]);
  const [activeTab, setActiveTab] = useState<'people' | 'unnamed'>('people');
  const [filterType, setFilterType] = useState<'all' | 'people' | 'pets'>('all');
  const [selectedRelationship, setSelectedRelationship] = useState<string>('all');
  const [showHidden, setShowHidden] = useState(false);

  // Merge Suggestions
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [mergingId, setMergingId] = useState<string | null>(null);

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [isClustering, setIsClustering] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Selected Person Gallery Modal
  const [selectedPerson, setSelectedPerson] = useState<PersonItem | null>(null);
  const [personPhotos, setPersonPhotos] = useState<PersonPhotoItem[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);
  const [showGooglePhotosModal, setShowGooglePhotosModal] = useState(false);

  // Lightbox
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [unnamedPhotoMedia, setUnnamedPhotoMedia] = useState<MediaItem | null>(null);

  // Merge modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [isMergingModal, setIsMergingModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Visual Face Search Modal
  const [searchModalFaceId, setSearchModalFaceId] = useState<number | null>(null);
  const [isSearchPersonOpen, setIsSearchPersonOpen] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

  useEffect(() => {
    fetchPeople();
    fetchMergeSuggestions();
  }, [fetchPeople, fetchMergeSuggestions]);

  useEffect(() => {
    if (activeTab === 'unnamed') {
      fetchUnnamedFaces();
    }
  }, [activeTab, fetchUnnamedFaces]);

  // Automatically refresh people, stats, and merge suggestions when face tasks complete
  const prevCompletedTasksCount = React.useRef(0);
  useEffect(() => {
    const completedFaceTasks = recentTasks.filter(
      (t) => (t.type === 'face_detect_all' || t.type === 'face_cluster_all') && t.status === 'completed'
    ).length;
    if (completedFaceTasks > prevCompletedTasksCount.current) {
      prevCompletedTasksCount.current = completedFaceTasks;
      fetchPeople();
      fetchMergeSuggestions();
      if (activeTab === 'unnamed') fetchUnnamedFaces();
    }
  }, [recentTasks, fetchPeople, fetchMergeSuggestions, fetchUnnamedFaces, activeTab]);

  // Load photos when a person is selected
  const openPersonGallery = async (person: PersonItem) => {
    setSelectedPerson(person);
    setSelectedPhotoIds([]);
    setLoadingPhotos(true);
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${person.id}/photos`, { headers });
      if (res.ok) {
        setPersonPhotos(await res.json());
      }
    } catch (e) {
      console.error('Error loading person photos:', e);
    } finally {
      setLoadingPhotos(false);
    }
  };

  // 2D Drag-and-Select & Single-Click Select / Double-Click View Hook for Person Photos
  const {
    isDragging: isDragSelecting,
    dragMode,
    marqueeBox,
    handlePointerDown,
    handleItemClick,
    handleItemDoubleClick,
  } = useDragSelect({
    selectedIds: selectedPhotoIds,
    setSelectedIds: setSelectedPhotoIds,
    orderedIds: personPhotos.map((p) => p.id),
    onOpenLightbox: (id) => {
      const idx = personPhotos.findIndex((p) => p.id === id);
      if (idx !== -1) setSelectedPhotoIndex(idx);
    },
  });

  const handleBatchTrashPersonPhotos = async (ids: number[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Move ${ids.length} photo(s) to Trash?`)) return;
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/media/batch-delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ media_ids: ids, permanent: false }),
      });
      if (res.ok) {
        setPersonPhotos((prev) => prev.filter((p) => !ids.includes(p.id)));
        setSelectedPhotoIds([]);
      }
    } catch (e) {
      console.error('Failed to trash photos:', e);
    }
  };

  const handleSaveName = async (id: number) => {
    if (!editName.trim()) return;
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: editName.trim() })
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
        body: JSON.stringify({ relationship_type: rel || null })
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

  const handleSetCover = async (personId: number, mediaId: number) => {
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${personId}/cover`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ media_id: mediaId })
      });
      if (res.ok) {
        fetchPeople();
        setStatusMessage('Profile cover updated!');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error('Set cover error:', e);
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
        body: JSON.stringify({ is_hidden: shouldHide })
      });
      if (res.ok) {
        setSelectedPerson(null);
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
        body: JSON.stringify({ source_person_id: sourceId, target_person_id: targetId })
      });

      if (res.ok) {
        // Purge any suggestion containing the dissolved source person ID
        setMergeSuggestions((prev) =>
          prev.filter((s) => s.source_person.id !== sourceId && s.target_person.id !== sourceId)
        );
        fetchPeople();
        setStatusMessage('Profiles merged successfully!');
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        const err = await res.json().catch(() => ({ detail: 'Merge failed.' }));
        if (res.status === 404) {
          // Already merged in a prior action, remove stale card
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

  // Run AI Auto-Clustering with ArcFace 512-d embeddings
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

  // Scan library photos for human faces and household pets
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
        if (data.status === 'queued') {
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
          target_person_id: mergeTargetId
        })
      });
      if (res.ok) {
        setShowMergeModal(false);
        setMergeSourceId(null);
        setMergeTargetId(null);
        setModalError(null);
        if (selectedPerson && selectedPerson.id === mergeSourceId) {
          setSelectedPerson(null);
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
    setUnnamedPhotoMedia({
      id: face.media_id,
      filename: face.filename,
      category: 'memory',
      width: 1920,
      height: 1080,
      captured_at: face.captured_at || new Date().toISOString(),
      is_favorite: false,
      is_blurry: false,
      thumbnail_url: `/api/v1/media/${face.media_id}/thumbnail?size=256`
    });
  };

  const openPersonFullscreen = async (person: PersonItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedPerson(person);
    setLoadingPhotos(true);
    try {
      const token = getActiveToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/people/${person.id}/photos`, { headers });
      if (res.ok) {
        const photos = await res.json();
        setPersonPhotos(photos);
        if (photos.length > 0) {
          setSelectedPhotoIndex(0);
        }
      }
    } catch (e) {
      console.error('Error loading person photos for fullscreen:', e);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const activeMediaItem: MediaItem | null = unnamedPhotoMedia
    ? unnamedPhotoMedia
    : selectedPhotoIndex !== null && personPhotos[selectedPhotoIndex]
    ? {
        id: personPhotos[selectedPhotoIndex].id,
        filename: personPhotos[selectedPhotoIndex].filename,
        category: personPhotos[selectedPhotoIndex].category,
        width: 1920,
        height: 1080,
        captured_at: personPhotos[selectedPhotoIndex].captured_at,
        is_favorite: personPhotos[selectedPhotoIndex].is_favorite,
        is_blurry: false,
        location_name: personPhotos[selectedPhotoIndex].location_name,
        thumbnail_url: personPhotos[selectedPhotoIndex].thumbnail_url,
      }
    : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-200/60 dark:border-indigo-900/60 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-lg">
              <Users className="w-5 h-5 text-indigo-600" />
              <span>People & Face Management Studio</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
              Automatic face clustering, ArcFace biometric matching, relationship management, and 1-click visual face search.
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
              <Sparkles className={`w-3.5 h-3.5 ${(isClustering || isFaceClusterActive) ? 'animate-spin text-amber-300' : ''}`} />
              <span>{isClustering || isFaceClusterActive ? 'Clustering...' : 'Auto-Cluster Faces'}</span>
            </button>

            <button
              onClick={handleScanFaces}
              disabled={isScanning || isFaceDetectActive}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Scan library photos for new faces"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(isScanning || isFaceDetectActive) ? 'animate-spin text-indigo-500' : ''}`} />
              <span className="hidden sm:inline">{isFaceDetectActive ? 'Scanning Library...' : 'Scan Library'}</span>
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
              <span className="font-bold text-slate-900 dark:text-white">{stats.photos_with_faces}</span>
              <span>Photos with Faces</span>
            </div>

            {stats.total_pets !== undefined && stats.total_pets > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-bold text-amber-600 dark:text-amber-400">{stats.total_pets}</span>
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

      {/* AI Merge Same Person Suggestions Banner */}
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
                  type="button"
                  onClick={() => handleQuickMerge(s.source_person.id, s.target_person.id)}
                  disabled={mergingId === `${s.source_person.id}-${s.target_person.id}`}
                  className="ml-2 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                >
                  {mergingId === `${s.source_person.id}-${s.target_person.id}` ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Merge className="w-3.5 h-3.5" />
                  )}
                  <span>Merge</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTab('people');
              setShowHidden(false);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'people' && !showHidden
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Identified People ({people.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('unnamed')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'unnamed'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Untagged Faces Review Tray</span>
          </button>
        </div>

        {/* Hidden People Toggle */}
        <button
          onClick={() => {
            setShowHidden(!showHidden);
            setActiveTab('people');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
            showHidden
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
          title="Toggle view of hidden people"
        >
          {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{showHidden ? 'Viewing Hidden People' : 'Hidden People'}</span>
        </button>
      </div>

      {/* Tab 1: Identified People Grid */}
      {activeTab === 'people' && (
        <>
          {/* Sub-Filters: Type & Relationship Category */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  filterType === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                All ({people.length})
              </button>
              <button
                onClick={() => setFilterType('people')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  filterType === 'people'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                People ({people.filter((p) => !p.is_pet).length})
              </button>
              <button
                onClick={() => setFilterType('pets')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  filterType === 'pets'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>🐾 Pets ({people.filter((p) => p.is_pet).length})</span>
              </button>
            </div>

            {/* Relationship Category Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 font-medium">Category:</span>
              {RELATIONSHIP_FILTERS.map((rf) => (
                <button
                  key={rf.value}
                  onClick={() => setSelectedRelationship(rf.value)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition ${
                    selectedRelationship === rf.value
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {rf.label}
                </button>
              ))}
            </div>
          </div>

          {people.length === 0 && !loading && (
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <Users className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {showHidden ? 'No Hidden People' : 'No People in this Category'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {showHidden
                    ? 'You have not hidden any person profiles.'
                    : 'Click "Auto-Cluster Faces" or use Visual Face Search to group your loved ones.'}
                </p>
              </div>
              {!showHidden && (
                <button
                  onClick={handleAutoCluster}
                  disabled={isClustering}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md transition"
                >
                  Auto-Cluster Faces Now
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {people.map((person) => {
              const avatarSrc = person.avatar_url
                ? buildMediaUrl(person.avatar_url)
                : person.cover_thumbnail_url
                ? buildMediaUrl(person.cover_thumbnail_url)
                : null;

              return (
                <div
                  key={person.id}
                  className="group bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 text-center space-y-3 shadow-sm hover:shadow-xl hover:border-indigo-400 dark:hover:border-indigo-600 transition-all duration-300 relative"
                >
                  {/* Face Crop Avatar Circle */}
                  <div
                    onClick={() => openPersonGallery(person)}
                    className="relative w-24 h-24 mx-auto rounded-full overflow-hidden bg-slate-900 ring-4 ring-slate-100 dark:ring-slate-800 group-hover:ring-indigo-500/50 cursor-pointer transition-all duration-300 group-hover:scale-105 shadow-md"
                  >
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt={person.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Users className="w-8 h-8" />
                      </div>
                    )}

                    {/* Hover Inspect & Fullscreen Indicator */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2">
                      <button
                        onClick={(e) => openPersonFullscreen(person, e)}
                        className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition hover:scale-110"
                        title="View Fullscreen Lightbox"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Name & Inline Rename */}
                  <div>
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

                    {/* Photo Count & Gallery Trigger */}
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <button
                        onClick={() => openPersonGallery(person)}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                        title="Browse all photos in gallery"
                      >
                        {person.photo_count} {person.photo_count === 1 ? 'photo' : 'photos'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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

      {/* Selected Person Gallery Modal */}
      {selectedPerson && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-900 border-2 border-indigo-500 shadow-md">
                  {selectedPerson.avatar_url ? (
                    <img
                      src={buildMediaUrl(selectedPerson.avatar_url)}
                      alt={selectedPerson.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <Users className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{selectedPerson.name}</span>
                    {selectedPerson.is_pet && (
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
                        🐾 {selectedPerson.pet_type?.toUpperCase()}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {personPhotos.length} photos with confirmed facial detections
                  </p>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Relationship Dropdown */}
                <select
                  value={selectedPerson.relationship_type || ''}
                  onChange={(e) => handleUpdateRelationship(selectedPerson.id, e.target.value)}
                  className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:border-indigo-500"
                >
                  <option value="">No Category</option>
                  <option value="Family">👨‍👩‍👧 Family</option>
                  <option value="Friends">🤝 Friends</option>
                  <option value="Partner">❤️ Partner</option>
                  <option value="Work">💼 Work</option>
                  <option value="Self">👤 Self</option>
                  <option value="Other">🏷️ Other</option>
                </select>

                {/* Hide / Unhide Person */}
                <button
                  onClick={() =>
                    handleToggleHidePerson(selectedPerson.id, !selectedPerson.is_hidden)
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-400 rounded-xl text-xs font-semibold transition"
                  title={selectedPerson.is_hidden ? 'Unhide this person' : 'Hide from library'}
                >
                  {selectedPerson.is_hidden ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  <span>{selectedPerson.is_hidden ? 'Unhide' : 'Hide'}</span>
                </button>

                {/* Merge Button */}
                <button
                  onClick={() => {
                    setMergeSourceId(selectedPerson.id);
                    setShowMergeModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
                  title="Merge this person into another identity"
                >
                  <Merge className="w-3.5 h-3.5 text-purple-500" />
                  <span>Merge Person</span>
                </button>

                <button
                  onClick={() => setSelectedPerson(null)}
                  className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Selection Action Toolbar */}
            {personPhotos.length > 0 && (
              <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (selectedPhotoIds.length === personPhotos.length) {
                        setSelectedPhotoIds([]);
                      } else {
                        setSelectedPhotoIds(personPhotos.map((p) => p.id));
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold transition"
                  >
                    {selectedPhotoIds.length === personPhotos.length ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>{selectedPhotoIds.length === personPhotos.length ? 'Deselect All' : `Select All (${personPhotos.length})`}</span>
                  </button>

                  {selectedPhotoIds.length > 0 && (
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      <strong className="text-indigo-600 dark:text-indigo-400">{selectedPhotoIds.length}</strong> photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGooglePhotosModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold transition shadow-xs"
                    title="Generate Google Photos search queries for these photos"
                  >
                    <Search className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Google Photos Query {selectedPhotoIds.length > 0 ? `(${selectedPhotoIds.length})` : ''}</span>
                  </button>

                  {selectedPhotoIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBatchTrashPersonPhotos(selectedPhotoIds)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-xl font-semibold transition"
                      title="Move selected photos to trash"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Trash ({selectedPhotoIds.length})</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Photos Grid with Set Cover Buttons */}
            <div className="flex-1 overflow-y-auto p-6" onPointerDown={handlePointerDown}>
              {loadingPhotos ? (
                <div className="py-20 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                  <span>Loading photos for {selectedPerson.name}...</span>
                </div>
              ) : personPhotos.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-xs">
                  No photos found for this person.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {personPhotos.map((photo, index) => {
                    const isSelected = selectedPhotoIds.includes(photo.id);
                    return (
                      <div
                        key={photo.id}
                        data-media-id={photo.id}
                        onPointerDown={(e) => handlePointerDown(e, photo.id)}
                        onClick={(e) => handleItemClick(photo.id, e, personPhotos.map((p) => p.id))}
                        onDoubleClick={(e) => handleItemDoubleClick(photo.id, e)}
                        title="Click to select/deselect • Double-click to view full image • Click & drag to multi-select"
                        className={`group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm select-none ${
                          isSelected
                            ? 'border-indigo-600 ring-2 ring-indigo-500/40'
                            : 'border-slate-200/60 dark:border-slate-800 hover:shadow-xl'
                        }`}
                      >
                        <img
                          src={buildMediaUrl(photo.thumbnail_url)}
                          alt={photo.filename}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 select-none pointer-events-none"
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

                        {/* Set Cover Hover Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetCover(selectedPerson.id, photo.id);
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-amber-600 text-white opacity-0 group-hover:opacity-100 transition shadow-md z-10"
                          title="Set as profile cover"
                        >
                          <Star className="w-3 h-3 text-amber-300" />
                        </button>

                        {/* Bottom Details Vignette */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5 pointer-events-none">
                          <p className="text-white text-[11px] font-semibold truncate leading-tight">
                            {photo.filename}
                          </p>
                          <p className="text-slate-300 text-[10px] font-mono mt-0.5">
                            {new Date(photo.captured_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Integrated Lightbox Modal with Next/Prev navigation */}
      <LightboxModal
        photo={activeMediaItem}
        apiUrl={API_URL}
        onClose={() => {
          setSelectedPhotoIndex(null);
          setUnnamedPhotoMedia(null);
        }}
        onToggleFavorite={() => {}}
        onDelete={() => {}}
        hasPrev={selectedPhotoIndex !== null && selectedPhotoIndex > 0}
        hasNext={selectedPhotoIndex !== null && selectedPhotoIndex < personPhotos.length - 1}
        onNavigatePrev={() => {
          if (selectedPhotoIndex !== null && selectedPhotoIndex > 0) {
            setSelectedPhotoIndex(selectedPhotoIndex - 1);
          }
        }}
        onNavigateNext={() => {
          if (selectedPhotoIndex !== null && selectedPhotoIndex < personPhotos.length - 1) {
            setSelectedPhotoIndex(selectedPhotoIndex + 1);
          }
        }}
      />

      {/* Google Photos Cloud Deletion / Search Export Modal */}
      <GooglePhotosExportModal
        isOpen={showGooglePhotosModal}
        onClose={() => setShowGooglePhotosModal(false)}
        items={
          selectedPhotoIds.length > 0
            ? personPhotos
                .filter((p) => selectedPhotoIds.includes(p.id))
                .map((p) => ({
                  id: p.id,
                  filename: p.filename,
                  file_size: p.file_size,
                  captured_at: p.captured_at,
                  thumbnail_url: p.thumbnail_url,
                }))
            : personPhotos.map((p) => ({
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

      {/* Drag Status Pill */}
      {isDragSelecting && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl backdrop-blur-md border border-slate-700/80 flex items-center gap-2 pointer-events-none animate-fadeIn">
          <div className={`w-2.5 h-2.5 rounded-full ${dragMode === 'select' ? 'bg-indigo-400' : 'bg-rose-400'}`} />
          <span>
            {dragMode === 'select' ? '✨ Dragging across photos to SELECT' : '🧹 Dragging across photos to DESELECT'}
          </span>
          <span className="text-slate-400 font-mono">
            {selectedPhotoIds.length} selected
          </span>
        </div>
      )}
    </div>
  );
}
