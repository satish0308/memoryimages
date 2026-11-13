'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  Maximize, 
  Minimize, 
  Clock, 
  MapPin, 
  Calendar, 
  Heart, 
  ArrowLeft,
  Sparkles,
  Loader2,
  Users,
  X
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { useAuth } from '@/context/AuthContext';
import { getApiUrl } from '@/utils/apiUrl';

export default function KioskPage() {
  const { token: authContextToken } = useAuth();
  const [photos, setPhotos] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [intervalSec, setIntervalSec] = useState<number>(8); // 8s per slide
  const [showHud, setShowHud] = useState(true);
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'places'>('all');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [animVariant, setAnimVariant] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Person Face Timeline Filter State
  const [personId, setPersonId] = useState<number | null>(null);
  const [personName, setPersonName] = useState<string>('');
  const [peopleList, setPeopleList] = useState<{ id: number; name: string; avatar_url?: string | null; photo_count?: number }[]>([]);

  const API_URL = getApiUrl();
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to resolve token from context, URL parameter, or localStorage
  const getActiveToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const urlParam = new URLSearchParams(window.location.search).get('token');
    if (urlParam) {
      localStorage.setItem('memorypics_token', urlParam);
      return urlParam;
    }
    return authContextToken || localStorage.getItem('memorypics_token');
  }, [authContextToken]);

  // Parse URL search params for direct person kiosk deep-link
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get('person_id');
      const pname = params.get('person_name');
      if (pid) {
        const parsed = parseInt(pid, 10);
        if (!isNaN(parsed)) {
          setPersonId(parsed);
          if (pname) setPersonName(pname);
        }
      }
    }
  }, []);

  // Load named people for Kiosk switcher
  useEffect(() => {
    const activeToken = getActiveToken();
    const headers: HeadersInit = {};
    if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
    fetch(`${API_URL}/api/v1/people?filter_type=people`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const named = data
          .filter((p: any) => p.name && !p.name.startsWith('Unnamed'))
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            avatar_url: p.avatar_url,
            photo_count: p.photo_count || p.faces_count || 0,
          }));
        setPeopleList(named);
        if (personId && !personName) {
          const found = named.find((p: any) => p.id === personId);
          if (found) setPersonName(found.name);
        }
      })
      .catch((err) => console.error('Failed to load kiosk people:', err));
  }, [API_URL, getActiveToken, personId, personName]);

  const handleSelectPerson = (newPersonId: number | null, newPersonName?: string) => {
    setPersonId(newPersonId);
    setPersonName(newPersonName || '');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (newPersonId) {
        url.searchParams.set('person_id', String(newPersonId));
        if (newPersonName) url.searchParams.set('person_name', newPersonName);
      } else {
        url.searchParams.delete('person_id');
        url.searchParams.delete('person_name');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Live Clock updater
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      setCurrentDate(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch photos based on filter & token & person_id
  useEffect(() => {
    const activeToken = getActiveToken();
    setLoading(true);

    let url = `${API_URL}/api/v1/media?limit=300`;
    if (personId) url += `&person_id=${personId}`;
    if (filterMode === 'favorites') url += '&is_favorite=true';
    if (filterMode === 'places') url += '&geotagged_only=true';
    if (activeToken) url += `&token=${activeToken}`;

    const headers: HeadersInit = {};
    if (activeToken) {
      headers['Authorization'] = `Bearer ${activeToken}`;
    }

    fetch(url, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const items = data.items || [];
        setPhotos(items);
        setCurrentIndex(0);
      })
      .catch((err) => {
        console.error('Kiosk fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, [API_URL, filterMode, getActiveToken, personId]);

  // Slideshow progression timer
  useEffect(() => {
    if (!isPlaying || photos.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
      setAnimVariant((v) => (v + 1) % 4);
    }, intervalSec * 1000);

    return () => clearInterval(timer);
  }, [isPlaying, intervalSec, photos.length]);

  // Auto-hide HUD on idle
  const resetHudTimer = useCallback(() => {
    setShowHud(true);
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = setTimeout(() => {
      setShowHud(false);
    }, 4000);
  }, []);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (photos.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
      setAnimVariant((v) => (v + 1) % 4);
      resetHudTimer();
    }
  }, [photos.length, resetHudTimer]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (photos.length > 0) {
      setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
      setAnimVariant((v) => (v + 1) % 4);
      resetHudTimer();
    }
  }, [photos.length, resetHudTimer]);

  const toggleFullscreen = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetHudTimer();
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, resetHudTimer]);

  const activePhoto = photos[currentIndex];
  const activeToken = getActiveToken();
  const tokenQuery = activeToken ? `&token=${activeToken}` : '';

  // Ken Burns zoom/pan style variations
  const getKenBurnsStyle = () => {
    switch (animVariant) {
      case 0:
        return 'scale-110 translate-x-2 translate-y-1';
      case 1:
        return 'scale-105 -translate-x-2 -translate-y-2';
      case 2:
        return 'scale-115 translate-x-3 -translate-y-1';
      case 3:
      default:
        return 'scale-108 -translate-x-1 translate-y-2';
    }
  };

  return (
    <div
      onMouseMove={resetHudTimer}
      onClick={() => setShowHud((prev) => !prev)}
      className="relative h-screen w-screen bg-black overflow-hidden select-none cursor-pointer"
    >
      {/* Background Ambient Blur Backdrop */}
      {activePhoto && (
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-40 scale-125 transform transition-all duration-1000"
          style={{
            backgroundImage: `url(${API_URL}/api/v1/media/${activePhoto.id}/thumbnail?size=256${tokenQuery})`,
          }}
        />
      )}

      {/* Main Photo with Ken Burns Motion Effect */}
      {loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 space-y-3 z-10">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium tracking-wide">Loading your memories...</p>
        </div>
      ) : activePhoto ? (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <img
            key={activePhoto.id}
            src={`${API_URL}/api/v1/media/${activePhoto.id}/thumbnail?size=1080${tokenQuery}`}
            alt={activePhoto.filename}
            className={`max-w-full max-h-full object-contain transition-transform duration-[8000ms] ease-out shadow-2xl ${getKenBurnsStyle()}`}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 space-y-4 z-10 p-6 text-center">
          <Sparkles className="w-10 h-10 text-indigo-400" />
          <h3 className="text-base font-bold text-white">No Photos Found</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            {personId
              ? `No photos found for ${personName || 'this person'} with current filters.`
              : filterMode === 'favorites'
              ? 'You have not favorited any photos yet. Tap the Heart icon on photos in your timeline to add them here.'
              : filterMode === 'places'
              ? 'No geotagged photos with GPS coordinates found.'
              : 'Your photo library is currently empty.'}
          </p>
          {(filterMode !== 'all' || personId) && (
            <div className="flex items-center gap-2">
              {personId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectPerson(null);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white shadow-md transition"
                >
                  Show Everyone
                </button>
              )}
              {filterMode !== 'all' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilterMode('all');
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold text-white shadow-md transition"
                >
                  Switch to All Photos
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Top Center: Active Person Ambient Badge */}
      {personId && (
        <div className="absolute top-6 inset-x-0 flex justify-center z-20 pointer-events-none">
          <div className="bg-indigo-950/80 backdrop-blur-md border border-indigo-400/30 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2.5">
            <img
              src={`${API_URL}/api/v1/people/${personId}/avatar${tokenQuery ? `?token=${activeToken}` : ''}`}
              alt={personName}
              className="w-5 h-5 rounded-full object-cover border border-white/60"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span>Memories of <strong>{personName || 'Person'}</strong></span>
            {photos.length > 0 && (
              <span className="text-[10px] bg-indigo-500/40 text-indigo-100 font-mono px-2 py-0.5 rounded-full">
                {currentIndex + 1} / {photos.length}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Top Center: Pause Indicator Badge */}
      {!isPlaying && (
        <div className={`absolute ${personId ? 'top-16' : 'top-6'} inset-x-0 flex justify-center z-20 pointer-events-none`}>
          <div className="bg-slate-900/80 backdrop-blur-md border border-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-fadeIn">
            <Pause className="w-3.5 h-3.5 text-amber-400" />
            <span>Slideshow Paused</span>
          </div>
        </div>
      )}

      {/* Top Left: Clock & Date Widget (Always Subtle & Elegant) */}
      <div className="absolute top-6 left-6 z-20 pointer-events-none drop-shadow-lg">
        <div className="flex flex-col">
          <span className="text-4xl sm:text-5xl font-black text-white/95 tracking-tight font-mono">
            {currentTime}
          </span>
          <span className="text-xs sm:text-sm font-semibold text-white/70 tracking-wider uppercase mt-0.5">
            {currentDate}
          </span>
        </div>
      </div>

      {/* Top Right: Counter Badge */}
      {photos.length > 0 && (
        <div className="absolute top-6 right-6 z-20 pointer-events-none drop-shadow-md">
          <span className="bg-black/40 backdrop-blur-md border border-white/10 text-white/80 font-mono text-xs px-3 py-1.5 rounded-full">
            {currentIndex + 1} / {photos.length}
          </span>
        </div>
      )}

      {/* Bottom Left: Photo Location & Captured Date Overlay */}
      {activePhoto && (
        <div className="absolute bottom-6 left-6 z-20 pointer-events-none max-w-lg drop-shadow-md transition-opacity duration-300">
          <div className="bg-black/50 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-2xl text-white space-y-0.5">
            <div className="text-sm font-bold flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0" />
              <span>
                {activePhoto.captured_at
                  ? new Date(activePhoto.captured_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'Undated'}
              </span>
              {activePhoto.is_favorite && <Heart className="w-3 h-3 text-rose-400 fill-rose-400" />}
            </div>
            {activePhoto.location_name && (
              <div className="text-xs text-slate-300 flex items-center gap-1.5 truncate">
                <MapPin className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                <span className="truncate">{activePhoto.location_name}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating HUD Controls (Auto-hiding on mouse idle, clickable) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 bottom-6 z-30 flex items-center justify-center transition-all duration-300 pointer-events-none ${
          showHud ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl border border-white/20 px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3 sm:gap-4 text-white">
          {/* Back to App */}
          <Link
            href={personId ? `/people?person_id=${personId}` : '/'}
            className="p-2 hover:bg-white/15 rounded-full transition text-slate-300 hover:text-white"
            title={personId ? `Return to ${personName}'s Timeline` : 'Exit Kiosk Mode'}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <Link
            href="/tv"
            className="px-2.5 py-1 rounded-full bg-blue-600/30 border border-blue-500/40 text-[11px] font-semibold text-blue-300 hover:text-white hover:bg-blue-600 transition"
            title="Switch to Smart TV Lounge & Phone Remote Mode"
          >
            TV Lounge
          </Link>

          <div className="h-4 w-px bg-white/20" />

          {/* Prev */}
          <button
            onClick={handlePrev}
            className="p-2 hover:bg-white/15 rounded-full transition text-slate-200 hover:text-white active:scale-95"
            title="Previous Photo (Left Arrow)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPlaying(!isPlaying);
            }}
            className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg transition active:scale-95"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
          </button>

          {/* Next */}
          <button
            onClick={handleNext}
            className="p-2 hover:bg-white/15 rounded-full transition text-slate-200 hover:text-white active:scale-95"
            title="Next Photo (Right Arrow)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="h-4 w-px bg-white/20" />

          {/* Speed Selector */}
          <div className="flex items-center gap-1 text-xs">
            {[
              { sec: 5, label: '5s' },
              { sec: 8, label: '8s' },
              { sec: 15, label: '15s' },
              { sec: 30, label: '30s' },
            ].map((s) => (
              <button
                key={s.sec}
                onClick={(e) => {
                  e.stopPropagation();
                  setIntervalSec(s.sec);
                }}
                className={`px-2 py-1 rounded-lg font-mono text-[11px] font-semibold transition ${
                  intervalSec === s.sec
                    ? 'bg-white text-slate-900 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-white/20" />

          {/* Filter Mode Selector */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFilterMode('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                filterMode === 'all'
                  ? 'bg-indigo-500 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              All
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFilterMode('favorites');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                filterMode === 'favorites'
                  ? 'bg-rose-500 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              Favorites
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFilterMode('places');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                filterMode === 'places'
                  ? 'bg-emerald-500 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              Places
            </button>
          </div>

          {/* People Quick Switcher */}
          {peopleList.length > 0 && (
            <>
              <div className="h-4 w-px bg-white/20" />
              <div className="flex items-center gap-1.5 text-xs">
                <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <select
                  value={personId ? String(personId) : 'all'}
                  onChange={(e) => {
                    e.stopPropagation();
                    const val = e.target.value;
                    if (val === 'all') {
                      handleSelectPerson(null);
                    } else {
                      const pid = parseInt(val, 10);
                      const found = peopleList.find((p) => p.id === pid);
                      handleSelectPerson(pid, found?.name);
                    }
                  }}
                  className="bg-black/60 border border-white/20 rounded-lg px-2 py-1 text-[11px] text-white font-medium focus:outline-none focus:border-indigo-400 cursor-pointer max-w-[120px] truncate"
                >
                  <option value="all" className="bg-slate-900 text-white">Everyone</option>
                  {peopleList.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="h-4 w-px bg-white/20" />

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-white/15 rounded-full transition text-slate-300 hover:text-white active:scale-95"
            title="Toggle Fullscreen (F)"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
