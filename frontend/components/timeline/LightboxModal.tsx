'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Download, 
  Heart, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Info,
  Users,
  MapPin,
  Camera,
  ExternalLink,
  Plus,
  Check,
  Edit2,
  Sparkles,
  Play
} from 'lucide-react';
import { MediaItem } from './PhotoCard';

interface FaceData {
  id: number;
  media_id: number;
  person_id: number | null;
  person_name: string;
  box_x: number;
  box_y: number;
  box_w: number;
  box_h: number;
  confidence: number;
}

interface LightboxModalProps {
  photo: MediaItem | null;
  apiUrl: string;
  onClose: () => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  photo,
  apiUrl,
  onClose,
  onToggleFavorite,
  onDelete,
  onNavigatePrev,
  onNavigateNext,
  hasPrev = false,
  hasNext = false,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isHighResLoaded, setIsHighResLoaded] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'faces'>('info');
  const [showFaceBoxes, setShowFaceBoxes] = useState(true);
  const [faces, setFaces] = useState<FaceData[]>([]);
  const [editingFaceId, setEditingFaceId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [knownPeople, setKnownPeople] = useState<{ id: number; name: string }[]>([]);
  const [isAddingFace, setIsAddingFace] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(photo?.category || 'memory');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [locName, setLocName] = useState(photo?.location_name || '');
  const [locLat, setLocLat] = useState<string>(photo?.latitude != null ? photo.latitude.toString() : '');
  const [locLon, setLocLon] = useState<string>(photo?.longitude != null ? photo.longitude.toString() : '');
  const [savingLoc, setSavingLoc] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPlayingMotion, setIsPlayingMotion] = useState(false);

  // 1-Click Auto-Enhance state
  const [isEnhanced, setIsEnhanced] = useState(photo?.is_enhanced || false);
  const [isHoldingCompare, setIsHoldingCompare] = useState(false);
  const [enhanceParams, setEnhanceParams] = useState<{
    brightness: number;
    contrast: number;
    saturation: number;
    shadows_lift_pct?: number;
    css_filter: string;
    auto_recommended?: boolean;
  } | null>(null);
  const [isSavingEnhance, setIsSavingEnhance] = useState(false);

  const dragStart = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync video seek timestamp
  useEffect(() => {
    if (photo?.matched_timestamp && videoRef.current) {
      videoRef.current.currentTime = photo.matched_timestamp;
    }
  }, [photo?.id, photo?.matched_timestamp]);

  // Reset delete confirm modal when switching photos
  useEffect(() => {
    setShowDeleteConfirm(false);
    setIsDeleting(false);
    setIsPlayingMotion(false);
  }, [photo?.id]);

  const handleConfirmDelete = async () => {
    if (!photo) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/media/${photo.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(photo.id);
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      console.error('Failed to delete photo:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Sync auto-enhance state when photo changes
  useEffect(() => {
    if (!photo) return;
    setIsEnhanced(photo.is_enhanced || false);
    setIsHoldingCompare(false);

    if (photo.enhancement_data) {
      try {
        const parsed = JSON.parse(photo.enhancement_data);
        setEnhanceParams(parsed);
      } catch {
        setEnhanceParams(null);
      }
    } else {
      setEnhanceParams(null);
    }

    if (!photo.is_video) {
      fetch(`${apiUrl}/api/v1/media/${photo.id}/enhance-params`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.enhance_params) {
            setEnhanceParams((prev) => prev || data.enhance_params);
          }
        })
        .catch(() => {});
    }
  }, [photo?.id, apiUrl]);

  const handleToggleEnhance = async () => {
    if (!photo) return;
    const nextState = !isEnhanced;
    setIsEnhanced(nextState);

    try {
      setIsSavingEnhance(true);
      if (nextState) {
        await fetch(`${apiUrl}/api/v1/media/${photo.id}/apply-enhance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enhanceParams || {}),
        });
        photo.is_enhanced = true;
      } else {
        await fetch(`${apiUrl}/api/v1/media/${photo.id}/revert-enhance`, {
          method: 'POST',
        });
        photo.is_enhanced = false;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingEnhance(false);
    }
  };

  const currentFilter = isEnhanced && !isHoldingCompare
    ? (enhanceParams?.css_filter || 'brightness(1.15) contrast(1.10) saturate(1.08)')
    : 'none';

  // Reset zoom, pan, and high-res state whenever a new photo is opened
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsHighResLoaded(false);
    setEditingFaceId(null);
    setIsAddingFace(false);
    setIsEditingLocation(false);
    setLocName(photo?.location_name || '');
    setLocLat(photo?.latitude != null ? photo.latitude.toString() : '');
    setLocLon(photo?.longitude != null ? photo.longitude.toString() : '');

    if (photo?.id) {
      // Progressively preload the uncompressed original image for pixel-perfect zoom
      const img = new window.Image();
      img.src = `${apiUrl}/api/v1/media/${photo.id}/view`;
      img.onload = () => setIsHighResLoaded(true);

      // Fetch detected faces for this photo
      fetchFaces(photo.id);
      fetchKnownPeople();
    }
  }, [photo?.id, apiUrl]);

  const handleSaveLocation = async (customName?: string, customLat?: number, customLon?: number) => {
    if (!photo?.id) return;
    setSavingLoc(true);
    try {
      const latVal = customLat !== undefined ? customLat : (locLat.trim() ? parseFloat(locLat) : null);
      const lonVal = customLon !== undefined ? customLon : (locLon.trim() ? parseFloat(locLon) : null);
      const nameVal = customName !== undefined ? customName : (locName.trim() || null);

      const res = await fetch(`${apiUrl}/api/v1/media/${photo.id}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: latVal,
          longitude: lonVal,
          location_name: nameVal
        }),
      });
      if (res.ok) {
        const data = await res.json();
        photo.latitude = data.latitude;
        photo.longitude = data.longitude;
        photo.location_name = data.location_name;
        setLocLat(data.latitude != null ? data.latitude.toString() : '');
        setLocLon(data.longitude != null ? data.longitude.toString() : '');
        setLocName(data.location_name || '');
        setIsEditingLocation(false);
      }
    } catch (e) {
      console.error('Failed to save location:', e);
    } finally {
      setSavingLoc(false);
    }
  };

  const fetchFaces = async (photoId: number) => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/people/media/${photoId}/faces`);
      if (res.ok) {
        const data = await res.json();
        setFaces(data);
      }
    } catch (e) {
      console.error('Failed to fetch faces:', e);
    }
  };

  const fetchKnownPeople = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/people`);
      if (res.ok) {
        const data = await res.json();
        setKnownPeople(data);
      }
    } catch (e) {
      console.error('Failed to fetch known people:', e);
    }
  };

  const handleUpdateFaceTag = async (faceId: number, name: string) => {
    if (!name.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/people/faces/${faceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_name: name.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setFaces((prev) =>
          prev.map((f) =>
            f.id === faceId ? { ...f, person_id: updated.person_id, person_name: updated.person_name } : f
          )
        );
        setEditingFaceId(null);
        fetchKnownPeople();
      }
    } catch (e) {
      console.error('Failed to update face tag:', e);
    }
  };

  const handleDeleteFace = async (faceId: number) => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/people/faces/${faceId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setFaces((prev) => prev.filter((f) => f.id !== faceId));
        if (editingFaceId === faceId) setEditingFaceId(null);
      }
    } catch (e) {
      console.error('Failed to delete face tag:', e);
    }
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isAddingFace || !photo || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // Approximate face bounding box centered on click: 15% width, 18% height
    const box_w = 0.15;
    const box_h = 0.18;
    const box_x = Math.max(0, Math.min(clickX - box_w / 2, 1 - box_w));
    const box_y = Math.max(0, Math.min(clickY - box_h / 2, 1 - box_h));

    const personName = prompt('Enter the name of the person:');
    if (!personName || !personName.trim()) {
      setIsAddingFace(false);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/v1/people/media/${photo.id}/faces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          box_x: Math.round(box_x * 1000) / 1000,
          box_y: Math.round(box_y * 1000) / 1000,
          box_w: Math.round(box_w * 1000) / 1000,
          box_h: Math.round(box_h * 1000) / 1000,
          person_name: personName.trim(),
        }),
      });
      if (res.ok) {
        const newFace = await res.json();
        setFaces((prev) => [...prev, newFace]);
        fetchKnownPeople();
      }
    } catch (err) {
      console.error('Error adding face tag:', err);
    } finally {
      setIsAddingFace(false);
    }
  };

  const handleCategoryChange = async (newCategory: string) => {
    if (!photo) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/media/${photo.id}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory }),
      });
      if (res.ok) {
        setCurrentCategory(newCategory);
        photo.category = newCategory;
      }
    } catch (e) {
      console.error('Failed to change category:', e);
    }
  };

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!photo) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onNavigatePrev && hasPrev) {
        onNavigatePrev();
      } else if (e.key === 'ArrowRight' && onNavigateNext && hasNext) {
        onNavigateNext();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetZoom();
      } else if (e.key.toLowerCase() === 'f') {
        setShowFaceBoxes((prev) => !prev);
      } else if (e.key.toLowerCase() === 'i') {
        setActiveTab((prev) => (prev === 'info' ? 'faces' : 'info'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photo?.id, hasPrev, hasNext]);

  if (!photo) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1 && !isAddingFace) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // Formatting helpers
  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return null;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const megapixels = photo.width && photo.height 
    ? ((photo.width * photo.height) / 1000000).toFixed(1) 
    : null;

  return (
    <div 
      className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center p-2 md:p-6 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onMouseUp={handleMouseUp}
    >
      <div className={`relative max-h-[95vh] w-full h-full flex flex-col md:flex-row bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 transition-all duration-300 ${
        showSidebar ? 'max-w-7xl' : 'max-w-[98vw]'
      }`}>
        
        {/* Top Controls: Toggle Sidebar & Close */}
        <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2.5 bg-black/60 text-white rounded-full hover:bg-black/90 transition shadow-lg backdrop-blur-sm"
            title={showSidebar ? "Expand to Fullscreen (Hide Sidebar)" : "Show Info Sidebar"}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2.5 bg-black/60 text-white rounded-full hover:bg-black/90 transition shadow-lg backdrop-blur-sm"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Photo Interactive Viewport with Pan, Zoom & Face Tag Overlay */}
        <div 
          ref={containerRef}
          className="relative flex-1 flex items-center justify-center bg-black overflow-hidden select-none p-2"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          style={{ cursor: isAddingFace ? 'crosshair' : zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
          {/* Previous Photo Button */}
          {hasPrev && onNavigatePrev && (
            <button
              onClick={onNavigatePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2.5 bg-black/60 hover:bg-black/90 text-white rounded-full backdrop-blur-md transition shadow-xl"
              title="Previous Photo (Left Arrow)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Next Photo Button */}
          {hasNext && onNavigateNext && (
            <button
              onClick={onNavigateNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2.5 bg-black/60 hover:bg-black/90 text-white rounded-full backdrop-blur-md transition shadow-xl"
              title="Next Photo (Right Arrow)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Interactive Photo Image with Face Tag Overlays */}
          <div 
            className="relative inline-block max-h-[85vh] max-w-full"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: 'center',
              transition: isDragging ? 'none' : 'transform 75ms ease-out',
            }}
          >
            {photo.is_video ? (
              <div className="flex flex-col items-center gap-3">
                <video
                  ref={videoRef}
                  src={`${apiUrl}/api/v1/media/${photo.id}/view`}
                  controls
                  autoPlay
                  className="max-h-[75vh] max-w-full rounded-xl shadow-2xl bg-black"
                  onLoadedMetadata={(e) => {
                    if (photo.matched_timestamp) {
                      e.currentTarget.currentTime = photo.matched_timestamp;
                    }
                  }}
                />
                {photo.matched_timestamp_label && (
                  <div className="bg-rose-600/95 text-white text-xs px-3.5 py-1.5 rounded-full shadow-xl flex items-center gap-2.5 animate-fadeIn">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
                    <span>Matched scene at <strong>{photo.matched_timestamp_label}</strong></span>
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = photo.matched_timestamp || 0;
                          videoRef.current.play();
                        }
                      }}
                      className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[11px] font-semibold transition"
                    >
                      Jump to Scene
                    </button>
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = 0;
                          videoRef.current.play();
                        }
                      }}
                      className="bg-black/30 hover:bg-black/50 px-2 py-0.5 rounded text-[11px] font-semibold transition"
                    >
                      Play from Start
                    </button>
                  </div>
                )}
              </div>
            ) : isPlayingMotion && photo?.has_motion_photo ? (
              <video
                src={`${apiUrl}/api/v1/media/${photo.id}/motion-video`}
                autoPlay
                loop
                playsInline
                controls
                className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <img
                ref={imageRef}
                src={
                  isHighResLoaded
                    ? `${apiUrl}/api/v1/media/${photo.id}/view`
                    : `${apiUrl}/api/v1/media/${photo.id}/thumbnail?size=1080`
                }
                alt={photo.filename}
                onClick={handleImageClick}
                style={{
                  filter: currentFilter,
                  transition: 'filter 0.2s ease-in-out',
                }}
                className="max-h-[85vh] max-w-full object-contain rounded-lg"
                draggable={false}
              />
            )}

            {/* Interactive Face Bounding Boxes */}
            {showFaceBoxes && zoom === 1 && faces.map((face) => (
              <div
                key={face.id}
                style={{
                  left: `${face.box_x * 100}%`,
                  top: `${face.box_y * 100}%`,
                  width: `${face.box_w * 100}%`,
                  height: `${face.box_h * 100}%`,
                }}
                className={`absolute group cursor-pointer border-2 transition-all rounded-md ${
                  face.person_name && face.person_name !== 'Unnamed'
                    ? 'border-indigo-400/80 bg-indigo-500/10 hover:bg-indigo-500/20'
                    : 'border-amber-400/80 bg-amber-500/10 hover:bg-amber-500/20'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('faces');
                  setEditingFaceId(face.id);
                  setEditingName(face.person_name !== 'Unnamed' ? face.person_name : '');
                }}
              >
                {/* Floating Face Name Tag Badge */}
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/90 text-white shadow-lg border border-slate-700 pointer-events-none group-hover:scale-105 transition">
                  {face.person_name || 'Unnamed'}
                </span>
              </div>
            ))}
          </div>

          {/* Adding Face Tag Hint */}
          {isAddingFace && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-indigo-600 text-white text-xs px-4 py-1.5 rounded-full shadow-lg animate-pulse flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" />
              <span>Click on a face in the photo to tag person</span>
              <button 
                onClick={() => setIsAddingFace(false)}
                className="ml-2 hover:bg-indigo-700 rounded px-1.5 py-0.5 text-[10px]"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Floating Zoom & Overlays Toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-4 py-1.5 rounded-full flex items-center gap-3 text-white shadow-2xl">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 1}
              className="p-1 hover:bg-white/10 rounded-full transition disabled:opacity-40"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-semibold min-w-[42px] text-center">
              {Math.round(zoom * 100)}%
            </span>

            <button
              onClick={handleZoomIn}
              disabled={zoom >= 4}
              className="p-1 hover:bg-white/10 rounded-full transition disabled:opacity-40"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            {zoom > 1 && (
              <button
                onClick={handleResetZoom}
                className="p-1 hover:bg-white/10 rounded-full text-indigo-400 hover:text-white transition"
                title="Reset Zoom (100%)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="h-4 w-px bg-slate-700" />

            {/* Live / Motion Photo Toggle */}
            {photo?.has_motion_photo && (
              <>
                <button
                  onClick={() => setIsPlayingMotion(!isPlayingMotion)}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold transition ${
                    isPlayingMotion
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                      : 'text-amber-400 hover:text-white hover:bg-white/10'
                  }`}
                  title="Toggle Live Motion Video Playback"
                >
                  <span className={`w-2 h-2 rounded-full ${isPlayingMotion ? 'bg-white animate-ping' : 'bg-amber-400'}`} />
                  <span>LIVE</span>
                </button>
                <div className="h-4 w-px bg-slate-700" />
              </>
            )}

            {/* Face Bounding Box Toggle */}
            <button
              onClick={() => setShowFaceBoxes(!showFaceBoxes)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition ${
                showFaceBoxes 
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' 
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Toggle Face Boxes (F)"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Faces</span>
              {faces.length > 0 && (
                <span className="bg-indigo-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                  {faces.length}
                </span>
              )}
            </button>

            <div className="h-4 w-px bg-slate-700" />

            {/* Auto-Enhance Engine */}
            {photo && !photo.is_video && (
              <>
                <button
                  onClick={handleToggleEnhance}
                  disabled={isSavingEnhance}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition ${
                    isEnhanced
                      ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                      : 'text-amber-300 hover:text-white hover:bg-white/10'
                  }`}
                  title="1-Click Auto-Enhance (Dynamic Range, Balanced Contrast & Vibrancy)"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isEnhanced ? 'text-slate-950 fill-slate-950' : 'text-amber-400'}`} />
                  <span>{isEnhanced ? 'Enhanced' : 'Auto-Enhance'}</span>
                </button>

                {isEnhanced && (
                  <button
                    onMouseDown={() => setIsHoldingCompare(true)}
                    onMouseUp={() => setIsHoldingCompare(false)}
                    onTouchStart={() => setIsHoldingCompare(true)}
                    onTouchEnd={() => setIsHoldingCompare(false)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition border select-none ${
                      isHoldingCompare
                        ? 'bg-rose-600 text-white border-rose-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="Hold down to preview un-enhanced original"
                  >
                    {isHoldingCompare ? 'Original' : 'Hold Compare'}
                  </button>
                )}

                <div className="h-4 w-px bg-slate-700" />
              </>
            )}

            {/* Quality Indicator Badge */}
            <span
              className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                isHighResLoaded
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title={
                isHighResLoaded
                  ? 'Uncompressed original camera image loaded'
                  : 'Loading uncompressed original quality...'
              }
            >
              {isHighResLoaded ? 'Original HD' : 'Loading HD...'}
            </span>
          </div>

          {/* Floating Bottom-Right Quick Action: Delete Photo */}
          <div className="absolute bottom-4 right-4 z-30 flex items-center gap-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 hover:bg-rose-950/90 backdrop-blur-md border border-slate-700/80 hover:border-rose-500/60 text-slate-200 hover:text-rose-200 shadow-2xl transition group text-xs font-semibold cursor-pointer"
              title="Delete Photo (removes from library and Google Drive)"
            >
              <Trash2 className="w-4 h-4 text-rose-400 group-hover:scale-110 transition" />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {/* Multi-Tab Sidebar: Info & EXIF / Faces & People */}
        {showSidebar && (
          <div className="w-full md:w-88 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col justify-between flex-shrink-0 z-20 animate-fadeIn">
            
            {/* Sidebar Tabs Header */}
            <div className="flex border-b border-slate-800 px-4 pt-3">
            <button
              onClick={() => setActiveTab('info')}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition ${
                activeTab === 'info'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Info & EXIF</span>
            </button>

            <button
              onClick={() => setActiveTab('faces')}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition ${
                activeTab === 'faces'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>People & Faces ({faces.length})</span>
            </button>
          </div>

          {/* Tab Content Container */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-white">
            {activeTab === 'info' ? (
              <div className="space-y-4 text-xs">
                {/* Photo Title & Capture Time */}
                <div>
                  <h3 className="font-semibold text-sm text-slate-100 truncate" title={photo.filename}>
                    {photo.filename}
                  </h3>
                  <p className="text-slate-400 mt-1">
                    {new Date(photo.captured_at).toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                {/* Technical Specifications Grid */}
                <div className="bg-slate-800/60 rounded-xl p-3 space-y-2 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Resolution</span>
                    <span className="font-mono">
                      {photo.width} × {photo.height} {megapixels ? `(${megapixels} MP)` : ''}
                    </span>
                  </div>

                  {photo.file_size && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">File Size</span>
                      <span className="font-mono">{formatFileSize(photo.file_size)}</span>
                    </div>
                  )}

                  {/* Interactive Category Selector */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
                    <span className="text-slate-400">Category</span>
                    <select
                      value={currentCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-indigo-400 text-xs rounded px-2 py-0.5 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="memory">Memory</option>
                      <option value="screenshot">Screenshot</option>
                      <option value="document_bill">Document / Bill</option>
                      <option value="meme_junk">Meme / Graphic</option>
                      <option value="uncategorized">Uncategorized</option>
                    </select>
                  </div>

                  {photo.is_bokeh && (
                    <div className="flex items-center justify-between text-purple-400 font-medium pt-1 border-t border-slate-700/50">
                      <span>Focus & Depth</span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <span>🎨</span>
                        <span>Portrait Bokeh (Sharp Subject)</span>
                      </span>
                    </div>
                  )}

                  {photo.is_blurry && !photo.is_bokeh && (
                    <div className="flex items-center justify-between text-amber-400 font-medium pt-1 border-t border-slate-700/50">
                      <span>Quality</span>
                      <span className="text-[11px]">
                        {photo.blur_type === 'motion_blur'
                          ? '💨 Camera Motion Shake'
                          : photo.blur_type === 'black_pocket'
                          ? '🌑 Accidental Dark / Pocket'
                          : '🔍 Out of Focus'}
                      </span>
                    </div>
                  )}

                  {isEnhanced && (
                    <div className="flex items-center justify-between text-amber-300 font-medium pt-1 border-t border-slate-700/50">
                      <span>Lighting & Tone</span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <span>✨</span>
                        <span>Auto-Enhanced {enhanceParams?.shadows_lift_pct ? `(+${enhanceParams.shadows_lift_pct}% shadows)` : ''}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* AI Emotion, Mood & Visual Intelligence Card */}
                {(photo.mood || photo.dominant_color || photo.is_video) && (
                  <div className="bg-gradient-to-br from-indigo-950/40 via-purple-950/30 to-slate-900/60 rounded-xl p-3.5 space-y-3 border border-indigo-500/20 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>AI Visual Intelligence</span>
                      </div>
                      {photo.is_video && (
                        <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Play className="w-2.5 h-2.5 fill-rose-300" />
                          Video ({photo.duration_seconds ? `${photo.duration_seconds}s` : 'Clip'})
                        </span>
                      )}
                    </div>

                    {photo.mood && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Emotion & Atmosphere</span>
                        <div className="flex items-center gap-1.5">
                          <span className="capitalize font-semibold text-slate-200">
                            {photo.mood === 'joyful' && '😊 Joyful'}
                            {photo.mood === 'serene' && '🌅 Serene'}
                            {photo.mood === 'celebratory' && '🎉 Celebratory'}
                            {photo.mood === 'adventurous' && '⛰️ Adventurous'}
                            {photo.mood === 'cozy' && '☕ Cozy'}
                            {photo.mood === 'dramatic' && '🎭 Dramatic'}
                            {photo.mood === 'romantic' && '❤️ Romantic'}
                            {photo.mood === 'nostalgic' && '✨ Nostalgic'}
                            {!['joyful', 'serene', 'celebratory', 'adventurous', 'cozy', 'dramatic', 'romantic', 'nostalgic'].includes(photo.mood) && photo.mood}
                          </span>
                          {photo.is_smiling && (
                            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
                              Smiling
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {photo.dominant_color && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                        <span className="text-slate-400">Color Palette</span>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-xs"
                            style={{ backgroundColor: photo.color_hex || '#4F46E5' }}
                          />
                          <span className="capitalize font-medium text-slate-300">
                            {photo.dominant_color}
                          </span>
                          {photo.color_hex && (
                            <span className="font-mono text-[10px] text-slate-500">{photo.color_hex}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Camera & Lens Technical EXIF */}
                {(photo.camera_make || photo.camera_model || photo.iso || photo.exposure_time) && (
                  <div className="bg-slate-800/60 rounded-xl p-3 space-y-2.5 border border-slate-800">
                    <div className="flex items-center gap-2 text-slate-200 font-medium">
                      <Camera className="w-3.5 h-3.5 text-indigo-400" />
                      <span>
                        {[photo.camera_make, photo.camera_model].filter(Boolean).join(' ') || 'Camera Details'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {photo.focal_length && (
                        <div className="bg-slate-900/80 p-2 rounded text-center">
                          <p className="text-[10px] text-slate-400">Focal</p>
                          <p className="font-semibold mt-0.5">{photo.focal_length}mm</p>
                        </div>
                      )}
                      {photo.exposure_time && (
                        <div className="bg-slate-900/80 p-2 rounded text-center">
                          <p className="text-[10px] text-slate-400">Shutter</p>
                          <p className="font-semibold mt-0.5">{photo.exposure_time}</p>
                        </div>
                      )}
                      {photo.iso && (
                        <div className="bg-slate-900/80 p-2 rounded text-center">
                          <p className="text-[10px] text-slate-400">ISO</p>
                          <p className="font-semibold mt-0.5">{photo.iso}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Geotag & Interactive Mini Map Card */}
                {photo.latitude !== null && photo.latitude !== undefined && photo.longitude !== null && photo.longitude !== undefined ? (
                  <div className="bg-slate-800/60 rounded-xl p-3 space-y-2.5 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="truncate">
                          {photo.location_name || 'Geotagged Location'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">
                          {photo.latitude.toFixed(3)}, {photo.longitude.toFixed(3)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsEditingLocation(!isEditingLocation)}
                          className="p-1 hover:bg-slate-700 text-slate-400 hover:text-emerald-300 rounded transition"
                          title="Edit Location"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {isEditingLocation ? (
                      <div className="bg-slate-900/80 rounded-lg p-2.5 space-y-2 border border-slate-700/60">
                        <p className="text-[10px] uppercase font-bold text-slate-400">Edit Photo Location</p>
                        <input
                          type="text"
                          placeholder="Place name (e.g. Kanyakumari, Tamil Nadu)..."
                          value={locName}
                          onChange={(e) => setLocName(e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-emerald-500"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Latitude"
                            value={locLat}
                            onChange={(e) => setLocLat(e.target.value)}
                            className="w-1/2 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-white focus:outline-none font-mono text-[10px]"
                          />
                          <input
                            type="text"
                            placeholder="Longitude"
                            value={locLon}
                            onChange={(e) => setLocLon(e.target.value)}
                            className="w-1/2 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-white focus:outline-none font-mono text-[10px]"
                          />
                        </div>
                        <div className="flex gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSaveLocation()}
                            disabled={savingLoc}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition"
                          >
                            {savingLoc ? 'Saving...' : 'Save Location'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveLocation('', null as any, null as any)}
                            disabled={savingLoc}
                            className="px-2.5 py-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded text-[11px] transition"
                            title="Remove Geotag"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingLocation(false)}
                            className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-[11px] transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Interactive OpenStreetMap Embed */}
                        <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-950 aspect-[16/9]">
                          <iframe
                            title="Photo Location Map"
                            src={`https://www.openstreetmap.org/export/embed.html?bbox=${photo.longitude - 0.008}%2C${photo.latitude - 0.008}%2C${photo.longitude + 0.008}%2C${photo.latitude + 0.008}&layer=mapnik&marker=${photo.latitude}%2C${photo.longitude}`}
                            className="w-full h-full border-0 pointer-events-none"
                            loading="lazy"
                          />
                        </div>

                        {/* Direct External Map Links */}
                        <div className="flex items-center gap-2 pt-1">
                          <a
                            href={`https://www.google.com/maps?q=${photo.latitude},${photo.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-900 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Google Maps
                          </a>
                          <a
                            href={`https://maps.apple.com/?ll=${photo.latitude},${photo.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-900 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Apple Maps
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* No Location Card - Quick Presets & Add Location */
                  <div className="bg-slate-800/40 rounded-xl p-3 space-y-2 border border-dashed border-slate-700/80">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-300 text-xs font-medium">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>No Location Assigned</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsEditingLocation(!isEditingLocation)}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        {isEditingLocation ? 'Cancel' : '+ Add Location'}
                      </button>
                    </div>

                    {isEditingLocation ? (
                      <div className="pt-2 space-y-2">
                        <p className="text-[10px] text-slate-400">Quick Outing Presets:</p>
                        <div className="grid grid-cols-1 gap-1">
                          <button
                            type="button"
                            onClick={() => handleSaveLocation('Pottalkulam, Tamil Nadu, India', 8.077913, 77.551231)}
                            className="text-left px-2 py-1 bg-slate-900/80 hover:bg-slate-700 rounded text-[10px] text-emerald-300 truncate"
                          >
                            📍 Kanyakumari / Pottalkulam (Sunrise)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveLocation('Bengaluru, Karnataka, India', 12.931643, 77.545616)}
                            className="text-left px-2 py-1 bg-slate-900/80 hover:bg-slate-700 rounded text-[10px] text-indigo-300 truncate"
                          >
                            📍 Bengaluru, Karnataka (Sept 22)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveLocation('Thalaiyuthu, Tamil Nadu, India', 8.727996, 77.686714)}
                            className="text-left px-2 py-1 bg-slate-900/80 hover:bg-slate-700 rounded text-[10px] text-amber-300 truncate"
                          >
                            📍 Thalaiyuthu / Tirunelveli (Oct 24)
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Or type custom city/place..."
                          value={locName}
                          onChange={(e) => setLocName(e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveLocation()}
                          disabled={!locName.trim() || savingLoc}
                          className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-[11px] font-semibold"
                        >
                          {savingLoc ? 'Saving...' : 'Set Location'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500">
                        Tag this photo with its outing or city so it appears on the interactive map explorer.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* People & Faces Tagging Tab */
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Detected People ({faces.length})</span>
                  <button
                    onClick={() => setIsAddingFace(!isAddingFace)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      isAddingFace 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-slate-800 hover:bg-slate-700 text-indigo-400'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddingFace ? 'Cancel Tag' : 'Tag Face'}</span>
                  </button>
                </div>

                {faces.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 space-y-2">
                    <Users className="w-8 h-8 mx-auto opacity-40" />
                    <p>No faces detected on this photo.</p>
                    <p className="text-[11px]">Click &quot;Tag Face&quot; above to manually label someone.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {faces.map((face) => (
                      <div
                        key={face.id}
                        className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-3 flex flex-col gap-2 transition hover:border-slate-600"
                      >
                        {editingFaceId === face.id ? (
                          <div className="space-y-2">
                            <label className="text-[11px] text-slate-400">Name this person:</label>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                placeholder="Type name..."
                                className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateFaceTag(face.id, editingName);
                                  if (e.key === 'Escape') setEditingFaceId(null);
                                }}
                              />
                              <button
                                onClick={() => handleUpdateFaceTag(face.id, editingName)}
                                className="p-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingFaceId(null)}
                                className="p-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Suggestions from known people */}
                            {knownPeople.length > 0 && (
                              <div className="pt-1">
                                <span className="text-[10px] text-slate-500">Or pick existing:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {knownPeople.slice(0, 5).map((p) => (
                                    <button
                                      key={p.id}
                                      onClick={() => handleUpdateFaceTag(face.id, p.name)}
                                      className="text-[10px] bg-slate-900 hover:bg-indigo-900/60 text-slate-300 hover:text-indigo-200 px-2 py-0.5 rounded border border-slate-700"
                                    >
                                      {p.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold text-xs uppercase">
                                {face.person_name && face.person_name !== 'Unnamed' 
                                  ? face.person_name[0] 
                                  : '?'}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-100">
                                  {face.person_name || 'Unnamed Person'}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  Confidence: {Math.round(face.confidence * 100)}%
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingFaceId(face.id);
                                  setEditingName(face.person_name !== 'Unnamed' ? face.person_name : '');
                                }}
                                className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700/50 rounded"
                                title="Rename / Tag"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteFace(face.id)}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded"
                                title="Delete Face Tag"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons Footer */}
          <div className="p-4 border-t border-slate-800 flex items-center gap-2 bg-slate-900/90">
            <a
              href={`${apiUrl}/api/v1/media/${photo.id}/download`}
              download
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              onClick={() => onToggleFavorite(photo.id)}
              className={`p-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition ${
                photo.is_favorite ? 'text-red-500' : 'text-slate-300'
              }`}
              title="Favorite"
            >
              <Heart className={`w-4 h-4 ${photo.is_favorite ? 'fill-red-500' : ''}`} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg border border-slate-700 hover:bg-red-950/50 hover:text-red-400 text-slate-400 transition"
              title="Delete Photo"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Delete Confirmation Modal Overlay */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Delete Photo?</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {photo.source_type === 'google_drive'
                  ? 'This will remove the photo from MyMemoryPics and move it to trash in your Google Drive.'
                  : 'This will remove the photo from your library and storage.'}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Photo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
