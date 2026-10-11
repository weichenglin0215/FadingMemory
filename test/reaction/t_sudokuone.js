// 數獨猜一格：V1.24 改成標準數獨——前 6 關 4×4（4 個 2×2 的宮、數字 1～4），第 7 關起 9×9（9 個 3×3 的宮、數字 1～9）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sudokuone.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261027); const rnd = rng(SEED);
const GEOS = [T.GEO4, T.GEO9];

// ── 階段與難度曲線 ──
ok(T.FOUR_LEVELS === 6 && T.stageOf(1).g === T.GEO4 && T.stageOf(6).g === T.GEO4 && T.stageOf(7).g === T.GEO9 && T.stageOf(60).g === T.GEO9, '第 1～6 關 4×4、第 7 關起 9×9');
ok(T.stageOf(7).idx === 1 && T.stageOf(7 + T.RAMP9 - 1).idx === T.RAMP9, '9×9 階段的關卡編號從第 7 關起算 1');
ok(T.givensFor(1) === 11 && T.givensFor(6) === 5 && T.givensFor(7) === 34 && T.givensFor(7 + T.RAMP9 - 1) === 12 && T.givensFor(60) === 12, '提示數：4×4 11 → 5、9×9 34 → 12');
ok(T.ansMs(1) === 20000 && T.ansMs(6) === 14000 && T.ansMs(7) === 40000 && T.ansMs(7 + T.RAMP9 - 1) === 24000, '限時：4×4 20 → 14 秒、9×9 40 → 24 秒');
for (let l = 2; l <= 60; l++) {
  if (l === T.FOUR_LEVELS + 1) continue;       // 換成 9×9 的那一關是新階段，從頭開始
  ok(T.givensFor(l) <= T.givensFor(l - 1) && T.ansMs(l) <= T.ansMs(l - 1) && T.deepP(l) >= T.deepP(l - 1) - 1e-12, '單調 ' + l);
}
ok(T.givensFor(7) > T.givensFor(1) && T.ansMs(7) > T.ansMs(1), '9×9 比 4×4 格子多、提示多、時間也給得比較長');

// ── 幾何：4×4 與 9×9 ──
ok(T.GEO4.N === 4 && T.GEO4.B === 2 && T.GEO4.cells === 16 && T.GEO9.N === 9 && T.GEO9.B === 3 && T.GEO9.cells === 81, '盤面大小');
for (const g of GEOS) {
  ok(g.UNITS.length === 3 * g.N && g.UNITS.every(u => u.length === g.N), g.N + '×' + g.N + '：每個單位（排、欄、宮）剛好 ' + g.N + ' 格，共 ' + 3 * g.N + ' 個單位');
  ok(g.BLOCKS.length === g.N && g.BLOCKS.every(b => b.length === g.N), g.N + '×' + g.N + '：' + g.N + ' 個宮各 ' + g.N + ' 格');
  g.PEERS.forEach((p, i) => {
    const r = g.rowOf(i), c = g.colOf(i), exp = new Set();
    for (let j = 0; j < g.cells; j++) if (j !== i && (g.rowOf(j) === r || g.colOf(j) === c || g.blockOf(j) === g.blockOf(i))) exp.add(j);
    ok(p.length === exp.size && p.length === (g.N === 4 ? 7 : 20), '鄰居數（4×4 是 7、9×9 是 20）：' + p.length);
  });
  // 每一格剛好屬於一排、一欄、一宮（三種單位各出現一次）
  for (let i = 0; i < g.cells; i++) ok(g.UNITS.filter(u => u.indexOf(i) >= 0).length === 3, '每格剛好在 3 個單位裡');
}
ok(T.GEO4.blockOf(0) === 0 && T.GEO4.blockOf(3) === 1 && T.GEO4.blockOf(12) === 2 && T.GEO4.blockOf(15) === 3 && T.GEO4.blockOf(5) === 0 && T.GEO4.blockOf(10) === 3, '4×4 宮編號');
ok(T.GEO9.blockOf(0) === 0 && T.GEO9.blockOf(8) === 2 && T.GEO9.blockOf(40) === 4 && T.GEO9.blockOf(80) === 8 && T.GEO9.blockOf(27) === 3 && T.GEO9.blockOf(30) === 4, '9×9 宮編號');

// ── 解答合法：每排、每欄、每宮 1～N 各一個 ──
function validSolution(g, sol) { return sol.length === g.cells && g.UNITS.every(u => new Set(u.map(i => sol[i])).size === g.N && u.every(i => sol[i] >= 1 && sol[i] <= g.N)); }
for (const g of GEOS) for (let i = 0; i < 400; i++) ok(validSolution(g, T.makeSolution(g, rnd)), g.N + '×' + g.N + ' 解答合法');
// 解答要夠多樣（不是每次同一個盤面）
for (const g of GEOS) { const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(T.makeSolution(g, rnd).join('')); ok(seen.size >= (g.N === 4 ? 60 : 190), g.N + '×' + g.N + ' 解答有變化：' + seen.size + ' 種'); }

// ── 推理器合理：任何部分提示盤面，推出來的數字都跟解答一致（不會推錯） ──
for (const g of GEOS) for (let i = 0; i < 300; i++) {
  const sol = T.makeSolution(g, rnd), gv = sol.map(v => rnd() < 0.4 ? v : 0);
  const r = T.deduce(g, gv, null);
  r.grid.forEach((v, k) => { if (v) ok(v === sol[k], '推理沒有推錯 ' + k); });
  gv.forEach((v, k) => { if (v) ok(r.grid[k] === v, '提示不被改'); });
}
// 只剩目標一格是空的 → 一定推得出來；全部是空的 → 推不出來
for (const g of GEOS) { const sol = T.makeSolution(g, rnd), gv = sol.slice(); gv[3] = 0; const r = T.deduce(g, gv, 3); ok(r.solved && r.value === sol[3], '只缺一格一定推得出'); ok(!T.deduce(g, sol.map(() => 0), 3).solved, '全空推不出來'); }

// ── 整題驗證：每個關卡 ──
const dist = { 4: {}, 9: {} };
for (let i = 0; i < 900; i++) {
  const lv = 1 + (i % 60), q = T.makePuzzle(lv, rnd), g = q.g;
  ok(g === T.stageOf(lv).g && q.N === g.N, '題目的盤面大小跟關卡一致 lv' + lv);
  ok(validSolution(g, q.solution), '題目的解答合法');
  ok(q.givens[q.target] === 0 && q.answer === q.solution[q.target], '目標那格是空的');
  q.givens.forEach((v, k) => { if (v) ok(v === q.solution[k], '提示等於解答'); });
  ok(q.count === q.givens.filter(Boolean).length, '提示數正確');
  const d = T.deduce(g, q.givens, q.target);
  ok(d.solved && d.value === q.answer, '推理得到唯一答案：lv' + lv);
  ok(q.count <= T.givensFor(lv) + 6 && q.count >= 3, '提示數接近目標：lv' + lv + ' 想要 ' + T.givensFor(lv) + ' 實際 ' + q.count);
  ok(q.answer >= 1 && q.answer <= g.N, '答案在 1～N');
  dist[g.N][q.steps] = (dist[g.N][q.steps] || 0) + 1;
}
ok(Object.keys(dist[9]).length >= 2, '9×9 推理輪數有變化：' + JSON.stringify(dist[9]));
// 難度：9×9 後期的題目提示比前期少、需要多輪推理的比例較高
function avg(lv, f, n) { let s = 0; n = n || 300; for (let i = 0; i < n; i++) s += f(T.makePuzzle(lv, rnd)); return s / n; }
ok(avg(1, q => q.count) > avg(6, q => q.count) + 3, '4×4：提示數隨關卡減少');
ok(avg(7, q => q.count) > avg(30, q => q.count) + 15, '9×9：提示數隨關卡減少');
ok(avg(24, q => q.steps >= 2 ? 1 : 0) > avg(7, q => q.steps >= 2 ? 1 : 0) + 0.05, '9×9：需要多輪推理的比例隨關卡上升');
// 答案各個數字都會出現
{ const s4 = new Set(), s9 = new Set(); for (let i = 0; i < 400; i++) { s4.add(T.makePuzzle(3, rnd).answer); s9.add(T.makePuzzle(12, rnd).answer); } ok(s4.size === 4 && s9.size === 9, '答案分布 4×4：' + s4.size + '、9×9：' + s9.size); }
// 目標格在盤面各處都會出現
{ const t9 = new Set(); for (let i = 0; i < 600; i++) t9.add(T.makePuzzle(12, rnd).target); ok(t9.size > 60, '9×9 目標格分布 ' + t9.size + ' 種位置'); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
