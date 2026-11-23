// /api/handoff/<code>: "Type on your phone". The kiosk shows a QR code for /type/<code>; the visitor fills the form on
// their phone (POST here), and the kiosk, which checks every couple of seconds (GET), picks the details up once and
// sends them like any other lead. The details are held for at most 15 minutes and deleted as soon as the kiosk reads
// them. Kept in the private Supabase storage bucket, or in Vercel Blob on a deployment without Supabase; 503 when
// neither is set up.

import { del, get, put } from "@vercel/blob";
import { adminClient, serverSupabaseEnabled } from "@/lib/supabaseServer";

/** Where the details wait for the kiosk: Supabase storage, else Vercel Blob, else nowhere (null). */
function store() {
  if (serverSupabaseEnabled()) {
    const bucket = () => adminClient().storage.from("uploads");
    return {
      async save(key: string, text: string) {
        const { error } = await bucket().upload(key, new Blob([text], { type: "application/json" }), { upsert: true });
        return !error;
      },
      async take(key: string) {
        const { data } = await bucket().download(key);
        if (!data) return null;
        await bucket().remove([key]); // read once, then gone
        return data.text();
      },
    };
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const key = (k: string) => `playform/${k}`;
    return {
      async save(k: string, text: string) {
        for (const access of ["private", "public"] as const) {
          try {
            await put(key(k), text, { access, contentType: "application/json", allowOverwrite: true, addRandomSuffix: false, cacheControlMaxAge: 60 });
            return true;
          } catch {
            /* the store may be the other kind: try it */
          }
        }
        return false;
      },
      async take(k: string) {
        for (const access of ["private", "public"] as const) {
          try {
            const res = await get(key(k), { access, useCache: false });
            if (!res || res.statusCode !== 200) return null;
            const text = await new Response(res.stream).text();
            await del(key(k)).catch(() => {});
            return text;
          } catch {
            /* not there, or the other kind of store */
          }
        }
        return null;
      },
    };
  }
  return null;
}

const MAX_AGE_MS = 15 * 60 * 1000;
const valid = (code: string) => /^[a-z0-9]{12,32}$/.test(code);
const path = (code: string) => `handoff/${code}.json`;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = store();
  if (!db) return Response.json({ error: "not available" }, { status: 503 });
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
  if (!(await db.save(path(code), JSON.stringify(details)))) return Response.json({ error: "couldn't send. Try again." }, { status: 502 });
  return Response.json({ ok: true });
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = store();
  if (!db) return Response.json({ error: "not available" }, { status: 503 });
  if (!valid(code)) return Response.json({ waiting: true }, { headers: { "cache-control": "no-store" } });
  const text = await db.take(path(code));
  if (!text) return Response.json({ waiting: true }, { headers: { "cache-control": "no-store" } });
  try {
    const details = JSON.parse(text);
    if (Date.now() - details.at > MAX_AGE_MS) return Response.json({ waiting: true }, { headers: { "cache-control": "no-store" } });
    return Response.json({ details }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ waiting: true }, { headers: { "cache-control": "no-store" } });
  }
}
