'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  X, 
  Download, 
  Save, 
  Sparkles, 
  Sliders, 
  RotateCw, 
  RotateCcw, 
  FlipHorizontal, 
  FlipVertical, 
  Crop, 
  Sun, 
  Palette, 
  Check, 
  Loader2, 
  Undo2, 
  Split, 
  Eye, 
  Wand2, 
  Contrast, 
  Flame, 
  Maximize2
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';

interface Adjustments {
  exposure: number;     // -100 to 100
  contrast: number;     // -100 to 100
  highlights: number;   // -100 to 100
  shadows: number;      // -100 to 100
  warmth: number;       // -100 to 100 (blue to amber)
  tint: number;         // -100 to 100 (green to magenta)
  saturation: number;   // -100 to 100
  vibrance: number;     // -100 to 100
  sharpness: number;    // 0 to 100
  vignette: number;     // 0 to 100
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  warmth: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  sharpness: 0,
  vignette: 0,
};

interface Preset {
  id: string;
  name: string;
  badge: string;
  adjustments: Partial<Adjustments>;
}

const PRESETS: Preset[] = [
  {
    id: 'original',
    name: 'Original',
    badge: 'Clean',
    adjustments: { ...DEFAULT_ADJUSTMENTS },
  },
  {
    id: 'vivid',
    name: 'Vivid Pop',
    badge: 'Punchy',
    adjustments: {
      exposure: 5,
      contrast: 22,
      saturation: 25,
      vibrance: 18,
      sharpness: 25,
      highlights: -5,
      shadows: 10,
    },
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    badge: 'Warm',
    adjustments: {
      exposure: 8,
      warmth: 35,
      contrast: 12,
      shadows: 18,
      saturation: 12,
      vignette: 15,
    },
  },
  {
    id: 'noir',
    name: 'Noir Film',
    badge: 'B&W',
    adjustments: {
      saturation: -100,
      contrast: 38,
      exposure: -4,
      highlights: 10,
      shadows: -15,
      vignette: 28,
      sharpness: 20,
    },
  },
  {
    id: 'vintage',
    name: 'Vintage Film',
    badge: 'Retro',
    adjustments: {
      exposure: 4,
      contrast: -8,
      shadows: 26,
      warmth: 20,
      tint: 8,
      saturation: -12,
      vignette: 22,
    },
  },
  {
    id: 'cinematic',
    name: 'Cinematic Slate',
    badge: 'Teal & Orange',
    adjustments: {
      exposure: 2,
      contrast: 20,
      warmth: 15,
      tint: -10,
      saturation: 15,
      vignette: 20,
    },
  },
  {
    id: 'moody',
    name: 'Moody Forest',
    badge: 'Atmospheric',
    adjustments: {
      exposure: -8,
      contrast: 18,
      warmth: -18,
      tint: -12,
      shadows: -12,
      vignette: 32,
    },
  },
];

type CropAspect = 'original' | '1:1' | '4:5' | '16:9' | '9:16' | '4:3' | '3:2';

function EditStudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [photo, setPhoto] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'presets' | 'light' | 'color' | 'crop' | 'effects'>('presets');
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [activePreset, setActivePreset] = useState<string>('original');

  // Geometry & Crop state
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<CropAspect>('original');

  // Comparison state
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [isSplitView, setIsSplitView] = useState<boolean>(false);
  const [splitPosition, setSplitPosition] = useState<number>(50); // 0 to 100 percentage

  // Saving / Exporting
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingSplit = useRef<boolean>(false);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;

  // 1. Fetch photo by ID
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) {
      setLoading(false);
      return;
    }

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${API_URL}/api/v1/media?ids=${id}`, { headers })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (data.items && data.items.length > 0) {
          const item = data.items[0];
          setPhoto(item);

          // Restore existing recipe if present
          if (item.edit_recipe) {
            try {
              const recipe = typeof item.edit_recipe === 'string' ? JSON.parse(item.edit_recipe) : item.edit_recipe;
              if (recipe.adjustments) setAdjustments({ ...DEFAULT_ADJUSTMENTS, ...recipe.adjustments });
              if (recipe.activePreset) setActivePreset(recipe.activePreset);
              if (recipe.rotation) setRotation(recipe.rotation);
              if (recipe.flipH) setFlipH(recipe.flipH);
              if (recipe.flipV) setFlipV(recipe.flipV);
              if (recipe.aspectRatio) setAspectRatio(recipe.aspectRatio);
            } catch (e) {
              console.error('Failed to parse saved edit recipe:', e);
            }
          }
        }
      })
      .catch((err) => console.error('Failed to fetch media for editor:', err))
      .finally(() => setLoading(false));
  }, [API_URL, searchParams, token]);

  // 2. Pre-load image
  useEffect(() => {
    if (!photo) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `${API_URL}/api/v1/media/${photo.id}/view${token ? `?token=${token}` : ''}`;
    img.onload = () => {
      loadedImageRef.current = img;
      renderCanvas();
    };
  }, [photo, API_URL, token]);

  // 3. Re-render canvas whenever adjustments or geometry change
  useEffect(() => {
    renderCanvas();
  }, [adjustments, rotation, flipH, flipV, aspectRatio, isComparing]);

  // Keyboard navigation [Esc] to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        router.back();
      } else if (e.key === 'r' && (e.metaKey || e.ctrlKey)) {
        // Reset
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  // Canvas Rendering with Parametric Adjustments
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Determine target dimensions
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    // Handle Crop Aspect Ratio
    let targetW = imgW;
    let targetH = imgH;
    let sourceX = 0;
    let sourceY = 0;
    let sourceW = imgW;
    let sourceH = imgH;

    if (aspectRatio === '1:1') {
      const size = Math.min(imgW, imgH);
      sourceX = (imgW - size) / 2;
      sourceY = (imgH - size) / 2;
      sourceW = size;
      sourceH = size;
      targetW = size;
      targetH = size;
    } else if (aspectRatio === '4:5') {
      const targetAspect = 4 / 5;
      if (imgW / imgH > targetAspect) {
        sourceW = imgH * targetAspect;
        sourceX = (imgW - sourceW) / 2;
      } else {
        sourceH = imgW / targetAspect;
        sourceY = (imgH - sourceH) / 2;
      }
      targetW = sourceW;
      targetH = sourceH;
    } else if (aspectRatio === '16:9') {
      const targetAspect = 16 / 9;
      if (imgW / imgH > targetAspect) {
        sourceW = imgH * targetAspect;
        sourceX = (imgW - sourceW) / 2;
      } else {
        sourceH = imgW / targetAspect;
        sourceY = (imgH - sourceH) / 2;
      }
      targetW = sourceW;
      targetH = sourceH;
    } else if (aspectRatio === '9:16') {
      const targetAspect = 9 / 16;
      if (imgW / imgH > targetAspect) {
        sourceW = imgH * targetAspect;
        sourceX = (imgW - sourceW) / 2;
      } else {
        sourceH = imgW / targetAspect;
        sourceY = (imgH - sourceH) / 2;
      }
      targetW = sourceW;
      targetH = sourceH;
    } else if (aspectRatio === '4:3') {
      const targetAspect = 4 / 3;
      if (imgW / imgH > targetAspect) {
        sourceW = imgH * targetAspect;
        sourceX = (imgW - sourceW) / 2;
      } else {
        sourceH = imgW / targetAspect;
        sourceY = (imgH - sourceH) / 2;
      }
      targetW = sourceW;
      targetH = sourceH;
    } else if (aspectRatio === '3:2') {
      const targetAspect = 3 / 2;
      if (imgW / imgH > targetAspect) {
        sourceW = imgH * targetAspect;
        sourceX = (imgW - sourceW) / 2;
      } else {
        sourceH = imgW / targetAspect;
        sourceY = (imgH - sourceH) / 2;
      }
      targetW = sourceW;
      targetH = sourceH;
    }

    const isRotated = rotation === 90 || rotation === 270;
    canvas.width = isRotated ? targetH : targetW;
    canvas.height = isRotated ? targetW : targetH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Rotate & Flip Transform
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    // Apply Filter Matrix if not comparing
    if (!isComparing) {
      // CSS canvas filter: brightness, contrast, saturate, hue-rotate
      const brightnessVal = 100 + adjustments.exposure;
      const contrastVal = 100 + adjustments.contrast;
      const saturateVal = Math.max(0, 100 + adjustments.saturation + adjustments.vibrance * 0.5);
      const hueRotateVal = adjustments.tint * 0.5; // slight tint hue angle shift

      ctx.filter = `brightness(${brightnessVal}%) contrast(${contrastVal}%) saturate(${saturateVal}%) hue-rotate(${hueRotateVal}deg)`;
    } else {
      ctx.filter = 'none';
    }

    // Draw base cropped image
    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      -targetW / 2,
      -targetH / 2,
      targetW,
      targetH
    );

    // Color Warmth / Temperature Overlay (Amber / Blue tone)
    if (!isComparing && adjustments.warmth !== 0) {
      ctx.restore();
      ctx.save();
      if (adjustments.warmth > 0) {
        // Amber warm
        ctx.fillStyle = `rgba(255, 170, 50, ${(adjustments.warmth / 100) * 0.22})`;
      } else {
        // Cool blue
        ctx.fillStyle = `rgba(50, 150, 255, ${(-adjustments.warmth / 100) * 0.22})`;
      }
      ctx.globalCompositeOperation = 'color';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Vignette Effect
    if (!isComparing && adjustments.vignette > 0) {
      ctx.restore();
      ctx.save();
      const radius = Math.max(canvas.width, canvas.height) / 2;
      const gradient = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        radius * 0.5,
        canvas.width / 2,
        canvas.height / 2,
        radius
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${(adjustments.vignette / 100) * 0.75})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.restore();
  };

  const handleReset = () => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setActivePreset('original');
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAspectRatio('original');
  };

  const handleApplyPreset = (preset: Preset) => {
    setActivePreset(preset.id);
    setAdjustments({
      ...DEFAULT_ADJUSTMENTS,
      ...preset.adjustments,
    });
  };

  const updateAdjustment = (key: keyof Adjustments, value: number) => {
    setAdjustments((prev) => ({
      ...prev,
      [key]: value,
    }));
    setActivePreset('custom');
  };

  // High-Resolution Export / Save
  const handleSave = async (saveAsNew: boolean) => {
    if (!photo || !canvasRef.current) return;
    setIsSaving(true);
    setSaveSuccessMsg(null);

    try {
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.95);
      const payload = {
        image_base64: dataUrl,
        save_as_new: saveAsNew,
        recipe: {
          adjustments,
          activePreset,
          rotation,
          flipH,
          flipV,
          aspectRatio,
        },
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/media/${photo.id}/save-edit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save edited photo');
      }

      const result = await res.json();
      setSaveSuccessMsg(
        saveAsNew
          ? 'Saved as a new photo in your library!'
          : 'Successfully updated photo recipe!'
      );
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Error saving photo: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current || !photo) return;
    setIsExporting(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.95);
      const a = document.createElement('a');
      const stem = photo.filename.replace(/\.[^/.]+$/, '');
      a.download = `${stem}_edited.jpg`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setIsExporting(false);
    }
  };

  // Split view dragging
  const handleSplitMouseDown = (e: React.MouseEvent) => {
    isDraggingSplit.current = true;
  };

  const handleSplitMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingSplit.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSplitPosition((x / rect.width) * 100);
  };

  const handleSplitMouseUp = () => {
    isDraggingSplit.current = false;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white select-none overflow-hidden"
      onMouseMove={handleSplitMouseMove}
      onMouseUp={handleSplitMouseUp}
    >
      {/* Top Application Bar */}
      <header className="h-14 border-b border-slate-800/80 bg-slate-900/95 px-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition border border-slate-700/60"
            title="Exit Studio [Esc]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Photo Editing Studio</h1>
              {photo && (
                <p className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                  {photo.filename}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Center Comparison Bar */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onMouseDown={() => setIsComparing(true)}
            onMouseUp={() => setIsComparing(false)}
            onTouchStart={() => setIsComparing(true)}
            onTouchEnd={() => setIsComparing(false)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              isComparing
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Hold down to compare with original"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Hold to Compare</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSplitView(!isSplitView)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
              isSplitView
                ? 'bg-indigo-600 text-white font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Split Before / After Screen"
          >
            <Split className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Split</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            title="Reset All Adjustments"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {saveSuccessMsg && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-medium animate-fadeIn">
              <Check className="w-3.5 h-3.5" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting || loading}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer disabled:opacity-50"
            title="Download high-resolution image"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={isSaving || loading}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save as New</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Central Canvas Viewport */}
        <div className="flex-1 flex items-center justify-center p-4 bg-slate-950/95 overflow-hidden relative">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-xs">Loading studio high-res canvas...</p>
            </div>
          )}

          {!loading && !photo && (
            <div className="text-center text-slate-400">
              <p>No photo found to edit.</p>
              <button
                onClick={() => router.back()}
                className="mt-3 px-4 py-2 bg-slate-800 rounded-xl text-xs font-semibold text-white"
              >
                Return to Gallery
              </button>
            </div>
          )}

          {!loading && photo && (
            <div 
              ref={splitContainerRef}
              className="relative max-h-full max-w-full flex items-center justify-center shadow-2xl rounded-xl overflow-hidden border border-slate-800/80 bg-slate-900"
            >
              {/* Main Edited Canvas */}
              <canvas
                ref={canvasRef}
                className="max-h-[78vh] max-w-[85vw] object-contain transition-all duration-150"
              />

              {/* Split View Overlay (Original Image Slice on Left) */}
              {isSplitView && loadedImageRef.current && (
                <>
                  <div
                    className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none border-r-2 border-indigo-400 shadow-2xl"
                    style={{ width: `${splitPosition}%` }}
                  >
                    <img
                      src={`${API_URL}/api/v1/media/${photo.id}/view${token ? `?token=${token}` : ''}`}
                      alt="Original"
                      className="max-h-[78vh] max-w-[85vw] object-contain"
                      style={{
                        transform: `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
                      }}
                    />
                    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-amber-400 uppercase tracking-widest border border-white/10">
                      Before
                    </div>
                  </div>

                  {/* Drag Handle */}
                  <div
                    onMouseDown={handleSplitMouseDown}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-indigo-600 text-white shadow-xl border-2 border-white flex items-center justify-center cursor-ew-resize z-20 hover:scale-110 transition-transform"
                    style={{ left: `${splitPosition}%` }}
                  >
                    <Split className="w-4 h-4" />
                  </div>

                  <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-indigo-400 uppercase tracking-widest border border-white/10">
                    After
                  </div>
                </>
              )}

              {/* Comparing Indicator Badge */}
              {isComparing && (
                <div className="absolute top-4 left-4 bg-amber-500 text-slate-950 font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider shadow-xl animate-pulse">
                  Viewing Original
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Editing Tools Sidebar */}
        <aside className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-900/90 backdrop-blur-md flex flex-col shrink-0 z-20 h-auto md:h-full max-h-[45vh] md:max-h-full">
          {/* Navigation Category Tabs */}
          <div className="flex items-center justify-between px-3 border-b border-slate-800/80 bg-slate-900/50">
            <button
              onClick={() => setActiveTab('presets')}
              className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'presets'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Presets</span>
            </button>
            <button
              onClick={() => setActiveTab('light')}
              className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'light'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
            <button
              onClick={() => setActiveTab('color')}
              className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'color'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Color</span>
            </button>
            <button
              onClick={() => setActiveTab('crop')}
              className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'crop'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span>Crop & Flip</span>
            </button>
            <button
              onClick={() => setActiveTab('effects')}
              className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'effects'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Effects</span>
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* 1. Presets Tab */}
            {activeTab === 'presets' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Curated Color Styles
                  </h3>
                  <span className="text-[11px] text-slate-500">1-Click Apply</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleApplyPreset(p)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between h-20 ${
                        activePreset === p.id
                          ? 'bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/30'
                          : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{p.name}</span>
                        {activePreset === p.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 rounded-full bg-black/40 w-fit">
                        {p.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Light & Tone Tab */}
            {activeTab === 'light' && (
              <div className="space-y-5">
                <SliderControl
                  label="Exposure"
                  value={adjustments.exposure}
                  min={-100}
                  max={100}
                  onChange={(v) => updateAdjustment('exposure', v)}
                />
                <SliderControl
                  label="Contrast"
                  value={adjustments.contrast}
                  min={-100}
                  max={100}
                  onChange={(v) => updateAdjustment('contrast', v)}
                />
                <SliderControl
                  label="Highlights"
                  value={adjustments.highlights}
                  min={-100}
                  max={100}
                  onChange={(v) => updateAdjustment('highlights', v)}
                />
                <SliderControl
                  label="Shadows"
                  value={adjustments.shadows}
                  min={-100}
                  max={100}
                  onChange={(v) => updateAdjustment('shadows', v)}
                />
              </div>
            )}

            {/* 3. Color Tab */}
            {activeTab === 'color' && (
              <div className="space-y-5">
                <SliderControl
                  label="Temperature (Warmth)"
                  value={adjustments.warmth}
                  min={-100}
                  max={100}
                  onChange={(v) => updateAdjustment('warmth', v)}
                  subtext={adjustments.warmth > 0 ? 'Amber Warm' : adjustments.warmth < 0 ? 'Cool Blue' : 'Neutral'}
                />
                <SliderControl
                  label="Tint"
                  value={adjustments.tint}
                  min={-100}
                  max={100}
                  onChange={(v) => updateAdjustment('tint', v)}
                  subtext={adjustments.tint > 0 ? 'Magenta' : adjustments.tint < 0 ? 'Green' : 'Neutral'}
                />
                <SliderControl
                  label="Saturation"
                  value={adjustments.saturation}
                  min={-100}
                  max={100}
                  onChange={(v) => updateAdjustment('saturation', v)}
                />
                <SliderControl
                  label="Vibrance"
                  value={adjustments.vibrance}
                  min={-100}
                  max={100}
                  onChange={(v) => updateAdjustment('vibrance', v)}
                />
              </div>
            )}

            {/* 4. Crop & Geometry Tab */}
            {activeTab === 'crop' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Rotate & Flip
                  </h4>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setRotation((prev) => (prev - 90 + 360) % 360)}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex flex-col items-center gap-1 text-[11px] font-semibold transition"
                      title="Rotate 90° CCW"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>-90°</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotation((prev) => (prev + 90) % 360)}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex flex-col items-center gap-1 text-[11px] font-semibold transition"
                      title="Rotate 90° CW"
                    >
                      <RotateCw className="w-4 h-4" />
                      <span>+90°</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlipH(!flipH)}
                      className={`p-2.5 rounded-xl flex flex-col items-center gap-1 text-[11px] font-semibold transition ${
                        flipH
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                      }`}
                      title="Flip Horizontal (Mirror)"
                    >
                      <FlipHorizontal className="w-4 h-4" />
                      <span>Flip H</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlipV(!flipV)}
                      className={`p-2.5 rounded-xl flex flex-col items-center gap-1 text-[11px] font-semibold transition ${
                        flipV
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                      }`}
                      title="Flip Vertical"
                    >
                      <FlipVertical className="w-4 h-4" />
                      <span>Flip V</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Aspect Ratio Crop
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'original', label: 'Original' },
                      { id: '1:1', label: '1:1 Square' },
                      { id: '4:5', label: '4:5 Portrait' },
                      { id: '16:9', label: '16:9 Cinema' },
                      { id: '9:16', label: '9:16 Story' },
                      { id: '4:3', label: '4:3 Classic' },
                      { id: '3:2', label: '3:2 Print' },
                    ].map((asp) => (
                      <button
                        key={asp.id}
                        type="button"
                        onClick={() => setAspectRatio(asp.id as CropAspect)}
                        className={`p-2 rounded-xl text-xs font-semibold transition text-center ${
                          aspectRatio === asp.id
                            ? 'bg-indigo-600 text-white shadow'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        {asp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 5. Effects Tab */}
            {activeTab === 'effects' && (
              <div className="space-y-5">
                <SliderControl
                  label="Vignette"
                  value={adjustments.vignette}
                  min={0}
                  max={100}
                  onChange={(v) => updateAdjustment('vignette', v)}
                  subtext={adjustments.vignette > 0 ? `${adjustments.vignette}% dark edge falloff` : 'Off'}
                />
                <SliderControl
                  label="Clarity & Sharpness"
                  value={adjustments.sharpness}
                  min={0}
                  max={100}
                  onChange={(v) => updateAdjustment('sharpness', v)}
                  subtext={adjustments.sharpness > 0 ? `${adjustments.sharpness}% crispness` : 'Off'}
                />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  subtext?: string;
}

function SliderControl({ label, value, min, max, onChange, subtext }: SliderControlProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-200">{label}</span>
        <div className="flex items-center gap-1.5">
          {subtext && <span className="text-[10px] text-slate-400 font-medium">{subtext}</span>}
          <span className="font-mono text-[11px] font-bold text-indigo-400 w-8 text-right">
            {value > 0 ? `+${value}` : value}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
      />
    </div>
  );
}

export default function EditPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-slate-950 flex items-center justify-center text-white">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      }
    >
      <EditStudioContent />
    </Suspense>
  );
}
