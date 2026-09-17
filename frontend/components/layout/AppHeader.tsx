'use client';

import React, { useState } from 'react';
import { Search, Upload, Cpu, Loader2, Sparkles } from 'lucide-react';
import { UserNavMenu } from '@/components/auth/UserNavMenu';
import { AuthModal } from '@/components/auth/AuthModal';
import { useTaskQueue } from '@/context/TaskQueueContext';
import { TaskQueueDrawer } from '@/components/tasks/TaskQueueDrawer';

export const AppHeader: React.FC = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { runningTask, openDrawer, isWsConnected } = useTaskQueue();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append('file', files[i]);
      try {
        await fetch(`${API_URL}/api/v1/media/upload`, {
          method: 'POST',
          body: formData,
        });
      } catch (err) {
        console.error('Upload error:', err);
      }
    }
    setUploading(false);
    window.location.reload();
  };

  return (
    <>
      <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between gap-4 flex-shrink-0 z-30">
        {/* Search Input Placeholder / Global Search */}
        <div className="flex-1 max-w-xl relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search memories, locations, or receipts across your library..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-100 border border-transparent rounded-full focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
          />
        </div>

        {/* Right Controls: Background Tasks, Upload & User Account Switcher */}
        <div className="flex items-center gap-3">
          {/* Background Task Queue Trigger Button */}
          {runningTask ? (
            <button
              onClick={openDrawer}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-xl shadow-xs transition hover:scale-[1.02]"
              title={`Active Task: ${runningTask.name} (${runningTask.progress}%)`}
            >
              <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin flex-shrink-0" />
              <div className="text-left hidden sm:flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-indigo-700 truncate max-w-[130px]">
                  {runningTask.name}
                </span>
                <span className="bg-indigo-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                  {runningTask.progress}%
                </span>
              </div>
            </button>
          ) : (
            <button
              onClick={openDrawer}
              className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition flex items-center gap-1.5 border border-slate-200/60"
              title="Background Tasks & AI Worker"
            >
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-semibold hidden md:inline">AI Tasks</span>
            </button>
          )}

          {/* Upload Button */}
          <label
            htmlFor="header-photo-upload"
            className={`flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition ${
              uploading ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Uploading...' : 'Upload Photo'}</span>
          </label>
          <input
            id="header-photo-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="h-5 w-px bg-slate-200 mx-1" />

          {/* User Profile & Account Switcher */}
          <UserNavMenu onOpenAuthModal={() => setShowAuthModal(true)} />
        </div>

        {/* Authentication & Account Modal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </header>

      {/* Global Background Tasks & Worker Drawer */}
      <TaskQueueDrawer />
    </>
  );
};
