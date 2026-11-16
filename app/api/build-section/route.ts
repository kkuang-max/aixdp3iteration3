// POST /api/build-section — manual setup's alternative to uploading a whole PRD: the exhibitor types or pastes notes
// (and/or attaches a PDF, txt or md) for ONE kiosk section, and Claude formats them into that section's headline
// and rows. Runs on the server so the API key never reaches the browser.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { aiErrorResponse, aiNotSetUp, docBlockFrom, MAX_ROWS, partsFrom, SECTION_IDS } from "@/lib/aiServer";

export const maxDuration = 120;

const MAX_NOTES = 20_000; // characters of typed / pasted text

const SECTIONS: Record<(typeof SECTION_IDS)[number], string> = {
  what: `"What it is": what the product is and does. Rows are one-line points ("a"); "b" may be empty.`,
  how: `"How it works": how it works, one row per main physical part ("a" = the part, "b" = what it does).`,
  different: `"What's different": what sets it apart from competing products ("a" = the point, "b" = one line of proof).`,
  uses: `"Where it's used": where and by whom it is used ("a" = the scene or user, "b" = why it fits).`,
  specs: `"Specs": key specifications and compatibility ("a" = label, "b" = value).`,
};

const SYSTEM = `You write one section of a touch-free product kiosk for an expo booth. Visitors use it like a digital
pamphlet, read standing up from a few steps away, so keep the copy short and plain.

The exhibitor gives you their own material for this section: typed or pasted notes and/or an attached document. Turn
it into the section's copy:
- title: one headline sentence, at most about 60 characters
- rows: at most ${MAX_ROWS}, ideally 3 to ${MAX_ROWS}; "a" at most about 40 characters, "b" one short supporting line at
  most about 70 characters
- Use only facts the material states, in the exhibitor's own terms. Keep their numbers and names exactly. Where the
  section needs a fact the material doesn't give, write a bracketed placeholder such as [X] h or [competitor] and set
  needsReview to true, with a short reviewNote saying what is missing.
- source: where the facts came from, e.g. "your notes" or "p. 2 of spec.pdf".
- quote: the shortest supporting excerpt from the material, at most about 160 characters, quoted exactly.`;

export async function POST(request: Request) {
  const notSetUp = aiNotSetUp();
  if (notSetUp) return notSetUp;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Send the section's notes as form data." }, { status: 400 });
  }
  const sectionId = String(form.get("sectionId") ?? "") as (typeof SECTION_IDS)[number];
  if (!SECTION_IDS.includes(sectionId)) return Response.json({ error: "Unknown section." }, { status: 400 });
  const notes = String(form.get("notes") ?? "").trim().slice(0, MAX_NOTES);
  const doc = form.get("document");

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (doc instanceof File && doc.size > 0) {
    const block = await docBlockFrom(doc);
    if (block instanceof Response) return block;
    content.push(block);
  }
  if (!notes && !content.length) return Response.json({ error: "Type or paste something, or attach a file, first." }, { status: 400 });

  const parts = partsFrom(form);
  const productName = String(form.get("productName") ?? "").slice(0, 80);
  content.push({
    type: "text",
    text:
      `Section: ${SECTIONS[sectionId]}\n` +
      `Product: ${productName || "not given"}\n` +
      (sectionId === "how" && parts.length ? `Parts in the 3D model: ${parts.join(", ")}. Name rows after these parts where they match.\n` : "") +
      (notes ? `\nThe exhibitor's notes:\n"""\n${notes}\n"""\n` : "") +
      "\nWrite this section's kiosk copy.",
  });

  const Result = z.object({
    title: z.string(),
    rows: z.array(z.object({ a: z.string(), b: z.string() })),
    source: z.string(),
    quote: z.string(),
    needsReview: z.boolean(),
    reviewNote: z.string(),
  });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Result) },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") return Response.json({ error: "The AI declined to process this." }, { status: 422 });
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return Response.json({ error: "The AI's answer came back incomplete. Try again." }, { status: 502 });
    }
    const out = response.parsed_output;
    return Response.json({ ...out, rows: out.rows.slice(0, MAX_ROWS), model: response.model });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
