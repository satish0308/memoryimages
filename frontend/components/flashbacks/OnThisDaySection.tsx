'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Calendar } from 'lucide-react';
import { MediaItem } from '../timeline/PhotoCard';

interface FlashbackGroup {
  label: string;
  year: string;
  count: number;
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

  useEffect(() => {
    fetch(`${apiUrl}/api/v1/media/flashbacks`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFlashbacks(data))
      .catch((e) => console.error('Flashbacks error:', e))
      .finally(() => setLoading(false));
  }, [apiUrl]);

  if (!loading && flashbacks.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/10 rounded-xl">
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-wide flex items-center gap-1.5">
              On This Day Flashbacks
            </h3>
            <p className="text-[11px] text-slate-300">
              Rediscover photos taken on today's date in past years
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
        {flashbacks.map((fb, idx) => (
          <div key={idx} className="flex-shrink-0 space-y-2">
            <span className="text-xs font-semibold text-purple-200 bg-white/10 px-2.5 py-1 rounded-full flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {fb.label}
            </span>
            <div className="flex gap-2">
              {fb.items.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectPhoto(item)}
                  className="w-24 h-24 rounded-xl overflow-hidden cursor-pointer hover:scale-105 transition-transform border border-white/20 shadow-md"
                >
                  <img
                    src={`${apiUrl}${item.thumbnail_url}`}
                    alt={item.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
