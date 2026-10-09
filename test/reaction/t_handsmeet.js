const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_handsmeet.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);
const norm = d => { d = ((d % 360) + 360) % 360; return d > 180 ? 360 - d : d; };

for (let i = 0; i < 8000; i++) {
  const q = T.makeRound(rnd);
  ok(q.w1 >= T.W1[0] && q.w1 <= T.W1[1], '長針速度範圍');
  ok(q.w1 / q.w2 >= T.K[0] - 1e-9 && q.w1 / q.w2 <= T.K[1] + 1e-9, '長針是短針的 2～5 倍快');
  ok(q.rel >= 60 - 1e-9, '相對角速度 ≥ 60 度／秒：' + q.rel);
  ok(q.t0 >= T.FIRST_MIN - 1e-9, '第一次重疊在 ' + T.FIRST_MIN + ' 秒之後：' + q.t0);
  ok(q.t0 < T.MAX_S - 1e-9 || q.rel < 60 + 1e-9, '12 秒內至少重疊一次：' + q.t0);
  // 用兩針的實際角度驗證 diffAt：兩針在任意時刻的夾角
  for (const t of [0, 0.37, 1.9, 5.5, 11.9]) ok(near(T.diffAt(q, t), norm(T.handAngle(q.th1, q.w1, t) - T.handAngle(q.th2, q.w2, t)), 1e-6), 'diffAt 與實際角度一致');
  // 重疊時刻夾角 0；每隔 360/rel 秒一次
  ok(T.diffAt(q, q.t0) < 1e-6 && T.diffAt(q, q.t0 + 360 / q.rel) < 1e-6, '重疊時夾角 0');
  ok(near(T.diffAt(q, q.t0 + 180 / q.rel), 180, 1e-6), '兩次重疊的正中間夾角 180');
  // 最近的重疊：離重疊 0.1 秒時，找到的是同一次
  ok(near(T.nearestOverlap(q, q.t0 + 0.01), q.t0, 1e-9) && near(T.nearestOverlap(q, q.t0 - 0.01), q.t0, 1e-9) && near(T.nearestOverlap(q, q.t0 + 360 / q.rel - 0.01), q.t0 + 360 / q.rel, 1e-9), 'nearestOverlap');
  ok(T.nearestOverlap(q, 0) >= q.t0 - 1e-9, '還沒轉的時候最近的重疊不會是負的');
}
// 亂按的期望夾角約 90 度（均勻分布），所以亂按拿不到高分
{ let sum = 0, n = 5000; for (let i = 0; i < n; i++) { const q = T.makeRound(rnd); sum += T.diffAt(q, 2.5 + rnd() * 9); } const m = sum / n; ok(m > 80 && m < 100, '隨便按的平均夾角 ' + m); }
// 人類反應偏差 0.1 秒的夾角：相對速度 150 度／秒 → 15 度；先抓節奏預判才拿得到小角度
{ const q = { d0: 100, rel: 150 }; ok(near(T.diffAt(q, 100 / 150 + 0.1), 15, 1e-6), '晚 0.1 秒、相對 150 度／秒 → 15 度'); }
ok(T.rating(0.2) !== T.rating(1) && T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(8) && T.rating(8) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
