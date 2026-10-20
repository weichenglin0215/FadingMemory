const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fastblink.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261019); const rnd = rng(SEED);

// 頻率比：RATIO[0] → RATIO[1]，到頂維持（端點與限時都跟著檔案裡的參數走；使用者手調過，不寫死數字）
ok(near(T.ratioFor(1), T.RATIO[0]) && near(T.ratioFor(T.RAMP_LEVELS), T.RATIO[1]) && near(T.ratioFor(60), T.RATIO[1]), '頻率比端點 ' + T.RATIO[0] + ' → ' + T.RATIO[1]);
for (let l = 2; l <= 60; l++) ok(T.ratioFor(l) <= T.ratioFor(l - 1) + 1e-12, '頻率比單調下降 ' + l);
ok(T.ansMs(1) === Math.round(T.ANS_S[0] * 1000) && T.ansMs(T.RAMP_LEVELS) === Math.round(T.ANS_S[1] * 1000), '限時 ' + T.ANS_S[0] + ' → ' + T.ANS_S[1] + ' 秒');
// V1.34 玩家意見：第 3～16 關幾乎感受不到難度差異。原本線性縮小：第 3 關 2.84、第 16 關 1.78，快的都快將近一倍，這一大段都一樣簡單。
// 改成對「差距（比值 − 1）」等比例縮小（RATIO_LOG）：每一關的差距都是上一關的固定比例，每一關都比前一關難分辨
ok(T.RATIO_LOG === true, 'RATIO_LOG 開著（差距等比例縮小）');
{ const d = l => T.ratioFor(l) - 1, q0 = d(2) / d(1);
  for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(d(l + 1) / d(l), q0, 1e-9) && d(l + 1) < d(l), '第 ' + l + ' → ' + (l + 1) + ' 關：差距縮成上一關的固定比例 ' + q0.toFixed(4));
  console.log('比值：' + [1, 3, 5, 8, 10, 13, 16, 20, 25].map(l => '第' + l + '關 ' + T.ratioFor(l).toFixed(3)).join('　'));
  // 第 3～16 關的差距至少縮小 5 倍（舊的線性只縮小 2.4 倍：0.84 → 0.78 ... 1.84 → 0.78）
  ok(d(3) / d(16) >= 5, '第 3 關到第 16 關，快慢的差距縮小了 ' + (d(3) / d(16)).toFixed(1) + ' 倍（舊版線性只有 ' + ((3 - 1.95 * 2 / 24 - 1) / (3 - 1.95 * 15 / 24 - 1)).toFixed(1) + ' 倍）');
  // 每過 3 關差距都至少縮小 1.5 倍：任何連續幾關都感覺得到變難
  for (let l = 1; l + 3 <= T.RAMP_LEVELS; l++) ok(d(l) / d(l + 3) >= 1.5, '第 ' + l + ' → ' + (l + 3) + ' 關差距縮小 ' + (d(l) / d(l + 3)).toFixed(2) + ' 倍'); }
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
  ok(q.slow >= T.SLOW_HZ[0] - 0.05 && q.slow <= T.SLOW_HZ[1] + 0.05 && q.slow > 0 && q.fast > q.slow, '頻率範圍 ' + q.slow + ' ' + q.fast);
  ok(Math.abs(q.ratio - T.ratioFor(lv)) < 0.006, '比值接近設定 ' + lv + '：' + q.ratio + ' vs ' + T.ratioFor(lv));
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
