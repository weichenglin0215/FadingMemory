const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_timestable.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
const typeSeen = {};
for (let i = 0; i < 6000; i++) {
  const tb = T.makeTable(rnd), t = tb.tampered;
  ok(t.length === T.FOUND, '被改 3 格');
  ok(new Set(t.map(c => c.a)).size === 3 && new Set(t.map(c => c.b)).size === 3, '三個不同的列、三個不同的行');
  t.forEach(c => {
    ok(c.a >= 2 && c.b >= 2 && c.a <= T.N && c.b <= T.N, '不在第 1 列／行');
    ok(c.a !== c.b, '不在對角線（要有對稱格可以交叉檢查）');
    ok(c.truth === c.a * c.b && c.shown !== c.truth && c.shown > 0, '改後 ≠ 正解、為正數');
    ok(!t.some(d => d !== c && d.a === c.b && d.b === c.a), '對稱格不是被改的格子');
    typeSeen[c.type] = (typeSeen[c.type] || 0) + 1;
  });
}
ok(T.TYPES.every(k => typeSeen[k] > 3000), '四種改法都常出現 ' + JSON.stringify(typeSeen));
// tamper：各改法的結果
ok(T.tamper(6, 7, 'swap', () => 0) === 24, '42 對調成 24');
ok(T.tamper(5, 5, 'swap', () => 0) === 52 && T.tamper(1, 1, 'swap', () => 0) === 2 && T.tamper(5, 11, 'swap', () => 0) === 56, '25→52；個位數或十位＝個位時改成 +1');
ok([43, 41].includes(T.tamper(6, 7, 'ones', rnd)) && [52, 32].includes(T.tamper(6, 7, 'tens', rnd)), 'ones／tens');
for (let i = 0; i < 50; i++) ok([36, 48, 35, 49].includes(T.tamper(6, 7, 'neighbor', rnd)), 'neighbor 是隔壁格的答案');
for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (const ty of T.TYPES) for (let k = 0; k < 6; k++) { const v = T.tamper(a, b, ty, rnd); ok(v !== a * b && v >= 1, 'tamper ' + a + '×' + b + ' ' + ty + ' → ' + v); }
ok(T.rating(5) !== T.rating(14) && T.rating(14) !== T.rating(25) && T.rating(25) !== T.rating(60), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
