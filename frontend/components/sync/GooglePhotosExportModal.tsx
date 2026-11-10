'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Download,
  Search,
  FileText,
  AlertTriangle,
  Layers,
  Sparkles,
  Info,
  Calendar
} from 'lucide-react';

export interface GooglePhotosExportItem {
  id?: number;
  filename: string;
  file_size?: number;
  host_path?: string;
  captured_at?: string | null;
  thumbnail_url?: string;
}

interface GooglePhotosExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: GooglePhotosExportItem[];
  title?: string;
  subtitle?: string;
}

export type QueryFormat = 'smart' | 'quoted' | 'basename' | 'raw';

export const GooglePhotosExportModal: React.FC<GooglePhotosExportModalProps> = ({
  isOpen,
  onClose,
  items,
  title = 'Google Photos Deletion Helper',
  subtitle = 'Search and trash photos in your Google Photos cloud account'
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [searchFilter, setSearchFilter] = useState('');
  const [queryFormat, setQueryFormat] = useState<QueryFormat>('smart');
  const [batchSize, setBatchSize] = useState<number>(10);
  const [separator, setSeparator] = useState<'OR' | 'space'>('OR');

  // Extract filenames safely and deduplicate
  const filenames = useMemo(() => {
    const raw = items.map((i) => (i.filename || '').trim()).filter(Boolean);
    return Array.from(new Set(raw));
  }, [items]);

  // Unique dates for 1-click day-based Google Photos searching
  const dateGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.captured_at) {
        const d = item.captured_at.slice(0, 10);
        map.set(d, (map.get(d) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  // Helper to format individual filename token for Google Photos query
  const formatToken = (name: string, format: QueryFormat) => {
    let clean = (name || '').trim().replace(/"/g, '');
    if (format === 'basename') {
      const lastDot = clean.lastIndexOf('.');
      if (lastDot > 0) clean = clean.substring(0, lastDot);
    }
    if (format === 'raw') {
      return clean;
    }
    if (format === 'quoted') {
      return `"${clean}"`;
    }
    // 'smart': Crucial fix for Google Photos - wrap in quotes if the filename contains
    // spaces, ANY hyphen '-' (which Google treats as NOT/exclusion), parentheses, or brackets
    if (/[\s\-[\]()+]/.test(clean)) {
      return `"${clean}"`;
    }
    return clean;
  };

  // Split into batches according to chosen batch size
  const batches = useMemo(() => {
    const res: string[][] = [];
    const size = batchSize > 0 ? batchSize : 10;
    for (let i = 0; i < filenames.length; i += size) {
      res.push(filenames.slice(i, i + size));
    }
    return res.length > 0 ? res : [[]];
  }, [filenames, batchSize]);

  const currentBatch = batches[activeBatchIndex] || batches[0] || [];
  const sepStr = separator === 'OR' ? ' OR ' : ' ';

  // Formatted queries with proper quoting and format selection
  const currentBatchQuery = useMemo(() => {
    return currentBatch.map((fn) => formatToken(fn, queryFormat)).join(sepStr);
  }, [currentBatch, queryFormat, sepStr]);

  const fullQuery = useMemo(() => {
    return filenames.map((fn) => formatToken(fn, queryFormat)).join(sepStr);
  }, [filenames, queryFormat, sepStr]);

  // Current batch search URL
  const currentBatchSearchUrl = useMemo(() => {
    if (!currentBatchQuery) return 'https://photos.google.com';
    return `https://photos.google.com/search/${encodeURIComponent(currentBatchQuery)}`;
  }, [currentBatchQuery]);

  // Filtered items in view
  const filteredItems = useMemo(() => {
    if (!searchFilter.trim()) return items;
    const q = searchFilter.toLowerCase();
    return items.filter(
      (it) =>
        (it.filename && it.filename.toLowerCase().includes(q)) ||
        (it.host_path && it.host_path.toLowerCase().includes(q))
    );
  }, [items, searchFilter]);

  if (!isOpen) return null;

  const handleCopy = async (text: string, typeKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(typeKey);
      setTimeout(() => setCopiedType(null), 3000);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  };

  const handleDownloadCsv = () => {
    const headers = ['Filename', 'Size_Bytes', 'Size_MB', 'Host_Path', 'Date_Marked', 'Google_Photos_Search_URL'];
    const rows = items.map((it) => {
      const fn = it.filename || '';
      const sizeBytes = it.file_size || 0;
      const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);
      const hostPath = it.host_path || '';
      const dateMarked = it.captured_at || '';
      const formattedFn = formatToken(fn, queryFormat);
      const searchUrl = `https://photos.google.com/search/${encodeURIComponent(formattedFn)}`;
      return [
        `"${fn.replace(/"/g, '""')}"`,
        sizeBytes,
        sizeMb,
        `"${hostPath.replace(/"/g, '""')}"`,
        `"${dateMarked}"`,
        `"${searchUrl}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `google_photos_purge_list_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTxt = () => {
    const textContent = filenames.join('\n');
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `google_photos_filenames_${new Date().toISOString().slice(0, 10)}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 via-rose-500 to-indigo-600 p-0.5 shadow-md flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex items-center justify-center">
                <Search className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {title}
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  {filenames.length} items
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step-by-Step 3-Step Banner with Google Syntax Note */}
        <div className="bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-pink-50/80 dark:from-slate-800/60 dark:via-slate-800/40 dark:to-slate-800/60 border border-indigo-100 dark:border-slate-700/80 rounded-2xl p-4 text-xs space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-300">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>How to trash these in Google Photos (3 Quick Steps):</span>
            </div>
            <span className="text-[10px] text-slate-500 bg-white/70 dark:bg-slate-900/60 px-2 py-0.5 rounded-full border border-indigo-100/60 dark:border-slate-700">
              💡 Hyphens safely quoted to prevent Google negation exclusion
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-indigo-100/60 dark:border-slate-700 text-slate-700 dark:text-slate-300">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">1.</span>
              Click <b className="text-slate-900 dark:text-white">Copy & Open Google Photos</b> below.
            </div>
            <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-indigo-100/60 dark:border-slate-700 text-slate-700 dark:text-slate-300">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">2.</span>
              Select matched photos in Google Photos (or press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px] font-mono">Shift</kbd> to select range).
            </div>
            <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-indigo-100/60 dark:border-slate-700 text-slate-700 dark:text-slate-300">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">3.</span>
              Press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px] font-mono">#</kbd> or click the <b className="text-rose-600 dark:text-rose-400">Trash</b> icon.
            </div>
          </div>
        </div>

        {/* 1-Click Date Search Pills (Google Photos native date headers allow selecting all photos in a day with 1 click) */}
        {dateGroups.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-thin">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>Search by Date:</span>
            </span>
            {dateGroups.slice(0, 8).map(([dStr, count]) => (
              <a
                key={dStr}
                href={`https://photos.google.com/search/${encodeURIComponent(dStr)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-semibold transition shrink-0 shadow-2xs"
                title={`Open all photos from ${dStr} in Google Photos (${count} photos). Click the date checkmark to select all.`}
              >
                <span>{dStr}</span>
                <span className="text-[9px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.2 rounded-full font-bold">
                  {count}
                </span>
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </a>
            ))}
          </div>
        )}

        {/* Batch Selector if > 1 batch */}
        {batches.length > 1 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                Google Photos Batches ({batchSize} per search):
              </span>
              <span className="text-slate-400 text-[11px]">
                Batch {activeBatchIndex + 1} of {batches.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {batches.map((b, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveBatchIndex(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    activeBatchIndex === idx
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Batch {idx + 1} ({b.length} items)
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Primary Action Box */}
        <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {batches.length > 1
                ? `Google Photos Search Query (Batch ${activeBatchIndex + 1} of ${batches.length}):`
                : 'Google Photos Search Query:'}
            </span>

            {/* Query Options Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Batch Size Selector */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0.5 rounded-xl text-[10px]">
                <span className="text-slate-400 px-1 font-semibold">Size:</span>
                {[5, 10, 15].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      setBatchSize(sz);
                      setActiveBatchIndex(0);
                    }}
                    className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                      batchSize === sz
                        ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>

              {/* Format Selector: Smart Quoting vs Quoted vs Base Name vs Raw */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0.5 rounded-xl text-[10px]">
                <button
                  type="button"
                  onClick={() => setQueryFormat('smart')}
                  className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                    queryFormat === 'smart'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Auto-quotes hyphens & spaces to prevent exclusion, keeps clean filenames unquoted"
                >
                  Smart Match
                </button>
                <button
                  type="button"
                  onClick={() => setQueryFormat('quoted')}
                  className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                    queryFormat === 'quoted'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Encloses every filename in quotes for literal exact string matching"
                >
                  Quote All
                </button>
                <button
                  type="button"
                  onClick={() => setQueryFormat('basename')}
                  className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                    queryFormat === 'basename'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Base filename without extension (.jpg/.png) - useful if Google Photos stripped extension"
                >
                  Base Name
                </button>
                <button
                  type="button"
                  onClick={() => setQueryFormat('raw')}
                  className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                    queryFormat === 'raw'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Raw unquoted filenames joined by OR"
                >
                  Raw
                </button>
              </div>

              {/* Separator Toggle: OR vs Space */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0.5 rounded-xl text-[10px]">
                <button
                  type="button"
                  onClick={() => setSeparator('OR')}
                  className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                    separator === 'OR'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Join terms with OR"
                >
                  OR
                </button>
                <button
                  type="button"
                  onClick={() => setSeparator('space')}
                  className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                    separator === 'space'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Join terms with spaces"
                >
                  Space
                </button>
              </div>
            </div>
          </div>

          {/* Query String Display */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 font-mono text-xs text-slate-800 dark:text-slate-200 overflow-x-auto max-h-24 select-all leading-relaxed">
            {currentBatchQuery || 'No items to display'}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* 1-Click Copy & Open Google Photos with Auto-Advance */}
            <button
              type="button"
              onClick={async () => {
                await handleCopy(currentBatchQuery, `batch_${activeBatchIndex}`);
                window.open(currentBatchSearchUrl, '_blank', 'noopener,noreferrer');
                if (activeBatchIndex < batches.length - 1) {
                  setActiveBatchIndex((prev) => prev + 1);
                }
              }}
              disabled={!currentBatchQuery}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Copy query and open Google Photos in new tab (auto-advances to next batch)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>
                {batches.length > 1 && activeBatchIndex < batches.length - 1
                  ? 'Copy & Open ➔ Next Batch'
                  : 'Copy & Open Google Photos'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleCopy(currentBatchQuery, `batch_only_${activeBatchIndex}`)}
              disabled={!currentBatchQuery}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              {copiedType === `batch_only_${activeBatchIndex}` ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Query</span>
                </>
              )}
            </button>

            {batches.length > 1 && (
              <button
                type="button"
                onClick={() => handleCopy(fullQuery, 'full_query')}
                className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {copiedType === 'full_query' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Copied All {filenames.length}!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy All ({filenames.length})</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => handleCopy(filenames.join('\n'), 'filenames_list')}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition"
              title="Copy newline-separated list of filenames"
            >
              {copiedType === 'filenames_list' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Copied List!</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy List</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition ml-auto"
              title="Download CSV report with links"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Scrollable File List with Individual Search Links & Copy */}
        <div className="flex-1 overflow-hidden flex flex-col space-y-2 min-h-[160px]">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Included Files ({filteredItems.length}):
            </span>
            <input
              type="text"
              placeholder="Filter by filename..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 w-44"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 dark:border-slate-800 rounded-xl p-1.5">
            {filteredItems.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No matching files found.</p>
            ) : (
              filteredItems.map((item, idx) => {
                const itemFormatted = formatToken(item.filename, queryFormat);
                const itemUrl = `https://photos.google.com/search/${encodeURIComponent(itemFormatted)}`;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 transition text-xs gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={item.filename}>
                        {item.filename}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        {item.file_size ? <span>{(item.file_size / (1024 * 1024)).toFixed(2)} MB</span> : null}
                        {item.captured_at && <span>• {item.captured_at.slice(0, 10)}</span>}
                        {item.host_path && (
                          <span className="truncate max-w-[240px]" title={item.host_path}>
                            • {item.host_path}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(itemFormatted, `row_${idx}`)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        title={`Copy ${itemFormatted}`}
                      >
                        {copiedType === `row_${idx}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <a
                        href={itemUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg text-[11px] font-semibold transition shrink-0"
                        title={`Search ${itemFormatted} in Google Photos`}
                      >
                        <span>Search</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            Paste queries directly into Google Photos search bar
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};