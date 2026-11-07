// 數獨猜一格：V1.24 改成標準數獨——4×4（4 個 2×2 的宮、數字 1～4）→ 9×9（9 個 3×3 的宮、數字 1～9）；V1.47 中間加一個 6×6（6 個 3×2 的宮、數字 1～6）、
// 沒有數字的格子一律淡黃色底、點空格可以「記憶」（到第 MEMO_UNTIL 關為止）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sudokuone.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261027); const rnd = rng(SEED);
const GEOS = [T.GEO4, T.GEO6, T.GEO9];

// ── 階段與難度曲線 ──
// 玩家自己調過 FOUR_LEVELS／GIVENS4／GIVENS9／ANS4_S／ANS9_S：測試跟著參數走
// 三個階段：第 1～F 關 4×4 → 接著 S 關 6×6（V1.47）→ 再之後 9×9（S＝0 時沒有 6×6）
const F = T.FOUR_LEVELS, S = T.SIX_LEVELS, N6 = F + S, A6 = S > 0;
ok(T.stageOf(1).g === T.GEO4 && T.stageOf(F).g === T.GEO4 && T.stageOf(N6 + 1).g === T.GEO9 && T.stageOf(90).g === T.GEO9, '第 1～' + F + ' 關 4×4、第 ' + (N6 + 1) + ' 關起 9×9');
ok(S > 0, 'V1.47：6×6 階段至少有一關（SIX_LEVELS＝' + S + '）');
if (A6) ok(T.stageOf(F + 1).g === T.GEO6 && T.stageOf(N6).g === T.GEO6, '第 ' + (F + 1) + '～' + N6 + ' 關 6×6');
ok(T.stageOf(N6 + 1).idx === 1 && T.stageOf(N6 + T.RAMP9).idx === T.RAMP9, '9×9 階段的關卡編號從第 ' + (N6 + 1) + ' 關起算 1');
if (A6) ok(T.stageOf(F + 1).idx === 1 && T.stageOf(N6).idx === S, '6×6 階段的關卡編號從 1 到 ' + S);
ok(T.givensFor(1) === T.GIVENS4[0] && T.givensFor(F) === T.GIVENS4[1] && T.givensFor(N6 + 1) === T.GIVENS9[0] && T.givensFor(N6 + T.RAMP9) === T.GIVENS9[1] && T.givensFor(90) === T.GIVENS9[1], '提示數：4×4 ' + T.GIVENS4 + '、9×9 ' + T.GIVENS9);
if (A6) ok(T.givensFor(F + 1) === T.GIVENS6[0] && T.givensFor(N6) === T.GIVENS6[1], '提示數：6×6 ' + T.GIVENS6);
ok(T.ansMs(1) === T.ANS4_S[0] * 1000 && T.ansMs(F) === T.ANS4_S[1] * 1000 && T.ansMs(N6 + 1) === T.ANS9_S[0] * 1000 && T.ansMs(N6 + T.RAMP9) === T.ANS9_S[1] * 1000, '限時：4×4 ' + T.ANS4_S + ' 秒、9×9 ' + T.ANS9_S + ' 秒');
if (A6) ok(T.ansMs(F + 1) === T.ANS6_S[0] * 1000 && T.ansMs(N6) === T.ANS6_S[1] * 1000, '限時：6×6 ' + T.ANS6_S + ' 秒');
for (let l = 2; l <= 90; l++) {
  if (l === F + 1 || l === N6 + 1) continue;       // 換成 6×6、9×9 的那一關是新階段，從頭開始
  const asc = (l <= F ? T.ANS4_S : l <= N6 ? T.ANS6_S : T.ANS9_S);
  ok(T.givensFor(l) <= T.givensFor(l - 1) && (asc[1] >= asc[0] ? T.ansMs(l) >= T.ansMs(l - 1) : T.ansMs(l) <= T.ansMs(l - 1)) && T.deepP(l) >= T.deepP(l - 1) - 1e-12, '單調 ' + l);
}
ok(T.givensFor(N6 + 1) > T.givensFor(1), '9×9 比 4×4 格子多、提示多');
if (A6) ok(T.givensFor(F + 1) > T.givensFor(1) && T.givensFor(N6 + 1) > T.givensFor(F + 1), '難度循序漸進：4×4 → 6×6 → 9×9，每個階段一開始的提示數越來越多（格子越來越多）');
// V1.47：「記憶」功能只到第 MEMO_UNTIL 關
ok(T.memoAllowed(1) && T.memoAllowed(T.MEMO_UNTIL) && !T.memoAllowed(T.MEMO_UNTIL + 1) && !T.memoAllowed(90), '記憶功能：第 1～' + T.MEMO_UNTIL + ' 關有，之後沒有');

// ── 幾何：4×4 與 9×9 ──
ok(T.GEO4.N === 4 && T.GEO4.B === 2 && T.GEO4.cells === 16 && T.GEO9.N === 9 && T.GEO9.B === 3 && T.GEO9.cells === 81, '盤面大小');
ok(T.GEO6.N === 6 && T.GEO6.cells === 36 && T.GEO6.BR === 2 && T.GEO6.BC === 3, '6×6：宮高 2 排、寬 3 欄（3×2 的宮）');
ok(T.makeGeom(3, 2).N === 6 && T.makeGeom(3).BC === 3 && T.makeGeom(2).BR === 2, 'makeGeom：只給一個數字＝正方形的宮');
for (const g of GEOS) {
  ok(g.UNITS.length === 3 * g.N && g.UNITS.every(u => u.length === g.N), g.N + '×' + g.N + '：每個單位（排、欄、宮）剛好 ' + g.N + ' 格，共 ' + 3 * g.N + ' 個單位');
  ok(g.BLOCKS.length === g.N && g.BLOCKS.every(b => b.length === g.N), g.N + '×' + g.N + '：' + g.N + ' 個宮各 ' + g.N + ' 格');
  g.PEERS.forEach((p, i) => {
    const r = g.rowOf(i), c = g.colOf(i), exp = new Set();
    for (let j = 0; j < g.cells; j++) if (j !== i && (g.rowOf(j) === r || g.colOf(j) === c || g.blockOf(j) === g.blockOf(i))) exp.add(j);
    ok(p.length === exp.size && p.length === (g.N === 4 ? 7 : g.N === 6 ? 12 : 20), '鄰居數（4×4 是 7、6×6 是 12、9×9 是 20）：' + p.length);
  });
  // 每一格剛好屬於一排、一欄、一宮（三種單位各出現一次）
  for (let i = 0; i < g.cells; i++) ok(g.UNITS.filter(u => u.indexOf(i) >= 0).length === 3, '每格剛好在 3 個單位裡');
}
ok(T.GEO4.blockOf(0) === 0 && T.GEO4.blockOf(3) === 1 && T.GEO4.blockOf(12) === 2 && T.GEO4.blockOf(15) === 3 && T.GEO4.blockOf(5) === 0 && T.GEO4.blockOf(10) === 3, '4×4 宮編號');
// 6×6：宮由左到右、由上到下編號——第 0 排、第 0～2 欄是宮 0，第 3～5 欄是宮 1；第 2～3 排是宮 2、3；第 4～5 排是宮 4、5
ok(T.GEO6.blockOf(0) === 0 && T.GEO6.blockOf(2) === 0 && T.GEO6.blockOf(3) === 1 && T.GEO6.blockOf(5) === 1 && T.GEO6.blockOf(6) === 0 && T.GEO6.blockOf(12) === 2 && T.GEO6.blockOf(15) === 3 && T.GEO6.blockOf(24) === 4 && T.GEO6.blockOf(35) === 5 && T.GEO6.BLOCKS.every(b => new Set(b.map(i => T.GEO6.rowOf(i))).size === 2 && new Set(b.map(i => T.GEO6.colOf(i))).size === 3), '6×6 宮編號與形狀（每個宮 2 排 × 3 欄）');
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
const dist = { 4: {}, 6: {}, 9: {} };
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
ok(avg(1, q => q.count) > avg(F, q => q.count) + 3, '4×4：提示數隨關卡減少');
if (A6) ok(avg(F + 1, q => q.count) > avg(N6, q => q.count) + 6, '6×6：提示數隨關卡減少');
ok(avg(N6 + 1, q => q.count) > avg(N6 + T.RAMP9, q => q.count) + 15, '9×9：提示數隨關卡減少');
ok(avg(N6 + T.RAMP9, q => q.steps >= 2 ? 1 : 0) > avg(N6 + 1, q => q.steps >= 2 ? 1 : 0) + 0.05, '9×9：需要多輪推理的比例隨關卡上升');
// 答案各個數字都會出現
{ const s4 = new Set(), s9 = new Set(); for (let i = 0; i < 400; i++) { s4.add(T.makePuzzle(3, rnd).answer); s9.add(T.makePuzzle(N6 + 3, rnd).answer); } ok(s4.size === 4 && s9.size === 9, '答案分布 4×4：' + s4.size + '、9×9：' + s9.size); }
// 目標格在盤面各處都會出現
{ const t9 = new Set(); for (let i = 0; i < 600; i++) t9.add(T.makePuzzle(N6 + 3, rnd).target); ok(t9.size > 60, '9×9 目標格分布 ' + t9.size + ' 種位置'); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
// V1.29：盤面寬度 ＝ 遊戲畫面寬度的 96%；答錯時停 6 秒才結算
{ for (const W of [360, 414, 472, 500]) for (const N of [4, 6, 9]) { const m = T.boardMetrics(W, N);
    ok(Math.abs(m.width / W - 0.96) < 0.005 && m.width === Math.round(W * 0.96), 'W=' + W + ' 盤面寬 ' + m.width + '（96%）');
    ok(Math.abs(m.cell * N + 4 - m.width) < 1e-9 && Math.abs(m.height - m.width) < 1e-9, N + '×' + N + '：每格 ' + m.cell.toFixed(2) + 'px，盤面是正方形'); }
  ok(T.BOARD_FRAC === 0.96 && T.REVEAL_FAIL_MS === 6000, '寬度 96%、答錯停 6 秒');
  const m4 = T.boardMetrics(472, 4), m9 = T.boardMetrics(472, 9); ok(m4.width >= 450 && m9.width >= 450 && m4.cell > 88 && m9.cell > 42, '比原本（4×4 每格 88、9×9 每格 42）大');
  // 盤面 + 提示字 + 數字鍵放得進畫面高度（舞台高度至少 600 以上）：9×9 盤面 453 + 提示 40 + 數字鍵 2 排（5 欄）62×2+8
  ok(10 + m9.height + 28 + (62 * 2 + 8) + 8 <= 640, '9×9 放得進 640 高：' + (10 + m9.height + 28 + 132 + 8)); ok(10 + m4.height + 36 + 84 + 12 <= 640, '4×4 放得進 640 高');
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_sudokuone.js'), 'utf8');
  ok(src.indexOf('delay: REVEAL_FAIL_MS') > 0 && src.indexOf('delay: 2500') < 0, '答錯／逾時：停 REVEAL_FAIL_MS 才結算'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
