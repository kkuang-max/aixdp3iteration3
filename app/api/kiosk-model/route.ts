// GET /api/kiosk-model?path=playform/models/… — streams the published 3D model file to the kiosk.
// Works for private and public Blob stores.

import { get } from "@vercel/blob";
import { adminClient, boothBusiness } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const path = params.get("path") ?? "";
  // A booth's model, uploaded to the business's own Supabase folder (uploads/<business id>/model/…).
  if (path.startsWith("sb:")) {
    const owner = await boothBusiness(params.get("booth"));
    const key = path.slice(3);
    if (!owner || !key.startsWith(`${owner.business}/model/`)) return new Response("not found", { status: 404 });
    const { data, error } = await adminClient().storage.from("uploads").download(key);
    if (error || !data) return new Response("couldn't read the model", { status: 502 });
    return new Response(data, { headers: { "content-type": "application/octet-stream", "cache-control": "private, max-age=300" } });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return new Response("online storage isn't set up", { status: 503 });
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
