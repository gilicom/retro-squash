/**
 * @module core/camera
 * Pinhole perspective camera looking down the court from behind the glass
 * back wall (a TV-broadcast style view). Projection is a plain look-at
 * transform; the focal length is fitted on resize so the whole court is
 * visible in both portrait and landscape.
 */
import { COURT } from '../config/court.js';

export class Camera {
  constructor() {
    /** Eye position (m). Above and behind the back wall. */
    this.eye = { x: COURT.W / 2, y: 3.6, z: COURT.L + 3.6 };
    /** Look-at point (m): a little above the floor near the front wall. */
    this.target = { x: COURT.W / 2, y: 1.15, z: 0.5 };
    this.f = 600;      // focal length (px)
    this.cx = 0;       // screen-space principal point
    this.cy = 0;
    this.width = 1;
    this.height = 1;
    this._basis();
  }

  _basis() {
    const e = this.eye, t = this.target;
    let fx = t.x - e.x, fy = t.y - e.y, fz = t.z - e.z;
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl; fy /= fl; fz /= fl;
    // right = forward x up(0,1,0)
    let rx = -fz, ry = 0, rz = fx;
    const rl = Math.hypot(rx, ry, rz);
    rx /= rl; rz /= rl;
    // up = right x forward
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;
    this.fwd = { x: fx, y: fy, z: fz };
    this.right = { x: rx, y: ry, z: rz };
    this.up = { x: ux, y: uy, z: uz };
  }

  /** Camera-space coordinates of a world point. */
  _toCamera(x, y, z) {
    const dx = x - this.eye.x, dy = y - this.eye.y, dz = z - this.eye.z;
    return {
      cx: dx * this.right.x + dy * this.right.y + dz * this.right.z,
      cy: dx * this.up.x + dy * this.up.y + dz * this.up.z,
      cz: dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z,
    };
  }

  /**
   * Fit the court into a canvas of the given size.
   * @param {number} width  canvas width (CSS px)
   * @param {number} height canvas height (CSS px)
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    const portrait = height > width;
    // In portrait the camera sits higher and closer so the court fills the screen.
    this.eye.y = portrait ? 4.4 : 3.6;
    this.eye.z = COURT.L + (portrait ? 2.6 : 3.6);
    this.target.y = portrait ? 1.6 : 1.15;
    this._basis();

    const pts = [
      [0, 0, 0], [COURT.W, 0, 0], [0, COURT.FRONT_OUT + 0.6, 0], [COURT.W, COURT.FRONT_OUT + 0.6, 0],
      [0, 0, COURT.L], [COURT.W, 0, COURT.L], [0, COURT.BACK_OUT + 0.9, COURT.L], [COURT.W, COURT.BACK_OUT + 0.9, COURT.L],
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y, z] of pts) {
      const c = this._toCamera(x, y, z);
      const rx = c.cx / c.cz, ry = c.cy / c.cz;
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
    }
    const marginX = 0.96, marginY = portrait ? 0.80 : 0.86;
    this.f = Math.min((width * marginX) / (maxX - minX), (height * marginY) / (maxY - minY));
    this.cx = width / 2 - this.f * (minX + maxX) / 2;
    // Leave room for the HUD at the top.
    this.cy = height / 2 + this.f * (minY + maxY) / 2 + height * 0.035;
  }

  /**
   * Project a world point to the screen.
   * @returns {{x:number, y:number, s:number}} screen position and scale (px per metre at that depth)
   */
  project(x, y, z) {
    const c = this._toCamera(x, y, z);
    const cz = Math.max(c.cz, 0.05);
    return {
      x: this.cx + this.f * c.cx / cz,
      y: this.cy - this.f * c.cy / cz,
      s: this.f / cz,
    };
  }

  /**
   * Intersect the ray through a screen point with the floor plane (y = 0).
   * @returns {{x:number,z:number}|null} court coordinates, or null when the ray misses the floor
   */
  floorPoint(sx, sy) {
    const a = (sx - this.cx) / this.f;
    const b = -(sy - this.cy) / this.f;
    const dx = this.fwd.x + a * this.right.x + b * this.up.x;
    const dy = this.fwd.y + a * this.right.y + b * this.up.y;
    const dz = this.fwd.z + a * this.right.z + b * this.up.z;
    if (dy >= -1e-4) return null;
    const t = -this.eye.y / dy;
    return { x: this.eye.x + dx * t, z: this.eye.z + dz * t };
  }
}
