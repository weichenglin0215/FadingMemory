const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_blindcircle.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
const C = T.CENTER;
const circle = (R, a0, turns, n, noise, rn) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + 2 * Math.PI * turns * i / n, r = R * (1 + (noise || 0) * ((rn || rnd)() * 2 - 1)); out.push({ x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) }); } return out; };

// 出題：起點在右下象限、半徑在範圍內、起點到圓心的距離＝R
for (let i = 0; i < 3000; i++) {
  const c = T.makeRound(rnd);
  ok(c.R >= T.R_MIN && c.R <= T.R_MAX, '半徑範圍');
  ok(c.start.x > C.x && c.start.y > C.y, '起點在圓心右下方');
  ok(Math.abs(Math.hypot(c.start.x - C.x, c.start.y - C.y) - c.R) < 1e-9, '起點到圓心的距離＝R');
  const deg = c.ang * 180 / Math.PI; ok(deg >= T.ANG_MIN - 1e-9 && deg <= T.ANG_MAX + 1e-9, '起點方位');
  ok(C.x + c.R + 20 < 472 && C.y + c.R + 20 < 600 && C.x - c.R > 0, '整個圓放得進舞台');
}
// 完美圓：圓度 100、有效；順時針逆時針都一樣
for (const dir of [1, -1]) {
  const a = T.analyze(circle(120, 0.7, dir, 200), C, 120);
  ok(a.valid && a.roundness > 99.98, '完美圓圓度 ' + a.roundness);
  ok(Math.abs(Math.abs(a.turn) - 360) < 2, '繞了 360 度：' + a.turn);
  ok(a.gap < T.STEP * 1.5, '首尾接上：' + a.gap);
}
// 半徑偏小 20%：圓度約 80；偏差越大圓度越低（單調）
let prev = 101;
for (const s of [1, 0.95, 0.9, 0.8, 0.6]) { const a = T.analyze(circle(120 * s, 0.7, 1, 200), C, 120); ok(a.roundness < prev, '偏差越大圓度越低 ' + s); prev = a.roundness; ok(Math.abs(a.roundness - (100 - (1 - s) * 100)) < 0.5, '圓度≈100−偏差%：' + s + ' → ' + a.roundness); }
// 抖動：噪音越大圓度越低
const n1 = T.analyze(circle(120, 0.7, 1, 200, 0.02), C, 120).roundness, n2 = T.analyze(circle(120, 0.7, 1, 200, 0.1), C, 120).roundness;
ok(n1 > n2 && n2 > 80 && n1 < 100, '噪音影響圓度 ' + n1 + ' / ' + n2);
// 無效：半圈、兩圈、太短
ok(!T.analyze(circle(120, 0, 0.5, 100), C, 120).valid, '半圈無效');
ok(!T.analyze(circle(120, 0, 2, 400), C, 120).valid, '兩圈無效');
ok(!T.analyze(circle(10, 0, 1, 40), C, 10).valid, '太小的圈無效（長度不足）');
// 不均勻取點（快慢不同）不影響結果
const uneven = []; { const full = circle(120, 0.7, 1, 2000); let i = 0; while (i < full.length) { uneven.push(full[i]); i += 1 + Math.floor(rnd() * 40); } uneven.push(full[full.length - 1]); }
ok(T.analyze(uneven, C, 120).roundness > 99.9, '取樣疏密不影響圓度');
// resample 間距
const rs = T.resample(circle(120, 0, 1, 600), 4); let maxd = 0, mind = 99; for (let i = 1; i < rs.length - 1; i++) { const d = Math.hypot(rs[i].x - rs[i - 1].x, rs[i].y - rs[i - 1].y); maxd = Math.max(maxd, d); mind = Math.min(mind, d); }
ok(maxd < 4.0001 && mind > 3.9, 'resample 等距：' + mind + '～' + maxd);
ok(T.rating(99.5) !== T.rating(97.5) && T.rating(97.5) !== T.rating(91) && T.rating(91) !== T.rating(50), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
