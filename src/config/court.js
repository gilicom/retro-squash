/**
 * @module config/court
 * Official singles squash court dimensions (World Squash Federation).
 *
 * Coordinate system used throughout the game (metres):
 *   x : across the court, 0 = left side wall, W = right side wall
 *   y : up, 0 = floor
 *   z : depth, 0 = front wall, L = back wall (glass wall, camera side)
 *
 * The player faces the front wall, so "right" is +x.
 */
export const COURT = Object.freeze({
  /** Court width (m). */
  W: 6.4,
  /** Court length (m). */
  L: 9.75,
  /** Height of the out line on the front wall (m). */
  FRONT_OUT: 4.57,
  /** Height of the out line on the back wall (m). */
  BACK_OUT: 2.13,
  /** Height of the service line on the front wall (m). */
  SERVICE_LINE: 1.78,
  /** Top of the tin (board) on the front wall (m). */
  TIN: 0.48,
  /** Distance of the short line from the front wall (m). 4.26 m from the back wall. */
  SHORT_LINE_Z: 9.75 - 4.26,
  /** Side length of a service box (m). */
  BOX: 1.6,
  /** Nominal ceiling height; a ball above this is called out (m). */
  CEILING: 5.64,
});

/**
 * Height of the out line on a side wall at a given depth. The line is a
 * straight diagonal from the front out line (4.57 m) to the back out line (2.13 m).
 * @param {number} z depth from the front wall (m)
 * @returns {number} height (m)
 */
export function sideOutHeight(z) {
  const t = Math.min(Math.max(z / COURT.L, 0), 1);
  return COURT.FRONT_OUT + (COURT.BACK_OUT - COURT.FRONT_OUT) * t;
}

/**
 * Centre of a service box.
 * @param {'L'|'R'} side service box side, from the server's point of view (facing the front wall)
 * @returns {{x:number, z:number}}
 */
export function serviceBoxCentre(side) {
  const half = COURT.BOX / 2;
  return {
    x: side === 'R' ? COURT.W - half : half,
    z: COURT.SHORT_LINE_Z + half,
  };
}

/**
 * True when a floor point lies in the receiver's back quarter for a serve
 * from the given box (the quarter diagonally opposite the server).
 * @param {number} x
 * @param {number} z
 * @param {'L'|'R'} serverSide
 */
export function inReceivingQuarter(x, z, serverSide) {
  if (z < COURT.SHORT_LINE_Z) return false;
  return serverSide === 'R' ? x < COURT.W / 2 : x > COURT.W / 2;
}
