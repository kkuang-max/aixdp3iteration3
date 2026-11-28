"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MODEL, PAGE_LABEL, PART_TOPICS, PRODUCT, STORY, TOPICS, VIEWS, topicIndex, viewOf, type PartId } from "@/lib/product";
import { SAMPLE_GESTURE_TEXT, SAMPLE_PART_NAMES, type GestureText } from "@/lib/gestureText";
import type { HoldState } from "./Kiosk";
import { TypingPanel } from "./Keyboard";
import { type LeadKind, type LeadMethod, type Session } from "@/lib/session";
import { matchPart, type PublishedDemo } from "@/lib/published";
import Model3D from "./Model3D";
import LiveModel from "./LiveModel";
import styles from "./kiosk.module.css";

// Hold a hand over anything marked data-dwell for that many ms and it activates (Kiosk.tsx runs it).
// Topics also open when the mouse rests on them (data-dwell-mouse), as in the design.
export const DWELL_TOPIC_MS = 900;
export const DWELL_BUTTON_MS = 1200;

// Button icons, one per job.
const ICON = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "#BFD8FF", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
/** Talk to our team: a speech bubble with a person. */
export const TeamIcon = () => (
  <svg {...ICON}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" />
    <circle cx="13" cy="10" r="2.2" />
    <path d="M9.4 15.4a4 4 0 0 1 7.2 0" />
  </svg>
);
/** Get the brochure: download. */
export const DownloadIcon = () => (
  <svg {...ICON}>
    <path d="M12 4v11M7 10.5l5 5 5-5" />
    <path d="M5 19.5h14" />
  </svg>
);
/** Give us your contact: a contact card. */
export const ContactIcon = () => (
  <svg {...ICON}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="9" cy="11" r="2" />
    <path d="M5.8 16a3.4 3.4 0 0 1 6.4 0M14.5 10h4M14.5 13.5h3" />
  </svg>
);
const SendIcon = () => (
  <svg {...ICON} stroke="currentColor">
    <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />
  </svg>
);
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
const BadgeIcon = ({ size = 44 }: { size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/icons/badge.svg" width={size} height={size} alt="" aria-hidden="true" />
);

// ---- What the business portal published ------------------------------------------
/** The demo published from /business, or null to show the built-in Orbit Earbuds content. */
export const DemoContext = createContext<PublishedDemo | null>(null);
/** The published model file, once loaded, for the live 3D view. */
export const ModelFileContext = createContext<{ name: string; data: ArrayBuffer } | null>(null);
/** The product's name: what the portal filled in (maybe nothing yet), or the built-in sample's when nothing was published. */
const useProductName = () => {
  const demo = useContext(DemoContext);
  return demo ? demo.productName.toUpperCase() : PRODUCT.name;
};
/** "ORBIT EARBUDS" → "Orbit Earbuds", for names inside a sentence. */
const titleCase = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
/** "NAME / REST", or just "REST" while the product has no name. */
const named = (name: string, rest: string) => (name ? `${name} / ${rest}` : rest);

/** The product in the middle of the hub: the uploaded model's picture for this topic, or the sample earbud in 3D. */
function ProductModel(props: { topicId: string; explode: number; highlight: readonly PartId[]; glow: readonly PartId[]; accent: string; rowPart?: string | null; zoomPart?: string | null; interactive?: boolean; paused?: boolean; frozen?: boolean }) {
  const demo = useContext(DemoContext);
  const file = useContext(ModelFileContext);
  const [failed, setFailed] = useState<ArrayBuffer | null>(null); // the file the live view couldn't show
  if (demo?.model) {
    // Hovering only lights a part up; nothing moves. Zooming in on a part turns the rest see-through.
    const part = props.rowPart ?? null;
    // How it works and Specs: every part apart, the same way on both. Other topics: the whole model turning.
    const mode = !props.interactive ? "Slow turn" : "Explode apart";
    if (file && failed !== file.data) {
      return (
        <>
          <div className={styles.modelShadow} />
          <div className={styles.modelPicture}>
            <LiveModel name={file.name} data={file.data} part={props.zoomPart ?? null} glow={part} mode={mode} accent={props.accent} onFail={() => setFailed(file.data)} paused={props.paused} frozen={props.frozen} />
          </div>
        </>
      );
    }
    const src = (part && demo.model.parts[part]) || demo.model.whole;
    return (
      <>
        <div className={styles.modelShadow} />
        <div className={styles.modelPicture} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={src} src={src} alt="" />
        </div>
      </>
    );
  }
  if (demo) return <NoModel />;
  return <Model3D geo={MODEL} accent={props.accent} explode={props.explode} highlight={props.highlight} glow={props.glow} interactive={props.interactive} paused={props.paused} />;
}

/** The portal's demo has no 3D model yet: say so instead of showing the sample earbud. */
function NoModel() {
  return (
    <div className={styles.noModel}>
      <span>No 3D model uploaded yet</span>
    </div>
  );
}

/** A button a hand can hold over to press: shows a filling bar while the hand dwells. */
function HandButton(props: { className: string; onClick: () => void; children: ReactNode; ms?: number; label?: string }) {
  return (
    <button type="button" className={props.className} onClick={props.onClick} data-dwell={props.ms ?? DWELL_BUTTON_MS} aria-label={props.label}>
      {props.children}
      <span className={styles.dwellBar} aria-hidden="true" />
    </button>
  );
}

// ---- Editing in place (business portal preview only) --------------------------------------
/** Given only by the business portal's live preview: the topic's text becomes editable where visitors read it. The
 *  visitor kiosk never passes it. */
export type HubEdit = {
  onTitle: (v: string) => void;
  onRow: (i: number, patch: { a?: string; b?: string }) => void;
  onAddRow: () => void;
  onRemoveRow: (i: number) => void;
  maxRows: number;
};

/** A text box styled like the kiosk text it replaces, growing with its text. Kiosk copy is one line of text per
 *  field: Enter doesn't add a line. */
function EditText({ value, onChange, className, placeholder, label, onFocus }: { value: string; onChange: (v: string) => void; className: string; placeholder: string; label: string; onFocus?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`${className} ${styles.editText}`}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      spellCheck
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, " "))}
      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
    />
  );
}

// ---- Topic hub ---------------------------------------------------------------
// One stable array per part, so the 3D earbud only rebuilds when the lit part changes.
const NO_PARTS: PartId[] = [];
const ONE_PART = Object.fromEntries(MODEL.parts.map((p) => [p.id, [p.id]])) as Record<PartId, PartId[]>;

export function Hub(props: {
  topic: number;
  onPick: (i: number) => void;
  activeRow: number | null;
  modelPart: string | null; // the part of the model under the pointer
  /** Holding over the model (stops it turning, lights the part up) and pinch zoom on a part. */
  hold: HoldState;
  onRow: (i: number) => void;
  explode: number;
  accent: string;
  guide: { title: string; sub: string; tip: boolean };
  attract: boolean;
  onTeam: () => void;
  onBrochure: () => void;
  onContact: () => void;
  /** Business portal preview only: edit the topic's text in place. */
  edit?: HubEdit;
}) {
  const demo = useContext(DemoContext);
  const productName = useProductName();
  const base = TOPICS[props.topic];
  const view = viewOf(base.id); // Overview or Explore the parts
  const edit = props.edit;
  const published = demo?.sections.find((x) => x.id === base.id);
  // A demo from the portal shows exactly what was filled in, even if that's nothing; the built-in sample shows only
  // when nothing has been published.
  const t = demo
    ? { ...base, title: published?.title ?? "", rows: (published?.rows ?? []).map((r) => ({ a: r.a, b: r.b, part: undefined as PartId | undefined })) }
    : base;
  const interactive = PART_TOPICS.has(base.id);
  const active = interactive && props.activeRow !== null ? t.rows[props.activeRow] : undefined;
  // Sample earbud: the row's part. Uploaded model: the part whose name matches the row.
  const partNames = demo?.model ? (demo.model.partNames ?? Object.keys(demo.model.parts)) : [];
  const rowPart = (r: { a: string; part?: PartId }): string | null => (demo?.model ? matchPart(r.a, partNames) : (r.part ?? null));
  // Pointing at a part lights it and every row about it; pointing at (or swiping to) a row lights its part.
  const hoverPart = interactive ? props.modelPart : null;
  // Zoomed in on a part: that part stays lit; otherwise what's pointed at.
  const zoomPart = interactive && props.hold.zoomed ? props.hold.zoomPart : null;
  const litPart = zoomPart ?? hoverPart ?? (active ? rowPart(active) : null);
  const samplePart = (id: string | null) => (interactive && !demo?.model && id && id in ONE_PART ? ONE_PART[id as PartId] : NO_PARTS);
  // Pointing lights a part up; only a zoom turns the rest see-through.
  const highlight = samplePart(zoomPart);
  const glow = zoomPart ? NO_PARTS : samplePart(litPart);
  const rowLit = (r: (typeof t.rows)[number], i: number) => interactive && (hoverPart ? rowPart(r) === hoverPart : i === props.activeRow);
  // A published demo shows only what the business wrote (nothing is made up); before anything is published, the
  // built-in Orbit Earbuds example.
  const gestureText: GestureText = demo ? (demo.gestureText ?? { whole: "", parts: {} }) : SAMPLE_GESTURE_TEXT;
  const zoomText = zoomPart ? gestureText.parts[zoomPart] : undefined;
  const zoomName = zoomPart ? (demo ? zoomPart : (SAMPLE_PART_NAMES[zoomPart] ?? zoomPart)) : "";
  return (
    <>
      <div className={styles.eyebrow}>
        {demo ? productName : `${productName} / ${PRODUCT.brand} · ${PRODUCT.booth}`}
      </div>
      <HandButton className={styles.teamLink} onClick={props.onTeam}>
        <TeamIcon />
        TALK TO OUR TEAM
      </HandButton>

      <nav className={styles.topics} aria-label="Topics">
        <span className={styles.topicsLabel}>WHAT DO YOU WANT TO KNOW?</span>
        {VIEWS.map((v) => {
          const on = v.id === view.id;
          return (
            <button
              key={v.id}
              type="button"
              className={styles.topic}
              data-view={v.id}
              data-dwell={DWELL_TOPIC_MS}
              data-dwell-mouse=""
              data-current={on ? "" : undefined}
              aria-current={on ? "true" : undefined}
              onClick={() => { if (!on) props.onPick(topicIndex(v.pages[0])); }}
            >
              <span className={styles.topicNum}>
                <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
                  <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
                  <circle cx="20" cy="20" r="18" fill="none" stroke={props.accent} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="113" className={styles.dwellRing} />
                </svg>
                {v.n}
              </span>
              <span className={styles.topicLabel}>{v.label}</span>
            </button>
          );
        })}
        {/* The current choice's pages, turning like cards: hold a hand over one, tap it, or swipe left / right.
            Below both choices, so those two never move. */}
        <div className={styles.pages} role="tablist" aria-label={view.label}>
          {view.pages.map((id) => {
            const on = id === base.id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                className={styles.page}
                data-page={id}
                data-dwell={DWELL_TOPIC_MS}
                data-current={on ? "" : undefined}
                onClick={() => { if (!on) props.onPick(topicIndex(id)); }}
              >
                {PAGE_LABEL[id] ?? id}
                <span className={styles.dwellBar} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </nav>

      {/* The model: holding over it stops it turning (and on How it works / Specs pulls the pointed part out);
          pinching zooms in on that part. data-model-zone is the area the kiosk treats as "over the model". */}
      <div className={styles.modelZone} data-model-zone="" aria-hidden="true" />
      <div className={styles.modelZoomClip}>
      <div
        className={styles.modelZoom}
        data-zoomed={zoomPart ? "" : undefined}
        style={{ transform: zoomPart ? `translate(${props.hold.shift[0]}px, ${props.hold.shift[1]}px) scale(${props.hold.scale})` : "none", transformOrigin: "0 0" }}
      >
        <ProductModel topicId={t.id} accent={props.accent} explode={props.explode} highlight={highlight} glow={glow} rowPart={litPart} zoomPart={zoomPart} interactive={interactive} paused={props.hold.holding || !!zoomPart} frozen={!!zoomPart} />
      </div>
      </div>


      {zoomPart ? (
      <section key={`zoom-${zoomPart}`} className={styles.panel} aria-live="polite">
        <span className={styles.panelKicker}>
          {view.label} · {PAGE_LABEL[t.id] ?? t.label}
        </span>
        <h1 className={styles.panelTitle}>{zoomName}</h1>
        <div className={styles.partDetail}>
          {zoomText?.hover && <span className={styles.partDetailLead}>{zoomText.hover}</span>}
          {zoomText?.pinch && <p className={styles.partDetailBody}>{zoomText.pinch}</p>}
          {zoomText?.specs && (
            <div className={styles.partDetailSpecs}>
              <span className={styles.partDetailLabel}>SPECS</span>
              <span>{zoomText.specs}</span>
            </div>
          )}
        </div>
      </section>
      ) : (
      <section key={view.id} className={styles.panel} aria-live="polite">
        <span className={styles.panelKicker}>{(PAGE_LABEL[t.id] ?? t.label).toUpperCase()}</span>
        <div key={t.id} className={styles.pageBody}>
        {edit ? (
          <EditText className={styles.panelTitle} value={t.title} placeholder="Write a headline" label="Headline" onChange={edit.onTitle} />
        ) : t.title ? <h1 className={styles.panelTitle}>{t.title}</h1> : <h1 className={styles.panelTitle} data-empty="">Not filled in yet</h1>}
        <div className={styles.rows}>
          {t.rows.map((r, i) => edit ? (
            // Keyed by position, so a row keeps its text box (and the cursor) while it is typed in.
            <div key={i} className={`${styles.row} ${styles.editRow}`} data-active={rowLit(r, i) ? "" : undefined}>
              <EditText className={styles.rowA} value={r.a} placeholder="Point" label={`Point ${i + 1}`} onChange={(v) => edit.onRow(i, { a: v })} onFocus={interactive ? () => props.onRow(i) : undefined} />
              <EditText className={styles.rowB} value={r.b} placeholder="Detail (optional)" label={`Point ${i + 1} detail`} onChange={(v) => edit.onRow(i, { b: v })} onFocus={interactive ? () => props.onRow(i) : undefined} />
              <button type="button" className={styles.editRemove} aria-label={`Remove point ${i + 1}`} title="Remove this point" onClick={() => edit.onRemoveRow(i)}>×</button>
            </div>
          ) : (
            <div
              key={`${i}-${r.a}`}
              className={styles.row}
              data-row={interactive ? i : undefined}
              data-active={rowLit(r, i) ? "" : undefined}
              onClick={interactive ? () => props.onRow(i) : undefined}
            >
              <span className={styles.rowA}>{r.a}</span>
              {r.b && <span className={styles.rowB}>{r.b}</span>}
            </div>
          ))}
          {edit && t.rows.length < edit.maxRows && (
            <button type="button" className={styles.editAdd} onClick={edit.onAddRow}>+ Add point</button>
          )}
        </div>
        </div>
      </section>
      )}

      <div className={styles.guide}>
        <span key={props.guide.title} className={styles.guideTitle}>
          {props.guide.title}
        </span>
        <span className={styles.guideSub} style={props.guide.tip ? { color: props.accent } : undefined}>
          {props.guide.sub}
        </span>
        {props.attract && (
          <span className={styles.attractDots} aria-hidden="true">
            {STORY.map((id) => (
              <span key={id} data-on={id === base.id ? "" : undefined} />
            ))}
          </span>
        )}
      </div>
      <div className={styles.hubActions}>
        <HandButton className={styles.pillBtn} onClick={props.onBrochure}>
          <DownloadIcon />
          GET DIGITAL BROCHURE
        </HandButton>
        <HandButton className={styles.pillBtn} onClick={props.onContact}>
          <ContactIcon />
          GIVE US YOUR CONTACT
        </HandButton>
      </div>
    </>
  );
}

// ---- Shared pieces for the "leave your details" screens --------------------------------
const BADGE_SCAN_MS = 2500; // prototype: the badge "scan" is simulated
const CONFIRM_S = 10; // confirmation screens go back to the topics after this long
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A phone number: at least 7 digits, with the usual spaces, dashes, dots, brackets or a leading +. */
const PHONE_RE = /^\+?[\d\s().-]{7,}$/;
const isPhone = (v: string) => PHONE_RE.test(v) && v.replace(/\D/g, "").length >= 7;

type SendProps = {
  session: Session;
  onChange: (patch: Partial<Session>) => void;
  onSent: (method: LeadMethod, kind: LeadKind) => void;
  onBack: () => void;
};

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <HandButton className={styles.backLink} onClick={onBack}>
      <BackIcon /> BACK TO EXPLORING
    </HandButton>
  );
}

/** The exploded earbud on the left of the team / brochure screens. */
function SideModel({ accent }: { accent: string }) {
  const demo = useContext(DemoContext);
  return (
    <div className={styles.sideModel} aria-hidden="true">
      {demo?.model ? (
        // eslint-disable-next-line @next/next/no-img-element
        <div className={styles.modelPicture}><img src={demo.model.whole} alt="" /></div>
      ) : demo ? (
        <NoModel />
      ) : (
        <Model3D geo={MODEL} accent={accent} explode={1} highlight={[]} />
      )}
    </div>
  );
}

/** "Scan your badge" card: the scan is simulated in this prototype. */
function BadgeCard({ onScanned }: { onScanned: () => void }) {
  const [scanning, setScanning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const scan = () => {
    if (scanning) return;
    setScanning(true);
    timer.current = setTimeout(() => {
      setScanning(false);
      onScanned();
    }, BADGE_SCAN_MS);
  };
  return (
    <button type="button" className={styles.badgeCard} data-dwell={DWELL_BUTTON_MS} data-selected={scanning ? "" : undefined} onClick={scan}>
      <span className={styles.badgeHead}>
        <BadgeIcon />
        <span className={styles.badgeTitle}>SCAN YOUR BADGE</span>
      </span>
      <span className={styles.leadCardBody}>
        {scanning
          ? "Looking for your badge… hold it still in front of the camera."
          : "Hold your conference badge up to the camera. We’ll send it to the email on your badge."}
      </span>
      {scanning && <span className={styles.scanBar} aria-hidden="true" />}
      <span className={styles.dwellBar} aria-hidden="true" />
    </button>
  );
}

/** Name / email / company (and optionally questions) form. */
function DetailsForm(props: {
  session: Session;
  onChange: (patch: Partial<Session>) => void;
  onSubmit: () => void;
  heading?: string;
  questions?: boolean;
  className?: string;
  /** Leave contact info: one "mode of contact" field that takes an email address or a phone number. */
  anyContact?: boolean;
  /** Which request this is, for the "type on your phone" form. */
  kind: "team" | "brochure" | "contact";
}) {
  const s = props.session;
  const [emailError, setEmailError] = useState(false);
  // The field being typed into with the on-screen keyboard (null: keyboard closed).
  const [active, setActive] = useState<"name" | "email" | "company" | "questions" | null>(null);
  const order: ("name" | "email" | "company" | "questions")[] = ["name", "email", "company", ...(props.questions ? (["questions"] as const) : [])];
  const send = () => {
    const v = s.email.trim();
    if (!(EMAIL_RE.test(v) || (props.anyContact && isPhone(v)))) {
      setEmailError(true);
      setActive("email");
      return false;
    }
    setActive(null);
    props.onSubmit();
    return true;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  // Type on your phone: a one-time code for this form; the kiosk checks every 2 s whether the phone has sent details.
  const [code] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("") + Date.now().toString(36));
  const [phoneOk, setPhoneOk] = useState<boolean | null>(null); // null: still checking; false: not set up here
  const submitRef = useRef(props.onSubmit);
  const changeRef = useRef(props.onChange);
  useEffect(() => {
    submitRef.current = props.onSubmit;
    changeRef.current = props.onChange;
  });
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const res = await fetch(`/api/handoff/${code}`, { cache: "no-store" });
        if (res.status === 503) { if (!stop) setPhoneOk(false); return; } // not set up on this deployment
        if (!stop) setPhoneOk(true);
        const json = await res.json();
        if (json.details && !stop) {
          const d = json.details as { name: string; email: string; company: string; questions: string };
          changeRef.current({ name: d.name, email: d.email, company: d.company, questions: d.questions });
          setActive(null);
          setTimeout(() => submitRef.current(), 0); // the session has the details now
          return;
        }
      } catch {
        /* offline: try again */
      }
      if (!stop) timer = setTimeout(check, 2000);
    };
    check();
    return () => { stop = true; clearTimeout(timer); };
  }, [code]);
  // The QR always shows; it only says it can't be used where the site has nowhere to pass the details through.
  const phoneUrl = phoneOk !== false && typeof window !== "undefined" ? `${window.location.origin}/type/${code}?k=${props.kind}` : null;

  const fieldValue = (f: NonNullable<typeof active>) => (f === "name" ? s.name : f === "email" ? s.email : f === "company" ? s.company : s.questions);
  const setField = (f: NonNullable<typeof active>, v: string) => {
    if (f === "email") setEmailError(false);
    props.onChange({ [f]: v } as Partial<Session>);
  };
  const next = () => {
    const i = active ? order.indexOf(active) : -1;
    if (i >= 0 && i < order.length - 1) setActive(order[i + 1]);
    else send();
  };
  const labels = { name: "Your name", email: props.anyContact ? "Mode of contact" : "Your email", company: "Company", questions: "Your questions" };
  // Picking a field (holding a hand over it, a tap or a click) opens the keyboard for it. inputMode "none" keeps a
  // tablet's own keyboard from popping up over ours; a real keyboard still types as usual.
  const pick = (f: NonNullable<typeof active>) => ({
    "data-dwell": DWELL_BUTTON_MS,
    "data-active": active === f ? "" : undefined,
    inputMode: "none" as const,
    onFocus: () => setActive(f),
    onClick: () => setActive(f),
  });

  return (
    <form className={`${styles.formCard} ${props.className ?? ""}`} onSubmit={submit} noValidate>
      {props.heading && <span className={styles.formHeading}>{props.heading}</span>}
      <label htmlFor="lead-name" className={styles.leadCardTitle}>TYPE YOUR NAME</label>
      <input id="lead-name" type="text" placeholder="first name, last name" autoComplete="off" className={styles.input} value={s.name} onChange={(e) => props.onChange({ name: e.target.value })} {...pick("name")} />
      <label htmlFor="lead-email" className={styles.leadCardTitle}>{props.anyContact ? "MODE OF CONTACT" : "TYPE YOUR EMAIL"}</label>
      <input
        id="lead-email"
        type="text"
        placeholder={props.anyContact ? "name@example.com or (XXX-XXX-XXXX)" : "name@example.com"}
        autoComplete="off"
        className={styles.input}
        aria-invalid={emailError || undefined}
        value={s.email}
        onChange={(e) => setField("email", e.target.value)}
        {...pick("email")}
      />
      <label htmlFor="lead-company" className={styles.inputLabel}>COMPANY (OPTIONAL)</label>
      <input id="lead-company" type="text" placeholder="company" autoComplete="off" className={`${styles.input} ${styles.inputSmall}`} value={s.company} onChange={(e) => props.onChange({ company: e.target.value })} {...pick("company")} />
      {props.questions && (
        <>
          <label htmlFor="lead-questions" className={styles.inputLabel}>LET US KNOW IF YOU HAVE ANY SPECIFIC QUESTIONS</label>
          <textarea id="lead-questions" placeholder="Type here" className={`${styles.input} ${styles.textarea}`} value={s.questions} onChange={(e) => props.onChange({ questions: e.target.value })} {...pick("questions")} />
        </>
      )}
      {!active && (
        <button type="button" className={styles.phoneLink} data-dwell={DWELL_BUTTON_MS} onClick={() => setActive("name")}>
          <KeyboardIcon /> TYPE ON YOUR PHONE OR THE SCREEN
          <span className={styles.dwellBar} aria-hidden="true" />
        </button>
      )}
      <button type="submit" className={styles.submitBtn} data-dwell={DWELL_BUTTON_MS}>
        {emailError ? (props.anyContact ? "CHECK THE EMAIL OR PHONE NUMBER" : "CHECK THE EMAIL ADDRESS") : <><SendIcon /> SUBMIT</>}
        <span className={styles.dwellBar} aria-hidden="true" />
      </button>
      {active && (
        <TypingPanel
          key={active}
          kind={active === "email" ? (props.anyContact ? "contact" : "email") : active}
          label={labels[active]}
          value={fieldValue(active)}
          onChange={(v) => setField(active, v)}
          onNext={next}
          onClose={() => setActive(null)}
          name={s.name}
          phoneUrl={phoneUrl}
        />
      )}
    </form>
  );
}

function KeyboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  );
}

/** Confirmation with a ring that counts down, then goes back to the topics. */
function Confirmation(props: { title: string; body: string; onDone: () => void; accent: string; eyebrow: string; note?: string }) {
  const [left, setLeft] = useState(CONFIRM_S);
  const done = useRef(props.onDone);
  useEffect(() => {
    done.current = props.onDone;
  });
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const l = Math.max(0, CONFIRM_S - Math.floor((Date.now() - start) / 1000));
      setLeft(l);
      if (l === 0) {
        clearInterval(id);
        done.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, []);
  const C = 2 * Math.PI * 52;
  return (
    <>
      <div className={styles.eyebrow}>{props.eyebrow}</div>
      <BackLink onBack={props.onDone} />
      <SideModel accent={props.accent} />
      <div className={styles.confirm}>
        <span className={styles.confirmTitle}>{props.title}</span>
        <span className={styles.confirmBody}>{props.body}</span>
        <button type="button" className={styles.countdown} data-dwell={DWELL_BUTTON_MS} onClick={props.onDone} aria-label={`Back to home in ${left} seconds`}>
          <svg width="124" height="124" viewBox="0 0 124 124" aria-hidden="true">
            <circle cx="62" cy="62" r="52" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
            <circle cx="62" cy="62" r="52" fill="none" stroke="#C8D8FF" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / CONFIRM_S)} transform="rotate(-90 62 62)" style={{ transition: "stroke-dashoffset 250ms linear" }} />
          </svg>
          <span className={styles.countdownText}>Back to Home<br />{left} sec</span>
        </button>
        {props.note && <span className={styles.confirmNote}>{props.note}</span>}
      </div>
    </>
  );
}

// ---- Talk to our team now ------------------------------------------------------------
export function Team(props: SendProps & { accent: string }) {
  const productName = useProductName();
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <Confirmation
        eyebrow={named(productName, "ASK OUR TEAM")}
        title="YOUR SPOT IS SAVED"
        body="Feel free to keep looking around. You have been emailed a ticket number and wait time to return."
        onDone={props.onBack}
        accent={props.accent}
      />
    );
  }
  const sent = (method: LeadMethod) => {
    props.onSent(method, "team");
    setDone(true);
  };
  return (
    <>
      <div className={styles.eyebrow}>{named(productName, "ASK OUR TEAM")}</div>
      <BackLink onBack={props.onBack} />
      <SideModel accent={props.accent} />
      <div className={styles.sendColumn}>
        <BadgeCard onScanned={() => sent("badge")} />
        <span className={styles.orText}>OR</span>
        <DetailsForm kind="team" session={props.session} onChange={props.onChange} onSubmit={() => sent("email")} />
      </div>
    </>
  );
}

// ---- Get the digital brochure -------------------------------------------------------
export function Brochure(props: SendProps & { accent: string }) {
  const productName = useProductName();
  const [done, setDone] = useState<LeadMethod | null>(null);
  const [phone, setPhone] = useState(false);
  if (done) {
    const to = done === "email" ? props.session.email : "the email on your badge";
    return (
      <Confirmation
        eyebrow={named(productName, "DIGITAL BROCHURE")}
        title="THE BROCHURE IS ON ITS WAY"
        body={`We’ll send it to ${to}, with the topics you explored.`}
        onDone={props.onBack}
        accent={props.accent}
      />
    );
  }
  const sent = (method: LeadMethod) => {
    props.onSent(method, "brochure");
    setDone(method);
  };
  return (
    <>
      <div className={styles.eyebrow}>{named(productName, "DIGITAL BROCHURE")}</div>
      <BackLink onBack={props.onBack} />
      <button type="button" className={styles.qrCard} data-dwell={DWELL_BUTTON_MS} data-selected={phone ? "" : undefined} onClick={() => { setPhone(true); props.onSent("phone", "brochure"); }}>
        <span className={styles.qr}>[QR]</span>
        <span className={styles.leadCardTitle}>SCAN WITH YOUR PHONE</span>
        <span className={styles.leadCardBody}>
          {phone ? "Point your phone’s camera at the code. It opens right away." : "Opens the brochure on your phone. Nothing to type."}
        </span>
        <span className={styles.dwellBar} aria-hidden="true" />
      </button>
      <div className={styles.sendColumn}>
        <BadgeCard onScanned={() => sent("badge")} />
        <span className={styles.orText}>OR</span>
        <DetailsForm kind="brochure" session={props.session} onChange={props.onChange} onSubmit={() => sent("email")} />
      </div>
    </>
  );
}

// ---- Leave contact info for later -----------------------------------------------------
export function Contact(props: SendProps & { accent: string; onBrochure: () => void }) {
  const productName = useProductName();
  const demo = useContext(DemoContext);
  const [done, setDone] = useState(false);
  const [scanning, setScanning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (done) {
    return (
      <Confirmation
        eyebrow={named(productName, "LEAVE CONTACT INFO")}
        title="THANKS, WE’LL BE IN TOUCH"
        body={`Your details have been sent to the ${productName ? `${titleCase(productName)} team` : "team"}. They’ll be in touch about your inquiry.`}
        note={`Your contact information will be deleted after ${demo?.retentionDays ? `${demo.retentionDays} day${demo.retentionDays === 1 ? "" : "s"}` : demo ? "[X days]" : "30 days"}.`}
        onDone={props.onBack}
        accent={props.accent}
      />
    );
  }
  const sent = (method: LeadMethod) => {
    props.onSent(method, "contact");
    setDone(true);
  };
  const scan = () => {
    if (scanning) return;
    setScanning(true);
    timer.current = setTimeout(() => sent("badge"), BADGE_SCAN_MS);
  };
  return (
    <>
      <div className={styles.eyebrow}>{named(productName, "LEAVE CONTACT INFO")}</div>
      <BackLink onBack={props.onBack} />
      <div className={styles.contactIntro}>
        <span className={styles.contactTitle}>CONNECT WITH OUR TEAM</span>
        <span className={styles.contactBody}>
          {scanning ? "Looking for your badge… hold it still in front of the camera." : "Share your contact information, and a team member will follow up with you. Simply scan your badge or enter your information."}
        </span>
        <div className={styles.contactButtons}>
          <HandButton className={styles.pillBtn} onClick={scan}>
            <BadgeIcon size={20} />
            {scanning ? "SCANNING…" : "SCAN YOUR BADGE"}
          </HandButton>
          <HandButton className={styles.pillBtn} onClick={props.onBrochure}>
            <DownloadIcon />
            GET DIGITAL BROCHURE
          </HandButton>
        </div>
      </div>
      <DetailsForm
        kind="contact"
        session={props.session}
        onChange={props.onChange}
        onSubmit={() => sent("email")}
        heading="NO BADGE? TYPE IT IN"
        anyContact
        questions
        className={styles.contactForm}
      />
    </>
  );
}
