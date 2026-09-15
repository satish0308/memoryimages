'use client';

import { useState, useEffect } from 'react';
import { MapPin, Navigation, Globe, Compass, ExternalLink } from 'lucide-react';
import { PhotoCard, MediaItem } from '@/components/timeline/PhotoCard';
import { LightboxModal } from '@/components/timeline/LightboxModal';

interface GeoPhoto {
  id: number;
  filename: string;
  latitude: number;
  longitude: number;
  location_name: string | null;
  captured_at: string;
  thumbnail_url: string;
}

export default function MapPage() {
  const [geoPhotos, setGeoPhotos] = useState<GeoPhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [selectedPin, setSelectedPin] = useState<GeoPhoto | null>(null);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    fetch(`${API_URL}/api/v1/media/locations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setGeoPhotos(data);
        if (data.length > 0) setSelectedPin(data[0]);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [API_URL]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Globe className="w-5 h-5 text-indigo-600" />
          Location & Places Explorer
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Explore where your memories were made using embedded GPS metadata
        </p>
      </div>

      {geoPhotos.length === 0 && !loading && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <MapPin className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-slate-800 text-sm">No Geotagged Photos Found</h3>
          <p className="text-xs text-slate-500">
            Photos taken with phone cameras or GPS-enabled devices will automatically display their locations here.
          </p>
        </div>
      )}

      {geoPhotos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Location Pins List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm max-h-[70vh] overflow-y-auto">
            <h3 className="font-semibold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-indigo-500" />
              Places & Coordinates ({geoPhotos.length})
            </h3>
            <div className="space-y-2">
              {geoPhotos.map((p) => {
                const isSelected = selectedPin?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPin(p)}
                    className={`p-3 rounded-xl cursor-pointer transition flex items-center gap-3 border ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-500/20'
                        : 'bg-white border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                      <img
                        src={`${API_URL}${p.thumbnail_url}`}
                        alt={p.filename}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-xs text-slate-800 truncate">
                        {p.location_name || p.filename}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Pin Map View Card */}
          <div className="lg:col-span-2 space-y-4">
            {selectedPin && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                {/* Simulated Visual Radar / Map Canvas */}
                <div className="h-64 bg-slate-900 relative flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]" />
                  
                  {/* Pin Indicator */}
                  <div className="relative z-10 flex flex-col items-center animate-bounce">
                    <div className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-xl ring-4 ring-indigo-300/40">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <span className="bg-slate-900/90 text-white text-[10px] font-mono px-2 py-0.5 rounded-full mt-2 backdrop-blur-md shadow-md">
                      {selectedPin.latitude.toFixed(4)}, {selectedPin.longitude.toFixed(4)}
                    </span>
                  </div>

                  {/* External Google Maps Button */}
                  <a
                    href={`https://www.google.com/maps?q=${selectedPin.latitude},${selectedPin.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-xl text-xs font-semibold backdrop-blur-md shadow-md transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open in Google Maps
                  </a>
                </div>

                {/* Selected Photo Info */}
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-800">{selectedPin.filename}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Captured: {new Date(selectedPin.captured_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSelectedPhoto({
                        id: selectedPin.id,
                        filename: selectedPin.filename,
                        category: 'memory',
                        width: 1920,
                        height: 1080,
                        captured_at: selectedPin.captured_at,
                        is_favorite: false,
                        is_blurry: false,
                        thumbnail_url: selectedPin.thumbnail_url,
                      })
                    }
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                  >
                    Inspect Photo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      <LightboxModal
        photo={selectedPhoto}
        apiUrl={API_URL}
        onClose={() => setSelectedPhoto(null)}
        onToggleFavorite={() => {}}
        onDelete={() => {}}
      />
    </div>
  );
}
