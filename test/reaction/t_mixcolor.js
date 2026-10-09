// 混出什麼色：按住的變化速度、頻道夾在 0～255、色差公式（黑白＝100）、起始色離目標夠遠
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_mixcolor.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const SEED = seedOf(20261010), rnd = rng(SEED);
// 色差：跟色不異空同一把尺
ok(Math.abs(T.diffPercent({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) - 100) < 0.01, '黑白的差異度＝100%：' + T.diffPercent({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }));
ok(T.diffPercent({ r: 10, g: 200, b: 90 }, { r: 10, g: 200, b: 90 }) === 0, '一樣的顏色＝0');
const c0 = { r: 120, g: 120, b: 120 }; ok(T.diffPercent(c0, { r: 121, g: 120, b: 120 }) < 1 && T.diffPercent(c0, { r: 130, g: 120, b: 120 }) > T.diffPercent(c0, { r: 121, g: 120, b: 120 }), '差越多差異度越大');
ok(Math.abs(T.diffPercent({ r: 200, g: 30, b: 60 }, { r: 20, g: 90, b: 240 }) - T.diffPercent({ r: 20, g: 90, b: 240 }, { r: 200, g: 30, b: 60 })) < 1e-9, '對稱');
// 按住的速度：線性加快
ok(T.rateAt(0) === T.RATE[0] && T.rateAt(T.RAMP_S) === T.RATE[1] && T.rateAt(99) === T.RATE[1] && T.rateAt(-1) === T.RATE[0], '速度 ' + T.RATE.join(' → ') + ' 單位／秒');
ok(Math.abs(T.rateAt(T.RAMP_S / 2) - (T.RATE[0] + T.RATE[1]) / 2) < 1e-9, '線性');
// 頻道變化：用速度積分、夾在 0～255
ok(Math.abs(T.stepChannel(100, 1, 0, 1000) - (100 + T.RATE[0])) < 1e-9, '剛按下 1 秒 +' + T.RATE[0]);
ok(T.stepChannel(250, 1, 5, 1000) === 255 && T.stepChannel(3, -1, 5, 1000) === 0, '夾在 0～255');
// 按住 3 秒（每 16 毫秒一格）從 0 加到哪：應該能從頭加到尾（0 → 255 小於 3 秒）、也能微調（按 0.1 秒只動約 3 個單位）
let v = 0, t = 0; while (v < 255 && t < 10000) { v = T.stepChannel(v, 1, t / 1000, 16); t += 16; }
ok(t < 2400, '從 0 一路按到 255 不到 2.4 秒：' + (t / 1000).toFixed(2) + ' 秒');
v = 100; for (let k = 0; k < 6; k++) v = T.stepChannel(v, 1, k * 0.016, 16); ok(v - 100 < 4 && v - 100 > 2, '按約 0.1 秒只動 ' + (v - 100).toFixed(2) + ' 個單位（可以微調）');
// 出題
let minStart = 1e9, maxT = 0, minT = 255;
for (let k = 0; k < 3000; k++) {
  const r = T.newRound(rnd);
  ['r', 'g', 'b'].forEach(ch => { ok(Number.isInteger(r.target[ch]) && Number.isInteger(r.start[ch]) && r.start[ch] >= 0 && r.start[ch] <= 255, '整數頻道'); maxT = Math.max(maxT, r.target[ch]); minT = Math.min(minT, r.target[ch]); });
  const d = T.diffPercent(r.target, r.start); minStart = Math.min(minStart, d);
  ok(d >= T.START_MIN - 1e-9, '起始離目標至少 ' + T.START_MIN + '：' + d.toFixed(2));
}
ok(minT >= T.TARGET_RANGE[0] && maxT <= T.TARGET_RANGE[1], '目標顏色每個頻道在 ' + T.TARGET_RANGE.join('～') + ' 之間：' + minT + '～' + maxT);
// 六顆按鈕：三種頻道、增減各一
ok(T.BUTTONS.length === 6 && ['r', 'g', 'b'].every(ch => T.BUTTONS.filter(b => b.ch === ch && b.dir === 1).length === 1 && T.BUTTONS.filter(b => b.ch === ch && b.dir === -1).length === 1), '紅綠藍各有 ＋ 與 －');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
