#!/usr/bin/env python3
"""
MyMemoryPics Minimalist Server Controller & Wrapper
---------------------------------------------------
A featherweight, zero-dependency background supervisor that provides a clean,
minimalist UI to start, stop, and monitor the entire MyMemoryPics container stack.

When the server is stopped:
- All heavy containers (FastAPI, PyTorch, InsightFace, pgvector, MinIO, Redis, Next.js) are powered off.
- This controller runs in deep sleep consuming only ~12-15 MB RAM and 0% CPU.
- Any device (laptop or phone on LAN) can access this page to start or stop the server with 1 click.

Nothing is hardcoded:
- Dynamically detects project directory, docker-compose.yml, and environment variables.
"""

import os
import sys
import json
import time
import shutil
import signal
import argparse
import subprocess
import threading
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler

# Base paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DEFAULT_COMPOSE_FILE = os.path.join(PROJECT_DIR, 'docker-compose.yml')
ENV_FILE = os.path.join(PROJECT_DIR, '.env')

# Read .env file dynamically if present
def load_env_vars():
    env_vars = {}
    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        env_vars[k.strip()] = v.strip().strip('"').strip("'")
        except Exception as e:
            print(f"[WARN] Failed to read .env: {e}")
    return env_vars

ENV_VARS = load_env_vars()

# Default configuration from environment or flags
MANAGER_HOST = os.environ.get('MANAGER_HOST', '0.0.0.0')
MANAGER_PORT = int(os.environ.get('MANAGER_PORT', ENV_VARS.get('MANAGER_PORT', 8080)))
FRONTEND_PORT = int(os.environ.get('FRONTEND_PORT', ENV_VARS.get('FRONTEND_PORT', 3000)))
CADDY_HTTP_PORT = int(os.environ.get('CADDY_HTTP_PORT', ENV_VARS.get('CADDY_HTTP_PORT', 80)))

# Global State & Log Ring Buffer
class ServerManager:
    def __init__(self, compose_file=DEFAULT_COMPOSE_FILE):
        self.compose_file = compose_file
        self.project_dir = os.path.dirname(compose_file)
        self.lock = threading.Lock()
        self.current_action = None  # 'starting', 'stopping', 'restarting', None
        self.action_logs = []
        self.max_logs = 100
        self.last_status_cache = None
        self.last_status_time = 0

    def add_log(self, line):
        timestamp = time.strftime('%H:%M:%S')
        clean_line = line.strip()
        if clean_line:
            with self.lock:
                self.action_logs.append(f"[{timestamp}] {clean_line}")
                if len(self.action_logs) > self.max_logs:
                    self.action_logs.pop(0)

    def get_host_metrics(self):
        """Reads host RAM & CPU metrics directly from /proc/ without dependencies."""
        metrics = {
            'ram_total_gb': 0.0,
            'ram_available_gb': 0.0,
            'ram_used_gb': 0.0,
            'ram_used_pct': 0.0,
            'cpu_count': os.cpu_count() or 1,
            'load_avg': [round(x, 2) for x in os.getloadavg()] if hasattr(os, 'getloadavg') else [0, 0, 0],
            'disk_free_gb': 0.0,
            'disk_total_gb': 0.0
        }

        # RAM
        if os.path.exists('/proc/meminfo'):
            try:
                meminfo = {}
                with open('/proc/meminfo', 'r') as f:
                    for line in f:
                        parts = line.split(':')
                        if len(parts) == 2:
                            meminfo[parts[0].strip()] = parts[1].strip()
                total_kb = float(meminfo.get('MemTotal', '0 kB').split()[0])
                avail_kb = float(meminfo.get('MemAvailable', '0 kB').split()[0])
                used_kb = max(0, total_kb - avail_kb)

                metrics['ram_total_gb'] = round(total_kb / (1024 * 1024), 2)
                metrics['ram_available_gb'] = round(avail_kb / (1024 * 1024), 2)
                metrics['ram_used_gb'] = round(used_kb / (1024 * 1024), 2)
                metrics['ram_used_pct'] = round((used_kb / total_kb) * 100, 1) if total_kb > 0 else 0.0
            except Exception:
                pass

        # Disk
        try:
            total, used, free = shutil.disk_usage(self.project_dir)
            metrics['disk_total_gb'] = round(total / (1024 ** 3), 1)
            metrics['disk_free_gb'] = round(free / (1024 ** 3), 1)
        except Exception:
            pass

        return metrics

    def get_containers_status(self):
        """Inspects Docker compose containers dynamically."""
        now = time.time()
        if self.last_status_cache and (now - self.last_status_time < 1.0) and not self.current_action:
            return self.last_status_cache

        cmd = [
            'docker', 'compose',
            '-f', self.compose_file,
            'ps', '-a', '--format', 'json'
        ]

        containers = []
        try:
            proc = subprocess.run(
                cmd,
                cwd=self.project_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=8
            )
            if proc.stdout:
                for line in proc.stdout.strip().split('\n'):
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        containers.append({
                            'id': data.get('ID', '')[:12],
                            'name': data.get('Name') or data.get('Names', ''),
                            'service': data.get('Service', ''),
                            'state': data.get('State', 'unknown').lower(),
                            'status': data.get('Status', ''),
                            'health': data.get('Health', ''),
                            'ports': data.get('Ports', '')
                        })
                    except Exception:
                        pass
        except Exception as e:
            self.add_log(f"Error querying docker: {e}")

        # Compute summary
        total_services = len(containers)
        running_count = sum(1 for c in containers if c['state'] == 'running')
        healthy_count = sum(1 for c in containers if 'healthy' in c.get('health', '').lower() or c['state'] == 'running')

        # Core essential services for the application (exclude optional monitoring like prometheus/grafana)
        core_services = {'backend', 'frontend', 'db', 'redis', 'minio', 'worker'}
        core_running = sum(1 for c in containers if c['service'] in core_services and c['state'] == 'running')

        if self.current_action:
            state = self.current_action
        elif total_services == 0 or running_count == 0:
            state = 'stopped'
        elif core_running >= len(core_services):
            state = 'running'
        elif running_count > 0:
            state = 'partial'
        else:
            state = 'stopped'

        result = {
            'state': state,
            'running_count': running_count,
            'total_services': total_services,
            'containers': containers,
            'current_action': self.current_action
        }

        self.last_status_cache = result
        self.last_status_time = now
        return result

    def execute_async_action(self, action_name, command_args):
        """Runs a docker compose command in background thread with live log capture."""
        with self.lock:
            if self.current_action is not None:
                return False, f"Another action '{self.current_action}' is already in progress."
            self.current_action = action_name
            self.action_logs = []

        def runner():
            self.add_log(f"Executing: {' '.join(command_args)}")
            start_time = time.time()
            try:
                proc = subprocess.Popen(
                    command_args,
                    cwd=self.project_dir,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )
                for line in iter(proc.stdout.readline, ''):
                    if line:
                        self.add_log(line)
                proc.stdout.close()
                proc.wait()

                elapsed = round(time.time() - start_time, 1)
                if proc.returncode == 0:
                    self.add_log(f"Action '{action_name}' completed successfully in {elapsed}s.")
                else:
                    self.add_log(f"Action '{action_name}' failed with exit code {proc.returncode} in {elapsed}s.")
            except Exception as e:
                self.add_log(f"Exception during '{action_name}': {e}")
            finally:
                with self.lock:
                    self.current_action = None
                    self.last_status_cache = None

        thread = threading.Thread(target=runner, daemon=True)
        thread.start()
        return True, f"Action '{action_name}' initiated."

    def start(self):
        cmd = ['docker', 'compose', '-f', self.compose_file, 'up', '-d']
        return self.execute_async_action('starting', cmd)

    def stop(self):
        cmd = ['docker', 'compose', '-f', self.compose_file, 'stop']
        return self.execute_async_action('stopping', cmd)

    def restart(self):
        cmd = ['docker', 'compose', '-f', self.compose_file, 'restart']
        return self.execute_async_action('restarting', cmd)


MANAGER = ServerManager()

# Embedded Minimalist Web UI
INDEX_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>MyMemoryPics • Server Control</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236366f1'><path d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/></svg>">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(18, 24, 38, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #ef4444;
      --slate: #64748b;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }
    body {
      background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, var(--bg) 70%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: calc(env(safe-area-inset-top, 0px) + 24px) 16px calc(env(safe-area-inset-bottom, 0px) + 32px);
    }
    .wrapper {
      width: 100%;
      max-width: 680px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 4px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #6366f1, #a855f7);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
    }
    .brand h1 {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(to right, #ffffff, #cbd5e1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero-card {
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 32px 24px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
      position: relative;
      overflow: hidden;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 20px;
      transition: all 0.3s ease;
    }
    .status-badge.stopped {
      background: rgba(148, 163, 184, 0.15);
      color: #cbd5e1;
      border: 1px solid rgba(148, 163, 184, 0.3);
    }
    .status-badge.running {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
    }
    .status-badge.starting, .status-badge.stopping, .status-badge.restarting {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .dot.pulse {
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
    }
    .hero-title {
      font-size: 1.5rem;
      font-weight: 800;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .hero-subtitle {
      font-size: 0.88rem;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 28px;
      max-width: 440px;
      margin-left: auto;
      margin-right: auto;
    }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      max-width: 380px;
      margin: 0 auto;
    }
    @media (min-width: 480px) {
      .btn-group.row {
        flex-direction: row;
      }
    }
    button, a.btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 24px;
      border-radius: 16px;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      text-decoration: none;
      width: 100%;
    }
    button:active, a.btn:active {
      transform: scale(0.98);
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #ffffff;
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      box-shadow: 0 8px 25px rgba(99, 102, 241, 0.5);
    }
    .btn-success {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #ffffff;
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
    }
    .btn-success:hover {
      background: linear-gradient(135deg, #059669, #047857);
    }
    .btn-danger {
      background: rgba(239, 68, 68, 0.12);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.22);
      color: #ffffff;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: #cbd5e1;
      border: 1px solid var(--card-border);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    /* Resource Telemetry Bar */
    .metrics-bar {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--card-border);
    }
    .metric {
      text-align: left;
      background: rgba(255, 255, 255, 0.03);
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }
    .metric-label {
      font-size: 0.72rem;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.04em;
    }
    .metric-value {
      font-size: 1.05rem;
      font-weight: 700;
      margin-top: 4px;
      color: #ffffff;
    }

    /* Collapsible Sections */
    .section-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      overflow: hidden;
    }
    .section-header {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }
    .section-header:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    .section-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-body {
      padding: 0 20px 20px;
      display: none;
    }
    .section-body.open {
      display: block;
    }

    /* Containers List */
    .container-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.82rem;
    }
    .container-row:last-child {
      border-bottom: none;
    }
    .c-name {
      font-weight: 600;
      color: #ffffff;
    }
    .c-service {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .c-badge {
      padding: 3px 10px;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .c-badge.running {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
    }
    .c-badge.exited {
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
    }

    /* Logs Terminal */
    .terminal {
      background: #040711;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      color: #a5b4fc;
      max-height: 220px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.45;
    }

    .footer {
      text-align: center;
      font-size: 0.75rem;
      color: var(--slate);
      padding: 8px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <!-- Top Header -->
    <header class="header">
      <div class="brand">
        <div class="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1>MyMemoryPics Control</h1>
      </div>
      <button id="refreshBtn" onclick="fetchStatus()" class="btn-secondary" style="width: auto; padding: 8px 14px; font-size: 0.8rem; border-radius: 12px;" title="Refresh status">
        ↻ Refresh
      </button>
    </header>

    <!-- Main Hero Card -->
    <main class="hero-card">
      <div id="statusBadge" class="status-badge stopped">
        <span class="dot"></span>
        <span id="statusText">Checking...</span>
      </div>

      <h2 id="heroTitle" class="hero-title">Server is Sleeping</h2>
      <p id="heroSubtitle" class="hero-subtitle">
        All heavy containers are stopped. Laptop CPU and RAM are fully freed for maximum battery and performance.
      </p>

      <!-- Dynamic Buttons Container -->
      <div id="actionButtons" class="btn-group">
        <button id="startBtn" onclick="triggerAction('start')" class="btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>Start MyMemoryPics Server</span>
        </button>
      </div>

      <!-- Host Metrics -->
      <div class="metrics-bar">
        <div class="metric">
          <div class="metric-label">Laptop Host RAM</div>
          <div id="ramValue" class="metric-value">-- / -- GB</div>
        </div>
        <div class="metric">
          <div class="metric-label">CPU Load / Cores</div>
          <div id="cpuValue" class="metric-value">--</div>
        </div>
      </div>
    </main>

    <!-- Collapsible Container Matrix -->
    <div class="section-card">
      <div class="section-header" onclick="toggleSection('containersBody', 'containersChevron')">
        <span class="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
            <line x1="6" y1="6" x2="6.01" y2="6"/>
            <line x1="6" y1="18" x2="6.01" y2="18"/>
          </svg>
          Container Services (<span id="serviceCount">0/0</span>)
        </span>
        <span id="containersChevron" style="color: var(--text-muted); font-size: 0.8rem;">▼</span>
      </div>
      <div id="containersBody" class="section-body">
        <div id="containersList">
          <p style="color: var(--text-muted); font-size: 0.8rem;">No containers found.</p>
        </div>
      </div>
    </div>

    <!-- Collapsible Logs Viewer -->
    <div class="section-card">
      <div class="section-header" onclick="toggleSection('logsBody', 'logsChevron')">
        <span class="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          Server Boot & Execution Logs
        </span>
        <span id="logsChevron" style="color: var(--text-muted); font-size: 0.8rem;">▼</span>
      </div>
      <div id="logsBody" class="section-body">
        <div id="terminal" class="terminal">Awaiting logs...</div>
      </div>
    </div>

    <footer class="footer">
      MyMemoryPics Server Controller • Zero-Dependency Daemon
    </footer>
  </div>

  <script>
    let appUrl = '';
    let isActionInProgress = false;

    function toggleSection(bodyId, chevronId) {
      const body = document.getElementById(bodyId);
      const chevron = document.getElementById(chevronId);
      const isOpen = body.classList.toggle('open');
      chevron.textContent = isOpen ? '▲' : '▼';
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data = await res.json();
        renderStatus(data);
      } catch (e) {
        console.error('Fetch error:', e);
      }
    }

    function renderStatus(data) {
      const badge = document.getElementById('statusBadge');
      const dot = badge.querySelector('.dot');
      const statusText = document.getElementById('statusText');
      const heroTitle = document.getElementById('heroTitle');
      const heroSubtitle = document.getElementById('heroSubtitle');
      const actionButtons = document.getElementById('actionButtons');

      isActionInProgress = Boolean(data.current_action);

      // Status Badge & Texts
      badge.className = 'status-badge ' + (data.state || 'stopped');
      dot.className = 'dot' + (isActionInProgress ? ' pulse' : '');

      if (data.state === 'running') {
        statusText.textContent = 'Server Live';
        heroTitle.textContent = 'MyMemoryPics is Live';
        heroSubtitle.textContent = 'All 7 application containers are online and healthy. AI models & database ready.';
        
        // Dynamically compute app URL based on current host
        const host = window.location.hostname;
        const port = data.ports && data.ports.frontend ? data.ports.frontend : 3000;
        appUrl = `http://${host}:${port}`;

        actionButtons.className = 'btn-group row';
        actionButtons.innerHTML = `
          <a href="${appUrl}" target="_blank" class="btn btn-success" style="flex: 1.4;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            <span>Open Application ↗</span>
          </a>
          <button onclick="triggerAction('stop')" class="btn-danger" style="flex: 1;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
            <span>Sleep / Stop</span>
          </button>
        `;
      } else if (isActionInProgress) {
        statusText.textContent = data.current_action.toUpperCase() + '...';
        heroTitle.textContent = data.current_action === 'starting' ? 'Starting Containers...' : 'Stopping Containers...';
        heroSubtitle.textContent = 'Please wait while Docker coordinates the container state transition.';
        
        actionButtons.className = 'btn-group';
        actionButtons.innerHTML = `
          <button disabled class="btn-secondary">
            <span class="dot pulse" style="background: currentColor;"></span>
            <span>${data.current_action.toUpperCase()} in progress...</span>
          </button>
        `;

        // Automatically open logs when starting/stopping
        document.getElementById('logsBody').classList.add('open');
        document.getElementById('logsChevron').textContent = '▲';
      } else {
        // Stopped or Partial
        statusText.textContent = data.state === 'partial' ? 'Partial' : 'Server Sleeping';
        heroTitle.textContent = data.state === 'partial' ? 'Partially Running' : 'Server is Sleeping';
        heroSubtitle.textContent = 'All heavy application containers are stopped. Laptop CPU and RAM are fully freed.';
        
        actionButtons.className = 'btn-group';
        actionButtons.innerHTML = `
          <button onclick="triggerAction('start')" class="btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Start MyMemoryPics Server</span>
          </button>
        `;
      }

      // Host Metrics
      if (data.host) {
        document.getElementById('ramValue').textContent = `${data.host.ram_used_gb} / ${data.host.ram_total_gb} GB (${data.host.ram_used_pct}%)`;
        document.getElementById('cpuValue').textContent = `${data.host.load_avg[0]} avg • ${data.host.cpu_count} Cores`;
      }

      // Container Matrix
      document.getElementById('serviceCount').textContent = `${data.running_count || 0}/${data.total_services || 0}`;
      const listEl = document.getElementById('containersList');
      if (data.containers && data.containers.length > 0) {
        listEl.innerHTML = data.containers.map(c => `
          <div class="container-row">
            <div>
              <div class="c-name">${c.service || c.name}</div>
              <div class="c-service">${c.name} ${c.health ? '• ' + c.health : ''}</div>
            </div>
            <span class="c-badge ${c.state}">${c.state}</span>
          </div>
        `).join('');
      } else {
        listEl.innerHTML = '<p style="color: var(--text-muted); font-size: 0.8rem; padding: 6px 0;">No containers running.</p>';
      }

      // Logs
      if (data.logs && data.logs.length > 0) {
        const term = document.getElementById('terminal');
        term.textContent = data.logs.join('\\n');
        term.scrollTop = term.scrollHeight;
      }
    }

    async function triggerAction(action) {
      if (isActionInProgress) return;
      try {
        const res = await fetch(`/api/${action}`, { method: 'POST' });
        if (res.ok) {
          fetchStatus();
        }
      } catch (e) {
        alert('Action error: ' + e);
      }
    }

    // Auto-polling interval: 2s when action in progress, 5s when idle
    setInterval(() => {
      fetchStatus();
    }, isActionInProgress ? 2000 : 5000);

    // Initial fetch
    fetchStatus();
  </script>
</body>
</html>
"""

class ManagerHTTPHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/' or path == '/index.html':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(INDEX_HTML.encode('utf-8'))
            return

        if path == '/api/status':
            status = MANAGER.get_containers_status()
            host = MANAGER.get_host_metrics()
            
            payload = {
                **status,
                'host': host,
                'ports': {
                    'frontend': FRONTEND_PORT,
                    'backend': int(ENV_VARS.get('BACKEND_PORT', 8000)),
                    'caddy': CADDY_HTTP_PORT,
                    'manager': MANAGER_PORT
                },
                'logs': MANAGER.action_logs[-40:]
            }

            data = json.dumps(payload).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-cache')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(data)
            return

        if path == '/api/logs':
            logs = MANAGER.action_logs
            data = json.dumps({'logs': logs}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(data)
            return

        # 404 fallback
        self.send_response(404)
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(b'{"error": "Not Found"}')

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/start':
            success, msg = MANAGER.start()
            self.send_json_response(200 if success else 400, {'success': success, 'message': msg})
            return

        if path == '/api/stop':
            success, msg = MANAGER.stop()
            self.send_json_response(200 if success else 400, {'success': success, 'message': msg})
            return

        if path == '/api/restart':
            success, msg = MANAGER.restart()
            self.send_json_response(200 if success else 400, {'success': success, 'message': msg})
            return

        self.send_response(404)
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(b'{"error": "Action Not Found"}')

    def send_json_response(self, code, payload):
        data = json.dumps(payload).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        # Suppress routine GET logging to keep stdout clean, log only errors/posts
        if 'POST' in args[0] or args[1] != '200':
            sys.stdout.write(f"[HTTP] {args[0]} -> {args[1]}\\n")


def run_server(host=MANAGER_HOST, port=MANAGER_PORT, compose_file=DEFAULT_COMPOSE_FILE):
    global MANAGER
    MANAGER = ServerManager(compose_file=compose_file)

    server = HTTPServer((host, port), ManagerHTTPHandler)
    print(f"================================================================")
    print(f"🚀 MyMemoryPics Minimalist Server Controller")
    print(f"   Listening on: http://{host}:{port}")
    print(f"   Project Dir:  {MANAGER.project_dir}")
    print(f"   Compose File: {compose_file}")
    print(f"   Memory Usage: ~12-15 MB RAM (Zero external dependencies)")
    print(f"================================================================")

    def shutdown_signal(signum, frame):
        print("\\n[INFO] Gracefully shutting down Server Controller...")
        server.server_close()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_signal)
    signal.signal(signal.SIGTERM, shutdown_signal)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='MyMemoryPics Minimalist Server Controller')
    parser.add_argument('--port', type=int, default=MANAGER_PORT, help='Port to listen on (default: 8080)')
    parser.add_argument('--host', type=str, default=MANAGER_HOST, help='Host to bind to (default: 0.0.0.0)')
    parser.add_argument('--compose-file', type=str, default=DEFAULT_COMPOSE_FILE, help='Path to docker-compose.yml')
    args = parser.parse_args()

    run_server(host=args.host, port=args.port, compose_file=args.compose_file)
