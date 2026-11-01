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
  Settings2,
  Sparkles
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';

export default function KioskPage() {
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

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Fetch photos based on filter
  useEffect(() => {
    setLoading(true);
    let url = `${API_URL}/api/v1/media?limit=150`;
    if (filterMode === 'favorites') url += '&is_favorite=true';
    if (filterMode === 'places') url += '&geotagged_only=true';

    fetch(url)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        const items = data.items || [];
        setPhotos(items);
        setCurrentIndex(0);
      })
      .catch((err) => console.error('Kiosk fetch error:', err))
      .finally(() => setLoading(false));
  }, [API_URL, filterMode]);

  // Slideshow timer
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
    }, 3500);
  }, []);

  const handleNext = useCallback(() => {
    if (photos.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
      setAnimVariant((v) => (v + 1) % 4);
      resetHudTimer();
    }
  }, [photos.length, resetHudTimer]);

  const handlePrev = useCallback(() => {
    if (photos.length > 0) {
      setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
      setAnimVariant((v) => (v + 1) % 4);
      resetHudTimer();
    }
  }, [photos.length, resetHudTimer]);

  const toggleFullscreen = () => {
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
  const tokenQuery = token ? `?token=${token}` : '';

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
      onClick={resetHudTimer}
      className="relative h-screen w-screen bg-black overflow-hidden select-none cursor-default"
    >
      {/* Background Ambient Blur Backdrop */}
      {activePhoto && (
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-35 scale-125 transform transition-all duration-1000"
          style={{
            backgroundImage: `url(${API_URL}/api/v1/media/${activePhoto.id}/thumbnail?size=256${token ? `&token=${token}` : ''})`,
          }}
        />
      )}

      {/* Main Photo with Ken Burns Motion Effect */}
      {loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 space-y-3">
          <Sparkles className="w-8 h-8 animate-pulse text-indigo-400" />
          <p className="text-sm tracking-wide">Starting Ambient Kiosk...</p>
        </div>
      ) : activePhoto ? (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <img
            key={activePhoto.id}
            src={`${API_URL}/api/v1/media/${activePhoto.id}/view${tokenQuery}`}
            alt={activePhoto.filename}
            className={`max-w-full max-h-full object-contain transition-transform duration-[8000ms] ease-out shadow-2xl ${getKenBurnsStyle()}`}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 space-y-3">
          <p className="text-sm">No photos found for this filter.</p>
          <button
            onClick={() => setFilterMode('all')}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs text-white"
          >
            Switch to All Photos
          </button>
        </div>
      )}

      {/* Top Left: Clock & Date Widget (Always Subtle & Elegant) */}
      <div className="absolute top-6 left-6 z-20 pointer-events-none drop-shadow-lg">
        <div className="flex flex-col">
          <span className="text-4xl sm:text-5xl font-black text-white/90 tracking-tight font-mono">
            {currentTime}
          </span>
          <span className="text-sm font-semibold text-white/60 tracking-wider uppercase mt-0.5">
            {currentDate}
          </span>
        </div>
      </div>

      {/* Bottom Left: Photo Location & Captured Date Overlay */}
      {activePhoto && (
        <div className="absolute bottom-6 left-6 z-20 pointer-events-none max-w-lg drop-shadow-md transition-opacity duration-300">
          <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-2xl text-white space-y-0.5">
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

      {/* Floating HUD Controls (Auto-hiding on mouse idle) */}
      <div
        className={`absolute inset-x-0 bottom-6 z-30 flex items-center justify-center transition-all duration-300 pointer-events-none ${
          showHud ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-xl border border-white/15 px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-4 text-white">
          {/* Back to App */}
          <Link
            href="/"
            className="p-2 hover:bg-white/10 rounded-full transition text-slate-300 hover:text-white"
            title="Exit Kiosk Mode"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="h-4 w-px bg-white/20" />

          {/* Prev */}
          <button
            onClick={handlePrev}
            className="p-2 hover:bg-white/10 rounded-full transition text-slate-200 hover:text-white"
            title="Previous Photo (Left Arrow)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg transition"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
          </button>

          {/* Next */}
          <button
            onClick={handleNext}
            className="p-2 hover:bg-white/10 rounded-full transition text-slate-200 hover:text-white"
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
                onClick={() => setIntervalSec(s.sec)}
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
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                filterMode === 'all'
                  ? 'bg-indigo-500 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('favorites')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                filterMode === 'favorites'
                  ? 'bg-rose-500 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              Favorites
            </button>
            <button
              onClick={() => setFilterMode('places')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                filterMode === 'places'
                  ? 'bg-emerald-500 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              Places
            </button>
          </div>

          <div className="h-4 w-px bg-white/20" />

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-white/10 rounded-full transition text-slate-300 hover:text-white"
            title="Toggle Fullscreen (F)"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
