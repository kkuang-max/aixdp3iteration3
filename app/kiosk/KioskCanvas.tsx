"use client";

// The visitor kiosk's topic screen, drawn from a demo you pass in, at any size. The business portal uses it as a live
// preview of the draft: it is the same Hub component the kiosk shows, so what the business sees is what visitors see.
//
// It is only the picture. No camera, hand tracking, idle timers or window-wide keyboard / mouse listeners (those live
// in Kiosk.tsx), so typing in the portal never reaches it, and nothing is recorded or sent. Topics and rows respond to
// clicks so the business can look around, the same way a visitor's touch would.

import { useState } from "react";
import { PART_TOPICS, TOPICS } from "@/lib/product";
import type { PublishedDemo } from "@/lib/published";
import type { HoldState } from "./Kiosk";
import { DemoContext, Hub, ModelFileContext } from "./Screens";
import styles from "./kiosk.module.css";

const STAGE_W = 1280;
const STAGE_H = 720;
const ACCENT = "#BFD8FF";
/** Nobody's hand on the model: it keeps turning, nothing is zoomed. */
const STILL: HoldState = { holding: false, part: null, zoomed: false, zoomPart: null, origin: "50% 50%", shift: [0, 0], scale: 1.6 };

// The kiosk's own guide text for a visitor using it with the camera on (Kiosk.tsx).
const GUIDE = { title: "HOLD YOUR HAND OVER A TOPIC", sub: "It opens after a second · pick in any order", tip: false };
const PART_GUIDE = { title: "POINT AT A PART OR A ROW", sub: "The matching part and details light up", tip: false };

export type KioskAction = "team" | "brochure" | "contact";

export default function KioskCanvas({ demo, modelFile, topicId, onPickTopic, onAction, width, className }: {
  demo: PublishedDemo;
  /** The model file for the live 3D view (pictures show without it). */
  modelFile: { name: string; data: ArrayBuffer } | null;
  /** The topic shown (a section id: what, how, different, uses, specs). */
  topicId: string;
  /** A topic was clicked on the preview. */
  onPickTopic?: (id: string) => void;
  /** Talk to our team, Get digital brochure or Give us your contact was clicked. */
  onAction?: (action: KioskAction) => void;
  /** Width on the page (px); the 1280×720 kiosk is scaled to it. */
  width: number;
  className?: string;
}) {
  const index = Math.max(0, TOPICS.findIndex((t) => t.id === topicId));
  const id = TOPICS[index].id;
  const interactive = PART_TOPICS.has(id);
  // The row clicked on How it works / Specs lights its part, until another topic shows.
  const [row, setRow] = useState<{ topic: string; i: number } | null>(null);
  const activeRow = row && row.topic === id ? row.i : null;
  const scale = width / STAGE_W;
  return (
    <div className={`${styles.canvas} ${className ?? ""}`} style={{ width, height: STAGE_H * scale }}>
      <div className={styles.stage} style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <DemoContext.Provider value={demo}>
          <ModelFileContext.Provider value={modelFile}>
            <div aria-hidden="true" className={styles.frame} />
            <Hub
              topic={index}
              onPick={(i) => onPickTopic?.(TOPICS[i].id)}
              activeRow={activeRow}
              modelPart={null}
              hold={STILL}
              onRow={(i) => setRow({ topic: id, i })}
              explode={interactive ? 1 : 0}
              accent={ACCENT}
              guide={interactive ? PART_GUIDE : GUIDE}
              attract={false}
              onTeam={() => onAction?.("team")}
              onBrochure={() => onAction?.("brochure")}
              onContact={() => onAction?.("contact")}
            />
          </ModelFileContext.Provider>
        </DemoContext.Provider>
      </div>
    </div>
  );
}
