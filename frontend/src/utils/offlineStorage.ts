// IndexedDB-based offline storage for caching data locally

const DB_NAME = 'sync-offline-db';
const DB_VERSION = 1;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface PendingAction {
  id: string;
  type: 'POST' | 'PUT' | 'DELETE';
  url: string;
  data?: unknown;
  timestamp: number;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<IDBDatabase>;

  constructor() {
    this.dbReady = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store for cached API responses
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
        
        // Store for pending actions (offline mutations)
        if (!db.objectStoreNames.contains('pendingActions')) {
          const store = db.createObjectStore('pendingActions', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async set<T>(key: string, data: T, ttlMinutes: number = 60): Promise<void> {
    const db = await this.dbReady;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('cache', 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.put({ key, ...entry });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('cache', 'readonly');
      const store = transaction.objectStore('cache');
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        // Check if expired
        if (result.expiresAt < Date.now()) {
          this.delete(key);
          resolve(null);
          return;
        }

        resolve(result.data as T);
      };
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('cache', 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // Queue an action to be synced when back online
  async queueAction(action: Omit<PendingAction, 'id' | 'timestamp'>): Promise<string> {
    const db = await this.dbReady;
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const pendingAction: PendingAction = {
      ...action,
      id,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingActions', 'readwrite');
      const store = transaction.objectStore('pendingActions');
      const request = store.add(pendingAction);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(id);
    });
  }

  async getPendingActions(): Promise<PendingAction[]> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingActions', 'readonly');
      const store = transaction.objectStore('pendingActions');
      const index = store.index('timestamp');
      const request = index.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async removePendingAction(id: string): Promise<void> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingActions', 'readwrite');
      const store = transaction.objectStore('pendingActions');
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearPendingActions(): Promise<void> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingActions', 'readwrite');
      const store = transaction.objectStore('pendingActions');
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.dbReady;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cache', 'pendingActions'], 'readwrite');
      transaction.objectStore('cache').clear();
      transaction.objectStore('pendingActions').clear();
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }
}

export const offlineStorage = new OfflineStorage();
export type { PendingAction };
