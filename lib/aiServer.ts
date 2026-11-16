// Server-only helpers shared by the AI routes (/api/build-demo and /api/build-section).

import Anthropic from "@anthropic-ai/sdk";

export const MAX_DOC_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
/** Every kiosk section shows a headline and at most this many rows. */
export const MAX_ROWS = 5;
export const SECTION_IDS = ["what", "how", "different", "uses", "specs"] as const;
export const SAMPLE_PARTS = ["Ear tip", "Driver", "Battery", "Chip board", "Microphones"];

/** Answer for a deployment without an API key, or null when the key is there. */
export function aiNotSetUp(): Response | null {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return null;
  return Response.json(
    { error: "AI isn't set up yet: add ANTHROPIC_API_KEY to this deployment's environment variables, then redeploy." },
    { status: 503 },
  );
}

/** A PDF or text file as a document block for Claude, or an error response. */
export async function docBlockFrom(doc: File): Promise<Anthropic.Beta.BetaContentBlockParam | Response> {
  if (doc.size > MAX_DOC_BYTES) return Response.json({ error: "That file is over 4 MB. Try a smaller PDF." }, { status: 413 });
  if (/\.pdf$/i.test(doc.name) || doc.type === "application/pdf") {
    const data = Buffer.from(await doc.arrayBuffer()).toString("base64");
    return { type: "document", title: doc.name, source: { type: "base64", media_type: "application/pdf", data } };
  }
  if (/\.(txt|md|markdown)$/i.test(doc.name) || doc.type.startsWith("text/")) {
    return { type: "document", title: doc.name, source: { type: "text", media_type: "text/plain", data: await doc.text() } };
  }
  return Response.json({ error: "Use a PDF or a .txt / .md file. Word files: save as PDF first." }, { status: 415 });
}

/** Part names sent by the page (the uploaded model's), falling back to the sample earbud's. */
export function partsFrom(form: FormData): { parts: string[]; sample: boolean } {
  try {
    const raw = JSON.parse(String(form.get("parts") ?? "[]"));
    if (Array.isArray(raw)) {
      const parts = raw.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.slice(0, 80)).slice(0, 40);
      if (parts.length) return { parts, sample: false };
    }
  } catch {
    /* no parts: use the sample earbud's */
  }
  return { parts: SAMPLE_PARTS, sample: true };
}

/** Turns an API failure into a message the exhibitor can act on. */
export function aiErrorResponse(error: unknown): Response {
  if (error instanceof Anthropic.AuthenticationError) {
    return Response.json({ error: "The Anthropic API key is missing or invalid." }, { status: 401 });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return Response.json({ error: "The AI is busy right now. Wait a moment and try again." }, { status: 429 });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return Response.json({ error: `The AI couldn't read this: ${error.message}` }, { status: 400 });
  }
  if (error instanceof Anthropic.APIError) {
    return Response.json({ error: `AI request failed (${error.status ?? "network"}). Try again.` }, { status: 502 });
  }
  throw error;
}
