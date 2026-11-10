// The published demo, shared between the business portal (PUT) and every kiosk (GET).
// Stored in Vercel Blob: connect a Blob store to the project in Vercel (Storage → Blob), which adds
// BLOB_READ_WRITE_TOKEN. Without it the portal and kiosk fall back to this browser's own copy.

import { BlobError, get, put } from "@vercel/blob";

const PATH = "playform/published-demo.json";
const MAX_BYTES = 4_000_000;

const configured = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const notConfigured = () =>
  Response.json(
    { error: "online storage isn't set up. Connect a Vercel Blob store to this project" },
    { status: 503 },
  );

// Stores are private or public; try private first.
async function read() {
  for (const access of ["private", "public"] as const) {
    try {
      return await get(PATH, { access, useCache: false });
    } catch (e) {
      if (access === "public") throw e;
    }
  }
  return null;
}

export async function GET() {
  if (!configured()) return notConfigured();
  try {
    const result = await read();
    if (!result || result.statusCode !== 200) return Response.json({ error: "nothing published yet" }, { status: 404 });
    return new Response(result.stream, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof BlobError ? e.message : "couldn't read the published demo" }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  if (!configured()) return notConfigured();
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  let demo: { version?: unknown; sections?: unknown };
  try {
    demo = JSON.parse(text);
  } catch {
    return Response.json({ error: "not JSON" }, { status: 400 });
  }
  if (demo.version !== 1 || !Array.isArray(demo.sections)) return Response.json({ error: "not a demo" }, { status: 400 });

  for (const access of ["private", "public"] as const) {
    try {
      await put(PATH, text, { access, contentType: "application/json", allowOverwrite: true, addRandomSuffix: false, cacheControlMaxAge: 60 });
      return Response.json({ ok: true });
    } catch (e) {
      if (access === "public") {
        return Response.json({ error: e instanceof BlobError ? e.message : "couldn't save online" }, { status: 502 });
      }
    }
  }
}
