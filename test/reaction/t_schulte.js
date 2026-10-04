const { game } = require('./load.js');
const G = game('reaction_schulte.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };

ok(T.SIDE === 6, '6x6');
let sorted = 0, posCount = new Array(36).fill(0);
for (let k = 0; k < 3000; k++) {
  const b = T.makeBoard();
  ok(b.length === 36, 'length 36');
  ok(new Set(b).size === 36 && Math.min(...b) === 1 && Math.max(...b) === 36, 'permutation of 1..36');
  if (b.every((v, i) => v === i + 1)) sorted++;
  posCount[b.indexOf(1)]++;
}
ok(sorted === 0, 'never already sorted');
ok(posCount.every(c => c > 3000 / 36 * 0.4), 'number 1 appears everywhere (random enough)');
ok(T.rating(30) === '眼力超強！' && T.rating(50) === '很快喔！' && T.rating(70) === '不錯！' && T.rating(100) === '慢慢找也很棒！', 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
