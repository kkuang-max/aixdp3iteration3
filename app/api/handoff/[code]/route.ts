// /api/handoff/<code>: "Type on your phone". The kiosk shows a QR code for /type/<code>; the visitor fills the form on
// their phone (POST here), and the kiosk, which checks every couple of seconds (GET), picks the details up once and
// sends them like any other lead. The details are held for at most 15 minutes and deleted as soon as the kiosk reads
// them. Kept in the private Supabase storage bucket, so it works across devices; 503 when accounts aren't set up.

import { adminClient, serverSupabaseEnabled } from "@/lib/supabaseServer";

const MAX_AGE_MS = 15 * 60 * 1000;
const valid = (code: string) => /^[a-z0-9]{12,32}$/.test(code);
const path = (code: string) => `handoff/${code}.json`;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!serverSupabaseEnabled()) return Response.json({ error: "not available" }, { status: 503 });
  if (!valid(code)) return Response.json({ error: "this link has expired" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "not JSON" }, { status: 400 });
  }
  const details = {
    at: Date.now(),
    name: str(body.name, 200),
    email: str(body.email, 320),
    company: str(body.company, 200),
    questions: str(body.questions, 4000),
  };
  if (!details.email) return Response.json({ error: "add an email or phone number" }, { status: 400 });
  const { error } = await adminClient()
    .storage.from("uploads")
    .upload(path(code), new Blob([JSON.stringify(details)], { type: "application/json" }), { upsert: true });
  if (error) return Response.json({ error: "couldn't send. Try again." }, { status: 502 });
  return Response.json({ ok: true });
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!serverSupabaseEnabled()) return Response.json({ error: "not available" }, { status: 503 });
  if (!valid(code)) return Response.json({ waiting: true }, { headers: { "cache-control": "no-store" } });
  const store = adminClient().storage.from("uploads");
  const { data } = await store.download(path(code));
  if (!data) return Response.json({ waiting: true }, { headers: { "cache-control": "no-store" } });
  await store.remove([path(code)]); // read once, then gone
  try {
    const details = JSON.parse(await data.text());
    if (Date.now() - details.at > MAX_AGE_MS) return Response.json({ waiting: true }, { headers: { "cache-control": "no-store" } });
    return Response.json({ details }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ waiting: true }, { headers: { "cache-control": "no-store" } });
  }
}
