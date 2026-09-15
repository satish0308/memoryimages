'use client';

import { useState, useEffect } from 'react';
import { 
  FolderSync, 
  HardDrive, 
  Cloud, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  Play
} from 'lucide-react';

interface SyncSourceItem {
  id: number;
  name: string;
  sync_type: string;
  target_path: string;
  status: string;
  items_count: number;
  last_synced_at: string | null;
}

export default function SyncPage() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [googleAuthUrl, setGoogleAuthUrl] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [sources, setSources] = useState<SyncSourceItem[]>([]);
  const [syncingGoogle, setSyncingGoogle] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const REDIRECT_URI = 'http://localhost:8000/api/v1/sync/google/callback';

  const fetchSources = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/sync/sources`);
      if (res.ok) {
        const data = await res.json();
        setSources(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

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
      fetchSources();
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const triggerGoogleSync = async (sourceId: number) => {
    try {
      setSyncingGoogle(true);
      const res = await fetch(`${API_URL}/api/v1/sync/google/${sourceId}/trigger`, {
        method: 'POST'
      });
      const data = await res.json();
      setSyncStatus(`Sync complete: imported ${data.synced_photos || 0} photos!`);
      fetchSources();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingGoogle(false);
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
    fetchSources();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('status') === 'connected') {
        const isSyncing = params.get('syncing') === '1';
        setSyncStatus(isSyncing 
          ? 'Google Drive connected successfully! Ingesting photos in the background...' 
          : 'Google Drive connected successfully!'
        );
        fetchSources();
      } else if (params.get('code')) {
        const code = params.get('code');
        const state = params.get('state');
        fetch(`${API_URL}/api/v1/sync/google/callback?code=${code}${state ? `&state=${state}` : ''}`)
          .then(res => {
            if (res.ok) {
              setSyncStatus('Google Drive connected successfully! Ingesting photos...');
              fetchSources();
            }
          })
          .catch(e => console.error(e));
      }
    }
  }, []);

  const copyRedirectUri = () => {
    navigator.clipboard.writeText(REDIRECT_URI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const googleSource = sources.find(s => s.sync_type === 'google_drive');

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

      {syncStatus && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="text-xs font-semibold">{syncStatus}</p>
        </div>
      )}

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
            Continuously monitors the container's media directory for photos, automatically extracts EXIF metadata,
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
                <p className="text-xs text-slate-400">
                  {googleSource ? googleSource.name : 'Cloud incremental sync'}
                </p>
              </div>
            </div>

            {googleSource ? (
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Connected
                  </span>
                  <span className="text-[11px] font-bold text-slate-700">
                    {googleSource.items_count || 0} photos synced
                  </span>
                </div>
                {googleSource.last_synced_at && (
                  <p className="text-[10px] text-slate-500">
                    Last sync: {new Date(googleSource.last_synced_at).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                Connect your Google account using OAuth 2.0 to import cloud photos and albums.
              </p>
            )}

            {/* Exact Redirect URI Copy Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-600">
                Required Google Cloud Console Redirect URI:
              </p>
              <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg">
                <code className="text-[11px] text-slate-800 font-mono truncate select-all">
                  {REDIRECT_URI}
                </code>
                <button
                  onClick={copyRedirectUri}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition flex-shrink-0"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {googleError && !googleSource && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <p>{googleError}</p>
              </div>
            )}
          </div>

          <div className="pt-2 space-y-2">
            {googleSource ? (
              <div className="flex gap-2">
                <button
                  onClick={() => triggerGoogleSync(googleSource.id)}
                  disabled={syncingGoogle}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingGoogle ? 'animate-spin' : ''}`} />
                  {syncingGoogle ? 'Syncing Photos...' : 'Sync Google Drive Now'}
                </button>
                {googleAuthUrl && (
                  <a
                    href={googleAuthUrl}
                    className="p-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition"
                    title="Reconnect Google Account"
                  >
                    Reconnect
                  </a>
                )}
              </div>
            ) : googleAuthUrl ? (
              <a
                href={googleAuthUrl}
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
