// GET /api/accounts-status: which Supabase settings this deployment has (yes / no only, never the values), to see why
// the business portal does or doesn't ask businesses to sign in.

const has = (name: string) => !!process.env[name];

export function GET() {
  // The portal's sign-in needs both public values at build time; the server routes need the URL and a secret key.
  const signIn = has("NEXT_PUBLIC_SUPABASE_URL") && (has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || has("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  const server = (has("NEXT_PUBLIC_SUPABASE_URL") || has("SUPABASE_URL")) && (has("SUPABASE_SECRET_KEY") || has("SUPABASE_SERVICE_ROLE_KEY"));
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY",
  ];
  return Response.json(
    {
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      environment: process.env.VERCEL_ENV ?? "local",
      signInOn: signIn,
      serverOn: server,
      variables: Object.fromEntries(names.map((n) => [n, has(n)])),
      note: signIn
        ? "Accounts are on."
        : "Accounts are off on this deployment: add the Supabase variables for this environment in Vercel, then redeploy.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
