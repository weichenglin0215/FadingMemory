// 數獨系列：引擎（js/sudoku_engine.js）＋共用畫面零件（js/sudoku_lib.js）＋六款變體（數獨4、數獨6入門／中階、數獨9入門／中階／高階）
const { game, rng, seedOf } = require('./load.js');
const SE = global.SudokuEngine;
const IDS = ['sudoku4', 'sudoku6e', 'sudoku6m', 'sudoku9e', 'sudoku9m', 'sudoku9h'];
const Gs = {}; IDS.forEach(id => { Gs[id] = game('reaction_' + id + '.js'); });
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261101); const rnd = rng(SEED);

// ── 幾何 ──
const g4 = SE.geom(2, 2), g6 = SE.geom(2, 3), g9 = SE.geom(3, 3);
ok(g4.N === 4 && g6.N === 6 && g9.N === 9 && g6.cells === 36, '盤面大小');
[g4, g6, g9].forEach(g => {
  ok(g.units.length === 3 * g.N && g.units.every(u => u.length === g.N), g.N + '：排、欄、宮各 N 個單位，每個單位 N 格');
  for (let i = 0; i < g.cells; i++) ok(g.unitsOf[i].length === 3, '每格剛好在 3 個單位裡');
});
ok(g6.boxes.every(b => new Set(b.map(i => g6.rowOf(i))).size === 2 && new Set(b.map(i => g6.colOf(i))).size === 3), '6×6 的宮是 2 排 × 3 欄');
ok(g6.peers[0].length === 5 + 5 + 2 && g9.peers[0].length === 20 && g4.peers[0].length === 7, '鄰居數（6×6 是 12、9×9 是 20、4×4 是 7）');

// ── 解題計數與造盤 ──
for (const g of [g4, g6, g9]) for (let i = 0; i < 30; i++) {
  const sol = SE.randomSolution(g, rnd);
  ok(sol.length === g.cells && g.units.every(u => new Set(u.map(c => sol[c])).size === g.N && u.every(c => sol[c] >= 1 && sol[c] <= g.N)), g.N + '×' + g.N + ' 完整盤合法');
}
ok(SE.solve(g4, new Array(16).fill(0), 100000).count === 288, '4×4 數獨一共有 288 種填法（已知的數字）');
const twoSols = new Array(16).fill(0);
ok(SE.solve(g4, twoSols, 2).count === 2, '空盤至少 2 解');
const conflict = new Array(16).fill(0); conflict[0] = 1; conflict[1] = 1;
ok(SE.solve(g4, conflict, 2).count === 0, '提示互相衝突＝0 解');

// ── 推理器：唯一、不會推出錯的數字 ──
for (const g of [g4, g6, g9]) for (let i = 0; i < 10; i++) {
  const sol = SE.randomSolution(g, rnd), gv = sol.slice();
  const order = []; for (let k = 0; k < g.cells; k++) order.push(k);
  order.sort(() => rnd() - 0.5).slice(0, Math.floor(g.cells * 0.6)).forEach(c => { gv[c] = 0; });
  const r = SE.logic(g, gv, 3);
  ok(r.grid.every((v, k) => v === 0 || v === sol[k]), g.N + '×' + g.N + '：推理器填出來的數字一定跟答案一樣（不會推錯）');
}

// ── 六款變體：規格、出題 ──
const SPEC = { sudoku4: [g4, 1, 7], sudoku6e: [g6, 1, 19], sudoku6m: [g6, 2, 0], sudoku9e: [g9, 1, 38], sudoku9m: [g9, 2, 30], sudoku9h: [g9, 3, 24] };
IDS.forEach(id => {
  const G = Gs[id], T = G.test, [g, maxLevel, floor] = SPEC[id];
  ok(G.id === id && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90 && /題/.test(G.score.format), id + '：名稱 ≤5 字、規則有重點、成績是越大越好的「題」');
  ok(T.spec.maxLevel === maxLevel && T.geom.N === g.N, id + '：規格（允許技巧等級 ' + maxLevel + '）');
  const n = id === 'sudoku9h' ? 20 : 30; let lv3 = 0;
  for (let i = 0; i < n; i++) {
    const pz = T.makePuzzle(rnd);
    const sol = pz.solution, gv = pz.givens, cnt = gv.filter(v => v).length;
    ok(cnt === pz.count, id + '：提示數 ' + cnt + '＝' + pz.count);
    ok(g.units.every(u => new Set(u.map(c => sol[c])).size === g.N), id + '：解答合法');
    ok(gv.every((v, k) => v === 0 || v === sol[k]), id + '：提示都跟解答一樣');
    ok(SE.solve(g, gv, 2).count === 1, id + '：答案唯一');
    const lg = SE.logic(g, gv, maxLevel);
    ok(lg.solved, id + '：只用等級 ≤ ' + maxLevel + ' 的技巧就解得完（不用猜）');
    ok(lg.level <= maxLevel, id + '：用到的最高技巧等級 ' + lg.level);
    if (id === 'sudoku9m') ok(pz.level >= 2, id + '：至少要用到一次等級 2（數對／鎖定）：' + pz.level);
    if (id === 'sudoku9h') { lv3 += pz.level >= 3 ? 1 : 0; ok(pz.level >= 2 || pz.okLevel === false, id + '：高階至少要用到等級 2（常見 3）：' + pz.level); }
    if (floor) ok(cnt <= floor + 3, id + '：提示數不超過 ' + (floor + 3) + '：' + cnt);
    if (id === 'sudoku6e') ok(cnt === 19, id + '：入門提示 19 個');
    if (id === 'sudoku9e') ok(cnt === 38, id + '：入門提示 38 個');
    if (id === 'sudoku6m') ok(cnt <= 13 && cnt >= 8, id + '：中階提示約 10 個：' + cnt);
  }
  if (id === 'sudoku9h') ok(lv3 >= n * 0.8, id + '：至少八成的題目用到等級 3（隱性數對／三數組／X 翼）：' + lv3 + '/' + n);
});
ok(Gs.sudoku6m.test.makePuzzle(rnd).count < Gs.sudoku6e.test.makePuzzle(rnd).count, '6×6 中階的提示比入門少');
ok(Gs.sudoku9m.test.makePuzzle(rnd).count < Gs.sudoku9e.test.makePuzzle(rnd).count, '9×9 中階的提示比入門少');

// ── 提示：只標「現在可以確定、而且玩家還沒填對」的格子 ──
{
  const g = g9, T = Gs.sudoku9e.test, pz = T.makePuzzle(rnd);
  const player = pz.givens.slice();
  let c = SE.hintCell(g, pz.givens, player, pz.solution, 1);
  ok(c >= 0 && pz.givens[c] === 0, '提示：標的是一個空格');
  // 玩家填錯一格：提示不能被錯的數字帶偏——仍然回傳「還沒填對」的格子
  const e = pz.givens.indexOf(0); player[e] = pz.solution[e] % 9 + 1;
  c = SE.hintCell(g, pz.givens, player, pz.solution, 1);
  ok(c >= 0 && player[c] !== pz.solution[c], '提示：錯的格子不算填對');
  const full = pz.solution.slice();
  ok(SE.hintCell(g, pz.givens, full, pz.solution, 1) === -1, '提示：全部填對＝沒有可提示的格子');
}

// ── 共用零件的純函式 ──
const L = Gs.sudoku4.test.lib;
const bm = L.boardMetrics(472, 9, 0.96, 0);
ok(bm.cell > 0 && bm.width <= 472 && bm.height === bm.width, '盤面尺寸：' + JSON.stringify(bm));
ok(L.boardMetrics(472, 9, 0.96, 44).width < bm.width, '有外圍線索時盤面比較窄');
{
  const grid = new Array(16).fill(0); grid[0] = 1; grid[1] = 1; grid[5] = 2;
  const cf = L.conflictsOf(g4, grid);
  ok(cf[0] && cf[1] && !cf[5], '同一排的兩個 1 都變紅、別的格子不變紅');
  ok(L.digitCounts(g4, grid)[1] === 2 && L.digitCounts(g4, grid)[2] === 1, '數字出現次數');
  const sol = SE.randomSolution(g4, rnd);
  ok(L.isSolved(g4, sol, sol) && !L.isSolved(g4, sol.map((v, i) => i === 3 ? 0 : v), sol), '全填對才算解開');
}
ok(L.MAX_LEVEL === 90 && L.HINTS >= 0, '常數');
ok(Gs.sudoku4.test.rating(40) !== Gs.sudoku4.test.rating(1), '評語依成績不同');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
