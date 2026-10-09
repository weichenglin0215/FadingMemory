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
// 慣性滑落（V1.21.0）：INERTIA 預設 0.8＝放手後每 100 毫秒剩 80% 速度
ok(T.INERTIA === 0.8, '慣性預設 0.8：' + T.INERTIA);
// 放手速度：最後 90 毫秒內 y 從 100 滑到 280（180px／90ms＝2px／ms）
const smp = []; for (let i = 0; i <= 12; i++) smp.push({ t: 1000 + i * 8, y: 100 + i * 15 });
ok(Math.abs(T.releaseSpeed(smp, 90) - 15 / 8) < 1e-9, '放手速度＝' + T.releaseSpeed(smp, 90));
ok(T.releaseSpeed([{ t: 0, y: 0 }], 90) === 0 && T.releaseSpeed([], 90) === 0, '少於兩個樣本＝0');
ok(T.releaseSpeed([{ t: 0, y: 10 }, { t: 2, y: 50 }], 90) === 0, '時間差太短（小於 8 毫秒）＝0，不要誤判');
ok(T.releaseSpeed([{ t: 0, y: 50 }, { t: 40, y: 20 }], 90) === 0, '往上放手＝0，不會倒滑');
// 慣性衰減：0.1 秒剩 0.8、0.2 秒剩 0.64；跟影格切法無關（切成 1 毫秒一格再乘起來結果一樣）
ok(Math.abs(T.glideSpeed(2, 100, 0.8) - 1.6) < 1e-9 && Math.abs(T.glideSpeed(2, 200, 0.8) - 1.28) < 1e-9, '衰減：' + T.glideSpeed(2, 100, 0.8));
let vv = 2; for (let i = 0; i < 300; i++) vv = T.glideSpeed(vv, 1, 0.8);
ok(Math.abs(vv - T.glideSpeed(2, 300, 0.8)) < 1e-9, '衰減與切法無關');
ok(T.glideSpeed(2, 100, 0) === 0, 'INERTIA=0 → 立刻停');
ok(T.glideSpeed(2, 100, 1) < 2, 'INERTIA=1（上限壓在 0.999）也一定會停');
// 總滑行距離：v0／(−ln k)×100 毫秒（積分），預設 2px／ms 放手大約滑 897 px，約一個螢幕
let dist = 0; vv = 2; for (let t = 0; vv >= T.INERTIA_MIN_V && t < 60000; t += 16) { vv = T.glideSpeed(vv, 16, 0.8); dist += vv * 16; }
ok(dist > 600 && dist < 1000, '預設慣性從 2px／ms 放手，總共滑 ' + dist.toFixed(0) + ' px');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
