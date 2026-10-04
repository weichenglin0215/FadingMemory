const { game } = require('./load.js');
const G = game('reaction_hangpic.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 角度正規化：矩形轉 180° 看起來一樣
ok(near(T.norm180(0), 0) && near(T.norm180(90), 90) && near(T.norm180(91), -89) && near(T.norm180(180), 0) && near(T.norm180(-95), 85) && near(T.norm180(45), 45) && near(T.norm180(-180.5), -0.5), 'norm180');
ok(near(T.errDeg(-0.37), 0.37) && near(T.errDeg(180.2), 0.2) && near(T.errDeg(359.9), 0.1, 1e-9), 'errDeg');
// 難度：畫框與牆面的亮度差、起始歪斜角度都線性縮小
ok(near(T.contrast(1), 10) && near(T.contrast(T.ROUNDS), 4) && near(T.contrast(3), 7, 1e-9), 'contrast 10 -> 4');
ok(near(T.devMax(1), 25) && near(T.devMax(T.ROUNDS), 8) && near(T.devMax(3), 16.5, 1e-9), 'start deviation 25 -> 8');
// 手指轉動增益：慢→GAIN_MIN，快→1，中間線性
ok(near(T.gainFor(0), 0.12) && near(T.gainFor(0.25), 1) && near(T.gainFor(5), 1) && near(T.gainFor(0.125), (0.12 + 1) / 2, 1e-9), 'gain');
ok(near(T.angDelta(350, 10), 20) && near(T.angDelta(10, 350), -20), 'angDelta');
// 鏡頭推進計畫（輸入＝紅線到錨點的距離，倍率 1 時的 px）
const zp = d => JSON.stringify(T.zoomPlan(d));
ok(zp(0.001) === '[8,80,800]' && zp(0.2) === '[8,80,800]' && zp(0.5) === '[8,80]' && zp(5) === '[8]', 'zoom plan stages');
ok(zp(40) === '[5]' && zp(300) === '[]', 'zoom plan when error is large: ' + zp(40) + ' ' + zp(300));
ok(near(T.cornerDrop(0), 0) && near(T.cornerDrop(1), 300 * Math.sin(Math.PI / 180), 1e-9) && T.cornerDrop(-2) < 0, 'cornerDrop');
// 出題：牆面不能有水平或垂直線條
let stripes = 0, flowers = 0;
for (let r = 1; r <= 5; r++) {
  for (let k = 0; k < 3000; k++) {
    const R = T.makeRound(r);
    ok(R.wall === 'stripes' || R.wall === 'flowers', 'wall type');
    if (R.wall === 'stripes') { stripes++; const a = Math.abs(R.alpha); ok((a >= 12 && a <= 38) || (a >= 52 && a <= 78), 'stripe angle never near horizontal/vertical: ' + R.alpha.toFixed(1)); } else flowers++;
    const m = Math.abs(R.start);
    ok(m >= 0.6 * T.devMax(r) - 1e-9 && m <= T.devMax(r) + 1e-9, 'start deviation within range');
    ok(near(R.contrast, T.contrast(r)), 'contrast by round');
    ok(R.hue >= 0 && R.hue < 360, 'hue');
  }
}
ok(stripes > 6000 && flowers > 6000, 'both wall types appear ' + stripes + '/' + flowers);
ok(T.rating(0.01) === '神乎其技！' && T.rating(0.1) === '高手！' && T.rating(0.3) === '很準！' && T.rating(0.8) === '不錯喔！' && T.rating(3) === '再試一次，會更準！', 'rating');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
