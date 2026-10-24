/**
 * @module render3d/player3d
 * Articulated low-poly player: hips, torso, head, two legs (hip + knee) and
 * two arms (shoulder + elbow + wrist) with a squash racket in the right hand.
 * Every joint is a THREE.Group pivot posed procedurally from the Player's
 * movement and swing state; no animation files are needed.
 *
 * Movement poses follow coaching material (docs/RENDERING.md). Stroke poses
 * were taken from reference photographs in `ref/` (forehand preparation,
 * forehand contact, backhand preparation):
 *   - preparation: shoulders turned to the side wall, elbow high, racket head
 *     pointing up, free arm out for balance, knees bent, eyes on the ball;
 *   - contact: deep lunge on the leg opposite the racket side, arm extended
 *     to the ball out in front of the front foot, racket level with the
 *     ball, torso over the front knee, free arm thrown back;
 *   - follow-through: racket continues to the target and up, shoulders
 *     rotate back square to the front wall.
 *
 * Arms are posed with direction vectors in the torso frame (where the
 * elbow and the wrist should be, and where the racket should point) rather
 * than Euler angles, so poses can be read straight off a photograph.
 *
 * Model frame: built facing -z (toward the front wall); +x is the player's
 * right. root.rotation.y < 0 turns the body toward the right side wall.
 */
import * as THREE from 'three';
import { buildRacket } from './racket3d.js';

const SKIN = 0xe3b48c;
const SHORTS = 0x1e2430;
const SHOE = 0xf4f4f4;

const UPPER_ARM = 0.26;
const FOREARM = 0.26;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);

const Y_DOWN = new THREE.Vector3(0, -1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const nlerp = (a, b, t, out) => out.copy(a).lerp(b, t).normalize();

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

/**
 * Stroke keyframes in the torso frame (x right, y up, z back; -z is toward
 * the front wall). E = elbow direction from the shoulder, W = wrist direction
 * from the elbow, R = racket direction from the hand, N = string-face normal.
 * LE / LW = free arm. yaw = body turn (negative = toward the right wall),
 * pitch = forward bend, drop = extra hip drop (m).
 */
const FOREHAND = [
  { t: 0.0, E: v3(0.85, 0.1, 0.5), W: v3(0.1, 0.9, 0.4), R: v3(-0.2, 0.8, 0.55), N: v3(-0.6, 0.2, -0.75), LE: v3(-0.9, 0.25, -0.3), LW: v3(-0.95, 0.1, 0.2), yaw: -1.0, pitch: 0.3, drop: 0.07, wide: 0.3, knee: 0.35 },
  { t: 0.22, E: v3(0.55, -0.7, -0.4), W: v3(0.65, -0.45, -0.6), R: v3(0.9, -0.05, -0.45), N: v3(0.1, 0.25, -0.95), LE: v3(-0.85, 0.35, 0.4), LW: v3(-0.8, 0.3, 0.5), yaw: -0.35, pitch: 0.42, drop: 0.06, wide: 0.1, knee: 0.1 },
  { t: 0.6, E: v3(-0.25, 0.15, -0.95), W: v3(-0.7, 0.5, -0.5), R: v3(-0.55, 0.8, -0.25), N: v3(-0.6, 0.3, -0.75), LE: v3(-0.7, 0.1, 0.7), LW: v3(-0.5, 0.4, 0.75), yaw: 0.25, pitch: 0.3, drop: 0.03, wide: 0.15, knee: 0.15 },
  { t: 1.0, E: v3(0.35, -0.85, -0.35), W: v3(0.2, 0.35, -0.9), R: v3(0.05, 0.85, -0.5), N: v3(-0.7, 0, -0.7), LE: v3(-0.4, -0.8, -0.4), LW: v3(-0.1, -0.2, -0.95), yaw: 0, pitch: 0.14, drop: 0, wide: 0, knee: 0 },
];

const BACKHAND = [
  { t: 0.0, E: v3(-0.3, 0.35, 0.3), W: v3(-0.2, 0.9, 0.35), R: v3(-0.3, 0.7, 0.65), N: v3(0.7, 0.3, -0.65), LE: v3(-0.6, -0.3, 0.7), LW: v3(-0.3, -0.5, 0.8), yaw: 1.05, pitch: 0.3, drop: 0.07, wide: 0.3, knee: 0.35 },
  { t: 0.22, E: v3(-0.55, -0.7, -0.4), W: v3(-0.65, -0.45, -0.6), R: v3(-0.9, -0.05, -0.45), N: v3(-0.1, 0.25, -0.95), LE: v3(0.75, 0.3, 0.55), LW: v3(0.8, 0.2, 0.55), yaw: 0.35, pitch: 0.42, drop: 0.06, wide: 0.1, knee: 0.1 },
  { t: 0.6, E: v3(-0.8, 0.3, -0.5), W: v3(-0.55, 0.75, -0.35), R: v3(-0.35, 0.9, 0.1), N: v3(0.6, 0.3, -0.75), LE: v3(0.6, 0.0, 0.8), LW: v3(0.5, 0.3, 0.8), yaw: -0.25, pitch: 0.3, drop: 0.03, wide: 0.15, knee: 0.15 },
  { t: 1.0, E: v3(0.35, -0.85, -0.35), W: v3(0.2, 0.35, -0.9), R: v3(0.05, 0.85, -0.5), N: v3(-0.7, 0, -0.7), LE: v3(-0.4, -0.8, -0.4), LW: v3(-0.1, -0.2, -0.95), yaw: 0, pitch: 0.14, drop: 0, wide: 0, knee: 0 },
];

/** Ready pose (same as the last keyframe) and the running pump for the free arm. */
const READY = FOREHAND[3];

/** Interpolate a keyframe list at time t (0..1) into `out`. */
function sampleKeys(keys, t, out) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const u = smooth(clamp((t - a.t) / (b.t - a.t), 0, 1));
  for (const k of ['E', 'W', 'R', 'N', 'LE', 'LW']) nlerp(a[k], b[k], u, out[k]);
  for (const k of ['yaw', 'pitch', 'drop', 'wide', 'knee']) out[k] = lerp(a[k], b[k], u);
  return out;
}

function makePose() {
  return { E: new THREE.Vector3(), W: new THREE.Vector3(), R: new THREE.Vector3(), N: new THREE.Vector3(), LE: new THREE.Vector3(), LW: new THREE.Vector3(), yaw: 0, pitch: 0, drop: 0, wide: 0, knee: 0 };
}

/** Blend pose b into a by amount t (in place in a). */
function blendPose(a, b, t) {
  for (const k of ['E', 'W', 'R', 'N', 'LE', 'LW']) nlerp(a[k], b[k], t, a[k]);
  for (const k of ['yaw', 'pitch', 'drop', 'wide', 'knee']) a[k] = lerp(a[k], b[k], t);
  return a;
}

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
      this.legs.push({ hip, knee, foot, side });
    }

    // Arms: shoulder -> elbow -> hand pivots; segments hang along -y.
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = pivot(side * 0.22, 0.5, 0);
      this.torso.add(shoulder);
      shoulder.add(capsule(0.05, UPPER_ARM - 0.1, jersey, -UPPER_ARM / 2));
      const elbow = pivot(0, -UPPER_ARM, 0);
      shoulder.add(elbow);
      elbow.add(capsule(0.045, FOREARM - 0.09, skin, -FOREARM / 2));
      const hand = pivot(0, -FOREARM, 0);
      elbow.add(hand);
      hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skin));
      this.arms.push({ shoulder, elbow, hand, side });
    }

    this.racket = buildRacket({ accent: color });
    this.arms[1].hand.add(this.racket);

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    // Smoothed animation state.
    this.facing = 0;
    this.run = 0;
    this.lateral = 0;
    this.forward = 0;
    this.backward = 0;
    this.lunge = 0;
    this.lungeX = 0;
    this.lungeZ = -1;
    this.split = 0;
    this.prevOppSwing = 0;
    this.prep = 0;          // 0..1 how far the backswing is prepared while approaching the ball
    this.prepSide = 1;
    this.time = 0;
    this.pose = makePose();
    this.prepPose = makePose();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._x = new THREE.Vector3();
    this._y = new THREE.Vector3();
    this._z = new THREE.Vector3();
    this._ax = new THREE.Vector3(1, 0, 0);
    this._e = new THREE.Vector3(); this._w = new THREE.Vector3(); this._r = new THREE.Vector3(); this._n = new THREE.Vector3();
  }

  /** Quaternion rotating the hanging (-y) segment onto `dir`. */
  _dirQuat(dir, out) {
    return out.setFromUnitVectors(Y_DOWN, dir);
  }

  /**
   * Pose one arm from direction vectors given in the torso's yaw frame but
   * ignoring its forward lean (so a level racket stays level when the body
   * bends over the ball).
   */
  _poseArm(arm, E, W, R, N) {
    const pitch = -this.torso.rotation.x;
    const ax = this._ax;
    E = this._e.copy(E).applyAxisAngle(ax, pitch);
    W = this._w.copy(W).applyAxisAngle(ax, pitch);
    if (R) { R = this._r.copy(R).applyAxisAngle(ax, pitch); N = this._n.copy(N).applyAxisAngle(ax, pitch); }
    const qS = this._dirQuat(E, arm.shoulder.quaternion);
    const qW = this._dirQuat(W, this._q);
    arm.elbow.quaternion.copy(qS).invert().multiply(qW);
    if (R) {
      // Racket basis: handle axis (local -y) along R, string normal (local +z) along N.
      const y = this._y.copy(R).negate();
      const z = this._z.copy(N).addScaledVector(y, -N.dot(y)).normalize();
      const x = this._x.crossVectors(y, z).normalize();
      const qR = this._q2.setFromRotationMatrix(this._m.makeBasis(x, y, z));
      arm.hand.quaternion.copy(qW).invert().multiply(qR);
    } else {
      arm.hand.quaternion.identity();
    }
  }

  /**
   * Pose the model from the simulation state.
   * @param {import('../entities/player.js').Player} p
   * @param {{x:number,y:number,z:number,inPlay?:boolean}} ball
   * @param {number} dt
   * @param {import('../entities/player.js').Player} [opponent] used to time the split step
   */
  update(p, ball, dt, opponent) {
    const r = this.root;
    r.position.set(p.x, 0, p.z);
    this.time += dt;

    // Split step: one small fast hop the instant the opponent strikes.
    if (opponent) {
      if (opponent.swing > 0.95 && this.prevOppSwing <= 0.95 && ball.inPlay && p.swing <= 0) this.split = 1;
      this.prevOppSwing = opponent.swing;
    }
    if (this.split > 0) this.split = Math.max(0, this.split - dt / 0.26);
    const splitU = this.split > 0 ? 1 - this.split : -1;
    const hop = splitU >= 0 ? Math.sin(Math.PI * Math.min(1, splitU / 0.7)) * 0.045 : 0;
    const landed = splitU >= 0 ? smooth(clamp((splitU - 0.4) / 0.6, 0, 1)) : 0;

    // ------------------------------------------------ movement analysis
    const speed = Math.hypot(p.vx, p.vz);
    const top = Math.max(0.5, p.speed);
    const runT = clamp(speed / (top * 0.8), 0, 1);
    const dirX = speed > 0.05 ? p.vx / speed : 0;
    const dirZ = speed > 0.05 ? p.vz / speed : 0;
    const latT = runT > 0.05 ? dirX * Math.max(0, 1 - Math.abs(dirZ) * 0.6) : 0;
    const fwdT = runT > 0.05 ? clamp(-dirZ, 0, 1) : 0;
    const bwdT = runT > 0.05 ? clamp(dirZ, 0, 1) : 0;
    const distToTarget = Math.hypot(p.targetX - p.x, p.targetZ - p.z);
    const swingT = p.swing > 0 ? 1 - p.swing : -1;
    const side = p.swingSide;
    const ballSide = ball.x >= p.x ? 1 : -1;

    // Lunge: last stride before the target while moving fast, or the stroke itself.
    let lungeT = 0, lx = dirX, lz = dirZ;
    if (speed > 1.2 && distToTarget < 0.9) lungeT = clamp(1 - distToTarget / 0.9, 0, 1) * clamp(speed / 2.5, 0, 1);
    if (swingT >= 0 && swingT < 0.75) {
      const reach = clamp(Math.abs(ball.x - p.x) / Math.max(0.3, p.reach), 0, 1);
      const bell = Math.sin(Math.PI * clamp(swingT / 0.75, 0, 1));
      const l = (0.45 + 0.55 * reach) * Math.min(1, 0.45 + bell);
      if (l > lungeT) { lungeT = l; lx = side * 0.7; lz = -0.7; }
    }
    // Backswing preparation while approaching the ball.
    const prepT = ball.inPlay && swingT < 0 && Math.hypot(ball.x - p.x, ball.z - p.z) < 3.5 ? clamp(runT * 0.9 + lungeT, 0, 1) : 0;
    if (prepT > 0.05) this.prepSide = ballSide;

    const rate = 10;
    this.run = ease(this.run, runT, dt, rate);
    this.lateral = ease(this.lateral, latT, dt, rate);
    this.forward = ease(this.forward, fwdT, dt, rate);
    this.backward = ease(this.backward, bwdT, dt, rate);
    this.lunge = ease(this.lunge, lungeT, dt, lungeT > this.lunge ? 16 : 6);
    this.prep = ease(this.prep, prepT, dt, 6);
    if (lungeT > 0.05) { this.lungeX = ease(this.lungeX, lx, dt, 12); this.lungeZ = ease(this.lungeZ, lz, dt, 12); }
    const run = this.run, lat = this.lateral, fwd = this.forward, bwd = this.backward, lunge = this.lunge;
    const ph = p.runPhase;

    // ------------------------------------------------ stroke pose
    const pose = this.pose;
    if (swingT >= 0) {
      sampleKeys(side > 0 ? FOREHAND : BACKHAND, clamp(swingT, 0, 1), pose);
    } else {
      // Ready, blended toward the backswing of the side the ball is on.
      sampleKeys(FOREHAND, 1, pose);
      if (this.prep > 0.01) {
        sampleKeys(this.prepSide > 0 ? FOREHAND : BACKHAND, 0, this.prepPose);
        blendPose(pose, this.prepPose, this.prep);
      }
    }
    // Reach for the ball height at contact: lower balls pull the arm and the body down.
    const h = clamp(ball.y, 0.1, 2.0);
    const stroke = swingT >= 0 ? Math.sin(Math.PI * clamp(swingT / 0.6, 0, 1)) : 0;
    const lowBall = clamp((1.0 - h) / 0.9, -0.6, 1) * stroke;
    pose.E.y -= lowBall * 0.6; pose.E.normalize();
    pose.W.y -= lowBall * 0.6; pose.W.normalize();
    pose.R.y -= lowBall * 0.25; pose.R.normalize();

    // ------------------------------------------------ facing and body height
    let face = 0;
    if (bwd > 0.1) face = -Math.sign(dirX || 1) * 0.5 * bwd;
    if (fwd > 0.1) face += -dirX * 0.25 * fwd;
    face += pose.yaw * 0.55;
    this.facing = ease(this.facing, face, dt, 9);
    r.rotation.y = this.facing;

    const waiting = ball.inPlay && swingT < 0 && run < 0.15;
    const breathe = waiting ? Math.sin(this.time * 2.2) * 0.006 : 0;
    const stanceDrop = 0.07;
    const bob = Math.abs(Math.sin(ph)) * (0.018 * fwd + 0.012 * Math.abs(lat));
    this.hips.position.y = 0.95 - stanceDrop - run * 0.05 - lunge * 0.16 - pose.drop - lowBall * 0.08 + bob + breathe + hop - landed * 0.03;

    this.torso.rotation.set(0, 0, 0);
    this.torso.rotation.y = pose.yaw * 0.45;
    this.torso.rotation.x = -(pose.pitch + fwd * 0.2 + bwd * 0.05 + lunge * 0.15 + lowBall * 0.2);
    this.torso.rotation.z = -lat * 0.18 - this.lungeX * lunge * 0.2;
    // Head: stays level, eyes on the ball.
    this.head.rotation.x = -this.torso.rotation.x * 0.85 - (ball.inPlay ? 0.35 * clamp((1.2 - h), 0, 1) : 0);
    this.head.rotation.y = ball.inPlay ? clamp(-Math.atan2(ball.x - p.x, -(ball.z - p.z) || 0.01) * 0.5 - this.facing - this.torso.rotation.y, -0.9, 0.9) : 0;

    // ------------------------------------------------ legs
    for (let i = 0; i < 2; i++) {
      const { hip, knee, foot, side: ls } = this.legs[i];
      const phase = ph + (i === 0 ? 0 : Math.PI);
      const sw = Math.sin(phase);
      const lift = Math.max(0, -sw);

      let flex = 0.28, bend = -0.55, abd = ls * 0.14;
      abd += ls * (0.1 * landed + pose.wide);
      bend += -0.2 * landed - pose.knee;
      foot.rotation.x = -(0.22 + 0.35 * (hop > 0 ? 1 : 0)) * (1 - lunge);

      flex += sw * 0.6 * fwd;
      bend += -lift * 1.0 * fwd;
      flex += sw * 0.35 * bwd;
      bend += -lift * 0.6 * bwd;

      const a = Math.abs(lat);
      if (a > 0.02) {
        const lead = Math.sign(lat) === ls;
        const stepOut = Math.max(0, Math.sin(phase));
        abd += Math.sign(lat) * (lead ? 0.28 + 0.22 * stepOut : -0.08 + 0.22 * stepOut) * a;
        bend += -stepOut * 0.35 * a;
      }

      // Lunge. During a stroke the front leg is the one opposite the racket
      // side (left leg for a forehand), stepping forward and across to the ball.
      if (lunge > 0.02) {
        const inStroke = swingT >= 0 && swingT < 0.75;
        const front = inStroke ? ls === -side : (Math.abs(this.lungeX) > 0.35 ? Math.sign(this.lungeX) === ls : ls === -ballSide);
        if (front) {
          flex = lerp(flex, 1.05 * Math.max(0.3, -this.lungeZ) + 0.2, lunge);
          abd = lerp(abd, this.lungeX * 0.8, lunge);
          bend = lerp(bend, -1.35, lunge);
          foot.rotation.x = lerp(foot.rotation.x, 0.25, lunge);
        } else {
          flex = lerp(flex, -0.45 * Math.max(0.3, -this.lungeZ) - 0.1, lunge);
          abd = lerp(abd, -this.lungeX * 0.15 + ls * 0.12, lunge);
          bend = lerp(bend, -0.25, lunge);
          foot.rotation.x = lerp(foot.rotation.x, -0.6, lunge); // back heel up
        }
      }
      hip.rotation.set(flex, 0, abd);
      knee.rotation.x = bend;
    }

    // ------------------------------------------------ arms
    // Racket arm from the pose; free arm from the pose, pumping while running.
    this._poseArm(this.arms[1], pose.E, pose.W, pose.R, pose.N);
    const pump = fwd * 0.5 + bwd * 0.3;
    if (pump > 0.02 && swingT < 0 && this.prep < 0.3) {
      const s = Math.sin(ph) * pump;
      const LE = this._x.set(-0.35, -0.8 + s * 0.3, -0.3 - s * 0.6).normalize();
      const LW = this._y.set(-0.1, -0.3 + s * 0.2, -0.95).normalize();
      this._poseArm(this.arms[0], LE, LW, null, null);
    } else {
      this._poseArm(this.arms[0], pose.LE, pose.LW, null, null);
    }
  }
}
