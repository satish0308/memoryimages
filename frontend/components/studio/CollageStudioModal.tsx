'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Download, 
  Save, 
  Sparkles, 
  Layout, 
  Sliders, 
  Grid, 
  Image as ImageIcon,
  Check, 
  Loader2, 
  RefreshCw,
  Palette,
  Layers,
  ArrowRightLeft
} from 'lucide-react';
import { MediaItem } from '../timeline/PhotoCard';

interface CollageStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPhotos: MediaItem[];
  apiUrl: string;
  onSavedToLibrary?: (newMediaId: number) => void;
}

type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '3:2' | '2:3';
type LayoutStyle = 'grid' | 'split' | 'hero' | 'polaroid' | 'story' | 'triptych';

interface ColorPreset {
  label: string;
  color: string;
  textColor: string;
}

const BG_PRESETS: ColorPreset[] = [
  { label: 'White', color: '#ffffff', textColor: 'text-slate-900' },
  { label: 'Studio Dark', color: '#111827', textColor: 'text-white' },
  { label: 'Warm Cream', color: '#fef3c7', textColor: 'text-amber-950' },
  { label: 'Soft Slate', color: '#1e293b', textColor: 'text-slate-100' },
  { label: 'Pastel Blush', color: '#fce7f3', textColor: 'text-pink-950' },
  { label: 'Midnight Blue', color: '#0f172a', textColor: 'text-blue-100' },
];

export const CollageStudioModal: React.FC<CollageStudioModalProps> = ({
  isOpen,
  onClose,
  selectedPhotos,
  apiUrl,
  onSavedToLibrary,
}) => {
  const [photos, setPhotos] = useState<MediaItem[]>([]);
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
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen && selectedPhotos.length > 0) {
      setPhotos([...selectedPhotos]);
      setSavedSuccess(false);
      setSelectedSlot(null);

      // Choose intelligent defaults based on photo count
      if (selectedPhotos.length === 2) {
        setLayoutStyle('split');
        setAspectRatio('1:1');
      } else if (selectedPhotos.length === 3) {
        setLayoutStyle('triptych');
        setAspectRatio('16:9');
      } else if (selectedPhotos.length >= 4) {
        setLayoutStyle('grid');
        setAspectRatio('1:1');
      }
    }
  }, [isOpen, selectedPhotos]);

  if (!isOpen || photos.length === 0) return null;

  const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;

  const getPhotoUrl = (item: MediaItem) => {
    const separator = item.thumbnail_url.includes('?') ? '&' : '?';
    const tokenParam = token ? `${separator}token=${encodeURIComponent(token)}` : '';
    // Use 1080p preview for crisp collage generation
    return `${apiUrl}/api/v1/media/${item.id}/thumbnail?size=1080${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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

  // Dimensions of canvas output based on aspect ratio
  const getOutputDimensions = (): { width: number; height: number } => {
    const base = 2160; // Ultra HD export resolution
    switch (aspectRatio) {
      case '1:1':
        return { width: base, height: base };
      case '4:5':
        return { width: base, height: Math.round(base * 1.25) };
      case '9:16':
        return { width: base, height: Math.round(base * (16 / 9)) };
      case '16:9':
        return { width: Math.round(base * (16 / 9)), height: base };
      case '3:2':
        return { width: Math.round(base * 1.5), height: base };
      case '2:3':
        return { width: base, height: Math.round(base * 1.5) };
      default:
        return { width: base, height: base };
    }
  };

  // Render high-res canvas for export or saving
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
        ctx.filter = 'blur(60px) brightness(0.65)';
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

    // Scale factors from preview pixels to high-res canvas
    const scale = outW / 600;
    const pad = padding * scale;
    const g = gap * scale;
    const r = borderRadius * scale;

    const innerW = outW - pad * 2;
    const innerH = outH - pad * 2;

    // 2. Pre-load all photo images as Image elements via Blobs to prevent canvas tainting
    const loadedImgs = await Promise.all(
      photos.map(p => loadHtmlImage(getPhotoUrl(p)))
    );

    // 3. Draw layout slots
    const n = photos.length;

    if (layoutStyle === 'polaroid') {
      // Polaroid Stack: draw each photo inside a realistic polaroid frame with slight tilt
      const polaroidW = innerW * 0.58;
      const polaroidH = polaroidW * 1.22;
      const polaroidPadding = polaroidW * 0.06;
      const polaroidBottom = polaroidW * 0.22;

      photos.forEach((_, idx) => {
        const img = loadedImgs[idx];
        if (!img) return;

        const centerX = pad + innerW * (0.35 + (idx % 3) * 0.22);
        const centerY = pad + innerH * (0.32 + Math.floor(idx / 3) * 0.32);
        const angle = ((idx % 5) - 2) * 0.07; // -0.14 to +0.14 rad

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.28)';
        ctx.shadowBlur = 24 * scale;
        ctx.shadowOffsetX = 6 * scale;
        ctx.shadowOffsetY = 12 * scale;

        // White Frame
        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -polaroidW / 2, -polaroidH / 2, polaroidW, polaroidH, 8 * scale);
        ctx.fill();

        // Remove shadow for image
        ctx.shadowColor = 'transparent';

        // Inner Photo
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
      // Grid, Split, Hero, Triptych Layout calculations
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

  // Helper to load image via fetch blob to bypass canvas security tainting
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

  // Canvas rounded rectangle helper
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

  // Draw image like CSS object-cover
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

  // Slot position calculator for various layouts
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
      // 50/50 side-by-side or top/bottom
      const w = (totalW - gapPx) / 2;
      slots.push({ x: startX, y: startY, w, h: totalH });
      slots.push({ x: startX + w + gapPx, y: startY, w, h: totalH });
      return slots;
    }

    if (style === 'triptych' && count >= 3) {
      // 3 vertical strips
      const w = (totalW - gapPx * 2) / 3;
      for (let i = 0; i < 3; i++) {
        slots.push({ x: startX + i * (w + gapPx), y: startY, w, h: totalH });
      }
      return slots;
    }

    if (style === 'hero' && count >= 3) {
      // 1 Large Hero on left, remaining stacked on right
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

  // Handler: Download High-Res File
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
      alert('Failed to generate high-resolution image export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Handler: Save to User Library
  const handleSaveToLibrary = async () => {
    try {
      setIsSaving(true);
      const canvas = await renderCollageToCanvas();
      const base64Data = canvas.toDataURL('image/jpeg', 0.92);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/v1/media/save-collage`, {
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
      setSavedSuccess(true);
      if (onSavedToLibrary) onSavedToLibrary(data.id);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (e) {
      console.error('Failed to save collage to library:', e);
      alert('Could not save collage to library. Please check server logs.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-6xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Creative Collage & Print Studio</span>
                <span className="text-xs font-normal text-indigo-400 bg-indigo-950/60 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                  {photos.length} Photos Selected
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Design custom photo collages, polaroid stacks, and print-ready compositions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Left Preview, Right Controls */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* Canvas Interactive Preview (Left) */}
          <div className="flex-1 bg-slate-950/80 p-6 flex items-center justify-center overflow-auto relative">
            <div
              ref={previewContainerRef}
              style={{
                backgroundColor: useBlurBg ? 'transparent' : bgColor,
                padding: `${padding * 0.35}px`,
                gap: `${gap * 0.35}px`,
                borderRadius: `${borderRadius * 0.35}px`,
              }}
              className={`relative shadow-2xl transition-all duration-200 overflow-hidden flex items-center justify-center border border-white/10 ${
                aspectRatio === '1:1' ? 'w-[420px] h-[420px]' :
                aspectRatio === '4:5' ? 'w-[360px] h-[450px]' :
                aspectRatio === '9:16' ? 'w-[280px] h-[498px]' :
                aspectRatio === '16:9' ? 'w-[498px] h-[280px]' :
                aspectRatio === '3:2' ? 'w-[480px] h-[320px]' :
                'w-[320px] h-[480px]'
              }`}
            >
              {/* Blurred Photo Backdrop */}
              {useBlurBg && photos[0] && (
                <div
                  className="absolute inset-0 bg-cover bg-center filter blur-xl scale-125 opacity-70 pointer-events-none"
                  style={{ backgroundImage: `url(${getPhotoUrl(photos[0])})` }}
                />
              )}

              {/* Photos Layout Grid */}
              <div 
                className="w-full h-full relative grid z-10"
                style={{
                  gap: `${gap * 0.35}px`,
                  gridTemplateColumns: layoutStyle === 'split' && photos.length === 2 ? 'repeat(2, 1fr)' :
                                       layoutStyle === 'triptych' && photos.length >= 3 ? 'repeat(3, 1fr)' :
                                       photos.length <= 2 ? `repeat(${photos.length}, 1fr)` :
                                       photos.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'
                }}
              >
                {photos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    onClick={() => handleSlotClick(idx)}
                    style={{ borderRadius: `${borderRadius * 0.35}px` }}
                    className={`relative overflow-hidden cursor-pointer group transition-all duration-200 select-none ${
                      selectedSlot === idx
                        ? 'ring-4 ring-indigo-500 scale-[0.98] shadow-lg'
                        : 'hover:brightness-105'
                    }`}
                  >
                    <img
                      src={getPhotoUrl(photo)}
                      alt={photo.filename}
                      className="w-full h-full object-cover"
                    />

                    {/* Swap indicator tooltip */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[11px] font-semibold text-white bg-black/75 px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm">
                        <ArrowRightLeft className="w-3 h-3 text-indigo-400" />
                        <span>{selectedSlot !== null ? 'Swap with this' : 'Click to swap'}</span>
                      </span>
                    </div>

                    {/* Slot Index Tag */}
                    <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[9px] font-mono px-1.5 py-0.5 rounded backdrop-blur-sm">
                      #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Tip */}
            <div className="absolute bottom-2 left-6 text-[11px] text-slate-500 flex items-center gap-1.5 pointer-events-none">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
              <span>Tip: Click any photo then click another to swap their positions instantly.</span>
            </div>
          </div>

          {/* Right Customization Controls Sidebar */}
          <div className="w-full lg:w-96 bg-slate-900/90 border-t lg:border-t-0 lg:border-l border-slate-800 p-5 overflow-y-auto space-y-6 text-xs text-slate-300">
            
            {/* Aspect Ratio Selector */}
            <div className="space-y-2">
              <label className="font-semibold text-white flex items-center gap-1.5">
                <Layout className="w-4 h-4 text-indigo-400" />
                <span>Aspect Ratio & Format</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: '1:1', label: '1:1 Square' },
                  { id: '4:5', label: '4:5 Portrait' },
                  { id: '9:16', label: '9:16 Story' },
                  { id: '16:9', label: '16:9 Cinema' },
                  { id: '3:2', label: '4x6 Print' },
                  { id: '2:3', label: '3:2 Tall' },
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setAspectRatio(r.id as AspectRatio)}
                    className={`py-2 px-2.5 rounded-xl font-medium text-center border transition ${
                      aspectRatio === r.id
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-800 hover:bg-slate-700/80 text-slate-300 border-slate-700'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Layout Style Presets */}
            <div className="space-y-2">
              <label className="font-semibold text-white flex items-center gap-1.5">
                <Grid className="w-4 h-4 text-purple-400" />
                <span>Layout Template</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'grid', label: 'Classic Grid', desc: 'Even multi-column grid' },
                  { id: 'split', label: 'Split View', desc: 'Side-by-side or stacked' },
                  { id: 'hero', label: 'Hero Focus', desc: '1 prominent lead + stack' },
                  { id: 'triptych', label: 'Triptych', desc: '3 vertical story slices' },
                  { id: 'polaroid', label: 'Polaroid Stack', desc: 'Vintage photo frames' },
                ].map(l => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLayoutStyle(l.id as LayoutStyle)}
                    className={`p-2.5 rounded-xl text-left border transition ${
                      layoutStyle === l.id
                        ? 'bg-purple-900/50 text-white border-purple-500 shadow-sm'
                        : 'bg-slate-800 hover:bg-slate-700/80 text-slate-300 border-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-white">{l.label}</div>
                    <div className="text-[10px] text-slate-400">{l.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders: Spacing, Corner Radius, Margins */}
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-white">Photo Spacing / Gap</span>
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

            {/* Background Color & Blur Options */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <label className="font-semibold text-white flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-emerald-400" />
                  <span>Canvas Background</span>
                </span>
                <button
                  type="button"
                  onClick={() => setUseBlurBg(!useBlurBg)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                    useBlurBg
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {useBlurBg ? '✓ Photo Blur Active' : '+ Ambient Photo Blur'}
                </button>
              </label>

              {!useBlurBg && (
                <div className="flex items-center gap-2">
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

          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1.5 animate-fadeIn">
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Saved high-res collage to your photo library!</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 hover:bg-slate-800 text-slate-300 rounded-xl font-semibold text-xs transition"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveToLibrary}
              disabled={isSaving || isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl font-semibold text-xs transition disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save to Library</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={isSaving || isExporting}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>Download High-Res (JPG)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
