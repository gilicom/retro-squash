/**
 * @module render/renderer
 * Classic 2-D canvas renderer (pseudo-3D projection). Used as a fallback
 * when WebGL is unavailable or when the player picks "classic" graphics.
 *
 * Owns the canvas, handles device-pixel-ratio resizing and draws one frame:
 * court, T marker, ball shadow, then players and ball sorted back to front,
 * then effects. The human player (nearest the camera) is drawn
 * semi-transparent so they never hide the ball.
 */
import { Camera } from '../core/camera.js';
import { drawCourt } from './court.js';
import { drawBall, drawBallShadow, drawPlayer, drawEffects, depthOf } from './entities.js';
import { T_POSITION } from '../entities/player.js';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera();
    this.dpr = 1;
    this.tAlpha = 0;
    this.resize();
  }

  /** Match the canvas to its CSS size and the device pixel ratio. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.camera.resize(w, h);
  }

  /** Court coordinates under a screen point (CSS px relative to the canvas). */
  floorPoint(sx, sy) {
    return this.camera.floorPoint(sx, sy);
  }

  /**
   * Draw a frame.
   * @param {{ball: import('../physics/ball.js').Ball, players: import('../entities/player.js').Player[], effects: Array, dt: number, inPlay?: boolean}} scene
   */
  draw(scene) {
    const { ctx, camera: cam } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawCourt(ctx, cam);

    const { ball, players, effects, dt } = scene;

    // T marker.
    const away = Math.min(1, Math.max(0, (players[0].distanceFromT - 0.9) / 2));
    const target = scene.inPlay ? 0.15 + away * 0.3 : 0;
    this.tAlpha += (target - this.tAlpha) * Math.min(1, dt * 8);
    if (this.tAlpha > 0.01) {
      const p = cam.project(T_POSITION.x, 0.002, T_POSITION.z);
      ctx.strokeStyle = `rgba(245,225,106,${this.tAlpha})`;
      ctx.lineWidth = Math.max(1.5, p.s * 0.05);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.s * 0.8, p.s * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawBallShadow(ctx, cam, ball);

    const items = players.map((p) => ({ depth: depthOf(cam, p.x, 0.9, p.z), draw: () => drawPlayer(ctx, cam, p, ball, p.index === 0 ? 0.82 : 1) }));
    items.push({ depth: depthOf(cam, ball.x, ball.y, ball.z), draw: () => drawBall(ctx, cam, ball) });
    items.sort((a, b) => b.depth - a.depth); // far first
    for (const it of items) it.draw();

    drawEffects(ctx, cam, effects, dt);
  }
}
