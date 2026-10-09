// 一半的人：圓形數量、重疊限制、剛好一半的範圍夠寬、越後面越不平均
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_halfcrowd.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const W = 472, H = 450, SEED = seedOf(20261010), rnd = rng(SEED);
ok(Math.abs(T.skewAt(1)) < 1e-9 && Math.abs(T.skewAt(14) - T.SKEW_MAX) < 1e-9 && T.skewAt(30) === T.skewAt(14), '不平均程度 0 → ' + T.SKEW_MAX);
ok(Math.abs(T.gapAt(1) - 9) < 1e-9 && Math.abs(T.gapAt(14) - 3) < 1e-9, '容許寬度 9 → 3');
ok(Math.abs(T.minDist(15, 15) - 12) < 1e-9, '兩個半徑 15 的圓，圓心距離至少 12（重疊 60%）');
ok(T.countLeft([{ x: 1 }, { x: 5 }, { x: 5 }, { x: 9 }], 5) === 1, '圓心剛好在線上算右邊');
const t0 = Date.now(); let slow = 0;
const sk = {};
for (let lv = 1; lv <= 20; lv++) {
  let medOff = 0, minGapSeen = 1e9; const NQ = lv % 3 === 1 ? 12 : 6;
  for (let k = 0; k < NQ; k++) {
    const t1 = Date.now(), q = T.makeLevel(lv, W, H, rnd); if (Date.now() - t1 > 400) slow++;
    ok(q.N % 2 === 0 && q.N >= T.N_RANGE[0] && q.N <= T.N_RANGE[1] && q.circles.length === q.N, '個數是 80～120 的偶數 lv' + lv + ' N=' + q.N + ' len=' + q.circles.length);
    // 重疊限制與邊界
    let worst = 1e9;
    for (let i = 0; i < q.N; i++) {
      const a = q.circles[i];
      ok(a.r >= T.R_RANGE[0] && a.r <= T.R_RANGE[1] && a.x >= T.EDGE + a.r - 1e-6 && a.x <= W - T.EDGE - a.r + 1e-6 && a.y >= T.EDGE + a.r - 1e-6 && a.y <= H - T.EDGE - a.r + 1e-6, '圓在範圍內');
      for (let j = i + 1; j < q.N; j++) { const b = q.circles[j], d = Math.hypot(a.x - b.x, a.y - b.y); worst = Math.min(worst, d - T.minDist(a.r, b.r)); }
    }
    ok(worst >= -1e-6, '重疊不超過 60%（最擠的一對還有 ' + worst.toFixed(3) + ' px 餘裕）');
    // 剛好一半的範圍
    const xs = q.circles.map(c => c.x).sort((a, b) => a - b);
    ok(Math.abs(q.lo - xs[q.N / 2 - 1]) < 1e-9 && Math.abs(q.hi - xs[q.N / 2]) < 1e-9, 'lo／hi 是第 N/2、N/2+1 個圓心');
    ok(q.gap >= T.gapAt(lv) - 1e-6, '容許寬度夠寬 lv' + lv + ' gap=' + q.gap.toFixed(2) + ' need=' + T.gapAt(lv).toFixed(2));
    const mid = (q.lo + q.hi) / 2; ok(T.countLeft(q.circles, mid) === q.N / 2, '放在範圍中間，左右剛好各一半');
    ok(T.countLeft(q.circles, (xs[q.N / 2 - 2] + q.lo) / 2) === q.N / 2 - 1 && T.countLeft(q.circles, (q.hi + xs[q.N / 2 + 1]) / 2) === q.N / 2 + 1, '範圍外左右各差一個');
    medOff += Math.abs(mid - W / 2); minGapSeen = Math.min(minGapSeen, q.gap);
  }
  sk[lv] = medOff / NQ;
}
console.log('剛好一半的位置離畫面中央的平均距離（px）：lv1', sk[1].toFixed(1), 'lv5', sk[5].toFixed(1), 'lv10', sk[10].toFixed(1), 'lv14', sk[14].toFixed(1), 'lv20', sk[20].toFixed(1), '；出題耗時 ' + (Date.now() - t0) + ' ms，超過 0.4 秒的 ' + slow + ' 次');
ok(sk[14] > sk[1] + 30 && sk[20] > 40, '越後面分布越不平均（中位數離中央越遠）');
ok(slow === 0, '出題夠快');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
