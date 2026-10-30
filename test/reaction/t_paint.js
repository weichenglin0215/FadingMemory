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
// ───────── V1.34.0：闖關制（第 1 關 1 處大塗鴉 → 第 12 關 12 處）、筆刷參數放寬；V1.40.0：自由擺放（可重疊）、emoji 塗鴉、沾油漆上限 20 → 40 ─────────
const { rng, seedOf } = require('./load.js');
const SEED = seedOf(20261012), rnd = rng(SEED);
const fs = require('fs'), path = require('path');
ok(T.MAX_LEVEL === 90 && T.SCRIBBLE_MAX === 12 && T.PEN_SIZES.length === 7 && Math.min(...T.PEN_SIZES) === 6 && Math.max(...T.PEN_SIZES) === 30, '關卡與塗鴉參數：V1.36 起全部 90 關（MAX_LEVEL 統一）、塗鴉最多 12 處（第 12 關起到頂）、筆頭 6～30px');
// V1.40.0：沾油漆次數上限改成兩個參數（起始 20、最終 40），隨關卡線性增加
ok(T.DIP_START === 20 && T.DIP_END === 40 && T.DIP_RAMP_LEVELS >= 2, '沾油漆上限的兩個參數：起始 ' + T.DIP_START + '、最終 ' + T.DIP_END + '（玩家指定 20 → 40），線性增加到第 ' + T.DIP_RAMP_LEVELS + ' 關');
ok(T.dipMaxFor(1) === T.DIP_START && T.dipMaxFor(T.DIP_RAMP_LEVELS) === T.DIP_END && T.dipMaxFor(T.DIP_RAMP_LEVELS + 30) === T.DIP_END && T.dipMaxFor(T.MAX_LEVEL) === T.DIP_END, 'dipMaxFor：第 1 關 ' + T.dipMaxFor(1) + '、第 ' + T.DIP_RAMP_LEVELS + ' 關起 ' + T.dipMaxFor(T.DIP_RAMP_LEVELS));
{ let prev = 0, steps = []; for (let L = 1; L <= T.MAX_LEVEL; L++) { const v = T.dipMaxFor(L); ok(Number.isInteger(v) && v >= prev && v >= T.DIP_START && v <= T.DIP_END, '第 ' + L + ' 關的上限是整數、不會變少：' + v); if (L > 1 && L <= T.DIP_RAMP_LEVELS) steps.push(v - prev); prev = v; }
  ok(Math.max(...steps) - Math.min(...steps) <= 1 && Math.min(...steps) >= 1, '上限線性增加：每關 +' + Math.min(...steps) + '～+' + Math.max(...steps) + '（四捨五入）'); }
// 玩家意見：筆刷縮小的比例放大一些（舊版 0.88）、最小筆刷放大（舊版 3）
ok(T.SHRINK === 0.93 && T.SHRINK > 0.88 && T.BRUSH_MIN === 10 && T.BRUSH_MIN > 3 && T.BUDGET_MULT === 1 && T.BRUSH_START === 80, '筆刷參數：縮小 0.93（舊版 0.88）、最小 10（舊版 3）、油漆量 1 倍、起始 80');
{ let d = T.BRUSH_START, d10 = 0, d20 = 0; for (let i = 1; i <= 40; i++) { d = T.brushAfter(d); if (i === 10) d10 = d; if (i === 20) d20 = d; ok(d >= T.BRUSH_MIN, '筆刷不會小於最小值'); }
  ok(d10 > 35, '沾 10 次後筆刷還有 ' + d10.toFixed(1) + 'px（舊版 0.88 只剩 22px）'); ok(d20 > 15, '沾 20 次後筆刷還有 ' + d20.toFixed(1) + 'px'); ok(d >= T.BRUSH_MIN && d <= T.BRUSH_MIN * 1.0001, '沾 40 次後縮到最小值 ' + d.toFixed(2) + 'px'); }
// 處數
ok(T.scribbleCount(1) === 1 && T.scribbleCount(2) === 2 && T.scribbleCount(12) === 12 && T.scribbleCount(13) === 12 && T.scribbleCount(99) === 12 && T.scribbleCount(0) === 1 && T.scribbleCount() === 12, '第 N 關畫 N 處，最多 12 處');
ok(T.gridFor === undefined, '不再有「切成小區」的 gridFor（位置改成自由擺放）');

// ═══ emoji 清單 ═══
const allEmoji = []; T.EMOJI_GROUPS.forEach(g => g.list.forEach(e => allEmoji.push({ g: g.id, e })));
ok(T.EMOJI_GROUPS.map(g => g.id).join() === 'car,food,veg,balloon,party,fun' && T.EMOJI_GROUPS.every(g => g.w > 0 && g.list.length >= 1 && new Set(g.list).size === g.list.length), 'emoji 六類：汽車、食物、蔬菜、氣球、生日派對、小圖案；每類不重複');
ok(allEmoji.length >= 50 && new Set(allEmoji.map(x => x.e)).size === allEmoji.length, 'emoji 共 ' + allEmoji.length + ' 個，彼此不同');
{ const cps = e => Array.from(e).map(c => c.codePointAt(0));
  ok(allEmoji.every(x => cps(x.e).every(c => c >= 0x2000 && (c < 0x1F9C1 || c > 0x1F9FF) && c < 0x1FA70)), '全部是 2017 年（Emoji 5.0）以前的 emoji：沒有用到 U+1F9C1～1F9FF（Unicode 11 以後）與 U+1FA70 以後的字');
  const needVS = [0x2708, 0x2600, 0x2764, 0x1F336, 0x1F56F];
  ok(allEmoji.every(x => { const c = cps(x.e); return c.every((cp, i) => !needVS.includes(cp) || c[i + 1] === 0xFE0F); }), '預設是文字樣式的符號（✈ ☀ ❤ 🌶 🕯）後面都接 U+FE0F，才會畫成彩色 emoji');
  ok(['🎈'].every(e => T.EMOJI_GROUPS.find(g => g.id === 'balloon').list.includes(e)) && T.EMOJI_GROUPS.find(g => g.id === 'car').list.includes('🚗') && T.EMOJI_GROUPS.find(g => g.id === 'veg').list.includes('🥕') && T.EMOJI_GROUPS.find(g => g.id === 'party').list.includes('🎂'), '玩家要的：汽車、蔬菜、氣球、生日蛋糕都有'); }
ok(T.EMOJI_P > 0.2 && T.EMOJI_P < 0.8 && T.EMOJI_FS > 0.5 && T.EMOJI_FS <= 1 && T.EMOJI_HALF >= 0.55 && T.EMOJI_ALPHA >= 1 && T.PLACE_TRIES >= 1, 'emoji／擺放參數合理');

// ═══ 出題：自由擺放、可以重疊、emoji ═══
const kindsSeen = {}, sizesSeenAll = new Set(), level1Sides = [], emojiSeen = {}, groupSeen = {};
let nItems = 0, nEmoji = 0, overlapLevels = 0, levelsK6 = 0, sameQuadrant = 0, levelsK4 = 0, cxs = [], cys = [];
const areaOf = sc => ({ x0: sc.cx - sc.side / 2, x1: sc.cx + sc.side / 2, y0: sc.cy - sc.side / 2, y1: sc.cy + sc.side / 2 });
for (let L = 1; L <= 14; L++) {
  const K = T.scribbleCount(L);
  for (let n = 0; n < 40; n++) {
    const scr = T.makeScribbles(rnd, L);
    ok(scr.length === K, '第 ' + L + ' 關塗鴉處數 ' + scr.length + '（要 ' + K + '）');
    const widths = [], usedEmoji = new Set();
    let areaSum = 0, strokes = 0;
    scr.forEach((sc, k) => {
      nItems++; areaSum += sc.side * sc.side; cxs.push(sc.cx); cys.push(sc.cy);
      ok(Number.isFinite(sc.cx) && Number.isFinite(sc.cy) && Math.abs(sc.side - Math.sqrt(T.SCRIBBLE_AREA / K)) < 1e-6, '第 ' + L + ' 關：每處邊長 ＝ √(' + T.SCRIBBLE_AREA + ' ÷ ' + K + ')（面積總和固定）');
      if (sc.kind === 'emoji') {
        nEmoji++; emojiSeen[sc.emoji] = 1; groupSeen[sc.group] = 1;
        ok(allEmoji.some(x => x.e === sc.emoji && x.g === sc.group), 'emoji 來自清單、類別對得上');
        ok(!usedEmoji.has(sc.emoji), '同一關的 emoji 不重複（' + sc.emoji + '）'); usedEmoji.add(sc.emoji);
        ok(sc.w === 0 && sc.color === null && Array.isArray(sc.lines) && sc.lines.length === 0 && Math.abs(sc.fs - sc.side * T.EMOJI_FS) < 1e-6, 'emoji 塗鴉：沒有線、沒有筆頭，字級 ＝ 邊長 × EMOJI_FS');
        const half = sc.fs * T.EMOJI_HALF;
        ok(sc.cx - half >= T.SCRIBBLE_GAP - 1e-6 && sc.cx + half <= T.SQ - T.SCRIBBLE_GAP + 1e-6 && sc.cy - half >= T.SCRIBBLE_GAP - 1e-6 && sc.cy + half <= T.SQ - T.SCRIBBLE_GAP + 1e-6, 'emoji（含方框）整個在方塊裡：中心 (' + sc.cx.toFixed(0) + ', ' + sc.cy.toFixed(0) + ')，半邊長 ' + half.toFixed(0));
        return;
      }
      strokes++; kindsSeen[sc.kind] = (kindsSeen[sc.kind] || 0) + 1; sizesSeenAll.add(sc.w); widths.push(sc.w);
      ok(T.KINDS.indexOf(sc.kind) >= 0 && T.PEN_SIZES.indexOf(sc.w) >= 0 && T.INK_COLORS.indexOf(sc.color) >= 0 && sc.lines.length >= 1, '形狀、粗細、顏色都來自清單');
      ok(sc.kind !== 'dot' || sc.side <= T.DOT_MAX_SIDE, '大圖案（邊長 ' + sc.side.toFixed(0) + '）不抽圓點');
      // 整個塗鴉在方塊裡，離方塊邊緣至少 筆頭半徑 ＋ SCRIBBLE_GAP（位置是整個方塊任意擺，不再縮在小區裡）
      const pad = sc.w / 2 + T.SCRIBBLE_GAP - 1e-6;
      sc.lines.forEach(ln => {
        ok(ln.length >= 2, 'a line has at least 2 points');
        for (let i = 0; i < ln.length; i++) {
          const p = ln[i];
          ok(p[0] >= pad && p[0] <= T.SQ - pad && p[1] >= pad && p[1] <= T.SQ - pad, '第 ' + L + ' 關：塗鴉的點在方塊裡、離邊緣夠遠（' + sc.kind + ' w=' + sc.w + '）：' + p.map(v => v.toFixed(1)));
          if (i) { const d = Math.hypot(p[0] - ln[i - 1][0], p[1] - ln[i - 1][1]); ok(d <= 3.0001 || sc.kind === 'dot', '點跟點之間 ≤ 3px：' + d.toFixed(2) + ' ' + sc.kind); }
        }
      });
    });
    // 連續兩個「線條塗鴉」不是同一種形狀（中間夾 emoji 不算連續）
    { let prev = null; scr.forEach(sc => { if (sc.kind === 'emoji') return; if (prev !== null) ok(sc.kind !== prev, '連續兩個線條塗鴉不是同一種形狀'); prev = sc.kind; }); }
    // 筆頭粗細：線條塗鴉輪流用七種粗細（洗牌後依序取），所以前 min(處數, 7) 個互不相同
    ok(new Set(widths).size === Math.min(widths.length, 7), '線條塗鴉的筆頭粗細依序取、不重複（' + widths.join(',') + '）');
    // 「面積」：所有塗鴉外框面積總和 ＝ SCRIBBLE_AREA（現在沒有小區限制，每一關都剛好等於它）
    ok(Math.abs(areaSum - T.SCRIBBLE_AREA) < 1, '第 ' + L + ' 關：外框面積總和 ' + areaSum.toFixed(0) + ' ＝ ' + T.SCRIBBLE_AREA);
    if (K === 1) level1Sides.push(scr[0].side);
    // 位置：不是九宮格——處數 4 時，舊版一定是 2×2 每格一處；現在常有兩處在同一個象限
    if (K === 4) { levelsK4++; const q = new Set(scr.map(sc => (sc.cx < T.SQ / 2 ? 0 : 1) + (sc.cy < T.SQ / 2 ? 0 : 2))); if (q.size < 4) sameQuadrant++; }
    // 重疊：處數 ≥ 6 時，外框互相重疊的關卡有一定比例
    if (K >= 6) { levelsK6++; let ov = false; for (let i = 0; i < K && !ov; i++) for (let j = i + 1; j < K && !ov; j++) { const a = areaOf(scr[i]), b = areaOf(scr[j]); if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) ov = true; } if (ov) overlapLevels++; }
    // 遮罩（Node 沒有畫布，emoji 用方框備案）：塗鴉格子＝0、其他＝1，left＝total＝塗鴉格數
    const m = T.scribbleMask(scr, T.SQ);
    ok(m.left === m.total && m.total > 800 && m.total < T.SQ * T.SQ * 0.42, '第 ' + L + ' 關遮罩的塗鴉格數合理：' + m.total + '（占方塊 ' + (m.total / T.SQ / T.SQ * 100).toFixed(1) + '%）');
    let zeros = 0; for (let i = 0; i < m.data.length; i++) { ok(m.data[i] === 0 || m.data[i] === 1, 'mask values'); if (m.data[i] === 0) zeros++; }
    ok(zeros === m.total, 'left equals the number of 0 cells');
    const comps = T.holes(m, 400);
    ok(comps.length >= 1 && comps.length <= K, '第 ' + L + ' 關連通區域 ' + comps.length + ' 塊（每一處塗鴉是連通的一塊，重疊的會合併，所以 1～' + K + ' 塊）');
    ok(comps.reduce((a, c) => a + c.size, 0) === m.total, 'components add up to the total');
    // 用「半徑夠大」的圓沿著每一條塗鴉線蓋過去（emoji 用一列一列的掃描線蓋過整個方框）→ 全部蓋掉（left === 0）；半徑太小（比塗鴉細）就一定蓋不完
    const full = T.scribbleMask(scr, T.SQ), thin = T.scribbleMask(scr, T.SQ);
    scr.forEach(sc => {
      sc.lines.forEach(ln => { for (let i = 1; i < ln.length; i++) { T.stampSegment(full, ln[i - 1][0], ln[i - 1][1], ln[i][0], ln[i][1], sc.w / 2 + 3); T.stampSegment(thin, ln[i - 1][0], ln[i - 1][1], ln[i][0], ln[i][1], Math.max(1.2, sc.w / 2 - 2)); } });
      if (sc.kind === 'emoji') { const hf = sc.fs * T.EMOJI_HALF; for (let y = sc.cy - hf - 3; y <= sc.cy + hf + 3; y += 4) T.stampSegment(full, sc.cx - hf - 3, y, sc.cx + hf + 3, y, 6); }
    });
    ok(full.left === 0, '半徑夠大的筆刷沿著塗鴉走一遍，塗鴉全部蓋掉（left=' + full.left + '）');
    ok(thin.left > 0, '太細的筆刷蓋不完');
  }
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log('第 1 關那一處塗鴉的邊長：平均 ' + mean(level1Sides).toFixed(0) + 'px；emoji 占 ' + (nEmoji / nItems * 100).toFixed(1) + '%（EMOJI_P ' + T.EMOJI_P + '）；處數 4 的關卡有兩處在同一象限的占 ' + (sameQuadrant / levelsK4 * 100).toFixed(0) + '%；處數 ≥ 6 的關卡有外框重疊的占 ' + (overlapLevels / levelsK6 * 100).toFixed(0) + '%');
ok(Math.min(...level1Sides) >= 150 && Math.abs(mean(level1Sides) - Math.sqrt(T.SCRIBBLE_AREA)) < 1, '第 1 關的單一圖案比舊版（約 70px）大很多，邊長 ＝ √' + T.SCRIBBLE_AREA + ' ＝ ' + Math.sqrt(T.SCRIBBLE_AREA).toFixed(0));
ok(Object.keys(kindsSeen).length === T.KINDS.length, '九種線條形狀都會出現：' + Object.keys(kindsSeen).length);
ok(sizesSeenAll.size === 7, '七種筆頭粗細都會出現');
ok(Math.abs(nEmoji / nItems - T.EMOJI_P) < 0.05, 'emoji 占全部塗鴉的 ' + (nEmoji / nItems).toFixed(3) + '（目標 ' + T.EMOJI_P + '）');
ok(Object.keys(groupSeen).length === T.EMOJI_GROUPS.length && Object.keys(emojiSeen).length > 40, '六類 emoji 都出現過，共出現 ' + Object.keys(emojiSeen).length + ' 種不同的 emoji');
ok(sameQuadrant / levelsK4 > 0.3, '位置不是九宮格：處數 4 的關卡常有兩處在同一象限（' + (sameQuadrant / levelsK4 * 100).toFixed(0) + '%；舊版 2×2 每格一處＝0%）');
ok(overlapLevels / levelsK6 > 0.5, '塗鴉可以互相重疊：處數 ≥ 6 的關卡有外框重疊的占 ' + (overlapLevels / levelsK6 * 100).toFixed(0) + '%');
{ // 擺放位置涵蓋整個方塊（不是只在九宮格的格子中心附近）：靠邊的塗鴉中心要留出自己的半邊長，所以兩端的區間比較少；中間各區間差不多多
  const bins = new Array(8).fill(0); cxs.forEach(x => { bins[Math.min(7, Math.floor(x / T.SQ * 8))]++; });
  const inner = bins.slice(1, 7), avgIn = inner.reduce((a, b) => a + b, 0) / 6;
  ok(Math.min(...cxs) < 70 && Math.max(...cxs) > T.SQ - 70 && Math.min(...cys) < 70 && Math.max(...cys) > T.SQ - 70, '塗鴉中心靠得到方塊的四個邊（x ' + Math.min(...cxs).toFixed(0) + '～' + Math.max(...cxs).toFixed(0) + '，y ' + Math.min(...cys).toFixed(0) + '～' + Math.max(...cys).toFixed(0) + '）');
  ok(Math.min(...inner) > avgIn * 0.7 && Math.max(...inner) < avgIn * 1.3 && bins[0] > 0 && bins[7] > 0, '中心的 x 座標在整個方塊裡平均分布（8 等分各有：' + bins.join('/') + '）'); }
// 自由擺放不像舊版：1 處時位置在整個方塊裡亂跑；PLACE_TRIES 越大，塗鴉之間越分散（最近鄰距離變大）
{ const nn = tries => { let tot = 0, cnt = 0; for (let n = 0; n < 150; n++) { const r2 = rng(777 + n), scr = T.makeScribbles(r2, 8); scr.forEach((a, i) => { let d = 1e9; scr.forEach((b, j) => { if (i !== j) d = Math.min(d, Math.hypot(a.cx - b.cx, a.cy - b.cy)); }); tot += d; cnt++; }); } return tot / cnt; };
  ok(nn(T.PLACE_TRIES) > 40, '第 8 關每一處離最近的另一處平均 ' + nn(T.PLACE_TRIES).toFixed(0) + 'px（不會全擠成一團）'); }
{ // 純函式 pickEmoji：同一關不重複
  const used = {}, r3 = rng(99), got = new Set(); for (let i = 0; i < allEmoji.length; i++) { const e = T.pickEmoji(r3, used); got.add(e.emoji); }
  ok(got.size === allEmoji.length, 'pickEmoji：全部 ' + allEmoji.length + ' 個都抽得到、而且不重複（' + got.size + '）'); }

// ═══ emoji 的遮罩：emojiNeedFromAlpha（讀回來的透明度 → 要蓋的格子）與備案方框 ═══
{ const n = 20, A = new Uint8Array(n * n);
  A[10 * n + 10] = 255; let need = T.emojiNeedFromAlpha(A, n), cnt = need.reduce((a, b) => a + b, 0);
  ok(cnt === 9 && need[9 * n + 9] === 1 && need[11 * n + 11] === 1 && need[8 * n + 10] === 0, '一個不透明像素 → 它與周圍 8 格（多算 1px，保守）共 9 格要蓋');
  const B = new Uint8Array(n * n); B[5 * n + 5] = T.EMOJI_ALPHA - 1; ok(T.emojiNeedFromAlpha(B, n).reduce((a, b) => a + b, 0) === 0, '透明度 ' + (T.EMOJI_ALPHA - 1) + '（< EMOJI_ALPHA）的淡淡一點不用蓋');
  B[5 * n + 5] = T.EMOJI_ALPHA; ok(T.emojiNeedFromAlpha(B, n).reduce((a, b) => a + b, 0) === 9, '透明度剛好 ' + T.EMOJI_ALPHA + ' 就要蓋');
  const C = new Uint8Array(n * n); C[0] = 255; need = T.emojiNeedFromAlpha(C, n); ok(need.reduce((a, b) => a + b, 0) === 4 && need[0] === 1 && need[1] === 1 && need[n] === 1 && need[n + 1] === 1, '在角落的像素：不會讀到畫面外（4 格）');
  const D = new Uint8Array(n * n); for (let y = 5; y <= 14; y++) for (let x = 5; x <= 14; x++) D[y * n + x] = 200; need = T.emojiNeedFromAlpha(D, n); ok(need.reduce((a, b) => a + b, 0) === 12 * 12, '10×10 的實心方塊 → 往外多 1px 變成 12×12');
  ok(T.emojiNeedFromAlpha(new Uint8Array(n * n), n).reduce((a, b) => a + b, 0) === 0, '全透明 → 沒有東西要蓋'); }
{ // scribbleMask 吃 emojiNeed：和線條塗鴉取聯集；沒給就用方框
  const n = T.SQ, em = { kind: 'emoji', emoji: '🚗', group: 'car', w: 0, color: null, lines: [], side: 100, fs: 85, cx: 200, cy: 200 };
  const stroke = { kind: 'zigzag', w: 10, color: T.INK_COLORS[0], lines: [[[20, 20], [60, 20]]], side: 40, cx: 40, cy: 20 };
  const need = new Uint8Array(n * n); for (let y = 190; y < 210; y++) for (let x = 190; x < 215; x++) need[y * n + x] = 1;       // 20×25 的「emoji」
  const m1 = T.scribbleMask([em], n, need); ok(m1.total === 500 && m1.left === 500, '有 emojiNeed：要蓋的就是那 500 格（' + m1.total + '）');
  const m2 = T.scribbleMask([em, stroke], n, need), onlyStroke = T.scribbleMask([stroke], n); ok(m2.total === 500 + onlyStroke.total && m2.left === m2.total, 'emoji 與線條取聯集：' + m2.total + ' ＝ 500 + ' + onlyStroke.total);
  const hf = em.fs * T.EMOJI_HALF, m3 = T.scribbleMask([em], n), side = Math.floor(em.cx + hf - 0.5) - Math.ceil(em.cx - hf - 0.5) + 1; ok(m3.total === side * side && side >= 2 * hf - 2, '沒給 emojiNeed：用方框（半邊長 ' + hf.toFixed(1) + '，' + side + '×' + side + ' 格）');
  const m4 = T.scribbleMask([em], n, null); ok(m4.total === m3.total, 'emojiNeed 是 null 也用方框');
  const m5 = T.scribbleMask([em], n, new Uint8Array(10)); ok(m5.total === m3.total, 'emojiNeed 大小不對就不採用，用方框');
  const m6 = T.scribbleMask([em], n, need); T.stampDisc(m6, 202, 200, 40); ok(m6.left === 0, '把 emoji 的格子用大筆刷蓋過去就全部蓋掉（left=' + m6.left + '）');
  const none = T.scribbleMask([stroke], n, need); ok(none.total === onlyStroke.total, '沒有 emoji 時 emojiNeed 不影響'); }

// ── 機器人實測：認真的玩家（沿著塗鴉的線一筆一筆畫、手指離開螢幕不耗油漆；emoji 照遮罩一列一列掃）每一關要沾幾次油漆 ──
//    waste：多浪費幾成油漆（0＝完美、0.5＝每段多畫一半、1＝浪費一倍），模擬不太會規劃的玩家
function bot(scr, waste, rand) {
  const m = T.scribbleMask(scr, T.SQ);                     // Node 沒有畫布：emoji 用方框（比真的 emoji 大，所以這裡的沾漆次數是偏多的估計）
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
  // emoji：一列一列掃還沒蓋到的連續格子（列距＝筆刷直徑的一半），掃完還有剩就錯開起始列再掃，跟 G.debug.solve 一樣
  for (let pass = 0; pass < 8 && m.left > 0; pass++) {
    for (let y = pass * 5; y < T.SQ && dips <= 400; y += Math.max(3, Math.floor(D / 2))) {
      for (let x = 0; x < T.SQ; x++) {
        if (m.data[y * T.SQ + x]) continue;
        let xe = x; while (xe + 1 < T.SQ && !m.data[y * T.SQ + xe + 1]) xe++;
        let from = x;
        while (from <= xe && dips <= 400) {
          if (budget <= 0) dip();
          T.stampDisc(m, from, y + 0.5, D / 2); budget = Math.max(0, budget - D);
          const len = Math.min(xe + 1 - from, budget / (1 + waste)); if (len > 0) { T.stampSegment(m, from, y + 0.5, from + len, y + 0.5, D / 2); budget -= len * (1 + waste); }
          from += Math.max(1, len);
        }
        x = xe;
      }
    }
  }
  // 最後零星沒蓋到的（掃描線之間、被別的塗鴉擋住一半的細縫）：一處一處點掉，點在 holes() 回報的代表點
  for (let g = 0; g < 400 && m.left > 0 && dips <= 400; g++) {
    const hl = T.holes(m, 1)[0]; if (!hl) break;
    if (budget <= 0) dip();
    T.stampDisc(m, hl.px, hl.py, D / 2); budget = Math.max(0, budget - D);
  }
  return { dips, left: m.left };
}
const botRows = {};
for (const waste of [0, 0.5, 1]) {
  const row = [];
  for (let L = 1; L <= 12; L++) {
    const ds = []; for (let n = 0; n < 15; n++) { const r = bot(T.makeScribbles(rnd, L), waste, rnd); ds.push(r.dips); ok(r.left === 0, '機器人把塗鴉蓋完（waste ' + waste + ' 第 ' + L + ' 關，剩 ' + r.left + ' 格）'); }
    row.push(mean(ds).toFixed(1) + '(' + Math.max(...ds) + ')'); botRows[waste + ':' + L] = ds;
    if (waste === 0) ok(Math.max(...ds) <= T.dipMaxFor(L) * 0.8, '第 ' + L + ' 關：完美路線最多只要沾 ' + Math.max(...ds) + ' 次（這一關的上限 ' + T.dipMaxFor(L) + '，留 20% 以上的餘裕）');
    if (waste === 1 && L <= 6) ok(Math.max(...ds) <= T.dipMaxFor(L), '第 ' + L + ' 關：浪費一倍油漆的玩家前 6 關也不會超過上限（最多 ' + Math.max(...ds) + ' 次，上限 ' + T.dipMaxFor(L) + '）');
  }
  console.log('浪費 ' + waste * 100 + '% 油漆的機器人，第 1～12 關平均沾幾次（最多）：' + row.join('  '));
}
{ // 最後一關（12 處）完美路線也要沾得夠多才有挑戰，不是一兩次就好
  const ds = botRows['0:12'], d1 = botRows['0:1'];
  ok(mean(ds) >= 6, '第 12 關完美路線平均要沾 ' + mean(ds).toFixed(1) + ' 次（不能太輕鬆）');
  ok(mean(d1) < mean(ds), '第 1 關比第 12 關省油漆：' + mean(d1).toFixed(1) + ' < ' + mean(ds).toFixed(1)); }
// ── 接線（原始碼）：每一關自己的沾漆上限、emoji 的畫法與遮罩、沒有舊的 DIP_MAX ──
{ const src = fs.readFileSync(path.resolve(__dirname, '../../js/reaction_paint.js'), 'utf8');
  ok(!/\bDIP_MAX\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), '程式裡沒有舊的 DIP_MAX（改成 DIP_START／DIP_END 與每關的 dipMax）');
  ok(/var dipMax = dipMaxFor\(n\);/.test(src) && /finish\(n, false, left, dipMax\)/.test(src) && /function finish\(n, allClear, left, dipMax\)/.test(src), '每一關算自己的 dipMax；失敗結算用那一關的上限');
  ok(/info\.textContent = '沾了 ' \+ dips \+ '／' \+ dipMax \+ ' 次/.test(src), '畫面上顯示「沾了 x／這一關的上限 次」');
  ok(/var emojiNeed = rasterEmojiNeed\(scribbles, SQ\);\s*[^\n]*\s*var mask = scribbleMask\(scribbles, SQ, emojiNeed\);/.test(src), '先讀出 emoji 要蓋的格子，再做遮罩');
  ok(/if \(sc\.kind === 'emoji'\) \{ drawEmoji\(g, sc\); return; \}/.test(src) && /function drawEmoji\(g, sc\)[\s\S]{0,300}g\.fillText\(sc\.emoji, sc\.cx, sc\.cy\)/.test(src), '畫面與遮罩用同一個 drawEmoji（同樣的字級、位置）');
  ok(/getImageData\(0, 0, n, n\)/.test(src) && /return cnt >= 0\.25 \* big && cnt <= 0\.9 \* n \* n \? need : null;/.test(src) && /catch \(e\) \{ return null; \}/.test(src), '讀點陣失敗或點陣不合理就回傳 null（改用方框）');
  ok(!/gridFor|小區/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), '程式碼裡不再有切小區（gridFor）的邏輯'); }
// 評語分級、成績規格
ok(T.rating(0) === T.rating(2) && T.rating(2) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) === T.rating(9) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(T.MAX_LEVEL) && T.rating(T.MAX_LEVEL) === T.rating(999) && T.rating(T.MAX_LEVEL - 1) === T.rating(12), '評語分級（闖過幾關；第 12 關起塗鴉處數到頂，滿 MAX_LEVEL 關才是最高評價）');
ok(G.score.better === 'max' && G.score.min === 1 && G.score.max === T.MAX_LEVEL && G.score.decimals === 0 && /關/.test(G.score.format), '成績規格：闖過幾關，越大越好，1～' + T.MAX_LEVEL);
ok(new RegExp(String(T.DIP_START)).test(G.rule) && new RegExp(String(T.DIP_END)).test(G.rule) && /第 1 關只有 1 處/.test(G.rule) && /超過就失敗/.test(G.rule) && /emoji/.test(G.rule) && /重疊/.test(G.rule), '玩法說明有寫「第 1 關只有 1 處大塗鴉」「每一關最多沾 20 次，越後面越多，最後是 40 次，超過就失敗」「emoji 小圖案、位置隨意、會互相重疊」');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');