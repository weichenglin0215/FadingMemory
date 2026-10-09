// 數線落點：容許誤差線性縮小、題目數字與寫法一致、離 0／1／起點夠遠
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_numline.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const SEED = seedOf(20261010), rnd = rng(SEED);
ok(Math.abs(T.tolAt(1) - 0.10) < 1e-12 && Math.abs(T.tolAt(15) - 0.01) < 1e-12 && T.tolAt(40) === T.tolAt(15), '容許誤差 0.10 → 0.01');
for (let l = 1; l < 15; l++) ok(T.tolAt(l + 1) < T.tolAt(l), '線性縮小 ' + l);
ok(Math.abs((T.tolAt(1) - T.tolAt(8)) - (T.tolAt(8) - T.tolAt(15))) < 1e-12, '是線性不是等比');
ok(T.gcd(12, 8) === 4 && T.gcd(7, 13) === 1, 'gcd');
// 判定邊界
ok(T.judge(0.5, 0.45, 0.05).ok && !T.judge(0.5, 0.449, 0.05).ok && T.judge(0.4, 0.45, 0.05).ok && !T.judge(0.3999, 0.45, 0.05).ok, '剛好在容許邊界算過，超過一點就不過');
ok(Math.abs(T.judge(0.3, 0.45, 0.05).err - 0.15) < 1e-12, '誤差值');
// 出題
const forms = { decimal: 0, fraction: 0, percent: 0 }; const tails = { early: new Set(), late: new Set() };
for (let lv = 1; lv <= 30; lv++) for (let k = 0; k < 300; k++) {
  const q = T.makeQuestion(lv, rnd); forms[q.form]++;
  ok(q.v >= T.V_MIN - 1e-12 && q.v <= T.V_MAX + 1e-12, '數字離 0 與 1 夠遠 ' + q.text + ' lv' + lv);
  ok(Math.abs(q.v - T.START) >= T.START_GAP - 1e-12, '離起點夠遠 ' + q.text);
  ok(Math.abs(q.tol - T.tolAt(lv)) < 1e-12, 'tol 與關卡一致');
  if (q.form === 'decimal') ok(/^0\.\d\d$/.test(q.text) && Math.abs(parseFloat(q.text) - q.v) < 1e-9, '小數寫法 ' + q.text + ' v=' + q.v);
  if (q.form === 'percent') ok(/^\d+%$/.test(q.text) && Math.abs(parseInt(q.text, 10) / 100 - q.v) < 1e-9, '百分比寫法 ' + q.text);
  if (q.form === 'fraction') { const m = /^(\d+)\/(\d+)$/.exec(q.text); ok(m && T.gcd(+m[1], +m[2]) === 1 && +m[1] < +m[2] && Math.abs(+m[1] / +m[2] - q.v) < 1e-12, '分數寫法已約分 ' + q.text); }
  if (lv <= 3) { if (q.form !== 'fraction') ok(Math.round(q.v * 100) % 5 === 0, '前幾關的小數／百分比是 5 的倍數 ' + q.text); else tails.early.add(q.text.split('/')[1]); }
  if (lv >= 12 && q.form === 'fraction') tails.late.add(q.text.split('/')[1]);
}
ok(forms.decimal > 2000 && forms.fraction > 2000 && forms.percent > 2000, '三種寫法都常出現：' + JSON.stringify(forms));
ok(Array.from(tails.early).every(d => [2, 3, 4, 5, 6, 8, 10].includes(+d)) && tails.late.size >= 10, '前幾關的分母比較整齊，後面分母變多：early ' + Array.from(tails.early).join(',') + ' late ' + Array.from(tails.late).length + ' 種');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
