const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_focus.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
// 模糊：焦點處最小（BLUR_BASE），兩側對稱、遠離單調變大
ok(Math.abs(T.blurPx(0) - T.BLUR_BASE) < 1e-12, '焦點處的模糊是基底值');
for (let d = 0.01; d < 0.9; d += 0.01) { ok(Math.abs(T.blurPx(d) - T.blurPx(-d)) < 1e-12, '兩側對稱'); ok(T.blurPx(d + 0.01) > T.blurPx(d), '遠離焦點越來越模糊'); }
// 接近焦點時變化平緩（指數 > 1）：0.02 以內的變化小於 0.3px，所以要來回比較
ok(T.blurPx(0.02) - T.blurPx(0) < 0.3, '焦點附近很平緩：' + (T.blurPx(0.02) - T.blurPx(0)));
ok(T.blurPx(0.5) > 5, '遠處很模糊');
ok(T.errGrid(0.5, 0.5) === 0 && Math.abs(T.errGrid(0.53, 0.5) - 3) < 1e-9, 'errGrid 單位是格（0～100）');
const seen = {};
for (let i = 0; i < 5000; i++) {
  const c = T.makeRound(rnd);
  ok(c.f0 >= T.F0_MIN && c.f0 <= T.F0_MAX, '真焦點範圍');
  ok(c.f >= 0 && c.f <= 1 && Math.abs(c.f - c.f0) >= T.START_GAP - 1e-12, '起始位置離焦點夠遠');
  seen[c.scene] = (seen[c.scene] || 0) + 1;
}
ok(T.SCENES.every(s => seen[s] > 1200), '三種場景都常出現 ' + JSON.stringify(seen));
T.SCENES.forEach(s => { const v = T.sceneSvg(s); ok(/^<svg/.test(v) && /<\/svg>$/.test(v) && v.indexOf('text') > 0, s + ' 場景 SVG'); });
ok(T.rating(0.1) !== T.rating(1) && T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(9), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
