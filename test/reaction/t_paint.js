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
// ───────── V1.34.0：闖關制（第 1 關 1 處大塗鴉 → 第 12 關 12 處）、筆刷參數放寬、每一關沾油漆上限 40 次 ─────────
const { rng, seedOf } = require('./load.js');
const SEED = seedOf(20261012), rnd = rng(SEED);
ok(T.MAX_LEVEL === 12 && T.SCRIBBLE_MAX === 12 && T.PEN_SIZES.length === 7 && Math.min(...T.PEN_SIZES) === 6 && Math.max(...T.PEN_SIZES) === 30, '關卡與塗鴉參數：12 關、最多 12 處、筆頭 6～30px');
ok(T.DIP_MAX === 40, '每一關沾油漆上限 40 次（玩家指定）');
// 玩家意見：筆刷縮小的比例放大一些（舊版 0.88）、最小筆刷放大（舊版 3）
ok(T.SHRINK === 0.93 && T.SHRINK > 0.88 && T.BRUSH_MIN === 10 && T.BRUSH_MIN > 3 && T.BUDGET_MULT === 1 && T.BRUSH_START === 80, '筆刷參數：縮小 0.93（舊版 0.88）、最小 10（舊版 3）、油漆量 1 倍、起始 80');
{ let d = T.BRUSH_START, d10 = 0, d20 = 0; for (let i = 1; i <= 40; i++) { d = T.brushAfter(d); if (i === 10) d10 = d; if (i === 20) d20 = d; ok(d >= T.BRUSH_MIN, '筆刷不會小於最小值'); }
  ok(d10 > 35, '沾 10 次後筆刷還有 ' + d10.toFixed(1) + 'px（舊版 0.88 只剩 22px）'); ok(d20 > 15, '沾 20 次後筆刷還有 ' + d20.toFixed(1) + 'px'); ok(d >= T.BRUSH_MIN && d <= T.BRUSH_MIN * 1.0001, '沾 40 次後縮到最小值 ' + d.toFixed(2) + 'px'); }
// 處數、小區
ok(T.scribbleCount(1) === 1 && T.scribbleCount(2) === 2 && T.scribbleCount(12) === 12 && T.scribbleCount(13) === 12 && T.scribbleCount(99) === 12 && T.scribbleCount(0) === 1 && T.scribbleCount() === 12, '第 N 關畫 N 處，最多 12 處');
ok(T.gridFor(1) === 1 && T.gridFor(2) === 2 && T.gridFor(4) === 2 && T.gridFor(5) === 3 && T.gridFor(9) === 3 && T.gridFor(10) === 4 && T.gridFor(12) === 4, '處數 → 切成幾乘幾個小區');

const compStats = {}, kindsSeen = {}, sizesSeenAll = new Set(), level1Sides = [];
for (let L = 1; L <= 14; L++) {
  const K = T.scribbleCount(L), g = T.gridFor(K), cell = T.SQ / g;
  compStats[L] = [];
  for (let n = 0; n < 40; n++) {
    const scr = T.makeScribbles(rnd, L);
    ok(scr.length === K, '第 ' + L + ' 關塗鴉處數 ' + scr.length + '（要 ' + K + '）');
    const cells = new Set(), widths = new Set();
    let areaSum = 0;
    scr.forEach((sc, k) => {
      kindsSeen[sc.kind] = (kindsSeen[sc.kind] || 0) + 1; widths.add(sc.w); sizesSeenAll.add(sc.w);
      ok(T.KINDS.indexOf(sc.kind) >= 0 && T.PEN_SIZES.indexOf(sc.w) >= 0 && T.INK_COLORS.indexOf(sc.color) >= 0 && sc.lines.length >= 1, '形狀、粗細、顏色都來自清單');
      if (k > 0 && K > 1) ok(sc.kind !== scr[k - 1].kind, '連續兩處不是同一種形狀');
      ok(sc.kind !== 'dot' || sc.side <= T.DOT_MAX_SIDE, '大圖案（邊長 ' + sc.side.toFixed(0) + '）不抽圓點');
      areaSum += sc.side * sc.side;
      // 每處的邊長 ＝ min(想要的邊長 √(SCRIBBLE_AREA ÷ K)，小區扣掉筆頭與空隙後剩下的空間)
      const room = cell - 2 * (sc.w / 2 + T.SCRIBBLE_GAP), want = Math.sqrt(T.SCRIBBLE_AREA / K);
      ok(Math.abs(sc.side - Math.min(want, room)) < 1e-6, '第 ' + L + ' 關：邊長 ' + sc.side.toFixed(1) + ' ＝ min(' + want.toFixed(1) + ', ' + room.toFixed(1) + ')');
      // 每一處塗鴉整個縮在自己的小區裡，離小區邊緣至少 筆頭半徑 ＋ SCRIBBLE_GAP（所以兩處塗鴉之間至少隔 2×SCRIBBLE_GAP）
      const p0 = sc.lines[0][0], ci = Math.floor(p0[0] / cell) + g * Math.floor(p0[1] / cell);
      ok(!cells.has(ci), '每一處塗鴉在不同的小區'); cells.add(ci);
      const x0 = (ci % g) * cell, y0 = Math.floor(ci / g) * cell, pad = sc.w / 2 + T.SCRIBBLE_GAP - 1e-6;
      sc.lines.forEach(ln => {
        ok(ln.length >= 2, 'a line has at least 2 points');
        for (let i = 0; i < ln.length; i++) {
          const p = ln[i];
          ok(p[0] >= x0 + pad && p[0] <= x0 + cell - pad && p[1] >= y0 + pad && p[1] <= y0 + cell - pad, '第 ' + L + ' 關：塗鴉的點縮在自己的小區裡（' + sc.kind + ' w=' + sc.w + '）：' + p.map(v => v.toFixed(1)));
          if (i) { const d = Math.hypot(p[0] - ln[i - 1][0], p[1] - ln[i - 1][1]); ok(d <= 3.0001 || sc.kind === 'dot', '點跟點之間 ≤ 3px：' + d.toFixed(2) + ' ' + sc.kind); }
        }
      });
    });
    // 「面積」：所有塗鴉外框（方形）面積總和不會超過 SCRIBBLE_AREA；小區放得下的話正好等於它（第 1 關那一處被放大到整個面積）
    ok(areaSum <= T.SCRIBBLE_AREA * 1.0001, '第 ' + L + ' 關：外框面積總和 ' + areaSum.toFixed(0) + ' 不超過 ' + T.SCRIBBLE_AREA);
    if (K === 1) ok(Math.abs(areaSum - T.SCRIBBLE_AREA) < 1, '第 1 關（整個方塊都是它的小區）：外框面積 ' + areaSum.toFixed(0) + ' ＝ ' + T.SCRIBBLE_AREA);
    if (K === 1) level1Sides.push(scr[0].side);
    if (K >= 7) ok(widths.size >= 5, '處數多的關卡，筆頭粗細要有很多種（' + widths.size + ' 種）');
    // 遮罩：塗鴉格子＝0、其他＝1，left＝total＝塗鴉格數；連通區域至少 K 塊
    const m = T.scribbleMask(scr, T.SQ);
    ok(m.left === m.total && m.total > 800 && m.total < T.SQ * T.SQ * 0.4, '第 ' + L + ' 關遮罩的塗鴉格數合理：' + m.total + '（占方塊 ' + (m.total / T.SQ / T.SQ * 100).toFixed(1) + '%）');
    let zeros = 0; for (let i = 0; i < m.data.length; i++) { ok(m.data[i] === 0 || m.data[i] === 1, 'mask values'); if (m.data[i] === 0) zeros++; }
    ok(zeros === m.total, 'left equals the number of 0 cells');
    const comps = T.holes(m, 200);
    ok(comps.length >= K, '第 ' + L + ' 關至少 ' + K + ' 處不連續的塗鴉（連通區域 ' + comps.length + ' 塊）');
    ok(comps.reduce((a, c) => a + c.size, 0) === m.total, 'components add up to the total');
    compStats[L].push(comps.length);
    // 用「半徑夠大」的圓沿著每一條塗鴉線蓋過去 → 全部蓋掉（left === 0）；半徑太小（比塗鴉細）就一定蓋不完
    const full = T.scribbleMask(scr, T.SQ), thin = T.scribbleMask(scr, T.SQ);
    scr.forEach(sc => sc.lines.forEach(ln => { for (let i = 1; i < ln.length; i++) { T.stampSegment(full, ln[i - 1][0], ln[i - 1][1], ln[i][0], ln[i][1], sc.w / 2 + 3); T.stampSegment(thin, ln[i - 1][0], ln[i - 1][1], ln[i][0], ln[i][1], Math.max(1.2, sc.w / 2 - 2)); } }));
    ok(full.left === 0, '半徑夠大的筆刷沿著塗鴉走一遍，塗鴉全部蓋掉（left=' + full.left + '）');
    ok(thin.left > 0, '太細的筆刷蓋不完');
  }
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log('第 1 關那一處塗鴉的邊長：平均 ' + mean(level1Sides).toFixed(0) + 'px（最小 ' + Math.min(...level1Sides).toFixed(0) + '）；舊版每處只有約 70px');
ok(Math.min(...level1Sides) >= 150 && Math.abs(mean(level1Sides) - Math.sqrt(T.SCRIBBLE_AREA)) < 40, '第 1 關的單一圖案比舊版（約 70px）大很多，邊長接近 √' + T.SCRIBBLE_AREA + ' ＝ ' + Math.sqrt(T.SCRIBBLE_AREA).toFixed(0));
ok(Object.keys(kindsSeen).length === T.KINDS.length, '九種形狀都會出現：' + Object.keys(kindsSeen).length);
ok(sizesSeenAll.size === 7, '七種筆頭粗細都會出現');

// ── 機器人實測：認真的玩家（沿著塗鴉的線一筆一筆畫、手指離開螢幕不耗油漆）每一關要沾幾次油漆 ──
//    waste：多浪費幾成油漆（0＝完美、0.5＝每段多畫一半、1＝浪費一倍），模擬不太會規劃的玩家
function bot(scr, waste, rand) {
  const m = T.scribbleMask(scr, T.SQ);
  let D = T.BRUSH_START, dips = 0, budget = 0;
  const dip = () => { dips++; D = T.brushAfter(D); budget = T.SQ * T.BUDGET_MULT; };
  const order = scr.slice().sort((a, b) => b.w - a.w);                // 先蓋粗的、再蓋細的
  for (const sc of order) for (const ln of sc.lines) {
    let i = 0;
    while (i < ln.length && dips <= 400) {
      if (budget <= 0) dip();
      T.stampDisc(m, ln[i][0], ln[i][1], D / 2); budget = Math.max(0, budget - D);       // 起筆的圓點也耗油漆
      while (++i < ln.length && budget > 0) {
        const len = Math.hypot(ln[i][0] - ln[i - 1][0], ln[i][1] - ln[i - 1][1]), use = Math.min(budget, len * (1 + waste));
        T.stampSegment(m, ln[i - 1][0], ln[i - 1][1], ln[i][0], ln[i][1], D / 2);
        budget -= use;
      }
    }
  }
  return { dips, left: m.left };
}
for (const waste of [0, 0.5, 1]) {
  const row = [];
  for (let L = 1; L <= 12; L++) { const ds = []; for (let n = 0; n < 25; n++) { const r = bot(T.makeScribbles(rnd, L), waste, rnd); ds.push(r.dips); ok(r.left === 0, '機器人把塗鴉蓋完'); } row.push(mean(ds).toFixed(1) + '(' + Math.max(...ds) + ')'); if (waste === 0) ok(Math.max(...ds) <= 25, '第 ' + L + ' 關：完美路線最多只要沾 ' + Math.max(...ds) + ' 次（上限 ' + T.DIP_MAX + '）'); if (waste === 1 && L <= 6) ok(Math.max(...ds) <= T.DIP_MAX, '第 ' + L + ' 關：浪費一倍油漆的玩家前 6 關也不會超過上限（最多 ' + Math.max(...ds) + ' 次）'); }
  console.log('浪費 ' + waste * 100 + '% 油漆的機器人，第 1～12 關平均沾幾次（最多）：' + row.join('  '));
}
{ // 最後一關（12 處）完美路線也要沾得夠多才有挑戰，不是一兩次就好
  const ds = []; for (let n = 0; n < 30; n++) ds.push(bot(T.makeScribbles(rnd, 12), 0, rnd).dips);
  ok(mean(ds) >= 6, '第 12 關完美路線平均要沾 ' + mean(ds).toFixed(1) + ' 次（不能太輕鬆）');
  const d1 = []; for (let n = 0; n < 30; n++) d1.push(bot(T.makeScribbles(rnd, 1), 0, rnd).dips);
  ok(mean(d1) < mean(ds), '第 1 關比第 12 關省油漆：' + mean(d1).toFixed(1) + ' < ' + mean(ds).toFixed(1));
}
// 評語分級、成績規格
ok(T.rating(0) === T.rating(2) && T.rating(2) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(9) && T.rating(9) !== T.rating(12) && T.rating(12) === T.rating(99), '評語分級（闖過幾關）');
ok(G.score.better === 'max' && G.score.min === 1 && G.score.max === T.MAX_LEVEL && G.score.decimals === 0 && /關/.test(G.score.format), '成績規格：闖過幾關，越大越好，1～' + T.MAX_LEVEL);
ok(/40/.test(G.rule) && /第 1 關只有 1 處/.test(G.rule) && /超過就失敗/.test(G.rule), '玩法說明有寫「第 1 關只有 1 處大塗鴉」「每一關最多沾 40 次，超過就失敗」');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');