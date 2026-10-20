// 找正方形（findsquare，企劃 260）的純函式檢查：正方形誤差、旋轉、誘餌、窮舉驗證「剛好只有一個正方形」、說明文字、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_findsquare.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261111), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);

// ── 難度 ──
ok(T.pointsFor(1) === T.POINTS[0] && T.pointsFor(T.RAMP_LEVELS) === T.POINTS[1] && T.pointsFor(99) === T.POINTS[1], '星星數 ' + T.POINTS);
ok(T.decoysFor(1) === T.DECOYS[0] && T.decoysFor(T.RAMP_LEVELS) === T.DECOYS[1], '誘餌組數 ' + T.DECOYS);
ok(near(T.decoyMaxFor(1), T.DECOY_MAX[0]) && near(T.decoyMaxFor(T.RAMP_LEVELS), T.DECOY_MAX[1]), '誘餌誤差上限 ' + T.DECOY_MAX);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
for (let l = 2; l <= 60; l++) ok(T.pointsFor(l) >= T.pointsFor(l - 1) && T.decoysFor(l) >= T.decoysFor(l - 1) && T.decoyMaxFor(l) <= T.decoyMaxFor(l - 1) && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.pointsFor(l) - T.pointsFor(l - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '星星數線性成長：每關 +' + Math.min(...d) + '～' + Math.max(...d)); }

// ── 正方形誤差 ──
{ const sq = T.squareAt(200, 200, 120, 30), m = T.quadMetrics(sq); ok(m.eps < 0.005 && T.squareErr(sq) < T.EPS_SQ, '轉 30° 的正方形：eps ' + m.eps.toFixed(5));
  ok(near(T.dist(sq[0], sq[1]), 120, 0.2) && near(T.dist(sq[1], sq[2]), 120, 0.2) && near(T.dist(sq[0], sq[2]), 120 * Math.SQRT2, 0.3), '邊 120、對角線 120√2');
  // 打亂順序 eps 不變
  const sh = [sq[2], sq[0], sq[3], sq[1]]; ok(near(T.squareErr(sh), m.eps), 'eps 與點的順序無關'); }
for (const deg of [0, 15, 45, 60, 75, 90]) ok(T.squareErr(T.squareAt(220, 250, 150, deg)) < 0.003, '轉 ' + deg + '° 都是正方形');
{ const r = T.decoyAt(200, 200, 120, 20, 'rect', 0.1), m = T.quadMetrics(r); ok(m.side > 0.08 && m.side < 0.1 && m.eps >= m.side, '長方形（邊差 10%）：side ' + m.side.toFixed(4)); ok(m.diag < 0.01, '長方形的對角線一樣長'); }
{ const r = T.decoyAt(200, 200, 120, 20, 'rhombus', 0.1), m = T.quadMetrics(r); ok(m.side < 0.01 && m.diag > 0.05, '菱形：四邊一樣長、對角線不一樣長 ' + m.diag.toFixed(4)); }
{ const m = T.quadMetrics([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 10 }, { x: 55, y: 90 }]); ok(m.eps > 0.3, '亂湊的四個點 eps 很大 ' + m.eps.toFixed(3)); }
{ const m = T.quadMetrics([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]); ok(m.eps === 1, '四點重合 eps = 1'); }
// orderQuad：一圈的順序，相鄰的距離都是邊長
{ const sq = T.squareAt(200, 250, 130, 33); for (let t = 0; t < 20; t++) { const idx = [0, 1, 2, 3].sort(() => rnd() - 0.5), o = T.orderQuad(sq, idx); for (let k = 0; k < 4; k++) ok(near(T.dist(sq[o[k]], sq[o[(k + 1) % 4]]), 130, 0.3), 'orderQuad 相鄰是邊'); } }
// describeQuad
{ const r = T.decoyAt(200, 200, 120, 20, 'rect', 0.07), d = T.describeQuad(r, [0, 1, 2, 3]); ok(d.kind === 'side' && /^最長的邊和最短的邊差 \d+\.\d{4}%/.test(d.text), '長方形的說明：' + d.text); }
{ const r = T.decoyAt(200, 200, 120, 20, 'rhombus', 0.12), d = T.describeQuad(r, [0, 1, 2, 3]); ok(d.kind === 'diag' && /兩條對角線差 \d+\.\d{4}%/.test(d.text), '菱形的說明：' + d.text); }
{ const d = T.describeQuad([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 10 }, { x: 55, y: 90 }], [0, 1, 2, 3]); ok(d.pct > 30 && /\d+\.\d{4}%/.test(d.text), '亂湊的說明：' + d.text); }
// squaresIn：窮舉
{ const pts = T.squareAt(200, 200, 120, 30).concat([{ x: 50, y: 50 }, { x: 400, y: 80 }, { x: 60, y: 420 }]); const s = T.squaresIn(pts, T.EPS_SQ); ok(s.length === 1 && s[0].idx.join() === '0,1,2,3', 'squaresIn 找到那一個：' + JSON.stringify(s)); ok(T.minEpsWith(pts, 4, [0, 1, 2, 3]) > 0.3, 'minEpsWith'); }

// ── 整關 ──
let total = 0, decoyTotal = 0, rotMin = 99, rotMax = 0, epsRange = [1, 0];
for (let i = 0; i < 400; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const N = T.pointsFor(lv), D = T.decoysFor(lv), dmax = T.decoyMaxFor(lv);
  ok(q.pts.length === N, '第 ' + lv + ' 關：星星 ' + q.pts.length + '（目標 ' + N + '）');
  ok(q.pts.every(p => T.inField(p)), '星星都在星空範圍內');
  let md = 1e9; for (let a = 0; a < q.pts.length; a++) for (let b = a + 1; b < q.pts.length; b++) md = Math.min(md, T.dist(q.pts[a], q.pts[b]));
  ok(md >= T.MIN_DIST - 1e-9, '星星之間至少 ' + T.MIN_DIST + '：' + md.toFixed(1));
  // 窮舉：剛好一個正方形，而且其他任何四個點都不到「幾乎是正方形」
  const near3 = T.squaresIn(q.pts, T.EPS_NONSQ);
  ok(near3.length === 1 && near3[0].idx.join() === q.sq.join(), '【窮舉】第 ' + lv + ' 關（' + N + ' 顆）：只有一組 eps < ' + T.EPS_NONSQ + '：' + near3.length + '，正方形 ' + q.sq);
  ok(T.squareErr(q.sq.map(k => q.pts[k])) < T.EPS_SQ, '真正方形的 eps 夠小');
  ok(q.decoys.length === D, '第 ' + lv + ' 關：誘餌 ' + q.decoys.length + '／' + D);
  q.decoys.forEach(dc => { const e = T.squareErr(dc.idx.map(k => q.pts[k])); ok(near(e, dc.eps, 1e-9) && e >= T.EPS_NONSQ && e <= dmax + 1e-9, '誘餌 eps ' + e.toFixed(4) + ' 在 ' + T.EPS_NONSQ + '～' + dmax.toFixed(3)); decoyTotal++; epsRange = [Math.min(epsRange[0], e), Math.max(epsRange[1], e)]; });
  ok(q.rot >= T.ROT[0] - 1e-9 && q.rot <= T.ROT[1] + 1e-9 && q.side >= T.SIDE[0] - 1e-9 && q.side <= T.SIDE[1] + 1e-9, '正方形的旋轉 ' + q.rot.toFixed(0) + '°、邊長 ' + q.side.toFixed(0));
  rotMin = Math.min(rotMin, q.rot); rotMax = Math.max(rotMax, q.rot);
  if (lv === 1) ok(q.decoys.length === 0 && N === 8, '第 1 關：8 顆星、沒有誘餌');
}
console.log('誘餌共 ' + decoyTotal + ' 組，eps 範圍 ' + epsRange.map(v => v.toFixed(3)) + '；正方形旋轉角 ' + rotMin.toFixed(0) + '～' + rotMax.toFixed(0) + '°');
ok(rotMin < 25 && rotMax > 65, '旋轉角涵蓋整個範圍');
ok(epsRange[0] >= T.EPS_NONSQ && epsRange[1] <= T.DECOY_MAX[0] + 1e-9, '誘餌 eps 都在規定範圍');
// 到頂的關卡誘餌要很像（eps 小）
{ let tot = 0, cnt = 0; for (let i = 0; i < 40; i++) { const q = T.makeLevel(T.RAMP_LEVELS, rnd); q.decoys.forEach(d => { tot += d.eps; cnt++; }); } ok(cnt >= 100 && tot / cnt <= T.DECOY_MAX[1], '到頂關卡的誘餌平均 eps ' + (tot / cnt).toFixed(3) + ' ≤ ' + T.DECOY_MAX[1]); }
// 真正方形的位置分散：不是永遠在前 4 顆
{ let first4 = 0; for (let i = 0; i < 200; i++) { const q = T.makeLevel(10, rnd); if (q.sq.join() === '0,1,2,3') first4++; } ok(first4 < 20, '真正方形的編號有洗牌：前 4 顆的 ' + first4 + '／200'); }
// 效能
for (const lv of [1, 12, 24, 40]) { const t0 = Date.now(); let worst = 0; for (let i = 0; i < 30; i++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 30; console.log('第' + lv + '關 出題平均 ' + per.toFixed(1) + ' 毫秒、最慢 ' + worst); ok(per < 150 && worst < 800, '第 ' + lv + ' 關出題夠快：' + per.toFixed(1) + '／' + worst); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_findsquare.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /describeQuad/.test(src) && /fsq-line--true/.test(src), '失敗停格 4 秒以上、說明哪裡不像、再畫真正方形');
  ok(/\.fsq-line--true \{[^}]*var\(--c-ok\)/.test(css) && /\.fsq-line--bad \{[^}]*var\(--c-bad-light\)/.test(css) && /\.fsq-sky \{[^}]*var\(--fsq-sky\)/.test(css), '綠色、紅色、夜空用 CSS 變數');
  ok(boot.indexOf("'js/reaction_findsquare.js'") > 0 && /斜/.test(G.rule), 'boot.js 有載入、玩法說明提到斜的'); }
ok(/^M/.test(T.starPath(10)) && T.starPath(10).split(' L').length === 10, '星星的 path 有 10 個頂點');
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
