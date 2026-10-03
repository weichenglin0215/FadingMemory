const { game } = require('./load.js');
const G = game('reaction_landolt.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
ok(T.sizeFor(1.0) === 40 && T.sizeFor(2.0) === 20 && Math.abs(T.sizeFor(0.1) - 400) < 1e-9, 'sizes');
ok(Math.abs(T.timeFor(0) - 3.0) < 1e-9 && Math.abs(T.timeFor(12) - 1.2) < 1e-9, 'time ends');
// 線性：相鄰差相等
const d1 = T.timeFor(0) - T.timeFor(1), d2 = T.timeFor(5) - T.timeFor(6); ok(Math.abs(d1 - d2) < 1e-9, 'time linear');
ok(T.dirsFor(0).length === 4 && T.dirsFor(6).length === 4 && T.dirsFor(7).length === 8, 'diag from row 8');
const d4 = [0, 90, 180, 270], d8 = [0, 45, 90, 135, 180, 225, 270, 315];
ok(T.dirFromDelta(0, -30, d4) === 0, 'up'); ok(T.dirFromDelta(30, 0, d4) === 90, 'right'); ok(T.dirFromDelta(0, 30, d4) === 180, 'down'); ok(T.dirFromDelta(-30, 0, d4) === 270, 'left');
ok(T.dirFromDelta(30, -30, d8) === 45, 'up-right 8'); ok(T.dirFromDelta(-30, 30, d8) === 225, 'down-left 8'); ok(T.dirFromDelta(10, -30, d8) === 0, 'mostly up -> up');
// 4 向時斜向滑動歸到最近的 4 向
ok([0, 90].includes(T.dirFromDelta(30, -29, d4)), 'diag in 4-dir');
// 掃 360 度每個角度，8 向 / 4 向都不會回傳 undefined
for (let a = 0; a < 360; a++) { const dx = Math.sin(a * Math.PI / 180) * 40, dy = -Math.cos(a * Math.PI / 180) * 40; ok(d8.includes(T.dirFromDelta(dx, dy, d8)) && d4.includes(T.dirFromDelta(dx, dy, d4)), 'sweep ' + a); }
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
