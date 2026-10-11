const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_candy.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 20) console.log('FAIL', m); } };
const SEED = seedOf(20261011), rnd = rng(SEED);
const p1 = T.paramsFor(1), p20 = T.paramsFor(20), p10 = T.paramsFor(10.5);
console.log(JSON.stringify(p1), JSON.stringify(p10), JSON.stringify(p20));
// 糖果大小：原本半徑 42，依玩家意見縮小成 80%
ok(Math.abs(T.R - 42 * 0.8) < 1e-9, 'candy size is 80% of the old 42 (R = ' + T.R + ')');
// 糖果總數：第 1 題 6 顆，之後每題多 N_STEP 顆（比原本平緩），最多 N_END
ok(T.N_START === 6 && p1.n === 6, 'level 1 has exactly 6 candies');
for (let lv = 1; lv <= 40; lv++) {
  const want = Math.min(T.N_END, 6 + T.N_STEP * (lv - 1));
  ok(T.paramsFor(lv).n === want && T.countFor(lv) === want, 'n at level ' + lv + ' = ' + T.paramsFor(lv).n + '（應為 ' + want + '）');
  if (lv > 1) ok(T.paramsFor(lv).n >= T.paramsFor(lv - 1).n, 'candy count never decreases');
}
ok(T.N_STEP >= 1 && T.N_STEP < 3.16, 'the curve is gentler than the old 10 → 70 over 20 levels (+3.16 per level)');
// 間隔：第 1～3 題差 4，之後每 3 題少 1，第 10 題起差 1（之後都是 1）
const gapExp = { 1: 4, 2: 4, 3: 4, 4: 3, 5: 3, 6: 3, 7: 2, 8: 2, 9: 2, 10: 1, 11: 1, 30: 1, 99: 1 };
for (const l in gapExp) ok(T.gapFor(+l) === gapExp[l] && T.paramsFor(+l).gap === gapExp[l], 'gap at level ' + l + ' = ' + T.gapFor(+l));
for (let lv = 2; lv <= 40; lv++) ok(T.gapFor(lv) <= T.gapFor(lv - 1), 'gap only gets smaller');
ok(T.gapFor(9) > 1 && T.gapFor(10) === 1, 'the gap becomes 1 exactly at level 10');
// 其他參數仍然是線性、到頂後維持
ok(T.paramsFor(100).k === p20.k && T.paramsFor(100).showMs === p20.showMs && T.paramsFor(100).lead === p20.lead, 'clamps after LEVEL_RAMP');
ok(Math.abs(p10.showMs - (p1.showMs + p20.showMs) / 2) <= 1, 'show time midpoint is the mean (linear)');
ok(p1.lead === 3 && p20.lead === 1, 'lead 3 → 1');
ok(T.OPTION_COUNT === 6, 'six answer buttons');
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 300; k++) {
  const q = T.makeQuestion(lv, rnd); const p = T.paramsFor(lv);
  const total = q.colors.reduce((s, c) => s + q.counts[c], 0);
  ok(total === p.n, 'total ' + total + ' vs ' + p.n);
  ok(q.colors.length === p.k && new Set(q.colors).size === p.k, 'colors');
  ok(q.counts[q.target] === q.answer && q.colors.indexOf(q.target) >= 0, 'answer');
  ok(q.colors.every(c => q.counts[c] >= 1), 'each>=1');
  // 要數的顏色是數量最多的，而且領先第二名至少 lead 顆（沒有並列）
  const second = Math.max.apply(null, q.colors.filter(c => c !== q.target).map(c => q.counts[c]));
  ok(q.answer - second >= p.lead, 'target leads by at least ' + p.lead + ' (answer ' + q.answer + ' second ' + second + ' lv' + lv + ')');
  // 六個選項：由小到大、彼此不同、連續的一排數字（相鄰差 gap）、全部 ≥ 1、包含正確答案
  ok(q.options.length === 6 && new Set(q.options).size === 6 && q.options.indexOf(q.answer) >= 0, 'options ' + q.options + ' ans ' + q.answer);
  ok(q.options.every(o => o >= 1), 'positive');
  for (let i = 1; i < q.options.length; i++) ok(q.options[i] - q.options[i - 1] === p.gap, 'consecutive options differ by exactly ' + p.gap + ': ' + q.options);
  ok(q.gap === p.gap, 'question carries the gap');
}
// 正確答案在六格裡的位置要「各格都有機會」（不能永遠是第一格或最後一格）；答案很小時下界會限制，所以用較大的答案測
{
  const seen = {};
  for (let k = 0; k < 4000; k++) { const o = T.makeOptions(40, 2, rnd); seen[o.pos] = (seen[o.pos] || 0) + 1; ok(o.options[o.pos] === 40, 'pos points at the answer'); }
  ok(Object.keys(seen).length === 6 && Object.values(seen).every(c => c > 400), 'the answer lands in every one of the 6 slots about equally: ' + JSON.stringify(seen));
  // 答案很小：數字不能小於 1（例如答案 3、間隔 4 → 只能排在 3,7,11… 或 …）
  for (let c = 1; c <= 12; c++) for (const g of [1, 2, 3, 4]) for (let k = 0; k < 50; k++) {
    const o = T.makeOptions(c, g, rnd);
    ok(o.options.length === 6 && o.options[0] >= 1 && o.options[o.pos] === c, 'small answer ' + c + ' gap ' + g + ' → ' + o.options);
  }
  // 例子：第 10 題起間隔 1，答案 15 → 例如 13 14 15 16 17 18
  const ex = T.makeOptions(15, 1, rnd); ok(ex.options.join(' ') === [10, 11, 12, 13, 14, 15].map(v => v + ex.options[0] - 10).join(' '), 'a consecutive run: ' + ex.options);
}
// 擺放：最大顆數在（保守的）托盤內放得下；每顆都露出 ≥ MIN_VIS；位置在托盤內
const W = 468, Hh = 400; let fails = 0, minVis = 1, meanVis = 0, runs = 0, oob = 0;
for (let t = 0; t < 60; t++) {
  const n = T.N_END; const lay = T.scatter(n, W, Hh);
  if (!lay) { fails++; continue; }
  runs++; const f = T.visibleFractions(lay); minVis = Math.min(minVis, Math.min.apply(null, f)); meanVis += f.reduce((a, b) => a + b, 0) / f.length;
  lay.forEach(c => { if (c.x < T.R || c.x > W - T.R || c.y < T.R || c.y > Hh - T.R) oob++; });
  ok(lay.length === n, 'candy count');
}
console.log('N=' + T.N_END + ' in 468x400: placed ' + runs + '/60, min visible ' + minVis.toFixed(2) + ', mean visible ' + (meanVis / runs).toFixed(2));
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
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
