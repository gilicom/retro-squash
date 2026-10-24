/**
 * @module render/court
 * Draws the court: floor, walls, ceiling and all markings, using the camera
 * projection. Straight lines stay straight under perspective, so every
 * surface is a projected polygon and every marking a projected segment.
 */
import { COURT } from '../config/court.js';

/** Colour palette for the court. */
export const PALETTE = Object.freeze({
  background: '#0b0f16',
  floor: ['#d9b37c', '#b8905a'],
  floorPlank: 'rgba(90, 60, 25, 0.18)',
  wallFront: ['#f4f1ea', '#d8d3c8'],
  wallSideLight: ['#efece4', '#cfcac0'],
  wallSideDark: ['#e4e0d7', '#bfb9ae'],
  ceiling: '#141a24',
  line: '#d8232a',
  tin: '#2b2f38',
  tinEdge: '#d8232a',
  glass: 'rgba(120, 180, 255, 0.05)',
});

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../core/camera.js').Camera} cam
 * @param {Array<[number,number,number]>} pts world-space polygon
 */
function polygon(ctx, cam, pts) {
  ctx.beginPath();
  pts.forEach(([x, y, z], i) => {
    const p = cam.project(x, y, z);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

/** Draw a world-space segment with a width given in metres. */
function segment(ctx, cam, a, b, widthM, color) {
  const pa = cam.project(...a);
  const pb = cam.project(...b);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, widthM * (pa.s + pb.s) / 2);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
}

/** Linear gradient between two projected points. */
function gradient(ctx, cam, a, b, colors) {
  const pa = cam.project(...a), pb = cam.project(...b);
  const g = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  return g;
}

/**
 * Render the full court.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../core/camera.js').Camera} cam
 */
export function drawCourt(ctx, cam) {
  const { W, L, CEILING, FRONT_OUT, BACK_OUT, SERVICE_LINE, TIN, SHORT_LINE_Z, BOX } = COURT;
  const H = CEILING;
  const mid = W / 2;

  // Background.
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, cam.width, cam.height);

  // Ceiling (dark, recedes).
  polygon(ctx, cam, [[0, H, 0], [W, H, 0], [W, H, L], [0, H, L]]);
  ctx.fillStyle = PALETTE.ceiling;
  ctx.fill();

  // Floor.
  polygon(ctx, cam, [[0, 0, 0], [W, 0, 0], [W, 0, L], [0, 0, L]]);
  ctx.fillStyle = gradient(ctx, cam, [mid, 0, L], [mid, 0, 0], PALETTE.floor);
  ctx.fill();
  // Floor planks (lines along the depth axis).
  for (let i = 1; i < 16; i++) {
    const x = (W / 16) * i;
    segment(ctx, cam, [x, 0, 0], [x, 0, L], 0.012, PALETTE.floorPlank);
  }

  // Side walls.
  polygon(ctx, cam, [[0, 0, 0], [0, H, 0], [0, H, L], [0, 0, L]]);
  ctx.fillStyle = gradient(ctx, cam, [0, H / 2, L], [0, H / 2, 0], PALETTE.wallSideDark);
  ctx.fill();
  polygon(ctx, cam, [[W, 0, 0], [W, H, 0], [W, H, L], [W, 0, L]]);
  ctx.fillStyle = gradient(ctx, cam, [W, H / 2, L], [W, H / 2, 0], PALETTE.wallSideLight);
  ctx.fill();

  // Front wall.
  polygon(ctx, cam, [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]]);
  ctx.fillStyle = gradient(ctx, cam, [mid, H, 0], [mid, 0, 0], PALETTE.wallFront);
  ctx.fill();
  // Soft spotlight on the front wall for depth.
  const c = cam.project(mid, 2.2, 0);
  const r = cam.project(W, 2.2, 0).x - c.x;
  const spot = ctx.createRadialGradient(c.x, c.y, r * 0.1, c.x, c.y, r * 1.1);
  spot.addColorStop(0, 'rgba(255,255,255,0.18)');
  spot.addColorStop(1, 'rgba(255,255,255,0)');
  polygon(ctx, cam, [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]]);
  ctx.fillStyle = spot;
  ctx.fill();

  // Tin (board) with its red top edge.
  polygon(ctx, cam, [[0, 0, 0], [W, 0, 0], [W, TIN, 0], [0, TIN, 0]]);
  ctx.fillStyle = PALETTE.tin;
  ctx.fill();
  segment(ctx, cam, [0, TIN, 0], [W, TIN, 0], 0.05, PALETTE.tinEdge);

  // Front wall lines.
  segment(ctx, cam, [0, SERVICE_LINE, 0], [W, SERVICE_LINE, 0], 0.05, PALETTE.line);
  segment(ctx, cam, [0, FRONT_OUT, 0], [W, FRONT_OUT, 0], 0.05, PALETTE.line);
  // Side wall out lines (diagonal).
  segment(ctx, cam, [0, FRONT_OUT, 0], [0, BACK_OUT, L], 0.05, PALETTE.line);
  segment(ctx, cam, [W, FRONT_OUT, 0], [W, BACK_OUT, L], 0.05, PALETTE.line);

  // Floor markings.
  segment(ctx, cam, [0, 0.001, SHORT_LINE_Z], [W, 0.001, SHORT_LINE_Z], 0.05, PALETTE.line);
  segment(ctx, cam, [mid, 0.001, SHORT_LINE_Z], [mid, 0.001, L], 0.05, PALETTE.line);
  // Service boxes.
  for (const x0 of [0, W - BOX]) {
    const x1 = x0 + BOX;
    const z0 = SHORT_LINE_Z, z1 = SHORT_LINE_Z + BOX;
    segment(ctx, cam, [x0, 0.001, z1], [x1, 0.001, z1], 0.05, PALETTE.line);
    const xi = x0 === 0 ? x1 : x0;
    segment(ctx, cam, [xi, 0.001, z0], [xi, 0.001, z1], 0.05, PALETTE.line);
  }

  // Glass back wall: faint tint and the back out line.
  polygon(ctx, cam, [[0, 0, L], [W, 0, L], [W, H, L], [0, H, L]]);
  ctx.fillStyle = PALETTE.glass;
  ctx.fill();
  segment(ctx, cam, [0, BACK_OUT, L], [W, BACK_OUT, L], 0.05, 'rgba(216,35,42,0.75)');
}
