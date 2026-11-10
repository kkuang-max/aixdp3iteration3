// Reads an uploaded 3D model in the browser, splits it into parts and renders each part to an image:
// on its own (big and centred) and in context (lit up inside the whole, other parts ghosted).
// Supported: .glb, .gltf (self-contained), .obj, .fbx, .stl. STEP needs exporting to GLB/OBJ first.

export type ModelPart = { name: string; image: string; context: string };
export type LoadedModel = { fileName: string; whole: string; parts: ModelPart[]; truncated: boolean };

export const MODEL_ACCEPT = ".glb,.gltf,.obj,.fbx,.stl,.step,.stp";
export const MODEL_EXT = /\.(glb|gltf|obj|fbx|stl)$/i;
export const STEP_EXT = /\.(step|stp)$/i;
const MAX_PARTS = 24;
const SIZE = 640; // rendered image size (px)

export async function buildModelParts(fileName: string, data: ArrayBuffer): Promise<LoadedModel> {
  const THREE = await import("three");
  const ext = fileName.toLowerCase().split(".").pop();

  // ---- Parse ----
  let root: import("three").Object3D;
  if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().parseAsync(data, "");
    root = gltf.scene;
  } else if (ext === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    root = new OBJLoader().parse(new TextDecoder().decode(data));
  } else if (ext === "fbx") {
    const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    root = new FBXLoader().parse(data, "");
  } else if (ext === "stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const geometry = new STLLoader().parse(data);
    root = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd9dde8, roughness: 0.6, metalness: 0.1 }));
    mesh.name = fileName.replace(/\.[^.]+$/, "");
    root.add(mesh);
  } else {
    throw new Error("Unsupported file type. Use GLB, GLTF, OBJ, FBX or STL.");
  }
  root.updateMatrixWorld(true);

  const meshes: import("three").Mesh[] = [];
  root.traverse((o) => {
    if ((o as import("three").Mesh).isMesh) meshes.push(o as import("three").Mesh);
  });
  if (!meshes.length) throw new Error("No geometry found in this file.");

  // Plain-white or missing materials read badly on the dark kiosk: give them a soft default.
  const fallback = new THREE.MeshStandardMaterial({ color: 0xd9dde8, roughness: 0.6, metalness: 0.1 });
  for (const m of meshes) if (!m.material) m.material = fallback;

  // ---- Split into parts ----
  // Use the model's own structure: the first level that has several pieces. If it is one piece, each mesh is a part.
  const hasMesh = (o: import("three").Object3D) => {
    let found = false;
    o.traverse((c) => { if ((c as import("three").Mesh).isMesh) found = true; });
    return found;
  };
  let level: import("three").Object3D = root;
  let candidates = level.children.filter(hasMesh);
  while (candidates.length === 1 && !(candidates[0] as import("three").Mesh).isMesh) {
    level = candidates[0];
    candidates = level.children.filter(hasMesh);
  }
  let nodes: import("three").Object3D[] = candidates.length > 1 ? candidates : meshes;
  const box = (o: import("three").Object3D) => new THREE.Box3().setFromObject(o);
  let truncated = false;
  if (nodes.length > MAX_PARTS) {
    // Keep the biggest pieces; tiny ones (screws, decals) are rarely worth a slide.
    const vol = (o: import("three").Object3D) => { const s = box(o).getSize(new THREE.Vector3()); return s.x * s.y * s.z; };
    nodes = [...nodes].sort((a, b) => vol(b) - vol(a)).slice(0, MAX_PARTS);
    truncated = true;
  }
  const used = new Map<string, number>();
  const nameOf = (o: import("three").Object3D, i: number) => {
    let mesh: import("three").Object3D | undefined;
    o.traverse((c) => { if (!mesh && (c as import("three").Mesh).isMesh && c.name) mesh = c; });
    const raw = (o.name || mesh?.name || `Part ${i + 1}`).replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
    const base = raw ? raw[0].toUpperCase() + raw.slice(1) : `Part ${i + 1}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n > 1 ? `${base} ${n}` : base;
  };
  const parts = nodes.map((node, i) => {
    const own: import("three").Mesh[] = [];
    node.traverse((c) => { if ((c as import("three").Mesh).isMesh) own.push(c as import("three").Mesh); });
    return { node, meshes: own, name: nameOf(node, i) };
  });

  // ---- Render ----
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
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
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);

  const frame = (b: import("three").Box3) => {
    const center = b.getCenter(new THREE.Vector3());
    const radius = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 1e-4);
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.02;
    camera.position.copy(center).add(new THREE.Vector3(1, 0.7, 1.3).normalize().multiplyScalar(dist));
    camera.near = dist / 100;
    camera.far = dist * 100;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
  };
  const shot = () => {
    renderer.render(scene, camera);
    return canvas.toDataURL("image/png");
  };

  const original = new Map(meshes.map((m) => [m, m.material]));
  const ghost = new THREE.MeshStandardMaterial({ color: 0x8d97b3, transparent: true, opacity: 0.16, depthWrite: false });
  const lit = new THREE.MeshStandardMaterial({ color: 0xc8d9ff, emissive: 0x3a5bbd, emissiveIntensity: 0.35, roughness: 0.5 });
  const restore = () => meshes.forEach((m) => { m.visible = true; m.material = original.get(m)!; });

  try {
    const wholeBox = box(root);
    frame(wholeBox);
    const whole = shot();
    const out: ModelPart[] = [];
    for (const p of parts) {
      const mine = new Set(p.meshes);
      // On its own
      meshes.forEach((m) => { m.visible = mine.has(m); });
      frame(box(p.node));
      const image = shot();
      // In context
      meshes.forEach((m) => { m.visible = true; m.material = mine.has(m) ? lit : ghost; });
      frame(wholeBox);
      const context = shot();
      restore();
      out.push({ name: p.name, image, context });
    }
    return { fileName, whole, parts: out, truncated };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
