'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { 
  User as UserIcon, 
  LogOut, 
  ShieldCheck, 
  ChevronDown, 
  UserPlus, 
  Users,
  LogIn,
  Settings,
  Moon
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getApiUrl } from '@/utils/apiUrl';

interface UserNavMenuProps {
  onOpenAuthModal: (initialUser?: string) => void;
}

export const UserNavMenu: React.FC<UserNavMenuProps> = ({ onOpenAuthModal }) => {
  const { user, isAuthenticated, logout, allUsers, switchAccount, hasSavedSession } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleGoogleSignIn = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/auth/google/url`);
      const data = await res.json();
      if (res.ok && data.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={() => onOpenAuthModal()}
        className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-semibold border border-indigo-200 dark:border-indigo-800 transition"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>Sign In</span>
      </button>
    );
  }

  const initials = user.full_name 
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user.username.slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      {/* User Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 p-1.5 pr-3 rounded-full bg-slate-100 hover:bg-slate-200 transition border border-slate-200 select-none"
      >
        <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
          {initials}
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-xs font-semibold text-slate-800 leading-none">
            {user.full_name || user.username}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-none">
            {user.is_admin ? 'Admin' : 'Family Member'}
          </p>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-fadeIn">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-900 truncate">
              {user.full_name || user.username}
            </p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {user.email}
            </p>
            {user.is_admin && (
              <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-full border border-emerald-200">
                <ShieldCheck className="w-3 h-3" />
                <span>Admin Privileges</span>
              </span>
            )}
          </div>

          {/* Switch Account Section */}
          {allUsers.length > 1 && (
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1">
                Family & Accounts
              </p>
              <div className="space-y-1">
                {allUsers.map((u) => {
                  const saved = hasSavedSession(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        if (u.id === user.id) return;
                        setIsOpen(false);
                        if (saved) {
                          switchAccount(u.id);
                        } else {
                          onOpenAuthModal(u.username);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                        u.id === user.id
                          ? 'bg-indigo-50 text-indigo-700 font-semibold cursor-default'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">{u.full_name || u.username}</span>
                      {u.id === user.id ? (
                        <span className="text-[10px] text-indigo-600 font-bold">• Active</span>
                      ) : saved ? (
                        <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          ⚡ Switch
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Sign In</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Links */}
          <div className="p-1 space-y-0.5">
            <button
              onClick={() => {
                setIsOpen(false);
                handleGoogleSignIn();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-xl transition"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.98 0 12s.46 3.84 1.26 5.42l4.02-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
              <span>Sign in with Google</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                onOpenAuthModal();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-xl transition"
            >
              <UserPlus className="w-3.5 h-3.5 text-slate-400" />
              <span>Switch / Add Account</span>
            </button>

            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-xl transition"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>App & Storage Settings</span>
            </Link>

            <button
              onClick={async () => {
                setIsOpen(false);
                if (confirm('Put MyMemoryPics to sleep? This gracefully stops all heavy Docker containers, immediately freeing ~2GB of laptop RAM and CPU. You can wake it anytime with 1 click.')) {
                  const managerUrl = `http://${window.location.hostname}:8080`;
                  try {
                    await fetch(`${managerUrl}/api/stop`, { method: 'POST', mode: 'no-cors' });
                  } catch {}
                  window.location.href = managerUrl;
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-600 hover:bg-amber-50 rounded-xl transition font-medium"
              title="Stop Docker containers & release laptop RAM/CPU"
            >
              <Moon className="w-3.5 h-3.5 text-amber-500" />
              <span>Sleep Server (Free RAM)</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
