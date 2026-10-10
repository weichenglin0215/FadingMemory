const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fastblink.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261019); const rnd = rng(SEED);

// 頻率比：2.0 → 1.05 線性，到頂維持
ok(near(T.ratioFor(1), 2.0) && near(T.ratioFor(T.RAMP_LEVELS), 1.05) && near(T.ratioFor(60), 1.05), '頻率比端點');
for (let l = 2; l <= 60; l++) ok(T.ratioFor(l) <= T.ratioFor(l - 1) + 1e-12 && T.ansMs(l) <= T.ansMs(l - 1), '單調 ' + l);
ok(near(T.ratioFor(13) - (2.0 + 1.05) / 2, 0, 1e-9), '中點＝平均（線性）');
ok(T.ansMs(1) === 8000 && T.ansMs(T.RAMP_LEVELS) === 5000, '限時 8 → 5 秒');
// isOn：占空比 50%、週期正確
for (const f of [2.4, 3.1, 4.2, 8.4]) {
  let on = 0; const n = 20000;
  for (let i = 0; i < n; i++) if (T.isOn(f, 0.37, i * 0.0013)) on++;
  ok(Math.abs(on / n - 0.5) < 0.01, '亮的比例約一半 f=' + f + '：' + on / n);
  ok(T.countFlashes(f, 0.37, 10) >= Math.floor(f * 10) - 1 && T.countFlashes(f, 0.37, 10) <= Math.ceil(f * 10) + 1, '10 秒閃的次數 f=' + f + '：' + T.countFlashes(f, 0.37, 10));
}
ok(T.isOn(1, 0, 0) === true && T.isOn(1, 0, 0.49) === true && T.isOn(1, 0, 0.5) === false && T.isOn(1, 0, 0.99) === false && T.isOn(1, 0, 1.0) === true, 'isOn 邊界');
// 整關：頻率範圍、比值（取小數後的誤差）、兩邊隨機
const side = { L: 0, R: 0 }, swap = { t: 0, f: 0 };
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd);
  ok(q.slow >= 2.4 - 0.05 && q.slow <= 4.2 + 0.05 && q.fast > q.slow, '頻率範圍 ' + q.slow + ' ' + q.fast);
  ok(Math.abs(q.ratio - T.ratioFor(lv)) < 0.03, '比值接近設定 ' + lv + '：' + q.ratio + ' vs ' + T.ratioFor(lv));
  ok(q.fast / q.slow > 1.02, '快的一定比較快');
  ok(q.phL >= 0 && q.phL < 1 && q.phR >= 0 && q.phR < 1, '相位範圍');
  side[q.fastSide]++; swap[q.swap ? 't' : 'f']++;
}
ok(side.L > 2700 && side.R > 2700 && swap.t > 2700 && swap.f > 2700, '左右／顏色隨機：' + JSON.stringify(side) + JSON.stringify(swap));
// 難度確實變難：10 秒內快的比慢的多閃幾次，第 1 關差很多、最後一關只差一點
function diffFlash(lv) { let s = 0; for (let i = 0; i < 200; i++) { const q = T.makeLevel(lv, rnd); s += T.countFlashes(q.fast, rnd(), 5, 0.002) - T.countFlashes(q.slow, rnd(), 5, 0.002); } return s / 200; }
ok(diffFlash(1) > diffFlash(T.RAMP_LEVELS) * 2, '快慢的閃爍次數差隨關卡縮小：' + diffFlash(1).toFixed(2) + ' → ' + diffFlash(T.RAMP_LEVELS).toFixed(2));
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(20) && T.rating(20) !== T.rating(35), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
