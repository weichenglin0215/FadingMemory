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
// 3b. 代表點 px,py：環狀的未完成區域，質心（圓環中心）本身是塗到的，但 px,py 一定要落在「還沒塗到」的格子上（提示按鈕靠它標記）
{ const m = T.makeMask(N); m.data.fill(1); m.left = 0; let ring = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dd = Math.hypot(x + 0.5 - 200, y + 0.5 - 200); if (dd >= 40 && dd <= 50) { m.data[y * N + x] = 0; ring++; } }
  m.left = ring;
  m.data[10 * N + 10] = 0; m.left++;                       // 另一個只有 1 格的小洞
  const hs = T.holes(m, 5), big = hs[0];
  ok(hs.length === 2 && big.size === ring && hs[1].size === 1, 'ring is the biggest region, the 1-pixel hole is second');
  ok(Math.abs(big.x - 200) < 1 && Math.abs(big.y - 200) < 1 && m.data[Math.floor(big.y) * N + Math.floor(big.x)] === 1, 'ring centroid is the (painted) centre');
  ok(m.data[Math.floor(big.py) * N + Math.floor(big.px)] === 0, 'representative point px,py lies inside the unfinished ring');
  ok(Math.hypot(big.px - 200, big.py - 200) >= 39 && Math.hypot(big.px - 200, big.py - 200) <= 51, 'representative point is on the ring');
  const sm = hs[1]; ok(sm.px === 10.5 && sm.py === 10.5, 'single pixel region: representative point is that pixel'); }
// 4. 角落：最角落的格子要真的被蓋到
{ const m = T.makeMask(N); const r = 81; T.stampSegment(m, -r, 0, N + r, 0, r); T.stampSegment(m, N + r, 162, -r, 162, r);
  // 只掃兩條 y=0, y=162（D=162 → 蓋到 y∈[-81,243]），上緣/左右角都應該被蓋
  ok(m.data[0] === 1 && m.data[N - 1] === 1 && m.data[N + 0] === 1, 'top corners painted'); }
// 5. 效能：掃 3 條 D=162
{ const t0 = process.hrtime.bigint(); sweeps(162, 150, 0); const ms = Number(process.hrtime.bigint() - t0) / 1e6; console.log('3 sweeps D=162 time', ms.toFixed(1), 'ms'); ok(ms < 400, 'perf'); }
// 6. 筆刷縮小
ok(T.brushAfter(100) < 100 && T.brushAfter(100) > 0 && T.brushAfter(T.BRUSH_MIN) === T.BRUSH_MIN && T.brushAfter(T.BRUSH_MIN + 0.001) === T.BRUSH_MIN, 'brush shrinks every dip and stops at the minimum');
// ───────── V1.24：改成「蓋掉塗鴉」（底色上有 10 處以上、互相分開、粗細不一的鮮豔塗鴉） ─────────
const { rng, seedOf } = require('./load.js');
const SEED = seedOf(20261012), rnd = rng(SEED);
const cell = T.SQ / T.GRID;
ok(T.SCRIBBLE_MIN === 10 && T.SCRIBBLE_MAX >= 10 && T.GRID === 4 && T.PEN_SIZES.length === 7 && Math.min(...T.PEN_SIZES) === 6 && Math.max(...T.PEN_SIZES) === 30, '塗鴉的參數：至少 10 處、4×4 小區、筆頭 6～30px');
ok(T.SHRINK === 0.88 && T.BUDGET_MULT === 1 && T.BRUSH_START === 80 && T.BRUSH_MIN === 3, '玩家調過的筆刷參數沒有被改掉（縮小 0.88、油漆量 1 倍、起始 80、最小 3）');
const compStats = [], lenStats = [], kindsSeen = {}, sizesSeenAll = new Set();
for (let g = 0; g < 120; g++) {
  const scr = T.makeScribbles(rnd);
  ok(scr.length >= T.SCRIBBLE_MIN && scr.length <= T.SCRIBBLE_MAX, '塗鴉處數 ' + scr.length);
  const cells = new Set(), widths = new Set();
  let polyLen = 0;
  scr.forEach((sc, k) => {
    kindsSeen[sc.kind] = (kindsSeen[sc.kind] || 0) + 1; widths.add(sc.w); sizesSeenAll.add(sc.w);
    ok(T.KINDS.indexOf(sc.kind) >= 0 && T.PEN_SIZES.indexOf(sc.w) >= 0 && T.INK_COLORS.indexOf(sc.color) >= 0 && sc.lines.length >= 1, '形狀、粗細、顏色都來自清單');
    if (k > 0) ok(sc.kind !== scr[k - 1].kind, '連續兩處不是同一種形狀');
    // 每一處塗鴉整個縮在自己的小區裡，離小區邊緣至少 筆頭半徑 ＋ SCRIBBLE_GAP（所以兩處塗鴉之間至少隔 2×SCRIBBLE_GAP）
    const p0 = sc.lines[0][0], ci = Math.floor(p0[0] / cell) + T.GRID * Math.floor(p0[1] / cell);
    ok(!cells.has(ci), '每一處塗鴉在不同的小區'); cells.add(ci);
    const x0 = (ci % T.GRID) * cell, y0 = Math.floor(ci / T.GRID) * cell, pad = sc.w / 2 + T.SCRIBBLE_GAP - 1e-6;
    sc.lines.forEach(ln => {
      ok(ln.length >= 2, 'a line has at least 2 points');
      for (let i = 0; i < ln.length; i++) {
        const p = ln[i];
        ok(p[0] >= x0 + pad && p[0] <= x0 + cell - pad && p[1] >= y0 + pad && p[1] <= y0 + cell - pad, '塗鴉的點縮在自己的小區裡（' + sc.kind + ' w=' + sc.w + '）：' + p.map(v => v.toFixed(1)));
        if (i) { const d = Math.hypot(p[0] - ln[i - 1][0], p[1] - ln[i - 1][1]); polyLen += d; ok(d <= 3.0001 || sc.kind === 'dot', '點跟點之間 ≤ 3px：' + d.toFixed(2) + ' ' + sc.kind); }
      }
    });
  });
  ok(widths.size >= 5, '每一局的筆頭粗細要有很多種（' + widths.size + ' 種）');
  lenStats.push(polyLen);
  // 遮罩：塗鴉格子＝0、其他＝1，left＝total＝塗鴉格數；連通區域至少 10 塊
  const m = T.scribbleMask(scr, T.SQ);
  ok(m.left === m.total && m.total > 2000 && m.total < T.SQ * T.SQ * 0.35, '遮罩的塗鴉格數合理：' + m.total + '（占方塊 ' + (m.total / T.SQ / T.SQ * 100).toFixed(1) + '%）');
  let zeros = 0; for (let i = 0; i < m.data.length; i++) { ok(m.data[i] === 0 || m.data[i] === 1, 'mask values'); if (m.data[i] === 0) zeros++; }
  ok(zeros === m.total, 'left equals the number of 0 cells');
  const comps = T.holes(m, 200);
  ok(comps.length >= T.SCRIBBLE_MIN, '至少 10 處不連續的塗鴉（連通區域 ' + comps.length + ' 塊）');
  ok(comps.reduce((a, c) => a + c.size, 0) === m.total, 'components add up to the total');
  compStats.push(comps.length);
  // 用「半徑夠大」的圓沿著每一條塗鴉線蓋過去 → 全部蓋掉（left === 0）；半徑太小（比塗鴉細）就一定蓋不完
  const full = T.scribbleMask(scr, T.SQ), thin = T.scribbleMask(scr, T.SQ);
  scr.forEach(sc => sc.lines.forEach(ln => { for (let i = 1; i < ln.length; i++) { T.stampSegment(full, ln[i - 1][0], ln[i - 1][1], ln[i][0], ln[i][1], sc.w / 2 + 3); T.stampSegment(thin, ln[i - 1][0], ln[i - 1][1], ln[i][0], ln[i][1], Math.max(1.2, sc.w / 2 - 2)); } }));
  ok(full.left === 0, '半徑夠大的筆刷沿著塗鴉走一遍，塗鴉全部蓋掉（left=' + full.left + '）');
  ok(thin.left > 0, '太細的筆刷蓋不完');
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log('塗鴉連通區域：平均 ' + mean(compStats).toFixed(1) + ' 塊（最少 ' + Math.min(...compStats) + '）；塗鴉線總長平均 ' + mean(lenStats).toFixed(0) + ' px（最長 ' + Math.max(...lenStats).toFixed(0) + '）；形狀分布 ' + JSON.stringify(kindsSeen));
ok(Object.keys(kindsSeen).length === T.KINDS.length, '九種形狀都會出現：' + Object.keys(kindsSeen).length);
ok(sizesSeenAll.size === 7, '七種筆頭粗細都會出現');
ok(Math.max(...lenStats) < 4200, '塗鴉線的總長不會長到玩家畫不完（最長 ' + Math.max(...lenStats).toFixed(0) + ' px，每沾一次可畫 ' + T.SQ * T.BUDGET_MULT + ' px）');
// 蓋塗鴉比原本塗滿方塊省時：原本要塗滿 400×400（至少要掃 SQ×SQ ÷ 筆刷直徑 的長度），現在只要蓋住塗鴉線（總長約 ' + mean(lenStats).toFixed(0) + ' px，不用管其他地方）
{
  let D = T.BRUSH_START, dipsOld = 0, area = 0;
  for (dipsOld = 1; dipsOld <= 60; dipsOld++) { D = T.brushAfter(D); area += D * T.SQ * T.BUDGET_MULT; if (area >= T.SQ * T.SQ) break; }
  const dipsNew = Math.ceil(mean(lenStats) / (T.SQ * T.BUDGET_MULT));
  console.log('理論最少沾油漆次數（不重複、路線完美）：舊玩法塗滿方塊 ' + dipsOld + ' 次 → 新玩法蓋塗鴉約 ' + dipsNew + ' 次（光是塗鴉線總長 ÷ ' + T.SQ * T.BUDGET_MULT + '）');
  ok(dipsNew < dipsOld, '新玩法比舊玩法省時');
}
ok(T.rating(6) !== T.rating(8) && T.rating(8) !== T.rating(11) && T.rating(11) !== T.rating(15) && T.rating(15) !== T.rating(20) && T.rating(7) === T.rating(1), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
