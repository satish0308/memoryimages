'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Download, 
  Heart, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { MediaItem } from './PhotoCard';

interface LightboxModalProps {
  photo: MediaItem | null;
  apiUrl: string;
  onClose: () => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  photo,
  apiUrl,
  onClose,
  onToggleFavorite,
  onDelete,
  onNavigatePrev,
  onNavigateNext,
  hasPrev = false,
  hasNext = false,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Reset zoom and pan whenever a new photo is opened
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photo?.id]);

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!photo) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onNavigatePrev && hasPrev) {
        onNavigatePrev();
      } else if (e.key === 'ArrowRight' && onNavigateNext && hasNext) {
        onNavigateNext();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetZoom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photo?.id, hasPrev, hasNext]);

  if (!photo) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn"
      onMouseUp={handleMouseUp}
    >
      <div className="relative max-w-6xl max-h-[92vh] w-full flex flex-col md:flex-row bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
        {/* Top Controls: Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2 bg-black/50 text-white rounded-full hover:bg-black/80 transition"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Photo Interactive Viewport with Pan & Zoom */}
        <div 
          className="relative flex-1 flex items-center justify-center bg-black overflow-hidden p-4 min-h-[400px] select-none"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
          {/* Previous Photo Button */}
          {hasPrev && onNavigatePrev && (
            <button
              onClick={onNavigatePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full backdrop-blur-md transition shadow-lg"
              title="Previous Photo (Left Arrow)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Next Photo Button */}
          {hasNext && onNavigateNext && (
            <button
              onClick={onNavigateNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full backdrop-blur-md transition shadow-lg"
              title="Next Photo (Right Arrow)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          <img
            src={`${apiUrl}/api/v1/media/${photo.id}/thumbnail?size=1080`}
            alt={photo.filename}
            className="max-h-[82vh] max-w-full object-contain rounded transition-transform duration-75 origin-center"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            }}
            draggable={false}
          />

          {/* Floating Zoom Controls Bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/80 backdrop-blur-md border border-slate-700/80 px-3 py-1.5 rounded-full flex items-center gap-3 text-white shadow-xl">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 1}
              className="p-1 hover:bg-white/10 rounded-full transition disabled:opacity-40"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-semibold min-w-[45px] text-center">
              {Math.round(zoom * 100)}%
            </span>

            <button
              onClick={handleZoomIn}
              disabled={zoom >= 4}
              className="p-1 hover:bg-white/10 rounded-full transition disabled:opacity-40"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            {zoom > 1 && (
              <button
                onClick={handleResetZoom}
                className="p-1 hover:bg-white/10 rounded-full text-indigo-400 hover:text-white transition"
                title="Reset Zoom (100%)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Details & Controls Sidebar */}
        <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 p-6 text-white flex flex-col justify-between flex-shrink-0">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-base truncate" title={photo.filename}>
                {photo.filename}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(photo.captured_at).toLocaleString()}
              </p>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-800 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-500">Category</span>
                <span className="capitalize font-medium text-indigo-400">
                  {photo.category.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-500">Dimensions</span>
                <span>
                  {photo.width} × {photo.height} px
                </span>
              </div>
              {photo.is_blurry && (
                <div className="flex items-center justify-between text-amber-400 font-medium">
                  <span>Quality</span>
                  <span>Flagged as Blurry</span>
                </div>
              )}
            </div>

            {/* Quick Zoom Helper Hint */}
            <div className="bg-slate-800/60 rounded-xl p-2.5 text-[11px] text-slate-400 flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>Tip: Use mouse wheel to zoom in/out, click & drag to pan.</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center gap-2">
            <a
              href={`${apiUrl}/api/v1/media/${photo.id}/download`}
              download
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              onClick={() => onToggleFavorite(photo.id)}
              className={`p-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition ${
                photo.is_favorite ? 'text-red-500' : 'text-slate-300'
              }`}
              title="Favorite"
            >
              <Heart className={`w-4 h-4 ${photo.is_favorite ? 'fill-red-500' : ''}`} />
            </button>
            <button
              onClick={() => onDelete(photo.id)}
              className="p-2 rounded-lg border border-slate-700 hover:bg-red-950/50 hover:text-red-400 text-slate-400 transition"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
