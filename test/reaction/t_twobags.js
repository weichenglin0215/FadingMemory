const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_twobags.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 重量與直徑：三次方成正比；直徑 ×1.26 重量 ×2
ok(near(T.weightOf(10), 0.5) && near(T.weightOf(20) / T.weightOf(10), 8) && near(T.weightOf(10 * Math.cbrt(2)) / T.weightOf(10), 2, 1e-9), '重量是直徑的三次方');
for (const d of [18, 30, 44.5, 66]) ok(near(T.diameterOf(T.weightOf(d)), d, 1e-9), 'diameterOf 是 weightOf 的反函數');
// 難度曲線：容許誤差 8% → 1%（線性）、石頭數 3 → 12
ok(near(T.tolAt(1), 0.08) && near(T.tolAt(T.RAMP_LEVELS), 0.01), '容許誤差端點');
{ const d = T.tolAt(1) - T.tolAt(2); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.tolAt(l) - T.tolAt(l + 1), d, 1e-12), '容許誤差線性 ' + l); }
ok(T.countAt(1) === 3 && T.countAt(2) === 4 && T.countAt(10) === 12, '石頭數 3 起、每關 +1');
// 分法函式
ok(near(T.diffOf([5, 3, 2], 0b001), 0) && near(T.diffOf([5, 3, 2], 0b110), 0) && near(T.diffOf([5, 3, 2], 0b011), 6), 'diffOf');
{ const b = T.bestPartition([5, 3, 2]); ok(b.diff === 0 && (b.mask === 1 || b.mask === 6), 'bestPartition'); }
ok(T.bestPartition([10, 1, 1, 1]).diff === 7, '最佳分法 10 對 3 → 差 7');
{ const d = [60, 20, 20, 20, 20], m = T.altPartition(d); ok((m & 1) === 1, '交錯放：最大的放左邊'); ok(T.areaPartition([30, 30, 30, 30]) !== undefined, 'areaPartition'); }
// 面積分法 vs 重量分法：同樣一組石頭，兩者通常不同——大石頭的 d³ 比 d² 多得多
{ const d = [60, 30, 30, 30, 30, 30]; const w = d.map(T.weightOf);
  ok(T.diffOf(w, T.areaPartition(d)) > 0.0001, '面積分法的重量差：' + T.diffOf(w, T.areaPartition(d))); }
// 出題：每關 200 題，驗證全部規則
let fail = 0, total = 0, areaOK = 0, altOK = 0, bigSum = {};
for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 200; k++) {
  const q = T.makeLevel(l, rnd); total++;
  ok(q.n === T.countAt(l) && q.d.length === q.n && q.w.length === q.n, '石頭數');
  ok(q.d.every(x => x >= T.D_MIN - 1e-9 && x <= T.D_MAX + 1e-9), '直徑範圍 ' + q.d.map(x => x.toFixed(1)));
  ok(q.w.every((w, i) => near(w, T.weightOf(q.d[i]), 1e-9)), '重量與直徑一致');
  ok(Math.max.apply(null, q.d) / Math.min.apply(null, q.d) >= T.RATIO_MIN - 1e-9, '最大／最小直徑比 ≥ ' + T.RATIO_MIN);
  ok(T.fitArea(q.d) <= T.FIT_AREA + 1e-9, '石頭放得進秤盤：' + T.fitArea(q.d));
  ok(near(q.total, q.w.reduce((a, b) => a + b, 0), 1e-9) && near(q.tol, T.tolAt(l)), 'total／tol');
  const best = T.bestPartition(q.w); ok(near(best.diff, q.best.diff, 1e-9), '最佳分法');
  const solvable = best.diff <= q.tol * q.total + 1e-9; if (!solvable) fail++;
  if (q.n >= T.HEUR_FROM) {
    const a = T.diffOf(q.w, T.areaPartition(q.d)) <= q.tol * q.total, b = T.diffOf(q.w, T.altPartition(q.d)) <= q.tol * q.total;
    if (a) areaOK++; if (b) altOK++;
  }
  // 容許範圍內的分法不能多到「亂放也過」：隨機分法通過的比例（n≥5）
  if (q.n >= 5) { let pass = 0; for (let r = 0; r < 100; r++) { const m = Math.floor(rnd() * (1 << q.n)); if (T.diffOf(q.w, m) <= q.tol * q.total) pass++; } bigSum[l] = (bigSum[l] || 0) + pass; }
}
ok(fail === 0, '每一題都有解：無解 ' + fail + ' / ' + total);
ok(areaOK === 0 && altOK === 0, '5 顆以上時面積分法、交錯分法都不能過：' + areaOK + ' / ' + altOK);
{ const l5 = (bigSum[5] || 0) / 200, l10 = (bigSum[10] || 0) / 200; console.log('隨機分法能過的平均比例（每 100 次）：第 5 關 ' + l5.toFixed(2) + '、第 10 關 ' + l10.toFixed(2)); ok(l5 < 25 && l10 < 5, '亂放通過的機率要低'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(5) && T.rating(5) !== T.rating(8) && T.rating(8) !== T.rating(10), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
