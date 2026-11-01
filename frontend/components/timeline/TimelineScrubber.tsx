'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { TimelineGroup } from './DaySection';

interface TimelineMarker {
  id: string; // group key or target DOM element ID
  label: string; // e.g. "Aug 2024" or "2024"
  year: string;
  month?: string;
  count: number;
  isYearHead: boolean;
}

interface TimelineScrubberProps {
  groups: TimelineGroup[];
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({ groups }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredMarker, setHoveredMarker] = useState<TimelineMarker | null>(null);
  const [bubbleY, setBubbleY] = useState<number>(0);
  const [activeGroupKey, setActiveGroupKey] = useState<string>('');

  const railRef = useRef<HTMLDivElement>(null);

  // Parse and compress groups into distinct markers (Years and Months)
  const markers = useMemo(() => {
    if (!groups || groups.length === 0) return [];

    const result: TimelineMarker[] = [];
    const seenMonths = new Set<string>();
    const seenYears = new Set<string>();

    groups.forEach((g) => {
      const key = g.key || g.date;
      if (!key || key === 'Unknown Date') return;

      const parts = key.split('-');
      const year = parts[0];
      const monthNum = parts[1]; // may be undefined for year scale

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = monthNum ? monthNames[parseInt(monthNum, 10) - 1] : '';
      const monthKey = monthNum ? `${year}-${monthNum}` : year;

      if (!seenMonths.has(monthKey)) {
        seenMonths.add(monthKey);
        const isYearHead = !seenYears.has(year);
        if (isYearHead) seenYears.add(year);

        result.push({
          id: key,
          label: monthName ? `${monthName} ${year}` : year,
          year,
          month: monthName,
          count: g.count,
          isYearHead,
        });
      } else {
        // Accumulate count into the existing marker
        const existing = result.find((m) => (m.month ? `${m.year}-${m.id.split('-')[1]}` === monthKey : m.year === year));
        if (existing) {
          existing.count += g.count;
        }
      }
    });

    return result;
  }, [groups]);

  // Jump smoothly to a timeline section
  const scrollToMarker = useCallback((marker: TimelineMarker) => {
    const el = document.getElementById(`timeline-group-${marker.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveGroupKey(marker.id);
    }
  }, []);

  // Calculate marker from Y coordinate on the rail
  const getMarkerFromY = useCallback(
    (clientY: number): { marker: TimelineMarker; relativeY: number } | null => {
      if (!railRef.current || markers.length === 0) return null;
      const rect = railRef.current.getBoundingClientRect();
      const relativeY = Math.max(0, Math.min(clientY - rect.top, rect.height));
      const percentage = relativeY / rect.height;
      const index = Math.min(Math.floor(percentage * markers.length), markers.length - 1);
      return { marker: markers[index], relativeY };
    },
    [markers]
  );

  // Handle Dragging
  const handleStart = (clientY: number) => {
    setIsDragging(true);
    const data = getMarkerFromY(clientY);
    if (data) {
      setHoveredMarker(data.marker);
      setBubbleY(data.relativeY);
      scrollToMarker(data.marker);
    }
  };

  const handleMove = useCallback(
    (clientY: number) => {
      const data = getMarkerFromY(clientY);
      if (data) {
        setHoveredMarker(data.marker);
        setBubbleY(data.relativeY);
        if (isDragging) {
          scrollToMarker(data.marker);
        }
      }
    },
    [getMarkerFromY, isDragging, scrollToMarker]
  );

  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientY);
    };
    const onWindowMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [isDragging, handleMove]);

  // Track active section on natural page scroll
  useEffect(() => {
    if (markers.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const rawId = entry.target.id.replace('timeline-group-', '');
            setActiveGroupKey(rawId);
          }
        });
      },
      {
        rootMargin: '-10% 0px -75% 0px',
        threshold: 0,
      }
    );

    markers.forEach((m) => {
      const el = document.getElementById(`timeline-group-${m.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [markers]);

  // Don't render rail if library has fewer than 2 distinct sections
  if (markers.length < 2) return null;

  return (
    <aside
      className="fixed right-3 top-36 bottom-20 z-30 select-none flex items-center justify-end pointer-events-none group/scrubber"
      aria-label="Timeline Minimap Scrubber"
    >
      {/* Floating Tooltip Bubble when Hovering or Dragging */}
      {hoveredMarker && (
        <div
          className="absolute right-10 flex items-center gap-2 pointer-events-none transition-all duration-75"
          style={{ top: `${bubbleY}px`, transform: 'translateY(-50%)' }}
        >
          <div className="bg-slate-900/95 backdrop-blur-md text-white text-xs px-3.5 py-2 rounded-2xl shadow-2xl border border-indigo-500/30 flex items-center gap-2.5 whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
            <div className="w-6 h-6 rounded-lg bg-indigo-600/40 border border-indigo-400/40 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-3.5 h-3.5 text-indigo-300" />
            </div>
            <div>
              <div className="font-bold text-white text-[12px] flex items-center gap-1">
                <span>{hoveredMarker.label}</span>
              </div>
              <div className="text-[10px] text-slate-300 font-mono">
                {hoveredMarker.count.toLocaleString()} {hoveredMarker.count === 1 ? 'photo' : 'photos'}
              </div>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-800 -ml-1 flex-shrink-0" />
        </div>
      )}

      {/* Scrubber Rail & Handle */}
      <div
        ref={railRef}
        onMouseDown={(e) => {
          e.preventDefault();
          handleStart(e.clientY);
        }}
        onMouseMove={(e) => {
          if (!isDragging) handleMove(e.clientY);
        }}
        onMouseLeave={() => {
          if (!isDragging) setHoveredMarker(null);
        }}
        onTouchStart={(e) => handleStart(e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientY)}
        onTouchEnd={() => setIsDragging(false)}
        className="pointer-events-auto h-full w-7 bg-white/70 hover:bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-full shadow-lg shadow-slate-300/40 flex flex-col justify-between items-center py-2.5 px-1 cursor-ns-resize transition-all hover:w-10 hover:shadow-xl group"
      >
        {markers.map((marker, idx) => {
          const isActive = activeGroupKey && marker.id.startsWith(activeGroupKey.slice(0, 7));

          return (
            <div
              key={marker.id + idx}
              onClick={(e) => {
                e.stopPropagation();
                scrollToMarker(marker);
              }}
              className="relative w-full flex items-center justify-center py-0.5 group/marker cursor-pointer"
              title={`${marker.label} (${marker.count} photos)`}
            >
              {marker.isYearHead ? (
                <div className="flex items-center justify-center">
                  <span
                    className={`text-[9px] font-mono font-bold tracking-tighter leading-none transition-colors ${
                      isActive
                        ? 'text-indigo-600 scale-110 font-black'
                        : 'text-slate-700 group-hover/scrubber:text-slate-900'
                    }`}
                  >
                    {marker.year.slice(2)}
                  </span>
                </div>
              ) : (
                <div
                  className={`rounded-full transition-all ${
                    isActive
                      ? 'w-2 h-2 bg-indigo-600 ring-2 ring-indigo-300'
                      : 'w-1 h-1 bg-slate-300 group-hover/marker:bg-indigo-400 group-hover/marker:scale-150'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
