'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Tv,
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Smartphone,
  Wifi,
  Loader2,
  AlertCircle,
  Clock,
  MapPin,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { useCast } from '@/context/CastContext';
import { getApiUrl } from '@/utils/apiUrl';

export const CastModal: React.FC = () => {
  const {
    activeSession,
    isCasting,
    castModalOpen,
    setCastModalOpen,
    availableSessions,
    pairWithPin,
    pairWithSessionId,
    nextTvSlide,
    prevTvSlide,
    toggleTvPlay,
    setTvInterval,
    toggleTvMotion,
    disconnectTv,
    refreshSessions,
  } = useCast();

  const [pinInput, setPinInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const API_URL = getApiUrl();

  useEffect(() => {
    if (castModalOpen && !isCasting) {
      setPinInput('');
      setErrorMessage(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [castModalOpen, isCasting]);

  if (!castModalOpen) return null;

  const handlePinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput.trim().length !== 4) {
      setErrorMessage('Please enter the 4-digit PIN displayed on your TV.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    const res = await pairWithPin(pinInput.trim());
    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to connect. Check TV PIN.');
    }
  };

  const handleDirectConnect = async (sessionId: string) => {
    setLoading(true);
    setErrorMessage(null);
    const res = await pairWithSessionId(sessionId);
    setLoading(false);
    if (!res.success) {
      setErrorMessage(res.error || 'Failed to connect to TV.');
    }
  };

  const currentMedia = activeSession?.current_media;
  const isPlaying = activeSession?.slideshow_state?.is_playing;
  const currentInterval = activeSession?.slideshow_state?.interval_sec || 6;
  const kenBurns = activeSession?.slideshow_state?.ken_burns ?? true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isCasting ? 'bg-blue-600 text-white' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'}`}>
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isCasting ? activeSession?.tv_name || 'Smart TV Lounge' : 'Cast to Smart TV'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                {isCasting ? 'Phone Remote Control Active' : 'Connect to any TV browser in your home'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setCastModalOpen(false)}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* =========================================================================
              VIEW 1: CONNECTED REMOTE CONTROLLER
             ========================================================================= */}
          {isCasting ? (
            <div className="space-y-6">
              {/* Connected Status Card */}
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Streaming live to <strong className="font-semibold">{activeSession?.tv_name}</strong></span>
                </div>
                <button
                  onClick={() => disconnectTv()}
                  className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Disconnect
                </button>
              </div>

              {/* Current Media Preview */}
              {currentMedia ? (
                <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-neutral-800/50 border border-slate-200/80 dark:border-neutral-700/60 rounded-2xl">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0 relative shadow-inner">
                    <img
                      src={`${API_URL}${currentMedia.thumbnail_url}`}
                      alt={currentMedia.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {currentMedia.filename}
                    </div>
                    {currentMedia.location_name && (
                      <div className="text-[11px] text-slate-500 dark:text-neutral-400 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{currentMedia.location_name}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 font-medium">
                      {activeSession?.slideshow_state?.total_items > 0
                        ? `Slide ${activeSession.slideshow_state.playlist_index + 1} of ${activeSession.slideshow_state.total_items}`
                        : 'Single Photo View'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-400 dark:text-neutral-500 bg-slate-50 dark:bg-neutral-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-neutral-700">
                  TV is waiting for media. Tap any photo in your timeline to cast instantly!
                </div>
              )}

              {/* Remote Control Buttons (Prev, Play/Pause, Next) */}
              <div className="flex items-center justify-center gap-4 py-2">
                <button
                  onClick={() => prevTvSlide()}
                  className="p-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-white transition shadow-sm"
                  title="Previous Photo"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                  onClick={() => toggleTvPlay()}
                  className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 transition active:scale-95"
                  title={isPlaying ? 'Pause Slideshow' : 'Start Slideshow'}
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
                </button>

                <button
                  onClick={() => nextTvSlide()}
                  className="p-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-white transition shadow-sm"
                  title="Next Photo"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              {/* Slideshow Interval & Ken Burns Options */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-neutral-800">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Slideshow Speed
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[4, 6, 10, 15].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => setTvInterval(sec)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          currentInterval === sec
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 hover:bg-slate-200 dark:hover:bg-neutral-700'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Ken Burns Motion
                  </span>
                  <button
                    onClick={() => toggleTvMotion()}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition ${
                      kenBurns
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400'
                    }`}
                  >
                    {kenBurns ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* =========================================================================
                VIEW 2: PAIRING / DISCOVERY SCREEN
               ========================================================================= */
            <div className="space-y-6">
              {/* Discovered TV sessions on local network */}
              {availableSessions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500 flex items-center justify-between">
                    <span>Nearby Smart TVs</span>
                    <button
                      onClick={refreshSessions}
                      className="text-blue-600 dark:text-blue-400 normal-case font-medium hover:underline text-[11px]"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="space-y-2">
                    {availableSessions.map((s) => (
                      <div
                        key={s.session_id}
                        className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-2xl hover:border-blue-400 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                            <Tv className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              {s.tv_name}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-neutral-400">
                              {s.status === 'connected' ? 'In Use' : 'Ready to Connect'}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDirectConnect(s.session_id)}
                          disabled={loading}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Connect'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Enter 4-Digit TV PIN */}
              <form onSubmit={handlePinSubmit} className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
                  Or Enter 4-Digit TV PIN
                </label>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPinInput(val);
                      if (val.length === 4) {
                        pairWithPin(val).then(({ success, error }) => {
                          if (!success) setErrorMessage(error || 'Invalid PIN');
                        });
                      }
                    }}
                    placeholder="e.g. 2503"
                    className="flex-1 px-4 py-3 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl text-center text-2xl font-black font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                  <button
                    type="submit"
                    disabled={loading || pinInput.length !== 4}
                    className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-xs transition shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[90px]"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pair'}
                  </button>
                </div>
              </form>

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Smart TV Setup Instruction Card */}
              <div className="p-4 bg-slate-50 dark:bg-neutral-800/40 border border-slate-200/80 dark:border-neutral-800 rounded-2xl space-y-2 text-xs text-slate-600 dark:text-neutral-400">
                <div className="font-bold text-slate-800 dark:text-neutral-200 flex items-center gap-1.5">
                  <Tv className="w-4 h-4 text-blue-500" />
                  How to open TV Lounge Mode:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                  <li>Open the web browser on your Samsung, LG, Android TV, Sony, or Firestick.</li>
                  <li>
                    Navigate to:{' '}
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 select-all">
                      {typeof window !== 'undefined' ? `${window.location.origin}/tv` : '/tv'}
                    </span>
                  </li>
                  <li>Scan the QR code with this phone or enter the 4-digit PIN above.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
