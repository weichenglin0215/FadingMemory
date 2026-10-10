const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_spingap.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261026); const rnd = rng(SEED);

// 難度：轉速、缺口線性；到頂維持
ok(near(T.omegaDeg(1), 90) && near(T.omegaDeg(T.RAMP_LEVELS), 270) && near(T.omegaDeg(100), 270), '轉速 0.25 → 0.75 圈/秒');
ok(near(T.gapFor(1), 80) && near(T.gapFor(T.RAMP_LEVELS), 36) && near(T.gapFor(100), 36), '缺口 80 → 36 度');
for (let l = 2; l <= 100; l++) ok(T.omegaDeg(l) >= T.omegaDeg(l - 1) - 1e-12 && T.gapFor(l) <= T.gapFor(l - 1) + 1e-12, '單調 ' + l);
ok(near(T.omegaDeg(16) - (90 + 270) / 2, 0, 7), '轉速中點約等於平均（線性）');
// 人類做得到：每一發容許的時間誤差（毫秒）都要 ≥ 40 ms；起點很寬鬆
for (let l = 1; l <= 100; l++) ok(T.tolMs(l) >= 40, '容許時間誤差 ≥ 40ms：第 ' + l + ' 發 ' + T.tolMs(l).toFixed(1));
ok(T.tolMs(1) > 300 && T.tolMs(T.RAMP_LEVELS) < 80 && T.tolMs(T.RAMP_LEVELS) > 40, '起點 ±' + T.tolMs(1).toFixed(0) + 'ms，終點 ±' + T.tolMs(T.RAMP_LEVELS).toFixed(0) + 'ms');
// 角度正規化
ok(T.norm180(190) === -170 && T.norm180(-190) === 170 && T.norm180(0) === 0 && T.norm180(360) === 0 && T.norm180(180) === 180 && T.norm180(-180) === 180 && near(T.norm180(725), 5), 'norm180');
// 砲彈幾何：飛行時間 0.6 秒到環內緣
const g = T.ballGeom();
ok(near((g.y0 - g.yc) / g.v, 0.6, 1e-9) && g.yc < g.y0, '飛行 0.6 秒');
ok(near(T.ballHalfDeg(), Math.asin(12 / 178) * 180 / Math.PI), '砲彈半徑對應角度');
// 判定邊界：差距剛好等於容許誤差算過，超過一點點就撞
for (const lv of [1, 10, 30]) {
  const tol = T.tolDeg(lv);
  ok(T.judgeShot(lv, -90).pass && T.judgeShot(lv, -90 + tol).pass && T.judgeShot(lv, -90 - tol).pass, '邊界內 lv' + lv);
  ok(!T.judgeShot(lv, -90 + tol + 0.01).pass && !T.judgeShot(lv, -90 - tol - 0.01).pass && !T.judgeShot(lv, 90).pass, '邊界外 lv' + lv);
  ok(T.judgeShot(lv, 270).pass, '角度差 360 度也算（270 ≡ −90）');
}
// perfectDelay：在那一刻發射，抵達時缺口剛好在正上方；晚一個容許誤差就撞
for (let i = 0; i < 4000; i++) {
  const lv = 1 + Math.floor(rnd() * 100), om = T.omegaDeg(lv), phi = (rnd() - 0.5) * 720;
  const d = T.perfectDelay(phi, om);
  ok(d >= 0 && d < 360 / om + 1e-9, '延遲範圍');
  const arrive = T.gapAt(phi, om, d + T.FLIGHT_S);
  ok(Math.abs(T.norm180(arrive - T.TOP_DEG)) < 1e-6, '抵達時缺口在正上方：lv' + lv);
  ok(T.judgeShot(lv, arrive).pass, 'perfect 一定過');
  const lateMs = T.tolMs(lv) + 12, late = T.gapAt(phi, om, d + T.FLIGHT_S + lateMs / 1000);
  ok(!T.judgeShot(lv, late).pass, '晚超過容許時間一定撞');
  const earlyMs = T.tolMs(lv) - 6, early = T.gapAt(phi, om, d + T.FLIGHT_S - earlyMs / 1000);
  ok(T.judgeShot(lv, early).pass, '在容許時間內提早也過');
  const half = T.gapAt(phi, om, d + T.FLIGHT_S + 180 / om);
  ok(!T.judgeShot(lv, half).pass, '差半圈一定撞');
}
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(20) && T.rating(20) !== T.rating(35), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
