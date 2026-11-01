// 魔方陣（magicsq）：3×3 共 8 種、4×4 回溯造盤、提示唯一、各線的差額、難度曲線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_magicsq.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261104); const rnd = rng(SEED);

ok(G.id === 'magicsq' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
ok(T.magicSum(3) === 15 && T.magicSum(4) === 34, '魔術總和');
ok(T.linesOf(3).length === 8 && T.linesOf(4).length === 10 && T.linesOf(4).every(l => l.length === 4), '線的數量：排＋列＋2 條對角線');
// 3×3：剛好 8 種，每種都合法
const all3 = T.enumerate3();
ok(all3.length === 8, '3×3 魔方陣剛好 8 種：' + all3.length);
all3.forEach(s => ok(new Set(s).size === 9 && T.linesOf(3).every(l => l.reduce((a, i) => a + s[i], 0) === 15) && s[4] === 5, '3×3 都合法、中央一定是 5'));
// 4×4：隨機造的都合法
for (let i = 0; i < 40; i++) { const s = T.search(4, new Array(16).fill(0), 1, rnd).first; ok(s && new Set(s).size === 16 && T.linesOf(4).every(l => l.reduce((a, k) => a + s[k], 0) === 34), '4×4 隨機造盤合法'); }
// 4×4 全部 7040 種（確認搜尋的完整性；用較大的 limit 數一次，約數秒）
{ const r = T.search(4, new Array(16).fill(0), 100000, null); ok(r.count === 7040, '4×4 魔方陣共 7040 種：' + r.count); }
// 難度曲線
ok(T.sizeFor(1) === 3 && T.sizeFor(Math.min(8, T.LEVELS3)) === 3 && T.sizeFor(Math.min(8, T.LEVELS3) + 1) === 4 && T.sizeFor(60) === 4, '3×3 → 4×4');
ok(T.givensFor(1) === T.GIVENS3[0] && T.givensFor(Math.min(8, T.LEVELS3)) === T.GIVENS3[1], '3×3 提示 ' + T.GIVENS3);
const f4 = Math.min(8, T.LEVELS3) + 1;
ok(T.givensFor(f4) === T.GIVENS4[0] && T.givensFor(f4 + T.RAMP4 - 1) === T.GIVENS4[1] && T.givensFor(200) === T.GIVENS4[1], '4×4 提示 ' + T.GIVENS4);
for (let l = f4 + 1; l < 80; l++) ok(T.givensFor(l) <= T.givensFor(l - 1), '4×4 提示數不增加');
// 出題：提示唯一；前 8 關 3×3 不重複
{
  const used = [], seen = new Set();
  for (let lv = 1; lv <= Math.min(8, T.LEVELS3); lv++) { const p = T.makePuzzle(lv, rnd, used); used.push(p.solution.join(',')); seen.add(p.solution.join(',')); ok(T.countMatching(3, p.givens, 5) === 1, '第 ' + lv + ' 關：3×3 唯一'); ok(p.count === T.givensFor(lv), '第 ' + lv + ' 關：提示 ' + p.count); }
  ok(seen.size === Math.min(8, T.LEVELS3), '3×3 這幾關每關一種，不重複：' + seen.size);
}
for (const lv of [9, 12, 20, 31, 60]) for (let i = 0; i < 10; i++) {
  const p = T.makePuzzle(lv, rnd, []);
  ok(p.n === 4 && p.givens.every((v, k) => v === 0 || v === p.solution[k]), '第 ' + lv + ' 關：提示對');
  ok(T.countMatching(4, p.givens, 2) === 1, '第 ' + lv + ' 關：4×4 答案唯一');
  ok(p.count >= T.givensFor(lv) && p.count <= T.givensFor(lv) + 3, '第 ' + lv + ' 關：提示數 ' + p.count + ' 接近目標 ' + T.givensFor(lv));
}
// 各線狀況
{
  const grid = new Array(9).fill(0); grid[0] = 8; grid[1] = 1;
  const st = T.lineStatus(3, grid);
  ok(st[0].diff === 15 - 9 && st[0].empty === 1 && !st[0].full, '第 1 排：差 6');
  const sol = all3[0], full = T.lineStatus(3, sol);
  ok(full.every(s => s.ok) && T.isSolved(3, sol), '完整的魔方陣每條線都 OK');
  const wrong = sol.slice(); const t = wrong[0]; wrong[0] = wrong[1]; wrong[1] = t;
  ok(!T.isSolved(3, wrong), '交換兩格就不成立');
}
// 提示：標沒填對的格子，優先選所在線剩最少空格的
for (let i = 0; i < 20; i++) {
  const p = T.makePuzzle(1 + (i % 20), rnd, []), c = T.hintCell(p, p.givens.slice());
  ok(c >= 0 && p.givens[c] === 0, '提示標空格');
  ok(T.hintCell(p, p.solution.slice()) === -1, '全部填對＝沒有提示');
}
ok(T.rating(30) !== T.rating(1) && T.MAX_LEVEL === 90, '評語與上限');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
