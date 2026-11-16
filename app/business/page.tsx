"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MODEL, TOPICS, type PartId } from "@/lib/product";
import { buildModelParts, MODEL_ACCEPT, MODEL_EXT, STEP_EXT, type LoadedModel } from "@/lib/modelParts";
import { deleteFile, loadFile, saveFile } from "@/lib/fileStore";
import { MAX_ROWS, publishDemo, publishModelFile, shrinkImage, type PublishedDemo } from "@/lib/published";
import styles from "./business.module.css";

// Business portal: exhibitors set up their kiosk demo. Two ways in:
//  - Auto (default): upload a product doc + 3D model; the AI drafts every section, then review and edit them one by one.
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
const AUTO_META: Record<string, { source: string; quote: string; format: string; hint: string }> = {
  what: { source: "PRD p. 1", quote: "Orbit is a true-wireless earbud with adaptive noise cancelling…", format: "1-sentence headline + 3 one-line points", hint: "Add a headline and 3 or less points" },
  how: { source: "PRD p. 3–4", quote: "Each earbud has six main parts: ear tip, driver, battery…", format: "headline + 1 row per model part · name + 1 line", hint: "Add a headline and 1 row per model part" },
  different: { source: "PRD p. 2", quote: "Unlike fixed-level ANC, Orbit adjusts to the room in real time…", format: "headline + 3 points · title + 1 line", hint: "Add a headline and 3 points" },
  uses: { source: "PRD p. 1", quote: "Target users are daily commuters who want to block out transit noise…", format: "headline + 3–5 scenes · name + 1 line", hint: "Add a headline and 3–5 scenes" },
  specs: { source: "PRD p. 6", quote: "Battery: [X] h per charge, [X] h with case. Bluetooth [5.x]…", format: "headline + up to 5 rows · label + value", hint: "Add a headline and up to 5 rows" },
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
function Stepper({ total, current, onJump, wide, long }: { total: number; current: number; onJump: (i: number) => void; wide?: boolean; long?: boolean }) {
  return (
    <div className={`${styles.stepper} ${wide ? styles.stepperWide : ""} ${long ? styles.stepperLong : ""}`} aria-label="Setup progress">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={styles.stepItem}>
          {i > 0 && <span className={styles.stepLine} data-done={i <= current ? "" : undefined} />}
          <button type="button" className={styles.stepDot} data-state={i < current ? "done" : i === current ? "current" : "todo"} onClick={() => onJump(i)} aria-label={`Go to step ${i + 1}`} aria-current={i === current ? "step" : undefined}>
            {i < current && <Check size={16} />}
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

function FileButton({ accept, onFile, children, className, disabled }: { accept: string; onFile: (files: FileList | null) => void; children: ReactNode; className: string; disabled?: boolean }) {
  return (
    <label className={className} data-disabled={disabled ? "" : undefined}>
      {children}
      <input type="file" accept={accept} disabled={disabled} className={styles.hiddenInput} onChange={(e) => { onFile(e.target.files); e.target.value = ""; }} />
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

// ---- Sheets-style cells: one line at rest, an editor that opens over its neighbours ----------------
// At rest a cell shows one line, ending in "…" (plus an expand icon) when the text is longer than the box. Click it
// and an editor opens on top of the cells around it, tall enough for the whole text, the way a spreadsheet cell does.
// The editor is drawn in a layer over the whole artboard so scrolling lists and card edges never clip it.
// Enter or clicking away keeps the change, Escape puts the old text back, Tab moves to the next cell.
const CellLayer = createContext<{ layer: HTMLDivElement | null; scale: number }>({ layer: null, scale: 1 });
const CELL_LINE = 22;
const CELL_MIN_H = 3 * CELL_LINE + 24; // the editor is always at least three lines tall
const WIDEN = 120; // a short cell (a part name) opens this much wider so it can be read

const ExpandIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
);

function Cell({ value, onChange, label, placeholder, widen, bold, span }: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  widen?: boolean;
  bold?: boolean;
  span?: boolean;
}) {
  const { layer, scale } = useContext(CellLayer);
  const wrap = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const before = useRef(value);
  const [over, setOver] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);

  // Does the text fit on one line?
  useEffect(() => {
    const el = text.current;
    if (!el) return;
    const check = () => setOver(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  const open = () => {
    const w = wrap.current;
    if (!w || !layer) return;
    const r = w.getBoundingClientRect();
    const l = layer.getBoundingClientRect();
    const left = (r.left - l.left) / scale;
    const top = (r.top - l.top) / scale;
    const width = Math.min(r.width / scale + (widen ? WIDEN : 0), STAGE_W - 24 - left);
    before.current = value;
    setBox({ left, top, width });
  };
  const close = (refocus?: boolean) => {
    setBox(null);
    if (refocus) requestAnimationFrame(() => text.current?.focus());
  };

  // Grow the editor to fit the text (at least three lines). Near the bottom of the artboard it opens upwards.
  useLayoutEffect(() => {
    const ta = editor.current;
    if (!box || !ta) return;
    ta.style.height = "0px";
    const h = Math.min(Math.max(CELL_MIN_H, ta.scrollHeight + 4), STAGE_H - 32);
    ta.style.height = `${h}px`;
    ta.style.top = `${Math.max(16, Math.min(box.top, STAGE_H - 16 - h))}px`;
  }, [box, value]);

  // Anything that moves the cell (a list scrolling) closes the editor so it never floats away from it.
  useEffect(() => {
    if (!box) return;
    const onScroll = (e: Event) => { if (e.target !== editor.current) setBox(null); };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [box]);

  const tabTo = (dir: 1 | -1) => {
    const cells = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-cell]"));
    const next = cells[cells.indexOf(text.current!) + dir];
    close(!next);
    if (next) requestAnimationFrame(() => next.click());
  };

  return (
    <div ref={wrap} className={styles.cellWrap} data-span={span ? "" : undefined}>
      <div className={styles.cell} data-open={box ? "" : undefined}>
        <button ref={text} type="button" data-cell="" className={styles.cellText} data-bold={bold ? "" : undefined} data-empty={value ? undefined : ""} aria-label={label} title={over ? value : undefined} onClick={open}>
          {value || placeholder}
        </button>
        {over && <button type="button" className={styles.cellExpand} aria-label={`Show all of ${label}`} tabIndex={-1} onClick={open}><ExpandIcon /></button>}
      </div>
      {box && layer && createPortal(
        <textarea
          ref={editor}
          autoFocus
          className={styles.cellEditor}
          data-bold={bold ? "" : undefined}
          aria-label={label}
          placeholder={placeholder}
          value={value}
          style={{ left: box.left, width: box.width }}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, " "))}
          onBlur={() => close()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); close(true); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onChange(before.current); close(true); }
            if (e.key === "Tab") { e.preventDefault(); tabTo(e.shiftKey ? -1 : 1); }
          }}
        />,
        layer,
      )}
    </div>
  );
}

// ---- Section status: shown as a coloured dot in the section list and a label on the section -----------
type Status = "good" | "attention" | "insufficient";
const STATUS_TEXT: Record<Status, string> = { good: "Good", attention: "Needs Attention", insufficient: "Insufficient" };
const PLACEHOLDER = /\[[^\]]*\]/; // "[X] h", "[competitor]": left for the exhibitor to fill in

function sectionStatus(s: Section): Status {
  const filled = s.rows.filter((r) => r.a.trim());
  if (!s.title.trim() || filled.length === 0) return "insufficient";
  if (s.needsReview || filled.length < s.rows.length || PLACEHOLDER.test([s.title, ...s.rows.flatMap((r) => [r.a, r.b])].join(" "))) return "attention";
  return "good";
}

function StatusLabel({ status }: { status: Status }) {
  return <span className={styles.status} data-status={status}><span className={styles.statusDot} />{STATUS_TEXT[status]}</span>;
}

// ---- Overflow: "Show all" opens the full text in a modal ------------------------------------
type MoreItem = { title: string; content: ReactNode };
const MoreContext = createContext<(item: MoreItem) => void>(() => {});

/** Shows as much as fits; when the content is taller than the box it fades out and offers "Show all".
 *  With `scroll`, the box also scrolls, and the fade goes away once the end is in view. */
function Clamp({ title, children, full, className, scroll }: { title: string; children: ReactNode; full?: ReactNode; className?: string; scroll?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const openMore = useContext(MoreContext);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setOver(el.scrollHeight > el.clientHeight + 2);
      setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
    });
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  });
  const onScroll = () => {
    const el = ref.current;
    if (el) setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  };
  return (
    <div className={`${styles.clamp} ${className ?? ""}`} data-over={over && !(scroll && atEnd) ? "" : undefined}>
      <div ref={ref} className={styles.clampInner} data-scroll={scroll ? "" : undefined} onScroll={scroll ? onScroll : undefined} tabIndex={scroll && over ? 0 : undefined}>{children}</div>
      {over && (
        <button type="button" className={styles.moreBtn} onClick={() => openMore({ title, content: full ?? children })}>
          Show all
        </button>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>{title}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={styles.modalBody}>{children}</div>
        {actions && <div className={styles.modalActions}>{actions}</div>}
      </div>
    </div>
  );
}

/** A section in full, for the modal. */
function SectionFull({ section }: { section: Section }) {
  return (
    <div className={styles.fullSection}>
      <p className={styles.fullTitle}>{section.title}</p>
      {section.rows.map((r, i) => (
        <div key={i} className={styles.fullRow}><b>{r.a || "—"}</b>{r.b && <span>{r.b}</span>}</div>
      ))}
      {section.needsReview && section.reviewNote && <p className={styles.fullNote}>Needs attention: {section.reviewNote}</p>}
    </div>
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
  const [more, setMore] = useState<MoreItem | null>(null); // "… More" modal
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [cellLayer, setCellLayer] = useState<HTMLDivElement | null>(null); // where open text cells are drawn
  const [sectionDocs, setSectionDocs] = useState<Record<string, File>>({}); // manual: the file attached to each section
  const [formatting, setFormatting] = useState<string | null>(null); // manual: section the AI is formatting

  // Uploaded files live in this browser (IndexedDB): bring them back after a refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = await loadFile("doc");
      if (doc && !cancelled) setDocFile(new File([doc.data], doc.name, { type: doc.type }));
      const docs: Record<string, File> = {};
      for (const t of TOPICS) {
        const f = await loadFile(`section-${t.id}`);
        if (f) docs[t.id] = new File([f.data], f.name, { type: f.type });
      }
      if (!cancelled) setSectionDocs(docs);
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
        if (saved && Array.isArray(saved.sections) && Array.isArray(saved.mappings)) {
          setConfig({ ...defaultConfig, ...saved, sections: saved.sections.map((s) => ({ ...s, rows: s.rows.slice(0, MAX_ROWS) })) });
        }
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

  // Start over: clear every section, gesture and uploaded file.
  const restart = async () => {
    setConfirmRestart(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing saved */ }
    await Promise.all([deleteFile("model"), deleteFile("doc"), ...TOPICS.map((t) => deleteFile(`section-${t.id}`))]);
    setSectionDocs({});
    setConfig(defaultConfig);
    setModel(null);
    setDocFile(null);
    setAiError("");
    setPartIndex(0);
    setInContext(false);
    setEditingPreview(false);
    setMode("auto");
    setScreen({ name: "a-upload" });
    setNotice("Cleared. Starting fresh.");
  };

  // Ask the AI (server route) to draft the sections and gestures from the product doc.
  const buildWithAI = async () => {
    if (!docFile) {
      save({ ...config, aiBuilt: false });
      setNotice("No product doc uploaded, so this is the sample content.");
      go({ name: "a-edit", id: config.sections[0].id });
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
        return ai ? { ...s, title: ai.title ?? s.title, rows: (ai.rows ?? s.rows).slice(0, MAX_ROWS), source: ai.source, quote: ai.quote, needsReview: ai.needsReview, reviewNote: ai.reviewNote } : s;
      });
      save({ ...config, productName: json.productName || config.productName, sections, mappings: json.mappings?.length ? json.mappings : config.mappings, aiBuilt: true });
      setNotice(`Built from ${docFile.name}. Check anything marked “Needs attention”.`);
      go({ name: "a-edit", id: config.sections[0].id });
    } catch {
      setAiError("Couldn't reach the AI. Check the connection and try again.");
    } finally {
      setAiBusy(false);
    }
  };

  // Manual: a file attached to one section, kept in the browser so the AI can read it.
  const attachSectionFile = async (id: string, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (/\.docx?$/i.test(file.name)) { setNotice("Word files: save as PDF first, then attach the PDF."); return; }
    if (!DOC.test(file.name)) { setNotice("Attach a PDF, or a .txt / .md file."); return; }
    if (file.size > 4 * 1024 * 1024) { setNotice("That file is over 4 MB. Try a smaller PDF."); return; }
    setSectionDocs((d) => ({ ...d, [id]: file }));
    save({ ...config, sectionFiles: { ...config.sectionFiles, [id]: file.name } });
    try { await saveFile(`section-${id}`, { name: file.name, type: file.type, data: await file.arrayBuffer() }); } catch { /* kept until refresh */ }
  };
  const removeSectionFile = async (id: string) => {
    setSectionDocs((d) => { const next = { ...d }; delete next[id]; return next; });
    const sectionFiles = { ...config.sectionFiles };
    delete sectionFiles[id];
    save({ ...config, sectionFiles });
    await deleteFile(`section-${id}`);
  };
  // Manual: the AI turns whatever was typed, pasted or attached for one section into that section's kiosk copy.
  const formatSection = async (id: string) => {
    const notes = (config.notes[id] ?? "").trim();
    const file = sectionDocs[id];
    if (!notes && !file) {
      setNotice(config.sectionFiles[id] ? `Attach ${config.sectionFiles[id]} again so the AI can read it.` : "Type, paste or attach something first.");
      return;
    }
    setFormatting(id);
    setEditingPreview(false);
    const form = new FormData();
    form.append("sectionId", id);
    form.append("notes", notes);
    if (file) form.append("document", file);
    form.append("productName", config.productName);
    form.append("parts", JSON.stringify(model?.parts.map((p) => p.name) ?? []));
    try {
      const res = await fetch("/api/build-section", { method: "POST", body: form });
      const json = await res.json().catch(() => ({ error: `The AI request failed (${res.status}).` }));
      if (!res.ok) { setNotice(json.error ?? `The AI request failed (${res.status}).`); return; }
      updateSection(id, (x) => ({
        ...x,
        title: json.title || x.title,
        rows: Array.isArray(json.rows) && json.rows.length ? (json.rows as Row[]).slice(0, MAX_ROWS) : x.rows,
        source: json.source, quote: json.quote, needsReview: json.needsReview, reviewNote: json.reviewNote,
      }));
      setNotice(json.needsReview ? "Formatted. Some facts are missing: look for the [brackets]." : "Formatted. Edit anything in the preview.");
    } catch {
      setNotice("Couldn't reach the AI. Check the connection and try again.");
    } finally {
      setFormatting(null);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setEditingPreview(false);
    setScreen(m === "auto" ? { name: "a-upload" } : { name: "m-model" });
  };
  const go = (s: Screen) => { setEditingPreview(false); setScreen(s); };
  // Publish: the kiosk shows these sections, gestures and model pictures from now on.
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ server: boolean; note?: string; at: string } | null>(null);
  const finish = async () => {
    setPublishing(true);
    try {
      let pictures: PublishedDemo["model"];
      if (model) {
        // Pictures of every part (the kiosk lights up whichever part a visitor points at).
        const parts: Record<string, string> = {};
        for (const p of model.parts) parts[p.name] = await shrinkImage(p.context, 400);
        pictures = { fileName: model.fileName, whole: await shrinkImage(model.whole), parts, partNames: model.parts.map((p) => p.name) };
        const stored = await loadFile("model");
        if (stored) {
          const { path } = await publishModelFile(stored);
          pictures.file = { name: stored.name, path };
        }
      }
      const demo: PublishedDemo = {
        version: 1,
        publishedAt: new Date().toISOString(),
        productName: config.productName,
        sections: config.sections.map(({ id, title, rows }) => ({ id, title, rows: rows.slice(0, MAX_ROWS) })),
        mappings: config.mappings,
        model: pictures,
      };
      const result = await publishDemo(demo);
      if (!result.local && !result.server) { setNotice("Couldn't publish: storage is blocked in this browser."); return; }
      setPublished({ server: result.server, note: result.serverNote, at: demo.publishedAt });
    } catch {
      setNotice("Couldn't publish. Try again.");
    } finally {
      setPublishing(false);
    }
  };

  // Progress steps for the current flow.
  const autoStep = screen.name === "a-upload" ? 0 : screen.name === "a-edit" ? 1 : 2;
  const manualStep = screen.name === "m-model" ? 0 : screen.name === "m-section" ? screen.index + 1 : 6;
  const jumpAuto = (i: number) => go(i === 0 ? { name: "a-upload" } : i === 1 ? { name: "a-edit", id: config.sections[0].id } : { name: "i-list" });
  const jumpManual = (i: number) => go(i === 0 ? { name: "m-model" } : i === 6 ? { name: "i-list" } : { name: "m-section", index: i - 1 });
  const stepper = mode === "auto"
    ? <Stepper total={3} current={autoStep} onJump={jumpAuto} wide />
    : <Stepper total={7} current={manualStep} onJump={jumpManual} long />;
  const backFromGestures = () => go(mode === "auto" ? { name: "a-edit", id: config.sections[0].id } : { name: "m-section", index: 4 });

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
            {aiError} <button type="button" className={styles.textLink} onClick={() => { setAiError(""); save({ ...config, aiBuilt: false }); go({ name: "a-edit", id: config.sections[0].id }); }}>Continue with sample content</button>
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

  if (screen.name === "a-edit") {
    const at = Math.max(0, config.sections.findIndex((x) => x.id === screen.id));
    const s = config.sections[at];
    const meta = AUTO_META[s.id];
    const status = sectionStatus(s);
    const gestureStatus: Status = config.mappings.length === 0 ? "insufficient" : "good";
    const setRow = (i: number, patch: Partial<Row>) => updateSection(s.id, (x) => ({ ...x, rows: x.rows.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
    const next = config.sections[at + 1];
    body = (
      <>
        <div className={styles.guide}><h1>REVIEW YOUR DEMO</h1><p>{config.aiBuilt ? `AI built these from ${config.documentName}.` : `Sample sections for ${config.documentName || "your product doc"}.`} Open any section to edit it.</p></div>
        <div className={styles.stepperAt}>{stepper}</div>
        <nav className={styles.sideNav} aria-label="Sections">
          {config.sections.map((x) => {
            const st = sectionStatus(x);
            return (
              <button key={x.id} type="button" className={styles.sideItem} aria-current={x.id === s.id ? "page" : undefined} title={STATUS_TEXT[st]} onClick={() => go({ name: "a-edit", id: x.id })}>
                {x.label}<span className={styles.statusDot} data-status={st} aria-label={STATUS_TEXT[st]} />
              </button>
            );
          })}
          <button type="button" className={styles.sideItem} title={STATUS_TEXT[gestureStatus]} onClick={() => go({ name: "i-list" })}>
            Interactions<span className={styles.statusDot} data-status={gestureStatus} aria-label={STATUS_TEXT[gestureStatus]} />
          </button>
        </nav>
        <div className={`${styles.card} ${styles.editCard}`}>
          <div className={styles.editHead}>
            <h2>{s.label.toUpperCase()}</h2>
            <StatusLabel status={status} />
          </div>
          <p className={styles.editHint}>{meta?.hint ?? "Edit what the kiosk shows"}</p>
          <div className={styles.fieldLabel}>HEADLINE</div>
          <div className={styles.cellGrid}><Cell span label="Headline" value={s.title} onChange={(v) => updateSection(s.id, (x) => ({ ...x, title: v }))} /></div>
          <div className={styles.fieldLabel}>ROWS</div>
          <div className={styles.editRows}>
            {s.rows.map((r, i) => (
              <div key={i} className={styles.editRow}>
                <Cell widen bold label={`Row ${i + 1} name`} value={r.a} onChange={(v) => setRow(i, { a: v })} />
                <Cell label={`Row ${i + 1} line`} placeholder="One line" value={r.b} onChange={(v) => setRow(i, { b: v })} />
                <button type="button" className={styles.remove} aria-label={`Remove row ${i + 1}`} onClick={() => updateSection(s.id, (x) => ({ ...x, rows: x.rows.filter((_, j) => j !== i) }))}>×</button>
              </div>
            ))}
          </div>
          <div className={styles.editButtons}>
            <button type="button" className={styles.dashedBtn} disabled={s.rows.length >= MAX_ROWS} title={s.rows.length >= MAX_ROWS ? `${MAX_ROWS} rows at most` : undefined} onClick={() => updateSection(s.id, (x) => ({ ...x, rows: [...x.rows, { a: "", b: "" }].slice(0, MAX_ROWS) }))}>+ ADD ROW</button>
            <button type="button" className={styles.outlineSmall} onClick={() => { updateSection(s.id, () => sampleSection(s.id)); setNotice("Restored the sample content for this section."); }}>REGENERATE</button>
          </div>
        </div>
        <div className={`${styles.card} ${styles.quoteCard}`}>
          <div className={`${styles.kicker} ${styles.oneLine}`} title={s.source ?? meta?.source}>{s.quote ? `FROM YOUR DOCUMENT${s.source ? ` · ${s.source.replace("PRD ", "").toUpperCase()}` : ""}` : "SAMPLE EXCERPT"}</div>
          <Clamp className={styles.fill} title={`From your document${s.source ? ` · ${s.source}` : ""}`}>
            <blockquote className={styles.quote}>“{s.quote ?? meta?.quote}”</blockquote>
            {s.needsReview && s.reviewNote && <span className={styles.lookNoteSmall}>Needs attention: {s.reviewNote}</span>}
          </Clamp>
        </div>
        <div className={`${styles.card} ${styles.kioskCard}`}>
          <div className={styles.kicker} style={{ color: "#c8d8ff" }}>ON THE KIOSK</div>
          <Clamp className={styles.fill} title={`On the kiosk · ${s.label}`} full={<SectionFull section={s} />}>
            <KioskPreview section={s} small />
          </Clamp>
        </div>
        <Foot back={{ label: "ALL SECTIONS", onClick: () => go({ name: "a-upload" }) }} next={<>
          <button type="button" className={styles.outlineBtn} onClick={() => go({ name: "i-list" })}>CHECK GESTURES <Arrow /></button>
          <button type="button" className={styles.outlineBtn} onClick={() => { setNotice(next ? `Saved. Next: ${next.label}.` : "Section saved."); if (next) go({ name: "a-edit", id: next.id }); }}>SAVE SECTION</button>
        </>} />
      </>
    );
  }

  if (screen.name === "m-model") {
    body = (
      <>
        <div className={styles.guide}><h1>UPLOAD</h1><p>Upload a 3D rendering or model of your product</p></div>
        <div className={styles.progressAt}>{stepper}</div>
        <FileButton accept={MODEL_ACCEPT} className={`${styles.drop} ${styles.manualLeft} ${styles.dropTall}`} onFile={onModelFile}>
          {modelBusy ? <span className={styles.spinner} /> : <UploadIcon w={104} h={132} sw={1.4} />}
          <b>{modelBusy ? "FINDING THE PARTS…" : model ? "REPLACE" : "UPLOAD"}</b>
          <span>{model?.fileName || "glb, gltf, obj, fbx or stl"}</span>
        </FileButton>
        <div className={`${styles.card} ${styles.manualRight} ${styles.partsCard}`}>
          <div className={styles.partsHead}>
            <span className={styles.kicker} style={{ color: "#c8d8ff" }}>PARTS</span>
            <span className={styles.partsFile}>
              <span className={styles.oneLine}>{model?.fileName ?? "OrbitEarbuds.obj"}</span>
              {model && <button type="button" className={styles.textLink} onClick={useSampleModel}>Use sample</button>}
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className={styles.partsPreview}>{model ? <img className={styles.slideImg} src={model.whole} alt={`${model.fileName} preview`} /> : <PartDiagram selected={null} onPick={() => {}} />}</div>
          <div className={`${styles.chips} ${styles.chipsScroll}`}>
            {model
              ? model.parts.map((p) => <span key={p.name} className={styles.chip}>{p.name}</span>)
              : MODEL.parts.map((p) => <span key={p.id} className={styles.chip}>{p.id === "shell" ? "Shell" : PART_LABELS[p.id]}</span>)}
          </div>
        </div>
        <Foot next={<button type="button" className={styles.outlineBtn} onClick={() => go({ name: "m-section", index: 0 })}>NEXT <Arrow /></button>} />
      </>
    );
  }

  if (screen.name === "m-section") {
    const s = config.sections[screen.index];
    const file = config.sectionFiles[s.id];
    const busy = formatting === s.id;
    const hasInput = !!(config.notes[s.id] ?? "").trim() || !!file;
    const setRow = (i: number, patch: Partial<Row>) => updateSection(s.id, (x) => ({ ...x, rows: x.rows.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
    body = (
      <>
        <div className={styles.guide}><h1>{s.label.toUpperCase()}</h1><p>{PROMPTS[s.id] ?? "Describe this part of your product"}</p></div>
        <div className={styles.progressAt}>{stepper}</div>
        <div
          className={`${styles.card} ${styles.manualLeft} ${styles.inputCard}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); attachSectionFile(s.id, e.dataTransfer.files); }}
        >
          <label className={styles.cardTitle} htmlFor="paste">TYPE, PASTE, OR UPLOAD HERE</label>
          <div className={styles.inputBox}>
            {file && (
              <div className={styles.fileChip}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                <span className={styles.fileChipText}><b>{file}</b><span>{(file.split(".").pop() ?? "").toUpperCase()}</span></span>
                <button type="button" aria-label={`Remove ${file}`} onClick={() => removeSectionFile(s.id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            )}
            <textarea id="paste" className={styles.inputText} placeholder={file ? "Add notes, or paste text here" : "Type here"} value={config.notes[s.id] ?? ""} onChange={(e) => save({ ...config, notes: { ...config.notes, [s.id]: e.target.value } })} />
            <FileButton accept={DOC_ACCEPT} className={styles.attachBtn} disabled={!!file} onFile={(f) => attachSectionFile(s.id, f)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
              ATTACH PDF
            </FileButton>
          </div>
          <div className={styles.inputFoot}>
            <p className={styles.cardFoot}>pdf (up to 4MB), txt, md</p>
            <button type="button" className={styles.submitBtn} disabled={!hasInput || busy} onClick={() => formatSection(s.id)}>
              {busy ? "FORMATTING…" : "SUBMIT"} <Arrow />
            </button>
          </div>
        </div>
        <div className={`${styles.card} ${styles.manualRight} ${styles.previewCard}`} data-editing={editingPreview ? "" : undefined}>
          <div className={styles.previewHead}>
            <span className={styles.previewTitle}>AI PREVIEW · KIOSK PANEL</span>
            <span className={styles.previewBtns}>
              <button type="button" className={styles.smallPill} onClick={() => { updateSection(s.id, () => sampleSection(s.id)); setNotice("Restored the sample content for this section."); }}>REGENERATE</button>
              <button type="button" className={styles.smallPill} aria-pressed={editingPreview} onClick={() => setEditingPreview((v) => !v)}>{editingPreview ? "DONE" : "EDIT"}</button>
            </span>
          </div>
          {editingPreview ? (
            <div className={styles.previewBox}>
              <div className={styles.cellGrid}>
                <Cell span label="Headline" value={s.title} onChange={(v) => updateSection(s.id, (x) => ({ ...x, title: v }))} />
                {s.rows.map((r, i) => [
                  <Cell key={`a${i}`} widen label={`Row ${i + 1} name`} value={r.a} onChange={(v) => setRow(i, { a: v })} />,
                  <Cell key={`b${i}`} label={`What ${r.a || `row ${i + 1}`} does`} placeholder="One line" value={r.b} onChange={(v) => setRow(i, { b: v })} />,
                ])}
              </div>
              {s.rows.length < MAX_ROWS && <button type="button" className={styles.dashedBtn} onClick={() => updateSection(s.id, (x) => ({ ...x, rows: [...x.rows, { a: "", b: "" }].slice(0, MAX_ROWS) }))}>+ ADD ROW</button>}
            </div>
          ) : (
            <Clamp scroll className={styles.fill} title={`AI preview · ${s.label}`} full={<SectionFull section={s} />}>
              <KioskPreview flat section={{ ...s, label: `${String(screen.index + 1).padStart(2, "0")} · ${s.label}` }} />
            </Clamp>
          )}
          {busy && (
            <div className={styles.previewBusy} role="status">
              <span className={styles.spinner} />
              <b>Formatting {file ?? "your notes"}…</b>
              <span>The AI is writing a headline and up to {MAX_ROWS} rows for {s.label}.</span>
            </div>
          )}
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
          <button type="button" className={styles.outlineBtn} onClick={finish} disabled={publishing}>{publishing ? "PUBLISHING…" : "PUBLISH TO KIOSK"} <Arrow /></button>
        </>} />
      </>
    );
  }

  return (
    <MoreContext.Provider value={setMore}>
    <CellLayer.Provider value={{ layer: cellLayer, scale }}>
    <main className={styles.viewport}>
      <div className={styles.stage} style={{ transform: `scale(${scale})` }}>
        <div aria-hidden="true" className={styles.frame} />
        <div className={styles.eyebrow}>{config.productName.toUpperCase()} / SET UP YOUR DEMO</div>
        <button type="button" className={styles.restartBtn} onClick={() => setConfirmRestart(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          RESTART
        </button>
        <div className={styles.modeSwitch} role="tablist" aria-label="Setup mode">
          <button type="button" role="tab" aria-selected={mode === "auto"} onClick={() => switchMode("auto")}>AUTO</button>
          <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => switchMode("manual")}>MANUAL</button>
        </div>
        {body}
        <div ref={setCellLayer} className={styles.cellLayer} />
        {notice && <div role="status" className={styles.toast}>{notice}</div>}
        {more && <Modal title={more.title} onClose={() => setMore(null)}>{more.content}</Modal>}
        {published && (
          <Modal
            title="Published to the kiosk"
            onClose={() => setPublished(null)}
            actions={<>
              <button type="button" className={styles.outlineBtnDim} onClick={() => setPublished(null)}>KEEP EDITING</button>
              <a className={styles.outlineBtn} href="/" target="_blank" rel="noopener noreferrer">OPEN THE KIOSK <Arrow /></a>
            </>}
          >
            <p className={styles.modalText}>
              {published.server
                ? "The kiosk now shows your sections, gestures and model on any device that opens this site. Kiosks that are already open pick it up within a minute."
                : `Saved in this browser: a kiosk opened in this same browser shows it now. It isn’t online yet, so kiosks on other devices still show the previous demo. Reason: ${published.note}.`}
            </p>
          </Modal>
        )}
        {confirmRestart && (
          <Modal
            title="Start over?"
            onClose={() => setConfirmRestart(false)}
            actions={<>
              <button type="button" className={styles.outlineBtnDim} onClick={() => setConfirmRestart(false)}>CANCEL</button>
              <button type="button" className={styles.dangerBtn} onClick={restart}>CLEAR EVERYTHING</button>
            </>}
          >
            <p className={styles.modalText}>This clears every section, gesture and setting, and removes the uploaded product doc and 3D model from this browser. It can’t be undone. The kiosk keeps showing what you last published until you publish again.</p>
          </Modal>
        )}
      </div>
    </main>
    </CellLayer.Provider>
    </MoreContext.Provider>
  );
}

// What visitors will see for a section, in the kiosk's panel style.
function KioskPreview({ section, small, flat }: { section: Section; small?: boolean; flat?: boolean }) {
  return (
    <div className={`${styles.kioskPreview} ${small ? styles.kioskPreviewSmall : ""} ${flat ? styles.kioskPreviewFlat : ""}`}>
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
