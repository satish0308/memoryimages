'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

export interface StagedMediaFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  extension: string;
  category: 'jpeg' | 'png' | 'video' | 'heic' | 'raw' | 'other';
  previewUrl: string;
  relativePath?: string;
}

export interface UploadQueueItem {
  id: string;
  name: string;
  size: number;
  category: 'jpeg' | 'png' | 'video' | 'heic' | 'raw' | 'other';
  status: 'queued' | 'uploading' | 'completed' | 'duplicate' | 'error';
  progress: number;
  error?: string;
  file: File;
  relativePath?: string;
}

export interface FileTypeCounts {
  jpeg: number;
  png: number;
  video: number;
  heic: number;
  raw: number;
  other: number;
  total: number;
}

export interface AlbumOption {
  id: number;
  name: string;
  media_count?: number;
}

interface UploadContextType {
  // Staging
  stagedFiles: StagedMediaFile[];
  fileTypeCounts: FileTypeCounts;
  isStagingModalOpen: boolean;
  totalStagedSize: number;
  destinationAlbumId: number | null;
  albums: AlbumOption[];
  setDestinationAlbumId: (id: number | null) => void;
  selectFiles: (files: FileList | File[], folderName?: string) => void;
  removeStagedFile: (id: string) => void;
  clearStagedFiles: () => void;
  createNewAlbum: (name: string) => Promise<number | null>;
  startUpload: (targetAlbumId?: number | null) => Promise<void>;

  // Upload Progress & Dock
  isUploading: boolean;
  queue: UploadQueueItem[];
  uploadedCount: number;
  totalCount: number;
  overallProgress: number;
  uploadSpeed: string;
  estimatedTime: string;
  uploadedBytes: number;
  totalBytes: number;
  isDockOpen: boolean;
  isDockMinimized: boolean;
  setIsDockMinimized: (min: boolean) => void;
  toggleDockMinimized: () => void;
  closeDock: () => void;
  retryFailed: () => void;
  resumeFailed: () => Promise<void>;
  cancelUpload: () => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

const CHUNK_THRESHOLD = 25 * 1024 * 1024; // 25 MB triggers resumable chunked upload
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks
const BATCH_SIZE = 10; // 10 images per multipart batch for fast server ingestion

function categorizeFile(filename: string, mimeType: string): 'jpeg' | 'png' | 'video' | 'heic' | 'raw' | 'other' {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg'].includes(ext) || mimeType.includes('jpeg')) return 'jpeg';
  if (ext === 'png' || mimeType.includes('png')) return 'png';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext) || mimeType.startsWith('video/')) return 'video';
  if (['heic', 'heif'].includes(ext)) return 'heic';
  if (['dng', 'cr2', 'nef', 'arw', 'rw2', 'orf', 'pef', 'raf'].includes(ext)) return 'raw';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Staging State
  const [stagedFiles, setStagedFiles] = useState<StagedMediaFile[]>([]);
  const [isStagingModalOpen, setIsStagingModalOpen] = useState(false);
  const [destinationAlbumId, setDestinationAlbumId] = useState<number | null>(null);
  const [albums, setAlbums] = useState<AlbumOption[]>([]);

  // Execution & Progress State
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState('');
  const [estimatedTime, setEstimatedTime] = useState('');
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);

  // Floating Dock State
  const [isDockOpen, setIsDockOpen] = useState(false);
  const [isDockMinimized, setIsDockMinimized] = useState(false);

  // References for resumption & telemetry
  const activeAlbumIdRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const speedTrackerRef = useRef<{ timestamp: number; bytes: number }[]>([]);

  // Fetch available albums when staging modal opens
  const fetchAlbums = useCallback(async () => {
    try {
      const authToken = token || (typeof window !== 'undefined' ? (localStorage.getItem('memorypics_token') || localStorage.getItem('token')) : null);
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${API_URL}/api/v1/albums`, { headers });
      if (res.ok) {
        const data = await res.json();
        setAlbums(data.map((a: any) => ({ id: a.id, name: a.name, media_count: a.media_count || 0 })));
      }
    } catch (err) {
      console.error('Failed to fetch albums for upload staging:', err);
    }
  }, [API_URL, token]);

  useEffect(() => {
    if (isStagingModalOpen) {
      fetchAlbums();
    }
  }, [isStagingModalOpen, fetchAlbums]);

  // Compute file type statistics
  const fileTypeCounts: FileTypeCounts = React.useMemo(() => {
    const counts = { jpeg: 0, png: 0, video: 0, heic: 0, raw: 0, other: 0, total: stagedFiles.length };
    stagedFiles.forEach((f) => {
      counts[f.category]++;
    });
    return counts;
  }, [stagedFiles]);

  const totalStagedSize = React.useMemo(() => {
    return stagedFiles.reduce((acc, f) => acc + f.size, 0);
  }, [stagedFiles]);

  // File Selection (from multiple picker or directory selection)
  const selectFiles = useCallback((files: FileList | File[], folderName?: string) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newStaged: StagedMediaFile[] = fileArray.map((file, idx) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const category = categorizeFile(file.name, file.type);
      // Generate object URL preview only for up to the first 24 items to protect browser memory
      let previewUrl = '';
      if (idx < 24 && (category === 'jpeg' || category === 'png')) {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {
          previewUrl = '';
        }
      }

      // Preserve relative path if available from webkitRelativePath
      const relPath = (file as any).webkitRelativePath || file.name;

      return {
        id: `staged_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type || `application/x-${ext}`,
        extension: ext,
        category,
        previewUrl,
        relativePath: relPath,
      };
    });

    setStagedFiles((prev) => [...prev, ...newStaged]);
    setIsStagingModalOpen(true);
  }, []);

  const removeStagedFile = useCallback((id: string) => {
    setStagedFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearStagedFiles = useCallback(() => {
    stagedFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setStagedFiles([]);
    setIsStagingModalOpen(false);
  }, [stagedFiles]);

  const createNewAlbum = async (name: string): Promise<number | null> => {
    if (!name.trim()) return null;
    try {
      const authToken = token || (typeof window !== 'undefined' ? (localStorage.getItem('memorypics_token') || localStorage.getItem('token')) : null);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${API_URL}/api/v1/albums`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim(), description: 'Created during upload' }),
      });
      if (res.ok) {
        const newAlbum = await res.json();
        setAlbums((prev) => [...prev, { id: newAlbum.id, name: newAlbum.name, media_count: 0 }]);
        setDestinationAlbumId(newAlbum.id);
        return newAlbum.id;
      }
    } catch (err) {
      console.error('Error creating album during upload:', err);
    }
    return null;
  };

  // Upload Speed & ETA Telemetry
  const recordBytesTransferred = (totalTransferred: number, totalBatchBytes: number) => {
    const now = Date.now();
    speedTrackerRef.current.push({ timestamp: now, bytes: totalTransferred });

    // Keep only last 5 seconds of readings
    speedTrackerRef.current = speedTrackerRef.current.filter((entry) => now - entry.timestamp <= 5000);

    if (speedTrackerRef.current.length >= 2) {
      const oldest = speedTrackerRef.current[0];
      const timeDelta = (now - oldest.timestamp) / 1000;
      const bytesDelta = totalTransferred - oldest.bytes;
      if (timeDelta > 0.5 && bytesDelta > 0) {
        const bytesPerSec = bytesDelta / timeDelta;
        setUploadSpeed(`${formatBytes(bytesPerSec)}/s`);

        const remainingBytes = Math.max(0, totalBatchBytes - totalTransferred);
        const secondsRemaining = Math.round(remainingBytes / bytesPerSec);
        if (secondsRemaining <= 1) {
          setEstimatedTime('A few seconds remaining');
        } else if (secondsRemaining < 60) {
          setEstimatedTime(`${secondsRemaining}s remaining`);
        } else {
          const mins = Math.floor(secondsRemaining / 60);
          const secs = secondsRemaining % 60;
          setEstimatedTime(`${mins}m ${secs}s remaining`);
        }
      }
    }
  };

  // Chunked Upload for Large Files >= 25MB (4K Videos, RAW Files)
  const uploadLargeFileChunked = async (
    item: UploadQueueItem,
    targetAlbumId: number | null,
    authToken: string | null,
    signal: AbortSignal,
    onProgressUpdate: (bytesIncrement: number) => void
  ): Promise<{ success: boolean; isDuplicate?: boolean; error?: string }> => {
    const file = item.file;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    try {
      // 1. Init Chunked Session
      const initForm = new FormData();
      initForm.append('filename', file.name);
      initForm.append('file_size', file.size.toString());
      initForm.append('total_chunks', totalChunks.toString());
      initForm.append('chunk_size', CHUNK_SIZE.toString());
      if (targetAlbumId) initForm.append('album_id', targetAlbumId.toString());

      const initHeaders: Record<string, string> = {};
      if (authToken) initHeaders['Authorization'] = `Bearer ${authToken}`;

      const initRes = await fetch(`${API_URL}/api/v1/media/upload-chunk/init`, {
        method: 'POST',
        headers: initHeaders,
        body: initForm,
        signal,
      });

      if (!initRes.ok) throw new Error('Failed to initialize chunked upload');
      const { upload_id } = await initRes.json();

      // 2. Upload Chunks in sequence with live progress
      for (let i = 0; i < totalChunks; i++) {
        if (signal.aborted) throw new Error('Upload paused by user');

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);

        const chunkForm = new FormData();
        chunkForm.append('upload_id', upload_id);
        chunkForm.append('chunk_index', i.toString());
        chunkForm.append('file', chunkBlob, file.name);

        const chunkRes = await fetch(`${API_URL}/api/v1/media/upload-chunk`, {
          method: 'POST',
          headers: initHeaders,
          body: chunkForm,
          signal,
        });

        if (!chunkRes.ok) throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks}`);

        const chunkSizeUploaded = end - start;
        onProgressUpdate(chunkSizeUploaded);

        const itemPct = Math.round(((i + 1) / totalChunks) * 100);
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, progress: itemPct, status: 'uploading' } : q))
        );
      }

      // 3. Complete and assemble chunks
      const compForm = new FormData();
      compForm.append('upload_id', upload_id);
      compForm.append('filename', file.name);
      if (targetAlbumId) compForm.append('album_id', targetAlbumId.toString());

      const compRes = await fetch(`${API_URL}/api/v1/media/upload-chunk/complete`, {
        method: 'POST',
        headers: initHeaders,
        body: compForm,
        signal,
      });

      if (!compRes.ok) {
        const errDetail = await compRes.text();
        throw new Error(`Failed to complete chunk assembly: ${errDetail}`);
      }
      const compData = await compRes.json();
      return {
        success: true,
        isDuplicate: Boolean(compData.is_duplicate || compData.status === 'duplicate'),
      };
    } catch (err: any) {
      if (err.name === 'AbortError') return { success: false, error: 'Upload paused by user' };
      console.error(`Chunked upload failed for ${file.name}:`, err);
      return { success: false, error: err.message || 'Chunked upload failed' };
    }
  };

  // Internal Execution Pipeline: Processes a subset of items (initial queue or failed retry items)
  const executeUploadPipeline = async (
    itemsToProcess: UploadQueueItem[],
    albumToUse: number | null,
    signal: AbortSignal,
    totalBatchBytes: number,
    initialUploadedBytes: number,
    initialCompletedCount: number
  ) => {
    const authToken = token || (typeof window !== 'undefined' ? (localStorage.getItem('memorypics_token') || localStorage.getItem('token')) : null);
    let runningUploadedBytes = initialUploadedBytes;
    let completedItemCount = initialCompletedCount;

    const standardFiles = itemsToProcess.filter((item) => item.size < CHUNK_THRESHOLD);
    const largeFiles = itemsToProcess.filter((item) => item.size >= CHUNK_THRESHOLD);

    // 1. Process standard files in batches of up to BATCH_SIZE (10 files)
    for (let b = 0; b < standardFiles.length; b += BATCH_SIZE) {
      if (signal.aborted) break;

      const currentBatch = standardFiles.slice(b, b + BATCH_SIZE);
      const batchIds = new Set(currentBatch.map((item) => item.id));

      // Mark batch as uploading
      setQueue((prev) =>
        prev.map((item) => (batchIds.has(item.id) ? { ...item, status: 'uploading', progress: 15, error: undefined } : item))
      );

      const formData = new FormData();
      const relativePathMap: Record<string, string> = {};

      currentBatch.forEach((item) => {
        formData.append('files', item.file);
        if (item.relativePath) {
          relativePathMap[item.name] = item.relativePath;
        }
      });

      if (albumToUse) formData.append('album_id', albumToUse.toString());
      if (Object.keys(relativePathMap).length > 0) {
        formData.append('relative_paths', JSON.stringify(relativePathMap));
      }

      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      try {
        const progressInterval = setInterval(() => {
          setQueue((prev) =>
            prev.map((item) => {
              if (batchIds.has(item.id) && item.status === 'uploading' && item.progress < 85) {
                return { ...item, progress: Math.min(85, item.progress + 15) };
              }
              return item;
            })
          );
        }, 400);

        const res = await fetch(`${API_URL}/api/v1/media/upload-batch`, {
          method: 'POST',
          headers,
          body: formData,
          signal,
        });

        clearInterval(progressInterval);

        if (res.ok) {
          const data = await res.json();
          const errorMap = new Map<string, string>();
          if (Array.isArray(data.errors)) {
            data.errors.forEach((e: any) => {
              if (e.filename) errorMap.set(e.filename, e.error || 'Failed to process');
            });
          }

          const duplicateSet = new Set<string>();
          if (Array.isArray(data.duplicates)) {
            data.duplicates.forEach((d: any) => {
              if (d.filename) duplicateSet.add(d.filename);
            });
          }

          let batchProcessedBytes = 0;
          currentBatch.forEach((item) => {
            if (!errorMap.has(item.name)) {
              batchProcessedBytes += item.size;
              completedItemCount += 1;
            }
          });

          runningUploadedBytes += batchProcessedBytes;
          setUploadedBytes(runningUploadedBytes);
          setUploadedCount(completedItemCount);
          setOverallProgress(Math.min(100, Math.round((runningUploadedBytes / totalBatchBytes) * 100)));
          recordBytesTransferred(runningUploadedBytes, totalBatchBytes);

          // Update queue items reflecting actual backend success, duplicate, or error
          setQueue((prev) =>
            prev.map((item) => {
              if (!batchIds.has(item.id)) return item;
              const err = errorMap.get(item.name);
              if (err) {
                return { ...item, status: 'error', error: err };
              }
              if (duplicateSet.has(item.name)) {
                return { ...item, status: 'duplicate', progress: 100 };
              }
              return { ...item, status: 'completed', progress: 100 };
            })
          );
        } else {
          const errText = await res.text();
          throw new Error(`Batch upload HTTP error: ${res.status} ${errText}`);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        console.error('Batch upload error:', err);
        setQueue((prev) =>
          prev.map((item) =>
            batchIds.has(item.id) ? { ...item, status: 'error', error: err.message || 'Upload failed' } : item
          )
        );
      }
    }

    // 2. Process large files via chunked resumable upload
    for (const largeItem of largeFiles) {
      if (signal.aborted) break;

      setQueue((prev) =>
        prev.map((item) => (item.id === largeItem.id ? { ...item, status: 'uploading', progress: 5, error: undefined } : item))
      );

      const result = await uploadLargeFileChunked(
        largeItem,
        albumToUse,
        authToken,
        signal,
        (chunkBytesIncrement) => {
          runningUploadedBytes += chunkBytesIncrement;
          setUploadedBytes(runningUploadedBytes);
          setOverallProgress(Math.min(99, Math.round((runningUploadedBytes / totalBatchBytes) * 100)));
          recordBytesTransferred(runningUploadedBytes, totalBatchBytes);
        }
      );

      if (result.success) {
        completedItemCount += 1;
        setUploadedCount(completedItemCount);
        setQueue((prev) =>
          prev.map((item) =>
            item.id === largeItem.id
              ? { ...item, status: result.isDuplicate ? 'duplicate' : 'completed', progress: 100 }
              : item
          )
        );
      } else {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === largeItem.id
              ? { ...item, status: 'error', error: result.error || 'Large file upload failed' }
              : item
          )
        );
      }
    }
  };

  // Start Upload from Staging
  const startUpload = async (targetAlbumId?: number | null) => {
    if (stagedFiles.length === 0 || isUploading) return;

    const albumToUse = targetAlbumId !== undefined ? targetAlbumId : destinationAlbumId;
    activeAlbumIdRef.current = albumToUse;

    const initialQueue: UploadQueueItem[] = stagedFiles.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      category: f.category,
      status: 'queued',
      progress: 0,
      file: f.file,
      relativePath: f.relativePath,
    }));

    const totalBatchBytes = stagedFiles.reduce((sum, f) => sum + f.size, 0);

    setQueue(initialQueue);
    setIsUploading(true);
    setIsStagingModalOpen(false);
    setIsDockOpen(true);
    setIsDockMinimized(false);
    setUploadedCount(0);
    setTotalCount(initialQueue.length);
    setUploadedBytes(0);
    setTotalBytes(totalBatchBytes);
    setOverallProgress(0);
    setUploadSpeed('Calculating...');
    setEstimatedTime('Calculating...');

    speedTrackerRef.current = [{ timestamp: Date.now(), bytes: 0 }];
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Free memory from staged object previews
    stagedFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setStagedFiles([]);

    try {
      await executeUploadPipeline(initialQueue, albumToUse, controller.signal, totalBatchBytes, 0, 0);
    } catch (err: any) {
      console.error('Global upload controller error:', err);
    } finally {
      setIsUploading(false);

      // Check final queue status
      setQueue((currentQueue) => {
        const hasErrors = currentQueue.some((i) => i.status === 'error');
        if (!hasErrors) {
          setOverallProgress(100);
          setUploadSpeed('Complete');
          setEstimatedTime('');
        } else {
          setUploadSpeed('Paused');
          setEstimatedTime('Ready to resume failed files');
        }
        return currentQueue;
      });

      // Notify timeline and albums to update without a hard page reload
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('media-uploaded'));
      }
    }
  };

  // In-Place Resumption for Failed Items: Only uploads failed files, preserving completed ones
  const resumeFailed = async () => {
    if (isUploading) return;

    const failedItems = queue.filter((item) => item.status === 'error');
    if (failedItems.length === 0) return;

    const albumToUse = activeAlbumIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset failed items in queue to queued status
    const failedIds = new Set(failedItems.map((i) => i.id));
    setQueue((prev) =>
      prev.map((item) => (failedIds.has(item.id) ? { ...item, status: 'queued', progress: 0, error: undefined } : item))
    );

    setIsUploading(true);
    setUploadSpeed('Resuming...');
    setEstimatedTime('Calculating...');

    const alreadyDoneItems = queue.filter((item) => item.status === 'completed' || item.status === 'duplicate');
    const baseBytes = alreadyDoneItems.reduce((sum, item) => sum + item.size, 0);
    const baseCount = alreadyDoneItems.length;

    speedTrackerRef.current = [{ timestamp: Date.now(), bytes: baseBytes }];

    try {
      await executeUploadPipeline(failedItems, albumToUse, controller.signal, totalBytes, baseBytes, baseCount);
    } catch (err: any) {
      console.error('Failed resumption error:', err);
    } finally {
      setIsUploading(false);

      setQueue((currentQueue) => {
        const hasErrors = currentQueue.some((i) => i.status === 'error');
        if (!hasErrors) {
          setOverallProgress(100);
          setUploadSpeed('Complete');
          setEstimatedTime('');
        } else {
          setUploadSpeed('Paused');
          setEstimatedTime('Some items still failed');
        }
        return currentQueue;
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('media-uploaded'));
      }
    }
  };

  // Re-open staging modal with failed files (if user wants to re-configure or inspect)
  const retryFailed = () => {
    const failedItems = queue.filter((item) => item.status === 'error');
    if (failedItems.length === 0) return;

    const reStaged: StagedMediaFile[] = failedItems.map((item) => ({
      id: item.id,
      file: item.file,
      name: item.name,
      size: item.size,
      type: item.file.type,
      extension: item.name.split('.').pop()?.toLowerCase() || '',
      category: item.category,
      previewUrl: '',
      relativePath: item.relativePath,
    }));

    setStagedFiles(reStaged);
    setIsStagingModalOpen(true);
  };

  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsUploading(false);
    setUploadSpeed('Paused');
    setEstimatedTime('');
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'uploading' || item.status === 'queued'
          ? { ...item, status: 'error', error: 'Upload paused by user' }
          : item
      )
    );
  };

  const toggleDockMinimized = () => setIsDockMinimized((prev) => !prev);
  const closeDock = () => {
    if (isUploading) {
      if (!confirm('An upload is currently in progress. Minimize dock instead?')) {
        return;
      }
      setIsDockMinimized(true);
      return;
    }
    setIsDockOpen(false);
    setQueue([]);
  };

  return (
    <UploadContext.Provider
      value={{
        stagedFiles,
        fileTypeCounts,
        isStagingModalOpen,
        totalStagedSize,
        destinationAlbumId,
        albums,
        setDestinationAlbumId,
        selectFiles,
        removeStagedFile,
        clearStagedFiles,
        createNewAlbum,
        startUpload,

        isUploading,
        queue,
        uploadedCount,
        totalCount,
        overallProgress,
        uploadSpeed,
        estimatedTime,
        uploadedBytes,
        totalBytes,
        isDockOpen,
        isDockMinimized,
        setIsDockMinimized,
        toggleDockMinimized,
        closeDock,
        retryFailed,
        resumeFailed,
        cancelUpload,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
};

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};
