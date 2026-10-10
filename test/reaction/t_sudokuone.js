const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sudokuone.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261027); const rnd = rng(SEED);

ok(T.givensFor(1) === 26 && T.givensFor(T.RAMP_LEVELS) === 9 && T.givensFor(60) === 9, '提示數 26 → 9');
ok(T.ansMs(1) === 30000 && T.ansMs(T.RAMP_LEVELS) === 18000, '限時 30 → 18 秒');
for (let l = 2; l <= 60; l++) ok(T.givensFor(l) <= T.givensFor(l - 1) && T.ansMs(l) <= T.ansMs(l - 1) && T.deepP(l) >= T.deepP(l - 1) - 1e-12, '單調 ' + l);
// 幾何：36 格、每格鄰居＝同橫排(5)＋同直排(5)＋同宮(8) 去掉重複
ok(T.PEERS.length === 36 && T.BLOCKS.every(b => b.length === 9), '4 宮各 9 格');
T.PEERS.forEach((p, i) => { const r = T.rowOf(i), c = T.colOf(i); const exp = new Set(); for (let j = 0; j < 36; j++) if (j !== i && (T.rowOf(j) === r || T.colOf(j) === c || T.blockOf(j) === T.blockOf(i))) exp.add(j); ok(p.length === exp.size, '鄰居數 ' + i + '：' + p.length); });
ok(T.blockOf(0) === 0 && T.blockOf(5) === 1 && T.blockOf(18) === 2 && T.blockOf(35) === 3 && T.blockOf(14) === 0 && T.blockOf(20) === 2, '宮編號');
// 解答合法：每排、每直排不重複；每宮 1～9 各一個
function validSolution(g) {
  for (let r = 0; r < 6; r++) { const s = new Set(); for (let c = 0; c < 6; c++) s.add(g[r * 6 + c]); if (s.size !== 6) return false; }
  for (let c = 0; c < 6; c++) { const s = new Set(); for (let r = 0; r < 6; r++) s.add(g[r * 6 + c]); if (s.size !== 6) return false; }
  return T.BLOCKS.every(b => new Set(b.map(i => g[i])).size === 9 && b.every(i => g[i] >= 1 && g[i] <= 9));
}
for (let i = 0; i < 300; i++) ok(validSolution(T.makeSolution(rnd)), '解答合法');
// 推理器合理：任何部分提示盤面，推出來的數字都跟解答一致（不會推錯）
for (let i = 0; i < 400; i++) {
  const sol = T.makeSolution(rnd), g = sol.map(v => rnd() < 0.35 ? v : 0);
  const r = T.deduce(g, null);
  r.grid.forEach((v, k) => { if (v) ok(v === sol[k], '推理沒有推錯 ' + k); });
  g.forEach((v, k) => { if (v) ok(r.grid[k] === v, '提示不被改'); });
}
// 整題驗證：每個關卡
const dist = { steps: {}, n: 0 };
for (let i = 0; i < 1200; i++) {
  const lv = 1 + (i % 60), q = T.makePuzzle(lv, rnd);
  ok(validSolution(q.solution), '題目的解答合法');
  ok(q.givens[q.target] === 0 && q.answer === q.solution[q.target], '目標那格是空的');
  q.givens.forEach((v, k) => { if (v) ok(v === q.solution[k], '提示等於解答'); });
  ok(q.count === q.givens.filter(Boolean).length, '提示數正確');
  const d = T.deduce(q.givens, q.target);
  ok(d.solved && d.value === q.answer, '推理得到唯一答案：lv' + lv);
  ok(q.count >= 8 && q.count <= 35, '提示數範圍 ' + q.count);
  ok(q.count <= T.givensFor(lv) + 6, '提示數接近目標：lv' + lv + ' 想要 ' + T.givensFor(lv) + ' 實際 ' + q.count);
  dist.steps[q.steps] = (dist.steps[q.steps] || 0) + 1;
}
ok(Object.keys(dist.steps).length >= 2, '推理輪數有變化：' + JSON.stringify(dist.steps));
// 難度：後期的題目提示比前期少、需要多輪推理的比例較高
function avg(lv, f) { let s = 0; const n = 400; for (let i = 0; i < n; i++) s += f(T.makePuzzle(lv, rnd)); return s / n; }
ok(avg(1, q => q.count) > avg(25, q => q.count) + 8, '提示數隨關卡減少');
ok(avg(15, q => q.steps >= 2 ? 1 : 0) > avg(1, q => q.steps >= 2 ? 1 : 0) + 0.1, '需要多輪推理的比例隨關卡上升（第 1 關約 4％，第 15 關約 35％；n=400 時差距平均 0.3、標準差約 0.03，門檻 0.1 約 6 個標準差）');
// 答案各個數字都會出現
const ansSeen = new Set(); for (let i = 0; i < 400; i++) ansSeen.add(T.makePuzzle(10, rnd).answer); ok(ansSeen.size >= 8, '答案分布 ' + ansSeen.size);
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
