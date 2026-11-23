"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { HandLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";

export type TrackingStatus = "off" | "loading" | "ready" | "tracking" | "no-camera" | "error";

export type HandFrame = {
  // Index fingertip, mirrored so moving your hand right moves the cursor right. 0..1.
  x: number;
  y: number;
  // Palm centre (wrist + knuckles), mirrored. Steadier than a fingertip for swipes. 0..1.
  palmX: number;
  palmY: number;
  // Video width / height, to compare horizontal and vertical movement fairly.
  aspect: number;
  landmarks: NormalizedLandmark[];
  // The visitor's other hand, if the camera sees it: only ever used to pinch-zoom (the first hand stays the pointer).
  // Only a hand that looks like the same person's (similar size, close by) counts; nobody else's.
  other: { landmarks: NormalizedLandmark[]; palmX: number; palmY: number } | null;
  // A second hand the camera saw but that didn't count as the visitor's (for the debug line).
  otherIgnored: "size" | "far" | null;
};

// The second hand counts only if it's the same person's: about the same size and within arm's reach. (Hand size is
// wrist to middle knuckle, so two hands held apart in front of the body are often 6–9 hand sizes apart.)
const OTHER_SIZE_RATIO = 1.8;
const OTHER_MAX_APART = 11; // hand sizes between the two palms
// When the camera loses the pointing hand for a moment but still sees the other one, the other hand doesn't take over
// as the pointer for this long (the pointing hand usually comes straight back).
const MAIN_GRACE_MS = 450;

const PALM = [0, 5, 9, 13, 17];

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/models/hand_landmarker.task";

/**
 * Runs MediaPipe's hand landmarker against the webcam and calls `onFrame`
 * once per processed video frame with the tracked hand (or null when no hand
 * is visible). Landmarks are drawn onto `canvasRef` for the preview window.
 * When `enabled` is false the webcam is released entirely.
 */
export function useHandTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  onFrame: (hand: HandFrame | null) => void,
  accent: string,
  enabled: boolean,
) {
  const [status, setStatus] = useState<TrackingStatus>("loading");
  const onFrameRef = useRef(onFrame);
  const accentRef = useRef(accent);

  useEffect(() => {
    onFrameRef.current = onFrame;
    accentRef.current = accent;
  });

  useEffect(() => {
    if (!enabled) return;
    const videoEl = videoRef.current;
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let landmarker: HandLandmarker | null = null;

    async function start() {
      const video = videoRef.current;
      if (!video) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("no-camera");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" },
          audio: false,
        });
      } catch {
        if (!cancelled) setStatus("no-camera");
        return;
      }
      if (cancelled) {
        // Switched off while the camera was still starting: release it.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});

      try {
        const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        const create = (delegate: "GPU" | "CPU") =>
          HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_PATH, delegate },
            runningMode: "VIDEO",
            numHands: 2, // the pointing hand, plus the same visitor's other hand for zooming. Never more.
            minHandDetectionConfidence: 0.5,
            // Lower than MediaPipe's defaults so it holds on to a blurry, fast-moving hand mid-swipe
            // instead of dropping it (a new hand still needs the full detection confidence).
            minHandPresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
          });
        landmarker = await create("GPU").catch(() => create("CPU"));
        if (cancelled) {
          landmarker.close();
          return;
        }
        setStatus("ready");
        loop(HandLandmarker.HAND_CONNECTIONS);
      } catch (err) {
        console.error("Hand tracking failed to start", err);
        if (!cancelled) setStatus("error");
      }
    }

    function loop(connections: { start: number; end: number }[]) {
      let lastTime = -1;
      let seen = false;
      let mainPalm: [number, number] | null = null; // where the pointing hand was last frame (camera coords)
      let mainLast: { lm: NormalizedLandmark[]; at: number } | null = null; // the pointing hand when last seen
      const palmOf = (lm: NormalizedLandmark[]): [number, number] => [PALM.reduce((a, i) => a + lm[i].x, 0) / PALM.length, PALM.reduce((a, i) => a + lm[i].y, 0) / PALM.length];
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const video = videoRef.current;
        if (!video || !landmarker || video.readyState < 2 || video.currentTime === lastTime) return;
        lastTime = video.currentTime;

        const result = landmarker.detectForVideo(video, performance.now());
        const aspect = video.videoWidth / Math.max(video.videoHeight, 1);
        // The pointing hand is the one nearest where it was; the first hand seen takes the role and keeps it.
        const now = performance.now();
        const size = (h: NormalizedLandmark[]) => Math.hypot((h[0].x - h[9].x) * aspect, h[0].y - h[9].y);
        const fromMain = (h: NormalizedLandmark[]) => { const [x, y] = palmOf(h); return mainPalm ? Math.hypot((x - mainPalm[0]) * aspect, y - mainPalm[1]) : 0; };
        const hands = result.landmarks.slice(0, 2);
        if (hands.length === 2 && mainPalm && fromMain(hands[1]) < fromMain(hands[0])) hands.reverse();
        let lm: NormalizedLandmark[] | undefined = hands[0];
        let other: NormalizedLandmark[] | undefined = hands[1];
        // Only one hand in view, far from where the pointing hand just was: it's the other hand, and the pointing hand
        // has dropped out for a moment. Keep pointing where it was rather than jumping the cursor to the other hand.
        let mainStale = false;
        if (lm && !other && mainLast && now - mainLast.at < MAIN_GRACE_MS && fromMain(lm) > 3 * size(mainLast.lm)) {
          other = lm;
          lm = mainLast.lm;
          mainStale = true;
        }
        let otherIgnored: "size" | "far" | null = null;
        if (lm && other) {
          const [ax, ay] = palmOf(lm), [bx, by] = palmOf(other);
          const s1 = size(lm), s2 = size(other);
          const apart = Math.hypot((ax - bx) * aspect, ay - by) / Math.max(s1, 1e-3);
          if (Math.max(s1, s2) / Math.max(Math.min(s1, s2), 1e-3) > OTHER_SIZE_RATIO) otherIgnored = "size";
          else if (apart > OTHER_MAX_APART) otherIgnored = "far";
          if (otherIgnored) other = undefined;
        }
        if (lm && !mainStale) mainLast = { lm, at: now };
        mainPalm = lm ? palmOf(lm) : mainLast && now - mainLast.at < MAIN_GRACE_MS ? mainPalm : null;
        draw(lm, other, connections);

        if (!!lm !== seen) {
          seen = !!lm;
          setStatus(seen ? "tracking" : "ready");
        }
        if (!lm) {
          onFrameRef.current(null);
          return;
        }
        const tip = lm[8];
        const [palmX, palmY] = palmOf(lm);
        const otherPalm = other ? palmOf(other) : null;
        onFrameRef.current({
          x: 1 - tip.x,
          y: tip.y,
          palmX: 1 - palmX,
          palmY,
          aspect,
          landmarks: lm,
          other: other && otherPalm ? { landmarks: other, palmX: 1 - otherPalm[0], palmY: otherPalm[1] } : null,
          otherIgnored,
        });
      };
      raf = requestAnimationFrame(tick);
    }

    function draw(lm: NormalizedLandmark[] | undefined, other: NormalizedLandmark[] | undefined, connections: { start: number; end: number }[]) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      // The other hand (zoom only) in a quieter colour.
      if (other) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        for (const { start, end } of connections) {
          ctx.moveTo(other[start].x * w, other[start].y * h);
          ctx.lineTo(other[end].x * w, other[end].y * h);
        }
        ctx.stroke();
      }
      if (!lm) return;
      ctx.lineWidth = 2;
      ctx.strokeStyle = accentRef.current;
      ctx.beginPath();
      for (const { start, end } of connections) {
        ctx.moveTo(lm[start].x * w, lm[start].y * h);
        ctx.lineTo(lm[end].x * w, lm[end].y * h);
      }
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      for (const [i, p] of lm.entries()) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, i === 8 ? 4 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      landmarker?.close();
      stream?.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
      draw(undefined, undefined, []);
      onFrameRef.current(null);
      setStatus("loading");
    };
  }, [videoRef, canvasRef, enabled]);

  return enabled ? status : "off";
}
