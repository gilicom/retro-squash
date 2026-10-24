/**
 * Development page: renders one player model large, at a chosen stroke phase,
 * so poses can be compared with the reference photographs in ref/.
 *
 * Open http://localhost:5173/dev/poses.html with query parameters:
 *   side   1 = forehand (default), -1 = backhand
 *   phase  0..1 position in the swing (0 = backswing, 0.22 = contact); omit for the ready pose
 *   prep   0..1 backswing preparation blend when phase is omitted
 *   ballY  ball height in metres (default 0.3)
 *   cam    camera azimuth in degrees around the player (0 = from the front wall, 90 = from the right)
 *   lunge  0..1 force a lunge (default: from the pose)
 *   run    0..1 running intensity (default 0)
 *
 * The page renders once per load (no animation loop), so it also works in
 * throttled background tabs. Call window.render(params) from the console to
 * re-render with new values.
 */
import * as THREE from 'three';
import { PlayerModel } from '../src/render3d/player3d.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2f36);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0xc9a26c, roughness: 0.6 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
scene.add(new THREE.GridHelper(6, 12, 0x885522, 0x885522));
scene.add(new THREE.HemisphereLight(0xffffff, 0x665544, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(2, 5, 3);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);

const model = new PlayerModel(0x2f7df6);
scene.add(model.root);
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff }));
scene.add(ballMesh);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);

function params() {
  const q = new URLSearchParams(location.search);
  const n = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
  return { side: n('side', 1), phase: q.has('phase') ? n('phase', 0) : null, prep: n('prep', 0), ballY: n('ballY', 0.3), cam: n('cam', 35), lunge: q.has('lunge') ? n('lunge', 0) : null, run: n('run', 0) };
}

/** Fake simulation state matching what PlayerModel reads from a Player. */
function fakePlayer(o) {
  return { x: 0, z: 0, vx: 0, vz: 0, targetX: 0, targetZ: 0, speed: 4.4, reach: 1.1, swing: 0, swingSide: 1, runPhase: 1.2, stamina: 1, frozen: false, ...o };
}

window.render = function render(o = {}) {
  const p = { ...params(), ...o };
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const a = THREE.MathUtils.degToRad(p.cam);
  camera.fov = 30;
  camera.updateProjectionMatrix();
  camera.position.set(Math.sin(a) * 4.6, 1.3, -Math.cos(a) * 4.6);
  camera.lookAt(0, 0.8, 0);

  const player = fakePlayer({ swing: p.phase === null ? 0 : 1 - p.phase, swingSide: p.side, vz: -p.run * 3, targetZ: -1 });
  const ball = { x: p.side * 0.9, y: p.ballY, z: -0.5, inPlay: true };
  ballMesh.position.set(ball.x, ball.y, ball.z);
  // Settle the smoothed parameters by stepping a few frames with the same state.
  model.prep = p.phase === null ? p.prep : 0;
  model.prepSide = p.side;
  for (let i = 0; i < 60; i++) {
    model.update(player, ball, 1 / 60);
    if (p.lunge !== null) model.lunge = p.lunge;
    model.prep = p.phase === null ? p.prep : 0;
  }
  renderer.render(scene, camera);
  document.getElementById('hud').textContent = JSON.stringify(p);
};

window.render();
