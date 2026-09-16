import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { 
  Image as ImageIcon, 
  Sparkles, 
  Users, 
  FolderSync, 
  Search, 
  Upload, 
  ShieldCheck,
  Clock,
  BookOpen,
  Globe,
  Settings
} from 'lucide-react';
import { Providers } from '@/components/layout/Providers';
import { AppHeader } from '@/components/layout/AppHeader';
import { MainContentWrapper } from '@/components/layout/MainContentWrapper';

export const metadata: Metadata = {
  title: 'MyMemoryPics - World-Class AI Photo Manager',
  description: 'AI-driven photo organization with smart triage, face recognition, and dual sync.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 antialiased">
        <Providers>
          {/* Left Sidebar */}
        <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between p-4 flex-shrink-0">
          <div>
            {/* Logo */}
            <div className="flex items-center gap-2 px-2 py-4 mb-4">
              <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-2 rounded-xl text-white shadow-md">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                  MyMemoryPics
                </h1>
                <p className="text-xs text-slate-400 font-medium">Smart AI Triage</p>
              </div>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-slate-500" />
                Photos
              </Link>
              <Link
                href="/albums"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
              >
                <BookOpen className="w-4 h-4 text-slate-500" />
                Albums
              </Link>
              <Link
                href="/map"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
              >
                <Globe className="w-4 h-4 text-slate-500" />
                Places & Map
              </Link>
              <Link
                href="/triage"
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Smart Triage
                </div>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Clean
                </span>
              </Link>
              <Link
                href="/people"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
              >
                <Users className="w-4 h-4 text-slate-500" />
                People & Faces
              </Link>
              <Link
                href="/sync"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
              >
                <FolderSync className="w-4 h-4 text-slate-500" />
                Sync & Sources
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
              >
                <Settings className="w-4 h-4 text-slate-500" />
                App Settings
              </Link>
            </nav>
          </div>

          {/* Bottom Card: Zero Auto-Deletion Guarantee */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
            <div className="flex items-center gap-2 text-indigo-600 font-semibold mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Zero Auto-Delete Policy</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              Photos are never deleted automatically. The system only highlights suggestions for your manual review.
            </p>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Dynamic Header with UserNavMenu & AuthModal */}
          <AppHeader />

          {/* Page View Body */}
          <MainContentWrapper>
            {children}
          </MainContentWrapper>
        </div>
        </Providers>
      </body>
    </html>
  );
}
