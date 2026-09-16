'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileText, 
  Copy, 
  Check, 
  DollarSign, 
  Calendar, 
  Download, 
  FolderSync, 
  Loader2,
  ExternalLink
} from 'lucide-react';

interface BillInspectorModalProps {
  billId: number | null;
  apiUrl: string;
  onClose: () => void;
  onCategoryChanged?: (id: number, newCategory: string) => void;
}

interface BillInspectionData {
  id: number;
  filename: string;
  captured_at: string;
  file_size: number;
  width?: number;
  height?: number;
  merchant_name: string;
  detected_amounts: string[];
  detected_dates: string[];
  extracted_text: string;
  lines_count: number;
  thumbnail_url: string;
}

export const BillInspectorModal: React.FC<BillInspectorModalProps> = ({
  billId,
  apiUrl,
  onClose,
  onCategoryChanged,
}) => {
  const [data, setData] = useState<BillInspectionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);

  useEffect(() => {
    if (!billId) {
      setData(null);
      return;
    }

    setLoading(true);
    fetch(`${apiUrl}/api/v1/triage/bills/${billId}/inspect`)
      .then((res) => (res.ok ? res.json() : null))
      .then((resData) => setData(resData))
      .catch((err) => console.error('Inspection error:', err))
      .finally(() => setLoading(false));
  }, [billId, apiUrl]);

  if (!billId) return null;

  const handleCopyText = () => {
    if (data?.extracted_text) {
      navigator.clipboard.writeText(data.extracted_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleMoveToMemories = async () => {
    if (!data) return;
    try {
      setReclassifying(true);
      const res = await fetch(`${apiUrl}/api/v1/media/batch-category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: [data.id], category: 'memory' }),
      });
      if (res.ok) {
        if (onCategoryChanged) onCategoryChanged(data.id, 'memory');
        onClose();
      }
    } catch (e) {
      console.error('Error reclassifying:', e);
    } finally {
      setReclassifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col md:flex-row">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full transition shadow-lg"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Side: Document Preview */}
        <div className="relative flex-1 bg-black flex items-center justify-center p-4 min-h-[350px] overflow-hidden">
          {data ? (
            <img
              src={`${apiUrl}/api/v1/media/${data.id}/view`}
              alt={data.filename}
              className="max-h-[80vh] max-w-full object-contain rounded-xl shadow-2xl"
            />
          ) : (
            <div className="flex items-center justify-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          )}
        </div>

        {/* Right Side: OCR Text & Invoice Metadata Drawer */}
        <div className="w-full md:w-96 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 p-6 text-white flex flex-col justify-between overflow-y-auto max-h-[80vh] md:max-h-[92vh]">
          {loading || !data ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Document Title / Merchant */}
              <div>
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Document & Receipt Vault</span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1 truncate" title={data.filename}>
                  {data.merchant_name}
                </h2>
                <p className="text-xs text-slate-400">{data.filename}</p>
              </div>

              {/* Extracted Amount Highlights */}
              {data.detected_amounts && data.detected_amounts.length > 0 && (
                <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/60 space-y-1.5">
                  <span className="text-[11px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-emerald-400" />
                    <span>Detected Figures & Total</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.detected_amounts.map((amt, idx) => (
                      <span
                        key={idx}
                        className="bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-mono font-bold text-xs px-2.5 py-1 rounded-lg shadow-sm"
                      >
                        ${amt}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted Dates */}
              {data.detected_dates && data.detected_dates.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>Invoice Date: <strong>{data.detected_dates[0]}</strong></span>
                </div>
              )}

              {/* Full OCR Text Inspector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Extracted Text ({data.lines_count} lines)
                  </span>
                  <button
                    onClick={handleCopyText}
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 bg-slate-800 px-2.5 py-1 rounded-lg transition"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy All</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 max-h-48 overflow-y-auto text-xs font-mono text-slate-300 whitespace-pre-wrap select-text leading-relaxed">
                  {data.extracted_text || 'No extracted text found in document image.'}
                </div>
              </div>

              {/* Document Actions */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <a
                  href={`${apiUrl}/api/v1/media/${data.id}/download`}
                  download
                  className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Document</span>
                </a>

                <button
                  type="button"
                  onClick={handleMoveToMemories}
                  disabled={reclassifying}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition border border-slate-700/60 disabled:opacity-50"
                  title="Move photo back to personal memories if misclassified"
                >
                  <FolderSync className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Move to Memories (Not a Bill)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
