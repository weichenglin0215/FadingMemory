const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_orderops.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261012); const rnd = rng(SEED);
const jsEval = (tokens) => Function('return ' + tokens.map(t => typeof t === 'number' ? String(t) : t).join(' '))();

// 難度：數字個數、數字大小線性；括號、除法依題號解鎖；限時
ok(T.numsFor(1) === 3 && T.numsFor(T.RAMP_LEVELS) === 6 && T.numsFor(60) === 6, '數字個數 3 → 6');
for (let l = 2; l <= 60; l++) ok(T.numsFor(l) >= T.numsFor(l - 1) && T.numMaxFor(l) >= T.numMaxFor(l - 1), '單調 ' + l);
ok(T.numMaxFor(1) === 9 && T.numMaxFor(T.RAMP_LEVELS) === 12, '數字大小 9 → 12');
ok(T.parensFor(1, 3) === 0 && T.parensFor(8, 4) === 1 && T.parensFor(8, 3) === 0 && T.parensFor(20, 5) === 2 && T.parensFor(20, 4) === 1, '括號解鎖');
ok(T.ansMs(1) >= 4000, '第 1 題至少 4 秒：' + T.ansMs(1));
for (let l = 1; l <= 60; l++) ok(T.ansMs(l) >= 3500, '每題至少 3.5 秒 ' + l + '：' + T.ansMs(l));
// 還原器：跟 JavaScript 自己的運算順序比對（標準答案不能錯）
{
  let cnt = 0;
  for (let i = 0; i < 6000; i++) {
    const lv = 1 + (i % 60), q = T.randomTokens(lv, rnd);
    const r = T.reduceExpr(q.tokens, 'std');
    if (r.bad) continue;
    const j = jsEval(q.tokens);
    ok(Math.abs(r.value - j) < 1e-9, 'std 與 JS 一致 ' + T.toText(q.tokens) + ' → ' + r.value + ' vs ' + j);
    const nop = T.reduceExpr(q.tokens, 'noparen');
    if (!nop.bad) ok(Math.abs(nop.value - jsEval(q.tokens.filter(t => t !== '(' && t !== ')'))) < 1e-9, 'noparen 與 JS 一致');
    cnt++;
  }
  ok(cnt > 5000, '還原器測了 ' + cnt);
}
ok(T.reduceExpr([8, '-', 3, '*', 2], 'std').value === 2 && T.reduceExpr([8, '-', 3, '*', 2], 'ltr').value === 10, '8−3×2 範例');
ok(T.reduceExpr([2, '*', '(', 3, '+', 4, ')'], 'std').value === 14 && T.reduceExpr([2, '*', '(', 3, '+', 4, ')'], 'noparen').value === 10 && T.reduceExpr([2, '*', '(', 3, '+', 4, ')'], 'ltr').value === 14, '括號範例');
ok(T.toText([8, '-', 3, '*', 2]) === '8 − 3 × 2' && T.toText(['(', 3, '+', 4, ')', '*', 2]) === '(3 + 4) × 2' && T.toText([2, '/', '(', 1, '+', 1, ')']) === '2 ÷ (1 + 1)', '算式文字');
ok(T.stepsText(['3 × 2 ＝ 6', '8 − 6 ＝ 2']) === '① 3 × 2 ＝ 6　② 8 − 6 ＝ 2', '步驟文字');
// 整題驗證：8000 題
const stat = { div: 0, paren: 0, ltr: 0, noparen: 0 };
for (let i = 0; i < 8000; i++) {
  const lv = 1 + (i % 60), q = T.makeQuestion(lv, rnd);
  const std = T.reduceExpr(q.tokens, 'std');
  ok(!std.bad && !std.frac && !std.neg, '正解的每一步都是整數、不是負數：' + q.text);
  ok(std.value === q.truth && Number.isInteger(q.truth) && q.truth >= 0 && q.truth <= T.MAX_ANS, '正解 ' + q.text + '＝' + q.truth);
  ok(Math.abs(jsEval(q.tokens) - q.truth) < 1e-9, '正解與 JS 一致 ' + q.text);
  ok(Number.isInteger(q.decoy) && q.decoy >= 0 && q.decoy !== q.truth, '錯誤答案是不同的非負整數：' + q.text + ' → ' + q.decoy);
  const d = T.reduceExpr(q.tokens, q.decoyKind);
  ok(d.value === q.decoy, '錯誤答案確實是那種錯誤算法的結果');
  ok(q.tokens.filter(t => typeof t === 'number').length === T.numsFor(lv) || q.text === '8 − 3 × 2', '數字個數 ' + lv);
  ok(q.tokens.some(t => t === '*' || t === '/'), '一定有乘除');
  ok(lv >= T.DIV_FROM || !q.tokens.includes('/'), '除法從第 ' + T.DIV_FROM + ' 題才出現');
  ok(q.steps.length === q.tokens.filter(t => typeof t === 'number').length - 1, '步驟數＝運算符號數');
  if (q.tokens.includes('/')) stat.div++; if (q.tokens.includes('(')) stat.paren++; stat[q.decoyKind]++;
}
ok(stat.div > 1500, '除法有出現：' + stat.div); ok(stat.paren > 1500, '括號有出現：' + stat.paren); ok(stat.ltr > 1000 && stat.noparen > 300, '兩種錯法都有：' + JSON.stringify(stat));
// 沒有括號的前期題目：不會有括號
for (let i = 0; i < 400; i++) ok(!T.makeQuestion(1 + (i % 7), rnd).tokens.includes('('), '前 7 題沒有括號');
// 答案個數：前面 2 個、第 OPTIONS4_FROM 題起 4 個；四個答案＝正確、正確的近似、錯誤、錯誤的近似（近似的只差個位數、個位數放成另一邊的）
ok(T.optionCount(1) === 2 && T.optionCount(T.OPTIONS4_FROM - 1) === 2 && T.optionCount(T.OPTIONS4_FROM) === 4 && T.optionCount(60) === 4, '答案個數 2 → 4');
{
  let four = 0, swapped = 0, nearSame = 0;
  for (let i = 0; i < 6000; i++) {
    const lv = 1 + (i % 60), q = T.makeQuestion(lv, rnd);
    ok(q.options.length === T.optionCount(lv), '答案個數 ' + lv + '：' + q.options.length);
    ok(new Set(q.options).size === q.options.length && q.options.every(v => Number.isInteger(v) && v >= 0), '答案互不相同、都是非負整數：' + q.options);
    ok(q.options.includes(q.truth) && q.options.includes(q.decoy), '答案裡有正確與錯誤');
    if (q.options.length === 4) {
      four++;
      const [t, tn, d, dn] = q.options;
      ok(t === q.truth && d === q.decoy, '順序 正確、近似、錯誤、近似');
      ok(Math.floor(tn / 10) === Math.floor(t / 10) && tn % 10 !== t % 10, '正確的近似只差個位數：' + t + ' → ' + tn);
      ok(Math.floor(dn / 10) === Math.floor(d / 10) && dn % 10 !== d % 10, '錯誤的近似只差個位數：' + d + ' → ' + dn);
      if (tn % 10 === d % 10 && dn % 10 === t % 10) swapped++;
      if (t % 10 === d % 10) nearSame++;
    }
  }
  ok(four > 2500, '四個答案的題目有出現：' + four);
  ok(swapped > (four - 0) * 0.6, '近似答案的個位數多半放成另一邊的個位數：' + swapped + '／' + four + '（正確與錯誤同個位數的 ' + nearSame + ' 題不算）');
  // nearAnswer：個位數不同、同十位、不撞排除的數、不是 0
  for (let i = 0; i < 3000; i++) {
    const v = rnd() < 0.2 ? Math.floor(rnd() * 10) : Math.floor(rnd() * 1999), ex = [v, Math.floor(rnd() * 2000)];
    const c = T.nearAnswer(v, ex, Math.floor(rnd() * 10), rnd);
    ok(c != null && c !== v && !ex.includes(c) && c >= 1 && Math.floor(c / 10) === Math.floor(v / 10), 'nearAnswer ' + v + ' → ' + c);
  }
  ok(T.nearAnswer(42, [42, 40], 0, () => 0.5) !== 40 && T.nearAnswer(42, [42], 0, () => 0.5) === 40, 'nearAnswer 想要的個位數能用就用、被排除就換一個');
}
// 位置：連續控制（同一個位置最多連續 SAME_MAX 次），而且每個位置都會出現
for (const count of [2, 4]) {
  const hist = []; let run = 1, maxRun = 1; const seen = new Set();
  for (let i = 0; i < 20000; i++) { const w = T.nextSlot(hist, count, rnd); ok(Number.isInteger(w) && w >= 0 && w < count, 'slot 範圍'); seen.add(w); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_MAX, count + ' 個位置，連續最多 ' + maxRun); ok(seen.size === count, count + ' 個位置都會出現');
}
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
