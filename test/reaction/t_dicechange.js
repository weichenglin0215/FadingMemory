const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_dicechange.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261022); const rnd = rng(SEED);

// 骰子數：第 1 關 2 顆，每關 +1，最多 16
ok(T.diceFor(1) === 2 && T.diceFor(2) === 3 && T.diceFor(15) === 16 && T.diceFor(16) === 16 && T.diceFor(60) === 16, '骰子數 2 → 16');
for (let l = 2; l <= 15; l++) ok(T.diceFor(l) === T.diceFor(l - 1) + 1, '每關多一顆 ' + l);
// 被換掉的顆數：1 → 2 → 3 → 4，而且不超過骰子數的一半
ok(T.changedFor(1) === 1 && T.changedFor(5) === 1 && T.changedFor(6) === 2 && T.changedFor(12) === 2 && T.changedFor(13) === 3 && T.changedFor(24) === 3 && T.changedFor(25) === 4, '被換顆數');
for (let l = 1; l <= 60; l++) ok(T.changedFor(l) >= 1 && T.changedFor(l) <= Math.floor(T.diceFor(l) / 2), '不超過一半 ' + l);
// 時間：記憶顯示隨關卡縮短（同骰子數下）、作答時間依骰子數，全部合理
ok(T.COVER_MS === 3000, '蓋住 3 秒');
for (let l = 1; l <= 60; l++) { ok(T.showMs(l) >= 2000 && T.showMs(l) <= 9000, '記憶時間範圍 ' + l + '：' + T.showMs(l)); ok(T.ansMs(l) >= 5000, '作答時間 ' + l + '：' + T.ansMs(l)); }
for (let l = 16; l <= 59; l++) ok(T.showMs(l + 1) <= T.showMs(l), '骰子數到頂後，記憶時間單調縮短 ' + l);
ok(T.showMs(16) > T.showMs(30) && T.showMs(30) === T.showMs(60), '倍率 30 關到頂');
// 版面：欄數、格子大小、每顆都在區域內且互不重疊
ok(T.colsFor(2) === 2 && T.colsFor(3) === 3 && T.colsFor(4) === 2 && T.colsFor(5) === 3 && T.colsFor(9) === 3 && T.colsFor(10) === 4 && T.colsFor(16) === 4, '欄數');
for (let n = 2; n <= 16; n++) {
  const L = T.layout(n, 472, 520);
  ok(L.pos.length === n && L.cell >= 80 && L.cell <= 150, 'cell 大小 n=' + n + '：' + L.cell);
  L.pos.forEach((p, a) => {
    ok(p.x >= 0 && p.x + L.cell <= 472 && p.y >= 0 && p.y + L.cell <= 520, '在區域內 n=' + n);
    for (let b = a + 1; b < n; b++) { const q = L.pos[b]; ok(Math.abs(p.x - q.x) >= L.cell || Math.abs(p.y - q.y) >= L.cell, '不重疊 n=' + n); }
  });
}
// 整關：被換掉的點數只差 1、其餘不變、位置不變
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd);
  ok(q.n === T.diceFor(lv) && q.before.length === q.n && q.after.length === q.n, '顆數');
  ok(q.changed.length === T.changedFor(lv) && new Set(q.changed).size === q.changed.length, '被換顆數');
  q.before.forEach((v, k) => {
    ok(v >= 1 && v <= 6 && q.after[k] >= 1 && q.after[k] <= 6, '點數 1～6');
    if (q.changed.includes(k)) ok(Math.abs(q.after[k] - v) === 1, '被換的只差 1：' + v + '→' + q.after[k]); else ok(q.after[k] === v, '沒被換的不變');
  });
  ok(q.changed.every((c, k) => k === 0 || c > q.changed[k - 1]), '由小到大');
}
// 每個點數都會被換到、1 只會變 2、6 只會變 5
const seen = {}; for (let i = 0; i < 3000; i++) { const q = T.makeLevel(10, rnd); q.changed.forEach(c => { seen[q.before[c] + '>' + q.after[c]] = 1; }); }
ok(Object.keys(seen).length === 10 && seen['1>2'] && seen['6>5'] && !seen['1>0'] && !seen['6>7'], '所有可能的換法：' + Object.keys(seen).sort());
// 骰子圖：每個點數畫出對的點數
for (let v = 1; v <= 6; v++) ok((T.dieSvg(v).match(/dce-pip/g) || []).length === v, '骰子 ' + v + ' 點');
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
