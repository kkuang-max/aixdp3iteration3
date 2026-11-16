# Playform — touch-free booth kiosk (iteration 3)

Playform is a booth kiosk prototype that supports the people staffing an expo booth. It works like a digital
pamphlet: it answers the general questions about a product so salespeople can spend their time on the in-depth ones,
lets visitors ask for a team member, and collects leads. The demo product is **Orbit Earbuds** (all business details
are bracketed placeholders, e.g. `[BRAND]`, `[X] h`, `[Staff name]`, for the exhibitor to fill in).

Iteration 3 starts from iteration 2 ([kkuang-max/p3iteration2](https://github.com/kkuang-max/p3iteration2)), with its
full history, and is redesigned after user testing (R2 designs). A webcam tracks the visitor's hand with
[Google MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker); touch and a
mouse work too.

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
email and company to join the queue, then sees "Your spot is saved" with a 10 s countdown back to the topics.

**Get digital brochure** (bottom right). A QR code for the visitor's phone, a badge scan, or name + email (+ optional
company), then a confirmation with the same countdown.

**Give us your contact** (bottom right). "Let us contact you": a badge scan or a form with name, email, company and
any questions, for a follow-up later. It also links to the brochure.

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
  and a quote it used, and "Needs a look" where the doc is missing facts) and a gesture → part sequence.
  It needs an Anthropic API key on the server: add `ANTHROPIC_API_KEY` in Vercel → Project → Settings → Environment
  Variables (or `.env.local` for `npm run dev`) and redeploy. Without it the page says so and offers the sample content.

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
