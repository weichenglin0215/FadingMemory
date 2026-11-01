// 取火柴（nim）：完整搜尋的勝負判斷、Nim 和（XOR）一致、出題一定先手必勝、電腦的行為、關卡曲線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_nim.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261106); const rnd = rng(SEED);

ok(G.id === 'nim' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 普通規則、不限根數：先手必勝 ⇔ XOR ≠ 0（經典 Nim 定理）——完整搜尋要跟公式一致
{
  let agree = 0, total = 0;
  for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6; b++) for (let c = 0; c <= 6; c++) for (let d = 0; d <= 3; d++) { total++; if (T.isWinning([a, b, c, d], 0, false) === (T.xorOf([a, b, c, d]) !== 0)) agree++; }
  ok(agree === total, '普通規則：必勝＝XOR 不為 0（' + agree + '/' + total + '）');
}
// 單堆限拿 3（搶 21 型）：剩下 4 的倍數的人輸
for (let n = 0; n <= 30; n++) ok(T.isWinning([n], 3, false) === (n % 4 !== 0), '單堆限拿 3：' + n + ' 根 → ' + (n % 4 !== 0 ? '必勝' : '必輸'));
// 拿最後一根輸（misère）：單堆 1 根＝輪到的人輸；兩堆 1,1＝輪到的人贏（拿一根，對手被迫拿最後一根）
ok(T.isWinning([1], 0, true) === false && T.isWinning([1, 1], 0, true) === true && T.isWinning([2], 0, true) === true, 'misère 的小例子');
ok(T.isWinning([1, 1, 1], 0, true) === false, 'misère：1,1,1 輪到的人輸');
// 走法
ok(T.movesOf([2, 1], 0).length === 3 && T.movesOf([5], 3).length === 3 && T.movesOf([0, 2], 0).length === 2, '走法的個數');
ok(T.applyMove([3, 4], { pile: 1, take: 2 }).join() === '3,2', '拿走火柴');
{
  const w = T.winningMoves([3, 5, 7], 0, false);
  ok(w.length === 3 && w.every(m => T.xorOf(T.applyMove([3, 5, 7], m)) === 0), '3-5-7：三種必勝走法（3→2、5→4、7→6），拿完 XOR 都是 0');
  ok(T.winningMoves([1, 2, 3], 0, false).length === 0, '1-2-3 的 XOR 是 0：沒有必勝走法（輪到的人輸）');
}
// 關卡：階段、出題一定先手必勝
T.STAGES.forEach((st, i) => {
  const from = i === 0 ? 1 : T.STAGES[i - 1].to + 1;
  const s = T.stageOf(from); ok(s.st === st && s.idx === 1, '階段 ' + (i + 1));
});
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 15; k++) {
  const p = T.makePuzzle(lv, rnd), st = T.stageOf(lv).st;
  ok(p.piles.length === st.piles && p.maxTake === st.maxTake && p.misere === st.misere, '第 ' + lv + ' 關：規則 ' + JSON.stringify([p.piles.length, p.maxTake, p.misere]));
  ok(T.isWinning(p.piles, p.maxTake, p.misere), '第 ' + lv + ' 關：先手必勝 ' + p.piles);
  ok(p.piles.every(x => x >= 1), '第 ' + lv + ' 關：每堆至少 1 根');
  if (st.piles === 1) ok(p.piles[0] % 4 !== 0, '單堆限拿 3：不是 4 的倍數 ' + p.piles);
}
// 整盤模擬：玩家每一步都走必勝步，電腦在輸定時亂走，玩家一定贏（所有關卡規則）
{
  let won = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const lv = 1 + Math.floor(rnd() * 32), p = T.makePuzzle(lv, rnd);
    let piles = p.piles.slice(), res = null;
    for (let step = 0; step < 100 && res === null; step++) {
      const good = T.winningMoves(piles, p.maxTake, p.misere);
      if (!good.length) { res = false; break; }
      piles = T.applyMove(piles, good[Math.floor(rnd() * good.length)]);
      if (piles.every(x => x === 0)) { res = !p.misere; break; }
      const m = T.computerMove(piles, p.maxTake, p.misere, rnd);
      piles = T.applyMove(piles, m);
      if (piles.every(x => x === 0)) { res = p.misere; break; }
    }
    n++; if (res) won++;
  }
  ok(won === n, '完美的玩家每一局都贏：' + won + '/' + n);
}
// 電腦：贏得了就走必勝步；輸定了走的步，玩家一定還有必勝步
for (let i = 0; i < 300; i++) {
  const lv = 1 + Math.floor(rnd() * 30), p = T.makePuzzle(lv, rnd);
  const m = T.computerMove([...p.piles, 1], p.maxTake, p.misere, rnd);          // 隨便一個局面
  ok(m && m.take >= 1, '電腦一定走得出一步');
}
{
  const piles = [3, 5, 6];                       // XOR＝0（輪到的人輸）：電腦隨便走
  ok(T.xorOf(piles) === 0 && !T.isWinning(piles, 0, false), '3-5-6 是輸定的局面');
  for (let i = 0; i < 50; i++) { const m = T.computerMove(piles, 0, false, rnd), after = T.applyMove(piles, m); ok(T.isWinning(after, 0, false), '電腦在輸定的局面走的每一步，玩家都還有必勝步'); }
  const winPos = [3, 5, 7];                      // 電腦（假如輪到它）有必勝步時，要走必勝步
  const m = T.computerMove(winPos, 0, false, rnd); ok(T.xorOf(T.applyMove(winPos, m)) === 0, '電腦贏得了就走必勝步');
}
// 答案不偏心：必勝步落在哪一堆、拿幾根，不能集中
{
  const pile = [0, 0, 0, 0], take = {};
  for (let i = 0; i < 600; i++) { const p = T.makePuzzle(11 + Math.floor(rnd() * 10), rnd), w = T.winningMoves(p.piles, p.maxTake, p.misere)[0]; pile[w.pile]++; take[w.take] = (take[w.take] || 0) + 1; }
  ok(pile.slice(0, 3).every(x => x / 600 > 0.15), '三堆時，必勝步落在各堆的比例都 > 15%：' + pile.slice(0, 3));
}
ok(T.rating(30) !== T.rating(1) && T.MAX_LEVEL === 90, '評語與上限');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
