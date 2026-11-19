// POST /api/leads: a kiosk saves a lead to its booth's business. It is deleted after the business's retention period
// (the kiosk tells the visitor how long). Kiosks don't sign in: the booth id decides whose lead it is.

import { adminClient, boothBusiness } from "@/lib/supabaseServer";

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "not JSON" }, { status: 400 });
  }
  const owner = await boothBusiness(str(body.booth, 40));
  if (!owner) return Response.json({ error: "unknown booth" }, { status: 404 });
  const kind = ["brochure", "team", "contact"].includes(body.kind as string) ? (body.kind as string) : "contact";
  const method = ["badge", "phone", "email"].includes(body.method as string) ? (body.method as string) : "email";
  const db = adminClient();
  const { data: biz } = await db.from("businesses").select("lead_retention_days").eq("id", owner.business).single();
  const days = biz?.lead_retention_days ?? 30;
  const { error } = await db.from("leads").insert({
    business_id: owner.business,
    booth_id: owner.booth,
    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    kind,
    method,
    name: str(body.name, 200),
    email: str(body.email, 320),
    phone: str(body.phone, 40),
    company: str(body.company, 200),
    questions: str(body.questions, 4000),
    explored: Array.isArray(body.explored) ? body.explored.filter((x) => typeof x === "string").slice(0, 20) : [],
  });
  if (error) return Response.json({ error: error.message }, { status: 502 });
  return Response.json({ ok: true, deletedAfterDays: days });
}
