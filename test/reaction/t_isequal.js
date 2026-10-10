const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_isequal.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261011); const rnd = rng(SEED);

// 限時：線性、第 RAMP_LEVELS 題到頂
ok(T.ansMs(1) === 7000 && T.ansMs(T.RAMP_LEVELS) === 3500 && T.ansMs(T.MAX_LEVEL) === 3500, '限時端點 7 → 3.5 秒');
for (let l = 2; l <= T.MAX_LEVEL; l++) ok(T.ansMs(l) <= T.ansMs(l - 1), '限時單調不增 ' + l);
ok(Math.abs(T.ansMs(16) - (7000 + 3500) / 2) < 200, '中點約等於平均（線性）');
// 基本轉換
ok(T.ratToDec({ n: 3, d: 8 }) === '0.375' && T.ratToDec({ n: 1, d: 2 }) === '0.5' && T.ratToDec({ n: 1, d: 125 }) === '0.008' && T.ratToDec({ n: 7, d: 80 }) === '0.0875', '分數→小數');
ok(T.ratToPct({ n: 3, d: 8 }) === '37.5%' && T.ratToPct({ n: 1, d: 5 }) === '20%' && T.ratToPct({ n: 1, d: 125 }) === '0.8%', '分數→百分比');
ok(T.ratToFrac({ n: 6, d: 16 }) === '3/8', '約分');
ok(T.normDec('03.750') === '3.75' && T.normDec('0.0') === '0' && T.normDec('10.0') === '10' && T.normDec('.5') === '0.5', 'normDec');
ok(T.ratEq(T.parseForm('frac', '3/8'), T.parseForm('dec', '0.375')) && T.ratEq(T.parseForm('pct', '37.5%'), T.parseForm('dec', '0.375')) && !T.ratEq(T.parseForm('dec', '0.357'), T.parseForm('frac', '3/8')), 'parseForm/ratEq');
// 分母與寫法組合隨題號解鎖
ok(T.densFor(1).join() === '2,4,5,10' && T.densFor(6).indexOf(8) >= 0 && T.densFor(13).indexOf(25) >= 0 && T.densFor(21).indexOf(125) >= 0 && T.densFor(20).indexOf(125) < 0, '分母解鎖');
ok(T.pairsFor(1).length === 1 && T.pairsFor(5).length === 3 && T.pairsFor(11).length === 6, '寫法組合解鎖');
// 每種分母都能寫成有限小數、而且小數轉回來還是原來的分數
for (const d of [2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 80, 125]) for (let n = 1; n < d; n++) {
  const r = { n, d };
  const back = T.parseForm('dec', T.ratToDec(r)), back2 = T.parseForm('pct', T.ratToPct(r));
  ok(T.ratEq(back, r) && T.ratEq(back2, r), '往返 ' + n + '/' + d);
}
// 整題驗證：標準答案一定跟畫面上的字一致（8000 題、全部關卡）
let eqCount = 0, tot = 0;
for (let i = 0; i < 8000; i++) {
  const level = 1 + (i % 60), want = rnd() < 0.5;
  const q = T.makeQuestion(level, rnd, want);
  const A = T.parseForm(q.left.form, q.left.text), B = T.parseForm(q.right.form, q.right.text);
  ok(q.isEqual === T.ratEq(A, B), '標準答案與畫面一致 ' + q.left.text + '＝' + q.right.text);
  ok(q.isEqual === want, '要的對錯與題目一致 ' + q.left.text + '＝' + q.right.text + ' want ' + want);
  ok(q.left.form !== q.right.form, '兩邊寫法不同 ' + q.left.text + ' ' + q.right.text);
  ok(T.pairsFor(level).some(p => p[0] === q.left.form && p[1] === q.right.form), '寫法在解鎖範圍內');
  ok(!/NaN|undefined|Infinity/.test(q.left.text + q.right.text), '文字沒有 NaN');
  ok(q.left.text !== q.right.text, '兩邊文字不同');
  if (!q.isEqual) ok(q.wrongValue && !T.ratEq(q.wrongValue, q.value), '不相等的題目記錄了錯誤值');
  ok(T.bothForms(q.A).length > 0 && T.bothForms(q.B).length > 0, '揭曉文字');
  tot++; if (q.isEqual) eqCount++;
}
ok(eqCount === tot / 2 || (eqCount > tot * 0.45 && eqCount < tot * 0.55), '呼叫端要的對錯各約一半：' + eqCount);
// 「差一點點」：第 1 題的錯誤寫法應該比第 30 題更明顯（小數點移位的機率隨題號下降）
function shiftRate(level) {
  let shift = 0, n = 0;
  for (let i = 0; i < 3000; i++) {
    const q = T.makeQuestion(level, rnd, false);
    if (q.right.form === 'dec' || q.left.form === 'dec') {
      const sides = [q.left, q.right].filter(s => s.form === 'dec');
      const s0 = sides[0].text;
      const v = parseFloat(s0), tv = q.value.n / q.value.d;
      if (Math.abs(v / tv - 10) < 1e-6 || Math.abs(v / tv - 0.1) < 1e-6) shift++;
      n++;
    }
  }
  return shift / Math.max(1, n);
}
const s1 = shiftRate(1), s30 = shiftRate(30);
ok(s1 > s30 + 0.05, '小數點移位的錯法隨題號減少：' + s1.toFixed(3) + ' → ' + s30.toFixed(3));
// 連續控制：不會出現連續 SAME_MAX+1 次相同
{ const hist = []; let run = 1, maxRun = 1;
  for (let i = 0; i < 20000; i++) { const w = T.nextEqual(hist, rnd); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_MAX, '連續最多 ' + maxRun); }
// 數字小修改函式：結果一定跟原本不同
for (let i = 0; i < 4000; i++) {
  const s = ['0.375', '37.5', '0.5', '20', '0.0875', '12.5', '0.8', '62.5', '0.04', '4'][i % 10];
  const t = T.tweakDigits(s, rnd(), rnd);
  ok(t == null || T.normDec(t) !== T.normDec(s), 'tweak 結果與原本不同 ' + s + '→' + t);
  if (t != null) ok(/^\d+(\.\d+)?$/.test(t), '格式 ' + s + '→' + t);
}
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
