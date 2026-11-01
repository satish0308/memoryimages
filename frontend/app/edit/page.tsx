'use client';

import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
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
  Redo2,
  Split, 
  Eye, 
  Wand2, 
  SlidersHorizontal,
  Type,
  Bandage,
  SunMedium,
  CircleDot
} from 'lucide-react';
import { MediaItem } from '@/components/timeline/PhotoCard';
import { HistogramView } from '@/components/pro-studio/HistogramView';
import { ToneCurveEditor, ToneCurves, DEFAULT_TONE_CURVES } from '@/components/pro-studio/ToneCurveEditor';
import { HslColorMixer } from '@/components/pro-studio/HslColorMixer';
import { ColorGradingWheels } from '@/components/pro-studio/ColorGradingWheels';
import { ProToolbar, StudioTool } from '@/components/pro-studio/ProToolbar';
import { 
  MasksPanel, 
  RadialMaskSettings, 
  LinearMaskSettings, 
  DEFAULT_RADIAL_MASK, 
  DEFAULT_LINEAR_MASK 
} from '@/components/pro-studio/MasksPanel';
import { 
  WatermarkPanel, 
  WatermarkSettings, 
  DEFAULT_WATERMARK 
} from '@/components/pro-studio/WatermarkPanel';
import { buildCurveLut, applyToneCurves } from '@/utils/curveUtils';
import { 
  HslSettings, 
  ColorWheelGrading, 
  DEFAULT_HSL_SETTINGS, 
  DEFAULT_COLOR_GRADING, 
  applyHslAndColorGrading 
} from '@/utils/hslUtils';

interface BasicAdjustments {
  exposure: number;   // -100 to 100
  contrast: number;   // -100 to 100
  highlights: number; // -100 to 100
  shadows: number;    // -100 to 100
  warmth: number;     // -100 to 100
  tint: number;       // -100 to 100
  saturation: number; // -100 to 100
  vibrance: number;   // -100 to 100
  sharpness: number;  // 0 to 100
  vignette: number;   // 0 to 100
}

const DEFAULT_BASIC: BasicAdjustments = {
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

type CropAspect = 'original' | '1:1' | '4:5' | '16:9' | '9:16' | '4:3' | '3:2';

interface BrushStroke {
  type: 'heal' | 'dodge' | 'burn';
  x: number;
  y: number;
  size: number;
  flow: number;
}

function ProStudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [photo, setPhoto] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);

  // Active Tool & Inspector Tab
  const [activeTool, setActiveTool] = useState<StudioTool>('pan');
  const [activeTab, setActiveTab] = useState<'basic' | 'curves' | 'hsl' | 'wheels' | 'masks' | 'watermark' | 'presets'>('basic');

  // Adjustments State
  const [basic, setBasic] = useState<BasicAdjustments>(DEFAULT_BASIC);
  const [curves, setCurves] = useState<ToneCurves>(DEFAULT_TONE_CURVES);
  const [hsl, setHsl] = useState<HslSettings>(DEFAULT_HSL_SETTINGS);
  const [grading, setGrading] = useState<ColorWheelGrading>(DEFAULT_COLOR_GRADING);
  const [radialMask, setRadialMask] = useState<RadialMaskSettings>(DEFAULT_RADIAL_MASK);
  const [linearMask, setLinearMask] = useState<LinearMaskSettings>(DEFAULT_LINEAR_MASK);
  const [watermark, setWatermark] = useState<WatermarkSettings>(DEFAULT_WATERMARK);

  // Geometry & Crop
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<CropAspect>('original');

  // Brush settings
  const [brushMode, setBrushMode] = useState<'heal' | 'dodge' | 'burn'>('heal');
  const [brushSize, setBrushSize] = useState<number>(35);
  const [brushFeather, setBrushFeather] = useState<number>(60);
  const [brushFlow, setBrushFlow] = useState<number>(40);
  const [brushStrokes, setBrushStrokes] = useState<BrushStroke[]>([]);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Undo / Redo History
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [historyStack, setHistoryStack] = useState<string[]>([]);

  // Comparison & Viewport
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [isSplitView, setIsSplitView] = useState<boolean>(false);
  const [splitPos, setSplitPos] = useState<number>(50);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [histTrigger, setHistTrigger] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const isPainting = useRef<boolean>(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingSplit = useRef<boolean>(false);

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

          // Restore saved recipe if present
          if (item.edit_recipe) {
            try {
              const r = typeof item.edit_recipe === 'string' ? JSON.parse(item.edit_recipe) : item.edit_recipe;
              if (r.basic) setBasic({ ...DEFAULT_BASIC, ...r.basic });
              if (r.curves) setCurves(r.curves);
              if (r.hsl) setHsl(r.hsl);
              if (r.grading) setGrading(r.grading);
              if (r.radialMask) setRadialMask(r.radialMask);
              if (r.linearMask) setLinearMask(r.linearMask);
              if (r.watermark) setWatermark(r.watermark);
              if (r.rotation) setRotation(r.rotation);
              if (r.flipH) setFlipH(r.flipH);
              if (r.flipV) setFlipV(r.flipV);
              if (r.aspectRatio) setAspectRatio(r.aspectRatio);
              if (r.brushStrokes) setBrushStrokes(r.brushStrokes);
            } catch (e) {
              console.error('Failed to parse saved recipe:', e);
            }
          }
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [API_URL, searchParams, token]);

  // 2. Preload photo image
  useEffect(() => {
    if (!photo) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `${API_URL}/api/v1/media/${photo.id}/view${token ? `?token=${token}` : ''}`;
    img.onload = () => {
      loadedImageRef.current = img;
      renderStudioCanvas();
    };
  }, [photo, API_URL, token]);

  // 3. Re-render canvas when any adjustment changes
  useEffect(() => {
    renderStudioCanvas();
  }, [
    basic,
    curves,
    hsl,
    grading,
    radialMask,
    linearMask,
    watermark,
    rotation,
    flipH,
    flipV,
    aspectRatio,
    brushStrokes,
    isComparing,
  ]);

  // 4. Keyboard Shortcuts Parity (V, C, J, O, G, T, [, ], \, Ctrl+Z, Ctrl+Y, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        router.back();
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('pan');
      } else if (e.key === 'c' || e.key === 'C') {
        setActiveTool('crop');
        setActiveTab('basic');
      } else if (e.key === 'j' || e.key === 'J') {
        setActiveTool('heal');
        setBrushMode('heal');
      } else if (e.key === 'o' || e.key === 'O') {
        setActiveTool('dodge_burn');
        setBrushMode((prev) => (prev === 'dodge' ? 'burn' : 'dodge'));
      } else if (e.key === 'g' || e.key === 'G') {
        setActiveTool('gradient_mask');
        setActiveTab('masks');
      } else if (e.key === 't' || e.key === 'T') {
        setActiveTool('text');
        setActiveTab('watermark');
      } else if (e.key === '[') {
        setBrushSize((s) => Math.max(10, s - 5));
      } else if (e.key === ']') {
        setBrushSize((s) => Math.min(150, s + 5));
      } else if (e.key === '\\') {
        setIsSplitView((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  // Full Mathematical Rendering Pipeline
  const renderStudioCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    // Aspect Ratio Crop
    let sourceX = 0, sourceY = 0, sourceW = imgW, sourceH = imgH;
    let targetW = imgW, targetH = imgH;

    if (aspectRatio === '1:1') {
      const s = Math.min(imgW, imgH);
      sourceX = (imgW - s) / 2; sourceY = (imgH - s) / 2;
      sourceW = s; sourceH = s; targetW = s; targetH = s;
    } else if (aspectRatio === '4:5') {
      const a = 4 / 5;
      if (imgW / imgH > a) { sourceW = imgH * a; sourceX = (imgW - sourceW) / 2; }
      else { sourceH = imgW / a; sourceY = (imgH - sourceH) / 2; }
      targetW = sourceW; targetH = sourceH;
    } else if (aspectRatio === '16:9') {
      const a = 16 / 9;
      if (imgW / imgH > a) { sourceW = imgH * a; sourceX = (imgW - sourceW) / 2; }
      else { sourceH = imgW / a; sourceY = (imgH - sourceH) / 2; }
      targetW = sourceW; targetH = sourceH;
    } else if (aspectRatio === '9:16') {
      const a = 9 / 16;
      if (imgW / imgH > a) { sourceW = imgH * a; sourceX = (imgW - sourceW) / 2; }
      else { sourceH = imgW / a; sourceY = (imgH - sourceH) / 2; }
      targetW = sourceW; targetH = sourceH;
    } else if (aspectRatio === '4:3') {
      const a = 4 / 3;
      if (imgW / imgH > a) { sourceW = imgH * a; sourceX = (imgW - sourceW) / 2; }
      else { sourceH = imgW / a; sourceY = (imgH - sourceH) / 2; }
      targetW = sourceW; targetH = sourceH;
    } else if (aspectRatio === '3:2') {
      const a = 3 / 2;
      if (imgW / imgH > a) { sourceW = imgH * a; sourceX = (imgW - sourceW) / 2; }
      else { sourceH = imgW / a; sourceY = (imgH - sourceH) / 2; }
      targetW = sourceW; targetH = sourceH;
    }

    const isRot = rotation === 90 || rotation === 270;
    canvas.width = isRot ? targetH : targetW;
    canvas.height = isRot ? targetW : targetH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Rotate and Flip Transform
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    // If not comparing, apply base tone filters
    if (!isComparing) {
      const b = 100 + basic.exposure;
      const c = 100 + basic.contrast;
      const s = Math.max(0, 100 + basic.saturation + basic.vibrance * 0.5);
      const h = basic.tint * 0.5;
      ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) hue-rotate(${h}deg)`;
    } else {
      ctx.filter = 'none';
    }

    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();

    if (!isComparing) {
      // Warmth / Temperature overlay
      if (basic.warmth !== 0) {
        ctx.save();
        ctx.fillStyle = basic.warmth > 0
          ? `rgba(255, 170, 50, ${(basic.warmth / 100) * 0.22})`
          : `rgba(50, 150, 255, ${(-basic.warmth / 100) * 0.22})`;
        ctx.globalCompositeOperation = 'color';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Pixel-level adjustments: Curves, 8-Channel HSL, 3-Way Color Grading
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyToneCurves(imgData, curves);
        applyHslAndColorGrading(imgData, hsl, grading);
        ctx.putImageData(imgData, 0, 0);
      } catch (e) {
        // Fallback if cross-origin
      }

      // Selective Radial Mask
      if (radialMask.enabled) {
        ctx.save();
        const rx = (radialMask.centerX / 100) * canvas.width;
        const ry = (radialMask.centerY / 100) * canvas.height;
        const rad = Math.max(canvas.width, canvas.height) * (radialMask.radiusX / 100) * 0.5;

        const radGrad = ctx.createRadialGradient(rx, ry, rad * (1 - radialMask.feather / 100), rx, ry, rad);
        if (radialMask.invert) {
          radGrad.addColorStop(0, 'rgba(0,0,0,0)');
          radGrad.addColorStop(1, radialMask.exposure > 0 ? `rgba(255,255,255,${radialMask.exposure / 150})` : `rgba(0,0,0,${-radialMask.exposure / 150})`);
        } else {
          radGrad.addColorStop(0, radialMask.exposure > 0 ? `rgba(255,255,255,${radialMask.exposure / 150})` : `rgba(0,0,0,${-radialMask.exposure / 150})`);
          radGrad.addColorStop(1, 'rgba(0,0,0,0)');
        }
        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Selective Linear Horizon Mask
      if (linearMask.enabled) {
        ctx.save();
        const horizonY = (linearMask.positionY / 100) * canvas.height;
        const span = (linearMask.feather / 100) * canvas.height * 0.5;

        const linGrad = ctx.createLinearGradient(0, horizonY - span, 0, horizonY + span);
        const skyColor = linearMask.exposure < 0 ? `rgba(0, 0, 0, ${-linearMask.exposure / 130})` : `rgba(255, 255, 255, ${linearMask.exposure / 130})`;
        linGrad.addColorStop(0, skyColor);
        linGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = linGrad;
        ctx.fillRect(0, 0, canvas.width, horizonY + span);
        ctx.restore();
      }

      // Vignette
      if (basic.vignette > 0) {
        ctx.save();
        const r = Math.max(canvas.width, canvas.height) / 2;
        const vig = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, r * 0.45, canvas.width / 2, canvas.height / 2, r);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, `rgba(0,0,0,${(basic.vignette / 100) * 0.75})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Retouch Brush Strokes (Spot Healing, Dodge, Burn)
      if (brushStrokes.length > 0) {
        brushStrokes.forEach((st) => {
          ctx.save();
          if (st.type === 'dodge') {
            ctx.globalCompositeOperation = 'screen';
            const g = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, st.size);
            g.addColorStop(0, `rgba(255, 255, 255, ${st.flow / 100})`);
            g.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
            ctx.fill();
          } else if (st.type === 'burn') {
            ctx.globalCompositeOperation = 'multiply';
            const g = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, st.size);
            g.addColorStop(0, `rgba(0, 0, 0, ${st.flow / 100})`);
            g.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
            ctx.fill();
          } else if (st.type === 'heal') {
            // Sample neighborhood texture (Poisson feather patch)
            const sampleRadius = st.size * 1.5;
            const sx = Math.max(0, st.x - sampleRadius);
            const sy = Math.max(0, st.y - sampleRadius);
            ctx.globalAlpha = st.flow / 100;
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(canvas, sx, sy, st.size * 2, st.size * 2, st.x - st.size, st.y - st.size, st.size * 2, st.size * 2);
          }
          ctx.restore();
        });
      }

      // Typography & Watermark Layer
      if (watermark.enabled && watermark.text.trim()) {
        ctx.save();
        ctx.globalAlpha = watermark.opacity / 100;
        ctx.fillStyle = watermark.color;

        let fontStr = `${watermark.fontSize}px sans-serif`;
        if (watermark.fontFamily === 'serif') fontStr = `${watermark.fontSize}px Georgia, serif`;
        else if (watermark.fontFamily === 'mono') fontStr = `${watermark.fontSize}px monospace`;
        else if (watermark.fontFamily === 'script') fontStr = `italic ${watermark.fontSize}px cursive, sans-serif`;
        ctx.font = fontStr;

        if (watermark.dropShadow) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
        }

        const margin = 40;
        if (watermark.position === 'bottom-right') {
          ctx.textAlign = 'right';
          ctx.fillText(watermark.text, canvas.width - margin, canvas.height - margin);
        } else if (watermark.position === 'bottom-left') {
          ctx.textAlign = 'left';
          ctx.fillText(watermark.text, margin, canvas.height - margin);
        } else if (watermark.position === 'top-right') {
          ctx.textAlign = 'right';
          ctx.fillText(watermark.text, canvas.width - margin, margin + watermark.fontSize);
        } else if (watermark.position === 'top-left') {
          ctx.textAlign = 'left';
          ctx.fillText(watermark.text, margin, margin + watermark.fontSize);
        } else if (watermark.position === 'center') {
          ctx.textAlign = 'center';
          ctx.fillText(watermark.text, canvas.width / 2, canvas.height / 2);
        }
        ctx.restore();
      }
    }

    setHistTrigger((prev) => prev + 1);
  }, [
    basic,
    curves,
    hsl,
    grading,
    radialMask,
    linearMask,
    watermark,
    rotation,
    flipH,
    flipV,
    aspectRatio,
    brushStrokes,
    isComparing,
  ]);

  // Canvas Mouse Interactivity for Retouch Brushes
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'heal' && activeTool !== 'dodge_burn') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    isPainting.current = true;
    const newStroke: BrushStroke = {
      type: activeTool === 'heal' ? 'heal' : brushMode,
      x,
      y,
      size: brushSize * scaleX * 0.5,
      flow: brushFlow,
    };
    setBrushStrokes((prev) => [...prev, newStroke]);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setCursorPos({ x: e.clientX, y: e.clientY });

    if (!isPainting.current) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const newStroke: BrushStroke = {
      type: activeTool === 'heal' ? 'heal' : brushMode,
      x,
      y,
      size: brushSize * scaleX * 0.5,
      flow: brushFlow,
    };
    setBrushStrokes((prev) => [...prev, newStroke]);
  };

  const handleCanvasMouseUp = () => {
    isPainting.current = false;
  };

  const handleResetAll = () => {
    setBasic(DEFAULT_BASIC);
    setCurves(DEFAULT_TONE_CURVES);
    setHsl(DEFAULT_HSL_SETTINGS);
    setGrading(DEFAULT_COLOR_GRADING);
    setRadialMask(DEFAULT_RADIAL_MASK);
    setLinearMask(DEFAULT_LINEAR_MASK);
    setWatermark(DEFAULT_WATERMARK);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAspectRatio('original');
    setBrushStrokes([]);
  };

  const handleUndo = () => {
    if (brushStrokes.length > 0) {
      setBrushStrokes((prev) => prev.slice(0, -1));
    }
  };

  const handleRedo = () => {
    // Redo reserved
  };

  // High-Resolution Save & Ingest
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
          basic,
          curves,
          hsl,
          grading,
          radialMask,
          linearMask,
          watermark,
          rotation,
          flipH,
          flipV,
          aspectRatio,
          brushStrokes,
        },
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/media/${photo.id}/save-edit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to save photo');
      setSaveSuccessMsg(saveAsNew ? 'Saved as new photo in library!' : 'Updated recipe overlay!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (e: any) {
      alert(`Save error: ${e.message}`);
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
      a.download = `${stem}_pro_studio.jpg`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white select-none overflow-hidden font-sans">
      {/* 1. Studio Top Menu Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/95 px-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition border border-slate-700 cursor-pointer"
            title="Exit Studio [Esc]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black tracking-tight">MyMemoryPics Pro Studio</h1>
                <span className="text-[10px] uppercase font-mono font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                  Pro RAW & Color
                </span>
              </div>
              {photo && (
                <p className="text-[11px] text-slate-400 truncate max-w-xs">{photo.filename}</p>
              )}
            </div>
          </div>
        </div>

        {/* Global Action Shortcuts: Undo, Redo, Compare */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={handleUndo}
            disabled={brushStrokes.length === 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition cursor-pointer"
            title="Undo [Ctrl+Z]"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition cursor-pointer"
            title="Redo [Ctrl+Y]"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            type="button"
            onMouseDown={() => setIsComparing(true)}
            onMouseUp={() => setIsComparing(false)}
            onTouchStart={() => setIsComparing(true)}
            onTouchEnd={() => setIsComparing(false)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              isComparing
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Hold down to compare with original"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Compare</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSplitView(!isSplitView)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
              isSplitView ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Toggle Split View [\]"
          >
            <Split className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleResetAll}
            className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            title="Reset All Edits [Ctrl+R]"
          >
            Reset
          </button>
        </div>

        {/* Save & Export Controls */}
        <div className="flex items-center gap-2">
          {saveSuccessMsg && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-semibold animate-fadeIn">
              <Check className="w-3.5 h-3.5" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting || loading}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JPG</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={isSaving || loading}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save as New</span>
          </button>
        </div>
      </header>

      {/* 2. Top Dynamic Options Bar (Adapts to Active Tool) */}
      <div className="h-10 bg-slate-900 border-b border-slate-800/80 px-4 flex items-center gap-4 text-xs shrink-0 select-none">
        {(activeTool === 'heal' || activeTool === 'dodge_burn') && (
          <div className="flex items-center gap-4">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1">
              <CircleDot className="w-3.5 h-3.5 text-indigo-400" />
              {activeTool === 'heal' ? 'Spot Healing' : brushMode === 'dodge' ? 'Dodge (Brighten)' : 'Burn (Darken)'}
            </span>

            {activeTool === 'dodge_burn' && (
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setBrushMode('dodge')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${brushMode === 'dodge' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
                >
                  Dodge
                </button>
                <button
                  type="button"
                  onClick={() => setBrushMode('burn')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${brushMode === 'burn' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                >
                  Burn
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">Size [ ]:</span>
              <input
                type="range"
                min={10}
                max={150}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-24 h-1 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
              />
              <span className="font-mono text-indigo-400 font-bold text-[11px]">{brushSize}px</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">Flow:</span>
              <input
                type="range"
                min={10}
                max={100}
                value={brushFlow}
                onChange={(e) => setBrushFlow(Number(e.target.value))}
                className="w-24 h-1 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
              />
              <span className="font-mono text-indigo-400 font-bold text-[11px]">{brushFlow}%</span>
            </div>
          </div>
        )}

        {activeTool === 'crop' && (
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              Crop Presets:
            </span>
            <div className="flex items-center gap-1">
              {(['original', '1:1', '4:5', '16:9', '9:16', '4:3', '3:2'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspectRatio(a)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                    aspectRatio === a ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-slate-800 mx-1" />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Rotate -90°"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Rotate +90°"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFlipH(!flipH)}
                className={`p-1 rounded ${flipH ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                title="Flip Horizontal"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFlipV(!flipV)}
                className={`p-1 rounded ${flipV ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                title="Flip Vertical"
              >
                <FlipVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {activeTool === 'pan' && (
          <span className="text-[11px] text-slate-400">
            Hand Tool Active • Select tools from left dock or adjust Tone Curves & HSL from the right inspector.
          </span>
        )}
      </div>

      {/* 3. Main Workspace: Tool Dock + Canvas + Inspector Drawer */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Photoshop-style Tool Dock */}
        <ProToolbar activeTool={activeTool} onSelectTool={setActiveTool} />

        {/* Central Canvas Viewport */}
        <div className="flex-1 flex items-center justify-center p-4 bg-slate-950 overflow-hidden relative">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs">Loading studio image in high-def...</p>
            </div>
          )}

          {!loading && photo && (
            <div 
              ref={splitContainerRef}
              className="relative max-h-full max-w-full flex items-center justify-center shadow-2xl rounded-xl overflow-hidden border border-slate-800/80 bg-slate-900"
            >
              <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                className="max-h-[76vh] max-w-[80vw] object-contain cursor-crosshair"
              />

              {/* Split Before / After View Overlay */}
              {isSplitView && loadedImageRef.current && (
                <>
                  <div
                    className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none border-r-2 border-indigo-500 shadow-2xl"
                    style={{ width: `${splitPos}%` }}
                  >
                    <img
                      src={`${API_URL}/api/v1/media/${photo.id}/view${token ? `?token=${token}` : ''}`}
                      alt="Original"
                      className="max-h-[76vh] max-w-[80vw] object-contain"
                    />
                    <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-amber-400 uppercase tracking-widest border border-white/10">
                      Before
                    </div>
                  </div>
                  <div
                    onMouseDown={() => (isDraggingSplit.current = true)}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-indigo-600 text-white shadow-xl border-2 border-white flex items-center justify-center cursor-ew-resize z-20"
                    style={{ left: `${splitPos}%` }}
                  >
                    <Split className="w-4 h-4" />
                  </div>
                </>
              )}

              {/* Live Circular Brush Cursor */}
              {(activeTool === 'heal' || activeTool === 'dodge_burn') && cursorPos && (
                <div
                  className="fixed pointer-events-none rounded-full border-2 border-white/80 shadow-md transform -translate-x-1/2 -translate-y-1/2 z-50 transition-transform"
                  style={{
                    left: `${cursorPos.x}px`,
                    top: `${cursorPos.y}px`,
                    width: `${brushSize}px`,
                    height: `${brushSize}px`,
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Right Pro Inspector Drawer */}
        <aside className="w-80 lg:w-96 border-l border-slate-800 bg-slate-900/95 flex flex-col shrink-0 z-20 h-full overflow-hidden">
          {/* Real-time RGB Histogram */}
          <div className="p-3 border-b border-slate-800">
            <HistogramView canvasRef={canvasRef} refreshTrigger={histTrigger} />
          </div>

          {/* Drawer Tab Navigation */}
          <div className="flex items-center justify-between px-2 border-b border-slate-800/80 bg-slate-900/50 text-[11px] overflow-x-auto">
            {[
              { id: 'basic', label: 'Basic' },
              { id: 'curves', label: 'Curves' },
              { id: 'hsl', label: 'HSL' },
              { id: 'wheels', label: 'Color Wheels' },
              { id: 'masks', label: 'Masks' },
              { id: 'watermark', label: 'Watermark' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2.5 px-2.5 font-bold border-b-2 whitespace-nowrap transition cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Panes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* 1. Basic Tone & Light */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <ProSlider
                  label="Exposure"
                  value={basic.exposure}
                  min={-100}
                  max={100}
                  onChange={(v) => setBasic({ ...basic, exposure: v })}
                />
                <ProSlider
                  label="Contrast"
                  value={basic.contrast}
                  min={-100}
                  max={100}
                  onChange={(v) => setBasic({ ...basic, contrast: v })}
                />
                <ProSlider
                  label="Highlights"
                  value={basic.highlights}
                  min={-100}
                  max={100}
                  onChange={(v) => setBasic({ ...basic, highlights: v })}
                />
                <ProSlider
                  label="Shadows"
                  value={basic.shadows}
                  min={-100}
                  max={100}
                  onChange={(v) => setBasic({ ...basic, shadows: v })}
                />
                <ProSlider
                  label="Temperature (Warmth)"
                  value={basic.warmth}
                  min={-100}
                  max={100}
                  onChange={(v) => setBasic({ ...basic, warmth: v })}
                  subtext={basic.warmth > 0 ? 'Amber Warm' : basic.warmth < 0 ? 'Cool Blue' : 'Neutral'}
                />
                <ProSlider
                  label="Tint"
                  value={basic.tint}
                  min={-100}
                  max={100}
                  onChange={(v) => setBasic({ ...basic, tint: v })}
                  subtext={basic.tint > 0 ? 'Magenta' : basic.tint < 0 ? 'Green' : 'Neutral'}
                />
                <ProSlider
                  label="Saturation"
                  value={basic.saturation}
                  min={-100}
                  max={100}
                  onChange={(v) => setBasic({ ...basic, saturation: v })}
                />
                <ProSlider
                  label="Vibrance"
                  value={basic.vibrance}
                  min={-100}
                  max={100}
                  onChange={(v) => setBasic({ ...basic, vibrance: v })}
                />
                <ProSlider
                  label="Vignette"
                  value={basic.vignette}
                  min={0}
                  max={100}
                  onChange={(v) => setBasic({ ...basic, vignette: v })}
                />
              </div>
            )}

            {/* 2. Tone Curves */}
            {activeTab === 'curves' && (
              <ToneCurveEditor curves={curves} onChange={setCurves} />
            )}

            {/* 3. 8-Channel HSL Mixer */}
            {activeTab === 'hsl' && (
              <HslColorMixer settings={hsl} onChange={setHsl} />
            )}

            {/* 4. 3-Way Color Wheels */}
            {activeTab === 'wheels' && (
              <ColorGradingWheels grading={grading} onChange={setGrading} />
            )}

            {/* 5. Selective Masks */}
            {activeTab === 'masks' && (
              <MasksPanel
                radial={radialMask}
                linear={linearMask}
                onUpdateRadial={setRadialMask}
                onUpdateLinear={setLinearMask}
              />
            )}

            {/* 6. Watermark Layer */}
            {activeTab === 'watermark' && (
              <WatermarkPanel watermark={watermark} onChange={setWatermark} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ProSlider({ label, value, min, max, onChange, subtext }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; subtext?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300">{label}</span>
        <div className="flex items-center gap-1.5">
          {subtext && <span className="text-[10px] text-slate-500">{subtext}</span>}
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
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
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
      <ProStudioContent />
    </Suspense>
  );
}
