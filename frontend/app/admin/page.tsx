'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  HardDrive, 
  Cpu, 
  Database, 
  Trash2, 
  UserPlus, 
  Copy, 
  Check, 
  RefreshCw, 
  AlertTriangle,
  Clock,
  Sparkles,
  Link as LinkIcon,
  Activity,
  Layers,
  CheckCircle2,
  Lock,
  ChevronRight,
  Flame,
  ExternalLink,
  Terminal,
  BarChart2
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getApiUrl } from '@/utils/apiUrl';

interface SystemMetrics {
  status: string;
  timestamp: string;
  database: {
    total_media: number;
    active_media: number;
    trash_media: number;
    total_users: number;
    total_albums: number;
    total_people: number;
    total_faces: number;
    total_storage_bytes: number;
    total_storage_gb: number;
  };
  host: {
    cpu_cores: number;
    cpu_usage_percent: number;
    memory_total_gb: number;
    memory_used_gb: number;
    memory_usage_percent: number;
    disk_total_gb: number;
    disk_free_gb: number;
    disk_used_percent: number;
  };
  worker: {
    pending_queue_tasks: number;
  };
}

interface AdminUser {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_admin: boolean;
  role: string;
  storage_quota_bytes: number;
  used_storage_bytes: number;
  used_storage_mb: number;
  usage_percent: number;
  photo_count: number;
  created_at: string;
}

interface InviteTokenItem {
  id: number;
  code: string;
  invite_url: string;
  role: string;
  quota_bytes: number;
  is_used: boolean;
  used_by_user_id: number | null;
  expires_at: string | null;
  is_expired: boolean;
  created_at: string;
}

export default function AdminPortalPage() {
  const { user } = useAuth();
  const API_URL = getApiUrl();

  const [activeTab, setActiveTab] = useState<'metrics' | 'prometheus' | 'users' | 'invites' | 'trash'>('metrics');
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<InviteTokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Prometheus state
  const [rawPrometheusText, setRawPrometheusText] = useState<string>('');
  const [loadingPrometheus, setLoadingPrometheus] = useState<boolean>(false);
  const [autoRefreshPrometheus, setAutoRefreshPrometheus] = useState<boolean>(false);
  const [copiedPromUrl, setCopiedPromUrl] = useState<boolean>(false);
  const [promSearchFilter, setPromSearchFilter] = useState<string>('');

  // Invite creation form state
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member');
  const [inviteQuotaGb, setInviteQuotaGb] = useState<number>(20);
  const [inviteExpiryDays, setInviteExpiryDays] = useState<number>(7);

  // Trash purge state
  const [purgeDays, setPurgeDays] = useState<number>(30);

  const fetchAllAdminData = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const [metricsRes, usersRes, invitesRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/admin/metrics`),
        fetch(`${API_URL}/api/v1/admin/users`),
        fetch(`${API_URL}/api/v1/admin/invites`)
      ]);

      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (invitesRes.ok) setInvites(await invitesRes.json());
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
      setStatusMessage({ type: 'error', text: 'Failed to connect to admin API' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllAdminData();
  }, [API_URL]);

  const fetchPrometheusMetrics = async () => {
    try {
      setLoadingPrometheus(true);
      const res = await fetch(`${API_URL}/metrics`);
      if (res.ok) {
        const text = await res.text();
        setRawPrometheusText(text);
      }
    } catch (e) {
      console.error('Failed to fetch Prometheus metrics:', e);
    } finally {
      setLoadingPrometheus(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'prometheus') {
      fetchPrometheusMetrics();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!autoRefreshPrometheus || activeTab !== 'prometheus') return;
    const interval = setInterval(() => {
      fetchPrometheusMetrics();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefreshPrometheus, activeTab]);

  const handleUpdateUser = async (userId: number, updates: { role?: string; storage_quota_bytes?: number; is_active?: boolean }) => {
    setActionLoading(`user-${userId}`);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update user');
      }
      setStatusMessage({ type: 'success', text: 'User permissions updated successfully' });
      fetchAllAdminData();
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('create-invite');
    try {
      const quotaBytes = inviteQuotaGb > 0 ? inviteQuotaGb * 1024 * 1024 * 1024 : 0;
      const res = await fetch(`${API_URL}/api/v1/admin/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: inviteRole,
          quota_bytes: quotaBytes,
          expires_in_days: inviteExpiryDays,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create invite link');
      }
      setStatusMessage({ type: 'success', text: 'Family onboarding invite created!' });
      fetchAllAdminData();
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeInvite = async (tokenId: number) => {
    setActionLoading(`revoke-${tokenId}`);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/invites/${tokenId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to revoke invite');
      setStatusMessage({ type: 'success', text: 'Invite token revoked' });
      setInvites(invites.filter((i) => i.id !== tokenId));
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyInviteLink = (invite: InviteTokenItem) => {
    const fullUrl = `${window.location.origin}${invite.invite_url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedInviteId(invite.id);
    setTimeout(() => setCopiedInviteId(null), 2000);
  };

  const handlePurgeExpiredTrash = async () => {
    if (!confirm(`Are you sure you want to permanently purge items that have been in Trash for more than ${purgeDays} days?`)) {
      return;
    }
    setActionLoading('purge-trash');
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/trash/purge-expired?days=${purgeDays}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to purge expired trash');
      const data = await res.json();
      setStatusMessage({
        type: 'success',
        text: `Purged ${data.purged_count} expired items, reclaimed ${data.reclaimed_mb} MB!`,
      });
      fetchAllAdminData();
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  if (!user?.is_admin && user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center shadow-md mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Admin Privileges Required</h2>
        <p className="text-sm text-slate-500 max-w-sm mt-1">
          This portal is restricted to system administrators. Contact your server owner to grant admin permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              Operations & Administration
              <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                v0.3.0 Pro
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Host performance telemetry, multi-tenant quotas, family invites & lifecycle management.
            </p>
          </div>
        </div>

        <button
          onClick={fetchAllAdminData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Global Status Banner */}
      {statusMessage && (
        <div
          className={`flex items-center gap-2 p-3.5 rounded-2xl text-xs font-medium animate-slideUp ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'metrics'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Host & Database Metrics</span>
        </button>

        <button
          onClick={() => setActiveTab('prometheus')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'prometheus'
              ? 'border-b-2 border-orange-500 text-orange-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Flame className="w-4 h-4 text-orange-500" />
          <span>Prometheus UI & Telemetry</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'users'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Multi-Tenant Users ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('invites')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'invites'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>Family Invites ({invites.filter((i) => !i.is_used && !i.is_expired).length})</span>
        </button>

        <button
          onClick={() => setActiveTab('trash')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'trash'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          <span>30-Day Trash Lifecycle</span>
        </button>
      </div>

      {/* Prometheus Operational Hero Navigation Banner (Always accessible on Metrics & Prometheus tabs) */}
      {(activeTab === 'metrics' || activeTab === 'prometheus') && (
        <div className="bg-gradient-to-r from-orange-950/80 via-slate-900 to-amber-950/80 border border-orange-500/30 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shadow-md">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Prometheus Server & Telemetry</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Target: Healthy (Port 9090)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Real-time metrics exposition on port 9090. Scraped every 15s by Prometheus container.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <a
              href={typeof window !== 'undefined' ? `http://${window.location.hostname}:9090` : 'http://localhost:9090'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-600/30 transition transform hover:-translate-y-0.5 active:translate-y-0"
              title="Click to navigate to Prometheus Web UI"
            >
              <Flame className="w-4 h-4 fill-white" />
              <span>Open Prometheus Web UI</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <a
              href={typeof window !== 'undefined' ? `http://${window.location.hostname}:9090/targets` : 'http://localhost:9090/targets'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition"
              title="Click to view scrape targets health"
            >
              <span>Targets</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            <button
              onClick={() => setActiveTab('prometheus')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition border ${
                activeTab === 'prometheus'
                  ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-orange-400" />
              <span>Inspect /metrics</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: Real-time Host & Database Telemetry */}
      {activeTab === 'metrics' && metrics && (
        <div className="space-y-6">
          {/* Key Metric Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Storage Metric */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Library Storage</span>
                <HardDrive className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {metrics.database.total_storage_gb} GB
              </div>
              <p className="text-[11px] text-slate-400">
                Across {metrics.database.active_media.toLocaleString()} photos & videos
              </p>
            </div>

            {/* Host CPU */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">CPU Utilization</span>
                <Cpu className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {metrics.host.cpu_usage_percent}%
              </div>
              <p className="text-[11px] text-slate-400">
                {metrics.host.cpu_cores} Logical Host Cores
              </p>
            </div>

            {/* Host Memory */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Host RAM Used</span>
                <Database className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {metrics.host.memory_used_gb} / {metrics.host.memory_total_gb} GB
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{ width: `${metrics.host.memory_usage_percent}%` }}
                />
              </div>
            </div>

            {/* Redis Queue Status */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-wider">Async Tasks Queue</span>
                <Activity className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {metrics.worker.pending_queue_tasks} Pending
              </div>
              <p className="text-[11px] text-emerald-600 font-semibold">
                ● Background Redis Workers Healthy
              </p>
            </div>
          </div>

          {/* Deep Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Database Entities Counts */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-600" />
                <span>Indexed Media & AI Entities</span>
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Active Media Files</span>
                  <span className="font-semibold text-slate-900 font-mono">{metrics.database.active_media.toLocaleString()}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Trash Media Files</span>
                  <span className="font-semibold text-rose-600 font-mono">{metrics.database.trash_media.toLocaleString()}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Recognized Faces</span>
                  <span className="font-semibold text-slate-900 font-mono">{metrics.database.total_faces.toLocaleString()}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Named & Clustered People</span>
                  <span className="font-semibold text-slate-900 font-mono">{metrics.database.total_people.toLocaleString()}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Albums & Dynamic Rules</span>
                  <span className="font-semibold text-slate-900 font-mono">{metrics.database.total_albums.toLocaleString()}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-500">Total Registered Tenants</span>
                  <span className="font-semibold text-slate-900 font-mono">{metrics.database.total_users}</span>
                </div>
              </div>
            </div>

            {/* Host Disk Volume Capacity */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-600" />
                <span>Server Storage Volume Health</span>
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Primary Disk Mount (/)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {metrics.host.disk_free_gb} GB free of {metrics.host.disk_total_gb} GB
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      metrics.host.disk_used_percent > 85 ? 'bg-rose-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${metrics.host.disk_used_percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>{metrics.host.disk_used_percent}% Allocated</span>
                  <span>Zero Auto-Deletion Protection Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Prometheus Server, Targets & Scrape Inspector */}
      {activeTab === 'prometheus' && (
        <div className="space-y-6">
          {/* Quick PromQL Expression Launchers */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-orange-500" />
                <span>1-Click PromQL Query Launchers (Click to navigate & graph in Prometheus)</span>
              </h4>
              <span className="text-[11px] text-slate-400">Target Scrape Interval: 15s</span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { label: 'Active Photos & Media', expr: 'memorypics_media_total{status="active"}' },
                { label: 'Total Media Storage Bytes', expr: 'memorypics_storage_bytes' },
                { label: 'Detected Faces Total', expr: 'memorypics_faces_total' },
                { label: 'Host CPU %', expr: 'memorypics_host_cpu_percent' },
                { label: 'Host RAM Used (Bytes)', expr: 'memorypics_host_memory_bytes{type="used"}' },
                { label: 'Pending Worker Tasks', expr: 'memorypics_queue_pending_tasks' },
                { label: 'Named People Count', expr: 'memorypics_people_total' },
              ].map((q) => (
                <a
                  key={q.expr}
                  href={`http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:9090/graph?g0.expr=${encodeURIComponent(q.expr)}&g0.tab=0`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-orange-50 border border-slate-200 hover:border-orange-300 text-slate-700 hover:text-orange-700 rounded-xl transition group font-mono text-[11px]"
                  title={`Click to navigate to Prometheus graph for ${q.expr}`}
                >
                  <span className="font-sans font-semibold text-slate-800 group-hover:text-orange-900">{q.label}:</span>
                  <code className="text-orange-600 group-hover:text-orange-800">{q.expr}</code>
                  <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-orange-500" />
                </a>
              ))}
            </div>
          </div>

          {/* Live /metrics Raw Stream Inspector */}
          <div className="bg-slate-950 text-slate-200 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60">
              <div className="flex items-center gap-3">
                <Terminal className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-mono font-bold text-white">GET /metrics</span>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                  text/plain; version=0.0.4
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter metric names..."
                  value={promSearchFilter}
                  onChange={(e) => setPromSearchFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white text-xs px-2.5 py-1 rounded-lg focus:outline-none focus:border-orange-500 font-mono"
                />

                <button
                  type="button"
                  onClick={() => setAutoRefreshPrometheus(!autoRefreshPrometheus)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                    autoRefreshPrometheus
                      ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${autoRefreshPrometheus ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>{autoRefreshPrometheus ? 'Auto (5s)' : 'Manual'}</span>
                </button>

                <button
                  type="button"
                  onClick={fetchPrometheusMetrics}
                  disabled={loadingPrometheus}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition border border-slate-700"
                >
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(rawPrometheusText);
                    setCopiedPromUrl(true);
                    setTimeout(() => setCopiedPromUrl(false), 2000);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-semibold shadow transition"
                >
                  {copiedPromUrl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPromUrl ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="p-4 max-h-[460px] overflow-y-auto font-mono text-xs text-slate-300 space-y-1 bg-black/40">
              {loadingPrometheus && !rawPrometheusText ? (
                <div className="py-12 text-center text-slate-500">Loading Prometheus metrics...</div>
              ) : (
                rawPrometheusText
                  .split('\n')
                  .filter((line) => !promSearchFilter || line.toLowerCase().includes(promSearchFilter.toLowerCase()))
                  .map((line, idx) => {
                    const isComment = line.startsWith('#');
                    return (
                      <div
                        key={idx}
                        className={`py-0.5 px-1 rounded hover:bg-slate-800/40 ${
                          isComment ? 'text-slate-500 italic' : 'text-emerald-400 font-semibold'
                        }`}
                      >
                        {line}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Multi-tenant User Management & Storage Quotas */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Multi-Tenant User Quotas & Roles</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Set max storage limits, role assignments (Admin / Member / Viewer), or activate/deactivate accounts.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Storage Consumption</th>
                  <th className="px-5 py-3">Quota Limit</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const quotaGb = u.storage_quota_bytes > 0 ? (u.storage_quota_bytes / (1024 ** 3)).toFixed(0) : 'Unlimited';
                  const usedGb = (u.used_storage_bytes / (1024 ** 3)).toFixed(2);
                  const isCurrentAdmin = u.id === user?.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{u.username}</div>
                        <div className="text-slate-400 text-[11px]">{u.email}</div>
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={u.role || (u.is_admin ? 'admin' : 'member')}
                          disabled={isCurrentAdmin || actionLoading === `user-${u.id}`}
                          onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                          className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2 py-1 font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-1 w-44">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-semibold text-slate-800 font-mono">{usedGb} GB</span>
                            <span className="text-slate-400">({u.photo_count} photos)</span>
                          </div>
                          {u.storage_quota_bytes > 0 && (
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  u.usage_percent > 90 ? 'bg-rose-500' : 'bg-indigo-600'
                                }`}
                                style={{ width: `${Math.min(100, u.usage_percent)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={u.storage_quota_bytes === 0 ? '0' : (u.storage_quota_bytes / (1024 ** 3)).toString()}
                            disabled={actionLoading === `user-${u.id}`}
                            onChange={(e) => {
                              const gb = parseInt(e.target.value, 10);
                              handleUpdateUser(u.id, { storage_quota_bytes: gb * 1024 * 1024 * 1024 });
                            }}
                            className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:border-indigo-500"
                          >
                            <option value="0">Unlimited</option>
                            <option value="10">10 GB</option>
                            <option value="25">25 GB</option>
                            <option value="50">50 GB</option>
                            <option value="100">100 GB</option>
                            <option value="250">250 GB</option>
                          </select>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.is_active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        {!isCurrentAdmin && (
                          <button
                            onClick={() => handleUpdateUser(u.id, { is_active: !u.is_active })}
                            disabled={actionLoading === `user-${u.id}`}
                            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
                              u.is_active
                                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {u.is_active ? 'Suspend' : 'Reactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Family Invites Generator */}
      {activeTab === 'invites' && (
        <div className="space-y-6">
          {/* Create Invite Link Box */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <span>Generate Secure Family Invite Link</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Share custom onboarding tokens with relatives or friends with pre-assigned storage quotas and roles.
              </p>
            </div>

            <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Assigned Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="member">Member (Can Upload & Organize)</option>
                  <option value="viewer">Viewer (Read-Only Access)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Storage Quota (GB)
                </label>
                <select
                  value={inviteQuotaGb}
                  onChange={(e) => setInviteQuotaGb(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value={0}>Unlimited</option>
                  <option value={10}>10 GB</option>
                  <option value={20}>20 GB</option>
                  <option value={50}>50 GB</option>
                  <option value={100}>100 GB</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Token Expiry
                </label>
                <select
                  value={inviteExpiryDays}
                  onChange={(e) => setInviteExpiryDays(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value={1}>24 Hours</option>
                  <option value={7}>7 Days</option>
                  <option value={30}>30 Days</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={actionLoading === 'create-invite'}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition flex items-center justify-center gap-1.5"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Create Invite</span>
              </button>
            </form>
          </div>

          {/* Active Invites List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Active & Historical Invite Links</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Invite Link</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Quota</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Expires</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invites.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                        No active invite tokens found. Create one above to onboard family members!
                      </td>
                    </tr>
                  ) : (
                    invites.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-5 py-4 font-mono font-medium text-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-xs">{inv.invite_url}</span>
                            <button
                              onClick={() => handleCopyInviteLink(inv)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600 transition"
                              title="Copy Full Invite URL"
                            >
                              {copiedInviteId === inv.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="px-5 py-4 capitalize font-semibold text-slate-700">
                          {inv.role}
                        </td>

                        <td className="px-5 py-4 font-mono text-slate-600">
                          {inv.quota_bytes > 0 ? `${(inv.quota_bytes / (1024 ** 3)).toFixed(0)} GB` : 'Unlimited'}
                        </td>

                        <td className="px-5 py-4">
                          {inv.is_used ? (
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Used (Claimed)
                            </span>
                          ) : inv.is_expired ? (
                            <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">
                              Expired
                            </span>
                          ) : (
                            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                              Active (Unused)
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-slate-400 font-mono text-[11px]">
                          {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : 'Never'}
                        </td>

                        <td className="px-5 py-4 text-right">
                          {!inv.is_used && (
                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              disabled={actionLoading === `revoke-${inv.id}`}
                              className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: 30-Day Trash Retention Lifecycle */}
      {activeTab === 'trash' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>30-Day Trash Retention & Scheduled Purge</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              When photos are trashed, they are safely quarantined. In accordance with the <strong>Zero Auto-Deletion Policy</strong>, master files remain intact until the retention cutoff expires and an administrator initiates a purge.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-800">Retention Window Window</div>
              <p className="text-[11px] text-slate-500">Only items marked for deletion longer than this window will be permanently removed.</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={purgeDays}
                onChange={(e) => setPurgeDays(parseInt(e.target.value, 10))}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value={7}>7 Days</option>
                <option value={14}>14 Days</option>
                <option value={30}>30 Days (Recommended)</option>
                <option value={60}>60 Days</option>
              </select>

              <button
                onClick={handlePurgeExpiredTrash}
                disabled={actionLoading === 'purge-trash'}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{actionLoading === 'purge-trash' ? 'Purging...' : 'Purge Expired Trash'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
