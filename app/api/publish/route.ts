// POST /api/publish: a signed-in business publishes its demo to all of its booths.

import { adminClient, notSetUp, requestUser, serverSupabaseEnabled } from "@/lib/supabaseServer";

const MAX_BYTES = 8_000_000;

export async function POST(request: Request) {
  if (!serverSupabaseEnabled()) return notSetUp();
  const user = await requestUser(request);
  if (!user) return Response.json({ error: "sign in again to publish" }, { status: 401 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "the demo is too large to publish" }, { status: 413 });
  let demo: { version?: unknown; sections?: unknown };
  try {
    demo = JSON.parse(text);
  } catch {
    return Response.json({ error: "not JSON" }, { status: 400 });
  }
  if (demo.version !== 1 || !Array.isArray(demo.sections)) return Response.json({ error: "not a demo" }, { status: 400 });
  const { error } = await adminClient()
    .from("demos")
    .upsert({ business_id: user.id, published: demo, published_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (error) return Response.json({ error: error.message }, { status: 502 });
  return Response.json({ ok: true });
}
