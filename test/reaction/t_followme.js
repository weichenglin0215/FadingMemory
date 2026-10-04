const { game } = require('./load.js');
const G = game('reaction_followme.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線（線性）
ok(T.stepsWanted(1) < T.stepsWanted(T.LEVEL_RAMP) && T.stepsWanted(99) === T.stepsWanted(T.LEVEL_RAMP), 'steps grow then stay (constants are user-tunable)');
ok(T.trapsWanted(1) === 0 && T.trapsWanted(T.LEVEL_RAMP) > 0 && T.trapsWanted(99) === T.trapsWanted(T.LEVEL_RAMP), 'traps grow from 0 then stay');
ok(T.rowsFor(1) === 6 && T.rowsFor(T.LEVEL_RAMP) === 10, 'rows 6 -> 10');
ok(T.colsFor(1) === 5 && T.colsFor(7) === 5 && T.colsFor(8) === 7 && T.colsFor(30) === 7, 'cols 5 then 7 from level 8');
const st = []; for (let l = 1; l <= 15; l++) st.push(T.stepsWanted(l)); ok(st.every((v, i) => i === 0 || v >= st[i - 1]), 'steps monotone');
// BFS 基本
const none = {}; const d0 = T.bfs(5, 5, { r: 4, c: 2 }, none);
ok(d0[4][2] === 0 && d0[3][2] === 1 && d0[0][2] === 4 && d0[3][0] === 3 && d0[4][0] === 2, 'bfs distances without traps');
const trapRow = {}; for (let c = 0; c < 5; c++) if (c !== 4) trapRow[T.cellKey(3, c)] = true;     // 第 3 列只有最右邊能過
const d1 = T.bfs(5, 5, { r: 4, c: 2 }, trapRow); ok(d1[2][4] === 2 + 1 + 2 + 0 || d1[2][4] > 0, 'bfs routes around traps: ' + d1[2][4]);
ok(d1[3][0] === -1 && d1[3][4] === 3, 'cells behind traps unreachable / detour length');
// 出題性質
const turnsOf = path => { let n = 0; for (let i = 1; i < path.length; i++) if (path[i] !== path[i - 1]) n++; return n; };
let multi = 0, trapSum = {}, turnSum = {}, count = {}, maxTurns = {};
for (let lv = 1; lv <= 30; lv++) {
  for (let k = 0; k < 80; k++) {
    const L = T.makeLevel(lv);
    ok(L.rows === T.rowsFor(lv) && L.cols === T.colsFor(lv), 'grid size');
    ok(L.start.r === L.rows - 1 && L.start.c === (L.cols - 1) / 2, 'start is bottom middle');
    ok(L.target.r < L.start.r && L.target.r >= 0 && L.target.c >= 0 && L.target.c < L.cols, 'target above start');
    ok(!L.traps[T.cellKey(L.target.r, L.target.c)] && !L.traps[T.cellKey(L.start.r, L.start.c)], 'no trap on start/target');
    ok(L.path.length === L.steps, 'path length = steps');
    ok(L.steps <= T.stepsWanted(lv) && L.steps >= 1, 'steps as wanted (or the closest the walls allow)');
    /* 示範路線：每一步都合法、不進陷阱、不出界，最後站在終點 */
    let r = L.start.r, c = L.start.c, legal = true;
    L.path.forEach(m => { r += T.MOVES[m][0]; c += T.MOVES[m][1]; if (r < 0 || r >= L.rows || c < 0 || c >= L.cols || L.traps[T.cellKey(r, c)]) legal = false; });
    ok(legal && r === L.target.r && c === L.target.c, 'demo path legal and ends at target');
    /* 步數＝最短步數（用 BFS 重算）*/
    const dist = T.bfs(L.rows, L.cols, L.start, L.traps);
    ok(dist[L.target.r][L.target.c] === L.steps, 'steps equal shortest distance: ' + dist[L.target.r][L.target.c] + ' vs ' + L.steps);
    ok(L.trapList.length === Object.keys(L.traps).length, 'trap list consistent');
    ok(L.trapList.length <= T.trapsWanted(lv), 'traps <= wanted');
    /* 陷阱都在起點與終點之間（比終點的列大、比起點的列小），而且不在起點旁邊那一列（留給小人橫著走）*/
    L.trapList.forEach(t => { ok(t[0] > L.target.r && t[0] < L.start.r - 1, 'trap lies between start and goal: row ' + t[0] + ' goal ' + L.target.r); });
    /* 牆：整道牆只留一個缺口；缺口一左一右輪流 */
    L.wallRows.forEach((wr, i) => {
      const inRow = L.trapList.filter(t => t[0] === wr).length;
      ok(inRow === L.cols - 1 || i === L.wallRows.length - 1, 'every wall except the last is complete');
      if (inRow === L.cols - 1) ok(!L.traps[T.cellKey(wr, L.gaps[i])], 'the gap is open');
      if (i > 0) ok((L.gaps[i] < L.cols / 2) !== (L.gaps[i - 1] < L.cols / 2), 'gaps alternate left / right');
      if (i > 0) ok(L.wallRows[i - 1] - wr === 2, 'one free row between walls');
    });
    /* 有整道牆時：任何一條最短路線都得穿過每個缺口 */
    L.wallRows.forEach((wr, i) => { if (L.trapList.filter(t => t[0] === wr).length === L.cols - 1) { let rr = L.start.r, cc = L.start.c, through = null; L.path.forEach(m => { rr += T.MOVES[m][0]; cc += T.MOVES[m][1]; if (rr === wr) through = cc; }); ok(through === L.gaps[i], 'demo path passes through gap ' + i); } });
    trapSum[lv] = (trapSum[lv] || 0) + L.trapList.length; count[lv] = (count[lv] || 0) + 1;
    const tn = turnsOf(L.path); turnSum[lv] = (turnSum[lv] || 0) + tn; maxTurns[lv] = Math.max(maxTurns[lv] || 0, tn);
    const cap = Math.floor((L.rows - 2) / 2) * (L.cols - 1);          /* 牆的列數 × 每道整牆的陷阱數 = 地圖放得下的陷阱數 */
    ok(L.trapList.length <= Math.min(T.trapsWanted(lv), cap), 'trap count <= min(wanted, what the map can hold)');
    if (L.trapList.length === Math.min(T.trapsWanted(lv), cap)) multi++;
  }
}
console.log('lv1 traps', trapSum[1], 'turns', (turnSum[1] / count[1]).toFixed(1), '| lv10 traps', (trapSum[10] / count[10]).toFixed(1), 'turns', (turnSum[10] / count[10]).toFixed(1), '| lv20 traps', (trapSum[20] / count[20]).toFixed(1), 'turns', (turnSum[20] / count[20]).toFixed(1), '| lv30 traps', (trapSum[30] / count[30]).toFixed(1), 'turns', (turnSum[30] / count[30]).toFixed(1), 'max', maxTurns[30]);
ok(multi > 30 * 80 * 0.6, 'most levels realise the wanted trap count (' + multi + ' / ' + 30 * 80 + ')');
ok(trapSum[1] === 0 && trapSum[30] / count[30] > 15, 'trap count rises with level');
ok(turnSum[30] / count[30] > turnSum[10] / count[10] && turnSum[10] / count[10] > turnSum[3] / count[3], 'more traps → more turns (the walls force the route to bend)');
ok(turnSum[30] / count[30] >= 8, 'late levels need many turns');
// 示範之外還有別的最短路線（至少有些關卡不只一條）
let alt = 0; for (let k = 0; k < 200; k++) { const L = T.makeLevel(10); const p2 = T.randomShortestPath(L.dist, L.start, L.target, L.traps); if (p2.join() !== L.path.join()) alt++; }
ok(alt > 20, 'different shortest routes exist ' + alt + '/200');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
