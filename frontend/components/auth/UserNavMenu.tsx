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
  Settings
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface UserNavMenuProps {
  onOpenAuthModal: () => void;
}

export const UserNavMenu: React.FC<UserNavMenuProps> = ({ onOpenAuthModal }) => {
  const { user, isAuthenticated, logout, allUsers, login } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        onClick={onOpenAuthModal}
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
                {allUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      // Switch user
                      if (u.id !== user.id) {
                        setIsOpen(false);
                        onOpenAuthModal();
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition ${
                      u.id === user.id
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{u.full_name || u.username}</span>
                    {u.id === user.id ? (
                      <span className="text-[10px] text-indigo-600 font-bold">• Active</span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Switch</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Links */}
          <div className="p-1 space-y-0.5">
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
