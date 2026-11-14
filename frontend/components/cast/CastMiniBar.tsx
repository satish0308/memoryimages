'use client';

import React from 'react';
import { Tv, Play, Pause, ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { useCast } from '@/context/CastContext';
import { getApiUrl } from '@/utils/apiUrl';

export const CastMiniBar: React.FC = () => {
  const {
    activeSession,
    isCasting,
    castModalOpen,
    setCastModalOpen,
    nextTvSlide,
    prevTvSlide,
    toggleTvPlay,
    disconnectTv,
  } = useCast();

  const API_URL = getApiUrl();

  if (!isCasting || castModalOpen || !activeSession) return null;

  const currentMedia = activeSession.current_media;
  const isPlaying = activeSession.slideshow_state?.is_playing;
  const isVideo = Boolean(currentMedia?.is_video);
  const videoState = activeSession.video_state;
  const videoProgress = videoState?.duration_sec && videoState.duration_sec > 0
    ? Math.min(100, ((videoState.current_time || 0) / videoState.duration_sec) * 100)
    : 0;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 z-40 max-w-md w-[92%] sm:w-auto animate-slideUp">
      <div className="bg-slate-900/95 dark:bg-neutral-900/95 border border-slate-700/80 dark:border-neutral-700 text-white backdrop-blur-xl rounded-2xl p-2.5 sm:px-4 sm:py-2.5 shadow-2xl flex items-center justify-between gap-3 sm:gap-5 relative overflow-hidden">
        {/* Bottom Video Progress Line (for Videos) */}
        {isVideo && videoProgress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${videoProgress}%` }}
            />
          </div>
        )}
        {/* Left Side: Thumbnail & TV Name */}
        <div
          onClick={() => setCastModalOpen(true)}
          className="flex items-center gap-3 cursor-pointer group min-w-0"
        >
          {currentMedia ? (
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-black flex-shrink-0 relative border border-white/20">
              <img
                src={`${API_URL}${currentMedia.thumbnail_url}`}
                alt={currentMedia.filename}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Tv className="w-4 h-4 animate-pulse" />
            </div>
          )}

          <div className="min-w-0">
            <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="truncate">{activeSession.tv_name}</span>
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {currentMedia ? currentMedia.filename : 'Ready to Cast'}
            </div>
          </div>
        </div>

        {/* Right Side: Remote Playback Buttons */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevTvSlide();
            }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
            title="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleTvPlay();
            }}
            className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              nextTvSlide();
            }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
            title="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              disconnectTv();
            }}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
            title="Disconnect"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
