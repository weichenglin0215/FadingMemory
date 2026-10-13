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
// 端點記號：線轉成橫放時兩個記號都要垂直（V1.25：以前左邊那個一直是水平的）；線還是垂直時兩個記號是水平的
{ const near = (a, b) => Math.abs(a - b) < 1e-9;
  const v = T.capEnds(Math.PI / 2, 200); ok(near(v.t[1], v.t[3]) && near(v.b[1], v.b[3]) && !near(v.t[0], v.t[2]), '線垂直時：兩個記號都是水平的');
  const hz = T.capEnds(0, 200); ok(near(hz.t[0], hz.t[2]) && near(hz.b[0], hz.b[2]) && !near(hz.t[1], hz.t[3]) && !near(hz.b[1], hz.b[3]), '線橫放時：左右兩個記號都是垂直的（左邊的不能是水平）');
  ok(near(hz.b[0], 200) && near(hz.t[0], 0), '橫放時下端記號在 x＝線長、上端記號在 x＝0');
  for (let a = 0; a <= Math.PI / 2; a += 0.1) { const e = T.capEnds(a, 150); const dxl = Math.cos(a), dyl = Math.sin(a); ['t', 'b'].forEach(k => { const c = e[k]; ok(Math.abs((c[2] - c[0]) * dxl + (c[3] - c[1]) * dyl) < 1e-9, '記號永遠垂直於線 a=' + a.toFixed(1)); ok(near(Math.hypot(c[2] - c[0], c[3] - c[1]), 2 * T.CAP), '記號長度固定'); }); } }
const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction3.css'), 'utf8');
ok(/\.sl-ref \{[^}]*stroke-width: 24;/.test(css) && /\.sl-mine \{[^}]*stroke-width: 24;/.test(css), '橘色線與藍色線的粗細是原本 8 的 300%（24）');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
