'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Compass, ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from './PhotoCard';

export interface EventStory {
  title: string;
  date: string;
  photo_count: number;
  cover_id: number;
  cover_thumbnail_url: string;
  media_ids: number[];
  items?: MediaItem[];
}

interface MomentsCarouselProps {
  events: EventStory[];
  apiUrl: string;
  onSelectEvent?: (event: EventStory) => void;
}

export const MomentsCarousel: React.FC<MomentsCarouselProps> = ({
  events,
  apiUrl,
  onSelectEvent,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Mouse Drag-to-Scroll State
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const hasDraggedDistance = useRef(0);

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
  }, [events]);

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
  }, [events]);

  const handleScroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = Math.max(260, Math.floor(container.clientWidth * 0.7));
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
    setTimeout(checkScrollLimits, 350);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleScroll('left');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleScroll('right');
    }
  };

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

  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Moments & Outings</span>
        </div>

        {/* Navigation arrows in header */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleScroll('left')}
            disabled={!canScrollLeft}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 disabled:pointer-events-none transition cursor-pointer"
            title="Scroll left"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleScroll('right')}
            disabled={!canScrollRight}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 disabled:pointer-events-none transition cursor-pointer"
            title="Scroll right"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative group/moments">
        {/* Floating Left Arrow */}
        {canScrollLeft && (
          <button
            onClick={() => handleScroll('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-white shadow-xl backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer"
            title="Scroll left"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Floating Right Arrow */}
        {canScrollRight && (
          <button
            onClick={() => handleScroll('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-white shadow-xl backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer"
            title="Scroll right"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Carousel */}
        <div
          ref={scrollContainerRef}
          tabIndex={0}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onKeyDown={handleKeyDown}
          className={`flex gap-4 overflow-x-auto pb-2 scrollbar-none select-none focus:outline-none rounded-2xl ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {events.map((ev, idx) => (
            <div
              key={idx}
              onClick={() => {
                if (hasDraggedDistance.current > 5) return;
                onSelectEvent && onSelectEvent(ev);
              }}
              className="relative flex-shrink-0 w-44 h-60 rounded-2xl overflow-hidden cursor-pointer group shadow-sm hover:shadow-xl hover:ring-2 hover:ring-indigo-500 transition-all duration-300 transform hover:-translate-y-1"
            >
              <img
                src={`${apiUrl}${ev.cover_thumbnail_url}`}
                alt={ev.title}
                draggable={false}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none select-none"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-3 flex flex-col justify-between text-white">
                <div className="flex items-center justify-between">
                  <span className="bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-200">
                    {ev.photo_count} photos
                  </span>
                  <span className="opacity-0 group-hover:opacity-100 bg-indigo-600/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-full transition-opacity shadow">
                    View
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-xs leading-snug group-hover:text-indigo-200 transition-colors">{ev.title}</h3>
                  <p className="text-[10px] text-slate-300 mt-0.5">{ev.date}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
