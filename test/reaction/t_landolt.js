const { game } = require('./load.js');
const G = game('reaction_landolt.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };

// 尺寸：視力 1.0＝40px、2.0＝20px、0.1＝400px；第 n 個 E 比前一個小到 90%（每一個都縮，不是三個才縮）
ok(T.sizeFor(1.0) === 40 && T.sizeFor(2.0) === 20 && Math.abs(T.sizeFor(0.1) - 400) < 1e-9, 'sizeFor');
ok(Math.abs(T.sizeAt(1) - 400) < 1e-9, 'first E = 400px');
for (let n = 2; n <= T.N_MAX; n++) ok(Math.abs(T.sizeAt(n) / T.sizeAt(n - 1) - 0.9) < 1e-12, 'shrink 90% at ' + n);
ok(Math.abs(T.sizeAt(4) - 400 * 0.9 * 0.9 * 0.9) < 1e-9, '4th = 400×0.9³');
// 視力往上、最後一個不超過 2.0，再多一個就超過
ok(T.acuityAt(T.N_MAX) <= 2.0 + 1e-9 && T.acuityAt(T.N_MAX + 1) > 2.0, 'N_MAX covers up to acuity 2.0 (N=' + T.N_MAX + ', last ' + T.acuityAt(T.N_MAX).toFixed(3) + ')');
// 時限線性
ok(Math.abs(T.timeAt(1) - 3.0) < 1e-9 && Math.abs(T.timeAt(T.N_MAX) - 1.2) < 1e-9, 'time ends');
const d1 = T.timeAt(1) - T.timeAt(2), d2 = T.timeAt(10) - T.timeAt(11); ok(Math.abs(d1 - d2) < 1e-9, 'time linear');
// 只有上下左右 4 個方向；每次方向一定不同
ok(JSON.stringify(T.DIRS) === '[0,90,180,270]', '4 directions only');
let prev = null; for (let i = 0; i < 5000; i++) { const d = T.nextDir(prev); ok(T.DIRS.indexOf(d) >= 0 && d !== prev, 'nextDir differs'); prev = d; }
const cnt = {}; prev = 0; for (let i = 0; i < 6000; i++) { prev = T.nextDir(prev); cnt[prev] = (cnt[prev] || 0) + 1; }
ok(Object.keys(cnt).length === 4 && Object.values(cnt).every(c => c > 1200), 'all 4 directions used evenly ' + JSON.stringify(cnt));
// 滑動方向 → 上下左右
ok(T.dirFromDelta(0, -30) === 0, 'up'); ok(T.dirFromDelta(30, 0) === 90, 'right'); ok(T.dirFromDelta(0, 30) === 180, 'down'); ok(T.dirFromDelta(-30, 0) === 270, 'left');
ok(T.dirFromDelta(30, -29) === 90, 'diag -> right (|dx|>|dy|)'); ok(T.dirFromDelta(10, -30) === 0, 'mostly up -> up');
for (let a = 0; a < 360; a++) { const dx = Math.sin(a * Math.PI / 180) * 40, dy = -Math.cos(a * Math.PI / 180) * 40; ok(T.DIRS.indexOf(T.dirFromDelta(dx, dy)) >= 0, 'sweep ' + a); }
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
