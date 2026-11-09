/**
 * Dynamically resolves the API base URL based on the runtime context.
 * In the browser:
 *   If NEXT_PUBLIC_API_URL is set to a non-localhost remote URL, use it.
 *   Otherwise, dynamically adapts to window.location.hostname on port 8000.
 *   This ensures seamless operation whether accessed via localhost, 127.0.0.1,
 *   LAN IP (e.g., 192.168.0.103), custom domain, or VPN.
 * On the server (SSR):
 *   Falls back to process.env.NEXT_PUBLIC_API_URL or http://localhost:8000.
 */
export function getApiUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || 'localhost';
    const port = process.env.NEXT_PUBLIC_BACKEND_PORT || '8000';
    return `${protocol}//${hostname}:${port}`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}
