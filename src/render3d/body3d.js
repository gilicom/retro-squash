/**
 * @module render3d/body3d
 * Builds the player body: a procedural humanoid with muscled lathe limbs,
 * joint spheres, an elliptical torso with a textured jersey, neck, a head
 * with jaw, nose, eyes, brows, ears and hair, hands with a thumb, striped
 * shorts and socks, shoes with a toe cap and sole, wrist bands and a
 * headband. Returns the pivot groups the animation drives.
 *
 * Proportions (metres): hips 0.95, shoulders 1.45, head centre 1.68,
 * upper arm 0.26, forearm 0.26, thigh 0.42, shin 0.50.
 *
 * Pivot conventions: every limb segment hangs along -y from its pivot, the
 * model faces -z, +x is the player's right.
 */
import * as THREE from 'three';

export const UPPER_ARM = 0.26;
export const FOREARM = 0.26;
export const THIGH = 0.42;
export const SHIN = 0.50;

/** Jersey texture: base colour, a lighter diagonal chest band, dark side panels and a number on the back. */
function jerseyTexture(color, number) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(color);
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const dark = base.clone().lerp(new THREE.Color(0x000000), 0.35);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  // Subtle fabric weave.
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < size; y += 3) ctx.fillRect(0, y, size, 1);
  ctx.fillStyle = `#${light.getHexString()}`;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.42); ctx.lineTo(size * 0.5, size * 0.52); ctx.lineTo(size * 0.5, size * 0.42); ctx.lineTo(0, size * 0.32); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `#${dark.getHexString()}`;
  ctx.fillRect(size * 0.22, 0, size * 0.06, size);
  ctx.fillRect(size * 0.72, 0, size * 0.06, size);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.3}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), size * 0.75, size * 0.4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Shorts texture: dark with a side stripe in the jersey colour. */
function shortsTexture(color) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1e2430';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(size * 0.235, 0, size * 0.03, size);
  ctx.fillRect(size * 0.735, 0, size * 0.03, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Skin texture: slight noise so the surface is not perfectly flat. */
function skinTexture(color) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 0.8;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Muscled limb segment hanging along -y: a lathe through (radius, y) profile
 * points, with a joint sphere at the top. The profile runs from the top
 * (y = 0) to the bottom (y = -len).
 */
function limb(profile, len, material, jointRadius, jointMaterial = material) {
  const g = new THREE.Group();
  const pts = profile.map(([r, t]) => new THREE.Vector2(r, -t * len));
  const seg = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), material);
  seg.castShadow = true;
  g.add(seg);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(jointRadius, 16, 12), jointMaterial);
  joint.castShadow = true;
  g.add(joint);
  return g;
}

function pivot(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

/**
 * @param {{color:number, number?:number, skin?:number, hair?:number, shoe?:number}} opts
 * @returns {{root:THREE.Group, hips:THREE.Group, torso:THREE.Group, head:THREE.Group, legs:Array, arms:Array}}
 */
export function buildBody(opts) {
  const color = opts.color;
  const skinColor = opts.skin ?? 0xe3b48c;
  const hairColor = opts.hair ?? 0x2a1c12;
  const jersey = new THREE.MeshStandardMaterial({ map: jerseyTexture(color, opts.number ?? 7), roughness: 0.85 });
  const jerseyPlain = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ map: skinTexture(skinColor), roughness: 0.58 });
  const shorts = new THREE.MeshStandardMaterial({ map: shortsTexture(color), roughness: 0.9 });
  const shortsPlain = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
  const sole = new THREE.MeshStandardMaterial({ color: opts.shoe ?? 0x2b2f3a, roughness: 0.5 });
  const hair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 });

  const root = new THREE.Group();
  const hips = pivot(0, 0.95, 0);
  root.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);

  // Pelvis + shorts: lathe from the upper thighs to the waist, elliptical.
  const shortsGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.17, -0.27), new THREE.Vector2(0.19, -0.16), new THREE.Vector2(0.19, -0.04), new THREE.Vector2(0.165, 0.06),
  ], 28);
  const shortsMesh = new THREE.Mesh(shortsGeo, shorts);
  shortsMesh.scale.z = 0.78;
  shortsMesh.rotation.y = Math.PI;
  shortsMesh.castShadow = true;
  torso.add(shortsMesh);

  // Torso: waist, ribcage, chest, upper chest, trapezius; elliptical cross-section.
  const torsoGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.15, 0.04), new THREE.Vector2(0.145, 0.12), new THREE.Vector2(0.16, 0.22), new THREE.Vector2(0.18, 0.33),
    new THREE.Vector2(0.19, 0.41), new THREE.Vector2(0.175, 0.48), new THREE.Vector2(0.11, 0.53), new THREE.Vector2(0.06, 0.55),
  ], 32);
  const torsoMesh = new THREE.Mesh(torsoGeo, jersey);
  torsoMesh.scale.z = 0.72;
  torsoMesh.rotation.y = Math.PI; // number on the back (+z)
  torsoMesh.castShadow = true;
  torso.add(torsoMesh);
  // Deltoids / sleeves.
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), jerseyPlain);
    cap.position.set(s * 0.195, 0.465, 0);
    cap.scale.set(1, 0.85, 0.9);
    cap.castShadow = true;
    torso.add(cap);
  }
  // Neck.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.1, 14), skin);
  neck.position.y = 0.575;
  torso.add(neck);

  // Head: skull, jaw, nose, eyes with pupils, brows, ears, hair, headband.
  const head = new THREE.Group();
  head.position.y = 0.73;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 18), skin);
  skull.scale.set(1, 1.08, 1.05);
  skull.position.y = 0.01;
  skull.castShadow = true;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 14), skin);
  jaw.scale.set(1.05, 0.9, 1.0);
  jaw.position.set(0, -0.045, -0.015);
  head.add(jaw);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 8), skin);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, -0.005, -0.105);
  head.add(nose);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), eyeWhite);
    eye.position.set(s * 0.036, 0.02, -0.088);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), dark);
    pupil.position.set(s * 0.036, 0.02, -0.102);
    head.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008, 0.01), hair);
    brow.position.set(s * 0.036, 0.048, -0.092);
    brow.rotation.z = -s * 0.15;
    head.add(brow);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), skin);
    ear.position.set(s * 0.1, 0.0, 0.005);
    ear.scale.set(0.5, 1, 0.8);
    head.add(ear);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.106, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  cap.scale.set(1, 1.08, 1.05);
  cap.position.set(0, 0.02, 0.008);
  head.add(cap);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.013, 8, 32), jerseyPlain);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.05;
  band.scale.set(1, 1, 1.05);
  head.add(band);

  // Legs: hip -> knee -> foot, with quad and calf shapes.
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = pivot(side * 0.1, 0, 0);
    hips.add(hip);
    hip.add(limb([[0.085, 0], [0.088, 0.25], [0.08, 0.6], [0.066, 1]], THIGH, skin, 0.08, shortsPlain));
    const thighShort = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.093, 0.21, 16), shorts);
    thighShort.position.y = -0.105;
    thighShort.castShadow = true;
    hip.add(thighShort);
    const knee = pivot(0, -THIGH, 0);
    hip.add(knee);
    knee.add(limb([[0.062, 0], [0.07, 0.2], [0.066, 0.42], [0.048, 0.75], [0.042, 0.88]], SHIN - 0.06, skin, 0.062));
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.05, 0.1, 14), white);
    sock.position.y = -(SHIN - 0.09);
    knee.add(sock);
    const sockStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0455, 0.047, 0.012, 14), jerseyPlain);
    sockStripe.position.y = -(SHIN - 0.125);
    knee.add(sockStripe);
    const foot = new THREE.Group();
    foot.position.y = -(SHIN - 0.035);
    knee.add(foot);
    const shoeUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.047, 0.15, 6, 12), white);
    shoeUpper.rotation.x = Math.PI / 2;
    shoeUpper.position.set(0, 0.0, -0.055);
    shoeUpper.scale.set(1, 1, 0.72);
    shoeUpper.castShadow = true;
    foot.add(shoeUpper);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), sole);
    toe.position.set(0, -0.01, -0.145);
    toe.scale.set(1, 0.6, 0.8);
    foot.add(toe);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.1), jerseyPlain);
    stripe.position.set(0, 0.015, -0.05);
    foot.add(stripe);
    const shoeSole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.27), sole);
    shoeSole.position.set(0, -0.036, -0.06);
    foot.add(shoeSole);
    legs.push({ hip, knee, foot, side });
  }

  // Arms: shoulder -> elbow -> hand, with biceps and forearm shapes.
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = pivot(side * 0.21, 0.47, 0);
    torso.add(shoulder);
    shoulder.add(limb([[0.052, 0], [0.056, 0.3], [0.05, 0.65], [0.042, 1]], UPPER_ARM, skin, 0.05, jerseyPlain));
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.06, 0.11, 14), jerseyPlain);
    sleeve.position.y = -0.055;
    shoulder.add(sleeve);
    const elbow = pivot(0, -UPPER_ARM, 0);
    shoulder.add(elbow);
    elbow.add(limb([[0.042, 0], [0.047, 0.25], [0.04, 0.6], [0.033, 0.88]], FOREARM - 0.03, skin, 0.043));
    const wristBand = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.04, 14), white);
    wristBand.position.y = -(FOREARM - 0.045);
    elbow.add(wristBand);
    const hand = pivot(0, -FOREARM, 0);
    elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), skin);
    palm.scale.set(0.75, 1.15, 0.5);
    palm.position.y = -0.035;
    palm.castShadow = true;
    hand.add(palm);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.03, 4, 8), skin);
    thumb.position.set(-side * 0.03, -0.025, -0.012);
    thumb.rotation.z = side * 0.9;
    hand.add(thumb);
    arms.push({ shoulder, elbow, hand, side });
  }

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, hips, torso, head, legs, arms };
}
