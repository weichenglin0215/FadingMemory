const { game } = require('./load.js');
const G = game('reaction_sticks.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 棍長：第 1 關＝場地高度一半，每關 ×0.8（使用者指定），有下限
const FH = 700;
ok(near(T.stickLen(1, FH), 350), 'level1 = half of field');
for (let l = 2; l <= 6; l++) ok(near(T.stickLen(l, FH) / T.stickLen(l - 1, FH), 0.8, 1e-12), 'shrink 0.8 at ' + l);
ok(T.stickLen(40, FH) === 30 && T.stickLen(40, FH) >= 30, 'clamped to minimum');
// 重力線性
const g1 = T.gravity(1), g15 = T.gravity(15), g8 = T.gravity(8);
ok(g15 > g1 && near(g8, (g1 + g15) / 2, 1) && T.gravity(99) === g15, 'gravity linear, clamped');
// 掉落：t² 、離場時間
ok(T.topAt(2000, -1) === 0 && T.topAt(2000, 0) === 0 && near(T.topAt(2000, 0.5), 250), 'topAt');
for (const lv of [1, 8, 15]) { const g = T.gravity(lv); ok(near(T.topAt(g, T.exitSec(g, FH)), FH, 1e-6), 'exitSec consistent lv' + lv); }
// 鬆手時間表
let minGap = 99, firstMin = 99, orderCount = {};
for (let k = 0; k < 4000; k++) {
  const s = T.makeSchedule();
  ok(s.length === T.N, 'N sticks');
  ok(new Set(s.map(x => x.i)).size === T.N && s.every(x => x.i >= 0 && x.i < T.N), 'indices distinct');
  for (let i = 1; i < s.length; i++) minGap = Math.min(minGap, s[i].t - s[i - 1].t);
  firstMin = Math.min(firstMin, s[0].t);
  orderCount[s[0].i] = (orderCount[s[0].i] || 0) + 1;
}
ok(minGap >= T.GAP_MIN - 1e-9, 'min gap >= GAP_MIN (' + minGap.toFixed(3) + ')');
ok(firstMin > 0.5, 'first release not instant');
ok(Object.keys(orderCount).length === T.N && Object.values(orderCount).every(c => c > 4000 / T.N * 0.7), 'random order covers every stick ' + JSON.stringify(orderCount));
// 判定
const st = { cx: 100, len: 200, relT: null };
const g = 2200;
ok(T.judgeTap(st, g, { x: 100, y: 50, t: 0 }) === 'early', 'tap hanging stick = early');
ok(T.judgeTap(st, g, { x: 100, y: 200 + T.HIT_PAD + 5, t: 0 }) === 'none', 'tap below hanging stick = none');
ok(T.judgeTap(st, g, { x: 100 + T.HIT_W / 2 + 1, y: 50, t: 0 }) === 'none', 'other column');
st.relT = 1000;
ok(T.judgeTap(st, g, { x: 100, y: 100, t: 1000 + 50 }) === 'early', 'react faster than REACT_MIN_S = early');
const t250 = 1000 + 250, top250 = T.topAt(g, 0.25);
ok(T.judgeTap(st, g, { x: 100, y: top250 + 100, t: t250 }) === 'hit', 'hit body');
ok(T.judgeTap(st, g, { x: 100, y: top250 - T.HIT_PAD + 1, t: t250 }) === 'hit', 'hit upper pad');
ok(T.judgeTap(st, g, { x: 100, y: top250 - T.HIT_PAD - 1, t: t250 }) === 'none', 'above pad = none');
ok(T.judgeTap(st, g, { x: 100, y: top250 + 200 + T.HIT_PAD + 1, t: t250 }) === 'none', 'below pad = none');
ok(T.MISS_ALLOWED === 1, 'one miss allowed per level');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
