'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  FolderPlus, 
  BookOpen, 
  Trash2, 
  ArrowLeft, 
  Image as ImageIcon, 
  Plus, 
  Play, 
  Sparkles, 
  MapPin, 
  Compass, 
  Users, 
  Heart, 
  Download, 
  Search, 
  Check, 
  X, 
  Edit3, 
  Layers, 
  Calendar, 
  CheckSquare, 
  Square,
  ChevronRight,
  Filter,
  QrCode,
  Share2,
  Cloud
} from 'lucide-react';
import { PhotoCard, MediaItem } from '@/components/timeline/PhotoCard';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { AmbientSlideshowModal } from '@/components/timeline/AmbientSlideshowModal';
import { BulkDeleteModal } from '@/components/timeline/BulkDeleteModal';
import { ShareEventModal } from '@/components/albums/ShareEventModal';
import { GoogleDriveBackupModal } from '@/components/sync/GoogleDriveBackupModal';
import { GooglePhotosExportModal } from '@/components/sync/GooglePhotosExportModal';
import { useDragSelect } from '@/hooks/useDragSelect';
import { useAuth } from '@/context/AuthContext';
import { getApiUrl } from '@/utils/apiUrl';

interface AlbumItem {
  id: number;
  name: string;
  description: string | null;
  photo_count: number;
  cover_thumbnail_url: string | null;
  is_dynamic?: boolean;
  rules?: any;
  share_token?: string | null;
  is_public?: boolean;
  allow_guest_uploads?: boolean;
  created_at: string;
}

interface SmartPlace {
  location_name: string;
  city: string;
  photo_count: number;
  cover_id: number | null;
  cover_thumbnail_url: string | null;
}

interface SmartTrip {
  id?: string;
  title: string;
  date: string;
  photo_count: number;
  cover_id: number | null;
  cover_thumbnail_url: string | null;
  media_ids: number[];
}

interface SmartPerson {
  id: number;
  name: string;
  photo_count: number;
  faces_count: number;
  avatar_url: string | null;
  cover_thumbnail_url: string | null;
}

interface SmartCollectionsData {
  places: SmartPlace[];
  trips: SmartTrip[];
  people: SmartPerson[];
  favorites: {
    count: number;
    cover_id: number | null;
    cover_thumbnail_url: string | null;
  };
  categories: {
    screenshots: number;
    receipts_bills: number;
    blurry: number;
  };
}

interface SelectedCollectionState {
  type: 'album' | 'place' | 'trip' | 'people' | 'favorites';
  id?: number | string;
  name: string;
  description?: string | null;
  is_dynamic?: boolean;
  rules?: any;
  photo_count: number;
  photos: MediaItem[];
}

interface AvailablePhotoItem {
  id: number;
  filename: string;
  captured_at: string | null;
  location_name: string | null;
  thumbnail_url: string;
  in_album: boolean;
}

export default function AlbumsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'albums' | 'places' | 'trips' | 'people'>('all');
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [smartCollections, setSmartCollections] = useState<SmartCollectionsData | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<SelectedCollectionState | null>(null);
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sharingAlbum, setSharingAlbum] = useState<AlbumItem | null>(null);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [newAlbumDesc, setNewAlbumDesc] = useState('');
  const [isDynamicAlbum, setIsDynamicAlbum] = useState(false);
  const [dynamicQuery, setDynamicQuery] = useState('');
  const [dynamicOnlyFavs, setDynamicOnlyFavs] = useState(false);
  const [isCurating, setIsCurating] = useState(false);
  
  // Photo Picker Modal state
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [availablePhotos, setAvailablePhotos] = useState<AvailablePhotoItem[]>([]);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<number[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [isAddingPhotos, setIsAddingPhotos] = useState(false);

  // Lightbox & Slideshow state
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [loading, setLoading] = useState(true);

  // Collection Group Multi-Select & Batch Delete State
  const [collectionSelectedIds, setCollectionSelectedIds] = useState<number[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showGooglePhotosModal, setShowGooglePhotosModal] = useState(false);
  const [isRemovingFromAlbum, setIsRemovingFromAlbum] = useState(false);

  // 2D Marquee Drag-and-Select & Range Selection Hook for Album Collections
  const collectionOrderedIds = (selectedCollection?.photos || []).map((p) => p.id);

  const {
    isDragging: isDragSelectingCollection,
    dragMode: collectionDragMode,
    marqueeBox: collectionMarqueeBox,
    handlePointerDown: handleCollectionPointerDown,
    handleItemClick: handleCollectionItemClick,
    handleItemDoubleClick: handleCollectionItemDoubleClick,
  } = useDragSelect({
    selectedIds: collectionSelectedIds,
    setSelectedIds: setCollectionSelectedIds,
    orderedIds: collectionOrderedIds,
    onOpenLightbox: (id) => {
      const found = selectedCollection?.photos.find((p) => p.id === id);
      if (found) setSelectedPhoto(found);
    },
  });

  // Google Drive Outbound Backup state
  const [backupModalMediaIds, setBackupModalMediaIds] = useState<number[]>([]);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupModalDefaultFolder, setBackupModalDefaultFolder] = useState<string>('MyMemoryPics / Backups');

  const handleBackupSinglePhoto = (photo: MediaItem) => {
    setBackupModalMediaIds([photo.id]);
    setBackupModalDefaultFolder(
      selectedCollection ? `MyMemoryPics / ${selectedCollection.name}` : 'MyMemoryPics / Backups'
    );
    setIsBackupModalOpen(true);
  };

  const handleBackupAlbumToDrive = () => {
    if (!selectedCollection || selectedCollection.photos.length === 0) return;
    const mediaIds = collectionSelectedIds.length > 0
      ? collectionSelectedIds
      : selectedCollection.photos.map((p) => p.id);
    setBackupModalMediaIds(mediaIds);
    setBackupModalDefaultFolder(`MyMemoryPics / ${selectedCollection.name}`);
    setIsBackupModalOpen(true);
  };

  // Clear selection when active collection changes
  useEffect(() => {
    setCollectionSelectedIds([]);
  }, [selectedCollection?.name, selectedCollection?.id]);

  const handleToggleCollectionSelect = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCollectionSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllInCollection = () => {
    if (!selectedCollection || selectedCollection.photos.length === 0) return;
    if (collectionSelectedIds.length === selectedCollection.photos.length) {
      setCollectionSelectedIds([]);
    } else {
      setCollectionSelectedIds(selectedCollection.photos.map((p) => p.id));
    }
  };

  // Lightbox Navigation inside the current collection
  const currentPhotoIndex = selectedPhoto && selectedCollection
    ? selectedCollection.photos.findIndex((p) => p.id === selectedPhoto.id)
    : -1;
  const hasPrev = currentPhotoIndex > 0;
  const hasNext = selectedCollection
    ? currentPhotoIndex >= 0 && currentPhotoIndex < selectedCollection.photos.length - 1
    : false;
  const prevPhoto = hasPrev && selectedCollection ? selectedCollection.photos[currentPhotoIndex - 1] : null;
  const nextPhoto = hasNext && selectedCollection ? selectedCollection.photos[currentPhotoIndex + 1] : null;

  const navigatePrev = () => {
    if (hasPrev && selectedCollection) {
      setSelectedPhoto(selectedCollection.photos[currentPhotoIndex - 1]);
    }
  };

  const navigateNext = () => {
    if (hasNext && selectedCollection) {
      setSelectedPhoto(selectedCollection.photos[currentPhotoIndex + 1]);
    }
  };

  // Inline edit album
  const [isEditingAlbum, setIsEditingAlbum] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [albumsRes, smartRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/albums`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/v1/albums/collections/smart`, { headers: authHeaders() })
      ]);

      if (albumsRes.ok) {
        const albumsData = await albumsRes.json();
        setAlbums(albumsData);
      }
      if (smartRes.ok) {
        const smartData = await smartRes.json();
        setSmartCollections(smartData);
      }
    } catch (e) {
      console.error('Error loading albums and collections:', e);
    } finally {
      setLoading(false);
    }
  }, [API_URL, authHeaders]);

  useEffect(() => {
    loadData();
    const handleUploaded = () => loadData();
    window.addEventListener('media-uploaded', handleUploaded);
    return () => window.removeEventListener('media-uploaded', handleUploaded);
  }, [loadData]);

  // Open custom album
  const openAlbum = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/albums/${id}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSelectedCollection({
          type: 'album',
          id: data.id,
          name: data.name,
          description: data.description,
          is_dynamic: data.is_dynamic,
          rules: data.rules,
          photo_count: data.photo_count,
          photos: data.photos
        });
        setEditName(data.name);
        setEditDesc(data.description || '');
      }
    } catch (e) {
      console.error('Failed to open album:', e);
    }
  };

  // Open Place collection
  const openPlace = async (place: SmartPlace) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/search?q=${encodeURIComponent(place.city)}&limit=200`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSelectedCollection({
          type: 'place',
          name: `${place.city} Collection`,
          description: place.location_name,
          photo_count: data.results?.length || place.photo_count,
          photos: (data.results || []).map((m: any) => ({
            ...m,
            width: m.width || 1280,
            height: m.height || 720,
            captured_at: m.captured_at || new Date().toISOString(),
            is_favorite: !!m.is_favorite,
            is_blurry: !!m.is_blurry,
            thumbnail_url: m.thumbnail_url || `/api/v1/media/${m.id}/thumbnail?size=256`
          }))
        });
      }
    } catch (e) {
      console.error('Failed to open place:', e);
    }
  };

  // Open Trip / Outing story
  const openTrip = async (trip: SmartTrip) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/search/events`, { headers: authHeaders() });
      if (res.ok) {
        const events = await res.json();
        const found = events.find((e: any) => (trip.id && e.id === trip.id) || (trip.cover_id && e.cover_id === trip.cover_id) || e.title === trip.title);
        const photos = found?.items || [];
        setSelectedCollection({
          type: 'trip',
          name: trip.title,
          description: `Spatiotemporal outing on ${trip.date}`,
          photo_count: photos.length || trip.photo_count,
          photos: photos
        });
      }
    } catch (e) {
      console.error('Failed to open trip:', e);
    }
  };

  // Open Person collection
  const openPerson = async (person: SmartPerson) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/people/${person.id}/photos`, { headers: authHeaders() });
      if (res.ok) {
        const photos = await res.json();
        setSelectedCollection({
          type: 'people',
          id: person.id,
          name: person.name,
          description: `Identified across ${photos.length} photos`,
          photo_count: photos.length,
          photos: photos.map((m: any) => ({
            ...m,
            width: m.width || 1280,
            height: m.height || 720,
            thumbnail_url: m.thumbnail_url || `/api/v1/media/${m.id}/thumbnail?size=256`
          }))
        });
      }
    } catch (e) {
      console.error('Failed to open person photos:', e);
    }
  };

  // Open Favorites
  const openFavorites = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/media?is_favorite=true&limit=200`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSelectedCollection({
          type: 'favorites',
          name: 'Favorite Memories',
          description: 'Your starred and most cherished moments',
          photo_count: data.total || data.items?.length || 0,
          photos: (data.items || []).map((m: any) => ({
            ...m,
            thumbnail_url: `/api/v1/media/${m.id}/thumbnail?size=256`
          }))
        });
      }
    } catch (e) {
      console.error('Failed to open favorites:', e);
    }
  };

  // Auto-curate smart albums
  const handleAutoCurate = async () => {
    try {
      setIsCurating(true);
      const res = await fetch(`${API_URL}/api/v1/albums/auto-curate`, { 
        method: 'POST',
        headers: authHeaders()
      });
      if (res.ok) {
        await loadData();
      }
    } catch (e) {
      console.error('Error auto-curating:', e);
    } finally {
      setIsCurating(false);
    }
  };

  // Create custom or dynamic smart album
  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;

    try {
      const payload: any = {
        name: newAlbumName.trim(),
        description: newAlbumDesc.trim() || null,
        is_dynamic: isDynamicAlbum,
      };
      if (isDynamicAlbum) {
        payload.rules = {
          query: dynamicQuery.trim() || undefined,
          is_favorite: dynamicOnlyFavs || undefined,
        };
      }

      const res = await fetch(`${API_URL}/api/v1/albums`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const created = await res.json();
        setNewAlbumName('');
        setNewAlbumDesc('');
        setIsDynamicAlbum(false);
        setDynamicQuery('');
        setDynamicOnlyFavs(false);
        setShowCreateModal(false);
        await loadData();
        openAlbum(created.id);
      }
    } catch (e) {
      console.error('Failed to create album:', e);
    }
  };

  // Update album metadata (rename / description)
  const handleSaveAlbumEdit = async () => {
    if (!selectedCollection || selectedCollection.type !== 'album' || !selectedCollection.id) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/albums/${selectedCollection.id}`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null })
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedCollection(prev => prev ? { ...prev, name: updated.name, description: updated.description } : null);
        setIsEditingAlbum(false);
        loadData();
      }
    } catch (e) {
      console.error('Failed to update album:', e);
    }
  };

  // Delete album
  const handleDeleteAlbum = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this album container? (Your photos remain safely in your library)')) return;

    try {
      const res = await fetch(`${API_URL}/api/v1/albums/${id}`, { 
        method: 'DELETE',
        headers: authHeaders()
      });
      if (res.ok) {
        if (selectedCollection && selectedCollection.id === id) {
          setSelectedCollection(null);
        }
        loadData();
      }
    } catch (e) {
      console.error('Failed to delete album:', e);
    }
  };

  // Remove single photo from album
  const handleRemovePhotoFromAlbum = async (mediaId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedCollection || selectedCollection.type !== 'album' || !selectedCollection.id) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/albums/${selectedCollection.id}/photos/${mediaId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (res.ok) {
        setSelectedCollection(prev => {
          if (!prev) return null;
          const updated = prev.photos.filter(p => p.id !== mediaId);
          return { ...prev, photo_count: updated.length, photos: updated };
        });
        loadData();
      }
    } catch (e) {
      console.error('Failed to remove photo:', e);
    }
  };

  // Remove multiple selected photos from custom album
  const handleBatchRemoveFromAlbum = async () => {
    if (!selectedCollection || selectedCollection.type !== 'album' || !selectedCollection.id || collectionSelectedIds.length === 0) return;
    const confirmMsg = `Remove ${collectionSelectedIds.length} photo(s) from "${selectedCollection.name}"?\n(Photos will remain safe in your library).`;
    if (!confirm(confirmMsg)) return;

    try {
      setIsRemovingFromAlbum(true);
      await Promise.all(
        collectionSelectedIds.map((mid) =>
          fetch(`${API_URL}/api/v1/albums/${selectedCollection.id}/photos/${mid}`, {
            method: 'DELETE',
            headers: authHeaders(),
          })
        )
      );

      const removedSet = new Set(collectionSelectedIds);
      setSelectedCollection(prev => {
        if (!prev) return null;
        const updated = prev.photos.filter(p => !removedSet.has(p.id));
        return { ...prev, photo_count: updated.length, photos: updated };
      });
      setCollectionSelectedIds([]);
      loadData();
    } catch (e) {
      console.error('Failed to remove photos from album:', e);
    } finally {
      setIsRemovingFromAlbum(false);
    }
  };

  // Move selected photos in collection to Trash (Soft/Hard Delete)
  const handleExecuteBatchDelete = async (permanent: boolean) => {
    if (collectionSelectedIds.length === 0) return;
    try {
      const token = getActiveToken();
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      const res = await fetch(`${API_URL}/api/v1/media/batch-delete${tokenParam}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ media_ids: collectionSelectedIds, permanent }),
      });

      if (res.ok) {
        const deletedSet = new Set(collectionSelectedIds);
        if (selectedCollection) {
          setSelectedCollection(prev => {
            if (!prev) return null;
            const updated = prev.photos.filter(p => !deletedSet.has(p.id));
            return {
              ...prev,
              photo_count: Math.max(0, prev.photo_count - collectionSelectedIds.length),
              photos: updated
            };
          });
        }
        setCollectionSelectedIds([]);
        setShowBulkDeleteModal(false);
        loadData();
      }
    } catch (e) {
      console.error('Batch delete error in collection:', e);
    }
  };

  // Open photo picker
  const handleOpenPhotoPicker = async () => {
    if (!selectedCollection || selectedCollection.type !== 'album' || !selectedCollection.id) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/albums/available-photos?album_id=${selectedCollection.id}&limit=300`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const photos: AvailablePhotoItem[] = await res.json();
        setAvailablePhotos(photos);
        setPickerSelectedIds([]);
        setPickerSearch('');
        setShowPickerModal(true);
      }
    } catch (e) {
      console.error('Failed to load available photos:', e);
    }
  };

  // Add selected photos to album
  const handleAddSelectedPhotos = async () => {
    if (!selectedCollection || selectedCollection.type !== 'album' || !selectedCollection.id || pickerSelectedIds.length === 0) return;
    try {
      setIsAddingPhotos(true);
      const res = await fetch(`${API_URL}/api/v1/albums/${selectedCollection.id}/photos`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ media_ids: pickerSelectedIds })
      });
      if (res.ok) {
        setShowPickerModal(false);
        openAlbum(Number(selectedCollection.id));
        loadData();
      }
    } catch (e) {
      console.error('Failed to add photos to album:', e);
    } finally {
      setIsAddingPhotos(false);
    }
  };

  // Download entire album or selected photos as ZIP with parallel streaming
  const handleExportAlbumZip = async (presetOrEvent?: 'original' | 'optimized' | React.MouseEvent) => {
    const preset = (presetOrEvent === 'original' || presetOrEvent === 'optimized') ? presetOrEvent : 'optimized';
    if (!selectedCollection || selectedCollection.photos.length === 0) return;
    try {
      setIsExportingZip(true);
      const mediaIds = collectionSelectedIds.length > 0
        ? collectionSelectedIds
        : selectedCollection.photos.map(p => p.id);

      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      const res = await fetch(`${API_URL}/api/v1/media/bulk-download${tokenParam}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ media_ids: mediaIds, preset })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const tag = preset === 'optimized' ? '_optimized' : '_master';
        a.download = `${selectedCollection.name.replace(/[^a-zA-Z0-9_-]/g, '_')}${tag}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Failed to download ZIP:', e);
    } finally {
      setIsExportingZip(false);
    }
  };

  const filteredPickerPhotos = availablePhotos.filter(p => {
    if (!pickerSearch.trim()) return true;
    const q = pickerSearch.toLowerCase();
    return p.filename.toLowerCase().includes(q) || (p.location_name && p.location_name.toLowerCase().includes(q));
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          {selectedCollection && (
            <button
              onClick={() => {
                setSelectedCollection(null);
                setIsEditingAlbum(false);
              }}
              className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm"
              title="Back to Albums & Collections"
            >
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              {selectedCollection ? selectedCollection.name : 'Albums & Collections'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedCollection ? (
                <span>
                  {selectedCollection.photo_count} photo{selectedCollection.photo_count !== 1 ? 's' : ''} •{' '}
                  {selectedCollection.description || 'Collection Gallery'}
                </span>
              ) : (
                <span>
                  {albums.length} Custom Albums • {smartCollections?.places.length || 0} Places •{' '}
                  {smartCollections?.trips.length || 0} Trips • {smartCollections?.people.length || 0} People
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          {selectedCollection ? (
            <>
              {selectedCollection.type === 'album' && (
                <>
                  <button
                    onClick={() => setIsEditingAlbum(!isEditingAlbum)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition"
                    title="Rename or edit description"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={handleOpenPhotoPicker}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold shadow-sm transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Photos</span>
                  </button>
                  <button
                    onClick={() => {
                      const cur = albums.find((a) => a.id === Number(selectedCollection.id));
                      if (cur) setSharingAlbum(cur);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 hover:from-purple-100 hover:to-indigo-100 text-purple-700 rounded-xl text-xs font-semibold shadow-xs transition"
                    title="Share Event & QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5 text-purple-600" />
                    <span>Share Event</span>
                  </button>
                </>
              )}

              {selectedCollection.photos.length > 0 && (
                <>
                  <button
                    onClick={handleExportAlbumZip}
                    disabled={isExportingZip}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                    title="Export collection as ZIP"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>{isExportingZip ? 'Exporting...' : 'Export ZIP'}</span>
                  </button>

                  <button
                    onClick={handleBackupAlbumToDrive}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold shadow-sm transition"
                    title="Backup album photos to Google Drive with lossless quality"
                  >
                    <Cloud className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Backup to Drive</span>
                  </button>

                  <button
                    onClick={() => setIsSlideshowOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Play Slideshow</span>
                  </button>
                </>
              )}

              {selectedCollection.type === 'album' && (
                <button
                  onClick={() => handleDeleteAlbum(Number(selectedCollection.id))}
                  className="p-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-xl text-xs transition"
                  title="Delete Album"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={handleAutoCurate}
                disabled={isCurating}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                title="Automatically organize your photos into trips and place collections"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isCurating ? 'Curating...' : 'Auto-Curate Albums'}</span>
              </button>

              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Create Album</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline Album Edit Header */}
      {selectedCollection && selectedCollection.type === 'album' && isEditingAlbum && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-4 shadow-sm space-y-3 animate-fadeIn">
          <h4 className="text-xs font-bold text-slate-800">Edit Album Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Album Name"
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Album Description"
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsEditingAlbum(false)}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAlbumEdit}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl shadow-sm"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Main View: Overview / Tabs */}
      {!selectedCollection && (
        <div className="space-y-8">
          {/* Navigation Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: 'All & Highlights', icon: Layers },
              { id: 'albums', label: `My Albums (${albums.length})`, icon: FolderPlus },
              { id: 'places', label: `Places & Cities (${smartCollections?.places.length || 0})`, icon: MapPin },
              { id: 'trips', label: `Trips & Outings (${smartCollections?.trips.length || 0})`, icon: Compass },
              { id: 'people', label: `People (${smartCollections?.people.length || 0})`, icon: Users },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* SECTION: Places Collections */}
          {(activeTab === 'all' || activeTab === 'places') && smartCollections && smartCollections.places.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  Places & Cities
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  {smartCollections.places.length} visited location{smartCollections.places.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {smartCollections.places.map((place) => (
                  <div
                    key={place.location_name}
                    onClick={() => openPlace(place)}
                    className="group bg-white border border-slate-200 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition hover:-translate-y-0.5"
                  >
                    <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                      {place.cover_thumbnail_url ? (
                        <img
                          src={`${API_URL}${place.cover_thumbnail_url}`}
                          alt={place.city}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <MapPin className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition" />
                      <div className="absolute bottom-2 left-2 right-2 text-white">
                        <p className="font-bold text-xs truncate drop-shadow-sm">{place.city}</p>
                        <p className="text-[10px] text-white/80 drop-shadow-sm">
                          {place.photo_count} photo{place.photo_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION: Trips & Outings */}
          {(activeTab === 'all' || activeTab === 'trips') && smartCollections && smartCollections.trips.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-indigo-600" />
                  Trips & Outings
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  {smartCollections.trips.length} spatiotemporal stories
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {smartCollections.trips.map((trip, idx) => (
                  <div
                    key={idx}
                    onClick={() => openTrip(trip)}
                    className="group bg-white border border-slate-200 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition hover:-translate-y-0.5 flex flex-col"
                  >
                    <div className="aspect-[16/9] bg-slate-100 relative overflow-hidden">
                      {trip.cover_thumbnail_url ? (
                        <img
                          src={`${API_URL}${trip.cover_thumbnail_url}`}
                          alt={trip.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Compass className="w-8 h-8" />
                        </div>
                      )}
                      <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-md text-white rounded-full text-[10px] font-semibold">
                        {trip.photo_count} photos
                      </span>
                    </div>

                    <div className="p-3">
                      <h4 className="font-semibold text-xs text-slate-900 truncate group-hover:text-indigo-600 transition">
                        {trip.title}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {trip.date}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION: People & Faces */}
          {(activeTab === 'all' || activeTab === 'people') && smartCollections && smartCollections.people.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-violet-600" />
                  People & Faces
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  {smartCollections.people.length} identified individuals
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {smartCollections.people.map((person) => (
                  <div
                    key={person.id}
                    onClick={() => openPerson(person)}
                    className="group bg-white border border-slate-200 rounded-2xl p-3 text-center cursor-pointer shadow-sm hover:shadow-md transition hover:-translate-y-0.5 flex flex-col items-center"
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 ring-2 ring-violet-200 group-hover:ring-violet-500 transition shadow-sm mb-2">
                      {person.avatar_url ? (
                        <img
                          src={`${API_URL}${person.avatar_url}`}
                          alt={person.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Users className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <h4 className="font-semibold text-xs text-slate-800 truncate w-full group-hover:text-violet-600 transition">
                      {person.name}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {person.photo_count} photo{person.photo_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION: My Albums (Custom & Curated) */}
          {(activeTab === 'all' || activeTab === 'albums') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <FolderPlus className="w-4 h-4 text-indigo-600" />
                  My Albums ({albums.length})
                </h3>
                {albums.length > 0 && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Album
                  </button>
                )}
              </div>

              {albums.length === 0 && !loading ? (
                <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center max-w-lg mx-auto space-y-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
                    <FolderPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">No Albums Yet</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Organize your library with custom albums, or 1-click auto-curate smart collections from your trips and locations.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      onClick={handleAutoCurate}
                      disabled={isCurating}
                      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-sm hover:from-purple-500 hover:to-indigo-500 transition flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isCurating ? 'Curating...' : 'Auto-Curate from Photos'}</span>
                    </button>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
                    >
                      Create Custom Album
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {albums.map((album) => (
                    <div
                      key={album.id}
                      onClick={() => openAlbum(album.id)}
                      className="group bg-white border border-slate-200 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition hover:-translate-y-0.5 flex flex-col"
                    >
                      <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
                        {album.cover_thumbnail_url ? (
                          <img
                            src={`${API_URL}${album.cover_thumbnail_url}`}
                            alt={album.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <ImageIcon className="w-10 h-10" />
                          </div>
                        )}

                        {/* Dynamic Smart Album Badge */}
                        {album.is_dynamic && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-600/90 backdrop-blur-md text-white rounded-full text-[9px] font-bold flex items-center gap-1 shadow-sm border border-indigo-400/40">
                            <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                            <span>Smart AI</span>
                          </span>
                        )}

                        {/* Photo Count Badge */}
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-md text-white rounded-full text-[10px] font-semibold">
                          {album.photo_count} photo{album.photo_count !== 1 ? 's' : ''}
                        </span>

                        {/* Quick Share Event QR */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSharingAlbum(album);
                          }}
                          className="absolute top-2 right-9 p-1.5 bg-black/40 hover:bg-purple-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition backdrop-blur-sm"
                          title="Share Event & QR Code"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>

                        {/* Quick Delete */}
                        <button
                          onClick={(e) => handleDeleteAlbum(album.id, e)}
                          className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition backdrop-blur-sm"
                          title="Delete Album"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="p-3">
                        <h4 className="font-semibold text-xs text-slate-800 truncate group-hover:text-indigo-600 transition">
                          {album.name}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                          {album.description || `Created ${new Date(album.created_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected Collection / Album Photos View */}
      {selectedCollection && (
        <div className="space-y-4">
          {selectedCollection.photos.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-md mx-auto space-y-3">
              <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <ImageIcon className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800">No photos in this album yet</h4>
              <p className="text-xs text-slate-500">
                Click "Add Photos" above to select memories from your library to add here.
              </p>
              {selectedCollection.type === 'album' && (
                <button
                  onClick={handleOpenPhotoPicker}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  Add Photos Now
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3" onPointerDown={(e) => handleCollectionPointerDown(e)}>
              {/* Collection Selection & Batch Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSelectAllInCollection}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition"
                  >
                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                    <span>
                      {collectionSelectedIds.length === selectedCollection.photos.length
                        ? 'Deselect All'
                        : `Select All (${selectedCollection.photos.length})`}
                    </span>
                  </button>

                  {collectionSelectedIds.length > 0 && (
                    <span className="text-xs text-slate-500 font-medium">
                      <strong className="text-indigo-600">{collectionSelectedIds.length}</strong> photo{collectionSelectedIds.length !== 1 ? 's' : ''} selected
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Google Photos Search Query Helper */}
                  <button
                    onClick={() => setShowGooglePhotosModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold shadow-xs transition"
                    title="Generate Google Photos cloud deletion search query"
                  >
                    <Search className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Google Photos Query {collectionSelectedIds.length > 0 ? `(${collectionSelectedIds.length})` : ''}</span>
                  </button>

                  {collectionSelectedIds.length > 0 && (
                    <>
                      {/* If custom album, offer remove from album option */}
                      {selectedCollection.type === 'album' && (
                        <button
                          onClick={handleBatchRemoveFromAlbum}
                          disabled={isRemovingFromAlbum}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition disabled:opacity-50"
                          title="Remove selected photos from this album (photos remain in library)"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>{isRemovingFromAlbum ? 'Removing...' : `Remove from Album (${collectionSelectedIds.length})`}</span>
                        </button>
                      )}

                      {/* Move to Trash (Safe Soft-Delete) */}
                      <button
                        onClick={() => setShowBulkDeleteModal(true)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                        title="Move selected photos to Trash"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete ({collectionSelectedIds.length})</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {selectedCollection.photos.map((photo) => {
                  const isSelected = collectionSelectedIds.includes(photo.id);

                  return (
                    <div
                      key={photo.id}
                      className={`relative group rounded-xl transition-all ${
                        isSelected ? 'ring-4 ring-indigo-500 ring-offset-2 scale-[0.98]' : ''
                      }`}
                    >
                      <PhotoCard
                        item={photo}
                        apiUrl={API_URL}
                        isSelected={isSelected}
                        onSelect={setSelectedPhoto}
                        onToggleSelect={handleCollectionItemClick}
                        onPointerDown={handleCollectionPointerDown}
                        onToggleFavorite={() => {}}
                        onDelete={() => {}}
                        onBackupToDrive={(item) => handleBackupSinglePhoto(item)}
                      />

                      {/* Remove from Album Button */}
                      {selectedCollection.type === 'album' && (
                        <button
                          onClick={(e) => handleRemovePhotoFromAlbum(photo.id, e)}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition z-10 backdrop-blur-sm"
                          title="Remove from this album"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Album Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <form
            onSubmit={handleCreateAlbum}
            className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-indigo-600" />
              Create New Album
            </h3>
            <div className="space-y-3">
              {/* Album Type Selector */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setIsDynamicAlbum(false)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                    !isDynamicAlbum
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  📁 Standard
                </button>
                <button
                  type="button"
                  onClick={() => setIsDynamicAlbum(true)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition ${
                    isDynamicAlbum
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>⚡ Smart AI</span>
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Album Name</label>
                <input
                  type="text"
                  required
                  placeholder={isDynamicAlbum ? "e.g. Sunset Landscapes, Weekend Fun" : "e.g. Summer Vacation, Road Trip"}
                  value={newAlbumName}
                  onChange={(e) => setNewAlbumName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              {isDynamicAlbum && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-2 animate-fadeIn">
                  <div>
                    <label className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      <span>AI Query Rules (Self-Updating)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. beach, Bengaluru, outdoor party, smiles"
                      value={dynamicQuery}
                      onChange={(e) => setDynamicQuery(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                    />
                    <p className="text-[10px] text-indigo-700 mt-1">
                      Any new photo uploaded matching these keywords/location will auto-join this album.
                    </p>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={dynamicOnlyFavs}
                      onChange={(e) => setDynamicOnlyFavs(e.target.checked)}
                      className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-xs text-indigo-900 font-medium">⭐ Only include Favorite shots</span>
                  </label>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700">Description (Optional)</label>
                <textarea
                  placeholder="What is this collection about?"
                  value={newAlbumDesc}
                  onChange={(e) => setNewAlbumDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
              >
                Create Album
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Photo Picker Modal: Add Photos to Album */}
      {showPickerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Add Photos to Album</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select photos from your library to include in &ldquo;{selectedCollection?.name}&rdquo;
                </p>
              </div>
              <button
                onClick={() => setShowPickerModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Toolbar */}
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter photos by name or place..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const selectable = filteredPickerPhotos.filter(p => !p.in_album).map(p => p.id);
                    if (pickerSelectedIds.length === selectable.length) {
                      setPickerSelectedIds([]);
                    } else {
                      setPickerSelectedIds(selectable);
                    }
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2 py-1 hover:bg-indigo-50 rounded"
                >
                  {pickerSelectedIds.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs text-slate-500 font-semibold bg-white px-2.5 py-1 border border-slate-200 rounded-lg">
                  {pickerSelectedIds.length} Selected
                </span>
              </div>
            </div>

            {/* Modal Photo Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {filteredPickerPhotos.map((photo) => {
                  const isChecked = pickerSelectedIds.includes(photo.id);
                  return (
                    <div
                      key={photo.id}
                      onClick={() => {
                        if (photo.in_album) return;
                        setPickerSelectedIds(prev => 
                          prev.includes(photo.id) ? prev.filter(id => id !== photo.id) : [...prev, photo.id]
                        );
                      }}
                      className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer border transition ${
                        photo.in_album
                          ? 'opacity-40 cursor-not-allowed border-slate-200'
                          : isChecked
                          ? 'ring-2 ring-indigo-600 border-indigo-600'
                          : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <img
                        src={`${API_URL}${photo.thumbnail_url}`}
                        alt={photo.filename}
                        className="w-full h-full object-cover"
                      />

                      {photo.in_album ? (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white bg-slate-800/80 px-2 py-0.5 rounded-full">
                            In Album
                          </span>
                        </div>
                      ) : (
                        <div className="absolute top-1.5 right-1.5">
                          {isChecked ? (
                            <div className="w-5 h-5 bg-indigo-600 text-white rounded-md flex items-center justify-center shadow">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 bg-black/40 group-hover:bg-black/60 rounded-md border border-white/80 transition" />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPickerModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pickerSelectedIds.length === 0 || isAddingPhotos}
                onClick={handleAddSelectedPhotos}
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {isAddingPhotos ? 'Adding...' : `Add ${pickerSelectedIds.length} Photos`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal with Next/Prev navigation & action handlers */}
      <LightboxModal
        photo={selectedPhoto}
        apiUrl={API_URL}
        onClose={() => setSelectedPhoto(null)}
        onToggleFavorite={(id) => {
          if (selectedCollection) {
            setSelectedCollection({
              ...selectedCollection,
              photos: selectedCollection.photos.map((p) =>
                p.id === id ? { ...p, is_favorite: !p.is_favorite } : p
              ),
            });
          }
          if (selectedPhoto && selectedPhoto.id === id) {
            setSelectedPhoto({ ...selectedPhoto, is_favorite: !selectedPhoto.is_favorite });
          }
        }}
        onDelete={(id) => {
          if (selectedCollection) {
            setSelectedCollection({
              ...selectedCollection,
              photo_count: Math.max(0, selectedCollection.photo_count - 1),
              photos: selectedCollection.photos.filter((p) => p.id !== id),
            });
          }
          setSelectedPhoto(null);
        }}
        hasPrev={hasPrev}
        hasNext={hasNext}
        nextPhoto={nextPhoto}
        prevPhoto={prevPhoto}
        onNavigatePrev={navigatePrev}
        onNavigateNext={navigateNext}
        onBackupToDrive={(item) => handleBackupSinglePhoto(item)}
      />

      {/* Ambient Slideshow Modal */}
      <AmbientSlideshowModal
        photos={selectedCollection?.photos || []}
        apiUrl={API_URL}
        isOpen={isSlideshowOpen}
        onClose={() => setIsSlideshowOpen(false)}
      />

      {/* 2D Marquee Drag Selection Visual Rectangle Overlay */}
      {collectionMarqueeBox && (
        <div
          style={{
            position: 'fixed',
            left: `${collectionMarqueeBox.left}px`,
            top: `${collectionMarqueeBox.top}px`,
            width: `${collectionMarqueeBox.width}px`,
            height: `${collectionMarqueeBox.height}px`,
          }}
          className={`pointer-events-none z-50 rounded border-2 ${
            collectionDragMode === 'select'
              ? 'border-indigo-500 bg-indigo-500/20 shadow-indigo-500/10'
              : 'border-rose-500 bg-rose-500/20 shadow-rose-500/10'
          } shadow-lg backdrop-blur-[0.5px] transition-none`}
        />
      )}

      {/* Active Line-Drag Selection Floating Pill */}
      {isDragSelectingCollection && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-md px-5 py-2.5 rounded-full shadow-2xl border border-indigo-500/50 flex items-center gap-3 animate-pulse pointer-events-none">
          <div className={`w-2.5 h-2.5 rounded-full ${collectionDragMode === 'select' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-bold tracking-wide">
            {collectionDragMode === 'select' ? '✨ Dragging across photos to SELECT' : '🧹 Dragging across photos to DESELECT'}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {collectionSelectedIds.length} selected
          </span>
        </div>
      )}

      {/* Safe Bulk Delete Modal for Collections */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        itemCount={collectionSelectedIds.length}
        itemType="photos"
        filenames={
          selectedCollection?.photos
            .filter((p) => collectionSelectedIds.includes(p.id))
            .map((p) => p.filename) || []
        }
        onOpenGooglePhotosHelper={() => setShowGooglePhotosModal(true)}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleExecuteBatchDelete}
      />

      {/* Google Photos Cloud Deletion Search Helper Modal */}
      <GooglePhotosExportModal
        isOpen={showGooglePhotosModal}
        onClose={() => setShowGooglePhotosModal(false)}
        items={
          collectionSelectedIds.length > 0 && selectedCollection
            ? selectedCollection.photos.filter((p) => collectionSelectedIds.includes(p.id))
            : selectedCollection?.photos || []
        }
        title={`Google Photos Query: ${selectedCollection?.name || 'Album Photos'}`}
        subtitle="Search and trash matched photos in your Google Photos cloud account"
      />

      {/* Share Event & QR Code Modal */}
      <ShareEventModal
        album={sharingAlbum}
        apiUrl={API_URL}
        isOpen={Boolean(sharingAlbum)}
        onClose={() => setSharingAlbum(null)}
        onShareUpdated={() => {
          loadData();
        }}
      />

      {/* Google Drive Outbound Backup Modal */}
      <GoogleDriveBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        mediaIds={backupModalMediaIds}
        defaultFolderName={backupModalDefaultFolder}
        onBackupSuccess={() => {
          loadData();
          setCollectionSelectedIds([]);
        }}
      />
    </div>
  );
}
