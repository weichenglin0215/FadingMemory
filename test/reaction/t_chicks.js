const { game } = require('./load.js');
const G = game('reaction_chicks.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 25) console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線（常數是使用者可以自己調的，只驗線性、會變難、之後固定）
ok(T.kFor(1) < T.kFor(T.LEVEL_RAMP) && T.totalFor(1) < T.totalFor(T.LEVEL_RAMP) && T.kFor(99) === T.kFor(T.LEVEL_RAMP) && T.totalFor(99) === T.totalFor(T.LEVEL_RAMP), 'targets and total grow then stay');
ok(T.speedFor(1) < T.speedFor(T.LEVEL_RAMP) && T.moveFor(1) <= T.moveFor(T.LEVEL_RAMP) && T.moveFor(99) === T.moveFor(T.LEVEL_RAMP) && near(T.speedFor(8) - T.speedFor(7), T.speedFor(3) - T.speedFor(2), 1e-9), 'speed ramps linearly');

const FW = 468, FH = 560;
let minStop = 1e9, minStart = 1e9, outOfBounds = 0, legsShort = 0, legsTotal = 0, wide = 0, chickN = 0, lenRatio = [];
for (let lv = 1; lv <= 30; lv++) {
  for (let k = 0; k < 40; k++) {
    const S = T.makeLevel(lv, FW, FH);
    ok(S.chicks.length === T.totalFor(lv), 'chick count lv' + lv);
    ok(S.targets.length === T.kFor(lv) && new Set(S.targets).size === S.targets.length && S.targets.every(t => t >= 0 && t < S.chicks.length), 'targets valid');
    ok(near(S.tMove, T.moveFor(lv)), 'stop time is the planned move time');
    S.chicks.forEach(c => {
      const p0 = T.posAt(c, 0), pEnd = T.posAt(c, S.tMove + 1), pStop = c.pts[c.pts.length - 1];
      ok(near(p0.x, c.x0, 1e-9) && near(p0.y, c.y0, 1e-9), 'starts at (x0,y0)');
      ok(near(pEnd.x, pStop[0], 1e-9) && near(pEnd.y, pStop[1], 1e-9) && near(T.posAt(c, S.tMove).x, pStop[0], 1e-9), 'stops at the last point and stays');
      for (let t = 0; t <= S.tMove; t += 0.25) { const p = T.posAt(c, t); if (p.x < 10 || p.x > FW - 10 || p.y < 10 || p.y > FH - 10) outOfBounds++; }
      /* 折線：每一段（除了最後一段）至少 MIN_LEG；整條不超過 15 個點 */
      for (let i = 1; i < c.pts.length - 1; i++) { legsTotal++; if (c.cum[i] - c.cum[i - 1] < T.MIN_LEG - 1e-9) legsShort++; }
      ok(c.pts.length <= 16, 'few legs');
      /* 路線長度 ≥ 起點到終點的直線距離；大多數接近 速度×移動秒數 */
      const direct = Math.hypot(pStop[0] - c.x0, pStop[1] - c.y0); ok(c.len >= direct - 1e-6, 'path at least as long as the straight line');
      lenRatio.push(c.len / (T.speedFor(lv) * T.moveFor(lv)));
      const xs = c.pts.map(p => p[0]), ys = c.pts.map(p => p[1]);
      chickN++; if (Math.max(...xs) - Math.min(...xs) > FW * 0.35 || Math.max(...ys) - Math.min(...ys) > FH * 0.35) wide++;
    });
    /* 起點互不重疊（比小雞本身大）；停止時任兩隻 ≥ MIN_STOP_DIST */
    minStart = Math.min(minStart, T.minDist(S.chicks, 0)); minStop = Math.min(minStop, T.minDist(S.chicks, S.tMove));
  }
}
ok(minStart >= T.CHICK - 1e-9, 'chicks never overlap at the start: min distance ' + minStart.toFixed(1) + ' (chick size ' + T.CHICK + ')');
ok(minStop >= T.MIN_STOP_DIST - 1e-9, 'stop distance ' + minStop.toFixed(1));
ok(outOfBounds === 0, 'chicks stay in the yard (' + outOfBounds + ' samples outside)');
ok(legsShort === 0, 'every leg (but the last) is at least MIN_LEG long');
ok(wide / chickN > 0.9, 'paths cover a wide area: ' + (wide / chickN * 100).toFixed(0) + '% of chicks move more than 35% of the yard');
const meanRatio = lenRatio.reduce((a, b) => a + b, 0) / lenRatio.length; ok(meanRatio > 0.7 && meanRatio < 1.4, 'path length ≈ speed × time (mean ratio ' + meanRatio.toFixed(2) + ')');
console.log('min start distance', minStart.toFixed(1), 'min stop distance', minStop.toFixed(1), 'wide-moving chicks', (wide / chickN * 100).toFixed(0) + '%', 'length ratio', meanRatio.toFixed(2));
// 平均速度隨關卡上升，而且不會退化成原地不動
function avgSpeed(lv) { let sum = 0, n = 0; for (let k = 0; k < 40; k++) { const S = T.makeLevel(lv, FW, FH); S.chicks.forEach(c => { for (let t = 0; t < S.tMove - 0.05; t += 0.1) { const a = T.posAt(c, t), b = T.posAt(c, t + 0.05); sum += Math.hypot(b.x - a.x, b.y - a.y) / 0.05; n++; } }); } return sum / n; }
const s1 = avgSpeed(1), sN = avgSpeed(T.LEVEL_RAMP); ok(sN > s1 * 1.5 && s1 > 30, 'average speed rises: ' + s1.toFixed(0) + ' -> ' + sN.toFixed(0));
// 終點格子與起點
for (let k = 0; k < 100; k++) { const sp = T.stopSpots(T.totalFor(T.LEVEL_RAMP), FW, FH, null); ok(sp && sp.length === T.totalFor(T.LEVEL_RAMP), 'enough stop spots'); }
// 判定：只有「還沒點過的星星小雞」算命中；其他任何東西都是 miss
ok(T.judgeTap([1, 3], [], 1) === 'hit' && T.judgeTap([1, 3], [1], 1) === 'again' && T.judgeTap([1, 3], [], 2) === 'miss' && T.judgeTap([1, 3], [], null) === 'miss' && T.judgeTap([], [], 0) === 'miss', 'judgeTap');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
