'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Sparkles, FolderUp, Film, Camera } from 'lucide-react';
import { useUpload } from '@/context/UploadContext';

const SUPPORTED_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tiff', 'bmp',
  'mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v',
  'dng', 'cr2', 'nef', 'arw', 'rw2', 'orf', 'pef', 'raf'
]);

function isMediaFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_EXTS.has(ext);
}

// Recursive helper to traverse DataTransferItem entries (handles nested directories)
async function traverseFileSystemEntry(entry: any, path = ''): Promise<File[]> {
  const collected: File[] = [];

  if (entry.isFile) {
    const file: File = await new Promise((resolve, reject) => {
      entry.file(resolve, reject);
    });
    if (isMediaFile(file.name)) {
      // Attach relative path for folder upload preservation
      Object.defineProperty(file, 'webkitRelativePath', {
        value: path ? `${path}/${file.name}` : file.name,
        writable: true,
      });
      collected.push(file);
    }
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const entries: any[] = await new Promise((resolve, reject) => {
      dirReader.readEntries(resolve, reject);
    });
    const subPath = path ? `${path}/${entry.name}` : entry.name;
    for (const subEntry of entries) {
      const nested = await traverseFileSystemEntry(subEntry, subPath);
      collected.push(...nested);
    }
  }

  return collected;
}

export const GlobalDropzoneOverlay: React.FC = () => {
  const { selectFiles } = useUpload();
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = React.useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      if (!e.dataTransfer) return;

      const items = e.dataTransfer.items;
      const collectedFiles: File[] = [];

      if (items && items.length > 0) {
        const promises: Promise<File[]>[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
          if (entry) {
            promises.push(traverseFileSystemEntry(entry));
          } else {
            const file = item.getAsFile();
            if (file && isMediaFile(file.name)) {
              collectedFiles.push(file);
            }
          }
        }

        if (promises.length > 0) {
          const nestedResults = await Promise.all(promises);
          nestedResults.forEach((arr) => collectedFiles.push(...arr));
        }
      } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const rawFiles = Array.from(e.dataTransfer.files);
        rawFiles.forEach((file) => {
          if (isMediaFile(file.name)) collectedFiles.push(file);
        });
      }

      if (collectedFiles.length > 0) {
        selectFiles(collectedFiles);
      }
    },
    [selectFiles]
  );

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop]);

  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-8 animate-fadeIn pointer-events-none">
      <div className="w-full max-w-2xl border-4 border-dashed border-indigo-400/80 rounded-3xl p-12 flex flex-col items-center justify-center text-center bg-indigo-900/40 shadow-2xl">
        <div className="w-20 h-20 rounded-3xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shadow-inner mb-4 animate-bounce">
          <Upload className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-extrabold text-white">
          Drop photos, videos, or folders anywhere
        </h2>
        <p className="text-sm text-indigo-200 mt-2 max-w-md">
          Folders are automatically scanned recursively. Original files are preserved with 100% bit-for-bit lossless quality.
        </p>

        <div className="flex items-center gap-3 mt-6 text-xs text-indigo-300/80 font-semibold">
          <span className="flex items-center gap-1.5 bg-indigo-800/40 px-3 py-1.5 rounded-full border border-indigo-400/20">
            <FolderUp className="w-4 h-4 text-amber-300" />
            Folder Upload
          </span>
          <span className="flex items-center gap-1.5 bg-indigo-800/40 px-3 py-1.5 rounded-full border border-indigo-400/20">
            <Film className="w-4 h-4 text-purple-300" />
            4K Videos
          </span>
          <span className="flex items-center gap-1.5 bg-indigo-800/40 px-3 py-1.5 rounded-full border border-indigo-400/20">
            <Camera className="w-4 h-4 text-rose-300" />
            RAW (CR2/DNG)
          </span>
        </div>
      </div>
    </div>
  );
};
