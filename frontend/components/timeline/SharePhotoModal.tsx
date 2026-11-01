'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  QrCode, 
  ExternalLink, 
  Trash2, 
  Send, 
  Download,
  Image as ImageIcon,
  Loader2
} from 'lucide-react';
import { MediaItem } from './PhotoCard';

interface SharePhotoModalProps {
  photo: MediaItem | null;
  apiUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

export const SharePhotoModal: React.FC<SharePhotoModalProps> = ({
  photo,
  apiUrl,
  isOpen,
  onClose,
}) => {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = shareToken ? `${currentOrigin}/share/photo/${shareToken}` : '';
  const directImageUrl = shareToken ? `${apiUrl}/api/v1/media/public/share/${shareToken}` : '';

  useEffect(() => {
    if (isOpen && photo) {
      handleGenerateShare();
    } else {
      setShareToken(null);
      setCopied(false);
    }
  }, [isOpen, photo?.id]);

  const handleGenerateShare = async () => {
    if (!photo) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('memorypics_token');
      const res = await fetch(`${apiUrl}/api/v1/media/${photo.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setShareToken(data.share_token);
      }
    } catch (e) {
      console.error('Failed to generate share link:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!photo) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('memorypics_token');
      await fetch(`${apiUrl}/api/v1/media/${photo.id}/share`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      setShareToken(null);
      onClose();
    } catch (e) {
      console.error('Failed to revoke share link:', e);
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

  const handleCopyMarkdown = () => {
    if (!photo || !shareUrl) return;
    const md = `![${photo.filename}](${shareUrl})`;
    navigator.clipboard.writeText(md);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  const handleNativeShare = async () => {
    if (!photo || !shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Shared Photo: ${photo.filename}`,
          text: `Check out this photo from MyMemoryPics`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  if (!isOpen || !photo) return null;

  const qrImageUrl = shareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(shareUrl)}`
    : '';

  return (
    <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Share Photo
              </h3>
              <p className="text-xs text-slate-500 truncate max-w-[220px]">
                {photo.filename}
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

        {loading && !shareToken ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <span>Creating secure share link...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Photo Preview & QR Code side-by-side */}
            <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 flex-shrink-0 shadow-sm">
                <img
                  src={`${apiUrl}/api/v1/media/${photo.id}/thumbnail?size=256`}
                  alt={photo.filename}
                  className="w-full h-full object-cover"
                />
              </div>

              {qrImageUrl && (
                <div className="flex-1 flex flex-col items-center justify-center p-2 bg-white rounded-xl shadow-xs border border-slate-200">
                  <img
                    src={qrImageUrl}
                    alt="Scan QR to View"
                    className="w-20 h-20 object-contain"
                  />
                  <span className="text-[10px] text-slate-500 font-medium mt-1">
                    Scan with Phone
                  </span>
                </div>
              )}
            </div>

            {/* Share Link Copy Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Public Web Link
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

            {/* Quick Share Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleNativeShare}
                className="w-full py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Send className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Share via App...</span>
              </button>

              <button
                onClick={handleCopyMarkdown}
                className="w-full py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                {copiedMd ? <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" /> : <ImageIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                <span>{copiedMd ? 'Copied MD!' : 'Copy Markdown'}</span>
              </button>
            </div>

            {/* Bottom Actions: Revoke vs Open Guest View */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800">
              <button
                onClick={handleRevokeShare}
                disabled={loading}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revoke Share</span>
              </button>

              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <span>View Public Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
