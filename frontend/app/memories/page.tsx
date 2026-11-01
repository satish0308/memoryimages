'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Calendar, 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  MapPin, 
  Camera, 
  Heart, 
  Share2,
  Maximize2
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { useAuth } from '@/context/AuthContext';

interface MemoryReel {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  cover_url: string;
  item_count: number;
  items: MediaItem[];
}

export default function MemoriesPage() {
  const { token: authContextToken } = useAuth();
  const [reels, setReels] = useState<MemoryReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState<MemoryReel | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const activeToken = authContextToken || (typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null);
    const headers: Record<string, string> = {};
    if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
    const tokenParam = activeToken ? `?token=${encodeURIComponent(activeToken)}` : '';

    fetch(`${API_URL}/api/v1/media/memories/highlights${tokenParam}`, { headers })
      .then((res) => (res.ok ? res.json() : { reels: [] }))
      .then((data) => setReels(data.reels || []))
      .catch((err) => console.error('Failed to load memories:', err))
      .finally(() => setLoading(false));
  }, [API_URL, authContextToken]);

  // Story Autoplay Progression
  useEffect(() => {
    if (!activeStory || !isPlaying) return;

    progressTimerRef.current = setTimeout(() => {
      if (storyIndex < activeStory.items.length - 1) {
        setStoryIndex((prev) => prev + 1);
      } else {
        // Move to next story reel if available, or close
        const currentReelIdx = reels.findIndex((r) => r.id === activeStory.id);
        if (currentReelIdx >= 0 && currentReelIdx < reels.length - 1) {
          setActiveStory(reels[currentReelIdx + 1]);
          setStoryIndex(0);
        } else {
          setActiveStory(null);
          setStoryIndex(0);
        }
      }
    }, 4500);

    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [activeStory, storyIndex, isPlaying, reels]);

  const handleOpenStory = (reel: MemoryReel) => {
    setActiveStory(reel);
    setStoryIndex(0);
    setIsPlaying(true);
  };

  const handleNextSlide = () => {
    if (!activeStory) return;
    if (storyIndex < activeStory.items.length - 1) {
      setStoryIndex((prev) => prev + 1);
    } else {
      const currentReelIdx = reels.findIndex((r) => r.id === activeStory.id);
      if (currentReelIdx >= 0 && currentReelIdx < reels.length - 1) {
        setActiveStory(reels[currentReelIdx + 1]);
        setStoryIndex(0);
      } else {
        setActiveStory(null);
      }
    }
  };

  const handlePrevSlide = () => {
    if (storyIndex > 0) {
      setStoryIndex((prev) => prev - 1);
    }
  };

  const currentItem: MediaItem | undefined = activeStory?.items[storyIndex];

  const token = authContextToken || (typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null);
  const tokenQuery = token ? `?token=${token}` : '';

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 p-8 text-white shadow-xl border border-indigo-500/20">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-amber-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Nostalgia AI Engine</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-indigo-200">
            Your Personal Flashbacks & Memories
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Curated historical stories, anniversary highlights, and joyful candid moments captured across past years on this very day.
          </p>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-96 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-400 via-purple-600 to-transparent" />
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="aspect-[9/14] bg-slate-200 dark:bg-slate-800 rounded-3xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && reels.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 bg-purple-50 dark:bg-purple-950/50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 dark:text-slate-200">No Memories Yet</h3>
          <p className="text-xs text-slate-500">
            Keep capturing and syncing your moments. As your library grows across seasons and years, your personalized memory reels will appear here automatically.
          </p>
        </div>
      )}

      {/* Story Reels Grid */}
      {!loading && reels.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {reels.map((reel) => (
            <div
              key={reel.id}
              onClick={() => handleOpenStory(reel)}
              className="group relative aspect-[9/14] rounded-3xl overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] border border-slate-200/50 dark:border-slate-800 bg-slate-900"
            >
              {/* Cover Image */}
              <img
                src={`${API_URL}${reel.cover_url}${token ? `&token=${token}` : ''}`}
                alt={reel.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 brightness-90 group-hover:brightness-95"
                loading="lazy"
              />

              {/* Gradient Overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/20" />

              {/* Top Tag & Item Count */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white z-10">
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/20">
                  {reel.tag}
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-slate-200">
                  {reel.item_count} photos
                </span>
              </div>

              {/* Center Play Button on Hover */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                <div className="w-14 h-14 rounded-full bg-white/30 backdrop-blur-md border border-white/40 flex items-center justify-center text-white shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
                  <Play className="w-7 h-7 fill-white ml-1" />
                </div>
              </div>

              {/* Bottom Details */}
              <div className="absolute bottom-5 left-5 right-5 text-white z-10 space-y-1">
                <h3 className="font-black text-lg leading-snug drop-shadow-md">
                  {reel.title}
                </h3>
                <p className="text-xs text-slate-300 line-clamp-1 drop-shadow-sm">
                  {reel.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full-Screen Instagram / Apple Photos Story Viewer Modal */}
      {activeStory && currentItem && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex items-center justify-center animate-in fade-in duration-200">
          {/* Close Story Button */}
          <button
            onClick={() => setActiveStory(null)}
            className="absolute top-5 right-5 z-50 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition"
            title="Close Story (Esc)"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Story Container (Phone/Reel aspect ratio) */}
          <div className="relative w-full max-w-md h-full max-h-[92vh] rounded-3xl overflow-hidden bg-slate-950 flex flex-col justify-between shadow-2xl border border-white/10">
            {/* Top Multi-Segment Progress Bars */}
            <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-1.5">
              {activeStory.items.map((_, idx) => (
                <div key={idx} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-white transition-all duration-100 ${
                      idx < storyIndex
                        ? 'w-full'
                        : idx === storyIndex
                        ? 'w-full animate-[progress_4.5s_linear]'
                        : 'w-0'
                    }`}
                  />
                </div>
              ))}
            </div>

            {/* Story Header */}
            <div className="absolute top-7 left-4 right-4 z-30 flex items-center justify-between text-white drop-shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/40">
                  <img
                    src={`${API_URL}${activeStory.cover_url}${token ? `&token=${token}` : ''}`}
                    alt={activeStory.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="font-bold text-xs">{activeStory.title}</h4>
                  <p className="text-[10px] text-slate-300">
                    {storyIndex + 1} of {activeStory.items.length}
                  </p>
                </div>
              </div>

              {/* Play / Pause Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlaying(!isPlaying);
                }}
                className="p-1.5 rounded-full bg-black/30 backdrop-blur-md hover:bg-black/50 text-white"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
              </button>
            </div>

            {/* Center Photo Display & Tap Navigators */}
            <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden select-none">
              {/* Tap Left to Prev */}
              <div
                onClick={handlePrevSlide}
                className="absolute left-0 top-0 bottom-0 w-1/3 z-20 cursor-pointer"
              />

              {/* Tap Right to Next */}
              <div
                onClick={handleNextSlide}
                className="absolute right-0 top-0 bottom-0 w-2/3 z-20 cursor-pointer"
              />

              {/* Active Image or Motion Video */}
              {currentItem.has_motion_photo ? (
                <video
                  src={`${API_URL}/api/v1/media/${currentItem.id}/motion-video${tokenQuery}`}
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={`${API_URL}/api/v1/media/${currentItem.id}/view${tokenQuery}`}
                  alt={currentItem.filename}
                  className="w-full h-full object-contain animate-fadeIn"
                />
              )}
            </div>

            {/* Bottom Photo Metadata Card */}
            <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black via-black/80 to-transparent z-30 text-white space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm flex items-center gap-2">
                    <span>{currentItem.captured_at ? new Date(currentItem.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date'}</span>
                    {currentItem.has_motion_photo && (
                      <span className="text-[9px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded font-mono">
                        LIVE
                      </span>
                    )}
                  </div>
                  {currentItem.location_name && (
                    <div className="text-xs text-indigo-300 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate max-w-[260px]">{currentItem.location_name}</span>
                    </div>
                  )}
                </div>

                {/* Inspect in Full Lightbox */}
                <button
                  onClick={() => setSelectedPhoto(currentItem)}
                  className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Inspect</span>
                </button>
              </div>

              {currentItem.camera_make && (
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                  <Camera className="w-3 h-3" />
                  <span>{[currentItem.camera_make, currentItem.camera_model].filter(Boolean).join(' ')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal when User clicks Inspect */}
      <LightboxModal
        photo={selectedPhoto}
        apiUrl={API_URL}
        onClose={() => setSelectedPhoto(null)}
        onToggleFavorite={() => {}}
        onDelete={() => setSelectedPhoto(null)}
      />
    </div>
  );
}
