/**
 * @module config/difficulty
 * Parameters controlling the computer opponent at each difficulty level.
 *
 * - speed:      maximum running speed when fresh (m/s)
 * - reaction:   seconds between re-reading the ball's trajectory
 * - error:      standard deviation of positional error when predicting the ball (m)
 * - aimError:   standard deviation of shot placement error on the front wall (m)
 * - reach:      racket reach radius (m)
 * - aggression: probability of choosing an attacking shot (smash/drop) when available
 * - fitness:    stamina recovery multiplier (1 = same as the human)
 */
export const DIFFICULTY = Object.freeze({
  easy: { id: 'easy', speed: 3.0, reaction: 0.35, error: 0.45, aimError: 0.6, reach: 0.95, aggression: 0.15, fitness: 0.8 },
  normal: { id: 'normal', speed: 3.8, reaction: 0.22, error: 0.25, aimError: 0.4, reach: 1.05, aggression: 0.3, fitness: 1.0 },
  hard: { id: 'hard', speed: 4.6, reaction: 0.12, error: 0.1, aimError: 0.22, reach: 1.15, aggression: 0.5, fitness: 1.25 },
});

/** Human player constants. */
export const HUMAN = Object.freeze({
  speed: 4.4,
  reach: 1.1,
  fitness: 1.0,
});

/**
 * Stamina model shared by both players.
 * Stamina is a 0..1 reservoir. Running drains it (quadratically with effort),
 * standing still refills it, and standing on the T refills it fastest.
 */
export const STAMINA = Object.freeze({
  /** Stamina lost per metre run at full effort. ~80 m of sprinting empties the bar. */
  drainPerMetre: 0.016,
  /** Recovery per second while moving slowly or standing. */
  recoverIdle: 0.05,
  /** Recovery per second while standing on the T (within tRadius). */
  recoverOnT: 0.11,
  /** Recovery per second between rallies. */
  recoverBetweenPoints: 0.22,
  /** Radius around the T that counts as "on the T" (m). */
  tRadius: 0.9,
  /** Speed multiplier when the bar is empty (fresh = 1). */
  minSpeedFactor: 0.5,
});

/**
 * Speed used to recover to the T between shots (m/s). Players jog back
 * rather than sprint, which keeps the movement relaxed and saves stamina;
 * they sprint only for the ball.
 */
export const RECOVERY_SPEED = 3.2;

/** Game pace presets: multiplier applied to simulation time. */
export const PACE = Object.freeze({
  relaxed: 0.8,
  normal: 1.0,
  fast: 1.2,
});
