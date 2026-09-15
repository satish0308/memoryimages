'use client';

import { useState, useEffect } from 'react';
import { 
  FolderSync, 
  HardDrive, 
  Cloud, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  ExternalLink,
  RefreshCw 
} from 'lucide-react';

export default function SyncPage() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [googleAuthUrl, setGoogleAuthUrl] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const triggerLocalScan = async () => {
    try {
      setScanning(true);
      setScanResult(null);
      const res = await fetch(`${API_URL}/api/v1/sync/scan-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      setScanResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const fetchGoogleAuthUrl = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/sync/google/auth-url`);
      const data = await res.json();
      if (data.auth_url) {
        setGoogleAuthUrl(data.auth_url);
      } else if (data.error || data.detail) {
        setGoogleError(data.error || data.detail);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchGoogleAuthUrl();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <FolderSync className="w-5 h-5 text-indigo-600" />
          Sync & Storage Sources
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Configure where MyMemoryPics discovers photos. Both local directories and Google Drive are supported.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Local Directory Source */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800">Local Directory Watcher</h3>
              <p className="text-xs text-slate-400">Mounted volume /data/originals</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Scans the container's media directory for photos, automatically extracts EXIF metadata,
            generates WebP thumbnails, and executes the smart classification triage.
          </p>

          <div className="pt-2">
            <button
              onClick={triggerLocalScan}
              disabled={scanning}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning Local Library...' : 'Scan Local Library Now'}
            </button>
          </div>

          {scanResult && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-slate-700">Scan Complete:</p>
              <p className="text-slate-500">
                Scanned: {scanResult.details?.scanned || 0} files | Added: {scanResult.details?.added || 0} new media
              </p>
            </div>
          )}
        </div>

        {/* Google Drive / Google Photos Source */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">Google Drive & Photos</h3>
                <p className="text-xs text-slate-400">Cloud incremental sync</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Connect your Google account using OAuth 2.0. MyMemoryPics pulls down new photos 
              in the background and sorts them seamlessly into your unified timeline.
            </p>

            {googleError && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <p>
                  To enable Google sync, set <code className="font-mono text-[11px] bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and <code className="font-mono text-[11px] bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> in your <code className="font-mono text-[11px] bg-amber-100 px-1 rounded">.env</code> file.
                </p>
              </div>
            )}
          </div>

          <div className="pt-2">
            {googleAuthUrl ? (
              <a
                href={googleAuthUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Connect Google Account
              </a>
            ) : (
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 text-slate-400 rounded-xl text-xs font-semibold cursor-not-allowed"
              >
                Google OAuth Pending Configuration
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
