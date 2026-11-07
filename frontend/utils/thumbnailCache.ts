/**
 * Client-Side Smart Caching Engine (IndexedDB)
 * 
 * Pre-warms and caches timeline thumbnails locally in browser IndexedDB.
 * Subsequent visits to your 10,000+ photo library load instantly with 0ms network latency,
 * even offline or on slow connections.
 */

const DB_NAME = 'mymemorypics_thumbnail_cache';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

// In-memory bounded LRU object URL cache to prevent repeated URL.createObjectURL calls and DOM memory leaks
const MAX_MEMORY_URLS = 250;
const memoryUrlCache = new Map<string, string>();

function setMemoryUrl(key: string, url: string) {
  if (memoryUrlCache.size >= MAX_MEMORY_URLS) {
    const oldestKey = memoryUrlCache.keys().next().value;
    if (oldestKey) {
      const oldUrl = memoryUrlCache.get(oldestKey);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      memoryUrlCache.delete(oldestKey);
    }
  }
  memoryUrlCache.set(key, url);
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (e) => {
        console.warn('Failed to open IndexedDB thumbnail cache:', e);
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB unavailable:', e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Returns a cached Blob ObjectURL for the photo thumbnail if present in IndexedDB.
 */
export async function getCachedThumbnailUrl(mediaId: number, size: number = 256): Promise<string | null> {
  const cacheKey = `thumb_${mediaId}_${size}`;
  if (memoryUrlCache.has(cacheKey)) {
    return memoryUrlCache.get(cacheKey)!;
  }

  try {
    const db = await getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);

      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          const objectUrl = URL.createObjectURL(req.result.blob);
          setMemoryUrl(cacheKey, objectUrl);
          resolve(objectUrl);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => {
        resolve(null);
      };
    });
  } catch (e) {
    return null;
  }
}

/**
 * Saves a fetched thumbnail Blob into IndexedDB.
 */
export async function cacheThumbnailBlob(mediaId: number, size: number = 256, blob: Blob): Promise<void> {
  const cacheKey = `thumb_${mediaId}_${size}`;
  try {
    const db = await getDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      key: cacheKey,
      mediaId,
      size,
      blob,
      timestamp: Date.now()
    });

    if (!memoryUrlCache.has(cacheKey)) {
      setMemoryUrl(cacheKey, URL.createObjectURL(blob));
    }
  } catch (e) {
    // Graceful degradation on quota exceeded or permission errors
  }
}

/**
 * Asynchronously pre-fetches and caches a thumbnail from its network URL into IndexedDB.
 */
export async function prefetchAndCacheThumbnail(url: string, mediaId: number, size: number = 256): Promise<string> {
  const existing = await getCachedThumbnailUrl(mediaId, size);
  if (existing) return existing;

  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      await cacheThumbnailBlob(mediaId, size, blob);
      const cacheKey = `thumb_${mediaId}_${size}`;
      return memoryUrlCache.get(cacheKey) || url;
    }
  } catch (e) {
    // Network error fallback
  }

  return url;
}

/**
 * Returns cache statistics (number of cached items and estimated size).
 */
export async function getThumbnailCacheStats(): Promise<{ count: number }> {
  try {
    const db = await getDB();
    if (!db) return { count: 0 };

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();

      countReq.onsuccess = () => {
        resolve({ count: countReq.result || 0 });
      };

      countReq.onerror = () => {
        resolve({ count: 0 });
      };
    });
  } catch (e) {
    return { count: 0 };
  }
}

/**
 * Clears the local IndexedDB thumbnail cache.
 */
export async function clearThumbnailCache(): Promise<void> {
  memoryUrlCache.forEach((url) => URL.revokeObjectURL(url));
  memoryUrlCache.clear();

  try {
    const db = await getDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch (e) {
    console.warn('Failed to clear thumbnail cache:', e);
  }
}
