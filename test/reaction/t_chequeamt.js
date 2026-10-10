const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_chequeamt.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261017); const rnd = rng(SEED);

// 大寫寫法的已知例子
const cases = { 4308: '肆仟參佰零捌元整', 4038: '肆仟零參拾捌元整', 4300: '肆仟參佰元整', 4008: '肆仟零捌元整', 1010: '壹仟零壹拾元整', 10: '壹拾元整', 100: '壹佰元整', 20300: '貳萬零參佰元整',
  100000: '壹拾萬元整', 20030: '貳萬零參拾元整', 12000: '壹萬貳仟元整', 10005: '壹萬零伍元整', 10100: '壹萬零壹佰元整', 1: '壹元整', 99999999: '玖仟玖佰玖拾玖萬玖仟玖佰玖拾玖元整', 1002003: '壹佰萬貳仟零參元整', 30000: '參萬元整', 5000000: '伍佰萬元整', 80080: '捌萬零捌拾元整' };
for (const k of Object.keys(cases)) ok(T.upper(Number(k)) === cases[k], 'upper(' + k + ') = ' + T.upper(Number(k)) + ' 應為 ' + cases[k]);
// 來回：5 萬個隨機金額 ＋ 全部 1～20000
for (let n = 1; n <= 20000; n++) ok(T.fromUpper(T.upper(n)) === n, '來回 ' + n);
for (let i = 0; i < 30000; i++) { const n = 1 + Math.floor(rnd() * 99999999); ok(T.fromUpper(T.upper(n)) === n, '來回 ' + n + ' ' + T.upper(n)); }
ok(T.withCommas(4308) === '4,308' && T.withCommas(1234567) === '1,234,567' && T.withCommas(100) === '100', '千分位');
// 位數與限時
ok(T.digitsFor(1) === 4 && T.digitsFor(T.RAMP_LEVELS) === 8 && T.digitsFor(60) === 8, '位數 4 → 8');
for (let l = 2; l <= 60; l++) ok(T.digitsFor(l) >= T.digitsFor(l - 1), '位數單調');
for (let l = 1; l <= 60; l++) ok(T.ansMs(l) >= 8000, '限時下限 ' + l + '：' + T.ansMs(l));
// 隨機金額：位數正確、中間有零的比例隨題號上升
for (const d of [4, 5, 6, 7, 8]) for (let i = 0; i < 500; i++) { const n = T.randomAmount(d, 0.5, rnd); ok(String(n).length === d && n >= Math.pow(10, d - 1), '位數 ' + d); }
function zeroRate(lv) { let z = 0; for (let i = 0; i < 4000; i++) { const s = String(T.randomAmount(T.digitsFor(lv), 0, rnd)); if (s.slice(1, -1).includes('0')) z++; } return z / 4000; }
ok(zeroRate(1) === 0, 'zeroP=0 時中間不會有零');
function zeroRateQ(lv) { let z = 0; for (let i = 0; i < 4000; i++) { const q = T.makeQuestion(lv, rnd, true); if (String(q.amount).slice(1, -1).includes('0')) z++; } return z / 4000; }
ok(zeroRateQ(30) > zeroRateQ(1) + 0.2, '中間有零的比例隨題號上升：' + zeroRateQ(1).toFixed(2) + ' → ' + zeroRateQ(30).toFixed(2));
// nearAmount：不等於原本、範圍
for (let i = 0; i < 20000; i++) {
  const d = 4 + (i % 5), n = T.randomAmount(d, 0.5, rnd), m = T.nearAmount(n, rnd(), rnd);
  ok(Number.isInteger(m) && m !== n && m >= 1000 && m < 100000000, 'nearAmount ' + n + '→' + m);
}
// 整題：match 與畫面文字一致；不符時大寫是另一個金額的正確大寫
let mt = 0;
for (let i = 0; i < 8000; i++) {
  const lv = 1 + (i % 60), want = rnd() < 0.5, q = T.makeQuestion(lv, rnd, want);
  ok(q.right === T.upper(q.amount) && q.small === 'NT$ ' + T.withCommas(q.amount), '小寫與正確大寫');
  ok(q.match === (q.written === q.right) && q.match === want, '相符與否 ' + q.small + ' ' + q.written);
  if (!q.match) ok(q.written === T.upper(q.otherAmount) && q.otherAmount !== q.amount && T.fromUpper(q.written) === q.otherAmount && T.fromUpper(q.written) !== q.amount, '不符的大寫是另一個合法金額');
  else ok(T.fromUpper(q.written) === q.amount, '相符的大寫讀回來一致');
  ok(String(q.amount).length === T.digitsFor(lv), '位數');
  if (q.match) mt++;
}
ok(mt === 4000 || (mt > 3600 && mt < 4400), '相符約一半：' + mt);
// 難度：前期「多／少一個零」的錯法較常見
function magRate(hard) { let n = 0; for (let i = 0; i < 4000; i++) { const x = T.randomAmount(5, 0.5, rnd), m = T.nearAmount(x, hard, rnd); if (String(m).length !== String(x).length) n++; } return n / 4000; }
ok(magRate(0) > magRate(1) + 0.25, '位數差一位的錯法隨題號減少：' + magRate(0).toFixed(2) + ' → ' + magRate(1).toFixed(2));
// diffMark
ok(T.diffMark('肆仟參佰零捌元整', '肆仟零參拾捌元整') === '肆仟<b class="chq-diff">零參拾</b>捌元整' || T.diffMark('肆仟參佰零捌元整', '肆仟零參拾捌元整').includes('chq-diff'), 'diffMark：' + T.diffMark('肆仟參佰零捌元整', '肆仟零參拾捌元整'));
{ const hist = []; let run = 1, maxRun = 1;
  for (let i = 0; i < 20000; i++) { const w = T.nextMatch(hist, rnd); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_MAX, '連續最多 ' + maxRun); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
