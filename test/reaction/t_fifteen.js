// 搶十五（fifteen）：完整搜尋、出題（必勝步數）、電腦防守、跟井字遊戲（洛書）一致
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fifteen.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261107); const rnd = rng(SEED);

ok(G.id === 'fifteen' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 洛書：每條線和 15、共 8 條
{
  const L = T.LUOSHU, lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  ok(new Set(L).size === 9 && lines.every(l => l.reduce((a, i) => a + L[i], 0) === 15), '洛書方陣每一排、每一列、兩條對角線和 15');
  const P = T.prep('luoshu');
  ok(P.wins.length === 8, '1～9 任選三張和 15 的組合剛好 8 組（＝井字遊戲的 8 條線）：' + P.wins.length);
  // 每個和 15 的組合，在洛書上都是一條線
  const lineMasks = lines.map(l => l.reduce((m, i) => m | (1 << L[i]), 0)).sort();
  ok(P.wins.slice().sort().join() === lineMasks.join(), '和 15 的組合＝洛書上的 8 條線');
  // 井字遊戲從空盤開始是和局（雙方都用最好的下法）
  ok(T.val(P, 0, 0).r === 0, '空盤雙方完美＝和局（所以每一關是預先拿走幾張牌的必勝局面）');
}
// 關卡規格
ok(T.specOf(1).v === 'luoshu' && T.specOf(1).d === 1 && T.specOf(6).d === 2 && T.specOf(13).d === 3, '階段：一步／兩步／三步');
ok(T.specOf(21).v === 'four20' && T.specOf(26).v === 'eleven17' && T.specOf(60).v === 'eleven17', '後面的玩法');
for (let l = 21; l <= 30; l++) ok(T.specOf(l).d >= 2 && T.specOf(l).d <= 5, '後面的關卡要幾步：' + T.specOf(l).d);
// 出題：輪到你、必勝步數剛好、還沒有人贏
for (const lv of [1, 3, 5, 6, 12, 13, 20, 21, 25, 26, 30, 60]) for (let i = 0; i < 25; i++) {
  const p = T.makePuzzle(lv, rnd), P = T.prep(p.v), v = T.val(P, p.A, p.B);
  ok(v.r === 1 && Math.ceil(v.d / 2) === p.d, '第 ' + lv + ' 關：你有必勝法，要 ' + p.d + ' 步：' + JSON.stringify(v));
  ok(!T.hasWin(P, p.A) && !T.hasWin(P, p.B) && (p.A & p.B) === 0, '第 ' + lv + ' 關：還沒有人贏、牌沒有重複');
  ok(Math.abs(T.maskToCards(p.A).length - T.maskToCards(p.B).length) <= 1, '第 ' + lv + ' 關：雙方拿的張數相近（輪流拿的局面）');
  ok(p.d <= T.specOf(lv).d && p.d >= 1, '第 ' + lv + ' 關：步數不超過要求');
}
// 整盤模擬：每一步走好步，電腦用最好的防守，玩家一定贏
{
  let won = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const lv = 1 + Math.floor(rnd() * 32), p = T.makePuzzle(lv, rnd), P = T.prep(p.v);
    let A = p.A, B = p.B, res = null;
    for (let step = 0; step < 30 && res === null; step++) {
      const good = T.goodMoves(p.v, A, B);
      if (!good.length) { res = false; break; }
      const a = T.afterPlayer(p.v, A, B, good[Math.floor(rnd() * good.length)]);
      A = a.A2; if (a.win) { res = true; break; }
      if (!a.keep) { res = false; break; }
      B |= 1 << T.computerPick(p.v, A, B, rnd);
      if (T.hasWin(P, B)) { res = false; break; }
    }
    n++; if (res) won++;
  }
  ok(won === n, '走好步一定贏：' + won + '/' + n);
}
// 走錯一步會被抓到：afterPlayer 的 keep 與 goodMoves 一致
for (let i = 0; i < 200; i++) {
  const lv = 1 + Math.floor(rnd() * 30), p = T.makePuzzle(lv, rnd), P = T.prep(p.v), good = T.goodMoves(p.v, p.A, p.B);
  ok(good.length >= 1, '第 ' + lv + ' 關：至少有一個好走法');
  P.cards.forEach(c => { if ((p.A | p.B) & (1 << c)) return; const r = T.afterPlayer(p.v, p.A, p.B, c); ok(r.keep === (good.indexOf(c) >= 0), '好走法與判定一致 ' + c); });
}
// 電腦防守：挑讓你最久才贏的；在輸定的局面不會送你一步勝
{
  const p = T.makePuzzle(8, rnd), P = T.prep(p.v), g = T.goodMoves(p.v, p.A, p.B), a = T.afterPlayer(p.v, p.A, p.B, g[0]);
  if (!a.win) {
    const c = T.computerPick(p.v, a.A2, p.B, rnd);
    ok(c >= 1 && !((a.A2 | p.B) & (1 << c)), '電腦拿的是桌上的牌');
    const best = T.val(P, a.A2, p.B | (1 << c));
    P.cards.forEach(x => { if ((a.A2 | p.B) & (1 << x)) return; const v = T.val(P, a.A2, p.B | (1 << x)); ok(!(v.r === 1 && best.r === 1 && v.d > best.d), '電腦沒有更能拖的走法'); });
  }
}
// 答案不偏心：好走法的牌號不能集中
{
  const cnt = new Array(12).fill(0); let tot = 0;
  for (let i = 0; i < 600; i++) { const p = T.makePuzzle(13 + Math.floor(rnd() * 8), rnd), g = T.goodMoves(p.v, p.A, p.B); g.forEach(c => { cnt[c]++; tot++; }); }
  ok(Math.max(...cnt) / tot < 0.4, '好走法的牌號分布不集中：' + cnt.slice(1, 10).join(','));
}
ok(T.rating(30) !== T.rating(1) && T.MAX_LEVEL === 90, '評語與上限');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
