"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PART_TOPICS, TOPICS } from "@/lib/product";
import { newSession, saveLead, type LeadKind, type LeadMethod, type Session } from "@/lib/session";
import { DEFAULT_SWIPE, SwipeDetector, type SwipeDir } from "@/lib/swipe";
import { hasSavedSwipeOptions, loadSwipeOptions, saveSwipeOptions } from "@/lib/swipeTeach";
import { useHandTracking, type HandFrame } from "@/lib/useHandTracking";
import styles from "./kiosk.module.css";
import { Brochure, Contact, DemoContext, Hub, ModelFileContext, Team } from "./Screens";
import { livePickers } from "./LiveModel";
import { loadPublishedDemo, loadPublishedModelFile, type PublishedDemo } from "@/lib/published";
import TeachSwipes, { type TeachResult, type TeachSink } from "./TeachSwipes";

const ACCENT = "#BFD8FF";
const STAGE_W = 1280;
const STAGE_H = 720;

type Screen = "hub" | "staff" | "brochure" | "contact";
const DEFAULT_TOPIC = 1; // "How it works": the exploded earbud is the strongest first impression

// Timing.
const PRESENT_MS = 8000; // no hand and no touch/mouse for this long → nobody is at the kiosk
const ATTRACT_CYCLE_MS = 5000; // nobody here: flip through the topics like a pamphlet on a stand
const RESET_MS = 45000; // nobody here this long → clear the visitor's session, back to the start
const RESET_STAFF_MS = 180000; // they were told to look around while staff come over, so wait longer
const HAND_GRACE_MS = 250; // keep a dwell going through brief tracking misses
const HAND_MARGIN = 0.12; // ignore the outer edge of the camera frame
const SMOOTHING = 0.45;
const TRAIL_LEN = 10;
const TAU_EXPLODE = 0.35; // easing time constant (s) for the earbud coming apart

// The camera loses a hand near the edge of its view. Held there this long → ask the visitor to move it.
const EDGE_WARN_MS = 700;
const EDGE_TIPS = {
  low: "Raise your hand a little: the camera loses it near the bottom.",
  high: "Lower your hand a little: the camera loses it near the top.",
  side: "Move your hand toward the middle: the camera loses it near the sides.",
} as const;
type Edge = keyof typeof EDGE_TIPS;
const edgeOf = (x: number, y: number): Edge | null =>
  y > 0.78 ? "low" : y < 0.12 ? "high" : x < 0.1 || x > 0.9 ? "side" : null;

const KEY_DIRS: Record<string, SwipeDir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

export default function Kiosk() {
  const [screen, setScreen] = useState<Screen>("hub");
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [present, setPresent] = useState(false); // someone is using the kiosk (else attract loop)
  // On "How it works" and "Specs": the row a visitor is pointing at or swiped to (its part lights up).
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [modelPart, setModelPart] = useState<string | null>(null); // the part of the model under the pointer
  const [explode, setExplode] = useState(topicExplode(DEFAULT_TOPIC));
  // The session lives in a ref (time per topic grows every frame); screens get a snapshot of it.
  const [view, setView] = useState<Session>(newSession);
  const [handVisible, setHandVisible] = useState(false);
  const [swipeMode, setSwipeMode] = useState(false); // top-right switch: hands swipe instead of pointing
  const [teaching, setTeaching] = useState(false); // 't' (swipe mode): record how someone swipes and tune to it
  const [hasSaved, setHasSaved] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [showSelf, setShowSelf] = useState(false); // hidden self-view; tracking still runs
  const [scale, setScale] = useState(1);
  const [debug, setDebug] = useState<string | null>(null); // 'd': tracking rate and last swipe
  const [edge, setEdge] = useState<Edge | null>(null);
  const [camAspect, setCamAspect] = useState(16 / 9);
  const [demo, setDemo] = useState<PublishedDemo | null>(null); // what the business portal published
  const demoRef = useRef<PublishedDemo | null>(null);
  useEffect(() => {
    demoRef.current = demo;
  }, [demo]);
  const [modelFile, setModelFile] = useState<{ key: string; name: string; data: ArrayBuffer } | null>(null);

  // Show what the business portal published; check for a newer version every minute.
  useEffect(() => {
    let cancelled = false;
    const load = () => loadPublishedDemo().then((d) => {
      if (!cancelled) setDemo((prev) => (d && prev?.publishedAt === d.publishedAt ? prev : d));
    });
    load();
    const id = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Fetch the published model file for the live 3D view (pictures show until it arrives).
  const fileKey = demo?.model?.file ? `${demo.model.file.name}|${demo.model.file.path ?? ""}|${demo.publishedAt}` : "";
  useEffect(() => {
    if (!fileKey || !demo) return;
    let cancelled = false;
    loadPublishedModelFile(demo).then((f) => {
      if (!cancelled && f) setModelFile({ key: fileKey, ...f });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the published file changes
  }, [fileKey]);
  const liveFile = modelFile && modelFile.key === fileKey ? modelFile : null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const camCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<SVGPolylineElement>(null);
  const swipes = useRef<SwipeDetector | null>(null);
  const teachSink = useRef<TeachSink | null>(null);
  const swipeModeRef = useRef(false);
  const debugRef = useRef({ on: false, last: "no swipe yet", text: "", since: 0, frames: 0, handFrames: 0, stats: "" });
  const session = useRef<Session>(newSession());

  // Mutable per-frame state that shouldn't re-render.
  const ix = useRef({
    screen: "hub" as Screen,
    topic: DEFAULT_TOPIC,
    present: false,
    lastActive: 0, // last time a hand, touch or mouse was seen
    lastCycle: 0,
    hasPos: false,
    x: 0,
    y: 0,
    trail: [] as [number, number][],
    dwellEl: null as HTMLElement | null,
    dwellSince: 0,
    dwellHit: 0,
    dwellFired: false,
    activeRow: null as number | null,
    modelPart: null as string | null,
    rowFromHover: false,
    edge: null as Edge | null,
    edgeSince: 0,
  });

  const bump = useCallback(() => setView({ ...session.current, time: { ...session.current.time }, picked: [...session.current.picked] }), []);

  // ---- Session -------------------------------------------------------------
  const markPresent = useCallback((now: number) => {
    const s = ix.current;
    s.lastActive = now;
    if (!s.present) {
      s.present = true;
      setPresent(true);
      if (!session.current.start) session.current.start = Date.now();
    }
  }, []);

  const pickTopic = useCallback(
    (i: number, byVisitor = true) => {
      const n = TOPICS.length;
      i = ((i % n) + n) % n;
      if (i !== ix.current.topic) {
        // A new topic starts with no row picked (re-picking the same topic keeps it).
        setActiveRow(null);
        ix.current.activeRow = null;
      }
      ix.current.topic = i;
      setTopic(i);
      if (byVisitor) {
        const picked = session.current.picked;
        if (!picked.includes(TOPICS[i].id)) picked.push(TOPICS[i].id);
        bump();
      }
    },
    [bump],
  );

  const go = useCallback(
    (to: Screen) => {
      ix.current.screen = to;
      if (to === "staff" && !session.current.staffAsked) session.current.staffAsked = Date.now();
      clearDwell(ix.current);
      ix.current.activeRow = null;
      setActiveRow(null);
      setScreen(to);
      bump();
    },
    [bump],
  );

  const resetVisitor = useCallback(() => {
    session.current = newSession();
    ix.current.screen = "hub";
    setScreen("hub");
    pickTopic(DEFAULT_TOPIC, false);
    bump();
  }, [pickTopic, bump]);

  const updateSession = useCallback(
    (patch: Partial<Session>) => {
      Object.assign(session.current, patch);
      bump();
    },
    [bump],
  );

  const onSent = useCallback(
    (method: LeadMethod, kind: LeadKind) => {
      if (kind === "brochure") session.current.sent = method;
      else session.current.contacted = true;
      saveLead(session.current, method, kind);
      bump();
    },
    [bump],
  );

  // ---- Swipes: flip through topics like pages; on other screens, swipe right to go back ----
  const onSwipe = useCallback(
    (dir: SwipeDir) => {
      markPresent(performance.now());
      if (ix.current.screen !== "hub") {
        if (dir === "right") go("hub");
        return;
      }
      const s = ix.current;
      const tp = TOPICS[s.topic];
      // How it works / Specs: up and down step through the rows (each lights its part); past the ends, the topic changes.
      if (PART_TOPICS.has(tp.id) && (dir === "up" || dir === "down")) {
        const rows = demoRef.current?.sections.find((x) => x.id === tp.id)?.rows.length ?? tp.rows.length;
        const next = dir === "down" ? (s.activeRow === null ? 0 : s.activeRow + 1) : s.activeRow === null ? -1 : s.activeRow - 1;
        if (next >= 0 && next < rows) {
          s.activeRow = next;
          s.rowFromHover = false;
          setActiveRow(next);
          return;
        }
      }
      pickTopic(s.topic + (dir === "left" || dir === "down" ? 1 : -1));
    },
    [go, pickTopic, markPresent],
  );

  // ---- Pointing: whatever the hand (or mouse) is over ------------------------
  // Hands press things by holding still over them (dwell); the mouse only dwells on topics and clicks the rest.
  const pointAt = useCallback((x: number, y: number, source: "hand" | "mouse", now: number) => {
    const s = ix.current;
    const hit = document.elementFromPoint(x, y);
    let target = (hit?.closest("[data-dwell]") as HTMLElement | null) ?? null;
    if (target && (target.hasAttribute("data-current") || (source === "mouse" && !target.hasAttribute("data-dwell-mouse")))) target = null;
    if (target) s.dwellHit = now;
    else if (source === "hand" && s.dwellEl && now - s.dwellHit < HAND_GRACE_MS) target = s.dwellEl;
    if (target !== s.dwellEl) {
      clearDwell(s);
      if (target) {
        s.dwellEl = target;
        s.dwellSince = now;
        const ms = Number(target.dataset.dwell) || 1000;
        target.style.setProperty("--dwell", `${ms}ms`);
        target.setAttribute("data-dwelling", "");
        cursorRef.current?.style.setProperty("--dwell", `${ms}ms`);
      }
    }
    const cursor = cursorRef.current;
    cursor?.toggleAttribute("data-over", !!target);
    cursor?.toggleAttribute("data-dwelling", !!target && !s.dwellFired);

    // A part of the model under the pointer (sample earbud slices, or the uploaded model's 3D view).
    let part: string | null = hit?.closest("[data-model-part]")?.getAttribute("data-model-part") ?? null;
    if (!part && hit instanceof HTMLCanvasElement && hit.hasAttribute("data-live-model")) part = livePickers.get(hit)?.(x, y) ?? null;
    if (part !== s.modelPart) {
      s.modelPart = part;
      setModelPart(part);
    }

    const rowEl = hit?.closest("[data-row]");
    const row = rowEl ? Number(rowEl.getAttribute("data-row")) : null;
    if (row !== null ? row !== s.activeRow : s.rowFromHover && s.activeRow !== null) {
      s.activeRow = row;
      s.rowFromHover = row !== null;
      setActiveRow(row);
    }
  }, []);

  const pointerGone = useCallback(() => {
    const s = ix.current;
    clearDwell(s);
    cursorRef.current?.removeAttribute("data-over");
    cursorRef.current?.removeAttribute("data-dwelling");
    if (s.rowFromHover && s.activeRow !== null) {
      s.activeRow = null;
      setActiveRow(null);
    }
    if (s.modelPart) {
      s.modelPart = null;
      setModelPart(null);
    }
  }, []);

  // ---- Hand input -------------------------------------------------------
  const onHand = useCallback(
    (hand: HandFrame | null) => {
      const s = ix.current;
      const now = performance.now();
      const cursor = cursorRef.current;

      const dbg = debugRef.current;
      if (dbg.on) {
        dbg.frames++;
        if (hand) dbg.handFrames++;
        if (now - dbg.since >= 1000) {
          dbg.stats = `${Math.round((dbg.frames * 1000) / (now - dbg.since))} FPS · HAND ${Math.round((100 * dbg.handFrames) / Math.max(dbg.frames, 1))}%`;
          dbg.since = now;
          dbg.frames = dbg.handFrames = 0;
        }
      }

      // While teaching, frames go to the teach screen instead.
      const teach = teachSink.current;
      if (teach) teach(now, hand ? hand.palmX * hand.aspect : null, hand ? hand.palmY : null);
      const swiping = swipeModeRef.current;

      if (!hand) {
        const swipe = teach || !swiping ? null : swipes.current?.lost(now);
        if (swipe) onSwipe(swipe.dir);
        if (s.hasPos) {
          s.hasPos = false;
          s.trail = [];
          trailRef.current?.setAttribute("points", "");
          cursor?.style.setProperty("opacity", "0");
          pointerGone();
          setHandVisible(false);
        }
        return;
      }

      if (!swipes.current) swipes.current = new SwipeDetector(loadSwipeOptions());
      const swipe = teach || !swiping ? null : swipes.current.push(now, hand.palmX * hand.aspect, hand.palmY);
      if (swipe) onSwipe(swipe.dir);

      if (dbg.on) {
        if (swipe) dbg.last = `${swipe.dir.toUpperCase()} (dx ${swipe.dx.toFixed(2)}, dy ${swipe.dy.toFixed(2)})`;
        const miss = swipes.current.miss;
        const text = swiping ? `${dbg.stats} · LAST: ${dbg.last}${miss ? ` · MISSED: ${miss}` : ""}` : `POINT · ${dbg.stats}`;
        if (text !== dbg.text) {
          dbg.text = text;
          setDebug(text);
        }
      }

      const e = edgeOf(hand.palmX, hand.palmY);
      if (e !== s.edge) {
        s.edge = e;
        s.edgeSince = now;
      }
      if (now - s.edgeSince >= EDGE_WARN_MS) setEdge(s.edge);

      // The on-screen pointer follows the index fingertip.
      const span = 1 - HAND_MARGIN * 2;
      const tx = Math.min(Math.max((hand.x - HAND_MARGIN) / span, 0), 1) * window.innerWidth;
      const ty = Math.min(Math.max((hand.y - HAND_MARGIN) / span, 0), 1) * window.innerHeight;
      if (!s.hasPos) {
        s.x = tx;
        s.y = ty;
        s.hasPos = true;
        pointerGone(); // a hand takes over from the mouse
        setHandVisible(true);
      }
      s.x += (tx - s.x) * (1 - SMOOTHING);
      s.y += (ty - s.y) * (1 - SMOOTHING);
      markPresent(now);

      if (swiping || teach) return;
      if (cursor) {
        cursor.style.opacity = "1";
        cursor.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
      s.trail.push([s.x, s.y]);
      if (s.trail.length > TRAIL_LEN) s.trail.shift();
      trailRef.current?.setAttribute("points", s.trail.map((p) => p.join(",")).join(" "));
      pointAt(s.x, s.y, "hand", now);
    },
    [onSwipe, pointAt, pointerGone, markPresent],
  );

  const status = useHandTracking(videoRef, camCanvasRef, onHand, ACCENT, cameraOn);
  const camOk = status !== "off" && status !== "no-camera" && status !== "error";

  const toggleSwipeMode = useCallback(() => {
    const on = !swipeModeRef.current;
    swipeModeRef.current = on;
    pointerGone();
    cursorRef.current?.style.setProperty("opacity", "0");
    if (!on) setTeaching(false);
    setSwipeMode(on);
  }, [pointerGone]);

  const onTeachClose = useCallback((result: TeachResult) => {
    if (result) {
      const options = result === "reset" ? null : result;
      saveSwipeOptions(options);
      swipes.current = new SwipeDetector(options ?? DEFAULT_SWIPE);
    }
    setTeaching(false);
  }, []);

  // ---- Mouse / touch / keys -------------------------------------------------
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const now = performance.now();
      markPresent(now);
      if (ix.current.hasPos || e.pointerType === "touch") return; // a tracked hand takes priority
      pointAt(e.clientX, e.clientY, "mouse", now);
    };
    const down = (e: PointerEvent) => {
      const now = performance.now();
      markPresent(now);
      // Taps: pick the row or model part under the finger (touch has no hover).
      if (e.pointerType === "touch") pointAt(e.clientX, e.clientY, "mouse", now);
    };
    // Staff shortcuts are chords on C (held) so a visitor can't trigger them by accident:
    // C + Space camera on/off · C + Option/Alt + Space camera view · C + S swipe mode.
    const held = new Set<string>();
    const up = (e: KeyboardEvent) => held.delete(e.code);
    const blur = () => held.clear();
    const key = (e: KeyboardEvent) => {
      if ((e.target as Element).closest("input, textarea")) return; // typing an email
      markPresent(performance.now());
      held.add(e.code);
      if (held.has("KeyC") && e.code === "Space") {
        e.preventDefault();
        if (e.altKey) setShowSelf((v) => !v);
        else setCameraOn((v) => !v);
        return;
      }
      if (held.has("KeyC") && e.code === "KeyS") {
        e.preventDefault();
        toggleSwipeMode();
        return;
      }
      if (KEY_DIRS[e.key] && !teachSink.current) onSwipe(KEY_DIRS[e.key]); // arrow keys act like swipes
      if (e.key === "t" && swipeModeRef.current) {
        setHasSaved(hasSavedSwipeOptions());
        setTeaching((v) => !v);
      }
      if (e.key === "Escape") setTeaching(false);
      if (e.key === "d") {
        const dbg = debugRef.current;
        dbg.on = !dbg.on;
        dbg.text = "";
        setDebug(dbg.on ? `LAST: ${dbg.last}` : null);
      }
      if (e.key === "r") resetVisitor(); // staff: start fresh for the next visitor
      if (e.key === "f") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.documentElement.addEventListener("pointerleave", pointerGone);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.documentElement.removeEventListener("pointerleave", pointerGone);
    };
  }, [pointAt, pointerGone, onSwipe, markPresent, resetVisitor, toggleSwipeMode]);

  // ---- Frame loop: dwell, time per topic, attract loop, reset, explode easing ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let cur = topicExplode(ix.current.topic);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const s = ix.current;
      const dt = Math.min(now - last, 100);
      last = now;

      // Held long enough over something: press it.
      if (s.dwellEl && !s.dwellFired && now - s.dwellSince >= (Number(s.dwellEl.dataset.dwell) || 1000)) {
        s.dwellFired = true;
        s.dwellEl.removeAttribute("data-dwelling");
        cursorRef.current?.removeAttribute("data-dwelling");
        s.dwellEl.click();
      }

      const idle = now - s.lastActive;
      if (s.present) {
        if (s.screen === "hub") {
          const id = TOPICS[s.topic].id;
          session.current.time[id] = (session.current.time[id] ?? 0) + dt;
        }
        if (idle > PRESENT_MS) {
          s.present = false;
          s.lastCycle = now;
          setPresent(false);
        }
      } else if (s.screen === "hub" && session.current.start === 0 && now - s.lastCycle > ATTRACT_CYCLE_MS) {
        // Nobody here (and no unfinished visit): flip to the next topic to draw people in.
        s.lastCycle = now;
        pickTopic(s.topic + 1, false);
      }
      if (session.current.start && !s.present && idle > (s.screen === "staff" ? RESET_STAFF_MS : RESET_MS)) {
        s.lastCycle = now;
        resetVisitor();
      }

      const target = topicExplode(s.topic);
      if (cur !== target) {
        cur += (target - cur) * (1 - Math.exp(-dt / 1000 / TAU_EXPLODE));
        if (Math.abs(target - cur) < 0.003) cur = target;
        setExplode(Math.round(cur * 1000) / 1000);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pickTopic, resetVisitor]);

  // ---- Fit the 1280×720 artboard to any screen -----------------------------
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const tip = camOk && handVisible && edge ? EDGE_TIPS[edge] : null;
  const guide = !present
    ? {
        title: camOk ? "RAISE A HAND TO START" : "TOUCH A TOPIC TO START",
        sub: "Pick what you want to know, in any order",
      }
    : !camOk
      ? { title: "TOUCH OR HOVER OVER A TOPIC", sub: "Pick in any order" }
      : swipeMode
        ? { title: handVisible ? "SWIPE LEFT FOR THE NEXT TOPIC" : "RAISE A HAND, THEN SWIPE", sub: "Swipe right to go back a topic" }
        : { title: "HOLD YOUR HAND OVER A TOPIC", sub: "It opens after a second · pick in any order" };

  // On How it works / Specs, tell visitors the rows respond.
  const partTopic = present && PART_TOPICS.has(TOPICS[topic].id);
  const rowGuide = !partTopic
    ? guide
    : !camOk
      ? { title: "TOUCH OR HOVER OVER A PART", sub: "On the model or in the list: the other lights up too" }
      : swipeMode
        ? { title: handVisible ? "SWIPE UP OR DOWN THROUGH THE PARTS" : "RAISE A HAND, THEN SWIPE", sub: "Swipe left or right for another topic" }
        : { title: "POINT AT A PART OR A ROW", sub: "The matching part and details light up" };

  const s = view;
  return (
    <DemoContext.Provider value={demo}>
    <ModelFileContext.Provider value={liveFile}>
    <div className={styles.viewport}>
      <div className={styles.stage} style={{ transform: `scale(${scale})` }}>
        <div aria-hidden="true" className={styles.frame} />

        {screen === "hub" && (
          <Hub
            topic={topic}
            onPick={(i) => pickTopic(i)}
            activeRow={activeRow}
            modelPart={modelPart}
            onRow={(i) => { ix.current.activeRow = i; ix.current.rowFromHover = false; setActiveRow(i); }}
            explode={explode}
            accent={ACCENT}
            guide={{ ...rowGuide, sub: tip ?? rowGuide.sub, tip: !!tip }}
            attract={!present}
            onTeam={() => go("staff")}
            onBrochure={() => go("brochure")}
            onContact={() => go("contact")}
          />
        )}
        {screen === "staff" && (
          <Team session={s} onChange={updateSession} onSent={onSent} onBack={() => go("hub")} accent={ACCENT} />
        )}
        {screen === "brochure" && (
          <Brochure session={s} onChange={updateSession} onSent={onSent} onBack={() => go("hub")} accent={ACCENT} />
        )}
        {screen === "contact" && (
          <Contact session={s} onChange={updateSession} onSent={onSent} onBack={() => go("hub")} onBrochure={() => go("brochure")} accent={ACCENT} />
        )}

        {/* Staff shortcuts reminder (top right): hover or focus to see the key chords. */}
        <div className={styles.shortcuts}>
          <button type="button" className={styles.shortcutsIcon} aria-label="Keyboard shortcuts" aria-describedby="kiosk-shortcuts">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2.5" y="6" width="19" height="12" rx="2" />
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9" />
            </svg>
            <span
              className={styles.statusDot}
              data-status={status}
              style={status === "tracking" ? { background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` } : undefined}
            />
          </button>
          <div id="kiosk-shortcuts" role="tooltip" className={styles.shortcutsTip}>
            <div className={styles.tipStatus}>
              {STATUS_TEXT[status]}{camOk ? ` · ${swipeMode ? "SWIPE" : "POINT & HOLD"}` : ""}
            </div>
            <dl>
              <dt><kbd>C</kbd> + <kbd>Space</kbd></dt><dd>Camera {cameraOn ? "off" : "on"}</dd>
              <dt><kbd>C</kbd> + <kbd>⌥ Option</kbd> + <kbd>Space</kbd></dt><dd>{showSelf ? "Hide" : "Show"} camera view</dd>
              <dt><kbd>C</kbd> + <kbd>S</kbd></dt><dd>Swipe mode {swipeMode ? "off" : "on"}</dd>
              <dt><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Act like swipes</dd>
              <dt><kbd>T</kbd></dt><dd>Teach swipes (swipe mode)</dd>
              <dt><kbd>R</kbd></dt><dd>Start fresh</dd>
              <dt><kbd>F</kbd></dt><dd>Full screen</dd>
              <dt><kbd>D</kbd></dt><dd>Tracking debug</dd>
            </dl>
          </div>
        </div>
        {debug && <div className={styles.debugLine}>{debug}</div>}

        <div
          className={teaching && camOk ? `${styles.cam} ${styles.camTeach}` : styles.cam}
          style={{ opacity: camOk && (showSelf || teaching) ? 1 : 0, ...(teaching ? { height: 456 / camAspect } : null) }}
        >
          <video
            ref={videoRef}
            className={styles.camVideo}
            muted
            playsInline
            onLoadedMetadata={(e) => setCamAspect(e.currentTarget.videoWidth / Math.max(e.currentTarget.videoHeight, 1))}
          />
          <canvas ref={camCanvasRef} width={320} height={180} className={styles.camVideo} />
          {teaching && (
            <>
              <div className={styles.camGuide} />
              <div className={styles.camGuideLabel}>KEEP YOUR HAND INSIDE THE BOX</div>
            </>
          )}
        </div>

        {teaching && camOk && (
          <TeachSwipes sinkRef={teachSink} handVisible={handVisible} hasSaved={hasSaved} onClose={onTeachClose} />
        )}
      </div>

      {/* Hand pointer (pointing mode). Outside the scaled stage so it maps 1:1 to the screen.
          Its ring fills while the hand holds over something that can be pressed. */}
      {!swipeMode && camOk && (
        <>
          <svg className={styles.trail} aria-hidden="true">
            <polyline ref={trailRef} fill="none" stroke={ACCENT} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div ref={cursorRef} className={styles.cursor} aria-hidden="true">
            <svg width="64" height="64" viewBox="-32 -32 64 64">
              <circle r="9" fill={ACCENT} />
              <circle r="22" fill="none" stroke={ACCENT} strokeWidth="3" className={styles.cursorRing} />
              <circle r="22" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeDasharray="138.3" className={styles.cursorDwell} />
            </svg>
          </div>
        </>
      )}
    </div>
    </ModelFileContext.Provider>
    </DemoContext.Provider>
  );
}

/** Only How it works and Specs move the model; every other topic shows it whole. */
function topicExplode(i: number) {
  return PART_TOPICS.has(TOPICS[i].id) ? TOPICS[i].explode : 0;
}

function clearDwell(s: { dwellEl: HTMLElement | null; dwellFired: boolean }) {
  s.dwellEl?.removeAttribute("data-dwelling");
  s.dwellEl = null;
  s.dwellFired = false;
}

const STATUS_TEXT = {
  off: "CAMERA OFF · TOUCH OR CLICK",
  loading: "STARTING CAMERA…",
  ready: "CAMERA READY",
  tracking: "HAND DETECTED",
  "no-camera": "NO CAMERA · TOUCH OR CLICK",
  error: "TRACKING UNAVAILABLE · TOUCH OR CLICK",
} as const;
