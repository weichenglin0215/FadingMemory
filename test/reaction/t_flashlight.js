const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_flashlight.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261029); const rnd = rng(SEED);

ok(near(T.radiusFor(1), 96) && near(T.radiusFor(T.RAMP_LEVELS), 30) && near(T.radiusFor(60), 30), '光圈 96 → 30');
for (let l = 2; l <= 60; l++) ok(T.radiusFor(l) <= T.radiusFor(l - 1) + 1e-12 && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
ok(near(T.radiusFor(13), 63), '中點（線性）');
ok(T.timeMs(1) === 20000 && T.timeMs(T.RAMP_LEVELS) === 12000, '限時 20 → 12 秒');
// 圖案：每個都畫得出來、沒有 NaN
for (const id of [...T.DIGITS, ...T.SYMBOLS]) { const s = T.picSvg(id); ok(s.startsWith('<svg') && s.endsWith('</svg>') && !/NaN|undefined/.test(s) && s.length > 60, '圖案 ' + id); ok(T.nameOf(id).length >= 1, '名稱 ' + id); }
ok(T.DIGITS.length === 10 && T.SYMBOLS.length === 14 && new Set([...T.DIGITS, ...T.SYMBOLS]).size === 24, '24 種圖案');
// 相似數字表：對稱性不要求，但每個數字的相似表要有 ≥3 個、不含自己、都是數字
T.DIGITS.forEach(d => ok(T.SIMILAR[d].length >= 3 && !T.SIMILAR[d].includes(d) && T.SIMILAR[d].every(x => T.DIGITS.includes(x)), '相似表 ' + d));
// 各階段出什麼圖案
for (let i = 0; i < 300; i++) {
  ok(T.isDigit(T.makeLevel(1 + (i % 5), rnd).target), '第 1～5 關只有數字');
  ok(!T.isDigit(T.makeLevel(6 + (i % 5), rnd).target), '第 6～10 關只有符號');
}
let dg = 0, sy = 0; for (let i = 0; i < 2000; i++) { if (T.isDigit(T.makeLevel(20, rnd).target)) dg++; else sy++; } ok(dg > 800 && sy > 800, '後期兩種都有 ' + dg + '/' + sy);
// 整關：四個選項不重複、含答案、同一類、答案位置正確
const ansPos = {};
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd);
  ok(q.options.length === 4 && new Set(q.options).size === 4, '四個不同選項');
  ok(q.options[q.answer] === q.target, '答案位置');
  ok(q.options.every(o => T.isDigit(o) === T.isDigit(q.target)), '選項同一類');
  ansPos[q.answer] = (ansPos[q.answer] || 0) + 1;
}
ok(Object.keys(ansPos).length === 4 && Math.min(...Object.values(ansPos)) > 1100, '答案位置均勻 ' + JSON.stringify(ansPos));
// 數字選項要多半是長得像的
let sim = 0, tot = 0; for (let i = 0; i < 2000; i++) { const q = T.makeLevel(1, rnd); q.options.forEach(o => { if (o !== q.target) { tot++; if (T.SIMILAR[q.target].includes(o)) sim++; } }); } ok(sim / tot > 0.9, '數字選項長得像的比例 ' + (sim / tot).toFixed(3));
// 掃過範圍計算
const box = { x: 0, y: 0, w: 100, h: 100 };
ok(T.coverage([], 10, box) === 0 && T.coverage([{ x: 50, y: 50 }], 1000, box) === 1, '空與全部');
{ const c = T.coverage([{ x: 50, y: 50 }], 30, box); ok(Math.abs(c - Math.PI * 900 / 10000) < 0.03, '圓的面積比例 ' + c.toFixed(4)); }
ok(Math.abs(T.coverage([{ x: 0, y: 0 }], 50, box) - Math.PI / 16) < 0.01, '角落四分之一圓');
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
