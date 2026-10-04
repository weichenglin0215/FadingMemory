const { game } = require('./load.js');
const G = game('reaction_curves.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 25) console.log('FAIL', m); } };
ok(T.diffFor(1) === 30 && T.diffFor(2) === 27 && T.diffFor(10) === 3 && T.diffFor(11) === 3 && T.diffFor(50) === 3, 'diff schedule');
ok(T.kBase(1) === 3 && T.kBase(12) === 7 && T.kBase(40) === 7 && T.kBase(6) > T.kBase(1) && T.yjitFor(1) < T.yjitFor(12), 'turn count and y-jitter ramps');
const H = 600, W = 468; let N = 0, nullCount = 0;
const stats = {};
for (let lv = 1; lv <= 30; lv++) {
  let worst = 0, trap = 0, cnt = 0, upward = 0, tries = 0, maxT = 0, minSep = 1e9, closeMin = 1e9, maxDx = [];
  for (let k = 0; k < 40; k++) {
    const L = T.makeLevel(lv, H, null, W); N++; cnt++;
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
ok(stats[1].upward > 0.2 && stats[12].upward > 0.5, 'ropes climb back up even at level 1, and more often later (' + stats[1].upward.toFixed(2) + ' → ' + stats[12].upward.toFixed(2) + ')');
ok(stats[12].trap > stats[1].trap, 'short-rope-has-more-turns trap grows');
ok([1, 5, 12, 30].every(l => stats[l].width > 105), 'ropes use most of the width (big swings): ' + [1, 5, 12, 30].map(l => stats[l].width.toFixed(0)).join('/'));
// 轉折點的左右位置：相鄰差異大、不會對齊
{ let aligned = 0, total = 0, mags = new Set();
  for (let k = 0; k < 3000; k++) { const sh = T.makeShape(5, 0.8); for (let i = 1; i < sh.length; i++) { total++; if (Math.abs(sh[i].u - sh[i - 1].u) < T.MIN_SWING) aligned++; mags.add(Math.round(Math.abs(sh[i].u) * 10)); } }
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
{ const L = T.makeLevel(5, H, null, W); const pts = L.L.pts; const mid = pts[pts.length >> 1]; const q = T.pointAt(pts, mid.s); ok(Math.abs(q.x - mid.x) < 1e-6 && Math.abs(q.y - mid.y) < 1e-6, 'pointAt'); ok(T.pointAt(pts, -1) === pts[0] && T.pointAt(pts, 1e9) === pts[pts.length - 1], 'pointAt ends'); }
// 虛線的紅/白段長度，左右明顯不同
for (let k = 0; k < 200; k++) { const d = T.dashFor(); ok(Math.abs((d.L[0] + d.L[1]) - (d.R[0] + d.R[1])) >= 8 || Math.abs(d.L[0] - d.R[0]) >= 10, 'dash differ'); }
console.log('levels generated', N, bad ? 'FAILED ' + bad : 'ALL PASS');
