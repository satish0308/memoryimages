'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Calendar, ChevronLeft, ChevronRight, X, Image as ImageIcon } from 'lucide-react';
import { MediaItem } from '../timeline/PhotoCard';

export interface FlashbackGroup {
  year: number;
  years_ago: number;
  title: string;
  subtitle: string;
  date: string;
  is_near_date: boolean;
  count: number;
  cover_media: MediaItem;
  items: MediaItem[];
}

interface OnThisDaySectionProps {
  apiUrl: string;
  onSelectPhoto: (photo: MediaItem) => void;
}

export const OnThisDaySection: React.FC<OnThisDaySectionProps> = ({
  apiUrl,
  onSelectPhoto,
}) => {
  const [flashbacks, setFlashbacks] = useState<FlashbackGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  // Scroll and Navigation State
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Mouse Drag-to-Scroll State
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const hasDraggedDistance = useRef(0);

  useEffect(() => {
    // Check if dismissed in this session
    const dismissed = sessionStorage.getItem('flashbacks_dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }

    const token = typeof window !== 'undefined' 
      ? (localStorage.getItem('memorypics_token') || localStorage.getItem('token')) 
      : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch(`${apiUrl}/api/v1/media/flashbacks`, {
      headers,
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setFlashbacks(data);
        }
      })
      .catch((e) => console.error('Flashbacks fetch error:', e))
      .finally(() => setLoading(false));
  }, [apiUrl]);

  // Check scroll boundary limits
  const checkScrollLimits = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
  };

  useEffect(() => {
    checkScrollLimits();
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => checkScrollLimits();
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', checkScrollLimits);

    const timer = setTimeout(checkScrollLimits, 200);

    return () => {
      clearTimeout(timer);
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', checkScrollLimits);
    };
  }, [flashbacks]);

  // Mouse wheel horizontal translation
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.shiftKey) return;

      const maxScroll = container.scrollWidth - container.clientWidth;
      if (maxScroll <= 0) return;

      const atStart = container.scrollLeft <= 0;
      const atEnd = container.scrollLeft >= maxScroll - 2;

      // If scrolling vertically and container can scroll horizontally
      if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atStart)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
        checkScrollLimits();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [flashbacks]);

  // Smooth button scroll
  const handleScroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = Math.max(300, Math.floor(container.clientWidth * 0.75));
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
    setTimeout(checkScrollLimits, 350);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleScroll('left');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleScroll('right');
    }
  };

  // Mouse drag-to-scroll handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    setIsDragging(true);
    dragStartX.current = e.pageX - container.offsetLeft;
    dragScrollLeft.current = container.scrollLeft;
    hasDraggedDistance.current = 0;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - dragStartX.current);
    container.scrollLeft = dragScrollLeft.current - walk;
    hasDraggedDistance.current = Math.abs(x - dragStartX.current);
    checkScrollLimits();
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
    setTimeout(() => {
      hasDraggedDistance.current = 0;
    }, 120);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('flashbacks_dismissed', 'true');
  };

  if (loading || isDismissed || flashbacks.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-white p-5 md:p-6 shadow-xl border border-indigo-500/20">
      {/* Background ambient decorative glow */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-lg shadow-amber-500/20 text-slate-950">
            <Sparkles className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-base md:text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                On This Day
              </h3>
              <span className="bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Time Capsule
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">
              Nostalgic moments rediscovery from your memory archive
            </p>
          </div>
        </div>

        {/* Controls: Left/Right arrows + Dismiss */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleScroll('left')}
            disabled={!canScrollLeft}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none rounded-xl transition-all cursor-pointer"
            title="Scroll left (Left Arrow key)"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleScroll('right')}
            disabled={!canScrollRight}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none rounded-xl transition-all cursor-pointer"
            title="Scroll right (Right Arrow key)"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/20 mx-0.5" />
          <button
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            title="Dismiss for this session"
            aria-label="Dismiss for this session"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Carousel Container with Floating Arrows */}
      <div className="relative group/carousel">
        {/* Left Floating Arrow */}
        {canScrollLeft && (
          <button
            onClick={() => handleScroll('left')}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 p-2 md:p-2.5 rounded-full bg-slate-950/85 hover:bg-indigo-600 text-white border border-white/20 shadow-2xl backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer"
            title="Scroll left"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Right Floating Arrow */}
        {canScrollRight && (
          <button
            onClick={() => handleScroll('right')}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 p-2 md:p-2.5 rounded-full bg-slate-950/85 hover:bg-indigo-600 text-white border border-white/20 shadow-2xl backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer"
            title="Scroll right"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Horizontal Carousel */}
        <div
          ref={scrollContainerRef}
          tabIndex={0}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onKeyDown={handleKeyDown}
          className={`relative flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-indigo-600/40 select-none focus:outline-none focus:ring-1 focus:ring-indigo-400/50 rounded-2xl ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {flashbacks.map((fb) => {
            const coverUrl = fb.cover_media?.thumbnail_url
              ? `${apiUrl}${fb.cover_media.thumbnail_url}`
              : null;

            return (
              <div
                key={fb.year}
                className="flex-shrink-0 group relative w-64 md:w-72 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-400/50 rounded-2xl p-3.5 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-indigo-500/10 cursor-pointer flex flex-col justify-between"
                onClick={() => {
                  if (hasDraggedDistance.current > 5) return;
                  if (fb.cover_media) {
                    onSelectPhoto(fb.cover_media);
                  }
                }}
              >
                {/* Year & Badge */}
                <div className="flex items-center justify-between mb-2.5">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
                    <Calendar className="w-3.5 h-3.5" />
                    {fb.title}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-300 bg-black/40 px-2 py-0.5 rounded-full">
                    {fb.count} photo{fb.count !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Cover Photo */}
                <div className="relative w-full h-36 md:h-40 rounded-xl overflow-hidden bg-slate-900 border border-white/10 mb-3 shadow-inner">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={fb.title}
                      draggable={false}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none select-none"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2.5">
                    <p className="text-[11px] text-slate-200 font-medium truncate">
                      {fb.subtitle}
                    </p>
                  </div>
                </div>

                {/* Mini previews strip */}
                {fb.items.length > 1 && (
                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/10 overflow-hidden">
                    {fb.items.slice(0, 5).map((it) => (
                      <div
                        key={it.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasDraggedDistance.current > 5) return;
                          onSelectPhoto(it);
                        }}
                        className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border border-white/20 hover:ring-2 hover:ring-amber-400 transition-all cursor-pointer"
                        title={it.filename}
                      >
                        <img
                          src={`${apiUrl}${it.thumbnail_url}`}
                          alt={it.filename}
                          draggable={false}
                          className="w-full h-full object-cover pointer-events-none select-none"
                          loading="lazy"
                        />
                      </div>
                    ))}
                    {fb.items.length > 5 && (
                      <span className="text-[10px] text-slate-400 font-bold pl-1">
                        +{fb.items.length - 5}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 ml-auto text-slate-400 group-hover:text-amber-300 group-hover:translate-x-0.5 transition-all" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
