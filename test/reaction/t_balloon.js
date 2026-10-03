const { game } = require('./load.js');
const G = game('reaction_balloon.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
ok(T.capacityAt(0) === 0 && T.capacityAt(1 / 60) === 1 && T.capacityAt(2 / 60) === 3 && T.capacityAt(3 / 60) === 6, 'triangular');
ok(T.capacityAt(1) === 60 * 61 / 2, '1s = 1830');
ok(T.capacityAt(5.0) === 300 * 301 / 2, '5s');
// 單調、與幀率無關（純時間函式）
let prev = -1; for (let t = 0; t < 9; t += 0.013) { const c = T.capacityAt(t); ok(c >= prev, 'monotonic'); prev = c; }
ok(T.radiusAt(0) === 46 && T.radiusAt(9) === 200 && T.radiusAt(100) === 200 && Math.abs(T.radiusAt(4.5) - 123) < 1e-9, 'radius linear');
for (let i = 0; i < 1000; i++) { const b = T.makeBurst(); ok(b >= 3.5 && b <= 8.5, 'burst range'); }
// 最佳放手時間（Tb 均勻分布）
{ let bestT = 0, bestE = 0; for (let t = 0; t <= 8.5; t += 0.01) { const p = t <= 3.5 ? 1 : Math.max(0, (8.5 - t) / 5); const e = p * T.capacityAt(t); if (e > bestE) { bestE = e; bestT = t; } } console.log('optimal stop ≈', bestT.toFixed(2), 's (2/3·Bmax =', (2 / 3 * 8.5).toFixed(2) + ')', 'E=', Math.round(bestE)); }
console.log(T.rating(1), T.rating(0.85), T.rating(0.6), T.rating(0.1));
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
