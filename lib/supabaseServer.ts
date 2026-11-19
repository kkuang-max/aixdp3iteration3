// Supabase on the server, with the project's secret key. Only the app's API routes use it: to read a booth's
// published demo for a kiosk, and to save the leads and visits kiosks send. Never sent to the browser.

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const serverSupabaseEnabled = () => !!(URL && SECRET);

let admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  if (!admin) admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** The signed-in business making the request, from its Bearer token: the token's signature is checked against the
 *  project's public signing keys, so a business can only ever act as itself. Null when signed out or invalid. */
export async function requestUser(request: Request): Promise<Pick<User, "id" | "email"> | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !serverSupabaseEnabled()) return null;
  const { data, error } = await adminClient().auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub || data.claims.role !== "authenticated") return null;
  return { id: sub, email: typeof data.claims.email === "string" ? data.claims.email : undefined };
}

/** A kiosk's booth → the business it belongs to. Booth ids are short random strings from the portal. */
export async function boothBusiness(booth: string | null): Promise<{ booth: string; business: string } | null> {
  if (!booth || !/^[a-z0-9]{6,32}$/i.test(booth) || !serverSupabaseEnabled()) return null;
  const { data } = await adminClient().from("booths").select("id, business_id").eq("id", booth).maybeSingle();
  return data ? { booth: data.id, business: data.business_id } : null;
}

export const notSetUp = () =>
  Response.json({ error: "accounts aren't set up on this deployment (connect Supabase in Vercel)" }, { status: 503 });
