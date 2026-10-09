const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_watchoff.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 難度曲線：誤差率 8% → 0.5%（線性），作答限時 10 → 5 秒
ok(near(T.errAt(1), 0.08) && near(T.errAt(T.RAMP_LEVELS), 0.005), '誤差率端點');
{ const d = T.errAt(1) - T.errAt(2); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.errAt(l) - T.errAt(l + 1), d, 1e-12), '誤差率線性 ' + l); }
ok(T.ansMs(1) === 10000 && T.ansMs(T.RAMP_LEVELS) === 5000, '作答限時端點');
// 15 秒的累積差：8% → 1.2 秒；0.5% → 0.075 秒（由 dialSeconds 算）
ok(near(T.dialSeconds(1 / 1.08, 15) - 15, 1.2, 1e-9) && near(T.dialSeconds(1 / 1.005, 15) - 15, 0.075, 1e-9), '15 秒累積差');
// 秒針：每個 period 跳 6 度，跳完一圈回到 0
ok(T.handDeg(1, 0, 0) === 0 && T.handDeg(1, 0, 0.99) === 0 && T.handDeg(1, 0, 1) === 6 && T.handDeg(1, 0, 59.99) === 354 && T.handDeg(1, 0, 60) === 0, '準的錶每秒跳 6 度、60 秒一圈');
ok(T.handDeg(1, 0.5, 0.49) === 0 && T.handDeg(1, 0.5, 0.5) === 6, '相位讓第一次跳動提早');
ok(T.handDeg(0.5, 0, 1) === 12 && T.handDeg(2, 0, 3.9) === 6, '快的錶跳得多、慢的錶跳得少');
// 出題
const styles = {}, oddCnt = [0, 0, 0]; let fast = 0, n = 0;
for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let i = 0; i < 200; i++) {
  const q = T.makeLevel(l, rnd); n++;
  q.periods.forEach((p, k) => { if (k !== q.odd) ok(p === 1, '準的錶間隔剛好 1 秒'); });
  ok(near(q.periods[q.odd], 1 / (1 + q.e), 1e-12) && near(Math.abs(q.e), T.errAt(l), 1e-12), '不準的那支的間隔與誤差一致');
  ok(q.phases.every(p => p >= 0 && p < 1) && q.rots.every(r => r >= 0 && r < 360), '相位與朝向範圍');
  ok(new Set(q.styles).size === 3 && q.styles.every(s => T.STYLES.indexOf(s) >= 0), '三種錶面各一支');
  oddCnt[q.odd]++; if (q.e > 0) fast++;
  // 15 秒內三支錶的秒針位置：兩支準的錶因為相位不同所以不同步，但各自每秒跳一格
  for (let k = 0; k < 3; k++) { let jumps = 0, prev = T.handDeg(q.periods[k], q.phases[k], 0); for (let t = 0.01; t <= 15; t += 0.01) { const d = T.handDeg(q.periods[k], q.phases[k], t); if (d !== prev) { jumps++; prev = d; } } ok(Math.abs(jumps - 15 / q.periods[k]) <= 1.5, '15 秒內跳動次數 ' + jumps + ' ≈ ' + (15 / q.periods[k]).toFixed(2)); }
}
ok(oddCnt.every(c => c > n / 3 * 0.85), '不準的錶 A/B/C 平均 ' + oddCnt.join(',')); ok(fast / n > 0.45 && fast / n < 0.55, '偏快偏慢各一半：' + fast / n);
T.STYLES.forEach(s => ok(/^<svg/.test(T.faceSvg(s)) && T.faceSvg(s).indexOf('wo-hand') > 0, s + ' 錶面 SVG'));
ok(T.faceSvg('roman').indexOf('XII') > 0 && T.faceSvg('digits').indexOf('>12<') > 0 && T.faceSvg('none').indexOf('<text') < 0, '三種錶面的數字');
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16) && T.rating(16) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
