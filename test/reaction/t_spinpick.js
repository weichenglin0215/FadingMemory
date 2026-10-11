const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_spinpick.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261031); const rnd = rng(SEED);

ok(T.sectorsFor(1) === 2 && T.sectorsFor(T.RAMP_LEVELS) === 12 && T.sectorsFor(60) === 12, '格數 2 → 12');
// 難度全部單調：格數變多、轉速變快（玩家要求每一關慢慢提高指針的轉速）、可提前的範圍變大、作答限時變短
for (let l = 2; l <= 60; l++) ok(T.sectorsFor(l) >= T.sectorsFor(l - 1) && T.omegaFor(l) >= T.omegaFor(l - 1) - 1e-9 && T.earlyMax(l) >= T.earlyMax(l - 1) - 1e-9 && T.ansMs(l) <= T.ansMs(l - 1), '單調 ' + l);
ok(near(T.omegaFor(1), 432) && near(T.omegaFor(T.RAMP_LEVELS), 936) && near(T.omegaFor(99), 936), '起轉速度 1.2 → 2.6 圈/秒（越後面越快）');
ok(T.omegaFor(5) > T.omegaFor(4) && T.omegaFor(15) > T.omegaFor(14), '每一關轉速都比前一關快');
{ const d = T.omegaFor(2) - T.omegaFor(1); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.omegaFor(l + 1) - T.omegaFor(l), d, 1e-9), '轉速線性增加 ' + l); }
ok(T.ansMs(1) === 6000 && T.ansMs(T.RAMP_LEVELS) === 4000, '限時 6 → 4 秒');
// 消失的時間點：完全看不見的時刻＝FADE_END_BASE（2 秒）再「不定時提前」0～earlyMax 秒；漸隱 FADE_DUR（1 秒）
ok(T.SPIN_S === 5 && T.FADE_DUR === 1 && T.FADE_END_BASE === 2 && near(T.earlyMax(1), 0.4) && near(T.earlyMax(T.RAMP_LEVELS), 1.2) && near(T.earlyMax(99), 1.2), '總 5 秒、漸隱 1 秒、完全看不見最晚是最後 2 秒、最多再提前 0.4 → 1.2 秒');
for (const lv of [1, 5, 10, 20, 40]) {
  const ends = []; for (let k = 0; k < 2000; k++) { const f = T.fadeTimes(lv, rnd); ends.push(f.fadeEnd); ok(near(f.fadeStart - f.fadeEnd, T.FADE_DUR) && f.fadeEnd >= T.FADE_END_BASE - 1e-12 && f.fadeEnd <= T.FADE_END_BASE + T.earlyMax(lv) + 1e-12, 'fadeTimes in range lv' + lv); }
  const mn = Math.min(...ends), mx = Math.max(...ends);
  ok(mx - mn > T.earlyMax(lv) * 0.9, 'level ' + lv + ': the vanish moment really varies (' + mn.toFixed(2) + '～' + mx.toFixed(2) + ' s before the stop)');
}
// alphaAt(t, sp)：剩餘時間 ≥ fadeStart → 1；之間線性；≤ fadeEnd → 0
{
  const sp = { T: 5, fadeEnd: 2.5, fadeStart: 3.5 };
  ok(T.alphaAt(0, sp) === 1 && T.alphaAt(1.4, sp) === 1 && near(T.alphaAt(1.5, sp), 1) && near(T.alphaAt(2, sp), 0.5) && near(T.alphaAt(2.5, sp), 0) && T.alphaAt(4, sp) === 0 && T.alphaAt(5, sp) === 0, 'alphaAt');
  for (let t = 1.5; t < 2.5; t += 0.05) ok(T.alphaAt(t + 0.05, sp) <= T.alphaAt(t, sp) + 1e-12, '漸隱單調');
}
// 格子判定
ok(T.sectorOf(0, 2) === 0 && T.sectorOf(179.99, 2) === 0 && T.sectorOf(180, 2) === 1 && T.sectorOf(359.99, 2) === 1 && T.sectorOf(360, 2) === 0 && T.sectorOf(-1, 4) === 3 && T.sectorOf(90, 4) === 1, 'sectorOf');
// 整場驗證
const sweepByLevel = {};
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), sp = T.makeSpin(lv, rnd), w = 360 / sp.N;
  ok(near(T.norm360(T.thetaAt(sp, sp.T)), T.norm360(sp.thetaF), 1e-6), '第 T 秒剛好在停點 lv' + lv);
  ok(T.sectorOf(sp.thetaF, sp.N) === sp.s, '停點在第 s 格');
  const inCell = (T.norm360(sp.thetaF) % w) / w;
  ok(inCell >= T.MARGIN - 1e-9 && inCell <= 1 - T.MARGIN + 1e-9, '離格線至少 20%：' + inCell.toFixed(3));
  // 減速：每個時刻不倒退
  let prev = T.thetaAt(sp, 0);
  for (let t = 0.1; t <= 5; t += 0.1) { const th = T.thetaAt(sp, t); ok(th >= prev - 1e-9, '角度不倒退'); prev = th; }
  ok(near(T.thetaAt(sp, 0), sp.theta0, 1e-9) && near(T.thetaAt(sp, 100), T.thetaAt(sp, 5), 1e-9), '停住後不動');
  ok(sp.N === T.sectorsFor(lv) && near(sp.omega0, T.omegaFor(lv)), '參數');
  ok(sp.fadeEnd >= T.FADE_END_BASE - 1e-12 && sp.fadeEnd <= T.FADE_END_BASE + T.earlyMax(lv) + 1e-12 && near(sp.fadeStart, sp.fadeEnd + T.FADE_DUR), 'makeSpin carries the vanish times');
  // 指針完全看不見之後還會掃過的角度（玩家要推測的量）＝ ω0 × 剩餘時間² ÷ (2T)
  const sweep = T.thetaAt(sp, sp.T) - T.thetaAt(sp, sp.T - sp.fadeEnd);
  ok(near(sweep, sp.omega0 * sp.fadeEnd * sp.fadeEnd / (2 * sp.T), 1e-6), 'sweep after vanishing = ω0·rem²/(2T)');
  (sweepByLevel[lv] = sweepByLevel[lv] || []).push(sweep);
  ok(T.alphaAt(sp.T - sp.fadeEnd, sp) === 0 && T.alphaAt(sp.T - sp.fadeStart, sp) === 1, 'invisible exactly from fadeEnd');
}
// 「180 度正對面」的猜法要行不通：看不見之後掃過的角度，每一關都散得很開（標準差夠大），而且隨關卡越來越大、越來越不固定
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length); };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
ok(sd(sweepByLevel[1]) > 12 && sd(sweepByLevel[T.RAMP_LEVELS]) > 120, '掃過角度的標準差：第 1 關 ' + sd(sweepByLevel[1]).toFixed(1) + ' 度、第 20 關 ' + sd(sweepByLevel[T.RAMP_LEVELS]).toFixed(1) + ' 度');
ok(sd(sweepByLevel[T.RAMP_LEVELS]) > sd(sweepByLevel[1]) * 5, '越後面越不固定');
ok(mean(sweepByLevel[T.RAMP_LEVELS]) > 540 && Math.min(...sweepByLevel[T.RAMP_LEVELS]) > 300, '第 20 關看不見之後會繞很多圈：平均 ' + mean(sweepByLevel[T.RAMP_LEVELS]).toFixed(0) + ' 度');
// 以前（固定最後 2 秒消失）看不見之後掃過 ω0×0.4＝130～216 度，所以挑「180 度對面」幾乎都對；現在同一關的兩題掃過角度的差，常常不是 360 的倍數附近
{
  let farFrom180 = 0, tot = 0;
  for (let k = 0; k < 3000; k++) { const sp = T.makeSpin(15, rnd), sw = T.thetaAt(sp, sp.T) - T.thetaAt(sp, sp.T - sp.fadeEnd), off = Math.abs(((sw - 180) % 360 + 540) % 360 - 180); tot++; if (off > 45) farFrom180++; }
  ok(farFrom180 / tot > 0.5, '第 15 關：看不見之後掃過的角度，超過一半離「180 度（含整圈）」超過 45 度：' + (farFrom180 / tot).toFixed(2));
}
// 停點的格子分布均勻
const cnt = {}; for (let i = 0; i < 6000; i++) { const sp = T.makeSpin(10, rnd); cnt[sp.s] = (cnt[sp.s] || 0) + 1; } ok(Object.keys(cnt).length === T.sectorsFor(10) && Math.min(...Object.values(cnt)) > 6000 / T.sectorsFor(10) * 0.8, '各格均勻 ' + JSON.stringify(cnt));
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(8) && T.rating(8) !== T.rating(14) && T.rating(14) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
