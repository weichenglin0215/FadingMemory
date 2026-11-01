// 疊箱子（boxstack）：合法擺法、數解（對照暴力）、出題唯一＋一定有固定的箱子＋照大小排排不對（使用者的意見）、違規偵測、階段
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_boxstack.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261106); const rnd = rng(SEED);

ok(G.id === 'boxstack' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
const legal = (r, c, g) => T.violations(r, c, g).length === 0 && g.every(Boolean) && new Set(g).size === r * c;
// 完全沒有固定的箱子時，擺法數＝標準楊表的個數（3×3 是 42、2×3 是 5、3×4 是 462）
ok(T.countFill(2, 3, new Array(6).fill(0), 1e9) === 5 && T.countFill(3, 3, new Array(9).fill(0), 1e9) === 42 && T.countFill(3, 4, new Array(12).fill(0), 1e9) === 462, '空架子的擺法數＝楊表個數');
// 偷懶的填法
ok(T.naiveFill(2, 2, [0, 0, 0, 0], 'row').join() === '1,2,3,4' && T.naiveFill(2, 2, [0, 0, 0, 0], 'col').join() === '1,3,2,4', '照大小一排一排／一直行一直行');
// 違規：上面比下面重、左邊比右邊重
ok(T.violations(2, 2, [1, 3, 2, 4]).length === 0 && T.violations(2, 2, [2, 1, 3, 4]).length === 1 && T.violations(2, 2, [1, 2, 0, 0]).length === 0, '違規偵測（空格不算）');
for (let k = 0; k < 30; k++) { const g = T.randomStack(3, 4, rnd); ok(legal(3, 4, g), '隨機擺法合法'); }
// 出題
const hist = {};
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < (lv >= 25 ? 6 : 12); k++) {
  const p = T.makePuzzle(lv, rnd), st = T.stageOf(lv).st, N = p.r * p.c;
  ok(p.r === st.r && p.c === st.c, '第 ' + lv + ' 關：' + st.r + '×' + st.c);
  ok(legal(p.r, p.c, p.sol), '答案合法');
  ok(p.given.every((v, i) => !v || v === p.sol[i]), '固定的箱子跟答案一致');
  const ng = p.given.filter(Boolean).length; hist[st.r + 'x' + st.c] = (hist[st.r + 'x' + st.c] || []).concat(ng);
  ok(ng >= 1 && ng < N - 2, '第 ' + lv + ' 關：一定有固定的箱子，也留了空格（' + ng + '）');
  ok(T.countFill(p.r, p.c, p.given, 2) === 1, '第 ' + lv + ' 關：答案唯一');
  ok(!T.naiveWorks(p.r, p.c, p.given, p.sol), '第 ' + lv + ' 關：照大小一排一排、一直行一直行、照斜線填都不對');
}
Object.keys(hist).forEach(k => { const a = hist[k]; console.log('  ' + k + ' 固定箱數 平均 ' + (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) + '（' + Math.min(...a) + '～' + Math.max(...a) + '）'); });
ok(T.stageOf(1).st.r === 3 && T.stageOf(9).st.c === 4 && T.stageOf(17).st.r === 4 && T.stageOf(25).st.c === 5, '階段');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
