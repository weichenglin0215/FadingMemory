// 形色不相鄰（shapegrid）：相鄰規則（含 V1.43.0 的斜角）、3×3 的合格擺法數（72）、4×4 含斜角的合格擺法數（1152）、出題（答案唯一、最少個數＋暖身）、求解器、違規說明
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_shapegrid.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261107); const rnd = rng(SEED);

ok(G.id === 'shapegrid' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
const valid = (g, n, diag) => g.every(p => p >= 0) && new Set(g).size === n * n && T.violations(g, n, diag).length === 0;
ok(T.canTouch(0, 4, 3) && !T.canTouch(0, 1, 3) && !T.canTouch(0, 3, 3), '相鄰規則：形狀、顏色都不同才可以');
ok(T.neighbors(4, 3).sort().join() === '1,3,5,7' && T.neighbors(0, 3).sort().join() === '1,3', '鄰居');
ok(T.neighbors(4, 3, true).sort().join() === '0,1,2,3,5,6,7,8' && T.neighbors(0, 3, true).sort().join() === '1,3,4' && T.neighbors(2, 3, true).sort().join() === '1,4,5', '鄰居：連斜角');
// 3×3 合格擺法正好 72 種（跟 note/原創篇實驗/exp_impl8.cjs ③ 一致）：數法＝每找到一個就把它擋掉再找
{
  let count = 0; const n = 3, all = [];
  (function rec(k, g, used) {
    if (k === 9) { count++; return; }
    for (let p = 0; p < 9; p++) if (!used[p] && T.neighbors(k, n).every(q => g[q] < 0 || T.canTouch(p, g[q], n))) { used[p] = 1; g[k] = p; rec(k + 1, g, used); g[k] = -1; used[p] = 0; }
  })(0, new Array(9).fill(-1), []);
  ok(count === 72, '3×3 合格擺法 72 種（' + count + '）');
}
// 4×4 連斜角也不能相鄰：合格擺法剛好 1152 種（跟獨立的暴力窮舉一樣）；5×5 一定有解
{
  const n = 4, N = 16, nb = []; for (let k = 0; k < N; k++) nb.push(T.neighbors(k, n, true));
  let cnt = 0; const used = new Array(N).fill(false), g = new Array(N).fill(-1);
  (function rec(k) { if (k === N) { cnt++; return; } for (let p = 0; p < N; p++) { if (used[p] || !nb[k].every(q => g[q] < 0 || T.canTouch(p, g[q], n))) continue; used[p] = true; g[k] = p; rec(k + 1); g[k] = -1; used[p] = false; } })(0);
  ok(cnt === 1152, '4×4 連斜角：暴力數 1152 種（' + cnt + '）');
  const r = T.countSolutions(new Array(N).fill(-1), n, true, 1e9, 1e9);
  ok(r.count === 1152 && !r.gaveUp, '求解器數出來也是 1152（' + r.count + '）');
  ok(T.countSolutions(new Array(9).fill(-1), 3, false, 1e9, 1e9).count === 72, '求解器數 3×3（上下左右）也是 72');
  ok(T.countSolutions(new Array(9).fill(-1), 3, true, 1e9, 1e9).count === 0, '3×3 連斜角：中間格有 8 個鄰居、只有 4 個圖形能跟它相鄰 → 沒有合格擺法');
  ok(T.solve(new Array(25).fill(-1), 5, null, undefined, true).sol !== null, '5×5 連斜角找得到合格擺法');
}
// 違規說明
{
  const g = [0, 1, -1, -1, -1, -1, -1, -1, -1];        /* 圓形紅、圓形藍 相鄰：形狀一樣 */
  const v = T.violations(g, 3); ok(v.length === 1 && v[0].why === 'shape' && T.whyText(v[0], g, 3) === '兩個都是圓形，不能相鄰', '形狀一樣');
  const g2 = [0, 3, -1, -1, -1, -1, -1, -1, -1];       /* 圓形紅、三角形紅：顏色一樣 */
  const v2 = T.violations(g2, 3); ok(v2.length === 1 && v2[0].why === 'color' && T.whyText(v2[0], g2, 3) === '兩個都是紅色，不能相鄰', '顏色一樣');
  ok(T.violations([0, -1, -1, 1, -1, -1, -1, -1, -1], 3).length === 1, '上下相鄰也算');
  ok(T.violations([0, -1, 1, -1, -1, -1, -1, -1, -1], 3).length === 0, '隔一格不算');
  const gd = [0, -1, -1, -1, 3, -1, -1, -1, -1];          /* 圓紅、三角紅：斜角相鄰、顏色一樣 */
  ok(T.violations(gd, 3).length === 0 && T.violations(gd, 3, true).length === 1, '斜角相鄰：只有 diag 規則才算違規');
  const vd = T.violations(gd, 3, true); ok(vd[0].diag === true && vd[0].why === 'color' && T.whyText(vd[0], gd, 3) === '兩個都是紅色，斜角也不能相鄰', '斜角違規的說明');
  const ga = [-1, -1, 0, -1, 1, -1, -1, -1, -1];          /* 右上、正中間：另一個斜角方向，圓紅、圓藍形狀一樣 */
  ok(T.violations(ga, 3).length === 0 && T.violations(ga, 3, true).length === 1 && T.violations(ga, 3, true)[0].diag, '斜角（右上—左下方向）也檢查');
  ok(T.violations([-1, -1, -1, -1, -1, 0, -1, 1, -1], 3, true).length === 1, '斜角（右中—下中）也檢查');
}
// 出題
const hist = {};
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < (lv > 24 ? 4 : 10); k++) {
  const t0 = Date.now(), p = T.makePuzzle(lv, rnd), s = T.stageOf(lv), n = p.n;
  ok(n === s.st.n && p.diag === !!s.st.diag, '第 ' + lv + ' 關：' + n + '×' + n + (p.diag ? '（含斜角）' : ''));
  ok(valid(p.sol, n, p.diag), '第 ' + lv + ' 關：答案是一種合格擺法');
  ok(p.given.every((x, i) => x < 0 || x === p.sol[i]), '先放好的跟答案一致');
  ok(T.isUnique(p.given, n, p.diag, 300000), '第 ' + lv + ' 關：答案唯一（V1.43.0：不再是「任何一種合格擺法都算」）');
  const r = T.solve(p.given, n, null, undefined, p.diag);
  ok(r.sol && valid(r.sol, n, p.diag) && r.sol.join() === p.sol.join(), '第 ' + lv + ' 關：求解器從先放好的開始找到的就是答案');
  // 暖身的圖形用完（extra＝0）之後，每一個先放好的圖形都是必要的（拿掉任何一個就不唯一）
  const extra = Math.round(Reaction.kit.ramp(s.idx, s.st.extra[0], s.st.extra[1], Math.max(2, s.len)));
  const ng = p.given.filter(x => x >= 0).length, key = n + (p.diag ? 'd' : 'o');
  (hist[key] = hist[key] || { min: 1e9, n: 0, sum: 0 }); if (extra === 0) { hist[key].min = Math.min(hist[key].min, ng); hist[key].n++; hist[key].sum += ng; }
  if (extra === 0) p.given.forEach((x, i) => { if (x < 0) return; const g2 = p.given.slice(); g2[i] = -1; ok(!T.isUnique(g2, n, p.diag, 300000), '第 ' + lv + ' 關：先放好的每一個都不能拿掉'); });
  ok(Date.now() - t0 < 3000, '第 ' + lv + ' 關：出題＋求解不到 3 秒（' + (Date.now() - t0) + ' ms）');
}
Object.keys(hist).forEach(k => { const a = hist[k]; if (a.n) console.log('  ' + k + ' 最少個數 平均 ' + (a.sum / a.n).toFixed(1) + '（最少 ' + a.min + '）'); });
ok(T.stageOf(1).st.n === 3 && !T.stageOf(1).st.diag && T.stageOf(5).st.n === 4 && !T.stageOf(5).st.diag && T.stageOf(13).st.n === 4 && T.stageOf(13).st.diag && T.stageOf(25).st.n === 5 && T.stageOf(25).st.diag, '階段：3×3 → 4×4 → 4×4 含斜角 → 5×5 含斜角');
// 擺不完的局面：求解器回傳 null（不會當作可以）
{
  const g = new Array(9).fill(-1); g[4] = 0; g[1] = 4; g[3] = 8; g[5] = 5;      /* 中間圓紅；上下左右只能放 4、5、7、8，這裡故意少放 7 換成別的 */
  g[7] = 2;
  const r = T.solve(g, 3, null); ok(!r.sol, '違規的局面找不到擺法');
  ok(T.countSolutions(g, 3, false, 2, 1e6).count === 0, '違規的局面：0 種');
}
// V1.43.1：限時答題（原本不限時）：空格越多時間越長，後面每格的秒數變少
{
  ok(T.TIME_BASE > 0 && T.TIME_CELL.every(x => x > 0), '限時參數');
  for (const l of [1, 15, 30]) ok(T.timeFor(l, 12) > T.timeFor(l, 5), '第 ' + l + ' 關：空格越多時間越長');
  for (const l of [1, 6, 14, 26]) { const p = T.makePuzzle(l), e = p.given.filter(v => v < 0).length, t = T.timeFor(l, e); ok(e >= 1 && t / e >= 6, '第 ' + l + ' 關每個空格至少 6 秒：' + e + ' 格 ' + t.toFixed(0) + ' 秒'); }
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
