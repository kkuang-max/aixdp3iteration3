// Keeps uploaded files (the 3D model and the product doc) in this browser's IndexedDB, so a refresh
// doesn't lose them. Files never leave the browser except when sent to the AI route on request.

const DB = "playform";
const STORE = "files";
/** "publishedModel" is the model file the kiosk shows (a copy, so editing in the portal doesn't change the kiosk). */
export type FileKey = "model" | "doc" | "publishedModel";
export type StoredFile = { name: string; type: string; data: ArrayBuffer };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const saveFile = (key: FileKey, file: StoredFile) => run("readwrite", (s) => s.put(file, key)).then(() => undefined);
export const loadFile = (key: FileKey) => run<StoredFile | undefined>("readonly", (s) => s.get(key)).catch(() => undefined);
export const deleteFile = (key: FileKey) => run("readwrite", (s) => s.delete(key)).then(() => undefined).catch(() => undefined);
