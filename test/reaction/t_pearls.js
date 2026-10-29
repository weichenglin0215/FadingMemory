// 吸珍珠（pearls，企劃 370）的純函式檢查：難度線性、珍珠時間表（成串、第 N 顆在串尾、放手窗口 ≥ 保證值）、判定（少／多／剛好）、珍珠位置、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_pearls.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261208), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(T.targetFor(1) === T.TARGET[0] && T.targetFor(T.RAMP_LEVELS) === T.TARGET[1] && T.targetFor(99) === T.TARGET[1], '目標顆數 ' + T.TARGET + '（使用者企劃 5 → 25）');
ok(near(T.pClusterFor(1), T.P_CLUSTER[0]) && near(T.pClusterFor(T.RAMP_LEVELS), T.P_CLUSTER[1]), '成串機率 ' + T.P_CLUSTER);
ok(T.clusterMaxFor(1) === T.CLUSTER_MAX[0] && T.clusterMaxFor(T.RAMP_LEVELS) === T.CLUSTER_MAX[1], '最大一串 ' + T.CLUSTER_MAX);
ok(near(T.gapSingleFor(1), T.GAP_SINGLE[0]) && near(T.gapSingleFor(T.RAMP_LEVELS), T.GAP_SINGLE[1]) && near(T.gapInFor(1), T.GAP_IN[0]) && near(T.gapInFor(T.RAMP_LEVELS), T.GAP_IN[1]) && near(T.minWinFor(1), T.MIN_WIN[0]) && near(T.minWinFor(T.RAMP_LEVELS), T.MIN_WIN[1]), '間隔／窗口');
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.targetFor(n) >= T.targetFor(n - 1) && T.pClusterFor(n) >= T.pClusterFor(n - 1) && T.clusterMaxFor(n) >= T.clusterMaxFor(n - 1) && T.gapSingleFor(n) <= T.gapSingleFor(n - 1) && T.gapInFor(n) <= T.gapInFor(n - 1) && T.minWinFor(n) <= T.minWinFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.minWinFor(n - 1) - T.minWinFor(n)); ok(Math.max(...d) - Math.min(...d) <= 0.002, '窗口線性縮短：每關 −' + Math.min(...d).toFixed(4) + '～−' + Math.max(...d).toFixed(4)); }
ok(T.minWinFor(T.RAMP_LEVELS) >= 0.12, '到頂的放手窗口 ' + T.minWinFor(T.RAMP_LEVELS) + ' 秒（人放得開）');
ok(T.gapInFor(T.RAMP_LEVELS) > 0.04 && T.gapInFor(T.RAMP_LEVELS) * 1.2 * 1 > 0, '串內間隔夠大，珍珠不會疊在一起');

// ── 分串 ──
for (let i = 0; i < 3000; i++) { const total = 1 + Math.floor(rnd() * 30), pc = rnd(), mx = 1 + Math.floor(rnd() * 4), cl = T.splitClusters(total, pc, mx, rnd); ok(cl.reduce((s, v) => s + v, 0) === total && cl.every(v => v >= 1 && v <= Math.max(1, mx)), '分串的總和 = ' + total + '，每串 1～' + mx); }
{ let multi = 0, tot = 0; for (let i = 0; i < 4000; i++) { const cl = T.splitClusters(20, 0.8, 4, rnd); tot += cl.length; multi += cl.filter(v => v > 1).length; } ok(multi / tot > 0.5, '成串機率高時多數是多顆串'); }
{ const cl = T.splitClusters(15, 0, 4, rnd); ok(cl.length === 15 && cl.every(v => v === 1), 'pCluster=0：全部單顆'); }

// ── 出題：全部關卡掃一遍 ──
const ST = { n: 0, minWinSeen: 99, firstMin: 99, firstMax: 0, maxEnd: 0, nAtEnd: 0, spanMax: 0, gapInMin: 99 };
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 120; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  const n = T.targetFor(lv);
  ok(q.n === n && q.total === q.arrive.length && q.total >= n + T.EXTRA[0] && q.total <= n + T.EXTRA[1], '珍珠總數 ' + q.total + ' = N ' + n + ' ＋ 額外 ' + T.EXTRA);
  ok(q.clusters.reduce((s, v) => s + v, 0) === q.total, '分串總和 = 總數');
  let acc = 0, boundaryAtN = false; q.clusters.forEach(c => { acc += c; if (acc === n) boundaryAtN = true; }); ok(boundaryAtN, '第 N 顆剛好是一串的結尾');
  ok(q.clusters.every(c => c >= 1 && c <= T.clusterMaxFor(lv)), '每串不超過 ' + T.clusterMaxFor(lv));
  ok(q.arrive[0] >= T.FIRST_AT[0] - 1e-9 && q.arrive[0] <= T.FIRST_AT[1] + 1e-9 && q.arrive[0] > T.TRAVEL_S, '第一顆在 ' + T.FIRST_AT + ' 秒（大於回程 ' + T.TRAVEL_S + '）'); ST.firstMin = Math.min(ST.firstMin, q.arrive[0]); ST.firstMax = Math.max(ST.firstMax, q.arrive[0]);
  for (let i = 1; i < q.arrive.length; i++) ok(q.arrive[i] > q.arrive[i - 1], '到達時間遞增');
  // 串內／串間間隔
  let pos = 0; q.clusters.forEach((c, ci) => { for (let k = 0; k < c; k++, pos++) { if (pos === 0) continue; const gap = q.arrive[pos] - q.arrive[pos - 1];
      if (k > 0) { ok(gap >= T.gapInFor(lv) * T.GAP_JITTER[0] - 2e-4 && gap <= T.gapInFor(lv) * T.GAP_JITTER[1] + 2e-4, '串內間隔 ' + gap.toFixed(3)); ST.gapInMin = Math.min(ST.gapInMin, gap); }
      else if (pos === n) ok(gap >= T.minWinFor(lv) - 2e-4 && gap <= T.minWinFor(lv) * 1.5 + 2e-4, '第 N 顆之後的窗口 ' + gap.toFixed(3) + ' ≥ ' + T.minWinFor(lv));
      else ok(gap >= T.gapSingleFor(lv) * T.GAP_JITTER[0] - 2e-4 && gap <= T.gapSingleFor(lv) * T.GAP_JITTER[1] + 2e-4, '串間間隔 ' + gap.toFixed(3)); } });
  ok(near(q.winStart, q.arrive[n - 1]) && near(q.winEnd, q.arrive[n]) && q.winEnd - q.winStart >= T.minWinFor(lv) - 2e-4, '放手窗口 = [arrive[N−1], arrive[N]) 且 ≥ minWin');
  ST.minWinSeen = Math.min(ST.minWinSeen, (q.winEnd - q.winStart) - T.minWinFor(lv)); ST.maxEnd = Math.max(ST.maxEnd, q.arrive[q.total - 1]);
  // 在窗口裡放手一定剛好 N 顆；窗口前一顆不到；窗口後多一顆
  const mid = (q.winStart + q.winEnd) / 2; ok(T.countAt(q, mid) === n && T.judgeRelease(q, mid).result === 'ok', '窗口中間放手＝剛好 N 顆');
  ok(T.countAt(q, q.winStart - 0.001) === n - 1 && T.judgeRelease(q, q.winStart - 0.001).result === 'few', '窗口前放手＝少一顆');
  ok(T.countAt(q, q.winEnd + 0.001) === n + 1 && T.judgeRelease(q, q.winEnd + 0.001).result === 'many', '窗口後放手＝多一顆');
  ok(T.countAt(q, q.winStart) === n && T.countAt(q, q.winEnd - 1e-6) === n && T.countAt(q, q.winEnd) === n + 1, '窗口邊界：到達時間當下算已經到達');
}
console.log('共 ' + ST.n + ' 關；第一顆 ' + ST.firstMin.toFixed(2) + '～' + ST.firstMax.toFixed(2) + ' 秒；最久一關珍珠全部衝完要 ' + ST.maxEnd.toFixed(1) + ' 秒；串內最小間隔 ' + ST.gapInMin.toFixed(3) + ' 秒');
ok(ST.minWinSeen >= -2e-4, '每關的窗口都 ≥ 保證值');
ok(ST.maxEnd < 14, '一關不會按住太久：' + ST.maxEnd.toFixed(1) + ' 秒');

// ── 判定與位置 ──
{ const q = { n: 3, arrive: [0.5, 0.6, 1.0, 1.5, 1.6], total: 5 };
  ok(T.countAt(q, 0) === 0 && T.countAt(q, 0.49) === 0 && T.countAt(q, 0.5) === 1 && T.countAt(q, 0.6) === 2 && T.countAt(q, 1.0) === 3 && T.countAt(q, 1.49) === 3 && T.countAt(q, 9) === 5, 'countAt');
  ok(T.judgeRelease(q, 1.2).result === 'ok' && T.judgeRelease(q, 0.7).result === 'few' && T.judgeRelease(q, 0.7).diff === -1 && T.judgeRelease(q, 1.55).result === 'many' && T.judgeRelease(q, 1.55).diff === 1 && T.judgeRelease(q, 0).count === 0, 'judgeRelease');
  ok(near(T.pearlPos(q, 2, 1.0 - T.TRAVEL_S), 0) && near(T.pearlPos(q, 2, 1.0 - T.TRAVEL_S / 2), 0.5) && T.pearlPos(q, 2, 1.0) === 1 && T.pearlPos(q, 2, 0) === 0 && T.pearlPos(q, 2, 5) === 1, 'pearlPos');
  // 位置在 T 增加時單調不減；同一時間在吸管裡的珍珠數（0<pos<1）不會太多
  let maxIn = 0; for (let t = 0; t <= 2; t += 0.005) { let inside = 0, prevPos = []; for (let i = 0; i < 5; i++) { const p = T.pearlPos(q, i, t); if (p > 0 && p < 1) inside++; } maxIn = Math.max(maxIn, inside); } ok(maxIn <= 4, '吸管裡同時的珍珠數 ' + maxIn); }
// 一關的實際情況：吸管裡同時最多幾顆（成串）、兩顆之間的最小距離（不能重疊）
{ let worstGap = 99, maxIn = 0; for (let i = 0; i < 400; i++) { const q = T.makeLevel(20, rnd); for (let k = 1; k < q.arrive.length; k++) worstGap = Math.min(worstGap, q.arrive[k] - q.arrive[k - 1]); for (let t = 0; t < q.arrive[q.total - 1]; t += 0.01) { let inside = 0; for (let j = 0; j < q.total; j++) { const p = T.pearlPos(q, j, t); if (p > 0 && p < 1) inside++; } maxIn = Math.max(maxIn, inside); } }
  console.log('到頂關卡：珍珠最小間隔 ' + worstGap.toFixed(3) + ' 秒，吸管裡同時最多 ' + maxIn + ' 顆'); const L = 276, PD = 30, speed = (L - PD) / T.TRAVEL_S; ok(worstGap * speed >= PD * 1.2, '最擠的兩顆珍珠間距 ' + (worstGap * speed).toFixed(1) + ' px ≥ 珍珠直徑 ' + PD + ' px（不會疊在一起）'); }
// 說明
{ const q = { n: 10 }; ok(T.whyText({ result: 'ok', count: 10, diff: 0 }, q) === '剛剛好 10 顆！' && T.whyText({ result: 'many', count: 11, diff: 1 }, q) === '吸了 11 顆，要 10 顆——多了 1 顆' && T.whyText({ result: 'few', count: 8, diff: -2 }, q) === '吸了 8 顆，要 10 顆——少了 2 顆', 'whyText（含使用者企劃的「吸了 11 顆」）'); }
// 亂按的成功率：隨機放手時間（在整個序列範圍內）剛好 N 顆的機率很低，且越後面越低
function randomWin(lv) { let w = 0, M = 3000; for (let i = 0; i < M; i++) { const q = T.makeLevel(lv, rnd), t = rnd() * (q.arrive[q.total - 1] + 0.5); if (T.judgeRelease(q, t).result === 'ok') w++; } return w / M; }
{ const a = randomWin(1), b = randomWin(10), c = randomWin(20); console.log('亂放手的成功率：' + [a, b, c].map(v => (100 * v).toFixed(1) + '%').join(' → ')); ok(a < 0.2 && b < 0.1 && c < 0.07 && a > b && b > c * 0.9, '亂放手很難剛好對'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_pearls.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4000/.test(src) && /showRow\(r\)/.test(src) && /prl-rowp--extra/.test(src) && /prl-rowp--n/.test(src), '失敗：嘴裡的珍珠排成一排編號、第 N 顆標綠、多的標紅、停格 2 秒以上');
  ok(/kit\.hold\(holdEl/.test(src) && /judgeRelease\(q, T\)/.test(src) && /api\.my\.onDispose/.test(src) && /api\.timer\(PRESS_LIMIT_S/.test(src), '按住用 kit.hold、放手用 judgeRelease、有限時、收尾 destroy');
  ok(/api\.solve = /.test(src) && /api\.wrong = /.test(src) && /armed/.test(src) && /function begin\(\)/.test(src), 'solve／wrong 只排一次、動畫迴圈在按下去時才開始');
  ok(/\.prl-pearl \{[^}]*var\(--prl-pearl\)/.test(css) && /\.prl-rowp--n \{[^}]*var\(--c-ok\)/.test(css) && /\.prl-rowp--extra \{[^}]*var\(--c-bad-light\)/.test(css) && /\.prl-hold \{[^}]*var\(--prl-hold\)/.test(css), '珍珠、對錯標記、按鈕用 CSS 變數');
  ok(boot.indexOf("'js/reaction_pearls.js'") > 0 && /放手就停/.test(G.rule) && /一串/.test(G.rule), 'boot.js 有載入、玩法說明提到放手就停與成串'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
