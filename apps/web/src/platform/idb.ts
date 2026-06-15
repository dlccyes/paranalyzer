const DB_NAME = "paranalyzer";
const DB_VERSION = 1;

export const STORES = {
  meta: "meta",
  tracks: "tracks",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
  return dbPromise;
}

function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = run(store);
    let result: T | undefined;

    if (req) {
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  }));
}

export async function idbGet(store: StoreName, key: string): Promise<string | null> {
  const value = await withStore<string>(store, "readonly", (objectStore) => objectStore.get(key));
  return typeof value === "string" ? value : null;
}

export async function idbSet(store: StoreName, key: string, value: string): Promise<void> {
  await withStore(store, "readwrite", (objectStore) => objectStore.put(value, key));
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  await withStore(store, "readwrite", (objectStore) => objectStore.delete(key));
}

export async function idbClear(store: StoreName): Promise<void> {
  await withStore(store, "readwrite", (objectStore) => objectStore.clear());
}
