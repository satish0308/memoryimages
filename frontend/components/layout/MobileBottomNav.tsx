'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Image as ImageIcon,
  Flame,
  Users,
  BookOpen,
  Menu,
  X,
  Sparkles,
  Globe,
  Trash2,
  FolderSync,
  Settings,
  ShieldCheck,
  Tv,
  LogOut,
  ChevronRight,
  Shield,
  Layers,
  Heart,
  Moon,
  Power
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { UserNavMenu } from '@/components/auth/UserNavMenu';
import { AuthModal } from '@/components/auth/AuthModal';

export const MobileBottomNav: React.FC = () => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authInitialUser, setAuthInitialUser] = useState<string | undefined>(undefined);

  // Close drawer on navigation
  const handleNavClick = () => {
    setIsDrawerOpen(false);
  };

  const navItems = [
    {
      href: '/',
      label: 'Photos',
      icon: ImageIcon,
      active: pathname === '/',
    },
    {
      href: '/memories',
      label: 'Memories',
      icon: Flame,
      active: pathname.startsWith('/memories'),
      badge: 'Story',
    },
    {
      href: '/people',
      label: 'People',
      icon: Users,
      active: pathname.startsWith('/people'),
    },
    {
      href: '/albums',
      label: 'Albums',
      icon: BookOpen,
      active: pathname.startsWith('/albums'),
    },
  ];

  const drawerLinks = [
    {
      href: '/triage',
      label: 'Smart Triage',
      description: 'Clean bills, screenshots & junk',
      icon: Sparkles,
      color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40',
      badge: 'Clean',
    },
    {
      href: '/map',
      label: 'Places & Map',
      description: 'GPS photo map & travel paths',
      icon: Globe,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
    },
    {
      href: '/similar',
      label: 'Similar AI',
      description: 'CLIP vector scene discovery',
      icon: Layers,
      color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40',
    },
    {
      href: '/sync',
      label: 'Sync & Sources',
      description: 'Google Drive & local library',
      icon: FolderSync,
      color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40',
    },
    {
      href: '/trash',
      label: 'Trash & Purge',
      description: 'Review queued deletion items',
      icon: Trash2,
      color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/40',
    },
    {
      href: '/settings',
      label: 'App Settings',
      description: 'Storage, AI strictness & backups',
      icon: Settings,
      color: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800',
    },
    ...((user?.is_admin || user?.role === 'admin')
      ? [
          {
            href: '/admin',
            label: 'Admin Portal',
            description: 'Docker, logs, telemetry & maintenance',
            icon: ShieldCheck,
            color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40',
            badge: 'Ops',
          },
        ]
      : []),
    {
      href: '/tv',
      label: 'Smart TV Lounge',
      description: 'Cast & control big screen photos',
      icon: Tv,
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40',
      external: true,
      badge: 'Cast',
    },
    {
      href: '/kiosk',
      label: 'Kiosk Ambient Frame',
      description: 'Fullscreen TV digital photo frame',
      icon: Tv,
      color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
      external: true,
    },
  ];

  return (
    <>
      {/* Fixed Native Glassmorphic Mobile Bottom Dock */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/92 dark:bg-slate-900/92 backdrop-blur-2xl border-t border-slate-200/80 dark:border-slate-800 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] select-none safe-area-pb"
      >
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={`relative flex flex-col items-center justify-center h-full py-1 transition-all duration-200 active:scale-95 ${
                  item.active
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900'
                }`}
              >
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 transition-transform duration-200 ${
                      item.active ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'
                    }`}
                  />
                  {item.badge && (
                    <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-xs" />
                  )}
                </div>
                <span className="text-[10px] mt-0.5 leading-tight tracking-tight">
                  {item.label}
                </span>
                {item.active && (
                  <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                )}
              </Link>
            );
          })}

          {/* More / Studio Drawer Button */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className={`flex flex-col items-center justify-center h-full py-1 transition-all duration-200 active:scale-95 ${
              isDrawerOpen
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900'
            }`}
          >
            <div className="relative">
              <Menu className="w-5 h-5 stroke-[1.8]" />
            </div>
            <span className="text-[10px] mt-0.5 leading-tight tracking-tight">More</span>
          </button>
        </div>
      </nav>

      {/* Slide-Up Bottom Sheet Modal for 'More' */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end animate-fadeIn">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Sheet Container */}
          <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl max-h-[85dvh] flex flex-col shadow-2xl border-t border-slate-200 dark:border-slate-800 z-10 overflow-hidden animate-slideUp safe-area-pb">
            {/* Grab Handle */}
            <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    MyMemoryPics Explorer
                  </h3>
                  <p className="text-[11px] text-slate-400">Library Tools & Services</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Links List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5 momentum-scroll">
              {drawerLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    target={link.external ? '_blank' : undefined}
                    onClick={handleNavClick}
                    className={`flex items-center justify-between p-3 rounded-2xl transition active:scale-[0.98] ${
                      isActive
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800'
                        : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-xl flex-shrink-0 ${link.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {link.label}
                          </p>
                          {link.badge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                              {link.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {link.description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
                  </Link>
                );
              })}

              {/* Sleep Server Action Button */}
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Put MyMemoryPics to sleep? This gracefully stops all heavy Docker containers, immediately freeing ~2GB of laptop RAM and CPU. You can wake it anytime with 1 click.')) {
                    setIsDrawerOpen(false);
                    const managerUrl = `http://${window.location.hostname}:8080`;
                    try {
                      await fetch(`${managerUrl}/api/stop`, { method: 'POST', mode: 'no-cors' });
                    } catch {}
                    window.location.href = managerUrl;
                  }
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-700 dark:text-amber-300 transition active:scale-[0.98] mt-2"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <Moon className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold">Sleep Server (Free RAM)</p>
                    <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80">Stop Docker containers & save laptop battery</p>
                  </div>
                </div>
                <Power className="w-4 h-4 text-amber-500" />
              </button>

              {/* Zero Auto-Delete Guarantee Card */}
              <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/60 rounded-2xl p-3 text-xs mt-3">
                <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-bold mb-0.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Zero Auto-Deletion Guarantee</span>
                </div>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 leading-tight">
                  Photos are never deleted automatically. Master originals remain 100% safe.
                </p>
              </div>

              {/* User Account & Sign Out Action */}
              {user && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-xs">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-800 dark:text-white">{user.username}</p>
                      <p className="text-[10px] text-slate-400">{user.email || 'Authenticated'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDrawerOpen(false);
                      logout();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl font-medium transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Switch Account Modal */}
      <AuthModal
        isOpen={showAuthModal}
        initialIdentifier={authInitialUser}
        onClose={() => {
          setShowAuthModal(false);
          setAuthInitialUser(undefined);
        }}
      />
    </>
  );
};
