// 堵住五子（gomoku，企劃 233）的純函式檢查：連五判斷、致勝點、「白棋會贏」搜尋、唯一擋法（用另一套不靠視窗的窮舉獨立驗證）、難度線性、題型
const { game, rng, seedOf } = require('./load.js');
require('../../js/gomoku_bank.js');          // 題庫（V1.36.0）：window.GOMOKU_BANK，要在遊戲檔載入之前就在
const G = game('reaction_gomoku.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261106), rnd = rng(SEED);
const N = T.BOARD, B = T.BLACK, W = T.WHITE;
const at = (r, c) => r * N + c;

// ── 難度 ──
ok(T.stonesFor(1) === T.STONES[0] && T.stonesFor(T.RAMP_LEVELS) === T.STONES[1] && T.stonesFor(99) === T.STONES[1], '棋子數 ' + T.STONES);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.decoysFor(1) === T.DECOYS[0] && T.decoysFor(T.RAMP_LEVELS) === T.DECOYS[1], '假威脅組數 ' + T.DECOYS);
ok(T.cornerPFor(T.CORNER_FROM - 1) === 0 && T.cornerPFor(T.CORNER_FROM) > 0 && Math.abs(T.cornerPFor(T.RAMP_LEVELS) - T.CORNER_P[1]) < 1e-9, '交叉題型的機率：第 ' + T.CORNER_FROM + ' 關起出現、到頂 ' + T.CORNER_P[1]);
for (let l = 2; l <= 60; l++) ok(T.stonesFor(l) >= T.stonesFor(l - 1) && T.timeMs(l) >= T.timeMs(l - 1) && T.decoysFor(l) >= T.decoysFor(l - 1) && T.cornerPFor(l) >= T.cornerPFor(l - 1), '單調 ' + l);
// 線性：相鄰兩關的差距大致相等（四捨五入造成的 ±1 不算）
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.stonesFor(l) - T.stonesFor(l - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '棋子數是線性成長：每關增加 ' + Math.min(...d) + '～' + Math.max(...d)); }

// ── 手工盤面：連五判斷 ──
function mk(rows) { const b = T.newBoard(N); rows.forEach((s, r) => { for (let c = 0; c < s.length && c < N; c++) b[at(r, c)] = s[c] === 'X' ? B : s[c] === 'O' ? W : 0; }); return b; }
{ // 橫線四顆白、右邊空：下在右邊就連五
  const b = mk(['XOOOO.']); ok(T.fiveThrough(b, N, at(0, 5), W) && T.fiveThrough(b, N, at(0, 5), W).length === 5, '橫向 OOOO 加一顆連五');
  ok(T.winCells(b, N, W).join() === String(at(0, 5)), '只有一個致勝點（左邊被黑棋堵住）');
  ok(T.winCells(b, N, B).length === 0, '黑棋沒有致勝點'); }
{ const b = mk(['.OOOO.']); ok(T.winCells(b, N, W).join() === [at(0, 0), at(0, 5)].join(), '兩端都空的四（活四）：兩個致勝點'); }
{ const b = mk(['OO.OO']); ok(T.winCells(b, N, W).join() === String(at(0, 2)), '跳四 OO_OO：中間是致勝點'); }
{ const b = mk(['O.......', '.O......', '..O.....', '...O....']); ok(T.winCells(b, N, W).join() === String(at(4, 4)), '斜線四顆（右下方向）：致勝點在 (4,4)'); }
{ const b = mk(['....O...', '...O....', '..O.....', '.O......']); ok(T.winCells(b, N, W).join() === String(at(4, 0)), '斜線四顆（左下方向）：致勝點在 (4,0)（另一端出界）'); }
{ const b = mk(['O', 'O', 'O', 'O']); ok(T.winCells(b, N, W).join() === String(at(4, 0)), '直線四顆：致勝點在下一格（上面是棋盤邊緣）'); }
{ const b = mk(['OOOOO']); const f = T.fiveThrough(b, N, at(0, 2), W); ok(f && f.length === 5 && f[0] === 0, 'fiveThrough 也可以問已經在棋盤上的棋子'); }
{ const b = mk(['OOOO']); ok(!T.fiveThrough(b, N, at(0, 4), B) && T.winCells(b, N, W).join() === String(at(0, 4)), '黑棋下的位置不會算成白棋連五（顏色分開算）'); }
{ // 六連也算
  const b = mk(['OOO.OOO']); const f = T.fiveThrough(b, N, at(0, 3), W); ok(f && f.length === 7, '中間補上連成七顆：回傳整條線 ' + (f && f.length)); }

// ── 手工盤面：白棋會不會贏 ──
{ const b = mk(['XOOOO.']); const r = T.whiteWins(b, N, 2); ok(r.win && r.pv.length === 1 && r.pv[0].cell === at(0, 5) && r.pv[0].c === W, '有現成致勝點：贏，致勝的一手就是它'); }
{ const b = mk(['XOOOO.']); b[at(0, 5)] = B; ok(!T.whiteWins(b, N, 2).win, '黑棋擋住唯一的致勝點：白棋贏不了'); }
{ // 活四：兩端都空 → 贏
  const b = mk(['.OOOO.']); ok(T.whiteWins(b, N, 0).win, '活四直接贏'); }
{ // 活三：白棋下一顆就變活四 → depth 1 贏（雙致勝點），depth 0 不贏
  const b = mk(['', '', '..OOO']); ok(!T.whiteWins(b, N, 0).win && T.whiteWins(b, N, 1).win, '活三：預備 1 步（下成活四）就贏，預備 0 步不算贏'); }
{ // 交叉 X 的兩個三：
  const b = T.newBoard(N); [[1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [0, 3]].forEach(([r, c]) => { b[at(6 + r, 6 + c)] = W; });
  ok(T.whiteWins(b, N, 1).win, '兩個三顆交叉：白棋下在交叉點 → 雙四 → 贏');
  b[at(6, 6)] = B; ok(!T.whiteWins(b, N, 2).win, '黑棋下在交叉點：白棋兩條三顆都被擋住一端，贏不了（在深度 2 內）'); }

// ── 手工盤面：isGood（唯一擋法）──
{ const bb = T.newBoard(N); [3, 4, 5, 6].forEach(c => { bb[at(6, c)] = W; }); bb[at(6, 2)] = B;
  ok(T.isGood(bb, N, at(6, 7), 2), '被堵一端的四：唯一的擋法是另一端');
  ok(!T.isGood(bb, N, at(6, 8), 2), '答案指到別的格：不是好題');
  ok(T.solutionCells(bb, N, 2).join() === String(at(6, 7)), 'solutionCells 只有一格：' + T.solutionCells(bb, N, 2));
  const live = T.newBoard(N); [3, 4, 5, 6].forEach(c => { live[at(6, c)] = W; });
  ok(!T.isGood(live, N, at(6, 7), 2) && !T.isGood(live, N, at(6, 2), 2), '兩端都空的四（活四）：擋不住，不是題目'); }
{ // 兩端都被堵死的四：白棋沒有威脅 → 不是題目（whiteWins 為 false）
  const b = T.newBoard(N); [3, 4, 5, 6].forEach(c => { b[at(6, c)] = W; }); b[at(6, 2)] = B; b[at(6, 7)] = B;
  ok(!T.whiteWins(b, N, 2).win, '兩端都被堵死的四（假威脅）：白棋贏不了');
  ok(T.winCells(b, N, W).length === 0, '假威脅沒有致勝點'); }
{ // 黑棋反擊：黑棋有 3 顆在同一視窗 → 不是好題
  const b = T.newBoard(N); [3, 4, 5, 6].forEach(c => { b[at(6, c)] = W; }); b[at(6, 2)] = B;
  b[at(0, 0)] = B; b[at(0, 1)] = B; b[at(0, 2)] = B;
  ok(T.blackCounter(b, N) && !T.isGood(b, N, at(6, 7), 2), '黑棋有三顆連在一起（有反擊的苗頭）：不出這種題'); }
// 模板
{ const t = T.placeFour(N, 6, 3, 0, false); ok(t && t.white.join() === [at(6, 3), at(6, 4), at(6, 5), at(6, 6)].join() && t.x === at(6, 7) && t.black.join() === String(at(6, 2)), 'placeFour 直向：白四顆、致勝點在第 4 格、堵住的黑棋在第 -1 格'); }
{ const t = T.placeFour(N, 6, 3, 0, true); ok(t && t.x === at(6, 5) && t.white.join() === [at(6, 3), at(6, 4), at(6, 6), at(6, 7)].join(), 'placeFour 跳四：致勝點在中間'); }
{ ok(T.placeFour(N, 0, 11, 0, false) === null, '出界回傳 null'); const t = T.placeFour(N, 6, 0, 0, false); ok(t && t.black.length === 0, '堵住的一端是棋盤邊緣：不放黑棋'); }
{ const t = T.placeCorner(N, 6, 6, 0, 1); ok(t && t.white.length === 6 && t.x === at(6, 6), 'placeCorner 兩個方向'); ok(T.placeCorner(N, 6, 6, 0, 4) === null && T.placeCorner(N, 6, 6, 2, 2) === null, '同一條線（相同或相反方向）回傳 null'); }
{ const t = T.placeDecoy(N, 6, 3, 0, 0); ok(t && t.white.length === 4 && t.black.length === 2, '假威脅（四）'); const t3 = T.placeDecoy(N, 6, 3, 0, 1); ok(t3 && t3.white.length === 3 && t3.black.length === 2, '假威脅（三）'); }

// ── 獨立驗證用的另一套窮舉：不靠 5 格視窗，白棋的每一個空格都試過 ──
function bruteWin(b, depth) {
  if (T.winCells(b, N, W).length) return true;
  if (depth < 1) return false;
  for (let m = 0; m < N * N; m++) {
    if (b[m] !== 0) continue;
    b[m] = W; const nw = T.localWinCells(b, N, m, W);
    if (nw.length >= 2) { b[m] = 0; return true; }
    if (nw.length === 1 && depth >= 2) {
      const w = nw[0]; b[w] = B;
      const blackFive = T.fiveThrough(b, N, w, B) || T.localWinCells(b, N, w, B).length;
      const sub = !blackFive && bruteWin(b, depth - 1); b[w] = 0;
      if (sub) { b[m] = 0; return true; }
    }
    b[m] = 0;
  }
  return false;
}
function allSolutions(b, depth) { const out = []; for (let c = 0; c < N * N; c++) { if (b[c] !== 0) continue; b[c] = B; if (!bruteWin(b, depth)) out.push(c); b[c] = 0; } return out; }

// ── 整關：獨立窮舉驗證「全盤只有 q.x 一格擋得住」 ──
let kinds = { four: 0, corner: 0, bank: 0 }, tiers = { 0: 0, 1: 0, 2: 0, 3: 0 }, decoySum = 0, checked = 0, total = 0;
const CHECK_EVERY = 6;     // 窮舉驗證比較慢，每 6 題驗 1 題（但整套 600 題的基本條件都驗）
for (let i = 0; i < 400; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++; kinds[q.kind]++; tiers[q.tier]++; decoySum += q.decoys;
  ok(q.depth === (q.kind === 'bank' ? T.BANK_DEPTH : T.WIN_DEPTH), '驗證深度：模板 ' + T.WIN_DEPTH + '、題庫 ' + T.BANK_DEPTH);
  ok(q.kind !== 'bank' || lv >= T.BANK_FROM, '第 ' + T.BANK_FROM + ' 關以前不會出題庫題型');
  const stones = Array.from(q.board).filter(x => x).length;
  ok(q.board.length === N * N && Array.from(q.board).every(x => x === 0 || x === B || x === W), '盤面合法');
  ok(q.stones === stones && (q.kind === 'bank' ? stones >= T.stonesFor(lv) - 2 && stones <= T.stonesFor(lv) + T.STONE_SLACK + 2 : Math.abs(stones - T.stonesFor(lv)) <= 2), '第 ' + lv + ' 關：棋子 ' + stones + '（目標 ' + T.stonesFor(lv) + '，' + q.kind + '）');
  ok(q.board[q.x] === 0, '答案那一格是空的');
  ok(q.decoys <= T.decoysFor(lv), '假威脅組數不超過目標：' + q.decoys + '／' + T.decoysFor(lv));
  ok(T.winCells(q.board, N, B).length === 0 && !T.blackCounter(q.board, N), '黑棋沒有現成的五顆，也沒有反擊苗頭');
  ok(T.whiteWins(q.board, N, q.depth).win, '黑棋不下，白棋會贏');
  ok(T.isGood(q.board, N, q.x, q.depth) && T.solutionCells(q.board, N, q.depth).join() === String(q.x), '第 ' + lv + ' 關：唯一擋法（程式內建驗證，深度 ' + q.depth + '）');
  if (q.kind === 'corner') ok(T.winCells(q.board, N, W).length === 0, '交叉題型：現在還沒有致勝點（要先下在交叉點才變雙四）');
  else if (q.kind === 'bank') { ok(T.winCells(q.board, N, W).length === 0, '題庫題型：白棋現在沒有現成的四（威脅是看不出來的連環）'); ok(q.tier >= 1 && q.tier <= 3, '題庫級別 1～3'); }
  else ok(T.winCells(q.board, N, W).join() === String(q.x), '四顆一排題型：現在就有致勝點，而且就是答案那一格');
  if (i % CHECK_EVERY === 0 && q.kind !== 'bank') {
    checked++;
    const sol = allSolutions(q.board, T.WIN_DEPTH);
    ok(sol.length === 1 && sol[0] === q.x, '【獨立窮舉】第 ' + lv + ' 關（' + q.kind + '）：全盤能擋住的格子 ' + JSON.stringify(sol) + '，答案 ' + q.x);
    // 正確答案要撐得更久
    q.board[q.x] = B; ok(!bruteWin(q.board, T.HOLD_DEPTH), '【獨立窮舉】答案撐過 ' + T.HOLD_DEPTH + ' 步預備'); q.board[q.x] = 0;
  }
}
console.log('題型：四顆一排 ' + kinds.four + '、兩個三顆交叉 ' + kinds.corner + '、題庫 ' + kinds.bank + '（D1 ' + tiers[1] + '／D2 ' + tiers[2] + '／D3 ' + tiers[3] + '）；平均假威脅 ' + (decoySum / total).toFixed(2) + ' 組；獨立窮舉驗證了 ' + checked + ' 題（模板題型）');
ok(kinds.corner > 10 && kinds.four > 40 && kinds.bank > 150 && tiers[1] > 20 && tiers[2] > 40 && tiers[3] > 20, '四種題型都有出現（模板兩種、題庫三級）');
// ── V1.36.0 題庫：每一題都用目前的遊戲判斷重新驗證過 ──
{ const bank = window.GOMOKU_BANK; ok(Array.isArray(bank) && bank.length >= 300, '題庫有 ' + (bank && bank.length) + ' 題');
  const cnt = { 1: 0, 2: 0, 3: 0 }; let placeable = 0, tried = 0;
  bank.forEach((e, idx) => {
    ok(e.length === 5 && [1, 2, 3].includes(e[0]) && Number.isInteger(e[1]) && Number.isInteger(e[2]) && e[3].length % 2 === 0 && e[4].length % 2 === 0 && e[3].length >= 8, '題庫第 ' + idx + ' 題格式：[級別, 答案r, 答案c, 白棋…, 黑棋…]'); cnt[e[0]]++;
    if (idx % 3 !== 0) return;                                  // 每 3 題驗 1 題（重新驗證比較慢）
    tried++;
    let good = false;
    for (let tr = 0; tr < 40 && !good; tr++) {
      const p = T.placeBank(e, N, rnd); if (!p) continue;
      const b = T.newBoard(N); p.white.forEach(k => { b[k] = W; }); p.black.forEach(k => { b[k] = B; });
      if (p.white.length !== e[3].length / 2 || p.black.length !== e[4].length / 2 || b[p.x] !== 0) { ok(false, '題庫第 ' + idx + ' 題放上棋盤後棋子數不對'); break; }
      if (T.isGood(b, N, p.x, T.BANK_DEPTH)) good = true;
    }
    if (good) placeable++;
  });
  console.log('題庫 D1 ' + cnt[1] + '／D2 ' + cnt[2] + '／D3 ' + cnt[3] + '；抽驗 ' + tried + ' 題，翻轉平移後重新驗證通過 ' + placeable + ' 題');
  ok(cnt[1] >= 100 && cnt[2] >= 100 && cnt[3] >= 30, '三級都有足夠的題目');
  ok(placeable >= tried * 0.97, '抽驗的題庫題目，絕大多數（' + placeable + '／' + tried + '）能在棋盤上找到一種翻轉平移的放法，通過唯一擋法的驗證'); }
// 題型比例隨關卡變化
{ ok(T.tierWeights(T.BANK_FROM - 1).join() === '1,0,0,0', '第 ' + (T.BANK_FROM - 1) + ' 關以前只有模板');
  for (const lv of [T.BANK_FROM, 10, 20, T.RAMP_LEVELS, 60]) { const w = T.tierWeights(lv); ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9 && w.every(x => x >= 0), '第 ' + lv + ' 關題型比例加起來是 1：' + w.map(x => x.toFixed(2))); }
  const w1 = T.tierWeights(T.BANK_FROM), w2 = T.tierWeights(T.RAMP_LEVELS); ok(w1[0] > w2[0] && w1[3] < w2[3] && w1[1] > w2[1] && w2[2] > w1[2], '越後面，模板越少、D3 越多'); }
{ const e = window.GOMOKU_BANK[0]; let seen = new Set(); for (let k = 0; k < 200; k++) { const p = T.placeBank(e, N, rnd); if (p) seen.add(p.white.join()); } ok(seen.size > 30, 'placeBank 每次翻轉平移的結果都不一樣：' + seen.size + ' 種'); }
// 前 4 關（第 5 關才有交叉題型）
{ let c = 0; for (let i = 0; i < 100; i++) if (T.makeLevel(1 + (i % 4), rnd).kind === 'corner') c++; ok(c === 0, '前 ' + (T.CORNER_FROM - 1) + ' 關不會出交叉題型：' + c); }
// 到頂關卡的假威脅都有放到
{ let sum = 0; for (let i = 0; i < 40; i++) sum += T.makeLevel(T.RAMP_LEVELS, rnd).decoys; ok(sum / 40 >= T.DECOYS[1] - 0.6, '到頂關卡的假威脅平均 ' + (sum / 40).toFixed(2) + ' 組（目標 ' + T.DECOYS[1] + '）'); }
// 答案位置不要集中在棋盤中央（四個方向、整片棋盤都會出現）
{ const rows = new Set(), cols = new Set(); for (let i = 0; i < 300; i++) { const q = T.makeLevel(1 + (i % 30), rnd); rows.add(Math.floor(q.x / N)); cols.add(q.x % N); } ok(rows.size >= 11 && cols.size >= 11, '答案位置分散在棋盤各處：列 ' + rows.size + '／' + N + '、欄 ' + cols.size + '／' + N); }
// 效能
for (const lv of [1, 6, 12, 24, 40]) { const t0 = Date.now(); let worst = 0; for (let i = 0; i < 30; i++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 30; console.log('第' + lv + '關 出題平均 ' + per.toFixed(1) + ' 毫秒、最慢 ' + worst); ok(per < 100 && worst < 600, '第 ' + lv + ' 關出題夠快：' + per.toFixed(1) + '／' + worst); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_gomoku.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 500 \+ pv\.length \* 650 \+ 2000/.test(src) && /gmk-five/.test(src), '失敗：白棋下完致勝手後再停格 2 秒、紅線連五');
  ok(/\.gmk-five \{[^}]*var\(--c-bad-light\)/.test(css) && /\.gmk-ring \{[^}]*var\(--c-ok\)/.test(css), '紅線、綠圈用 CSS 變數');
  ok(boot.indexOf("'js/reaction_gomoku.js'") > 0 && /唯一/.test(G.rule), 'boot.js 有載入、玩法說明寫了唯一的擋法'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
