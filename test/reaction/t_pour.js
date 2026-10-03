const { game } = require('./load.js');
const G = game('reaction_pour.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const rng = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
for (let k = 0; k < 500; k++) {
  const p = T.makeProfile(rng);
  ok(p.a < 1, 'a<1 so flow positive');
  // 單調上升
  let prev = -1; for (let t = 0; t <= 8; t += 0.05) { const L = T.levelAt(p, t); ok(L >= prev - 1e-12, 'monotonic'); prev = L; }
  const tf = T.timeToFull(p);
  ok(Math.abs(T.levelAt(p, tf) - 1) < 1e-9, 'timeToFull');
  ok(tf > 2.2 && tf < 8.5, 'tf range ' + tf);
  // 「數秒」作弊：用平均流量估算 0.8 的時間 vs 實際
  const naive = 0.8 * p.fill; let lo = 0, hi = tf; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (T.levelAt(p, m) < 0.8) lo = m; else hi = m; }
  if (k < 8) console.log('fill', p.fill.toFixed(2), 'tFull', tf.toFixed(2), 'naive 80% time', naive.toFixed(2), 'real 80% time', lo.toFixed(2), 'diff%', ((lo - naive) / (tf) * 100).toFixed(1) + '% of full');
}
// 鏡頭視窗
ok(T.zoomWindow(0) === 6, 'min win'); ok(Math.abs(T.zoomWindow(1) - 10.56) < 1e-9, 'win 1%'); ok(T.zoomWindow(100) === 560, 'max win');
ok(T.stepFor(560) === 20 || T.stepFor(560) === 20, 'step');
for (const e of [0, 0.05, 0.3, 1, 3, 8, 20]) { const w = T.zoomWindow(e); console.log('err', e, 'win', w.toFixed(2), 'step', T.stepFor(w), 'zoomx', (560 / w).toFixed(1)); }
console.log(T.rating(0.05), T.rating(0.3), T.rating(1), T.rating(3), T.rating(8), T.rating(15));
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
