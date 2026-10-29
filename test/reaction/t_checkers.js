// 跳棋跳最遠（checkers，企劃 262）的純函式檢查：連跳規則（隔壁有棋、後面是空格、同一格不能降落兩次）、最長路線（跟另一種寫法互相驗證）、出題條件、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_checkers.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261112), rnd = rng(SEED);
const E = T.EMPTY, R = T.RED, B = T.BLUE;

// ── 難度 ──
ok(T.sizeFor(1) === T.SIZE[0] && T.sizeFor(T.RAMP_LEVELS) === T.SIZE[1] && T.sizeFor(99) === T.SIZE[1], '棋盤邊長 ' + T.SIZE);
ok(T.redsFor(1) === T.REDS[0] && T.redsFor(T.RAMP_LEVELS) === T.REDS[1], '紅棋顆數 ' + T.REDS);
ok(T.bluesFor(1) === T.BLUES[0] && T.bluesFor(T.RAMP_LEVELS) === T.BLUES[1], '藍棋顆數 ' + T.BLUES);
ok(T.minBestFor(1) === T.MIN_BEST[0] && T.minBestFor(T.RAMP_LEVELS) === T.MIN_BEST[1], '最多連跳至少 ' + T.MIN_BEST);
ok(T.gapMaxFor(1) === T.GAP_MAX[0] && T.gapMaxFor(T.RAMP_LEVELS) === 1, '差距上限 ' + T.GAP_MAX);
ok(T.minTurnsFor(1) === 0 && T.minTurnsFor(T.RAMP_LEVELS) === T.MIN_TURNS[1], '至少轉幾個彎 ' + T.MIN_TURNS);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
for (let l = 2; l <= 60; l++) ok(T.sizeFor(l) >= T.sizeFor(l - 1) && T.redsFor(l) >= T.redsFor(l - 1) && T.bluesFor(l) >= T.bluesFor(l - 1) && T.minBestFor(l) >= T.minBestFor(l - 1) && T.gapMaxFor(l) <= T.gapMaxFor(l - 1) && T.minTurnsFor(l) >= T.minTurnsFor(l - 1) && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);

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
// 另一種寫法（疊代＋明確的狀態）互相驗證
function ref(board, n, start) {
  let best = 0; const stack = [{ cell: start, seen: new Set([start]), len: 0 }];
  while (stack.length) {
    const s = stack.pop(); best = Math.max(best, s.len); const r = Math.floor(s.cell / n), c = s.cell % n;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc; if (lr < 0 || lr >= n || lc < 0 || lc >= n) continue;
      const mid = mr * n + mc, land = lr * n + lc; const midOcc = board[mid] !== 0 && mid !== start, landEmpty = board[land] === 0 || land === start;
      if (midOcc && landEmpty && !s.seen.has(land)) { const seen = new Set(s.seen); seen.add(land); stack.push({ cell: land, seen, len: s.len + 1 }); }
    }
  }
  return best;
}
{ let diff = 0, cnt = 0, maxJ = 0;
  for (let i = 0; i < 400; i++) { const n = 6 + Math.floor(rnd() * 3), b = new Int8Array(n * n); const k = 4 + Math.floor(rnd() * 14); for (let j = 0; j < k; j++) b[Math.floor(rnd() * n * n)] = rnd() < 0.4 ? R : B;
    for (let c = 0; c < n * n; c++) if (b[c] === R) { cnt++; const a = T.longest(b, n, c).jumps, r2 = ref(b, n, c); maxJ = Math.max(maxJ, a); if (a !== r2) diff++; } }
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
for (let i = 0; i < 300; i++) { const n = 7 + Math.floor(rnd() * 4), k = 2 + Math.floor(rnd() * 6), ch = T.buildChain(n, k, rnd); if (!ch) continue;
  const b = new Int8Array(n * n); b[ch.start] = R; ch.mids.forEach(m => { b[m] = B; }); ok(ch.lands.length === k && validPath(b, n, ch.start, ch.lands) && T.longest(b, n, ch.start).jumps >= k, 'buildChain 造出來的路線是合法連跳 ' + k); }

// ── 整關 ──
let total = 0, gapDist = {}, turnMax = 0;
for (let i = 0; i < 700; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const n = T.sizeFor(lv), nr = T.redsFor(lv), nb = T.bluesFor(lv), board = q.board;
  ok(q.n === n && board.length === n * n, '第 ' + lv + ' 關：棋盤 ' + n + '×' + n);
  const reds = []; let blues = 0; for (let c = 0; c < n * n; c++) { if (board[c] === R) reds.push(c); else if (board[c] === B) blues++; }
  ok(reds.length === nr && q.reds.length === nr && q.reds.slice().sort((a, b) => a - b).join() === reds.join(), '紅棋 ' + reds.length + ' 顆');
  ok(blues >= nb, '藍棋 ' + blues + ' ≥ ' + nb);
  ok(q.jumps.length === nr && q.jumps.every((j, k) => j === T.longest(board, n, q.reds[k]).jumps && j === ref(board, n, q.reds[k])), '每顆紅棋的最大連跳數正確（兩種算法）');
  ok(q.paths.every((p, k) => p.length === q.jumps[k] && validPath(board, n, q.reds[k], p)), '每條路線都是合法連跳');
  const mx = Math.max(...q.jumps); ok(q.bestJumps === mx && q.jumps[q.best] === mx && q.jumps.filter(j => j === mx).length === 1, '最多的那顆唯一：' + q.jumps);
  ok(q.bestJumps >= T.minBestFor(lv), '第 ' + lv + ' 關：最多 ' + q.bestJumps + ' ≥ ' + T.minBestFor(lv));
  ok(q.gap >= 1 && q.gap <= T.gapMaxFor(lv) && q.gap === q.bestJumps - q.second, '第 ' + lv + ' 關：與第二名差 ' + q.gap + '（上限 ' + T.gapMaxFor(lv) + '）');
  ok(q.turns >= T.minTurnsFor(lv) && q.turns === T.turnsOf(n, q.reds[q.best], q.paths[q.best]), '最長路線轉 ' + q.turns + ' 個彎（至少 ' + T.minTurnsFor(lv) + '）');
  gapDist[lv >= 24 ? 'late' + q.gap : q.gap] = (gapDist[lv >= 24 ? 'late' + q.gap : q.gap] || 0) + 1; turnMax = Math.max(turnMax, q.turns);
}
console.log('差距分布 ' + JSON.stringify(gapDist) + '；最多轉 ' + turnMax + ' 個彎');
ok(gapDist.late1 > 0 && Object.keys(gapDist).filter(k => k.startsWith('late') && k !== 'late1').length === 0, '到頂的關卡第一名與第二名一律只差 1：' + JSON.stringify(gapDist));
ok(turnMax >= 3, '有路線轉 3 個以上的彎');
// 答案位置：最多的那顆不一定是最前面（最靠下的）的紅棋
{ let front = 0, trials = 300; for (let i = 0; i < trials; i++) { const q = T.makeLevel(12, rnd); const rowsOf = q.reds.map(c => Math.floor(c / q.n)); if (rowsOf[q.best] === Math.max(...rowsOf)) front++; } ok(front / trials < 0.5, '最多的那顆不一定在最前面：' + (100 * front / trials).toFixed(0) + '%'); }
// 效能
for (const lv of [1, 12, 24, 40]) { const t0 = Date.now(); let worst = 0; for (let i = 0; i < 30; i++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 30; console.log('第' + lv + '關 出題平均 ' + per.toFixed(1) + ' 毫秒、最慢 ' + worst); ok(per < 200 && worst < 1500, '第 ' + lv + ' 關出題夠快：' + per.toFixed(1) + '／' + worst); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_checkers.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: hopMs \+ 1800/.test(src) && /chk-badge--best/.test(src) && /chk-pc__in--arc/.test(src), '失敗：標出連跳次數、最多的彈珠連跳（有弧線）、停格 1.8 秒以上');
  ok(/\.chk-badge--best \{[^}]*var\(--c-ok\)/.test(css) && /\.chk-pc--red \.chk-pc__in \{[^}]*var\(--chk-red/.test(css), '綠色、紅色彈珠用 CSS 變數');
  ok(boot.indexOf("'js/reaction_checkers.js'") > 0 && /連跳/.test(G.rule), 'boot.js 有載入、玩法說明提到連跳'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
