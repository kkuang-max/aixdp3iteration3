"use client";
// Supabase in the browser: business sign-in, and the business's own data (draft, booths, leads, visits). Row-level
// security in the database (supabase/schema.sql) means a signed-in business only ever reads and writes its own rows.
// When the deployment has no Supabase keys, the portal works as before (everything kept in this browser).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabaseEnabled = !!(URL && KEY);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

/** Bearer header for the app's own API routes, so they know which business is asking. */
export async function authHeader(): Promise<Record<string, string>> {
  if (!supabaseEnabled) return {};
  const { data } = await supabase().auth.getSession();
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}

export const UPLOADS = "uploads";
