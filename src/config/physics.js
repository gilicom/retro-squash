/**
 * @module config/physics
 * Tunable physical constants. Values approximate a warm, double-yellow-dot
 * squash ball: low floor bounce, strong air drag, lively off the walls.
 */
export const PHYSICS = Object.freeze({
  /** Gravity (m/s^2). */
  G: 9.81,
  /** Real ball radius (m). A squash ball is 40 mm in diameter. */
  BALL_RADIUS: 0.02,
  /**
   * Quadratic air drag coefficient (1/m). Acceleration = -k * |v| * v.
   * ~0.02 gives a visible loss of pace over a court length at 25 m/s.
   */
  DRAG: 0.02,
  /** Coefficient of restitution off the floor (warm squash ball ~ 0.5). */
  FLOOR_BOUNCE: 0.52,
  /** Tangential velocity kept after a floor bounce (friction). */
  FLOOR_FRICTION: 0.88,
  /** Coefficient of restitution off a wall. */
  WALL_BOUNCE: 0.76,
  /** Tangential velocity kept after a wall hit. */
  WALL_FRICTION: 0.92,
  /** Fixed physics step (s). 240 Hz keeps fast balls from tunnelling through players. */
  STEP: 1 / 240,
  /** Below this speed, on the floor, the ball is considered dead. */
  DEAD_SPEED: 0.35,
});
