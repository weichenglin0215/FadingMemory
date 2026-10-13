const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fracduel.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);
const gcd = (a, b) => b ? gcd(b, a % b) : a;

// 難度曲線：差距 25% → 1%（線性），限時 7.5 → 3.75 秒（V1.24 的 1.5 倍），兩位數時的分母上限 12 → 20
ok(near(T.gapAt(1), 0.25) && near(T.gapAt(T.RAMP_LEVELS), 0.01) && near(T.gapAt(60), 0.01), '差距端點');
{ const d = T.gapAt(2) - T.gapAt(1); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.gapAt(l + 1) - T.gapAt(l), d, 1e-12), '差距線性 ' + l); }
ok(T.timeMs(1) === 7500 && T.timeMs(T.RAMP_LEVELS) === 3750 && T.denMax(1) === 12 && T.denMax(T.RAMP_LEVELS) === 20, '限時（1.5 倍）與分母端點');
for (let l = 2; l <= 60; l++) ok(T.gapAt(l) <= T.gapAt(l - 1) + 1e-12 && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
// 題型解鎖
ok(T.kindsAt(1).join() === 'rand' && T.kindsAt(3).join() === 'rand,samenum' && T.kindsAt(5).join() === 'rand,samenum,plus1' && T.kindsAt(9).length === 4, '題型依題號解鎖');
// 數字寫法
ok(T.fmtNum(7) === '7' && T.fmtNum(3.5) === '3.5' && T.fmtFrac({ n: 3.5, d: 7 }) === '3.5/7', '數字寫法：整數／一位小數');
ok(T.sizeClass({ n: 7, d: 12 }) === 'fd-frac--s2' && T.sizeClass({ n: 637, d: 89 }) === 'fd-frac--s3' && T.sizeClass({ n: 318.5, d: 446 }) === 'fd-frac--s5', '字級等級');
// 出題：每一種題型逐題檢查
let inBand = 0, total = 0, decimals = 0, bigs = 0;
for (let l = 1; l <= 60; l++) for (const kind of T.kindsAt(l)) for (let k = 0; k < 25; k++) {
  const q = T.makeQuestion(l, rnd, null, kind); total++;
  const a = T.val(q.left), b = T.val(q.right), g = T.gapAt(l);
  ok(!near(a, b, 1e-12), '兩個分數不相等');
  ok(q.bigLeft === (a > b), 'bigLeft 與實際大小一致');
  const gap = Math.abs(a - b) / Math.max(a, b); ok(near(gap, q.gap, 1e-9), 'gap 欄位正確');
  if (!q.decimal) { ok(gcd(q.left.n, q.left.d) === 1 && gcd(q.right.n, q.right.d) === 1 || q.kind === 'rand' && q.left.n === 5, '最簡分數 ' + T.fmtFrac(q.left) + ' ' + T.fmtFrac(q.right)); }
  else { decimals++; ok([q.left, q.right].some(f => !Number.isInteger(f.n) || !Number.isInteger(f.d)), '帶小數的題目至少有一個小數'); ok([q.left, q.right].every(f => Math.round(f.n * 10) === f.n * 10 && Math.round(f.d * 10) === f.d * 10), '小數只有一位'); ok(l >= T.DEC_FROM, '第 ' + T.DEC_FROM + ' 題起才有小數'); }
  if (l >= 4) ok(!near(q.left.d, q.right.d, 1e-9) || q.left.n === 5, '第 4 題起分母不同');
  if (l < T.BIG_FROM) ok(Math.max(q.left.d, q.right.d, q.left.n, q.right.n) <= Math.max(T.denMax(l) * 3, 60), '第 1～10 題是兩位數以內');
  if (Math.max(q.left.n, q.left.d, q.right.n, q.right.d) >= 100) { bigs++; ok(l >= T.BIG_FROM, '第 ' + T.BIG_FROM + ' 題起才有三位數'); }
  ok(Math.max(q.left.d, q.right.d) <= T.CAP3 * 2, '分母上限');
  if (gap >= g * 0.75 * 0.36 - 1e-12 && gap <= g * 1.3 / 0.36 + 1e-12) inBand++;
  // 題型特徵
  if (q.kind === 'samenum' && !q.decimal) ok(q.left.n === q.right.n, 'samenum：分子相同');
  if (q.kind === 'plus1' && !q.decimal) ok(Math.abs(q.left.n - q.right.n) === 1 && Math.abs(q.left.d - q.right.d) === 1, 'plus1：分子分母各差 1');
}
ok(inBand / total > 0.95, '差距落在（放寬後）目標範圍的比例 ' + (inBand / total).toFixed(4));
ok(decimals > 0 && bigs > 0, '有三位數題目與帶小數的題目');
// 指定大的在哪一邊
for (let i = 0; i < 300; i++) { const q = T.makeQuestion(10 + (i % 30), rnd, i % 2 === 0); ok(q.bigLeft === (i % 2 === 0) && (T.val(q.left) > T.val(q.right)) === q.bigLeft, '指定邊'); }
// 同一邊不連續超過 SAME_SIDE 次
{ const hist = []; let run = 1, maxRun = 1;
  for (let i = 0; i < 20000; i++) { const w = T.nextBigLeft(hist, rnd); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_SIDE, '同一邊最多連續 ' + maxRun); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
