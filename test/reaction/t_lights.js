const { game } = require('./load.js');
const G = game('reaction_lights.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
ok(T.gridFor(3) === 3 && T.gridFor(4) === 3 && T.gridFor(5) === 4 && T.gridFor(8) === 4 && T.gridFor(9) === 5 && T.gridFor(15) === 5, 'grid');
const nA = T.N_START, nB = T.N_MAX, nM = (nA + nB) / 2; ok(T.showSecFor(nA) !== T.showSecFor(nB) && Math.abs(T.showSecFor(nM) - (T.showSecFor(nA) + T.showSecFor(nB)) / 2) < 1e-9 && T.showSecFor(nB + 10) === T.showSecFor(nB), 'show time is linear in N and clamps at N_MAX');
const d1 = T.showSecFor(3) - T.showSecFor(4), d2 = T.showSecFor(9) - T.showSecFor(10); ok(Math.abs(d1 - d2) < 1e-9, 'show linear');
ok(T.recallSecFor(3) === 7.4, 'recall');
for (let n = 3; n <= 15; n++) {
  const g = T.gridFor(n); const c = T.pickCells(g, n);
  ok(c.length === n && new Set(c).size === n && c.every(x => x >= 0 && x < g * g), 'cells n=' + n);
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
