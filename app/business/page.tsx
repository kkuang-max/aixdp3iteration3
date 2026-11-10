"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MODEL, TOPICS, type PartId } from "@/lib/product";
import styles from "./business.module.css";

// Business portal: exhibitors set up their kiosk demo. Two ways in:
//  - Auto (default): upload a product doc + 3D model, review the sections, edit any of them.
//  - Manual: go section by section, uploading a pdf or pasting notes for each.
// Both end on the gesture mapping screens. Everything is drawn on a 1280×720 artboard that is
// scaled to fit the window, so it looks the same on any screen size or resolution.

type Row = { a: string; b: string };
type Section = { id: string; label: string; title: string; rows: Row[] };
type Mapping = { gesture: string; sectionId: string; part: string; mode: string };
type Mode = "auto" | "manual";
type BusinessConfig = {
  productName: string;
  documentName: string;
  modelName: string;
  sections: Section[];
  mappings: Mapping[];
  notes: Record<string, string>; // manual: what was pasted per section
  sectionFiles: Record<string, string>; // manual: pdf chosen per section
};
type Screen =
  | { name: "a-upload" }
  | { name: "a-review" }
  | { name: "a-edit"; id: string }
  | { name: "m-model" }
  | { name: "m-section"; index: number }
  | { name: "i-list" }
  | { name: "i-model" };

const STAGE_W = 1280;
const STAGE_H = 720;
const STORAGE_KEY = "playform.business.draft.v1";

const sampleSection = (id: string): Section => {
  const t = TOPICS.find((topic) => topic.id === id) ?? TOPICS[0];
  return { id: t.id, label: t.short, title: t.title, rows: t.rows.map(({ a, b }) => ({ a, b })) };
};
const DEMO_SECTIONS: Section[] = TOPICS.map((t) => sampleSection(t.id));
const START_MAPPINGS: Mapping[] = [
  { gesture: "1 swipe right", sectionId: "what", part: "Whole product", mode: "Slow turn" },
  { gesture: "2 swipes right", sectionId: "how", part: "Driver", mode: "Explode apart" },
  { gesture: "3 swipes right", sectionId: "different", part: "Microphones", mode: "Highlight" },
  { gesture: "Swipe up", sectionId: "specs", part: "Battery", mode: "Highlight" },
  { gesture: "Swipe left", sectionId: "what", part: "Whole product", mode: "Put back together" },
];
const GESTURES = ["1 swipe right", "2 swipes right", "3 swipes right", "4 swipes right", "Swipe up", "Swipe down", "Swipe left", "Point / hover"];
const PARTS = ["Whole product", "Ear tip", "Driver", "Battery", "Chip board", "Microphones", "Charging case", "None"];
const MODES = ["Slow turn", "Explode apart", "Highlight", "Zoom in", "Put back together"];
const PART_LABELS: Record<PartId, string> = { shell: "Whole product", tip: "Ear tip", driver: "Driver", battery: "Battery", board: "Chip board", mic: "Microphones" };

// Sample-only details shown in the auto flow (the prototype doesn't read the uploaded files yet).
const AUTO_META: Record<string, { source: string; quote: string; format: string; kioskShows: string }> = {
  what: { source: "PRD p. 1", quote: "Orbit is a true-wireless earbud with adaptive noise cancelling…", format: "1-sentence headline + 3 one-line points", kioskShows: "Kiosk shows a headline and 3 points" },
  how: { source: "PRD p. 3–4", quote: "Each earbud has six main parts: ear tip, driver, battery…", format: "headline + 1 row per model part · name + 1 line", kioskShows: "Kiosk shows 1 row per part" },
  different: { source: "PRD p. 2", quote: "Unlike fixed-level ANC, Orbit adjusts to the room in real time…", format: "headline + 3 points · title + 1 line", kioskShows: "Kiosk shows 3 points" },
  uses: { source: "PRD p. 1", quote: "Target users are daily commuters who want to block out transit noise…", format: "headline + 3–5 scenes · name + 1 line", kioskShows: "Kiosk shows 3–5 scenes" },
  specs: { source: "PRD p. 6", quote: "Battery: [X] h per charge, [X] h with case. Bluetooth [5.x]…", format: "headline + up to 5 rows · label + value", kioskShows: "Kiosk shows up to 5 rows" },
};
const PROMPTS: Record<string, string> = {
  what: "Describe what your product is",
  how: "Explain how your product works, in any order",
  different: "What sets it apart from what's out there?",
  uses: "Who uses it, and where?",
  specs: "Add your spec sheet or key numbers",
};

const defaultConfig: BusinessConfig = {
  productName: "Orbit Earbuds",
  documentName: "",
  modelName: "",
  sections: DEMO_SECTIONS,
  mappings: START_MAPPINGS,
  notes: {},
  sectionFiles: {},
};

// ---- Icons -------------------------------------------------------------------
const Check = ({ size = 18, color = "#1B2036" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);
const Arrow = ({ dir = "right", size = 14, color = "currentColor" }: { dir?: "right" | "left" | "up" | "down"; size?: number; color?: string }) => {
  const d = { right: "M5 12h14M13 6l6 6-6 6", left: "M19 12H5M11 6l-6 6 6 6", up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6" }[dir];
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
};
const UploadIcon = ({ w = 26, h = 32, sw = 1.6 }: { w?: number; h?: number; sw?: number }) => (
  <svg width={w} height={h} viewBox="0 0 24 30" fill="none" stroke="#8E94A8" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v12A1.5 1.5 0 0 0 5.5 26h13a1.5 1.5 0 0 0 1.5-1.5v-12a1.5 1.5 0 0 0-1.5-1.5H17M12 19V3M8 7l4-4 4 4" /></svg>
);
const Chevron = () => (
  <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
);
function GestureIcon({ gesture }: { gesture: string }) {
  const g = gesture.toLowerCase();
  if (g.includes("up")) return <Arrow dir="up" size={16} color="#C8D8FF" />;
  if (g.includes("down")) return <Arrow dir="down" size={16} color="#C8D8FF" />;
  if (g.includes("left")) return <Arrow dir="left" size={16} color="#C8D8FF" />;
  if (g.includes("point")) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8D8FF" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /></svg>;
  const n = Math.max(1, Math.min(4, parseInt(g, 10) || 1));
  return <span className={styles.gestureArrows}>{Array.from({ length: n }, (_, i) => <Arrow key={i} dir="right" size={16} color="#C8D8FF" />)}</span>;
}

// ---- Small building blocks ---------------------------------------------------------
function Stepper({ total, current, onJump, wide }: { total: number; current: number; onJump: (i: number) => void; wide?: boolean }) {
  return (
    <div className={wide ? `${styles.stepper} ${styles.stepperWide}` : styles.stepper} aria-label="Setup progress">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={styles.stepItem}>
          {i > 0 && <span className={styles.stepLine} data-done={i <= current ? "" : undefined} />}
          <button type="button" className={styles.stepDot} data-state={i < current ? "done" : i === current ? "current" : "todo"} onClick={() => onJump(i)} aria-label={`Go to step ${i + 1}`} aria-current={i === current ? "step" : undefined}>
            {i < current && <Check size={wide ? 16 : 18} />}
          </button>
        </span>
      ))}
    </div>
  );
}

function Select({ value, options, onChange, label, className }: { value: string; options: { value: string; label: string }[] | string[]; onChange: (v: string) => void; label: string; className?: string }) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <span className={`${styles.select} ${className ?? ""}`}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Chevron />
    </span>
  );
}

function FileButton({ accept, onFile, children, className }: { accept: string; onFile: (files: FileList | null) => void; children: ReactNode; className: string }) {
  return (
    <label className={className}>
      {children}
      <input type="file" accept={accept} className={styles.hiddenInput} onChange={(e) => { onFile(e.target.files); e.target.value = ""; }} />
    </label>
  );
}

function Foot({ back, next }: { back?: { label: string; onClick: () => void }; next?: ReactNode }) {
  return (
    <>
      {back && <button type="button" className={styles.backLink} onClick={back.onClick}><Arrow dir="left" size={13} /> {back.label}</button>}
      {next && <div className={styles.footRight}>{next}</div>}
    </>
  );
}

// ---- Page --------------------------------------------------------------------------
export default function BusinessPage() {
  const [config, setConfig] = useState<BusinessConfig>(defaultConfig);
  const [mode, setMode] = useState<Mode>("auto");
  const [screen, setScreen] = useState<Screen>({ name: "a-upload" });
  const [activeMapping, setActiveMapping] = useState(1);
  const [editingPreview, setEditingPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [scale, setScale] = useState(1);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<BusinessConfig>;
        if (saved && Array.isArray(saved.sections) && Array.isArray(saved.mappings)) setConfig({ ...defaultConfig, ...saved });
      }
    } catch { /* start fresh when storage is unavailable */ }
  }, []);

  // Fit the 1280×720 artboard to any window.
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(id);
  }, [notice]);

  const save = (next: BusinessConfig) => {
    setConfig(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { setNotice("Storage unavailable. Changes last until you refresh."); }
  };
  const updateSection = (id: string, fn: (s: Section) => Section) => save({ ...config, sections: config.sections.map((s) => (s.id === id ? fn(s) : s)) });
  const updateMapping = (i: number, patch: Partial<Mapping>) => save({ ...config, mappings: config.mappings.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const sectionLabel = (id: string) => config.sections.find((s) => s.id === id)?.label ?? id;

  const pickFile = (files: FileList | null, allowed: RegExp, apply: (name: string) => void) => {
    const file = files?.[0];
    if (!file) return;
    if (!allowed.test(file.name)) { setNotice("Unsupported file type. Choose one of the listed formats."); return; }
    apply(file.name); // only the file name is kept: files are not uploaded or analysed in this prototype
  };
  const DOC = /\.(pdf|docx?)$/i;
  const MODEL_FILE = /\.(fbx|obj|stl|step|stp|gltf|glb)$/i;

  const switchMode = (m: Mode) => {
    setMode(m);
    setEditingPreview(false);
    setScreen(m === "auto" ? { name: "a-upload" } : { name: "m-model" });
  };
  const go = (s: Screen) => { setEditingPreview(false); setScreen(s); };
  const finish = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "playform-product-config.json";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Draft saved and configuration downloaded. The kiosk doesn't read it yet.");
  };

  // Progress steps for the current flow.
  const autoStep = screen.name === "a-upload" ? 0 : screen.name === "a-review" || screen.name === "a-edit" ? 1 : 2;
  const manualStep = screen.name === "m-model" ? 0 : screen.name === "m-section" ? screen.index + 1 : 6;
  const jumpAuto = (i: number) => go(i === 0 ? { name: "a-upload" } : i === 1 ? { name: "a-review" } : { name: "i-list" });
  const jumpManual = (i: number) => go(i === 0 ? { name: "m-model" } : i === 6 ? { name: "i-list" } : { name: "m-section", index: i - 1 });
  const stepper = mode === "auto"
    ? <Stepper total={3} current={autoStep} onJump={jumpAuto} wide />
    : <Stepper total={7} current={manualStep} onJump={jumpManual} />;
  const backFromGestures = () => go(mode === "auto" ? { name: "a-review" } : { name: "m-section", index: 4 });

  const uploadedList = (extra: string[]) => {
    const files = [config.modelName || "orbit_earbuds.obj", ...extra];
    return (
      <div className={styles.uploaded}>
        <div className={styles.uploadedHead}>UPLOADED</div>
        <div className={styles.uploadedFiles}>
          {files.map((f, i) => <span key={f + i} className={styles.uploadedFile}><span className={styles.numCircle}>{i + 1}</span>{f}</span>)}
        </div>
      </div>
    );
  };

  // ---- Screens ----------------------------------------------------------------
  let body: ReactNode = null;

  if (screen.name === "a-upload") {
    body = (
      <>
        <div className={styles.guide}><h1>QUICK SETUP</h1><p>Upload two files. AI builds every section, and you can edit any of it after.</p></div>
        <div className={styles.stepperAt}>{stepper}</div>
        <div className={styles.autoUploads}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>1 · PRODUCT DOC</h2>
            {config.documentName ? (
              <div className={styles.dropDone}>
                <span className={styles.bigCheck}><Check size={26} /></span>
                <span className={styles.fileName}>{config.documentName}</span>
                <FileButton accept=".pdf,.doc,.docx" className={styles.replace} onFile={(f) => pickFile(f, DOC, (n) => save({ ...config, documentName: n }))}>Replace</FileButton>
              </div>
            ) : (
              <FileButton accept=".pdf,.doc,.docx" className={styles.drop} onFile={(f) => pickFile(f, DOC, (n) => save({ ...config, documentName: n }))}>
                <UploadIcon w={56} h={70} sw={1.5} /><b>UPLOAD</b><span>pdf, doc or docx</span>
              </FileButton>
            )}
            <p className={styles.cardFoot}>PRD, one-pager or spec sheet · pdf, docx</p>
          </div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>2 · 3D MODEL</h2>
            {config.modelName ? (
              <div className={styles.dropDone}>
                <span className={styles.bigCheck}><Check size={26} /></span>
                <span className={styles.fileName}>{config.modelName}</span>
                <FileButton accept=".fbx,.obj,.stl,.step,.stp,.gltf,.glb" className={styles.replace} onFile={(f) => pickFile(f, MODEL_FILE, (n) => save({ ...config, modelName: n }))}>Replace</FileButton>
              </div>
            ) : (
              <FileButton accept=".fbx,.obj,.stl,.step,.stp,.gltf,.glb" className={styles.drop} onFile={(f) => pickFile(f, MODEL_FILE, (n) => save({ ...config, modelName: n }))}>
                <UploadIcon w={56} h={70} sw={1.5} /><b>UPLOAD</b><span>fbx, obj, stl, step, or gltf/glb</span>
              </FileButton>
            )}
            <p className={styles.cardFoot}>AI finds the parts and links them to your text</p>
          </div>
        </div>
        <p className={styles.manualHint}>Rather write it yourself? <button type="button" className={styles.textLink} onClick={() => switchMode("manual")}>Use manual setup</button></p>
        <button type="button" className={styles.primaryBtn} onClick={() => go({ name: "a-review" })}>BUILD MY DEMO <Arrow /></button>
      </>
    );
  }

  if (screen.name === "a-review") {
    const cards = [
      ...config.sections.map((s) => ({
        key: s.id, label: s.label.toUpperCase(), title: s.title,
        body: s.rows.map((r) => r.a).join(" · "),
        source: `From ${AUTO_META[s.id]?.source ?? "PRD"}`,
        look: s.rows.length < 3 || s.rows.some((r) => !r.a.trim()),
        onEdit: () => go({ name: "a-edit", id: s.id }),
      })),
      {
        key: "interactions", label: "INTERACTIONS", title: `${config.mappings.length} gestures mapped`,
        body: "Swipe right steps through the parts. Swipe left goes back.", source: "From 3D model",
        look: config.mappings.length === 0, onEdit: () => go({ name: "i-list" }),
      },
    ];
    const needLook = cards.filter((c) => c.look).length;
    body = (
      <>
        <div className={styles.guide}><h1>REVIEW YOUR DEMO</h1><p>Sample sections for {config.documentName || "your product doc"}. Open any section to edit it.</p></div>
        <div className={styles.stepperAt}>{stepper}</div>
        <div className={styles.reviewGrid}>
          {cards.map((c) => (
            <div key={c.key} className={styles.reviewCard} data-look={c.look ? "" : undefined}>
              <div className={styles.reviewHead}><b>{c.label}</b><span className={c.look ? styles.badgeLook : styles.badgeReady}>{c.look ? "Needs a look" : "Ready"}</span></div>
              <div className={styles.reviewTitle}>{c.title}</div>
              <div className={styles.reviewBody}>{c.body}</div>
              <div className={styles.reviewFoot}><span>{c.source}</span><button type="button" className={styles.smallPill} onClick={c.onEdit}>EDIT</button></div>
            </div>
          ))}
        </div>
        <Foot back={{ label: "BACK", onClick: () => go({ name: "a-upload" }) }} next={<>
          {needLook > 0 && <span className={styles.lookNote}>{needLook} section{needLook > 1 ? "s" : ""} need a look</span>}
          <button type="button" className={styles.outlineBtn} onClick={() => go({ name: "i-list" })}>CHECK GESTURES <Arrow /></button>
        </>} />
        <p className={styles.protoNote}>PROTOTYPE · sample content, not yet generated from your files</p>
      </>
    );
  }

  if (screen.name === "a-edit") {
    const s = config.sections.find((x) => x.id === screen.id) ?? config.sections[0];
    const meta = AUTO_META[s.id];
    body = (
      <>
        <nav className={styles.sideNav} aria-label="Sections">
          {config.sections.map((x) => (
            <button key={x.id} type="button" className={styles.sideItem} aria-current={x.id === s.id ? "page" : undefined} onClick={() => go({ name: "a-edit", id: x.id })}>
              {x.label}{x.rows.length < 3 && <span className={styles.lookDot} />}
            </button>
          ))}
          <button type="button" className={styles.sideItem} onClick={() => go({ name: "i-list" })}>Interactions</button>
        </nav>
        <div className={styles.guide} style={{ left: 308 }}><h1>{s.label.toUpperCase()}</h1><p>{meta?.kioskShows ?? "Edit what the kiosk shows"}</p></div>
        <div className={`${styles.card} ${styles.editCard}`}>
          <label className={styles.fieldLabel} htmlFor="headline">HEADLINE</label>
          <input id="headline" className={styles.field} value={s.title} onChange={(e) => updateSection(s.id, (x) => ({ ...x, title: e.target.value }))} />
          <div className={styles.fieldLabel}>ROWS</div>
          <div className={styles.editRows}>
            {s.rows.map((r, i) => (
              <div key={i} className={styles.editRow}>
                <input className={`${styles.field} ${styles.fieldBold}`} aria-label={`Row ${i + 1} name`} value={r.a} onChange={(e) => updateSection(s.id, (x) => ({ ...x, rows: x.rows.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)) }))} />
                <input className={styles.field} aria-label={`Row ${i + 1} line`} placeholder="One line" value={r.b} onChange={(e) => updateSection(s.id, (x) => ({ ...x, rows: x.rows.map((y, j) => (j === i ? { ...y, b: e.target.value } : y)) }))} />
                <button type="button" className={styles.remove} aria-label={`Remove row ${i + 1}`} onClick={() => updateSection(s.id, (x) => ({ ...x, rows: x.rows.filter((_, j) => j !== i) }))}>×</button>
              </div>
            ))}
          </div>
          <div className={styles.editButtons}>
            <button type="button" className={styles.dashedBtn} onClick={() => updateSection(s.id, (x) => ({ ...x, rows: [...x.rows, { a: "", b: "" }] }))}>+ ADD ROW</button>
            <button type="button" className={styles.outlineSmall} onClick={() => { updateSection(s.id, () => sampleSection(s.id)); setNotice("Restored the sample content for this section."); }}>REGENERATE</button>
          </div>
        </div>
        <div className={`${styles.card} ${styles.quoteCard}`}>
          <div className={styles.kicker}>FROM YOUR PRD · {meta?.source.replace("PRD ", "").toUpperCase()}</div>
          <blockquote className={styles.quote}>“{meta?.quote}”</blockquote>
          <span className={styles.mutedSmall}>Sample excerpt</span>
        </div>
        <div className={`${styles.card} ${styles.kioskCard}`}>
          <div className={styles.kicker} style={{ color: "#c8d8ff" }}>ON THE KIOSK</div>
          <KioskPreview section={s} small />
        </div>
        <Foot back={{ label: "ALL SECTIONS", onClick: () => go({ name: "a-review" }) }} next={
          <button type="button" className={styles.outlineBtn} onClick={() => { setNotice("Section saved."); go({ name: "a-review" }); }}>SAVE SECTION</button>
        } />
      </>
    );
  }

  if (screen.name === "m-model") {
    body = (
      <>
        <div className={styles.guide}><h1>UPLOAD</h1><p>Upload a 3D rendering or model of your product</p></div>
        <div className={styles.manualLeft}>
          <FileButton accept=".fbx,.obj,.stl,.step,.stp,.gltf,.glb" className={`${styles.drop} ${styles.dropTall}`} onFile={(f) => pickFile(f, MODEL_FILE, (n) => save({ ...config, modelName: n }))}>
            <UploadIcon w={104} h={132} sw={1.4} />
            <b>{config.modelName ? "REPLACE" : "UPLOAD"}</b>
            <span>{config.modelName || "fbx, obj, stl, step, or gltf/glb"}</span>
          </FileButton>
        </div>
        <div className={styles.manualRight}>
          {stepper}
          {uploadedList([])}
          <div className={`${styles.card} ${styles.partsCard}`}>
            <div className={styles.partsHead}><span className={styles.kicker} style={{ color: "#c8d8ff" }}>AI FOUND THESE PARTS</span><span className={styles.mutedSmall}>Sample parts · Orbit Earbuds</span></div>
            <div className={styles.partsPreview}><PartDiagram selected={null} onPick={() => {}} /></div>
            <div className={styles.chips}>{MODEL.parts.map((p) => <span key={p.id} className={styles.chip}>{p.id === "shell" ? "Shell" : PART_LABELS[p.id]}</span>)}</div>
          </div>
        </div>
        <Foot next={<button type="button" className={styles.outlineBtn} onClick={() => go({ name: "m-section", index: 0 })}>NEXT <Arrow /></button>} />
      </>
    );
  }

  if (screen.name === "m-section") {
    const s = config.sections[screen.index];
    const meta = AUTO_META[s.id];
    const files = config.sections.slice(0, screen.index + 1).map((x) => config.sectionFiles[x.id]).filter(Boolean) as string[];
    body = (
      <>
        <div className={styles.guide}><h1>{s.label.toUpperCase()}</h1><p>{PROMPTS[s.id] ?? "Describe this part of your product"}</p></div>
        <div className={styles.manualLeft}>
          <div className={`${styles.card} ${styles.uploadStrip}`}>
            <FileButton accept=".pdf,.doc,.docx" className={styles.dropWide} onFile={(f) => pickFile(f, DOC, (n) => save({ ...config, sectionFiles: { ...config.sectionFiles, [s.id]: n } }))}>
              <UploadIcon /><b>UPLOAD</b><span>{config.sectionFiles[s.id] || "pdf"}</span>
            </FileButton>
          </div>
          <div className={styles.or}>OR</div>
          <div className={`${styles.card} ${styles.pasteCard}`}>
            <label className={styles.cardTitle} htmlFor="paste">PASTE HERE</label>
            <textarea id="paste" className={styles.textarea} placeholder="Type here" value={config.notes[s.id] ?? ""} onChange={(e) => save({ ...config, notes: { ...config.notes, [s.id]: e.target.value } })} />
          </div>
        </div>
        <div className={styles.manualRight}>
          {stepper}
          {uploadedList(files)}
          <div className={`${styles.card} ${styles.previewCard}`}>
            <div className={styles.previewHead}>
              <span className={styles.kicker} style={{ color: "#c8d8ff", fontWeight: 600 }}>AI PREVIEW · KIOSK PANEL</span>
              <span className={styles.previewBtns}>
                <button type="button" className={styles.smallPill} onClick={() => { updateSection(s.id, () => sampleSection(s.id)); setNotice("Restored the sample content for this section."); }}>REGENERATE</button>
                <button type="button" className={styles.smallPill} aria-pressed={editingPreview} onClick={() => setEditingPreview((v) => !v)}>{editingPreview ? "DONE" : "EDIT"}</button>
              </span>
            </div>
            <div className={styles.previewBox}>
              {editingPreview ? (
                <div className={styles.previewEdit}>
                  <input className={styles.field} aria-label="Headline" value={s.title} onChange={(e) => updateSection(s.id, (x) => ({ ...x, title: e.target.value }))} />
                  {s.rows.map((r, i) => (
                    <div key={i} className={styles.previewEditRow}>
                      <input className={styles.field} aria-label={`Row ${i + 1} name`} value={r.a} onChange={(e) => updateSection(s.id, (x) => ({ ...x, rows: x.rows.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)) }))} />
                      <input className={styles.field} aria-label={`Row ${i + 1} line`} value={r.b} placeholder="One line" onChange={(e) => updateSection(s.id, (x) => ({ ...x, rows: x.rows.map((y, j) => (j === i ? { ...y, b: e.target.value } : y)) }))} />
                    </div>
                  ))}
                  <button type="button" className={styles.dashedBtn} onClick={() => updateSection(s.id, (x) => ({ ...x, rows: [...x.rows, { a: "", b: "" }] }))}>+ ADD ROW</button>
                </div>
              ) : (
                <KioskPreview section={{ ...s, label: `${String(screen.index + 1).padStart(2, "0")} · ${s.label}` }} />
              )}
            </div>
            <div className={styles.mutedSmall}>Format: {meta?.format}</div>
          </div>
        </div>
        <Foot
          back={{ label: "BACK", onClick: () => go(screen.index === 0 ? { name: "m-model" } : { name: "m-section", index: screen.index - 1 }) }}
          next={<button type="button" className={styles.outlineBtn} onClick={() => go(screen.index >= config.sections.length - 1 ? { name: "i-list" } : { name: "m-section", index: screen.index + 1 })}>NEXT <Arrow /></button>}
        />
      </>
    );
  }

  if (screen.name === "i-list") {
    body = (
      <>
        <div className={styles.guide}><h1>INTERACTIONS</h1><p>Choose what each hand gesture shows</p></div>
        <div className={styles.stepperAt}>{stepper}</div>
        <div className={styles.listTools}>
          <button type="button" className={styles.outlineSmall} onClick={() => go({ name: "i-model" })}>MODEL VIEW</button>
          <button type="button" className={styles.dashedBtn} onClick={() => { save({ ...config, mappings: [...config.mappings, { gesture: "4 swipes right", sectionId: "how", part: "None", mode: "Highlight" }] }); setActiveMapping(config.mappings.length); }}>+ ADD INTERACTION</button>
        </div>
        <div className={`${styles.card} ${styles.gestureCard}`}>
          <div className={styles.gestureHead}><span>GESTURE</span><span>SHOWS THIS TEXT</span><span>HIGHLIGHTS THIS PART</span><span>MODEL DOES</span><span /></div>
          <div className={styles.gestureRows}>
            {config.mappings.map((m, i) => (
              <div key={i} className={styles.gestureRow}>
                <span className={styles.gestureName}><GestureIcon gesture={m.gesture} /><Select className={styles.gestureSelect} label={`Gesture ${i + 1}`} value={m.gesture} options={GESTURES.includes(m.gesture) ? GESTURES : [m.gesture, ...GESTURES]} onChange={(v) => updateMapping(i, { gesture: v })} /></span>
                <Select label={`Text for ${m.gesture}`} value={m.sectionId} options={config.sections.map((s) => ({ value: s.id, label: `${s.label} · ${s.title}` }))} onChange={(v) => updateMapping(i, { sectionId: v })} />
                <Select label={`Part for ${m.gesture}`} value={m.part} options={PARTS} onChange={(v) => updateMapping(i, { part: v })} />
                <Select label={`Model action for ${m.gesture}`} value={m.mode} options={MODES} onChange={(v) => updateMapping(i, { mode: v })} />
                <button type="button" className={styles.remove} aria-label={`Remove ${m.gesture}`} onClick={() => save({ ...config, mappings: config.mappings.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            {config.mappings.length === 0 && <p className={styles.mutedSmall}>No interactions yet. Add one above.</p>}
          </div>
          <p className={styles.gestureNote}>Open palm (hold) always resets the demo</p>
        </div>
        <Foot back={{ label: "BACK", onClick: backFromGestures }} next={<>
          <a className={styles.outlineBtnDim} href="/" target="_blank" rel="noopener noreferrer">TRY IT</a>
          <button type="button" className={styles.outlineBtn} onClick={finish}>FINISH <Arrow /></button>
        </>} />
      </>
    );
  }

  if (screen.name === "i-model") {
    const idx = Math.min(activeMapping, config.mappings.length - 1);
    const active = config.mappings[idx];
    const assign = (part: string) => {
      if (idx < 0) return;
      updateMapping(idx, { part });
      setNotice(`${part} linked to “${active.gesture}”.`);
    };
    const firstLine = active ? config.sections.find((s) => s.id === active.sectionId)?.rows[0] : undefined;
    body = (
      <>
        <div className={styles.guide}><h1>INTERACTIONS</h1><p>Each swipe right reveals the next part</p></div>
        <div className={`${styles.card} ${styles.modelCard}`}>
          <div className={styles.modelBox}>
            <PartDiagram selected={active?.part ?? null} onPick={assign} badges={config.mappings.map((m, i) => ({ n: i + 1, part: m.part, on: i === idx }))} />
          </div>
          <p className={styles.modelHint}>Tap a part on the model to link it to the selected gesture</p>
        </div>
        <div className={styles.sequence}>
          {stepper}
          <div className={styles.kicker} style={{ marginTop: 6 }}>GESTURE SEQUENCE</div>
          <div className={styles.seqList}>
            {config.mappings.map((m, i) => (
              <div key={i} className={styles.seqItem} data-active={i === idx ? "" : undefined}>
                <button type="button" className={styles.seqHead} onClick={() => setActiveMapping(i)} aria-expanded={i === idx}>
                  <span className={styles.seqGesture}>{m.gesture.toUpperCase()}</span>
                  <span className={styles.seqWhat}><b>{m.part}</b>{i === idx ? "" : ` · ${sectionLabel(m.sectionId)}`}</span>
                  <span className={styles.grip} aria-hidden="true">⋮⋮</span>
                </button>
                {i === idx && (
                  <div className={styles.seqBody}>
                    <div className={styles.seqSelects}>
                      <Select label="Text" value={m.sectionId} options={config.sections.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => updateMapping(i, { sectionId: v })} />
                      <Select label="Model action" value={m.mode} options={MODES} onChange={(v) => updateMapping(i, { mode: v })} />
                    </div>
                    {firstLine && <p className={styles.seqQuote}>“{firstLine.a}{firstLine.b ? ` · ${firstLine.b}` : ""}”</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className={styles.chips}>
            <span className={styles.chipOutline}>Swipe left · back one</span>
            <span className={styles.chipOutline}>Swipe up · specs</span>
            <span className={styles.chipOutline}>Open palm · reset</span>
          </div>
        </div>
        <Foot back={{ label: "LIST VIEW", onClick: () => go({ name: "i-list" }) }} next={<button type="button" className={styles.outlineBtn} onClick={finish}>FINISH <Arrow /></button>} />
      </>
    );
  }

  return (
    <main className={styles.viewport}>
      <div className={styles.stage} style={{ transform: `scale(${scale})` }}>
        <div aria-hidden="true" className={styles.frame} />
        <div className={styles.eyebrow}>{config.productName.toUpperCase()} / SET UP YOUR DEMO</div>
        <div className={styles.modeSwitch} role="tablist" aria-label="Setup mode">
          <button type="button" role="tab" aria-selected={mode === "auto"} onClick={() => switchMode("auto")}>AUTO</button>
          <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => switchMode("manual")}>MANUAL</button>
        </div>
        {body}
        {notice && <div role="status" className={styles.toast}>{notice}</div>}
      </div>
    </main>
  );
}

// What visitors will see for a section, in the kiosk's panel style.
function KioskPreview({ section, small }: { section: Section; small?: boolean }) {
  return (
    <div className={small ? `${styles.kioskPreview} ${styles.kioskPreviewSmall}` : styles.kioskPreview}>
      <div className={styles.kioskKicker}>{section.label.toUpperCase()}</div>
      <div className={styles.kioskTitle}>{section.title}</div>
      {section.rows.map((r, i) => (
        <div key={i} className={styles.kioskRow}><span>{r.a || "—"}</span>{r.b && <small>{r.b}</small>}</div>
      ))}
    </div>
  );
}

// The exploded earbud, drawn from the kiosk's own geometry. Parts are clickable.
// Where each part's gesture-number badge sits, relative to the part's centre (diagram units).
const BADGE_AT: Record<PartId, [number, number]> = { shell: [70, -75], tip: [-10, -58], driver: [44, -40], battery: [34, -34], board: [34, -58], mic: [40, 2] };

function PartDiagram({ selected, onPick, badges }: { selected: string | null; onPick: (part: string) => void; badges?: { n: number; part: string; on: boolean }[] }) {
  const center = (id: PartId) => {
    const p = MODEL.parts.find((x) => x.id === id)!;
    const off = MODEL.off[id];
    return [p.o[0] + off[0] * 0.7, p.o[1] + off[1] * 0.7];
  };
  const partOf = (label: string) => (Object.keys(PART_LABELS) as PartId[]).find((k) => PART_LABELS[k] === label);
  return (
    <svg className={styles.diagram} viewBox="-30 -30 600 460" role="group" aria-label="Exploded Orbit Earbuds, click a part">
      {MODEL.parts.map((part) => {
        const off = MODEL.off[part.id];
        const label = PART_LABELS[part.id];
        const chosen = selected === label;
        return (
          <g key={part.id} transform={`translate(${off[0] * 0.7} ${off[1] * 0.7})`} role="button" tabIndex={0} aria-label={label} aria-pressed={chosen}
            className={chosen ? styles.partOn : styles.part} onClick={() => onPick(label)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(label); } }}>
            <path d={part.d} fill={chosen ? "#c8d9ff" : part.tone === "metal" ? "#a4b4cd" : "#e0dce6"} fillRule="evenodd" stroke={chosen ? "#fff" : "#7f91b6"} strokeWidth={chosen ? 4 : 2} />
            <title>{label}</title>
          </g>
        );
      })}
      {(Object.keys(BADGE_AT) as PartId[]).map((id) => {
        const list = badges?.filter((b) => partOf(b.part) === id) ?? [];
        if (!list.length) return null;
        const [cx, cy] = center(id);
        const [dx, dy] = BADGE_AT[id];
        const text = list.map((b) => b.n).join(" · ");
        const w = 30 + (text.length - 1) * 8;
        const on = list.some((b) => b.on);
        return (
          <g key={id} transform={`translate(${cx + dx} ${cy + dy})`} pointerEvents="none">
            <rect x={-w / 2} y={-15} width={w} height={30} rx={15} fill="#C8D8FF" stroke={on ? "rgba(200,216,255,0.35)" : "none"} strokeWidth="12" paintOrder="stroke" />
            <text textAnchor="middle" dy="5" fontSize="14" fontWeight="700" fill="#1B2036">{text}</text>
          </g>
        );
      })}
    </svg>
  );
}
