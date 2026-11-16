// Lets the business portal upload the 3D model file straight from the browser to Vercel Blob, so files bigger
// than Vercel's 4.5 MB request limit still get to the kiosk. This route only hands out a short-lived upload token.

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const MAX_MODEL_BYTES = 200 * 1024 * 1024;

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "online storage isn't set up" }, { status: 503 });
  }
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("playform/models/") || !/\.(glb|gltf|obj|fbx|stl)$/i.test(pathname)) {
          throw new Error("Only 3D model files can be uploaded here.");
        }
        return { maximumSizeInBytes: MAX_MODEL_BYTES, addRandomSuffix: true };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "upload refused" }, { status: 400 });
  }
}
