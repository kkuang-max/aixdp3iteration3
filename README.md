# Playform, touch-free booth kiosk. P3.4: Prototype v2 & Ethical Audit

Playform is a booth kiosk prototype that supports the people staffing an expo booth. It works like a digital
pamphlet: it answers the general questions about a product so salespeople can spend their time on the in-depth ones,
lets visitors ask for a team member, and collects leads. It has two sides:

- **Business side (the portal):** the exhibiting business inputs their own PRD (or writes / pastes each section) and
  their own 3D model. AI turns the PRD into the kiosk's sections, the model is split into its own parts, the business
  maps gestures to those parts, and then publishes the demo to the kiosk.
- **Customer side (the kiosk):** what expo visitors use, with a hand in front of the camera, touch or a mouse. It shows
  exactly what the business published.

Before anything has been published, the kiosk shows our built-in example, **Orbit Earbuds**. Details we don't have,
like the brand, booth number and staff names, are bracketed placeholders, e.g. `[BRAND]`, `[X] h`, `[Staff name]`.

Prototype v2 builds on Prototype v1 (iteration 3), which started from iteration 2
([kkuang-max/p3iteration2](https://github.com/kkuang-max/p3iteration2)), with its full history, and was redesigned
after user testing (R2 designs). v2 adds the changes from our team-to-team critique and ethical audit (see the change
log). A webcam tracks the visitor's hand with
[Google MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker); touch and a
mouse work too.

## Open the prototype

| Side | Link | Device |
| --- | --- | --- |
| Customer (kiosk) | https://aixdp3iteration3-qgbq.vercel.app/ | A laptop or a screen at the booth with a webcam, in Chrome. Allow camera access. |
| Business (portal) | https://aixdp3iteration3-qgbq.vercel.app/business | A laptop or desktop browser. |

- The kiosk is meant for a large landscape screen with a webcam above or below it, with the visitor standing about an
  arm's length or two away. Every screen is drawn on a 1280×720 artboard and scaled to fit, so it also works on a
  laptop.
- Hand tracking runs in the browser ([Google MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)),
  so it needs camera access (HTTPS or `localhost`). Touch and a mouse work too, and the camera can be switched off.
- Staff shortcuts (camera on/off, swipe mode, start fresh) are listed under **Hand interaction** below. Hover the
  keyboard icon at the top right of the kiosk for a reminder.

**To try the core use case end to end:**

1. Open the business portal. In **Auto** (the default), upload a product doc (PDF up to 4 MB, `.txt` or `.md`) and a 3D
   model (`.glb`, `.gltf`, `.obj`, `.fbx` or `.stl`), then press **Build my demo**. Or switch to **Manual** and write
   or paste each section, pressing **Submit** to have the AI format it.
2. Review each section. Anything marked **Needs attention** or **Insufficient** still needs filling in.
3. On **Interactions**, scroll through the model's parts and map the gestures. **Try it** opens the kiosk on the draft
   (nothing is published yet). **Publish to kiosk** sends it to the kiosk.
4. Open the kiosk in the same browser. Pick topics by holding a hand over them (or tapping / clicking), point at the
   model's parts, and try **Talk to our team**, **Get digital brochure** and **Give us your contact**.

## What's real and what's still faked

**Real:**

- Hand tracking from the webcam, pointing and hold-to-press, and swipes (How it works and Specs).
- Reading the uploaded 3D model in the browser and splitting it into its own parts.
- The AI: Claude reads the product doc (auto) or the exhibitor's notes / file (manual) and writes the sections, with
  the passage it used and "Needs attention" wherever the doc is missing facts. The deployment has its API key set up.
- Publishing: the kiosk shows exactly what was published. Nothing is filled in with sample content. Before anything
  has been published, the kiosk shows the built-in Orbit Earbuds demo.

**Still faked:**

- **Badge scanning** is simulated: after a few seconds it acts as if a badge was read.
- **Nothing is sent to anyone.** Leads (name, email or phone, company, questions) are only saved in that browser's
  storage (`playform.leads`). A real booth would send them to its CRM. No ticket number, wait time or brochure is
  actually emailed.
- **"Deleted after [X days]"** is the wording only. Leads aren't deleted automatically yet.
- **The brochure QR code** is a placeholder (`[QR]`), and staff names, booth number and wait time are bracketed
  placeholders.
- **Publishing to other devices** needs a Vercel Blob store connected to the deployment. Without one, the kiosk only
  picks up a demo published from the same browser.

## Change log: v1 → v2

Everything below changed after November 11 (v1), in the code and in the ASK Figma file.

**What we found in the class team-to-team critique, and how it shaped v2.** The comments we got pointed at four
things: the flow of the business side, not being able to tell which sections were done, long text getting cut off in
the input boxes, and how the "talk to someone" intake asks for information. Each one became a change (marked
*from the critique* below).

**Business side**

- **Changed the flow of the business side** *(from the critique)*. Auto setup now goes from Build my demo straight to
  reviewing and editing one section at a time (the grid of section cards and its "… More" pop-up are gone). Save
  section moves on to the next section, and Check gestures is right next to it.
- **Added statuses to the editing screens** *(from the critique)*. Each section shows **Good**, **Needs attention** or
  **Insufficient**, on the section itself and in the section list, so the business can see what's left to do. ("Needs a
  look" became "Needs attention" everywhere.)
- **Gave the input boxes the ability to expand** when typing in or reading them *(from the critique)*. A box shows one
  line ending in "…" with an expand icon, and opens over the boxes around it, tall enough for the whole text, like a
  spreadsheet cell. Enter or clicking away keeps it, Escape undoes it, Tab moves to the next one.
- **Edited the visual balance of the input/upload box vs the AI preview** in manual input. One "Type, paste, or upload
  here" box (with the attached file shown as a tag, and Attach PDF) sits next to a wider AI preview, instead of a
  separate upload strip, an "OR" and a paste box. The uploaded-file list is gone and the progress bar spans the
  preview.
- **Manual input uses AI too.** A **Submit** button sends what was typed, pasted or attached to the AI, which formats
  it into that section's preview, as an alternative to auto mode where only a PRD is uploaded. Regenerate asks the AI
  again (from the PRD in auto, from the notes in manual). Attached files stay after a refresh.
- **Cleaned up the business UI.** The AI preview scrolls when there's too much to show, "Show all" opens the full text
  (without repeating the PRD quote), highlighted rows on Interactions are no longer cut off, and every section is a
  headline plus at most 5 rows.
- **Empty states.** Nothing is filled in until the business uploads, types or asks the AI: no sample content to
  mistake for theirs.
  - In the auto and manual edits, empty boxes say what goes in them ("Write a headline", "No rows yet. Add up to 5.",
    "Nothing to preview yet…"), and the parts views say "No model yet" until a 3D model is uploaded.
  - **Preview mode (Try it)** opens the kiosk on the draft, marked "Preview · not published", showing only what's
    filled in: "Not filled in yet" for a section without content and "No 3D model uploaded yet" without a model. An ×
    closes it and goes back to the portal.
- **Error states.** Build my demo stays off until there's a PRD; wrong file types, files over 4 MB and AI failures
  each say what to do next; Publish says which sections still need filling in, or that an interaction is needed.
- **Updated the design system to better match the needs of the UX/UI** (ASK Figma, DESIGN SYSTEM section): colour,
  spacing and radius variables, Playform text styles, and business components (Button, with a new Submit style,
  Badge, Step, Mode switch, Text field, Select, Chip, Nav item, Status, Status icon, the input card and the AI preview
  card), used across every Business View frame. The Business View also shows the new empty, AI-at-work, editing and
  Try it states.

**Customer side**

- **Changed the contact information to comply with the ethical audit (dysaffordance).**
  *What changed:* the separate email field became one "Mode of contact" field that takes an email or a phone number,
  the corporate "you@company.com" placeholders were replaced with neutral ones ("first name, last name",
  "name@example.com or (XXX-XXX-XXXX)"), Company is optional, badge scanning is its own button, and the heading changed
  from "Let us contact you" to "Connect with our team".
  *How it fixed it:* the original screen assumed every visitor was a corporate attendee with a badge and a work email,
  so anyone without one had to give a fake or unwanted one to continue. Now people outside that norm can take part
  without misrepresenting themselves.
- **Added a confirmation screen with information on data use, collection and retention (ethical audit: data, consent
  and surveillance).**
  *What changed:* after submitting, visitors see who their details were sent to ("Your details have been sent to the
  Orbit Earbuds team. They'll be in touch about your inquiry.") and when they're deleted ("Your contact information
  will be deleted after [X days]."). The screen stays simple so it doesn't slow the kiosk down.
  *How it fixed it:* visitors now know who receives their information, how it will be used and how long it's kept.
- **Edited the talk to someone information intake** *(from the critique)*: the same neutral contact fields and badge
  scan as above.
- **Wording for ticketing and queue time:** "Your spot is saved. Feel free to keep looking around. You have been
  emailed a ticket number and wait time to return."
- **Wording change on the side view navigation bar.**

**Both sides: accessibility (ethical audit, WCAG 2.2 AA)**

*What changed:* field and control outlines are brighter (at least 3:1 against the cards), section statuses use icons
with their own shapes (✓ Good, ! Needs attention, empty ring Insufficient) instead of coloured dots alone, the current
progress step is a ring with a centre dot instead of a lighter dot, and kiosk placeholder text and input outlines have
more contrast. *How it fixed it:* it's easier to read and navigate for people with low vision or colour vision
deficiencies, and nothing relies on colour alone.

**Still open from the ethical audit (planned before final):** a disclosure before the business uploads files (what we
collect, why, who sees it, how long we keep it), other ways in for businesses without a PRD or 3D model, and a short web
address under the brochure QR code.

## Screens

**Topic hub.** Visitors choose what to learn, in any order, rather than everyone sitting through the same sequence:

| Topic | Answers | The 3D earbud |
| --- | --- | --- |
| 01 What it is | What is this product, and what does it do? | barely apart |
| 02 How it works | How does it work, and what are its main components? | fully exploded; pointing at a part's row lights that part up |
| 03 What's different | What makes it different from competing products? | the parts behind the differentiators light up |
| 04 Where it's used | What are its main applications or use cases? | barely apart |
| 05 Specs | Key specifications and compatibility | battery lit up |

**Talk to our team** (top right). The visitor scans their badge (simulated in this prototype) or types their name,
email and company to join the queue, then sees "Your spot is saved. Feel free to keep looking around. You have been
emailed a ticket number and wait time to return." with a 10 s countdown back to the topics.

**Get digital brochure** (bottom right). A QR code for the visitor's phone, a badge scan, or name + email (+ optional
company), then a confirmation with the same countdown.

**Give us your contact** (bottom right). "Connect with our team": a badge scan, or a form with name, one "mode of
contact" field (an email address or a phone number), an optional company and any questions, for a follow-up later. It
also links to the brochure. The confirmation says who the details went to and that they're deleted after [X days].

Leads are saved in this browser's storage (`playform.leads`, with why they were left: brochure, team or contact) for
the prototype; a real booth would send them to its CRM.

**Nobody around:** the hub flips through the topics every 5 s like a pamphlet on a stand to draw people in. After 45 s
with nobody around (3 min on the "team member is coming" screen), the visitor's session is cleared and the kiosk
starts over. Staff can press `r` to start fresh straight away.

**How it works and Specs are interactive both ways.** Pointing at a row (a hand, the mouse, or a tap) lights it and its
part on the model; pointing at a part of the model lights that part and every row about it (e.g. the chip board lights
Bluetooth and Works with). In swipe mode, swiping up or down steps through the rows one at a time (stopping at the first
and last). With an uploaded model, each row is matched to the model part with the closest name.

## Hand interaction

Two hand modes, switched with **C + S** (see the shortcuts below):

- **Point and hold (default, switch off):** a pointer follows the visitor's index fingertip. Holding it over a topic
  opens it after 0.9 s (the ring around the topic number fills); holding over a button presses it after 1.2 s (a bar
  fills under it, and the pointer's ring fills too). The mouse opens topics by resting on them as well, and clicks
  everything else. Touch taps.
- **Swipe (switch on):** swipes only work on How it works and Specs, where up and down step through the rows. They
  never change topics or screens: the pointer stays on, and visitors pick topics and buttons by holding over them as in
  point-and-hold mode (it just doesn't hover rows there, since swipes pick them).

If the hand stays near an edge of the camera view, the kiosk says so ("Raise your hand a little…"), because the camera
loses hands near the edges.

**Hold and pinch on the model.** Holding a hand (or the mouse, or a finger) over the 3D model stops it turning. On
What it is, What's different and Where it's used, that's all it does (no description). On How it works and Specs, the
part under the pointer also pulls out, and pinching zooms in, the way people zoom on a phone: spread the thumb and
index finger apart in front of the camera, spread two fingers on a touchscreen, or pinch out / scroll up on a
trackpad. The zoom picks the part closest to where the visitor is pointing, brings it to the middle, and the panel on
the right shows just that part's details (its label, a sentence or two, and specs). It stays zoomed in, even if the
hand drops, until the visitor does the reverse: pinches the thumb and finger back together (or two fingers on a
touchscreen, or pinches in / scrolls down). What each part says is written on the business side's Interactions screen
(Gesture → Does → What it says).

## How swipes are read

- Each movement is judged as one whole stroke, from when the hand speeds up to when it slows down, so fast flicks,
  slower deliberate swipes and curved swipes all work. A movement is split wherever the hand reverses direction, and
  measured to its furthest point, so a quick flick that springs back still counts in full.
- Many ways of swiping work: quick flicks, normal swipes, slow sweeps, angled and arcing swipes, small swipes. Up /
  down swipes need less travel than left / right ones (people swipe shorter vertically): 0.10 vs 0.13 of the camera
  frame's height.
- A slow sweep counts once the hand comes back to where it started (that's what makes it deliberate rather than the
  hand drifting); the hand coming back never fires on its own.
- A fast swipe that starts from a resting hand fires the moment it's clearly done (as the hand slows down), with no
  waiting. Other movements that follow each other closely (a wind-up the other way, the swipe, a quick return) are
  judged together as one burst, ~0.3 s after the hand calms down and never more than ~0.4 s after the first move. The
  first move wins unless a later one is clearly bigger, so a wind-up never fires instead of the swipe after it.
- Three back-and-forths, or four moves of any kind, within 1.5 s is waving or fidgeting, not a swipe.
- Bringing the hand back after a swipe is ignored (even a couple of seconds later) unless it's much faster *and*
  longer than the movement before it (then it's a real swipe, e.g. after a small wind-up), as are raising a hand into view,
  lowering an arm out of view, slow movement, small jiggles and clearly diagonal moves.
- Start swipes with your hand already in view (around chest height): a swipe that starts below the view doesn't count.

**Keep the hand in the middle of the camera view.** MediaPipe loses a hand that sits near the edge of the view, and
swipes arc downward, so a hand held low drops out of the bottom mid-swipe and the swipe is never seen. If the hand
stays near an edge, the kiosk says so ("Raise your hand a little…"), and teach mode warns when the camera saw the hand
less than 80% of the time. Tracking confidence is set below MediaPipe's defaults so a blurry, fast-moving hand is held
on to rather than dropped.

**Teach swipes (`t`):** walks you through swiping up, down, left and right 5 times each and records exactly how your
hand moves, including how you bring it back. A large live camera view sits beside the prompts with your tracked hand drawn on it and a
dashed box showing where the camera tracks a hand reliably, so you can keep your hand inside it. The review screen replays the recording with the default settings and with
settings derived from your swipes, so you can see which recognises you better:

- `USE MY SWIPES` keeps the derived settings on this machine (browser storage); `BACK TO DEFAULT` undoes it.
- `DOWNLOAD RECORDING` saves the raw recording as a small JSON file, which can be turned into permanent defaults and
  regression tests.
- Very small swipes need loose settings, and loose settings can also be set off by waving; a long wave still turns at
  most one page.

Logic lives in `lib/swipeTeach.ts`; the screen in
`app/kiosk/TeachSwipes.tsx`.

Staff shortcuts (there are no on-screen camera buttons; hover the keyboard icon at the top right for a reminder and the
tracking status). Camera chords hold `C` so visitors can't trigger them by accident:

| Keys | Does |
| --- | --- |
| `C` + `Space` | Camera on / off (off releases the webcam; touch and mouse keep working) |
| `C` + `Option`/`Alt` + `Space` | Show / hide the camera view (a small preview with the tracked hand drawn on it) |
| `C` + `S` | Swipe mode on / off |
| arrow keys | Act as swipes |
| `t` | Teach the kiosk your swipes (swipe mode) |
| `d` | Tracking FPS, how often the hand is found and the last swipe |
| `r` | Start fresh for the next visitor |
| `f` | Fullscreen |

Every screen is drawn on a 1280×720 artboard and scaled to fit the window, so the kiosk and the business portal fit any
screen size or resolution (other shapes get dark bars at the sides or top and bottom).

## Business portal: 3D model upload and AI setup

- **3D model:** upload a `.glb`, `.gltf` (self-contained), `.obj`, `.fbx` or `.stl` on the business page. It is read in
  the browser with three.js: the model's own pieces (its named meshes or groups, up to the 24 largest) become the parts
  the interactions page scrolls through, each rendered on its own and lit up in context. STEP files need exporting to
  GLB or OBJ first. The file is kept in this browser (IndexedDB), so a refresh doesn't lose it.
- **AI setup:** "Build my demo" sends the product doc (PDF up to 4 MB, `.txt` or `.md`) and the model's part names to
  `POST /api/build-demo`, where Claude (`claude-opus-5-5`, structured output) writes the five sections (with the page
  and a quote it used, and "Needs attention" where the doc is missing facts) and a gesture → part sequence.
  It needs an Anthropic API key on the server: add `ANTHROPIC_API_KEY` in Vercel → Project → Settings → Environment
  Variables (or `.env.local` for `npm run dev`) and redeploy. Without it the page says so, and the sections can still be written by hand.
- **Manual setup with AI:** instead of one PRD, each manual section has a "Type, paste, or upload here" box. Type or
  paste notes and/or attach a PDF, `.txt` or `.md`, then press **Submit**: `POST /api/build-section` has Claude format
  just that section into a headline and rows, shown in the AI preview where it can be edited. Same API key.
- **Rows:** every section has a headline and at most 5 rows, in the portal, from the AI and on the kiosk.
- **Try it:** opens the kiosk (`/?preview=1`) on the portal's current draft, unpublished, marked "Preview · not
  published". It shows exactly what is filled in: empty sections read "Not filled in yet" and with no model the
  middle says "No 3D model uploaded yet". Pressing Try it again updates an open preview tab; the × on the tag
  closes the preview and goes back to the portal.
- **No stand-in content:** the portal starts empty. Sections are only filled by what the exhibitor uploads, types or
  asks the AI for; the parts views stay empty until a 3D model is uploaded, and publishing waits until every section
  has a headline and a row and at least one interaction exists.

## Publishing to the kiosk

**Publish to kiosk** (last step of the business portal) saves the sections, gesture mappings, product name and pictures
of the uploaded model (the whole model, and each mapped part lit up). The kiosk loads it on start and checks again every
minute: topic text and the product name come from it. An uploaded model is drawn live in 3D (three.js) in the
middle of the hub: it sways or turns, the part mapped to the topic lights up and the rest dims, and the gesture's
model action plays (Explode apart, Put back together, Zoom in, Slow turn). Pictures of the model show while the file
loads, or if the device can't draw it.

- **Same browser:** always saved in this browser (IndexedDB), so a kiosk opened in the same browser shows it at once.
- **Other devices:** connect a Vercel Blob store (Vercel → Project → Storage → Create → Blob → connect to the project;
  this adds `BLOB_READ_WRITE_TOKEN`) and redeploy. The demo is then saved through `/api/kiosk-config`, the model file
  is uploaded straight from the browser through `/api/model-upload` (up to 200 MB), and every kiosk picks it up.

**Restart** (top right of the business portal) clears every section, gesture and uploaded file in that browser. The
kiosk keeps the last published demo until you publish again.

## Code map

- `lib/product.ts` — product name, the five topics and their copy, the earbud's parts, staff placeholders. Swap this to
  demo another product.
- `lib/model3d.ts` — turns 2D part outlines into a sliced 3D model that can come apart and highlight parts.
- `lib/session.ts` — what the current visitor explored and for how long, pricing interest, contact details; lead storage.
- `lib/useHandTracking.ts` — webcam + MediaPipe loop; reports the fingertip and palm each frame; can be switched off.
- `lib/swipe.ts` / `lib/swipeTeach.ts` — swipe detection and teach mode.
- `app/kiosk/Kiosk.tsx` — screens, pointing and hold-to-press, swipes, attract loop, session reset, staff shortcuts.
- `lib/modelParts.ts` — reads an uploaded 3D model, splits it into parts and renders each one. `lib/fileStore.ts` keeps
  uploads in the browser.
- `app/kiosk/LiveModel.tsx` — the uploaded model drawn live on the kiosk.
- `lib/published.ts` + `app/api/kiosk-config/route.ts` — the published demo (browser copy + Vercel Blob).
- `app/api/build-demo/route.ts` — the AI route (Claude reads the product doc and drafts the demo).
- `app/api/build-section/route.ts` — manual setup's AI route (Claude formats one section from typed notes or a file).
- `lib/aiServer.ts` — shared by both AI routes: the 5-row cap, reading the attached file, error messages.
- `app/business/page.tsx` — business portal (`/business`): auto setup (default) or manual setup, then gesture mapping.
  Timing constants are at the top.
- `app/kiosk/Screens.tsx` — the hub, team, brochure and contact screens. `Model3D.tsx` renders the earbud.

The hand model ships in `public/models/`, and `npm run dev` / `npm run build` copy the MediaPipe WASM runtime into
`public/mediapipe/`, so the kiosk works without internet once built (expo Wi-Fi is unreliable).
Camera access needs `localhost` or HTTPS.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000 and allow camera access.
