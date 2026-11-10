// The demo the business portal publishes and the visitor kiosk shows.
// Stored twice: in this browser's IndexedDB (instant, same device) and, when the deployment has Vercel Blob set up,
// on the server via /api/kiosk-config so a kiosk on another device picks it up.

export type PublishedSection = { id: string; title: string; rows: { a: string; b: string }[] };
export type PublishedMapping = { gesture: string; sectionId: string; part: string; mode: string };
export type PublishedDemo = {
  version: 1;
  publishedAt: string;
  productName: string;
  sections: PublishedSection[];
  mappings: PublishedMapping[];
  /** An uploaded 3D model, as pictures: the whole model and each mapped part lit up in it. */
  model?: { fileName: string; whole: string; parts: Record<string, string> };
};

const DB = "playform";
const STORE = "files";
const KEY = "published";
export const MAX_SERVER_BYTES = 4_000_000; // Vercel caps request bodies at 4.5 MB

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
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

const isDemo = (d: unknown): d is PublishedDemo =>
  !!d && typeof d === "object" && (d as PublishedDemo).version === 1 && Array.isArray((d as PublishedDemo).sections);

/** Save locally, then try the server. Says where it ended up. */
export async function publishDemo(demo: PublishedDemo): Promise<{ local: boolean; server: boolean; serverNote?: string }> {
  let local = false;
  try {
    await idb("readwrite", (s) => s.put(demo, KEY));
    local = true;
  } catch {
    /* storage blocked */
  }
  const body = JSON.stringify(demo);
  if (body.length > MAX_SERVER_BYTES) return { local, server: false, serverNote: "the model pictures are too large to send online" };
  try {
    const res = await fetch("/api/kiosk-config", { method: "PUT", headers: { "content-type": "application/json" }, body });
    if (res.ok) return { local, server: true };
    const json = await res.json().catch(() => ({}));
    return { local, server: false, serverNote: json.error ?? `server error ${res.status}` };
  } catch {
    return { local, server: false, serverNote: "couldn't reach the server" };
  }
}

/** The newest published demo: from the server if it has one, else from this browser. */
export async function loadPublishedDemo(): Promise<PublishedDemo | null> {
  let local: PublishedDemo | null = null;
  try {
    const d = await idb<unknown>("readonly", (s) => s.get(KEY));
    if (isDemo(d)) local = d;
  } catch {
    /* no local copy */
  }
  let remote: PublishedDemo | null = null;
  try {
    const res = await fetch("/api/kiosk-config", { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      if (isDemo(d)) remote = d;
    }
  } catch {
    /* offline: expo Wi-Fi */
  }
  if (local && remote) return Date.parse(remote.publishedAt) >= Date.parse(local.publishedAt) ? remote : local;
  return remote ?? local;
}

export async function unpublishLocal() {
  try {
    await idb("readwrite", (s) => s.delete(KEY));
  } catch {
    /* nothing stored */
  }
}

/** Re-encode a rendered picture smaller for publishing (WebP keeps the transparent background). */
export async function shrinkImage(dataUrl: string, size = 480): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
  const webp = canvas.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}
