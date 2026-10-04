const { game } = require('./load.js');
const G = game('reaction_backnum.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 第 1 關 3 個，每關 +1
ok(T.seqLen(1) === 3 && T.seqLen(2) === 4 && T.seqLen(10) === 12, 'seqLen');
// 錯誤機會：第 1 關 1 次，之後每 3 關 +1（第 4 關 2 次、第 7 關 3 次）
const exp = { 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2, 7: 3, 10: 4, 13: 5 };
for (const l in exp) ok(T.chances(+l) === exp[l], 'chances level ' + l + ' = ' + T.chances(+l));
// 亮燈速度線性
ok(near(T.litSec(1), 0.7) && near(T.litSec(15), 0.45) && near(T.litSec(8), 0.575, 1e-9) && T.litSec(50) === T.litSec(15), 'litSec linear');
// 序列
for (let L = 3; L <= 20; L++) {
  for (let k = 0; k < 300; k++) {
    const s = T.makeSeq(L);
    ok(s.length === L && s.every(n => n >= 1 && n <= 9), 'seq length/range ' + L);
    for (let i = 1; i < s.length; i++) ok(s[i] !== s[i - 1], 'no immediate repeat L=' + L);
    if (L <= 9) ok(new Set(s).size === L, 'distinct when L<=9');
    const r = T.reversed(s);
    ok(r.length === L && r.every((n, i) => n === s[L - 1 - i]), 'reversed');
    ok(s.join() === T.reversed(r).join(), 'reverse is involution');
  }
}
// 每個格子都有機會成為第一個
const first = {}; for (let k = 0; k < 3000; k++) { const f = T.makeSeq(3)[0]; first[f] = (first[f] || 0) + 1; }
ok(Object.keys(first).length === 9 && Object.values(first).every(c => c > 200), 'first cell uniform ' + JSON.stringify(first));
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
