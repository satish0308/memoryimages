'use client';

import React, { useState } from 'react';
import { 
  X, 
  QrCode, 
  Copy, 
  Check, 
  UploadCloud, 
  ExternalLink, 
  Trash2, 
  Sparkles,
  Share2
} from 'lucide-react';

interface ShareEventModalProps {
  album: {
    id: number;
    name: string;
    share_token?: string | null;
    is_public?: boolean;
    allow_guest_uploads?: boolean;
  } | null;
  apiUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onShareUpdated: () => void;
}

export const ShareEventModal: React.FC<ShareEventModalProps> = ({
  album,
  apiUrl,
  isOpen,
  onClose,
  onShareUpdated,
}) => {
  const [copied, setCopied] = useState(false);
  const [allowGuestUploads, setAllowGuestUploads] = useState<boolean>(
    Boolean(album?.allow_guest_uploads)
  );
  const [loading, setLoading] = useState(false);

  if (!isOpen || !album) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareToken = album.share_token;
  const shareUrl = shareToken ? `${currentOrigin}/share/${shareToken}` : '';

  const handleEnableShare = async (allowUploads: boolean) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('memorypics_token');
      const res = await fetch(`${apiUrl}/api/v1/albums/${album.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          is_public: true,
          allow_guest_uploads: allowUploads,
        }),
      });
      if (res.ok) {
        onShareUpdated();
      }
    } catch (e) {
      console.error('Failed to update share:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeShare = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('memorypics_token');
      const res = await fetch(`${apiUrl}/api/v1/albums/${album.id}/share`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        onShareUpdated();
        onClose();
      }
    } catch (e) {
      console.error('Failed to revoke share:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrImageUrl = shareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(shareUrl)}`
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6 relative">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Share Event Album
              </h3>
              <p className="text-xs text-slate-500 truncate max-w-[240px]">
                {album.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Share Status: Active vs Not Yet Shared */}
        {shareToken && album.is_public ? (
          <div className="space-y-5">
            {/* QR Code Presentation */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-3">
              <div className="w-48 h-48 bg-white p-2 rounded-xl shadow-md border border-slate-200">
                <img
                  src={qrImageUrl}
                  alt="QR Code for Shared Event Album"
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-center text-xs text-slate-500">
                Guests can scan this QR code with any smartphone camera to view or upload to this album.
              </p>
            </div>

            {/* Share URL & Copy Button */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Public Guest Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                >
                  {copied ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Guest Upload Permissions Toggle */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <UploadCloud className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Allow Guest Uploads
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Friends can drop photos into this album without logging in
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowGuestUploads}
                onChange={(e) => {
                  const val = e.target.checked;
                  setAllowGuestUploads(val);
                  handleEnableShare(val);
                }}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            {/* Open in New Tab & Revoke Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleRevokeShare}
                disabled={loading}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revoke Share Link</span>
              </button>

              <a
                href={`/share/${shareToken}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <span>View Guest Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ) : (
          /* Generate Share Link Initial State */
          <div className="space-y-5 text-center py-4">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
              <Share2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                Create a Public Event & QR Code
              </h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Generate a shareable link and QR code for this album. Perfect for parties, weddings, vacations, and group events.
              </p>
            </div>

            <button
              onClick={() => handleEnableShare(true)}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl text-xs font-bold shadow-lg shadow-indigo-500/25 transition transform active:scale-98 flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              <span>{loading ? 'Generating...' : 'Generate Event QR Code'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
