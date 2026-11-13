'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Tv,
  Wifi,
  WifiOff,
  Maximize,
  Minimize,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Calendar,
  Camera,
  Users,
  Sparkles,
  Smartphone,
  QrCode,
  Layers,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import { getApiUrl } from '@/utils/apiUrl';
import { generateQrMatrix, generateQrSvgPath } from '@/utils/qr';

interface CastMediaItem {
  id: number;
  filename: string;
  category: string;
  captured_at: string | null;
  width: number;
  height: number;
  is_favorite: boolean;
  has_faces: boolean;
  face_count: number;
  face_names: string[];
  camera_make: string | null;
  camera_model: string | null;
  location_name: string | null;
  thumbnail_url: string;
  thumbnail_1080_url: string;
  view_url: string;
  is_video: boolean;
  duration_seconds: number | null;
  mood?: string | null;
  color_hex?: string | null;
}

interface CastSessionData {
  session_id: string;
  pin: string;
  tv_name: string;
  status: 'waiting' | 'connected' | 'idle';
  controller_name: string | null;
  current_media: CastMediaItem | null;
  slideshow_state: {
    is_playing: boolean;
    interval_sec: number;
    ken_burns: boolean;
    playlist_ids: number[];
    playlist_index: number;
    total_items: number;
  };
}

export default function TvReceiverPage() {
  const [session, setSession] = useState<CastSessionData | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [showHud, setShowHud] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qrSvg, setQrSvg] = useState<{ path: string; size: number } | null>(null);
  const [pairUrl, setPairUrl] = useState('');
  const [animVariant, setAnimVariant] = useState(0);
  const [slideshowProgress, setSlideshowProgress] = useState(0);

  const API_URL = getApiUrl();
  const wsRef = useRef<WebSocket | null>(null);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Format captured timestamp
  const formatCapturedDate = (isoStr: string | null) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '';
    }
  };

  // Auto-hide HUD on idle
  const resetHudTimer = useCallback(() => {
    setShowHud(true);
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = setTimeout(() => {
      setShowHud(false);
    }, 4500);
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Update clock every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
      setCurrentDate(now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize or restore Cast session
  const initSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cast/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tv_name: 'Smart TV Lounge' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CastSessionData = await res.json();
      setSession(data);

      // Generate pairing URL for phone
      if (typeof window !== 'undefined') {
        const origin = window.location.origin;
        const url = `${origin}/?pair=${data.pin}`;
        setPairUrl(url);
        try {
          const matrix = generateQrMatrix(url);
          setQrSvg(generateQrSvgPath(matrix, 6, 2));
        } catch (e) {
          console.error('QR generation error:', e);
        }
      }
    } catch (err) {
      console.error('Failed to create cast session:', err);
    }
  }, [API_URL]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  // Connect WebSocket when session is ready
  useEffect(() => {
    if (!session?.session_id) return;

    let socket: WebSocket | null = null;
    let heartbeatInterval: NodeJS.Timeout | null = null;

    const connectWs = () => {
      try {
        let wsUrl = API_URL.replace(/^http/, 'ws');
        wsUrl += `/api/v1/cast/ws/${session.session_id}`;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          setWsConnected(true);
          heartbeatInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ action: 'ping' }));
            }
          }, 20000);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'init' || data.event === 'sync') {
              if (data.session) setSession(data.session);
            } else if (data.event === 'paired') {
              setSession(data.session);
              resetHudTimer();
            } else if (data.event === 'media_change' || data.event === 'playlist_start') {
              if (data.session) setSession(data.session);
              else if (data.media) {
                setSession((prev) => prev ? {
                  ...prev,
                  current_media: data.media,
                  slideshow_state: data.slideshow_state || prev.slideshow_state
                } : prev);
              }
              setAnimVariant((v) => (v + 1) % 2);
              resetHudTimer();
            } else if (data.event === 'slideshow_play' || data.event === 'slideshow_pause') {
              setSession((prev) => prev ? {
                ...prev,
                slideshow_state: data.slideshow_state
              } : prev);
            } else if (data.event === 'motion_change') {
              setSession((prev) => prev ? {
                ...prev,
                slideshow_state: { ...prev.slideshow_state, ken_burns: data.ken_burns }
              } : prev);
            } else if (data.event === 'disconnected') {
              setSession(data.session);
            }
          } catch (e) {
            console.error('Error processing cast event:', e);
          }
        };

        socket.onclose = () => {
          setWsConnected(false);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        };

        socket.onerror = () => {
          setWsConnected(false);
        };

        wsRef.current = socket;
      } catch (err) {
        console.error('WebSocket connection error:', err);
      }
    };

    connectWs();

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (socket) {
        socket.close();
      }
    };
  }, [session?.session_id, API_URL, resetHudTimer]);

  // Slideshow progress timer & auto advance if playing
  useEffect(() => {
    if (!session?.slideshow_state?.is_playing || !session?.session_id) {
      setSlideshowProgress(0);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      return;
    }

    const intervalSec = session.slideshow_state.interval_sec || 6;
    const stepMs = 100;
    const totalSteps = (intervalSec * 1000) / stepMs;
    let curStep = 0;

    progressTimerRef.current = setInterval(() => {
      curStep++;
      setSlideshowProgress(Math.min(100, (curStep / totalSteps) * 100));

      if (curStep >= totalSteps) {
        curStep = 0;
        // Request next slide from backend
        fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'next' }),
        }).catch(() => {});
      }
    }, stepMs);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [session?.slideshow_state?.is_playing, session?.slideshow_state?.interval_sec, session?.session_id, API_URL]);

  // Handle remote controller key presses (Smart TV remotes send keyboard events)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetHudTimer();
      if (!session?.session_id) return;

      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'next' }),
        }).catch(() => {});
      } else if (e.key === 'ArrowLeft') {
        fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'prev' }),
        }).catch(() => {});
      } else if (e.key === ' ' || e.key === 'MediaPlayPause') {
        e.preventDefault();
        const nextPlay = !session.slideshow_state?.is_playing;
        fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: nextPlay ? 'play' : 'pause' }),
        }).catch(() => {});
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'toggle_motion' }),
        }).catch(() => {});
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session?.session_id, session?.slideshow_state?.is_playing, API_URL, resetHudTimer, toggleFullscreen]);

  const currentMedia = session?.current_media;
  const isStandby = !currentMedia;

  return (
    <div
      className="relative w-screen h-screen bg-neutral-950 text-white overflow-hidden select-none cursor-default font-sans"
      onMouseMove={resetHudTimer}
      onClick={resetHudTimer}
    >
      {/* =========================================================================
          TOP HUD (Clock, Status, Fullscreen)
         ========================================================================= */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-6 sm:p-8 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-500 pointer-events-auto ${
          showHud || isStandby ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Brand & TV Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 backdrop-blur-md shadow-lg shadow-blue-500/10">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              MyMemoryPics <span className="text-blue-400 font-semibold text-sm px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30">TV Lounge</span>
            </h1>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{session?.tv_name || 'TV Receiver'}</span>
              {session?.controller_name && (
                <span className="text-emerald-400 font-medium">• Paired with {session.controller_name}</span>
              )}
            </div>
          </div>
        </div>

        {/* Live Clock & Fullscreen button */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-md">
              {currentTime}
            </div>
            <div className="text-xs sm:text-sm font-medium text-neutral-400">
              {currentDate}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="p-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md transition-all text-neutral-300 hover:text-white"
              title="Toggle Fullscreen (F)"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
            <Link
              href="/kiosk"
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md transition-all text-xs font-semibold text-neutral-300 hover:text-white"
            >
              Standalone Kiosk
            </Link>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SLIDESHOW TOP PROGRESS BAR
         ========================================================================= */}
      {session?.slideshow_state?.is_playing && !isStandby && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-40">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-100 ease-linear"
            style={{ width: `${slideshowProgress}%` }}
          />
        </div>
      )}

      {/* =========================================================================
          STATE A: STANDBY PAIRING SCREEN (Clean 10-Foot UI)
         ========================================================================= */}
      {isStandby && (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-neutral-950 via-neutral-900 to-blue-950/40">
          {/* Subtle Ambient Decorative Circles */}
          <div className="absolute w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[140px] pointer-events-none -top-40 -left-40 animate-pulse" />
          <div className="absolute w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[130px] pointer-events-none -bottom-20 -right-20 animate-pulse" />

          <div className="max-w-4xl w-full bg-neutral-900/80 border border-neutral-800/80 backdrop-blur-2xl rounded-3xl p-8 sm:p-12 shadow-2xl flex flex-col md:flex-row items-center gap-10 z-10">
            {/* Left Column: QR Code */}
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-xl">
              {qrSvg ? (
                <svg
                  viewBox={`0 0 ${qrSvg.size} ${qrSvg.size}`}
                  className="w-48 h-48 sm:w-56 sm:h-56"
                >
                  <path d={qrSvg.path} fill="#09090b" />
                </svg>
              ) : (
                <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center text-neutral-400">
                  <QrCode className="w-16 h-16 animate-pulse" />
                </div>
              )}
              <span className="text-xs font-semibold text-neutral-600 mt-2 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> Scan with Phone Camera
              </span>
            </div>

            {/* Right Column: Instructions & 4-Digit PIN */}
            <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left space-y-6">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Ready to Connect
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                  Cast Photos to Big Screen
                </h2>
                <p className="text-sm sm:text-base text-neutral-400 mt-2">
                  Open MyMemoryPics on your phone or laptop. Tap the <span className="text-blue-400 font-semibold">📺 Cast</span> icon and enter this PIN:
                </p>
              </div>

              {/* 4-Digit PIN Glow Cards */}
              <div className="flex items-center gap-3 sm:gap-4 my-2">
                {(session?.pin || '----').split('').map((digit, idx) => (
                  <div
                    key={idx}
                    className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl bg-gradient-to-b from-neutral-800 to-neutral-900 border-2 border-blue-500/50 shadow-lg shadow-blue-500/20 flex items-center justify-center text-4xl sm:text-5xl font-black font-mono tracking-wider text-blue-400 select-all"
                  >
                    {digit}
                  </div>
                ))}
              </div>

              {/* Connection Direct Link */}
              <div className="text-xs text-neutral-500 bg-neutral-950/60 border border-neutral-800/80 px-4 py-2.5 rounded-xl w-full flex items-center justify-between">
                <span className="truncate">
                  Direct pairing URL: <span className="text-neutral-300 select-all font-mono">{pairUrl || 'Loading...'}</span>
                </span>
                <button
                  onClick={initSession}
                  className="ml-2 text-neutral-400 hover:text-white p-1"
                  title="Generate New PIN"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STATE B: ACTIVE MEDIA PLAYBACK (Full 4K Canvas with Ken Burns)
         ========================================================================= */}
      {!isStandby && currentMedia && (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
          {currentMedia.is_video ? (
            /* Video Player */
            <video
              key={currentMedia.id}
              src={`${API_URL}${currentMedia.view_url}`}
              autoPlay
              controls={showHud}
              playsInline
              loop={!session?.slideshow_state?.is_playing}
              onEnded={() => {
                if (session?.slideshow_state?.is_playing && session?.session_id) {
                  fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: 'next' }),
                  }).catch(() => {});
                }
              }}
              className="w-full h-full object-contain"
            />
          ) : (
            /* 4K Photo with Ken Burns Pan/Zoom */
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
              {/* Blurred Ambient Glow Background */}
              <div
                className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 scale-110 pointer-events-none transition-all duration-1000"
                style={{
                  backgroundImage: `url(${API_URL}${currentMedia.thumbnail_1080_url || currentMedia.view_url})`,
                }}
              />

              {/* Fullscreen Photo */}
              <img
                key={currentMedia.id}
                src={`${API_URL}${currentMedia.view_url}`}
                alt={currentMedia.filename}
                className={`max-w-full max-h-full object-contain z-10 transition-transform duration-700 ${
                  session?.slideshow_state?.ken_burns
                    ? animVariant === 0
                      ? 'animate-ken-burns-1'
                      : 'animate-ken-burns-2'
                    : ''
                }`}
              />
            </div>
          )}

          {/* =========================================================================
              BOTTOM-LEFT FROSTED GLASS HUD METADATA PILL
             ========================================================================= */}
          <div
            className={`absolute bottom-6 sm:bottom-8 left-6 sm:left-8 z-30 transition-all duration-500 pointer-events-auto ${
              showHud ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          >
            <div className="bg-neutral-900/80 border border-neutral-700/60 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-2xl max-w-lg space-y-2.5 text-neutral-200">
              {/* Date & Location */}
              <div className="flex flex-wrap items-center gap-3">
                {currentMedia.captured_at && (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    {formatCapturedDate(currentMedia.captured_at)}
                  </span>
                )}
                {currentMedia.location_name && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                    <MapPin className="w-3.5 h-3.5" />
                    {currentMedia.location_name}
                  </span>
                )}
              </div>

              {/* People & Faces */}
              {currentMedia.face_names && currentMedia.face_names.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{currentMedia.face_names.join(', ')}</span>
                </div>
              )}

              {/* Camera Make & Model */}
              {(currentMedia.camera_make || currentMedia.camera_model) && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <Camera className="w-3.5 h-3.5 text-neutral-400" />
                  <span>
                    {[currentMedia.camera_make, currentMedia.camera_model].filter(Boolean).join(' ')}
                  </span>
                </div>
              )}

              {/* Controller Badge */}
              {session?.controller_name && (
                <div className="pt-1 border-t border-neutral-800 text-[11px] text-neutral-500 flex items-center justify-between">
                  <span>Casting from <strong className="text-neutral-300">{session.controller_name}</strong></span>
                  <span className="text-blue-400 font-medium">
                    {session.slideshow_state?.total_items > 0
                      ? `${session.slideshow_state.playlist_index + 1} / ${session.slideshow_state.total_items}`
                      : 'Single View'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* =========================================================================
              BOTTOM-RIGHT CONTROLS HUD (Prev, Play/Pause, Next, Motion)
             ========================================================================= */}
          <div
            className={`absolute bottom-6 sm:bottom-8 right-6 sm:right-8 z-30 transition-all duration-500 pointer-events-auto ${
              showHud ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-2 bg-neutral-900/80 border border-neutral-700/60 backdrop-blur-xl rounded-2xl p-2 shadow-2xl">
              <button
                onClick={() => {
                  if (session?.session_id) {
                    fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ command: 'prev' }),
                    }).catch(() => {});
                  }
                }}
                className="p-3 rounded-xl hover:bg-white/10 text-neutral-300 hover:text-white transition-colors"
                title="Previous Photo (Left Arrow)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                onClick={() => {
                  if (session?.session_id) {
                    const nextPlay = !session.slideshow_state?.is_playing;
                    fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ command: nextPlay ? 'play' : 'pause' }),
                    }).catch(() => {});
                  }
                }}
                className="p-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                title="Play/Pause Slideshow (Space)"
              >
                {session?.slideshow_state?.is_playing ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 fill-current" />
                )}
              </button>

              <button
                onClick={() => {
                  if (session?.session_id) {
                    fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ command: 'next' }),
                    }).catch(() => {});
                  }
                }}
                className="p-3 rounded-xl hover:bg-white/10 text-neutral-300 hover:text-white transition-colors"
                title="Next Photo (Right Arrow)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <div className="w-[1px] h-6 bg-neutral-700/80 mx-1" />

              <button
                onClick={() => {
                  if (session?.session_id) {
                    fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ command: 'toggle_motion' }),
                    }).catch(() => {});
                  }
                }}
                className={`p-3 rounded-xl transition-colors ${
                  session?.slideshow_state?.ken_burns
                    ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/40'
                    : 'hover:bg-white/10 text-neutral-400 hover:text-white'
                }`}
                title="Toggle Ken Burns Motion (M)"
              >
                <Sparkles className="w-5 h-5" />
              </button>

              <button
                onClick={() => {
                  if (session?.session_id) {
                    fetch(`${API_URL}/api/v1/cast/session/${session.session_id}/command`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ command: 'disconnect' }),
                    }).catch(() => {});
                  }
                }}
                className="p-3 rounded-xl hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors"
                title="Stop Casting (Back to Standby)"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
