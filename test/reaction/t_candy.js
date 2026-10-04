const { game } = require('./load.js');
const G = game('reaction_candy.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const p1 = T.paramsFor(1), p20 = T.paramsFor(20), p10 = T.paramsFor(10.5);
console.log(JSON.stringify(p1), JSON.stringify(p10), JSON.stringify(p20));
ok(T.paramsFor(100).n === p20.n && T.paramsFor(100).k === p20.k && T.paramsFor(100).showMs === p20.showMs && T.paramsFor(100).gap === p20.gap, 'clamps after LEVEL_RAMP');
ok(Math.abs(p10.n - (p1.n + p20.n) / 2) <= 1 && Math.abs(p10.showMs - (p1.showMs + p20.showMs) / 2) <= 1, 'midpoint is the mean (linear)');
for (let lv = 1; lv <= 30; lv++) for (let k = 0; k < 300; k++) {
  const q = T.makeQuestion(lv); const p = T.paramsFor(lv);
  const total = q.colors.reduce((s, c) => s + q.counts[c], 0);
  ok(total === p.n, 'total ' + total + ' vs ' + p.n);
  ok(q.colors.length === p.k && new Set(q.colors).size === p.k, 'colors');
  ok(q.counts[q.target] === q.answer && q.answer >= 2, 'answer');
  ok(q.colors.every(c => q.counts[c] >= 1), 'each>=1');
  ok(q.options.length === 4 && new Set(q.options).size === 4 && q.options.indexOf(q.answer) >= 0, 'options ' + q.options + ' ans ' + q.answer);
  ok(q.options.every(o => o >= 1), 'positive');
  const dmin = Math.min.apply(null, q.options.filter(o => o !== q.answer).map(o => Math.abs(o - q.answer)));
  ok(dmin >= p.gap && (dmin - p.gap) % 1 === 0, 'gap multiples');
}
// 位置不重疊
let ov = 0; for (let t = 0; t < 200; t++) { const pos = T.scatter(40, 468, 430); for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) if (Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < 2 * T.R) ov++; }
console.log('overlaps in 200 layouts of 40 candies:', ov);
ok(ov === 0, 'no overlap');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
