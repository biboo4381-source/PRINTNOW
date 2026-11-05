/**
 * Keeps the customer's chosen file in the browser (IndexedDB) so the preview and image
 * editor still work after a page reload or when a phone puts the tab to sleep.
 * Everything fails soft: if IndexedDB is unavailable we simply return null.
 */
const DB_NAME = "printnow";
const STORE = "draft-files";
const KEY = "current";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }).finally(() => db.close());
  } catch {
    return null;
  }
}

export const saveDraftFile = (file: Blob) => run("readwrite", (s) => s.put(file, KEY)).then(() => undefined);
export const loadDraftFile = () => run<Blob | undefined>("readonly", (s) => s.get(KEY) as IDBRequest<Blob | undefined>).then((b) => b ?? null);
export const clearDraftFile = () => run("readwrite", (s) => s.delete(KEY)).then(() => undefined);
