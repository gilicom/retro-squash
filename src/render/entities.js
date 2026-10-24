/**
 * @module render/entities
 * Drawing routines for the ball, its shadow and trail, the two players and
 * transient impact effects. Everything is drawn from projected 3-D points so
 * sizes shrink correctly with depth.
 */
import { COURT } from '../config/court.js';

/** Drawn ball radius (m). Larger than the real 2 cm ball for readability, as in the arcade original. */
export const BALL_DRAW_RADIUS = 0.055;

/**
 * Ball shadow on the floor. Fades and spreads as the ball rises.
 */
export function drawBallShadow(ctx, cam, ball) {
  const p = cam.project(ball.x, 0.002, ball.z);
  const h = Math.min(ball.y, 4);
  const rx = p.s * BALL_DRAW_RADIUS * (1 + h * 0.25);
  const ry = rx * 0.4;
  ctx.fillStyle = `rgba(0,0,0,${0.38 * (1 - h / 5)})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Motion trail and the ball itself. */
export function drawBall(ctx, cam, ball) {
  // Trail.
  const tr = ball.trail;
  if (tr.length > 2) {
    for (let i = 1; i < tr.length; i++) {
      const a = cam.project(tr[i - 1].x, tr[i - 1].y, tr[i - 1].z);
      const b = cam.project(tr[i].x, tr[i].y, tr[i].z);
      const t = i / tr.length;
      ctx.strokeStyle = `rgba(255, 240, 160, ${0.35 * t})`;
      ctx.lineWidth = Math.max(1, b.s * BALL_DRAW_RADIUS * 1.4 * t);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  const p = cam.project(ball.x, ball.y, ball.z);
  const r = Math.max(2.5, p.s * BALL_DRAW_RADIUS);
  const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
  g.addColorStop(0, '#fffbe6');
  g.addColorStop(0.5, '#f5e16a');
  g.addColorStop(1, '#8a7a1e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw a player as a stylised figure: shadow, legs, torso, head, arm and racket.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../core/camera.js').Camera} cam
 * @param {import('../entities/player.js').Player} p
 * @param {{x:number,y:number,z:number}} ball used to orient the racket side
 * @param {number} alpha
 */
export function drawPlayer(ctx, cam, p, ball, alpha = 1) {
  const base = cam.project(p.x, 0, p.z);
  const s = base.s;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, s * 0.34, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  const moving = Math.hypot(p.vx, p.vz) > 0.3;
  const stride = moving ? Math.sin(p.runPhase) * 0.22 : 0;
  const bob = moving ? Math.abs(Math.cos(p.runPhase)) * 0.04 : 0;
  const hipY = 0.92 + bob;

  // Legs.
  const hip = cam.project(p.x, hipY, p.z);
  const footL = cam.project(p.x - 0.14, 0.03, p.z + stride);
  const footR = cam.project(p.x + 0.14, 0.03, p.z - stride);
  ctx.strokeStyle = '#2a2f3a';
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.11;
  ctx.beginPath(); ctx.moveTo(hip.x - s * 0.08, hip.y); ctx.lineTo(footL.x, footL.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hip.x + s * 0.08, hip.y); ctx.lineTo(footR.x, footR.y); ctx.stroke();
  // Shoes.
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath(); ctx.ellipse(footL.x, footL.y, s * 0.09, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(footR.x, footR.y, s * 0.09, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();

  // Torso (jersey) as a rounded capsule.
  const shoulderY = hipY + 0.55;
  const sh = cam.project(p.x, shoulderY, p.z);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = s * 0.36;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y + s * 0.02); ctx.lineTo(sh.x, sh.y); ctx.stroke();
  // Shorts.
  ctx.strokeStyle = '#1e2430';
  ctx.lineWidth = s * 0.38;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y - s * 0.08); ctx.lineTo(hip.x, hip.y + s * 0.06); ctx.stroke();

  // Head.
  const head = cam.project(p.x, shoulderY + 0.24, p.z);
  ctx.fillStyle = '#e7b78f';
  ctx.beginPath(); ctx.arc(head.x, head.y, s * 0.12, 0, Math.PI * 2); ctx.fill();
  // Headband.
  ctx.strokeStyle = p.color;
  ctx.lineWidth = s * 0.035;
  ctx.beginPath(); ctx.arc(head.x, head.y - s * 0.03, s * 0.12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();

  // Arm + racket. Side follows the ball when it is close, else the last swing side.
  const near = Math.abs(ball.z - p.z) < 2.5;
  const side = near ? (ball.x >= p.x ? 1 : -1) : p.swingSide;
  // Swing phase: 0 (idle) -> contact (1) -> follow-through. p.swing decays 1 -> 0.
  const sw = p.swing;
  const a = sw > 0 ? (1 - sw) * 2.2 - 0.9 : -0.35; // angle around the body: negative = behind
  const handX = p.x + side * (0.32 + 0.3 * Math.cos(a));
  const handZ = p.z + 0.55 * Math.sin(a) * (sw > 0 ? 1 : 0) + 0.12;
  const handY = 1.05 + (sw > 0 ? 0.35 * Math.max(0, Math.sin(a + 0.6)) : 0);
  const shoulder = cam.project(p.x + side * 0.2, shoulderY - 0.03, p.z);
  const hand = cam.project(handX, handY, handZ);
  ctx.strokeStyle = '#e7b78f';
  ctx.lineWidth = s * 0.09;
  ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.lineTo(hand.x, hand.y); ctx.stroke();

  // Racket: handle continues the forearm direction, head is an ellipse.
  const dirX = handX - (p.x + side * 0.2), dirZ = handZ - p.z, dirY = handY - (shoulderY - 0.03);
  const dl = Math.hypot(dirX, dirY, dirZ) || 1;
  const rhx = handX + (dirX / dl) * 0.5, rhy = handY + (dirY / dl) * 0.5 + 0.05, rhz = handZ + (dirZ / dl) * 0.5;
  const rh = cam.project(rhx, rhy, rhz);
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = s * 0.035;
  ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(rh.x, rh.y); ctx.stroke();
  const rr = rh.s * 0.16;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(rh.x, rh.y, rr * 0.8, rr, 0.3 * side, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
  // Strings.
  ctx.strokeStyle = 'rgba(40,40,40,0.5)';
  ctx.lineWidth = Math.max(0.5, s * 0.008);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(rh.x + i * rr * 0.28, rh.y - rr * 0.85);
    ctx.lineTo(rh.x + i * rr * 0.28, rh.y + rr * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rh.x - rr * 0.75, rh.y + i * rr * 0.32);
    ctx.lineTo(rh.x + rr * 0.75, rh.y + i * rr * 0.32);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * @typedef {{x:number,y:number,z:number,age:number,life:number,color:string,kind:'ring'|'mark'}} Effect
 */

/** Draw and age transient effects (hit rings, wall marks). Removes expired ones. */
export function drawEffects(ctx, cam, effects, dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.age += dt;
    const t = e.age / e.life;
    if (t >= 1) { effects.splice(i, 1); continue; }
    const p = cam.project(e.x, e.y, e.z);
    if (e.kind === 'ring') {
      ctx.strokeStyle = e.color.replace('ALPHA', String(1 - t));
      ctx.lineWidth = Math.max(1, p.s * 0.03 * (1 - t));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * (0.08 + 0.45 * t), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = e.color.replace('ALPHA', String(0.6 * (1 - t)));
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, p.s * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Depth of a world point from the camera; used to sort drawables back to front. */
export function depthOf(cam, x, y, z) {
  const dx = x - cam.eye.x, dy = y - cam.eye.y, dz = z - cam.eye.z;
  return dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
}

export { COURT };
