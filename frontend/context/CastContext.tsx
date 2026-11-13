'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl } from '@/utils/apiUrl';
import { MediaItem } from '@/components/timeline/PhotoCard';

export interface CastMediaItem {
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

export interface CastSessionData {
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

export interface DiscoveredTvSession {
  session_id: string;
  tv_name: string;
  status: 'waiting' | 'connected' | 'idle';
  controller_name: string | null;
  has_current_media: boolean;
}

interface CastContextType {
  activeSession: CastSessionData | null;
  isCasting: boolean;
  castModalOpen: boolean;
  availableSessions: DiscoveredTvSession[];
  setCastModalOpen: (open: boolean) => void;
  openCastModal: (withMedia?: MediaItem | number, withPlaylist?: (MediaItem | number)[]) => void;
  pairWithPin: (pin: string, controllerName?: string) => Promise<{ success: boolean; error?: string }>;
  pairWithSessionId: (sessionId: string, controllerName?: string) => Promise<{ success: boolean; error?: string }>;
  castMedia: (media: MediaItem | number) => Promise<void>;
  castPlaylist: (items: (MediaItem | number)[], intervalSec?: number) => Promise<void>;
  nextTvSlide: () => Promise<void>;
  prevTvSlide: () => Promise<void>;
  toggleTvPlay: () => Promise<void>;
  setTvInterval: (seconds: number) => Promise<void>;
  toggleTvMotion: () => Promise<void>;
  disconnectTv: () => Promise<void>;
  refreshSessions: () => Promise<void>;
}

const CastContext = createContext<CastContextType | undefined>(undefined);

export const CastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSession, setActiveSession] = useState<CastSessionData | null>(null);
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [availableSessions, setAvailableSessions] = useState<DiscoveredTvSession[]>([]);
  const [pendingMediaId, setPendingMediaId] = useState<number | null>(null);
  const [pendingPlaylistIds, setPendingPlaylistIds] = useState<number[] | null>(null);

  const API_URL = getApiUrl();
  const wsRef = useRef<WebSocket | null>(null);
  const isCasting = Boolean(activeSession && activeSession.status === 'connected');

  // Discover active TV sessions on local network
  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cast/sessions`);
      if (res.ok) {
        const data = await res.json();
        setAvailableSessions(data.sessions || []);
      }
    } catch {
      // Ignore network errors when discovering
    }
  }, [API_URL]);

  // Connect WebSocket to stay in sync with TV state
  useEffect(() => {
    if (!activeSession?.session_id) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let socket: WebSocket | null = null;
    try {
      let wsUrl = API_URL.replace(/^http/, 'ws');
      wsUrl += `/api/v1/cast/ws/${activeSession.session_id}`;
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.session) {
            setActiveSession(data.session);
          } else if (data.event === 'media_change' && data.media) {
            setActiveSession((prev) => prev ? {
              ...prev,
              current_media: data.media,
              slideshow_state: data.slideshow_state || prev.slideshow_state,
            } : prev);
          } else if (data.event === 'slideshow_play' || data.event === 'slideshow_pause') {
            setActiveSession((prev) => prev ? {
              ...prev,
              slideshow_state: data.slideshow_state || prev.slideshow_state,
            } : prev);
          } else if (data.event === 'disconnected') {
            setActiveSession(null);
            if (typeof window !== 'undefined') {
              localStorage.removeItem('memorypics_cast_session_id');
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      socket.onclose = () => {
        // Will fallback to periodic sync if needed
      };

      wsRef.current = socket;
    } catch {
      // WS fallback
    }

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [activeSession?.session_id, API_URL]);

  // Check URL query parameters for ?pair=<pin> on initial load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const pairPin = params.get('pair');
    if (pairPin) {
      // Auto-pair with PIN
      pairWithPin(pairPin).then(({ success }) => {
        if (success) {
          // Clean URL without refresh
          const url = new URL(window.location.href);
          url.searchParams.delete('pair');
          window.history.replaceState({}, '', url.toString());
        }
      });
      return;
    }

    // Try restoring saved session from localStorage
    const savedSessionId = localStorage.getItem('memorypics_cast_session_id');
    if (savedSessionId) {
      fetch(`${API_URL}/api/v1/cast/session/${savedSessionId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.status === 'connected') {
            setActiveSession(data);
          } else {
            localStorage.removeItem('memorypics_cast_session_id');
          }
        })
        .catch(() => {
          localStorage.removeItem('memorypics_cast_session_id');
        });
    }
  }, [API_URL]);

  // Poll available sessions when modal is open
  useEffect(() => {
    if (castModalOpen) {
      refreshSessions();
      const interval = setInterval(refreshSessions, 6000);
      return () => clearInterval(interval);
    }
  }, [castModalOpen, refreshSessions]);

  // Helper to resolve device name
  const getDeviceName = () => {
    if (typeof navigator === 'undefined') return 'Mobile Remote';
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return 'iPhone / iPad';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Macintosh/.test(ua)) return 'MacBook';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Web Controller';
  };

  // Pair with PIN
  const pairWithPin = useCallback(async (pin: string, controllerName?: string) => {
    try {
      const name = controllerName || getDeviceName();
      const res = await fetch(`${API_URL}/api/v1/cast/session/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, controller_name: name }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.detail || 'Failed to pair. Verify PIN on TV screen.' };
      }

      const data = await res.json();
      setActiveSession(data.session);
      if (typeof window !== 'undefined') {
        localStorage.setItem('memorypics_cast_session_id', data.session_id);
      }

      // If there was pending media, cast it now!
      if (pendingMediaId) {
        fetch(`${API_URL}/api/v1/cast/session/${data.session_id}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'cast_media', media_id: pendingMediaId }),
        }).catch(() => {});
        setPendingMediaId(null);
      } else if (pendingPlaylistIds && pendingPlaylistIds.length > 0) {
        fetch(`${API_URL}/api/v1/cast/session/${data.session_id}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'cast_playlist', media_ids: pendingPlaylistIds }),
        }).catch(() => {});
        setPendingPlaylistIds(null);
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  }, [API_URL, pendingMediaId, pendingPlaylistIds]);

  // Pair directly with discovered session
  const pairWithSessionId = useCallback(async (sessionId: string, controllerName?: string) => {
    try {
      const sessionRes = await fetch(`${API_URL}/api/v1/cast/session/${sessionId}`);
      if (!sessionRes.ok) return { success: false, error: 'TV session no longer active' };
      const sessionData = await sessionRes.json();
      if (sessionData.pin) {
        return await pairWithPin(sessionData.pin, controllerName);
      }
      return { success: false, error: 'Missing pairing credentials' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  }, [API_URL, pairWithPin]);

  // Open modal with queued media
  const openCastModal = useCallback((withMedia?: MediaItem | number, withPlaylist?: (MediaItem | number)[]) => {
    if (withMedia) {
      const id = typeof withMedia === 'number' ? withMedia : withMedia.id;
      setPendingMediaId(id);
    }
    if (withPlaylist && withPlaylist.length > 0) {
      const ids = withPlaylist.map((p) => (typeof p === 'number' ? p : p.id));
      setPendingPlaylistIds(ids);
    }
    setCastModalOpen(true);
  }, []);

  // Cast single media item
  const castMedia = useCallback(async (media: MediaItem | number) => {
    const id = typeof media === 'number' ? media : media.id;
    if (!activeSession || activeSession.status !== 'connected') {
      openCastModal(id);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/cast/session/${activeSession.session_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'cast_media', media_id: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSession(data.session);
      }
    } catch (err) {
      console.error('Failed to cast media:', err);
    }
  }, [activeSession, API_URL, openCastModal]);

  // Cast playlist slideshow
  const castPlaylist = useCallback(async (items: (MediaItem | number)[], intervalSec: number = 6) => {
    const ids = items.map((p) => (typeof p === 'number' ? p : p.id));
    if (!activeSession || activeSession.status !== 'connected') {
      openCastModal(undefined, ids);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/cast/session/${activeSession.session_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'cast_playlist',
          media_ids: ids,
          interval_sec: intervalSec,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSession(data.session);
      }
    } catch (err) {
      console.error('Failed to cast playlist:', err);
    }
  }, [activeSession, API_URL, openCastModal]);

  // Remote Navigation Commands
  const nextTvSlide = useCallback(async () => {
    if (!activeSession) return;
    try {
      await fetch(`${API_URL}/api/v1/cast/session/${activeSession.session_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'next' }),
      });
    } catch {}
  }, [activeSession, API_URL]);

  const prevTvSlide = useCallback(async () => {
    if (!activeSession) return;
    try {
      await fetch(`${API_URL}/api/v1/cast/session/${activeSession.session_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'prev' }),
      });
    } catch {}
  }, [activeSession, API_URL]);

  const toggleTvPlay = useCallback(async () => {
    if (!activeSession) return;
    const isPlaying = activeSession.slideshow_state?.is_playing;
    try {
      await fetch(`${API_URL}/api/v1/cast/session/${activeSession.session_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: isPlaying ? 'pause' : 'play' }),
      });
    } catch {}
  }, [activeSession, API_URL]);

  const setTvInterval = useCallback(async (seconds: number) => {
    if (!activeSession) return;
    try {
      await fetch(`${API_URL}/api/v1/cast/session/${activeSession.session_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'set_interval', interval_sec: seconds }),
      });
    } catch {}
  }, [activeSession, API_URL]);

  const toggleTvMotion = useCallback(async () => {
    if (!activeSession) return;
    try {
      await fetch(`${API_URL}/api/v1/cast/session/${activeSession.session_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'toggle_motion' }),
      });
    } catch {}
  }, [activeSession, API_URL]);

  const disconnectTv = useCallback(async () => {
    if (!activeSession) return;
    try {
      await fetch(`${API_URL}/api/v1/cast/session/${activeSession.session_id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'disconnect' }),
      });
    } catch {}
    setActiveSession(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('memorypics_cast_session_id');
    }
  }, [activeSession, API_URL]);

  return (
    <CastContext.Provider
      value={{
        activeSession,
        isCasting,
        castModalOpen,
        availableSessions,
        setCastModalOpen,
        openCastModal,
        pairWithPin,
        pairWithSessionId,
        castMedia,
        castPlaylist,
        nextTvSlide,
        prevTvSlide,
        toggleTvPlay,
        setTvInterval,
        toggleTvMotion,
        disconnectTv,
        refreshSessions,
      }}
    >
      {children}
    </CastContext.Provider>
  );
};

export const useCast = (): CastContextType => {
  const context = useContext(CastContext);
  if (!context) {
    throw new Error('useCast must be used within a CastProvider');
  }
  return context;
};
