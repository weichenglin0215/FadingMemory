const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_mathcheck.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// V1.27：作答限時每一題固定（不再縮短）
ok(T.ansMs(1) === 6000 && T.ansMs(T.MAX_LEVEL) === 6000, '作答限時固定 6 秒');
for (let l = 1; l <= T.MAX_LEVEL; l++) ok(T.ansMs(l) === 6000, '每題限時一樣 ' + l);
// 題型慢慢解鎖：第 15 題起才有負數
ok(T.typesFor(1).join() === 'mul1,add1', '前 4 題只有個位數乘加');
const NEGS = ['negsub', 'addneg', 'subneg', 'negneg', 'mulneg'];
for (let l = 1; l < T.NEG_FROM; l++) ok(T.typesFor(l).every(t => NEGS.indexOf(t) < 0), '第 ' + l + ' 題沒有負數題型');
ok(T.NEG_FROM === 15 && T.typesFor(15).some(t => NEGS.indexOf(t) >= 0), '第 15 題起出現負數');
ok(T.typesFor(14).indexOf('sub2') >= 0 && T.typesFor(8).indexOf('sub2') < 0 && T.typesFor(8).indexOf('mul21') >= 0, '兩位數減法第 9 題、兩位數×一位數第 5 題起');
ok(T.typesFor(19).indexOf('subneg') < 0 && T.typesFor(20).indexOf('subneg') >= 0, '減去負數第 20 題起');
ok(T.typesFor(27).indexOf('negneg') < 0 && T.typesFor(28).indexOf('negneg') >= 0, '兩個負數第 28 題起');
ok(T.typesFor(34).indexOf('mul22') < 0 && T.typesFor(35).indexOf('mul22') >= 0 && T.typesFor(35).indexOf('mulneg') >= 0, '負數乘法與兩位數×兩位數第 35 題起');
{ let prev = 0; for (let l = 1; l <= 40; l++) { const n = T.typesFor(l).length; ok(n >= prev || l === 5, '題型數量不減少 ' + l); prev = n; } }
// 算式：每種題型的正解都對、範圍合理
const calc = (e) => e.op === '×' ? e.a * e.b : (e.op === '＋' ? e.a + e.b : e.a - e.b);
for (const type of ['mul1', 'add1', 'mul21', 'add2', 'sub2', 'mul22', 'negsub', 'addneg', 'subneg', 'negneg', 'mulneg']) for (const lv of [1, 15, 30, 60]) for (let i = 0; i < 300; i++) {
  const e = T.makeEquation(type, rnd, lv);
  ok(e.truth === calc(e), type + ' 正解 ' + e.lhs + '=' + e.truth);
  ok(e.explain.indexOf('＝ ' + T.num(e.truth)) >= 0, '說明包含正解 ' + e.explain);
  ok(Math.abs(e.truth) < 1200 && e.lhs.indexOf('undefined') < 0 && e.lhs.indexOf('NaN') < 0, '字串正常 ' + e.lhs);
  if (type === 'sub2') ok(e.b < e.a && e.truth > 0, '兩位數減法不出現負數');
  if (type === 'negsub') ok(e.truth < 0 && e.a > 0 && e.b > 0, '小減大：答案負數 ' + e.lhs);
  if (type === 'addneg') ok(e.b < 0 && e.a > 0, '加上負數 ' + e.lhs);
  if (type === 'subneg') ok(e.b < 0 && e.a > 0 && e.truth > e.a && /－ \(−\d+\)/.test(e.lhs), '減去負數 ' + e.lhs);
  if (type === 'negneg') ok(e.a < 0 && /^(\(−\d+\)|−\d+) [＋－] /.test(e.lhs), '兩個負數的式子 ' + e.lhs);
  if (type === 'mulneg') ok(e.a < 0 && /^\(−\d+\) × /.test(e.lhs), '負數乘法 ' + e.lhs);
  ok(e.neg === (NEGS.indexOf(type) >= 0), 'neg 旗標');
}
// 負數乘法：負負得正也會出現
{ let pos = 0, ng = 0; for (let i = 0; i < 600; i++) { const e = T.makeEquation('mulneg', rnd, 40); if (e.truth > 0) pos++; else ng++; } ok(pos > 100 && ng > 200, '負負得正（' + pos + '）與負×正（' + ng + '）都有'); }
// 錯誤答案：不等於正解；個位保留；沒有負數的題一定是正數；有負數的題正負號不變（除非正負號顛倒）
for (let i = 0; i < 20000; i++) {
  const t = kit_int(1, 1200); const w = T.wrongOf(t, rnd, { keepUnit: true });
  const sw = t >= 100 ? Math.floor(t / 1000) * 1000 + (Math.floor(t / 10) % 10) * 100 + (Math.floor(t / 100) % 10) * 10 + t % 10 : -1;
  ok(w > 0 && w !== t, '錯誤答案是正數且不等於正解 ' + t + ' → ' + w);
  ok(w % 10 === t % 10, '保留個位 ' + t + ' → ' + w);
  ok(Math.abs(w - t) === 10 || Math.abs(w - t) === 100 || w === sw, '只差一點點 ' + t + ' → ' + w);
  const w0 = T.wrongOf(t, rnd, {});
  ok(w0 > 0 && w0 !== t, '沒要求保留個位也合理 ' + t + ' → ' + w0);
}
for (let i = 0; i < 20000; i++) {
  const t = kit_int(-300, 300) || 17; const w = T.wrongOf(t, rnd, { keepUnit: true, neg: true, big: i % 2 === 0 });
  ok(w !== t && w !== 0, '有負數的題：不等於正解、不是 0 ' + t + ' → ' + w);
  ok(w === -t || (w < 0) === (t < 0), '正負號不變（或是正負號顛倒） ' + t + ' → ' + w);
  ok(Math.abs(w) % 10 === Math.abs(t) % 10, '保留個位（絕對值） ' + t + ' → ' + w);
}
function kit_int(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
// 中高難度（第 10 題起）錯的算式個位數一定跟正解一樣；低難度則有一部分不一樣
{ let early = 0, earlyKeep = 0;
  for (let i = 0; i < 6000; i++) {
    const lv = 10 + (i % 51), q = T.makeQuestion(lv, rnd, false);
    ok(Math.abs(q.shown) % 10 === Math.abs(q.truth) % 10, '第 ' + lv + ' 題錯的算式個位數跟正解一樣：' + q.text + '（正解 ' + q.truth + '）');
    const q2 = T.makeQuestion(1 + (i % 9), rnd, false);
    early++; if (Math.abs(q2.shown) % 10 === Math.abs(q2.truth) % 10) earlyKeep++;
  }
  ok(earlyKeep < early * 0.8 && earlyKeep > early * 0.3, '前 9 題錯的算式約一半個位不同（' + earlyKeep + '／' + early + '）'); }
// 整題：對／錯與 shown 一致；比例約 50%；負數題的顯示
let right = 0, sawNeg = 0, sawNegText = 0;
for (let i = 0; i < 6000; i++) {
  const q = T.makeQuestion(1 + (i % 60), rnd, null);
  ok(q.isCorrect === (q.shown === q.truth), 'isCorrect 與 shown 一致');
  ok(q.text.endsWith('＝ ' + T.num(q.shown)) && q.right.endsWith('＝ ' + T.num(q.truth)), '文字');
  if (q.isCorrect) right++;
  if (q.neg) { sawNeg++; if (q.text.indexOf('−') >= 0) sawNegText++; }
  if (1 + (i % 60) < T.NEG_FROM) ok(!q.neg && q.text.indexOf('−') < 0, '第 15 題以前沒有負數：' + q.text);
}
ok(right > 2700 && right < 3300, '對錯各約一半：' + right);
ok(sawNeg > 1500 && sawNegText > sawNeg * 0.9, '負數題幾乎都有顯示負號（只有「小減大」被顛倒成正數的才沒有）（' + sawNegText + '／' + sawNeg + '）');
// 第 15 題起負數題的比例慢慢增加
{ const frac = (lv) => { let n = 0; for (let i = 0; i < 1500; i++) if (T.makeQuestion(lv, rnd, true).neg) n++; return n / 1500; };
  const f15 = frac(16), f25 = frac(25), f40 = frac(45); ok(f15 > 0.2 && f25 >= f15 - 0.05 && f40 > f15 + 0.1, '負數題比例漸增：' + [f15, f25, f40].map(x => x.toFixed(2)).join(' → ')); }
// 算式字太長時縮小字體，確保一行放得下（舞台寬 472px，左右各留一些）
{ let minPx = 99;
  for (let i = 0; i < 6000; i++) { const q = T.makeQuestion(1 + (i % 60), rnd, null), px = T.eqFontPx(q.text), t = q.text;
    const w = T.eqUnits(t) * px + T.EQ_SPACING * t.length; minPx = Math.min(minPx, px);
    ok(px >= 30 && px <= T.EQ_FONT && w <= T.EQ_MAX_W + 1e-9 && w <= 472 - 8, '字體 ' + px + 'px 放得下一行：' + t + '（約 ' + w.toFixed(0) + 'px）'); }
  ok(T.eqFontPx('4 ＋ 6 ＝ 10') === T.EQ_FONT, '短算式維持原字體'); ok(minPx < T.EQ_FONT, '長算式有縮小：最小 ' + minPx); }
// 連續控制：長時間模擬不會出現連續 5 次相同
{ const hist = []; let run = 1, maxRun = 1;
  for (let i = 0; i < 20000; i++) { const w = T.nextCorrect(hist, rnd); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_MAX, '連續最多 ' + maxRun + '（上限 ' + T.SAME_MAX + '）'); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
