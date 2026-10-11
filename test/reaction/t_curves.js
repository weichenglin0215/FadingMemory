const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_curves.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 25) console.log('FAIL', m); } };
// 出題用固定種子的亂數（test/reaction/load.js 的 rng）：每次跑的繩子都一樣，下面那些「80 條繩子裡有幾條往上爬」的統計才不會偶爾因為運氣不好而失敗。
// 想確認「換任何種子都過」：用環境變數 SEED 換種子連跑很多次（PowerShell：$env:SEED = 7; node test/reaction/t_curves.js；這支測試要跑約 30 秒）。
const SEED = seedOf(20261007); const rnd = rng(SEED);
ok(T.diffFor(1) === 30 && T.diffFor(2) === 27 && T.diffFor(10) === 3 && T.diffFor(11) === 3 && T.diffFor(50) === 3, 'diff schedule');
ok(T.kBase(1) === 3 && T.kBase(12) === 7 && T.kBase(40) === 7 && T.kBase(6) > T.kBase(1) && T.yjitFor(1) < T.yjitFor(12), 'turn count and y-jitter ramps');
const H = 600, W = 468; let N = 0, nullCount = 0;
const stats = {};
for (let lv = 1; lv <= 30; lv++) {
  let worst = 0, trap = 0, cnt = 0, upward = 0, tries = 0, maxT = 0, minSep = 1e9, closeMin = 1e9, maxDx = [];
  for (let k = 0; k < 40; k++) {
    const L = T.makeLevel(lv, H, rnd, W); N++; cnt++;
    if (!L) { nullCount++; continue; }
    tries += L.tries;
    const lenL = L.L.pts[L.L.pts.length - 1].s, lenR = L.R.pts[L.R.pts.length - 1].s, sL = L.L.len, sR = L.R.len;
    ok(Math.abs(lenL - sL) < 1e-9 && Math.abs(lenR - sR) < 1e-9, 'stored length equals arc length');
    const shortLen = Math.min(lenL, lenR), longLen = Math.max(lenL, lenR);
    ok((L.shortSide === 'L') === (lenL < lenR), 'short side correct');
    const ratio = longLen / shortLen - 1, want = T.diffFor(lv) / 100;
    worst = Math.max(worst, Math.abs(ratio - want));
    ok(Math.abs(ratio - want) < 1e-6, 'diff exact lv' + lv + ' got ' + ratio + ' want ' + want);
    // 各在自己的半邊，起點終點固定在上下中間
    ok(L.L.pts.every(p => p.x > T.SIDE_PAD - 1e-6 && p.x < W / 2 - T.SIDE_PAD + 1e-6) && L.R.pts.every(p => p.x > W / 2 + T.SIDE_PAD - 1e-6 && p.x < W - T.SIDE_PAD + 1e-6), 'each rope stays in its own half');
    [L.L, L.R].forEach(r => {
      const a = r.pts[0], b = r.pts[r.pts.length - 1];
      ok(Math.abs(a.x - r.cx) < 1e-9 && Math.abs(a.y - L.y0) < 1e-9 && Math.abs(b.x - r.cx) < 1e-9 && Math.abs(b.y - L.y1) < 1e-9, 'start top-middle, end bottom-middle');
      ok(r.pts.every((p, i) => i === 0 || p.s > r.pts[i - 1].s), 'arc length strictly increases');
      ok(T.validRope(r.pts, { x0: r.cx - (W / 4 - T.SIDE_PAD) - 1e-6, x1: r.cx + (W / 4 - T.SIDE_PAD) + 1e-6, y0: L.y0, y1: L.y1 }), 'no overlap / self-crossing');
      if (r.pts.some((p, i) => i && p.y < r.pts[i - 1].y - 1e-9)) upward++;
      maxDx.push(Math.max.apply(null, r.pts.map(p => p.x)) - Math.min.apply(null, r.pts.map(p => p.x)));
    });
    // 速度：短的那條在 TRAVEL_MAX_S 內到
    ok(L.speed >= 230 && shortLen / L.speed <= 5 + 1e-9, 'speed keeps travel time bounded');
    maxT = Math.max(maxT, shortLen / L.speed);
    const kS = L.shortSide === 'L' ? L.L.k : L.R.k, kL = L.shortSide === 'L' ? L.R.k : L.L.k; if (kS > kL) trap++;
  }
  stats[lv] = { worst, trap: trap / cnt, upward: upward / (2 * cnt), tries: tries / cnt, maxT, width: maxDx.reduce((a, b) => a + b, 0) / maxDx.length };
}
[1, 2, 5, 8, 12, 20, 30].forEach(l => console.log('lv' + l, 'diff', T.diffFor(l) + '%', 'k', T.kBase(l), 'max |err|', stats[l].worst.toExponential(1), 'short-has-more-turns', (stats[l].trap * 100).toFixed(0) + '%', 'ropes that climb up', (stats[l].upward * 100).toFixed(0) + '%', 'avg tries', stats[l].tries.toFixed(1), 'avg lateral span', stats[l].width.toFixed(0), 'px', 'max travel', stats[l].maxT.toFixed(1) + 's'));
ok(nullCount === 0, 'makeLevel never fails (' + nullCount + ')');
// 下面三個統計的平均值（用 40 組不同種子量過；每關 40 局、每局 2 條繩子＝ 80 條繩子）：
//   有往上爬的繩子比例：第 1 關約 32%（標準差約 5%）、第 12 關約 67%（約 5%）；
//   「短的那條繩子轉折點比較多」的比例：第 1 關幾乎是 0%、第 12 關約 26%（標準差約 7%）；
//   繩子左右伸展的平均寬度：第 1、5 關約 111 px、第 12、30 關約 120 px（標準差約 2 px）。
// 門檻訂在平均值下方 4 個以上標準差，換任何種子都不會因為運氣失敗；
// 以前 upward > 0.2、width > 105 只離平均 2.3～3 個標準差，大約每 25 次執行會有 1 次失敗。
ok(stats[1].upward > 0.1 && stats[12].upward > 0.4 && stats[12].upward > stats[1].upward, 'ropes climb back up even at level 1, and more often later (' + stats[1].upward.toFixed(2) + ' → ' + stats[12].upward.toFixed(2) + ', seed ' + SEED + ')');
ok(stats[12].trap > stats[1].trap, 'short-rope-has-more-turns trap grows (' + stats[1].trap.toFixed(3) + ' → ' + stats[12].trap.toFixed(3) + ', seed ' + SEED + ')');
ok([1, 5, 12, 30].every(l => stats[l].width > 100), 'ropes use most of the width (big swings): ' + [1, 5, 12, 30].map(l => stats[l].width.toFixed(0)).join('/') + ' (seed ' + SEED + ')');
// 轉折點的左右位置：相鄰差異大、不會對齊
{ let aligned = 0, total = 0, mags = new Set();
  for (let k = 0; k < 3000; k++) { const sh = T.makeShape(5, 0.8, rnd); for (let i = 1; i < sh.length; i++) { total++; if (Math.abs(sh[i].u - sh[i - 1].u) < T.MIN_SWING) aligned++; mags.add(Math.round(Math.abs(sh[i].u) * 10)); } }
  ok(aligned / total < 0.08, 'adjacent turning points differ a lot sideways (' + (aligned / total * 100).toFixed(1) + '% too close)'); ok(mags.size >= 6, 'turning point sizes vary'); }
// validRope：會交叉／貼太近的路徑要被擋下來
{ const mk = (pts) => { let s = 0; return pts.map((p, i) => { if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); return { x: p[0], y: p[1], s }; }); };
  const line = (a, b, n) => { const out = []; for (let i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); return out; };
  const cross = mk(line([50, 50], [150, 50], 34).concat(line([150, 50], [150, 250], 66).slice(1)).concat(line([150, 250], [100, 250], 17).slice(1)).concat(line([100, 250], [100, 20], 77).slice(1)));
  ok(!T.validRope(cross, { x0: 0, x1: 300, y0: 0, y1: 400 }), 'a self-crossing path is rejected');
  const near = mk(line([50, 50], [50, 250], 67).concat(line([50, 250], [60, 250], 3).slice(1)).concat(line([60, 250], [60, 50], 67).slice(1)));
  ok(!T.validRope(near, { x0: 0, x1: 300, y0: 0, y1: 400 }), 'two strands closer than CLEAR_PX are rejected');
  const fine = mk(line([50, 50], [50, 250], 67).concat(line([50, 250], [120, 250], 24).slice(1)).concat(line([120, 250], [120, 50], 67).slice(1)));
  ok(T.validRope(fine, { x0: 0, x1: 300, y0: 0, y1: 400 }), 'well separated strands are fine');
  ok(!T.validRope(fine, { x0: 60, x1: 300, y0: 0, y1: 400 }), 'leaving the box is rejected'); }
// 球的位置
{ const L = T.makeLevel(5, H, rnd, W); const pts = L.L.pts; const mid = pts[pts.length >> 1]; const q = T.pointAt(pts, mid.s); ok(Math.abs(q.x - mid.x) < 1e-6 && Math.abs(q.y - mid.y) < 1e-6, 'pointAt'); ok(T.pointAt(pts, -1) === pts[0] && T.pointAt(pts, 1e9) === pts[pts.length - 1], 'pointAt ends'); }
// 虛線的紅/白段長度，左右明顯不同
for (let k = 0; k < 200; k++) { const d = T.dashFor(rnd); ok(Math.abs((d.L[0] + d.L[1]) - (d.R[0] + d.R[1])) >= 8 || Math.abs(d.L[0] - d.R[0]) >= 10, 'dash differ'); }
// 揭曉的鏡頭：剩下那一段路很短才放大；框跟場地同寬高比、不超出場地、一定框得住那一段路
{
  const FW = 472, FH = 560;
  const straight = (x0, y0, x1, y1, n) => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n, s: 100 * i / n }));
  ok(T.zoomCamera(straight(100, 100, 360, 520, 20), FW, FH) === null, 'a long remaining stretch → no zoom');
  let zoomed = 0, still = 0;
  for (let k = 0; k < 600; k++) {
    const cx = 60 + rnd() * 350, cy = 60 + rnd() * 440, len = 2 + rnd() * 400, ang = rnd() * Math.PI * 2;
    const pts = straight(cx, cy, cx + len * Math.cos(ang), cy + len * Math.sin(ang), 8);
    if (pts.some(p => p.x < 0 || p.x > FW || p.y < 0 || p.y > FH)) continue;        // 真正的路線一定在場地裡面
    const c = T.zoomCamera(pts, FW, FH);
    if (!c) { still++; continue; }
    zoomed++;
    const b = c.box;
    ok(c.zoom >= T.ZOOM_MIN - 1e-9 && c.zoom <= T.ZOOM_MAX + 1e-9, 'zoom in range ' + c.zoom);
    ok(Math.abs(b.vw / b.vh - FW / FH) < 1e-9 && Math.abs(b.vw - FW / c.zoom) < 1e-9, 'camera box keeps the field aspect ratio');
    ok(b.vx >= -1e-9 && b.vy >= -1e-9 && b.vx + b.vw <= FW + 1e-9 && b.vy + b.vh <= FH + 1e-9, 'camera box stays inside the field');
    // 框得住整段路（放大到最大倍率 ZOOM_MAX 時，外框可能比框大的情況才不要求——但 ZOOM_MAX 的前提是外框加邊後還放得進去）
    pts.forEach(p => ok(p.x >= b.vx - 1e-6 && p.x <= b.vx + b.vw + 1e-6 && p.y >= b.vy - 1e-6 && p.y <= b.vy + b.vh + 1e-6, 'camera frames every point of the remaining stretch'));
  }
  ok(zoomed > 50 && still > 20, 'both cases happen: zoomed ' + zoomed + ', not zoomed ' + still);
  // 要不要放大：剩下的路很短才放大。差距大的前幾關（長度差 30%、27%、24%）大多不放大；差 3% 的關卡一定放大
  ok(T.needZoom(20) && T.needZoom(T.ZOOM_REST_MAX) && !T.needZoom(T.ZOOM_REST_MAX + 1) && !T.needZoom(250), 'zoom only when the remaining stretch is short');
  for (const lv of [1, 2, 3, 4, 5, 6, 8, 10, 14, 25]) {
    let zoomN = 0, runs = 40;
    for (let k = 0; k < runs; k++) {
      const L = T.makeLevel(lv, 560, rnd, 472), shortLen = Math.min(L.L.len, L.R.len), rest = Math.max(L.L.len, L.R.len) - shortLen;
      if (T.needZoom(rest)) zoomN++;
    }
    // 標準是「剩下的路很短（≤ ZOOM_REST_MAX px）」才放大：差距大的前幾關幾乎不放大（路線偏短、剩下的路剛好很短的時候才會）
    if (lv <= 3) ok(zoomN <= runs * 0.35, 'level ' + lv + ' (big length difference): the camera rarely zooms (' + zoomN + '/' + runs + ')');
    if (lv >= 10) ok(zoomN === runs, 'level ' + lv + ' (3% difference): the camera always zooms (' + zoomN + '/' + runs + ')');
  }
  // restPoints：第一個點是球停住的位置（弧長 s0），後面是 s > s0 的所有點，最後一個是終點
  const pp = straight(0, 0, 100, 0, 10), rp = T.restPoints(pp, 35);
  ok(Math.abs(rp[0].x - 35) < 1e-9 && rp[0].s === 35 && rp.length === 1 + pp.filter(p => p.s > 35).length && rp[rp.length - 1] === pp[pp.length - 1], 'restPoints starts at the frozen ball and ends at the end point');
}
console.log('levels generated', N, bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
