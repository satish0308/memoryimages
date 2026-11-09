'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getApiUrl } from '@/utils/apiUrl';
import { 
  Sparkles, 
  Download, 
  Calendar, 
  MapPin, 
  Camera, 
  Loader2, 
  Share2, 
  Maximize2,
  ExternalLink
} from 'lucide-react';

interface PublicPhotoData {
  id: number;
  filename: string;
  captured_at?: string;
  location_name?: string;
  camera_make?: string;
  camera_model?: string;
  iso?: number;
  exposure_time?: string;
  focal_length?: number;
  width?: number;
  height?: number;
  has_motion_photo?: boolean;
  thumbnail_url: string;
  download_url: string;
}

export default function SinglePhotoSharePage() {
  const params = useParams();
  const token = params?.token as string;

  const [photo, setPhoto] = useState<PublicPhotoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_URL = getApiUrl();

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/api/v1/media/public/share/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Shared photo not found or link has expired');
        return res.json();
      })
      .then((data) => setPhoto(data))
      .catch((err) => setError(err.message || 'Failed to load photo'))
      .finally(() => setLoading(false));
  }, [token, API_URL]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-xs text-slate-400 font-medium">Opening shared photo...</p>
      </div>
    );
  }

  if (error || !photo) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
            <Share2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Photo Unavailable</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error || 'This share link may have expired or was revoked by the owner.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between select-none">
      {/* Top Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/10 bg-black/60 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-md">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <h1 className="font-bold text-xs truncate max-w-xs sm:max-w-md text-white">
              {photo.filename}
            </h1>
            <p className="text-[10px] text-slate-400">
              Shared via MyMemoryPics
            </p>
          </div>
        </div>

        <a
          href={`${API_URL}${photo.download_url}`}
          download={photo.filename}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download</span>
        </a>
      </header>

      {/* Main High-Resolution Photo Display */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-hidden relative">
        {/* Background Ambient Blur */}
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-30 scale-125 pointer-events-none"
          style={{
            backgroundImage: `url(${API_URL}${photo.thumbnail_url})`,
          }}
        />

        <img
          src={`${API_URL}${photo.thumbnail_url}`}
          alt={photo.filename}
          className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl relative z-10"
        />
      </main>

      {/* Bottom Metadata Drawer */}
      <footer className="px-6 py-4 border-t border-white/10 bg-black/80 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-300 z-20">
        <div className="flex flex-wrap items-center gap-4">
          {photo.captured_at && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                {new Date(photo.captured_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}

          {photo.location_name && (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <MapPin className="w-3.5 h-3.5" />
              <span className="truncate max-w-xs">{photo.location_name}</span>
            </div>
          )}

          {photo.camera_make && (
            <div className="flex items-center gap-1.5 font-mono text-slate-400">
              <Camera className="w-3.5 h-3.5" />
              <span>{[photo.camera_make, photo.camera_model].filter(Boolean).join(' ')}</span>
            </div>
          )}
        </div>

        {photo.width && photo.height && (
          <div className="font-mono text-[11px] text-slate-500">
            {photo.width} × {photo.height}
          </div>
        )}
      </footer>
    </div>
  );
}
