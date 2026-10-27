/**
 * @module render3d/skinned-player
 * Drives a rigged glTF character (Mixamo skeleton) from the procedural
 * animation solver.
 *
 * The procedural {@link PlayerModel} keeps doing all the work (footsteps,
 * leg IK, stroke keyframes, body turn) but stays invisible: after each
 * update its pivot groups give, for every body segment, a world-space
 * direction and bend axis. Each Mixamo bone is then rotated so that its
 * rest direction and bend axis land on those (direction retargeting), and
 * the hips bone is placed at the solver's hips. The racket is attached to
 * the right hand bone with the correction that makes it line up with the
 * solver's racket.
 *
 * Works with any character on the standard Mixamo rig (bones named
 * `mixamorig<Name>`), such as the three.js Xbot test mannequin or a Mixamo /
 * Ready Player Me human. The character must be exported in a T-pose; the
 * facing direction and bone orientations are read from the rest pose.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PlayerModel } from './player3d.js';
import { makeRacket } from './racket-model.js';

const cache = new Map();

/**
 * Load (and cache) a glTF character.
 * @param {string} url
 * @returns {Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>}
 */
export function loadCharacter(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => new GLTFLoader().load(url, resolve, undefined, reject)));
  }
  return cache.get(url);
}

const UP = new THREE.Vector3(0, 1, 0);

/** Quaternion of the frame whose +y is `y` and whose +z is `zHint` made orthogonal. */
function frameYZ(y, zHint, out, m = new THREE.Matrix4(), tx = new THREE.Vector3(), ty = new THREE.Vector3(), tz = new THREE.Vector3()) {
  ty.copy(y).normalize();
  tz.copy(zHint).addScaledVector(ty, -zHint.dot(ty));
  if (tz.lengthSq() < 1e-8) tz.set(1, 0, 0).addScaledVector(ty, -ty.x);
  tz.normalize();
  tx.crossVectors(ty, tz).normalize();
  return out.setFromRotationMatrix(m.makeBasis(tx, ty, tz));
}

/** Quaternion of the frame whose +y is `y` and whose +x is `xHint` made orthogonal. */
function frameYX(y, xHint, out, m = new THREE.Matrix4(), tx = new THREE.Vector3(), ty = new THREE.Vector3(), tz = new THREE.Vector3()) {
  ty.copy(y).normalize();
  tx.copy(xHint).addScaledVector(ty, -xHint.dot(ty));
  if (tx.lengthSq() < 1e-8) tx.set(0, 0, 1).addScaledVector(ty, -ty.z);
  tx.normalize();
  tz.crossVectors(tx, ty).normalize();
  return out.setFromRotationMatrix(m.makeBasis(tx, ty, tz));
}

export class SkinnedPlayer {
  /**
   * @param {import('three/examples/jsm/loaders/GLTFLoader.js').GLTF} gltf loaded character
   * @param {number} color team colour (tints the character and the racket)
   * @param {{number?:number}} [look]
   */
  constructor(gltf, color, look = {}) {
    this.root = cloneSkeleton(gltf.scene);
    this.root.updateMatrixWorld(true);

    // Bones by short name.
    this.bones = {};
    this.root.traverse((o) => { if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o; });
    const b = this.bones;
    const need = ['Hips', 'Spine', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
      'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandMiddle1', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1'];
    for (const n of need) if (!b[n]) throw new Error(`character is missing bone ${n}`);
    this.armature = b.Hips.parent;

    // Rest-pose world positions and derived bone lengths (metres).
    const pos = (bone) => bone.getWorldPosition(new THREE.Vector3());
    const P = {};
    for (const n of need) P[n] = pos(b[n]);
    const thigh = P.LeftUpLeg.distanceTo(P.LeftLeg);
    const shin = P.LeftLeg.distanceTo(P.LeftFoot);
    const ankle = P.LeftFoot.y - Math.min(P.LeftToeBase.y, 0);
    const hipX = Math.abs(P.LeftUpLeg.x);
    const hipsY = P.Hips.y;
    // Rest facing: left is from the right hip to the left hip, forward = left x up.
    const LEFT_REST = P.LeftUpLeg.clone().sub(P.RightUpLeg).setY(0).normalize();
    const FWD_REST = new THREE.Vector3().crossVectors(LEFT_REST, UP).normalize();
    this.fwdRest = FWD_REST;

    // Invisible solver with this character's leg geometry.
    this.solver = new PlayerModel(color, look, { thigh, shin, ankle, hipX, hipsY });
    this.solver.root.visible = false;

    // Rest frames: direction (bone -> child) and bend axis / normal in the rest pose.
    // Legs: bend axis is the character's +x (left) for a forward-bending knee; arms: -y (left) / +y (right).
    const dir = (a, c) => P[c].clone().sub(P[a]).normalize();
    this.rest = {
      Hips: frameYZ(UP, FWD_REST, new THREE.Quaternion()),
      Spine: frameYZ(UP, FWD_REST, new THREE.Quaternion()),
      Head: frameYZ(UP, FWD_REST, new THREE.Quaternion()),
      LeftUpLeg: frameYX(dir('LeftUpLeg', 'LeftLeg'), LEFT_REST, new THREE.Quaternion()),
      LeftLeg: frameYX(dir('LeftLeg', 'LeftFoot'), LEFT_REST, new THREE.Quaternion()),
      RightUpLeg: frameYX(dir('RightUpLeg', 'RightLeg'), LEFT_REST, new THREE.Quaternion()),
      RightLeg: frameYX(dir('RightLeg', 'RightFoot'), LEFT_REST, new THREE.Quaternion()),
      LeftFoot: frameYZ(UP, FWD_REST, new THREE.Quaternion()),
      RightFoot: frameYZ(UP, FWD_REST, new THREE.Quaternion()),
      LeftArm: frameYX(dir('LeftArm', 'LeftForeArm'), new THREE.Vector3(0, -1, 0), new THREE.Quaternion()),
      LeftForeArm: frameYX(dir('LeftForeArm', 'LeftHand'), new THREE.Vector3(0, -1, 0), new THREE.Quaternion()),
      RightArm: frameYX(dir('RightArm', 'RightForeArm'), new THREE.Vector3(0, 1, 0), new THREE.Quaternion()),
      RightForeArm: frameYX(dir('RightForeArm', 'RightHand'), new THREE.Vector3(0, 1, 0), new THREE.Quaternion()),
      LeftHand: frameYZ(dir('LeftHand', 'LeftHandMiddle1'), new THREE.Vector3(0, -1, 0), new THREE.Quaternion()),
      RightHand: frameYZ(dir('RightHand', 'RightHandMiddle1'), new THREE.Vector3(0, -1, 0), new THREE.Quaternion()),
    };
    // Rest world rotation of every bone (needed when it is not the identity).
    this.restWorld = {};
    for (const n of Object.keys(this.rest)) this.restWorld[n] = b[n].getWorldQuaternion(new THREE.Quaternion());

    // Team tint on the character's materials (cloned so the two players differ).
    const tint = new THREE.Color(color);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        c.color.copy(tint).lerp(new THREE.Color(0xffffff), m.map ? 0.72 : 0.35);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });

    // Fingers: curl the racket hand around the grip, relax the free hand.
    for (const side of ['Left', 'Right']) {
      const grip = side === 'Right';
      for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
        for (let j = 1; j <= 3; j++) {
          const bone = b[`${side}Hand${finger}${j}`];
          if (!bone) continue;
          // Fingers point along ±x in rest and bend toward the palm (-y): rotate about z.
          const bend = (grip ? [0.9, 1.1, 0.7] : [0.35, 0.4, 0.25])[j - 1];
          bone.rotation.set(0, 0, side === 'Right' ? -bend : bend);
        }
      }
      for (let j = 1; j <= 3; j++) {
        const bone = b[`${side}HandThumb${j}`];
        if (bone) bone.rotation.set(0, side === 'Right' ? 0.35 : -0.35, grip ? 0.3 : 0.1);
      }
    }

    // Racket on the right hand: local correction so its world orientation equals the solver's.
    this.racket = makeRacket(color);
    this.racketHolder = new THREE.Group();
    b.RightHand.add(this.racketHolder);
    this.racketHolder.add(this.racket);
    // Bone space is scaled (cm); counter it on the holder.
    const sc = new THREE.Vector3();
    b.RightHand.getWorldScale(sc);
    this.racketHolder.scale.setScalar(1 / sc.x);

    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._world = new Map();
    this.feet = this.solver.feet;
    this.hips = this.solver.hips;
  }

  /** World-space +y and +z of a solver pivot. */
  _axes(obj, y, z) {
    obj.getWorldQuaternion(this._q);
    y.set(0, 1, 0).applyQuaternion(this._q);
    z.set(0, 0, 1).applyQuaternion(this._q);
  }

  /** Desired world rotation for a bone = solverFrame * restFrame^-1 * restWorld. */
  _desired(name, frame, out) {
    return out.copy(frame).multiply(this._q2.copy(this.rest[name]).invert()).multiply(this.restWorld[name]);
  }

  /**
   * @param {import('../entities/player.js').Player} p
   * @param {{x:number,y:number,z:number,inPlay?:boolean}} ball
   * @param {number} dt
   * @param {import('../entities/player.js').Player} [opponent]
   * @param {boolean} [myTurn]
   */
  update(p, ball, dt, opponent, myTurn = true) {
    const s = this.solver;
    s.update(p, ball, dt, opponent, myTurn);
    s.root.updateMatrixWorld(true);
    const b = this.bones;
    const y = this._v, z = this._v2, x = this._v3;
    const desired = this._world;
    desired.clear();

    // Hips: position from the solver, facing from the root.
    const hipsWorld = s.hips.getWorldPosition(new THREE.Vector3());
    this._axes(s.hips, y, z);
    z.negate(); // solver faces -z
    desired.set('Hips', this._desired('Hips', frameYZ(y, z, new THREE.Quaternion()), new THREE.Quaternion()));
    b.Hips.position.copy(this.armature.worldToLocal(hipsWorld.clone()));

    // Spine from the torso, head from the head group.
    this._axes(s.torso, y, z); z.negate();
    desired.set('Spine', this._desired('Spine', frameYZ(y, z, new THREE.Quaternion()), new THREE.Quaternion()));
    this._axes(s.head, y, z); z.negate();
    desired.set('Head', this._desired('Head', frameYZ(y, z, new THREE.Quaternion()), new THREE.Quaternion()));

    // Legs: segment direction = pivot -y in world; bend axis = cross(thigh, shin), fallback the body's left.
    const leftW = new THREE.Vector3(-1, 0, 0).applyQuaternion(s.root.quaternion);
    for (const [i, side] of [[0, 'Left'], [1, 'Right']]) {
      const leg = s.legs[i];
      const dT = new THREE.Vector3(0, -1, 0).applyQuaternion(leg.hip.getWorldQuaternion(new THREE.Quaternion()));
      const dS = new THREE.Vector3(0, -1, 0).applyQuaternion(leg.knee.getWorldQuaternion(new THREE.Quaternion()));
      let axis = new THREE.Vector3().crossVectors(dT, dS);
      if (axis.lengthSq() < 1e-4) axis.copy(leftW); else axis.normalize();
      // Keep the axis pointing to the body's left so the knee never flips.
      if (axis.dot(leftW) < 0) axis.negate();
      desired.set(`${side}UpLeg`, this._desired(`${side}UpLeg`, frameYX(dT, axis, new THREE.Quaternion()), new THREE.Quaternion()));
      desired.set(`${side}Leg`, this._desired(`${side}Leg`, frameYX(dS, axis, new THREE.Quaternion()), new THREE.Quaternion()));
      this._axes(leg.foot, y, z); z.negate();
      desired.set(`${side}Foot`, this._desired(`${side}Foot`, frameYZ(y, z, new THREE.Quaternion()), new THREE.Quaternion()));
    }

    // Arms: direction = pivot -y; bend axis = cross(upper, fore), fallback perpendicular to the arm in the forward plane.
    const fwdW = new THREE.Vector3(0, 0, -1).applyQuaternion(s.root.quaternion);
    for (const [i, side, restAxisSign] of [[0, 'Left', -1], [1, 'Right', 1]]) {
      const arm = s.arms[i];
      const dU = new THREE.Vector3(0, -1, 0).applyQuaternion(arm.shoulder.getWorldQuaternion(new THREE.Quaternion()));
      const dF = new THREE.Vector3(0, -1, 0).applyQuaternion(arm.elbow.getWorldQuaternion(new THREE.Quaternion()));
      let axis = new THREE.Vector3().crossVectors(dU, dF);
      if (axis.lengthSq() < 1e-4) axis.crossVectors(dU, fwdW);
      if (axis.lengthSq() < 1e-4) axis.set(0, restAxisSign, 0);
      axis.normalize();
      desired.set(`${side}Arm`, this._desired(`${side}Arm`, frameYX(dU, axis, new THREE.Quaternion()), new THREE.Quaternion()));
      desired.set(`${side}ForeArm`, this._desired(`${side}ForeArm`, frameYX(dF, axis, new THREE.Quaternion()), new THREE.Quaternion()));
      // Hand: fingers along the pivot's -y (continuing into the racket handle), palm normal along the pivot's -z.
      const qH = arm.hand.getWorldQuaternion(new THREE.Quaternion());
      const dH = new THREE.Vector3(0, -1, 0).applyQuaternion(qH);
      const nH = new THREE.Vector3(0, 0, -1).applyQuaternion(qH);
      desired.set(`${side}Hand`, this._desired(`${side}Hand`, frameYZ(dH, nH, new THREE.Quaternion()), new THREE.Quaternion()));
      if (side === 'Right') this._handWorld = qH;
    }

    // Apply: walk the hierarchy so each local rotation is relative to the parent's actual world rotation.
    const applyBone = (bone, parentWorld) => {
      let world;
      const name = bone.name.replace(/^mixamorig:?/, '');
      if (desired.has(name)) {
        world = desired.get(name);
        bone.quaternion.copy(parentWorld).invert().multiply(world);
      } else {
        world = new THREE.Quaternion().copy(parentWorld).multiply(bone.quaternion);
      }
      for (const c of bone.children) if (c.isBone) applyBone(c, world);
    };
    const armatureWorld = this.armature.getWorldQuaternion(new THREE.Quaternion());
    applyBone(b.Hips, armatureWorld);

    // Racket: make its world orientation equal the solver hand's (handle along -y, strings +z).
    this.root.updateMatrixWorld(true);
    const handWorld = b.RightHand.getWorldQuaternion(new THREE.Quaternion());
    this.racketHolder.quaternion.copy(handWorld).invert().multiply(this._handWorld);
  }
}
