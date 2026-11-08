'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
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
  X,
  Server,
  Eye,
  Link as LinkIcon
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

interface S3Status {
  connected: boolean;
  endpoint_url: string;
  public_url: string;
  console_url: string;
  bucket_name: string;
  all_buckets: string[];
  object_count: number;
  total_size_bytes: number;
  total_size_mb: number;
  region: string;
  error?: string;
}

interface S3ObjectItem {
  key: string;
  size_bytes: number;
  size_kb: number;
  last_modified: string;
  etag: string;
}

interface DatabaseStatus {
  active_dialect: 'sqlite' | 'postgresql';
  active_database_url: string;
  is_sqlite: boolean;
  is_postgres: boolean;
  table_counts: {
    media: number;
    embeddings: number;
    people: number;
    faces: number;
    albums: number;
    users: number;
    pending_disk_deletions?: number;
  };
  pgvector_active: boolean;
  hnsw_index_active: boolean;
  postgres_target_available: boolean;
  postgres_details?: {
    available: boolean;
    version?: string;
    pgvector_installed?: boolean;
    pgvector_version?: string;
    target_url?: string;
    error?: string;
  };
  supported_engines: string[];
  vector_dimension: number;
  vector_metric: string;
}

interface PendingPurgeItem {
  id: number;
  filename: string;
  original_path: string;
  host_path: string;
  file_size: number;
  mime_type?: string;
  thumbnail_url: string;
  marked_for_deletion_at: string;
  file_exists_in_mount: boolean;
}

interface PendingPurgeData {
  total_count: number;
  total_size_bytes: number;
  items: PendingPurgeItem[];
  host_prefix: string;
  container_prefix: string;
  purge_script_path: string;
}

export default function AppSettingsPage() {
  const { token: authContextToken } = useAuth();
  const [migrationModalError, setMigrationModalError] = useState<string | null>(null);

  const getAuthHeaders = useCallback((extra: Record<string, string> = {}) => {
    const token = authContextToken || (typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') || localStorage.getItem('token') : null);
    const headers: Record<string, string> = { ...extra };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [authContextToken]);

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

  // Dual-Database & pgvector state
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [loadingDbStatus, setLoadingDbStatus] = useState(false);
  const [migratingDb, setMigratingDb] = useState(false);
  const [creatingHnsw, setCreatingHnsw] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [showMigrateModal, setShowMigrateModal] = useState(false);

  // Backups & Disaster Recovery state
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupSchedule, setBackupSchedule] = useState<BackupSchedule | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoreConfirmModal, setRestoreConfirmModal] = useState<BackupItem | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [uploadingBackup, setUploadingBackup] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // S3 / MinIO Object Storage state
  const [s3Status, setS3Status] = useState<S3Status | null>(null);
  const [s3Objects, setS3Objects] = useState<S3ObjectItem[]>([]);
  const [loadingS3, setLoadingS3] = useState(false);
  const [uploadingS3, setUploadingS3] = useState(false);
  const [backingUpS3, setBackingUpS3] = useState(false);
  const [s3Filter, setS3Filter] = useState<'all' | 'photos' | 'thumbnails' | 'backups'>('all');
  const s3UploadInputRef = useRef<HTMLInputElement | null>(null);

  // Pending OS Disk Purge state (Read-Only Mount)
  const [pendingPurge, setPendingPurge] = useState<PendingPurgeData | null>(null);
  const [loadingPendingPurge, setLoadingPendingPurge] = useState(false);
  const [showPendingPurgeModal, setShowPendingPurgeModal] = useState(false);
  const [restoringPurgeId, setRestoringPurgeId] = useState<number | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/settings`, {
        headers: getAuthHeaders(),
      });
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
        fetch(`${API_URL}/api/v1/system/backups`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/v1/system/backups/schedule`, { headers: getAuthHeaders() })
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

  const fetchS3StatusAndObjects = async () => {
    setLoadingS3(true);
    try {
      const [statusRes, objectsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/storage/s3/status`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/v1/storage/s3/objects`, { headers: getAuthHeaders() })
      ]);
      if (statusRes.ok) {
        setS3Status(await statusRes.json());
      }
      if (objectsRes.ok) {
        setS3Objects(await objectsRes.json());
      }
    } catch (e) {
      console.error('Failed to load S3 status:', e);
    } finally {
      setLoadingS3(false);
    }
  };

  const fetchDbStatus = async () => {
    setLoadingDbStatus(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/system/database/status`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDbStatus(await res.json());
      }
    } catch (e) {
      console.error('Failed to load database status:', e);
    } finally {
      setLoadingDbStatus(false);
    }
  };

  const fetchPendingPurge = async () => {
    setLoadingPendingPurge(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/system/purge/pending`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setPendingPurge(await res.json());
      }
    } catch (e) {
      console.error('Failed to load pending purge list:', e);
    } finally {
      setLoadingPendingPurge(false);
    }
  };

  const handleCancelPendingPurge = async (mediaId?: number) => {
    if (mediaId) setRestoringPurgeId(mediaId);
    try {
      const body = mediaId ? { media_ids: [mediaId] } : { cancel_all: true };
      const res = await fetch(`${API_URL}/api/v1/system/purge/cancel`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setMessage({
          type: 'success',
          text: mediaId ? 'Photo restored from purge queue back to active library.' : 'All photos restored from purge queue.',
        });
        setTimeout(() => setMessage(null), 4000);
        fetchPendingPurge();
        fetchDbStatus();
      }
    } catch (e) {
      console.error('Error cancelling purge:', e);
    } finally {
      setRestoringPurgeId(null);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchBackupsAndSchedule();
    fetchS3StatusAndObjects();
    fetchDbStatus();
    fetchPendingPurge();
  }, [API_URL, authContextToken]);

  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/settings`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' })
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
        headers: getAuthHeaders(),
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
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        fetchBackupsAndSchedule();
      }
    } catch (e) {
      console.error('Failed to delete backup:', e);
    }
  };

  // S3 / MinIO Handlers
  const handleUploadS3Photos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingS3(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/storage/s3/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({
          type: 'success',
          text: `Successfully ingested ${data.uploaded_count} photos directly to S3 / MinIO storage!`
        });
        setTimeout(() => setMessage(null), 5000);
        fetchS3StatusAndObjects();
        fetchSettings();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.detail || 'Failed to upload photos to S3.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error uploading to MinIO S3 storage.' });
    } finally {
      setUploadingS3(false);
      if (s3UploadInputRef.current) s3UploadInputRef.current.value = '';
    }
  };

  const handleBackupDatabaseToS3 = async () => {
    setBackingUpS3(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/s3/backup-database`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({
          type: 'success',
          text: `Zero-downtime WAL backup exported to MinIO S3: ${data.s3_key}`
        });
        setTimeout(() => setMessage(null), 5000);
        fetchS3StatusAndObjects();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.detail || 'S3 database backup failed.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error exporting database to MinIO S3.' });
    } finally {
      setBackingUpS3(false);
    }
  };

  const handleOpenPresignedUrl = async (key: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/s3/presigned/${encodeURIComponent(key)}?expires_in=3600`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.presigned_url) {
          window.open(data.presigned_url, '_blank');
        }
      } else {
        alert('Could not generate presigned URL for this object.');
      }
    } catch (e) {
      console.error('Presigned URL error:', e);
    }
  };

  // Dual-Database & pgvector Handlers
  const handleMigrateDatabase = async () => {
    setMigratingDb(true);
    setMigrationResult(null);
    setMigrationModalError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/system/database/migrate`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok) {
        setMigrationResult(data);
        setShowMigrateModal(false);
        setMessage({
          type: 'success',
          text: `Migration completed in ${data.duration_seconds}s! Media: ${data.migrated_stats?.media || 0}, Embeddings: ${data.migrated_stats?.embeddings || 0}`
        });
        setTimeout(() => setMessage(null), 6000);
        fetchDbStatus();
      } else {
        const errorDetail = data.detail || 'Migration failed.';
        setMigrationModalError(errorDetail);
        setMessage({ type: 'error', text: errorDetail });
      }
    } catch (e: any) {
      const err = e?.message || 'Error connecting to database migration service.';
      setMigrationModalError(err);
      setMessage({ type: 'error', text: err });
    } finally {
      setMigratingDb(false);
    }
  };

  const handleCreateHnswIndex = async () => {
    setCreatingHnsw(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/system/database/create-hnsw-index`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'HNSW vector cosine index built and verified on PostgreSQL!' });
        setTimeout(() => setMessage(null), 5000);
        fetchDbStatus();
      } else {
        setMessage({ type: 'error', text: data.detail || 'Index creation failed.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error creating HNSW index.' });
    } finally {
      setCreatingHnsw(false);
    }
  };

  const handleTestPostgres = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/system/database/test-connection`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.available) {
        setMessage({
          type: 'success',
          text: `PostgreSQL connection verified! Version: ${data.version}, pgvector: v${data.pgvector_version}`
        });
        setTimeout(() => setMessage(null), 5000);
        fetchDbStatus();
      } else {
        setMessage({ type: 'error', text: `PostgreSQL connection failed: ${data.error || 'Server unreachable'}` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error testing PostgreSQL connection.' });
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

      {/* DUAL-DATABASE & PGVECTOR ENGINE SECTION */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-violet-600" />
                Database Engine & Vector Index (Dual-DB)
              </h3>
              {dbStatus?.active_dialect === 'postgresql' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  PostgreSQL 16 + pgvector • Enterprise Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  SQLite (Local WAL) • Personal Active
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Dynamic database driver supporting SQLite for lightweight local instances and PostgreSQL with pgvector for 100k+ photo libraries with sub-10ms HNSW search
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setMigrationModalError(null);
                setShowMigrateModal(true);
              }}
              disabled={migratingDb}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Migrate SQLite database into PostgreSQL pgvector container"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${migratingDb ? 'animate-spin' : ''}`} />
              <span>{migratingDb ? 'Migrating Database...' : 'Migrate to PostgreSQL'}</span>
            </button>

            {dbStatus?.is_postgres && (
              <button
                onClick={handleCreateHnswIndex}
                disabled={creatingHnsw}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                title="Build or verify HNSW index on pgvector column"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{creatingHnsw ? 'Building Index...' : 'Rebuild HNSW Index'}</span>
              </button>
            )}

            <button
              onClick={handleTestPostgres}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              title="Test connection to self-hosted PostgreSQL service"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Test Postgres</span>
            </button>

            <button
              onClick={fetchDbStatus}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
              title="Refresh database telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDbStatus ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Telemetry Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
            <p className="text-[11px] text-slate-500">Active Engine</p>
            <p className="text-xs font-bold text-slate-900 mt-1 capitalize font-mono">
              {dbStatus?.active_dialect || 'sqlite'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate" title={dbStatus?.active_database_url}>
              {dbStatus?.active_database_url || 'local sqlite'}
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
            <p className="text-[11px] text-slate-500">CLIP Vector Index</p>
            <p className="text-xs font-bold text-slate-900 mt-1">
              {dbStatus?.hnsw_index_active ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" /> HNSW Cosine (Sub-10ms)
                </span>
              ) : (
                <span className="text-slate-700">NumPy Matrix Dot Product</span>
              )}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">512 dimensions (ViT-B/32)</p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
            <p className="text-[11px] text-slate-500">Vector Embeddings</p>
            <p className="text-xs font-bold text-slate-900 mt-1 font-mono">
              {dbStatus?.table_counts?.embeddings ?? 0} vectors
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Across {dbStatus?.table_counts?.media ?? 0} photos
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
            <p className="text-[11px] text-slate-500">PostgreSQL Container</p>
            <p className="text-xs font-bold text-slate-900 mt-1">
              {dbStatus?.postgres_target_available ? (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Online (v{dbStatus.postgres_details?.version || '16'})
                </span>
              ) : (
                <span className="text-slate-500">Offline / Standby</span>
              )}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              pgvector: {dbStatus?.postgres_details?.pgvector_installed ? `v${dbStatus.postgres_details?.pgvector_version}` : 'ready'}
            </p>
          </div>
        </div>

        {/* Migration Result Banner */}
        {migrationResult && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-violet-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-violet-600" />
                Migration Complete ({migrationResult.duration_seconds}s)
              </span>
              <span className="text-[11px] text-violet-700 font-mono">
                {migrationResult.source_dialect} &rarr; {migrationResult.target_dialect}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-700 pt-1">
              <div>Photos: <strong className="font-mono">{migrationResult.migrated_stats?.media || 0}</strong></div>
              <div>Embeddings: <strong className="font-mono">{migrationResult.migrated_stats?.embeddings || 0}</strong></div>
              <div>People: <strong className="font-mono">{migrationResult.migrated_stats?.people || 0}</strong></div>
              <div>Albums: <strong className="font-mono">{migrationResult.migrated_stats?.albums || 0}</strong></div>
            </div>
            {migrationResult.hnsw_index?.hnsw_created && (
              <p className="text-[11px] text-emerald-700 font-medium">
                ⚡ HNSW Cosine index automatically created on PostgreSQL for sub-10ms semantic searches!
              </p>
            )}
          </div>
        )}
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

      {/* S3 / MinIO OBJECT STORAGE ENGINE SECTION */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-600" />
                S3 / MinIO Object Storage Engine
              </h3>
              {s3Status?.connected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  MinIO Online • Self-Hosted
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  Offline / Connecting...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Self-hosted S3-compatible object storage for zero-cloud private photo storage, RAM streaming, and disaster recovery
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={s3UploadInputRef}
              onChange={handleUploadS3Photos}
              multiple
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={() => s3UploadInputRef.current?.click()}
              disabled={uploadingS3 || !s3Status?.connected}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Upload photos directly to MinIO S3 bucket"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{uploadingS3 ? 'Ingesting to S3...' : 'Upload Photos to S3'}</span>
            </button>

            <button
              onClick={handleBackupDatabaseToS3}
              disabled={backingUpS3 || !s3Status?.connected}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Export database WAL backup directly to S3 bucket"
            >
              <FileArchive className="w-3.5 h-3.5 text-cyan-600" />
              <span>{backingUpS3 ? 'Exporting...' : 'Backup DB to S3'}</span>
            </button>

            <a
              href={s3Status?.console_url || 'http://localhost:9001'}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              title="Open MinIO Web Console (minioadmin / minioadmin123)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>MinIO Console</span>
            </a>

            <button
              onClick={fetchS3StatusAndObjects}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
              title="Refresh S3 status and objects"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingS3 ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Telemetry Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
            <p className="text-[11px] text-slate-500">S3 Endpoint</p>
            <p className="text-xs font-bold text-slate-900 mt-1 font-mono truncate" title={s3Status?.public_url || 'http://localhost:9002'}>
              {s3Status?.public_url || 'http://localhost:9002'}
            </p>
            <p className="text-[10px] text-cyan-600 mt-0.5">Port 9002 (API) • 9001 (UI)</p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
            <p className="text-[11px] text-slate-500">Active Bucket</p>
            <p className="text-xs font-bold text-slate-900 mt-1 font-mono">
              {s3Status?.bucket_name || 'mymemorypics'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Region: {s3Status?.region || 'us-east-1'}
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
            <p className="text-[11px] text-slate-500">Objects Stored</p>
            <p className="text-xs font-bold text-slate-900 mt-1 font-mono">
              {s3Status?.object_count ?? s3Objects.length} objects
            </p>
            <p className="text-[10px] text-emerald-600 mt-0.5">
              Zero-disk RAM streamed
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
            <p className="text-[11px] text-slate-500">S3 Total Size</p>
            <p className="text-xs font-bold text-slate-900 mt-1 font-mono">
              {s3Status?.total_size_mb || 0} MB
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {s3Status?.total_size_bytes ? `${Math.round(s3Status.total_size_bytes / 1024)} KB` : '0 KB'}
            </p>
          </div>
        </div>

        {/* Object Explorer */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Bucket Object Explorer ({s3Objects.length})
              </h4>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
                {(['all', 'photos', 'thumbnails', 'backups'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setS3Filter(filter)}
                    className={`px-2 py-0.5 rounded-md font-semibold capitalize transition ${
                      s3Filter === filter
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Console Credentials: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-700">minioadmin / minioadmin123</code>
            </p>
          </div>

          {s3Objects.length === 0 && !loadingS3 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl space-y-2">
              <Server className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-600">No objects in MinIO S3 bucket</p>
              <p className="text-[11px] text-slate-400">
                Upload photos or back up your database to populate the self-hosted S3 storage bucket.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 font-bold">Object Key</th>
                    <th className="py-2.5 px-3 font-bold">Category</th>
                    <th className="py-2.5 px-3 font-bold">Size</th>
                    <th className="py-2.5 px-3 font-bold">Last Modified</th>
                    <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s3Objects
                    .filter((obj) => {
                      if (s3Filter === 'photos') return obj.key.startsWith('photos/');
                      if (s3Filter === 'thumbnails') return obj.key.startsWith('thumbnails/');
                      if (s3Filter === 'backups') return obj.key.startsWith('backups/');
                      return true;
                    })
                    .map((obj) => {
                      const isPhoto = obj.key.startsWith('photos/');
                      const isThumb = obj.key.startsWith('thumbnails/');
                      const isBackup = obj.key.startsWith('backups/');
                      return (
                        <tr key={obj.key} className="hover:bg-slate-50/60 transition">
                          <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-slate-800">
                            <div className="flex items-center gap-1.5">
                              {isBackup ? (
                                <FileArchive className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              ) : isThumb ? (
                                <Layers className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                              ) : (
                                <Server className="w-3.5 h-3.5 text-cyan-600 flex-shrink-0" />
                              )}
                              <span className="truncate max-w-[280px]" title={obj.key}>
                                {obj.key}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                            {isPhoto ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-50 text-cyan-700">
                                Original Photo
                              </span>
                            ) : isThumb ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                                WebP Thumbnail
                              </span>
                            ) : isBackup ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                                DB WAL Backup
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                                General
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-mono text-[11px]">
                            {obj.size_kb < 1024
                              ? `${obj.size_kb} KB`
                              : `${(obj.size_kb / 1024).toFixed(1)} MB`}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap text-[11px]">
                            {obj.last_modified
                              ? new Date(obj.last_modified).toLocaleString()
                              : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleOpenPresignedUrl(obj.key)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition"
                              title="Generate temporary presigned URL & open"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Open URL</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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

      {/* PENDING OS DISK PURGE (READ-ONLY MOUNT) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" />
                Read-Only Mount Deletion Queue (Pending OS Purge)
              </h3>
              {(pendingPurge?.total_count || 0) > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  {pendingPurge?.total_count} files queued ({((pendingPurge?.total_size_bytes || 0) / (1024 * 1024)).toFixed(1)} MB)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Clean (0 pending)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Photos permanently deleted from read-only host mounts (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-700">{pendingPurge?.host_prefix || '/media/satish/Data2/all_extracts/'}</code>) are safely staged here. Run the script on your host terminal to physically remove them.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPendingPurgeModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>View Queued Files ({(pendingPurge?.total_count || 0)})</span>
            </button>
            <button
              type="button"
              onClick={fetchPendingPurge}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
              title="Refresh purge queue"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPendingPurge ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Script Command helper box */}
        <div className="bg-slate-950 text-slate-200 p-3.5 rounded-xl border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 font-mono">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-slate-500 select-none">$</span>
            <span className="text-emerald-400">./scripts/delete_files_marked_as_deleted.sh</span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText('./scripts/delete_files_marked_as_deleted.sh');
              setMessage({ type: 'success', text: 'Purge command copied to clipboard!' });
              setTimeout(() => setMessage(null), 3000);
            }}
            className="self-start sm:self-auto px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-sans font-semibold transition shrink-0"
          >
            Copy Command
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

      {/* Database Migration Modal */}
      {showMigrateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Migrate SQLite to PostgreSQL + pgvector</h3>
                <p className="text-xs text-slate-500">Dual-Database Engine Synchronization</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This operation safely mirrors all records (Users, Sync Sources, Media, Faces, Albums, Tags, and 512-dimensional CLIP Embeddings) from your active SQLite database into PostgreSQL.
            </p>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 border-b border-slate-200 pb-2">
                <span>Source Engine:</span>
                <span className="font-mono text-slate-900 bg-slate-200/70 px-2 py-0.5 rounded">SQLite (memorypics.db)</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 border-b border-slate-200 pb-2">
                <span>Destination Engine:</span>
                <span className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">PostgreSQL 16 + pgvector</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span>Vector Index Acceleration:</span>
                <span className="text-emerald-700 font-semibold">HNSW Cosine (&lt; 10ms)</span>
              </div>
              <p className="text-emerald-700 font-medium text-[11px] pt-1">
                🛡️ Your existing SQLite database is untouched and remains safe as an offline fallback.
              </p>
            </div>

            {migrationModalError && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs text-rose-700 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="leading-snug">{migrationModalError}</div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowMigrateModal(false);
                  setMigrationModalError(null);
                }}
                disabled={migratingDb}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMigrateDatabase}
                disabled={migratingDb}
                className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition disabled:opacity-50 flex items-center gap-2"
              >
                {migratingDb ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Migrating Tables &amp; Vectors...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5" />
                    <span>Execute Migration</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Mount Pending OS Purge Modal */}
      {showPendingPurgeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl animate-fadeIn max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Files Marked for Permanent Deletion (Read-Only Mount)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Physical files pending manual deletion via OS host script
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPendingPurgeModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Instruction Banner */}
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Host Drive Protection Active
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Because your photo library is mounted read-only (<code className="bg-amber-100/70 px-1 py-0.5 rounded font-mono">:ro</code>), Docker cannot modify your physical host files. Run this command on your host Linux terminal to delete them:
              </p>
              <div className="flex items-center justify-between bg-slate-950 text-slate-200 px-3 py-2 rounded-lg font-mono text-[11px] mt-1.5">
                <span>./scripts/delete_files_marked_as_deleted.sh</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('./scripts/delete_files_marked_as_deleted.sh');
                    setMessage({ type: 'success', text: 'Command copied!' });
                    setTimeout(() => setMessage(null), 3000);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-sans font-semibold ml-2"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
              {(!pendingPurge || pendingPurge.items.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-xs font-semibold text-slate-700">No pending disk purges</p>
                  <p className="text-[11px] text-slate-500">All read-only files are clean. No deletions queued.</p>
                </div>
              ) : (
                pendingPurge.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 hover:border-slate-300 bg-slate-50/50 transition gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-slate-200 overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                        <img
                          src={`${API_URL}${item.thumbnail_url}&token=${authContextToken || ''}`}
                          alt={item.filename}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-semibold text-slate-900 truncate" title={item.filename}>
                          {item.filename}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 truncate" title={item.host_path}>
                          {item.host_path}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{(item.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                          {item.marked_for_deletion_at && (
                            <>
                              <span>•</span>
                              <span>Marked: {new Date(item.marked_for_deletion_at).toLocaleString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCancelPendingPurge(item.id)}
                      disabled={restoringPurgeId === item.id}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-sm transition shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <RotateCcw className={`w-3 h-3 ${restoringPurgeId === item.id ? 'animate-spin' : ''}`} />
                      <span>Restore</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500 font-medium">
                Total: {pendingPurge?.total_count || 0} files ({((pendingPurge?.total_size_bytes || 0) / (1024 * 1024)).toFixed(1)} MB)
              </span>
              <div className="flex items-center gap-2">
                {(pendingPurge?.total_count || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCancelPendingPurge()}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Restore All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPendingPurgeModal(false)}
                  className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
