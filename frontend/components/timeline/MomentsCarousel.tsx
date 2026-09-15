'use client';

import React from 'react';
import { Compass } from 'lucide-react';

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
            className="relative flex-shrink-0 w-44 h-60 rounded-2xl overflow-hidden cursor-pointer group shadow-sm hover:shadow-xl hover:ring-2 hover:ring-indigo-500 transition-all duration-300 transform hover:-translate-y-1"
          >
            <img
              src={`${apiUrl}${ev.cover_thumbnail_url}`}
              alt={ev.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
  );
};
