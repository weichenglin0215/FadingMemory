const { game } = require('./load.js');
const G = game('reaction_cake.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 20) console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 關卡：第 1 關 3 人，每關 +1，最多 N_MAX；輔助刻度 100% → 0%
const ns = []; for (let l = 1; l <= 12; l++) ns.push(T.nFor(l));
ok(ns[0] === 3 && ns[1] === 4 && ns[2] === 5 && ns[T.N_MAX - 3] === T.N_MAX && ns[11] === T.N_MAX && ns.every((v, i) => !i || v >= ns[i - 1]), 'people per level ' + ns.join());
ok(near(T.aidOpacity(1), 1) && near(T.aidOpacity(4), 0) && near(T.aidOpacity(9), 0) && T.aidOpacity(2) > T.aidOpacity(3), 'aid fades out');
// 角度：12 點鐘為 0°，順時針
ok(near(T.angleOf(0, -10), 0) && near(T.angleOf(10, 0), 90) && near(T.angleOf(0, 10), 180) && near(T.angleOf(-10, 0), 270) && near(T.angleOf(10, -10), 45), 'angleOf');
// 切塊角度
for (let n = 2; n <= 12; n++) {
  const cuts = []; const f = Math.random() * 360; for (let i = 0; i < n; i++) cuts.push(f + i * 360 / n);
  const a = T.sliceAngles(cuts);
  ok(a.length === n && near(a.reduce((x, y) => x + y, 0), 360, 1e-6) && a.every(x => near(x, 360 / n, 1e-6)), 'even slices n=' + n);
  ok(T.spreadRatio(a) < 1e-9 && T.passes(a), 'even → passes');
}
// 使用者的例子：切成 5 塊，平均每塊 20%，標準是 20% 的 15% ＝ 3%（總面積）
ok(near(T.tolerancePct(5), 3, 1e-9) && near(T.tolerancePct(4), 3.75, 1e-9) && near(T.tolerancePct(3), 5, 1e-9), 'tolerance: 5 pieces → 3%');
{ // 5 塊：最大 21.5%、最小 18.5%（差 3.0%）剛好過關；差 3.2% 不過關
  const mk = (pcts) => { let acc = 0; const cuts = [0]; pcts.slice(0, -1).forEach(p => { acc += p * 3.6; cuts.push(acc); }); return cuts; };
  ok(T.passes(T.sliceAngles(mk([21.5, 18.5, 20, 20, 20]))), '3.0% apart passes');
  ok(!T.passes(T.sliceAngles(mk([21.6, 18.4, 20, 20, 20]))), '3.2% apart fails');
  ok(T.passes(T.sliceAngles(mk([20.5, 19.5, 20.5, 19.5, 20]))) && !T.passes(T.sliceAngles(mk([25, 15, 20, 20, 20]))), 'passes / fails examples');
}
// 抓線：最近的藍線（環狀距離），太遠就不抓
ok(T.nearestIndex([10, 120, 250], [0, 1, 2], 355, 40) === 0 && T.nearestIndex([10, 120, 250], [0, 1, 2], 130, 40) === 1 && T.nearestIndex([10, 120, 250], [0, 1, 2], 185, 40) === -1, 'nearestIndex wraps around and respects the limit');
// 起始位置：n−1 條藍線、一定不會一開始就過關、偏移受 JITTER 限制
let startPass = 0, minSpread = 9;
for (let lv = 1; lv <= 14; lv++) for (let k = 0; k < 300; k++) {
  const S = T.makeStart(lv); const n = T.nFor(lv);
  ok(S.n === n && S.lines.length === n - 1, 'n−1 blue lines');
  const a = T.sliceAngles([S.first].concat(S.lines));
  if (T.passes(a)) startPass++;
  minSpread = Math.min(minSpread, T.spreadRatio(a));
  ok(T.spreadRatio(a) >= T.PASS_RATIO * 2 - 1e-9, 'starting layout is clearly not a pass');
  S.lines.forEach((l, i) => { const ideal = S.first + (i + 1) * 360 / n; const d = Math.abs(((l - ideal + 540) % 360) - 180); ok(d <= T.JITTER * 360 / n + 1e-6, 'jitter is bounded'); });
}
ok(startPass === 0, 'no level starts already solved');
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(11), 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
