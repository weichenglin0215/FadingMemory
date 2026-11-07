// 照著走 V1.48.0 測試：新的出題邏輯（一條彎來彎去的路線＋混淆岔路＋其餘全是陷阱）、偶數欄修正、地圖隨關卡變大
const fs = require('fs');
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_followme.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(48);
const key = T.cellKey;

// ─── 1. 難度曲線：步數、列數、欄數、岔路數 隨關卡「線性」增加，到 LEVEL_RAMP 關之後維持 ───
const R = T.LEVEL_RAMP;
['stepsWanted', 'rowsFor', 'colsFor', 'decoysFor'].forEach(fn => {
  const seq = []; for (let l = 1; l <= R + 10; l++) seq.push(T[fn](l));
  ok(seq.every((v, i) => i === 0 || v >= seq[i - 1]), fn + ' never decreases');
  ok(seq[R - 1] > seq[0], fn + ' grows from level 1 to level ' + R + ': ' + seq[0] + ' -> ' + seq[R - 1]);
  ok(seq.slice(R - 1).every(v => v === seq[R - 1]), fn + ' stays after level ' + R);
  ok(seq.every((v, i) => i === 0 || v - seq[i - 1] <= 2), fn + ' grows smoothly (never jumps by more than 2 between two levels; the step count may climb about 1 per level)');
});
ok(T.rowsFor(1) <= T.rowsFor(15) && T.rowsFor(15) <= T.rowsFor(R) && T.colsFor(1) <= T.colsFor(15) && T.colsFor(15) <= T.colsFor(R), 'rows and cols both keep growing with the level');
// 地圖要放得下路線（參數是使用者手調的，所以只要求路線本身放得進去，不要求「一半以上是陷阱」——那一條由 TRAP_MIN 在出題時保證）
for (let l = 1; l <= R; l++) ok(T.stepsWanted(l) + 1 <= T.rowsFor(l) * T.colsFor(l) * 0.7, 'the route fits in the map at level ' + l);

// ─── 2. 起點的欄一定是整數（偶數欄的 bug：舊版 (cols-1)/2 = 4.5，陷阱全部消失）───
for (let cols = 1; cols <= 14; cols++) { const c = T.startCol(cols); ok(Number.isInteger(c) && c >= 0 && c < cols, 'start col is an integer inside the map: cols ' + cols + ' -> ' + c); if (cols % 2) ok(c === (cols - 1) / 2, 'odd cols: exactly the middle'); else ok(c === cols / 2 - 1, 'even cols: the left one of the two middle columns'); }

// ─── 共用檢查：一關的所有性質 ───
const DIRS = T.DIRS;
function checkLevel(L, tag) {
  const { rows, cols } = L, cnt = rows * cols;
  ok(Number.isInteger(L.start.r) && Number.isInteger(L.start.c) && L.start.r === rows - 1 && L.start.c === T.startCol(cols), tag + ' start is an integer cell at the bottom middle');
  ok(L.trapList.length > 0, tag + ' has traps (the even-cols bug made them all vanish)');
  ok(L.trapList.length === Object.keys(L.traps).length, tag + ' trap list matches trap table');
  // 每個格子不是陷阱就是路線／岔路
  const route = new Set(L.cells.map(p => key(p.r, p.c))), decoyCells = []; L.decoys.forEach(b => b.forEach(p => decoyCells.push(p)));
  const dec = new Set(decoyCells.map(p => key(p.r, p.c)));
  ok(route.size === L.cells.length, tag + ' route never visits a cell twice');
  ok(L.trapList.length + route.size + dec.size === cnt, tag + ' every cell is a trap, a route cell or a decoy cell: ' + L.trapList.length + '+' + route.size + '+' + dec.size + ' vs ' + cnt);
  ok(![...route].some(k => L.traps[k]) && ![...dec].some(k => L.traps[k]), tag + ' no trap on the route or the decoys');
  ok([...route].every(k => !dec.has(k)), tag + ' decoys never overlap the route');
  L.trapList.forEach(t => { ok(Number.isInteger(t[0]) && Number.isInteger(t[1]) && t[0] >= 0 && t[0] < rows && t[1] >= 0 && t[1] < cols, tag + ' trap inside the map'); ok(T.TRAP_KINDS.indexOf(t[2]) >= 0, tag + ' trap kind is known: ' + t[2]); });
  // 示範路線：每一步合法、不進陷阱、不出界、最後站在終點
  ok(L.path.length === L.steps && L.cells.length === L.steps + 1, tag + ' path length = steps');
  let r = L.start.r, c = L.start.c, legal = true;
  L.path.forEach(m => { r += T.MOVES[m][0]; c += T.MOVES[m][1]; if (r < 0 || r >= rows || c < 0 || c >= cols || L.traps[key(r, c)]) legal = false; });
  ok(legal && r === L.target.r && c === L.target.c, tag + ' demo path is legal and ends at the flag');
  ok(L.target.r !== L.start.r || L.target.c !== L.start.c, tag + ' the flag is not on the start cell');
  // 最短步數＝路線長度（沒有捷徑；走多一步或走錯一步就到不了）
  const dist = T.bfs(rows, cols, L.start, L.traps);
  ok(dist[L.target.r][L.target.c] === L.steps, tag + ' shortest distance equals steps: ' + dist[L.target.r][L.target.c] + ' vs ' + L.steps);
  // 路線＋岔路合起來是一棵「樹」（連通、邊數＝格數−1）→ 起點到任何一格都只有一條路；岔路都是死巷子
  let open = 0, edges = 0, reach = 0;
  for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
    if (L.traps[key(rr, cc)]) continue;
    open++; if (dist[rr][cc] >= 0) reach++;
    if (!L.traps[key(rr, cc)] && rr + 1 < rows && !L.traps[key(rr + 1, cc)]) edges++;
    if (cc + 1 < cols && !L.traps[key(rr, cc + 1)]) edges++;
  }
  ok(open === route.size + dec.size && reach === open && edges === open - 1, tag + ' open cells form a tree (unique route): open ' + open + ' reach ' + reach + ' edges ' + edges);
  L.decoys.forEach(b => {
    ok(b.length >= T.DECOY_LEN[0] && b.length <= T.DECOY_LEN[1], tag + ' decoy length in range: ' + b.length);
    const tip = b[b.length - 1]; let deg = 0; DIRS.forEach(m => { const nr = tip.r + T.MOVES[m][0], nc = tip.c + T.MOVES[m][1]; if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !L.traps[key(nr, nc)]) deg++; });
    ok(deg === 1, tag + ' a decoy ends in a dead end (the tip touches only its own previous cell): ' + deg);
  });
}

// ─── 3. 奇數欄、偶數欄、各種列數都要正常（使用者回報的 bug）───
{
  const rnd = rng(SEED);
  for (let cols = 3; cols <= 11; cols++) for (let rows = 6; rows <= 14; rows += 2) {
    const n = Math.min(24, Math.floor(rows * cols * 0.3));
    for (let k = 0; k < 4; k++) {
      const L = T.buildLevel(rows, cols, n, 3, T.wantFor(1 + (k * 9), rnd), rnd);
      checkLevel(L, rows + 'x' + cols + ' n=' + n);
      ok(L.steps === n, rows + 'x' + cols + ' route has exactly the wanted steps: ' + L.steps + ' vs ' + n);
    }
  }
}

// ─── 4. 每一關（1～60）× 多次：性質、步數、陷阱佔大多數、岔路 ───
const stat = { n: 0, exact: 0, trapShare: 0, minShare: 1, roomN: 0, roomOk: 0, ms: 0 };
{
  const rnd = rng(SEED + 1);
  for (let lv = 1; lv <= 60; lv++) for (let k = 0; k < 25; k++) {
    const t0 = Date.now(), L = T.makeLevel(lv, rnd); stat.ms += Date.now() - t0;
    ok(L.rows === T.rowsFor(lv) && L.cols === T.colsFor(lv), 'level ' + lv + ' map size follows the level');
    checkLevel(L, 'lv' + lv);
    stat.n++; if (L.steps === T.stepsWanted(lv)) stat.exact++;
    const share = L.trapList.length / (L.rows * L.cols); stat.trapShare += share; stat.minShare = Math.min(stat.minShare, share);
    // 陷阱佔比的保證：岔路不會把陷阱擠到 TRAP_MIN 以下；路線本身就超過一半的地圖（參數調得很密）時，只能保證「岔路不再擠」
    const cells = L.rows * L.cols, room = Math.floor(cells * (1 - T.TRAP_MIN)) - (L.steps + 1), decoyCells = L.decoys.reduce((s, b) => s + b.length, 0);
    ok(share >= Math.min(T.TRAP_MIN, 1 - (L.steps + 1) / cells) - 1e-9, 'lv' + lv + ' decoys never push the traps below TRAP_MIN: share ' + share.toFixed(3));
    ok(decoyCells <= Math.max(0, room), 'lv' + lv + ' decoy cells stay within the budget: ' + decoyCells + ' vs ' + room);
    ok(L.decoys.length <= T.decoysFor(lv), 'lv' + lv + ' never more decoys than wanted');
    if (room >= T.DECOY_LEN[1]) { stat.roomN++; if (L.decoys.length >= 1) stat.roomOk++; }
  }
}
ok(stat.exact === stat.n, 'every level has exactly the wanted number of steps (' + stat.exact + '/' + stat.n + ')');
ok(stat.trapShare / stat.n >= 0.45, 'on average the map is mostly traps: ' + (stat.trapShare / stat.n).toFixed(2));
// 地圖有空位（陷阱還能維持在 TRAP_MIN 以上）的時候，幾乎一定放得下至少一條岔路
ok(stat.roomN === 0 || stat.roomOk / stat.roomN > 0.9, 'when the map has room for a decoy there is nearly always one (' + stat.roomOk + '/' + stat.roomN + ')');
ok(stat.ms / stat.n < 15, 'making a level is fast: ' + (stat.ms / stat.n).toFixed(2) + ' ms');

// ─── 5. 路線要有「看頭」：彎來彎去、會往下走、旗子不一定在最上面、會走到邊緣（使用者的批評：每關都是上四步再左右再上）───
{
  const rnd = rng(SEED + 2), S = {};
  for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 40; k++) {
    const L = T.makeLevel(lv, rnd), f = T.routeFeatures({ moves: L.path, cells: L.cells }, L.cols), a = S[lv] || (S[lv] = { n: 0, turn: 0, down: 0, low: 0, edge: 0, fffAll: 0, runOver: 0, minRow: 0 });
    a.n++; a.turn += f.turns / L.steps; if (f.downs > 0) a.down++; if (f.flagLow) a.low++; if (f.edges > 0) a.edge++;
    if (L.path.slice(0, 4).join('') === 'FFFF') a.fffAll++;
    if (f.maxRun > T.wantFor(lv, () => 0.5).run + 1) a.runOver++;
    a.minRow += f.minRow / (L.rows - 1);
  }
  const avg = (lo, hi, fn) => { let s = 0, n = 0; for (let lv = lo; lv <= hi; lv++) { s += fn(S[lv]); n += S[lv].n; } return s / n; };
  const turn1 = avg(1, 10, a => a.turn), turn2 = avg(21, 40, a => a.turn);
  ok(turn1 >= 0.42, 'early levels already bend a lot: turn ratio ' + turn1.toFixed(2));
  ok(turn2 > turn1 && turn2 >= 0.58, 'late levels bend even more: ' + turn2.toFixed(2));
  ok(avg(1, 10, a => a.fffAll) < 0.12 && avg(11, 40, a => a.fffAll) < 0.06, 'not every level starts with four steps straight up: ' + avg(1, 40, a => a.fffAll).toFixed(3));
  const down2 = avg(11, 40, a => a.down); ok(down2 > 0.6, 'most mid/late levels have steps going down: ' + down2.toFixed(2));
  const low1 = avg(1, 10, a => a.low), low2 = avg(21, 40, a => a.low);
  ok(low1 > 0.15 && low1 < 0.8, 'early levels: flag sometimes at the top, sometimes lower than the highest point: ' + low1.toFixed(2));
  ok(low2 > 0.4 && low2 < 0.95 && low2 > low1, 'late levels: the flag is lower than the highest point more often (but not always): ' + low2.toFixed(2) + ' vs ' + low1.toFixed(2));
  const edge = avg(5, 40, a => a.edge); ok(edge > 0.6, 'the route often reaches the left/right edge: ' + edge.toFixed(2));
  ok(avg(1, 40, a => a.runOver) < 0.08, 'straight runs stay short: ' + avg(1, 40, a => a.runOver).toFixed(3));
  ok(avg(10, 40, a => a.minRow) < 0.35, 'the route climbs high on the map (average highest row, 0 = top): ' + avg(10, 40, a => a.minRow).toFixed(2));
  console.log('turn% lv1-10', turn1.toFixed(2), 'lv21-40', turn2.toFixed(2), '| downs>0 lv11-40', down2.toFixed(2), '| flagLow lv1-10', low1.toFixed(2), 'lv21-40', low2.toFixed(2), '| edge', edge.toFixed(2), '| ms/level', (stat.ms / stat.n).toFixed(2), '| trap share avg', (stat.trapShare / stat.n).toFixed(2), 'min', stat.minShare.toFixed(2));
}

// ─── 6. BFS 可以往下走（後退按鈕）：先往上繞過去、再往下才到得了的格子 ───
{
  // 3×3：起點左下 (2,0)；陷阱在 (1,1)、(2,1)、(2,2)；要走 上、上、右、右、下 才到 (1,2)
  const tr = {}; [[1, 1], [2, 1], [2, 2]].forEach(p => tr[key(p[0], p[1])] = true);
  const d = T.bfs(3, 3, { r: 2, c: 0 }, tr);
  ok(d[1][2] === 5, 'bfs goes down when it has to: ' + d[1][2]);
  ok(T.applyMoves({ r: 2, c: 0 }, ['F', 'F', 'R', 'R', 'B']).r === 1 && T.applyMoves({ r: 2, c: 0 }, ['F', 'F', 'R', 'R', 'B']).c === 2, 'applyMoves understands B');
  ok(T.MOVES.B[0] === 1 && T.MOVES.B[1] === 0, 'B moves one row down');
  const none = T.bfs(5, 5, { r: 4, c: 2 }, {}); ok(none[4][2] === 0 && none[3][2] === 1 && none[0][2] === 4 && none[3][0] === 3 && none[4][0] === 2 && none[4][4] === 2, 'bfs distances without traps');
}

// ─── 7. 保底的蛇形路線：一定走得出來，而且也是「自己不碰自己」───
{
  const rnd = rng(SEED + 3);
  [[8, 5, 12], [10, 6, 30], [14, 10, 60], [6, 4, 99]].forEach(([rows, cols, n]) => {
    const start = { r: rows - 1, c: T.startCol(cols) }, route = T.serpentine(rows, cols, start, n);
    ok(route.moves.length >= 1 && route.moves.length <= n && route.cells.length === route.moves.length + 1, 'serpentine ' + rows + 'x' + cols + ' has a sensible length: ' + route.moves.length);
    if (n <= rows * cols / 4) ok(route.moves.length === n, 'serpentine ' + rows + 'x' + cols + ' reaches the wanted length ' + n + ': ' + route.moves.length);
    const Tp = T.fillTraps(route.open, rows, cols, rnd), d = T.bfs(rows, cols, start, Tp.traps), end = route.cells[route.cells.length - 1];
    ok(d[end.r][end.c] === route.moves.length, 'serpentine ' + rows + 'x' + cols + ' has no shortcut: ' + d[end.r][end.c] + ' vs ' + route.moves.length);
    ok(T.applyMoves(start, route.moves).r === end.r && T.applyMoves(start, route.moves).c === end.c, 'serpentine moves end at its last cell');
  });
}

// ─── 8. 陷阱圖案五種都會出現；canOpen 的規則 ───
{
  const rnd = rng(SEED + 4), seen = {};
  for (let k = 0; k < 40; k++) T.makeLevel(1 + k % 30, rnd).trapList.forEach(t => seen[t[2]] = (seen[t[2]] || 0) + 1);
  ok(T.TRAP_KINDS.length >= 3 && T.TRAP_KINDS.every(k => seen[k] > 20), 'every trap kind shows up often: ' + JSON.stringify(seen));
  const open = []; for (let r = 0; r < 4; r++) open.push([false, false, false, false]);
  open[3][1] = true; open[2][1] = true;                                       // 路線：(3,1) → (2,1)
  ok(T.canOpen(open, 4, 4, 1, 1, 2, 1) === true, 'canOpen: a free cell that only touches the previous cell is fine');
  ok(T.canOpen(open, 4, 4, 2, 0, 3, 0) === false, 'canOpen: (2,0) would touch (2,1), which is not the previous cell');
  ok(T.canOpen(open, 4, 4, 2, 1, 3, 1) === false, 'canOpen: a cell that is already open is refused');
  ok(T.canOpen(open, 4, 4, -1, 1, 0, 1) === false && T.canOpen(open, 4, 4, 1, 4, 1, 3) === false, 'canOpen: outside the map is refused');
}

// ─── 9. 設定與文字 ───
{
  const src = fs.readFileSync(__dirname + '/../../js/reaction_followme.js', 'utf8');
  ok(/後退/.test(G.rule) && /左方/.test(G.rule) && /前進/.test(G.rule) && /右方/.test(G.rule), 'rule text lists all four buttons');
  ok(!/\(cols - 1\) \/ 2/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/function startCol[^\n]*\n/, '')), 'no half-column start left in the code');
  ok(/bB\.addEventListener\('pointerdown'/.test(src), 'the back button listens to pointerdown');
  const css = fs.readFileSync(__dirname + '/../../css/games/reaction_followme.css', 'utf8');
  ok(/\.followme-flag__cloth\s*\{[^}]*var\(--c-red\)/.test(css), 'the flag is red');
  T.TRAP_KINDS.forEach(k => ok(css.indexOf('.followme-t-' + k + '__') >= 0, 'css styles the ' + k + ' trap'));
  ok(!/#[0-9a-fA-F]{3,6}\b|hsl\(|rgb\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'followme css uses variables only (no colour literals)');
  const theme = fs.readFileSync(__dirname + '/../../css/theme.css', 'utf8'); ok(/--c-red:\s*hsl\(/.test(theme), 'theme.css defines --c-red');
}

// ─── 10. 手指拖曳與按鈕共用的走法規則：stepTrail（走一步／撤銷）、judgeTrail（放開手指才判定）、nextCell（手指帶著小人走）───
{
  const S = { r: 5, c: 2 };
  const s1 = T.stepTrail([S], 4, 4, 2);
  ok(s1.kind === 'step' && s1.trail.length === 2 && s1.remain === 3, 'a step forward adds a cell and costs a step');
  const s2 = T.stepTrail(s1.trail, s1.remain, 5, 2);
  ok(s2.kind === 'undo' && s2.trail.length === 1 && s2.remain === 4, 'stepping back onto the previous cell undoes the last step');
  ok(s1.trail.length === 2, 'stepTrail never changes the array it was given');
  ok(T.stepTrail([S], 0, 4, 2).kind === null, 'no steps left: cannot go forward');
  ok(T.stepTrail([S, { r: 4, c: 2 }], 0, 5, 2).kind === 'undo', 'no steps left: can still go back');
  ok(T.stepTrail([S], 3, 4, 2).kind === 'step', 'from the start cell every neighbour is a step (there is no previous cell)');
  ok(T.stepTrail([S, { r: 4, c: 2 }, { r: 3, c: 2 }], 2, 4, 2).kind === 'undo' && T.stepTrail([S, { r: 4, c: 2 }, { r: 3, c: 2 }], 2, 5, 2).kind === 'step', 'only the cell right before the current one counts as going back');
  // 判定
  const traps = { '3,2': true }, target = { r: 3, c: 3 };
  const J = (cells, steps) => T.judgeTrail(cells, traps, target, steps);
  ok(J([S, { r: 4, c: 2 }, { r: 3, c: 2 }], 5).result === 'trap', 'a trap on the way fails');
  ok(J([S, { r: 4, c: 2 }, { r: 3, c: 2 }, { r: 3, c: 3 }], 3).result === 'trap' && J([S, { r: 4, c: 2 }, { r: 3, c: 2 }, { r: 3, c: 3 }], 3).hits[0] === '3,2', 'a trap fails even when the route ends on the flag, and the trap is reported');
  ok(J([S, { r: 4, c: 2 }], 5).result === 'continue', 'no trap and steps left: continue (keep dragging)');
  ok(J([S, { r: 4, c: 2 }, { r: 4, c: 3 }, { r: 3, c: 3 }], 3).result === 'win', 'steps used up on the flag: win');
  ok(J([S, { r: 4, c: 2 }, { r: 4, c: 1 }, { r: 4, c: 0 }], 3).result === 'lose', 'steps used up somewhere else: lose');
  ok(J([S, { r: 4, c: 2 }, { r: 4, c: 3 }], 3).result === 'continue', 'on the way to the flag with a step left: continue');
  // 真的出題：示範路線＝贏；少走幾步＝繼續；岔路走到底＝繼續，步數用完才輸
  const rnd = rng(SEED + 5);
  [1, 8, 15, 25, 30].forEach(lv => {
    for (let k = 0; k < 10; k++) {
      const L = T.makeLevel(lv, rnd);
      ok(T.judgeTrail(L.cells, L.traps, L.target, L.steps).result === 'win', 'lv' + lv + ': the demo route wins');
      ok(T.judgeTrail(L.cells.slice(0, L.cells.length - 2), L.traps, L.target, L.steps).result === 'continue', 'lv' + lv + ': a route that stopped short continues');
      // 用 stepTrail 一步一步重走示範路線，結果跟直接給整條路線一樣
      let trail = [L.cells[0]], remain = L.steps;
      for (let i = 1; i < L.cells.length; i++) { const s = T.stepTrail(trail, remain, L.cells[i].r, L.cells[i].c); ok(s.kind === 'step', 'lv' + lv + ': every demo step is a step'); trail = s.trail; remain = s.remain; }
      ok(remain === 0 && T.judgeTrail(trail, L.traps, L.target, L.steps).result === 'win', 'lv' + lv + ': walking the demo route step by step wins with no step left');
      // 走錯一步（走到旁邊的陷阱）→ 失敗；走進去再退出來（撤銷）→ 不算踩過
      const cell = L.cells[Math.min(2, L.cells.length - 2)];
      const bump = T.DIRS.map(m => ({ r: cell.r + T.MOVES[m][0], c: cell.c + T.MOVES[m][1] })).find(p => L.traps[T.cellKey(p.r, p.c)]);
      if (bump) {
        const walked = T.stepTrail(L.cells.slice(0, Math.min(3, L.cells.length - 1)), 5, bump.r, bump.c);
        ok(walked.kind === 'step' && T.judgeTrail(walked.trail, L.traps, L.target, L.steps).result === 'trap', 'lv' + lv + ': stepping into a trap is judged a trap');
        const back = T.stepTrail(walked.trail, walked.remain, walked.trail[walked.trail.length - 2].r, walked.trail[walked.trail.length - 2].c);
        ok(back.kind === 'undo' && T.judgeTrail(back.trail, L.traps, L.target, L.steps).result !== 'trap', 'lv' + lv + ': dragging back out of the trap before letting go is not a failure');
      }
    }
  });
  // 手指帶著小人走
  const P = { r: 3, c: 3 }, cell = 64, ctr = n => (n + 0.5) * cell, NC = (px, py, p) => T.nextCell(p || P, px, py, cell, 8, 6);
  ok(NC(ctr(3), ctr(3)) === null, 'finger on the man: no move');
  ok(NC(ctr(3) + (T.DRAG_T - 0.02) * cell, ctr(3)) === null && NC(ctr(3) - (T.DRAG_T - 0.02) * cell, ctr(3)) === null, 'less than DRAG_T cells away: the man stays (no jitter between cells)');
  ok(JSON.stringify(NC(ctr(3) + (T.DRAG_T + 0.02) * cell, ctr(3))) === '{"r":3,"c":4}', 'finger to the right: one cell right');
  ok(JSON.stringify(NC(ctr(3) - 0.9 * cell, ctr(3) + 0.2 * cell)) === '{"r":3,"c":2}', 'finger to the left: one cell left');
  ok(JSON.stringify(NC(ctr(3), ctr(3) - 0.9 * cell)) === '{"r":2,"c":3}' && JSON.stringify(NC(ctr(3), ctr(3) + 0.9 * cell)) === '{"r":4,"c":3}', 'finger above / below: one cell up / down');
  ok(JSON.stringify(NC(ctr(3) + 0.8 * cell, ctr(3) - 1.5 * cell)) === '{"r":2,"c":3}', 'diagonal: the axis with the bigger offset moves first');
  ok(NC(ctr(0), ctr(0) - 0.9 * cell, { r: 0, c: 0 }) === null && NC(ctr(0) - 0.9 * cell, ctr(0), { r: 0, c: 0 }) === null, 'the map edge stops the man');
  ok(NC(ctr(5) + 0.9 * cell, ctr(7) + 0.9 * cell, { r: 7, c: 5 }) === null, 'right / bottom edge stops the man too');
  // 手指一下子移很遠：重複呼叫 nextCell，小人一格一格追到手指所在的格子
  let pos = { r: 6, c: 1 }; const fx = ctr(4) + 0.1 * cell, fy = ctr(1) - 0.1 * cell; let guard = 0, steps = 0;
  for (; guard < 40; guard++) { const n = NC(fx, fy, pos); if (!n) break; ok(Math.abs(n.r - pos.r) + Math.abs(n.c - pos.c) === 1, 'the man moves exactly one cell at a time'); pos = n; steps++; }
  ok(pos.r === 1 && pos.c === 4 && steps === 5 + 3, 'a fast finger: the man catches up one cell at a time (' + JSON.stringify(pos) + ', ' + steps + ' steps)');
}

// ─── 11. 版面、拖曳、倒數（程式與樣式的接線；實際操作由瀏覽器驗證 fm_check 負責）───
{
  const src = fs.readFileSync(__dirname + '/../../js/reaction_followme.js', 'utf8'), css = fs.readFileSync(__dirname + '/../../css/games/reaction_followme.css', 'utf8');
  ok(T.COUNT_N === 3 && T.COUNT_MS === 1000, 'the pause after the demo is 3 seconds: 3 digits of 1 second each');
  ok(Math.abs(T.COUNT_W - 1 / 3) < 1e-9, 'the countdown digit is one third of the screen wide');
  ok(/field\.addEventListener\('pointerdown'/.test(src) && /field\.addEventListener\('pointermove'/.test(src) && /field\.addEventListener\('pointerup', endDrag\)/.test(src) && /field\.addEventListener\('pointercancel', endDrag\)/.test(src), 'the map listens for drag: pointerdown / pointermove / pointerup / pointercancel');
  const mv = src.slice(src.indexOf("field.addEventListener('pointermove'"), src.indexOf('function endDrag'));
  ok(!/finish\(|settle\(|judgeTrail\(/.test(mv), 'dragging never judges anything: the judging happens only when the finger lifts');
  const ed = src.slice(src.indexOf('function endDrag'), src.indexOf("field.addEventListener('pointerup'"));
  ok(/judgeTrail\(/.test(ed) && /settle\(/.test(ed), 'lifting the finger judges the route');
  ok(/root\.classList\.add\('followme-screen'\)/.test(src) && /root\.classList\.remove\('followme-screen'\)/.test(src), 'the compact layout class is added and removed again');
  ok(/\.screen\.followme-screen\s*\{[^}]*gap:\s*3px/.test(css), 'the gap between head / banner / map / buttons is small');
  ok(/\.followme-head\s*\{[^}]*line-height:\s*1\.15/.test(css) && /\.followme-banner\s*\{[^}]*line-height:\s*1\.15/.test(css), 'head and banner have a tight line height');
  ok(/\.followme-btn\s*\{[^}]*height:\s*calc\(var\(--btn-h\) \* 2 \/ 3\)/.test(css), 'the buttons are two thirds of the normal button height');
  ok(/\.followme-field\s*\{[^}]*touch-action:\s*none/.test(css) && /\.followme-field\s*\{[^}]*position:\s*relative/.test(css), 'the map blocks page scrolling while dragging and anchors the countdown');
  ok(/\.followme-count__fill\s*\{[^}]*fill:\s*var\(--c-black\)[^}]*fill-opacity:\s*0\.25/.test(css), 'countdown digits are black at 25 percent');
  ok(/\.followme-count__edge\s*\{[^}]*stroke:\s*var\(--c-on-accent\)/.test(css), 'countdown digits have a white outline');
  ok(/\.followme-trail\s*\{[^}]*stroke:\s*var\(--c-blue\)/.test(css), 'the route the player drew is a blue line');
  ok(/COUNT_N/.test(src) && /showCount\(n\)/.test(src) && /hideCount\(\)/.test(src), 'the demo ends with the countdown');
  ok(!/DEMO_END_MS/.test(src), 'the old short pause after the demo is gone');
  ok(/拖/.test(G.rule) && /放開手指/.test(G.rule), 'the rule text mentions dragging and judging when the finger lifts');
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
