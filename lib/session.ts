// What one visitor did at the kiosk. Shared with staff when they ask for a team member, and
// included with the brochure when they leave their details. Cleared when they walk away.

import { TOPICS } from "./product";

export type LeadMethod = "badge" | "phone" | "email";
/** Why the visitor left their details: the brochure, a team member now, or a follow-up later. */
export type LeadKind = "brochure" | "team" | "contact";

export type Session = {
  start: number; // ms timestamp when the visitor started interacting
  time: Record<string, number>; // ms spent on each topic
  picked: string[]; // topics opened, in order
  pricing: boolean; // wants a pricing follow-up
  name: string;
  email: string;
  company: string;
  questions: string; // anything they want the team to know (contact form)
  sent: LeadMethod | null; // brochure requested via
  contacted: boolean; // left their details for a follow-up
  staffAsked: number | null; // when they asked for a team member
  staff: number; // which team member is coming (index into STAFF)
  staffAccepted: boolean;
  zoomed: string[]; // parts the visitor zoomed in on
};

export const newSession = (): Session => ({
  start: 0,
  time: {},
  picked: [],
  pricing: true,
  name: "",
  email: "",
  company: "",
  questions: "",
  sent: null,
  contacted: false,
  staffAsked: null,
  staff: 0,
  staffAccepted: false,
  zoomed: [],
});

// A topic counts as explored once it was opened on purpose or read for a few seconds.
const READ_MS = 3000;
export const exploredTopics = (s: Session) =>
  TOPICS.filter((t) => s.picked.includes(t.id) || (s.time[t.id] ?? 0) >= READ_MS).sort(
    (a, b) => order(s, a.id) - order(s, b.id),
  );
const order = (s: Session, id: string) => {
  const i = s.picked.indexOf(id);
  return i < 0 ? 99 : i;
};

export const longestTopic = (s: Session) => {
  let best: (typeof TOPICS)[number] | null = null;
  for (const t of TOPICS) if ((s.time[t.id] ?? 0) >= READ_MS && (!best || s.time[t.id] > s.time[best.id])) best = t;
  return best;
};

export const minutesAt = (s: Session, now: number) => {
  if (!s.start) return "—";
  const m = Math.round((now - s.start) / 60000);
  return m < 1 ? "Under 1 min" : `${m} min`;
};

// Leads: a booth's kiosk sends them to the business's account (deleted after the business's retention period). A kiosk
// with no booth (the open demo) keeps them in this browser only.
const LEADS_KEY = "playform.leads";
export function saveLead(s: Session, method: LeadMethod, kind: LeadKind = "brochure", booth: string | null = null) {
  const contact = method === "email" ? s.email.trim() : "";
  const lead = {
    at: new Date().toISOString(),
    kind,
    method,
    name: method === "email" ? s.name || null : null,
    // The contact field takes an email address or (on "Leave contact info") a phone number.
    email: contact.includes("@") ? contact : null,
    phone: contact && !contact.includes("@") ? contact : null,
    questions: s.questions || null,
    company: s.company || null,
    explored: exploredTopics(s).map((t) => t.short),
  };
  if (booth) {
    fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...lead, booth }), keepalive: true }).catch(() => {});
    return;
  }
  try {
    const leads = JSON.parse(localStorage.getItem(LEADS_KEY) ?? "[]");
    leads.push({ ...lead, pricing: s.pricing });
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
  } catch {
    // Storage blocked: the confirmation still shows; nothing to recover for a prototype.
  }
}

/** A booth's kiosk records what each visitor did (no names or contact details) when they leave. */
export function saveVisit(s: Session, booth: string | null) {
  if (!booth || !s.start) return;
  const body = JSON.stringify({
    booth,
    startedAt: s.start,
    topicMs: s.time,
    topics: s.picked,
    zoomedParts: s.zoomed,
    leftLead: s.contacted || !!s.sent,
    askedForTeam: !!s.staffAsked,
  });
  if (!navigator.sendBeacon?.("/api/visits", body)) fetch("/api/visits", { method: "POST", body, keepalive: true }).catch(() => {});
}
