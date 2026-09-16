'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sliders, 
  Cpu, 
  HardDrive, 
  ShieldCheck, 
  ShieldAlert, 
  Cloud, 
  Database, 
  RefreshCw, 
  Trash2, 
  Check, 
  AlertTriangle,
  Sparkles,
  Info,
  Layers,
  Lock,
  ExternalLink,
  Download,
  UploadCloud,
  RotateCcw,
  Clock,
  FileArchive,
  CheckCircle2,
  X
} from 'lucide-react';

interface StorageMetrics {
  active_storage_mode: string;
  local_storage_approved: boolean;
  memory_cache_entries: number;
  memory_cache_mb: number;
  local_originals_mb: number;
  local_thumbnails_mb: number;
  total_local_disk_mb: number;
  is_volume_mounted: boolean;
}

interface AppSettings {
  storage_mode: string;
  local_storage_approved: boolean;
  use_google_cdn_thumbnails: boolean;
  max_memory_cache_mb: number;
  allowed_local_dirs: string[];
  metrics: StorageMetrics;
}

interface BackupStats {
  photos_count: number;
  people_count: number;
  faces_count: number;
  albums_count: number;
  users_count: number;
}

interface BackupItem {
  filename: string;
  created_at: string;
  size_bytes: number;
  uncompressed_bytes: number;
  compression_ratio: string;
  sha256: string;
  label: string;
  stats: BackupStats;
  status: string;
}

interface BackupSchedule {
  auto_backup_enabled: boolean;
  frequency: string;
  retention_count: number;
  last_backup_at: string | null;
}

export default function AppSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [storageMode, setStorageMode] = useState<string>('in_memory');
  const [useGoogleCdn, setUseGoogleCdn] = useState<boolean>(true);
  const [maxMemoryMb, setMaxMemoryMb] = useState<number>(512);

  // Approval modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalText, setApprovalText] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Clear cache action state
  const [clearingCache, setClearingCache] = useState(false);

  // Backups & Disaster Recovery state
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupSchedule, setBackupSchedule] = useState<BackupSchedule | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoreConfirmModal, setRestoreConfirmModal] = useState<BackupItem | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [uploadingBackup, setUploadingBackup] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/settings`);
      if (res.ok) {
        const data: AppSettings = await res.json();
        setSettings(data);
        setStorageMode(data.storage_mode);
        setUseGoogleCdn(data.use_google_cdn_thumbnails);
        setMaxMemoryMb(data.max_memory_cache_mb);
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBackupsAndSchedule = async () => {
    setLoadingBackups(true);
    try {
      const [bRes, sRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/system/backups`),
        fetch(`${API_URL}/api/v1/system/backups/schedule`)
      ]);
      if (bRes.ok) {
        setBackups(await bRes.json());
      }
      if (sRes.ok) {
        setBackupSchedule(await sRes.json());
      }
    } catch (e) {
      console.error('Failed to load backups:', e);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchBackupsAndSchedule();
  }, [API_URL]);

  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_mode: storageMode,
          use_google_cdn_thumbnails: useGoogleCdn,
          max_memory_cache_mb: maxMemoryMb,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setMessage({ type: 'success', text: 'App settings saved successfully!' });
        setTimeout(() => setMessage(null), 4000);
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to update settings.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error saving settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAuthorizeLocalStorage = async (e: React.FormEvent) => {
    e.preventDefault();
    setApprovalLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/settings/approve-local-storage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: true,
          confirmation: approvalText,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowApprovalModal(false);
        setApprovalText('');
        fetchSettings();
        setMessage({ type: 'success', text: 'Local disk storage approved by administrator.' });
        setTimeout(() => setMessage(null), 4000);
      } else {
        alert(data.detail || 'Approval confirmation mismatch.');
      }
    } catch (e) {
      alert('Error updating approval status.');
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleRevokeLocalStorage = async () => {
    if (!confirm('Revoke local storage approval? System will immediately switch to In-Memory process and prevent all disk writes.')) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/settings/approve-local-storage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: false,
          confirmation: 'revoke',
        }),
      });
      if (res.ok) {
        setStorageMode('in_memory');
        fetchSettings();
        setMessage({ type: 'success', text: 'Local storage authorization revoked. Switched to In-Memory mode.' });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearCache = async (clearDiskThumbnails = false) => {
    setClearingCache(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/settings/clear-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clear_memory: true,
          clear_local_disk_thumbnails: clearDiskThumbnails,
        }),
      });
      if (res.ok) {
        fetchSettings();
        setMessage({ 
          type: 'success', 
          text: clearDiskThumbnails ? 'RAM and local thumbnail caches flushed.' : 'In-memory stream cache flushed.' 
        });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setClearingCache(false);
    }
  };

  // Backups Handlers
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/system/backups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'manual' })
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Zero-downtime WAL backup created and verified successfully!' });
        setTimeout(() => setMessage(null), 5000);
        fetchBackupsAndSchedule();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.detail || 'Backup failed.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error connecting to backup service.' });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleUpdateSchedule = async (updates: Partial<BackupSchedule>) => {
    if (!backupSchedule) return;
    const newConfig = { ...backupSchedule, ...updates };
    try {
      const res = await fetch(`${API_URL}/api/v1/system/backups/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        setBackupSchedule(await res.json());
        setMessage({ type: 'success', text: 'Backup schedule preferences updated.' });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch (e) {
      console.error('Failed to update schedule:', e);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreConfirmModal) return;
    setRestoring(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/system/backups/${restoreConfirmModal.filename}/restore`, {
        method: 'POST'
      });
      if (res.ok) {
        const result = await res.json();
        setRestoreConfirmModal(null);
        setMessage({ 
          type: 'success', 
          text: `Database successfully restored! Pre-restore safety backup: ${result.safety_backup}` 
        });
        fetchBackupsAndSchedule();
        fetchSettings();
      } else {
        const err = await res.json();
        alert(`Restore failed: ${err.detail}`);
      }
    } catch (e) {
      alert('Network error during database restore.');
    } finally {
      setRestoring(false);
    }
  };

  const handleUploadBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Upload "${file.name}" and execute point-in-time disaster recovery restore? A safety backup will be created first.`)) {
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      return;
    }

    setUploadingBackup(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/api/v1/system/backups/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const result = await res.json();
        setMessage({ 
          type: 'success', 
          text: `Uploaded backup successfully restored! Safety backup: ${result.safety_backup}` 
        });
        fetchBackupsAndSchedule();
        fetchSettings();
      } else {
        const err = await res.json();
        alert(`Upload restore failed: ${err.detail}`);
      }
    } catch (e) {
      alert('Error uploading backup file.');
    } finally {
      setUploadingBackup(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Permanently delete backup snapshot "${filename}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/system/backups/${filename}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchBackupsAndSchedule();
      }
    } catch (e) {
      console.error('Failed to delete backup:', e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading application settings...</p>
        </div>
      </div>
    );
  }

  const isApproved = settings?.local_storage_approved ?? false;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Sliders className="w-6 h-6 text-indigo-600" />
            App & Storage Settings
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure in-memory processing, Google Drive CDN streaming (9drive architecture), and volume storage approval
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          <span>{saving ? 'Saving Changes...' : 'Save Settings'}</span>
        </button>
      </div>

      {/* Notification Toast */}
      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Primary Section: Storage & Temporary Data Policy */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              Temporary Data & Storage Strategy
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose how originals and thumbnails are stored, cached, and streamed
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isApproved ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Local Storage Approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                Zero-Disk Mode (Unapproved)
              </span>
            )}
          </div>
        </div>

        {/* Strategy Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1: In-Memory / Google Drive Direct */}
          <div
            onClick={() => setStorageMode('in_memory')}
            className={`p-5 rounded-2xl border-2 cursor-pointer transition relative flex flex-col justify-between space-y-4 ${
              storageMode === 'in_memory'
                ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">In-Memory / Google Drive Direct</h3>
                    <span className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">
                      Default • 9drive Architecture
                    </span>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  storageMode === 'in_memory' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                }`}>
                  {storageMode === 'in_memory' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Zero local storage or Docker volume mount consumed for temporary data. Thumbnails stream directly via Google Drive CDN (<code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded font-mono">=s&#123;size&#125;</code>), and originals stream on-the-fly through RAM buffers.
              </p>
            </div>

            <ul className="space-y-1.5 text-[11px] text-slate-500 border-t border-slate-200/60 pt-3">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>Zero bytes written to local disk / volume mount</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>Global Google edge CDN thumbnail caching</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>AI triage, EXIF & faces processed in RAM</span>
              </li>
            </ul>
          </div>

          {/* Option 2: Local Disk / Volume Mount Caching */}
          <div
            onClick={() => {
              if (!isApproved) {
                setShowApprovalModal(true);
              } else {
                setStorageMode('local_disk');
              }
            }}
            className={`p-5 rounded-2xl border-2 cursor-pointer transition relative flex flex-col justify-between space-y-4 ${
              storageMode === 'local_disk'
                ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            } ${!isApproved ? 'opacity-85' : ''}`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Local Disk / Volume Mount Caching</h3>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      {isApproved ? 'Authorized' : 'Approval Required'}
                    </span>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  storageMode === 'local_disk' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                }`}>
                  {storageMode === 'local_disk' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Permits creating local directories and caching full-size originals and multi-tier WebP thumbnails into the Docker volume mount (<code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded font-mono">/data</code>).
              </p>
            </div>

            <div className="border-t border-slate-200/60 pt-3 flex items-center justify-between">
              {isApproved ? (
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Approved for Volume Writes
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRevokeLocalStorage();
                    }}
                    className="text-[11px] text-red-600 hover:text-red-700 font-semibold hover:underline"
                  >
                    Revoke Approval
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-600" /> Click to authorize
                  </span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-bold">
                    Admin Sign-off Required
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Configuration: Google Drive CDN & RAM Limits */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-600" />
          Streaming & Memory Optimization
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Toggle 1: Google Drive Direct CDN */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="toggle-google-cdn" className="text-xs font-bold text-slate-800 cursor-pointer">
                Google Drive Direct CDN Thumbnails
              </label>
              <input
                id="toggle-google-cdn"
                type="checkbox"
                checked={useGoogleCdn}
                onChange={(e) => setUseGoogleCdn(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              When enabled, thumbnails are loaded directly from Google&apos;s edge CDN with dynamic sizing (<code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded font-mono">=s256, =s1080</code>), completely bypassing the server and saving 100% of thumbnail disk space.
            </p>
          </div>

          {/* Selector 2: RAM Buffer Limit */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">
                In-Memory RAM Buffer Allocation
              </label>
              <span className="text-xs font-bold text-indigo-600 font-mono">
                {maxMemoryMb} MB
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Maximum RAM headroom allocated for streaming chunks, EXIF analysis, and in-memory AI classification.
            </p>
            <div className="grid grid-cols-4 gap-2 pt-1">
              {[256, 512, 1024, 2048].map((mb) => (
                <button
                  key={mb}
                  type="button"
                  onClick={() => setMaxMemoryMb(mb)}
                  className={`py-1.5 text-xs rounded-xl font-semibold border transition ${
                    maxMemoryMb === mb
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {mb} MB
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BACKUPS & DISASTER RECOVERY SECTION */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              Automated WAL Backups & Disaster Recovery
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Zero-downtime online SQLite WAL snapshots, point-in-time restore, automated schedules, and offsite downloads
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input 
              type="file" 
              ref={uploadInputRef} 
              onChange={handleUploadBackupFile} 
              accept=".db,.gz" 
              className="hidden" 
            />
            <button
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadingBackup}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Upload an existing .db or .db.gz backup file to restore"
            >
              <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
              <span>{uploadingBackup ? 'Restoring Upload...' : 'Upload & Restore'}</span>
            </button>

            <button
              onClick={handleCreateBackup}
              disabled={creatingBackup}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              <FileArchive className="w-3.5 h-3.5" />
              <span>{creatingBackup ? 'Creating Snapshot...' : 'Create Backup Now'}</span>
            </button>
          </div>
        </div>

        {/* Schedule & Retention Policy Card */}
        {backupSchedule && (
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-slate-800">Automated Daily / Weekly Schedule</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Last automated backup:{' '}
                  <span className="font-semibold text-slate-700">
                    {backupSchedule.last_backup_at
                      ? new Date(backupSchedule.last_backup_at).toLocaleString()
                      : 'None recorded yet'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Enable toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={backupSchedule.auto_backup_enabled}
                  onChange={(e) => handleUpdateSchedule({ auto_backup_enabled: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <span>Auto-Backup</span>
              </label>

              {/* Frequency */}
              <select
                value={backupSchedule.frequency}
                onChange={(e) => handleUpdateSchedule({ frequency: e.target.value })}
                className="text-xs font-medium bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>

              {/* Retention limit */}
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="text-[11px]">Keep last:</span>
                <select
                  value={backupSchedule.retention_count}
                  onChange={(e) => handleUpdateSchedule({ retention_count: Number(e.target.value) })}
                  className="text-xs font-medium bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={7}>7 snapshots</option>
                  <option value={14}>14 snapshots</option>
                  <option value={30}>30 snapshots</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Snapshots Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Available Snapshots ({backups.length})
            </h4>
            <button
              onClick={fetchBackupsAndSchedule}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loadingBackups ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {backups.length === 0 && !loadingBackups ? (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl space-y-2">
              <Database className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-600">No database snapshots found</p>
              <p className="text-[11px] text-slate-400">
                Click &ldquo;Create Backup Now&rdquo; to generate a zero-downtime compressed WAL backup of your library.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 font-bold">Snapshot Filename</th>
                    <th className="py-2.5 px-3 font-bold">Created At</th>
                    <th className="py-2.5 px-3 font-bold">Size</th>
                    <th className="py-2.5 px-3 font-bold">Stats</th>
                    <th className="py-2.5 px-3 font-bold">SHA-256 Checksum</th>
                    <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {backups.map((item) => (
                    <tr key={item.filename} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <FileArchive className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <span className="truncate max-w-[200px]" title={item.filename}>
                            {item.filename}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap text-[11px]">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-mono text-[11px]">
                        {Math.round(item.size_bytes / 1024)} KB{' '}
                        <span className="text-[10px] text-emerald-600 font-sans">
                          ({item.compression_ratio})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap text-[11px]">
                        {item.stats ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                            {item.stats.photos_count} photos • {item.stats.albums_count} albums
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                        <span className="truncate max-w-[120px] block" title={item.sha256}>
                          {item.sha256 ? `${item.sha256.slice(0, 12)}...` : 'Verified'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Download */}
                          <a
                            href={`${API_URL}/api/v1/system/backups/${item.filename}/download`}
                            download={item.filename}
                            className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded transition"
                            title="Download backup archive (.db.gz)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>

                          {/* Restore */}
                          <button
                            onClick={() => setRestoreConfirmModal(item)}
                            className="p-1 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                            title="Point-in-time Disaster Recovery Restore"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteBackup(item.filename)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                            title="Delete Snapshot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Live Storage Metrics & Telemetry Dashboard */}
      {settings?.metrics && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              Live Storage & Volume Telemetry
            </h3>
            <button
              onClick={fetchSettings}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
              title="Refresh Storage Metrics"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
              <p className="text-[11px] text-slate-500">Active Mode</p>
              <p className="text-xs font-bold text-slate-900 mt-1 capitalize">
                {settings.metrics.active_storage_mode.replace('_', ' ')}
              </p>
              <p className="text-[10px] text-emerald-600 mt-0.5">
                {settings.metrics.active_storage_mode === 'in_memory' ? 'Zero-Disk Guaranteed' : 'Volume Mounted'}
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
              <p className="text-[11px] text-slate-500">In-Memory Cache</p>
              <p className="text-xs font-bold text-slate-900 mt-1 font-mono">
                {settings.metrics.memory_cache_entries} entries
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {settings.metrics.memory_cache_mb} MB in RAM
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
              <p className="text-[11px] text-slate-500">Local Volume Mount</p>
              <p className="text-xs font-bold text-slate-900 mt-1">
                {settings.metrics.is_volume_mounted ? '/data (Connected)' : 'None'}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Total: {settings.metrics.total_local_disk_mb} MB
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
              <p className="text-[11px] text-slate-500">Thumbnails on Disk</p>
              <p className="text-xs font-bold text-slate-900 mt-1 font-mono">
                {settings.metrics.local_thumbnails_mb} MB
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Originals: {settings.metrics.local_originals_mb} MB
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance & Cache Operations */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-slate-500" />
          Maintenance & Cache Purge
        </h3>
        <p className="text-xs text-slate-500">
          Clear temporary buffers or purge generated local thumbnails without affecting your originals or SQLite database.
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={() => handleClearCache(false)}
            disabled={clearingCache}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${clearingCache ? 'animate-spin' : ''}`} />
            <span>Flush In-Memory RAM Cache</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (confirm('Safely clear generated local WebP thumbnails? Originals and metadata remain 100% intact.')) {
                handleClearCache(true);
              }
            }}
            disabled={clearingCache}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-semibold transition disabled:opacity-50 border border-amber-200"
          >
            <Trash2 className="w-3.5 h-3.5 text-amber-600" />
            <span>Purge Local WebP Thumbnails</span>
          </button>
        </div>
      </div>

      {/* Point-in-Time Restore Confirmation Modal */}
      {restoreConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Restore Database Snapshot</h3>
                <p className="text-xs text-slate-500">Point-in-Time Disaster Recovery</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to restore the database to snapshot{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-slate-800">
                {restoreConfirmModal.filename}
              </code>
              ?
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <p className="text-slate-700 font-semibold">Snapshot Details:</p>
              <p className="text-slate-500 text-[11px]">
                Captured: {new Date(restoreConfirmModal.created_at).toLocaleString()}
              </p>
              {restoreConfirmModal.stats && (
                <p className="text-slate-500 text-[11px]">
                  Contents: {restoreConfirmModal.stats.photos_count} photos, {restoreConfirmModal.stats.albums_count} albums, {restoreConfirmModal.stats.people_count} people
                </p>
              )}
              <p className="text-emerald-700 font-medium text-[11px] pt-1">
                🛡️ A safety backup of your current database will automatically be saved before restoring.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoreConfirmModal(null)}
                disabled={restoring}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={restoring}
                className="px-5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {restoring ? 'Restoring Database...' : 'Confirm & Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local Storage Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Authorize Local Volume Storage</h3>
                <p className="text-xs text-slate-500">Administrator Sign-off</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              By approving local storage, you authorize MyMemoryPics to create directories and cache downloaded photos and thumbnails onto the local host volume mount (<code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded font-mono">/data</code>).
            </p>

            <form onSubmit={handleAuthorizeLocalStorage} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700">
                  Type <span className="font-mono text-indigo-600 select-all font-bold">I approve local disk storage</span> to confirm:
                </label>
                <input
                  type="text"
                  value={approvalText}
                  onChange={(e) => setApprovalText(e.target.value)}
                  placeholder="I approve local disk storage"
                  className="w-full mt-1.5 px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={approvalText.trim().toLowerCase() !== 'i approve local disk storage' || approvalLoading}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  {approvalLoading ? 'Authorizing...' : 'Authorize Local Storage'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowApprovalModal(false);
                    setApprovalText('');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
