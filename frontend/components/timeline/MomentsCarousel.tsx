'use client';

import React from 'react';
import { Compass } from 'lucide-react';

export interface EventStory {
  title: string;
  date: string;
  photo_count: number;
  cover_id: number;
  cover_thumbnail_url: string;
  media_ids: number[];
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
  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
        <Compass className="w-4 h-4 text-indigo-600" />
        Moments & Outings
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
        {events.map((ev, idx) => (
          <div
            key={idx}
            onClick={() => onSelectEvent && onSelectEvent(ev)}
            className="relative flex-shrink-0 w-44 h-60 rounded-2xl overflow-hidden cursor-pointer group shadow-sm hover:shadow-md transition"
          >
            <img
              src={`${apiUrl}${ev.cover_thumbnail_url}`}
              alt={ev.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 flex flex-col justify-between text-white">
              <span className="self-end bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-medium">
                {ev.photo_count} photos
              </span>
              <div>
                <h3 className="font-bold text-xs leading-snug">{ev.title}</h3>
                <p className="text-[10px] text-slate-300 mt-0.5">{ev.date}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
