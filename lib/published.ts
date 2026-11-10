// The demo the business portal publishes and the visitor kiosk shows.
// Stored twice: in this browser's IndexedDB (instant, same device) and, when the deployment has Vercel Blob set up,
// on the server via /api/kiosk-config so a kiosk on another device picks it up.

import { loadFile, saveFile } from "./fileStore";

export type PublishedSection = { id: string; title: string; rows: { a: string; b: string }[] };
export type PublishedMapping = { gesture: string; sectionId: string; part: string; mode: string };
export type PublishedDemo = {
  version: 1;
  publishedAt: string;
  productName: string;
  sections: PublishedSection[];
  mappings: PublishedMapping[];
  /** An uploaded 3D model, as pictures: the whole model and each mapped part lit up in it. */
  model?: {
    fileName: string;
    whole: string;
    parts: Record<string, string>;
    /** Every part name in the model (pictures may cover only some). */
    partNames?: string[];
    /** The model file for the kiosk's live 3D view. `path` is set when it was uploaded online. */
    file?: { name: string; path?: string };
  };
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

/** Publish the model file itself: always into this browser, and online when Vercel Blob is set up. */
export async function publishModelFile(file: { name: string; type: string; data: ArrayBuffer }): Promise<{ path?: string }> {
  try {
    await saveFile("publishedModel", file);
  } catch {
    /* storage blocked */
  }
  const { upload } = await import("@vercel/blob/client");
  const blob = new Blob([file.data], { type: file.type || "application/octet-stream" });
  const safe = file.name.replace(/[^\w.-]+/g, "_");
  for (const access of ["private", "public"] as const) {
    try {
      const result = await upload(`playform/models/${safe}`, blob, {
        access,
        handleUploadUrl: "/api/model-upload",
        multipart: file.data.byteLength > 8 * 1024 * 1024,
      });
      return { path: result.pathname };
    } catch {
      /* not set up, or the store is the other access type */
    }
  }
  return {};
}

/** The published model file for the kiosk: from online storage, else this browser's copy. */
export async function loadPublishedModelFile(demo: PublishedDemo): Promise<{ name: string; data: ArrayBuffer } | null> {
  const file = demo.model?.file;
  if (!file) return null;
  if (file.path) {
    try {
      const res = await fetch(`/api/kiosk-model?path=${encodeURIComponent(file.path)}`);
      if (res.ok) return { name: file.name, data: await res.arrayBuffer() };
    } catch {
      /* offline: try the local copy */
    }
  }
  const local = await loadFile("publishedModel");
  return local && local.name === file.name ? { name: local.name, data: local.data } : null;
}

/** Which model part a row is about: matches the row's name against the model's part names. */
export function matchPart(rowName: string, partNames: string[]): string | null {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const row = norm(rowName);
  if (!row) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const name of partNames) {
    const n = norm(name);
    if (!n) continue;
    let score = 0;
    if (n === row) score = 100;
    else if (row.includes(n) || n.includes(row)) score = 50 + Math.min(n.length, row.length);
    else {
      const words = new Set(row.split(" ").filter((w) => w.length >= 3));
      for (const w of n.split(" ")) if (words.has(w) || (w.length >= 4 && [...words].some((x) => x.startsWith(w) || w.startsWith(x)))) score += 10;
      // Joined names like "ToyCar" or "MicArray": a row word inside the part name still counts.
      if (!score) for (const w of words) if (w.length >= 3 && n.replace(/ /g, "").includes(w)) score += 5;
    }
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}
