/**
 * @module render3d/player3d
 * Articulated low-poly player: hips, torso, head, two legs (hip + knee),
 * two arms (shoulder + elbow) and a racket in the right hand. All joints
 * are plain THREE.Group pivots animated procedurally from the Player's
 * movement and swing state, so no animation files are needed.
 *
 * The animation follows how squash players actually move (see docs/RENDERING.md):
 *   - a low **ready stance** on the T: knees bent, feet wide, racket up, weight
 *     on the toes, with a small split-step bounce while waiting for the ball;
 *   - **side shuffles** for lateral movement (the body stays square to the
 *     front wall, the lead leg steps out and the trailing leg closes);
 *   - short quick **running strides** with a forward lean toward the front;
 *   - **backpedalling** with the body opened toward the corner when moving
 *     back;
 *   - a deep **lunge** into the last step before the ball (front knee bent,
 *     trailing leg straight, hips low, torso over the front knee);
 *   - a **stroke** with the shoulders turned to the side wall, a high
 *     backswing, contact out in front and a follow-through across the body.
 *
 * Joint conventions (model built facing -z, toward the front wall):
 *   hip.rotation.x > 0  leg swings forward    hip.rotation.z > 0  leg moves to +x
 *   knee.rotation.x < 0 knee bends (shin trails behind the thigh)
 *   shoulder.rotation.x > 0 arm raises forward, rotation.y yaws the raised arm
 *   root.rotation.y < 0 turns the body toward the right (+x) side wall
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
/** Exponential approach used to smooth every animation parameter. */
const ease = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);

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
    this.head = new THREE.Group();
    this.head.position.y = 0.73;
    this.torso.add(this.head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), skin);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.y = 0.015;
    this.head.add(cap);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.014, 8, 24), jersey);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.04;
    this.head.add(band);

    // Legs.
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = pivot(side * 0.11, 0, 0);
      this.hips.add(hip);
      hip.add(capsule(0.07, 0.26, shorts, -0.2));
      const knee = pivot(0, -0.42, 0);
      hip.add(knee);
      knee.add(capsule(0.06, 0.28, skin, -0.2));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), shoe);
      foot.position.set(0, -0.5, -0.05);
      foot.castShadow = true;
      knee.add(foot);
      this.legs.push({ hip, knee, side });
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

    // Smoothed animation state.
    this.facing = 0;
    this.run = 0;        // 0..1 overall movement intensity
    this.lateral = 0;    // -1..1 share of movement that is sideways (signed)
    this.forward = 0;    // 0..1 share toward the front wall
    this.backward = 0;   // 0..1 share toward the back wall
    this.lunge = 0;      // 0..1 depth of the lunge into the ball
    this.lungeX = 0;     // direction of the lunge (court x component)
    this.lungeZ = -1;    // direction of the lunge (court z component)
    this.time = 0;
  }

  /**
   * Pose the model from the simulation state.
   * @param {import('../entities/player.js').Player} p
   * @param {{x:number,y:number,z:number,inPlay?:boolean}} ball
   * @param {number} dt
   */
  update(p, ball, dt) {
    const r = this.root;
    r.position.set(p.x, 0, p.z);
    this.time += dt;

    // ------------------------------------------------ movement analysis
    const speed = Math.hypot(p.vx, p.vz);
    const top = Math.max(0.5, p.speed);
    const runT = clamp(speed / (top * 0.8), 0, 1);
    const dirX = speed > 0.05 ? p.vx / speed : 0;
    const dirZ = speed > 0.05 ? p.vz / speed : 0;
    const latT = runT > 0.05 ? dirX * Math.max(0, 1 - Math.abs(dirZ) * 0.6) : 0;
    const fwdT = runT > 0.05 ? clamp(-dirZ, 0, 1) : 0;
    const bwdT = runT > 0.05 ? clamp(dirZ, 0, 1) : 0;
    // Lunge: last stride before the target while still moving quickly, or
    // reaching for a ball away from the body during the stroke.
    const distToTarget = Math.hypot(p.targetX - p.x, p.targetZ - p.z);
    const swingT = p.swing > 0 ? 1 - p.swing : -1;
    const side = p.swingSide;
    let lungeT = 0, lx = dirX, lz = dirZ;
    if (speed > 1.2 && distToTarget < 0.9) lungeT = clamp(1 - distToTarget / 0.9, 0, 1) * clamp(speed / 2.5, 0, 1);
    if (swingT >= 0 && swingT < 0.7) {
      const reach = clamp(Math.abs(ball.x - p.x) / Math.max(0.3, p.reach), 0, 1);
      const bell = Math.sin(Math.PI * clamp(swingT / 0.7, 0, 1));
      const l = (0.35 + 0.65 * reach) * bell;
      if (l > lungeT) { lungeT = l; lx = side; lz = ball.z < p.z - 0.2 ? -0.6 : 0.1; }
    }
    const rate = 10;
    this.run = ease(this.run, runT, dt, rate);
    this.lateral = ease(this.lateral, latT, dt, rate);
    this.forward = ease(this.forward, fwdT, dt, rate);
    this.backward = ease(this.backward, bwdT, dt, rate);
    this.lunge = ease(this.lunge, lungeT, dt, lungeT > this.lunge ? 14 : 6);
    if (lungeT > 0.05) { this.lungeX = ease(this.lungeX, lx, dt, 12); this.lungeZ = ease(this.lungeZ, lz, dt, 12); }
    const run = this.run, lat = this.lateral, fwd = this.forward, bwd = this.backward, lunge = this.lunge;
    const ph = p.runPhase;

    // ------------------------------------------------ facing and body height
    // Square to the front wall; open toward the corner when backpedalling;
    // shoulders turn to the side wall during the stroke (negative y = right).
    let face = 0;
    if (bwd > 0.1) face = -Math.sign(dirX || 1) * 0.5 * bwd;
    if (fwd > 0.1) face += -dirX * 0.25 * fwd;
    if (swingT >= 0) face += -side * 0.8 * Math.sin(Math.PI * clamp(swingT, 0, 1));
    this.facing = ease(this.facing, face, dt, 9);
    r.rotation.y = this.facing;

    const waiting = ball.inPlay && swingT < 0 && run < 0.15;
    const splitStep = waiting ? Math.max(0, Math.sin(this.time * 7.5)) * 0.03 : 0;
    const stanceDrop = 0.07;                              // knees bent in the ready stance
    const bob = Math.abs(Math.sin(ph)) * (0.03 * fwd + 0.02 * Math.abs(lat));
    this.hips.position.y = 0.95 - stanceDrop - run * 0.05 - lunge * 0.22 + bob + splitStep;

    // Torso: forward lean when running, over the front knee in a lunge, lean into shuffles.
    this.torso.rotation.x = 0.14 + fwd * 0.22 + bwd * 0.05 + lunge * 0.45;
    this.torso.rotation.z = -lat * 0.18 - (this.lungeX * lunge) * 0.25;
    this.torso.rotation.y = swingT >= 0 ? -side * 0.45 * Math.sin(Math.PI * clamp(swingT, 0, 1)) : 0;
    // Head stays level and looks at the ball.
    this.head.rotation.x = -this.torso.rotation.x * 0.8;
    this.head.rotation.y = ball.inPlay ? clamp(-Math.atan2(ball.x - p.x, -(ball.z - p.z) || 0.01) * 0.5 - this.facing, -0.8, 0.8) : 0;

    // ------------------------------------------------ legs
    for (let i = 0; i < 2; i++) {
      const { hip, knee, side: ls } = this.legs[i];
      const phase = ph + (i === 0 ? 0 : Math.PI);
      const sw = Math.sin(phase);
      const lift = Math.max(0, -sw); // leg is behind -> knee folds

      // Ready stance: feet wide, knees soft.
      let flex = 0.28, bend = -0.55, abd = ls * 0.14;

      // Running toward the front: short quick strides, strong knee fold behind.
      flex += sw * 0.6 * fwd;
      bend += -lift * 1.0 * fwd;
      // Backpedalling: shorter strides, legs stay under the body.
      flex += sw * 0.35 * bwd;
      bend += -lift * 0.6 * bwd;

      // Side shuffle: lead leg steps out, trailing leg closes; body stays square.
      const a = Math.abs(lat);
      if (a > 0.02) {
        const lead = Math.sign(lat) === ls;
        const stepOut = Math.max(0, Math.sin(phase));
        abd += Math.sign(lat) * (lead ? 0.28 + 0.22 * stepOut : -0.08 + 0.22 * stepOut) * a;
        bend += -stepOut * 0.35 * a;
      }

      // Lunge: the leg on the lunge side extends far toward the ball with a
      // deep bend; the other leg trails straight.
      if (lunge > 0.02) {
        const front = Math.abs(this.lungeX) > 0.35 ? Math.sign(this.lungeX) === ls : ls === (side > 0 ? -1 : 1);
        if (front) {
          flex = lerp(flex, 0.9 * Math.max(0, -this.lungeZ) + 0.25, lunge);
          abd = lerp(abd, this.lungeX * 0.95, lunge);
          bend = lerp(bend, -1.25, lunge);
        } else {
          flex = lerp(flex, -0.35 * Math.max(0, -this.lungeZ) - 0.05, lunge);
          abd = lerp(abd, -this.lungeX * 0.2 + ls * 0.1, lunge);
          bend = lerp(bend, -0.1, lunge);
        }
      }
      hip.rotation.set(flex, 0, abd);
      knee.rotation.x = bend;
    }

    // ------------------------------------------------ arms
    // Left (non-racket) arm: balances the body; pumps when running, spreads in a lunge.
    const la = this.arms[0];
    la.shoulder.rotation.x = 0.25 + Math.sin(ph) * 0.5 * fwd + Math.sin(ph) * 0.3 * bwd + lunge * 0.5;
    la.shoulder.rotation.z = 0.3 + Math.abs(lat) * 0.4 + lunge * 0.9;
    la.elbow.rotation.x = 0.7 - lunge * 0.3;

    // Right (racket) arm.
    const ra = this.arms[1];
    if (swingT >= 0) {
      const t = clamp(swingT, 0, 1);
      // Keyframes: high backswing -> contact out in front (t=0.3) -> follow-through across (t=0.75) -> ready.
      let yaw, lift, bend;
      const fore = side > 0;
      const k0 = fore ? -2.1 : 1.7, k1 = fore ? -0.8 : 0.5, k2 = fore ? 0.8 : -1.4, k3 = -0.35;
      if (t < 0.3) { const u = smooth(t / 0.3); yaw = lerp(k0, k1, u); lift = lerp(1.9, 1.25, u); bend = lerp(1.1, 0.15, u); }
      else if (t < 0.75) { const u = smooth((t - 0.3) / 0.45); yaw = lerp(k1, k2, u); lift = lerp(1.25, 1.75, u); bend = lerp(0.15, 0.55, u); }
      else { const u = smooth((t - 0.75) / 0.25); yaw = lerp(k2, k3, u); lift = lerp(1.75, 1.05, u); bend = lerp(0.55, 1.15, u); }
      // Reach down for low balls, up for high ones.
      const h = clamp(ball.y, 0.1, 2.2);
      const liftAdj = (1.1 - h) * 0.75;
      ra.shoulder.rotation.set(lift + liftAdj * (t < 0.6 ? 1 : 0.4), yaw, fore ? -0.25 : 0.25);
      ra.elbow.rotation.x = bend;
      this.racket.rotation.set(0, fore ? 0.4 : -0.4, 0);
    } else {
      // Ready position: racket up in front of the body, prepared early while moving.
      const prep = clamp(run * 0.6 + lunge, 0, 1);
      ra.shoulder.rotation.set(1.05 + prep * 0.25 + Math.sin(ph) * 0.08 * fwd, -0.35 - prep * 0.5, -0.35);
      ra.elbow.rotation.x = 1.15 + prep * 0.2;
      this.racket.rotation.set(-0.35, 0.3, 0);
    }
  }
}
