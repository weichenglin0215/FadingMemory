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
// 連續控制
{ const hist = []; let run = 1, maxRun = 1;
  for (let i = 0; i < 20000; i++) { const w = T.nextLeft(hist, rnd); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_MAX, '連續最多 ' + maxRun); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
