/**
 * @module render3d/renderer3d
 * WebGL renderer built on Three.js: {@link resize}, {@link draw} and
 * {@link floorPoint} are what the game loop uses.
 *
 * Camera: a broadcast-style perspective from behind the glass back wall.
 * On resize the field of view is fitted so the whole court is visible in
 * portrait and landscape. The camera drifts a little toward the ball for
 * parallax.
 */
import * as THREE from 'three';
import { COURT } from '../config/court.js';
import { T_POSITION } from '../entities/player.js';
import { buildCourt } from './court3d.js';
import { PlayerModel } from './player3d.js';
import { SkinnedPlayer, loadCharacter } from './skinned-player.js';

/** Rigged character used for the players (Mixamo rig). Relative to the site base. */
const CHARACTER_URL = `${import.meta.env.BASE_URL}models/Xbot.glb`;
import { blobTexture, ringTexture } from './textures.js';

const { W, L } = COURT;
/** Drawn ball radius (m): larger than the real 2 cm ball for readability. */
const BALL_R = 0.05;

export class Renderer3D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @throws if WebGL is unavailable
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d13);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
    this.baseEye = new THREE.Vector3();
    this.sway = 0;

    buildCourt(this.scene, this.gl);

    // Players.
    this.models = [
      new PlayerModel(0x2f7df6, { number: 7, skin: 0xe3b48c, hair: 0x2a1c12 }),
      new PlayerModel(0xe5483c, { number: 3, skin: 0xc48a5a, hair: 0x111111 }),
    ];
    for (const m of this.models) this.scene.add(m.root);
    this.characterReady = false;
    loadCharacter(CHARACTER_URL).then((gltf) => {
      const looks = [{ number: 7 }, { number: 3 }];
      const colors = [0x2f7df6, 0xe5483c];
      const skinned = colors.map((c, i) => new SkinnedPlayer(gltf, c, looks[i]));
      for (const m of this.models) this.scene.remove(m.root);
      this.models = skinned;
      for (const m of this.models) this.scene.add(m.root);
      this.characterReady = true;
    }).catch((err) => console.warn('Character model unavailable, using the procedural players', err));

    // Ball: the black club ball with a soft rubber sheen.
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 24, 18),
      new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    // Ghost trail.
    this.ghosts = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_R * 0.9, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0x202024, transparent: true, opacity: 0.0, depthWrite: false }),
      );
      this.scene.add(g);
      this.ghosts.push(g);
    }
    // Contact shadow blob.
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 2;
    this.scene.add(this.blob);

    // T marker.
    this.tRing = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: ringTexture(), color: 0xf5e16a, transparent: true, opacity: 0.0, depthWrite: false }),
    );
    this.tRing.rotation.x = -Math.PI / 2;
    this.tRing.position.set(T_POSITION.x, 0.006, T_POSITION.z);
    this.tRing.renderOrder = 3;
    this.scene.add(this.tRing);

    // Effects pool (hit rings and wall marks).
    this.ringGeo = new THREE.RingGeometry(0.75, 1, 32);
    this.markGeo = new THREE.CircleGeometry(0.06, 16);
    this.effectMeshes = new Map();

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.width = 1; this.height = 1;
    this.resize();
  }

  /** Fit the renderer and camera to the canvas size. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.width = w; this.height = h;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;

    const portrait = h > w;
    this.baseEye.set(W / 2, portrait ? 4.3 : 3.6, L + (portrait ? 2.0 : 3.3));
    const look = new THREE.Vector3(W / 2, portrait ? 1.3 : 1.25, portrait ? 2.6 : 1.2);
    cam.position.copy(this.baseEye);
    cam.lookAt(look);
    cam.updateMatrixWorld();

    // Fit: measure the angular extent of the court corners, centre the pitch, set the FOV.
    const pts = [
      [0, 0, 0], [W, 0, 0], [0, COURT.FRONT_OUT + 0.5, 0], [W, COURT.FRONT_OUT + 0.5, 0],
      [0, 0, L], [W, 0, L], [0, COURT.BACK_OUT + 0.8, L], [W, COURT.BACK_OUT + 0.8, L],
    ];
    const extent = () => {
      const inv = cam.matrixWorldInverse;
      let minV = Infinity, maxV = -Infinity, maxH = 0;
      for (const [x, y, z] of pts) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
        const d = -p.z;
        minV = Math.min(minV, Math.atan2(p.y, d));
        maxV = Math.max(maxV, Math.atan2(p.y, d));
        maxH = Math.max(maxH, Math.abs(Math.atan2(p.x, d)));
      }
      return { minV, maxV, maxH };
    };
    let e = extent();
    cam.rotateX((e.minV + e.maxV) / 2);
    cam.updateMatrixWorld();
    e = extent();
    const vSpan = (e.maxV - e.minV) * (portrait ? 1.08 : 1.1);
    const hNeeded = 2 * Math.atan(Math.tan(e.maxH * 1.04) / cam.aspect);
    const fov = Math.max(vSpan, hNeeded);
    cam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(fov), 30, 100);
    // Push the court down a little to leave room for the HUD.
    cam.rotateX(fov * 0.045);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.baseQuat = cam.quaternion.clone();
  }

  /**
   * Court coordinates under a screen point (CSS px relative to the canvas).
   * @returns {{x:number,z:number}|null}
   */
  floorPoint(sx, sy) {
    const ndc = new THREE.Vector2((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  /**
   * Draw a frame.
   * @param {{ball: import('../physics/ball.js').Ball, players: import('../entities/player.js').Player[], effects: Array, dt: number, inPlay?: boolean}} scene
   */
  draw(scene) {
    const { ball, players, effects, dt } = scene;

    const turn = scene.turn ?? 0;
    for (let i = 0; i < players.length; i++) this.models[i].update(players[i], ball, dt, players[1 - i], turn === i);

    // Ball, blob and trail.
    this.ball.position.set(ball.x, Math.max(ball.y, BALL_R), ball.z);
    const h = Math.min(ball.y, 4);
    const bs = 0.22 + h * 0.08;
    this.blob.position.set(ball.x, 0.004, ball.z);
    this.blob.scale.set(bs, bs, 1);
    this.blob.material.opacity = 0.55 * (1 - h / 4.5);
    const tr = ball.trail;
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i];
      const idx = tr.length - 2 - i * 2;
      if (idx >= 0 && ball.inPlay) {
        const p = tr[idx];
        g.position.set(p.x, Math.max(p.y, BALL_R), p.z);
        g.material.opacity = 0.28 * (1 - i / this.ghosts.length);
        const s = 1 - i * 0.1;
        g.scale.set(s, s, s);
      } else {
        g.material.opacity = 0;
      }
    }

    // T marker: visible in play, brighter when the human is away from the T.
    const human = players[0];
    const away = Math.min(1, Math.max(0, (human.distanceFromT - 0.9) / 2));
    const target = scene.inPlay ? 0.12 + away * 0.3 * (0.6 + 0.4 * Math.sin(performance.now() / 180)) : 0;
    this.tRing.material.opacity += (target - this.tRing.material.opacity) * Math.min(1, dt * 8);

    // Effects.
    this._updateEffects(effects, dt);

    // Camera parallax toward the ball.
    const swayTarget = (ball.x - W / 2) * 0.1;
    this.sway += (swayTarget - this.sway) * Math.min(1, dt * 3);
    this.camera.position.set(this.baseEye.x + this.sway, this.baseEye.y, this.baseEye.z);
    this.camera.quaternion.copy(this.baseQuat);
    this.camera.rotateY(-this.sway * 0.03);

    this.gl.render(this.scene, this.camera);
  }

  _updateEffects(effects, dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.age += dt;
      const t = e.age / e.life;
      let mesh = this.effectMeshes.get(e);
      if (t >= 1) {
        if (mesh) { this.scene.remove(mesh); mesh.material.dispose(); this.effectMeshes.delete(e); }
        effects.splice(i, 1);
        continue;
      }
      if (!mesh) {
        const isRing = e.kind === 'ring';
        mesh = new THREE.Mesh(
          isRing ? this.ringGeo : this.markGeo,
          new THREE.MeshBasicMaterial({ color: isRing ? 0xffffff : 0x3a3a3a, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }),
        );
        mesh.position.set(e.x, e.y, e.z);
        if (!isRing) {
          // Orient the mark to the wall it hit and lift it off the surface.
          if (e.z < 0.1) mesh.position.z = 0.01;
          else if (e.z > L - 0.1) { mesh.position.z = L - 0.01; }
          else if (e.x < 0.1) { mesh.rotation.y = Math.PI / 2; mesh.position.x = 0.01; }
          else if (e.x > W - 0.1) { mesh.rotation.y = -Math.PI / 2; mesh.position.x = W - 0.01; }
        }
        this.scene.add(mesh);
        this.effectMeshes.set(e, mesh);
      }
      if (e.kind === 'ring') {
        const s = 0.08 + 0.5 * t;
        mesh.scale.set(s, s, s);
        mesh.quaternion.copy(this.camera.quaternion);
        mesh.material.opacity = 1 - t;
      } else {
        mesh.material.opacity = 0.55 * (1 - t);
      }
    }
  }

  /** Release GPU resources. */
  dispose() {
    this.gl.dispose();
  }
}
