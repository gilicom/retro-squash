/**
 * @module render3d/textures
 * Procedurally generated textures (no image files to ship): wooden floor
 * planks, plaster wall noise, a soft shadow blob and racket strings.
 * Each function draws into an offscreen canvas and wraps it in a
 * THREE.CanvasTexture.
 */
import * as THREE from 'three';

/** Deterministic pseudo-random generator so textures look the same every run. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * Maple sprung floor: narrow planks running along the court (v axis), with
 * staggered joints, grain streaks and gentle colour variation.
 * @param {number} [size=1024]
 * @param {number} [planks=56] planks across the texture width
 */
export function woodTexture(size = 1024, planks = 56) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(7);
  const pw = size / planks;
  ctx.fillStyle = '#c9a26c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < planks; i++) {
    const x = i * pw;
    // Each plank column is split into boards of random length.
    let y = -rnd() * 300;
    while (y < size) {
      const len = 220 + rnd() * 320;
      const l = 0.78 + rnd() * 0.22;
      const r = Math.round(205 * l), g = Math.round(168 * l), b = Math.round(112 * l);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, pw, len);
      // Grain streaks.
      ctx.strokeStyle = `rgba(90,60,30,${0.05 + rnd() * 0.08})`;
      ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const gx = x + rnd() * pw;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.bezierCurveTo(gx + (rnd() - 0.5) * 4, y + len * 0.3, gx + (rnd() - 0.5) * 4, y + len * 0.7, gx + (rnd() - 0.5) * 3, y + len);
        ctx.stroke();
      }
      // Board end joint.
      ctx.fillStyle = 'rgba(60,40,20,0.35)';
      ctx.fillRect(x, y + len - 1, pw, 1.5);
      y += len;
    }
    // Plank edge.
    ctx.fillStyle = 'rgba(70,45,20,0.28)';
    ctx.fillRect(x, 0, 1.2, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Subtle plaster noise for the walls; multiplied over a light base colour.
 * @param {number} [size=512]
 */
export function plasterTexture(size = 512) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(11);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = 235 + rnd() * 20;
    d[i] = d[i + 1] = d[i + 2] = n;
  }
  ctx.putImageData(img, 0, 0);
  // A few faint scuff marks near the floor.
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(80,80,80,${0.03 + rnd() * 0.05})`;
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath();
    const x = rnd() * size, y = size * (0.75 + rnd() * 0.25);
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 20);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Radial soft black blob used as a contact shadow under the ball. */
export function blobTexture(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Racket string grid on a transparent background. */
export function stringsTexture(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(240,240,240,0.9)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 14; i++) {
    const p = (size / 14) * i;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Soft radial highlight used for the T marker on the floor. */
export function ringTexture(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
