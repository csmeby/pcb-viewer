const DB_NAME = "pcbviewer-model-cache";
const STORE_NAME = "models";
const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300MB -- "delete when possible" rather than grow unbounded.

interface CacheEntry {
  key: string;
  bytes: ArrayBuffer;
  size: number;
  lastAccessed: number;
}

// In-memory fallback (and same-session fast path) -- custom-scheme WKWebView
// origins have a plausible but not conclusively confirmed secure-context
// edge case around storage APIs, so IndexedDB failures degrade to
// session-only caching rather than failing outright.
const memoryCache = new Map<string, ArrayBuffer>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("lastAccessed", "lastAccessed");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function readFromDb(db: IDBDatabase, key: string): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    try {
      const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        entry.lastAccessed = Date.now();
        store.put(entry);
        resolve(entry.bytes);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeToDb(db: IDBDatabase, key: string, bytes: ArrayBuffer): Promise<void> {
  const entry: CacheEntry = { key, bytes, size: bytes.byteLength, lastAccessed: Date.now() };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Evicts least-recently-used entries until the store is back under the cap. Fire-and-forget -- never blocks a cache read/write on this. */
async function evictLeastRecentlyUsed(db: IDBDatabase): Promise<void> {
  const entries = await new Promise<CacheEntry[]>((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as CacheEntry[]) ?? []);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });

  let total = entries.reduce((sum, e) => sum + e.size, 0);
  if (total <= MAX_TOTAL_BYTES) {
    return;
  }

  entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const entry of entries) {
    if (total <= MAX_TOTAL_BYTES) {
      break;
    }
    store.delete(entry.key);
    total -= entry.size;
  }
}

/**
 * Returns cached bytes for `key` (a resolved model path/URL from
 * resolveModelSource.ts), calling `fetchBytes` only on a cache miss.
 * Agnostic to where bytes actually come from -- the same cache serves both
 * project-local (fileSystem.get()) and network-fetched (fetch()) sources.
 */
export async function getModelBytes(key: string, fetchBytes: () => Promise<ArrayBuffer>): Promise<ArrayBuffer> {
  const inMemory = memoryCache.get(key);
  if (inMemory) {
    return inMemory;
  }

  const db = await openDb();
  if (db) {
    const cached = await readFromDb(db, key);
    if (cached) {
      memoryCache.set(key, cached);
      return cached;
    }
  }

  const bytes = await fetchBytes();
  memoryCache.set(key, bytes);
  if (db) {
    await writeToDb(db, key, bytes);
    evictLeastRecentlyUsed(db).catch(() => {});
  }
  return bytes;
}
