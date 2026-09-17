'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  Edit2, 
  Check, 
  UserPlus, 
  Sparkles, 
  RefreshCw, 
  Layers, 
  X, 
  ArrowRight, 
  Trash2, 
  Merge, 
  Image as ImageIcon,
  CheckCircle2,
  Calendar,
  MapPin,
  ExternalLink,
  Search,
  Maximize2
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { useTaskQueue } from '@/context/TaskQueueContext';

interface PersonItem {
  id: number;
  name: string;
  photo_count: number;
  faces_count: number;
  avatar_url: string | null;
  cover_thumbnail_url: string | null;
}

interface PeopleStats {
  total_faces: number;
  total_people: number;
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
}

export default function PeoplePage() {
  const [people, setPeople] = useState<PersonItem[]>([]);
  const [stats, setStats] = useState<PeopleStats | null>(null);
  const [unnamedFaces, setUnnamedFaces] = useState<UnnamedFaceItem[]>([]);
  const [activeTab, setActiveTab] = useState<'people' | 'unnamed'>('people');

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

  // Lightbox
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [unnamedPhotoMedia, setUnnamedPhotoMedia] = useState<MediaItem | null>(null);

  // Merge modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);

  // Quick face tagger
  const [namingFaceId, setNamingFaceId] = useState<number | null>(null);
  const [newPersonName, setNewPersonName] = useState('');

  const { dispatchTask } = useTaskQueue();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchPeople = useCallback(async () => {
    try {
      setLoading(true);
      const [peopleRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/people`),
        fetch(`${API_URL}/api/v1/people/stats`)
      ]);
      if (peopleRes.ok) setPeople(await peopleRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      console.error('Error fetching people:', e);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const fetchUnnamedFaces = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/people/unnamed-faces?limit=60`);
      if (res.ok) setUnnamedFaces(await res.json());
    } catch (e) {
      console.error('Error fetching unnamed faces:', e);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  useEffect(() => {
    if (activeTab === 'unnamed') {
      fetchUnnamedFaces();
    }
  }, [activeTab, fetchUnnamedFaces]);

  // Load photos when a person is selected
  const openPersonGallery = async (person: PersonItem) => {
    setSelectedPerson(person);
    setLoadingPhotos(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/people/${person.id}/photos`);
      if (res.ok) {
        setPersonPhotos(await res.json());
      }
    } catch (e) {
      console.error('Error loading person photos:', e);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handleSaveName = async (id: number) => {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/people/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() })
      });
      if (res.ok) {
        const updated = await res.json();
        setPeople(prev => prev.map(p => p.id === id ? { ...p, name: updated.name } : p));
        if (selectedPerson && selectedPerson.id === id) {
          setSelectedPerson(prev => prev ? { ...prev, name: updated.name } : null);
        }
        setEditingId(null);
        setStatusMessage(`Renamed to "${updated.name}"`);
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Run AI Auto-Clustering via Background Worker
  const handleAutoCluster = async () => {
    dispatchTask('face_cluster_all', {}, 'Vision Person Face Clustering');
  };

  // Scan library photos for faces via Background Worker
  const handleScanFaces = async () => {
    dispatchTask('face_detect_all', {}, 'UltraFace Face Detection');
  };

  // Assign name to an unnamed face
  const handleAssignFaceName = async (faceId: number) => {
    if (!newPersonName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/people/faces/${faceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_name: newPersonName.trim() })
      });
      if (res.ok) {
        setNamingFaceId(null);
        setNewPersonName('');
        fetchUnnamedFaces();
        fetchPeople();
        setStatusMessage('Face assigned successfully!');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Merge two people
  const handleMergePeople = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/people/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_person_id: mergeSourceId,
          target_person_id: mergeTargetId
        })
      });
      if (res.ok) {
        setShowMergeModal(false);
        setMergeSourceId(null);
        setMergeTargetId(null);
        if (selectedPerson && selectedPerson.id === mergeSourceId) {
          setSelectedPerson(null);
        }
        fetchPeople();
        setStatusMessage('People successfully merged!');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
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
      const res = await fetch(`${API_URL}/api/v1/people/${person.id}/photos`);
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

  // Active Lightbox Photo
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
              People & Face Recognition
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
              Automatic face detection and vector clustering powered by UltraFace ONNX & CLIP Vision.
              Faces are clustered into individuals so you can easily label family, friends, and special moments.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleAutoCluster}
              disabled={isClustering}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Automatically cluster faces with vector embeddings"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isClustering ? 'animate-spin text-amber-300' : ''}`} />
              <span>{isClustering ? 'Clustering...' : 'Auto-Cluster Faces'}</span>
            </button>

            <button
              onClick={handleScanFaces}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Scan library photos for new faces"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-indigo-500' : ''}`} />
              <span className="hidden sm:inline">Scan Library</span>
            </button>

            <button
              onClick={() => setShowMergeModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-sm transition"
              title="Merge two duplicate person profiles"
            >
              <Merge className="w-3.5 h-3.5 text-purple-500" />
              <span className="hidden sm:inline">Merge</span>
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

            {statusMessage && (
              <div className="ml-auto flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800 animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>{statusMessage}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('people')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'people'
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

      {/* Tab 1: Identified People Grid */}
      {activeTab === 'people' && (
        <>
          {people.length === 0 && !loading && (
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <Users className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">No People Clustered Yet</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Click "Auto-Cluster Faces" to group detected faces using offline vision embeddings.
                </p>
              </div>
              <button
                onClick={handleAutoCluster}
                disabled={isClustering}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md transition"
              >
                Auto-Cluster Faces Now
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {people.map((person) => {
              const avatarSrc = person.avatar_url
                ? `${API_URL}${person.avatar_url}`
                : person.cover_thumbnail_url
                ? `${API_URL}${person.cover_thumbnail_url}`
                : null;

              return (
                <div
                  key={person.id}
                  className="group bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 text-center space-y-3 shadow-sm hover:shadow-xl hover:border-indigo-400 dark:hover:border-indigo-600 transition-all duration-300"
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

                    {/* Photo Count & Fullscreen Actions */}
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <button
                        onClick={() => openPersonGallery(person)}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                        title="Browse all photos in gallery"
                      >
                        {person.photo_count} {person.photo_count === 1 ? 'photo' : 'photos'}
                      </button>
                      <button
                        onClick={(e) => openPersonFullscreen(person, e)}
                        className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md transition hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Open in full screen"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Tab 2: Untagged Faces Review Tray */}
      {activeTab === 'unnamed' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Detected Faces Awaiting Label
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                These faces were detected in your library. Click to name them or assign to an existing person.
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
                      src={`${API_URL}${face.crop_url}`}
                      alt={face.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/crop:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                  </div>

                  {namingFaceId === face.id ? (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        placeholder="Person name..."
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAssignFaceName(face.id)}
                        className="w-full text-xs border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                      />
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleAssignFaceName(face.id)}
                          className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setNamingFaceId(null)}
                          className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 text-[10px] rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <button
                        onClick={() => {
                          setNamingFaceId(face.id);
                          setNewPersonName('');
                        }}
                        className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-semibold transition"
                      >
                        + Name Person
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Person Photo Gallery Modal */}
      {selectedPerson && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-900 border-2 border-indigo-500 shadow-md flex-shrink-0">
                  {selectedPerson.avatar_url ? (
                    <img
                      src={`${API_URL}${selectedPerson.avatar_url}`}
                      alt={selectedPerson.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white">
                      <Users className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                      {selectedPerson.name}
                    </h2>
                    <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold px-2.5 py-0.5 rounded-full">
                      {personPhotos.length} {personPhotos.length === 1 ? 'photo' : 'photos'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Viewing all memories featuring this person
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (personPhotos.length > 0) {
                      setSelectedPhotoIndex(0);
                    }
                  }}
                  disabled={personPhotos.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50 hover:scale-[1.02]"
                  title="View this person's photos in full-screen lightbox"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>View Fullscreen</span>
                </button>

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

            {/* Photos Grid */}
            <div className="flex-1 overflow-y-auto p-6">
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
                  {personPhotos.map((photo, index) => (
                    <div
                      key={photo.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPhotoIndex(index);
                      }}
                      className="group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-pointer border border-slate-200/60 dark:border-slate-800 hover:shadow-xl hover:scale-[1.03] transition-all duration-300"
                    >
                      <img
                        src={`${API_URL}${photo.thumbnail_url}`}
                        alt={photo.filename}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />

                      {/* Vignette Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5">
                        <p className="text-white text-[11px] font-semibold truncate leading-tight">
                          {photo.filename}
                        </p>
                        <p className="text-slate-300 text-[10px] font-mono mt-0.5">
                          {new Date(photo.captured_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
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
                Merge Two People
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
                  Merge From (Source to be merged):
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

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowMergeModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleMergePeople}
                disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                Confirm Merge
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
