'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Image as ImageIcon, 
  Sparkles, 
  Users, 
  FolderSync, 
  ShieldCheck, 
  BookOpen, 
  Globe, 
  Settings,
  Lock,
  Tv,
  Flame
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AppHeader } from '@/components/layout/AppHeader';
import { MainContentWrapper } from '@/components/layout/MainContentWrapper';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const isPublicRoute = pathname === '/login' || pathname === '/register' || pathname.startsWith('/share/');
  const isKioskRoute = pathname === '/kiosk';

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated && !isPublicRoute) {
        router.replace('/login');
      } else if (isAuthenticated && (pathname === '/login' || pathname === '/register')) {
        router.replace('/');
      }
    }
  }, [isLoading, isAuthenticated, isPublicRoute, pathname, router]);

  // Standalone Fullscreen Kiosk Mode (no sidebar or header)
  if (isKioskRoute) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-black text-white">
        {children}
      </div>
    );
  }

  // Public Route (Login / Register / Guest Share): Render immediately without splash delay
  if (isPublicRoute && !isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-slate-950 overflow-y-auto">
        {children}
      </div>
    );
  }

  // Loading State: Session Verification Splash Screen for protected routes
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center text-white z-50">
        <div className="flex flex-col items-center gap-4 text-center animate-fadeIn">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/40 animate-pulse">
            <Sparkles className="w-8 h-8 text-amber-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              MyMemoryPics
            </h1>
            <p className="text-xs text-slate-400 mt-1">Verifying secure session...</p>
          </div>
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mt-1" />
        </div>
      </div>
    );
  }

  // Unauthenticated on a protected route: Block content rendering while redirecting to /login
  if (!isAuthenticated && !isPublicRoute) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center text-white z-50">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-indigo-400">
            <Lock className="w-6 h-6" />
          </div>
          <p className="text-xs text-slate-400">Authentication required. Redirecting to sign-in...</p>
        </div>
      </div>
    );
  }

  // Public Route (Login / Register): Render full-screen standalone without sidebar/header
  if (isPublicRoute) {
    return (
      <div className="min-h-screen w-full bg-slate-950 overflow-y-auto">
        {children}
      </div>
    );
  }

  // Authenticated: Render Full Application with Navigation Sidebar & Header
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 antialiased">
      {/* Left Application Sidebar */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between p-4 flex-shrink-0">
        <div>
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-2 px-2 py-4 mb-4 group cursor-pointer">
            <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-2 rounded-xl text-white shadow-md group-hover:scale-105 transition">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                MyMemoryPics
              </h1>
              <p className="text-xs text-slate-400 font-medium">Smart AI Triage</p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <Link
              href="/"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname === '/'
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
              }`}
            >
              <ImageIcon className={`w-4 h-4 ${pathname === '/' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Photos</span>
            </Link>

            <Link
              href="/memories"
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.startsWith('/memories')
                  ? 'bg-purple-50 text-purple-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-purple-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <Flame className={`w-4 h-4 ${pathname.startsWith('/memories') ? 'text-purple-600' : 'text-slate-500'}`} />
                <span>Memories</span>
              </div>
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs">
                ✨ Story
              </span>
            </Link>

            <Link
              href="/albums"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.startsWith('/albums')
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
              }`}
            >
              <BookOpen className={`w-4 h-4 ${pathname.startsWith('/albums') ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Albums</span>
            </Link>

            <Link
              href="/similar"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.startsWith('/similar')
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
              }`}
            >
              <Sparkles className={`w-4 h-4 ${pathname.startsWith('/similar') ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Similar AI</span>
            </Link>

            <Link
              href="/map"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.startsWith('/map')
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
              }`}
            >
              <Globe className={`w-4 h-4 ${pathname.startsWith('/map') ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Places & Map</span>
            </Link>

            <Link
              href="/triage"
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.startsWith('/triage')
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Smart Triage</span>
              </div>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Clean
              </span>
            </Link>

            <Link
              href="/people"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.startsWith('/people')
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
              }`}
            >
              <Users className={`w-4 h-4 ${pathname.startsWith('/people') ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>People & Faces</span>
            </Link>

            <Link
              href="/sync"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.startsWith('/sync')
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
              }`}
            >
              <FolderSync className={`w-4 h-4 ${pathname.startsWith('/sync') ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Sync & Sources</span>
            </Link>

            <Link
              href="/settings"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.startsWith('/settings')
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
              }`}
            >
              <Settings className={`w-4 h-4 ${pathname.startsWith('/settings') ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>App Settings</span>
            </Link>

            <Link
              href="/kiosk"
              target="_blank"
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
              title="Open Ambient Fullscreen TV Display"
            >
              <div className="flex items-center gap-3">
                <Tv className="w-4 h-4 text-slate-500" />
                <span>Kiosk Mode</span>
              </div>
              <span className="bg-slate-200 text-slate-700 text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold">
                TV ↗
              </span>
            </Link>
          </nav>
        </div>

        {/* Bottom Card: Zero Auto-Deletion Guarantee */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs shadow-xs">
          <div className="flex items-center gap-2 text-indigo-600 font-semibold mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Zero Auto-Delete Policy</span>
          </div>
          <p className="text-slate-500 leading-relaxed text-[11px]">
            Photos are never deleted automatically. Suggestions require your manual confirmation.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <AppHeader />

        {/* Page Content */}
        <MainContentWrapper>
          {children}
        </MainContentWrapper>
      </div>
    </div>
  );
}
