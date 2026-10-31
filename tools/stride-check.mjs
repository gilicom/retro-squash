// Count footfalls on runs from the T to each corner and back through the animation solver (node tools/stride-check.mjs): squash footwork is 2-4 footfalls per run.
const noop = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(64), width: 4, height: 4 }) : noop), set: () => true, apply: () => noop });
globalThis.document = { createElement: () => noop };
const { Player, T_POSITION } = await import('../src/entities/player.js');
const { PlayerModel } = await import('../src/render3d/player3d.js');
const { COURT } = await import('../src/config/court.js');

function run(label, from, to, speed = 3.8, cap = Infinity) {
  const p = new Player(0, { speed, reach: 1.1, color: '#fff', name: 'p' });
  p.place?.(from.x, from.z);
  p.x = p.targetX = from.x; p.z = p.targetZ = from.z;
  const m = new PlayerModel(0xffffff);
  const ball = { x: to.x - 0.95, y: 0.4, z: to.z - 0.15, inPlay: true };
  const dt = 1 / 120;
  // settle
  for (let i = 0; i < 60; i++) { p.update(dt); m.update(p, ball, dt, undefined, true); }
  p.setTarget(to.x, to.z); p.speedCap = cap;
  let footfalls = 0, jogFalls = 0, steps = 0, t = 0, maxSpread = 0;
  const prevJog = [-1, -1], prevSwing = [-1, -1];
  while (t < 4 && (Math.hypot(p.x - p.targetX, p.z - p.targetZ) > 0.02 || Math.hypot(p.vx, p.vz) > 0.05)) {
    p.update(dt); m.update(p, ball, dt, undefined, true); t += dt;
    for (let i = 0; i < 2; i++) {
      const f = m.feet[i];
      if (prevJog[i] >= 0.5 && f.jogSwing < 0) { jogFalls++; footfalls++; }
      if (prevSwing[i] >= 0 && f.swing < 0) { steps++; footfalls++; }
      prevJog[i] = f.jogSwing; prevSwing[i] = f.swing;
    }
    maxSpread = Math.max(maxSpread, Math.hypot(m.feet[0].pos.x - m.feet[1].pos.x, m.feet[0].pos.z - m.feet[1].pos.z));
  }
  // settle at the target: the remaining steps into the stance
  for (let i = 0; i < 60; i++) {
    p.update(dt); m.update(p, ball, dt, undefined, true);
    for (let k = 0; k < 2; k++) { const f = m.feet[k]; if (prevSwing[k] >= 0 && f.swing < 0) { steps++; footfalls++; } prevSwing[k] = f.swing; prevJog[k] = f.jogSwing; }
  }
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  console.log(`${label.padEnd(26)} dist ${dist.toFixed(2)} m  time ${t.toFixed(2)} s  footfalls ${footfalls} (jog ${jogFalls}, steps ${steps})  max spread ${maxSpread.toFixed(2)}`);
}
const T = { x: T_POSITION.x, z: T_POSITION.z };
const corners = { 'back-left': { x: 0.9, z: COURT.L - 0.9 }, 'back-right': { x: COURT.W - 0.9, z: COURT.L - 0.9 }, 'front-left': { x: 0.9, z: 1.4 }, 'front-right': { x: COURT.W - 0.9, z: 1.4 }, 'mid-left': { x: 0.9, z: T.z }, 'mid-right': { x: COURT.W - 0.9, z: T.z } };
for (const [k, c] of Object.entries(corners)) {
  // the player stands beside the ball: target = ball + stance offset (handled in the AI); here the target is the corner spot itself
  run('T -> ' + k, T, c);
  run(k + ' -> T (jog)', c, T, 3.8, 1.7);
}
