const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_colorrecall.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// HSL→RGB 已知值
const rgb = (h, s, l) => T.hslToRgb(h, s, l).map(v => Math.round(v));
ok(rgb(0, 100, 50).join() === '255,0,0' && rgb(120, 100, 50).join() === '0,255,0' && rgb(240, 100, 50).join() === '0,0,255', '紅綠藍');
ok(rgb(0, 0, 100).join() === '255,255,255' && rgb(0, 0, 0).join() === '0,0,0' && rgb(0, 0, 50).join() === '128,128,128', '白黑灰');
ok(rgb(60, 100, 50).join() === '255,255,0' && rgb(180, 100, 50).join() === '0,255,255' && rgb(300, 100, 50).join() === '255,0,255' && rgb(360, 100, 50).join() === '255,0,0', '黃青洋紅、360°＝0°');
// Lab：白 L=100、黑 L=0、紅的 Lab（約 53.2, 80.1, 67.2）
{ const w = T.rgbToLab([255, 255, 255]), k = T.rgbToLab([0, 0, 0]), r = T.rgbToLab([255, 0, 0]);
  ok(near(w[0], 100, 0.01) && Math.abs(w[1]) < 0.01 && Math.abs(w[2]) < 0.01, '白 Lab ' + w);
  ok(near(k[0], 0, 0.01), '黑 Lab ' + k);
  ok(near(r[0], 53.24, 0.1) && near(r[1], 80.09, 0.2) && near(r[2], 67.20, 0.2), '紅 Lab ' + r); }
// ΔE：相同為 0、黑白為 100、對稱、色相差越大越大（在 0～180 之間）
const c0 = { h: 30, s: 70, l: 50 };
ok(T.deltaE(c0, c0) === 0 && near(T.deltaE({ h: 0, s: 0, l: 0 }, { h: 0, s: 0, l: 100 }), 100, 0.01), 'ΔE 基本');
ok(near(T.deltaE(c0, { h: 100, s: 40, l: 60 }), T.deltaE({ h: 100, s: 40, l: 60 }, c0)), 'ΔE 對稱');
for (let d = 10; d <= 350; d += 10) ok(T.deltaE(c0, { h: c0.h + d, s: c0.s, l: c0.l }) > 1, '色相不同 ΔE > 0（HSL 的色相差與 Lab 距離不是單調關係，所以只檢查有差）');
// 橫條與數值互換
for (const dim of T.DIMS) for (let t = 0; t <= 1.0001; t += 0.1) ok(near(T.tFor(dim, T.valueAt(dim, t)), t, 1e-9), dim + ' 互換');
ok(T.valueAt('hue', 0.5) === 180 && T.valueAt('sat', 1) === 100 && T.valueAt('light', 0) === T.L_MIN && T.valueAt('light', 1) === T.L_MAX, 'valueAt 端點');
ok(T.unitsPerT('hue') === 360 && T.unitsPerT('sat') === 100 && T.unitsPerT('light') === T.L_MAX - T.L_MIN, 'unitsPerT');
// 出題：維度三種都出現、目標色在範圍內、起始值離目標夠遠、起始值在橫條範圍內
const dimSeen = {};
for (let i = 0; i < 6000; i++) {
  const q = T.makeRound(rnd); dimSeen[q.dim] = (dimSeen[q.dim] || 0) + 1;
  ok(q.target.s >= T.TARGET_S[0] && q.target.s <= T.TARGET_S[1] && q.target.l >= T.TARGET_L[0] && q.target.l <= T.TARGET_L[1] && q.target.h >= 0 && q.target.h < 360, '目標色範圍');
  const tv = q.target[{ hue: 'h', sat: 's', light: 'l' }[q.dim]];
  const diff = q.dim === 'hue' ? Math.min(Math.abs(q.start - tv), 360 - Math.abs(q.start - tv)) : Math.abs(q.start - tv);
  ok(diff >= T.START_GAP[q.dim][0] - 1e-6, q.dim + ' 起始離目標至少 ' + T.START_GAP[q.dim][0] + '：' + diff);
  const lo = q.dim === 'hue' ? 0 : (q.dim === 'sat' ? 0 : T.L_MIN), hi = q.dim === 'hue' ? 360 : (q.dim === 'sat' ? 100 : T.L_MAX);
  ok(q.start >= lo && q.start <= hi, '起始值在橫條範圍內 ' + q.dim + ' ' + q.start);
  // 另外兩個維度與目標相同（withDim 只換一個）
  const m = T.withDim(q.target, q.dim, q.start); ok(['h', 's', 'l'].filter(k => m[k] !== q.target[k]).length === 1, '只換一個維度');
}
ok(T.DIMS.every(d => dimSeen[d] > 1800), '三個維度平均出現 ' + JSON.stringify(dimSeen));
ok(T.makeRound(rnd, 'sat').dim === 'sat', '指定維度');
// 同一個維度：差越遠，ΔE 越大（單調，至少在小範圍內）
{ const q = { h: 200, s: 60, l: 50 }; for (const dim of T.DIMS) { let prev = -1; const key = { hue: 'h', sat: 's', light: 'l' }[dim]; for (let d = 0; d <= 25; d += 5) { const e = T.deltaE(q, T.withDim(q, dim, q[key] + d)); ok(e > prev - 1e-9, dim + ' 差越大 ΔE 越大'); prev = e; } } }
// 最壞的 ΔE 在排行榜範圍內：整個色相／彩度／明度範圍的極端組合
{ let worst = 0; for (let i = 0; i < 4000; i++) { const a = { h: rnd() * 360, s: rnd() * 100, l: T.L_MIN + rnd() * 60 }, b = { h: rnd() * 360, s: rnd() * 100, l: T.L_MIN + rnd() * 60 }; worst = Math.max(worst, T.deltaE(a, b)); } ok(worst <= G.score.max, '最壞 ΔE ' + worst.toFixed(1) + ' ≤ ' + G.score.max); }
ok(T.rating(0.5) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
