/**
 * @module render3d/body3d
 * Builds the player body: a procedural humanoid with tapered limbs, joint
 * spheres, a shaped torso with a textured jersey, neck, head with eyes and
 * hair, socks, shoes, wrist bands and a headband. Returns the pivot groups
 * the animation drives.
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

/** Jersey texture: base colour, a lighter diagonal chest band and a number on the back. */
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
  // Lathe UV: u runs around the body (0 = front centre... front/back split at u 0.25/0.75), v from hips (0) to shoulders (1).
  // Chest band on the front half.
  ctx.fillStyle = `#${light.getHexString()}`;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.42); ctx.lineTo(size * 0.5, size * 0.52); ctx.lineTo(size * 0.5, size * 0.42); ctx.lineTo(0, size * 0.32); ctx.closePath();
  ctx.fill();
  // Dark side panels.
  ctx.fillStyle = `#${dark.getHexString()}`;
  ctx.fillRect(size * 0.22, 0, size * 0.06, size);
  ctx.fillRect(size * 0.72, 0, size * 0.06, size);
  // Number on the back half.
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

/** Tapered limb segment: a cylinder from radius r0 (top) to r1 (bottom) hanging along -y, plus a joint sphere at the top. */
function limb(r0, r1, len, material, jointMaterial = material) {
  const g = new THREE.Group();
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 14), material);
  seg.position.y = -len / 2;
  seg.castShadow = true;
  g.add(seg);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.02, 14, 10), jointMaterial);
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
  const jersey = new THREE.MeshStandardMaterial({ map: jerseyTexture(color, opts.number ?? 7), roughness: 0.8 });
  const jerseyPlain = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.65 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
  const sole = new THREE.MeshStandardMaterial({ color: opts.shoe ?? 0x2b2f3a, roughness: 0.5 });
  const hair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });

  const root = new THREE.Group();
  const hips = pivot(0, 0.95, 0);
  root.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);

  // Shorts: lathe around the hips, from the waist down over the upper thighs.
  const shortsGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.175, -0.26), new THREE.Vector2(0.19, -0.14), new THREE.Vector2(0.18, -0.02), new THREE.Vector2(0.165, 0.06),
  ], 20);
  const shortsMesh = new THREE.Mesh(shortsGeo, shorts);
  shortsMesh.castShadow = true;
  torso.add(shortsMesh);

  // Torso: lathe profile from the waist to the shoulders (wider at the chest).
  const torsoGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.155, 0.04), new THREE.Vector2(0.15, 0.14), new THREE.Vector2(0.165, 0.28),
    new THREE.Vector2(0.185, 0.4), new THREE.Vector2(0.17, 0.5), new THREE.Vector2(0.08, 0.54),
  ], 24);
  const torsoMesh = new THREE.Mesh(torsoGeo, jersey);
  torsoMesh.rotation.y = Math.PI; // put the number on the back (+z)
  torsoMesh.castShadow = true;
  torso.add(torsoMesh);
  // Shoulder caps (sleeves).
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.078, 14, 10), jerseyPlain);
    cap.position.set(s * 0.19, 0.47, 0);
    cap.scale.set(1, 0.9, 1);
    cap.castShadow = true;
    torso.add(cap);
  }
  // Neck and head.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), skin);
  neck.position.y = 0.57;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.73;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), skin);
  skull.scale.set(1, 1.12, 1.02);
  skull.castShadow = true;
  head.add(skull);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
  cap.scale.set(1, 1.12, 1.02);
  cap.position.y = 0.012;
  head.add(cap);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), dark);
    eye.position.set(s * 0.038, 0.02, -0.095);
    head.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), skin);
    ear.position.set(s * 0.105, 0.0, 0);
    ear.scale.set(0.6, 1, 0.8);
    head.add(ear);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.013, 8, 28), jerseyPlain);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.05;
  band.scale.set(1, 1, 1.02);
  head.add(band);

  // Legs: hip -> knee -> foot.
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = pivot(side * 0.1, 0, 0);
    hips.add(hip);
    hip.add(limb(0.085, 0.066, THIGH, skin, shorts));
    const thighShort = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.09, 0.2, 14), shorts);
    thighShort.position.y = -0.1;
    thighShort.castShadow = true;
    hip.add(thighShort);
    const knee = pivot(0, -THIGH, 0);
    hip.add(knee);
    knee.add(limb(0.066, 0.045, SHIN - 0.06, skin, skin));
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.05, 0.08, 12), white);
    sock.position.y = -(SHIN - 0.08);
    knee.add(sock);
    const foot = new THREE.Group();
    foot.position.y = -(SHIN - 0.035);
    knee.add(foot);
    const shoeUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.16, 4, 10), white);
    shoeUpper.rotation.x = Math.PI / 2;
    shoeUpper.position.set(0, 0.0, -0.06);
    shoeUpper.scale.set(1, 1, 0.7);
    shoeUpper.castShadow = true;
    foot.add(shoeUpper);
    const shoeSole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.27), sole);
    shoeSole.position.set(0, -0.035, -0.06);
    foot.add(shoeSole);
    legs.push({ hip, knee, foot, side });
  }

  // Arms: shoulder -> elbow -> hand.
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = pivot(side * 0.21, 0.47, 0);
    torso.add(shoulder);
    shoulder.add(limb(0.052, 0.044, UPPER_ARM, skin, jerseyPlain));
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.058, 0.1, 12), jerseyPlain);
    sleeve.position.y = -0.05;
    shoulder.add(sleeve);
    const elbow = pivot(0, -UPPER_ARM, 0);
    shoulder.add(elbow);
    elbow.add(limb(0.044, 0.036, FOREARM - 0.03, skin, skin));
    const wristBand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 12), white);
    wristBand.position.y = -(FOREARM - 0.045);
    elbow.add(wristBand);
    const hand = pivot(0, -FOREARM, 0);
    elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), skin);
    palm.scale.set(0.8, 1.1, 0.6);
    palm.position.y = -0.03;
    palm.castShadow = true;
    hand.add(palm);
    arms.push({ shoulder, elbow, hand, side });
  }

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, hips, torso, head, legs, arms };
}
