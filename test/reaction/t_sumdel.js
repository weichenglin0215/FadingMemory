// 刪數湊和（sumdel）：目標與差額、解的個數（唯一）、出題、難度曲線、提示
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sumdel.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261103); const rnd = rng(SEED);

ok(G.id === 'sumdel' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 難度曲線（跟著 STAGES／NUM_MAX／RAMP_LEVELS 走）
T.STAGES.forEach((st, i) => { const from = i === 0 ? 1 : T.STAGES[i - 1].to + 1; ok(T.sizeFor(from) === st.n && T.sizeFor(Math.min(st.to, from + 3)) === st.n, '方陣大小 ' + st.n); });
ok(T.maxNumFor(1) === T.NUM_MAX[0] && T.maxNumFor(T.RAMP_LEVELS) === T.NUM_MAX[1] && T.maxNumFor(200) === T.NUM_MAX[1], '數字範圍 ' + T.NUM_MAX);
for (let l = 2; l <= 60; l++) ok(T.maxNumFor(l) >= T.maxNumFor(l - 1) && T.sizeFor(l) >= T.sizeFor(l - 1), '單調 ' + l);

// 目標與差額
{
  const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9], keep = [true, false, true, true, true, false, true, true, false], n = 3;
  const t = T.targetsOf(nums, keep, n);
  ok(t.rowT[0] === 1 + 3 && t.rowT[1] === 4 + 5 && t.rowT[2] === 7 + 8 && t.colT[0] === 1 + 4 + 7 && t.colT[1] === 5 + 8 && t.colT[2] === 3 + 6 * 0 + 0, '各排各列的目標：' + JSON.stringify(t));
  const all = nums.map(() => true);
  const d = T.diffsOf(nums, all, n, t.rowT, t.colT);
  ok(d.rows[0] === 6 - 4 && d.cols[2] === 18 - 3, '全部留著時：總和 − 目標＝還要再刪的量：' + JSON.stringify(d));
  ok(T.isSolved(nums, keep, n, t.rowT, t.colT) && !T.isSolved(nums, all, n, t.rowT, t.colT), '剛好＝解開');
  const over = keep.slice(); over[0] = false;
  ok(T.diffsOf(nums, over, n, t.rowT, t.colT).rows[0] === -1, '刪過頭＝負數');
}
// 解的個數：已知的小例子（2×2：全部數字相同時有多種刪法）
ok(T.countSolutions([1, 1, 1, 1], 2, [1, 1], [1, 1], 5) === 2, '2×2 全是 1、每排每列目標 1：兩種刪法（對角線）');
ok(T.countSolutions([1, 2, 3, 4], 2, [1, 4], [1, 4], 5) === 1, '2×2：目標排 1、4、列 1、4 → 只能留 1 和 4（唯一）');
ok(T.countSolutions([5, 5, 5, 5], 2, [7, 7], [7, 7], 5) === 0, '湊不出來＝0 解');

// 出題：答案存在、唯一、符合規則
for (const lv of [1, 6, 7, 16, 17, 30, 60]) for (let i = 0; i < 20; i++) {
  const p = T.makePuzzle(lv, rnd), n = p.n;
  ok(n === T.sizeFor(lv) && p.nums.length === n * n && p.nums.every(v => v >= 1 && v <= p.max) && p.max === T.maxNumFor(lv), '第 ' + lv + ' 關：數字範圍與大小');
  ok(T.isSolved(p.nums, p.keep, n, p.rowT, p.colT), '第 ' + lv + ' 關：答案成立');
  ok(T.countSolutions(p.nums, n, p.rowT, p.colT, 2) === 1, '第 ' + lv + ' 關：答案唯一');
  const dels = p.keep.filter(k => !k).length;
  ok(dels >= Math.ceil(n * n * T.DEL_MIN), '第 ' + lv + ' 關：至少刪 ' + Math.ceil(n * n * T.DEL_MIN) + ' 格：' + dels);
  for (let r = 0; r < n; r++) { let kr = 0, kc = 0; for (let c = 0; c < n; c++) { if (p.keep[r * n + c]) kr++; if (p.keep[c * n + r]) kc++; } ok(kr > 0 && kr < n && kc > 0 && kc < n, '每排每列至少刪一格、留一格'); }
}
// 提示：標的是「跟答案不同」的格子
for (let i = 0; i < 40; i++) {
  const p = T.makePuzzle(1 + i % 30, rnd), cur = p.nums.map(() => true);
  const c = T.hintCell(p, cur);
  ok(c >= 0 && cur[c] !== p.keep[c], '提示標的格子跟答案不同');
  ok(T.hintCell(p, p.keep.slice()) === -1, '全對＝沒有提示');
}
// 唯一解比例（出題器沒有退到保底）
{ let uniq = 0; for (let i = 0; i < 100; i++) { const p = T.makePuzzle(1 + i % 40, rnd); if (T.countSolutions(p.nums, p.n, p.rowT, p.colT, 2) === 1) uniq++; } ok(uniq === 100, '100 題都是唯一解：' + uniq); }
ok(T.rating(30) !== T.rating(1) && T.MAX_LEVEL === 90, '評語與上限');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
