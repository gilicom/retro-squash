/**
 * @module render3d/player3d
 * Articulated low-poly player: hips, torso, head, two legs (hip + knee),
 * two arms (shoulder + elbow) and a racket in the right hand. All joints
 * are plain THREE.Group pivots animated procedurally from the Player's
 * movement and swing state, so no animation files are needed.
 *
 * The model is built facing -z (toward the front wall).
 */
import * as THREE from 'three';
import { stringsTexture } from './textures.js';

const SKIN = 0xe3b48c;
const SHORTS = 0x1e2430;
const SHOE = 0xf4f4f4;

let stringsTex = null;

function capsule(r, len, material, y = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), material);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

function pivot(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export class PlayerModel {
  /**
   * @param {number} color jersey colour
   */
  constructor(color) {
    this.root = new THREE.Group();
    const jersey = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });
    const shorts = new THREE.MeshStandardMaterial({ color: SHORTS, roughness: 0.8 });
    const shoe = new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.5 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9 });

    // Hips are the animation anchor; everything hangs from here.
    this.hips = pivot(0, 0.95, 0);
    this.root.add(this.hips);

    // Torso and head.
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    this.torso.add(capsule(0.16, 0.22, jersey, 0.3));
    this.torso.add(capsule(0.175, 0.06, shorts, -0.02));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), skin);
    head.position.y = 0.73;
    head.castShadow = true;
    this.torso.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.y = 0.745;
    this.torso.add(cap);
    // Headband in jersey colour.
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.014, 8, 24), jersey);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.77;
    this.torso.add(band);

    // Legs.
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = pivot(side * 0.1, 0, 0);
      this.hips.add(hip);
      hip.add(capsule(0.07, 0.26, shorts, -0.2));
      const knee = pivot(0, -0.42, 0);
      hip.add(knee);
      knee.add(capsule(0.06, 0.28, skin, -0.2));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), shoe);
      foot.position.set(0, -0.5, -0.05);
      foot.castShadow = true;
      knee.add(foot);
      this.legs.push({ hip, knee });
    }

    // Arms.
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = pivot(side * 0.22, 0.5, 0);
      this.torso.add(shoulder);
      shoulder.add(capsule(0.05, 0.18, jersey, -0.12));
      const elbow = pivot(0, -0.26, 0);
      shoulder.add(elbow);
      elbow.add(capsule(0.045, 0.18, skin, -0.12));
      const hand = pivot(0, -0.26, 0);
      elbow.add(hand);
      hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skin));
      this.arms.push({ shoulder, elbow, hand, side });
    }

    // Racket in the right hand, continuing the forearm direction (-y of the hand).
    this.racket = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 10), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }));
    grip.position.y = -0.1;
    grip.castShadow = true;
    this.racket.add(grip);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.5, metalness: 0.4 }));
    shaft.position.y = -0.3;
    this.racket.add(shaft);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.012, 8, 28), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.5 }));
    frame.scale.set(1, 1.25, 1);
    frame.position.y = -0.53;
    frame.castShadow = true;
    this.racket.add(frame);
    if (!stringsTex) stringsTex = stringsTexture();
    const strings = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.3),
      new THREE.MeshBasicMaterial({ map: stringsTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    strings.position.y = -0.53;
    this.racket.add(strings);
    this.arms[1].hand.add(this.racket);

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.facing = 0;
  }

  /**
   * Pose the model from the simulation state.
   * @param {import('../entities/player.js').Player} p
   * @param {{x:number,y:number,z:number}} ball
   * @param {number} dt
   */
  update(p, ball, dt) {
    const r = this.root;
    r.position.set(p.x, 0, p.z);

    const speed = Math.hypot(p.vx, p.vz);
    const run = clamp(speed / 3.5, 0, 1);
    const ph = p.runPhase;

    // Facing: toward the front wall, leaning into the run direction; twist toward the swing.
    let face = 0;
    if (speed > 0.4) face = Math.atan2(p.vx, -p.vz) * 0.45;
    const swingT = p.swing > 0 ? 1 - p.swing : -1;
    const side = p.swingSide;
    if (swingT >= 0) face += side * 0.55 * Math.sin(Math.PI * clamp(swingT, 0, 1));
    this.facing = lerp(this.facing, face, Math.min(1, dt * 10));
    r.rotation.y = this.facing;

    // Body bob and lean.
    this.hips.position.y = 0.95 - run * 0.06 + Math.abs(Math.sin(ph)) * 0.035 * run;
    this.torso.rotation.x = -0.12 - run * 0.18;
    this.torso.rotation.y = swingT >= 0 ? side * 0.35 * Math.sin(Math.PI * clamp(swingT, 0, 1)) : 0;

    // Legs: alternate hip swing with knee bend on the back-swing.
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const { hip, knee } = this.legs[i];
      const sw = Math.sin(ph + (i === 0 ? 0 : Math.PI));
      hip.rotation.x = sw * 0.75 * run - 0.05;
      knee.rotation.x = clamp(-sw, 0, 1) * 1.1 * run + 0.08;
      hip.rotation.z = s * 0.02;
    }

    // Left (non-racket) arm: counter-swings while running, relaxed otherwise.
    const la = this.arms[0];
    la.shoulder.rotation.x = Math.sin(ph) * 0.55 * run + 0.2;
    la.shoulder.rotation.z = 0.25;
    la.elbow.rotation.x = 0.7;

    // Right (racket) arm.
    const ra = this.arms[1];
    if (swingT >= 0) {
      const t = clamp(swingT, 0, 1);
      // Keyframes: backswing -> contact (t=0.3) -> follow-through (t=0.75) -> ready.
      let yaw, lift, bend;
      const fore = side > 0;
      const k0 = fore ? -2.0 : 1.6, k1 = fore ? -0.9 : 0.6, k2 = fore ? 0.7 : -1.3, k3 = -0.35;
      if (t < 0.3) { const u = smooth(t / 0.3); yaw = lerp(k0, k1, u); lift = lerp(0.9, 1.25, u); bend = lerp(0.9, 0.15, u); }
      else if (t < 0.75) { const u = smooth((t - 0.3) / 0.45); yaw = lerp(k1, k2, u); lift = lerp(1.25, 1.7, u); bend = lerp(0.15, 0.5, u); }
      else { const u = smooth((t - 0.75) / 0.25); yaw = lerp(k2, k3, u); lift = lerp(1.7, 1.0, u); bend = lerp(0.5, 0.9, u); }
      // Reach down for low balls, up for high ones.
      const h = clamp(ball.y, 0.1, 2.2);
      const liftAdj = (1.1 - h) * 0.7;
      ra.shoulder.rotation.set(lift + liftAdj * (t < 0.6 ? 1 : 0.4), yaw, fore ? -0.2 : 0.2);
      ra.elbow.rotation.x = bend;
      this.racket.rotation.set(0, fore ? 0.4 : -0.4, 0);
    } else {
      // Ready position: racket up in front of the body.
      ra.shoulder.rotation.set(0.95 + Math.sin(ph) * 0.1 * run, -0.35, -0.3);
      ra.elbow.rotation.x = 1.15;
      this.racket.rotation.set(-0.3, 0.3, 0);
    }
  }
}
