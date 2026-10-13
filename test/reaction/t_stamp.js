const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_stamp.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
const rad = d => d * Math.PI / 180;
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
// V1.25 玩家意見：紅框至少是原本（220×140）的 133% 面積；角標腳縮短；紙張歪斜加大；印章是橢圓
ok(T.FW * T.FH >= 220 * 140 * 1.33, '紅框面積至少原本的 133%：' + (T.FW * T.FH / (220 * 140)).toFixed(2) + ' 倍');
ok(T.MARK_LEG < 24, '角標每隻腳比原本短：' + T.MARK_LEG);
ok(T.PAPER_TILT > 8 && T.PAPER_TILT_MIN >= 4, '紙張歪斜比原本（±8°）大：±' + T.PAPER_TILT);
// corners：未旋轉時四個角在 ±w/2、±h/2（紅框角標的位置仍用它）
const c0 = T.corners(100, 200, 0, 220, 140);
ok(c0[0].x === -10 && c0[0].y === 130 && c0[2].x === 210 && c0[2].y === 270, 'corners 未旋轉');
const c90 = T.corners(0, 0, 90, 220, 140); ok(Math.abs(c90[0].x - 70) < 1e-9 && Math.abs(c90[0].y + 110) < 1e-9, 'corners 旋轉 90°');
// edgeErr：橢圓內切在紅框 → 四條邊縫隙都是 0
const f = { x: 236, y: 240, rot: 20 };
{ const r = T.edgeErr({ x: 236, y: 240, rot: 20 }, f); ok(r.mean < 1e-9 && r.gaps.every(g => Math.abs(g) < 1e-9), '內切（重合）→ 縫隙 0'); }
// 沿紅框 x 軸平移 d：右邊超出 d（縫隙 −d）、左邊離開 d（縫隙 +d）、上下不變
{ const d = 10, ca = Math.cos(rad(20)), sa = Math.sin(rad(20)); const r = T.edgeErr({ x: 236 + d * ca, y: 240 + d * sa, rot: 20 }, f);
  ok(near(r.gaps[1], -d, 1e-9) && near(r.gaps[3], d, 1e-9) && near(r.gaps[0], 0, 1e-9) && near(r.gaps[2], 0, 1e-9), '往右平移 10px：' + r.gaps.map(g => g.toFixed(3)).join());
  ok(near(r.mean, d / 2, 1e-9), '平均 = 10 × 2 ÷ 4 = 5：' + r.mean); }
// 沿紅框 y 軸平移 d
{ const d = 7, ca = Math.cos(rad(20)), sa = Math.sin(rad(20)); const r = T.edgeErr({ x: 236 - d * sa, y: 240 + d * ca, rot: 20 }, f);
  ok(near(r.gaps[2], -d, 1e-9) && near(r.gaps[0], d, 1e-9) && near(r.gaps[1], 0, 1e-9) && near(r.gaps[3], 0, 1e-9), '往下平移 7px：' + r.gaps.map(g => g.toFixed(3)).join()); }
// 轉 δ：水平半幅 √(a²cos²δ＋b²sin²δ)、垂直半幅 √(a²sin²δ＋b²cos²δ)（用公式獨立算一次）
for (const dd of [1, 5, 15, 40, 90]) {
  const A = T.FW / 2, B = T.FH / 2, hx = Math.sqrt(A * A * Math.cos(rad(dd)) ** 2 + B * B * Math.sin(rad(dd)) ** 2), hy = Math.sqrt(A * A * Math.sin(rad(dd)) ** 2 + B * B * Math.cos(rad(dd)) ** 2);
  const r = T.edgeErr({ x: 236, y: 240, rot: 20 + dd }, f);
  ok(near(r.gaps[1], A - hx, 1e-9) && near(r.gaps[3], A - hx, 1e-9) && near(r.gaps[0], B - hy, 1e-9) && near(r.gaps[2], B - hy, 1e-9), '轉 ' + dd + '°：縫隙 ' + r.gaps.map(g => g.toFixed(3)).join());
  ok(dd === 90 || r.gaps.every(g => g !== 0), '轉了就不再貼齊');
}
// 用暴力法核對：在橢圓邊界上取很多點，找四個方向（紅框座標）的最外緣 → 縫隙
for (let i = 0; i < 200; i++) {
  const st = { x: 236 + (rnd() - 0.5) * 60, y: 240 + (rnd() - 0.5) * 60, rot: 20 + (rnd() - 0.5) * 80 };
  const r = T.edgeErr(st, f), A = T.FW / 2, B = T.FH / 2, cf = Math.cos(rad(f.rot)), sf = Math.sin(rad(f.rot)), cs = Math.cos(rad(st.rot)), ss = Math.sin(rad(st.rot));
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let t = 0; t < 20000; t++) {
    const th = t / 20000 * 2 * Math.PI, lx = A * Math.cos(th), ly = B * Math.sin(th);
    const wx = st.x + lx * cs - ly * ss, wy = st.y + lx * ss + ly * cs;                  // 世界座標
    const fx = (wx - f.x) * cf + (wy - f.y) * sf, fy = -(wx - f.x) * sf + (wy - f.y) * cf;   // 紅框座標
    minX = Math.min(minX, fx); maxX = Math.max(maxX, fx); minY = Math.min(minY, fy); maxY = Math.max(maxY, fy);
  }
  ok(near(r.gaps[0], minY + B, 0.05) && near(r.gaps[1], A - maxX, 0.05) && near(r.gaps[2], B - maxY, 0.05) && near(r.gaps[3], minX + A, 0.05), '暴力核對 #' + i + '：' + r.gaps.map(g => g.toFixed(2)).join() + ' vs ' + [minY + B, A - maxX, B - maxY, minX + A].map(g => g.toFixed(2)).join());
  // 支撐點在橢圓上（滿足橢圓方程式）
  r.a.forEach((p, k) => { const dx = p.x - st.x, dy = p.y - st.y, lx = dx * cs + dy * ss, ly = -dx * ss + dy * cs; ok(near((lx / A) ** 2 + (ly / B) ** 2, 1, 1e-9), '支撐點在橢圓上'); });
}
// worst 是縫隙最大的邊；toMm
{ const r = T.edgeErr({ x: 260, y: 245, rot: 35 }, f); ok(r.ds.every(d => d <= r.ds[r.worst] + 1e-9), 'worst'); ok(T.EDGE_NAMES.join('') === '上右下左', '邊的名稱'); }
ok(T.toMm(4) === 1, '4px = 1 公釐');
// 出題：紙張歪斜在範圍、不太接近 0；紅框整個（含角標）在紙張內；框的旋轉＝紙張
for (let i = 0; i < 4000; i++) {
  const c = T.makeRound(rnd);
  ok(Math.abs(c.phi) >= T.PAPER_TILT_MIN - 1e-9 && Math.abs(c.phi) <= T.PAPER_TILT + 1e-9, '紙張歪斜範圍');
  ok(c.frame.rot === c.phi, '紅框與紙同角度');
  const cs = T.corners(c.frame.x, c.frame.y, c.frame.rot, T.FW + 2 * 18, T.FH + 2 * 18);   // 連角標（間距 6＋腳長 12）一起算
  const pc = T.corners(T.PAPER.x, T.PAPER.y, c.phi, T.PAPER.w, T.PAPER.h);                   // 紙張四個角
  // 紅框（含角標）的四個角都在紙張（旋轉後）裡面：換成紙張座標檢查
  const cp = Math.cos(rad(-c.phi)), sp = Math.sin(rad(-c.phi));
  ok(cs.every(p => { const dx = p.x - T.PAPER.x, dy = p.y - T.PAPER.y, lx = dx * cp - dy * sp, ly = dx * sp + dy * cp; return Math.abs(lx) <= T.PAPER.w / 2 && Math.abs(ly) <= T.PAPER.h / 2; }), '紅框（含角標）在紙張範圍內');
  ok(Math.hypot(c.frame.x - T.PAPER.x, c.frame.y - T.PAPER.y) <= Math.hypot(T.FRAME_OFF.x, T.FRAME_OFF.y) + 1e-9, '位移範圍');
  ok(cs.every(p => p.x > 2 && p.x < 470 && p.y > 2 && p.y < 480), '紅框（含角標）整個在舞台可見範圍內');
}
// 起始位置：不歪的印章與紅框差很多（不會一開始就蓋對）
{ let min = 1e9; for (let i = 0; i < 1000; i++) { const c = T.makeRound(rnd); min = Math.min(min, T.edgeErr({ x: 236, y: 500, rot: 0 }, c.frame).mean); } ok(min > 40, '起始位置離答案很遠：' + min); }
// insideStamp（橢圓）／handleOf
ok(T.insideStamp({ x: 236, y: 500 }, { x: 236, y: 500, rot: 0 }) && !T.insideStamp({ x: 236 + T.FW / 2 * 1.1 + 2, y: 500 }, { x: 236, y: 500, rot: 0 }), 'insideStamp 未旋轉：中心在內、超出橢圓外緣在外');
ok(!T.insideStamp({ x: 236 + T.FW / 2 - 5, y: 500 + T.FH / 2 - 5 }, { x: 236, y: 500, rot: 0 }), '橢圓：矩形的角落不在印章內');
ok(T.insideStamp({ x: 236 + T.FW / 2 - 10, y: 500 }, { x: 236, y: 500, rot: 0 }) && !T.insideStamp({ x: 236 + T.FW / 2 - 10, y: 500 }, { x: 236, y: 500, rot: 90 }), 'insideStamp 旋轉 90° 後寬變窄');
{ const h0 = T.handleOf({ x: 100, y: 300, rot: 0 }); ok(Math.abs(h0.x - 100) < 1e-9 && h0.y < 300 - T.FH / 2, '手柄在印章上方'); const h90 = T.handleOf({ x: 100, y: 300, rot: 90 }); ok(Math.abs(h90.x - (100 + T.FH / 2 + 40)) < 1e-9 && Math.abs(h90.y - 300) < 1e-9, '轉 90° 後手柄在右邊'); }
ok(T.zoomFor(100) === 1 && T.zoomFor(30) >= 2 && T.zoomFor(1) > T.zoomFor(10) && T.zoomFor(0) === 25, 'ZOOM 倍率');
ok(T.rating(0.1) !== T.rating(0.6) && T.rating(0.6) !== T.rating(1.5) && T.rating(1.5) !== T.rating(4) && T.rating(4) !== T.rating(9), '評語分級');
ok(T.toMm(T.edgeErr({ x: 40, y: 600, rot: 60 }, { x: 436, y: 30, rot: -30 }).mean) <= G.score.max, '最壞誤差在排行榜範圍內');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
