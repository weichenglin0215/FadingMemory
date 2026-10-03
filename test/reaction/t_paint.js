const { game } = require('./load.js');
const G = game('reaction_paint.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const N = T.SQ;
// 1. 單一圓面積
{ const m = T.makeMask(N); const a = T.stampDisc(m, 180, 180, 50); const exp = Math.PI * 49.5 * 49.5; ok(Math.abs(a - exp) / exp < 0.02, 'disc area ' + a + ' vs ' + exp); ok(m.left === N * N - a, 'left count'); }
// 2. 橫掃 N 條，間距 gap；起終點在方塊外面 r 以上
function sweeps(D, gap, startY) {
  const m = T.makeMask(N); const r = D / 2; let y = startY, k = 0, len = 0;
  while (y - r < N) { const x0 = -r - 2, x1 = N + r + 2; const yy = k % 2 ? x1 : x0; if (k % 2) T.stampSegment(m, x1, y, x0, y, r); else T.stampSegment(m, x0, y, x1, y, r); len += x1 - x0; y += gap; k++; }
  return { left: m.left, sweeps: k, len };
}
let r1 = sweeps(162, 160, 81 - 20);       // 起點再往上外移，覆蓋上緣
console.log('D=162 gap=160 startY=61 → left', r1.left, 'sweeps', r1.sweeps);
let r2 = sweeps(162, 150, 0);              // y=0 起，第一條蓋到 y∈[-81,81]
console.log('D=162 gap=150 startY=0 → left', r2.left, 'sweeps', r2.sweeps);
ok(r2.left === 0, 'overlapping sweeps cover all');
let r3 = sweeps(162, 163, 0);              // 間距比直徑大 1px → 必有縫
console.log('D=162 gap=163 (1px gap) → left', r3.left); ok(r3.left > 0, '1px gap detected');
let r4 = sweeps(162, 161.9, 0);             // 間距比直徑小 0.1px，在保守判定下算有縫（被 EDGE_SLACK 判成沒蓋到）
console.log('D=162 gap=161.9 (0.1px overlap) → left', r4.left);
let r5 = sweeps(162, 160, 0);
console.log('D=162 gap=160 (2px overlap) → left', r5.left); ok(r5.left === 0, '2px overlap covered');
// 3. 一個像素的洞被 holes 找出來
{ const m = T.makeMask(N); m.data.fill(1); m.left = 0; const idx = 100 * N + 200; m.data[idx] = 0; m.left = 1; const hs = T.holes(m, 10); ok(hs.length === 1 && hs[0].size === 1 && Math.abs(hs[0].x - 200.5) < 1e-9 && Math.abs(hs[0].y - 100.5) < 1e-9, 'hole found'); 
  // 兩個洞，大的在前
  m.data[idx + 1] = 0; m.data[300 * N + 10] = 0; m.left = 3; const h2 = T.holes(m, 10); ok(h2.length === 2 && h2[0].size === 2, 'two holes sorted'); }
// 4. 角落：最角落的格子要真的被蓋到
{ const m = T.makeMask(N); const r = 81; T.stampSegment(m, -r, 0, N + r, 0, r); T.stampSegment(m, N + r, 162, -r, 162, r);
  // 只掃兩條 y=0, y=162（D=162 → 蓋到 y∈[-81,243]），上緣/左右角都應該被蓋
  ok(m.data[0] === 1 && m.data[N - 1] === 1 && m.data[N + 0] === 1, 'top corners painted'); }
// 5. 效能：掃 3 條 D=162
{ const t0 = process.hrtime.bigint(); sweeps(162, 150, 0); const ms = Number(process.hrtime.bigint() - t0) / 1e6; console.log('3 sweeps D=162 time', ms.toFixed(1), 'ms'); ok(ms < 400, 'perf'); }
// 6. 筆刷縮小
ok(Math.abs(T.brushAfter(180) - 162) < 1e-9 && T.brushAfter(8) === 8 && T.brushAfter(8.5) === 8, 'brush shrink');
// 最佳策略估計：需要幾次沾？（理論）
let D = T.BRUSH_START, dips = 0, area = 0; 
for (dips = 1; dips <= 30; dips++) { D = T.brushAfter(D); area += D * N * T.BUDGET_MULT; if (area >= N * N) break; }
console.log('theoretical minimum dips (perfect no-overlap) =', dips, ' D at that dip', D.toFixed(0));
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
