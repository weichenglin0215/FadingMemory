const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_whofirst.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 影格數：第 1 關 18、到頂 2，線性（每關少約 0.55 影格）、之後維持
ok(T.framesAt(1) === 18 && T.framesAt(T.RAMP_LEVELS) === 2 && T.framesAt(T.MAX_LEVEL) === 2, '影格數端點');
for (let l = 2; l <= T.MAX_LEVEL; l++) ok(T.framesAt(l) <= T.framesAt(l - 1) && T.framesAt(l - 1) - T.framesAt(l) <= 1, '單調、每關最多少 1 影格 ' + l);
ok(T.framesAt(1) - T.framesAt(2) >= 0, '起步');
// 影格量測：中位數、離譜值退回 60Hz
ok(T.median([16, 17, 16, 33, 16]) === 16 && T.median([]) === 0, 'median');
ok(Math.abs(T.frameFrom([16.7, 16.6, 16.8, 40, 16.7]) - 16.7) < 1e-9, '60Hz');
ok(Math.abs(T.frameFrom([8.3, 8.4, 8.3, 8.3]) - 8.3) < 1e-9, '120Hz');
ok(Math.abs(T.frameFrom([1, 1, 1]) - 1000 / 60) < 1e-9 && Math.abs(T.frameFrom([100, 120, 110]) - 1000 / 60) < 1e-9 && Math.abs(T.frameFrom([]) - 1000 / 60) < 1e-9, '離譜的量測值退回 60Hz');
// 先亮的一側
{ const hist = []; let run = 1, maxRun = 1; const cnt = { L: 0, R: 0 };
  for (let i = 0; i < 20000; i++) { const s = T.nextSide(hist, rnd); cnt[s]++; if (hist.length && hist[hist.length - 1] === s) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(s); }
  ok(maxRun <= T.SAME_MAX, '同側最多連續 ' + maxRun); ok(Math.abs(cnt.L - cnt.R) < 800, '左右平均 ' + cnt.L + '/' + cnt.R); }
// 出題
for (let l = 1; l <= T.MAX_LEVEL; l++) for (let i = 0; i < 60; i++) {
  const q = T.makeLevel(l, rnd, []);
  ok(q.first === 'L' || q.first === 'R', 'first');
  ok(q.wait >= T.WAIT_MS[0] && q.wait <= T.WAIT_MS[1], '等待時間範圍');
  ok(Math.abs(q.sizeL - 1) <= T.SIZE_JIT + 1e-9 && Math.abs(q.sizeR - 1) <= T.SIZE_JIT + 1e-9, '大小差範圍');
  ok(q.frames === T.framesAt(l), '影格數');
}
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
