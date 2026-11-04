// 翻最多棋（reversi，企劃 232）的純函式檢查：黑白棋規則（夾住就翻、八個方向）、出題條件（最多與第二多的差距、藏起來、黑棋有得下）、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_reversi.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261105), rnd = rng(SEED);
const N = T.N, B = 1, W = -1;           // 棋盤邊長跟著遊戲檔的 N（使用者可能改成 9×9）
const at = (r, c) => r * N + c;

// ── 難度 ──
ok(T.stonesFor(1) === T.STONES[0] && T.stonesFor(T.RAMP_LEVELS) === T.STONES[1] && T.stonesFor(99) === T.STONES[1], '棋子數 ' + T.STONES);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.gapMaxFor(1) === T.GAP_MAX[0] && T.gapMaxFor(T.RAMP_LEVELS) === 1 && Math.abs(T.trickPFor(T.RAMP_LEVELS) - T.TRICK_P[1]) < 1e-9 && T.trickPFor(1) === 0, '差距上限 ' + T.GAP_MAX + '、藏起來的機率 ' + T.TRICK_P);
for (let l = 2; l <= 60; l++) ok(T.stonesFor(l) >= T.stonesFor(l - 1) && T.gapMaxFor(l) <= T.gapMaxFor(l - 1) && (T.TIME_S[1] >= T.TIME_S[0] ? T.timeMs(l) >= T.timeMs(l - 1) : T.timeMs(l) <= T.timeMs(l - 1)) && T.trickPFor(l) >= T.trickPFor(l - 1), '單調 ' + l);
// ── 規則：標準開局黑棋有 4 個下法、各翻 1 顆 ──
{ const b = T.initBoard(), ms = T.legalMoves(b, B);
  ok(T.countStones(b) === 4 && ms.length === 4 && ms.every(m => m.n === 1 && m.dirs === 1), '開局：黑棋 4 個合法下法、各翻 1 顆');
  ok(ms.map(m => m.idx).sort((a, b) => a - b).join() === [at(2, 3), at(3, 2), at(4, 5), at(5, 4)].join(), '開局黑棋能下的格子：(2,3)(3,2)(4,5)(5,4)');
  const ws = T.legalMoves(b, W); ok(ws.length === 4, '開局白棋也是 4 個'); }
// ── 手工盤面：橫、直、斜、多方向、沒夾住 ──
function mk(rows) { const b = new Int8Array(N * N); rows.forEach((s, r) => { for (let c = 0; c < 8; c++) b[at(r, c)] = s[c] === 'B' ? B : s[c] === 'W' ? W : 0; }); return b; }
{ const b = mk(['........', '........', '........', '..BWWW..', '........', '........', '........', '........']);
  ok(T.flipsFor(b, at(3, 6), B).flips.length === 3 && T.flipsFor(b, at(3, 6), B).dirs === 1 && !T.flipsFor(b, at(3, 6), B).onlyDiag, '橫向夾 3 顆：B W W W [空] → 下在空格翻 3 顆');
  ok(T.flipsFor(b, at(3, 6), W).flips.length === 0 && T.flipsFor(b, at(0, 0), B).flips.length === 0 && T.flipsFor(b, at(3, 3), B).flips.length === 0, '白棋夾不到黑棋、離太遠夾不到、不是空格不能下'); }
{ const b = mk(['B.......', '.W......', '..W.....', '...W....', '........', '........', '........', '........']);
  const f = T.flipsFor(b, at(4, 4), B); ok(f.flips.length === 3 && f.dirs === 1 && f.onlyDiag, '斜線夾 3 顆（只有斜線方向）：onlyDiag'); }
{ const b = mk(['........', '...B....', '...W....', 'BWW.WWB.', '...W....', '...W....', '...B....', '........']);
  const f = T.flipsFor(b, at(3, 3), B); ok(f.flips.length === 7 && f.dirs === 4 && !f.onlyDiag, '一次翻四個方向（左 2、右 2、上 1、下 2）：翻 ' + f.flips.length + ' 顆、方向 ' + f.dirs); }
{ const b = mk(['WWWWWWWW', '........', '........', '........', '........', '........', '........', '........']); ok(T.legalMoves(b, B).length === 0, '沒有黑棋可夾的盤面：沒有合法下法'); }
// applyMove 與 flipsFor 一致、棋子數 +1
for (let i = 0; i < 200; i++) { const b = T.initBoard(); let turn = B; for (let s = 0; s < 40; s++) { const ms = T.legalMoves(b, turn); if (!ms.length) { turn = -turn; continue; } const m = ms[Math.floor(rnd() * ms.length)], before = T.countStones(b), blackBefore = Array.from(b).filter(x => x === turn).length; T.applyMove(b, m.idx, turn); ok(T.countStones(b) === before + 1 && Array.from(b).filter(x => x === turn).length === blackBefore + 1 + m.n, '下一步：棋子 +1、自己的棋 +1+翻的顆數'); turn = -turn; } }
// ranking
{ const r = T.ranking([{ idx: 1, n: 3 }, { idx: 2, n: 5 }, { idx: 3, n: 5 }, { idx: 4, n: 2 }]); ok(r.best === 5 && r.second === 3 && r.gap === 2 && r.bestIdxs.join() === '2,3', 'ranking：最多 5（並列）、第二多 3'); }
// ── 整關（V1.44.1：先規劃再填滿）──
const D8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
// 黑棋下在 idx：八個方向各夾幾顆（0＝沒夾住），不靠被測的函式，自己重算
function runs(bd, idx) { const out = []; for (const d of D8) { let r = Math.floor(idx / N) + d[0], c = idx % N + d[1], n = 0; while (r >= 0 && r < N && c >= 0 && c < N && bd[r * N + c] === W) { n++; r += d[0]; c += d[1]; } out.push(n && r >= 0 && r < N && c >= 0 && c < N && bd[r * N + c] === B ? n : 0); } return out; }
let withCorner = 0, cornerBest = 0, trickyReq = 0, trickyHold = 0, total = 0, topLv = 0, topFull = 0, blackSum = 0, stoneSum = 0, nearSum = 0, nearN = 0, deadLine = 0, boards = 0;
for (let i = 0; i < 600; i++) {
  const lv = 1 + (i % 36), q = T.makeLevel(lv, rnd); total++;
  ok(q.board.length === N * N && Array.from(q.board).every(x => x === 0 || x === B || x === W), '盤面合法');
  ok(q.stones === Math.min(T.stonesFor(lv), N * N - 8) && q.stones === T.countStones(q.board), '第 ' + lv + ' 關：棋子數 ' + q.stones + '（目標 ' + T.stonesFor(lv) + '）');
  const ms = T.legalMoves(q.board, B);
  ok(ms.length === q.moves.length && ms.length >= T.MIN_MOVES, '黑棋至少有 ' + T.MIN_MOVES + ' 個合法下法：' + ms.length);
  const rk = T.ranking(ms);
  ok(rk.best === q.best && rk.second === q.second && rk.gap === q.gap && rk.bestIdxs.join() === q.bestIdxs.join(), '附的 best／second／gap 跟重算的一樣');
  ok(q.gap >= 1 && q.gap <= T.gapMaxFor(lv), '第 ' + lv + ' 關：最多與第二多差 ' + q.gap + '（要 1～' + T.gapMaxFor(lv) + '）');
  ok(q.bestIdxs.length === 1, '最多的位置唯一（不是並列）：' + q.bestIdxs.length);
  const bm = ms.filter(m => m.idx === q.bestIdxs[0])[0], br = runs(q.board, bm.idx);
  ok(br.reduce((x, y) => x + y, 0) === q.best && br.filter(x => x > 0).length === bm.dirs && bm.dirs === q.bestDirs, '最多那一手：自己重算的方向數、顆數一樣');
  ok(q.bestDirs >= 3, '最多那一手至少 3 個方向：' + q.bestDirs);
  if (lv >= T.RAMP_LEVELS) { topLv++; if (q.bestDirs >= T.BEST_DIRS[1] - 1) topFull++; }
  // 次要的誘餌：有一個位置只比最多少 gap 顆、而且就在 q.decoy
  const dm = ms.filter(m => m.idx === q.decoy)[0];
  ok(dm && dm.n === q.second, '誘餌位置 ' + q.decoy + ' 的顆數 ' + (dm && dm.n) + ' ＝ 第二多 ' + q.second);
  if (q.tricky) { trickyReq++; if (dm && Math.max.apply(null, runs(q.board, dm.idx)) > Math.max.apply(null, br) && Math.max.apply(null, br) <= T.TRICK_LEN && dm.dirs < bm.dirs) trickyHold++; }
  nearSum += ms.filter(m => m.n < q.best && m.n >= q.best - 3).length; nearN++;
  q.board.forEach(x => { if (x === B) blackSum++; });
  stoneSum += q.stones; boards++;
  const cs = ms.filter(m => T.isCorner(m.idx)); if (cs.length) { withCorner++; if (cs.some(m => m.n === q.best)) cornerBest++; }
}
ok(trickyReq === trickyHold, '要求「藏起來」的題目：最多那一手每個方向都 ≤ ' + T.TRICK_LEN + ' 顆，誘餌有更長的一條線、方向比較少：' + trickyHold + '／' + trickyReq);
console.log('有角落可下的題目 ' + withCorner + ' 題，其中角落是最多的 ' + cornerBest + ' 題（' + (100 * cornerBest / Math.max(1, withCorner)).toFixed(1) + '%）；要求藏起來的 ' + trickyReq + '／' + total);
ok(withCorner > 0 && cornerBest / withCorner < 0.5, '偷吃步「下在角落」行不通：角落是最多的只有 ' + (100 * cornerBest / Math.max(1, withCorner)).toFixed(1) + '%');
ok(trickyReq > 50, '有相當多題要求藏起來：' + trickyReq);
ok(topFull / topLv > 0.95, '到頂的關卡，最多那一手幾乎都有 ' + T.BEST_DIRS[1] + ' 個方向（至少 ' + (T.BEST_DIRS[1] - 1) + '）：' + topFull + '／' + topLv);
const share = blackSum / stoneSum; console.log('黑棋占 ' + (100 * share).toFixed(1) + '%；每題平均有 ' + (nearSum / nearN).toFixed(2) + ' 個下法只比最多少 1～3 顆');
ok(share > 0.35 && share < 0.65, '黑白大約各一半：黑棋占 ' + (100 * share).toFixed(1) + '%');
ok(nearSum / nearN > 1.2, '平均每題有 1 個以上的誘餌（只差 1～3 顆）：' + (nearSum / nearN).toFixed(2));
// 高階關卡的差距確實只差 1
{ let g1 = 0; for (let i = 0; i < 100; i++) if (T.makeLevel(T.RAMP_LEVELS, rnd).gap === 1) g1++; ok(g1 === 100, '到頂的關卡：最多與第二多一律只差 1：' + g1 + '／100'); }
// 方向數隨關卡增加
{ const avg = lv => { let t = 0; for (let i = 0; i < 80; i++) t += T.makeLevel(lv, rnd).bestDirs; return t / 80; }; const a1 = avg(1), a2 = avg(T.RAMP_LEVELS); ok(a2 > a1 + 1.5 && Math.abs(a1 - T.BEST_DIRS[0]) < 0.6 && Math.abs(a2 - T.BEST_DIRS[1]) < 0.6, '最多那一手的方向數隨關卡增加：第 1 關 ' + a1.toFixed(2) + '、到頂 ' + a2.toFixed(2)); }
// 同一個亂數種子，出的題一樣
{ const q1 = T.makeLevel(20, rng(5)), q2 = T.makeLevel(20, rng(5)); ok(Array.from(q1.board).join() === Array.from(q2.board).join(), '同一個種子出同一題'); }
// 效能
for (const lv of [1, 12, 24, 40]) { const t0 = Date.now(); for (let i = 0; i < 30; i++) T.makeLevel(lv, rnd); const per = (Date.now() - t0) / 30; console.log('第' + lv + '關 出題平均 ' + per.toFixed(1) + ' 毫秒'); ok(per < 150, '第 ' + lv + ' 關出題夠快：' + per.toFixed(1)); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_reversi.js'), css = rd('../../css/games/reaction_reversi.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 2800/.test(src) && /reversi-count--best/.test(src), '失敗停格 2 秒以上、最多的數字標綠');
  ok(/\.reversi-count--best \{ background: var\(--c-ok\);/.test(css) && /\.reversi-cell--bad \{[^}]*var\(--c-bad-light\)/.test(css), '綠色、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_reversi.js'") > 0 && /你是黑棋/.test(G.rule), 'boot.js 有載入、玩法說明寫了你是黑棋'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
