'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Heart, Trash2, Check, Play, Layers, Award, Sparkles, Crown, AlertTriangle, Cloud, Users } from 'lucide-react';
import { getCachedThumbnailUrl, prefetchAndCacheThumbnail } from '@/utils/thumbnailCache';

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
  has_faces?: boolean;
  face_count?: number;
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
  // AI Emotion, Mood & Video properties
  mood?: string | null;
  mood_score?: number;
  is_smiling?: boolean;
  dominant_color?: string | null;
  color_hex?: string | null;
  is_video?: boolean;
  duration_seconds?: number | null;
  matched_timestamp?: number | null;
  matched_timestamp_label?: string | null;
  similarity?: number;
  match_percent?: number;
  // Smart Duplicates & Burst Shot properties
  burst_count?: number;
  burst_id?: string | null;
  burst_media_ids?: number[];
  is_burst_lead?: boolean;
  burst_score?: number | null;
  burst_type?: 'burst' | 'duplicate' | null;
  // AI Aesthetics & Best Shot properties
  aesthetic_score?: number | null;
  is_best_shot?: boolean;
  // Subject-Aware Bokeh & Quality Engine
  blur_type?: string | null;
  is_bokeh?: boolean;
  is_enhanced?: boolean;
  enhancement_data?: string | null;
  // Storage source tracking
  source_type?: string;
  source_id?: string | null;
  // Motion Photos / Live Photos
  has_motion_photo?: boolean;
  motion_video_url?: string | null;
  // Google Drive Outbound Backup
  is_backed_up_gdrive?: boolean;
  gdrive_backup_file_id?: string | null;
  gdrive_backup_folder_name?: string | null;
  gdrive_backed_up_at?: string | null;
}

interface PhotoCardProps {
  item: MediaItem;
  apiUrl: string;
  isSelected?: boolean;
  onSelect: (item: MediaItem) => void;
  onToggleSelect?: (id: number, e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent, id: number) => void;
  onToggleFavorite: (id: number, e: React.MouseEvent) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
  onOpenBurst?: (item: MediaItem, e: React.MouseEvent) => void;
  onBackupToDrive?: (item: MediaItem, e: React.MouseEvent) => void;
}

// In-memory cache for auth token to eliminate thousands of blocking localStorage calls
let _cachedToken: string | null = null;
function getAuthToken(): string {
  if (_cachedToken === null && typeof window !== 'undefined') {
    _cachedToken = localStorage.getItem('memorypics_token') || '';
  }
  return _cachedToken || '';
}

const PhotoCardComponent: React.FC<PhotoCardProps> = ({
  item,
  apiUrl,
  isSelected = false,
  onSelect,
  onToggleSelect,
  onPointerDown,
  onToggleFavorite,
  onDelete,
  onOpenBurst,
  onBackupToDrive,
}) => {
  const isBurst = Boolean(item.burst_count && item.burst_count > 1);
  const [isHovered, setIsHovered] = useState(false);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);
  const [scrubTimeLabel, setScrubTimeLabel] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);

  let filterStyle: string | undefined = undefined;
  if (item.is_enhanced) {
    if (item.enhancement_data) {
      try {
        const parsed = JSON.parse(item.enhancement_data);
        if (parsed.css_filter) filterStyle = parsed.css_filter;
      } catch {
        filterStyle = 'brightness(1.12) contrast(1.08) saturate(1.08)';
      }
    } else {
      filterStyle = 'brightness(1.12) contrast(1.08) saturate(1.08)';
    }
  }

  const token = getAuthToken();
  const tokenParam = token ? `${item.thumbnail_url.includes('?') ? '&' : '?'}token=${token}` : '';
  const thumbSrc = `${apiUrl}${item.thumbnail_url}${tokenParam}`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!item.is_video || !videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = item.duration_seconds || videoRef.current.duration || 10;
    const targetSec = ratio * dur;
    try {
      videoRef.current.currentTime = targetSec;
    } catch {
      // Ignore seek boundary errors
    }
    setScrubProgress(ratio);

    const m = Math.floor(targetSec / 60);
    const s = Math.floor(targetSec % 60);
    const durM = Math.floor(dur / 60);
    const durS = Math.floor(dur % 60);
    setScrubTimeLabel(`${m}:${s < 10 ? '0' : ''}${s} / ${durM}:${durS < 10 ? '0' : ''}${durS}`);
  };

  return (
    <div className="relative group">
      {/* 3D Stacked Card Effect for Burst Groups */}
      {isBurst && (
        <>
          <div className="absolute inset-0 bg-slate-300 dark:bg-slate-700 rounded-xl transform rotate-2 translate-x-1.5 translate-y-1.5 -z-10 shadow-sm transition-transform group-hover:rotate-3 group-hover:translate-x-2" />
          <div className="absolute inset-0 bg-slate-400/70 dark:bg-slate-800 rounded-xl transform -rotate-1 -translate-x-1 -translate-y-1 -z-20 shadow-sm transition-transform group-hover:-rotate-2 group-hover:-translate-x-1.5" />
        </>
      )}

      <div
        data-media-id={item.id}
        onPointerDown={(e) => {
          if (onPointerDown) onPointerDown(e, item.id);
        }}
        onClick={(e) => {
          if (onToggleSelect) onToggleSelect(item.id, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onSelect(item);
        }}
        title="Click to select/deselect • Double-click to view full image"
        onMouseEnter={() => setIsHovered(true)}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setIsHovered(false);
          setScrubProgress(null);
          setScrubTimeLabel('');
        }}
        className={`relative aspect-square bg-slate-200 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition select-none ${
          isSelected ? 'ring-4 ring-indigo-500 ring-offset-2 scale-[0.98]' : ''
        }`}
      >
        <img
          src={thumbSrc}
          alt={item.filename}
          style={{ filter: filterStyle }}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 select-none pointer-events-none ${
            isSelected ? 'brightness-95' : ''
          }`}
        />

        {/* Video Scrubber Preview on Hover */}
        {item.is_video && isHovered && (
          <video
            ref={videoRef}
            src={`${apiUrl}/api/v1/media/${item.id}/view${token ? `?token=${token}` : ''}`}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover z-10 animate-fadeIn"
          />
        )}

        {/* Live Photo / Motion Photo Video Looping on Hover */}
        {item.has_motion_photo && isHovered && !item.is_video && (
          <video
            src={`${apiUrl}/api/v1/media/${item.id}/motion-video${token ? `?token=${token}` : ''}`}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-10 animate-fadeIn"
          />
        )}

        {/* Video Hover Scrubber Bar & Timestamp Pill */}
        {item.is_video && isHovered && (
          <>
            <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/50 z-20 pointer-events-none">
              <div
                className="h-full bg-rose-500 transition-all duration-75"
                style={{ width: `${(scrubProgress ?? 0) * 100}%` }}
              />
            </div>
            {scrubTimeLabel && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-black/85 text-white text-[10px] font-mono px-2 py-0.5 rounded-full backdrop-blur-md shadow-lg pointer-events-none border border-white/20 whitespace-nowrap">
                {scrubTimeLabel}
              </div>
            )}
          </>
        )}

      {/* Select Checkbox Button (Top Left) */}
      <button
        type="button"
        data-selection-checkbox="true"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (onToggleSelect) onToggleSelect(item.id, e);
        }}
        className={`absolute top-2 left-2 z-20 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer ${
          isSelected
            ? 'bg-indigo-600 text-white scale-100 opacity-100'
            : 'bg-black/40 text-transparent hover:bg-black/70 hover:text-white/80 opacity-0 group-hover:opacity-100 border border-white/60'
        }`}
        title={isSelected ? 'Deselect photo' : 'Select photo'}
      >
        <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'text-white' : ''}`} />
      </button>

      {/* Category & Status Pills */}
      <div className={`absolute top-2 left-9 flex flex-wrap gap-1 transition-opacity z-20 ${isSelected ? 'opacity-90' : ''}`}>
        {/* Best Shot Gold Crown Badge */}
        {(item.is_best_shot || item.is_burst_lead) && (
          <span
            className="bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 shadow-md border border-amber-300"
            title={`AI Best Shot in sequence (Score: ${Math.round(item.aesthetic_score || item.burst_score || 90)}/100)`}
          >
            <Crown className="w-2.5 h-2.5 fill-slate-950 text-slate-950" />
            <span>BEST SHOT</span>
          </span>
        )}
        {item.has_faces && (
          <span
            className="bg-indigo-600/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 shadow-sm"
            title={`${item.face_count || 1} person${(item.face_count || 1) > 1 ? 's' : ''} detected`}
          >
            <Users className="w-2.5 h-2.5 text-white" />
            <span>{item.face_count && item.face_count > 1 ? item.face_count : 'People'}</span>
          </span>
        )}
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
        {item.is_video && (
          <span className="bg-rose-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 shadow-sm">
            <Play className="w-2.5 h-2.5 fill-white" />
            <span>
              {item.matched_timestamp_label
                ? `At ${item.matched_timestamp_label}`
                : item.duration_seconds
                ? `${Math.floor(item.duration_seconds / 60)}:${Math.floor(item.duration_seconds % 60).toString().padStart(2, '0')}`
                : 'Video'}
            </span>
          </span>
        )}
        {item.has_motion_photo && !item.is_video && (
          <span className="bg-amber-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 shadow-sm" title="Live / Motion Photo">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>LIVE</span>
          </span>
        )}
        {item.is_bokeh && (
          <span className="bg-purple-600/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 shadow-sm" title="Artistic Bokeh / Portrait Depth-of-Field">
            <span>🎨</span>
            <span>Portrait</span>
          </span>
        )}
        {item.is_enhanced && (
          <span className="bg-amber-400 text-slate-950 text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-0.5 shadow-sm" title="1-Click Auto-Enhanced">
            <span>✨</span>
          </span>
        )}
        {item.is_backed_up_gdrive && (
          <span
            className="bg-emerald-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 shadow-sm"
            title={`Backed up to Google Drive: ${item.gdrive_backup_folder_name || 'Drive'}`}
          >
            <Cloud className="w-2.5 h-2.5 text-white" />
            <span className="hidden sm:inline">Backed Up</span>
          </span>
        )}
        {item.is_blurry && !item.is_bokeh && (
          <span className="bg-rose-600/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 shadow-sm">
            <AlertTriangle className="w-2.5 h-2.5 text-white" />
            <span>{item.blur_type === 'motion_blur' ? 'Shake' : 'Blurry'}</span>
          </span>
        )}
        {item.mood && !item.is_video && (
          <span className="bg-slate-900/80 text-white text-[9px] font-medium px-1.5 py-0.5 rounded backdrop-blur-sm capitalize hidden sm:inline-flex items-center gap-1">
            {item.is_smiling ? '😊 ' : ''}
            {item.mood}
          </span>
        )}
      </div>

      {/* Burst Stack Pill Badge */}
      {isBurst && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenBurst) onOpenBurst(item, e);
          }}
          className="absolute bottom-2 left-2 z-20 flex items-center gap-1.5 bg-slate-950/85 hover:bg-slate-900 text-amber-300 hover:text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-lg backdrop-blur-md shadow-md border border-amber-400/30 transition-all hover:scale-105"
          title={`${item.burst_count} burst shots. Click to inspect, compare & clean.`}
        >
          <Layers className="w-3 h-3 text-amber-400" />
          <span>{item.burst_count} shots</span>
          <span className="text-[9px] bg-amber-400/20 text-amber-300 px-1 py-0.2 rounded font-semibold">
            ★ Best
          </span>
        </button>
      )}

      {/* Hover Overlay Controls */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 pointer-events-none">
        <div className="flex justify-end items-center gap-1.5 pointer-events-auto">
          {onBackupToDrive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBackupToDrive(item, e);
              }}
              className="p-1.5 bg-black/40 hover:bg-indigo-600 rounded-full text-white backdrop-blur-sm transition"
              title={item.is_backed_up_gdrive ? `Backed up to Google Drive (${item.gdrive_backup_folder_name || 'Drive'})` : "Backup to Google Drive"}
            >
              <Cloud className={`w-3.5 h-3.5 ${item.is_backed_up_gdrive ? 'text-emerald-400' : 'text-indigo-200'}`} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(`/similar?id=${item.id}`, '_blank');
            }}
            className="p-1.5 bg-black/40 hover:bg-emerald-600 rounded-full text-white backdrop-blur-sm transition"
            title="Find Similar Photos (opens in new tab)"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
          </button>
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
  </div>
  );
};

export const PhotoCard = React.memo(PhotoCardComponent);
