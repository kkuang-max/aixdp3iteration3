// POST /api/build-demo — Claude reads the exhibitor's product doc (PDF or text) and the part names found in their
// 3D model, and drafts the five kiosk sections plus a gesture → part sequence. Runs on the server so the API key
// (ANTHROPIC_API_KEY, set in Vercel's environment variables) never reaches the browser.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { aiErrorResponse, aiNotSetUp, docBlockFrom, MAX_ROWS, partsFrom, SECTION_IDS } from "@/lib/aiServer";

export const maxDuration = 300; // reading a long PRD can take a minute or two

const GESTURES = ["1 swipe right", "2 swipes right", "3 swipes right", "4 swipes right", "Swipe up", "Swipe down", "Swipe left", "Point / hover"] as const;
const MODES = ["Slow turn", "Explode apart", "Highlight", "Zoom in", "Put back together"] as const;

const SYSTEM = `You set up a touch-free product kiosk for an expo booth. Visitors use it like a digital pamphlet: it answers
the general questions so the booth staff can spend their time on in-depth ones.

From the exhibitor's product document, write the kiosk's five sections:
- what: what the product is and does
- how: how it works and its main components (one row per main physical part)
- different: what sets it apart from competing products
- uses: where and by whom it is used
- specs: key specifications and compatibility (label + value rows)

Kiosk copy is read standing up, from a few steps away, so keep it short and plain:
- title: one headline sentence, at most about 60 characters
- rows: 3 to ${MAX_ROWS} per section, never more than ${MAX_ROWS} (for "how", one per main part, the ${MAX_ROWS} most
  important if there are more); "a" at most about 40 characters, "b" one short
  supporting line at most about 70 characters (it may be empty for "what")
- Use only facts the document states. Where the document doesn't give a fact the section needs, write a bracketed
  placeholder such as [X] h or [competitor] and set needsReview to true, with a short reviewNote saying what is missing.
- source: where in the document the section comes from, e.g. "p. 3" or "section 2.1".
- quote: the shortest supporting excerpt from the document, at most about 160 characters, quoted exactly.

Then map the hand gestures. The kiosk shows a 3D model of the product; each gesture shows a section's text and
highlights one part of the model. Build a swipe-right sequence that walks a visitor through the product:
"1 swipe right" shows "what" on the Whole product with a Slow turn; "2 swipes right" to "4 swipes right" step through
the most important parts named in "how" and "different", using the given part names exactly; "Swipe up" shows "specs";
"Swipe left" goes back to "what" with Put back together. Use only part names from the list you are given.

Finally, write what the kiosk shows when a visitor uses their hand on the 3D model (partText), one entry for
"Whole product" and one for each part name you are given, using those names exactly:
- hover: shown while the visitor holds their hand over it. For "Whole product", a one-line headline (at most about 60
  characters). For a part, a short label of what it does (at most about 30 characters), e.g. "Seals the sound in".
- pinch: shown when they pinch to zoom in on a part: one or two plain sentences (at most about 140 characters). Empty
  for "Whole product".
- specs: the part's key numbers, if the document gives any (at most about 60 characters), else empty.
Same rules as the sections: only facts from the document, bracketed placeholders for anything missing.`;

export async function POST(request: Request) {
  const notSetUp = aiNotSetUp();
  if (notSetUp) return notSetUp;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Send the product doc as form data." }, { status: 400 });
  }
  const doc = form.get("document");
  if (!(doc instanceof File)) return Response.json({ error: "Attach the product doc (PDF or text)." }, { status: 400 });
  const docBlock = await docBlockFrom(doc);
  if (docBlock instanceof Response) return docBlock;

  const parts = partsFrom(form);
  const productName = String(form.get("productName") ?? "").slice(0, 80);

  const Result = z.object({
    productName: z.string(),
    sections: z.array(
      z.object({
        id: z.enum(SECTION_IDS),
        title: z.string(),
        rows: z.array(z.object({ a: z.string(), b: z.string() })),
        source: z.string(),
        quote: z.string(),
        needsReview: z.boolean(),
        reviewNote: z.string(),
      }),
    ),
    partText: z.array(z.object({ part: z.string(), hover: z.string(), pinch: z.string(), specs: z.string() })),
    mappings: z.array(
      z.object({
        gesture: z.enum(GESTURES),
        sectionId: z.enum(SECTION_IDS),
        part: z.enum(["Whole product", ...parts, "None"] as [string, ...string[]]),
        mode: z.enum(MODES),
      }),
    ),
  });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if a safety classifier declines, the API retries on a suitable model in the same call
      output_config: { effort: "medium", format: betaZodOutputFormat(Result) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            docBlock,
            {
              type: "text",
              text: `Product name (as the exhibitor typed it): ${productName || "not given; take it from the document"}\n` +
                (parts.length
                  ? `Parts in the 3D model: ${parts.join(", ")}\n\n`
                  : "No 3D model has been uploaded yet: map every gesture to the Whole product.\n\n") +
                "Write the five kiosk sections and the gesture sequence from this document.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The AI declined to process this document." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return Response.json({ error: "The AI's answer came back incomplete. Try again." }, { status: 502 });
    }
    const out = response.parsed_output;
    // One entry per section, in kiosk order.
    const sections = SECTION_IDS.map((id) => out.sections.find((s) => s.id === id))
      .filter((s) => s !== undefined)
      .map((s) => ({ ...s, rows: s.rows.slice(0, MAX_ROWS) }));
    // Only the whole product and the model's own parts.
    const known = new Set(["Whole product", ...parts]);
    const partText = out.partText.filter((t) => known.has(t.part));
    return Response.json({ productName: out.productName, sections, mappings: out.mappings, partText, model: response.model });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
