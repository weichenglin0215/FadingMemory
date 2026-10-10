const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_farpair.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261021); const rnd = rng(SEED);

ok(T.pairsFor(1) === 2 && T.pairsFor(T.PAIR_LEVELS) === 6 && T.pairsFor(60) === 6, '對數 2 → 6');
ok(near(T.ratioFor(1), 1.6) && near(T.ratioFor(T.RAMP_LEVELS), 1.04) && near(T.ratioFor(60), 1.04), '比例 1.6 → 1.04');
for (let l = 2; l <= 60; l++) ok(T.pairsFor(l) >= T.pairsFor(l - 1) && T.ratioFor(l) <= T.ratioFor(l - 1) + 1e-12 && T.ansMs(l) <= T.ansMs(l - 1), '單調 ' + l);
ok(T.ansMs(1) === 10000 && T.ansMs(T.RAMP_LEVELS) === 7000, '限時 10 → 7 秒');
const W = 472, H = 630;
let sumBest = 0;
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, W, H, rnd);
  ok(q.pairs.length === T.pairsFor(lv), '對數 ' + lv + '：' + q.pairs.length);
  // 距離＝座標算出來的距離；最遠唯一、與第二遠的比例＝設定值
  const ds = q.pairs.map(p => Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y));
  q.pairs.forEach((p, k) => ok(near(ds[k], p.d, 1e-6), '距離一致'));
  const sorted = ds.slice().sort((a, b) => b - a);
  ok(ds[q.best] === sorted[0] && sorted[0] > sorted[1], '最遠唯一');
  if (lv < 100) ok(near(sorted[0] / sorted[1], T.ratioFor(lv), 1e-6) || q.pairs.length === 2 && false || near(sorted[0] / sorted[1], T.ratioFor(lv), 1e-6), '最遠÷第二遠＝設定比例 ' + lv + '：' + sorted[0] / sorted[1] + ' vs ' + T.ratioFor(lv));
  ok(sorted[sorted.length - 1] >= T.D_MIN - 1e-6, '最短距離');
  // 所有點在邊界內、彼此相距 ≥ MIN_GAP
  const pts = []; q.pairs.forEach(p => { pts.push(p.a, p.b); });
  pts.forEach((p, a) => { ok(p.x >= T.MARGIN - 1e-6 && p.x <= W - T.MARGIN + 1e-6 && p.y >= T.MARGIN - 1e-6 && p.y <= H - T.MARGIN + 1e-6, '在界內'); for (let b = a + 1; b < pts.length; b++) ok(Math.hypot(p.x - pts[b].x, p.y - pts[b].y) >= T.MIN_GAP - 1e-6, '點間距'); });
  // 顏色不重複
  ok(new Set(q.pairs.map(p => p.color)).size === q.pairs.length, '顏色不重複');
  sumBest += q.best;
}
// 最遠那一對的位置分布（洗牌後不是固定在第一個）
const bestPos = {}; for (let i = 0; i < 1500; i++) { const q = T.makeLevel(40, W, H, rnd); bestPos[q.best] = (bestPos[q.best] || 0) + 1; }
ok(Object.keys(bestPos).length === 6 && Math.min(...Object.values(bestPos)) > 100, '最遠的位置均勻分布：' + JSON.stringify(bestPos));
// 方向：橫、直、斜都會出現（避免靠錯覺取巧）
let horiz = 0, vert = 0, diag = 0;
for (let i = 0; i < 2000; i++) { const q = T.makeLevel(20, W, H, rnd); const p = q.pairs[q.best]; const a = Math.abs(Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x)) * 180 / Math.PI; if (a < 20 || a > 160) horiz++; else if (a > 70 && a < 110) vert++; else diag++; }
ok(horiz > 100 && vert > 100 && diag > 600, '方向分布 ' + horiz + '/' + vert + '/' + diag);
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
