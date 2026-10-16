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
ok(T.ITEMS.length === 28 && new Set(T.ITEMS.map(x => x[0])).size === 28 && new Set(T.ITEMS.map(x => x[1])).size === 28 && T.ITEMS.every(x => Number.isInteger(x[0]) && x[0] > 0x1F000 && typeof x[1] === 'string'), '蔬果表：28 種 emoji＋名稱');
ok(T.ITEMS.map(x => T.emojiOf(x)).join('') === '🍇🍈🍉🍊🍋🍌🍍🥭🍎🍏🍐🍑🍒🍓🍅🍆🌽🌶🍄🥑🥒🥬🥦🥔🧄🧅🥕🌰', '圖示順序與玩家提供的清單一致');
for (let i = 0; i < 300; i++) { const q = T.makeLevel(1 + (i % 15), rnd); ok(q.emojis.length === 6 && q.names.length === 6 && new Set(q.emojis).size === 6, '每關六樣不同的蔬果 emoji'); }
{ const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction3.css'), 'utf8'), i = css.indexOf('.bsk-price {'), j = css.indexOf('.bsk-name {'); ok(css.slice(i, i + 200).indexOf('var(--c-black)') > 0 && css.slice(i, i + 200).indexOf('* 1.5') > 0 && css.slice(j, j + 200).indexOf('var(--c-ink-soft)') > 0, '價格黑色 150%、名稱咖啡色'); }
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
// V1.32（玩家意見：只要把個位數加起來就能猜出答案、標價比總價還大的按鈕一眼就知道不是）
{ let dTot = 0, dSame = 0, multiLv = 0, allSame = 0, noneSame = 0, lvTot = 0, fb2 = 0, withSame = 0;
  for (let l = 1; l <= T.MAX_LEVEL; l++) for (let i = 0; i < 100; i++) {
    const q = T.makeLevel(l, rnd), fbk = q.prices.join() === '38,52,67,45,29,83'; if (fbk) { fb2++; continue; }
    const sorted = q.prices.slice().sort((a, b) => a - b), nd = 6 - q.k, ansDig = new Set();
    q.prices.forEach((p, j) => { if (q.mask & (1 << j)) ansDig.add(p % 10); });
    ok(q.prices.every(p => p < q.total), '所有按鈕的標價都比總價小：' + q.prices + ' / ' + q.total);
    ok(q.prices.every(p => p + (p === sorted[0] ? sorted[1] : sorted[0]) <= q.total), '每個按鈕加上最便宜的另一個都不超過總價（不會一眼被刪掉）：' + q.prices + ' / ' + q.total);
    let same = 0; q.prices.forEach((p, j) => { if (!(q.mask & (1 << j))) { dTot++; if (ansDig.has(p % 10)) { same++; dSame++; } } });
    ok(same === q.sameDigit, 'sameDigit 欄位正確');
    lvTot++; if (same > 0) withSame++;
    if (nd >= 2) { multiLv++; if (same === nd) allSame++; if (same === 0) noneSame++; }
  }
  ok(fb2 === 0, '保底題沒有出現');
  ok(dSame / dTot > 0.45 && dSame / dTot < 0.9, '答案以外的按鈕，個位數跟某個正確答案一樣的比例 ' + (dSame / dTot).toFixed(2) + '（DIGIT_P = ' + T.DIGIT_P + '）');
  ok(withSame / lvTot > 0.9, '幾乎每關都有至少 1 個這樣的按鈕：' + (withSame / lvTot).toFixed(2));
  ok(multiLv > 0 && noneSame / multiLv < 0.02, '答案以外有 2 個以上時，每關至少 1 個個位數跟答案一樣：沒有的 ' + noneSame + ' / ' + multiLv);
  ok(allSame / multiLv < 0.4, '不會每關每個按鈕都這樣（不然六個按鈕明顯分兩組）：全部一樣的比例 ' + (allSame / multiLv).toFixed(2));
  console.log('個位數跟答案一樣的其他按鈕：' + (dSame / dTot * 100).toFixed(1) + '%；至少 1 個的關卡 ' + (withSame / lvTot * 100).toFixed(1) + '%；（答案以外 2 個以上的關卡）全部一樣 ' + (allSame / multiLv * 100).toFixed(1) + '%、都不一樣 ' + (noneSame / multiLv * 100).toFixed(1) + '%'); }
ok(T.maskText({ prices: [38, 52, 67, 45, 29, 83] }, 1 | 2 | 8) === '38 ＋ 52 ＋ 45 ＝ 135', 'maskText');
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(11) && T.rating(11) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
