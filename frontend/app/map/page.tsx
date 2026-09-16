'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  MapPin, 
  Navigation, 
  Globe, 
  ExternalLink, 
  Sparkles, 
  RefreshCw, 
  Layers, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  X, 
  ChevronUp, 
  ChevronDown, 
  Calendar, 
  Crosshair, 
  Compass, 
  Image as ImageIcon,
  CheckCircle2,
  Route,
  Flame,
  Milestone
} from 'lucide-react';
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

interface GeoCluster {
  id: string;
  latitude: number;
  longitude: number;
  location_name: string;
  count: number;
  photos: GeoPhoto[];
  coverPhoto: GeoPhoto;
  earliestDate: string;
  latestDate: string;
}

interface TravelStop {
  stopIndex: number;
  latitude: number;
  longitude: number;
  locationName: string;
  photoCount: number;
  arrivalDate: string;
  coverThumbnail: string;
  cluster: GeoCluster | null;
}

type MapLayerType = 'streets' | 'satellite' | 'dark' | 'light';

const MAP_LAYERS: Record<MapLayerType, { name: string; url: string; attribution: string }> = {
  streets: {
    name: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
  dark: {
    name: 'Midnight',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  light: {
    name: 'Clean Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
};

export default function MapPage() {
  const [geoPhotos, setGeoPhotos] = useState<GeoPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPropagating, setIsPropagating] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Map state
  const [isLeafletReady, setIsLeafletReady] = useState(false);
  const [currentLayer, setCurrentLayer] = useState<MapLayerType>('satellite');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Travel Route & Heatmap toggles
  const [showTravelRoutes, setShowTravelRoutes] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Cluster & Selection state
  const [selectedCluster, setSelectedCluster] = useState<GeoCluster | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Filter state
  const [selectedPlaceFilter, setSelectedPlaceFilter] = useState<string>('all');

  // DOM Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersLayerGroupRef = useRef<any>(null);
  const routesLayerGroupRef = useRef<any>(null);
  const heatmapLayerGroupRef = useRef<any>(null);
  const fullContainerRef = useRef<HTMLDivElement | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Load Leaflet JS & CSS assets locally
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = '/vendor/leaflet/leaflet.css';
      document.head.appendChild(link);
    }

    if ((window as any).L) {
      setIsLeafletReady(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'leaflet-script';
    script.src = '/vendor/leaflet/leaflet.js';
    script.async = true;
    script.onload = () => {
      setIsLeafletReady(true);
    };
    document.body.appendChild(script);
  }, []);

  // Fetch geotagged locations from backend
  const loadLocations = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/v1/media/locations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: GeoPhoto[]) => {
        setGeoPhotos(data);
      })
      .catch((e) => console.error('Error fetching locations:', e))
      .finally(() => setLoading(false));
  }, [API_URL]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // Dynamic Geographic Clustering Algorithm (Haversine distance within 10km)
  const clusters: GeoCluster[] = useMemo(() => {
    if (!geoPhotos.length) return [];

    const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const clusterList: GeoCluster[] = [];

    for (const photo of geoPhotos) {
      let matchedCluster: GeoCluster | null = null;
      let minDistance = Infinity;

      for (const cluster of clusterList) {
        const dist = getDistanceKm(photo.latitude, photo.longitude, cluster.latitude, cluster.longitude);
        if (dist <= 10 && dist < minDistance) {
          minDistance = dist;
          matchedCluster = cluster;
        }
      }

      if (matchedCluster) {
        matchedCluster.photos.push(photo);
        const count = matchedCluster.photos.length;
        matchedCluster.latitude = (matchedCluster.latitude * (count - 1) + photo.latitude) / count;
        matchedCluster.longitude = (matchedCluster.longitude * (count - 1) + photo.longitude) / count;
        matchedCluster.count = count;
        if ((!matchedCluster.location_name || matchedCluster.location_name === 'Geotagged Location') && photo.location_name) {
          matchedCluster.location_name = photo.location_name;
        }
      } else {
        clusterList.push({
          id: `cluster-${photo.id}-${photo.latitude.toFixed(4)}-${photo.longitude.toFixed(4)}`,
          latitude: photo.latitude,
          longitude: photo.longitude,
          location_name: photo.location_name || 'Geotagged Location',
          count: 1,
          photos: [photo],
          coverPhoto: photo,
          earliestDate: photo.captured_at,
          latestDate: photo.captured_at,
        });
      }
    }

    // Sort photos within clusters and determine date boundaries
    for (const c of clusterList) {
      c.photos.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
      c.coverPhoto = c.photos[0];
      const validTimestamps = c.photos
        .map((p) => new Date(p.captured_at).getTime())
        .filter((t) => !isNaN(t));
      if (validTimestamps.length > 0) {
        c.earliestDate = new Date(Math.min(...validTimestamps)).toISOString();
        c.latestDate = new Date(Math.max(...validTimestamps)).toISOString();
      }
    }

    // Order clusters by photo count descending
    clusterList.sort((a, b) => b.count - a.count);
    return clusterList;
  }, [geoPhotos]);

  // Compute Chronological Travel Journey (Stops, Segments & Distance)
  const travelJourney = useMemo(() => {
    if (geoPhotos.length < 2) return null;

    const sorted = [...geoPhotos].sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );

    const getDistKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const stops: TravelStop[] = [];

    for (const p of sorted) {
      if (stops.length === 0) {
        const matchedCluster = clusters.find((c) =>
          getDistKm(p.latitude, p.longitude, c.latitude, c.longitude) <= 12
        ) || null;

        stops.push({
          stopIndex: 1,
          latitude: p.latitude,
          longitude: p.longitude,
          locationName: (p.location_name || 'Destination 1').split(',')[0],
          photoCount: 1,
          arrivalDate: p.captured_at,
          coverThumbnail: p.thumbnail_url,
          cluster: matchedCluster,
        });
      } else {
        const last = stops[stops.length - 1];
        const dist = getDistKm(p.latitude, p.longitude, last.latitude, last.longitude);
        if (dist < 15) {
          last.photoCount += 1;
        } else {
          const matchedCluster = clusters.find((c) =>
            getDistKm(p.latitude, p.longitude, c.latitude, c.longitude) <= 12
          ) || null;

          stops.push({
            stopIndex: stops.length + 1,
            latitude: p.latitude,
            longitude: p.longitude,
            locationName: (p.location_name || `Destination ${stops.length + 1}`).split(',')[0],
            photoCount: 1,
            arrivalDate: p.captured_at,
            coverThumbnail: p.thumbnail_url,
            cluster: matchedCluster,
          });
        }
      }
    }

    let totalKm = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      totalKm += getDistKm(
        stops[i].latitude,
        stops[i].longitude,
        stops[i + 1].latitude,
        stops[i + 1].longitude
      );
    }

    return {
      stops,
      totalDistanceKm: Math.round(totalKm),
      startDate: stops[0]?.arrivalDate,
      endDate: stops[stops.length - 1]?.arrivalDate,
    };
  }, [geoPhotos, clusters]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!isLeafletReady || !mapContainerRef.current || mapInstanceRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Default center (India / South Asia)
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([10.5, 77.5], 6);

    // Initial tile layer
    const initialLayerConfig = MAP_LAYERS[currentLayer];
    const tileLayer = L.tileLayer(initialLayerConfig.url, {
      maxZoom: 19,
      attribution: initialLayerConfig.attribution,
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    // Feature groups
    heatmapLayerGroupRef.current = L.featureGroup().addTo(map);
    routesLayerGroupRef.current = L.featureGroup().addTo(map);
    markersLayerGroupRef.current = L.featureGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isLeafletReady]);

  // Update Tile Layer when currentLayer changes
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    mapInstanceRef.current.removeLayer(tileLayerRef.current);
    const config = MAP_LAYERS[currentLayer];
    const newTileLayer = L.tileLayer(config.url, {
      maxZoom: 19,
      attribution: config.attribution,
    }).addTo(mapInstanceRef.current);
    tileLayerRef.current = newTileLayer;
  }, [currentLayer]);

  // Render Custom Clustered Marker Pins
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerGroupRef.current || !isLeafletReady) return;
    const L = (window as any).L;
    if (!L) return;

    const markersGroup = markersLayerGroupRef.current;
    markersGroup.clearLayers();

    if (clusters.length === 0) return;

    const activeClusters = selectedPlaceFilter === 'all'
      ? clusters
      : clusters.filter((c) => (c.location_name || 'Coordinates Only') === selectedPlaceFilter);

    for (const cluster of activeClusters) {
      const isSelected = selectedCluster?.id === cluster.id;
      const primaryPlaceName = cluster.location_name.split(',')[0] || 'Photos';

      const markerHtml = `
        <div class="photo-cluster-pin group" style="cursor: pointer; transform: translate(-50%, -100%);">
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="
              width: ${cluster.count >= 10 ? '58px' : '48px'};
              height: ${cluster.count >= 10 ? '58px' : '48px'};
              border-radius: 18px;
              overflow: hidden;
              background-color: #0f172a;
              border: 3px solid ${isSelected ? '#6366f1' : '#ffffff'};
              box-shadow: ${isSelected ? '0 0 0 4px rgba(99, 102, 241, 0.4), 0 20px 25px -5px rgba(0, 0, 0, 0.5)' : '0 12px 24px -4px rgba(0, 0, 0, 0.35)'};
              transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            ">
              <img 
                src="${API_URL}${cluster.coverPhoto.thumbnail_url}" 
                style="width: 100%; height: 100%; object-fit: cover; display: block;" 
                alt="${cluster.location_name}" 
              />
            </div>
            
            <div style="
              position: absolute;
              top: -6px;
              right: -6px;
              background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
              color: #ffffff;
              font-weight: 800;
              font-size: 11px;
              line-height: 1;
              padding: 4px 7px;
              border-radius: 9999px;
              border: 2px solid #ffffff;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.25);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              ${cluster.count}
            </div>

            <div style="
              position: absolute;
              bottom: -7px;
              left: 50%;
              transform: translateX(-50%);
              width: 0;
              height: 0;
              border-left: 7px solid transparent;
              border-right: 7px solid transparent;
              border-top: 8px solid ${isSelected ? '#6366f1' : '#ffffff'};
              filter: drop-shadow(0 3px 2px rgba(0,0,0,0.25));
            "></div>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-map-cluster-marker',
        html: markerHtml,
        iconSize: [60, 68],
        iconAnchor: [30, 68],
      });

      const marker = L.marker([cluster.latitude, cluster.longitude], { icon: customIcon });

      marker.on('click', () => {
        setSelectedCluster(cluster);
        setIsDrawerOpen(true);
        setSelectedPhotoIndex(null);
        mapInstanceRef.current.flyTo(
          [cluster.latitude, cluster.longitude],
          Math.max(mapInstanceRef.current.getZoom(), 14),
          { duration: 0.9 }
        );
      });

      marker.bindTooltip(
        `<div style="font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 6px;">
          <span>${primaryPlaceName}</span>
          <span style="background: rgba(99, 102, 241, 0.15); color: #4f46e5; padding: 1px 6px; border-radius: 9999px; font-size: 10px;">${cluster.count}</span>
        </div>`,
        { direction: 'top', offset: [0, -68], opacity: 0.95 }
      );

      markersGroup.addLayer(marker);
    }
  }, [clusters, selectedCluster, selectedPlaceFilter, isLeafletReady, API_URL]);

  // Render Travel Route Polylines & Waypoint Badges
  useEffect(() => {
    if (!mapInstanceRef.current || !routesLayerGroupRef.current || !isLeafletReady) return;
    const L = (window as any).L;
    if (!L) return;

    const routesGroup = routesLayerGroupRef.current;
    routesGroup.clearLayers();

    if (!showTravelRoutes || !travelJourney || travelJourney.stops.length < 2) return;

    const latLngs = travelJourney.stops.map((s) => [s.latitude, s.longitude]);

    // Outer glow polyline
    const outerGlow = L.polyline(latLngs, {
      color: '#818cf8',
      weight: 8,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round',
    });
    routesGroup.addLayer(outerGlow);

    // Inner animated dashed polyline
    const routeLine = L.polyline(latLngs, {
      color: '#4f46e5',
      weight: 4,
      opacity: 0.95,
      dashArray: '8, 12',
      lineCap: 'round',
      className: 'travel-route-animated-path',
    });
    routesGroup.addLayer(routeLine);

    // Waypoint Badges
    for (const stop of travelJourney.stops) {
      const waypointHtml = `
        <div style="cursor: pointer; transform: translate(-50%, -50%);">
          <div style="
            background: linear-gradient(135deg, #4338ca 0%, #6366f1 100%);
            color: #ffffff;
            font-weight: 800;
            font-size: 10px;
            padding: 2px 7px;
            border-radius: 9999px;
            border: 2px solid #ffffff;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span>#${stop.stopIndex}</span>
            <span>${stop.locationName}</span>
          </div>
        </div>
      `;

      const waypointIcon = L.divIcon({
        className: 'custom-map-waypoint',
        html: waypointHtml,
        iconSize: [80, 24],
        iconAnchor: [40, 12],
      });

      const waypointMarker = L.marker([stop.latitude, stop.longitude], {
        icon: waypointIcon,
        zIndexOffset: 1000,
      });

      waypointMarker.on('click', () => {
        if (stop.cluster) {
          setSelectedCluster(stop.cluster);
          setIsDrawerOpen(true);
        }
        mapInstanceRef.current.flyTo([stop.latitude, stop.longitude], 14, { duration: 0.8 });
      });

      routesGroup.addLayer(waypointMarker);
    }
  }, [showTravelRoutes, travelJourney, isLeafletReady]);

  // Render Geographic Density Heatmap Layer
  useEffect(() => {
    if (!mapInstanceRef.current || !heatmapLayerGroupRef.current || !isLeafletReady) return;
    const L = (window as any).L;
    if (!L) return;

    const heatGroup = heatmapLayerGroupRef.current;
    heatGroup.clearLayers();

    if (!showHeatmap || clusters.length === 0) return;

    for (const cluster of clusters) {
      const intensity = Math.min(cluster.count / 30, 1.0);

      // Outer Translucent Halo
      const outerCircle = L.circle([cluster.latitude, cluster.longitude], {
        radius: 25000 + intensity * 15000,
        color: 'transparent',
        fillColor: '#6366f1',
        fillOpacity: 0.25,
      });
      heatGroup.addLayer(outerCircle);

      // Mid Glowing Halo
      const midCircle = L.circle([cluster.latitude, cluster.longitude], {
        radius: 12000 + intensity * 8000,
        color: 'transparent',
        fillColor: '#ec4899',
        fillOpacity: 0.45,
      });
      heatGroup.addLayer(midCircle);

      // Core Hotspot
      const coreCircle = L.circle([cluster.latitude, cluster.longitude], {
        radius: 4000 + intensity * 4000,
        color: 'transparent',
        fillColor: '#f43f5e',
        fillOpacity: 0.75,
      });
      heatGroup.addLayer(coreCircle);
    }
  }, [showHeatmap, clusters, isLeafletReady]);

  // Outing Propagation Handler
  const handlePropagate = async () => {
    try {
      setIsPropagating(true);
      setStatusMessage('Auto-linking photos taken on the same outing...');
      const res = await fetch(`${API_URL}/api/v1/media/propagate-locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_gap_hours: 4.0 }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(`Successfully linked ${data.propagated_count || 0} photos to outings!`);
        loadLocations();
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (e) {
      console.error('Error propagating locations:', e);
      setStatusMessage('Failed to auto-link outings.');
    } finally {
      setIsPropagating(false);
    }
  };

  // Deep GPS Re-scan Handler
  const handleRescan = async () => {
    try {
      setIsRescanning(true);
      setStatusMessage('Deep scanning EXIF GPS & multi-frame coordinates...');
      const res = await fetch(`${API_URL}/api/v1/media/rescan-geotags`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(`GPS deep scan complete! Found ${data.total_geotagged || 0} geotags.`);
        loadLocations();
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (e) {
      console.error('Error rescanning:', e);
      setStatusMessage('Failed to scan GPS metadata.');
    } finally {
      setIsRescanning(false);
    }
  };

  const handleSelectCluster = (cluster: GeoCluster) => {
    setSelectedCluster(cluster);
    setIsDrawerOpen(true);
    setSelectedPhotoIndex(null);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(
        [cluster.latitude, cluster.longitude],
        Math.max(mapInstanceRef.current.getZoom(), 14),
        { duration: 0.9 }
      );
    }
  };

  const handleFitAll = () => {
    if (mapInstanceRef.current && markersLayerGroupRef.current) {
      const bounds = markersLayerGroupRef.current.getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
      }
    }
  };

  const toggleFullscreen = () => {
    if (!fullContainerRef.current) return;
    if (!document.fullscreenElement) {
      fullContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 200);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const activeMediaItem: MediaItem | null = useMemo(() => {
    if (!selectedCluster || selectedPhotoIndex === null) return null;
    const p = selectedCluster.photos[selectedPhotoIndex];
    if (!p) return null;
    return {
      id: p.id,
      filename: p.filename,
      category: 'memory',
      width: 1920,
      height: 1080,
      captured_at: p.captured_at,
      is_favorite: false,
      is_blurry: false,
      latitude: p.latitude,
      longitude: p.longitude,
      location_name: p.location_name,
      thumbnail_url: p.thumbnail_url,
    };
  }, [selectedCluster, selectedPhotoIndex]);

  return (
    <div 
      ref={fullContainerRef} 
      className={`relative w-full h-full min-h-full flex-1 overflow-hidden bg-slate-950 select-none ${
        isFullscreen ? 'fixed inset-0 z-50' : 'h-[calc(100vh-4rem)]'
      }`}
    >
      {/* Custom Styles for Leaflet & Pins */}
      <style>{`
        .leaflet-container {
          width: 100%;
          height: 100%;
          background: #090d16;
          font-family: inherit;
        }
        .custom-map-cluster-marker, .custom-map-waypoint {
          background: transparent !important;
          border: none !important;
        }
        @keyframes travelDash {
          from { stroke-dashoffset: 40; }
          to { stroke-dashoffset: 0; }
        }
        .travel-route-animated-path {
          animation: travelDash 1.8s linear infinite;
        }
        .leaflet-tooltip {
          background: rgba(15, 23, 42, 0.9) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          color: #ffffff !important;
          border-radius: 9999px !important;
          padding: 4px 10px !important;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
        }
        .leaflet-tooltip-top:before {
          border-top-color: rgba(15, 23, 42, 0.9) !important;
        }
      `}</style>

      {/* Main Full-Screen Leaflet Canvas */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0 z-0" />

      {/* Top Floating Glassmorphism Island Bar */}
      <div className="absolute top-4 inset-x-4 pointer-events-none z-20 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          {/* Left Title & Status Chip */}
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="flex items-center gap-2.5 px-3.5 py-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800/80">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-sm">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-xs font-bold text-slate-900 dark:text-white leading-none">
                  World Places Explorer
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  {loading ? 'Locating memories...' : `${geoPhotos.length} photos across ${clusters.length} hubs`}
                </p>
              </div>
            </div>

            {/* Notification Toast */}
            {statusMessage && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/95 text-white text-xs font-semibold rounded-xl shadow-lg backdrop-blur-md animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-200" />
                <span>{statusMessage}</span>
              </div>
            )}
          </div>

          {/* Right Island Controls: Routes, Heatmap, Styles & Fullscreen */}
          <div className="pointer-events-auto flex items-center gap-2">
            {/* Travel Routes Toggle */}
            <button
              onClick={() => setShowTravelRoutes(!showTravelRoutes)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold backdrop-blur-md shadow-xl border transition-all ${
                showTravelRoutes
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/30'
                  : 'bg-white/90 dark:bg-slate-900/90 hover:bg-white text-slate-700 dark:text-slate-200 border-slate-200/60 dark:border-slate-800/80'
              }`}
              title="Toggle Chronological Travel Journey Paths"
            >
              <Route className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Travel Routes</span>
            </button>

            {/* Heatmap Toggle */}
            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold backdrop-blur-md shadow-xl border transition-all ${
                showHeatmap
                  ? 'bg-pink-600 text-white border-pink-500 shadow-pink-500/30'
                  : 'bg-white/90 dark:bg-slate-900/90 hover:bg-white text-slate-700 dark:text-slate-200 border-slate-200/60 dark:border-slate-800/80'
              }`}
              title="Toggle Density Heatmap"
            >
              <Flame className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Heatmap</span>
            </button>

            {/* Map Style Selector */}
            <div className="flex items-center p-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800/80">
              {(['streets', 'satellite', 'dark', 'light'] as MapLayerType[]).map((layer) => (
                <button
                  key={layer}
                  onClick={() => setCurrentLayer(layer)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all ${
                    currentLayer === layer
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white'
                  }`}
                >
                  {MAP_LAYERS[layer].name}
                </button>
              ))}
            </div>

            {/* Fit All */}
            <button
              onClick={handleFitAll}
              className="p-2 bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800/80 transition"
              title="Fit all photos in view"
            >
              <Crosshair className="w-4 h-4" />
            </button>

            {/* Auto-Link Outings */}
            <button
              onClick={handlePropagate}
              disabled={isPropagating}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800/80 text-xs font-semibold transition disabled:opacity-50"
              title="Auto-link non-GPS photos taken during same outing"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isPropagating ? 'animate-spin text-amber-500' : 'text-indigo-500'}`} />
              <span className="hidden sm:inline">Auto-Link Outings</span>
            </button>

            {/* Deep Rescan GPS */}
            <button
              onClick={handleRescan}
              disabled={isRescanning}
              className="p-2 bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800/80 transition disabled:opacity-50"
              title="Deep scan hardware EXIF GPS"
            >
              <RefreshCw className={`w-4 h-4 ${isRescanning ? 'animate-spin text-indigo-500' : ''}`} />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800/80 transition"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Theater Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Travel Journey Timeline Floating HUD */}
        {showTravelRoutes && travelJourney && (
          <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl text-white rounded-2xl p-3 border border-indigo-500/30 shadow-2xl flex items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                <Route className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Chronological Journey Path</span>
                  <span className="bg-indigo-500/40 text-indigo-200 text-[10px] px-2 py-0.2 rounded-full border border-indigo-400/30">
                    {travelJourney.totalDistanceKm} km total
                  </span>
                </p>
                <p className="text-[10px] text-slate-400">
                  {travelJourney.stops.length} stops recorded between {new Date(travelJourney.startDate).toLocaleDateString()} and {new Date(travelJourney.endDate).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Stops Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-lg">
              {travelJourney.stops.map((stop) => (
                <button
                  key={stop.stopIndex}
                  onClick={() => {
                    if (stop.cluster) {
                      setSelectedCluster(stop.cluster);
                      setIsDrawerOpen(true);
                    }
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.flyTo([stop.latitude, stop.longitude], 14, { duration: 0.8 });
                    }
                  }}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[11px] font-semibold whitespace-nowrap transition flex items-center gap-1.5 border border-white/10"
                >
                  <span className="text-indigo-400 font-mono">#{stop.stopIndex}</span>
                  <span>{stop.locationName}</span>
                  <span className="text-slate-400 text-[10px]">({stop.photoCount})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Location Chips */}
        {clusters.length > 0 && !showTravelRoutes && (
          <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => {
                setSelectedPlaceFilter('all');
                handleFitAll();
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap backdrop-blur-md shadow-md transition flex items-center gap-1.5 border ${
                selectedPlaceFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-800 shadow-indigo-500/10'
                  : 'bg-white/85 dark:bg-slate-900/85 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-800/80 hover:bg-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>All Locations ({geoPhotos.length})</span>
            </button>

            {clusters.map((cluster) => {
              const placeName = cluster.location_name.split(',')[0] || 'Cluster';
              const isSelected = selectedCluster?.id === cluster.id;
              return (
                <button
                  key={cluster.id}
                  onClick={() => handleSelectCluster(cluster)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap backdrop-blur-md shadow-md transition flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/30'
                      : 'bg-white/85 dark:bg-slate-900/85 text-slate-800 dark:text-slate-200 border-slate-200/60 dark:border-slate-800/80 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0 bg-slate-200">
                    <img
                      src={`${API_URL}${cluster.coverPhoto.thumbnail_url}`}
                      alt={placeName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span>{placeName}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {cluster.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bottom Quick Hint */}
      {!isDrawerOpen && clusters.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <button
            onClick={() => {
              if (selectedCluster) {
                setIsDrawerOpen(true);
              } else if (clusters.length > 0) {
                handleSelectCluster(clusters[0]);
              }
            }}
            className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-semibold rounded-full shadow-2xl backdrop-blur-xl border border-white/15 transition-all hover:scale-105"
          >
            <Compass className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>
              {selectedCluster
                ? `View ${selectedCluster.count} photos in ${selectedCluster.location_name.split(',')[0]}`
                : `Explore ${geoPhotos.length} photos on the map`}
            </span>
            <ChevronUp className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}

      {/* Slide-Up World-Class Photo Cluster Drawer */}
      <div
        className={`absolute bottom-0 inset-x-0 z-30 transition-all duration-300 ease-in-out flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-t border-slate-200/80 dark:border-slate-800 shadow-[0_-10px_30px_rgba(0,0,0,0.3)] rounded-t-3xl ${
          isDrawerOpen && selectedCluster
            ? isDrawerExpanded
              ? 'h-[75vh]'
              : 'h-[340px]'
            : 'h-0 pointer-events-none opacity-0 translate-y-8'
        }`}
      >
        {selectedCluster && (
          <>
            {/* Drawer Drag Bar & Header */}
            <div className="flex-shrink-0 px-6 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-col gap-2">
              <div 
                className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto cursor-pointer hover:bg-slate-400 transition"
                onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
              />

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0 shadow-sm">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {selectedCluster.location_name}
                      </h2>
                      <span className="bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-200/60 dark:border-indigo-800/60 flex-shrink-0">
                        {selectedCluster.count} {selectedCluster.count === 1 ? 'photo' : 'photos'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1 font-mono">
                        <Navigation className="w-3 h-3 text-emerald-500" />
                        {selectedCluster.latitude.toFixed(4)}° N, {selectedCluster.longitude.toFixed(4)}° E
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {new Date(selectedCluster.latestDate).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      if (mapInstanceRef.current) {
                        mapInstanceRef.current.flyTo(
                          [selectedCluster.latitude, selectedCluster.longitude],
                          17,
                          { duration: 0.8 }
                        );
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
                    title="Zoom in closer to this location"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Zoom In</span>
                  </button>

                  <a
                    href={`https://www.google.com/maps?q=${selectedCluster.latitude},${selectedCluster.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
                    title="Open coordinates in Google Maps"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Google Maps</span>
                  </a>

                  <button
                    onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition"
                    title={isDrawerExpanded ? 'Collapse drawer' : 'Expand drawer'}
                  >
                    {isDrawerExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition"
                    title="Close photos drawer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Photos Responsive Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {selectedCluster.photos.map((photo, index) => {
                  return (
                    <div
                      key={photo.id}
                      onClick={() => setSelectedPhotoIndex(index)}
                      className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300 hover:scale-[1.03] border border-slate-200/60 dark:border-slate-700/60"
                    >
                      <img
                        src={`${API_URL}${photo.thumbnail_url}`}
                        alt={photo.filename}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5">
                        <p className="text-white text-[11px] font-semibold truncate leading-tight">
                          {photo.filename}
                        </p>
                        <p className="text-slate-300 text-[10px] font-mono mt-0.5">
                          {new Date(photo.captured_at).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>

                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <ImageIcon className="w-3 h-3" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Empty State when no photos have GPS */}
      {geoPhotos.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-20 pointer-events-none">
          <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md text-center shadow-2xl space-y-4">
            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <MapPin className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                No Geotagged Photos Found
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Recover GPS coordinates from multi-frame camera files or automatically link outings taken around the same time.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleRescan}
                disabled={isRescanning}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md transition disabled:opacity-50"
              >
                {isRescanning ? 'Scanning GPS...' : 'Deep Scan GPS'}
              </button>
              <button
                onClick={handlePropagate}
                disabled={isPropagating}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition disabled:opacity-50"
              >
                {isPropagating ? 'Linking...' : 'Auto-Link Outings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* World-Class Lightbox Modal with Next/Prev in cluster */}
      <LightboxModal
        photo={activeMediaItem}
        apiUrl={API_URL}
        onClose={() => setSelectedPhotoIndex(null)}
        onToggleFavorite={() => {}}
        onDelete={() => {}}
        hasPrev={selectedPhotoIndex !== null && selectedPhotoIndex > 0}
        hasNext={
          selectedPhotoIndex !== null &&
          selectedCluster !== null &&
          selectedPhotoIndex < selectedCluster.photos.length - 1
        }
        onNavigatePrev={() => {
          if (selectedPhotoIndex !== null && selectedPhotoIndex > 0) {
            setSelectedPhotoIndex(selectedPhotoIndex - 1);
          }
        }}
        onNavigateNext={() => {
          if (
            selectedPhotoIndex !== null &&
            selectedCluster !== null &&
            selectedPhotoIndex < selectedCluster.photos.length - 1
          ) {
            setSelectedPhotoIndex(selectedPhotoIndex + 1);
          }
        }}
      />
    </div>
  );
}
