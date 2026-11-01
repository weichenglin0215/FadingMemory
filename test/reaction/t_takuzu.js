// 黑白不連三（takuzu）：規則判定、違規說明、出題器（唯一、不用猜）、難度曲線、提示
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_takuzu.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261102); const rnd = rng(SEED);
const B = T.BLACK, W = T.WHITE;

ok(G.id === 'takuzu' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 難度曲線：玩家可能調過 STAGES／GIVENS／RAMP_LEN，測試跟著參數走
ok(T.stageOf(1).n === T.STAGES[0].n && T.stageOf(T.STAGES[0].to + 1).n === T.STAGES[1].n && T.stageOf(T.STAGES[1].to + 1).n === T.STAGES[2].n && T.stageOf(500).n === T.STAGES[2].n, '盤面大小的階段');
T.STAGES.forEach((st, i) => {
  const from = i === 0 ? 1 : T.STAGES[i - 1].to + 1, len = T.RAMP_LEN[st.n];
  ok(T.givensFor(from) === T.GIVENS[st.n][0], st.n + '×' + st.n + '：階段第一關提示 ' + T.GIVENS[st.n][0]);
  if (len > 1 && from + len - 1 <= st.to) ok(T.givensFor(from + len - 1) === T.GIVENS[st.n][1], st.n + '×' + st.n + '：走完提示 ' + T.GIVENS[st.n][1]);
  for (let l = from + 1; l < Math.min(from + len + 3, st.to + 1); l++) ok(T.givensFor(l) <= T.givensFor(l - 1), st.n + '×' + st.n + '：提示數不增加');
});

// 規則：連三、數量
{
  const n = 6, g = new Array(36).fill(0);
  g[0] = B; g[1] = B;
  let v = T.violationAt(g, n, 2, B);
  ok(v && v.type === 'triple' && v.dir === 'row' && v.cells.join() === '0,1,2', '橫的連三：' + JSON.stringify(v));
  ok(T.violationAt(g, n, 2, W) === null, '放白不違規');
  const h = new Array(36).fill(0); h[6] = W; h[12] = W;
  v = T.violationAt(h, n, 0, W);
  ok(v && v.type === 'triple' && v.dir === 'col' && v.cells.join() === '0,6,12', '直的連三：' + JSON.stringify(v));
  const mid = new Array(36).fill(0); mid[1] = B; mid[3] = B;
  ok(T.violationAt(mid, n, 2, B) && T.violationAt(mid, n, 2, B).type === 'triple', '放在 ●_● 中間補成連三');
  const cnt = new Array(36).fill(0); cnt[0] = B; cnt[2] = B; cnt[4] = B;            // ●_●_●_ ：已經 3 個黑（一半），不能再放第 4 個
  v = T.violationAt(cnt, n, 5, B);
  ok(v && v.type === 'count' && v.dir === 'row' && v.cells.length === 4, '黑超過一半：' + JSON.stringify(v));
  ok(T.violationAt(cnt, n, 5, W) === null, '放白可以');
  // 放下去之前的盤面不會被改動
  ok(cnt[5] === 0, 'violationAt 不改動盤面');
}
// 整盤判定
{
  const sol = T.randomSolution(6, rnd);
  ok(T.findViolations(sol, 6).length === 0 && T.isComplete(sol, 6), '造出來的完整盤合法');
  const broken = sol.slice(); broken[0] = 3 - broken[0];
  ok(T.findViolations(broken, 6).length > 0 || !T.isComplete(broken, 6), '改一格就不合法');
}
// 完整盤：多組種子，所有大小
[4, 6, 8].forEach(n => { for (let i = 0; i < 60; i++) { const s = T.randomSolution(n, rnd); ok(s.length === n * n && T.findViolations(s, n).length === 0 && s.every(v => v === B || v === W), n + '×' + n + ' 完整盤合法'); } });

// 出題：推理解得完＝唯一；提示數貼近目標
for (const lv of [1, 3, 4, 5, 9, 14, 15, 22, 30, 60]) for (let i = 0; i < 12; i++) {
  const p = T.makePuzzle(lv, rnd), n = p.n;
  ok(p.givens.length === n * n && p.givens.every((v, k) => v === 0 || v === p.solution[k]), '第 ' + lv + ' 關：提示都跟答案一樣');
  const r = T.propagate(p.givens, n);
  ok(r.solved && r.grid.join() === p.solution.join(), '第 ' + lv + ' 關：只靠三個推理就解得完，而且解出來就是答案（唯一、不用猜）');
  const cnt = p.givens.filter(v => v).length;
  ok(cnt === p.count && cnt <= p.want + T.SLACK, '第 ' + lv + ' 關：提示 ' + cnt + ' 個，目標 ' + p.want);
  ok(n === T.stageOf(lv).n, '第 ' + lv + ' 關盤面大小');
}
// 推理器本身
{
  const g = new Array(16).fill(0); g[0] = B; g[1] = B;
  const r = T.propagate(g, 4);
  ok(r.grid[2] === W, '連兩個黑，右邊一定是白');
  const g2 = new Array(16).fill(0); g2[0] = B; g2[2] = B;
  ok(T.propagate(g2, 4).grid[1] === W, '夾住（黑_黑），中間一定是白');
  const g3 = new Array(16).fill(0); g3[0] = B; g3[3] = B;
  const r3 = T.propagate(g3, 4);
  ok(r3.grid[1] === W && r3.grid[2] === W, '一排 4 格已有 2 黑，剩下的全是白');
  const dead = new Array(16).fill(0); dead[0] = B; dead[1] = B; dead[2] = B;
  ok(T.propagate(dead, 4).dead, '連三的盤面＝矛盾');
}
// 提示：標的是「沒填對」的格子，而且是推理推得出來的
for (let i = 0; i < 40; i++) {
  const p = T.makePuzzle(5 + (i % 12), rnd), player = p.givens.slice();
  const c = T.hintCell(p, player);
  ok(c >= 0 && p.givens[c] === 0, '提示標空格');
  const mine = p.givens.slice(); const e = p.givens.indexOf(0); mine[e] = 3 - p.solution[e];
  const c2 = T.hintCell(p, mine);
  ok(c2 >= 0 && mine[c2] !== p.solution[c2], '填錯的格子不算填對');
  ok(T.hintCell(p, p.solution.slice()) === -1, '全部填對＝沒有提示');
}
ok(T.rating(30) !== T.rating(1) && T.MAX_LEVEL === 90, '評語與上限');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
