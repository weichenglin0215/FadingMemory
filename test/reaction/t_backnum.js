const { game } = require('./load.js');
const G = game('reaction_backnum.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 第 1、2 關 3 個，之後每過兩關才多 1 個（第 3、4 關 4 個、第 5、6 關 5 個…）
ok(T.SEQ_START === 3 && T.SEQ_EVERY === 2, 'SEQ_START / SEQ_EVERY');
const exp = { 1: 3, 2: 3, 3: 4, 4: 4, 5: 5, 6: 5, 7: 6, 8: 6, 9: 7, 10: 7, 20: 12, 21: 13 };
for (const l in exp) ok(T.seqLen(+l) === exp[l], 'seqLen level ' + l + ' = ' + T.seqLen(+l) + '（應為 ' + exp[l] + '）');
// 長度只會不變或 +1，而且「連續兩關」才加一個
for (let l = 1; l < 60; l++) { const d = T.seqLen(l + 1) - T.seqLen(l); ok(d === 0 || d === 1, 'seqLen step 0/1 at ' + l); ok(d === (l % 2 === 0 ? 1 : 0), 'seqLen grows right after every second level (level ' + l + ')'); }
// 沒有「機會」這個概念了：按錯一次就結束
ok(T.chances === undefined, 'chances() 已取消（按錯一次就結束）');
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
