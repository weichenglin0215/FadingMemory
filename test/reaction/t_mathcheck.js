const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_mathcheck.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 難度曲線：顯示時間、作答限時線性、第 RAMP_LEVELS 題到頂，之後維持；作答限時永遠 ≥ 顯示時間
ok(T.showMs(1) === 2000 && T.showMs(T.RAMP_LEVELS) === 600 && T.showMs(T.MAX_LEVEL) === 600, '顯示時間端點');
ok(T.ansMs(1) === 4000 && T.ansMs(T.RAMP_LEVELS) === 2000 && T.ansMs(T.MAX_LEVEL) === 2000, '作答限時端點');
for (let l = 2; l <= T.MAX_LEVEL; l++) { ok(T.showMs(l) <= T.showMs(l - 1) && T.ansMs(l) <= T.ansMs(l - 1), '單調不增 ' + l); ok(T.ansMs(l) > T.showMs(l), '限時 > 顯示 ' + l); }
ok(near(T.showMs(16) - (T.showMs(1) + T.showMs(T.RAMP_LEVELS)) / 2, 0, 30), '中點約等於平均（線性）');
// 題型解鎖
ok(T.typesFor(1).join() === 'mul1,add1' && T.typesFor(6).join() === 'mul21,add2' && T.typesFor(16).indexOf('sub2') >= 0 && T.typesFor(25).indexOf('mul22') >= 0 && T.typesFor(24).indexOf('mul22') < 0, '題型隨題號解鎖');
// 算式：每種題型的正解都對、範圍合理
for (const type of ['mul1', 'add1', 'mul21', 'add2', 'sub2', 'mul22']) for (let i = 0; i < 800; i++) {
  const e = T.makeEquation(type, rnd);
  const t = e.op === '×' ? e.a * e.b : (e.op === '＋' ? e.a + e.b : e.a - e.b);
  ok(e.truth === t && e.truth > 0, type + ' 正解 ' + e.a + e.op + e.b + '=' + e.truth);
  ok(e.explain.indexOf('＝ ' + e.truth) >= 0, '說明包含正解');
  if (type === 'sub2') ok(e.b < e.a, '減法不出現負數');
}
// 錯誤答案：不等於正解、正數、屬於「只差一點點」四種之一
for (let i = 0; i < 20000; i++) {
  const t = kit_int(1, 1200); const w = T.wrongOf(t, rnd);
  const d = Math.abs(w - t), sw = t >= 10 ? Math.floor(t / 100) * 100 + (t % 10) * 10 + Math.floor((t % 100) / 10) : -1;
  ok(w > 0 && w !== t, '錯誤答案是正數且不等於正解 ' + t + ' → ' + w);
  ok(d === 1 || d === 10 || d === 100 || w === sw, '只差一點點 ' + t + ' → ' + w);
}
function kit_int(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
// 整題：對／錯與 shown 一致；比例約 50%
let right = 0;
for (let i = 0; i < 6000; i++) {
  const q = T.makeQuestion(1 + (i % 40), rnd, null);
  ok(q.isCorrect === (q.shown === q.truth), 'isCorrect 與 shown 一致');
  ok(q.text.indexOf(String(q.shown)) >= 0 && q.right.indexOf(String(q.truth)) >= 0, '文字');
  if (q.isCorrect) right++;
}
ok(right > 2700 && right < 3300, '對錯各約一半：' + right);
// 連續控制：長時間模擬不會出現連續 5 次相同
{ const hist = []; let run = 1, maxRun = 1;
  for (let i = 0; i < 20000; i++) { const w = T.nextCorrect(hist, rnd); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_MAX, '連續最多 ' + maxRun + '（上限 ' + T.SAME_MAX + '）'); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
