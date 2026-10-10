const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sneakmove.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261020); const rnd = rng(SEED);

ok(near(T.speedFor(1), 20) && near(T.speedFor(T.RAMP_LEVELS), 2) && near(T.speedFor(60), 2), '速度 20 → 2');
for (let l = 2; l <= 60; l++) ok(T.speedFor(l) <= T.speedFor(l - 1) + 1e-12, '速度單調 ' + l);
ok(near(T.speedFor(13), 11), '中點（線性）');
ok(T.TIME_S === 6 && T.N_DOTS === 20, '6 秒、20 個點');
ok(near(T.segDist(0, 5, -10, 0, 10, 0), 5) && near(T.segDist(15, 0, -10, 0, 10, 0), 5) && near(T.segDist(0, 0, 0, 0, 0, 0), 0), 'segDist');
// 整關驗證：位置、間距、路徑清爽、全部在界內
const W = 472, H = 632;
for (let i = 0; i < 600; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, W, H, rnd);
  ok(q.dots.length === 20 && q.mover >= 0 && q.mover < 20, '點數與 mover');
  q.dots.forEach((d, a) => {
    ok(d.x >= T.MARGIN - 1e-9 && d.x <= W - T.MARGIN + 1e-9 && d.y >= T.MARGIN - 1e-9 && d.y <= H - T.MARGIN + 1e-9, '點在界內');
    for (let b = a + 1; b < 20; b++) ok(Math.hypot(d.x - q.dots[b].x, d.y - q.dots[b].y) >= T.MIN_GAP - 1e-9, '間距 ' + a + ',' + b);
  });
  ok(near(Math.hypot(q.dx, q.dy), 1, 1e-9), '方向是單位向量');
  const end = T.posAt(q, T.TIME_S);
  ok(end.x >= T.MARGIN - 1e-6 && end.x <= W - T.MARGIN + 1e-6 && end.y >= T.MARGIN - 1e-6 && end.y <= H - T.MARGIN + 1e-6, '終點在界內');
  ok(near(Math.hypot(end.x - q.x0, end.y - q.y0), q.speed * T.TIME_S, 1e-6), '6 秒走的距離＝速度×6');
  q.dots.forEach((d, k) => { if (k !== q.mover) ok(T.segDist(d.x, d.y, q.x0, q.y0, end.x, end.y) >= T.PATH_CLEAR - 1e-6, '路徑離別的點夠遠 ' + k); });
  ok(near(q.speed, T.speedFor(lv)), '速度');
}
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
