// GET /api/kiosk-model?path=playform/models/… — streams the published 3D model file to the kiosk.
// Works for private and public Blob stores.

import { get } from "@vercel/blob";

export async function GET(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return new Response("online storage isn't set up", { status: 503 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!path.startsWith("playform/models/")) return new Response("not found", { status: 404 });
  for (const access of ["private", "public"] as const) {
    try {
      const result = await get(path, { access });
      if (result?.statusCode === 200) {
        return new Response(result.stream, {
          headers: { "content-type": "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
        });
      }
      if (!result) return new Response("not found", { status: 404 });
    } catch {
      /* try the other access type */
    }
  }
  return new Response("couldn't read the model", { status: 502 });
}
