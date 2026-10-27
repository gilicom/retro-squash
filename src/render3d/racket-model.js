/**
 * @module render3d/racket-model
 * Loads the racket built in Blender (`public/models/racket.glb`, see
 * docs/design) and hands out tinted copies. The GLB uses the same frame as
 * the procedural racket: the hand holds the top of the grip at the origin,
 * the racket extends along -y and the string face normal is +z, so it can
 * be attached wherever {@link buildRacket} output was attached.
 *
 * Materials named `RacketAccent` and `RacketStrings` are recoloured to the
 * player's accent colour; the frame and grip stay black.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildRacket } from './racket3d.js';

let pending = null;
let template = null;

/**
 * Load the racket model once. Resolves to true when the GLB is available,
 * false when it failed (callers then get the procedural racket).
 * @param {string} url
 */
export function loadRacketModel(url) {
  if (!pending) {
    pending = new Promise((resolve) => {
      new GLTFLoader().load(url, (gltf) => { template = gltf.scene; resolve(true); }, undefined, (err) => {
        console.warn('Racket model unavailable, using the procedural racket', err);
        resolve(false);
      });
    });
  }
  return pending;
}

/**
 * A racket for a player: a tinted clone of the Blender model when loaded,
 * otherwise the procedural one.
 * @param {number} accent accent colour
 * @returns {THREE.Object3D}
 */
export function makeRacket(accent) {
  if (!template) return buildRacket({ accent });
  const r = template.clone(true);
  const tint = new THREE.Color(accent);
  r.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = mats.map((m) => {
      const c = m.clone();
      if (/accent/i.test(m.name)) c.color.copy(tint);
      else if (/strings/i.test(m.name)) c.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.45);
      return c;
    });
    o.material = Array.isArray(o.material) ? cloned : cloned[0];
  });
  return r;
}
