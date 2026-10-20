// 圈內圈外（inout，企劃 271）的純函式檢查：完美迷宮是一棵樹、邊界剛好一條不交叉的封閉曲線（面積＝格數）、射線法驗證螞蟻在裡面還是外面、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_inout.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261113), rnd = rng(SEED);

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
for (const lv of [1, 12, 24, 40]) { const t0 = Date.now(); let worst = 0; for (let i = 0; i < 100; i++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 100; console.log('第' + lv + '關 出題平均 ' + per.toFixed(2) + ' 毫秒、最慢 ' + worst); ok(per < 20 && worst < 100, '第 ' + lv + ' 關出題夠快：' + per.toFixed(2) + '／' + worst); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_inout.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3000/.test(src) && /iof-fill--show/.test(src), '失敗停格 3 秒、裡面塗上淡綠色');
  ok(/\.iof-fill \{[^}]*var\(--c-ok/.test(css) && /\.iof-rope \{[^}]*var\(--iof-rope\)/.test(css) && /\.iof-btn--ok \{[^}]*var\(--c-ok/.test(css), '綠色、紅色繩子用 CSS 變數');
  ok(boot.indexOf("'js/reaction_inout.js'") > 0 && /螞蟻/.test(G.rule), 'boot.js 有載入、玩法說明提到螞蟻'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
