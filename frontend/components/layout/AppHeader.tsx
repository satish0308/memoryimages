'use client';

import React, { useState, useRef } from 'react';
import { Search, Upload, FolderUp, Cpu, Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { UserNavMenu } from '@/components/auth/UserNavMenu';
import { AuthModal } from '@/components/auth/AuthModal';
import { useTaskQueue } from '@/context/TaskQueueContext';
import { useUpload } from '@/context/UploadContext';
import { TaskQueueDrawer } from '@/components/tasks/TaskQueueDrawer';

export const AppHeader: React.FC = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authInitialUser, setAuthInitialUser] = useState<string | undefined>(undefined);
  const [showUploadDropdown, setShowUploadDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { runningTask, openDrawer } = useTaskQueue();
  const { selectFiles, isUploading, overallProgress } = useUpload();

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      selectFiles(e.target.files);
    }
    e.target.value = '';
    setShowUploadDropdown(false);
  };

  const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      selectFiles(e.target.files);
    }
    e.target.value = '';
    setShowUploadDropdown(false);
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

          {/* Upload Button & Dropdown */}
          <div className="relative">
            <div className="flex items-center rounded-xl overflow-hidden shadow-xs border border-indigo-500/20">
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer transition ${
                  isUploading ? 'opacity-90' : ''
                }`}
                title="Select media files to upload"
              >
                {isUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{isUploading ? `Uploading (${overallProgress}%)` : 'Upload Media'}</span>
              </button>

              <button
                onClick={() => setShowUploadDropdown((prev) => !prev)}
                className="px-2 py-2 bg-indigo-700 hover:bg-indigo-800 text-white border-l border-indigo-500/30 transition flex items-center justify-center"
                title="Upload Options (Files or Folder)"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Dropdown Menu */}
            {showUploadDropdown && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUploadDropdown(false)}
                />
                <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-1.5 z-50 text-xs animate-fadeIn">
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowUploadDropdown(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 text-left font-medium transition"
                  >
                    <Upload className="w-4 h-4 text-indigo-600" />
                    <div>
                      <p className="font-semibold text-slate-900">Upload Files</p>
                      <p className="text-[10px] text-slate-400">Photos, 4K Videos, RAW</p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      folderInputRef.current?.click();
                      setShowUploadDropdown(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 text-left font-medium transition"
                  >
                    <FolderUp className="w-4 h-4 text-amber-500" />
                    <div>
                      <p className="font-semibold text-slate-900">Upload Folder</p>
                      <p className="text-[10px] text-slate-400">Scan & upload entire folder</p>
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* Hidden File Picker Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.heic,.heif,.dng,.cr2,.nef,.arw,.rw2,.orf,.tiff,.bmp"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />

            {/* Hidden Folder Picker Input */}
            <input
              ref={folderInputRef}
              type="file"
              {...({ webkitdirectory: '', directory: '' } as any)}
              multiple
              onChange={handleFolderSelected}
              className="hidden"
            />
          </div>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          {/* User Profile & Account Switcher */}
          <UserNavMenu
            onOpenAuthModal={(userToSwitch) => {
              setAuthInitialUser(userToSwitch);
              setShowAuthModal(true);
            }}
          />
        </div>

        {/* Authentication & Account Modal */}
        <AuthModal
          isOpen={showAuthModal}
          initialIdentifier={authInitialUser}
          onClose={() => {
            setShowAuthModal(false);
            setAuthInitialUser(undefined);
          }}
        />
      </header>

      {/* Global Background Tasks & Worker Drawer */}
      <TaskQueueDrawer />
    </>
  );
};
