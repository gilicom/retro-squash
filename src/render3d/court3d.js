/**
 * @module render3d/court3d
 * Builds the 3-D court: sprung maple floor, plaster walls, the tin, all
 * red markings as thin raised bars (no z-fighting), a glass back wall with
 * mullions, ceiling light panels and the lighting rig.
 *
 * World axes match the physics: x across (0..W), y up, z depth (0 = front wall).
 */
import * as THREE from 'three';
import { COURT } from '../config/court.js';
import { woodTexture, plasterTexture } from './textures.js';

const { W, L, CEILING: H, FRONT_OUT, BACK_OUT, SERVICE_LINE, TIN, SHORT_LINE_Z, BOX } = COURT;

/** Line thickness (m) and the tiny offset that lifts markings off a surface. */
const LINE_T = 0.05;
const LIFT = 0.004;

/**
 * A thin bar from a to b lying in the surface whose outward normal is `normal`.
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {THREE.Vector3} normal unit normal of the surface the bar lies on
 * @param {THREE.Material} material
 * @param {number} [thickness]
 */
export function bar(a, b, normal, material, thickness = LINE_T) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  const up = new THREE.Vector3().crossVectors(normal, dir).normalize();
  const geo = new THREE.BoxGeometry(len, thickness, LIFT);
  const mesh = new THREE.Mesh(geo, material);
  const m = new THREE.Matrix4().makeBasis(dir, up, normal);
  mesh.quaternion.setFromRotationMatrix(m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(normal, LIFT / 2 + 0.001);
  mesh.receiveShadow = true;
  return mesh;
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer used to read max anisotropy
 * @returns {{group: THREE.Group, lineMaterial: THREE.Material}}
 */
export function buildCourt(scene, renderer) {
  const group = new THREE.Group();
  const aniso = renderer.capabilities.getMaxAnisotropy();

  // ---------------------------------------------------------------- floor
  const wood = woodTexture();
  wood.anisotropy = aniso;
  wood.repeat.set(1, L / W);
  const floorMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.42, metalness: 0.02 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, L / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // ---------------------------------------------------------------- walls
  const plaster = plasterTexture();
  plaster.anisotropy = aniso;
  plaster.repeat.set(3, 2);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf3efe6, map: plaster, roughness: 0.88, metalness: 0 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xece8de, map: plaster, roughness: 0.9, metalness: 0 });

  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
  front.position.set(W / 2, H / 2, 0);
  front.receiveShadow = true;
  group.add(front);

  const left = new THREE.Mesh(new THREE.PlaneGeometry(L, H), sideMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(0, H / 2, L / 2);
  left.receiveShadow = true;
  group.add(left);

  const right = new THREE.Mesh(new THREE.PlaneGeometry(L, H), sideMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(W, H / 2, L / 2);
  right.receiveShadow = true;
  group.add(right);

  // Ceiling: dark, with four emissive light panels.
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2, H, L / 2);
  group.add(ceil);
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xfff6e8 });
  for (let i = 0; i < 3; i++) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.32), panelMat);
    panel.rotation.x = Math.PI / 2;
    panel.position.set(W / 2, H - 0.01, 1.6 + i * 2.6);
    group.add(panel);
  }

  // ----------------------------------------------------------------- tin
  const tinMat = new THREE.MeshStandardMaterial({ color: 0x272b33, roughness: 0.6, metalness: 0.2 });
  const tin = new THREE.Mesh(new THREE.BoxGeometry(W, TIN - LINE_T, 0.02), tinMat);
  tin.position.set(W / 2, (TIN - LINE_T) / 2, 0.01);
  tin.receiveShadow = true;
  group.add(tin);

  // ------------------------------------------------------------- markings
  const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xd4232a, roughness: 0.55, emissive: 0x3a0406 });
  const nFront = v(0, 0, 1), nLeft = v(1, 0, 0), nRight = v(-1, 0, 0), nFloor = v(0, 1, 0), nBack = v(0, 0, -1);
  const lines = [
    // Front wall: tin top edge, service line, out line.
    bar(v(0, TIN - LINE_T / 2, 0), v(W, TIN - LINE_T / 2, 0), nFront, lineMaterial),
    bar(v(0, SERVICE_LINE, 0), v(W, SERVICE_LINE, 0), nFront, lineMaterial),
    bar(v(0, FRONT_OUT, 0), v(W, FRONT_OUT, 0), nFront, lineMaterial),
    // Side wall out lines (diagonal).
    bar(v(0, FRONT_OUT, 0), v(0, BACK_OUT, L), nLeft, lineMaterial),
    bar(v(W, FRONT_OUT, 0), v(W, BACK_OUT, L), nRight, lineMaterial),
    // Floor: short line, half-court line, service boxes.
    bar(v(0, 0, SHORT_LINE_Z), v(W, 0, SHORT_LINE_Z), nFloor, lineMaterial),
    bar(v(W / 2, 0, SHORT_LINE_Z), v(W / 2, 0, L), nFloor, lineMaterial),
    bar(v(0, 0, SHORT_LINE_Z + BOX), v(BOX, 0, SHORT_LINE_Z + BOX), nFloor, lineMaterial),
    bar(v(BOX, 0, SHORT_LINE_Z), v(BOX, 0, SHORT_LINE_Z + BOX), nFloor, lineMaterial),
    bar(v(W - BOX, 0, SHORT_LINE_Z + BOX), v(W, 0, SHORT_LINE_Z + BOX), nFloor, lineMaterial),
    bar(v(W - BOX, 0, SHORT_LINE_Z), v(W - BOX, 0, SHORT_LINE_Z + BOX), nFloor, lineMaterial),
    // Back wall out line on the glass.
    bar(v(0, BACK_OUT, L), v(W, BACK_OUT, L), nBack, lineMaterial),
  ];
  for (const l of lines) group.add(l);

  // --------------------------------------------------------- glass wall
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe3ff, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0.0,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glassMat);
  glass.position.set(W / 2, H / 2, L);
  glass.renderOrder = 10;
  group.add(glass);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.5, metalness: 0.6 });
  // Corner posts only: nothing may obstruct the view of the court centre.
  for (const x of [0, W]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.08), frameMat);
    post.position.set(x, H / 2, L);
    group.add(post);
  }
  // Thin glass fins at the panel joints (real glass courts have them); slim and off-centre.
  const finMat = new THREE.MeshPhysicalMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  for (const x of [W / 4, (3 * W) / 4]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.015, H, 0.25), finMat);
    fin.position.set(x, H / 2, L + 0.12);
    fin.renderOrder = 11;
    group.add(fin);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.12, 0.1), frameMat);
  beam.position.set(W / 2, H, L);
  group.add(beam);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.06, 0.1), frameMat);
  sill.position.set(W / 2, 0.03, L);
  group.add(sill);

  // Dark surround so the court reads as an arena interior.
  const surround = new THREE.Mesh(
    new THREE.BoxGeometry(40, 20, 40),
    new THREE.MeshStandardMaterial({ color: 0x0a0d13, roughness: 1, side: THREE.BackSide }),
  );
  surround.position.set(W / 2, 6, L / 2);
  group.add(surround);

  // -------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7a6a55, 0.75);
  group.add(hemi);

  const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
  key.position.set(W / 2 + 2.5, 9.5, L * 0.8);
  key.target.position.set(W / 2, 0, L * 0.35);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 9; key.shadow.camera.bottom = -9;
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  group.add(key);
  group.add(key.target);

  const fillA = new THREE.PointLight(0xfff7ea, 18, 16, 2);
  fillA.position.set(W / 2, H - 0.4, 2.2);
  group.add(fillA);
  const fillB = new THREE.PointLight(0xfff7ea, 18, 16, 2);
  fillB.position.set(W / 2, H - 0.4, 6.8);
  group.add(fillB);

  scene.add(group);
  return { group, lineMaterial };
}
