/**
 * @module render3d/player3d
 * Procedural player animation on the rig from {@link module:render3d/body3d}.
 *
 * Legs: real footsteps. Each foot is planted at a fixed point on the floor.
 * When the body moves away from where that foot should be (its rest position
 * under the hips, led ahead by the velocity), the foot lifts, swings in an
 * arc to the new spot and plants again; the legs are then solved with
 * two-bone IK from the hip height to the planted foot, so feet never slide.
 * Stances (staggered preparation, lunge) are expressed as foot targets, so
 * stepping into a lunge is a real step too.
 *
 * Strokes come from reference frames (kept out of the repository):
 *   1. preparation: hips 90° to the side wall, front foot forward, elbow at
 *      shoulder height, racket head straight up, free hand pointing at the ball;
 *   2. contact: both knees bent deep, body over the front foot, arm extended
 *      to the ball, racket level; free arm trailing;
 *   3. follow-through: body rotates to the front wall, racket up high on the
 *      opposite side. The backhand mirrors it with its own preparation.
 * Arms are posed with direction vectors in the torso's yaw frame, compensated
 * for the forward lean. Volleys are played taller with the arm at shoulder height.
 *
 * Model frame: faces -z (toward the front wall); +x is the player's right.
 * root.rotation.y < 0 turns the body toward the right side wall.
 */
import * as THREE from 'three';
import { buildBody, THIGH, SHIN } from './body3d.js';
import { makeRacket } from './racket-model.js';
import { COURT } from '../config/court.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);

const Y_DOWN = new THREE.Vector3(0, -1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const nlerp = (a, b, t, out) => out.copy(a).lerp(b, t).normalize();

const VEC_KEYS = ['E', 'W', 'R', 'N', 'LE', 'LW'];
const NUM_KEYS = ['yaw', 'shoulders', 'pitch', 'drop', 'wide', 'knee', 'step'];

/** Foot stance half-width (m). */
const STANCE_HALF = 0.14;

/**
 * Hops. The split step is timed to the opponent's contact: a short load (knees dip), the feet
 * leave the floor just before the racket meets the ball and land ~0.17 s after it, a little
 * wider, the knees absorbing the landing so the first stride can push off. After the player's
 * own shot a smaller push-off hop brings the feet out of the lunge and under the body for the
 * jog back to the T. Times in seconds, heights in metres.
 */
const SPLIT_STEP = { load: 0.09, flight: 0.2, land: 0.3, height: 0.06, dip: 0.035, sink: 0.07, widen: 0.09 };
const PUSH_OFF = { load: 0, flight: 0.18, land: 0.22, height: 0.025, dip: 0, sink: 0.03, widen: 0 };

/**
 * Default rig dimensions (m): the procedural body. A skinned character
 * passes its own bone lengths so the leg IK plants its feet correctly.
 * @typedef {{hipX:number, hipsY:number, thigh:number, shin:number, ankle:number, toeLen:number}} RigDims
 */
export const DEFAULT_DIMS = Object.freeze({ hipX: 0.1, hipsY: 0.95, thigh: THIGH, shin: SHIN, ankle: 0.035, toeLen: 0.12 });

/**
 * Stroke keyframes (forehand, right-handed). Torso yaw frame: x right, y up,
 * z back (-z toward the front wall).
 *   E elbow dir from shoulder, W wrist dir from elbow, R racket dir (kept 55-70 degrees
 *   off the forearm: the racket is held cocked in the squash grip, never as an extension of the arm), N string normal,
 *   LE/LW free arm, yaw hip turn (negative = right wall; the body faces the side wall
 *   at 90° for the stroke), shoulders extra shoulder turn beyond the hips, pitch forward lean,
 *   drop hip drop (m), wide extra foot spread, knee extra bend (both knees, lowers the hips),
 *   step front-foot-forward amount (front foot = opposite the racket side).
 */
const FOREHAND = [
  // 1. preparation (frame 1): the whole body faces the right side wall (90°), shoulders turned a little further.
  { t: 0.0, E: v3(0.9, 0.15, 0.35), W: v3(0.05, 0.95, 0.3), R: v3(0.7, 0.3, 0.65), N: v3(-0.7, 0.05, -0.7), LE: v3(0.3, -0.6, -0.75), LW: v3(0.4, -0.45, -0.8), yaw: -1.57, shoulders: -0.82, pitch: 0.22, drop: 0.06, wide: 0.12, knee: 0.3, step: 0.8 },
  // 2. contact (frame 2): hips still side-on, shoulders opening toward the front wall.
  { t: 0.24, E: v3(0.55, -0.75, -0.35), W: v3(0.6, -0.5, -0.6), R: v3(0.8, 0.15, -0.55), N: v3(0.1, 0.25, -0.95), LE: v3(-0.6, -0.1, 0.8), LW: v3(-0.5, -0.3, 0.8), yaw: -1.2, shoulders: 0.35, pitch: 0.5, drop: 0.06, wide: 0.15, knee: 0.45, step: 1.0 },
  // 3. follow-through (frame 3): body rotates to face the front wall.
  { t: 0.62, E: v3(-0.2, 0.35, -0.85), W: v3(-0.5, 0.8, -0.3), R: v3(0.1, 0.75, 0.65), N: v3(0.6, 0.3, -0.7), LE: v3(-0.45, -0.4, 0.75), LW: v3(-0.3, -0.5, 0.8), yaw: -0.25, shoulders: 0.35, pitch: 0.25, drop: 0.05, wide: 0.1, knee: 0.3, step: 0.7 },
  // ready: square to the front wall, racket up in front, free hand near the racket throat, knees bent, feet wide.
  { t: 1.0, E: v3(0.35, -0.85, -0.35), W: v3(0.2, 0.35, -0.9), R: v3(-0.1, 0.95, -0.1), N: v3(-0.7, 0, -0.7), LE: v3(-0.3, -0.8, -0.5), LW: v3(0.55, 0.15, -0.8), yaw: 0, shoulders: 0, pitch: 0.18, drop: 0, wide: 0.1, knee: 0.26, step: 0 },
];

/** Mirror a forehand keyframe across the body for the backhand (racket stays in the right hand). */
function mirror(k) {
  const m = (v) => v3(-v.x, v.y, v.z);
  const prep = k.t === 0;
  return {
    t: k.t,
    // Preparation (backhand frames): hips turned 135° toward the left wall (45° past side-on) with
    // the shoulders a little further, elbow pointing at the front wall across the chest, racket
    // hand beside the left shoulder clear of the head, racket head up and back, free arm in front.
    E: prep ? v3(-0.45, -0.12, -0.88) : m(k.E),
    W: prep ? v3(-0.85, -0.05, 0.5) : m(k.W),
    R: prep ? v3(-0.25, 0.5, 0.85) : m(k.R),
    N: prep ? v3(0.8, 0.3, -0.4) : m(k.N),
    LE: prep ? v3(-0.5, -0.5, -0.7) : m(k.LE),
    LW: prep ? v3(0.4, 0.2, -0.85) : m(k.LW),
    yaw: prep ? 2.36 : -k.yaw, shoulders: prep ? 0.55 : -k.shoulders, pitch: k.pitch, drop: k.drop, wide: k.wide, knee: k.knee, step: k.step,
  };
}
const BACKHAND = FOREHAND.map(mirror);
// The strings are the same on both faces, but the palm is not: a right hand holding the racket
// has its palm on the side of -(forearm x racket). Put every keyframe's N on that side once, so the
// interpolation between keyframes never turns the hand over (a N on the far side would spin the
// hand 180 degrees mid-swing).
for (const k of [...FOREHAND, ...BACKHAND]) {
  if (new THREE.Vector3().crossVectors(k.W, k.R).dot(k.N) > 0) k.N.negate();
}

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
   * @param {Partial<RigDims>} [dims] rig dimensions (defaults to the procedural body)
   */
  constructor(color, look = {}, dims = {}) {
    this.dims = { ...DEFAULT_DIMS, ...dims };
    const body = buildBody({ color, ...look });
    this.root = body.root;
    this.hips = body.hips;
    this.torso = body.torso;
    this.head = body.head;
    this.legs = body.legs;
    this.arms = body.arms;
    this.racket = makeRacket(color);
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
    this.hopT = -1;
    this.hopCfg = SPLIT_STEP;
    this.prevOppSwing = 0;
    this.prevSwingT = -1;
    this.prep = 0;
    this.prepSide = 1;
    this.time = 0;
    this.pose = makePose();
    this.prepPose = makePose();

    // Footstep state per leg (world space, on the floor).
    this.feet = this.legs.map(() => ({
      planted: new THREE.Vector3(NaN, 0, NaN), from: new THREE.Vector3(), to: new THREE.Vector3(),
      swing: -1, duration: 0.25, lift: 0.06, jogSwing: -1, stride: false, clock: false, g0: 0, pos: new THREE.Vector3(),
    }));
    this.prevRoot = new THREE.Vector3(NaN, 0, NaN);

    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._wr = new THREE.Vector3();
    this._move = new THREE.Vector3();
    /** Footfall sequence of the current run (see the strides section of update). */
    this.stride = null;
    this.strideW = 0;
    this._m = new THREE.Matrix4();
    this._x = new THREE.Vector3();
    this._y = new THREE.Vector3();
    this._z = new THREE.Vector3();
    this._ax = new THREE.Vector3(1, 0, 0);
    this._e = new THREE.Vector3(); this._w = new THREE.Vector3(); this._r = new THREE.Vector3(); this._n = new THREE.Vector3();
    this._fwd = new THREE.Vector3(); this._right = new THREE.Vector3();
    this._rest = [new THREE.Vector3(), new THREE.Vector3()];
    this._tmp = new THREE.Vector3(); this._tmp2 = new THREE.Vector3(); this._tmp3 = new THREE.Vector3();
  }

  _dirQuat(dir, out) {
    return out.setFromUnitVectors(Y_DOWN, dir);
  }

  /**
   * Lay out the footfalls of a run. With a destination the remaining distance (hips to the lunge
   * foot) is split into 1-4 footfalls of about 1.3 m, the last landing where the stance wants the
   * front foot; the footfalls alternate back from that foot (the lunge is made on the stroke's
   * front foot when it is our ball, else on the foot on the side of travel). Footfalls already
   * made or under way keep their slot. Without a destination only the first foot is chosen: the
   * one further back, so the first push is a full stride.
   */
  _planStrides(st, p, dist, dirX, dirZ, strokeSide, ballSide, planned, moveDir) {
    const k = st.k;
    const under = this.feet.findIndex((f) => f.stride && f.swing >= 0);  // footfall k is in the air
    st.planned = planned; st.tx = p.targetX; st.tz = p.targetZ;
    st.lands.length = k; st.feet.length = k;
    if (!planned) {
      st.N = Infinity;
      if (k === 0 && under < 0) st.feet[0] = this.feet[0].pos.dot(moveDir) <= this.feet[1].pos.dot(moveDir) ? 0 : 1;
      else if (under >= 0) st.feet[k] = under;
      return;
    }
    st.lungeAmt = this.prep > 0.5 ? 1 : 0;
    // The last footfall is the lunge, landing ahead of where the hips stop; the one before it
    // ends about 0.6 m behind the hips (the back leg of the stance), and the footfalls up to
    // there are spaced evenly, about 1.3 m apart and never more than 1.55 m.
    const R = Math.max(0.3, dist - 0.6);
    let m = clamp(Math.max(Math.round(R / 1.3), Math.ceil(R / 1.55)), 1, 3) + 1;
    const lungeFoot = st.lungeAmt > 0 ? (strokeSide > 0 ? 0 : 1)
      : (Math.abs(dirX) > 0.35 ? (dirX > 0 ? 1 : 0) : (ballSide > 0 ? 0 : 1));
    // The footfall under way keeps its foot: fit the count to the alternation.
    const footOf = (j, N) => ((N - 1 - j) % 2 === 0 ? lungeFoot : 1 - lungeFoot);
    if (under >= 0 && footOf(k, k + m) !== under) m = m < 4 ? m + 1 : m - 1;
    st.N = k + m; st.F = R / (m - 1);
    const lead = Math.min(0.4, 0.3 * st.F);
    for (let i = 0; i < m - 1; i++) st.lands.push(st.g + (i + 1) * st.F - lead);
    st.lands.push(st.g + Math.max(0, dist - 0.1));   // the lunge lands as the hips brake onto the target
    for (let j = k; j < st.N; j++) st.feet.push(footOf(j, st.N));
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
    if (R) {
      R = this._r.copy(R).applyAxisAngle(ax, pitch);
      N = this._n.copy(N).applyAxisAngle(ax, pitch);
    }
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
   * Two-bone leg IK in root-local space: point the thigh and shin so the
   * ankle reaches `foot` (root-local), knee bending forward. The foot stays
   * flat and pointing forward, tilted by `toe` (radians, positive = toes down).
   */
  _poseLeg(leg, hipLocal, foot, toe) {
    const d = this._tmp.subVectors(foot, hipLocal);
    let L = d.length();
    if (L < 1e-4) { L = 1e-4; d.set(0, -1e-4, 0); }
    const reach = clamp(L, 0.2, this.dims.thigh + this.dims.shin - 0.01);
    const dn = this._tmp2.copy(d).divideScalar(L);
    // Knee angle from the law of cosines; the thigh deviates from the hip->ankle line by alpha, toward the front.
    const a = this.dims.thigh, b = this.dims.shin;
    const cosAlpha = clamp((a * a + reach * reach - b * b) / (2 * a * reach), -1, 1);
    const alpha = Math.acos(cosAlpha);
    const f = this._tmp3.set(0, 0, -1); // knee points forward
    const n = f.addScaledVector(dn, -f.dot(dn)).normalize();
    const thighDir = this._x.copy(dn).multiplyScalar(Math.cos(alpha)).addScaledVector(n, Math.sin(alpha)).normalize();
    const qH = this._dirQuat(thighDir, leg.hip.quaternion);
    // Shin: from the knee to the ankle.
    const kneePos = this._y.copy(hipLocal).addScaledVector(thighDir, a);
    const shinDir = this._z.subVectors(foot, kneePos).normalize();
    const qK = this._dirQuat(shinDir, this._q);
    leg.knee.quaternion.copy(qH).invert().multiply(qK);
    // Foot flat in the root frame, plus toe tilt.
    leg.foot.quaternion.copy(qK).invert();
    if (toe) leg.foot.rotateX(-toe);
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
    // Teleport (new rally): reset the feet under the body.
    const jumped = !Number.isFinite(this.prevRoot.x) || Math.hypot(p.x - this.prevRoot.x, p.z - this.prevRoot.z) > 1.5;
    r.position.set(p.x, 0, p.z);
    this.prevRoot.set(p.x, 0, p.z);
    this.time += dt;

    // Split step: triggered by the start of the opponent's swing (its contact comes 0.12 s later),
    // so the feet are in the air as the racket meets the ball. Push-off: triggered by the player's
    // own follow-through, when the rally goes on.
    const swingT0 = p.swing > 0 ? 1 - p.swing : -1;
    if (opponent) {
      if (opponent.swing > 0.95 && this.prevOppSwing <= 0.95 && ball.inPlay && p.swing <= 0) { this.hopT = 0; this.hopCfg = SPLIT_STEP; }
      this.prevOppSwing = opponent.swing;
    }
    if (swingT0 >= 0.6 && this.prevSwingT >= 0 && this.prevSwingT < 0.6 && ball.inPlay) { this.hopT = 0; this.hopCfg = PUSH_OFF; }
    this.prevSwingT = swingT0;
    let hop = 0, dip = 0, landed = 0, airborne = false;
    if (this.hopT >= 0) {
      const c = this.hopCfg;
      const t = this.hopT += dt;
      if (t < c.load) dip = c.dip * Math.sin(Math.PI * t / c.load);
      else if (t < c.load + c.flight) { hop = c.height * Math.sin(Math.PI * (t - c.load) / c.flight); airborne = true; }
      else if (t < c.load + c.flight + c.land) {
        const u = (t - c.load - c.flight) / c.land;
        landed = u < 0.25 ? smooth(u / 0.25) : 1 - smooth((u - 0.25) / 0.75);
      } else this.hopT = -1;
    }
    const widen = landed * this.hopCfg.widen, sink = landed * this.hopCfg.sink;

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
      const l = (0.35 + 0.65 * reach) * Math.min(1, 0.1 + bell * 1.2);
      // Toward the front wall for a mid-court ball, toward the ball itself in a back corner.
      const corner = clamp((ball.z - (COURT.L - 1.7)) / 1.0, 0, 1);
      const bx = ball.x - p.x, bz = ball.z - p.z, bl = Math.hypot(bx, bz) || 1;
      if (l > lungeT) { lungeT = l; lx = lerp(side * 0.6, bx / bl, corner); lz = lerp(-0.8, bz / bl, corner); }
    }
    // Racket preparation: as soon as it is this player's ball, on the side the ball is.
    // Backhand for a ball on the left half of the court, forehand on the right half
    // (a right-hander), so the player prepares and turns early, before the ball is beside him.
    const prepT = ball.inPlay && myTurn && swingT < 0 ? 1 : 0;
    if (prepT > 0) this.prepSide = ball.x < COURT.W / 2 ? -1 : 1;

    const rate = 10;
    this.run = ease(this.run, runT, dt, rate);
    this.lateral = ease(this.lateral, latT, dt, rate);
    this.forward = ease(this.forward, fwdT, dt, rate);
    this.backward = ease(this.backward, bwdT, dt, rate);
    // Arrived early for our ball, the lunge is held (the player waits low in the stance) instead of
    // standing up and stepping about.
    const holdLunge = ball.inPlay && myTurn && swingT < 0 && distToTarget < 0.5 && speed < 1.2;
    if (holdLunge) lungeT = Math.max(lungeT, this.lunge);
    this.lunge = ease(this.lunge, lungeT, dt, lungeT > this.lunge ? 16 : (airborne ? 14 : 6));
    this.prep = ease(this.prep, prepT, dt, prepT > this.prep ? 10 : 5);
    if (lungeT > 0.05) { this.lungeX = ease(this.lungeX, lx, dt, 12); this.lungeZ = ease(this.lungeZ, lz, dt, 12); }
    const run = this.run, lat = this.lateral, fwd = this.forward, bwd = this.backward, lunge = this.lunge;

    const moveDir = this._move.set(dirX, 0, dirZ);

    // ------------------------------------------------ stroke pose
    const pose = this.pose;
    if (swingT >= 0) {
      sampleKeys(side > 0 ? FOREHAND : BACKHAND, clamp(swingT, 0, 1), pose);
    } else {
      sampleKeys(FOREHAND, 1, pose);
      // The ready squat is for waiting on the T; a running body stands taller.
      pose.knee *= 1 - 0.6 * run;
      pose.wide *= 1 - 0.5 * run;
      if (this.prep > 0.01) {
        sampleKeys(this.prepSide > 0 ? FOREHAND : BACKHAND, 0, this.prepPose);
        // While running the body cannot be fully sideways: keep the arm prepared, soften the body.
        // The body turns toward the side wall already while moving to the ball.
        this.prepPose.yaw *= 1 - 0.3 * run;
        this.prepPose.shoulders *= 1 - 0.3 * run;
        // The staggered stance is taken on arrival, not stepped into before the run starts.
        const near = 1 - clamp((distToTarget - 0.3) / 0.6, 0, 1);
        this.prepPose.step *= (1 - run) * near;
        this.prepPose.wide *= (1 - run) * near;
        this.prepPose.knee *= 1 - 0.5 * run;
        blendPose(pose, this.prepPose, this.prep);
      }
    }
    // Ball height at contact: low balls pull the arm and the body down,
    // high balls (volleys) bring the extended arm up to shoulder height with the body upright.
    const h = clamp(ball.y, 0.1, 2.0);
    const stroke = swingT >= 0 ? Math.sin(Math.PI * clamp(swingT / 0.62, 0, 1)) : 0;
    const lowBall = clamp((1.0 - h) / 0.9, 0, 1) * stroke;
    const highBall = clamp((h - 1.0) / 0.6, 0, 1) * stroke;
    pose.E.y += highBall * 0.8 - lowBall * 0.6; pose.E.normalize();
    pose.W.y += highBall * 0.95 - lowBall * 0.6; pose.W.normalize();
    pose.R.y += highBall * 0.35 - lowBall * 0.25; pose.R.normalize();
    const tall = 1 - 0.6 * highBall;
    pose.pitch *= tall; pose.drop *= tall; pose.knee *= tall;

    // ------------------------------------------------ facing
    // Body orientation: the body follows the ball. When it is our ball the stroke
    // pose turns the hips to the side wall; otherwise the body half-turns toward
    // the ball (the head completes the turn) and leans into the run direction.
    const yawToBall = Math.atan2(-(ball.x - p.x), -(ball.z - p.z));
    let face = 0;
    if (bwd > 0.1) face = -Math.sign(dirX || 1) * 0.5 * bwd;
    if (fwd > 0.1) face += -dirX * 0.25 * fwd;
    if (ball.inPlay) {
      const follow = clamp(yawToBall, -1.3, 1.3) * (myTurn ? 0.6 : 0.3);
      // A ball in a back corner is dug out facing the corner: the body turns further toward the
      // back wall for the preparation (the turn unwinds through the swing), so it never backs
      // through the glass.
      const corner = clamp((ball.z - (COURT.L - 1.7)) / 1.0, 0, 1) * (1 - clamp(swingT >= 0 ? swingT * 1.4 : 0, 0, 1));
      const cornerYaw = pose.yaw + corner * ((swingT >= 0 ? side : this.prepSide) > 0 ? -0.75 : 0.45);
      face = lerp(face + follow, face + cornerYaw, clamp(Math.max(this.prep, swingT >= 0 ? 1 : 0), 0, 1));
    } else {
      face += pose.yaw;
    }
    this.facing = ease(this.facing, face, dt, 9);
    r.rotation.y = this.facing;
    const fwdW = this._fwd.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));   // body forward, world
    const rightW = this._right.set(Math.cos(this.facing), 0, -Math.sin(this.facing)); // body right, world

    // ------------------------------------------------ footsteps
    const strokeSide = swingT >= 0 ? side : this.prepSide;
    const stepLead = 0.12; // seconds of velocity the rest position leads the body by
    for (let i = 0; i < 2; i++) {
      const ls = this.legs[i].side;
      const frontFoot = ls === -strokeSide;
      // Rest position: under the hip, spread by the stance, staggered by the pose, pushed by a lunge, led by velocity.
      let lateral = ls * (STANCE_HALF + pose.wide + widen);
      let ahead = frontFoot ? pose.step * 0.42 : -pose.step * 0.3;
      if (lunge > 0.02) {
        const front = inStroke || this.prep > 0.5 ? frontFoot : (Math.abs(this.lungeX) > 0.35 ? Math.sign(this.lungeX) === ls : ls === -ballSide);
        // Lunge direction (world) expressed in body space.
        const lxB = this.lungeX * Math.cos(this.facing) - this.lungeZ * Math.sin(this.facing);
        const lzB = -(this.lungeX * Math.sin(this.facing) + this.lungeZ * Math.cos(this.facing));
        if (front) { lateral += lxB * 0.42 * lunge; ahead = lerp(ahead, lzB * 0.52, lunge); }
        else { lateral -= lxB * 0.45 * lunge; ahead = lerp(ahead, -lzB * 0.5 - 0.1, lunge); }   // back leg extended behind, along the lunge
      }
      const rest = this._rest[i].copy(r.position).addScaledVector(rightW, lateral).addScaledVector(fwdW, ahead);
      rest.x += p.vx * stepLead; rest.z += p.vz * stepLead;
      rest.y = 0;
    }

    // ------------------------------------------------ strides
    // A run is a sequence of discrete footfalls driven by the distance the hips cover, not by
    // time, so a planted foot stays put and each footfall lands where the body is when it gets
    // there. Squash footwork is economical: from the T any ball is reached in 2-4 footfalls, the
    // last one the lunge into the stance (right-left-right into the back-left corner), the first
    // pushing straight off the split-step landing. With a destination the footfall length comes
    // from the distance; without one (keyboard) the footfalls roll on at a length set by the speed.
    let st = this.stride;
    const canPlan = distToTarget > 0.7 && speed > 0.25 && !inStroke;
    if (st && (jumped || inStroke || speed < 0.3)) {
      // The run is over: a footfall still in the air finishes on the clock. The lunge keeps its
      // landing spot (the body has stopped under it); any other footfall comes down into the stance.
      this.feet.forEach((ft, i) => {
        if (!ft.stride || ft.swing < 0) return;
        ft.clock = true; ft.duration = 0.18;
        if (!(st.planned && st.k === st.N - 1)) { ft.stride = false; ft.to.copy(this._rest[i]); }
      });
      st = this.stride = null;
    }
    if (!st && !inStroke && !jumped && (canPlan || (speed > 0.6 && distToTarget > 0.25))) {
      st = this.stride = { g: 0, k: 0, N: Infinity, F: 1, lands: [], feet: [], planned: false, tx: 0, tz: 0, landG: [-1, -1], lungeAmt: 0 };
      this._planStrides(st, p, distToTarget, dirX, dirZ, strokeSide, ballSide, canPlan, moveDir);
    } else if (st && st.planned && canPlan && Math.hypot(p.targetX - st.tx, p.targetZ - st.tz) > 0.6) {
      this._planStrides(st, p, distToTarget, dirX, dirZ, strokeSide, ballSide, true, moveDir);
    }
    let strideDip = 0;
    if (st) {
      st.g += speed * dt;
      const lead = Math.min(0.4, 0.3 * st.F);   // a foot lands this far ahead of the hips
      const back = Math.min(0.35, 0.3 * st.F);  // and leaves when the hips are this far past it
      const j = st.k;                            // the footfall to land next
      const swinging = this.feet.some((f) => f.swing >= 0);
      if (j < st.N && !swinging && !airborne) {
        if (st.lands[j] === undefined) {
          // Rolling run: the next footfall a stride on from the last, the stride set by the speed.
          st.F = clamp(0.75 + 0.15 * speed, 0.8, 1.35);
          st.lands[j] = Math.max(st.g + 0.25, j === 0 ? st.F - lead : st.lands[j - 1] + st.F);
          st.feet[j] = j === 0 ? st.feet[0] : 1 - st.feet[j - 1];
        }
        const prevPos = j >= 2 ? st.lands[j - 2] + lead : 0;
        if (j === 0 || st.g >= prevPos + back) {
          if (st.lands[j] < st.g + 0.2 && !(st.planned && j === st.N - 1)) st.lands[j] = st.g + 0.2;
          const ft = this.feet[st.feet[j]];
          ft.stride = true; ft.clock = false; ft.swing = 0; ft.jogSwing = 0; ft.g0 = st.g;
          ft.from.copy(ft.planted);
          ft.lift = st.planned && j === st.N - 1 ? 0.07 : 0.09 + 0.07 * clamp(speed / 4, 0, 1);
        }
      }
      for (let i = 0; i < 2; i++) {
        const ft = this.feet[i];
        if (!ft.stride || ft.swing < 0) continue;
        const g1 = Math.max(st.lands[st.k], ft.g0 + 0.05);
        const u = clamp((st.g - ft.g0) / (g1 - ft.g0), 0, 1);
        ft.swing = u; ft.jogSwing = u;
        const ls = this.legs[i].side;
        if (st.planned && st.k === st.N - 1) {
          // The last footfall is the lunge: it lands where the stance wants that foot once the hips
          // reach the target (the run direction expressed in body space, as the stance does it).
          const la = st.lungeAmt;
          const lxB = dirX * Math.cos(this.facing) - dirZ * Math.sin(this.facing);
          const lzB = -(dirX * Math.sin(this.facing) + dirZ * Math.cos(this.facing));
          ft.to.set(p.targetX, 0, p.targetZ)
            .addScaledVector(rightW, ls * (STANCE_HALF + pose.wide) + lxB * 0.42 * la)
            .addScaledVector(fwdW, lzB * 0.52 * la);
        } else {
          ft.to.copy(r.position).addScaledVector(moveDir, g1 - st.g + lead).addScaledVector(rightW, ls * (STANCE_HALF * 0.75 + 0.02));
          ft.to.y = 0;
        }
        if (u >= 1) { ft.swing = -1; ft.jogSwing = -1; ft.planted.copy(ft.to); st.landG[i] = st.g; st.k++; }
      }
      // Hips lowest at mid-stance of the planted foot, slightly up in flight.
      for (let i = 0; i < 2; i++) {
        if (st.landG[i] < 0 || this.feet[i].swing >= 0) continue;
        strideDip = Math.max(strideDip, Math.sin(Math.PI * clamp((st.g - st.landG[i]) / (0.55 * st.F), 0, 1)));
      }
    }
    this.strideW = ease(this.strideW, st ? 1 : 0, dt, 10);
    const jogW = this.strideW;

    // ------------------------------------------------ step system (shuffles, stances)
    for (let i = 0; i < 2; i++) {
      const ft = this.feet[i];
      const ot = this.feet[1 - i];
      const rest = this._rest[i];
      if (jumped || !Number.isFinite(ft.planted.x)) { ft.planted.copy(rest); ft.swing = -1; ft.stride = false; ft.jogSwing = -1; }
      if (ft.swing >= 0 && (!ft.stride || ft.clock)) {
        ft.swing += dt / ft.duration;
        if (ft.stride) ft.jogSwing = Math.min(ft.swing, 1);
        if (ft.swing >= 1) { ft.swing = -1; ft.jogSwing = -1; ft.planted.copy(ft.to); }
      }
      if (airborne && ft.swing < 0) ft.planted.lerp(rest, Math.min(1, dt * 18));
      // No shuffles while a run is on or starting (the strides do the moving).
      if (ft.swing < 0 && ot.swing < 0 && !airborne && !st && !(distToTarget > 0.5 && speed > 0.1)) {
        const dist = Math.hypot(ft.planted.x - rest.x, ft.planted.z - rest.z);
        const otherRest = this._rest[1 - i];
        const otherDist = Math.hypot(ot.planted.x - otherRest.x, ot.planted.z - otherRest.z);
        // No fidgeting once settled in a stroke or lunge stance: the feet stay where the last
        // footfall left them unless the stance has really moved.
        const settled = speed < 1.0 && distToTarget < 0.4;
        const inStance = this.prep > 0.5 || lunge > 0.05;
        const threshold = settled ? (inStance ? 0.6 : 0.45) : 0.2 + 0.08 * Math.min(speed, 4);
        if (dist > threshold && dist >= otherDist - 0.02) {
          ft.swing = 0; ft.stride = false; ft.clock = false; ft.jogSwing = -1;
          if (this.debugStep) this.debugStep({ foot: i, dist, threshold, speed, lunge, prep: this.prep, facing: this.facing, distToTarget, from: ft.planted.clone(), to: rest.clone(), hips: r.position.clone() });
          ft.from.copy(ft.planted);
          ft.to.copy(rest).addScaledVector(this._tmp.set(p.vx, 0, p.vz), 0.06);
          ft.duration = clamp(0.3 - 0.035 * speed, 0.14, 0.3);
          ft.lift = 0.04 + 0.03 * Math.min(speed, 4) + 0.05 * lunge;
        }
      }
      if (ft.swing >= 0) {
        const u = smooth(ft.swing);
        ft.pos.lerpVectors(ft.from, ft.to, u);
        ft.pos.y = Math.sin(Math.PI * ft.swing) * ft.lift;
      } else {
        ft.pos.copy(ft.planted);
        ft.pos.y = 0;
      }
    }
    // Both feet leave the floor in a hop.
    for (const ft of this.feet) if (ft.swing < 0) ft.pos.y += hop;
    const jogDip = (0.042 * strideDip - 0.012) * jogW;
    const swingMax = Math.max(this.feet[0].stride ? -1 : this.feet[0].swing, this.feet[1].stride ? -1 : this.feet[1].swing);
    const stepBob = (swingMax >= 0 ? Math.sin(Math.PI * swingMax) * 0.012 * (0.5 + run) : 0) * (1 - jogW);

    // ------------------------------------------------ body height and torso
    const waiting = ball.inPlay && swingT < 0 && run < 0.15;
    const breathe = waiting ? Math.sin(this.time * 2.2) * 0.006 : 0;
    const stanceDrop = 0.07;
    const kneeDrop = pose.knee * 0.22;
    // Lower the hips when the feet are far apart so the legs can reach (lunge).
    const spread = Math.hypot(this.feet[0].pos.x - this.feet[1].pos.x, this.feet[0].pos.z - this.feet[1].pos.z);
    const spreadDrop = clamp((spread - 0.5) * 0.35, 0, 0.22);
    this.hips.position.y = this.dims.hipsY - stanceDrop - run * 0.04 - pose.drop - kneeDrop - spreadDrop - lowBall * 0.05 + stepBob + breathe + hop - sink - dip - jogDip;

    this.torso.rotation.set(0, 0, 0);
    this.torso.rotation.y = pose.shoulders;
    this.torso.rotation.x = -(pose.pitch + fwd * 0.2 + bwd * 0.05 + lunge * 0.12 + lowBall * 0.2);
    this.torso.rotation.z = -lat * 0.18 - this.lungeX * lunge * 0.15;
    // Eyes on the ball when it is ours, before and through the stroke; while waiting on the T, watch the
    // opponent to read the shot. Yaw then pitch from the eyes toward the target (the eyes do the rest).
    this.head.rotation.order = 'YXZ';
    const watch = ball.inPlay && !myTurn && opponent && swingT < 0 ? opponent : ball;
    if (ball.inPlay) {
      const dx = watch.x - p.x, dz = watch.z - p.z;
      const eyeY = this.hips.position.y + 0.62;
      const dy = watch === ball ? ball.y - eyeY : 0;
      const horiz = Math.hypot(dx, dz) || 0.01;
      let relYaw = Math.atan2(-dx, -dz) - this.facing - this.torso.rotation.y;
      relYaw = Math.atan2(Math.sin(relYaw), Math.cos(relYaw));
      this.head.rotation.y = clamp(relYaw * (watch === ball ? 0.9 : 0.85), -1.25, 1.25);
      this.head.rotation.x = clamp(-this.torso.rotation.x * 0.85 + Math.atan2(dy, horiz) * 0.9, -0.95, 0.6);
    } else {
      this.head.rotation.y = 0;
      this.head.rotation.x = -this.torso.rotation.x * 0.85;
    }

    // ------------------------------------------------ legs (IK to the feet)
    const cosF = Math.cos(this.facing), sinF = Math.sin(this.facing);
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      const ft = this.feet[i];
      // World -> root-local (inverse of rotation.y = facing).
      const wx = ft.pos.x - r.position.x, wz = ft.pos.z - r.position.z;
      const localX = wx * cosF - wz * sinF;
      const localZ = wx * sinF + wz * cosF;
      const hipLocal = this._e.set(leg.side * this.dims.hipX, this.hips.position.y, 0);
      // Toes down while the foot swings; back heel up in a stroke stance.
      const frontFoot = leg.side === -strokeSide;
      let toe = ft.swing >= 0 ? 0.35 * Math.sin(Math.PI * ft.swing) : 0;
      if (ft.jogSwing >= 0) toe += 0.45 * Math.sin(Math.PI * ft.jogSwing) * jogW;
      if (airborne && ft.swing < 0) toe += 0.3 * hop / this.hopCfg.height;
      if (!frontFoot && (pose.step > 0.3 || lunge > 0.3)) toe += 0.45 * Math.max(pose.step, lunge);
      // The foot pivots about the ankle, so a lifted heel raises the ankle by the toe lever; the toes stay on the floor.
      const footLocal = this._w.set(localX, ft.pos.y + this.dims.ankle + this.dims.toeLen * Math.sin(toe), localZ);
      this._poseLeg(leg, hipLocal, footLocal, toe);
    }

    // ------------------------------------------------ arms
    this._poseArm(this.arms[1], pose.E, pose.W, pose.R, pose.N);
    const pump = fwd * 0.5 + bwd * 0.3;
    if (pump > 0.02 && swingT < 0 && this.prep < 0.3) {
      const s = Math.sin(this.time * 9) * pump;
      const LE = this._x.set(-0.35, -0.8 + s * 0.3, -0.3 - s * 0.6).normalize();
      const LW = this._y.set(-0.1, -0.3 + s * 0.2, -0.95).normalize();
      this._poseArm(this.arms[0], LE, LW, null, null);
    } else {
      this._poseArm(this.arms[0], pose.LE, pose.LW, null, null);
    }
  }
}
