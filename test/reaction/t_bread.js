const { game } = require('./load.js');
const G = game('reaction_bread.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
// 門檻
ok(T.thrFor(1) === 10 && T.thrFor(2) === 9 && T.thrFor(10) === 1 && T.thrFor(11) === 1 && T.thrFor(30) === 1, 'thr');
// 面積
ok(Math.abs(T.polyArea([[0, 0], [360, 0], [360, 140], [0, 140]]) - 50400) < 1e-9, 'rect area');
for (let lv = 1; lv <= 25; lv++) for (let k = 0; k < 300; k++) {
  const B = T.makeBread(lv); const total = T.polyArea(B.pts);
  ok((lv <= 3 && B.type === 'rect') || (lv > 3 && lv <= 7 && B.type === 'trap') || (lv > 7 && B.type === 'tri'), 'type lv' + lv);
  ok(B.pts.every(p => p[0] >= -1e-9 && p[0] <= T.W + 1e-9 && p[1] >= -1e-9 && p[1] <= T.HB + 1e-9), 'inside bbox');
  // 對半切點：左右面積相等
  const bx = T.balanceX(B.pts); const aL = T.areaLeft(B.pts, bx);
  ok(Math.abs(aL - total / 2) < 1e-6 * total, 'balance');
  // 左右面積相加＝總面積（任意切點）
  const c = Math.random() * T.W; const L = T.clipV(B.pts, c, true), Rr = T.clipV(B.pts, c, false);
  const a = (L.length >= 3 ? T.polyArea(L) : 0) + (Rr.length >= 3 ? T.polyArea(Rr) : 0);
  ok(Math.abs(a - total) < 1e-6 * total, 'areas sum');
  // 三角形的頂點不在正中央（不等邊）；梯形比例
  if (B.type === 'tri') { const ax = B.pts[0][0] / T.W; ok(Math.abs(ax - 0.5) >= 0.15 - 1e-9 && Math.abs(ax - 0.5) <= 0.35 + 1e-9, 'apex pos'); }
  if (B.type === 'trap') { const hs = Math.min(B.pts[0][1] === 0 ? T.HB : T.HB - B.pts[0][1], B.pts[1][1] === 0 ? T.HB : T.HB - B.pts[1][1]); ok(hs / T.HB >= 0.45 - 1e-9 && hs / T.HB <= 0.8 + 1e-9, 'trap ratio'); }
}
// 不同形狀「正中央切」的差距
{
  for (const lv of [1, 5, 9]) {
    const B = T.makeBread(lv); const bx = T.balanceX(B.pts);
    const w = T.weighCut(B.pts, T.W / 2, 400), w2 = T.weighCut(B.pts, bx, 400);
    console.log('lv' + lv, B.type, 'centre cut diff', w.diff.toFixed(2) + '%', ' balance x %', (bx / T.W * 100).toFixed(2), ' balance cut diff', w2.diff.toFixed(2) + '%', w2.wL, w2.wR);
  }
}
// 1% 標準對應的切點誤差（長方形、各形狀）
{
  const R = { pts: [[0, 0], [360, 0], [360, 140], [0, 140]] };
  let lo = 180, hi = 360; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (T.weighCut(R.pts, m, 400).diff < 1) lo = m; else hi = m; }
  console.log('rect: 1% diff at knife offset', (lo - 180).toFixed(3), 'px of 360 =', ((lo - 180) / 360 * 100).toFixed(3) + '% width');
}
// weighCut 的差距用顯示值（0.1 g）
{ const w = T.weighCut([[0, 0], [360, 0], [360, 140], [0, 140]], 180, 333.3); ok(w.wL === 166.7 || w.wL === 166.6, 'round to 0.1: ' + w.wL + ',' + w.wR); }
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
