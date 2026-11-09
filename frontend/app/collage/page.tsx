'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getApiUrl } from '@/utils/apiUrl';
import { 
  ArrowLeft, 
  X, 
  Download, 
  Save, 
  Sparkles, 
  Layout, 
  Grid, 
  Check, 
  Loader2, 
  Palette,
  ArrowRightLeft,
  RotateCcw,
  Sliders,
  Image as ImageIcon,
  Minimize2
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';

type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '3:2' | '2:3';
type LayoutStyle = 'grid' | 'split' | 'hero' | 'polaroid' | 'triptych';

interface ColorPreset {
  label: string;
  color: string;
}

const BG_PRESETS: ColorPreset[] = [
  { label: 'White', color: '#ffffff' },
  { label: 'Studio Dark', color: '#111827' },
  { label: 'Warm Cream', color: '#fef3c7' },
  { label: 'Soft Slate', color: '#1e293b' },
  { label: 'Pastel Blush', color: '#fce7f3' },
  { label: 'Midnight', color: '#0b1120' },
];

function CollageStudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const API_URL = getApiUrl();

  const [photos, setPhotos] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [layoutStyle, setLayoutStyle] = useState<LayoutStyle>('grid');
  const [gap, setGap] = useState<number>(12);
  const [padding, setPadding] = useState<number>(16);
  const [borderRadius, setBorderRadius] = useState<number>(12);
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [useBlurBg, setUseBlurBg] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;

  // Fetch photos by IDs from URL query params
  useEffect(() => {
    const rawIds = searchParams.get('ids');
    if (!rawIds) {
      setLoading(false);
      return;
    }

    const idList = rawIds.split(',').map(s => s.trim()).filter(Boolean);
    if (idList.length === 0) {
      setLoading(false);
      return;
    }

    const fetchPhotos = async () => {
      try {
        setLoading(true);
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/api/v1/media?ids=${idList.join(',')}&limit=50`, { headers });
        if (res.ok) {
          const data = await res.json();
          const items: MediaItem[] = data.items || [];
          // Preserve requested order
          const sorted = idList
            .map(id => items.find(it => it.id === parseInt(id)))
            .filter((it): it is MediaItem => Boolean(it));

          setPhotos(sorted.length > 0 ? sorted : items);

          // Intelligent layout default
          if (sorted.length === 2) {
            setLayoutStyle('split');
            setAspectRatio('1:1');
          } else if (sorted.length === 3) {
            setLayoutStyle('triptych');
            setAspectRatio('16:9');
          } else {
            setLayoutStyle('grid');
            setAspectRatio('1:1');
          }
        }
      } catch (e) {
        console.error('Failed to fetch collage photos:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, [searchParams, API_URL, token]);

  // Back / Exit handler with Escape key
  const handleBack = () => {
    if (typeof window !== 'undefined') {
      if (window.opener && !window.opener.closed) {
        try {
          window.close();
          return;
        } catch (_) {}
      }
      router.push('/');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getPhotoUrl = (item: MediaItem) => {
    return `${API_URL}/api/v1/media/${item.id}/thumbnail?size=1080${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  };

  const handleSwapSlots = (indexA: number, indexB: number) => {
    const copy = [...photos];
    const temp = copy[indexA];
    copy[indexA] = copy[indexB];
    copy[indexB] = temp;
    setPhotos(copy);
    setSelectedSlot(null);
  };

  const handleSlotClick = (index: number) => {
    if (selectedSlot === null) {
      setSelectedSlot(index);
    } else if (selectedSlot === index) {
      setSelectedSlot(null);
    } else {
      handleSwapSlots(selectedSlot, index);
    }
  };

  const handleRemovePhoto = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (photos.length <= 2) {
      alert('A collage requires at least 2 photos.');
      return;
    }
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    setSelectedSlot(null);
  };

  // Aspect ratio to CSS value
  const getAspectRatioCss = (ratio: AspectRatio): string => {
    switch (ratio) {
      case '1:1': return '1 / 1';
      case '4:5': return '4 / 5';
      case '9:16': return '9 / 16';
      case '16:9': return '16 / 9';
      case '3:2': return '3 / 2';
      case '2:3': return '2 / 3';
      default: return '1 / 1';
    }
  };

  // Dimensions of canvas output based on aspect ratio
  const getOutputDimensions = (): { width: number; height: number } => {
    const base = 2160;
    switch (aspectRatio) {
      case '1:1': return { width: base, height: base };
      case '4:5': return { width: base, height: Math.round(base * 1.25) };
      case '9:16': return { width: base, height: Math.round(base * (16 / 9)) };
      case '16:9': return { width: Math.round(base * (16 / 9)), height: base };
      case '3:2': return { width: Math.round(base * 1.5), height: base };
      case '2:3': return { width: base, height: Math.round(base * 1.5) };
      default: return { width: base, height: base };
    }
  };

  const loadHtmlImage = async (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      fetch(url)
        .then(res => res.blob())
        .then(blob => {
          const img = new Image();
          const objUrl = URL.createObjectURL(blob);
          img.onload = () => {
            URL.revokeObjectURL(objUrl);
            resolve(img);
          };
          img.onerror = (e) => {
            URL.revokeObjectURL(objUrl);
            reject(e);
          };
          img.src = objUrl;
        })
        .catch(reject);
    });
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number
  ) => {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const drawCoverImage = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    const imgRatio = img.width / img.height;
    const targetRatio = w / h;

    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (imgRatio > targetRatio) {
      sw = img.height * targetRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / targetRatio;
      sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  };

  interface Slot {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  const calculateSlots = (
    style: LayoutStyle,
    count: number,
    startX: number,
    startY: number,
    totalW: number,
    totalH: number,
    gapPx: number
  ): Slot[] => {
    const slots: Slot[] = [];

    if (style === 'split' && count === 2) {
      const w = (totalW - gapPx) / 2;
      slots.push({ x: startX, y: startY, w, h: totalH });
      slots.push({ x: startX + w + gapPx, y: startY, w, h: totalH });
      return slots;
    }

    if (style === 'triptych' && count >= 3) {
      const w = (totalW - gapPx * 2) / 3;
      for (let i = 0; i < 3; i++) {
        slots.push({ x: startX + i * (w + gapPx), y: startY, w, h: totalH });
      }
      return slots;
    }

    if (style === 'hero' && count >= 3) {
      const heroW = (totalW - gapPx) * 0.6;
      const sideW = totalW - gapPx - heroW;
      slots.push({ x: startX, y: startY, w: heroW, h: totalH });

      const sideCount = count - 1;
      const slotH = (totalH - gapPx * (sideCount - 1)) / sideCount;
      for (let i = 0; i < sideCount; i++) {
        slots.push({
          x: startX + heroW + gapPx,
          y: startY + i * (slotH + gapPx),
          w: sideW,
          h: slotH
        });
      }
      return slots;
    }

    // Default: Uniform Grid
    let cols = Math.ceil(Math.sqrt(count));
    let rows = Math.ceil(count / cols);

    if (count === 2) { cols = 2; rows = 1; }
    else if (count === 3) { cols = 3; rows = 1; }
    else if (count === 4) { cols = 2; rows = 2; }
    else if (count === 5 || count === 6) { cols = 3; rows = 2; }
    else if (count >= 7) { cols = 3; rows = 3; }

    const slotW = (totalW - gapPx * (cols - 1)) / cols;
    const slotH = (totalH - gapPx * (rows - 1)) / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (slots.length >= count) break;
        slots.push({
          x: startX + c * (slotW + gapPx),
          y: startY + r * (slotH + gapPx),
          w: slotW,
          h: slotH
        });
      }
    }

    return slots;
  };

  const renderCollageToCanvas = async (): Promise<HTMLCanvasElement> => {
    const { width: outW, height: outH } = getOutputDimensions();
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    // 1. Draw Background
    if (useBlurBg && photos[0]) {
      try {
        const bgImg = await loadHtmlImage(getPhotoUrl(photos[0]));
        ctx.save();
        ctx.filter = 'blur(60px) brightness(0.7)';
        ctx.drawImage(bgImg, -100, -100, outW + 200, outH + 200);
        ctx.restore();
      } catch {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, outW, outH);
      }
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, outW, outH);
    }

    const scale = outW / 600;
    const pad = padding * scale;
    const g = gap * scale;
    const r = borderRadius * scale;

    const innerW = outW - pad * 2;
    const innerH = outH - pad * 2;

    const loadedImgs = await Promise.all(
      photos.map(p => loadHtmlImage(getPhotoUrl(p)))
    );

    const n = photos.length;

    if (layoutStyle === 'polaroid') {
      const polaroidW = innerW * 0.58;
      const polaroidH = polaroidW * 1.22;
      const polaroidPadding = polaroidW * 0.06;
      const polaroidBottom = polaroidW * 0.22;

      photos.forEach((_, idx) => {
        const img = loadedImgs[idx];
        if (!img) return;

        const centerX = pad + innerW * (0.35 + (idx % 3) * 0.22);
        const centerY = pad + innerH * (0.32 + Math.floor(idx / 3) * 0.32);
        const angle = ((idx % 5) - 2) * 0.07;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);

        ctx.shadowColor = 'rgba(0,0,0,0.28)';
        ctx.shadowBlur = 24 * scale;
        ctx.shadowOffsetX = 6 * scale;
        ctx.shadowOffsetY = 12 * scale;

        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -polaroidW / 2, -polaroidH / 2, polaroidW, polaroidH, 8 * scale);
        ctx.fill();

        ctx.shadowColor = 'transparent';

        const photoW = polaroidW - polaroidPadding * 2;
        const photoH = polaroidH - polaroidPadding - polaroidBottom;
        const photoX = -polaroidW / 2 + polaroidPadding;
        const photoY = -polaroidH / 2 + polaroidPadding;

        ctx.save();
        drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 4 * scale);
        ctx.clip();
        drawCoverImage(ctx, img, photoX, photoY, photoW, photoH);
        ctx.restore();

        ctx.restore();
      });
    } else {
      const slots = calculateSlots(layoutStyle, n, pad, pad, innerW, innerH, g);

      slots.forEach((slot, idx) => {
        const img = loadedImgs[idx];
        if (!img) return;

        ctx.save();
        drawRoundedRect(ctx, slot.x, slot.y, slot.w, slot.h, r);
        ctx.clip();
        drawCoverImage(ctx, img, slot.x, slot.y, slot.w, slot.h);
        ctx.restore();
      });
    }

    return canvas;
  };

  const handleDownload = async () => {
    try {
      setIsExporting(true);
      const canvas = await renderCollageToCanvas();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      link.download = `Collage_${aspectRatio.replace(':', 'x')}_${new Date().toISOString().slice(0, 10)}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Failed to export collage:', e);
      alert('Failed to generate high-resolution image export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveToLibrary = async () => {
    try {
      setIsSaving(true);
      const canvas = await renderCollageToCanvas();
      const base64Data = canvas.toDataURL('image/jpeg', 0.92);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/media/save-collage`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          image_base64: base64Data,
          layout_name: layoutStyle,
          aspect_ratio: aspectRatio,
          source_media_ids: photos.map(p => p.id),
        }),
      });

      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const data = await res.json();
      setSavedSuccessMsg(`Saved collage #${data.id} to your photo library!`);
      setTimeout(() => setSavedSuccessMsg(null), 4000);
    } catch (e) {
      console.error('Failed to save collage to library:', e);
      alert('Could not save collage to library. Please check server logs.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-400">Loading your selected photos into Creative Studio...</p>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6 gap-4">
        <div className="p-4 bg-indigo-600/20 text-indigo-400 rounded-2xl">
          <ImageIcon className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold">No Photos Selected for Collage</h2>
        <p className="text-sm text-slate-400 text-center max-w-md">
          Please select 2 or more photos from your timeline to create a collage or print layout.
        </p>
        <button
          onClick={handleBack}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Gallery</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col select-none overflow-hidden font-sans">
      
      {/* Studio Header Bar */}
      <header className="h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl transition border border-slate-700/60 shadow-sm"
            title="Return to Timeline Gallery (Escape)"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-semibold">Exit Studio</span>
            <kbd className="hidden sm:inline text-[10px] bg-slate-900/80 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
              Esc
            </kbd>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Creative Collage Studio</span>
                <span className="text-[11px] font-semibold bg-indigo-950/80 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                  {photos.length} Photos
                </span>
              </h1>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {savedSuccessMsg && (
            <span className="hidden md:flex text-emerald-400 text-xs font-semibold items-center gap-1.5 animate-fadeIn">
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{savedSuccessMsg}</span>
            </span>
          )}

          <button
            onClick={handleSaveToLibrary}
            disabled={isSaving || isExporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl font-semibold text-xs transition disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save to Library</span>
          </button>

          <button
            onClick={handleDownload}
            disabled={isSaving || isExporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>Export JPG</span>
          </button>

          <button
            onClick={handleBack}
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition"
            title="Minimize & Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Studio Work Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Center / Left: Canvas Viewport (100% visible, dynamically auto-scaled) */}
        <div className="flex-1 bg-slate-950 p-4 sm:p-8 flex items-center justify-center overflow-hidden relative">
          
          {/* Dynamic Responsive Scaled Frame */}
          <div className="relative w-full h-full flex items-center justify-center">
            <div
              style={{
                aspectRatio: getAspectRatioCss(aspectRatio),
                backgroundColor: useBlurBg ? 'transparent' : bgColor,
                padding: `${padding}px`,
                gap: `${gap}px`,
                borderRadius: `${borderRadius}px`,
              }}
              className="relative max-h-full max-w-full shadow-2xl transition-all duration-300 overflow-hidden flex items-center justify-center border border-white/10"
            >
              {/* Optional Ambient Photo Blurred Backdrop */}
              {useBlurBg && photos[0] && (
                <div
                  className="absolute inset-0 bg-cover bg-center filter blur-2xl scale-125 opacity-75 pointer-events-none"
                  style={{ backgroundImage: `url(${getPhotoUrl(photos[0])})` }}
                />
              )}

              {/* Photos Grid / Layout Container */}
              {layoutStyle === 'polaroid' ? (
                // Polaroid Stack Layout
                <div className="w-full h-full relative z-10 flex flex-wrap items-center justify-center gap-4 p-4 overflow-hidden">
                  {photos.map((photo, idx) => {
                    const rotations = ['-rotate-2', 'rotate-2', '-rotate-1', 'rotate-3', '-rotate-3', 'rotate-1'];
                    const rotClass = rotations[idx % rotations.length];
                    return (
                      <div
                        key={photo.id}
                        onClick={() => handleSlotClick(idx)}
                        className={`bg-white p-2.5 pb-8 rounded-sm shadow-2xl cursor-pointer transition-all duration-200 transform hover:scale-105 hover:z-20 ${rotClass} ${
                          selectedSlot === idx ? 'ring-4 ring-indigo-500 scale-105 z-30' : ''
                        }`}
                        style={{
                          width: photos.length <= 3 ? '42%' : photos.length <= 6 ? '30%' : '26%',
                          aspectRatio: '1 / 1.25'
                        }}
                      >
                        <div className="w-full h-full overflow-hidden bg-slate-100">
                          <img
                            src={getPhotoUrl(photo)}
                            alt={photo.filename}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono text-center mt-2 truncate px-1">
                          Photo #{idx + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Grid, Split, Hero, Triptych Layouts
                <div
                  className="w-full h-full relative z-10 grid"
                  style={{
                    gap: `${gap}px`,
                    gridTemplateColumns:
                      layoutStyle === 'split' && photos.length === 2 ? 'repeat(2, 1fr)' :
                      layoutStyle === 'triptych' && photos.length >= 3 ? 'repeat(3, 1fr)' :
                      layoutStyle === 'hero' && photos.length >= 3 ? '1.5fr 1fr' :
                      photos.length <= 2 ? `repeat(${photos.length}, 1fr)` :
                      photos.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'
                  }}
                >
                  {photos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      onClick={() => handleSlotClick(idx)}
                      style={{ borderRadius: `${borderRadius}px` }}
                      className={`relative overflow-hidden cursor-pointer group transition-all duration-200 ${
                        selectedSlot === idx
                          ? 'ring-4 ring-indigo-500 scale-[0.98] shadow-2xl z-20'
                          : 'hover:brightness-105'
                      }`}
                    >
                      <img
                        src={getPhotoUrl(photo)}
                        alt={photo.filename}
                        className="w-full h-full object-cover"
                      />

                      {/* Interactive Slot Swap Overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <span className="text-xs font-semibold text-white bg-black/80 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-md">
                          <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{selectedSlot !== null ? 'Swap here' : 'Click to swap'}</span>
                        </span>
                      </div>

                      {/* Photo Badge */}
                      <span className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-mono px-2 py-0.5 rounded-md backdrop-blur-md">
                        #{idx + 1}
                      </span>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={(e) => handleRemovePhoto(idx, e)}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-rose-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition shadow-md"
                        title="Remove photo from collage"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Helper Tip */}
          <div className="absolute bottom-4 left-6 text-xs text-slate-500 flex items-center gap-2 pointer-events-none">
            <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
            <span>Click any photo to select, then click another to swap positions. Press <strong>Esc</strong> to return.</span>
          </div>
        </div>

        {/* Right Sidebar: Studio Controls Drawer */}
        <aside className="w-full lg:w-96 bg-slate-900/90 border-t lg:border-t-0 lg:border-l border-slate-800 p-6 overflow-y-auto space-y-6 text-xs text-slate-300 flex-shrink-0">
          
          {/* Aspect Ratio & Format */}
          <div className="space-y-2.5">
            <label className="font-semibold text-white flex items-center gap-2">
              <Layout className="w-4 h-4 text-indigo-400" />
              <span>Canvas Format & Ratio</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '1:1', label: '1:1 Square' },
                { id: '4:5', label: '4:5 Portrait' },
                { id: '9:16', label: '9:16 Story' },
                { id: '16:9', label: '16:9 Cinema' },
                { id: '3:2', label: '3:2 (4x6 Print)' },
                { id: '2:3', label: '2:3 Tall' },
              ].map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setAspectRatio(r.id as AspectRatio)}
                  className={`py-2 px-2.5 rounded-xl font-medium text-center border transition ${
                    aspectRatio === r.id
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                      : 'bg-slate-800 hover:bg-slate-700/80 text-slate-300 border-slate-700/70'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Layout Templates */}
          <div className="space-y-2.5 pt-3 border-t border-slate-800">
            <label className="font-semibold text-white flex items-center gap-2">
              <Grid className="w-4 h-4 text-purple-400" />
              <span>Layout Template</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'grid', label: 'Classic Grid', desc: 'Even multi-photo grid' },
                { id: 'split', label: 'Split View', desc: 'Balanced split cards' },
                { id: 'hero', label: 'Hero Focus', desc: '1 dominant lead + stack' },
                { id: 'triptych', label: 'Triptych', desc: '3 vertical story panels' },
                { id: 'polaroid', label: 'Polaroid Stack', desc: 'Vintage photo frames' },
              ].map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLayoutStyle(l.id as LayoutStyle)}
                  className={`p-3 rounded-xl text-left border transition ${
                    layoutStyle === l.id
                      ? 'bg-purple-900/50 text-white border-purple-500 shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700/80 text-slate-300 border-slate-700/70'
                  }`}
                >
                  <div className="font-semibold text-white">{l.label}</div>
                  <div className="text-[10px] text-slate-400">{l.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sliders: Spacing, Corner Radius, Outer Padding */}
          <div className="space-y-4 pt-3 border-t border-slate-800">
            <div className="space-y-1.5">
              <div className="flex justify-between font-medium">
                <span className="text-white">Photo Gap Spacing</span>
                <span className="font-mono text-indigo-400">{gap}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="32"
                value={gap}
                onChange={(e) => setGap(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between font-medium">
                <span className="text-white">Corner Rounding</span>
                <span className="font-mono text-indigo-400">{borderRadius}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="32"
                value={borderRadius}
                onChange={(e) => setBorderRadius(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between font-medium">
                <span className="text-white">Outer Border Margin</span>
                <span className="font-mono text-indigo-400">{padding}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="48"
                value={padding}
                onChange={(e) => setPadding(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Canvas Backdrop */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <label className="font-semibold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-emerald-400" />
                <span>Canvas Backdrop</span>
              </span>
              <button
                type="button"
                onClick={() => setUseBlurBg(!useBlurBg)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition font-medium ${
                  useBlurBg
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {useBlurBg ? '✓ Photo Blur Active' : '+ Ambient Photo Blur'}
              </button>
            </label>

            {!useBlurBg && (
              <div className="flex items-center gap-2.5">
                {BG_PRESETS.map(p => (
                  <button
                    key={p.color}
                    type="button"
                    onClick={() => setBgColor(p.color)}
                    style={{ backgroundColor: p.color }}
                    title={p.label}
                    className={`w-7 h-7 rounded-full border-2 transition transform hover:scale-110 ${
                      bgColor === p.color ? 'border-indigo-500 scale-110 shadow-md ring-2 ring-indigo-500/40' : 'border-slate-700'
                    }`}
                  />
                ))}
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-7 h-7 rounded-full bg-transparent cursor-pointer border border-slate-700"
                  title="Custom Color Picker"
                />
              </div>
            )}
          </div>

          {/* Selected Photos Tray */}
          <div className="space-y-2 pt-3 border-t border-slate-800">
            <span className="font-semibold text-white">Photos in this Collage ({photos.length})</span>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((photo, i) => (
                <div
                  key={photo.id}
                  onClick={() => handleSlotClick(i)}
                  className={`relative aspect-square rounded-lg overflow-hidden border cursor-pointer group ${
                    selectedSlot === i ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-slate-700'
                  }`}
                >
                  <img src={getPhotoUrl(photo)} alt="" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0.5 left-1 text-[9px] font-mono text-white bg-black/60 px-1 rounded">
                    #{i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </aside>
      </div>

    </div>
  );
}

export default function CollagePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-400">Loading Creative Studio...</p>
      </div>
    }>
      <CollageStudioContent />
    </Suspense>
  );
}
