'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapPin, Navigation, Globe, ExternalLink, Sparkles, RefreshCw, Layers } from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';
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
  const [selectedPlaceFilter, setSelectedPlaceFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [isPropagating, setIsPropagating] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const loadLocations = () => {
    setLoading(true);
    fetch(`${API_URL}/api/v1/media/locations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: GeoPhoto[]) => {
        setGeoPhotos(data);
        if (data.length > 0) {
          setSelectedPin((prev) => (prev ? (data.find(d => d.id === prev.id) || data[0]) : data[0]));
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLocations();
  }, [API_URL]);

  // Group by distinct place names for quick filter pills
  const placeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of geoPhotos) {
      const name = p.location_name || 'Coordinates Only';
      counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }, [geoPhotos]);

  const filteredPhotos = useMemo(() => {
    if (selectedPlaceFilter === 'all') return geoPhotos;
    return geoPhotos.filter((p) => (p.location_name || 'Coordinates Only') === selectedPlaceFilter);
  }, [geoPhotos, selectedPlaceFilter]);

  const handlePropagate = async () => {
    try {
      setIsPropagating(true);
      const res = await fetch(`${API_URL}/api/v1/media/propagate-locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_gap_hours: 4.0 }),
      });
      if (res.ok) {
        loadLocations();
      }
    } catch (e) {
      console.error('Error propagating locations:', e);
    } finally {
      setIsPropagating(false);
    }
  };

  const handleRescan = async () => {
    try {
      setIsPropagating(true);
      const res = await fetch(`${API_URL}/api/v1/media/rescan-geotags`, {
        method: 'POST',
      });
      if (res.ok) {
        loadLocations();
      }
    } catch (e) {
      console.error('Error rescanning:', e);
    } finally {
      setIsPropagating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600" />
            Location & Places Explorer
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Interactive map of your memories with recovered hardware GPS and trip outing clustering
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePropagate}
            disabled={isPropagating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            title="Auto-link photos taken on the same outing to nearby GPS coordinates"
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-500 ${isPropagating ? 'animate-spin' : ''}`} />
            <span>Auto-Link Outings</span>
          </button>
          <button
            onClick={handleRescan}
            disabled={isPropagating}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition"
            title="Deep re-scan GPS"
          >
            <RefreshCw className={`w-4 h-4 ${isPropagating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Place Filter Pills */}
      {geoPhotos.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedPlaceFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              selectedPlaceFilter === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>All Places ({geoPhotos.length})</span>
          </button>

          {Object.entries(placeCounts).map(([placeName, count]) => {
            const isSelected = selectedPlaceFilter === placeName;
            return (
              <button
                key={placeName}
                onClick={() => {
                  setSelectedPlaceFilter(placeName);
                  const firstInPlace = geoPhotos.find(p => (p.location_name || 'Coordinates Only') === placeName);
                  if (firstInPlace) setSelectedPin(firstInPlace);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <MapPin className="w-3 h-3 text-emerald-500" />
                <span>{placeName.split(',')[0]}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {geoPhotos.length === 0 && !loading && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">No Geotagged Photos Found</h3>
            <p className="text-xs text-slate-500 mt-1">
              Click &quot;Deep Scan GPS&quot; to recover coordinates from multi-frame camera files, or assign locations from the timeline.
            </p>
          </div>
          <button
            onClick={handleRescan}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition"
          >
            Deep Scan GPS Metadata
          </button>
        </div>
      )}

      {/* Main Content Grid */}
      {geoPhotos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Location Pins List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm max-h-[75vh] overflow-y-auto">
            <h3 className="font-semibold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-indigo-500" />
              Photos in View ({filteredPhotos.length})
            </h3>
            <div className="space-y-2">
              {filteredPhotos.map((p) => {
                const isSelected = selectedPin?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPin(p)}
                    className={`p-2.5 rounded-xl cursor-pointer transition flex items-center gap-3 border ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-500/20'
                        : 'bg-white border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 relative">
                      <img
                        src={`${API_URL}${p.thumbnail_url}`}
                        alt={p.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-xs text-slate-800 truncate">
                        {p.location_name || p.filename}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {new Date(p.captured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Pin Interactive Map Card */}
          <div className="lg:col-span-2 space-y-4">
            {selectedPin && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                {/* Live OpenStreetMap Interactive Embed */}
                <div className="h-80 bg-slate-900 relative overflow-hidden">
                  <iframe
                    title="Interactive Photo Map"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedPin.longitude - 0.012}%2C${selectedPin.latitude - 0.012}%2C${selectedPin.longitude + 0.012}%2C${selectedPin.latitude + 0.012}&layer=mapnik&marker=${selectedPin.latitude}%2C${selectedPin.longitude}`}
                    className="w-full h-full border-0"
                    loading="lazy"
                  />

                  {/* Top Location Badge Overlay */}
                  <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow-md flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{selectedPin.location_name || 'Geotagged Location'}</span>
                  </div>

                  {/* External Google / Apple Maps Links */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <a
                      href={`https://www.google.com/maps?q=${selectedPin.latitude},${selectedPin.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-xl text-xs font-semibold backdrop-blur-md shadow-md transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Google Maps
                    </a>
                  </div>
                </div>

                {/* Selected Photo Info Bar */}
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                      <img
                        src={`${API_URL}${selectedPin.thumbnail_url}`}
                        alt={selectedPin.filename}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-800 truncate">{selectedPin.filename}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{new Date(selectedPin.captured_at).toLocaleString()}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          ({selectedPin.latitude.toFixed(4)}, {selectedPin.longitude.toFixed(4)})
                        </span>
                      </p>
                    </div>
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
                        latitude: selectedPin.latitude,
                        longitude: selectedPin.longitude,
                        location_name: selectedPin.location_name,
                        thumbnail_url: selectedPin.thumbnail_url,
                      })
                    }
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition whitespace-nowrap"
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
        onClose={() => {
          setSelectedPhoto(null);
          loadLocations();
        }}
        onToggleFavorite={() => {}}
        onDelete={() => {}}
      />
    </div>
  );
}
