/**
 * Headless physics simulation for tuning shots and serves.
 *
 * Usage:  node tools/simulate.js
 *
 * For every shot type and a set of typical contact positions it launches the
 * ball, runs the full collision model and reports where the ball first lands
 * after the front wall, whether it would be legal, and how far it carries.
 * Serves are checked against the receiving-quarter rule.
 */
import { Ball } from '../src/physics/ball.js';
import { SHOTS, strikeVelocity } from '../src/physics/shots.js';
import { Referee } from '../src/rules/referee.js';
import { COURT, serviceBoxCentre } from '../src/config/court.js';
import { PHYSICS } from '../src/config/physics.js';

const rand = () => 0.5; // deterministic: no jitter

/**
 * Launch a ball and run until the rally ends or the ball dies.
 * @returns {{landing:{x:number,z:number}|null, verdict:string, frontY:number|null, maxY:number, secondBounce:{x:number,z:number}|null, t:number}}
 */
function run(from, shot, tx, { serving = false, serveSide = 'R' } = {}) {
  const ball = new Ball();
  ball.reset(from.x, from.y, from.z);
  const v = strikeVelocity(ball, shot, tx, rand);
  ball.vx = v.vx; ball.vy = v.vy; ball.vz = v.vz;
  ball.inPlay = true;

  const ref = new Referee();
  ref.serveSide = serveSide;
  ref.server = 0;
  ref.startRally();
  if (!serving) ref.onHit(0), ref.serving = false;

  let landing = null, second = null, frontY = null, maxY = 0, verdict = 'in play', t = 0;
  let decision = null;
  const onEvent = (type, info) => {
    if (type === 'frontwall' && frontY === null) frontY = info.y;
    if (type === 'floor' && ref.frontWallHit) {
      if (!landing) landing = { x: info.x, z: info.z };
      else if (!second) second = { x: info.x, z: info.z };
    }
    const d = ref.onBallEvent(type, info);
    if (d && !decision) decision = d;
  };
  while (t < 6 && !decision) {
    ball.step(PHYSICS.STEP, onEvent);
    maxY = Math.max(maxY, ball.y);
    t += PHYSICS.STEP;
    if (ball.isDead()) { decision = ref.onBallDead(); }
  }
  if (decision) verdict = `${decision.reason} (loser ${decision.loser})`;
  return { landing, second, verdict, frontY, maxY, t };
}

const fmt = (p) => (p ? `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})` : '   -   ');

console.log('=== Shots from the back of the court (z=7.5, y=0.8) ===');
for (const id of ['drive', 'smash', 'lob', 'drop']) {
  const shot = SHOTS[id];
  for (const x of [1.0, 3.2, 5.4]) {
    const r = run({ x, y: 0.8, z: 7.5 }, shot, x);
    console.log(`${id.padEnd(6)} x=${x} front y=${r.frontY?.toFixed(2)} land=${fmt(r.landing)} 2nd=${fmt(r.second)} maxY=${r.maxY.toFixed(2)} ${r.verdict}`);
  }
}

console.log('\n=== Shots from mid court (z=5, y=0.5), aimed cross-court ===');
for (const id of ['drive', 'smash', 'lob', 'drop']) {
  const shot = SHOTS[id];
  const r = run({ x: 1.5, y: 0.5, z: 5 }, shot, 4.5);
  console.log(`${id.padEnd(6)} front y=${r.frontY?.toFixed(2)} land=${fmt(r.landing)} 2nd=${fmt(r.second)} ${r.verdict}`);
}

console.log('\n=== Serves ===');
for (const side of ['R', 'L']) {
  const box = serviceBoxCentre(side);
  const from = { x: box.x, y: 1.5, z: box.z };
  for (const id of ['serve', 'lobServe']) {
    for (const off of [-0.6, -0.3, 0, 0.3, 0.6]) {
      const tx = COURT.W / 2 + (side === 'R' ? -1 : 1) * 0.4 + off;
      const r = run(from, SHOTS[id], tx, { serving: true, serveSide: side });
      console.log(`${id.padEnd(9)} side=${side} tx=${tx.toFixed(2)} front y=${r.frontY?.toFixed(2)} land=${fmt(r.landing)} ${r.verdict}`);
    }
  }
}

console.log('\n=== Boasts from the back corners (ball behind the player, low) ===');
for (const id of ['boast', 'backBoast']) {
  for (const [x, z, y] of [[0.5, 9.2, 0.4], [5.9, 9.3, 0.3], [0.4, 8.6, 0.6], [3.2, 9.4, 0.5]]) {
    const r = run({ x, y, z }, SHOTS[id], x);
    console.log(`${id.padEnd(9)} from (${x},${z}) front y=${r.frontY?.toFixed(2)} land=${fmt(r.landing)} 2nd=${fmt(r.second)} ${r.verdict}`);
  }
}
