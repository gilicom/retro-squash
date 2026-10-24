/**
 * @module render3d/racket3d
 * A squash racket built from primitives, to real proportions: 68.5 cm long,
 * teardrop head (about 27 x 20 cm), open throat, slim graphite shaft, long
 * grip with a wrapped texture, bumper strip at the top and a tight string bed.
 *
 * Local frame: the hand holds the top of the grip at the origin; the racket
 * extends along -y, so the string bed centre is near y = -0.55. The string
 * face normal is +z.
 */
import * as THREE from 'three';

/** Head outline (half, from the tip down to the throat), metres, local x/y. */
const HALF_OUTLINE = [
  [0.0, 0.14], [0.045, 0.133], [0.082, 0.105], [0.1, 0.055], [0.1, 0.0],
  [0.092, -0.05], [0.072, -0.095], [0.045, -0.125], [0.018, -0.14],
];

/** Full closed outline, clockwise, as Vector2. */
function headOutline() {
  const right = HALF_OUTLINE.map(([x, y]) => new THREE.Vector2(x, y));
  const left = HALF_OUTLINE.slice(1, -1).reverse().map(([x, y]) => new THREE.Vector2(-x, y));
  return right.concat(left);
}

let gripTex = null;
let stringsTex = null;

/** Dark grip wrap with lighter diagonal overlap lines. */
function gripTexture() {
  if (gripTex) return gripTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1b1d';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  for (let i = -size; i < size * 2; i += 22) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size * 0.6, size); ctx.stroke();
  }
  gripTex = new THREE.CanvasTexture(c);
  gripTex.wrapS = gripTex.wrapT = THREE.RepeatWrapping;
  gripTex.repeat.set(2, 3);
  return gripTex;
}

/** 14 x 18 string grid on a transparent background. */
function stringTexture() {
  if (stringsTex) return stringsTex;
  const w = 128, h = 176;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(245,245,240,0.95)';
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 14; i++) { const x = (w / 14) * i; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let i = 1; i < 18; i++) { const y = (h / 18) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  stringsTex = new THREE.CanvasTexture(c);
  return stringsTex;
}

/**
 * Build a racket.
 * @param {{frame?: number, accent?: number}} [opts] frame and accent colours
 * @returns {THREE.Group}
 */
export function buildRacket(opts = {}) {
  const frameColor = opts.frame ?? 0x1c1c1f;
  const accent = opts.accent ?? 0xd8232a;
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.35, metalness: 0.45 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.2 });

  // --- grip (hand at the origin, grip runs down to -0.21)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0165, 0.21, 12), new THREE.MeshStandardMaterial({ map: gripTexture(), roughness: 0.95 }));
  grip.position.y = -0.105;
  g.add(grip);
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), accentMat);
  butt.position.y = 0.0;
  g.add(butt);

  // --- shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0125, 0.14, 10), frameMat);
  shaft.position.y = -0.28;
  g.add(shaft);

  // --- open throat: two struts from the shaft top out to the head
  const headCentreY = -0.35 - 0.14 - 0.095; // throat joins the head outline near y = -0.125 (local to the head)
  for (const s of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.085, 8), frameMat);
    strut.position.set(s * 0.024, -0.39, 0);
    strut.rotation.z = -s * 0.5;
    g.add(strut);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.012, 0.014), frameMat);
  bridge.position.set(0, -0.455, 0);
  g.add(bridge);

  // --- head: tube along the teardrop outline
  const outline = headOutline();
  const pts3 = outline.map((v) => new THREE.Vector3(v.x, v.y + headCentreY, 0));
  const curve = new THREE.CatmullRomCurve3(pts3, true, 'catmullrom', 0.5);
  const head = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 0.0105, 8, true), frameMat);
  head.castShadow = true;
  g.add(head);
  // Bumper strip around the top half.
  const topPts = pts3.slice(0, 4).concat(pts3.slice(-3));
  const bumperCurve = new THREE.CatmullRomCurve3([topPts[4], topPts[5], topPts[6], topPts[0], topPts[1], topPts[2], topPts[3]], false, 'catmullrom', 0.5);
  const bumper = new THREE.Mesh(new THREE.TubeGeometry(bumperCurve, 32, 0.0125, 8, false), accentMat);
  g.add(bumper);

  // --- strings: the teardrop shape with the grid texture
  const shape = new THREE.Shape(outline.map((v) => new THREE.Vector2(v.x * 0.93, v.y * 0.94)));
  const stringGeo = new THREE.ShapeGeometry(shape, 24);
  // Map the shape's bounding box to the texture's 0..1 range.
  stringGeo.computeBoundingBox();
  const bb = stringGeo.boundingBox;
  const uv = stringGeo.attributes.uv;
  const pos = stringGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  const strings = new THREE.Mesh(stringGeo, new THREE.MeshBasicMaterial({ map: stringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  strings.position.y = headCentreY;
  g.add(strings);

  g.traverse((o) => { if (o.isMesh && o !== strings) o.castShadow = true; });
  return g;
}
