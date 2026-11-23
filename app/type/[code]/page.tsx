"use client";

// The visitor's phone: "Type on your phone" from the kiosk's QR code. The same details form as the kiosk, sized for a
// phone; Send hands it to the kiosk (/api/handoff/<code>), which sends it on and shows the confirmation.

import { useParams, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "./type.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isPhone = (v: string) => /^\+?[\d\s().-]{7,}$/.test(v) && v.replace(/\D/g, "").length >= 7;

const KINDS: Record<string, { title: string; lead: string }> = {
  team: { title: "Talk to our team", lead: "Join the queue: we'll email you a ticket number and the wait time." },
  brochure: { title: "Get the digital brochure", lead: "We'll email you the brochure, with the topics you explored." },
  contact: { title: "Connect with our team", lead: "Share your details and a team member will follow up with you." },
};

export default function TypeOnPhone() {
  const { code } = useParams<{ code: string }>();
  const query = useSearchParams();
  const kind = KINDS[query.get("k") ?? ""] ? (query.get("k") as string) : "contact";
  const anyContact = kind === "contact";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [questions, setQuestions] = useState("");
  const [state, setState] = useState<"form" | "sending" | "sent">("form");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!(EMAIL_RE.test(v) || (anyContact && isPhone(v)))) {
      setError(anyContact ? "Check the email address or phone number." : "Check the email address.");
      return;
    }
    setError("");
    setState("sending");
    try {
      const res = await fetch(`/api/handoff/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email: v, company, questions }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "couldn't send");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? `Couldn't send: ${err.message}.` : "Couldn't send. Try again.");
      setState("form");
    }
  };

  if (state === "sent") {
    return (
      <main className={styles.page}>
        <div className={styles.done}>
          <span className={styles.check} aria-hidden="true">✓</span>
          <h1>Sent to the kiosk</h1>
          <p>Look up at the screen: it shows your confirmation. You can close this page.</p>
        </div>
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <span className={styles.kicker}>PLAYFORM · TYPE ON YOUR PHONE</span>
        <h1>{KINDS[kind].title}</h1>
        <p className={styles.lead}>{KINDS[kind].lead}</p>
        <label htmlFor="p-name">Your name</label>
        <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First name, last name" />
        <label htmlFor="p-email">{anyContact ? "Email or phone number" : "Email"}</label>
        <input id="p-email" value={email} onChange={(e) => setEmail(e.target.value)} type={anyContact ? "text" : "email"} inputMode={anyContact ? "email" : "email"} autoComplete="email" placeholder={anyContact ? "Email or phone" : "name@example.com"} />
        <label htmlFor="p-company">Company (optional)</label>
        <input id="p-company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
        {anyContact && (
          <>
            <label htmlFor="p-q">Any specific questions? (optional)</label>
            <textarea id="p-q" value={questions} onChange={(e) => setQuestions(e.target.value)} rows={4} />
          </>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send to the kiosk"}</button>
        <p className={styles.fine}>Your details go to the exhibitor&apos;s team for this request only. Nothing is kept on this phone.</p>
      </form>
    </main>
  );
}
