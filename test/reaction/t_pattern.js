const { game } = require('./load.js');
const G = game('reaction_pattern.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
// between
ok(JSON.stringify(T.between(3, 0, 2)) === '[1]', '0->2 passes 1');
ok(JSON.stringify(T.between(3, 0, 8)) === '[4]', '0->8 passes 4');
ok(JSON.stringify(T.between(3, 0, 1)) === '[]', 'adjacent');
ok(JSON.stringify(T.between(3, 0, 5)) === '[]', 'knight move');
ok(JSON.stringify(T.between(3, 2, 6)) === '[4]', '2->6 passes 4');
ok(JSON.stringify(T.between(4, 0, 15)) === '[5,10]', '4x4 diagonal');
ok(JSON.stringify(T.between(4, 0, 3)) === '[1,2]', '4x4 row');
// validPath
ok(T.validPath(3, [0, 1, 2]), 'ok'); ok(!T.validPath(3, [0, 2]), '0->2 needs 1'); ok(T.validPath(3, [1, 0, 2]), 'jump over visited? 1,0,2 -> 0->2 passes 1 visited');
ok(!T.validPath(3, [0, 1, 0]), 'repeat');
// levels
ok(T.gridFor(1) === 3 && T.gridFor(6) === 3 && T.gridFor(7) === 4, 'grid'); ok(T.lenFor(1) === 4 && T.lenFor(6) === 9 && T.lenFor(7) === 8 && T.lenFor(13) === 14 && T.lenFor(20) === 14, 'len');
// 產生器：每一關、每個種子都能產生合法且長度正確的圖案
let n = 0;
for (let lv = 1; lv <= T.LEVEL_MAX; lv++) for (let k = 0; k < 150; k++) {
  const g = T.gridFor(lv), len = T.lenFor(lv); const p = T.genPath(g, len);
  n++; ok(p && p.length === len && T.validPath(g, p), 'gen lvl' + lv);
}
console.log('generated', n, bad ? 'FAILED ' + bad : 'ALL PASS');
