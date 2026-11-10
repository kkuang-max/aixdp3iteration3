"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MODEL, TOPICS, type PartId } from "@/lib/product";
import { buildModelParts, MODEL_ACCEPT, MODEL_EXT, STEP_EXT, type LoadedModel } from "@/lib/modelParts";
import { deleteFile, loadFile, saveFile } from "@/lib/fileStore";
import styles from "./business.module.css";

// Business portal: exhibitors set up their kiosk demo. Two ways in:
//  - Auto (default): upload a product doc + 3D model, review the sections, edit any of them.
//  - Manual: go section by section, uploading a pdf or pasting notes for each.
// Both end on the gesture mapping screens. Everything is drawn on a 1280×720 artboard that is
// scaled to fit the window, so it looks the same on any screen size or resolution.

type Row = { a: string; b: string };
type Section = {
  id: string;
  label: string;
  title: string;
  rows: Row[];
  // Filled in when the AI builds the section from the product doc:
  source?: string; // where in the doc, e.g. "p. 3"
  quote?: string; // supporting excerpt
  needsReview?: boolean;
  reviewNote?: string;
};
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
  aiBuilt?: boolean; // sections were drafted by the AI from the product doc
};
type Screen =
  | { name: "a-upload" }
  | { name: "a-review" }
  | { name: "a-edit"; id: string }
  | { name: "m-model" }
  | { name: "m-section"; index: number }
  | { name: "i-list" };

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
function GestureIcon({ gesture, compact }: { gesture: string; compact?: boolean }) {
  const g = gesture.toLowerCase();
  if (g.includes("up")) return <Arrow dir="up" size={16} color="#C8D8FF" />;
  if (g.includes("down")) return <Arrow dir="down" size={16} color="#C8D8FF" />;
  if (g.includes("left")) return <Arrow dir="left" size={16} color="#C8D8FF" />;
  if (g.includes("point")) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8D8FF" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /></svg>;
  const n = compact ? 1 : Math.max(1, Math.min(4, parseInt(g, 10) || 1));
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
  const [partIndex, setPartIndex] = useState(0); // which part the interactions viewer shows
  const [inContext, setInContext] = useState(false); // show that part inside the whole earbud
  const [editingPreview, setEditingPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [scale, setScale] = useState(1);
  const [model, setModel] = useState<LoadedModel | null>(null); // the uploaded 3D model, split into parts
  const [modelBusy, setModelBusy] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null); // the product doc, kept for the AI
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  // Uploaded files live in this browser (IndexedDB): bring them back after a refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = await loadFile("doc");
      if (doc && !cancelled) setDocFile(new File([doc.data], doc.name, { type: doc.type }));
      const stored = await loadFile("model");
      if (!stored || cancelled) return;
      setModelBusy(true);
      try {
        const loaded = await buildModelParts(stored.name, stored.data);
        if (!cancelled) setModel(loaded);
      } catch {
        /* the stored model can't be read any more: fall back to the sample */
      } finally {
        if (!cancelled) setModelBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const pickFile = (files: FileList | null, allowed: RegExp, apply: (name: string) => void) => {
    const file = files?.[0];
    if (!file) return;
    if (!allowed.test(file.name)) { setNotice("Unsupported file type. Choose one of the listed formats."); return; }
    apply(file.name); // only the file name is kept: files are not uploaded or analysed in this prototype
  };
  const DOC = /\.(pdf|txt|md)$/i;
  const DOC_ACCEPT = ".pdf,.txt,.md";

  // Product doc: kept in the browser and sent to the AI when the exhibitor builds the demo.
  const onDocFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (/\.docx?$/i.test(file.name)) { setNotice("Word files: save as PDF first, then upload the PDF."); return; }
    if (!DOC.test(file.name)) { setNotice("Use a PDF, or a .txt / .md file."); return; }
    if (file.size > 4 * 1024 * 1024) { setNotice("That file is over 4 MB. Try a smaller PDF."); return; }
    setDocFile(file);
    setAiError("");
    save({ ...config, documentName: file.name });
    try { await saveFile("doc", { name: file.name, type: file.type, data: await file.arrayBuffer() }); } catch { /* kept until refresh */ }
  };

  // 3D model: read in the browser, split into parts, and each gesture re-pointed at the new parts.
  const onModelFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (STEP_EXT.test(file.name)) { setNotice("STEP files can't be read in the browser yet: export as GLB or OBJ and upload that."); return; }
    if (!MODEL_EXT.test(file.name)) { setNotice("Use a GLB, GLTF, OBJ, FBX or STL file."); return; }
    setModelBusy(true);
    try {
      const data = await file.arrayBuffer();
      const loaded = await buildModelParts(file.name, data);
      setModel(loaded);
      setPartIndex(0);
      const names = loaded.parts.map((p) => p.name);
      let k = 0;
      const mappings = config.mappings.map((m) =>
        m.part === "Whole product" || m.part === "None" || names.includes(m.part) ? m : { ...m, part: names[k++ % names.length] },
      );
      save({ ...config, modelName: file.name, mappings });
      setNotice(`Found ${names.length} part${names.length === 1 ? "" : "s"} in ${file.name}${loaded.truncated ? " (showing the 24 largest)" : ""}.`);
      try { await saveFile("model", { name: file.name, type: file.type, data }); } catch { /* kept until refresh */ }
    } catch (e) {
      setNotice(e instanceof Error && e.message ? `Couldn't read that model: ${e.message}` : "Couldn't read that model.");
    } finally {
      setModelBusy(false);
    }
  };
  const useSampleModel = async () => {
    setModel(null);
    setPartIndex(0);
    save({ ...config, modelName: "" });
    await deleteFile("model");
  };

  // Ask the AI (server route) to draft the sections and gestures from the product doc.
  const buildWithAI = async () => {
    if (!docFile) {
      save({ ...config, aiBuilt: false });
      setNotice("No product doc uploaded, so this is the sample content.");
      go({ name: "a-review" });
      return;
    }
    setAiBusy(true);
    setAiError("");
    const form = new FormData();
    form.append("document", docFile);
    form.append("productName", config.productName);
    form.append("parts", JSON.stringify(model?.parts.map((p) => p.name) ?? []));
    try {
      const res = await fetch("/api/build-demo", { method: "POST", body: form });
      const json = await res.json().catch(() => ({ error: `The AI request failed (${res.status}).` }));
      if (!res.ok) { setAiError(json.error ?? `The AI request failed (${res.status}).`); return; }
      const sections = config.sections.map((s) => {
        const ai = (json.sections as (Partial<Section> & { id: string })[]).find((x) => x.id === s.id);
        return ai ? { ...s, title: ai.title ?? s.title, rows: ai.rows ?? s.rows, source: ai.source, quote: ai.quote, needsReview: ai.needsReview, reviewNote: ai.reviewNote } : s;
      });
      save({ ...config, productName: json.productName || config.productName, sections, mappings: json.mappings?.length ? json.mappings : config.mappings, aiBuilt: true });
      setNotice(`Built from ${docFile.name}. Check anything marked “Needs a look”.`);
      go({ name: "a-review" });
    } catch {
      setAiError("Couldn't reach the AI. Check the connection and try again.");
    } finally {
      setAiBusy(false);
    }
  };

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
    const files = [model?.fileName || "orbit_earbuds.obj (sample)", ...extra];
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
                {!docFile && <span className={styles.mutedSmall}>Upload it again to use it with the AI</span>}
                <FileButton accept={DOC_ACCEPT} className={styles.replace} onFile={onDocFile}>Replace</FileButton>
              </div>
            ) : (
              <FileButton accept={DOC_ACCEPT} className={styles.drop} onFile={onDocFile}>
                <UploadIcon w={56} h={70} sw={1.5} /><b>UPLOAD</b><span>pdf, txt or md</span>
              </FileButton>
            )}
            <p className={styles.cardFoot}>PRD, one-pager or spec sheet · pdf (up to 4 MB), txt, md</p>
          </div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>2 · 3D MODEL</h2>
            {modelBusy ? (
              <div className={styles.dropDone}><span className={styles.spinner} /><span className={styles.mutedSmall}>Finding the parts…</span></div>
            ) : model ? (
              <div className={styles.dropDone}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.modelThumb} src={model.whole} alt="" />
                <span className={styles.fileName}>{model.fileName}</span>
                <span className={styles.mutedSmall}>{model.parts.length} part{model.parts.length === 1 ? "" : "s"} found</span>
                <span className={styles.replaceRow}>
                  <FileButton accept={MODEL_ACCEPT} className={styles.replace} onFile={onModelFile}>Replace</FileButton>
                  <button type="button" className={styles.textLink} onClick={useSampleModel}>Use sample</button>
                </span>
              </div>
            ) : (
              <FileButton accept={MODEL_ACCEPT} className={styles.drop} onFile={onModelFile}>
                <UploadIcon w={56} h={70} sw={1.5} /><b>UPLOAD</b><span>glb, gltf, obj, fbx or stl</span>
              </FileButton>
            )}
            <p className={styles.cardFoot}>The model’s own pieces become the parts you map gestures to</p>
          </div>
        </div>
        {aiError ? (
          <p className={`${styles.manualHint} ${styles.aiError}`} role="alert">
            {aiError} <button type="button" className={styles.textLink} onClick={() => { setAiError(""); save({ ...config, aiBuilt: false }); go({ name: "a-review" }); }}>Continue with sample content</button>
          </p>
        ) : (
          <p className={styles.manualHint}>Rather write it yourself? <button type="button" className={styles.textLink} onClick={() => switchMode("manual")}>Use manual setup</button></p>
        )}
        <button type="button" className={styles.primaryBtn} onClick={buildWithAI} disabled={aiBusy || modelBusy}>BUILD MY DEMO <Arrow /></button>
        {aiBusy && (
          <div className={styles.busy} role="status">
            <span className={styles.spinner} />
            <b>Reading {docFile?.name}…</b>
            <span>The AI is writing your sections and matching gestures to {model ? `your ${model.parts.length} parts` : "the parts"}. This can take a minute.</span>
          </div>
        )}
      </>
    );
  }

  if (screen.name === "a-review") {
    const cards = [
      ...config.sections.map((s) => ({
        key: s.id, label: s.label.toUpperCase(), title: s.title,
        body: s.rows.map((r) => r.a).join(" · "),
        source: `From ${s.source ?? AUTO_META[s.id]?.source ?? "PRD"}`,
        look: !!s.needsReview || s.rows.length < 3 || s.rows.some((r) => !r.a.trim()),
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
        <div className={styles.guide}><h1>REVIEW YOUR DEMO</h1><p>{config.aiBuilt ? `AI built these from ${config.documentName}.` : `Sample sections for ${config.documentName || "your product doc"}.`} Open any section to edit it.</p></div>
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
        {!config.aiBuilt && <p className={styles.protoNote}>Sample content: upload a product doc and press Build my demo to have the AI write it</p>}
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
          <div className={styles.kicker}>FROM YOUR PRD · {(s.source ?? meta?.source ?? "").replace("PRD ", "").toUpperCase()}</div>
          <blockquote className={styles.quote}>“{s.quote ?? meta?.quote}”</blockquote>
          <span className={styles.mutedSmall}>{s.needsReview && s.reviewNote ? `Needs a look: ${s.reviewNote}` : s.quote ? "From your document" : "Sample excerpt"}</span>
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
          <FileButton accept={MODEL_ACCEPT} className={`${styles.drop} ${styles.dropTall}`} onFile={onModelFile}>
            {modelBusy ? <span className={styles.spinner} /> : <UploadIcon w={104} h={132} sw={1.4} />}
            <b>{modelBusy ? "FINDING THE PARTS…" : model ? "REPLACE" : "UPLOAD"}</b>
            <span>{model?.fileName || "glb, gltf, obj, fbx or stl"}</span>
          </FileButton>
        </div>
        <div className={styles.manualRight}>
          {stepper}
          {uploadedList([])}
          <div className={`${styles.card} ${styles.partsCard}`}>
            <div className={styles.partsHead}>
              <span className={styles.kicker} style={{ color: "#c8d8ff" }}>{model ? "PARTS IN YOUR MODEL" : "SAMPLE PARTS"}</span>
              {model ? <button type="button" className={styles.textLink} onClick={useSampleModel}>Use sample</button> : <span className={styles.mutedSmall}>Orbit Earbuds</span>}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className={styles.partsPreview}>{model ? <img className={styles.slideImg} src={model.whole} alt={`${model.fileName} preview`} /> : <PartDiagram selected={null} onPick={() => {}} />}</div>
            <div className={`${styles.chips} ${styles.chipsScroll}`}>
              {model
                ? model.parts.map((p) => <span key={p.name} className={styles.chip}>{p.name}</span>)
                : MODEL.parts.map((p) => <span key={p.id} className={styles.chip}>{p.id === "shell" ? "Shell" : PART_LABELS[p.id]}</span>)}
            </div>
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
    const slides: Slide[] = model
      ? [
          { label: "Whole product", part: <ModelImage src={model.whole} />, context: <ModelImage src={model.whole} /> },
          ...model.parts.map((p) => ({ label: p.name, part: <ModelImage src={p.image} />, context: <ModelImage src={p.context} /> })),
        ]
      : SAMPLE_SLIDES;
    const idx = Math.min(partIndex, slides.length - 1);
    const slide = slides[idx];
    const partOptions = model ? ["Whole product", ...model.parts.map((p) => p.name), "None"] : PARTS;
    const showPart = (part: string) => {
      const i = slides.findIndex((p) => p.label === part);
      if (i >= 0) setPartIndex(i);
    };
    body = (
      <>
        <div className={styles.guide}><h1>INTERACTIONS</h1><p>Scroll through {model ? `the parts of ${model.fileName}` : "the parts"} and map each gesture</p></div>
        <div className={styles.stepperAt}>{stepper}</div>
        <div className={styles.listTools}>
          <button type="button" className={styles.dashedBtn} onClick={() => save({ ...config, mappings: [...config.mappings, { gesture: "4 swipes right", sectionId: "how", part: slide.label, mode: "Highlight" }] })}>+ ADD INTERACTION</button>
        </div>
        <PartViewer
          key={model?.fileName ?? "sample"}
          slides={slides}
          index={idx}
          onIndex={setPartIndex}
          inContext={inContext}
          onToggleContext={() => setInContext((v) => !v)}
          gestures={(label) => config.mappings.filter((m) => m.part === label).map((m) => m.gesture)}
        />
        <div className={`${styles.card} ${styles.gestureCard}`}>
          <div className={styles.gestureHead}><span>GESTURE</span><span>SHOWS</span><span>HIGHLIGHTS</span><span>MODEL DOES</span><span /></div>
          <div className={styles.gestureRows}>
            {config.mappings.map((m, i) => (
              <div key={i} className={styles.gestureRow} data-match={m.part === slide.label ? "" : undefined} onClick={() => showPart(m.part)}>
                <span className={styles.gestureName}><GestureIcon gesture={m.gesture} compact /><Select className={styles.gestureSelect} label={`Gesture ${i + 1}`} value={m.gesture} options={GESTURES.includes(m.gesture) ? GESTURES : [m.gesture, ...GESTURES]} onChange={(v) => updateMapping(i, { gesture: v })} /></span>
                <Select label={`Text for ${m.gesture}`} value={m.sectionId} options={config.sections.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => updateMapping(i, { sectionId: v })} />
                <Select label={`Part for ${m.gesture}`} value={m.part} options={partOptions.includes(m.part) ? partOptions : [m.part, ...partOptions]} onChange={(v) => { updateMapping(i, { part: v }); showPart(v); }} />
                <Select label={`Model action for ${m.gesture}`} value={m.mode} options={MODES} onChange={(v) => updateMapping(i, { mode: v })} />
                <button type="button" className={styles.remove} aria-label={`Remove ${m.gesture}`} onClick={(e) => { e.stopPropagation(); save({ ...config, mappings: config.mappings.filter((_, j) => j !== i) }); }}>×</button>
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

// ---- Interactions: a scrollable viewer with one part per slide -----------------------------
const WHEEL_STEP = 40; // accumulated wheel delta (px) for one part
const WHEEL_COOLDOWN_MS = 420; // trackpads keep sending momentum after a flick: one flick = one part
const TOUCH_STEP = 30; // finger travel (px) for one part
// Each slide fills the square and shows one part big and centred. It is a real scroll container (scroll-snap), so a
// trackpad, mouse wheel, touch swipe or the arrow keys move through the parts one at a time. "View in context" swaps
// the isolated part for the whole exploded earbud with that part lit up.
const PART_SLIDES: { label: string; ids: PartId[] }[] = [
  { label: "Whole product", ids: MODEL.parts.map((p) => p.id) },
  ...(["tip", "driver", "battery", "board", "mic"] as PartId[]).map((id) => ({ label: PART_LABELS[id], ids: [id] })),
];

/** Bounding box of an outline (M/L/Q/A/Z with absolute coordinates, as in lib/product.ts). */
function pathBox(d: string, dx = 0, dy = 0) {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => { xs.push(x + dx); ys.push(y + dy); };
  let last: [number, number] = [0, 0];
  for (const [, cmd, args] of d.matchAll(/([MLQAZ])([^MLQAZ]*)/gi)) {
    const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (/A/i.test(cmd)) {
      // Half-circle arcs: the circle's centre is halfway between the ends.
      for (let i = 0; i + 6 < n.length; i += 7) {
        const [r, end] = [n[i], [n[i + 5], n[i + 6]] as [number, number]];
        const c = [(last[0] + end[0]) / 2, (last[1] + end[1]) / 2];
        add(c[0] - r, c[1] - r); add(c[0] + r, c[1] + r);
        last = end;
      }
    } else {
      for (let i = 0; i + 1 < n.length; i += 2) { add(n[i], n[i + 1]); last = [n[i], n[i + 1]]; }
    }
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function boxFor(ids: PartId[], exploded: boolean, pad: number) {
  const boxes = ids.map((id) => {
    const p = MODEL.parts.find((x) => x.id === id)!;
    const off = exploded ? MODEL.off[id] : [0, 0];
    return pathBox(p.d, off[0] * 0.7, off[1] * 0.7);
  });
  const x0 = Math.min(...boxes.map((b) => b.x0)), y0 = Math.min(...boxes.map((b) => b.y0));
  const x1 = Math.max(...boxes.map((b) => b.x1)), y1 = Math.max(...boxes.map((b) => b.y1));
  const size = Math.max(x1 - x0, y1 - y0) + pad * 2; // square, so every part ends up the same "big"
  return `${(x0 + x1) / 2 - size / 2} ${(y0 + y1) / 2 - size / 2} ${size} ${size}`;
}
const CONTEXT_BOX = boxFor(MODEL.parts.map((p) => p.id), true, 30);

function EarbudParts({ lit, exploded, viewBox, only }: { lit: PartId[]; exploded: boolean; viewBox: string; only?: boolean }) {
  return (
    <svg className={styles.slideSvg} viewBox={viewBox} aria-hidden="true">
      {MODEL.parts.filter((part) => !only || lit.includes(part.id)).map((part) => {
        const on = lit.includes(part.id);
        const off = exploded ? MODEL.off[part.id] : [0, 0];
        return (
          <path key={part.id} d={part.d} transform={`translate(${off[0] * 0.7} ${off[1] * 0.7})`} fillRule="evenodd"
            className={styles.slidePart} data-on={on ? "" : undefined}
            fill={on ? (part.tone === "metal" ? "#c8d9ff" : "#eef1fb") : "#8d97b3"} stroke={on ? "#ffffff" : "#5d6a8a"} strokeWidth={on ? 2.5 : 1.5} />
        );
      })}
    </svg>
  );
}

type Slide = { label: string; part: ReactNode; context: ReactNode };

// eslint-disable-next-line @next/next/no-img-element
const ModelImage = ({ src }: { src: string }) => <img className={styles.slideImg} src={src} alt="" draggable={false} />;

function PartViewer({ slides, index, onIndex, inContext, onToggleContext, gestures }: {
  slides: Slide[];
  index: number;
  onIndex: (i: number) => void;
  inContext: boolean;
  onToggleContext: () => void;
  gestures: (label: string) => string[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const shown = useRef(index); // the slide the scroll position is on
  const target = useRef(index); // the slide we're scrolling to
  const count = useRef(slides.length);
  useEffect(() => {
    count.current = slides.length;
  });

  // Wheel, trackpad and touch each move exactly one part per flick / swipe. (Left to the browser, a single wheel notch
  // scrolls less than half a slide and snaps straight back.)
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const step = (dir: 1 | -1) => {
      const next = Math.min(Math.max(target.current + dir, 0), count.current - 1);
      if (next === target.current) return;
      target.current = next;
      el.scrollTo({ top: next * el.clientHeight, behavior: "smooth" });
    };
    let acc = 0;
    let quietUntil = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now < quietUntil) {
        quietUntil = now + WHEEL_COOLDOWN_MS / 2; // still the same flick's momentum
        return;
      }
      acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (Math.abs(acc) >= WHEEL_STEP) {
        step(acc > 0 ? 1 : -1);
        acc = 0;
        quietUntil = now + WHEEL_COOLDOWN_MS;
      }
    };
    let startY: number | null = null;
    let moved = false;
    const touchStart = (e: TouchEvent) => { startY = e.touches[0].clientY; moved = false; };
    const touchMove = (e: TouchEvent) => {
      if (startY === null) return;
      e.preventDefault();
      const dy = startY - e.touches[0].clientY; // finger up → next part
      if (!moved && Math.abs(dy) >= TOUCH_STEP) {
        moved = true; // one part per swipe
        step(dy > 0 ? 1 : -1);
      }
    };
    const touchEnd = () => { startY = null; };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchmove", touchMove, { passive: false });
    el.addEventListener("touchend", touchEnd);
    el.addEventListener("touchcancel", touchEnd);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("touchcancel", touchEnd);
    };
  }, []);

  // Scrolling picks the part.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== shown.current) {
      shown.current = i;
      onIndex(i);
    }
  };
  // Picking a part elsewhere (a row in the table) scrolls to it.
  useEffect(() => {
    const el = scroller.current;
    if (!el || index === shown.current) return;
    shown.current = index;
    target.current = index;
    el.scrollTo({ top: index * el.clientHeight, behavior: "smooth" });
  }, [index]);

  const go = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    target.current = Math.min(Math.max(i, 0), slides.length - 1);
    el.scrollTo({ top: target.current * el.clientHeight, behavior: "smooth" });
  };
  const slide = slides[index];
  const used = gestures(slide.label);

  return (
    <div className={`${styles.card} ${styles.viewer}`}>
      <div
        ref={scroller}
        className={styles.viewerScroll}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={`Parts. ${slide.label}, ${index + 1} of ${slides.length}. Scroll or use the arrow keys for the next part.`}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); go(index + 1); }
          if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(index - 1); }
        }}
      >
        {slides.map((p, i) => (
          <div key={p.label} className={styles.slide} aria-hidden={i !== index}>
            {inContext ? p.context : p.part}
          </div>
        ))}
      </div>

      <div className={styles.viewerTop}>
        <span className={styles.stepCount}>{index + 1} / {slides.length}</span>
        <button type="button" className={styles.smallPill} aria-pressed={inContext} onClick={onToggleContext}>
          {inContext ? "VIEW PART" : "VIEW IN CONTEXT"}
        </button>
      </div>
      <div className={styles.viewerBottom}>
        <span className={styles.viewerName}>{slide.label}</span>
        <span className={styles.viewerUsed}>
          {used.length ? used.map((g) => <span key={g} className={styles.usedChip}><GestureIcon gesture={g} />{g}</span>) : <span className={styles.mutedSmall}>No gesture highlights this part yet</span>}
        </span>
      </div>
      <div className={styles.stepRail}>
        {slides.map((p, i) => (
          <button key={p.label} type="button" aria-label={`Show ${p.label}`} data-on={i === index ? "" : undefined} onClick={() => go(i)} />
        ))}
      </div>
      {index < slides.length - 1 && <span className={styles.scrollCue} aria-hidden="true"><Arrow dir="down" size={14} /></span>}
    </div>
  );
}

// The sample earbud, drawn from the kiosk's own geometry.
const SAMPLE_SLIDES: Slide[] = PART_SLIDES.map((p) => ({
  label: p.label,
  part: <EarbudParts lit={p.ids} exploded={false} only viewBox={boxFor(p.ids, false, p.ids.length > 1 ? 24 : 14)} />,
  context: <EarbudParts lit={p.ids} exploded viewBox={CONTEXT_BOX} />,
}));
