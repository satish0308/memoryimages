'use client';

import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  FolderPlus, 
  Film, 
  Camera, 
  Sparkles, 
  Layers, 
  HardDrive, 
  Check, 
  AlertCircle,
  FileText
} from 'lucide-react';
import { useUpload } from '@/context/UploadContext';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const UploadStagingModal: React.FC = () => {
  const {
    stagedFiles,
    fileTypeCounts,
    isStagingModalOpen,
    totalStagedSize,
    destinationAlbumId,
    albums,
    setDestinationAlbumId,
    removeStagedFile,
    clearStagedFiles,
    createNewAlbum,
    startUpload,
  } = useUpload();

  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isStagingModalOpen || stagedFiles.length === 0) return null;

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;
    const albumId = await createNewAlbum(newAlbumName);
    if (albumId) {
      setDestinationAlbumId(albumId);
      setIsCreatingAlbum(false);
      setNewAlbumName('');
    }
  };

  const handleStartUpload = async () => {
    setIsSubmitting(true);
    try {
      await startUpload(destinationAlbumId);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white border border-slate-200/80 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <Upload className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Ready to Upload {stagedFiles.length} Media {stagedFiles.length === 1 ? 'Item' : 'Items'}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {formatBytes(totalStagedSize)} total · Original quality and EXIF metadata preserved 100%
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={clearStagedFiles}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Type Statistics Pill Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="text-slate-400 font-medium mr-1">File breakdown:</span>
          {fileTypeCounts.jpeg > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {fileTypeCounts.jpeg} {fileTypeCounts.jpeg === 1 ? 'JPEG' : 'JPEGs'}
            </span>
          )}
          {fileTypeCounts.png > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {fileTypeCounts.png} {fileTypeCounts.png === 1 ? 'PNG' : 'PNGs'}
            </span>
          )}
          {fileTypeCounts.video > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200/60">
              <Film className="w-3.5 h-3.5 text-purple-600" />
              {fileTypeCounts.video} {fileTypeCounts.video === 1 ? 'Video' : 'Videos'}
            </span>
          )}
          {fileTypeCounts.heic > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              {fileTypeCounts.heic} Apple Live / HEIC
            </span>
          )}
          {fileTypeCounts.raw > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
              <Camera className="w-3.5 h-3.5 text-rose-600" />
              {fileTypeCounts.raw} RAW (CR2/NEF/DNG)
            </span>
          )}
          {fileTypeCounts.other > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {fileTypeCounts.other} Other
            </span>
          )}
        </div>

        {/* Scrollable Thumbnail Grid (Previews up to 24 items to ensure zero lag & prevent browser OOM) */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {stagedFiles.slice(0, 24).map((file) => (
              <div
                key={file.id}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition flex flex-col"
              >
                {/* Thumbnail Display */}
                {file.previewUrl ? (
                  <img
                    src={file.previewUrl}
                    alt={file.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : file.category === 'video' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 to-indigo-950 text-white p-3 text-center">
                    <Film className="w-8 h-8 text-purple-300 mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-500/30 px-1.5 py-0.5 rounded">
                      {file.extension.toUpperCase()}
                    </span>
                  </div>
                ) : file.category === 'raw' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-rose-900 to-slate-900 text-white p-3 text-center">
                    <Camera className="w-8 h-8 text-rose-300 mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-500/30 px-1.5 py-0.5 rounded">
                      {file.extension.toUpperCase()} RAW
                    </span>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-600 p-3 text-center">
                    <HardDrive className="w-7 h-7 text-slate-400 mb-1" />
                    <span className="text-[10px] font-mono font-bold uppercase">
                      {file.extension.toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Remove Button Overlay */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeStagedFile(file.id);
                  }}
                  className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition shadow-sm z-10"
                  title="Remove from upload"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Bottom Filename & Size Pill */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-white">
                  <p className="text-[10px] font-semibold truncate leading-tight" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-[9px] text-slate-300 font-mono mt-0.5">
                    {formatBytes(file.size)}
                  </p>
                </div>
              </div>
            ))}

            {stagedFiles.length > 24 && (
              <div className="aspect-square rounded-2xl bg-indigo-50/70 border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center text-center p-3 text-indigo-700 shadow-xs">
                <Sparkles className="w-6 h-6 text-indigo-600 mb-1" />
                <span className="text-xs font-bold">+{stagedFiles.length - 24} more</span>
                <span className="text-[10px] text-indigo-500 font-medium">ready to upload</span>
              </div>
            )}
          </div>
        </div>

        {/* Destination Album & Action Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Album Selector */}
          <div className="flex-1 w-full sm:w-auto flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 whitespace-nowrap">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Add to Album:</span>
            </span>

            {isCreatingAlbum ? (
              <form onSubmit={handleCreateAlbum} className="flex items-center gap-1.5 flex-1 max-w-xs">
                <input
                  type="text"
                  placeholder="New album title..."
                  value={newAlbumName}
                  onChange={(e) => setNewAlbumName(e.target.value)}
                  autoFocus
                  className="px-3 py-1.5 text-xs border border-indigo-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                />
                <button
                  type="submit"
                  disabled={!newAlbumName.trim()}
                  className="p-1.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                  title="Save album"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingAlbum(false)}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-xl"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 flex-1 max-w-xs">
                <select
                  value={destinationAlbumId || ''}
                  onChange={(e) => setDestinationAlbumId(e.target.value ? Number(e.target.value) : null)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 font-medium w-full cursor-pointer"
                >
                  <option value="">None (Library / All Photos)</option>
                  {albums.map((alb) => (
                    <option key={alb.id} value={alb.id}>
                      {alb.name} ({alb.media_count} photos)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsCreatingAlbum(true)}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center gap-1 transition whitespace-nowrap"
                  title="Create new album"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New</span>
                </button>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={clearStagedFiles}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              onClick={handleStartUpload}
              disabled={isSubmitting || stagedFiles.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition hover:scale-[1.02] disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Starting...' : `Upload ${stagedFiles.length} ${stagedFiles.length === 1 ? 'Item' : 'Items'}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
