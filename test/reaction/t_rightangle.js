const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_rightangle.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
const rad = d => d * Math.PI / 180;
// 出題：角度範圍、避開 135°、答案＝θ−90°（右上）、整條線在舞台內、斜紋與題目線夾角 20～40
let minAvoid = 999;
for (let i = 0; i < 6000; i++) {
  const c = T.makeRound(rnd);
  ok(c.th >= T.ANG_MIN && c.th <= T.ANG_MAX, '角度範圍');
  minAvoid = Math.min(minAvoid, Math.abs(c.th - 135));
  ok(Math.abs(c.ans - (c.th - 90)) < 1e-9 && c.ans >= 10 && c.ans <= 80, '答案在右上');
  const qx = T.S.x + c.len * Math.cos(rad(c.th)), qy = T.S.y - c.len * Math.sin(rad(c.th));
  ok(qx >= 20 && qx <= 472 && qy >= 20, '題目線在舞台內 ' + qx + ',' + qy);
  const d = T.angDiff(c.stripe, c.th); ok(d >= 20 - 1e-9 && d <= 40 + 1e-9, '斜紋夾角 ' + d);
  // 標準垂線的兩個方向向量內積＝0
  ok(Math.abs(Math.cos(rad(c.th)) * Math.cos(rad(c.ans)) + Math.sin(rad(c.th)) * Math.sin(rad(c.ans))) < 1e-12, '垂直');
}
ok(minAvoid >= T.AVOID, '避開 135°：' + minAvoid);
// angleOf：右 0°、上 90°、左上 135°
ok(Math.abs(T.angleOf({ x: T.S.x + 100, y: T.S.y })) < 1e-9, '向右 0°');
ok(Math.abs(T.angleOf({ x: T.S.x, y: T.S.y - 100 }) - 90) < 1e-9, '向上 90°');
ok(Math.abs(T.angleOf({ x: T.S.x - 100, y: T.S.y - 100 }) - 135) < 1e-9, '左上 135°');
// angDiff／signedDiff
ok(T.angDiff(10, 350) === 20 && T.angDiff(0, 180) === 180 && T.angDiff(45, 45) === 0 && Math.abs(T.angDiff(30, 33.5) - 3.5) < 1e-9, 'angDiff');
ok(T.signedDiff(10, 350) === 20 && T.signedDiff(350, 10) === -20, 'signedDiff');
// ZOOM：誤差越小倍率越大；誤差大不 ZOOM；上限 40
ok(T.zoomFor(30, 280) === 1 && T.zoomFor(21, 280) === 1 && T.zoomFor(8, 280) > 1, '誤差大（兩端相距 ≥ 100px）不 ZOOM');
ok(T.zoomFor(3, 280) > 1 && T.zoomFor(1, 280) > T.zoomFor(3, 280) && T.zoomFor(0, 280) === 40, 'ZOOM 倍率隨誤差變小而變大，最大 40');
ok(T.rating(0.1) !== T.rating(0.5) && T.rating(0.5) !== T.rating(1.5) && T.rating(1.5) !== T.rating(3) && T.rating(3) !== T.rating(9), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
