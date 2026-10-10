const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_nthshape.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261025); const rnd = rng(SEED);

ok(T.shapesFor(1) === 2 && T.shapesFor(T.RAMP_LEVELS) === 6 && T.shapesFor(60) === 6, '種類 2 → 6');
ok(T.seqFor(1) === 5 && T.seqFor(T.RAMP_LEVELS) === 9 && T.seqFor(60) === 9, '閃現 5 → 9 次');
ok(T.showMs(1) === 800 && T.showMs(T.RAMP_LEVELS) === 450, '時間 800 → 450');
for (let l = 2; l <= 60; l++) ok(T.shapesFor(l) >= T.shapesFor(l - 1) && T.seqFor(l) >= T.seqFor(l - 1) && T.showMs(l) <= T.showMs(l - 1) && T.ansMs(l) <= T.ansMs(l - 1), '單調 ' + l);
ok(T.extraFor(1) === 0 && T.extraFor(T.COLOR_FROM - 1) === 0 && T.extraFor(T.COLOR_FROM) === 1 && T.extraFor(60) === 2, '同形不同色顆數');
for (const s of T.SHAPES) ok(!!T.SHAPE_NAME[s] && /[一-鿿]/.test(T.SHAPE_NAME[s]), '形狀有中文名稱 ' + s);
for (const s of T.SHAPES) ok(/<svg/.test(T.shapeSvg(s, '#fff', '#000')) && !/NaN/.test(T.shapeSvg(s, '#fff', '#000')), '圖形 ' + s);
let colorLevels = 0, sameShape = 0;
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd);
  const key = p => p.shape + '/' + p.hue;
  ok(new Set(q.pool.map(key)).size === q.pool.length, '按鈕不重複 ' + lv);
  ok(q.pool.length === T.shapesFor(lv) + T.extraFor(lv), '按鈕數 ' + lv + '：' + q.pool.length);
  ok(q.seq.length === T.seqFor(lv) && q.seq.every(v => v >= 0 && v < q.pool.length), '順序');
  ok(q.ask >= 1 && q.ask <= q.seq.length && q.ans === q.seq[q.ask - 1], '答案＝順序的第 ask 個');
  ok(new Set(q.seq).size >= 2, '至少 2 種不同圖形出現');
  if (lv < T.COLOR_FROM) ok(new Set(q.pool.map(p => p.hue)).size === 1, '前期同一個顏色');
  else { colorLevels++; const shapes = q.pool.map(p => p.shape); if (new Set(shapes).size < shapes.length) sameShape++; }
}
ok(colorLevels > 4000 && sameShape === colorLevels, '有顏色的關卡都有同形不同色：' + sameShape + '/' + colorLevels);
// 問的位置各種都會出現，頭尾稍少
const askPos = {}; for (let i = 0; i < 6000; i++) { const q = T.makeLevel(30, rnd); askPos[q.ask] = (askPos[q.ask] || 0) + 1; }
ok(Object.keys(askPos).length === 9 && askPos[1] < askPos[5] && askPos[9] < askPos[5], '問的位置分布 ' + JSON.stringify(askPos));
// 同一個圖形重複出現的機會
let rep = 0; for (let i = 0; i < 1000; i++) { const q = T.makeLevel(1, rnd); if (new Set(q.seq).size < q.seq.length) rep++; } ok(rep > 900, '會重複出現：' + rep);
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
