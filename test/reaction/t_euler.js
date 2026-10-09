const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_euler.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 難度曲線
ok(T.edgesAt(1) === 6 && T.edgesAt(T.RAMP_LEVELS) === 20 && T.edgesAt(60) === 20, '邊數端點');
ok(T.timeMs(1) === 15000 && T.timeMs(T.RAMP_LEVELS) === 8000, '限時端點');
ok(near(T.counterFrac(1), 0.2) && near(T.counterFrac(T.RAMP_LEVELS), 0.6), '反直覺比例端點');
// 已知圖形：方形（4 個偶數點，能）、K4（4 個奇數點，不能）、房子（2 個奇數點，能）、不連通（不能）
const square = [[0, 1], [1, 5], [5, 4], [4, 0]], k4 = [[0, 1], [0, 4], [0, 5], [1, 4], [1, 5], [4, 5]], house = [[5, 6], [6, 10], [10, 9], [9, 5], [1, 5], [1, 6]];
ok(T.isEulerian(square) && T.oddNodes(square).length === 0, '方形能');
ok(!T.isEulerian(k4) && T.oddNodes(k4).length === 4, 'K4 不能');
ok(T.isEulerian(house) && T.oddNodes(house).length === 2, '房子能');
ok(!T.isEulerian([[0, 1], [10, 11]]) && !T.connected([[0, 1], [10, 11]]), '不連通不能');
// 候選邊：每格兩條斜線，同一格的斜線只選一條
{ const cs = T.candidates(); ok(cs.length === 2 * 4 * 3 + 2 * 9, '候選邊數 ' + cs.length); }
// 隨機走一條路：連通、邊不重複、每格最多一條斜線、必定能一筆畫
for (let i = 0; i < 1500; i++) {
  const E = 4 + (i % 18), g = T.randomTrail(E, rnd);
  ok(g.length <= E && g.length >= Math.min(E, 3) && T.connected(g), '連通且邊數 ≤ ' + E + '：' + g.length);
  ok(T.isEulerian(g), '走出來的路必定能一筆畫');
  ok(new Set(g.map(e => Math.min(e[0], e[1]) + '-' + Math.max(e[0], e[1]))).size === g.length, '邊不重複');
  const diag = {}; g.forEach(e => { const dr = Math.abs(Math.floor(e[0] / 4) - Math.floor(e[1] / 4)), dc = Math.abs(e[0] % 4 - e[1] % 4); if (dr === 1 && dc === 1) { const cell = Math.min(Math.floor(e[0] / 4), Math.floor(e[1] / 4)) * 4 + Math.min(e[0] % 4, e[1] % 4); ok(!diag[cell], '同一格最多一條斜線'); diag[cell] = 1; } });
}
// addEdge：加在現有的點上、不重複
{ const g = T.randomTrail(8, rnd); for (let i = 0; i < 100; i++) { const e = T.addEdge(g, rnd); ok(e && !g.some(x => (x[0] === e[0] && x[1] === e[1]) || (x[0] === e[1] && x[1] === e[0])), 'addEdge 不重複'); ok(g.some(x => x.indexOf(e[0]) >= 0 || x.indexOf(e[1]) >= 0), 'addEdge 接在現有的點上'); } }
// 出題：答案對、各約一半、奇數點與標記一致；反直覺題符合邊數界線
let yes = 0, total = 0, counter = 0, cOK = 0;
for (let l = 1; l <= 60; l++) for (let k = 0; k < 40; k++) {
  const want = rnd() < 0.5, q = T.makeGraph(l, rnd, want); total++;
  ok(q.yes === T.isEulerian(q.edges), '標記與判定一致');
  ok(q.yes === want || (q.edges.length === 6 || q.edges.length === 8), '要的答案出得來（保底除外）');
  ok(q.odd.join() === T.oddNodes(q.edges).join(), '奇數點');
  ok(T.connected(q.edges), '連通');
  if (q.yes) yes++;
  if (q.counter) { counter++; if (q.yes ? q.edges.length >= T.COMPLEX_MIN : q.edges.length <= T.SIMPLE_MAX) cOK++; }
  if (l >= 15) ok(Math.abs(q.edges.length - T.edgesAt(l)) <= 3 || q.counter, '邊數接近目標 ' + q.edges.length + ' vs ' + T.edgesAt(l));
}
ok(yes / total > 0.4 && yes / total < 0.6, '能／不能約一半：' + yes / total);
ok(counter > 100 && cOK === counter, '反直覺題 ' + counter + ' 題都符合邊數界線：' + cOK);
// 一筆畫路線：每條邊剛好走一次、相鄰、起點是奇數點（若有）
for (let i = 0; i < 400; i++) {
  const q = T.makeGraph(1 + (i % 60), rnd, true); const p = T.eulerPath(q.edges);
  ok(p && p.length === q.edges.length + 1, '路線長度 = 邊數 + 1');
  const used = new Set(); let good = true;
  for (let k = 1; k < p.length; k++) { const key = Math.min(p[k - 1], p[k]) + '-' + Math.max(p[k - 1], p[k]); if (used.has(key) || !q.edges.some(e => Math.min(e[0], e[1]) + '-' + Math.max(e[0], e[1]) === key)) good = false; used.add(key); }
  ok(good && used.size === q.edges.length, '每條邊剛好走一次');
  if (q.odd.length) ok(p[0] === q.odd[0] && p[p.length - 1] === q.odd[1], '從一個奇數點出發、在另一個結束');
}
ok(T.eulerPath(k4) === null, '不能一筆畫的圖沒有路線');
ok(T.rating(2) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log('反直覺題 ' + counter + ' / ' + total + '；能 ' + (yes / total * 100).toFixed(1) + '%');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
