// 形色不相鄰（shapegrid）：相鄰規則、3×3 的合格擺法數（72）、出題（先放好的跟一種合格擺法一致、數量照曲線）、求解器、違規說明
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_shapegrid.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261107); const rnd = rng(SEED);

ok(G.id === 'shapegrid' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
const valid = (g, n) => g.every(p => p >= 0) && new Set(g).size === n * n && T.violations(g, n).length === 0;
ok(T.canTouch(0, 4, 3) && !T.canTouch(0, 1, 3) && !T.canTouch(0, 3, 3), '相鄰規則：形狀、顏色都不同才可以');
ok(T.neighbors(4, 3).sort().join() === '1,3,5,7' && T.neighbors(0, 3).sort().join() === '1,3', '鄰居');
// 3×3 合格擺法正好 72 種（跟 note/原創篇實驗/exp_impl8.cjs ③ 一致）：數法＝每找到一個就把它擋掉再找
{
  let count = 0; const n = 3, all = [];
  (function rec(k, g, used) {
    if (k === 9) { count++; return; }
    for (let p = 0; p < 9; p++) if (!used[p] && T.neighbors(k, n).every(q => g[q] < 0 || T.canTouch(p, g[q], n))) { used[p] = 1; g[k] = p; rec(k + 1, g, used); g[k] = -1; used[p] = 0; }
  })(0, new Array(9).fill(-1), []);
  ok(count === 72, '3×3 合格擺法 72 種（' + count + '）');
}
// 違規說明
{
  const g = [0, 1, -1, -1, -1, -1, -1, -1, -1];        /* 圓形紅、圓形藍 相鄰：形狀一樣 */
  const v = T.violations(g, 3); ok(v.length === 1 && v[0].why === 'shape' && T.whyText(v[0], g, 3) === '兩個都是圓形，不能相鄰', '形狀一樣');
  const g2 = [0, 3, -1, -1, -1, -1, -1, -1, -1];       /* 圓形紅、三角形紅：顏色一樣 */
  const v2 = T.violations(g2, 3); ok(v2.length === 1 && v2[0].why === 'color' && T.whyText(v2[0], g2, 3) === '兩個都是紅色，不能相鄰', '顏色一樣');
  ok(T.violations([0, -1, -1, 1, -1, -1, -1, -1, -1], 3).length === 1, '上下相鄰也算');
  ok(T.violations([0, -1, 1, -1, -1, -1, -1, -1, -1], 3).length === 0, '隔一格不算');
}
// 出題
for (let lv = 1; lv <= 32; lv++) for (let k = 0; k < (lv > 20 ? 4 : 10); k++) {
  const t0 = Date.now(), p = T.makePuzzle(lv, rnd), s = T.stageOf(lv), n = p.n;
  ok(n === s.st.n, '第 ' + lv + ' 關：' + n + '×' + n);
  ok(valid(p.sol, n), '第 ' + lv + ' 關：答案是一種合格擺法');
  const ng = p.given.filter(x => x >= 0).length, want = Math.round(Reaction.kit.ramp(s.idx, s.st.given[0], s.st.given[1], Math.max(2, s.len)));
  ok(ng === want, '第 ' + lv + ' 關：先放好 ' + want + ' 個（' + ng + '）');
  ok(p.given.every((x, i) => x < 0 || x === p.sol[i]), '先放好的跟答案一致');
  const r = T.solve(p.given, n, null);
  ok(r.sol && valid(r.sol, n) && r.sol.every((x, i) => p.given[i] < 0 || x === p.given[i]), '第 ' + lv + ' 關：求解器從先放好的開始找得到擺法');
  ok(Date.now() - t0 < 3000, '第 ' + lv + ' 關：出題＋求解不到 3 秒（' + (Date.now() - t0) + ' ms）');
}
// 擺不完的局面：求解器回傳 null（不會當作可以）
{
  const g = new Array(9).fill(-1); g[4] = 0; g[1] = 4; g[3] = 8; g[5] = 5;      /* 中間圓紅；上下左右只能放 4、5、7、8，這裡故意少放 7 換成別的 */
  g[7] = 2;
  const r = T.solve(g, 3, null); ok(!r.sol, '違規的局面找不到擺法');
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
