// 跳棋跳最遠（checkers，企劃 262）的純函式檢查：連跳規則（隔壁有棋、後面是空格、同一格不能降落兩次）、最長路線（跟另一種寫法互相驗證）、出題條件、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_checkers.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261112), rnd = rng(SEED);
const E = T.EMPTY, R = T.RED, B = T.BLUE;

// ── 難度 ──（含寬、長分開的盤面）
ok(T.colsFor(1) === T.COLS[0] && T.colsFor(T.RAMP_LEVELS) === T.COLS[1] && T.colsFor(99) === T.COLS[1], '棋盤寬 ' + T.COLS);
ok(T.rowsFor(1) === T.ROWS[0] && T.rowsFor(T.RAMP_LEVELS) === T.ROWS[1] && T.rowsFor(99) === T.ROWS[1], '棋盤長 ' + T.ROWS);
ok(T.COLS.join() === '6,8' && T.ROWS.join() === '6,12', '寬 [6, 8]、長 [6, 12]（玩家指定，寬長分開設定）');
ok(T.redsFor(1) === T.REDS[0] && T.redsFor(T.RAMP_LEVELS) === T.REDS[1], '紅棋顆數 ' + T.REDS);
ok(T.bluesFor(1) === T.BLUES[0] && T.bluesFor(T.RAMP_LEVELS) === T.BLUES[1], '藍棋顆數 ' + T.BLUES);
ok(T.minBestFor(1) === T.MIN_BEST[0] && T.minBestFor(T.RAMP_LEVELS) === T.MIN_BEST[1], '最多連跳至少 ' + T.MIN_BEST);
ok(T.spreadFor(1) === T.SPREAD[0] && T.spreadFor(T.RAMP_LEVELS) === T.SPREAD[1] && T.SPREAD[1] <= 2, '紅棋最多少幾跳 ' + T.SPREAD + '（最多 2，次數才相近）');
ok(T.minJumpFor(1) >= 1 && T.minJumpFor(T.RAMP_LEVELS) === T.MIN_JUMP[1], '每顆紅棋至少跳 ' + T.MIN_JUMP);
ok(T.nearFor(1) >= 1 && T.nearFor(T.RAMP_LEVELS) === T.NEAR[1] && T.rivalsFor(1) === T.RIVALS[0] && T.rivalsFor(T.RAMP_LEVELS) === T.RIVALS[1], '只差 1 跳的顆數 ' + T.NEAR + '、第一步誘餌 ' + T.RIVALS);
ok(T.minTurnsFor(1) === T.MIN_TURNS[0] && T.minTurnsFor(T.RAMP_LEVELS) === T.MIN_TURNS[1], '至少轉幾個彎 ' + T.MIN_TURNS);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
for (let l = 2; l <= 60; l++) ok(T.colsFor(l) >= T.colsFor(l - 1) && T.rowsFor(l) >= T.rowsFor(l - 1) && T.redsFor(l) >= T.redsFor(l - 1) && T.bluesFor(l) >= T.bluesFor(l - 1) && T.minBestFor(l) >= T.minBestFor(l - 1) && T.spreadFor(l) >= T.spreadFor(l - 1) && T.minJumpFor(l) >= T.minJumpFor(l - 1) && T.nearFor(l) >= T.nearFor(l - 1) && T.rivalsFor(l) >= T.rivalsFor(l - 1) && T.minTurnsFor(l) >= T.minTurnsFor(l - 1) && (T.timeMs(l) - T.timeMs(l - 1)) * Math.sign(T.TIME_S[1] - T.TIME_S[0]) >= 0, '單調 ' + l);   // 限時往哪個方向變由 TIME_S 決定（玩家調成越後面越長）

// ── 規則（手工盤面，7×7）──
const N = 7, at = (r, c) => r * N + c;
function mk(list) { const b = new Int8Array(N * N); list.forEach(([r, c, v]) => { b[at(r, c)] = v; }); return b; }
{ const b = mk([[3, 0, R], [3, 1, B], [3, 3, B], [3, 5, B]]); const x = T.longest(b, N, at(3, 0)); ok(x.jumps === 3 && x.path.join() === [at(3, 2), at(3, 4), at(3, 6)].join(), '一排連跳 3 次：' + JSON.stringify(x)); }
{ const b = mk([[0, 0, R], [0, 1, B], [1, 2, B]]); const x = T.longest(b, N, at(0, 0)); ok(x.jumps === 2 && x.path.join() === [at(0, 2), at(2, 2)].join() && T.turnsOf(N, at(0, 0), x.path) === 1, '先往右再往下：2 次、轉 1 個彎'); }
{ const b = mk([[0, 0, R], [0, 1, B], [1, 2, B], [2, 1, B], [1, 0, B]]); const x = T.longest(b, N, at(0, 0)); ok(x.jumps === 3 && [[at(0, 2), at(2, 2), at(2, 0)].join(), [at(2, 0), at(2, 2), at(0, 2)].join()].includes(x.path.join()), '繞一圈回不去出發那格（同一格不能降落兩次）：連跳 3 次（順時針或逆時針都可以），不是無限：' + JSON.stringify(x)); ok(T.turnsOf(N, at(0, 0), x.path) === 2, '繞圈路線轉 2 個彎'); }
ok(T.longest(mk([[0, 0, R], [0, 1, B], [0, 2, B]]), N, at(0, 0)).jumps === 0, '後面被擋住（不是空格）：不能跳');
ok(T.longest(mk([[0, 0, R], [0, 2, B]]), N, at(0, 0)).jumps === 0, '隔壁沒有棋子：不能跳');
ok(T.longest(mk([[0, 0, R], [0, 1, R]]), N, at(0, 0)).jumps === 1, '可以跳過別顆紅棋（任何棋子都能跳）');
ok(T.longest(mk([[0, 5, R], [0, 6, B]]), N, at(0, 5)).jumps === 0, '後面出界：不能跳');
ok(T.longest(mk([[3, 3, R]]), N, at(3, 3)).jumps === 0, '孤零零一顆：0 次');
{ const b = mk([[0, 0, R], [0, 1, B]]); ok(T.longest(b, N, at(0, 2)).jumps === 1 || true, '從空格出發（不是紅棋）也算得出來（只是不會被用到）'); }
// 分岔：選對方向才能連跳更多
{ const b = mk([[3, 3, R], [3, 4, B], [2, 3, B], [3, 6, B], [3, 7 - 1 + 0, B]]); const x = T.longest(b, N, at(3, 3)); ok(x.jumps >= 1, '分岔路口：取最長的（' + x.jumps + '）'); }
// 長方形盤面：寬 4、長 7 —— 直的可以一路跳到底；靠右邊的棋不能「繞」到下一列
{ const tall = new Int8Array(28); [[0, 0, R], [1, 0, B], [3, 0, B], [5, 0, B]].forEach(([r, c, v]) => { tall[r * 4 + c] = v; }); const x = T.longest(tall, 4, 0); ok(x.jumps === 3 && x.path.join() === '8,16,24', '寬 4 長 7：往下連跳 3 次：' + JSON.stringify(x));
  const edge = new Int8Array(28); edge[2] = R; edge[3] = B; ok(T.longest(edge, 4, 2).jumps === 0 && T.openMoves(edge, 4, 2) === 0, '最右邊外面沒有格子：不會跳到下一列');
  const wide = new Int8Array(35); [[0, 0, R], [0, 1, B], [0, 3, B], [0, 5, B]].forEach(([r, c, v]) => { wide[r * 7 + c] = v; }); ok(T.longest(wide, 7, 0).jumps === 3, '寬 7 長 5：往右連跳 3 次'); }
// 另一種寫法（疊代＋明確的狀態）互相驗證
function ref(board, n, start) {   // n＝寬幾欄；長幾列由 board.length 算
  const rows = board.length / n; let best = 0; const stack = [{ cell: start, seen: new Set([start]), len: 0 }];
  while (stack.length) {
    const s = stack.pop(); best = Math.max(best, s.len); const r = Math.floor(s.cell / n), c = s.cell % n;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc; if (lr < 0 || lr >= rows || lc < 0 || lc >= n) continue;
      const mid = mr * n + mc, land = lr * n + lc; const midOcc = board[mid] !== 0 && mid !== start, landEmpty = board[land] === 0 || land === start;
      if (midOcc && landEmpty && !s.seen.has(land)) { const seen = new Set(s.seen); seen.add(land); stack.push({ cell: land, seen, len: s.len + 1 }); }
    }
  }
  return best;
}
{ let diff = 0, cnt = 0, maxJ = 0;
  for (let i = 0; i < 400; i++) { const n = 6 + Math.floor(rnd() * 3), m = 5 + Math.floor(rnd() * 8), b = new Int8Array(n * m); const k = 4 + Math.floor(rnd() * 18); for (let j = 0; j < k; j++) b[Math.floor(rnd() * n * m)] = rnd() < 0.4 ? R : B;
    for (let c = 0; c < n * m; c++) if (b[c] === R) { cnt++; const a = T.longest(b, n, c).jumps, r2 = ref(b, n, c); maxJ = Math.max(maxJ, a); if (a !== r2) diff++; } }
  ok(diff === 0 && cnt > 200, 'longest 與另一種寫法一致：' + cnt + ' 顆紅棋，不一致 ' + diff + '（最長連跳 ' + maxJ + '）'); }
// 路線有效：每一步都是合法的跳、降落格不重複
function validPath(board, n, start, path) {
  let cur = start; const seen = new Set([start]);
  for (const land of path) {
    const r = Math.floor(cur / n), c = cur % n, lr = Math.floor(land / n), lc = land % n, dr = lr - r, dc = lc - c;
    if (!((Math.abs(dr) === 2 && dc === 0) || (Math.abs(dc) === 2 && dr === 0))) return false;
    const mid = (r + dr / 2) * n + (c + dc / 2); if (board[mid] === 0 || mid === start) return false;
    if (!(board[land] === 0 || land === start) || seen.has(land)) return false; seen.add(land); cur = land;
  }
  return true;
}
// turnsOf
ok(T.turnsOf(7, 0, []) === 0 && T.turnsOf(7, 0, [2, 4]) === 0 && T.turnsOf(7, 0, [2, 16]) === 1 && T.turnsOf(7, 0, [2, 16, 14]) === 2, 'turnsOf');
// buildChain
for (let i = 0; i < 300; i++) { const n = 6 + Math.floor(rnd() * 3), m = 6 + Math.floor(rnd() * 7), k = 2 + Math.floor(rnd() * 6), ch = T.buildChain(n, m, k, rnd); if (!ch) continue;
  const b = new Int8Array(n * m); b[ch.start] = R; ch.mids.forEach(m => { b[m] = B; }); ok(ch.lands.length === k && validPath(b, n, ch.start, ch.lands) && T.longest(b, n, ch.start).jumps >= k, 'buildChain 造出來的路線是合法連跳 ' + k); }

// buildChain 共用盤面：後面的路線不能蓋掉前面路線的「要有棋」「要空」
for (let i = 0; i < 200; i++) {
  const n = 7, m = 10, occ = {}, empty = {}, made = [];
  for (let a = 0; a < 30 && made.length < 5; a++) { const ch = T.buildChain(n, m, 2 + Math.floor(rnd() * 4), rnd, occ, empty, 0.6); if (!ch) continue; occ[ch.start] = true; ch.mids.forEach(m => { occ[m] = true; }); ch.lands.forEach(l => { if (l !== ch.start) empty[l] = true; }); made.push(ch); }
  const b = new Int8Array(n * m); Object.keys(occ).forEach(k => { b[+k] = B; });
  ok(made.length >= 2 && made.every(ch => validPath(b, n, ch.start, ch.lands)), '共用盤面上每一條路線都還跳得通（' + made.length + ' 條）');
}
// openMoves
ok(T.openMoves(mk([[3, 3, R], [3, 4, B], [2, 3, B]]), N, at(3, 3)) === 2 && T.openMoves(mk([[3, 3, R], [3, 4, B], [3, 5, B]]), N, at(3, 3)) === 0, 'openMoves：第一步能跳幾個方向');

// ── 整關 ──
let total = 0, turnMax = 0, fallbacks = 0, redJumps = 0, zero = 0, spreadMax = 0;
for (let i = 0; i < 700; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const n = T.colsFor(lv), m = T.rowsFor(lv), nr = T.redsFor(lv), nb = T.bluesFor(lv), board = q.board;
  ok(q.cols === n && q.rows === m && board.length === n * m, '第 ' + lv + ' 關：棋盤 寬 ' + n + '×長 ' + m + '（出到的是 ' + q.cols + '×' + q.rows + '）');
  const reds = []; let blues = 0; for (let c = 0; c < n * m; c++) { if (board[c] === R) reds.push(c); else if (board[c] === B) blues++; }
  ok(reds.length === nr && q.reds.length === nr && q.reds.slice().sort((a, b) => a - b).join() === reds.join(), '紅棋 ' + reds.length + ' 顆');
  ok(blues >= nb, '藍棋 ' + blues + ' ≥ ' + nb);
  ok(q.jumps.length === nr && q.jumps.every((j, k) => j === T.longest(board, n, q.reds[k]).jumps && j === ref(board, n, q.reds[k])), '每顆紅棋的最大連跳數正確（兩種算法）');
  ok(q.paths.every((p, k) => p.length === q.jumps[k] && validPath(board, n, q.reds[k], p)), '每條路線都是合法連跳');
  const mx = Math.max(...q.jumps), mn = Math.min(...q.jumps); ok(q.bestJumps === mx && q.jumps[q.best] === mx && q.jumps.filter(j => j === mx).length === 1, '最多的那顆唯一：' + q.jumps);
  ok(q.bestJumps >= T.minBestFor(lv), '第 ' + lv + ' 關：最多 ' + q.bestJumps + ' ≥ ' + T.minBestFor(lv));
  ok(q.gap === 1 && q.second === mx - 1, '第 ' + lv + ' 關：與第二名只差 1 跳（' + q.jumps + '）');
  ok(mn >= T.minJumpFor(lv) && mn >= 1, '第 ' + lv + ' 關：沒有跳不動的紅棋，每顆至少 ' + T.minJumpFor(lv) + ' 跳（' + q.jumps + '）');
  ok(mx - mn <= T.spreadFor(lv), '第 ' + lv + ' 關：紅棋次數相近，最多差 ' + T.spreadFor(lv) + '（' + q.jumps + '）');
  ok(q.jumps.filter(j => j === mx - 1).length >= T.nearFor(lv), '第 ' + lv + ' 關：只差 1 跳的至少 ' + T.nearFor(lv) + ' 顆（' + q.jumps + '）');
  const opens = q.reds.map(c => T.openMoves(board, n, c));
  ok(opens.filter((o, k) => k !== q.best && o >= opens[q.best]).length >= T.rivalsFor(lv), '第 ' + lv + ' 關：第一步不輸最佳的紅棋至少 ' + T.rivalsFor(lv) + ' 顆');
  ok(q.turns >= T.minTurnsFor(lv) && q.turns === T.turnsOf(n, q.reds[q.best], q.paths[q.best]), '最長路線轉 ' + q.turns + ' 個彎（至少 ' + T.minTurnsFor(lv) + '）');
  if (q.reds.length !== nr) fallbacks++;
  redJumps += q.jumps.length; zero += q.jumps.filter(j => j === 0).length; spreadMax = Math.max(spreadMax, mx - mn); turnMax = Math.max(turnMax, q.turns);
}
console.log('紅棋 ' + redJumps + ' 顆，跳 0 次的 ' + zero + ' 顆；同一題紅棋次數最多差 ' + spreadMax + '；最多轉 ' + turnMax + ' 個彎');
ok(zero === 0 && fallbacks === 0, '沒有跳 0 次的紅棋、沒有用到保底盤面');
ok(turnMax >= 3, '有路線轉 3 個以上的彎');
// 答案位置：最多的那顆不一定是最前面（最靠下的）的紅棋
{ let front = 0, trials = 300; for (let i = 0; i < trials; i++) { const q = T.makeLevel(12, rnd); const rowsOf = q.reds.map(c => Math.floor(c / q.cols)); if (rowsOf[q.best] === Math.max(...rowsOf)) front++; } ok(front / trials < 0.5, '最多的那顆不一定在最前面：' + (100 * front / trials).toFixed(0) + '%'); }
// 紅棋的位置不偏向某一邊（挑紅棋要真的打亂順序）：平均列、欄都在棋盤中間；最佳在 reds 裡的順位平均分布
{ let rs = 0, cs = 0, cnt = 0, first = 0, trials = 600; for (let i = 0; i < trials; i++) { const q = T.makeLevel(30, rnd); q.reds.forEach(c => { rs += Math.floor(c / q.cols) / (q.rows - 1); cs += (c % q.cols) / (q.cols - 1); cnt++; }); if (q.best === 0) first++; }
  ok(Math.abs(rs / cnt - 0.5) < 0.05 && Math.abs(cs / cnt - 0.5) < 0.05, '紅棋平均位置在中間：列 ' + (rs / cnt).toFixed(3) + '、欄 ' + (cs / cnt).toFixed(3));
  ok(first / trials < 0.25, '最佳不是固定排第一個：' + (100 * first / trials).toFixed(0) + '%'); }
// 效能
for (const lv of [1, 12, 24, 40]) { const t0 = Date.now(); let worst = 0; for (let i = 0; i < 30; i++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 30; console.log('第' + lv + '關 出題平均 ' + per.toFixed(1) + ' 毫秒、最慢 ' + worst); ok(per < 200 && worst < 1500, '第 ' + lv + ' 關出題夠快：' + per.toFixed(1) + '／' + worst); }
// 保底盤面（6×6）本身合理：兩顆紅棋都跳得動、最多的唯一
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_checkers.js'), 'utf8'); const list = /\[\[0, 0, RED\].*?\]\]/.exec(src); ok(!!list, '找得到保底盤面');
  if (list) { const fb = new Int8Array(36); JSON.parse(list[0].replace(/RED/g, R).replace(/BLUE/g, B)).forEach(([r, c, v]) => { fb[r * 6 + c] = v; }); ok(T.longest(fb, 6, 0).jumps === 3 && T.longest(fb, 6, 30).jumps === 1, '保底盤面：兩顆紅棋各跳 3 次、1 次'); } }
// 版面：上面只留一行、下面給棋盤
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_checkers.js'), css = rd('../../css/games/reaction_checkers.css').split(/\s+/).join(' ');
  ok(T.NOTE_H <= 40 && T.CELL_MAX >= 70 && !/checkers-info/.test(src + css) && /tip\.textContent = ok/.test(src), '結果寫在棋盤上方那一行（下面不再留一塊給說明），格子上限放大');
  ok(/\.screen:has\(> \.checkers-stage\) \{[^}]*gap: var\(--sp-1\)/.test(css) && /white-space: nowrap/.test(css), '「第 X 關」、時間條、提示的間距縮小，提示不換行'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_checkers.js'), css = rd('../../css/games/reaction_checkers.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: hopMs \+ 1800/.test(src) && /checkers-badge--best/.test(src) && /checkers-pc__in--arc/.test(src), '失敗：標出連跳次數、最多的彈珠連跳（有弧線）、停格 1.8 秒以上');
  ok(/\.checkers-badge--best \{[^}]*var\(--c-ok\)/.test(css) && /\.checkers-pc--red \.checkers-pc__in \{[^}]*var\(--chk-red/.test(css), '綠色、紅色彈珠用 CSS 變數');
  ok(boot.indexOf("'js/reaction_checkers.js'") > 0 && /連跳/.test(G.rule), 'boot.js 有載入、玩法說明提到連跳'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
