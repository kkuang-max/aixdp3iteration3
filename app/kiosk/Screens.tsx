"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MODEL, PRODUCT, TOPICS, type PartId } from "@/lib/product";
import { type LeadKind, type LeadMethod, type Session } from "@/lib/session";
import type { PublishedDemo } from "@/lib/published";
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
const useProductName = () => useContext(DemoContext)?.productName.toUpperCase() || PRODUCT.name;

/** The product in the middle of the hub: the uploaded model's picture for this topic, or the sample earbud in 3D. */
function ProductModel(props: { topicId: string; explode: number; highlight: readonly PartId[]; accent: string }) {
  const demo = useContext(DemoContext);
  const file = useContext(ModelFileContext);
  const [failed, setFailed] = useState<ArrayBuffer | null>(null); // the file the live view couldn't show
  if (demo?.model) {
    const mapping = demo.mappings.find((m) => m.sectionId === props.topicId);
    const part = mapping?.part;
    if (file && failed !== file.data) {
      return (
        <>
          <div className={styles.modelShadow} />
          <div className={styles.modelPicture}>
            <LiveModel name={file.name} data={file.data} part={part ?? null} mode={mapping?.mode ?? "Highlight"} accent={props.accent} onFail={() => setFailed(file.data)} />
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
  return <Model3D geo={MODEL} accent={props.accent} explode={props.explode} highlight={props.highlight} />;
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

// ---- Topic hub ---------------------------------------------------------------
export function Hub(props: {
  topic: number;
  onPick: (i: number) => void;
  hoverPart: PartId | null;
  explode: number;
  accent: string;
  guide: { title: string; sub: string; tip: boolean };
  attract: boolean;
  onTeam: () => void;
  onBrochure: () => void;
  onContact: () => void;
}) {
  const demo = useContext(DemoContext);
  const productName = useProductName();
  const base = TOPICS[props.topic];
  const published = demo?.sections.find((x) => x.id === base.id);
  const t = published ? { ...base, title: published.title, rows: published.rows.map((r) => ({ a: r.a, b: r.b, part: undefined as PartId | undefined })) } : base;
  const { hoverPart } = props;
  const highlight = useMemo(() => (hoverPart ? [hoverPart] : base.highlight), [hoverPart, base]);
  return (
    <>
      <div className={styles.eyebrow}>
        {productName} / {PRODUCT.brand} · {PRODUCT.booth}
      </div>
      <HandButton className={styles.teamLink} onClick={props.onTeam}>
        <TeamIcon />
        TALK TO OUR TEAM
      </HandButton>

      <nav className={styles.topics} aria-label="Topics">
        <span className={styles.topicsLabel}>WHAT DO YOU WANT TO KNOW?</span>
        {TOPICS.map((tp, i) => {
          const on = i === props.topic;
          return (
            <button
              key={tp.id}
              type="button"
              className={styles.topic}
              data-dwell={DWELL_TOPIC_MS}
              data-dwell-mouse=""
              data-current={on ? "" : undefined}
              aria-current={on ? "true" : undefined}
              onClick={() => props.onPick(i)}
            >
              <span className={styles.topicNum}>
                <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
                  <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
                  <circle cx="20" cy="20" r="18" fill="none" stroke={props.accent} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="113" className={styles.dwellRing} />
                </svg>
                {tp.n}
              </span>
              <span className={styles.topicLabel}>{tp.label}</span>
            </button>
          );
        })}
      </nav>

      <ProductModel topicId={t.id} accent={props.accent} explode={props.explode} highlight={highlight} />

      <section key={t.id} className={styles.panel} aria-live="polite">
        <span className={styles.panelKicker}>
          {t.n} · {t.label}
        </span>
        <h1 className={styles.panelTitle}>{t.title}</h1>
        <div className={styles.rows}>
          {t.rows.map((r) => (
            <div
              key={r.a}
              className={styles.row}
              data-part={r.part}
              style={r.part && r.part === props.hoverPart ? { color: props.accent } : undefined}
            >
              <span className={styles.rowA}>{r.a}</span>
              {r.b && <span className={styles.rowB}>{r.b}</span>}
            </div>
          ))}
        </div>
      </section>

      <div className={styles.guide}>
        <span key={props.guide.title} className={styles.guideTitle}>
          {props.guide.title}
        </span>
        <span className={styles.guideSub} style={props.guide.tip ? { color: props.accent } : undefined}>
          {props.guide.sub}
        </span>
        {props.attract && (
          <span className={styles.attractDots} aria-hidden="true">
            {TOPICS.map((tp, i) => (
              <span key={tp.id} data-on={i === props.topic ? "" : undefined} />
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
}) {
  const s = props.session;
  const [emailError, setEmailError] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(s.email.trim())) {
      setEmailError(true);
      return;
    }
    props.onSubmit();
  };
  return (
    <form className={`${styles.formCard} ${props.className ?? ""}`} onSubmit={submit} noValidate>
      {props.heading && <span className={styles.formHeading}>{props.heading}</span>}
      <label htmlFor="lead-name" className={styles.leadCardTitle}>TYPE YOUR NAME</label>
      <input id="lead-name" type="text" placeholder="[Your name]" autoComplete="off" className={styles.input} value={s.name} onChange={(e) => props.onChange({ name: e.target.value })} />
      <label htmlFor="lead-email" className={styles.leadCardTitle}>TYPE YOUR EMAIL</label>
      <input
        id="lead-email"
        type="email"
        placeholder="you@company.com"
        autoComplete="off"
        className={styles.input}
        aria-invalid={emailError || undefined}
        value={s.email}
        onChange={(e) => {
          setEmailError(false);
          props.onChange({ email: e.target.value });
        }}
      />
      <label htmlFor="lead-company" className={styles.inputLabel}>COMPANY (OPTIONAL)</label>
      <input id="lead-company" type="text" placeholder="[Company]" autoComplete="off" className={`${styles.input} ${styles.inputSmall}`} value={s.company} onChange={(e) => props.onChange({ company: e.target.value })} />
      {props.questions && (
        <>
          <label htmlFor="lead-questions" className={styles.inputLabel}>LET US KNOW IF YOU HAVE ANY SPECIFIC QUESTIONS</label>
          <textarea id="lead-questions" placeholder="Type here" className={`${styles.input} ${styles.textarea}`} value={s.questions} onChange={(e) => props.onChange({ questions: e.target.value })} />
        </>
      )}
      <button type="submit" className={styles.submitBtn}>
        {emailError ? "CHECK THE EMAIL ADDRESS" : <><SendIcon /> SUBMIT</>}
      </button>
    </form>
  );
}

/** Confirmation with a ring that counts down, then goes back to the topics. */
function Confirmation(props: { title: string; body: string; onDone: () => void; accent: string; eyebrow: string }) {
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
        eyebrow={`${productName} / ASK OUR TEAM`}
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
      <div className={styles.eyebrow}>{productName} / ASK OUR TEAM</div>
      <BackLink onBack={props.onBack} />
      <SideModel accent={props.accent} />
      <div className={styles.sendColumn}>
        <BadgeCard onScanned={() => sent("badge")} />
        <span className={styles.orText}>OR</span>
        <DetailsForm session={props.session} onChange={props.onChange} onSubmit={() => sent("email")} />
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
        eyebrow={`${productName} / DIGITAL BROCHURE`}
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
      <div className={styles.eyebrow}>{productName} / DIGITAL BROCHURE</div>
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
        <DetailsForm session={props.session} onChange={props.onChange} onSubmit={() => sent("email")} />
      </div>
    </>
  );
}

// ---- Leave contact info for later -----------------------------------------------------
export function Contact(props: SendProps & { accent: string; onBrochure: () => void }) {
  const productName = useProductName();
  const [done, setDone] = useState(false);
  const [scanning, setScanning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (done) {
    return (
      <Confirmation
        eyebrow={`${productName} / LEAVE CONTACT INFO`}
        title="THANKS, WE’LL BE IN TOUCH"
        body="Someone from our team will reach out to you soon."
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
      <div className={styles.eyebrow}>{productName} / LEAVE CONTACT INFO</div>
      <BackLink onBack={props.onBack} />
      <div className={styles.contactIntro}>
        <span className={styles.contactTitle}>LET US CONTACT YOU</span>
        <span className={styles.contactBody}>
          {scanning ? "Looking for your badge… hold it still in front of the camera." : "Scan your badge or enter your contact info so we can reach out to you."}
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
        session={props.session}
        onChange={props.onChange}
        onSubmit={() => sent("email")}
        heading="NO BADGE? TYPE IT IN"
        questions
        className={styles.contactForm}
      />
    </>
  );
}
