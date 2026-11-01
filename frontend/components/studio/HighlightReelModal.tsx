'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Download, 
  Save, 
  Sparkles, 
  Film, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  Check, 
  Clock, 
  Music, 
  MapPin, 
  Calendar,
  Maximize2
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';

interface HighlightReelModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: MediaItem[];
}

export function HighlightReelModal({
  isOpen,
  onClose,
  title,
  subtitle,
  items,
}: HighlightReelModalProps) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);
  const [slideDuration, setSlideDuration] = useState<number>(3500); // 3.5s per slide
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingProgress, setRecordingProgress] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const loadedImagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const slideStartTimeRef = useRef<number>(Date.now());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // 1. Preload photos for smooth transitions
  useEffect(() => {
    if (!isOpen || !items.length) return;

    items.forEach((item) => {
      if (!loadedImagesRef.current.has(item.id)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = `${API_URL}/api/v1/media/${item.id}/thumbnail?size=1080${token ? `&token=${token}` : ''}`;
        img.onload = () => {
          loadedImagesRef.current.set(item.id, img);
        };
      }
    });

    setCurrentIndex(0);
    setIsPlaying(true);
    slideStartTimeRef.current = Date.now();
  }, [isOpen, items, API_URL, token]);

  // 2. Synthesized Ambient Audio Soundtrack (Calm Pentatonic Chords)
  const playAmbientNote = useCallback(() => {
    if (!isAudioEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      // Pentatonic warm chord frequencies: C3, G3, A3, C4, E4, G4, A4
      const scale = [130.81, 196.0, 220.0, 261.63, 329.63, 392.0, 440.0];
      const freq = scale[Math.floor(Math.random() * scale.length)];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // Soft envelope attack and long gentle release
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.0);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 3.1);
    } catch (e) {
      console.warn('Audio synthesis notice:', e);
    }
  }, [isAudioEnabled]);

  useEffect(() => {
    if (isOpen && isPlaying && isAudioEnabled) {
      playAmbientNote();
      audioIntervalRef.current = setInterval(playAmbientNote, 2200);
    } else {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    }
    return () => {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    };
  }, [isOpen, isPlaying, isAudioEnabled, playAmbientNote]);

  // 3. Ken Burns Canvas Animation Loop
  useEffect(() => {
    if (!isOpen || !items.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set fixed high-res 16:9 canvas dimensions
    canvas.width = 1920;
    canvas.height = 1080;

    const renderFrame = () => {
      const now = Date.now();
      const elapsed = now - slideStartTimeRef.current;
      const progress = Math.min(1, elapsed / slideDuration);

      // Auto advance slide if playing and not recording
      if (progress >= 1 && isPlaying && !isRecording) {
        setCurrentIndex((prev) => (prev + 1) % items.length);
        slideStartTimeRef.current = Date.now();
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const currentItem = items[currentIndex];
      const nextItem = items[(currentIndex + 1) % items.length];

      const currentImg = loadedImagesRef.current.get(currentItem?.id);
      const nextImg = loadedImagesRef.current.get(nextItem?.id);

      // Ken Burns motion parameters based on slide index
      const isEven = currentIndex % 2 === 0;
      const zoomStart = isEven ? 1.0 : 1.15;
      const zoomEnd = isEven ? 1.15 : 1.0;
      const currentScale = zoomStart + (zoomEnd - zoomStart) * progress;

      const panXStart = isEven ? -20 : 20;
      const panXEnd = isEven ? 20 : -20;
      const currentPanX = panXStart + (panXEnd - panXStart) * progress;

      // Draw current photo with Ken Burns transform
      if (currentImg && currentImg.complete && currentImg.naturalWidth > 0) {
        ctx.save();
        ctx.translate(canvas.width / 2 + currentPanX, canvas.height / 2);
        ctx.scale(currentScale, currentScale);

        // Aspect ratio cover calculation
        const imgAspect = currentImg.naturalWidth / currentImg.naturalHeight;
        const canvasAspect = canvas.width / canvas.height;
        let drawW = canvas.width;
        let drawH = canvas.height;

        if (imgAspect > canvasAspect) {
          drawW = canvas.height * imgAspect;
        } else {
          drawH = canvas.width / imgAspect;
        }

        ctx.drawImage(currentImg, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }

      // Crossfade transition to next photo on last 25% of slide duration
      const fadeStart = 0.75;
      if (progress > fadeStart && nextImg && nextImg.complete && nextImg.naturalWidth > 0) {
        const fadeAlpha = (progress - fadeStart) / (1 - fadeStart);
        ctx.save();
        ctx.globalAlpha = fadeAlpha;
        ctx.translate(canvas.width / 2, canvas.height / 2);

        const imgAspect = nextImg.naturalWidth / nextImg.naturalHeight;
        const canvasAspect = canvas.width / canvas.height;
        let drawW = canvas.width;
        let drawH = canvas.height;
        if (imgAspect > canvasAspect) {
          drawW = canvas.height * imgAspect;
        } else {
          drawH = canvas.width / imgAspect;
        }
        ctx.drawImage(nextImg, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }

      // Cinematic Vignette
      ctx.save();
      const vignette = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        canvas.height * 0.45,
        canvas.width / 2,
        canvas.height / 2,
        canvas.height * 0.95
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Cinematic Opening Title Card (on first photo, first 65% of slide)
      if (currentIndex === 0 && progress < 0.65) {
        const titleAlpha = Math.sin((progress / 0.65) * Math.PI);
        ctx.save();
        ctx.globalAlpha = titleAlpha;
        ctx.textAlign = 'center';

        // Title
        ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 24;
        ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 20);

        // Subtitle
        if (subtitle) {
          ctx.font = '400 32px system-ui, -apple-system, sans-serif';
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 45);
        }
        ctx.restore();
      }

      // Bottom Photo Info Pill
      if (currentItem && (currentIndex > 0 || progress >= 0.65)) {
        ctx.save();
        const dateStr = currentItem.captured_at
          ? new Date(currentItem.captured_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : null;
        const locStr = currentItem.location_name;

        if (dateStr || locStr) {
          const infoText = [locStr, dateStr].filter(Boolean).join(' • ');
          ctx.font = '500 24px system-ui, -apple-system, sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 12;
          ctx.textAlign = 'left';
          ctx.fillText(infoText, 60, canvas.height - 60);
        }
        ctx.restore();
      }

      if (isPlaying || isRecording) {
        animFrameRef.current = requestAnimationFrame(renderFrame);
      }
    };

    animFrameRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, items, currentIndex, isPlaying, slideDuration, title, subtitle, isRecording]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key.toLowerCase() === 'm') {
        setIsAudioEnabled((a) => !a);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
    slideStartTimeRef.current = Date.now();
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    slideStartTimeRef.current = Date.now();
  };

  // High-Definition Video Recording (MediaRecorder API)
  const handleStartExport = async (saveToLibrary: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas || isRecording) return;

    try {
      setIsRecording(true);
      setRecordingProgress(0);
      setIsPlaying(true);
      setCurrentIndex(0);
      slideStartTimeRef.current = Date.now();

      const stream = canvas.captureStream(30); // 30 fps
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 6000000, // 6 Mbps HD
      });

      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      const totalDurationMs = items.length * slideDuration;
      const startTime = Date.now();

      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(99, Math.round((elapsed / totalDurationMs) * 100));
        setRecordingProgress(pct);

        // Progress slide manually during recording
        const expectedSlide = Math.min(items.length - 1, Math.floor(elapsed / slideDuration));
        if (expectedSlide !== currentIndex) {
          setCurrentIndex(expectedSlide);
          slideStartTimeRef.current = Date.now();
        }
      }, 200);

      recorder.onstop = async () => {
        clearInterval(progressInterval);
        setIsRecording(false);
        setRecordingProgress(100);

        const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });

        if (saveToLibrary) {
          setIsSaving(true);
          try {
            // Convert to base64
            const reader = new FileReader();
            reader.readAsDataURL(videoBlob);
            reader.onloadend = async () => {
              const base64data = reader.result as string;
              const payload = {
                video_base64: base64data,
                title,
                source_media_ids: items.map((i) => i.id),
                duration_seconds: totalDurationMs / 1000,
              };

              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (token) headers['Authorization'] = `Bearer ${token}`;

              const res = await fetch(`${API_URL}/api/v1/media/save-highlight-reel`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
              });

              if (res.ok) {
                setSaveSuccessMsg('Highlight Reel saved to your library!');
                setTimeout(() => setSaveSuccessMsg(null), 4000);
              } else {
                alert('Failed to save highlight reel to library.');
              }
              setIsSaving(false);
            };
          } catch (e) {
            console.error('Save to library error:', e);
            setIsSaving(false);
          }
        } else {
          // Direct Download
          const url = URL.createObjectURL(videoBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${title.replace(/\s+/g, '_')}_Highlight_Reel.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      };

      recorder.start();

      // Stop recorder after full reel duration
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, totalDurationMs + 500);
    } catch (e: any) {
      alert(`Video recording error: ${e.message}`);
      setIsRecording(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fadeIn select-none">
      {/* Top Header Floating Controls */}
      <header className="absolute top-4 inset-x-6 flex items-center justify-between z-30 pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black text-white tracking-tight">{title}</h2>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                Reel Studio
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              {items.length} moments in motion • Ken Burns cinematic animation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccessMsg && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-semibold animate-fadeIn">
              <Check className="w-3.5 h-3.5" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* Audio Soundtrack Toggle */}
          <button
            type="button"
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            className={`p-2 rounded-xl transition cursor-pointer border ${
              isAudioEnabled
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30'
                : 'bg-black/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title={isAudioEnabled ? 'Mute Soundtrack (M)' : 'Play Ambient Melody (M)'}
          >
            {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Speed Selector */}
          <select
            value={slideDuration}
            onChange={(e) => setSlideDuration(Number(e.target.value))}
            className="bg-black/60 text-slate-300 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none hover:text-white transition"
          >
            <option value={2500}>Fast (2.5s)</option>
            <option value={3500}>Balanced (3.5s)</option>
            <option value={5000}>Cinematic (5.0s)</option>
          </select>

          {/* Download Video */}
          <button
            type="button"
            onClick={() => handleStartExport(false)}
            disabled={isRecording || isSaving}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer disabled:opacity-50"
            title="Export Reel as WebM Video"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Video</span>
          </button>

          {/* Save to Library */}
          <button
            type="button"
            onClick={() => handleStartExport(true)}
            disabled={isRecording || isSaving}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
          >
            {isSaving || isRecording ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save to Library</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-black/60 text-slate-400 hover:text-white hover:bg-black/90 transition border border-slate-800 ml-1 cursor-pointer"
            title="Close Reel [Esc]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Cinematic Video Canvas */}
      <div className="relative w-full max-w-6xl max-h-[85vh] aspect-[16/9] flex items-center justify-center overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-black">
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
        />

        {/* Recording Progress Overlay */}
        {isRecording && (
          <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
            <h3 className="text-base font-bold text-white">Rendering High-Def Highlight Reel...</h3>
            <p className="text-xs text-slate-300">Recording frames at 30fps with audio track</p>
            <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-200" 
                style={{ width: `${recordingProgress}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-indigo-300">{recordingProgress}%</span>
          </div>
        )}

        {/* Navigation Chevron Buttons */}
        <button
          onClick={handlePrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 opacity-0 hover:opacity-100 transition-opacity duration-200 cursor-pointer"
          title="Previous Photo"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={handleNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 opacity-0 hover:opacity-100 transition-opacity duration-200 cursor-pointer"
          title="Next Photo"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Floating Control Dock */}
      <footer className="absolute bottom-6 inset-x-0 flex flex-col items-center gap-3 z-30 pointer-events-auto px-6">
        {/* Timeline Progress Indicators */}
        <div className="flex items-center gap-1.5 w-full max-w-2xl px-4">
          {items.map((_, idx) => (
            <div
              key={idx}
              onClick={() => {
                setCurrentIndex(idx);
                slideStartTimeRef.current = Date.now();
              }}
              className={`h-1.5 flex-1 rounded-full cursor-pointer transition-all duration-300 ${
                idx === currentIndex
                  ? 'bg-indigo-500 shadow-md shadow-indigo-500/50 scale-y-125'
                  : idx < currentIndex
                  ? 'bg-slate-500'
                  : 'bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Playback Controls Pill */}
        <div className="flex items-center gap-4 bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 px-5 py-2.5 rounded-full shadow-2xl text-white">
          <button
            onClick={handlePrev}
            className="p-1 text-slate-300 hover:text-white transition"
            title="Previous [Left Arrow]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-9 h-9 rounded-full bg-white text-slate-950 flex items-center justify-center hover:scale-105 transition shadow-lg cursor-pointer font-bold"
            title={isPlaying ? 'Pause [Space]' : 'Play [Space]'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950 ml-0.5" />}
          </button>

          <button
            onClick={handleNext}
            className="p-1 text-slate-300 hover:text-white transition"
            title="Next [Right Arrow]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          <span className="text-xs font-mono font-medium text-slate-300">
            {currentIndex + 1} / {items.length}
          </span>
        </div>
      </footer>
    </div>
  );
}
