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
  Check
} from 'lucide-react';

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

interface DuplicateCluster {
  hash: string;
  count: number;
  items: Array<{
    id: number;
    filename: string;
    file_size: number;
    captured_at: string;
    thumbnail_url: string;
  }>;
}

export default function TriagePage() {
  const [overview, setOverview] = useState<TriageOverview | null>(null);
  const [activeTab, setActiveTab] = useState<'screenshots' | 'bills' | 'duplicates' | 'blurry'>('screenshots');
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCluster[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchOverview();
    if (activeTab === 'screenshots') fetchScreenshots();
    if (activeTab === 'duplicates') fetchDuplicates();
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
    if (!confirm(`Permanently remove ${selectedIds.length} items to trash?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/triage/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: selectedIds })
      });
      if (res.ok) {
        setSelectedIds([]);
        fetchScreenshots();
        fetchDuplicates();
        fetchOverview();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-purple-500/10 border border-amber-200/60 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-700 font-bold text-lg">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Smart Triage & Clutter Sweep
            </div>
            <p className="text-xs text-slate-600 max-w-2xl">
              Automatic segregation keeps your precious memories pure while temporary screenshots, 
              utility bills, and duplicate burst photos are managed with smart expiration rules.
            </p>
          </div>

          {/* Quick Storage Stat */}
          <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <HardDrive className="w-8 h-8 text-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Reclaimable Space</p>
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
          className={`p-4 rounded-xl border text-left transition flex items-center justify-between ${
            activeTab === 'screenshots' 
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20' 
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
            <p className="text-[11px] text-amber-600 font-medium">
              {overview?.expiring_screenshots || 0} expiring soon
            </p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('bills')}
          className={`p-4 rounded-xl border text-left transition flex items-center justify-between ${
            activeTab === 'bills' 
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20' 
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
            <p className="text-[11px] text-slate-500 font-medium">Segregated in vault</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('duplicates')}
          className={`p-4 rounded-xl border text-left transition flex items-center justify-between ${
            activeTab === 'duplicates' 
              ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-500/20' 
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
            <p className="text-[11px] text-slate-500 font-medium">pHash cluster match</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('blurry')}
          className={`p-4 rounded-xl border text-left transition flex items-center justify-between ${
            activeTab === 'blurry' 
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20' 
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
            <p className="text-[11px] text-slate-500 font-medium">Low sharpness score</p>
          </div>
        </button>
      </div>

      {/* Multi-Select Action Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-lg sticky top-4 z-20 animate-fadeIn">
          <span className="text-xs font-medium">
            {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            {activeTab === 'screenshots' && (
              <button
                onClick={() => handleSnooze(30)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Snooze +30 Days
              </button>
            )}
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Tab: Screenshots with Expiration Rules */}
      {activeTab === 'screenshots' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              Ephemeral Screenshots ({screenshots.length})
            </h3>
            <span className="text-xs text-slate-400">
              Select items to snooze retention or sweep to trash
            </span>
          </div>

          {screenshots.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
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
                    className={`relative aspect-[9/16] bg-slate-100 rounded-xl overflow-hidden cursor-pointer border-2 transition ${
                      isSelected ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={`${API_URL}${s.thumbnail_url}`}
                      alt={s.filename}
                      className="w-full h-full object-cover"
                    />

                    {/* Expiry Pill */}
                    <div className="absolute top-2 left-2 right-2 flex justify-between items-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md ${
                        s.is_expired 
                          ? 'bg-red-600 text-white' 
                          : 'bg-black/60 text-white'
                      }`}>
                        {s.is_expired ? 'Expired' : `${s.days_left}d left`}
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

      {/* Tab: Duplicate Clusters */}
      {activeTab === 'duplicates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              Duplicate & Burst Clusters ({duplicates.length})
            </h3>
            <span className="text-xs text-slate-400">
              Side-by-side comparison. Keep the best, delete the rest.
            </span>
          </div>

          {duplicates.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
              No duplicate clusters detected.
            </div>
          ) : (
            <div className="space-y-4">
              {duplicates.map((cluster, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Cluster #{idx + 1} ({cluster.count} matching images)</span>
                    <span className="font-mono text-[10px]">pHash: {cluster.hash}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {cluster.items.map(item => {
                      const isSelected = selectedIds.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleSelect(item.id)}
                          className={`relative aspect-square bg-slate-100 rounded-lg overflow-hidden cursor-pointer border-2 ${
                            isSelected ? 'border-purple-600' : 'border-transparent'
                          }`}
                        >
                          <img
                            src={`${API_URL}${item.thumbnail_url}`}
                            alt={item.filename}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
