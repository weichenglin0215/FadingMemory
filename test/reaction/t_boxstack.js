// 疊箱子（boxstack）：合法擺法、數解（對照暴力）、出題唯一＋一定有固定的箱子＋照大小排排不對（使用者的意見）、違規偵測、階段
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_boxstack.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261106); const rnd = rng(SEED);

ok(G.id === 'boxstack' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
const legal = (r, c, g, weak) => T.violations(r, c, g).length === 0 && g.every(Boolean) && (weak || new Set(g).size === r * c);
// 完全沒有固定的箱子時，擺法數＝標準楊表的個數（3×3 是 42、2×3 是 5、3×4 是 462）
ok(T.countFill(2, 3, new Array(6).fill(0), 1e9) === 5 && T.countFill(3, 3, new Array(9).fill(0), 1e9) === 42 && T.countFill(3, 4, new Array(12).fill(0), 1e9) === 462, '空架子的擺法數＝楊表個數');
// 偷懶的填法
ok(T.naiveFill(2, 2, [0, 0, 0, 0], 'row').join() === '1,2,3,4' && T.naiveFill(2, 2, [0, 0, 0, 0], 'col').join() === '1,3,2,4', '照大小一排一排／一直行一直行');
// 違規：上面比下面重、左邊比右邊重
ok(T.violations(2, 2, [1, 3, 2, 4]).length === 0 && T.violations(2, 2, [2, 1, 3, 4]).length === 1 && T.violations(2, 2, [1, 2, 0, 0]).length === 0, '違規偵測（空格不算）');
for (let k = 0; k < 30; k++) { const g = T.randomStack(3, 4, rnd); ok(legal(3, 4, g), '隨機擺法合法'); }
// 動態規劃數解（V1.43.0，重量可以重複）要跟暴力窮舉一樣
{
  const brute = (R, C, given, vals) => { const N = R * C, cnt = {}; vals.forEach(v => { cnt[v] = (cnt[v] || 0) + 1; }); let n = 0; const g = new Array(N).fill(0);
    (function rec(k) { if (k === N) { n++; return; } const i = Math.floor(k / C), j = k % C; for (const v in cnt) { if (!cnt[v]) continue; const x = +v; if (given[k] && given[k] !== x) continue; if (i && g[k - C] > x) continue; if (j && g[k - 1] > x) continue; cnt[v]--; g[k] = x; rec(k + 1); g[k] = 0; cnt[v]++; } })(0); return n; };
  let same = 0;
  for (let t = 0; t < 240; t++) {
    const R = 2 + Math.floor(rnd() * 2), C = 2 + Math.floor(rnd() * 2), N = R * C, mode = ['seq', 'gap', 'dup', 'mix'][t % 4];
    const vals = T.makeValues(mode, N, rnd), sol = T.randomStack(R, C, rnd).map(x => vals[x - 1]), given = sol.map(v => rnd() < 0.35 ? v : 0);
    if (T.countFillV(R, C, given, vals, 1e9) === brute(R, C, given, vals)) same++; else ok(false, 'DP 與暴力不同 ' + mode + ' ' + R + 'x' + C);
  }
  ok(same === 240, 'countFillV 跟暴力窮舉一樣（' + same + '/240）');
  ok(T.countFillV(2, 2, [0, 0, 0, 0], [1, 1, 2, 2], 1e9) === 2 && T.countFillV(2, 2, [0, 0, 0, 0], [5, 5, 5, 5], 1e9) === 1, '空架子：1,1,2,2 有 2 種、四個一樣重只有 1 種');
  ok(T.countFillV(2, 2, [9, 0, 0, 0], [1, 1, 2, 2], 1e9) === 0, '固定的重量不在清單裡 → 0 種');
}
// 重量的種類
for (const mode of ['seq', 'gap', 'dup', 'mix']) for (let k = 0; k < 40; k++) {
  const N = 12 + (k % 9), vals = T.makeValues(mode, N, rnd), gs = T.groupsOf(vals);
  ok(vals.length === N && vals.every((v, i) => i === 0 || v >= vals[i - 1]) && vals[0] >= 1, mode + '：N 個重量由輕到重');
  if (mode === 'seq') ok(vals.every((v, i) => v === i + 1), 'seq＝1～N');
  if (mode === 'gap') ok(gs.length === N && vals[N - 1] - vals[0] >= N * 2, 'gap：都不一樣、中間有很多空隙（' + vals.join(',') + '）');
  if (T.isWeak(mode)) ok(gs.length < N && gs.length >= 2 && gs.every(g => g.m <= 4) && gs.some(g => g.m >= 2), mode + '：有重複的重量、有的重量沒出現（' + vals.join(',') + '）');
}
// 出題
const hist = {}; let nDiff = 0, nDiffOk = 0;
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < (lv >= 25 ? 6 : 12); k++) {
  const p = T.makePuzzle(lv, rnd), st = T.stageOf(lv).st, N = p.r * p.c;
  ok(p.r === st.r && p.c === st.c, '第 ' + lv + ' 關：' + st.r + '×' + st.c);
  ok(p.mode === st.mode && p.vals.length === N && legal(p.r, p.c, p.sol, T.isWeak(p.mode)), '答案合法（' + p.mode + '）');
  ok(p.sol.slice().sort((a, b) => a - b).join() === p.vals.join(), '答案用的正好是這一關的重量');
  ok(p.given.every((v, i) => !v || v === p.sol[i]), '固定的箱子跟答案一致');
  const ng = p.given.filter(Boolean).length; hist[st.r + 'x' + st.c] = (hist[st.r + 'x' + st.c] || []).concat(ng);
  ok(ng >= 1 && ng < N - 2, '第 ' + lv + ' 關：一定有固定的箱子，也留了空格（' + ng + '）');
  ok(T.countFillV(p.r, p.c, p.given, p.vals, 2) === 1, '第 ' + lv + ' 關：答案唯一');
  ok(!T.naiveWorks(p.r, p.c, p.given, p.sol, p.vals), '第 ' + lv + ' 關：照大小一排一排、一直行一直行、照斜線填都不對');
  ok(p.given[0] === p.vals[0] && p.given[N - 1] === p.vals[N - 1], '第 ' + lv + ' 關：最左上（最輕）、最右下（最重）預先放好（V1.43.1）');
  const want = Reaction.kit.ramp(lv, T.DIFF_FRAC[0], T.DIFF_FRAC[1], 30); nDiff++; if (p.diff >= want - 1e-9) nDiffOk++;
  if (T.isWeak(p.mode)) { ok(p.vals.some((v, i) => i && v === p.vals[i - 1]), '第 ' + lv + ' 關：有一樣重的箱子'); }
}
Object.keys(hist).forEach(k => { const a = hist[k]; console.log('  ' + k + ' 固定箱數 平均 ' + (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) + '（' + Math.min(...a) + '～' + Math.max(...a) + '）'); });
ok(nDiffOk / nDiff > 0.95, '空格裡跟三種直覺填法都不一樣的比例，絕大多數題目達到該關的要求（' + nDiffOk + '/' + nDiff + '）');
ok(T.stageOf(1).st.mode === 'seq' && T.stageOf(9).st.mode === 'gap' && T.stageOf(17).st.mode === 'dup' && T.stageOf(25).st.mode === 'mix', '階段的重量種類：seq → gap → dup → mix');
ok(T.stageOf(1).st.r === 3 && T.stageOf(9).st.c === 4 && T.stageOf(17).st.r === 4 && T.stageOf(25).st.c === 5, '階段');
// V1.43.1：空格數（EMPTY：第 1 關 → 第 30 關）
{
  ok(T.EMPTY.length === 2 && T.emptyFor(1) === T.EMPTY[0] && T.emptyFor(30) === T.EMPTY[1] && T.emptyFor(90) === T.EMPTY[1], '空格數 第 1 關 ' + T.EMPTY[0] + '、第 30 關 ' + T.EMPTY[1] + '、之後維持');
  let prev = 0; for (let l = 1; l <= 40; l++) { const e = T.emptyFor(l); ok(e >= prev && e >= 1, '第 ' + l + ' 關空格數只會增加：' + e); prev = e; }
  for (const l of [1, 3, 6, 9, 12, 16, 17, 20, 24, 25, 30]) for (let i = 0; i < 10; i++) {
    const p = T.makePuzzle(l), e = p.given.filter(v => !v).length, want = T.emptyFor(l);
    ok(e === p.empties && e <= want, '第 ' + l + ' 關：空格數 ' + e + ' 不會超過要的 ' + want);
    ok(e >= Math.min(want, 3), '第 ' + l + ' 關：空格至少 ' + Math.min(want, 3) + ' 個（實際 ' + e + '，要的是 ' + want + '；架子撐不住那麼多空格時取撐得住的最大值）');
  }
}
// V1.43.1：限時答題（原本不限時）：空格越多時間越長，後面每格的秒數變少
{
  ok(T.TIME_BASE > 0 && T.TIME_CELL[0] > T.TIME_CELL[1], '限時參數');
  for (const l of [1, 15, 30]) ok(T.timeFor(l, 12) > T.timeFor(l, 5), '第 ' + l + ' 關：空格越多時間越長');
  ok(T.timeFor(30, 10) < T.timeFor(1, 10), '同樣空格數，後面的關卡給的時間較少');
  for (const l of [1, 5, 10, 20, 30]) { const p = T.makePuzzle(l), e = p.given.filter(v => !v).length, t = T.timeFor(l, e); ok(e >= 1 && t / e >= 5, '第 ' + l + ' 關每個空格至少 5 秒：' + e + ' 格 ' + t.toFixed(0) + ' 秒'); }
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
