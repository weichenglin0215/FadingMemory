// 夾心數獨（sandwich）：夾心數字的算法、線的可行性、解的個數、出題（唯一）、標紅
const { game, rng, seedOf } = require('./load.js');
const SE = global.SudokuEngine;
const G = game('reaction_sandwich.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261105); const rnd = rng(SEED);

ok(G.id === 'sandwich' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 夾心數字
ok(T.sandwichOf([3, 1, 5, 2, 6, 4], 6).sum === 5 + 2 && T.sandwichOf([3, 1, 5, 2, 6, 4], 6).gap === 2, '1 在 6 前面：夾著 5、2');
ok(T.sandwichOf([3, 6, 5, 2, 1, 4], 6).sum === 5 + 2, '6 在 1 前面也一樣');
ok(T.sandwichOf([1, 6, 2, 3, 4, 5], 6).sum === 0 && T.sandwichOf([1, 6, 2, 3, 4, 5], 6).gap === 0, '緊貼＝0');
ok(T.sandwichOf([1, 0, 2, 0, 6, 4], 6).empty === 2 && T.sandwichOf([1, 0, 2, 0, 6, 4], 6).sum === 2, '有空格時：已填的加總、空格數');
ok(T.sandwichOf([0, 0, 2, 0, 6, 4], 6).both === false, '1 還沒放：不算');
// 線的可行性
ok(T.lineFeasible([1, 0, 0, 0, 6, 0], 6, 9) === true, '1 _ _ _ 6：夾 3 格，最小 2+3+4＝9，最大 3+4+5＝12，夾心 9 可行');
ok(T.lineFeasible([1, 0, 0, 0, 6, 0], 6, 8) === false, '夾心 8 湊不出（最小 9）');
ok(T.lineFeasible([1, 0, 0, 0, 6, 0], 6, 13) === false, '夾心 13 湊不出（最大 12）');
ok(T.lineFeasible([1, 4, 5, 0, 6, 0], 6, 11) === true && T.lineFeasible([1, 4, 5, 0, 6, 0], 6, 12) === true && T.lineFeasible([1, 4, 5, 0, 6, 0], 6, 9) === false && T.lineFeasible([1, 4, 5, 0, 6, 0], 6, 14) === false, '已填 4、5（和 9），還有一格要填 2 或 3：夾心只能是 11 或 12');
ok(T.lineFeasible([1, 2, 3, 6, 4, 5], 6, 5) === true && T.lineFeasible([1, 2, 3, 6, 4, 5], 6, 4) === false, '填滿的線：加總要剛好');
ok(T.lineFeasible([3, 4, 2, 5, 0, 0], 6, 99) === true, '1 和 6 還沒放：先不判斷');
// 外圍線索與完整盤
{
  const g = T.geoOf(T.STAGES[1]), sol = SE.randomSolution(g, rnd), cl = T.cluesOf(g, sol);
  ok(cl.rows.length === 6 && cl.cols.length === 6 && cl.rows.every(v => v >= 0 && v <= 2 + 3 + 4 + 5), '外圍數字範圍');
  const row0 = sol.slice(0, 6);
  ok(cl.rows[0] === T.sandwichOf(row0, 6).sum, '第 1 排的夾心數字');
  ok(T.badSandwichCells(g, sol, cl).every(b => !b), '完整正確的盤面沒有標紅的格子');
  const wrong = sol.slice(); const rr = 0; const a = row0.indexOf(1), b = row0.indexOf(6), lo = Math.min(a, b), hi = Math.max(a, b);
  if (hi - lo >= 3) { const t = wrong[lo + 1]; wrong[lo + 1] = wrong[lo + 2]; wrong[lo + 2] = t; } else { wrong[lo + 1] = wrong[lo + 1]; }
  const badCells = T.badSandwichCells(g, wrong, { rows: cl.rows.map(v => v + 100), cols: cl.cols.map(v => v + 100) });
  ok(badCells.some(Boolean), '夾心數字對不上時，夾在中間的格子標紅');
}
// 難度曲線
T.STAGES.forEach((st, i) => {
  const from = i === 0 ? 1 : T.STAGES[i - 1].to + 1;
  ok(T.stageOf(from).st.n === st.n, '階段 ' + st.n);
  ok(T.givensFor(from) === st.givens[0], st.n + '：階段第一關提示 ' + st.givens[0]);
  if (from + st.len - 1 <= st.to) ok(T.givensFor(from + st.len - 1) === st.givens[1], st.n + '：走完提示 ' + st.givens[1]);
});
// 出題：答案唯一（算夾心的回溯器數得出 1 個解）
for (const lv of [1, 3, 5, 6, 10, 16, 17, 30]) for (let i = 0; i < (lv >= 17 ? 3 : 8); i++) {
  const p = T.makePuzzle(lv, rnd), g = T.geoOf(T.stageOf(lv).st);
  ok(p.givens.every((v, k) => v === 0 || v === p.solution[k]), '第 ' + lv + ' 關：提示對');
  ok(T.countSolutions(g, p.givens, p.clues, 2, 5000000) === 1, '第 ' + lv + ' 關：加上夾心數字，答案唯一');
  ok(g.units.every(u => new Set(u.map(c => p.solution[c])).size === g.N), '第 ' + lv + ' 關：解答合法');
  const cnt = p.givens.filter(v => v).length;
  ok(cnt === p.count && cnt <= Math.max(p.want + 6, T.stageOf(lv).st.givens[1] + 6), '第 ' + lv + ' 關：提示 ' + cnt + '，目標 ' + p.want);
  ok(JSON.stringify(p.clues) === JSON.stringify(T.cluesOf(g, p.solution)), '第 ' + lv + ' 關：外圍數字就是答案算出來的');
}
// 夾心數字確實有用：拿掉夾心數字，同樣的提示通常就不唯一了
{
  const lv = 16, p = T.makePuzzle(lv, rnd), g = T.geoOf(T.stageOf(lv).st);
  const noClue = SE.solve(g, p.givens, 2).count;
  ok(noClue >= 2, '6×6：只有這些提示、沒有夾心數字，答案不唯一（夾心數字是必要線索）：' + noClue);
}
ok(T.rating(30) !== T.rating(1) && T.MAX_LEVEL === 90, '評語與上限');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
