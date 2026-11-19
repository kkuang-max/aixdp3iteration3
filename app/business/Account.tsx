"use client";

// Business accounts (Supabase): signing in, and the "Booths & leads" screen, where a business makes kiosk links for its
// booths, sets how long leads are kept, and sees the leads and visits its kiosks recorded. Row-level security in the
// database means everything here is only ever the signed-in business's own data.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { TOPICS } from "@/lib/product";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import styles from "./business.module.css";

// ---- The signed-in business ---------------------------------------------------------------------------------------
export function useAccount(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabaseEnabled);
  useEffect(() => {
    if (!supabaseEnabled) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, ready };
}

// ---- Sign in / create an account ----------------------------------------------------------------------------------
export function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim() || password.length < 6) {
      setError(password.length < 6 ? "Use a password of at least 6 characters." : "Enter your email.");
      return;
    }
    setBusy(true);
    const sb = supabase();
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(error.message === "Invalid login credentials" ? "That email and password don't match an account." : error.message);
      } else {
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { business_name: name.trim() }, emailRedirectTo: `${window.location.origin}/business` },
        });
        if (error) setError(error.message);
        else if (!data.session) setInfo(`Check ${email.trim()} for a link to confirm your account, then sign in.`);
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={styles.guide}>
        <h1>{mode === "in" ? "SIGN IN" : "CREATE AN ACCOUNT"}</h1>
        <p>Your demo, your booths and the leads your kiosks collect are saved to your account.</p>
      </div>
      <form className={`${styles.card} ${styles.authCard}`} onSubmit={submit} noValidate>
        {mode === "up" && (
          <>
            <label className={styles.fieldLabel} htmlFor="auth-name">BUSINESS NAME</label>
            <input id="auth-name" className={styles.field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your company" autoComplete="organization" />
          </>
        )}
        <label className={styles.fieldLabel} htmlFor="auth-email">EMAIL</label>
        <input id="auth-email" type="email" className={styles.field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
        <label className={styles.fieldLabel} htmlFor="auth-password">PASSWORD</label>
        <input id="auth-password" type="password" className={styles.field} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete={mode === "in" ? "current-password" : "new-password"} />
        {error && <p className={styles.authError} role="alert">{error}</p>}
        {info && <p className={styles.authInfo} role="status">{info}</p>}
        <button type="submit" className={styles.submitBtn} disabled={busy}>{busy ? "ONE MOMENT…" : mode === "in" ? "SIGN IN" : "CREATE ACCOUNT"}</button>
        <p className={styles.authSwitch}>
          {mode === "in" ? "New to Playform?" : "Already have an account?"}{" "}
          <button type="button" className={styles.textLink} onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); setInfo(""); }}>
            {mode === "in" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
    </>
  );
}

// ---- Booths & leads -----------------------------------------------------------------------------------------------
type Booth = { id: string; name: string; created_at: string };
type Lead = { id: string; created_at: string; expires_at: string; kind: string; method: string; name: string | null; email: string | null; phone: string | null; company: string | null; questions: string | null; explored: string[]; booth_id: string | null };
type Visit = { started_at: string; ended_at: string; topic_ms: Record<string, number>; left_lead: boolean };

const KIND: Record<string, string> = { brochure: "Brochure", team: "Talk to the team", contact: "Follow up later" };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const days = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

export function BoothsAndLeads({ user, onBack, onNotice }: { user: User; onBack: () => void; onNotice: (s: string) => void }) {
  const sb = supabase();
  const [booths, setBooths] = useState<Booth[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [retention, setRetention] = useState(30);
  const [business, setBusiness] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [b, l, v, biz] = await Promise.all([
      sb.from("booths").select("id, name, created_at").order("created_at"),
      sb.from("leads").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("visits").select("started_at, ended_at, topic_ms, left_lead").order("ended_at", { ascending: false }).limit(1000),
      sb.from("businesses").select("name, lead_retention_days").eq("id", user.id).maybeSingle(),
    ]);
    if (b.error || l.error || v.error) onNotice("Couldn't load your booths and leads. Is the database set up?");
    setBooths(b.data ?? []);
    setLeads(l.data ?? []);
    setVisits(v.data ?? []);
    if (biz.data) { setRetention(biz.data.lead_retention_days); setBusiness(biz.data.name); }
    setLoading(false);
  }, [sb, user.id, onNotice]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the account's data when the screen opens
    load();
  }, [load]);

  const link = (b: Booth) => `${window.location.origin}/?booth=${b.id}`;
  const addBooth = async () => {
    const { error } = await sb.from("booths").insert({ business_id: user.id, name: `Booth ${booths.length + 1}` });
    if (error) onNotice(error.message);
    else load();
  };
  const removeBooth = async (b: Booth) => {
    if (!window.confirm(`Delete ${b.name}? Its kiosk link stops working.`)) return;
    await sb.from("booths").delete().eq("id", b.id);
    load();
  };
  const copy = async (b: Booth) => {
    try { await navigator.clipboard.writeText(link(b)); onNotice("Kiosk link copied."); } catch { onNotice(link(b)); }
  };
  const saveRetention = async (n: number) => {
    const v = Math.min(Math.max(Math.round(n) || 1, 1), 365);
    setRetention(v);
    const { error } = await sb.from("businesses").update({ lead_retention_days: v }).eq("id", user.id);
    onNotice(error ? error.message : `New leads are deleted after ${v} day${v === 1 ? "" : "s"}. Kiosks say so on the next publish.`);
  };
  const removeLead = async (l: Lead) => {
    await sb.from("leads").delete().eq("id", l.id);
    setLeads((x) => x.filter((y) => y.id !== l.id));
  };

  // Visit stats: how many, how long, which topic held people longest.
  const avgMs = visits.length ? visits.reduce((s, v) => s + Math.max(0, Date.parse(v.ended_at) - Date.parse(v.started_at)), 0) / visits.length : 0;
  const topicTotals: Record<string, number> = {};
  for (const v of visits) for (const [k, ms] of Object.entries(v.topic_ms ?? {})) topicTotals[k] = (topicTotals[k] ?? 0) + ms;
  const top = Object.entries(topicTotals).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topLabel = TOPICS.find((t) => t.id === top)?.short ?? "—";

  return (
    <>
      <div className={styles.guide}>
        <h1>BOOTHS &amp; LEADS</h1>
        <p>{business ? `${business} · ` : ""}{user.email}</p>
      </div>
      <div className={`${styles.card} ${styles.boothCard}`}>
        <div className={styles.fieldLabel}>YOUR BOOTHS</div>
        <p className={styles.mutedSmall}>Open a booth&apos;s link on the kiosk at that booth. It shows what you published, and its leads and visits come here.</p>
        <div className={styles.boothList}>
          {booths.map((b) => (
            <div key={b.id} className={styles.boothRow}>
              <span className={styles.boothName}>{b.name}</span>
              <span className={styles.boothLink} title={link(b)}>/?booth={b.id}</span>
              <button type="button" className={styles.smallPill} onClick={() => copy(b)}>COPY</button>
              <a className={styles.smallPill} href={link(b)} target="_blank" rel="noopener noreferrer">OPEN</a>
              <button type="button" className={styles.remove} aria-label={`Delete ${b.name}`} onClick={() => removeBooth(b)}>×</button>
            </div>
          ))}
          {!loading && booths.length === 0 && <p className={styles.emptyNote}>No booths yet. Add one for each kiosk.</p>}
        </div>
        <button type="button" className={styles.dashedBtn} onClick={addBooth}>+ NEW BOOTH</button>
        <div className={styles.retention}>
          <label htmlFor="retention" className={styles.fieldLabel}>DELETE LEADS AFTER</label>
          <span>
            <input id="retention" type="number" min={1} max={365} className={`${styles.field} ${styles.retentionInput}`} value={retention} onChange={(e) => setRetention(Number(e.target.value))} onBlur={(e) => saveRetention(Number(e.target.value))} /> days
          </span>
          <p className={styles.mutedSmall}>Visitors are told this when they leave their details.</p>
        </div>
        <button type="button" className={styles.textLink} onClick={() => sb.auth.signOut()}>Sign out</button>
      </div>
      <div className={`${styles.card} ${styles.leadsCard}`}>
        <div className={styles.statsRow}>
          <span><b>{visits.length}</b>visits</span>
          <span><b>{leads.length}</b>leads</span>
          <span><b>{avgMs ? `${Math.max(1, Math.round(avgMs / 60000))} min` : "—"}</b>average visit</span>
          <span><b>{topLabel}</b>most time on</span>
        </div>
        <div className={styles.leadsHead}><span>WHO</span><span>CONTACT</span><span>WANTS</span><span>WHEN</span><span /></div>
        <div className={styles.leadsList}>
          {leads.map((l) => (
            <div key={l.id} className={styles.leadRow} title={l.questions ?? undefined}>
              <span className={styles.oneLine}><b>{l.name || (l.method === "badge" ? "Badge scan" : "—")}</b>{l.company ? ` · ${l.company}` : ""}</span>
              <span className={styles.oneLine}>{l.email || l.phone || "—"}</span>
              <span className={styles.oneLine}>{KIND[l.kind] ?? l.kind}{l.explored?.length ? ` · ${l.explored.join(", ")}` : ""}</span>
              <span className={styles.oneLine}>{when(l.created_at)}<small>Deleted in {days(l.expires_at)} d</small></span>
              <button type="button" className={styles.remove} aria-label="Delete this lead" onClick={() => removeLead(l)}>×</button>
            </div>
          ))}
          {!loading && leads.length === 0 && <p className={styles.emptyNote}>No leads yet. They appear here when visitors leave their details at one of your booths.</p>}
        </div>
      </div>
      <button type="button" className={styles.backLink} onClick={onBack}>← BACK TO SETUP</button>
    </>
  );
}
