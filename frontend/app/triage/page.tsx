'use client';

import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Clock, 
  FileText, 
  Copy, 
  EyeOff, 
  Trash2, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  HardDrive,
  Check,
  Award,
  DollarSign,
  ArrowRight,
  ExternalLink
} from 'lucide-react';

import { 
  DuplicateResolverModal, 
  DuplicateCluster 
} from '@/components/triage/DuplicateResolverModal';
import { BillInspectorModal } from '@/components/triage/BillInspectorModal';

interface TriageOverview {
  total_screenshots: number;
  expiring_screenshots: number;
  total_bills_receipts: number;
  total_blurry: number;
  total_memes: number;
  reclaimable_bytes: number;
  reclaimable_mb: number;
}

interface ScreenshotItem {
  id: number;
  filename: string;
  captured_at: string;
  expires_at: string | null;
  days_left: number | null;
  is_expired: boolean;
  file_size: number;
  thumbnail_url: string;
}

interface BillItem {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  extracted_text?: string;
  thumbnail_url: string;
}

interface BlurryItem {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  blurriness_score?: number;
  thumbnail_url: string;
}

export default function TriagePage() {
  const [overview, setOverview] = useState<TriageOverview | null>(null);
  const [activeTab, setActiveTab] = useState<'screenshots' | 'bills' | 'duplicates' | 'blurry'>('screenshots');
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCluster[]>([]);
  const [blurryPhotos, setBlurryPhotos] = useState<BlurryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [activeCompareCluster, setActiveCompareCluster] = useState<DuplicateCluster | null>(null);
  const [inspectingBillId, setInspectingBillId] = useState<number | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchOverview = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/overview`);
      if (res.ok) setOverview(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchScreenshots = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/screenshots`);
      if (res.ok) setScreenshots(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/bills`);
      if (res.ok) setBills(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/triage/duplicates`);
      if (res.ok) setDuplicates(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBlurry = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/media?limit=100`);
      if (res.ok) {
        const data = await res.json();
        const blurry = (data.items || []).filter((i: any) => i.is_blurry);
        setBlurryPhotos(blurry.map((i: any) => ({
          ...i,
          thumbnail_url: `/api/v1/media/${i.id}/thumbnail?size=256`
        })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    if (activeTab === 'screenshots') fetchScreenshots();
    else if (activeTab === 'bills') fetchBills();
    else if (activeTab === 'duplicates') fetchDuplicates();
    else if (activeTab === 'blurry') fetchBlurry();
  }, [activeTab]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSnooze = async (days: number = 30) => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds, days })
      });
      if (res.ok) {
        setSelectedIds([]);
        fetchScreenshots();
        fetchOverview();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Move ${selectedIds.length} items to trash? (Zero auto-deletion policy: photos remain safe until explicitly confirmed)`)) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds })
      });
      if (res.ok) {
        setSelectedIds([]);
        if (activeTab === 'screenshots') fetchScreenshots();
        else if (activeTab === 'bills') fetchBills();
        else if (activeTab === 'duplicates') fetchDuplicates();
        else if (activeTab === 'blurry') fetchBlurry();
        fetchOverview();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-purple-500/10 border border-amber-200/60 rounded-3xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-700 font-bold text-lg">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Smart Triage & Safe Manual Review
            </div>
            <p className="text-xs text-slate-600 max-w-2xl">
              <b>Zero Auto-Deletion Guarantee:</b> Photos are never deleted automatically under any circumstances.
              The triage engine intelligently classifies screenshots, bills/receipts, and duplicate bursts so you can review candidates and decide what to keep.
            </p>
          </div>

          {/* Quick Storage Stat */}
          <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
            <HardDrive className="w-8 h-8 text-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Potential Savings</p>
              <p className="text-base font-bold text-slate-800">
                {overview?.reclaimable_mb || 0} MB
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Triage Overview Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setActiveTab('screenshots')}
          className={`p-4 rounded-2xl border text-left transition flex items-center justify-between ${
            activeTab === 'screenshots' 
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 shadow-sm' 
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Clock className="w-4 h-4 text-blue-500" />
              Screenshots
            </div>
            <p className="text-xl font-bold text-slate-900 mt-1">
              {overview?.total_screenshots || 0}
            </p>
            <p className="text-[11px] text-blue-600 font-medium">
              {overview?.expiring_screenshots || 0} flagged for review
            </p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('bills')}
          className={`p-4 rounded-2xl border text-left transition flex items-center justify-between ${
            activeTab === 'bills' 
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 shadow-sm' 
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <FileText className="w-4 h-4 text-emerald-500" />
              Bills & Receipts
            </div>
            <p className="text-xl font-bold text-slate-900 mt-1">
              {overview?.total_bills_receipts || 0}
            </p>
            <p className="text-[11px] text-emerald-700 font-medium">OCR Text Vault</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('duplicates')}
          className={`p-4 rounded-2xl border text-left transition flex items-center justify-between ${
            activeTab === 'duplicates' 
              ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-500/20 shadow-sm' 
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Copy className="w-4 h-4 text-purple-500" />
              Duplicates & Bursts
            </div>
            <p className="text-xl font-bold text-slate-900 mt-1">
              {duplicates.length}
            </p>
            <p className="text-[11px] text-purple-700 font-medium">pHash cluster comparison</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('blurry')}
          className={`p-4 rounded-2xl border text-left transition flex items-center justify-between ${
            activeTab === 'blurry' 
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20 shadow-sm' 
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <EyeOff className="w-4 h-4 text-amber-500" />
              Blurry Shots
            </div>
            <p className="text-xl font-bold text-slate-900 mt-1">
              {overview?.total_blurry || 0}
            </p>
            <p className="text-[11px] text-amber-700 font-medium">Low Laplacian sharpness</p>
          </div>
        </button>
      </div>

      {/* Multi-Select Action Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white rounded-2xl px-5 py-3 flex items-center justify-between shadow-2xl sticky top-4 z-20 animate-fadeIn">
          <span className="text-xs font-medium">
            {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            {activeTab === 'screenshots' && (
              <button
                onClick={() => handleSnooze(30)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Snooze +30 Days
              </button>
            )}
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Tab 1: Screenshots Review Tray */}
      {activeTab === 'screenshots' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              Screenshots for Review ({screenshots.length})
            </h3>
            <span className="text-xs text-slate-400">
              Select items to delete or keep safely in your library.
            </span>
          </div>

          {screenshots.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              No screenshots currently pending review! Your library is tidy.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {screenshots.map(s => {
                const isSelected = selectedIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleSelect(s.id)}
                    className={`relative aspect-[9/16] bg-slate-100 rounded-2xl overflow-hidden cursor-pointer border-2 transition ${
                      isSelected ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${s.thumbnail_url}`}
                      alt={s.filename}
                      className="w-full h-full object-cover"
                    />

                    <div className="absolute top-2 left-2 right-2 flex justify-between items-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md ${
                        s.is_expired ? 'bg-amber-600 text-white' : 'bg-black/60 text-white'
                      }`}>
                        {s.is_expired ? '30+ days old' : 'Recent'}
                      </span>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-black/30 text-transparent'
                      }`}>
                        <Check className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Bills & Documents Vault (With OCR Inspector Drawer) */}
      {activeTab === 'bills' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Receipts & Bills Vault ({bills.length})
              </h3>
              <p className="text-xs text-slate-400">
                Click any receipt or document to view extracted totals, dates, and full OCR text.
              </p>
            </div>
          </div>

          {bills.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              No bills or receipts identified in library.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {bills.map(b => (
                <div
                  key={b.id}
                  onClick={() => setInspectingBillId(b.id)}
                  className="group relative aspect-[3/4] bg-slate-100 rounded-2xl overflow-hidden cursor-pointer border border-slate-200 hover:shadow-xl transition flex flex-col justify-between"
                >
                  <img
                    src={`${API_URL}${b.thumbnail_url}`}
                    alt={b.filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 p-2.5 flex flex-col justify-between text-white">
                    <span className="self-end bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                      Receipt
                    </span>
                    <div>
                      <p className="font-semibold text-xs truncate">{b.filename}</p>
                      <p className="text-[10px] text-slate-300 mt-0.5">
                        {new Date(b.captured_at).toLocaleDateString()}
                      </p>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400 font-semibold group-hover:underline">
                        <span>Inspect OCR Text</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Duplicates & Burst Clusters (With Side-by-Side Resolver) */}
      {activeTab === 'duplicates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Duplicate & Burst Clusters ({duplicates.length})
              </h3>
              <p className="text-xs text-slate-400">
                Click "Compare & Pick Best Shot" to review technical sharpness and keep the finest photo.
              </p>
            </div>
          </div>

          {duplicates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              No duplicate clusters detected.
            </div>
          ) : (
            <div className="space-y-4">
              {duplicates.map((cluster, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-sm text-slate-800">
                        Cluster #{idx + 1} ({cluster.count} matching images)
                      </span>
                      <p className="text-xs text-slate-400 font-mono">
                        Perceptual Hash: {cluster.hash}
                      </p>
                    </div>

                    <button
                      onClick={() => setActiveCompareCluster(cluster)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>Compare & Pick Best Shot</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {cluster.items.map(item => (
                      <div
                        key={item.id}
                        onClick={() => setActiveCompareCluster(cluster)}
                        className="group relative aspect-square bg-slate-100 rounded-xl overflow-hidden cursor-pointer border hover:border-indigo-500 transition"
                      >
                        <img
                          src={`${API_URL}${item.thumbnail_url}`}
                          alt={item.filename}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                          {((item.file_size || 0) / (1024 * 1024)).toFixed(1)}MB
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Blurry Shots Review */}
      {activeTab === 'blurry' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              Low Sharpness Shots ({blurryPhotos.length})
            </h3>
            <span className="text-xs text-slate-400">
              Photos flagged with low Laplacian variance sharpness scores.
            </span>
          </div>

          {blurryPhotos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              No blurry photos detected in library!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {blurryPhotos.map(b => (
                <div
                  key={b.id}
                  onClick={() => toggleSelect(b.id)}
                  className={`group relative aspect-square bg-slate-100 rounded-2xl overflow-hidden cursor-pointer border-2 transition ${
                    selectedIds.includes(b.id) ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200'
                  }`}
                >
                  <img
                    src={`${API_URL}${b.thumbnail_url}`}
                    alt={b.filename}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 bg-amber-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                    Blurry Score: {b.blurriness_score ? b.blurriness_score.toFixed(0) : 'Low'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Duplicate Resolver Comparison Modal */}
      <DuplicateResolverModal
        cluster={activeCompareCluster}
        apiUrl={API_URL}
        onClose={() => setActiveCompareCluster(null)}
        onResolved={(keptId, deletedIds) => {
          fetchDuplicates();
          fetchOverview();
        }}
      />

      {/* Bill & Receipt OCR Inspector Modal */}
      <BillInspectorModal
        billId={inspectingBillId}
        apiUrl={API_URL}
        onClose={() => setInspectingBillId(null)}
        onCategoryChanged={(id, newCategory) => {
          fetchBills();
          fetchOverview();
        }}
      />
    </div>
  );
}
