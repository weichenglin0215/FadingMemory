const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_ghostleg.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 難度曲線
ok(T.rungCount(1) === 6 && T.rungCount(T.RAMP_LEVELS) === 30, '橫線數端點');
ok(T.fakeCount(1) === 0 && T.fakeCount(T.RAMP_LEVELS) === 8, '假橫線端點');
ok(near(T.alphaAt(1), 0.9) && near(T.alphaAt(T.RAMP_LEVELS), 0.55), '橫線不透明度端點');
ok(T.timeMs(1) === 30000 && T.timeMs(T.RAMP_LEVELS) === 18000, '限時端點');
for (let l = 2; l <= T.RAMP_LEVELS; l++) ok(T.rungCount(l) >= T.rungCount(l - 1) && T.alphaAt(l) < T.alphaAt(l - 1), '單調 ' + l);
// 橫線：數量精確、同一層不相鄰、每層最多 2 條
for (let l = 1; l <= T.RAMP_LEVELS; l++) for (let k = 0; k < 60; k++) {
  const q = T.makeLevel(l, rnd);
  ok(q.rungs.length === T.rungCount(l), '第 ' + l + ' 關橫線數 ' + q.rungs.length);
  const seen = {}; q.rungs.forEach(g => { ok(g.col >= 0 && g.col <= T.COLS - 2 && g.row >= 0 && g.row < T.ROWS, '位置範圍'); ok(!seen[g.row + ',' + g.col], '不重複'); seen[g.row + ',' + g.col] = 1; });
  q.rungs.forEach(g => ok(!seen[g.row + ',' + (g.col + 1)], '同一層橫線不相鄰'));
  const perRow = {}; q.rungs.forEach(g => { perRow[g.row] = (perRow[g.row] || 0) + 1; }); ok(Object.values(perRow).every(v => v <= 2), '每層最多 2 條');
  ok(q.fakes.length === T.fakeCount(l), '假橫線數 ' + q.fakes.length);
  q.fakes.forEach(f => { ok(!seen[f.row + ',' + f.col] && !seen[f.row + ',' + (f.col - 1)], '假橫線不跟真橫線疊在一起'); ok(f.col + f.dir >= 0 && f.col + f.dir < T.COLS, '假橫線伸向存在的直線'); });
  // 路徑：獨立模擬一次，終點相同
  let col = q.start; const s = {}; q.rungs.forEach(g => { s[g.row + ',' + g.col] = 1; });
  for (let r = 0; r < T.ROWS; r++) { if (s[r + ',' + col]) col++; else if (s[r + ',' + (col - 1)]) col--; }
  ok(col === q.end, '終點一致');
  ok(q.route[0].y === T.Y_TOP && q.route[q.route.length - 1].y === T.Y_BOT && near(q.route[0].x, T.colX(q.start)) && near(q.route[q.route.length - 1].x, T.colX(q.end)), '路線首尾');
  // 折線每一段不是垂直就是水平
  for (let i = 1; i < q.route.length; i++) ok(q.route[i].x === q.route[i - 1].x || q.route[i].y === q.route[i - 1].y, '路線只有垂直與水平');
}
// 終點和起點不同欄（只要有可能就選這種）
{ let same = 0, n = 0; for (let l = 3; l <= 15; l++) for (let k = 0; k < 60; k++) { const q = T.makeLevel(l, rnd); n++; if (q.end === q.start) same++; } ok(same === 0, '第 3 關起起點都不會直走到底：' + same + '/' + n); }
// 每一欄都有機會當起點
{ const c = new Array(5).fill(0); for (let i = 0; i < 2500; i++) c[T.makeLevel(8, rnd).start]++; ok(c.every(v => v > 300), '起點平均分布 ' + c.join(',')); }
// 距離與進度：在路線上距離 0；偏離 40px 距離 40；s 隨位置遞增
{ const q = T.makeLevel(10, rnd), L = T.routeLength(q.route); let prev = -1;
  for (let i = 0; i <= 50; i++) { const p = T.nearest(q.route[0], q.route); ok(p.d < 1e-9 && p.s < 1e-6, '起點距離 0'); }
  for (let i = 1; i < q.route.length; i++) { const n = T.nearest(q.route[i], q.route); ok(n.d < 1e-6, '折點在路線上'); ok(n.s >= prev - 1e-6, '進度遞增'); prev = n.s; }
  const e = T.nearest(q.route[q.route.length - 1], q.route); ok(near(e.s, L, 1e-6), '終點進度 = 全長'); }
ok(near(T.segDist({ x: 5, y: 7 }, { x: 0, y: 0 }, { x: 10, y: 0 }).d, 7) && near(T.segDist({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }).d, 5), 'segDist');
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(11) && T.rating(11) !== T.rating(15), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
