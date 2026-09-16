'use client';

import React from 'react';
import { Heart, Trash2, Check } from 'lucide-react';

export interface MediaItem {
  id: number;
  filename: string;
  category: string;
  width: number;
  height: number;
  captured_at: string;
  is_favorite: boolean;
  is_blurry: boolean;
  blurriness_score?: number;
  file_size?: number;
  camera_make?: string | null;
  camera_model?: string | null;
  iso?: number | null;
  focal_length?: number | null;
  exposure_time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  expires_at?: string | null;
  thumbnail_url: string;
}

interface PhotoCardProps {
  item: MediaItem;
  apiUrl: string;
  isSelected?: boolean;
  onSelect: (item: MediaItem) => void;
  onToggleSelect?: (id: number, e: React.MouseEvent) => void;
  onToggleFavorite: (id: number, e: React.MouseEvent) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({
  item,
  apiUrl,
  isSelected = false,
  onSelect,
  onToggleSelect,
  onToggleFavorite,
  onDelete,
}) => {
  return (
    <div
      onClick={() => onSelect(item)}
      className={`group relative aspect-square bg-slate-200 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition ${
        isSelected ? 'ring-4 ring-indigo-500 ring-offset-2 scale-[0.98]' : ''
      }`}
    >
      <img
        src={`${apiUrl}${item.thumbnail_url}`}
        alt={item.filename}
        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
          isSelected ? 'brightness-95' : ''
        }`}
        loading="lazy"
      />

      {/* Select Checkbox Button (Top Left) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onToggleSelect) onToggleSelect(item.id, e);
        }}
        className={`absolute top-2 left-2 z-20 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md ${
          isSelected
            ? 'bg-indigo-600 text-white scale-100 opacity-100'
            : 'bg-black/40 text-transparent hover:bg-black/70 hover:text-white/80 opacity-0 group-hover:opacity-100 border border-white/60'
        }`}
        title={isSelected ? 'Deselect photo' : 'Select photo'}
      >
        <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'text-white' : ''}`} />
      </button>

      {/* Category & Status Pills */}
      <div className={`absolute top-2 left-9 flex gap-1 transition-opacity ${isSelected ? 'opacity-90' : ''}`}>
        {item.category === 'screenshot' && (
          <span className="bg-blue-600/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
            Screenshot
          </span>
        )}
        {item.category === 'document_bill' && (
          <span className="bg-emerald-600/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
            Bill / Doc
          </span>
        )}
        {item.is_blurry && (
          <span className="bg-amber-600/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
            Blurry
          </span>
        )}
      </div>

      {/* Hover Overlay Controls */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 pointer-events-none">
        <div className="flex justify-end pointer-events-auto">
          <button
            onClick={(e) => onToggleFavorite(item.id, e)}
            className="p-1.5 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-sm transition"
            title={item.is_favorite ? 'Favorited' : 'Favorite'}
          >
            <Heart
              className={`w-3.5 h-3.5 ${item.is_favorite ? 'fill-red-500 text-red-500' : ''}`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between text-white text-[10px] pointer-events-auto">
          <span className="truncate max-w-[90px]">{item.filename}</span>
          <button
            onClick={(e) => onDelete(item.id, e)}
            className="p-1 hover:text-red-400 transition"
            title="Delete photo"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
