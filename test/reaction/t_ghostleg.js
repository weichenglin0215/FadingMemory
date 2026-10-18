const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_ghostleg.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261014); const rnd = rng(SEED);

// 難度曲線
// 現有橫線數 RUNGS：第 1 關 → 到頂；放不下的話（ROWS 太少）壓在 rungCap（層數 × DENSITY_MAX）以內，一定留得下空位給玩家畫
ok(T.rungCap() === Math.floor(T.ROWS * T.DENSITY_MAX) && T.rungCap() <= 2 * T.ROWS - 4, '橫線數上限 ＝ 層數 × DENSITY_MAX，而且留得下空位給玩家畫');
ok(T.rungCount(1) === Math.min(T.RUNGS[0], T.rungCap()) && T.rungCount(T.RAMP_LEVELS) === Math.min(T.RUNGS[1], T.rungCap()) && T.rungCount(T.RAMP_LEVELS + 9) === T.rungCount(T.RAMP_LEVELS), '現有橫線數端點');
ok(T.visitAt(1) === T.VISIT[0] && T.visitAt(T.RAMP_LEVELS) === T.VISIT[1] && T.turnsAt(1) === T.TURNS[0] && T.turnsAt(T.RAMP_LEVELS) === T.TURNS[1], '正確路線經過的直線數、轉彎數端點');
for (let l = 2; l <= T.RAMP_LEVELS; l++) ok(T.visitAt(l) >= T.visitAt(l - 1) && T.turnsAt(l) >= T.turnsAt(l - 1), '經過的直線數、轉彎數單調 ' + l);
ok(T.maxSolAt(1) === T.MAX_SOL[0] && T.maxSolAt(T.RAMP_LEVELS) === T.MAX_SOL[1] && T.maxSolAt(T.RAMP_LEVELS) >= 1, '「畫對的位置數」上限端點');
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時端點');
for (let l = 2; l <= T.RAMP_LEVELS; l++) ok(T.rungCount(l) >= T.rungCount(l - 1) && T.maxSolAt(l) <= T.maxSolAt(l - 1), '單調 ' + l);
// snapRow／canPlace
for (let r = 0; r < T.ROWS; r++) ok(T.snapRow(T.rowY(r)) === r && T.snapRow(T.rowY(r) + 3) === r && T.snapRow(T.rowY(r) - 3) === r, 'snapRow ' + r);
ok(T.snapRow(-50) === 0 && T.snapRow(9999) === T.ROWS - 1, 'snapRow 夾在範圍內');
{ const rg = [{ row: 5, col: 1 }];
  ok(!T.canPlace(rg, 5, 1) && !T.canPlace(rg, 5, 0) && !T.canPlace(rg, 5, 2) && T.canPlace(rg, 5, 3) && T.canPlace(rg, 4, 1) && T.canPlace(rg, 6, 0), 'canPlace：同一層重疊或左右緊鄰的位置不行，其他層可以');
  ok(!T.canPlace(rg, -1, 0) && !T.canPlace(rg, T.ROWS, 0) && !T.canPlace(rg, 3, -1) && !T.canPlace(rg, 3, T.COLS - 1), 'canPlace：超出範圍不行'); }
// 橫線：數量、同一層不相鄰、每層最多 2 條
let topN = 0, topMany = 0;
for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 20; k++) {
  const q = T.makeLevel(l, rnd);
  ok(q.rungs.length <= T.rungCount(l) + T.BREAK_EXTRA && q.rungs.length >= T.rungCount(l) - 3, '第 ' + l + ' 關橫線數 ' + q.rungs.length + '（偶爾放不下會少放幾條、為了打斷「＝」會多放 1～2 條）');
  const seen = {}; q.rungs.forEach(g => { ok(g.col >= 0 && g.col <= T.COLS - 2 && g.row >= 0 && g.row < T.ROWS, '位置範圍'); ok(!seen[g.row + ',' + g.col], '不重複'); seen[g.row + ',' + g.col] = 1; });
  q.rungs.forEach(g => ok(!seen[g.row + ',' + (g.col + 1)], '同一層橫線不相鄰'));
  const perRow = {}; q.rungs.forEach(g => { perRow[g.row] = (perRow[g.row] || 0) + 1; }); ok(Object.values(perRow).every(v => v <= 2), '每層最多 2 條');
  // 題目條件：現有的線走不到終點；至少有一種畫法對；每一種「解」真的畫得上去、真的走到終點；其他位置不會走到終點的不算解
  ok(q.start >= 0 && q.start < T.COLS && q.target >= 0 && q.target < T.COLS, '起點終點範圍');
  const f0 = T.follow(q.rungs, q.start); ok(f0.end === q.end0 && q.end0 !== q.target, '現有的橫線走不到終點');
  ok(q.solutions.length >= 1, '至少有一種畫法');
  q.solutions.forEach(s => { ok(T.canPlace(q.rungs, s.row, s.col), '解可以畫'); ok(T.follow(q.rungs.concat([s]), q.start).end === q.target, '畫了之後真的走到終點'); });
  // 獨立窮舉：全部能畫的位置裡，走到終點的剛好就是 solutions
  let cnt = 0; for (let r = 0; r < T.ROWS; r++) for (let c = 0; c <= T.COLS - 2; c++) if (T.canPlace(q.rungs, r, c) && T.follow(q.rungs.concat([{ row: r, col: c }]), q.start).end === q.target) cnt++;
  ok(cnt === q.solutions.length, '解的數量與窮舉一致：' + cnt + ' vs ' + q.solutions.length);
  if (l >= T.RAMP_LEVELS - 2) { topN++; if (T.answerGroups(q.solutions).length > Math.max(T.maxSolAt(l), 2)) topMany++; }   // 後面的關卡只有少數答案區段（放寬的少數題例外）
  // 路徑：獨立模擬一次，終點相同
  let col = q.start; const s2 = {}; q.rungs.forEach(g => { s2[g.row + ',' + g.col] = 1; });
  for (let r = 0; r < T.ROWS; r++) { if (s2[r + ',' + col]) col++; else if (s2[r + ',' + (col - 1)]) col--; }
  ok(col === q.end0, '現有路徑終點一致');
  // 折線每一段不是垂直就是水平
  for (let i = 1; i < f0.route.length; i++) ok(f0.route[i].x === f0.route[i - 1].x || f0.route[i].y === f0.route[i - 1].y, '路線只有垂直與水平');
}
ok(topMany / topN <= 0.05, '後面的關卡只有少數答案區段：超過的題 ' + topMany + ' / ' + topN);
// V1.32：先定路線、再撒橫線（玩家意見：難度太低、橫線堆在同一欄之間、正確路線應該經過甲乙丙丁戊、正確位置上下留白）
{ // visitedCols／gapCounts／crowded／makeWalk／spreadRows
  ok(T.visitedCols([], 2).join() === '2' && T.visitedCols([{ row: 1, col: 1 }, { row: 3, col: 0 }], 2).join() === '0,1,2', 'visitedCols：從丙出發，先去乙、再去甲');
  ok(T.visitedCols([{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 3 }], 0).join() === '0,1,2,3,4', 'visitedCols：一路走到戊');
  ok(T.gapCounts([{ row: 0, col: 0 }, { row: 2, col: 0 }, { row: 5, col: 3 }]).join() === [2, 0, 0, 1].concat(new Array(T.COLS - 5).fill(0)).join(), 'gapCounts');
  { const rg = [{ row: 5, col: 1 }]; ok(T.crowded(rg, 6, 0) && T.crowded(rg, 4, 2) && T.crowded(rg, 6, 1) && !T.crowded(rg, 7, 1) && !T.crowded(rg, 6, 3) && !T.crowded(rg, 3, 1) && !T.crowded(rg, 5, 1), 'crowded：上下 SOL_GAP 層以內、跟相接的兩條直線有關的橫線算擠（自己不算）；SOL_GAP＝' + T.SOL_GAP); }
  for (let i = 0; i < 300; i++) { const st = i % T.COLS, v = 2 + (i % 4), w = T.makeWalk(st, v, 3 + (i % 5), rnd);
    if (w) { ok(w[0] === st && w.every((c, k) => c >= 0 && c < T.COLS && (k === 0 || Math.abs(c - w[k - 1]) === 1)), 'makeWalk 每一步左右一格'); ok(new Set(w).size >= v, 'makeWalk 經過的直線數夠'); } }
  for (let i = 0; i < 300; i++) { const m = 2 + (i % (T.ROWS - 2)), rows = T.spreadRows(m, rnd); if (rows) { ok(rows.length === m && rows.every((r, k) => r >= 0 && r < T.ROWS && (k === 0 || r > rows[k - 1])), 'spreadRows 嚴格遞增、在範圍內'); } } }
let fallback = 0, lvTot = 0, shortRungs = 0, visitOK = 0, imbalance = 0, minSol = 99, solClear = 0, bigRow = 0, spread = new Array(T.COLS - 1).fill(0);
for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 20; k++) {
  const q = T.makeLevel(l, rnd); lvTot++;
  if (q.rungs.length === 1) { fallback++; continue; }
  if (q.rungs.length < T.rungCount(l)) shortRungs++;
  const cc = T.gapCounts(q.rungs); if (Math.max.apply(null, cc) - Math.min.apply(null, cc) > 1) imbalance++;
  cc.forEach((c, g) => { spread[g] += c; });
  // 正確路線經過的直線數：至少有一種畫法的路線達到要求（少數放寬的關卡除外）
  if (q.solutions.some(s => T.visitedCols(q.rungs.concat([s]), q.start).length >= T.visitAt(l))) visitOK++;
  // 至少有一種畫法，上下有留白
  if (q.solutions.some(s => !T.crowded(q.rungs, s.row, s.col))) solClear++;
  const perRow = {}; q.rungs.forEach(g => { perRow[g.row] = (perRow[g.row] || 0) + 1; }); if (Math.max.apply(null, Object.values(perRow)) > 2) bigRow++;
}
ok(fallback === 0, '保底題沒有出現：' + fallback + ' / ' + lvTot);
ok(shortRungs / lvTot < 0.02, '橫線數都放得滿：少放 ' + shortRungs + ' / ' + lvTot);
ok(imbalance === 0, '四個「縫」的橫線數最多差 1 條（平均分布）：不平均 ' + imbalance);
ok(visitOK / lvTot > 0.9, '正確路線經過的直線數達到要求（放寬的關卡少 1 條）：' + visitOK + ' / ' + lvTot);
ok(solClear === lvTot - fallback, '至少有一種畫法的上下留白（避免手指誤畫）：' + solClear + ' / ' + lvTot);
ok(bigRow === 0, '每層最多 2 條');
console.log('各縫橫線總數 ' + spread.join(',') + '；橫線不足 ' + shortRungs + '；達到經過直線數的關卡 ' + visitOK + ' / ' + lvTot);
// 到頂之後，正確路線經過全部五條直線（甲乙丙丁戊）
if (T.VISIT[1] >= T.COLS) { let all5 = 0, N = 150; for (let i = 0; i < N; i++) { const q = T.makeLevel(T.RAMP_LEVELS, rnd); if (q.solutions.some(s => T.visitedCols(q.rungs.concat([s]), q.start).length === T.COLS)) all5++; } ok(all5 / N > 0.95, '到頂的關卡，正確路線經過甲乙丙丁戊：' + all5 + ' / ' + N); }
// 出題夠快
{ const t0 = Date.now(); for (let i = 0; i < 100; i++) T.makeLevel(T.RAMP_LEVELS, rnd); ok(Date.now() - t0 < 6000, '最難的關卡出題夠快：' + (Date.now() - t0) + ' ms / 100 題'); }
// 每一欄都有機會當起點與終點
{ const s = new Array(T.COLS).fill(0), t = new Array(T.COLS).fill(0); for (let i = 0; i < 1000; i++) { const q = T.makeLevel(8, rnd); s[q.start]++; t[q.target]++; } ok(s.every(v => v > 600 / T.COLS), '起點平均分布 ' + s.join(',')); ok(t.every(v => v > 50), '終點每一欄都出現 ' + t.join(',')); }
// 評審動畫的線：從頭畫到 len 像素
{ const q = T.makeLevel(10, rnd), f = T.follow(q.rungs, q.start), L = T.routeLength(f.route);
  const p0 = T.partialRoute(f.route, 0); ok(p0.length === 1 && p0[0].x === f.route[0].x, '長度 0：只有起點');
  const pe = T.partialRoute(f.route, L); ok(near(T.routeLength(pe), L, 1e-6) && pe[pe.length - 1].y === T.Y_BOT, '畫滿：整條路線');
  let prev = -1; for (let k = 0; k <= 40; k++) { const part = T.partialRoute(f.route, L * k / 40), len = T.routeLength(part); ok(near(len, L * k / 40, 1e-6) && len >= prev - 1e-9, '部分路線長度 = 要求的長度'); prev = len; }
  ok(T.routeMs(f.route) >= T.ROUTE_MS[0] && T.routeMs(f.route) <= T.ROUTE_MS[1], '動畫時間在範圍內：' + T.routeMs(f.route)); ok(T.HOLD_MS > 0, '動畫之後停一下'); }

// V1.33（玩家意見：答案幾乎都在起點或終點那條直線上，太容易）：答案不碰起點終點的直線、前後藏轉彎、路線橫跨整張圖、答案算區段
{ // answerGroups：同一對直線、上下相連的幾層算一段
  const g = T.answerGroups([{ row: 5, col: 1 }, { row: 4, col: 1 }, { row: 6, col: 1 }, { row: 9, col: 1 }, { row: 5, col: 2 }]);
  ok(g.length === 3 && g[0].col === 1 && g[0].from === 4 && g[0].to === 6 && g[1].from === 9 && g[2].col === 2, 'answerGroups：相連的層合成一段 ' + JSON.stringify(g));
  ok(T.groupText({ col: 1, from: 4, to: 6 }) === '第 5～7 層的 乙～丙 之間' && T.groupText({ col: 0, from: 2, to: 2 }) === '第 3 層的 甲～乙 之間', 'groupText');
  // hideOf：從丙（2）出發，第 1 層往乙、第 3 層往甲；在第 5 層畫甲～乙 → 之前 2 彎；畫上之後走到乙，第 8 層的甲～乙再轉回甲 → 之後 1 彎（第 10 層的乙～丙碰不到）
  const rg = [{ row: 1, col: 1 }, { row: 3, col: 0 }, { row: 8, col: 0 }, { row: 10, col: 1 }];
  const hd = T.hideOf(rg, 2, { row: 5, col: 0 }); ok(hd.before === 2 && hd.after === 1, 'hideOf：之前 2 彎、之後 1 彎（畫上之後走到乙，第 10 層再轉一次）' + JSON.stringify(hd));
  ok(T.hideAt(1).b === T.HIDE_BEFORE[0] && T.hideAt(T.RAMP_LEVELS).b === T.HIDE_BEFORE[1] && T.hideAt(1).a === T.HIDE_AFTER[0] && T.hideAt(T.RAMP_LEVELS).a === T.HIDE_AFTER[1], 'hideAt 端點');
  for (let l = 2; l <= T.RAMP_LEVELS; l++) ok(T.hideAt(l).b >= T.hideAt(l - 1).b && T.hideAt(l).a >= T.hideAt(l - 1).a, 'hideAt 單調 ' + l);
  // 第二輪：之字形路線 makeZigzag——每一步左右一格、同方向最多連走 stairMax 步、至少回頭 revMin 次、碰到甲與戊（needEdges）、不在邊緣來回
  const shapeOf = w => { let mr = 0, run = 0, rev = 0, p = 0; for (let k = 1; k < w.length; k++) { const d = w[k] - w[k - 1]; if (p && d !== p) rev++; run = d === p ? run + 1 : 1; p = d; mr = Math.max(mr, run); } return { mr, rev }; };
  let zz = 0;
  for (let i = 0; i < 600; i++) { const st = i % T.COLS, stair = 2 + (i % 2), revMin = 1 + (i % 3), edges = i % 2 === 0, w = T.makeZigzag(st, 3, edges, 4, stair, revMin, T.ROWS - 2, rnd);
    if (!w) continue; zz++;
    ok(w[0] === st && w.every((c, k) => c >= 0 && c < T.COLS && (k === 0 || Math.abs(c - w[k - 1]) === 1)), 'makeZigzag 每一步左右一格');
    const sh = shapeOf(w); ok(sh.mr <= stair && sh.rev >= revMin && w.length - 1 >= 4 && w.length - 1 <= T.ROWS - 2, 'makeZigzag 形狀 ' + w.join('') + ' 樓梯 ' + sh.mr + '≤' + stair + '、回頭 ' + sh.rev + '≥' + revMin);
    ok(T.routeShape(w).maxRun === sh.mr && T.routeShape(w).rev === sh.rev, 'routeShape 與獨立計算一致');
    if (edges) ok(w.includes(0) && w.includes(T.COLS - 1), 'makeZigzag 碰到甲與戊 ' + w.join(''));
    for (let k = 2; k < w.length; k++) ok(!(w[k] === w[k - 2] && (w[k] === 0 || w[k] === T.COLS - 1)), 'makeZigzag 不在邊緣來回 ' + w.join('')); }
  ok(zz > 250, 'makeZigzag 大多走得出來：' + zz + ' / 600');
  // randomRows：嚴格遞增、在範圍內；回頭的兩個轉彎至少隔 2 層；答案前後至少隔 SOL_GAP 層
  for (let i = 0; i < 400; i++) { const w = T.makeZigzag(i % T.COLS, 3, false, 5, 2, 2, 10, rnd); if (!w) continue; const m = w.length - 1, sj = 1 + (i % (m - 2)), rows = T.randomRows(m, sj, rnd, w); if (!rows) continue;
    ok(rows.length === m && rows.every((r, k) => r >= 0 && r < T.ROWS && (k === 0 || r > rows[k - 1])), 'randomRows 嚴格遞增、在範圍內');
    for (let k = 1; k < m; k++) if (w[k - 1] === w[k + 1]) ok(rows[k] - rows[k - 1] >= 2, 'randomRows 回頭的兩個轉彎至少隔 2 層');
    ok((sj === 0 || rows[sj] - rows[sj - 1] >= T.SOL_GAP) && (sj === m - 1 || rows[sj + 1] - rows[sj] >= T.SOL_GAP), 'randomRows 答案前後留白'); }
  ok(T.randomRows(T.ROWS + 1, 0, rnd) === null, 'randomRows 放不下回傳 null');
  // cancelPairs：同一縫上下相鄰、中間兩旁沒有橫線＝互相抵消
  ok(T.cancelPairs([{ row: 2, col: 1 }, { row: 5, col: 1 }]) === 1 && T.cancelPairs([{ row: 2, col: 1 }, { row: 3, col: 0 }, { row: 5, col: 1 }]) === 0 && T.cancelPairs([{ row: 2, col: 1 }, { row: 3, col: 2 }, { row: 5, col: 1 }]) === 0, 'cancelPairs：中間旁邊有橫線就不算抵消');
  ok(T.cancelPairs([{ row: 2, col: 1 }, { row: 1, col: 0 }, { row: 5, col: 1 }]) === 1 && T.cancelPairs([{ row: 2, col: 1 }, { row: 3, col: 3 }, { row: 5, col: 1 }]) === 1, 'cancelPairs：不在兩條之間、或不在旁邊的縫，不算打斷');
  ok(T.cancelPairs([{ row: 2, col: 0 }, { row: 4, col: 0 }, { row: 7, col: 0 }]) === 2 && T.cancelPairs([]) === 0, 'cancelPairs 數對數');
  // makesCancel：新加的那一條會不會造出「＝」，要跟「加上去之後整張圖多幾對」一致（隨機比對）
  for (let i = 0; i < 3000; i++) { const rg = []; for (let k = 0; k < 8; k++) { const r = Math.floor(rnd() * T.ROWS), g = Math.floor(rnd() * 4); if (T.canPlace(rg, r, g)) rg.push({ row: r, col: g }); }
    const r = Math.floor(rnd() * T.ROWS), g = Math.floor(rnd() * 4); if (!T.canPlace(rg, r, g)) continue;
    const before = T.cancelPairs(rg), after = T.cancelPairs(rg.concat([{ row: r, col: g }]));
    const sameGap = rg.filter(o => o.col === g), up = sameGap.filter(o => o.row < r).sort((x, y) => y.row - x.row)[0], dn = sameGap.filter(o => o.row > r).sort((x, y) => x.row - y.row)[0];
    const br = (r1, r2) => rg.some(o => (o.col === g - 1 || o.col === g + 1) && o.row > r1 && o.row < r2);
    const expect = !!((up && !br(up.row, r)) || (dn && !br(r, dn.row)));
    ok(T.makesCancel(rg, r, g) === expect, 'makesCancel 與定義一致');
    if (!expect) ok(after <= before, 'makesCancel＝false：整張圖的「＝」不會變多'); }
}
{ let n = 0, touch = 0, hideOK = 0, hideMin = 0, sweepOK = 0, sweepN = 0, sumB = 0, sumA = 0, nTop = 0, startCnt = new Array(T.COLS).fill(0), cancel = 0, shapeOK = 0, longStair = 0, nearSum = 0, nearN = 0, grpOK = 0;
  for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 30; k++) {
    const q = T.makeLevel(l, rnd), fp = T.fitPlan(l, T.revAt(l)); n++; startCnt[q.start]++;   // V1.33.1：參數太大時，要求先壓到 16 層放得下（fitPlan）；V1.33.2：前後藏的轉彎是「合計」（fp.hide）
    // 每一種畫對的位置都不碰起點、終點的直線（AVOID_ENDS）
    if (q.solutions.some(p => [p.col, p.col + 1].some(c => c === q.start || c === q.target))) touch++;
    // 第二輪：整張圖（畫上答案前後）沒有「＝」；路線的形狀（同方向最多連走、回頭次數）照參數（放寬的最後一關例外）；沒有 4 步以上的長樓梯
    if (T.cancelPairs(q.rungs) || q.solutions.some(p => T.cancelPairs(q.rungs.concat([p])))) cancel++;   // 題目沒有「＝」，答案畫上去也不會變成「＝」
    { const full = q.rungs.concat([q.sol]), sset = {}; full.forEach(g => { sset[g.row + ',' + g.col] = 1; }); let c = q.start; const w = [c], at = [];
      for (let r = 0; r < T.ROWS; r++) { at.push(c); if (sset[r + ',' + c]) c++; else if (sset[r + ',' + (c - 1)]) c--; if (c !== w[w.length - 1]) w.push(c); }
      const sh = T.routeShape(w); if (sh.maxRun <= T.stairAt(l) + 1 && sh.rev >= Math.max(1, T.revAt(l) - 1)) shapeOK++; if (sh.maxRun > T.stairAt(l) + 1) longStair++;   // 放寬一級（同方向多 1 步、少回頭 1 次）也算
      ok(sh.maxRun === q.shape.maxRun && sh.rev === q.shape.rev, '出題記錄的路線形狀與實際一致');
      const off = q.rungs.filter(g => g.col !== at[g.row] && g.col + 1 !== at[g.row]); if (off.length) { nearSum += off.filter(g => Math.min(Math.abs(g.col - at[g.row]), Math.abs(g.col + 1 - at[g.row])) === 1).length / off.length; nearN++; } }
    if (T.answerGroups(q.solutions).every(g => g.to - g.from + 1 <= T.groupMaxAt(l) + 2)) grpOK++;
    // 每一種畫對的位置，前後都藏了轉彎：前後「合計」照參數（fitPlan 的 hide；放寬的關卡少 2 個）；至少前、後各 1 個（答案不碰起點、終點的直線）
    const hs = q.solutions.map(p => T.hideOf(q.rungs, q.start, p));
    if (hs.every(h => h.before + h.after >= fp.hide - 2)) hideOK++;
    if (hs.every(h => h.before >= 1 && h.after >= 1)) hideMin++;
    if (l >= T.RAMP_LEVELS - 4) { nTop++; hs.forEach(h => { sumB += h.before / hs.length; sumA += h.after / hs.length; }); }
    // 第 SWEEP_FROM 關起：畫對之後的路線經過甲與戊（兩邊的邊緣）
    if (l >= T.SWEEP_FROM) { sweepN++; const vc = T.visitedCols(q.rungs.concat([q.solutions[0]]), q.start); if (vc[0] === 0 && vc[vc.length - 1] === T.COLS - 1) sweepOK++; }
  }
  ok(T.AVOID_ENDS && touch === 0, '答案都不碰起點、終點的直線：碰到的題 ' + touch + ' / ' + n);
  ok(hideMin === n, '每一種答案前後至少各藏 1 個轉彎：' + hideMin + ' / ' + n);
  ok(hideOK / n > 0.9, '每一種答案前後合計藏的轉彎數達到要求（fitPlan 的 hide；放寬的關卡少 2 個）：' + hideOK + ' / ' + n);
  ok(sweepOK / sweepN > 0.97, '第 ' + T.SWEEP_FROM + ' 關起路線碰到甲與戊：' + sweepOK + ' / ' + sweepN);
  ok(cancel === 0, '題目裡沒有「＝」、答案畫上去也不會變成「＝」：有的題 ' + cancel + ' / ' + n);
  ok(shapeOK / n > 0.97, '路線形狀照參數（同方向最多連走 STAIR、至少回頭 REVERSE；可以放寬一級）：' + shapeOK + ' / ' + n);
  ok(longStair / n < 0.03, '幾乎沒有比 STAIR＋1 更長的樓梯：' + longStair + ' / ' + n);
  ok(nearSum / nearN > 0.6, '其他橫線大多貼著路線旁邊（碰到路線隔壁的直線）：' + (100 * nearSum / nearN).toFixed(1) + '%');
  ok(grpOK / n > 0.95, '答案那一段不會太長（GROUP_MAX）：' + grpOK + ' / ' + n);
  const fpTop = T.fitPlan(T.RAMP_LEVELS, T.revAt(T.RAMP_LEVELS));
  ok((sumB + sumA) / nTop >= fpTop.hide - 1, '最後 5 關的答案平均前面藏 ' + (sumB / nTop).toFixed(2) + ' 彎、後面藏 ' + (sumA / nTop).toFixed(2) + ' 彎（合計要 ≥ ' + (fpTop.hide - 1) + '）');
  console.log('V1.33.2：答案前後藏的轉彎（最後 5 關平均）' + (sumB / nTop).toFixed(2) + '／' + (sumA / nTop).toFixed(2) + '；碰到甲與戊 ' + sweepOK + '/' + sweepN + '；路線形狀照參數 ' + shapeOK + '/' + n + '、長樓梯 ' + longStair + '；其他橫線貼著路線 ' + (100 * nearSum / nearN).toFixed(1) + '%；起點分布 ' + startCnt.join(','));
}
// V1.33.2（答案位置太好猜：答案幾乎都在正確路線的中段）：答案是路線上第幾個轉彎，每一題平均地隨機挑；前後藏的轉彎改成「合計」
{ // ── 純函式：answerOk／answerIndex／answerThird ──
  // 路線 0→1→2→3→2→3→4→5→4 共 8 個轉彎：(0,1)(1,2)(2,3)(2,3)(2,3)(3,4)(4,5)(4,5)；起點是 0、終點是 4，碰到 0 或 4 的轉彎不能當答案
  const w = [0, 1, 2, 3, 2, 3, 4, 5, 4];
  ok([0, 1, 2, 3, 4, 5, 6, 7].map(k => T.answerOk(w, k)).join() === 'false,true,true,true,true,false,false,false' && !T.answerOk(w, -1) && !T.answerOk(w, 8), 'answerOk：碰到起點或終點的直線的轉彎不能當答案');
  ok(T.answerIndex(0, w) === 1 && T.answerIndex(0.999, w) === 4 && T.answerIndex(0.5, w) === 3, 'answerIndex：u 對應的位置不能當答案，就挑離它最近、能當答案的轉彎（u＝0 → 第 1 個、u≈1 → 最後一個能當答案的、u＝0.5 → 中間）');
  ok(T.answerIndex(0.5, [0, 1, 0]) === -1, 'answerIndex：沒有轉彎能當答案回傳 -1');
  // answerThird：8 個轉彎，能當答案的是第 1～6 個（共 6 個），兩個一段
  ok([1, 2, 3, 4, 5, 6].map(k => T.answerThird(k, 8)).join() === '0,0,1,1,2,2', 'answerThird：能當答案的轉彎平分成前／中／後三段');
  // u 不論多少，挑到的都能當答案；u 越大挑到的越後面（單調）
  for (let i = 0; i < 300; i++) { const w2 = T.makeZigzag(i % T.COLS, 4, false, 6, 3, 1, T.ROWS - 2, rnd); if (!w2) continue;
    let prev = -1; for (let u = 0; u < 1; u += 0.05) { const k = T.answerIndex(u, w2); if (k < 0) break; ok(T.answerOk(w2, k) && k >= prev, 'answerIndex 單調、能當答案 ' + w2.join('') + ' u=' + u); prev = k; } } }
{ // ── placements（V1.33.2 改快）要跟「每個位置加一條再從頭走一遍」完全一樣 ──
  let bad2 = 0;
  for (let i = 0; i < 1500; i++) {
    const rg = []; for (let k = Math.floor(rnd() * 30); k > 0; k--) { const r = Math.floor(rnd() * T.ROWS), g = Math.floor(rnd() * (T.COLS - 1)); if (T.canPlace(rg, r, g)) rg.push({ row: r, col: g }); }
    const st = Math.floor(rnd() * T.COLS), got = T.placements(rg, st), want = [];
    for (let r = 0; r < T.ROWS; r++) for (let c = 0; c <= T.COLS - 2; c++) if (T.canPlace(rg, r, c)) want.push({ row: r, col: c, end: T.follow(rg.concat([{ row: r, col: c }]), st).end });
    if (JSON.stringify(got) !== JSON.stringify(want)) bad2++;
  }
  ok(bad2 === 0, 'placements 與逐個走一遍的結果完全一樣：不同的圖 ' + bad2 + ' / 1500'); }
{ // ── randomRows：答案本身是回頭的轉彎時，間隔要空 SOL_GAP＋1 層（不然打斷「＝」的橫線只能放在答案的留白裡，永遠放不下） ──
  const w = [2, 3, 2, 1, 2, 3, 4, 3];       // 第 0、1 個轉彎都在 (2,3) 這一縫＝回頭；其他不回頭
  let n2 = 0; for (let i = 0; i < 300; i++) for (const sj of [0, 1]) { const rows = T.randomRows(7, sj, rnd, w); if (!rows) continue; n2++; ok(rows[1] - rows[0] >= T.SOL_GAP + 1, 'randomRows：答案貼著回頭，間隔要 ≥ SOL_GAP＋1：' + (rows[1] - rows[0])); }
  ok(n2 > 100, 'randomRows 放得下 ' + n2);
  // 不貼著答案的回頭，仍然只要 2 層
  let two = 0; for (let i = 0; i < 300; i++) { const rows = T.randomRows(7, 5, rnd, w); if (rows && rows[1] - rows[0] === 2) two++; }
  ok(two > 0, 'randomRows：不貼著答案的回頭仍然可以只隔 2 層'); }
{ // ── construct：u＝答案位置，一題只抽一次；pos＝true 時答案一定落在 u 那一段 ──
  let made = 0, madePos = 0, tries = 0;
  for (let i = 0; i < 600; i++) {
    const u = rnd(), pos = i % 2 === 0, o = { start: i % T.COLS, n: 20, vNeed: 5, sweep: i % 3 === 0, minTurns: 8, stair: 4, rev: 2, u, pos };
    const cst = T.construct(o, rnd); tries++; if (!cst) continue; made++;
    const m = cst.walk.length - 1;
    ok(cst.sj === T.answerIndex(u, cst.walk) && T.answerOk(cst.walk, cst.sj) && cst.sol.row === cst.rows[cst.sj], 'construct：答案就是 answerIndex 挑的那一個轉彎');
    if (pos) { madePos++; ok(T.answerThird(cst.sj, m) === Math.min(2, Math.floor(u * 3)), 'construct pos＝true：答案落在 u 那一段 ' + cst.sj + '/' + m + ' u=' + u.toFixed(2)); }
  }
  ok(made > 150 && madePos > 60, 'construct 蓋得出來：' + made + ' / ' + tries + '（pos 的 ' + madePos + '）'); }
{ // ── makeLevel：u 是第一個亂數、一題只抽一次，答案位置跟著 u 走（u 小 → 答案靠前、u 大 → 靠後）──
  const route2 = (rg, st) => { const s = {}; rg.forEach(g => { s[g.row + ',' + g.col] = g; }); let c = st; const out = []; for (let r = 0; r < T.ROWS; r++) { if (s[r + ',' + c]) { out.push(s[r + ',' + c]); c++; } else if (s[r + ',' + (c - 1)]) { out.push(s[r + ',' + (c - 1)]); c--; } } return out; };
  const meanPos = U => { let sum = 0, cnt = 0; for (let i = 0; i < 80; i++) { let first = true; const rr = () => { if (first) { first = false; return U; } return rnd(); };
      const q = T.makeLevel(12, rr), rt = route2(q.rungs.concat([q.sol]), q.start), idx = rt.findIndex(g => g.row === q.sol.row && g.col === q.sol.col); sum += (idx - 1) / Math.max(1, rt.length - 3); cnt++; } return sum / cnt; };
  const a = meanPos(0.1), b = meanPos(0.5), c2 = meanPos(0.9);
  ok(a < b - 0.1 && b < c2 - 0.1, '第 12 關：u 越大答案越靠後（平均位置 0.1→' + a.toFixed(2) + '、0.5→' + b.toFixed(2) + '、0.9→' + c2.toFixed(2) + '）'); }
{ // ── 答案位置：前／中／後三分之一（「能當答案的轉彎」平分成三段）要平均，不能再總是中間（舊版全部 15／83／2%，第 10～22 關幾乎 0／100／0%） ──
  const route2 = (rg, st) => { const s = {}; rg.forEach(g => { s[g.row + ',' + g.col] = g; }); let c = st; const out = []; for (let r = 0; r < T.ROWS; r++) { if (s[r + ',' + c]) { out.push(s[r + ',' + c]); c++; } else if (s[r + ',' + (c - 1)]) { out.push(s[r + ',' + (c - 1)]); c--; } } return out; };
  const buckets = { '1-7': [1, 7], '8-15': [8, 15], '16-22': [16, 22], '23-30': [23, 30] }, tot = {}, all = [0, 0, 0]; let nAll = 0, center = 0;
  for (const b in buckets) tot[b] = [0, 0, 0, 0];
  for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 20; k++) {
    const q = T.makeLevel(l, rnd), rt = route2(q.rungs.concat([q.sol]), q.start), m = rt.length, idx = rt.findIndex(g => g.row === q.sol.row && g.col === q.sol.col);
    ok(idx === q.turn && m === q.turns, '出題記錄的「答案是第幾個轉彎」與實際一致 ' + idx + '/' + m + ' vs ' + q.turn + '/' + q.turns);
    const t = T.answerThird(idx, m); all[t]++; nAll++; if (Math.abs(idx - (m - 1) / 2) <= 0.5) center++;
    for (const b in buckets) if (l >= buckets[b][0] && l <= buckets[b][1]) { tot[b][t]++; tot[b][3]++; }
  }
  const pct = x => (100 * x / nAll).toFixed(0);
  ok(all.every(v => v / nAll >= 0.10) && all[1] / nAll <= 0.55 && all[0] / nAll <= 0.60, '答案位置 前／中／後：' + all.map(pct).join('/') + '%（每一段都要出現、中間不能超過 55%；舊版 15/83/2）');
  for (const b in buckets) { const v = tot[b]; ok(v[1] / v[3] <= 0.65 && v[2] / v[3] >= 0.03 && v[0] / v[3] >= 0.15, '第 ' + b + ' 關 答案位置 前／中／後：' + v.slice(0, 3).map(x => (100 * x / v[3]).toFixed(0)).join('/') + '%（中間 ≤ 65%、前 ≥ 15%、後 ≥ 3%；舊版 12/88/0）'); }
  ok(center / nAll < 0.3, '答案剛好在路線正中間的不多：' + (100 * center / nAll).toFixed(0) + '%');
  console.log('V1.33.2：答案位置（前/中/後）全部 ' + all.map(pct).join('/') + '%；' + Object.keys(buckets).map(b => b + '關 ' + tot[b].slice(0, 3).map(x => (100 * x / tot[b][3]).toFixed(0)).join('/')).join('；')); }
{ // ── POS_EXTRA（路線形狀再多放寬）：答案位置更平均，題目照樣合規（另存一份、把 POS_EXTRA 改成 2 載入）──
  const fs2 = require('fs'), os2 = require('os'), path2 = require('path');
  const src2 = fs2.readFileSync(path2.resolve(__dirname, '../../js/reaction_ghostleg.js'), 'utf8');
  ok(/var POS_EXTRA = [0-9]+;/.test(src2) && T.POS_EXTRA === 0, '預設 POS_EXTRA＝0（不再多放寬路線形狀）');
  const tmp2 = path2.join(os2.tmpdir(), 'gl_posextra_' + process.pid + '.js');
  fs2.writeFileSync(tmp2, src2.replace("var ID = 'ghostleg'", "var ID = 'ghostlegx'").replace(/var POS_EXTRA = [^;]*;/, 'var POS_EXTRA = 2;'));
  try {
    const before2 = Reaction.list().length; require(tmp2); const X = Reaction.list()[before2].test;
    const route3 = (rg, st) => { const s = {}; rg.forEach(g => { s[g.row + ',' + g.col] = g; }); let c = st; const out = []; for (let r = 0; r < X.ROWS; r++) { if (s[r + ',' + c]) { out.push(s[r + ',' + c]); c++; } else if (s[r + ',' + (c - 1)]) { out.push(s[r + ',' + (c - 1)]); c--; } } return out; };
    const th = [0, 0, 0]; let n5 = 0;
    for (let l = 23; l <= X.RAMP_LEVELS; l++) for (let k = 0; k < 20; k++) {
      const q = X.makeLevel(l, rnd); n5++;
      ok(q.rungs.length > 1 && X.follow(q.rungs, q.start).end === q.end0 && q.end0 !== q.target, 'POS_EXTRA＝2：現有的線走不到終點');
      ok(q.solutions.length >= 1 && q.solutions.every(s => X.canPlace(q.rungs, s.row, s.col) && X.follow(q.rungs.concat([s]), q.start).end === q.target), 'POS_EXTRA＝2：每一種畫法真的走到終點');
      const rt = route3(q.rungs.concat([q.sol]), q.start), idx = rt.findIndex(g => g.row === q.sol.row && g.col === q.sol.col); th[X.answerThird(idx, rt.length)]++;
    }
    ok(th[2] / n5 >= 0.2 && th[1] / n5 <= 0.5, 'POS_EXTRA＝2：第 23～30 關答案位置前／中／後 ' + th.map(x => (100 * x / n5).toFixed(0)).join('/') + '%（後 ≥ 20%、中 ≤ 50%；預設是 41/45/14）');
  } finally { fs2.unlinkSync(tmp2); } }

{ // ── 起點：一題抽一次、不因為做不出來而換起點（舊版第 23～30 關丙、丁幾乎不出現）；出題夠快 ──
  const st = new Array(T.COLS).fill(0), en = new Array(T.COLS).fill(0); let n3 = 0, tSum = 0, tMax = 0;
  for (let l = 23; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 40; k++) { const t0 = Date.now(), q = T.makeLevel(l, rnd), dt = Date.now() - t0; tSum += dt; tMax = Math.max(tMax, dt); st[q.start]++; en[q.target]++; n3++; }
  ok(st.every(v => v >= n3 / T.COLS * 0.5), '第 23～30 關起點平均分布（每一條至少一半的機會）：' + st.join(',') + '（舊版 71,71,22,16,70,70）');
  ok(en.every(v => v > 0), '第 23～30 關終點每一條都會出現：' + en.join(','));
  ok(tSum / n3 < 50 && tMax < 600, '出題夠快：第 23～30 關平均 ' + (tSum / n3).toFixed(1) + ' ms、最慢 ' + tMax + ' ms（舊版平均 26 ms、最慢 95 ms）');
  let t2 = 0, t2max = 0, n4 = 0; for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 10; k++) { const t0 = Date.now(); T.makeLevel(l, rnd); const dt = Date.now() - t0; t2 += dt; t2max = Math.max(t2max, dt); n4++; }
  ok(t2 / n4 < 50 && t2max < 600, '全部關卡出題夠快：平均 ' + (t2 / n4).toFixed(1) + ' ms、最慢 ' + t2max + ' ms（舊版第 1～7 關平均 99 ms）'); }

ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(11) && T.rating(11) !== T.rating(15), '評語分級');
// 接線（原始碼／樣式）：綠底黑字起終點、玩家按住直線往旁邊拖畫粗藍線、鉛筆提示、沒有手指提示
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_ghostleg.js'), css = rd('../../css/reaction3.css');
  ok(src.indexOf('fingerHint') < 0 && src.indexOf('0x270F') > 0 && /\.gl-pencil \{/.test(css), '提示改成鉛筆圖示，取消手指圖示');
  ok(/\.gl-user \{[^}]*c-blue[^}]*stroke-width: 14/.test(css.replace(/\r?\n/g, ' ')) , '玩家畫的橫線：很粗的藍線');
  ok(/\.gl-token--go \{[^}]*c-green/.test(css.replace(/\r?\n/g, ' ')) && /\.gl-token--go\+\.gl-label,\s*\.gl-end--go\+\.gl-label \{\s*fill: var\(--c-black\)/.test(css), '起點終點：綠底黑字');
  ok(/\.gl-route \{[^}]*c-green[^}]*stroke-dasharray/.test(css.replace(/\r?\n/g, ' ')), '評審動畫：綠色粗虛線');
  ok(src.indexOf('canPlace(q.rungs, row, col)') > 0 && src.indexOf("api.stopTimer()") > 0 && src.indexOf('judge();') > 0, '畫好橫線之後才開始評審動畫'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
