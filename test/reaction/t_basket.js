const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_basket.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 難度曲線
ok(T.kAt(1) === 2 && T.kAt(T.RAMP_LEVELS) === 5 && T.kAt(T.MAX_LEVEL) === 5, '樣數端點');
ok(T.trapMinAt(1) === 0 && T.trapMinAt(T.RAMP_LEVELS) === 4, '陷阱數端點');
ok(T.timeMs(1) === 40000 && T.timeMs(T.RAMP_LEVELS) === 20000, '限時端點');
for (let l = 2; l <= T.MAX_LEVEL; l++) ok(T.kAt(l) >= T.kAt(l - 1) && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
ok(T.LIVES === 2, '2 條命');
// 名稱表：20 種、不重複、色相合法
ok(T.ITEMS.length === 20 && new Set(T.ITEMS.map(x => x[0])).size === 20 && T.ITEMS.every(x => x[1] >= 0 && x[1] < 360), '蔬果表');
// bitCount／subsets
ok(T.bitCount(0b101101) === 4 && T.subsets([1, 2, 4]).length === 7 && T.subsets([1, 2, 4]).map(s => s.sum).sort().join() === '1,2,3,4,5,6,7', 'subsets');
// 出題：每一關檢查唯一解、樣數、陷阱、價格範圍
let fallbacks = 0, nearSum = 0, total = 0;
for (let l = 1; l <= T.MAX_LEVEL; l++) for (let i = 0; i < 80; i++) {
  const q = T.makeLevel(l, rnd); total++;
  ok(q.prices.length === 6 && new Set(q.prices).size === 6, '六個不同的價格');
  const r = T.priceRange(l); const isFb = q.prices.join() === '38,52,67,45,29,83'; if (isFb) fallbacks++;
  if (!isFb) ok(q.prices.every(p => p >= r[0] && p <= r[1]), '價格範圍 ' + q.prices);
  const subs = T.subsets(q.prices), eq = subs.filter(s => s.sum === q.total);
  ok(eq.length === 1 && eq[0].mask === q.mask, '答案唯一：' + q.prices + ' → ' + q.total + '，解的個數 ' + eq.length);
  ok(isFb || T.bitCount(q.mask) === T.kAt(l), '答案樣數 ' + T.bitCount(q.mask) + ' = ' + T.kAt(l));
  ok(T.maskSum(q.prices, q.mask) === q.total, 'maskSum');
  const near = subs.filter(s => { const d = Math.abs(s.sum - q.total); return d >= 1 && d <= 3; }).length;
  ok(near === q.near, 'near 欄位正確'); ok(isFb || near >= T.trapMinAt(l), '陷阱數 ' + near + ' ≥ ' + T.trapMinAt(l)); nearSum += near;
  ok(q.names.length === 6 && new Set(q.names).size === 6, '六個不同的名稱');
}
ok(fallbacks / total < 0.01, '保底題出現比例 ' + fallbacks + '/' + total);
console.log('平均差 1～3 元的組合 ' + (nearSum / total).toFixed(2) + ' 個；保底 ' + fallbacks + ' / ' + total);
ok(T.maskText({ prices: [38, 52, 67, 45, 29, 83] }, 1 | 2 | 8) === '38 ＋ 52 ＋ 45 ＝ 135', 'maskText');
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(11) && T.rating(11) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
