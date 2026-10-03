const { game } = require('./load.js');
const G = game('reaction_curves.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
ok(T.diffFor(1) === 30 && T.diffFor(2) === 27 && T.diffFor(10) === 3 && T.diffFor(11) === 3 && T.diffFor(50) === 3, 'diff schedule');
const H = 600; let maxA = 0, fails = 0, N = 0;
for (let lv = 1; lv <= 25; lv++) {
  let worst = 0, sumRatio = 0, trapCount = 0, cnt = 0;
  for (let k = 0; k < 150; k++) {
    const L = T.makeLevel(lv, H); N++; cnt++;
    const lenL = T.curveLen(L.L.cx, L.y0, L.y1, L.L.A, L.L.w, L.L.phi), lenR = T.curveLen(L.R.cx, L.y0, L.y1, L.R.A, L.R.w, L.R.phi);
    const shortLen = Math.min(lenL, lenR), longLen = Math.max(lenL, lenR);
    ok((L.shortSide === 'L') === (lenL < lenR), 'short side correct');
    const ratio = longLen / shortLen - 1; const want = T.diffFor(lv) / 100;
    worst = Math.max(worst, Math.abs(ratio - want)); sumRatio += ratio;
    ok(Math.abs(ratio - want) < 1e-6, 'diff exact lv' + lv + ' got ' + ratio + ' want ' + want);
    ok(L.L.A >= T.A_MIN - 1e-9 && L.L.A <= T.A_MAX + 1e-9 && L.R.A >= T.A_MIN - 1e-9 && L.R.A <= T.A_MAX + 1e-9, 'amp range');
    // 曲線不跨過中線 234
    const pl = T.sampleCurve(L.L.cx, L.y0, L.y1, L.L.A, L.L.w, L.L.phi), pr = T.sampleCurve(L.R.cx, L.y0, L.y1, L.R.A, L.R.w, L.R.phi);
    ok(pl.every(p => p.x < 234 - 5 || (p.x < 234)) && pr.every(p => p.x > 234), 'no crossing center ' + lv);
    if (L.shortSide === 'L' ? L.L.w > L.R.w : L.R.w > L.L.w) trapCount++;
  }
  if (lv <= 3 || lv % 6 === 0) console.log('lv' + lv, 'diff', T.diffFor(lv) + '%', 'waves', T.wavesFor(lv).toFixed(2), 'max |err|', worst.toExponential(1), 'short-has-more-waves', trapCount + '/' + cnt);
}
// 球的位置：同弧長同速度，短的先到
{ const L = T.makeLevel(5, H); const pts = T.sampleCurve(L.L.cx, L.y0, L.y1, L.L.A, L.L.w, L.L.phi); const mid = pts[pts.length >> 1]; const q = T.pointAt(pts, mid.s); ok(Math.abs(q.x - mid.x) < 1e-6 && Math.abs(q.y - mid.y) < 1e-6, 'pointAt'); ok(T.pointAt(pts, -1) === pts[0] && T.pointAt(pts, 1e9) === pts[pts.length - 1], 'pointAt ends'); }
// 虛線的紅/白段長度，左右明顯不同
for (let k = 0; k < 200; k++) { const d = T.dashFor(); ok(Math.abs((d.L[0] + d.L[1]) - (d.R[0] + d.R[1])) >= 8 || Math.abs(d.L[0] - d.R[0]) >= 10, 'dash differ'); }
console.log('levels generated', N, bad ? 'FAILED ' + bad : 'ALL PASS');
