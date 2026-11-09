'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getApiUrl } from '@/utils/apiUrl';
import { 
  Sparkles, 
  Download, 
  Upload, 
  Play, 
  Image as ImageIcon, 
  Calendar, 
  MapPin, 
  Loader2, 
  CheckCircle2, 
  Heart,
  Share2
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { LightboxModal } from '@/components/timeline/LightboxModal';
import { AmbientSlideshowModal } from '@/components/timeline/AmbientSlideshowModal';

interface SharedAlbumData {
  name: string;
  description?: string;
  allow_guest_uploads: boolean;
  photo_count: number;
  created_at: string;
  photos: MediaItem[];
}

export default function GuestSharePage() {
  const params = useParams();
  const token = params?.token as string;

  const [albumData, setAlbumData] = useState<SharedAlbumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const API_URL = getApiUrl();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSharedAlbum = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/albums/public/share/${token}`);
      if (!res.ok) {
        setError('This shared event album could not be found or has expired.');
        return;
      }
      const data = await res.json();
      setAlbumData(data);
    } catch (err) {
      console.error('Failed to load shared album:', err);
      setError('Failed to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSharedAlbum();
  }, [token]);

  const handleGuestUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(`Uploading ${i + 1} of ${files.length}...`);
      const formData = new FormData();
      formData.append('file', files[i]);

      try {
        await fetch(`${API_URL}/api/v1/albums/public/share/${token}/upload`, {
          method: 'POST',
          body: formData,
        });
      } catch (err) {
        console.error('Upload error:', err);
      }
    }
    setUploading(false);
    setUploadProgress('');
    fetchSharedAlbum();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm text-slate-400 font-medium">Opening event album...</p>
      </div>
    );
  }

  if (error || !albumData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
            <Share2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Album Not Available</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error || 'This link may have been revoked by the event organizer.'}
          </p>
        </div>
      </div>
    );
  }

  const photos = albumData.photos || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-md">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <span className="font-bold text-sm tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            MyMemoryPics Event
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Start Slideshow */}
          <button
            onClick={() => setIsSlideshowOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span className="hidden sm:inline">Slideshow</span>
          </button>

          {/* 1-Click ZIP Download */}
          <a
            href={`${API_URL}/api/v1/albums/public/share/${token}/zip`}
            download
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download All ({photos.length})</span>
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Event Hero Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 p-8 border border-slate-800 shadow-2xl">
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              <Share2 className="w-3 h-3" />
              <span>Shared Event Album</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">
              {albumData.name}
            </h1>
            {albumData.description && (
              <p className="text-sm text-slate-300 leading-relaxed">
                {albumData.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-slate-400 pt-2 font-mono">
              <span>{photos.length} photos</span>
              <span>•</span>
              <span>
                Created {new Date(albumData.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Guest Upload Dropzone if Enabled */}
        {albumData.allow_guest_uploads && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all ${
              uploading
                ? 'border-indigo-500 bg-indigo-950/20'
                : 'border-slate-800 hover:border-indigo-500/60 bg-slate-900/40 hover:bg-slate-900/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleGuestUpload}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center shadow-inner">
                {uploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
              </div>
              <h3 className="font-bold text-sm text-white">
                {uploading ? uploadProgress : 'Drop your photos here to add to this event'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                {uploading
                  ? 'Please keep this window open while photos are transferring...'
                  : 'Guests can contribute photos from their phone or laptop with zero login required.'}
              </p>
            </div>
          </div>
        )}

        {/* Photos Grid */}
        {photos.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-xs">
            No photos have been added to this event yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className="group relative aspect-square bg-slate-900 rounded-2xl overflow-hidden cursor-pointer shadow-md hover:shadow-xl transition-all duration-200 border border-slate-800/60"
              >
                <img
                  src={`${API_URL}${photo.thumbnail_url}`}
                  alt={photo.filename}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5 text-white">
                  <div className="text-[11px] truncate font-medium">
                    {photo.location_name || photo.filename}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox for Guests */}
      <LightboxModal
        photo={selectedPhoto}
        apiUrl={API_URL}
        onClose={() => setSelectedPhoto(null)}
        onToggleFavorite={() => {}}
        onDelete={() => setSelectedPhoto(null)}
      />

      {/* Ambient Slideshow for Guests */}
      <AmbientSlideshowModal
        photos={photos}
        apiUrl={API_URL}
        isOpen={isSlideshowOpen}
        onClose={() => setIsSlideshowOpen(false)}
      />
    </div>
  );
}
