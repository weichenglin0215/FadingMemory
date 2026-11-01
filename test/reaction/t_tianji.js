// 田忌賽馬（tianji）：最多贏幾場（貪心＝暴力搜尋）、出題、強對強不是最好的、難度曲線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_tianji.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261108); const rnd = rng(SEED);

ok(G.id === 'tianji' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 馬的數量與差距曲線
T.STAGES.forEach((st, i) => { const from = i === 0 ? 1 : T.STAGES[i - 1].to + 1; ok(T.sizeFor(from) === st.n && T.sizeFor(Math.min(st.to, from + 2)) === st.n, '階段 ' + st.n + ' 匹'); });
ok(T.gapFor(1) === T.GAP_MIN[0] && T.gapFor(T.RAMP_LEVELS) === T.GAP_MIN[1] && T.gapFor(200) === T.GAP_MIN[1], '戰力差距 ' + T.GAP_MIN);
for (let l = 2; l <= 50; l++) ok(T.gapFor(l) <= T.gapFor(l - 1) && T.sizeFor(l) >= T.sizeFor(l - 1), '單調 ' + l);
// 歷史上那一局：對方 9、6、3，你 8、5、2，最多贏 2 場
{
  const b = T.bestArrangement([8, 5, 2], [9, 6, 3]);
  ok(b.wins === 2 && T.winsOf(b.order, [9, 6, 3]) === 2, '田忌賽馬：最多贏 2 場');
  ok(T.winsOf([8, 5, 2], [9, 6, 3]) === 0, '照順序對：0 勝');
  ok(T.winsOf(T.rankMatch([8, 5, 2], [9, 6, 3]), [9, 6, 3]) === 0, '強對強：0 勝');
  ok(T.winsOf([2, 8, 5], [9, 6, 3]) === 2, '下對上、上對中、中對下：贏 2 場');
}
// 貪心 ＝ 暴力搜尋（n ≤ 6）
function perms(a) { if (a.length <= 1) return [a]; const o = []; a.forEach((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).forEach(p => o.push([x].concat(p)))); return o; }
for (let i = 0; i < 300; i++) {
  const n = 3 + Math.floor(rnd() * 4), t = T.pickStrengths(n, 1, rnd), m = T.pickStrengths(n, 1, rnd), b = T.bestArrangement(m, t);
  let mx = 0; perms(m).forEach(p => { mx = Math.max(mx, T.winsOf(p, t)); });
  ok(mx === b.wins && T.winsOf(b.order, t) === b.wins, '貪心＝暴力搜尋（最多贏 ' + mx + '）');
  ok(b.order.slice().sort((x, y) => x - y).join() === m.slice().sort((x, y) => x - y).join(), '最好的排法用的就是你的那幾匹馬');
}
// 戰力數字：不重複、在範圍內
{ const s = T.pickStrengths(9, 1, rnd); ok(new Set(s).size === 9 && s.every(v => v >= 1 && v <= T.STRENGTH_MAX) && s.every((v, i) => i === 0 || v > s[i - 1]), '挑戰力數字：由小到大、不重複'); }
// 出題
for (const lv of [1, 2, 5, 6, 15, 16, 25, 26, 30, 60]) for (let i = 0; i < 30; i++) {
  const p = T.makePuzzle(lv, rnd), n = T.sizeFor(lv);
  ok(p.n === n && p.theirs.length === n && p.mine.length === n, '第 ' + lv + ' 關：每邊 ' + n + ' 匹');
  ok(new Set(p.theirs).size === n && new Set(p.mine).size === n, '第 ' + lv + ' 關：戰力不重複');
  ok(T.winsOf(p.bestOrder, p.theirs) === p.best && T.bestArrangement(p.mine, p.theirs).wins === p.best, '第 ' + lv + ' 關：最多贏的場數正確');
  ok(p.best >= 1 && p.best < n, '第 ' + lv + ' 關：最多贏 ' + p.best + '（不是 0、也不是全贏）');
  if (lv > 1) ok(p.best > T.winsOf(T.rankMatch(p.mine, p.theirs), p.theirs), '第 ' + lv + ' 關：「強對強」不是最好的');
  if (lv === 1) ok(p.theirs.join() === '9,6,3' && p.mine.slice().sort().join() === '2,5,8', '第 1 關是歷史上那一局');
}
// 玩家一開始的排法（打散）不能剛好就是答案
{
  let already = 0, tot = 0;
  for (let i = 0; i < 300; i++) { const p = T.makePuzzle(6 + (i % 20), rnd); tot++; if (T.winsOf(p.mine, p.theirs) >= p.best) already++; }
  ok(already / tot < 0.15, '一開始的排法剛好就是最好的，比例要低：' + already + '/' + tot);
}
ok(T.rating(30) !== T.rating(1) && T.MAX_LEVEL === 90, '評語與上限');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
