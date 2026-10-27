/**
 * @module render3d/player3d
 * Procedural player animation on the rig from {@link module:render3d/body3d}.
 *
 * Movement poses follow coaching material (docs/RENDERING.md). Stroke poses
 * come from reference frames of a forehand (kept out of the repository):
 *   1. preparation while moving to the ball: body turned to the side wall,
 *      front foot (left for a forehand) toward the front wall, elbow at
 *      shoulder height, racket head straight up above the shoulder, free hand
 *      pointing at the ball;
 *   2. contact: both knees bent deep, body low and bent ~45° over the front
 *      foot, arm extended to the ball at ankle height, racket level, free arm
 *      trailing behind;
 *   3. follow-through: shoulders rotate to the front wall, racket comes up
 *      high on the opposite side with the elbow bent, weight on the front foot.
 * The backhand mirrors the set, with the racket prepared on the other side.
 *
 * Arms are posed with direction vectors in the torso's yaw frame (where the
 * elbow and wrist should be and where the racket points), compensated for
 * the torso's forward lean, so poses can be read straight off a photograph.
 *
 * Model frame: faces -z (toward the front wall); +x is the player's right.
 * root.rotation.y < 0 turns the body toward the right side wall.
 */
import * as THREE from 'three';
import { buildBody } from './body3d.js';
import { buildRacket } from './racket3d.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);

const Y_DOWN = new THREE.Vector3(0, -1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const nlerp = (a, b, t, out) => out.copy(a).lerp(b, t).normalize();

const VEC_KEYS = ['E', 'W', 'R', 'N', 'LE', 'LW'];
const NUM_KEYS = ['yaw', 'shoulders', 'pitch', 'drop', 'wide', 'knee', 'step'];

/**
 * Stroke keyframes (forehand, right-handed). Torso yaw frame: x right, y up,
 * z back (-z toward the front wall).
 *   E elbow dir from shoulder, W wrist dir from elbow, R racket dir, N string normal,
 *   LE/LW free arm, yaw hip turn (negative = right wall; the body faces the side wall
 *   at 90° for the stroke), shoulders extra shoulder turn beyond the hips, pitch forward lean,
 *   drop hip drop (m), wide extra foot spread, knee extra bend (both knees),
 *   step front-foot-forward amount (front foot = opposite the racket side).
 */
const FOREHAND = [
  // 1. preparation (frame 1): the whole body faces the right side wall (90°), shoulders turned a little further.
  { t: 0.0, E: v3(0.9, 0.15, 0.35), W: v3(0.05, 0.95, 0.3), R: v3(-0.15, 0.95, 0.25), N: v3(-0.7, 0.05, -0.7), LE: v3(0.3, -0.6, -0.75), LW: v3(0.4, -0.45, -0.8), yaw: -1.57, shoulders: -0.3, pitch: 0.22, drop: 0.06, wide: 0.12, knee: 0.3, step: 0.8 },
  // 2. contact (frame 2): hips still side-on, shoulders opening toward the front wall.
  { t: 0.24, E: v3(0.55, -0.75, -0.35), W: v3(0.6, -0.5, -0.6), R: v3(0.9, -0.05, -0.45), N: v3(0.1, 0.25, -0.95), LE: v3(-0.6, -0.1, 0.8), LW: v3(-0.5, -0.3, 0.8), yaw: -1.2, shoulders: 0.35, pitch: 0.5, drop: 0.06, wide: 0.15, knee: 0.45, step: 1.0 },
  // 3. follow-through (frame 3): body rotates to face the front wall.
  { t: 0.62, E: v3(-0.2, 0.35, -0.85), W: v3(-0.5, 0.8, -0.3), R: v3(-0.3, 0.85, 0.4), N: v3(0.6, 0.3, -0.7), LE: v3(-0.45, -0.4, 0.75), LW: v3(-0.3, -0.5, 0.8), yaw: -0.25, shoulders: 0.35, pitch: 0.25, drop: 0.05, wide: 0.1, knee: 0.3, step: 0.7 },
  // ready: square to the front wall, racket up in front, free hand near the racket throat, knees bent, feet wide.
  { t: 1.0, E: v3(0.35, -0.85, -0.35), W: v3(0.2, 0.35, -0.9), R: v3(0.05, 0.85, -0.5), N: v3(-0.7, 0, -0.7), LE: v3(-0.3, -0.8, -0.5), LW: v3(0.55, 0.15, -0.8), yaw: 0, shoulders: 0, pitch: 0.14, drop: 0, wide: 0.08, knee: 0.1, step: 0 },
];

/** Mirror a forehand keyframe across the body for the backhand (racket stays in the right hand). */
function mirror(k) {
  const m = (v) => v3(-v.x, v.y, v.z);
  const prep = k.t === 0;
  return {
    t: k.t,
    // Preparation (backhand frames): body faces the left wall, elbow bent across the chest at
    // shoulder height, racket head up and back behind the head, free arm bent in front.
    E: prep ? v3(-0.25, 0.3, 0.1) : m(k.E),
    W: prep ? v3(-0.1, 0.85, 0.5) : m(k.W),
    R: prep ? v3(-0.2, 0.6, 0.75) : m(k.R),
    N: prep ? v3(0.75, 0.2, -0.6) : m(k.N),
    LE: prep ? v3(-0.5, -0.5, -0.7) : m(k.LE),
    LW: prep ? v3(0.4, 0.2, -0.85) : m(k.LW),
    yaw: -k.yaw, shoulders: -k.shoulders, pitch: k.pitch, drop: k.drop, wide: k.wide, knee: k.knee, step: k.step,
  };
}
const BACKHAND = FOREHAND.map(mirror);

function makePose() {
  const p = { yaw: 0, shoulders: 0, pitch: 0, drop: 0, wide: 0, knee: 0, step: 0 };
  for (const k of VEC_KEYS) p[k] = new THREE.Vector3();
  return p;
}

/** Interpolate a keyframe list at time t (0..1) into `out`. */
function sampleKeys(keys, t, out) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const u = smooth(clamp((t - a.t) / (b.t - a.t), 0, 1));
  for (const k of VEC_KEYS) nlerp(a[k], b[k], u, out[k]);
  for (const k of NUM_KEYS) out[k] = lerp(a[k], b[k], u);
  return out;
}

/** Blend pose b into a by amount t (in place). */
function blendPose(a, b, t) {
  for (const k of VEC_KEYS) nlerp(a[k], b[k], t, a[k]);
  for (const k of NUM_KEYS) a[k] = lerp(a[k], b[k], t);
  return a;
}

export class PlayerModel {
  /**
   * @param {number} color jersey colour
   * @param {{number?:number, skin?:number, hair?:number}} [look]
   */
  constructor(color, look = {}) {
    const body = buildBody({ color, ...look });
    this.root = body.root;
    this.hips = body.hips;
    this.torso = body.torso;
    this.head = body.head;
    this.legs = body.legs;
    this.arms = body.arms;
    this.racket = buildRacket({ accent: color });
    this.arms[1].hand.add(this.racket);

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
    this.prep = 0;
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

  _dirQuat(dir, out) {
    return out.setFromUnitVectors(Y_DOWN, dir);
  }

  /**
   * Pose one arm from direction vectors given in the torso's yaw frame but
   * ignoring its forward lean (a level racket stays level when the body
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
   * @param {boolean} [myTurn=true] whether this player must play the next ball (prepares the racket)
   */
  update(p, ball, dt, opponent, myTurn = true) {
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
    const inStroke = swingT >= 0 && swingT < 0.75;

    // Lunge: last stride before the target while moving fast, or the stroke itself.
    let lungeT = 0, lx = dirX, lz = dirZ;
    if (speed > 1.2 && distToTarget < 0.9) lungeT = clamp(1 - distToTarget / 0.9, 0, 1) * clamp(speed / 2.5, 0, 1);
    if (inStroke) {
      const reach = clamp(Math.abs(ball.x - p.x) / Math.max(0.3, p.reach), 0, 1);
      const bell = Math.sin(Math.PI * clamp(swingT / 0.75, 0, 1));
      // Little lunge in the preparation (the stance is set by the keyframe), full lunge into contact.
      const l = (0.35 + 0.65 * reach) * Math.min(1, 0.1 + bell * 1.2);
      if (l > lungeT) { lungeT = l; lx = side * 0.6; lz = -0.8; }
    }
    // Racket preparation: as soon as it is this player's ball, on the side the ball is.
    const prepT = ball.inPlay && myTurn && swingT < 0 ? 1 : 0;
    if (prepT > 0 && this.prep < 0.2) this.prepSide = ballSide;
    else if (prepT > 0 && Math.abs(ball.x - p.x) > 0.25) this.prepSide = ballSide;

    const rate = 10;
    this.run = ease(this.run, runT, dt, rate);
    this.lateral = ease(this.lateral, latT, dt, rate);
    this.forward = ease(this.forward, fwdT, dt, rate);
    this.backward = ease(this.backward, bwdT, dt, rate);
    this.lunge = ease(this.lunge, lungeT, dt, lungeT > this.lunge ? 16 : 6);
    this.prep = ease(this.prep, prepT, dt, prepT > this.prep ? 7 : 5);
    if (lungeT > 0.05) { this.lungeX = ease(this.lungeX, lx, dt, 12); this.lungeZ = ease(this.lungeZ, lz, dt, 12); }
    const run = this.run, lat = this.lateral, fwd = this.forward, bwd = this.backward, lunge = this.lunge;
    const ph = p.runPhase;

    // ------------------------------------------------ stroke pose
    const pose = this.pose;
    if (swingT >= 0) {
      sampleKeys(side > 0 ? FOREHAND : BACKHAND, clamp(swingT, 0, 1), pose);
    } else {
      sampleKeys(FOREHAND, 1, pose);
      if (this.prep > 0.01) {
        sampleKeys(this.prepSide > 0 ? FOREHAND : BACKHAND, 0, this.prepPose);
        // While running the body cannot be fully sideways: keep the arm prepared, soften the body.
        this.prepPose.yaw *= 1 - 0.6 * run;
        this.prepPose.shoulders *= 1 - 0.6 * run;
        this.prepPose.step *= 1 - run;
        this.prepPose.wide *= 1 - run;
        this.prepPose.knee *= 1 - 0.5 * run;
        blendPose(pose, this.prepPose, this.prep);
      }
    }
    // Reach for the ball height at contact: low balls pull the arm and the body down,
    // high balls (volleys) bring the extended arm up to shoulder height with the body upright.
    const h = clamp(ball.y, 0.1, 2.0);
    const stroke = swingT >= 0 ? Math.sin(Math.PI * clamp(swingT / 0.62, 0, 1)) : 0;
    const lowBall = clamp((1.0 - h) / 0.9, 0, 1) * stroke;    // 1 = ball on the floor
    const highBall = clamp((h - 1.0) / 0.6, 0, 1) * stroke;   // 1 = head-high volley
    pose.E.y += highBall * 0.8 - lowBall * 0.6; pose.E.normalize();
    pose.W.y += highBall * 0.95 - lowBall * 0.6; pose.W.normalize();
    pose.R.y += highBall * 0.35 - lowBall * 0.25; pose.R.normalize();
    // A volley is played standing taller.
    const tall = 1 - 0.6 * highBall;
    pose.pitch *= tall; pose.drop *= tall; pose.knee *= tall;

    // ------------------------------------------------ facing and body height
    let face = 0;
    if (bwd > 0.1) face = -Math.sign(dirX || 1) * 0.5 * bwd;
    if (fwd > 0.1) face += -dirX * 0.25 * fwd;
    face += pose.yaw;
    this.facing = ease(this.facing, face, dt, 9);
    r.rotation.y = this.facing;

    const waiting = ball.inPlay && swingT < 0 && run < 0.15;
    const breathe = waiting ? Math.sin(this.time * 2.2) * 0.006 : 0;
    const stanceDrop = 0.07;
    const bob = Math.abs(Math.sin(ph)) * (0.018 * fwd + 0.012 * Math.abs(lat));
    const kneeDrop = pose.knee * 0.22; // bent knees lower the hips
    this.hips.position.y = 0.95 - stanceDrop - run * 0.05 - lunge * 0.12 - pose.drop - kneeDrop - lowBall * 0.06 + bob + breathe + hop - landed * 0.03;

    this.torso.rotation.set(0, 0, 0);
    this.torso.rotation.y = pose.shoulders;
    this.torso.rotation.x = -(pose.pitch + fwd * 0.2 + bwd * 0.05 + lunge * 0.12 + lowBall * 0.2);
    this.torso.rotation.z = -lat * 0.18 - this.lungeX * lunge * 0.15;
    // Head: level, eyes on the ball.
    this.head.rotation.x = -this.torso.rotation.x * 0.85 - (ball.inPlay ? 0.4 * clamp((1.3 - h), 0, 1) : 0);
    this.head.rotation.y = ball.inPlay ? clamp(-Math.atan2(ball.x - p.x, -(ball.z - p.z) || 0.01) * 0.5 - this.facing - this.torso.rotation.y, -0.9, 0.9) : 0;

    // ------------------------------------------------ legs
    const strokeSide = swingT >= 0 ? side : this.prepSide;
    for (let i = 0; i < 2; i++) {
      const { hip, knee, foot, side: ls } = this.legs[i];
      const phase = ph + (i === 0 ? 0 : Math.PI);
      const sw = Math.sin(phase);
      const lift = Math.max(0, -sw);
      const frontFoot = ls === -strokeSide; // left foot forward for a forehand

      let flex = 0.28, bend = -0.55, abd = ls * 0.14;
      abd += ls * (0.1 * landed + pose.wide);
      bend += -0.2 * landed - pose.knee * 1.1;
      // Staggered stance: front foot toward the front wall, back foot behind with the heel up.
      flex += frontFoot ? pose.step * 0.45 : -pose.step * 0.3;
      foot.rotation.x = -(0.22 + 0.35 * (hop > 0 ? 1 : 0)) * (1 - lunge) - (frontFoot ? 0 : pose.step * 0.5);
      // Knees bent -> feet flat under the body.
      foot.rotation.x += pose.knee * 0.35 * (frontFoot ? 1 : 0.3);

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

      // Lunge: during a stroke the front leg is the one opposite the racket side.
      if (lunge > 0.02) {
        const front = inStroke ? frontFoot : (Math.abs(this.lungeX) > 0.35 ? Math.sign(this.lungeX) === ls : ls === -ballSide);
        if (front) {
          flex = lerp(flex, 1.0 * Math.max(0.3, -this.lungeZ) + 0.25, lunge);
          abd = lerp(abd, this.lungeX * 0.7, lunge);
          bend = lerp(bend, -1.35, lunge);
          foot.rotation.x = lerp(foot.rotation.x, 0.3, lunge);
        } else {
          // Back leg: bent too during the stroke (both knees bend), straighter in a running lunge.
          flex = lerp(flex, -0.35 * Math.max(0.3, -this.lungeZ) - 0.05, lunge);
          abd = lerp(abd, -this.lungeX * 0.15 + ls * 0.12, lunge);
          bend = lerp(bend, inStroke ? -0.55 : -0.25, lunge);
          foot.rotation.x = lerp(foot.rotation.x, -0.6, lunge);
        }
      }
      hip.rotation.set(flex, 0, abd);
      knee.rotation.x = bend;
    }

    // ------------------------------------------------ arms
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
