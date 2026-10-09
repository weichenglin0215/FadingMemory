const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fracduel.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);
const gcd = (a, b) => b ? gcd(b, a % b) : a;

// 難度曲線：差距 30% → 2%（線性），限時 5.0 → 2.5 秒，分母上限 12 → 20
ok(near(T.gapAt(1), 0.30) && near(T.gapAt(T.RAMP_LEVELS), 0.02) && near(T.gapAt(60), 0.02), '差距端點');
{ const d = T.gapAt(2) - T.gapAt(1); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.gapAt(l + 1) - T.gapAt(l), d, 1e-12), '差距線性 ' + l); }
ok(T.timeMs(1) === 5000 && T.timeMs(T.RAMP_LEVELS) === 2500 && T.denMax(1) === 12 && T.denMax(T.RAMP_LEVELS) === 20, '限時與分母端點');
for (let l = 2; l <= 60; l++) ok(T.gapAt(l) <= T.gapAt(l - 1) + 1e-12 && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
// 出題：對每一題檢查
let inBand = 0, total = 0, sameSide = {};
for (let l = 1; l <= 60; l++) for (let k = 0; k < 60; k++) {
  const q = T.makeQuestion(l, rnd, null); total++;
  const a = T.val(q.left), b = T.val(q.right), g = T.gapAt(l);
  ok(a !== b && Math.abs(q.left.n * q.right.d - q.right.n * q.left.d) > 0, '兩個分數不相等');
  ok(gcd(q.left.n, q.left.d) === 1 && gcd(q.right.n, q.right.d) === 1 || q.left.n === 5 || q.left.n === 3, '最簡分數');
  ok(a >= T.VAL_MIN - 1e-9 && a <= T.VAL_MAX + 1e-9 && b >= T.VAL_MIN - 1e-9 && b <= T.VAL_MAX + 1e-9, '值範圍');
  ok(q.left.d <= T.denMax(l) && q.right.d <= T.denMax(l) && q.left.d >= 2 && q.right.d >= 2 || q.left.n === 5 || q.left.n === 3, '分母範圍');
  if (l >= 4) ok(q.left.d !== q.right.d || q.left.n === 5 || q.left.n === 3, '第 4 題起分母不同');
  ok(q.bigLeft === (a > b), 'bigLeft 與實際大小一致');
  const gap = Math.abs(a - b) / Math.max(a, b); ok(near(gap, q.gap, 1e-12), 'gap 欄位正確');
  if (gap >= g * 0.75 - 1e-12 && gap <= g * 1.3 + 1e-12) inBand++;
}
ok(inBand / total > 0.97, '差距落在目標 0.75～1.3 倍的比例 ' + (inBand / total).toFixed(4));
// 指定大的在哪一邊
for (let i = 0; i < 300; i++) { const q = T.makeQuestion(10 + (i % 30), rnd, i % 2 === 0); ok(q.bigLeft === (i % 2 === 0) && (T.val(q.left) > T.val(q.right)) === q.bigLeft, '指定邊'); }
// 同一邊不連續超過 SAME_SIDE 次
{ const hist = []; let run = 1, maxRun = 1;
  for (let i = 0; i < 20000; i++) { const w = T.nextBigLeft(hist, rnd); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_SIDE, '同一邊最多連續 ' + maxRun); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log('差距落在目標範圍的比例 ' + (inBand / total * 100).toFixed(2) + '%');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
