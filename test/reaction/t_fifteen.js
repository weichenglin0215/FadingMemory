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
ok(T.START_EACH === 1, '開局你和電腦各一張牌（V1.43.1）');
ok(T.specOf(1).v === 'luoshu' && T.specOf(6).v === 'luoshu' && T.specOf(13).v === 'luoshu', '前 20 關是洛書');
ok(T.specOf(1).gMin > T.specOf(6).gMin || T.specOf(1).gMin >= 3, '難度＝第一步好走法越來越少：第 1 關至少 3 張好走法');
ok(T.specOf(13).gMax <= 2 && T.specOf(6).gMax <= 3, '後面的關卡好走法的上限變小');
ok(T.specOf(21).v === 'four20' && T.specOf(26).v === 'eleven17' && T.specOf(60).v === 'eleven17', '後面的玩法');
ok(T.specOf(26).gMax > T.specOf(30).gMax && T.specOf(30).gMax === 2 && T.specOf(60).gMax === 2, '第 26～30 關好走法的上限逐關降到 2');
// 開局局面：各一張、你必勝、還沒有人贏
for (const vk of ['luoshu', 'four20', 'eleven17']) {
  const st = T.startsOf(vk), P = T.prep(vk);
  ok(st.length > 0, vk + '：有開局局面：' + st.length);
  st.forEach(p => {
    ok(T.maskToCards(p.A).length === 1 && T.maskToCards(p.B).length === 1 && p.n === 2, vk + '：各一張');
    ok(T.val(P, p.A, p.B).r === 1 && p.g === T.goodMoves(vk, p.A, p.B).length && p.g >= 1, vk + '：你必勝、好走法張數對');
  });
  ok(new Set(st.map(p => p.A * 4096 + p.B)).size === st.length, vk + '：開局局面沒有重複');
}
ok(T.startsOf('luoshu').length === 48 && T.startsOf('four20').length === 12, '洛書各一張的必勝局面 48 種（其餘 24 種是和局）、四張和 20 有 12 種');
// 出題：輪到你、必勝步數剛好、還沒有人贏、各一張、好走法張數落在這一關的範圍
for (const lv of [1, 3, 5, 6, 12, 13, 20, 21, 25, 26, 28, 30, 60]) for (let i = 0; i < 25; i++) {
  const p = T.makePuzzle(lv, rnd), P = T.prep(p.v), v = T.val(P, p.A, p.B), sp = T.specOf(lv);
  ok(v.r === 1 && Math.ceil(v.d / 2) === p.d, '第 ' + lv + ' 關：你有必勝法，要 ' + p.d + ' 步：' + JSON.stringify(v));
  ok(!T.hasWin(P, p.A) && !T.hasWin(P, p.B) && (p.A & p.B) === 0, '第 ' + lv + ' 關：還沒有人贏、牌沒有重複');
  ok(T.maskToCards(p.A).length === 1 && T.maskToCards(p.B).length === 1, '第 ' + lv + ' 關：你和電腦各一張牌');
  ok(p.g === T.goodMoves(p.v, p.A, p.B).length, '第 ' + lv + ' 關：記錄的好走法張數正確');
  if (lv <= 20 || lv >= 26) ok(p.g >= sp.gMin && p.g <= sp.gMax, '第 ' + lv + ' 關：好走法 ' + p.g + ' 張在 ' + sp.gMin + '～' + sp.gMax + ' 之內');
}
// 難度真的往上：前面的關卡平均好走法比後面多
{
  const avg = (lvs) => { let t = 0, n = 0; lvs.forEach(l => { for (let i = 0; i < 60; i++) { t += T.makePuzzle(l, rnd).g; n++; } }); return t / n; };
  const a1 = avg([1, 2, 3, 4, 5]), a2 = avg([6, 8, 10, 12]), a3 = avg([13, 16, 20]);
  ok(a1 > a2 && a2 > a3, '好走法平均張數 第 1～5 關 ' + a1.toFixed(2) + ' > 第 6～12 關 ' + a2.toFixed(2) + ' > 第 13～20 關 ' + a3.toFixed(2));
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
// V1.43.0：走錯一步不會馬上結束，遊戲玩到有人湊成或牌拿完；電腦能贏就贏，走錯之後玩家不可能再贏
{
  let nPlayerWin = 0, nErr = 0, nErrWin = 0, nCpuWin = 0, nDraw = 0, nGames = 400;
  for (let i = 0; i < nGames; i++) {
    const lv = 1 + Math.floor(rnd() * 32), p = T.makePuzzle(lv, rnd), P = T.prep(p.v);
    let A = p.A, B = p.B, erred = false, res = null;
    for (let step = 0; step < 30 && res === null; step++) {
      const free = P.cards.filter(c => !((A | B) & (1 << c)));
      if (!free.length) { res = 'draw'; break; }
      const c = free[Math.floor(rnd() * free.length)], a = T.afterPlayer(p.v, A, B, c);
      if (!a.win && !a.keep) erred = true;
      A = a.A2; if (a.win) { res = 'you'; break; }
      const mv = T.computerMove(p.v, A, B, rnd);
      if (!mv) { res = 'draw'; break; }                 // 你拿走最後一張、沒有湊成：和局
      ok(!((A | B) & (1 << mv.c)), '電腦拿的是桌上的牌');
      B |= 1 << mv.c;
      ok(mv.win === T.hasWin(P, B), 'win 旗標跟實際湊成一致');
      if (mv.win) { res = 'cpu'; break; }
    }
    if (res === 'you') nPlayerWin++; else if (res === 'cpu') nCpuWin++; else nDraw++;
    if (erred) { nErr++; if (res === 'you') nErrWin++; }
  }
  ok(nErr > 50, '亂拿的玩家多半會走錯（' + nErr + '/' + nGames + '）');
  ok(nErrWin === 0, '走錯之後電腦用最好的下法，玩家不可能再贏：' + nErrWin);
  ok(nCpuWin > 0, '亂拿會輸給電腦：' + nCpuWin + '／和局 ' + nDraw + '／你贏 ' + nPlayerWin);
  // 電腦能直接湊成就湊成
  const P9 = T.prep('luoshu'), m1 = (...cs) => cs.reduce((m, c) => m | (1 << c), 0);
  const mv = T.computerMove('luoshu', m1(1, 2), m1(5, 7), rnd);   // 電腦有 5、7，差 3 湊 15
  ok(mv && mv.c === 3 && mv.win === true, '電腦差一張就湊成時直接湊成：' + JSON.stringify(mv));
  ok(T.computerMove('luoshu', m1(1, 2, 3, 4, 8), m1(5, 6, 7, 9), rnd) === null, '桌上沒有牌了回傳 null');
}
ok(T.rating(30) !== T.rating(1) && T.MAX_LEVEL === 90, '評語與上限');

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
