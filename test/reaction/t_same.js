const { game } = require('./load.js');
const G = game('reaction_same.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 時間與相似度：線性
ok(near(T.showSec(1), 1.0) && near(T.showSec(30), 0.5) && near(T.showSec(15.5), 0.75, 1e-9) && T.showSec(99) === T.showSec(30), 'show 1.0 -> 0.5 linear');
ok(near(T.blankSec(1), 0.5) && near(T.blankSec(30), 1.0), 'blank 0.5 -> 1.0');
ok(near(T.askSec(1), 4) && near(T.askSec(30), 2), 'ask 4 -> 2');
ok(near(T.simP(1), 0) && near(T.simP(30), 0.85), 'similarity 0 -> 0.85');
// 題型解鎖
ok(JSON.stringify(T.unlockedTypes(1)) === '["fruit"]' && JSON.stringify(T.unlockedTypes(6)) === '["fruit"]', 'q1-6 fruit only');
ok(T.unlockedTypes(7).join() === 'fruit,shape' && T.unlockedTypes(13).join() === 'fruit,shape,number' && T.unlockedTypes(19).join() === 'fruit,shape,number,expr', 'unlock order');
// 每 10 題 5 題相同
for (let k = 0; k < 200; k++) { const f = T.sameFlags(); ok(f.length === 10 && f.filter(Boolean).length === 5, 'sameFlags 5/5'); }

// 算式求值（驗證文字真的等於它宣稱的 value）
function evalExpr(t) {
  const m = t.match(/^(\d+) ([+−×÷]) (\d+)$/);
  if (!m) return NaN;
  const a = +m[1], b = +m[3];
  return m[2] === '+' ? a + b : m[2] === '−' ? a - b : m[2] === '×' ? a * b : (a % b === 0 ? a / b : NaN);
}
const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const stat = { fruit: 0, shape: 0, number: 0, expr: 0 };
let maxShapeRatio = 0, minShapeRatioQ30 = 99, ratios1 = [], ratios30 = [];
for (let q = 1; q <= 60; q++) {
  for (let k = 0; k < 150; k++) {
    for (const same of [true, false]) {
      const Q = T.makeQuestion(q, same);
      stat[Q.type]++;
      ok(T.unlockedTypes(q).includes(Q.type), 'type unlocked q' + q + ' ' + Q.type);
      ok(Q.same === same, 'same flag');
      if (Q.type === 'fruit') {
        ok((Q.A.fruit === Q.B.fruit) === same, 'fruit same/diff q' + q);
        ok(T.FRUITS.includes(Q.A.fruit) && T.FRUITS.includes(Q.B.fruit), 'fruit known');
      } else if (Q.type === 'shape') {
        const A = Q.A, B = Q.B;
        ok(A.scale >= 0.35 - 1e-9 && A.scale <= 1.0001 && B.scale >= 0.35 - 1e-9 && B.scale <= 1.0001, 'scale range');
        if (Q.attr === 'size') {
          ok(same ? near(A.scale, B.scale) : !near(A.scale, B.scale), 'size same/diff');
          if (!same) { const r = Math.max(A.scale, B.scale) / Math.min(A.scale, B.scale); if (q === 7) ratios1.push(r); if (q === 30) ratios30.push(r); }
        }
        if (Q.attr === 'shape') ok((A.shape === B.shape) === same, 'shape same/diff');
        if (Q.attr === 'color') {
          ok(same ? near(A.hue, B.hue) : hueDiff(A.hue, B.hue) > 15, 'color same/diff q' + q + ' ' + hueDiff(A.hue, B.hue));
        }
      } else if (Q.type === 'number') {
        ok((Q.A.value === Q.B.value) === same, 'number same/diff');
        ok(String(Q.A.value) === Q.A.text && String(Q.B.value) === Q.B.text, 'number text');
        ok(Q.A.text.length === (q < T.UNLOCK.expr1 ? 2 : 3), 'digits by stage');
      } else {
        ok(evalExpr(Q.A.text) === Q.A.value && evalExpr(Q.B.text) === Q.B.value, 'expr text evaluates to value: ' + Q.A.text + ' / ' + Q.B.text);
        ok((Q.A.value === Q.B.value) === same, 'expr same/diff value');
        ok(Q.A.text !== Q.B.text, 'expr texts differ even when equal');
        if (q < T.UNLOCK.expr2) ok(!/[×÷]/.test(Q.A.text + Q.B.text), 'no x/÷ before unlock');
        if (!same) ok(Math.abs(Q.A.value - Q.B.value) <= 3, 'expr values close');
      }
    }
  }
}
ok(stat.fruit > 0 && stat.shape > 0 && stat.number > 0 && stat.expr > 0, 'all types appear ' + JSON.stringify(stat));
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
ok(avg(ratios1) > avg(ratios30) + 0.2, 'size difference shrinks with q (q7 ' + avg(ratios1).toFixed(2) + ' -> q30 ' + avg(ratios30).toFixed(2) + ')');
// nearNumber
for (let k = 0; k < 3000; k++) {
  const n = 10 + Math.floor(Math.random() * 990), m = T.nearNumber(n, Math.random);
  ok(m !== n && String(m).length === String(n).length && String(m)[0] !== '0', 'nearNumber ' + n + '->' + m);
}
// ×÷ 算式一定整除、質數不用乘法
ok(T.exprFor(13, '×', Math.random) === null, 'prime has no multiplication');
for (let k = 0; k < 300; k++) { const t = T.exprFor(36, '÷', Math.random); if (t) ok(evalExpr(t) === 36, 'division exact ' + t); }
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
