const { game } = require('./load.js');
const G = game('reaction_cups.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
ok(T.cupsFor(1) === 3 && T.cupsFor(3) === 3 && T.cupsFor(4) === 4 && T.cupsFor(10) === 6 && T.cupsFor(13) === 7 && T.cupsFor(99) === 7, 'cups');
ok(T.swapsFor(1) === 5 && T.swapsFor(2) === 7 && T.swapsFor(100) === 60, 'swaps');
ok(Math.abs(T.swapSecFor(50) - T.swapSecFor(20)) < 1e-9 && Math.abs(T.swapSecFor(10.5) - (T.swapSecFor(1) + T.swapSecFor(20)) / 2) < 1e-9 && T.swapSecFor(1) > T.swapSecFor(20), 'swap seconds shrink linearly and clamp');
let pairsSeen = 0, total = 0;
for (let lvl = 1; lvl <= 30; lvl++) {
  const n = T.cupsFor(lvl), cnt = T.swapsFor(lvl);
  for (let k = 0; k < 40; k++) {
    const ball = Math.floor(Math.random() * n);
    const pr = lvl >= 8;
    const { steps, finalBall } = T.makeSwaps(n, cnt, pr, ball);
    total++;
    ok(T.applySwaps(steps, ball) === finalBall, 'finalBall lvl' + lvl);
    let sw = 0;
    steps.forEach(st => {
      sw += st.length;
      ok(st.length === 1 || st.length === 2, 'step len');
      const used = new Set(); st.forEach(p => { ok(p[0] !== p[1], 'a!=b'); ok(!used.has(p[0]) && !used.has(p[1]), 'disjoint'); used.add(p[0]); used.add(p[1]); ok(p[0] < n && p[1] < n, 'range'); });
      if (st.length === 2) pairsSeen++;
    });
    ok(sw === cnt, 'swap count ' + sw + '/' + cnt + ' lvl ' + lvl);
    if (!pr) ok(steps.every(st => st.length === 1), 'no pairs before lvl 8');
  }
}
ok(pairsSeen > 0, 'pairs appear at high levels');
console.log('runs', total, 'pairs', pairsSeen, bad ? 'FAILED ' + bad : 'ALL PASS');
