// 圈內圈外（inout，企劃 271）的純函式檢查：完美迷宮是一棵樹、邊界剛好一條不交叉的封閉曲線（面積＝格數）、射線法驗證螞蟻在裡面還是外面、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_inout.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261113), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.roomsFor(1) === T.ROOMS[0] && T.roomsFor(T.RAMP_LEVELS) === T.ROOMS[1] && T.roomsFor(99) === T.ROOMS[1], '迷宮邊長 ' + T.ROOMS);
ok(T.depthMinFor(1) === T.DEPTH_MIN[0] && T.depthMinFor(T.RAMP_LEVELS) === T.DEPTH_MIN[1], '深度下限 ' + T.DEPTH_MIN);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
for (let l = 2; l <= 60; l++) ok(T.roomsFor(l) >= T.roomsFor(l - 1) && T.depthMinFor(l) >= T.depthMinFor(l - 1) && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);

// ── 工具：多邊形面積（鞋帶公式）、線段相交 ──
function area(poly) { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function segInter(p1, p2, p3, p4) {   // 兩條線段是否相交（含端點相碰）
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && on(p3, p4, p1)) || (d2 === 0 && on(p3, p4, p2)) || (d3 === 0 && on(p1, p2, p3)) || (d4 === 0 && on(p1, p2, p4));
}

// ── 手工小迷宮：1 個房間 ──
{ const mz = T.makeMaze(1, rnd); ok(mz.G === 3 && mz.P.join() === [0, 0, 0, 0, 1, 0, 0, 0, 0].join(), '1×1 的迷宮只有中間一格'); const bl = T.boundaryLoop(mz.G, mz.P); ok(bl.loops.length === 1 && bl.loops[0].length === 4 && area(bl.loops[0]) === 1, '一格的邊界是一個 1×1 的正方形'); }
{ // 手工：L 形 P（3 格）
  const G3 = 4, P = new Int8Array(G3 * G3); [[1, 1], [1, 2], [2, 1]].forEach(([r, c]) => { P[r * G3 + c] = 1; });
  const bl = T.boundaryLoop(G3, P); ok(bl.loops.length === 1 && bl.loops[0].length === 6 && Math.abs(area(bl.loops[0])) === 3, 'L 形：6 個轉角、面積 3：' + JSON.stringify(bl.loops[0]));
  ok(T.pointInPoly(1.5, 1.5, bl.loops[0]) && T.pointInPoly(2.5, 1.5, bl.loops[0]) && !T.pointInPoly(2.5, 2.5, bl.loops[0]) && !T.pointInPoly(0.5, 0.5, bl.loops[0]), 'pointInPoly：L 形裡外'); }

// ── 迷宮與繩圈（多組隨機）──
for (let i = 0; i < 300; i++) {
  const m = 2 + Math.floor(rnd() * 9), mz = T.makeMaze(m, rnd), G = mz.G, P = mz.P;
  const cnt = P.reduce((a, b) => a + b, 0);
  ok(G === 2 * m + 1 && cnt === 2 * m * m - 1, '迷宮 ' + m + '×' + m + '：房間 + 通道 = ' + (2 * m * m - 1) + '（樹：m² 個房間、m²−1 個通道），實際 ' + cnt);
  let rooms = 0, borderP = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) { if (r % 2 && c % 2) { if (P[r * G + c]) rooms++; } if (P[r * G + c] && (r === 0 || c === 0 || r === G - 1 || c === G - 1)) borderP++; }
  ok(rooms === m * m && borderP === 0, '每個房間都在、外框沒有 P');
  const ds = T.distances(G, P, mz.root); let unreachable = 0; for (let k = 0; k < G * G; k++) if (P[k] && ds.dIn[k] < 0) unreachable++;
  ok(unreachable === 0 && ds.dIn[mz.root] === 0, 'P 全部連通（一整塊）');
  let wUnreach = 0; for (let k = 0; k < G * G; k++) if (!P[k] && ds.dOut[k] < 0) wUnreach++; ok(wUnreach === 0, '外面（牆）全部連通到外框（P 沒有洞）');
  // 2×2 的小方塊不會出現「兩個 P 只靠對角相連」
  let pinch = 0; for (let r = 0; r < G - 1; r++) for (let c = 0; c < G - 1; c++) { const a = P[r * G + c], b = P[r * G + c + 1], d = P[(r + 1) * G + c], e = P[(r + 1) * G + c + 1]; if ((a && e && !b && !d) || (b && d && !a && !e)) pinch++; } ok(pinch === 0, '沒有夾點');
  const bl = T.boundaryLoop(G, P); ok(bl.loops.length === 1 && bl.edges === bl.used, '邊界剛好一條封閉曲線（' + bl.loops.length + ' 條、邊 ' + bl.edges + '／已接 ' + bl.used + '）');
  const loop = bl.loops[0]; ok(Math.abs(area(loop) - cnt) < 1e-9 || Math.abs(Math.abs(area(loop)) - cnt) < 1e-9, '繩圈圍起來的面積 = P 的格數（' + Math.abs(area(loop)) + '／' + cnt + '）');
  ok(new Set(loop.map(p => p.join(','))).size === loop.length, '頂點不重複（不會碰到自己）');
  ok(loop.every((p, k) => { const nx = loop[(k + 1) % loop.length], pv = loop[(k + loop.length - 1) % loop.length]; return (p[0] === nx[0]) !== (p[1] === nx[1]) && ((p[0] - pv[0]) * (nx[1] - p[1]) - (p[1] - pv[1]) * (nx[0] - p[0])) !== 0; }), '每個頂點都是真的轉角（直角、方向不同）');
  if (i % 10 === 0) { let cross = 0; const n = loop.length; for (let a = 0; a < n; a++) for (let b = a + 2; b < n; b++) { if (a === 0 && b === n - 1) continue; if (segInter(loop[a], loop[(a + 1) % n], loop[b], loop[(b + 1) % n])) cross++; } ok(cross === 0, '繩圈不會自己交叉（頂點數 ' + n + '）'); }
  // 射線法：每一格的中心在不在繩圈裡 = 這一格是不是 P
  let mis = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (T.pointInPoly(c + 0.5, r + 0.5, loop) !== !!P[r * G + c]) mis++; ok(mis === 0, '射線法：每一格內外都跟 P 一致（不一致 ' + mis + '）');
}
// loopPath
{ const mz = T.makeMaze(3, rnd), loop = T.boundaryLoop(mz.G, mz.P).loops[0], d = T.loopPath(loop, 30, T.ROUND); ok(/^M/.test(d) && /Z$/.test(d) && (d.match(/Q/g) || []).length === loop.length && (d.match(/L/g) || []).length === loop.length - 1, 'loopPath：每個頂點一段圓弧'); }

// ── 整關 ──
let total = 0, inside = 0, deepOk = 0, deepTot = 0, dep = { in: [], out: [] };
for (let i = 0; i < 800; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  ok(q.m === T.roomsFor(lv) && q.G === 2 * q.m + 1, '第 ' + lv + ' 關：' + q.m + '×' + q.m);
  ok(q.ant.cell === q.ant.r * q.G + q.ant.c && q.ant.inside === !!q.P[q.ant.cell], '答案（在不在 P）一致');
  ok(T.pointInPoly(q.ant.c + 0.5, q.ant.r + 0.5, q.loop) === q.ant.inside, '射線法驗證：螞蟻在繩圈' + (q.ant.inside ? '裡面' : '外面'));
  if (!q.ant.inside) ok(q.ant.r > 0 && q.ant.c > 0 && q.ant.r < q.G - 1 && q.ant.c < q.G - 1, '外面的螞蟻不在最外框上');
  if (q.ant.inside) inside++;
  deepTot++; if (q.depth >= q.depthMin) deepOk++; (q.ant.inside ? dep.in : dep.out).push(q.depth);
  ok(q.depth >= 0, '深度是正的');
}
const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log('在裡面 ' + inside + '／' + total + '；達到深度下限的 ' + deepOk + '／' + deepTot + '；平均深度 裡面 ' + avg(dep.in).toFixed(1) + '、外面 ' + avg(dep.out).toFixed(1));
ok(inside / total > 0.4 && inside / total < 0.6, '裡面／外面各約一半：' + (100 * inside / total).toFixed(0) + '% 在裡面');
ok(deepOk / deepTot > 0.9, '絕大多數題目都達到深度下限：' + (100 * deepOk / deepTot).toFixed(0) + '%');
// 到頂的關卡，螞蟻平均比第 1 關深（凹口越深）
{ const d1 = [], d24 = []; for (let i = 0; i < 200; i++) { d1.push(T.makeLevel(1, rnd).depth); d24.push(T.makeLevel(T.RAMP_LEVELS, rnd).depth); } ok(avg(d24) > avg(d1) + 2, '到頂關卡的螞蟻比第 1 關深：' + avg(d1).toFixed(1) + ' → ' + avg(d24).toFixed(1)); }
// 效能
for (const lv of [1, 12, 24, 40]) { const t0 = Date.now(); let worst = 0; for (let i = 0; i < 100; i++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 100; console.log('第' + lv + '關 出題平均 ' + per.toFixed(2) + ' 毫秒、最慢 ' + worst); ok(per < 80 && worst < 300, '第 ' + lv + ' 關出題夠快：' + per.toFixed(2) + '／' + worst); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_inout.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3000/.test(src) && /iof-fill--show/.test(src), '失敗停格 3 秒、裡面塗上淡綠色');
  ok(/\.iof-fill \{[^}]*var\(--c-ok/.test(css) && /\.iof-rope \{[^}]*var\(--iof-rope\)/.test(css) && /\.iof-btn--ok \{[^}]*var\(--c-ok/.test(css), '綠色、紅色繩子用 CSS 變數');
  ok(boot.indexOf("'js/reaction_inout.js'") > 0 && /螞蟻/.test(G.rule), 'boot.js 有載入、玩法說明提到螞蟻'); }
// ── V1.36.0 玩家意見：線條太規則整齊 → 不均勻的格線＋整條扭曲成不規則的曲線；螞蟻縮小成一半 ──
ok(T.ANT_SIZE <= 0.45 && T.ANT_SIZE > 0.2, '螞蟻大小是格子的 ' + T.ANT_SIZE + ' 倍（原本 0.9 的一半）');
ok(T.varianceFor(1) === T.VARIANCE[0] && near(T.varianceFor(T.RAMP_LEVELS), T.VARIANCE[1]) && T.warpAFor(1) === T.WARP_A[0] && near(T.warpAFor(T.RAMP_LEVELS), T.WARP_A[1]), '格線不均勻程度 ' + T.VARIANCE + '、扭曲幅度 ' + T.WARP_A + ' 隨關卡增加');
for (let l = 2; l <= 60; l++) ok(T.varianceFor(l) >= T.varianceFor(l - 1) && T.warpAFor(l) >= T.warpAFor(l - 1), '不規則程度單調 ' + l);
{ for (let k = 0; k < 200; k++) { const G = 7 + 2 * Math.floor(rnd() * 8), v = rnd() * 0.5, xs = T.gridLines(G, v, rnd);
    ok(xs.length === G + 1 && xs[0] === 0 && xs[G] === G && xs.every((x, j) => !j || x > xs[j - 1]), '格線座標遞增、從 0 到 ' + G);
    const wmin = Math.min(...xs.slice(1).map((x, j) => x - xs[j])), wmax = Math.max(...xs.slice(1).map((x, j) => x - xs[j])); ok(wmin > (1 - v) * 0.7 && wmax < (1 + v) * 1.4, '每一格的寬度在 1 ± ' + v.toFixed(2) + ' 附近（縮放後 ' + wmin.toFixed(2) + '～' + wmax.toFixed(2) + '）'); }
  const x0 = T.gridLines(9, 0, rnd); ok(x0.every((x, j) => Math.abs(x - j) < 1e-9), '不均勻程度 0 ＝ 一般的均勻格線'); }
// 扭曲是一對一的連續變形：雅可比行列式處處大於 0（梯度小於 1），所以繩圈不會被扭得穿過自己
{ let minDet = 9, maxA = T.WARP_A[1] * 1.0; for (let k = 0; k < 400; k++) { const w = T.warpParams(maxA, rnd), x = rnd() * 24, y = rnd() * 24, e = 1e-5;
    const p = T.warpPoint(x, y, w), px = T.warpPoint(x + e, y, w), py = T.warpPoint(x, y + e, w);
    const det = ((px[0] - p[0]) / e) * ((py[1] - p[1]) / e) - ((py[0] - p[0]) / e) * ((px[1] - p[1]) / e); minDet = Math.min(minDet, det); }
  ok(minDet > 0.05, '最大扭曲幅度 ' + maxA + ' 時，雅可比行列式最小 ' + minDet.toFixed(3) + ' > 0（一對一、不會翻過來）');
  const w0 = T.warpParams(0, rnd), p0 = T.warpPoint(3.3, 4.4, w0); ok(near(p0[0], 3.3) && near(p0[1], 4.4), '幅度 0 ＝ 不扭曲'); }
// 線段相交、折線自交
ok(T.segCross([0, 0], [2, 2], [0, 2], [2, 0]) && !T.segCross([0, 0], [1, 1], [2, 2], [3, 3]) && !T.segCross([0, 0], [1, 0], [0, 1], [1, 1]) && !T.segCross([0, 0], [2, 0], [2, 0], [2, 2]), 'segCross：交叉、共線、平行、端點相接');
ok(T.selfCrosses([[0, 0], [4, 4], [4, 0], [0, 4]]) && !T.selfCrosses([[0, 0], [4, 0], [4, 4], [0, 4]]), 'selfCrosses：蝴蝶結（自己交叉）與正方形');
// 整關：曲線是一條不自己交叉的封閉曲線，螞蟻的內外沒被扭曲弄錯；曲線確實不規則
{ let nonOrtho = 0, tot = 0, fallback = 0, minDistSum = 0, N = 0;
  for (let i = 0; i < 400; i++) {
    const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd);
    ok(Array.isArray(q.curve) && q.curve.length > 20 && q.curve.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])) && Array.isArray(q.antXY), '第 ' + lv + ' 關有曲線與螞蟻位置');
    ok(!T.selfCrosses(q.curve), '第 ' + lv + ' 關：曲線沒有自己穿過自己（' + q.curve.length + ' 個點）');
    ok(T.pointInPoly(q.antXY[0], q.antXY[1], q.curve) === q.ant.inside, '第 ' + lv + ' 關：扭曲之後螞蟻還是在繩圈' + (q.ant.inside ? '裡面' : '外面'));
    const bx = q.curve.map(p => p[0]), by = q.curve.map(p => p[1]); ok(Math.min(...bx) > -1.2 && Math.max(...bx) < q.G + 1.2 && Math.min(...by) > -1.2 && Math.max(...by) < q.G + 1.2, '曲線沒有跑出棋盤太遠');
    // 不規則：相鄰兩段的方向不是只有橫平豎直（扭曲之後大部分線段是斜的）
    if (lv >= 5) { let diag = 0; for (let k = 0; k < q.curve.length; k++) { const a = q.curve[k], b = q.curve[(k + 1) % q.curve.length], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]); if (dx > 1e-3 && dy > 1e-3 && Math.min(dx, dy) / Math.max(dx, dy) > 0.05) diag++; } nonOrtho += diag / q.curve.length; tot++; }
    if (q.warpA > 0 && T.selfCrosses(q.curve)) fallback++;
  }
  console.log('第 5 關起，曲線有 ' + (100 * nonOrtho / tot).toFixed(0) + '% 的線段是斜的（不是橫平豎直）');
  ok(nonOrtho / tot > 0.5, '曲線大多是斜的、彎的（不再是橫平豎直）：' + (100 * nonOrtho / tot).toFixed(0) + '%'); }
// 螞蟻跟繩圈的距離：不會被扭曲到壓在繩子上（至少有一點空隙）
{ let worst = 9; for (let i = 0; i < 300; i++) { const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); let d = 1e9; for (let k = 0; k < q.curve.length; k++) { const a = q.curve[k], b = q.curve[(k + 1) % q.curve.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, s = L2 > 0 ? Math.max(0, Math.min(1, ((q.antXY[0] - a[0]) * dx + (q.antXY[1] - a[1]) * dy) / L2)) : 0; d = Math.min(d, Math.hypot(q.antXY[0] - (a[0] + s * dx), q.antXY[1] - (a[1] + s * dy))); } worst = Math.min(worst, d); }
  ok(worst > T.ANT_SIZE * 0.3, '螞蟻離繩子至少 ' + worst.toFixed(2) + ' 格（螞蟻身長 ' + T.ANT_SIZE + ' 格）'); console.log('螞蟻離繩子最近 ' + worst.toFixed(2) + ' 格'); }
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_inout.js'), 'utf8');
  ok(src.indexOf('polyPath(q.curve, cs)') > 0 && src.indexOf('drawAnt(svg, q.antXY[0] * cs, q.antXY[1] * cs, cs * ANT_SIZE') > 0, '畫面用扭曲後的曲線與螞蟻位置，螞蟻是 ANT_SIZE 倍'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
