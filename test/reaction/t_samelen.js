const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_samelen.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
for (let i = 0; i < 5000; i++) {
  const c = T.makeRound(rnd);
  ok(c.L >= T.LEN_MIN && c.L <= T.LEN_MAX, '長度範圍');
  ok(c.x >= T.X_MIN && c.x <= T.X_MAX, 'x 範圍');
  ok(T.TOP_Y + c.L < 470, '垂直線下端不會碰到橫線區：' + (T.TOP_Y + c.L));
  ok(T.START.x + c.L <= T.START.x + T.MAX_DRAW, '橫線畫得下（螢幕寬 472）：' + (T.START.x + c.L));
}
ok(T.START.x + T.MAX_DRAW <= 472, '最長橫線不超出舞台');
ok(T.lenFor(0) === 0 && T.lenFor(T.START.x + 100) === 100 && T.lenFor(9999) === T.MAX_DRAW, 'lenFor 夾住');
ok(T.errPct(200, 200) === 0 && Math.abs(T.errPct(180, 200) - 10) < 1e-9 && Math.abs(T.errPct(220, 200) - 10) < 1e-9, 'errPct');
ok(T.rating(0.1) !== T.rating(1) && T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(8) && T.rating(8) !== T.rating(20), '評語分級');
ok(T.errPct(T.MAX_DRAW, T.LEN_MIN) <= G.score.max, '最壞誤差在排行榜範圍內');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
