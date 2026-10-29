// 翻最多棋（reversi，企劃 232）的純函式檢查：黑白棋規則（夾住就翻、八個方向）、出題條件（最多與第二多的差距、藏起來、黑棋有得下）、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_reversi.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261105), rnd = rng(SEED);
const N = 8, B = 1, W = -1;
const at = (r, c) => r * N + c;

// ── 難度 ──
ok(T.stonesFor(1) === T.STONES[0] && T.stonesFor(T.RAMP_LEVELS) === T.STONES[1] && T.stonesFor(99) === T.STONES[1], '棋子數 ' + T.STONES);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.gapMaxFor(1) === T.GAP_MAX[0] && T.gapMaxFor(T.RAMP_LEVELS) === 1 && Math.abs(T.trickPFor(T.RAMP_LEVELS) - T.TRICK_P[1]) < 1e-9 && T.trickPFor(1) === 0, '差距上限 ' + T.GAP_MAX + '、藏起來的機率 ' + T.TRICK_P);
for (let l = 2; l <= 60; l++) ok(T.stonesFor(l) >= T.stonesFor(l - 1) && T.gapMaxFor(l) <= T.gapMaxFor(l - 1) && T.timeMs(l) <= T.timeMs(l - 1) && T.trickPFor(l) >= T.trickPFor(l - 1), '單調 ' + l);
// ── 規則：標準開局黑棋有 4 個下法、各翻 1 顆 ──
{ const b = T.initBoard(), ms = T.legalMoves(b, B);
  ok(T.countStones(b) === 4 && ms.length === 4 && ms.every(m => m.n === 1 && m.dirs === 1), '開局：黑棋 4 個合法下法、各翻 1 顆');
  ok(ms.map(m => m.idx).sort((a, b) => a - b).join() === [at(2, 3), at(3, 2), at(4, 5), at(5, 4)].join(), '開局黑棋能下的格子：(2,3)(3,2)(4,5)(5,4)');
  const ws = T.legalMoves(b, W); ok(ws.length === 4, '開局白棋也是 4 個'); }
// ── 手工盤面：橫、直、斜、多方向、沒夾住 ──
function mk(rows) { const b = new Int8Array(64); rows.forEach((s, r) => { for (let c = 0; c < 8; c++) b[at(r, c)] = s[c] === 'B' ? B : s[c] === 'W' ? W : 0; }); return b; }
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
// ── 整關 ──
let withCorner = 0, cornerBest = 0, trickyReq = 0, trickyHold = 0, total = 0;
for (let i = 0; i < 600; i++) {
  const lv = 1 + (i % 36), q = T.makeLevel(lv, rnd); total++;
  ok(q.board.length === 64 && Array.from(q.board).every(x => x === 0 || x === B || x === W), '盤面合法');
  ok(Math.abs(q.stones - T.stonesFor(lv)) <= 1 && q.stones === T.countStones(q.board), '第 ' + lv + ' 關：棋子數 ' + q.stones + '（目標 ' + T.stonesFor(lv) + '）');
  const ms = T.legalMoves(q.board, B);
  ok(ms.length === q.moves.length && ms.length >= T.MIN_MOVES, '黑棋至少有 ' + T.MIN_MOVES + ' 個合法下法：' + ms.length);
  const rk = T.ranking(ms);
  ok(rk.best === q.best && rk.second === q.second && rk.gap === q.gap && rk.bestIdxs.join() === q.bestIdxs.join(), '附的 best／second／gap 跟重算的一樣');
  ok(q.gap >= 1 && q.gap <= T.gapMaxFor(lv), '第 ' + lv + ' 關：最多與第二多差 ' + q.gap + '（要 1～' + T.gapMaxFor(lv) + '）');
  if (q.tricky) { trickyReq++; const best = ms.filter(m => m.n === q.best); if (best.every(m => m.dirs >= 3 || m.onlyDiag)) trickyHold++; }
  const cs = ms.filter(m => T.isCorner(m.idx)); if (cs.length) { withCorner++; if (cs.some(m => m.n === q.best)) cornerBest++; }
}
ok(trickyReq === trickyHold, '要求「藏起來」的題目，最多的下法都是「3 個以上方向」或「只有斜線」：' + trickyHold + '／' + trickyReq);
console.log('有角落可下的題目 ' + withCorner + ' 題，其中角落是（並列）最多的 ' + cornerBest + ' 題（' + (100 * cornerBest / Math.max(1, withCorner)).toFixed(1) + '%）；要求藏起來的 ' + trickyReq + '／' + total);
ok(withCorner > 0 && cornerBest / withCorner < 0.5, '偷吃步「下在角落」行不通：角落是最多的只有 ' + (100 * cornerBest / Math.max(1, withCorner)).toFixed(1) + '%');
ok(trickyReq > 50, '有相當多題要求藏起來：' + trickyReq);
// 高階關卡的差距確實只差 1
{ let g1 = 0; for (let i = 0; i < 100; i++) if (T.makeLevel(T.RAMP_LEVELS, rnd).gap === 1) g1++; ok(g1 === 100, '到頂的關卡：最多與第二多一律只差 1：' + g1 + '／100'); }
// 效能
for (const lv of [1, 12, 24, 40]) { const t0 = Date.now(); for (let i = 0; i < 30; i++) T.makeLevel(lv, rnd); const per = (Date.now() - t0) / 30; console.log('第' + lv + '關 出題平均 ' + per.toFixed(1) + ' 毫秒'); ok(per < 150, '第 ' + lv + ' 關出題夠快：' + per.toFixed(1)); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_reversi.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 2800/.test(src) && /rvs-count--best/.test(src), '失敗停格 2 秒以上、最多的數字標綠');
  ok(/\.rvs-count--best \{ background: var\(--c-ok\);/.test(css) && /\.rvs-cell--bad \{[^}]*var\(--c-bad-light\)/.test(css), '綠色、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_reversi.js'") > 0 && /你是黑棋/.test(G.rule), 'boot.js 有載入、玩法說明寫了你是黑棋'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
