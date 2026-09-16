'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  Maximize, 
  Minimize, 
  Clock, 
  MapPin, 
  Calendar 
} from 'lucide-react';
import { MediaItem } from './PhotoCard';

interface AmbientSlideshowModalProps {
  photos: MediaItem[];
  startIndex?: number;
  apiUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AmbientSlideshowModal: React.FC<AmbientSlideshowModalProps> = ({
  photos,
  startIndex = 0,
  apiUrl,
  isOpen,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(5000); // 5 seconds default
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [animDirection, setAnimDirection] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  // Sync starting photo when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.max(0, Math.min(startIndex, photos.length - 1)));
      setIsPlaying(true);
      resetControlsTimer();
    }
  }, [isOpen, startIndex, photos.length]);

  // Autoplay progression timer
  useEffect(() => {
    if (!isOpen || !isPlaying || photos.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % photos.length;
        setAnimDirection((d) => (d + 1) % 4);
        return next;
      });
    }, speed);

    return () => clearInterval(interval);
  }, [isOpen, isPlaying, speed, photos.length]);

  // Auto-hide controls on mouse idle
  const resetControlsTimer = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      setShowControls(false);
    }, 2800);
  };

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  // Keyboard navigation & controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      resetControlsTimer();
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
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
  }, [isOpen, photos.length]);

  if (!isOpen || photos.length === 0) return null;

  const currentPhoto = photos[currentIndex];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
    setAnimDirection((d) => (d + 1) % 4);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    setAnimDirection((d) => (d + 1) % 4);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch((err) => console.error(err));
      setIsFullscreen(false);
    }
  };

  // 4 alternating Ken Burns movement animations
  const animStyles = [
    'scale-110 translate-x-3 translate-y-2',
    'scale-105 -translate-x-2 -translate-y-3',
    'scale-112 -translate-x-3 translate-y-1',
    'scale-108 translate-x-2 -translate-y-2',
  ];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden select-none"
    >
      {/* Cinematic Ken Burns Photo Display */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <img
          key={currentPhoto.id}
          src={`${apiUrl}/api/v1/media/${currentPhoto.id}/thumbnail?size=1080`}
          alt={currentPhoto.filename}
          className={`max-w-full max-h-full object-contain transition-all duration-[7000ms] ease-out ${animStyles[animDirection]}`}
        />

        {/* Subtle Vignette Shading */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/70 via-transparent to-black/40" />
      </div>

      {/* Top Controls Bar (Fades out when inactive) */}
      <div
        className={`absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-30 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 text-white/80 font-medium text-xs bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>Ambient Slideshow</span>
          <span className="text-white/40">•</span>
          <span>{currentIndex + 1} of {photos.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="p-2.5 bg-black/40 hover:bg-black/80 text-white rounded-full backdrop-blur-md border border-white/10 transition shadow-lg"
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-2.5 bg-black/40 hover:bg-black/80 text-white rounded-full backdrop-blur-md border border-white/10 transition shadow-lg"
            title="Exit Slideshow (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Metadata HUD (Date & Location) */}
      <div
        className={`absolute bottom-6 left-6 z-30 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-60'
        }`}
      >
        <div className="space-y-1 text-white drop-shadow-md">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span>
              {new Date(currentPhoto.captured_at).toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>

          {(currentPhoto.location_name || currentPhoto.camera_model) && (
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>{currentPhoto.location_name || currentPhoto.camera_model}</span>
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Center Playback Controls */}
      <div
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-30 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-slate-900/85 backdrop-blur-md border border-white/15 px-4 py-2 rounded-full flex items-center gap-3 text-white shadow-2xl">
          {/* Previous Button */}
          <button
            onClick={handlePrev}
            className="p-1.5 hover:bg-white/15 rounded-full transition"
            title="Previous (Left Arrow)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-full transition text-white shadow-lg"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
          </button>

          {/* Next Button */}
          <button
            onClick={handleNext}
            className="p-1.5 hover:bg-white/15 rounded-full transition"
            title="Next (Right Arrow)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="h-4 w-px bg-white/20" />

          {/* Speed Selector */}
          <div className="flex items-center gap-1 text-xs">
            {[
              { label: '3s', ms: 3000 },
              { label: '5s', ms: 5000 },
              { label: '8s', ms: 8000 },
              { label: '12s', ms: 12000 },
            ].map((s) => (
              <button
                key={s.ms}
                onClick={() => setSpeed(s.ms)}
                className={`px-2 py-0.5 rounded-full font-mono text-[11px] transition ${
                  speed === s.ms 
                    ? 'bg-white/25 text-white font-bold' 
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
