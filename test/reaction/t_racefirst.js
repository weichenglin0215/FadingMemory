const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_racefirst.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261030); const rnd = rng(SEED);

ok(near(T.gapFor(1), 0.12) && near(T.gapFor(T.RAMP_LEVELS), 0.025) && near(T.gapFor(60), 0.025), '時間差 0.12 → 0.025 秒');
for (let l = 2; l <= 60; l++) ok(T.gapFor(l) <= T.gapFor(l - 1) + 1e-12 && T.ansMs(l) <= T.ansMs(l - 1), '單調 ' + l);
ok(near(T.gapFor(11) - (0.12 + 0.025) / 2, 0, 0.004), '中點約等於平均（線性）');
// 運動函式
ok(T.distAt(1000, 0, 400) === 0 && near(T.distAt(1000, 0.5, 4000), 125) && T.distAt(1000, 5, 400) === 400, 'distAt');
ok(near(T.arriveT(T.accelOf(0.7, 400), 400), 0.7), 'accelOf／arriveT 互為反函式');
{ const a = T.accelOf(0.7, 400); ok(near(T.distAt(a, 0.7, 1e9), 400, 1e-6) && T.distAt(a, 0.35, 1e9) < 400 / 2 && near(T.distAt(a, 0.35, 1e9), 100, 1e-6), '加速度運動：一半時間只跑 1/4 距離'); }
// 整場比賽
const D = 388, winLane = {}, gaps = [];
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), r = T.makeRace(lv, D, rnd);
  ok(r.T.length === 4 && r.a.length === 4 && r.hues.length === 4 && new Set(r.hues.map(c => c.n)).size === 4, '四個圓點、顏色不重複');
  r.T.forEach((t, k) => ok(near(T.arriveT(r.a[k], D), t, 1e-9) && t > 0.5 && t < 1.15, '到達時間與加速度一致 ' + t));
  const sorted = r.T.slice().sort((x, y) => x - y);
  ok(near(sorted[0], r.T[r.win]), '最快的是 win');
  ok(near(sorted[1] - sorted[0], T.gapFor(lv), 1e-9), '第一名領先第二名剛好 GAP：' + (sorted[1] - sorted[0]));
  ok(sorted[1] < sorted[2] && sorted[2] < sorted[3], '名次沒有並列');
  ok(sorted[0] >= T.T_WIN[0] - 1e-9 && sorted[0] <= T.T_WIN[1] + 1e-9, '第一名時間範圍');
  ok(sorted[3] - sorted[0] <= T.gapFor(lv) * (1 + 2 * T.SPREAD[1]) + 1e-9, '總時間差上限');
  ok(r.order.length === 4 && r.order[0] === r.win && r.order.every((lane, rank) => near(r.T[lane], sorted[rank], 1e-9)), 'order 是名次');
  winLane[r.win] = (winLane[r.win] || 0) + 1; gaps.push(sorted[1] - sorted[0]);
}
ok(Object.keys(winLane).length === 4 && Math.min(...Object.values(winLane)) > 1200, '最快的跑道均勻 ' + JSON.stringify(winLane));
// 人類做得到：最後一關，第一名到終點的那一刻，第二名落後多少像素 ≥ 15 px（約半個圓點）
{ const r = T.makeRace(60, D, rnd); const t = Math.min(...r.T); const second = r.order[1]; const lag = D - T.distAt(r.a[second], t, 1e9); ok(lag >= 15, '最後一關第二名落後 ' + lag.toFixed(1) + ' px'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(8) && T.rating(8) !== T.rating(14) && T.rating(14) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
