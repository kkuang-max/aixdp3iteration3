// A product drawn as an exploded, sliced 3D model. Each part is extruded into Z by
// stacking 2D slices that shrink towards the part's half-depth, which reads as a
// soft 3D volume under CSS perspective.

type Tone = "pearl" | "soft" | "metal";

export type ModelPart<Id extends string> = {
  id: Id;
  d: string; // outline (SVG path, may have holes: drawn with fill-rule evenodd)
  hd: number; // half-depth in Z
  k: number; // how much slices shrink towards the edges
  o: [number, number]; // scale origin
  tp?: number; // top of the sheen highlight, if any
  tone?: Tone;
  zc?: number; // depth centre
  ze?: number; // extra depth when exploded
};

export type ModelGeometry<Id extends string> = {
  vbw: number; // width of the model's coordinate space
  zm: number; // depth extent
  parts: ModelPart<Id>[];
  off: Record<Id, [number, number]>; // where each part moves when fully exploded
};

export type ModelPath = { key: string; part: string; d: string; tf: string; fill: string; stroke: string; sw: number; op: number };
export type ModelSlice = { z: string; paths: ModelPath[] };

const TONES: Record<Tone, [string, string]> = {
  pearl: ["#F8F3F1", "#A3949F"],
  soft: ["#E6E3EE", "#8F889E"],
  metal: ["#C7CBD6", "#555A6B"],
};

const hx = (h: string) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
const mix = (a: string, b: string, t: number) =>
  "#" +
  hx(a)
    .map((v, j) => Math.round(v + (hx(b)[j] - v) * t).toString(16).padStart(2, "0"))
    .join("");

export function buildModel<Id extends string>(o: {
  geo: ModelGeometry<Id>;
  w: number; // rendered width
  accent: string;
  explode: number; // 0 assembled → 1 exploded
  highlight: readonly Id[];
  pull?: Id | null; // a part held by the visitor: pulled further out than the rest
}): ModelSlice[] {
  const G = o.geo;
  const k = o.w / G.vbw;
  const N = 22;
  const zm = G.zm;
  const step = (2 * zm) / (N - 1);
  const slices: ModelSlice[] = [];

  for (let i = 0; i < N; i++) {
    const z = -zm + step * i;
    const paths: ModelPath[] = [];
    for (const p of G.parts) {
      const e = o.pull === p.id ? o.explode + 0.55 : o.explode;
      const dz = z - ((p.zc ?? 0) + (p.ze ?? 0) * e);
      if (Math.abs(dz) > p.hd) continue;
      const front = dz + step > p.hd;
      const on = o.highlight.includes(p.id);
      const s = 1 - p.k * Math.pow(dz / p.hd, 2);
      const [ox, oy] = G.off[p.id] ?? [0, 0];
      const tf = `translate(${(ox * e).toFixed(1)},${(oy * e).toFixed(1)}) translate(${p.o[0]},${p.o[1]}) scale(${s.toFixed(3)}) translate(${-p.o[0]},${-p.o[1]})`;
      const [light, dark] = TONES[p.tone ?? "pearl"];
      const shade = front ? light : mix(dark, light, 0.25 + 0.6 * ((z + zm) / (2 * zm)));
      // The selected part keeps its own colours; when something is selected, everything else goes see-through.
      const c = shade;
      const op = !on && o.highlight.length ? 0.16 : 1;
      let n = 0;
      const push = (x: Omit<ModelPath, "key" | "d" | "tf" | "part"> & { tf?: string }) => paths.push({ d: p.d, tf, ...x, part: p.id, key: `${p.id}-${n++}` });
      push({ fill: c, stroke: front ? mix(light, dark, 0.35) : c, sw: front ? 1.2 : 2.4, op });
      if (front && p.tp != null) {
        const tp = p.tp;
        push({
          fill: "#FFFFFF",
          stroke: "none",
          sw: 0,
          op: 0.35 * op,
          tf: `${tf} translate(${p.o[0]},${tp}) scale(0.78,0.42) translate(${-p.o[0]},${-tp})`,
        });
      }
    }
    slices.push({ z: (z * k).toFixed(1), paths });
  }
  return slices;
}
