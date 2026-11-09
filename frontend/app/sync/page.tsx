'use client';

import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '@/utils/apiUrl';
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
  Play,
  Server,
  UploadCloud
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

interface S3StorageStatus {
  connected: boolean;
  endpoint_url: string;
  public_url: string;
  console_url: string;
  bucket_name: string;
  object_count: number;
  total_size_mb: number;
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

  // S3 / MinIO State
  const [s3Status, setS3Status] = useState<S3StorageStatus | null>(null);
  const [uploadingS3, setUploadingS3] = useState(false);
  const s3InputRef = useRef<HTMLInputElement | null>(null);

  const API_URL = getApiUrl();
  const REDIRECT_URI = `${API_URL}/api/v1/sync/google/callback`;

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? (localStorage.getItem('memorypics_token') || localStorage.getItem('token')) : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const fetchSources = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/sync/sources`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSources(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchS3Status = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/s3/status`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setS3Status(data);
      }
    } catch (e) {
      console.error('Failed to load S3 status:', e);
    }
  };

  const handleUploadS3 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingS3(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('memorypics_token') || localStorage.getItem('token')) : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/v1/storage/s3/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        const count = data.total_uploaded ?? data.uploaded_count ?? (data.results?.length) ?? 0;
        setSyncStatus(`Successfully uploaded & ingested ${count} photos to MinIO S3!`);
        fetchS3Status();
        fetchSources();
      } else {
        const err = await res.json();
        alert(err.detail || 'S3 upload failed');
      }
    } catch (e) {
      alert('Error uploading to S3');
    } finally {
      setUploadingS3(false);
      if (s3InputRef.current) s3InputRef.current.value = '';
    }
  };

  const triggerLocalScan = async () => {
    try {
      setScanning(true);
      setScanResult(null);
      const res = await fetch(`${API_URL}/api/v1/sync/scan-local`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ async_mode: true })
      });
      const data = await res.json();
      if (!res.ok) {
        setScanResult({ error: data.detail || data.message || 'Scan failed' });
        return;
      }
      setScanResult(data);
      fetchSources();
    } catch (e: any) {
      console.error(e);
      setScanResult({ error: e?.message || 'Network error' });
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
      if (!res.ok) {
        setSyncStatus(`Sync failed: ${data.detail || data.message || 'Server error'}`);
        return;
      }
      setSyncStatus(data.message || `Sync complete: imported ${data.synced_photos || 0} photos!`);
      fetchSources();
    } catch (e: any) {
      console.error(e);
      setSyncStatus(`Sync error: ${e?.message || 'Network error'}`);
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
    fetchS3Status();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('status') === 'connected') {
        const isSyncing = params.get('syncing') === '1';
        setSyncStatus(isSyncing 
          ? 'Google Drive connected successfully! Ingesting photos in the background...' 
          : 'Google Drive connected successfully!'
        );
        fetchSources();
        fetchS3Status();
      } else if (params.get('code')) {
        const code = params.get('code');
        const state = params.get('state');
        fetch(`${API_URL}/api/v1/sync/google/callback?code=${code}${state ? `&state=${state}` : ''}`)
          .then(res => {
            if (res.ok) {
              setSyncStatus('Google Drive connected successfully! Ingesting photos...');
              fetchSources();
              fetchS3Status();
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
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <FolderSync className="w-5 h-5 text-indigo-600" />
          Sync & Storage Sources
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Configure where MyMemoryPics discovers and stores photos. Local directory mounts, Google Drive, and self-hosted MinIO S3 object storage are supported.
        </p>
      </div>

      {syncStatus && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="text-xs font-semibold">{syncStatus}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            <div className={`border rounded-xl p-3 text-xs space-y-1 ${scanResult.error ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className="font-semibold text-slate-700">
                {scanResult.error ? 'Scan Error:' : scanResult.status === 'queued' ? 'Scan Queued in Background:' : 'Scan Complete:'}
              </p>
              <p className={scanResult.error ? 'text-rose-600' : 'text-slate-500'}>
                {scanResult.error || scanResult.message || `Scanned: ${scanResult.details?.scanned || 0} files | Added: ${scanResult.details?.added || 0} new media`}
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

        {/* MinIO S3 Object Storage Source */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">MinIO S3 Storage</h3>
                <p className="text-xs text-slate-400">
                  {s3Status?.bucket_name ? `s3://${s3Status.bucket_name}` : 'Self-hosted S3'}
                </p>
              </div>
            </div>

            {s3Status?.connected ? (
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Online • MinIO Engine
                  </span>
                  <span className="text-[11px] font-bold text-slate-700">
                    {s3Status.object_count} objects ({s3Status.total_size_mb} MB)
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono truncate" title={s3Status.public_url}>
                  Endpoint: {s3Status.public_url}
                </p>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <p>MinIO S3 storage is currently offline or unreachable.</p>
              </div>
            )}

            <p className="text-xs text-slate-600 leading-relaxed">
              Store originals and stream WebP thumbnails directly from self-hosted MinIO object storage without local disk dependency.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
              <p className="text-[11px] font-semibold text-slate-600">MinIO Web Console:</p>
              <p className="text-[11px] text-slate-500 font-mono">
                {s3Status?.console_url || 'http://localhost:9001'}
              </p>
              <p className="text-[10px] text-slate-400">
                User: <code className="text-slate-700 font-semibold">minioadmin / minioadmin123</code>
              </p>
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <input
              type="file"
              ref={s3InputRef}
              onChange={handleUploadS3}
              multiple
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={() => s3InputRef.current?.click()}
              disabled={uploadingS3 || !s3Status?.connected}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              <UploadCloud className={`w-3.5 h-3.5 ${uploadingS3 ? 'animate-bounce' : ''}`} />
              {uploadingS3 ? 'Ingesting to S3...' : 'Upload Photos to S3'}
            </button>

            <a
              href={s3Status?.console_url || 'http://localhost:9001'}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              Open MinIO Console
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
