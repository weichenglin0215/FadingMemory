const { game } = require('./load.js');
const G = game('reaction_candy.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 20) console.log('FAIL', m); } };
const p1 = T.paramsFor(1), p20 = T.paramsFor(20), p10 = T.paramsFor(10.5);
console.log(JSON.stringify(p1), JSON.stringify(p10), JSON.stringify(p20));
ok(T.R === 42, 'candy size doubled (R = 42)');
ok(T.paramsFor(100).n === p20.n && T.paramsFor(100).k === p20.k && T.paramsFor(100).showMs === p20.showMs && T.paramsFor(100).gap === p20.gap && T.paramsFor(100).lead === p20.lead, 'clamps after LEVEL_RAMP');
ok(Math.abs(p10.n - (p1.n + p20.n) / 2) <= 1 && Math.abs(p10.showMs - (p1.showMs + p20.showMs) / 2) <= 1, 'midpoint is the mean (linear)');
ok(p1.lead === 3 && p20.lead === 1 && p20.n === T.N_END, 'lead 3 → 1, n ends at N_END');
for (let lv = 1; lv <= 30; lv++) for (let k = 0; k < 300; k++) {
  const q = T.makeQuestion(lv); const p = T.paramsFor(lv);
  const total = q.colors.reduce((s, c) => s + q.counts[c], 0);
  ok(total === p.n, 'total ' + total + ' vs ' + p.n);
  ok(q.colors.length === p.k && new Set(q.colors).size === p.k, 'colors');
  ok(q.counts[q.target] === q.answer && q.colors.indexOf(q.target) >= 0, 'answer');
  ok(q.colors.every(c => q.counts[c] >= 1), 'each>=1');
  // 要數的顏色是數量最多的，而且領先第二名至少 lead 顆（沒有並列）
  const second = Math.max.apply(null, q.colors.filter(c => c !== q.target).map(c => q.counts[c]));
  ok(q.answer - second >= p.lead, 'target leads by at least ' + p.lead + ' (answer ' + q.answer + ' second ' + second + ' lv' + lv + ')');
  ok(q.options.length === 4 && new Set(q.options).size === 4 && q.options.indexOf(q.answer) >= 0, 'options ' + q.options + ' ans ' + q.answer);
  ok(q.options.every(o => o >= 1), 'positive');
  const dmin = Math.min.apply(null, q.options.filter(o => o !== q.answer).map(o => Math.abs(o - q.answer)));
  ok(dmin >= p.gap && (dmin - p.gap) % 1 === 0, 'gap multiples');
}
// 擺放：最大顆數在（保守的）托盤內放得下；每顆都露出 ≥ MIN_VIS；位置在托盤內；大小是兩倍
const W = 468, Hh = 400; let fails = 0, minVis = 1, meanVis = 0, runs = 0, oob = 0;
for (let t = 0; t < 60; t++) {
  const n = T.paramsFor(20).n; const lay = T.scatter(n, W, Hh);
  if (!lay) { fails++; continue; }
  runs++; const f = T.visibleFractions(lay); minVis = Math.min(minVis, Math.min.apply(null, f)); meanVis += f.reduce((a, b) => a + b, 0) / f.length;
  lay.forEach(c => { if (c.x < T.R || c.x > W - T.R || c.y < T.R || c.y > Hh - T.R) oob++; });
  ok(lay.length === n, 'candy count');
}
console.log('N=' + T.paramsFor(20).n + ' in 468x400: placed ' + runs + '/60, min visible ' + minVis.toFixed(2) + ', mean visible ' + (meanVis / runs).toFixed(2));
ok(fails === 0, 'every layout of the maximum count fits (' + fails + ' failed)');
ok(minVis >= T.MIN_VIS - 1e-9, 'every candy shows at least ' + T.MIN_VIS * 100 + '% (min ' + minVis + ')');
ok(oob === 0, 'candies stay inside the tray');
// visibleFractions 的正確性：蓋住一半的糖果 → 約 50%；完全蓋住 → 0；沒蓋住 → 1
const A = { x: 100, y: 100, rot: 0 };
ok(T.visibleFractions([A])[0] === 1, 'a lone candy is fully visible');
ok(T.visibleFractions([A, { x: 100, y: 100, rot: 0 }])[0] === 0, 'an identical candy on top hides it completely');
const half = T.visibleFractions([A, { x: 100 + T.R * 0.8, y: 100, rot: 0 }])[0]; ok(half > 0.3 && half < 0.8, 'a partly covered candy: ' + half.toFixed(2));
ok(T.visibleFractions([A, { x: 100 + 6 * T.R, y: 100, rot: 0 }])[0] === 1, 'far away candy does not cover');
ok(T.inCandy(100, 100, 100, 100, 0) && !T.inCandy(100 + 1.2 * T.R, 100, 100, 100, 0) && T.inCandy(100 + 0.9 * T.R, 100 + 0.2 * T.R, 100, 100, 0) && T.inCandy(100, 100 + 0.9 * T.R * 0.2, 100, 100, 90), 'inCandy shape');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
