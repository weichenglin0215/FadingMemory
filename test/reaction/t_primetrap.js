const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_primetrap.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// isPrime 對照篩法（0～400）
{ const sieve = new Array(401).fill(true); sieve[0] = sieve[1] = false; for (let i = 2; i * i <= 400; i++) if (sieve[i]) for (let j = i * i; j <= 400; j += i) sieve[j] = false;
  for (let n = 0; n <= 400; n++) ok(T.isPrime(n) === sieve[n], 'isPrime ' + n); }
ok(T.spf(91) === 7 && T.spf(77) === 7 && T.spf(143) === 11 && T.spf(49) === 7 && T.spf(87) === 3 && T.spf(97) === 97, 'spf');
ok(T.factorText(91) === '91 ＝ 7 × 13' && T.factorText(60) === '60 ＝ 2 × 2 × 3 × 5' && T.factorText(119) === '119 ＝ 7 × 17', 'factorText');
// 難度曲線
ok(T.timeMs(1) === 4000 && T.timeMs(T.RAMP_LEVELS) === 1500 && T.timeMs(60) === 1500, '限時端點');
ok(near(T.trapFrac(1), 0.2) && near(T.trapFrac(T.RAMP_LEVELS), 0.8) && near(T.trapFrac(60), 0.8), '陷阱比例端點');
{ const d = T.trapFrac(2) - T.trapFrac(1); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.trapFrac(l + 1) - T.trapFrac(l), d, 1e-9), '陷阱比例線性 ' + l); }
ok(T.rangeFor(1)[0] === 11 && T.rangeFor(1)[1] === 60 && T.rangeFor(9)[1] === 150 && T.rangeFor(21)[0] === 101 && T.rangeFor(21)[1] === 300, '範圍隨題號擴大');
// 數字池
[1, 9, 21].forEach(l => { const p = T.poolsFor(l), r = T.rangeFor(l);
  ok(p.primes.every(n => T.isPrime(n) && n >= r[0] && n <= r[1]), '質數池');
  ok(p.traps.every(n => !T.isPrime(n) && T.spf(n) >= 7 && n % 2 && n % 3 && n % 5), '陷阱池：合數、不能被 2/3/5 整除');
  ok(p.plain.every(n => !T.isPrime(n) && T.spf(n) < 7), '一般合數池');
  ok(p.primes.length + p.traps.length + p.plain.length === r[1] - r[0] + 1, '三個池涵蓋全部數字');
  ok(!p.primes.concat(p.traps, p.plain).some(n => n < 2), '沒有 0、1'); });
ok(T.poolsFor(1).traps.join() === '49', '11～60 的陷阱合數只有 49');
ok(T.poolsFor(21).traps.length >= 12, '101～300 的陷阱合數夠多：' + T.poolsFor(21).traps.length);
// 出題統計（第 21～60 題：陷阱比例約 trapFrac）
{ let comp = 0, trap = 0, prime = 0, total = 0, repeat = 0, prev = null;
  for (let i = 0; i < 20000; i++) { const l = 21 + (i % 40), q = T.makeQuestion(l, rnd, null, prev);
    ok(q.prime === T.isPrime(q.n), '標記正確'); ok(q.n >= 101 && q.n <= 300, '範圍');
    if (q.n === prev) repeat++; prev = q.n; total++; if (q.prime) prime++; else { comp++; if (q.trap) { trap++; ok(T.spf(q.n) >= 7, '陷阱定義'); } } }
  ok(repeat === 0, '不連續出現同一個數：' + repeat);
  ok(prime / total > 0.45 && prime / total < 0.55, '質數約一半：' + prime / total);
  const tf = trap / comp; ok(tf > 0.65 && tf < 0.8, '後段（第 21～60 題）陷阱合數佔合數的比例 ' + tf.toFixed(3)); console.log('第 21～60 題陷阱合數佔合數 ' + (tf * 100).toFixed(1) + '%'); }
// 前段陷阱比例較低
{ let comp = 0, trap = 0; for (let i = 0; i < 10000; i++) { const q = T.makeQuestion(10, rnd, false, null); comp++; if (q.trap) trap++; } const tf = trap / comp; ok(Math.abs(tf - T.trapFrac(10)) < 0.05, '第 10 題陷阱比例 ' + tf + '（目標 ' + T.trapFrac(10) + '）'); }
// 連續控制
{ const hist = []; let run = 1, maxRun = 1;
  for (let i = 0; i < 20000; i++) { const w = T.nextPrime(hist, rnd); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_MAX, '同類最多連續 ' + maxRun); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
