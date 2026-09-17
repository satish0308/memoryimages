'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ShieldCheck, 
  AlertCircle, 
  Sparkles, 
  Cpu, 
  HardDrive, 
  Cloud, 
  CheckCircle2, 
  ArrowRight,
  Lock,
  ChevronDown,
  ChevronUp,
  KeyRound
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface AuthViewProps {
  initialTab?: 'login' | 'register';
}

function AuthViewContent({ initialTab = 'login' }: AuthViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated } = useAuth();

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleSuccess, setGoogleSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Developer / Emergency Fallback State (Collapsed by default)
  const [showFallback, setShowFallback] = useState(false);
  const [fallbackUser, setFallbackUser] = useState('admin');
  const [fallbackPass, setFallbackPass] = useState('password123');
  const [fallbackLoading, setFallbackLoading] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Check URL parameters for returned Google OAuth tokens
  useEffect(() => {
    const token = searchParams.get('token');
    const email = searchParams.get('email');
    const username = searchParams.get('username');
    const fullName = searchParams.get('full_name');
    const isAdmin = searchParams.get('is_admin') === 'true';
    const id = searchParams.get('id');
    const err = searchParams.get('error');

    if (err) {
      setError(decodeURIComponent(err));
      return;
    }

    if (token && email) {
      const googleUser = {
        id: id ? parseInt(id, 10) : 1,
        username: username || email.split('@')[0],
        email: email,
        full_name: fullName || username || email.split('@')[0],
        is_admin: isAdmin,
        is_active: true
      };

      localStorage.setItem('memorypics_token', token);
      localStorage.setItem('memorypics_user', JSON.stringify(googleUser));
      setGoogleSuccess(`Signed in as ${googleUser.email}!`);

      // Smooth transition to library
      const timer = setTimeout(() => {
        window.location.href = '/';
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  // Trigger Google OAuth Redirect Flow
  const handleGoogleSignIn = async () => {
    setError(null);
    setConnectingGoogle(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/google/url`);
      const data = await res.json();
      if (res.ok && data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        setError(data.detail || data.error || 'Could not connect to Google OAuth service.');
        setConnectingGoogle(false);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to reach authentication server.');
      setConnectingGoogle(false);
    }
  };

  // Developer / Emergency Local Sign-In Fallback
  const handleFallbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fallbackUser.trim() || !fallbackPass) {
      setError('Please provide fallback credentials.');
      return;
    }
    setError(null);
    setFallbackLoading(true);
    const result = await login(fallbackUser, fallbackPass);
    setFallbackLoading(false);
    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Fallback sign-in failed.');
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Ambient Lighting Orbs */}
      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
        
        {/* Left Hero Column: Brand Pillars & Privacy Guarantees */}
        <div className="hidden lg:flex lg:col-span-5 flex-col justify-between space-y-8 pr-4">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Autonomous AI Photo Cloud</span>
            </div>

            <h1 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
              Your Memories, <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                Safe & Synchronized.
              </span>
            </h1>

            <p className="text-xs text-slate-400 leading-relaxed">
              Private family photo intelligence backed by your Google Account. 
              Enjoy seamless offline AI, zero-disk in-memory streaming, and instant Google Drive sync.
            </p>
          </div>

          {/* Privacy & Feature Badges */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">Mandatory Google Account Auth</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Verified Google identity with direct Google Drive photo stream integration.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">Offline Vision & CLIP AI</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Face clustering and semantic search run locally on your host without cloud tracking.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">Zero Local Disk Footprint</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  In-memory streaming prevents gigabytes of duplicate thumbnail caches from filling your drive.
                </p>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Dual-Engine: PostgreSQL & Redis Background Worker Online</span>
          </div>
        </div>

        {/* Right Column: Google Sign In Card */}
        <div className="lg:col-span-7 w-full max-w-md mx-auto">
          <div className="bg-slate-900/95 border border-slate-800/90 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative animate-slideUp">
            
            {/* Header Brand */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-600/30">
                <Sparkles className="w-7 h-7 text-amber-300" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Sign In to MyMemoryPics
              </h2>
              <p className="text-xs text-slate-400 mt-1.5">
                Authentication with a verified Google Account is mandatory.
              </p>
            </div>

            {/* Mandatory Requirement Pill */}
            <div className="mb-6 p-3.5 bg-indigo-950/40 border border-indigo-800/50 rounded-2xl flex items-start gap-2.5 text-xs text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-indigo-200">Mandatory Google SSO</p>
                <p className="text-[11px] text-indigo-300/80 leading-relaxed">
                  Signing in with Google ensures your library access permissions and Google Drive photo streaming are securely authorized.
                </p>
              </div>
            </div>

            {/* Error Notification Banner */}
            {error && (
              <div className="mb-5 flex items-center gap-2.5 p-3.5 bg-red-950/60 border border-red-800/60 text-red-300 rounded-2xl text-xs animate-shake">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Google Success Banner */}
            {googleSuccess && (
              <div className="mb-5 flex items-center gap-2.5 p-3.5 bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 rounded-2xl text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{googleSuccess} Redirecting to your photos...</span>
              </div>
            )}

            {/* PRIMARY ACTION: Official Google Sign-In Button */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={connectingGoogle}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-semibold text-sm shadow-xl hover:shadow-2xl transition-all duration-200 flex items-center justify-center gap-3 border border-slate-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-75 disabled:pointer-events-none cursor-pointer"
              >
                {connectingGoogle ? (
                  <>
                    <div className="w-5 h-5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    {/* Official Google 'G' 4-Color Vector Logo */}
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.98 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span>Sign in with Google Account</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                By continuing, you agree to access your private MyMemoryPics host via authorized Google OAuth 2.0.
              </p>
            </div>

            {/* Collapsible Developer / Emergency Local Fallback */}
            <div className="mt-8 pt-4 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowFallback(!showFallback)}
                className="w-full flex items-center justify-between text-[11px] text-slate-500 hover:text-slate-400 py-1 transition"
              >
                <div className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-600" />
                  <span>Developer & Offline Local Fallback</span>
                </div>
                {showFallback ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showFallback && (
                <form onSubmit={handleFallbackSubmit} className="mt-3 space-y-3 p-3 bg-slate-950/60 border border-slate-800 rounded-2xl animate-fadeIn text-xs">
                  <p className="text-[11px] text-slate-400">
                    Use only for local debugging or offline hosts with no internet connectivity.
                  </p>
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                      Local Username
                    </label>
                    <input
                      type="text"
                      value={fallbackUser}
                      onChange={(e) => setFallbackUser(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={fallbackPass}
                      onChange={(e) => setFallbackPass(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={fallbackLoading}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs transition disabled:opacity-50"
                  >
                    {fallbackLoading ? 'Authenticating Fallback...' : 'Sign In as Local Admin'}
                  </button>
                </form>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

export function AuthView(props: AuthViewProps) {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/30 animate-pulse mb-3">
          <Sparkles className="w-6 h-6 text-amber-300" />
        </div>
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AuthViewContent {...props} />
    </React.Suspense>
  );
}
