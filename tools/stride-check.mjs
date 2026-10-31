// Count footfalls on runs from the T to each corner and back through the animation solver
// (node tools/stride-check.mjs, VERBOSE=1 for the landing positions): squash footwork is 2-4
// footfalls per run, right-left-right into the back-left corner, no shuffle steps before or after.
const noop = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(64), width: 4, height: 4 }) : noop), set: () => true, apply: () => noop });
globalThis.document = { createElement: () => noop };
const { Player, T_POSITION } = await import('../src/entities/player.js');
const { PlayerModel } = await import('../src/render3d/player3d.js');
const { COURT } = await import('../src/config/court.js');
const VERBOSE = !!process.env.VERBOSE;

/**
 * @param {string} label
 * @param {{x:number,z:number}} from
 * @param {{x:number,z:number}} to
 * @param {{x:number,y:number,z:number}} ball where the ball is during the run
 * @param {boolean} myTurn running to play the ball (true) or recovering to the T (false)
 * @param {number} cap speed cap (the recovery jog is capped)
 */
function run(label, from, to, ball, myTurn, cap = Infinity) {
  const p = new Player(0, { speed: 3.8, reach: 1.1, color: '#fff', name: 'p' });
  p.x = p.targetX = from.x; p.z = p.targetZ = from.z;
  const m = new PlayerModel(0xffffff);
  const b = { ...ball, inPlay: true };
  const dt = 1 / 120;
  // Settle in the starting stance.
  for (let i = 0; i < 120; i++) { p.update(dt); m.update(p, b, dt, undefined, myTurn); }
  let t = 0;
  if (VERBOSE) m.debugStep = (d) => console.log(`    shuffle ${d.foot === 0 ? 'L' : 'R'} starts at ${t.toFixed(2)}s: off by ${d.dist.toFixed(2)} > ${d.threshold.toFixed(2)}  speed ${d.speed.toFixed(2)} lunge ${d.lunge.toFixed(2)} prep ${d.prep.toFixed(2)} facing ${d.facing.toFixed(2)}  from (${(d.from.x - d.hips.x).toFixed(2)},${(d.from.z - d.hips.z).toFixed(2)}) to (${(d.to.x - d.hips.x).toFixed(2)},${(d.to.z - d.hips.z).toFixed(2)}) rel. hips`);
  p.setTarget(to.x, to.z); p.speedCap = cap;
  let strides = 0, steps = 0, maxSpread = 0;
  const prevSwing = [-1, -1];
  const order = [];
  const landing = (i, f) => {
    if (f.stride) strides++; else steps++;
    order.push((VERBOSE ? t.toFixed(2) + ':' : '') + (f.stride ? '' : '~') + (i === 0 ? 'L' : 'R'));
    if (VERBOSE) console.log(`    ${f.stride ? 'stride ' : 'shuffle'} ${i === 0 ? 'L' : 'R'} lands at ${t.toFixed(2)}s at (${(f.pos.x - p.x).toFixed(2)},${(f.pos.z - p.z).toFixed(2)}) rel. hips, hips ${Math.hypot(p.x - to.x, p.z - to.z).toFixed(2)} m from the target`);
  };
  const prevPlanted = [m.feet[0].planted.clone(), m.feet[1].planted.clone()];
  const tick = () => {
    p.update(dt); m.update(p, b, dt, undefined, myTurn);
    for (let i = 0; i < 2; i++) {
      const f = m.feet[i];
      if (prevSwing[i] >= 0 && f.swing < 0) landing(i, f);
      // A planted foot never moves (only a hop re-centres the feet).
      if (prevSwing[i] < 0 && f.swing < 0 && f.planted.distanceTo(prevPlanted[i]) > 0.05) console.log(`    !! planted ${i === 0 ? 'L' : 'R'} slid ${f.planted.distanceTo(prevPlanted[i]).toFixed(2)} m at ${t.toFixed(2)}s`);
      prevPlanted[i].copy(f.planted);
      prevSwing[i] = f.swing;
    }
    maxSpread = Math.max(maxSpread, Math.hypot(m.feet[0].pos.x - m.feet[1].pos.x, m.feet[0].pos.z - m.feet[1].pos.z));
  };
  while (t < 4 && (Math.hypot(p.x - p.targetX, p.z - p.targetZ) > 0.02 || Math.hypot(p.vx, p.vz) > 0.05)) { tick(); t += dt; }
  const arrived = t;
  // Settle at the target: any steps still taken into the stance.
  for (let i = 0; i < 90; i++) { tick(); t += dt; }
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  console.log(`${label.padEnd(22)} ${dist.toFixed(2)} m in ${arrived.toFixed(2)} s  footfalls ${strides + steps} (strides ${strides}, shuffles ${steps})  ${order.join(' ').padEnd(16)} max spread ${maxSpread.toFixed(2)}`);
}
/** Keyboard run: the target is kept 0.25 m + a few frames ahead of the body (as game.js does) for `hold` seconds, then released. */
function keyboardRun(label, dirX, dirZ, hold) {
  const p = new Player(0, { speed: 3.8, reach: 1.1, color: '#fff', name: 'p' });
  p.x = p.targetX = T_POSITION.x; p.z = p.targetZ = T_POSITION.z;
  const m = new PlayerModel(0xffffff);
  const b = { x: COURT.W / 2, y: 1.2, z: 2.0, inPlay: true };
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) { p.update(dt); m.update(p, b, dt, undefined, false); }
  let t = 0, strides = 0, steps = 0, maxSpread = 0;
  const prevSwing = [-1, -1], order = [];
  while (t < hold + 1.0) {
    if (t < hold) p.setTarget(p.x + dirX * (p.speed * dt * 1.5 + 0.25), p.z + dirZ * (p.speed * dt * 1.5 + 0.25));
    p.update(dt); m.update(p, b, dt, undefined, false); t += dt;
    for (let i = 0; i < 2; i++) {
      const f = m.feet[i];
      if (prevSwing[i] >= 0 && f.swing < 0) { if (f.stride) strides++; else steps++; order.push((VERBOSE ? t.toFixed(2) + ':' : '') + (f.stride ? '' : '~') + (i === 0 ? 'L' : 'R')); }
      prevSwing[i] = f.swing;
    }
    maxSpread = Math.max(maxSpread, Math.hypot(m.feet[0].pos.x - m.feet[1].pos.x, m.feet[0].pos.z - m.feet[1].pos.z));
  }
  const dist = Math.hypot(p.x - T_POSITION.x, p.z - T_POSITION.z);
  console.log(`${label.padEnd(22)} ${dist.toFixed(2)} m in ${hold.toFixed(2)} s  footfalls ${strides + steps} (strides ${strides}, shuffles ${steps})  ${order.join(' ').padEnd(16)} max spread ${maxSpread.toFixed(2)}`);
}
const T = { x: T_POSITION.x, z: T_POSITION.z };
const corners = { 'back-left': { x: 0.9, z: COURT.L - 0.9 }, 'back-right': { x: COURT.W - 0.9, z: COURT.L - 0.9 }, 'front-left': { x: 0.9, z: 1.4 }, 'front-right': { x: COURT.W - 0.9, z: 1.4 }, 'mid-left': { x: 0.9, z: T.z }, 'mid-right': { x: COURT.W - 0.9, z: T.z } };
for (const [k, c] of Object.entries(corners)) {
  // To the ball: the player stands beside it (the AI targets ball + stance offset; here the corner spot itself).
  run('T -> ' + k, T, c, { x: c.x + (c.x < COURT.W / 2 ? -0.95 : 0.95), y: 0.4, z: c.z - 0.15 }, true);
  // Back to the T at the recovery jog, the ball on its way to the front wall.
  run(k + ' -> T', c, T, { x: COURT.W / 2, y: 1.2, z: 2.0 }, false, 1.7);
}
keyboardRun('keyboard left 1 s', -1, 0, 1.0);
keyboardRun('keyboard back-left 1 s', -0.5, 0.866, 1.0);
keyboardRun('keyboard tap 0.2 s', -1, 0, 0.2);
