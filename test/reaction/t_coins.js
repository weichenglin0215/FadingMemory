const { game } = require('./load.js');
const G = game('reaction_coins.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
// 使用者範例
ok(T.countSolutions([50, 10, 5, 1], [3, 2, 4, 6], 137) === 1, 'user example unique');
// 各關規劃
const t0 = Date.now(); let fallbacks = 0;
for (let lv = 1; lv <= 20; lv++) {
  let gf = 0, decoy = 0, coinsSum = 0, Nmax = 0, maxTries = 0;
  for (let k = 0; k < 150; k++) {
    const q = T.plan(lv);
    if (q.tries === -1) fallbacks++;
    ok(T.countSolutions(q.den, q.a, q.N) === 1, 'unique lv' + lv);
    ok(q.c.every((x, i) => x <= q.a[i]), 'c<=a');
    ok(q.c.reduce((s, x, i) => s + x * q.den[i], 0) === q.N, 'sum N');
    ok(q.kinds.indexOf('tight') >= 0 && q.kinds.indexOf('loose') >= 0, 'has tight & loose lv' + lv);
    // 每一種 tight 都必須 a==c>=1；loose a>c>=1；decoy c==0&&a>=1
    q.kinds.forEach((kd, i) => { if (kd === 'tight') ok(q.a[i] === q.c[i] && q.c[i] >= 1, 'tight'); if (kd === 'loose') ok(q.a[i] > q.c[i] && q.c[i] >= 1, 'loose'); if (kd === 'decoy') { ok(q.c[i] === 0 && q.a[i] >= 1, 'decoy'); decoy++; } if (kd === 'none') ok(q.a[i] === 0 && q.c[i] === 0, 'none'); });
    ok((q.coins <= T.coinCap(lv) && q.coins >= T.coinMin(lv)) || q.tries === -1, 'cap lv' + lv + ' ' + q.coins + '/' + T.coinCap(lv));
    ok(JSON.stringify(q.den) === JSON.stringify(T.denomsFor(lv)) || q.tries === -1, 'den');
    if (q.greedyFails) gf++;
    coinsSum += q.coins; Nmax = Math.max(Nmax, q.N); maxTries = Math.max(maxTries, q.tries);
    // 直覺做法失敗標記是否正確
    const g = T.greedy(q.den, q.a, q.N);
    ok((g === null || g.some((x, i) => x !== q.c[i])) === q.greedyFails, 'gf flag');
  }
  console.log('lv' + lv, 'avg coins', (coinsSum / 150).toFixed(1), 'cap', T.coinCap(lv), 'N max', Nmax, 'greedyFail', gf + '/150', 'decoy', decoy, 'maxTries', maxTries, 'time', T.timeFor(lv).toFixed(1));
}
console.log('fallbacks', fallbacks, 'ms', Date.now() - t0);
// 擺放：能放下，互不重疊
const q = T.plan(15); const list = []; q.den.forEach((d, i) => { for (let k = 0; k < q.a[i]; k++) list.push(d); });
let overl = 0; for (let t = 0; t < 200; t++) { const p = T.scatter(list, 468, 520); for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) { const dx = p[i].x - p[j].x, dy = p[i].y - p[j].y, r = (T.SIZE[p[i].d] + T.SIZE[p[j].d]) / 2; if (dx * dx + dy * dy < r * r) { overl++; break; } } }
console.log('layouts with overlap:', overl, '/200 (coins ' + list.length + ')');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
