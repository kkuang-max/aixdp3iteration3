"use client";

import { useEffect, useRef, useState } from "react";
import { parseModel } from "@/lib/modelParts";
import styles from "./kiosk.module.css";

// The exhibitor's uploaded 3D model, drawn live with three.js. It sways slowly like the sample earbud; the part mapped
// to the current topic lights up (the rest dims), and the gesture's model action moves it:
//   Explode apart → parts pull away from the centre · Put back together → parts return · Zoom in → camera closes on
//   the part · Slow turn → the model turns all the way round · Highlight → just the light-up.

type Props = { name: string; data: ArrayBuffer; part: string | null; mode: string; accent: string; onFail: () => void };

const SIZE = 460; // CSS px, the same box as the sample earbud
const SWAY_S = 14; // one sway cycle, as the sample earbud
const EASE = 3.5; // how fast explode / camera moves settle (per second)

export default function LiveModel({ name, data, part, mode, accent, onFail }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ part, mode });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    target.current = { part, mode };
  }, [part, mode]);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      let parsed;
      try {
        parsed = await parseModel(name, data.slice(0));
      } catch {
        if (!disposed) failRef.current();
        return;
      }
      if (disposed || !canvasRef.current) return;
      const { root, meshes, parts } = parsed;

      const canvas = canvasRef.current;
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
      } catch {
        failRef.current();
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(SIZE, SIZE, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x2b3150, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(3, 5, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xbfd8ff, 1.2);
      rim.position.set(-4, 2, -3);
      scene.add(rim);

      // Centre the model on a turntable.
      const pivot = new THREE.Group();
      scene.add(pivot);
      const wholeBox = new THREE.Box3().setFromObject(root);
      const center = wholeBox.getCenter(new THREE.Vector3());
      const radius = Math.max(wholeBox.getSize(new THREE.Vector3()).length() / 2, 1e-4);
      root.position.sub(center);
      pivot.add(root);
      root.updateMatrixWorld(true);

      // Per part: where it sits, and which way it moves when the model comes apart.
      const info = parts.map((p, i) => {
        const box = new THREE.Box3().setFromObject(p.node);
        const c = box.getCenter(new THREE.Vector3());
        let dir = c.clone();
        if (dir.lengthSq() < (radius * 0.05) ** 2) {
          const a = (i / Math.max(parts.length, 1)) * Math.PI * 2;
          dir = new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a));
        }
        dir.normalize();
        // Movement happens in the part's parent's space.
        const parent = p.node.parent ?? root;
        const from = parent.worldToLocal(c.clone());
        const to = parent.worldToLocal(c.clone().addScaledVector(dir, radius * 0.45));
        const local = to.sub(from);
        return { ...p, home: p.node.position.clone(), away: local, center: c, size: Math.max(box.getSize(new THREE.Vector3()).length() / 2, radius * 0.08) };
      });

      // Lit and dimmed versions of each mesh's material.
      const accentColor = new THREE.Color(accent);
      const looks = new Map<import("three").Mesh, { normal: import("three").Material | import("three").Material[]; lit: import("three").Material[]; dim: import("three").Material[] }>();
      for (const m of meshes) {
        const list = Array.isArray(m.material) ? m.material : [m.material];
        looks.set(m, {
          normal: m.material,
          lit: list.map((mat) => {
            const c = mat.clone() as import("three").MeshStandardMaterial;
            if ("emissive" in c && c.emissive) { c.emissive = accentColor.clone(); c.emissiveIntensity = 0.45; }
            return c;
          }),
          dim: list.map((mat) => {
            const c = mat.clone();
            c.transparent = true;
            c.opacity = 0.18;
            c.depthWrite = false;
            return c;
          }),
        });
      }
      let shownPart: string | null | undefined;
      const applyLook = (lit: string | null) => {
        const litMeshes = new Set(info.find((p) => p.name === lit)?.meshes ?? []);
        for (const [m, look] of looks) {
          if (!litMeshes.size) m.material = look.normal;
          else m.material = litMeshes.has(m) ? (Array.isArray(look.normal) ? look.lit : look.lit[0]) : (Array.isArray(look.normal) ? look.dim : look.dim[0]);
        }
      };

      const camera = new THREE.PerspectiveCamera(30, 1, radius / 100, radius * 100);
      const viewDir = new THREE.Vector3(1, 0.55, 1.4).normalize();
      const dist = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.02;
      const camPos = viewDir.clone().multiplyScalar(dist);
      const camLook = new THREE.Vector3();
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      let explode = 0;
      let turn = 0;
      let last = performance.now();
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        const k = 1 - Math.exp(-dt * EASE);
        const { part: want, mode: how } = target.current;
        const litName = want && want !== "Whole product" && want !== "None" ? want : null;
        const focus = info.find((p) => p.name === litName);

        if (litName !== shownPart) {
          applyLook(litName);
          shownPart = litName;
        }

        // Explode
        const wantExplode = how === "Explode apart" ? 1 : how === "Put back together" ? 0 : focus ? 0.25 : 0;
        explode += (wantExplode - explode) * k;
        for (const p of info) p.node.position.copy(p.home).addScaledVector(p.away, explode);

        // Turn: slow full turn, or a gentle sway like the sample earbud
        if (how === "Slow turn") turn += dt * ((Math.PI * 2) / 20);
        const sway = how === "Slow turn" ? turn : Math.sin((now / 1000 / SWAY_S) * Math.PI * 2) * 0.55;
        pivot.rotation.y += (sway - pivot.rotation.y) * (how === "Slow turn" ? 1 : k);

        // Camera: whole model, or close on the part for Zoom in
        let wantPos = viewDir.clone().multiplyScalar(dist);
        let wantLook = new THREE.Vector3();
        if (how === "Zoom in" && focus) {
          const c = focus.center.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), pivot.rotation.y);
          wantLook = c;
          wantPos = c.clone().add(viewDir.clone().multiplyScalar((focus.size / Math.sin(THREE.MathUtils.degToRad(15))) * 1.3));
        }
        camPos.lerp(wantPos, k);
        camLook.lerp(wantLook, k);
        camera.position.copy(camPos);
        camera.lookAt(camLook);

        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(tick);
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        for (const look of looks.values()) [...look.lit, ...look.dim].forEach((m) => m.dispose());
        root.traverse((o) => {
          const mesh = o as import("three").Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
        renderer.dispose();
      };
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, [name, data, accent]);

  return <canvas ref={canvasRef} className={styles.liveModel} data-ready={ready ? "" : undefined} width={SIZE} height={SIZE} aria-hidden="true" />;
}
