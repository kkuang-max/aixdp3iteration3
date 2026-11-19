// POST /api/visits: a kiosk records what one visitor did (topics, time on each, parts zoomed in on). No names or
// contact details: those only come with a lead the visitor chose to leave.

import { adminClient, boothBusiness } from "@/lib/supabaseServer";

const strings = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, n) : []);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text()); // sendBeacon posts text/plain
  } catch {
    return Response.json({ error: "not JSON" }, { status: 400 });
  }
  const owner = await boothBusiness(typeof body.booth === "string" ? body.booth : null);
  if (!owner) return Response.json({ error: "unknown booth" }, { status: 404 });
  const topicMs: Record<string, number> = {};
  if (body.topicMs && typeof body.topicMs === "object") {
    for (const [k, v] of Object.entries(body.topicMs as Record<string, unknown>).slice(0, 20)) {
      if (typeof v === "number" && v > 0) topicMs[k.slice(0, 40)] = Math.min(Math.round(v), 3_600_000);
    }
  }
  const started = typeof body.startedAt === "number" && body.startedAt > 0 ? new Date(body.startedAt) : new Date();
  const { error } = await adminClient().from("visits").insert({
    business_id: owner.business,
    booth_id: owner.booth,
    started_at: started.toISOString(),
    topic_ms: topicMs,
    topics: strings(body.topics, 20),
    zoomed_parts: strings(body.zoomedParts, 40),
    left_lead: body.leftLead === true,
    asked_for_team: body.askedForTeam === true,
  });
  if (error) return Response.json({ error: error.message }, { status: 502 });
  return Response.json({ ok: true });
}
