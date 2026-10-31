// Where each shot type lands (node tools/shot-depth.mjs): first and second floor bounce of a clean
// strike from mid-court, plus a sweep of front-wall height and speed for the drive and the cross,
// to tune the shot table so drives die in the back corners and drops sit in the front ones.
import { SHOTS, strikeVelocity } from '../src/physics/shots.js';
import { Ball } from '../src/physics/ball.js';
import { COURT } from '../src/config/court.js';

/** Simulate a strike and report the first two floor bounces and the walls met in between. */
function land(shot, from, tx) {
  const b = new Ball();
  b.x = from.x; b.y = from.y; b.z = from.z; b.inPlay = true;
  const v = strikeVelocity(from, shot, tx, () => 0.5, 0);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  const bounces = [], walls = [];
  let t = 0;
  while (bounces.length < 2 && t < 6) {
    b.step(1 / 480, (type, info) => {
      if (type === 'floor') bounces.push({ x: +info.x.toFixed(2), z: +info.z.toFixed(2), t: +t.toFixed(2) });
      else if (bounces.length < 2) walls.push((type === 'frontwall' ? 'F' : type === 'backwall' ? 'B' : type === 'sidewall' ? 'S' : 'C') + (bounces.length ? "'" : ''));
    });
    t += 1 / 480;
  }
  return { bounces, walls: walls.join('') };
}
const fmt = (r) => `1st (${r.bounces[0]?.x ?? '-'}, ${r.bounces[0]?.z ?? '-'})  2nd (${r.bounces[1]?.x ?? '-'}, ${r.bounces[1]?.z ?? '-'})  walls ${r.walls} (' = after the first bounce)`;
const from = { x: 1.0, y: 0.5, z: 5.5 };
/** Front-wall x that lands the ball at cornerX, 8.2 m deep (the AI's aimCorner). */
const aim = (b, cornerX, depth = 8.2) => { const k = depth / b.z; return (cornerX + k * b.x) / (1 + k); };
console.log(`from (${from.x}, ${from.y}, ${from.z}); court ${COURT.W} x ${COURT.L}; a good length has its second bounce at or just off the back wall`);
for (const shot of Object.values(SHOTS)) {
  if (shot.wall) continue;
  const tx = shot.id === 'cross' ? aim(from, COURT.W - 0.45) : shot.id === 'drop' ? 0.6 : aim(from, 0.5);
  console.log(`${shot.id.padEnd(6)} ty ${shot.ty} v ${shot.speed}  ${fmt(land(shot, from, tx))}`);
}
console.log('--- drive sweep (straight, tx 0.6)');
for (const ty of [1.7, 2.0, 2.3, 2.6, 2.9]) for (const speed of [19, 21, 23]) console.log(`ty ${ty} v ${speed}  ${fmt(land({ ...SHOTS.drive, ty, speed }, from, aim(from, 0.5)))}`);
console.log('--- cross sweep (tx W-0.45)');
for (const ty of [1.3, 1.6, 1.9, 2.2]) for (const speed of [20, 22]) console.log(`ty ${ty} v ${speed}  ${fmt(land({ ...SHOTS.cross, ty, speed }, from, aim(from, COURT.W - 0.45)))}`);
console.log('--- drive from the back (z 8.5)');
for (const ty of [2.0, 2.3, 2.6]) console.log(`ty ${ty} v 21  ${fmt(land({ ...SHOTS.drive, ty, speed: 21 }, { x: 0.8, y: 0.4, z: 8.5 }, aim({ x: 0.8, z: 8.5 }, 0.5)))}`);
