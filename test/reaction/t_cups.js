const { game } = require('./load.js');
const G = game('reaction_cups.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
// 杯子數跟著參數走：CUPS_START 起、每 CUPS_EVERY 關多一個、最多 CUPS_MAX（V1.34 圓環排列，7 → 12）
const cupsExp = l => Math.min(T.CUPS_MAX, T.CUPS_START + Math.floor((l - 1) / T.CUPS_EVERY));
ok(T.CUPS_MAX === 12 && T.CUPS_START === 3, '杯子數 3 → 12（圓環像鐘面）');
for (let l = 1; l <= 99; l++) ok(T.cupsFor(l) === cupsExp(l), 'cups lvl' + l + '：' + T.cupsFor(l));
ok(T.cupsFor(99) === 12 && T.cupsFor(28) === 12 && T.cupsFor(27) === 11, 'cups 到頂（第 28 關起 12 個）');
ok(T.swapsFor(1) === 5 && T.swapsFor(2) === 7 && T.swapsFor(100) === 60, 'swaps');
ok(Math.abs(T.swapSecFor(50) - T.swapSecFor(20)) < 1e-9 && Math.abs(T.swapSecFor(10.5) - (T.swapSecFor(1) + T.swapSecFor(20)) / 2) < 1e-9 && T.swapSecFor(1) > T.swapSecFor(20), 'swap seconds shrink linearly and clamp');
let pairsSeen = 0, total = 0;
for (let lvl = 1; lvl <= 30; lvl++) {
  const n = T.cupsFor(lvl), cnt = T.swapsFor(lvl);
  for (let k = 0; k < 40; k++) {
    const ball = Math.floor(Math.random() * n);
    const pr = lvl >= 8;
    const { steps, finalBall } = T.makeSwaps(n, cnt, pr, ball);
    total++;
    ok(T.applySwaps(steps, ball) === finalBall, 'finalBall lvl' + lvl);
    let sw = 0;
    steps.forEach(st => {
      sw += st.length;
      ok(st.length === 1 || st.length === 2, 'step len');
      const used = new Set(); st.forEach(p => { ok(p[0] !== p[1], 'a!=b'); ok(!used.has(p[0]) && !used.has(p[1]), 'disjoint'); used.add(p[0]); used.add(p[1]); ok(p[0] < n && p[1] < n, 'range'); });
      if (st.length === 2) pairsSeen++;
    });
    ok(sw === cnt, 'swap count ' + sw + '/' + cnt + ' lvl ' + lvl);
    if (!pr) ok(steps.every(st => st.length === 1), 'no pairs before lvl 8');
  }
}
ok(pairsSeen > 0, 'pairs appear at high levels');
// ───────── V1.34 玩家意見：杯子改成圓環狀擺放（像時鐘）、移動到圓環的另一端、開始移動的時間點錯開 ─────────
// ① 交換的兩個位置要夠遠（環上距離 ≥ max(1, round(n × FAR_FRAC))）；一步兩對時兩條路線盡量不交叉
{ let far = 0, tot = 0, two = 0, cross = 0, twoTot = 0;
  for (let n = 3; n <= 12; n++) for (let k = 0; k < 120; k++) {
    const { steps } = T.makeSwaps(n, 24, true, 0), need = Math.max(1, Math.round(n * T.FAR_FRAC));
    steps.forEach(st => { st.forEach(p => { tot++; if (T.ringDist(n, p[0], p[1]) >= need) far++; }); if (st.length === 2 && n >= 6) { twoTot++; if (T.chordsCross(st[0], st[1])) cross++; } });      // 4、5 個杯子一步兩對時，夠遠的兩對路線一定交叉（見 makeSwaps），不列入統計
  }
  ok(far / tot > 0.99, '交換的兩個位置夠遠（杯子移動到圓環的另一端）：' + (far / tot).toFixed(4));
  ok(cross / twoTot < 0.02, '（6 個杯子以上）兩對同時換時路線（弦）不交叉：交叉比例 ' + (cross / twoTot).toFixed(4));
  console.log('夠遠 ' + (100 * far / tot).toFixed(2) + '%、兩對同時換時路線交叉 ' + (100 * cross / twoTot).toFixed(2) + '%'); }
ok(T.ringDist(12, 0, 11) === 1 && T.ringDist(12, 0, 6) === 6 && T.ringDist(12, 2, 9) === 5 && T.ringDist(3, 0, 2) === 1, 'ringDist（環上距離，繞近的那一邊）');
ok(T.chordsCross([0, 6], [3, 9]) === true && T.chordsCross([0, 6], [1, 5]) === false && T.chordsCross([0, 6], [7, 11]) === false && T.chordsCross([1, 7], [0, 4]) === true, 'chordsCross（交叉的弦）');
ok(T.farEnough(12, 0, 4) && !T.farEnough(12, 0, 3) && T.farEnough(3, 0, 1) && T.farEnough(7, 0, 2) && !T.farEnough(7, 0, 1), 'farEnough');
// ② 圓環版面：各種場地大小、各種杯子數，整圈（含杯子往上長的高度）都放得進場地、相鄰杯子不重疊、第 0 個在 12 點鐘
for (const [FW, FH] of [[472, 520], [472, 600], [472, 660], [400, 520], [440, 560]]) for (let n = 3; n <= 12; n++) {
  const L = T.ringLayout(n, FW, FH), P = []; for (let i = 0; i < n; i++) P.push(T.slotPoint(L, i));
  ok(L.CW > 0 && L.CW <= T.CUP_W_MAX + 1e-9 && L.R >= 30, '杯寬／半徑合理 n=' + n + ' ' + FW + 'x' + FH);
  P.forEach(p => { ok(p.x - L.CW / 2 >= -1e-6 && p.x + L.CW / 2 <= FW + 1e-6 && p.y <= FH + 1e-6 && p.y - L.CH * 1.15 >= -1e-6, '杯子在場地內 n=' + n + ' ' + FW + 'x' + FH + ' (' + p.x.toFixed(0) + ',' + p.y.toFixed(0) + ')'); });
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; if (n > 2) ok(Math.hypot(a.x - b.x, a.y - b.y) >= L.CW - 1e-6, '相鄰杯子不重疊 n=' + n + ' ' + FW + 'x' + FH + '：間距 ' + Math.hypot(a.x - b.x, a.y - b.y).toFixed(1) + ' 杯寬 ' + L.CW.toFixed(1)); }
  ok(Math.abs(P[0].x - FW / 2) < 1e-9 && P[0].y < L.cyBase, '第 0 個位置在 12 點鐘（正上方）');
  if (n % 4 === 0) ok(Math.abs(P[n / 4].y - L.cyBase) < 1e-6 && P[n / 4].x > FW / 2, '順時針：第 n/4 個在 3 點鐘');
  // 整組在場地裡上下大致置中
  const top = Math.min(...P.map(p => p.y)) - L.CH * 1.08, bot = Math.max(...P.map(p => p.y)); ok(Math.abs((top + bot) / 2 - FH / 2) < 1e-6, '整圈上下置中 n=' + n + '：' + ((top + bot) / 2).toFixed(2) + ' vs ' + FH / 2);
}
{ const L12 = T.ringLayout(12, 472, 600), L3 = T.ringLayout(3, 472, 600); ok(L12.CW >= 48, '12 個杯子也看得清楚：杯寬 ' + L12.CW.toFixed(1)); ok(L3.CW >= 80, '3 個杯子杯寬 ' + L3.CW.toFixed(1)); console.log('圓環版面（472×600）：3 杯 杯寬 ' + L3.CW.toFixed(1) + '、半徑 ' + L3.R.toFixed(1) + '；12 杯 杯寬 ' + L12.CW.toFixed(1) + '、半徑 ' + L12.R.toFixed(1)); }
// ③ 交換的路線：兩端點對、中間凸出 ARC_PX、兩個杯子往相反方向凸
{ const A = { x: 100, y: 300 }, B = { x: 380, y: 200 };
  const p0 = T.swapPos(A, B, 0, 1), p1 = T.swapPos(A, B, 1, 1), pm = T.swapPos(A, B, 0.5, 1), qm = T.swapPos(B, A, 0.5, 1);      // 同一對的另一個杯子：方向相反，用同樣的 dir
  ok(Math.abs(p0.x - A.x) < 1e-9 && Math.abs(p0.y - A.y) < 1e-9 && Math.abs(p1.x - B.x) < 1e-9 && Math.abs(p1.y - B.y) < 1e-9, '路線兩端是兩個位置');
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  ok(Math.abs(Math.hypot(pm.x - mid.x, pm.y - mid.y) - T.ARC_PX) < 1e-6 && Math.abs(Math.hypot(qm.x - mid.x, qm.y - mid.y) - T.ARC_PX) < 1e-6, '中間凸出 ' + T.ARC_PX + ' 像素');
  ok((pm.x - mid.x) * (qm.x - mid.x) + (pm.y - mid.y) * (qm.y - mid.y) < 0, '兩個杯子往相反的方向凸，不會正面撞上'); }
// ④ 錯開出發：每個杯子晚 0～STAGGER 才動，u=1 時一定到位（delay ≤ STAGGER → 進度 ≥ 1）
ok(T.STAGGER > 0 && T.STAGGER < 0.6, '錯開比例 ' + T.STAGGER);
for (let i = 0; i < 2000; i++) { const delay = Math.random() * T.STAGGER, u = 1, e = Math.min(1, Math.max(0, (u - delay) / (1 - T.STAGGER))); ok(e === 1, 'u=1 時每個杯子都到位'); const u0 = delay * 0.99, e0 = Math.min(1, Math.max(0, (u0 - delay) / (1 - T.STAGGER))); ok(e0 === 0, '還沒到出發時間就不動'); }
// ⑤ 程式裡的接線
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_cups.js'), 'utf8');
  ok(src.indexOf('delay: Math.random() * STAGGER') > 0 && src.indexOf('(u - m.delay) / (1 - STAGGER)') > 0, '每個杯子各自晚一點出發');
  ok(src.indexOf('ringLayout(n, FW, FH)') > 0 && src.indexOf('slotPoint(layout, si)') > 0 && src.indexOf('sortZ()') > 0, '用圓環版面、依 y 排前後');
  ok(src.indexOf('kit.enter(ID, round)') > 0 && src.indexOf('level: level,') > 0, '進場從最佳關卡 − 4、結算記下關卡');
  ok(/圍成一圈/.test(G.rule) && /最多 12 個/.test(G.rule), '玩法說明提到圍成一圈、最多 12 個'); }
console.log('runs', total, 'pairs', pairsSeen, bad ? 'FAILED ' + bad : 'ALL PASS');
