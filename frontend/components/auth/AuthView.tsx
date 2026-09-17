'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  LogIn, 
  UserPlus, 
  Lock, 
  User as UserIcon, 
  Mail,
  Sparkles, 
  ShieldCheck, 
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  HardDrive,
  Cpu,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface AuthViewProps {
  initialTab?: 'login' | 'register';
}

export function AuthView({ initialTab = 'login' }: AuthViewProps) {
  const router = useRouter();
  const { login, register } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  
  // Login fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  
  // Register fields
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) {
      setError('Please provide your username/email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    const result = await login(loginIdentifier, loginPassword);
    setLoading(false);
    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Invalid credentials. Please verify and try again.');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regEmail.trim() || !regPassword) {
      setError('Please fill in all required fields.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }
    setError(null);
    setLoading(true);
    const result = await register(regUsername, regEmail, regPassword, regFullName);
    setLoading(false);
    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Account creation failed. Please try a different username or email.');
    }
  };

  const fillAdminCredentials = () => {
    setTab('login');
    setLoginIdentifier('admin');
    setLoginPassword('password123');
    setError(null);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Dynamic Background Ambient Orbs */}
      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
        
        {/* Left Hero Column: Brand Pillars & Architecture (Desktop Only) */}
        <div className="hidden lg:flex lg:col-span-5 flex-col justify-between space-y-8 pr-4">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Autonomous AI Photo Cloud</span>
            </div>

            <h1 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
              Your Memories, <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                Private & Intelligent.
              </span>
            </h1>

            <p className="text-xs text-slate-400 leading-relaxed">
              Self-hosted family photo intelligence designed with zero cloud dependency. 
              Seamlessly browse, search, and relive your moments with offline AI.
            </p>
          </div>

          {/* Privacy & Feature Badges */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">100% Local & Private</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Your files never leave your system. Zero third-party telemetry.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">Offline Vision & CLIP AI</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Vector semantic search and UltraFace clustering run completely on-device.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">Zero Local Disk Footprint</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">In-memory streaming guarantees no duplicate caches eat your hard drive.</p>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Secure Database & Redis Worker Connected</span>
          </div>
        </div>

        {/* Right Column: Sign In / Register Card */}
        <div className="lg:col-span-7 w-full max-w-md mx-auto">
          <div className="bg-slate-900/90 border border-slate-800/90 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative animate-slideUp">
            
            {/* Header Brand */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-600/30">
                <Sparkles className="w-6 h-6 text-amber-300" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {tab === 'login' ? 'Welcome Back' : 'Create Your Account'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {tab === 'login' 
                  ? 'Sign in to access your private library and albums' 
                  : 'Start organizing your family memories securely'}
              </p>
            </div>

            {/* Tab Switcher */}
            <div className="flex p-1 bg-slate-800/80 rounded-2xl mb-6 border border-slate-700/50">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition ${
                  tab === 'login'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setError(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition ${
                  tab === 'register'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create Account</span>
              </button>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mb-5 flex items-center gap-2.5 p-3 bg-red-950/60 border border-red-800/60 text-red-300 rounded-2xl text-xs animate-shake">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Form Container */}
            {tab === 'login' ? (
              /* --- SIGN IN FORM --- */
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Username or Email
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="e.g. admin or satish@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-400 select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-800"
                    />
                    <span>Remember this session</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-semibold text-xs shadow-lg shadow-indigo-600/30 transition disabled:opacity-60 flex items-center justify-center gap-2 hover:scale-[1.01]"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In to MyMemoryPics</span>
                    </>
                  )}
                </button>

                {/* Quick 1-Click Admin Fill Helper */}
                <div className="pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={fillAdminCredentials}
                    className="w-full py-2 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 text-slate-300 rounded-xl text-[11px] font-medium transition flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Quick Fill Default Admin (admin / password123)</span>
                  </button>
                </div>
              </form>
            ) : (
              /* --- CREATE ACCOUNT FORM --- */
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Username *
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="e.g. satish"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="satish@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Full Name (Optional)
                  </label>
                  <div className="relative">
                    <CheckCircle2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="Satish"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password * (min. 6 characters)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-semibold text-xs shadow-lg shadow-indigo-600/30 transition disabled:opacity-60 flex items-center justify-center gap-2 hover:scale-[1.01] mt-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Create Free Local Account</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Switch Tab Prompt */}
            <div className="mt-5 text-center text-xs text-slate-400">
              {tab === 'login' ? (
                <span>
                  Don&apos;t have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setTab('register');
                      setError(null);
                    }}
                    className="text-indigo-400 hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    <span>Create account</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </span>
              ) : (
                <span>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setTab('login');
                      setError(null);
                    }}
                    className="text-indigo-400 hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    <span>Sign in here</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
