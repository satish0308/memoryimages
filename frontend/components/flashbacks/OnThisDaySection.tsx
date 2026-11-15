'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Calendar, ChevronRight, X, Image as ImageIcon } from 'lucide-react';
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

        <button
          onClick={handleDismiss}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          title="Dismiss for this session"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Carousel */}
      <div className="relative flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-indigo-600/40">
        {flashbacks.map((fb) => {
          const coverUrl = fb.cover_media?.thumbnail_url
            ? `${apiUrl}${fb.cover_media.thumbnail_url}`
            : null;

          return (
            <div
              key={fb.year}
              className="flex-shrink-0 group relative w-64 md:w-72 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-400/50 rounded-2xl p-3.5 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-indigo-500/10 cursor-pointer flex flex-col justify-between"
              onClick={() => {
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
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
                        onSelectPhoto(it);
                      }}
                      className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border border-white/20 hover:ring-2 hover:ring-amber-400 transition-all cursor-pointer"
                      title={it.filename}
                    >
                      <img
                        src={`${apiUrl}${it.thumbnail_url}`}
                        alt={it.filename}
                        className="w-full h-full object-cover"
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
  );
};