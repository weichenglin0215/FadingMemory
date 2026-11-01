const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_samelen.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
// V1.39.0：題目線長度是遊戲區寬度的 70%～90%、而且是斜的（角度、位置隨機），整條線都在題目區內
let up = 0, down = 0, minL = 1e9, maxL = 0, minDeg = 1e9, maxDeg = 0;
for (let i = 0; i < 20000; i++) {
  const W = T.STAGE_W, c = T.makeRound(rnd, W);
  ok(c.L >= W * 0.7 - 1e-9 && c.L <= W * 0.9 + 1e-9, '長度是寬度的 70%～90%：' + (c.L / W).toFixed(3));
  const deg = Math.abs(c.a) * 180 / Math.PI;
  ok(deg >= T.ANGLE_MIN - 1e-9 && deg <= T.ANGLE_MAX + 1e-9, '角度範圍：' + deg.toFixed(1));
  ok(Math.cos(c.a) > 0, '左端在左、右端在右');
  const x2 = c.x + c.L * Math.cos(c.a), y2 = c.y + c.L * Math.sin(c.a);
  ok(Math.min(c.x, x2) >= T.X_PAD - 1e-9 && Math.max(c.x, x2) <= W - T.X_PAD + 1e-9, '整條線在左右邊界內：' + c.x.toFixed(1) + '～' + x2.toFixed(1));
  ok(Math.min(c.y, y2) >= T.Y_TOP - 1e-9 && Math.max(c.y, y2) <= T.Y_BOT + 1e-9, '整條線在題目區內（不碰到下面的橫線區）：' + c.y.toFixed(1) + '～' + y2.toFixed(1));
  ok(T.START.x + c.L <= T.START.x + T.MAX_DRAW, '橫線畫得下：' + (T.START.x + c.L));
  if (c.a < 0) up++; else down++;
  minL = Math.min(minL, c.L / W); maxL = Math.max(maxL, c.L / W); minDeg = Math.min(minDeg, deg); maxDeg = Math.max(maxDeg, deg);
}
ok(up > 8000 && down > 8000, '往右上、往右下各一半（' + up + '／' + down + '）');
ok(minL < 0.71 && maxL > 0.89 && minDeg < 17 && maxDeg > 55, '長度與角度真的有用到整個範圍（' + minL.toFixed(3) + '～' + maxL.toFixed(3) + '、' + minDeg.toFixed(1) + '°～' + maxDeg.toFixed(1) + '°）');
// 舞台比預設窄或寬時，長度仍照比例
{ const c1 = T.makeRound(rnd, 400), c2 = T.makeRound(rnd, 600); ok(c1.L >= 280 - 1e-9 && c1.L <= 360 + 1e-9 && c2.L >= 420 - 1e-9 && c2.L <= 540 + 1e-9, '長度跟著傳入的寬度走'); }
ok(T.START.x + T.MAX_DRAW <= 472, '最長橫線不超出舞台');
ok(T.lenFor(0) === 0 && T.lenFor(T.START.x + 100) === 100 && T.lenFor(9999) === T.MAX_DRAW, 'lenFor 夾住');
ok(T.errPct(200, 200) === 0 && Math.abs(T.errPct(180, 200) - 10) < 1e-9 && Math.abs(T.errPct(220, 200) - 10) < 1e-9, 'errPct');
ok(T.rating(0.1) !== T.rating(1) && T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(8) && T.rating(8) !== T.rating(20), '評語分級');
ok(T.errPct(T.MAX_DRAW, T.STAGE_W * T.LEN_MIN_PCT) <= G.score.max, '最壞誤差在排行榜範圍內');
ok(T.MAX_DRAW >= T.STAGE_W * T.LEN_MAX_PCT, '橫線最長要比題目線最長的長度還長（才畫得出一樣長的）');
// 端點記號：線轉成橫放時兩個記號都要垂直（V1.25：以前左邊那個一直是水平的）；線還是垂直時兩個記號是水平的
{ const near = (a, b) => Math.abs(a - b) < 1e-9;
  const v = T.capEnds(Math.PI / 2, 200); ok(near(v.t[1], v.t[3]) && near(v.b[1], v.b[3]) && !near(v.t[0], v.t[2]), '線垂直時：兩個記號都是水平的');
  const hz = T.capEnds(0, 200); ok(near(hz.t[0], hz.t[2]) && near(hz.b[0], hz.b[2]) && !near(hz.t[1], hz.t[3]) && !near(hz.b[1], hz.b[3]), '線橫放時：左右兩個記號都是垂直的（左邊的不能是水平）');
  ok(near(hz.b[0], 200) && near(hz.t[0], 0), '橫放時下端記號在 x＝線長、上端記號在 x＝0');
  for (let a = 0; a <= Math.PI / 2; a += 0.1) { const e = T.capEnds(a, 150); const dxl = Math.cos(a), dyl = Math.sin(a); ['t', 'b'].forEach(k => { const c = e[k]; ok(Math.abs((c[2] - c[0]) * dxl + (c[3] - c[1]) * dyl) < 1e-9, '記號永遠垂直於線 a=' + a.toFixed(1)); ok(near(Math.hypot(c[2] - c[0], c[3] - c[1]), 2 * T.CAP), '記號長度固定'); }); } }
const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/games/reaction_samelen.css'), 'utf8');
ok(/\.samelen-ref \{[^}]*stroke-width: 24;/.test(css) && /\.samelen-mine \{[^}]*stroke-width: 24;/.test(css), '橘色線與藍色線的粗細是原本 8 的 300%（24）');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
