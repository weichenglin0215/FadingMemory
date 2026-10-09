const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_seenit.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

ok(T.itemCount() === 16 * 6 && T.VARIANTS === 6 && T.BASES.length === 16, '圖案數 16 種形狀 × 6 種變體');
for (let id = 0; id < T.itemCount(); id++) ok(T.baseOf(id) * T.VARIANTS + T.colorOf(id) * 2 + T.markOf(id) === id, '編碼互換 ' + id);
T.BASES.forEach(b => ok(T.shapeMarkup(b).length > 10, b + ' 有圖案'));
// 全部圖案的 SVG 都不一樣
{ const set = new Set(); for (let id = 0; id < T.itemCount(); id++) set.add(T.itemSvg(id, 100)); ok(set.size === T.itemCount(), '每個圖案的 SVG 都不同'); }
// 難度曲線
ok(T.timeMs(1) === 2500 && T.timeMs(T.RAMP_LEVELS) === 1000 && T.timeMs(100) === 1000, '限時端點');
ok(near(T.nearP(1), 0.3) && near(T.nearP(T.RAMP_LEVELS), 0.8), '近親比例端點');
// diffText
ok(T.diffText(0, 2) === '顏色不同' && T.diffText(0, 1).indexOf('圓點') >= 0 && T.diffText(0, 3).indexOf('顏色不同') >= 0 && T.diffText(0, 7) === '兩個是不同的形狀', 'diffText');
// 模擬 60 局，每局 100 張：檢查規則
let olds = 0, news = 0, nearNew = 0, studyOK = 0, games = 60, distBad = 0, repBad = 0;
for (let g = 0; g < games; g++) {
  const hist = [];
  for (let i = 0; i < T.MAX_LEVEL; i++) {
    const t = T.nextTrial(hist, rnd);
    ok(t.item >= 0 && t.item < T.itemCount(), '圖案編號合法');
    if (i < T.STUDY) { ok(t.kind === 'study' && hist.indexOf(t.item) < 0, '暖身一定是新的'); ok(!hist.some(x => T.baseOf(x) === T.baseOf(t.item)), '暖身是全新的形狀'); studyOK++; }
    else if (t.kind === 'old') {
      olds++; const last = hist.lastIndexOf(t.item); ok(last >= 0 && last === t.seenAt, '看過的圖案真的出現過');
      const d = i - last; if (d < T.DIST[0] || d > T.DIST[1]) distBad++;
      const n = hist.filter(x => x === t.item).length; if (n >= T.MAX_REPEAT) repBad++;
    } else {
      news++; ok(hist.indexOf(t.item) < 0, '新的圖案之前沒出現過（' + t.item + '）');
      if (t.rel != null) { nearNew++; ok(hist.indexOf(t.rel) >= 0 && T.baseOf(t.rel) === T.baseOf(t.item) && t.rel !== t.item, '近親：同形狀、不同變體、之前看過'); }
    }
    hist.push(t.item);
  }
}
ok(distBad === 0, '看過的距離都在 2～12 張內（違規 ' + distBad + '）');
ok(repBad === 0, '同一圖案最多 3 次（違規 ' + repBad + '）');
ok(olds / (olds + news) > 0.35 && olds / (olds + news) < 0.6, '看過／新的約一半：' + olds / (olds + news));
ok(nearNew / news > 0.2, '新的裡面近親比例 ' + nearNew / news);
console.log('看過 ' + olds + ' 新的 ' + news + '（近親 ' + nearNew + '）；看過比例 ' + (olds / (olds + news)).toFixed(3));
ok(T.rating(2) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(40) && T.rating(40) !== T.rating(70), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
