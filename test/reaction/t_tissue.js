const { game } = require('./load.js');
const G = game('reaction_tissue.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
// 紙捲半徑：p=0 滿、p=1 剩核、中間是平方根
ok(Math.abs(T.rollRadius(0) - 108) < 1e-9, 'R0'); ok(Math.abs(T.rollRadius(1) - 30) < 1e-9, 'R1');
ok(T.rollRadius(0.5) > (108 + 30) / 2, 'sqrt shrink slower than linear'); // 面積比例：中間半徑比線性中點大
// 手抖：停著微抖不會灌水
let pl = T.makePuller({ gain: 1 }); pl.start(100);
let total = 0; for (const y of [101, 100, 102, 101, 100, 103, 101, 102, 100, 101]) total += pl.feed(y);
ok(total === 3, '原地抖動只算淨前進 3，得到 ' + total);
// 往下 500，抬起 500+，再往下 500：兩筆，共 1000
pl = T.makePuller({ gain: 1 }); pl.start(0); total = 0;
for (let y = 0; y <= 500; y += 20) total += pl.feed(y);
for (let y = 500; y >= 0; y -= 20) total += pl.feed(y);
for (let y = 0; y <= 500; y += 20) total += pl.feed(y);
ok(Math.abs(total - 1000) < 1e-9, '兩筆各 500 共 1000，得到 ' + total); pl.end(); ok(pl.strokes() === 2, 'strokes=' + pl.strokes());
// 上抬小於 REVERSAL(6) 不算新的一筆：往下 100，上抬 5，再往下 5 → 只多算 0（回到最遠點之前）
pl = T.makePuller({ gain: 1 }); pl.start(0); total = pl.feed(100); total += pl.feed(95); total += pl.feed(100); total += pl.feed(104);
ok(total === 104, '小回頭不重算 ' + total);
// GAIN
pl = T.makePuller({ gain: 2 }); pl.start(0); ok(pl.feed(50) === 100, 'gain');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
