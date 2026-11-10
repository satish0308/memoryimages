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
  Play,
  Wand2,
  Sun,
  Mountain,
  Sliders,
  Loader2,
  Share2,
  Cloud,
  ShieldCheck,
  Search,
  Crown,
  AlertTriangle,
  FileText,
  Copy,
  ScanText
} from 'lucide-react';
import { MediaItem } from './PhotoCard';
import { SharePhotoModal } from './SharePhotoModal';
import { SearchPersonModal } from '@/components/people/SearchPersonModal';

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
  onSelectPhoto?: (photoOrId: MediaItem | number) => void;
  onBackupToDrive?: (photo: MediaItem) => void;
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
  onSelectPhoto,
  onBackupToDrive,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isHighResLoaded, setIsHighResLoaded] = useState(false);
  const [currentDisplaySrc, setCurrentDisplaySrc] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'faces'>('info');
  const [showFaceBoxes, setShowFaceBoxes] = useState(false);
  const [faces, setFaces] = useState<FaceData[]>([]);
  const [editingFaceId, setEditingFaceId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [knownPeople, setKnownPeople] = useState<{ id: number; name: string }[]>([]);
  const [isAddingFace, setIsAddingFace] = useState(false);

  // Video Studio Frame Grabber State
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [capturedFrameData, setCapturedFrameData] = useState<{
    dataUrl: string;
    timestamp: number;
    width: number;
    height: number;
  } | null>(null);
  const [isSavingFrame, setIsSavingFrame] = useState(false);
  const [savedFrameSuccess, setSavedFrameSuccess] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  // AI Aesthetics & Quality State
  const [aestheticData, setAestheticData] = useState<any>(null);
  const [loadingAesthetics, setLoadingAesthetics] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(photo?.category || 'memory');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [locName, setLocName] = useState(photo?.location_name || '');
  const [locLat, setLocLat] = useState<string>(photo?.latitude != null ? photo.latitude.toString() : '');
  const [locLon, setLocLon] = useState<string>(photo?.longitude != null ? photo.longitude.toString() : '');
  const [savingLoc, setSavingLoc] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPlayingMotion, setIsPlayingMotion] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [searchModalFaceId, setSearchModalFaceId] = useState<number | null>(null);
  const [searchModalCustomBox, setSearchModalCustomBox] = useState<{
    mediaId: number;
    boxX: number;
    boxY: number;
    boxW: number;
    boxH: number;
  } | null>(null);
  const [isSearchPersonOpen, setIsSearchPersonOpen] = useState(false);

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

  // AI Image Enhancement Studio State
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<'auto_magic' | 'shadow_fix' | 'dehaze' | 'super_res'>('auto_magic');
  const [sliderPos, setSliderPos] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [isSavingEnhancedCopy, setIsSavingEnhancedCopy] = useState(false);
  const [isEnhanceLoading, setIsEnhanceLoading] = useState(false);
  const [enhancedSuccessMsg, setEnhancedSuccessMsg] = useState<string | null>(null);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  const handleSelectPreset = (preset: 'auto_magic' | 'shadow_fix' | 'dehaze' | 'super_res') => {
    setSelectedPreset(preset);
    setIsEnhanceLoading(true);
  };

  const handleSliderMove = (clientX: number) => {
    if (!sliderContainerRef.current) return;
    const rect = sliderContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pos = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, pos)));
  };

  const handleSaveEnhancedCopy = async () => {
    if (!photo) return;
    try {
      setIsSavingEnhancedCopy(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/v1/media/${photo.id}/enhance/save?preset=${selectedPreset}`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        setEnhancedSuccessMsg('Enhanced copy saved to your library!');
        setTimeout(() => setEnhancedSuccessMsg(null), 3500);
      }
    } catch (e) {
      console.error('Failed to save enhanced photo:', e);
    } finally {
      setIsSavingEnhancedCopy(false);
    }
  };

  // Apple-Style Live Text OCR State
  const [showLiveText, setShowLiveText] = useState(false);
  const [liveTextBlocks, setLiveTextBlocks] = useState<Array<{ text: string; box_x: number; box_y: number; box_w: number; box_h: number }>>([]);
  const [liveTextFull, setLiveTextFull] = useState<string>('');
  const [isLoadingLiveText, setIsLoadingLiveText] = useState(false);
  const [copiedTextMsg, setCopiedTextMsg] = useState<string | null>(null);

  // Reset Live Text when navigating photos
  useEffect(() => {
    setShowLiveText(false);
    setLiveTextBlocks([]);
    setLiveTextFull('');
    setCopiedTextMsg(null);
  }, [photo?.id]);

  const handleToggleLiveText = async () => {
    if (!photo) return;
    const nextState = !showLiveText;
    setShowLiveText(nextState);

    if (nextState && liveTextBlocks.length === 0 && !liveTextFull) {
      setIsLoadingLiveText(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${apiUrl}/api/v1/media/${photo.id}/ocr`, { headers });
        if (res.ok) {
          const data = await res.json();
          setLiveTextBlocks(data.blocks || []);
          setLiveTextFull(data.full_text || '');
        }
      } catch (e) {
        console.error('Live text fetch error:', e);
      } finally {
        setIsLoadingLiveText(false);
      }
    }
  };

  const copyLiveTextToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedTextMsg('Copied to clipboard!');
    setTimeout(() => setCopiedTextMsg(null), 2500);
  };

  useEffect(() => {
    if (!isDraggingSlider) return;
    const handleMouseUp = () => setIsDraggingSlider(false);
    const handleMouseMove = (e: MouseEvent) => {
      handleSliderMove(e.clientX);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        handleSliderMove(e.touches[0].clientX);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isDraggingSlider]);

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

  // Fetch AI Aesthetics & Best Shot data (lazy-loaded only when Info Sidebar is open)
  useEffect(() => {
    if (!photo || !showSidebar) {
      setAestheticData(null);
      return;
    }
    let isMounted = true;
    const fetchAesthetics = async () => {
      try {
        setLoadingAesthetics(true);
        const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${apiUrl}/api/v1/media/${photo.id}/aesthetics`, { headers });
        if (res.ok && isMounted) {
          const data = await res.json();
          setAestheticData(data);
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoadingAesthetics(false);
      }
    };
    fetchAesthetics();
    return () => { isMounted = false; };
  }, [photo?.id, showSidebar, apiUrl]);

  // Video Studio Frame Grabber Handlers
  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedFrameData({
      dataUrl,
      timestamp: video.currentTime,
      width: canvas.width,
      height: canvas.height,
    });
    setSavedFrameSuccess(null);
    setShowCaptureModal(true);
  };

  const handleSaveFrameToLibrary = async () => {
    if (!capturedFrameData || !photo) return;
    try {
      setIsSavingFrame(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/v1/media/${photo.id}/capture-frame`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          timestamp_seconds: capturedFrameData.timestamp,
          image_base64: capturedFrameData.dataUrl,
          save_to_library: true
        })
      });
      if (!res.ok) throw new Error('Failed to save frame');
      const data = await res.json();
      setSavedFrameSuccess(`Saved frame as Photo #${data.media_id}!`);
      setTimeout(() => setSavedFrameSuccess(null), 4000);
    } catch (e) {
      console.error('Frame save error:', e);
      alert('Failed to save frame to library.');
    } finally {
      setIsSavingFrame(false);
    }
  };

  const handleDownloadCapturedFrame = () => {
    if (!capturedFrameData || !photo) return;
    const link = document.createElement('a');
    const baseName = photo.filename.replace(/\.[^/.]+$/, '');
    const tsStr = Math.round(capturedFrameData.timestamp * 100);
    link.download = `Frame_${baseName}_${tsStr}.jpg`;
    link.href = capturedFrameData.dataUrl;
    link.click();
  };

  const stepVideoFrame = (deltaFrames: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = Math.max(0, Math.min(video.duration || 9999, video.currentTime + (deltaFrames / 30)));
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  // Reset delete confirm modal when switching photos
  useEffect(() => {
    setShowDeleteConfirm(false);
    setIsDeleting(false);
    setIsPlayingMotion(false);
    setIsEnhancing(false);
    setSliderPos(50);
    setShowFaceBoxes(false);
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

    if (!photo.is_video && !photo.enhancement_data) {
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

  // Reset zoom, pan, and high-res state whenever a new photo is opened, and instantly display cached thumbnail
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

    if (!photo?.id) {
      setCurrentDisplaySrc('');
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
    const tokenParam = token ? `&token=${token}` : '';
    const tokenQuery = token ? `?token=${token}` : '';

    // Step 1: Instant 0ms display using low-res thumbnail already in browser memory cache!
    const initialThumb = photo.thumbnail_url
      ? (photo.thumbnail_url.startsWith('http')
          ? photo.thumbnail_url
          : `${apiUrl}${photo.thumbnail_url}${photo.thumbnail_url.includes('?') ? tokenParam : tokenQuery}`)
      : `${apiUrl}/api/v1/media/${photo.id}/thumbnail?size=256${tokenParam}`;
    setCurrentDisplaySrc(initialThumb);

    // Step 2: Background preload 1080p preview for full crisp quality
    let isMounted = true;
    if (!photo.is_video) {
      const preview1080Url = `${apiUrl}/api/v1/media/${photo.id}/thumbnail?size=1080${tokenParam}`;
      const img1080 = new window.Image();
      img1080.src = preview1080Url;
      img1080.onload = () => {
        if (isMounted) {
          setCurrentDisplaySrc(preview1080Url);
        }
      };
    }

    // Step 3: Fetch detected faces for this photo
    fetchFaces(photo.id);

    return () => {
      isMounted = false;
    };
  }, [photo?.id, apiUrl]);

  // On-demand original raw download only when zooming deep (> 1.2x) to save network & memory
  useEffect(() => {
    if (!photo?.id || photo.is_video || isHighResLoaded || zoom <= 1.2) return;

    let isMounted = true;
    const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
    const fullResUrl = `${apiUrl}/api/v1/media/${photo.id}/view${token ? `?token=${token}` : ''}`;
    const fullImg = new window.Image();
    fullImg.src = fullResUrl;
    fullImg.onload = () => {
      if (isMounted) {
        setIsHighResLoaded(true);
        setCurrentDisplaySrc(fullResUrl);
      }
    };

    return () => {
      isMounted = false;
    };
  }, [photo?.id, zoom, isHighResLoaded, apiUrl]);

  // Load known people list on-demand only when face editing/tagging is activated
  useEffect(() => {
    if ((showSidebar && activeTab === 'faces') || isAddingFace || editingFaceId !== null) {
      if (knownPeople.length === 0) {
        fetchKnownPeople();
      }
    }
  }, [showSidebar, activeTab, isAddingFace, editingFaceId, knownPeople.length, apiUrl]);

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
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/v1/people/media/${photoId}/faces`, { headers });
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/v1/people`, { headers });
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/v1/people/faces/${faceId}`, {
        method: 'PATCH',
        headers,
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/v1/people/faces/${faceId}`, {
        method: 'DELETE',
        headers,
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

    setIsAddingFace(false);
    setSearchModalCustomBox({
      mediaId: photo.id,
      boxX: Math.round(box_x * 1000) / 1000,
      boxY: Math.round(box_y * 1000) / 1000,
      boxW: Math.round(box_w * 1000) / 1000,
      boxH: Math.round(box_h * 1000) / 1000,
    });
    setSearchModalFaceId(null);
    setIsSearchPersonOpen(true);
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
        setShowSidebar((prev) => !prev);
      } else if (e.key.toLowerCase() === 'p') {
        setShowShareModal(true);
      } else if (e.key.toLowerCase() === 's') {
        window.open(`/similar?id=${photo.id}`, '_blank');
      } else if (e.key.toLowerCase() === 'e' && !photo.is_video) {
        window.location.href = `/edit?id=${photo.id}`;
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

  const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
  const tokenParam = token ? `&token=${token}` : '';
  const tokenQuery = token ? `?token=${token}` : '';

  const highResUrl = `${apiUrl}/api/v1/media/${photo.id}/view${tokenQuery}`;
  const displayImageUrl = currentDisplaySrc || (isHighResLoaded
    ? highResUrl
    : `${apiUrl}/api/v1/media/${photo.id}/thumbnail?size=1080${tokenParam}`);
  const videoUrl = `${apiUrl}/api/v1/media/${photo.id}/view${tokenQuery}`;
  const motionVideoUrl = `${apiUrl}/api/v1/media/${photo.id}/motion-video${tokenQuery}`;

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
          {!photo.is_video && (
            <a
              href={`/edit?id=${photo.id}`}
              className="px-3 py-2 bg-indigo-600/90 hover:bg-indigo-600 text-white font-semibold text-xs rounded-full transition shadow-lg backdrop-blur-sm cursor-pointer flex items-center gap-1.5 border border-indigo-400/40 hover:scale-105"
              title="Open Photo Editing Studio (E)"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edit</span>
            </a>
          )}
          <button
            onClick={() => setShowShareModal(true)}
            className="p-2.5 bg-black/60 text-white hover:bg-black/90 rounded-full transition shadow-lg backdrop-blur-sm cursor-pointer hover:text-indigo-400"
            title="Share Photo (P)"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2.5 rounded-full transition shadow-lg backdrop-blur-sm cursor-pointer ${
              showSidebar
                ? 'bg-indigo-600 text-white shadow-indigo-500/30 ring-2 ring-indigo-400/50'
                : 'bg-black/60 text-white hover:bg-black/90'
            }`}
            title={showSidebar ? "Hide Info Sidebar (i)" : "Show Info & EXIF (i)"}
          >
            <Info className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2.5 bg-black/60 text-white rounded-full hover:bg-black/90 transition shadow-lg backdrop-blur-sm cursor-pointer"
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
          {/* AI Enhancement Studio Floating Control Dock */}
          {isEnhancing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 backdrop-blur-md border border-indigo-500/40 px-3 py-2 rounded-2xl flex flex-wrap items-center gap-2 text-white shadow-2xl animate-fadeIn max-w-[95%]">
              <div className="flex items-center gap-1.5 pr-2 border-r border-slate-700 text-xs font-bold text-indigo-400">
                <Wand2 className="w-4 h-4" />
                <span className="hidden sm:inline">AI Studio</span>
              </div>

              {/* Preset Selector */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('auto_magic')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    selectedPreset === 'auto_magic'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Dual-Domain CLAHE + Auto White Balance"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Auto Magic</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('shadow_fix')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    selectedPreset === 'shadow_fix'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Backlight Recovery & Dark Shadow Lifter"
                >
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                  <span>Shadow Lifter</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('dehaze')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    selectedPreset === 'dehaze'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Dark Channel Prior Atmospheric De-Hazing"
                >
                  <Mountain className="w-3.5 h-3.5 text-emerald-400" />
                  <span>De-Haze</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('super_res')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    selectedPreset === 'super_res'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                  title="2x ESRGAN Neural Super-Resolution Upscaler"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>2x Super-Res</span>
                </button>
              </div>

              <div className="h-5 w-px bg-slate-700 hidden sm:block" />

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSaveEnhancedCopy}
                  disabled={isSavingEnhancedCopy}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition cursor-pointer"
                  title="Save a new enhanced copy to your library"
                >
                  {isSavingEnhancedCopy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Copy</span>
                </button>

                <a
                  href={`${apiUrl}/api/v1/media/${photo.id}/enhance?preset=${selectedPreset}${typeof window !== 'undefined' && localStorage.getItem('memorypics_token') ? `&token=${localStorage.getItem('memorypics_token')}` : ''}`}
                  download={`enhanced_${selectedPreset}_${photo.filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                  title="Download Enhanced WebP"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => setIsEnhancing(false)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="Close AI Studio"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Enhancement Saved Success Notification Toast */}
          {enhancedSuccessMsg && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-emerald-600 text-white text-xs px-4 py-2 rounded-full shadow-2xl font-semibold animate-fadeIn flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{enhancedSuccessMsg}</span>
            </div>
          )}

          {/* Previous Photo Button */}
          {hasPrev && onNavigatePrev && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigatePrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-black/75 hover:bg-indigo-600 text-white rounded-full backdrop-blur-md transition-all shadow-2xl border border-white/20 hover:border-indigo-400 cursor-pointer hover:scale-110 active:scale-95 group"
              title="Previous Photo (Left Arrow key)"
            >
              <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
            </button>
          )}

          {/* Next Photo Button */}
          {hasNext && onNavigateNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-black/75 hover:bg-indigo-600 text-white rounded-full backdrop-blur-md transition-all shadow-2xl border border-white/20 hover:border-indigo-400 cursor-pointer hover:scale-110 active:scale-95 group"
              title="Next Photo (Right Arrow key)"
            >
              <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
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
                  src={videoUrl}
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

                {/* Video Studio Controls HUD */}
                <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/70 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl flex-wrap justify-center z-20">
                  {/* Capture Best Frame Shutter Button */}
                  <button
                    type="button"
                    onClick={handleCaptureFrame}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold shadow-md transition transform hover:scale-105"
                    title="Capture current video frame as high-resolution photo"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Capture Best Frame</span>
                  </button>

                  <div className="h-4 w-px bg-slate-700 mx-1" />

                  {/* Frame-by-Frame Stepper */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => stepVideoFrame(-1)}
                      className="px-2 py-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition text-[11px] font-medium"
                      title="Step back 1 frame (-0.033s)"
                    >
                      ◀ 1F
                    </button>
                    <button
                      type="button"
                      onClick={() => stepVideoFrame(1)}
                      className="px-2 py-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition text-[11px] font-medium"
                      title="Step forward 1 frame (+0.033s)"
                    >
                      1F ▶
                    </button>
                  </div>

                  <div className="h-4 w-px bg-slate-700 mx-1" />

                  {/* Playback Speed Selector */}
                  <div className="flex items-center gap-1 text-[11px]">
                    {[0.5, 1, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => changePlaybackRate(rate)}
                        className={`px-2 py-0.5 rounded-md font-mono transition ${
                          playbackRate === rate
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

                {savedFrameSuccess && (
                  <div className="bg-emerald-600/90 text-white text-xs px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-fadeIn">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>{savedFrameSuccess}</span>
                  </div>
                )}
              </div>
            ) : isPlayingMotion && photo?.has_motion_photo ? (
              <video
                src={motionVideoUrl}
                autoPlay
                loop
                playsInline
                controls
                className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
              />
            ) : isEnhancing ? (
              <div
                ref={sliderContainerRef}
                className="relative inline-block max-h-[85vh] max-w-full select-none cursor-ew-resize rounded-lg overflow-hidden shadow-2xl"
                onMouseDown={(e) => {
                  setIsDraggingSlider(true);
                  handleSliderMove(e.clientX);
                }}
                onTouchStart={(e) => {
                  setIsDraggingSlider(true);
                  if (e.touches[0]) handleSliderMove(e.touches[0].clientX);
                }}
              >
                {/* Before (Original) Base Image */}
                <img
                  src={displayImageUrl}
                  alt="Original"
                  className="max-h-[85vh] max-w-full object-contain pointer-events-none select-none block"
                  draggable={false}
                />

                {/* After (Enhanced) Overlay with clipPath */}
                <img
                  key={`${photo.id}-${selectedPreset}`}
                  src={`${apiUrl}/api/v1/media/${photo.id}/enhance?preset=${selectedPreset}${typeof window !== 'undefined' && localStorage.getItem('memorypics_token') ? `&token=${localStorage.getItem('memorypics_token')}` : ''}`}
                  alt="Enhanced"
                  onLoad={() => setIsEnhanceLoading(false)}
                  onError={() => setIsEnhanceLoading(false)}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                  style={{
                    clipPath: `polygon(${sliderPos}% 0, 100% 0, 100% 100%, ${sliderPos}% 100%)`,
                  }}
                  draggable={false}
                />

                {/* Slider Divider Line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.9)] pointer-events-none"
                  style={{ left: `${sliderPos}%` }}
                >
                  {/* Circular Drag Handle */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-900/90 text-white border-2 border-white shadow-2xl flex items-center justify-center pointer-events-auto cursor-ew-resize hover:scale-110 transition-transform">
                    <span className="text-[10px] font-bold tracking-tighter select-none">◀▶</span>
                  </div>
                </div>

                {/* Labels: Original & Enhanced */}
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-medium text-white border border-white/10 pointer-events-none shadow-lg">
                  Original
                </div>
                <div className="absolute top-3 right-3 bg-indigo-600/85 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-medium text-white border border-indigo-400/30 pointer-events-none flex items-center gap-1.5 shadow-lg">
                  <Wand2 className="w-3 h-3 text-indigo-200" />
                  <span>
                    {selectedPreset === 'auto_magic' && 'Auto Magic'}
                    {selectedPreset === 'shadow_fix' && 'Shadow Lifter'}
                    {selectedPreset === 'dehaze' && 'Vibrant De-Haze'}
                    {selectedPreset === 'super_res' && '2x Super-Res'}
                  </span>
                </div>

                {/* Loading Indicator Overlay */}
                {isEnhanceLoading && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                    <div className="p-3 bg-slate-900/90 rounded-2xl border border-indigo-500/40 flex items-center gap-3 text-white shadow-2xl">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      <span className="text-xs font-semibold">Applying AI Enhancement...</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <img
                ref={imageRef}
                src={displayImageUrl}
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
            {showFaceBoxes && zoom === 1 && !isEnhancing && faces.map((face) => (
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
                  setShowSidebar(true);
                  setActiveTab('faces');
                  setEditingFaceId(face.id);
                  setEditingName(face.person_name !== 'Unnamed' ? face.person_name : '');
                }}
              >
                {/* Floating Face Name Tag Badge & Quick Search */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1">
                  <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/90 text-white shadow-lg border border-slate-700 pointer-events-none group-hover:scale-105 transition">
                    {face.person_name || 'Unnamed'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSearchModalFaceId(face.id);
                      setSearchModalCustomBox(null);
                      setIsSearchPersonOpen(true);
                    }}
                    className="p-1 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition cursor-pointer"
                    title="Find all photos of this person in library"
                  >
                    <Search className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Apple-Style Live Text OCR Overlay Canvas */}
            {showLiveText && zoom === 1 && !isEnhancing && (
              <>
                {liveTextBlocks.map((block, idx) => (
                  <div
                    key={idx}
                    style={{
                      left: `${block.box_x * 100}%`,
                      top: `${block.box_y * 100}%`,
                      width: `${block.box_w * 100}%`,
                      height: `${block.box_h * 100}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyLiveTextToClipboard(block.text);
                    }}
                    title={`Click to copy: "${block.text}"`}
                    className="absolute cursor-pointer border border-sky-400/80 bg-sky-500/25 hover:bg-sky-500/40 rounded transition-all group backdrop-blur-[1px] shadow-sm hover:shadow-sky-500/50"
                  >
                    <div className="hidden group-hover:flex absolute -top-7 left-1/2 -translate-x-1/2 z-40 items-center gap-1 bg-slate-950/95 text-white text-[10px] px-2 py-0.5 rounded shadow-lg border border-slate-700 whitespace-nowrap">
                      <Copy className="w-2.5 h-2.5 text-sky-400" />
                      <span>Copy</span>
                    </div>
                  </div>
                ))}

                {/* Floating Bottom Live Text Action Bar */}
                <div className="absolute bottom-4 right-4 z-30 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-sky-500/40 shadow-xl">
                  <FileText className="w-4 h-4 text-sky-400" />
                  <span className="text-xs text-slate-200">
                    {isLoadingLiveText
                      ? 'Scanning text...'
                      : liveTextBlocks.length > 0
                      ? `${liveTextBlocks.length} text region(s)`
                      : 'No text detected'}
                  </span>
                  {(liveTextFull || liveTextBlocks.length > 0) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyLiveTextToClipboard(liveTextFull || liveTextBlocks.map((b) => b.text).join('\n'));
                      }}
                      className="flex items-center gap-1 ml-2 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl shadow transition"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy All</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Live Text Copied Toast */}
            {copiedTextMsg && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
                <Check className="w-4 h-4" />
                <span>{copiedTextMsg}</span>
              </div>
            )}
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

            {/* Quick Prev / Next Arrows in Bottom Dock */}
            {(hasPrev || hasNext) && (
              <>
                <button
                  type="button"
                  onClick={onNavigatePrev}
                  disabled={!hasPrev}
                  className="p-1 hover:bg-white/10 text-slate-300 hover:text-white rounded-full transition disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  title="Previous Photo (Left Arrow)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onNavigateNext}
                  disabled={!hasNext}
                  className="p-1 hover:bg-white/10 text-slate-300 hover:text-white rounded-full transition disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  title="Next Photo (Right Arrow)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-slate-700" />
              </>
            )}

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

            {/* Apple-Style Live Text OCR Toggle */}
            <button
              onClick={handleToggleLiveText}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition ${
                showLiveText 
                  ? 'bg-sky-600/40 text-sky-200 border border-sky-400/50 shadow-sm shadow-sky-500/20' 
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Apple-Style Live Text: Select & Copy Text from Photo"
            >
              <ScanText className="w-3.5 h-3.5" />
              <span>Live Text</span>
              {liveTextBlocks.length > 0 && (
                <span className="bg-sky-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                  {liveTextBlocks.length}
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

                {/* AI Studio Enhancer Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !isEnhancing;
                    setIsEnhancing(next);
                    if (next) setIsEnhanceLoading(true);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                    isEnhancing
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30'
                      : 'text-indigo-300 hover:text-white hover:bg-white/10'
                  }`}
                  title="Open AI Enhancement Studio (Split-Slider, Super-Res, Shadow Recovery, De-Haze)"
                >
                  <Wand2 className={`w-3.5 h-3.5 ${isEnhancing ? 'animate-pulse text-white' : 'text-indigo-400'}`} />
                  <span>AI Studio</span>
                </button>

                <div className="h-4 w-px bg-slate-700" />
              </>
            )}

            {/* Share Photo Modal Toggle */}
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold text-indigo-300 hover:text-white hover:bg-indigo-500/20 transition cursor-pointer border border-indigo-500/30 shadow-sm"
              title="Share Photo (P)"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Share</span>
            </button>

            {/* Info & EXIF Sidebar Toggle */}
            <button
              type="button"
              onClick={() => setShowSidebar(!showSidebar)}
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                showSidebar 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title="Toggle Info & EXIF Sidebar (i)"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Info</span>
            </button>

            {/* Find Similar Photos (New Tab) */}
            {photo && (
              <button
                type="button"
                onClick={() => window.open(`/similar?id=${photo.id}`, '_blank')}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold text-emerald-300 hover:text-white hover:bg-emerald-500/20 transition cursor-pointer border border-emerald-500/30 shadow-sm"
                title="Find visually, facially, and geographically similar photos in a new tab (Press S)"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Similar</span>
              </button>
            )}

            <div className="h-4 w-px bg-slate-700" />

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
          <div className="w-full md:w-88 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col justify-between flex-shrink-0 z-20 animate-fadeIn max-md:absolute max-md:inset-0 max-md:z-50">
            
            {/* Sidebar Tabs Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-4 pt-3">
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                    activeTab === 'info'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Info & EXIF</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('faces');
                    setShowFaceBoxes(true);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                    activeTab === 'faces'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>People & Faces ({faces.length})</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowSidebar(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                title="Hide Info Sidebar"
              >
                <X className="w-4 h-4" />
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

                {/* AI Aesthetics & Best Shot Inspector Card */}
                <div className="bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900/90 rounded-xl p-3.5 space-y-3 border border-amber-500/20 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span>AI Aesthetics & Quality</span>
                    </div>
                    {aestheticData?.is_best_shot ? (
                      <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <Crown className="w-3 h-3 fill-slate-950" />
                        BEST SHOT
                      </span>
                    ) : aestheticData?.burst_info ? (
                      <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        Rank #{aestheticData.burst_info.rank} of {aestheticData.burst_info.total_count}
                      </span>
                    ) : null}
                  </div>

                  {/* Overall Score & Verdict */}
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] text-slate-400">Composite Score</span>
                      <span className="text-base font-extrabold text-amber-300 font-mono">
                        {Math.round(aestheticData?.scores?.composite_score ?? (photo.aesthetic_score || 78))}/100
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 italic">
                      "{aestheticData?.scores?.verdict || (photo.is_blurry ? 'Out of Focus or Blurry' : 'Sharp focus & balanced lighting')}"
                    </p>
                  </div>

                  {/* Breakdown Bars */}
                  <div className="space-y-2 pt-1">
                    {/* Sharpness */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Sharpness</span>
                        <span className="font-mono text-slate-200">
                          {Math.round(aestheticData?.scores?.sharpness_score ?? 80)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(5, aestheticData?.scores?.sharpness_score ?? 80))}%` }}
                        />
                      </div>
                    </div>

                    {/* Exposure */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Exposure & Lighting</span>
                        <span className="font-mono text-slate-200">
                          {Math.round(aestheticData?.scores?.exposure_score ?? 82)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(5, aestheticData?.scores?.exposure_score ?? 82))}%` }}
                        />
                      </div>
                    </div>

                    {/* Expression / Smile */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Expression & Mood</span>
                        <span className="font-mono text-slate-200">
                          {Math.round(aestheticData?.scores?.expression_score ?? 60)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-400 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(5, aestheticData?.scores?.expression_score ?? 60))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions for Burst or Blurry Photos */}
                  {aestheticData?.burst_info && !aestheticData.is_best_shot && (
                    <div className="pt-2 border-t border-amber-500/20">
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectPhoto && aestheticData.burst_info.best_shot_id) {
                            onSelectPhoto(aestheticData.burst_info.best_shot_id);
                          }
                        }}
                        className="w-full py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                        <span>Switch to Best Shot in Sequence</span>
                      </button>
                    </div>
                  )}

                  {photo.is_blurry && !photo.is_bokeh && (
                    <div className="pt-2 border-t border-amber-500/20 flex items-center justify-between">
                      <span className="text-[11px] text-rose-400 font-medium">Flagged for Cleanup</span>
                      <button
                        type="button"
                        onClick={() => onDelete(photo.id)}
                        className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-lg text-[11px] font-semibold transition"
                      >
                        Move to Trash
                      </button>
                    </div>
                  )}
                </div>

                {/* Google Drive Cloud Backup Card */}
                <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900/90 rounded-xl p-3.5 space-y-2.5 border border-indigo-500/30 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
                      <Cloud className="w-4 h-4 text-indigo-400" />
                      <span>Google Drive Cloud Backup</span>
                    </div>
                    {photo.is_backed_up_gdrive ? (
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <Check className="w-2.5 h-2.5" />
                        BACKED UP
                      </span>
                    ) : (
                      <span className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        Not Backed Up
                      </span>
                    )}
                  </div>

                  {photo.is_backed_up_gdrive ? (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">Target Folder:</span>
                        <span className="font-semibold text-indigo-200">
                          📁 {photo.gdrive_backup_folder_name || 'Google Drive'}
                        </span>
                      </div>
                      {photo.gdrive_backed_up_at && (
                        <div className="flex items-center justify-between text-slate-300 text-[11px]">
                          <span className="text-slate-400">Backed up on:</span>
                          <span className="text-slate-400 font-mono">
                            {new Date(photo.gdrive_backed_up_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-400">
                        Lossless bit-for-bit master backup
                      </span>
                      {onBackupToDrive && (
                        <button
                          type="button"
                          onClick={() => onBackupToDrive(photo)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                        >
                          <Cloud className="w-3 h-3" />
                          <span>Backup Now</span>
                        </button>
                      )}
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
                                  setSearchModalFaceId(face.id);
                                  setSearchModalCustomBox(null);
                                  setIsSearchPersonOpen(true);
                                }}
                                className="px-2 py-1 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 rounded text-indigo-300 text-[10px] font-semibold flex items-center gap-1 transition"
                                title="Find all photos of this person in library"
                              >
                                <Search className="w-3 h-3 text-indigo-400" />
                                <span>Find</span>
                              </button>
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
            {!photo.is_video && (
              <a
                href={`/edit?id=${photo.id}`}
                className="p-2 rounded-lg border border-indigo-500/50 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 hover:text-white transition"
                title="Edit Photo Studio (E)"
              >
                <Sliders className="w-4 h-4" />
              </a>
            )}
            {onBackupToDrive && (
              <button
                type="button"
                onClick={() => onBackupToDrive(photo)}
                className={`p-2 rounded-lg border transition ${
                  photo.is_backed_up_gdrive
                    ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50'
                    : 'border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title={
                  photo.is_backed_up_gdrive
                    ? `Backed up to Google Drive: ${photo.gdrive_backup_folder_name || 'Drive'}`
                    : 'Backup to Google Drive'
                }
              >
                <Cloud className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowShareModal(true)}
              className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition"
              title="Share Photo (P)"
            >
              <Share2 className="w-4 h-4" />
            </button>
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
      {/* Share Photo Modal */}
      <SharePhotoModal
        photo={photo}
        apiUrl={apiUrl}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />

      {/* Visual Face Search & Grouping Modal */}
      <SearchPersonModal
        isOpen={isSearchPersonOpen}
        onClose={() => setIsSearchPersonOpen(false)}
        apiUrl={apiUrl}
        faceId={searchModalFaceId}
        customBox={searchModalCustomBox}
        onGrouped={() => {
          if (photo) fetchFaces(photo.id);
          fetchKnownPeople();
        }}
      />

      {/* Video Studio Frame Grabber Modal */}
      {showCaptureModal && capturedFrameData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <Camera className="w-5 h-5" />
                <span>Captured Video Frame</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCaptureModal(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative aspect-video max-h-[50vh] bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
              <img
                src={capturedFrameData.dataUrl}
                alt="Captured Frame"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Timestamp: <strong className="text-white font-mono">{capturedFrameData.timestamp.toFixed(2)}s</strong>
              </span>
              <span>
                Resolution: <strong className="text-white font-mono">{capturedFrameData.width} × {capturedFrameData.height}</strong>
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCaptureModal(false)}
                className="px-4 py-2 hover:bg-slate-800 text-slate-300 rounded-xl font-semibold text-xs transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDownloadCapturedFrame}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold text-xs transition"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Download JPG</span>
              </button>

              <button
                type="button"
                onClick={handleSaveFrameToLibrary}
                disabled={isSavingFrame}
                className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
              >
                {isSavingFrame ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                <span>Save to Library</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
