const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_dualtask.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
// 出題用固定種子的亂數（test/reaction/load.js 的 rng）：每次跑的事件表都一樣，統計不會因為運氣失敗。
// 想確認「換任何種子都過」：用 SEED 環境變數連跑很多次（node test/reaction/sweep_seeds.js t_dualtask.js 100）。
const SEED = seedOf(20261007); const rnd = rng(SEED);

// ═══ 難度曲線：d＝秒數 ÷ 15（第 15 秒＝舊版第 3 回合的最難程度，之後繼續加難到下限） ═══
ok(near(T.diffAt(0), 0) && near(T.diffAt(15), 1) && near(T.diffAt(30), 2) && T.diffAt(-3) === 0, 'diffAt');
// d=0 ＝舊版第 1 回合、d=1 ＝舊版第 3 回合（亮 1.2 → 0.65 秒）
ok(near(T.paramAt(T.LIT, 0), 1.2) && near(T.paramAt(T.LIT, 1), 0.65) && near(T.paramAt(T.LIT, 0.5), 0.925), 'lit 1.2 -> 0.65 between 0 s and 15 s');
// 第 15 秒以後繼續變，但不會低於下限；往大變的參數不會超過上限
ok(T.paramAt(T.LIT, 1.2) < 0.65 && near(T.paramAt(T.LIT, 2), T.LIT[2]) && near(T.paramAt(T.LIT, 9), T.LIT[2]), 'lit keeps shrinking after 15 s but stops at the floor ' + T.LIT[2]);
ok(near(T.paramAt(T.GREEN_REST, 1), 0.2) && T.paramAt(T.GREEN_REST, 2) >= T.GREEN_REST[2] - 1e-9 && T.paramAt(T.RED_REST, 3) >= T.RED_REST[2] - 1e-9, 'rest times stop at their floors');
ok(T.burstMaxAt(0) === 3 && T.burstMaxAt(1) === 5 && T.burstMaxAt(2) === 7 && T.burstMaxAt(9) === 7, 'longest burst 3 -> 5 -> 7 (capped)');
// burstSize：落在 1～burstMax，而且難度高的時候真的會出現長串
{ let min = 99, max = 0, longAtEnd = 0;
  for (let i = 0; i < 20000; i++) { const k0 = T.burstSize(0, rnd), k2 = T.burstSize(2, rnd); min = Math.min(min, k0, k2); max = Math.max(max, k0, k2); if (k2 >= 5) longAtEnd++; ok(k0 >= 1 && k0 <= 3 && k2 >= 1 && k2 <= 7, 'burst size in range'); }
  ok(min === 1 && max === 7, 'burst sizes cover 1..7 (' + min + '..' + max + ')');
  ok(longAtEnd > 20000 * 0.2, 'at difficulty 2, bursts of 5+ are common (' + longAtEnd + ' / 20000)'); }

// ═══ 事件表 ═══
const N = 3000;
let nG = 0, nR = 0, minCross = 1e9, minRed = 1e9, minGreenRest = 1e9, outOfRange = 0, firstBad = 0, overlapG = 0, unsorted = 0;
const gG = [], rR = [], gWin = new Array(6).fill(0), rWin = new Array(6).fill(0), maxRun = { g: 0, r: 0 };
let overlappedByRed = 0, totalGreen = 0;
for (let k = 0; k < N; k++) {
  const ev = T.makeEvents(rnd);
  nG += ev.green.length; nR += ev.red.length; gG.push(ev.green.length); rR.push(ev.red.length);
  ok(ev.green.length === ev.greenLit.length, 'one lit duration per green');
  for (let i = 1; i < ev.green.length; i++) { if (ev.green[i] < ev.green[i - 1]) unsorted++; minGreenRest = Math.min(minGreenRest, ev.green[i] - (ev.green[i - 1] + ev.greenLit[i - 1])); }
  for (let i = 1; i < ev.red.length; i++) { if (ev.red[i] < ev.red[i - 1]) unsorted++; minRed = Math.min(minRed, ev.red[i] - ev.red[i - 1]); }
  ev.green.forEach(g => ev.red.forEach(r => { minCross = Math.min(minCross, Math.abs(g - r)); }));
  ev.green.forEach((t, i) => { if (t + ev.greenLit[i] > T.DURATION_SEC - T.TAIL_S + 1e-9) outOfRange++; gWin[Math.min(5, Math.floor(t / 5))]++; totalGreen++; if (ev.red.some(r => r < t + ev.greenLit[i] && r + T.RED_LIT > t)) overlappedByRed++; });
  ev.red.forEach(t => { if (t + T.RED_LIT > T.DURATION_SEC - T.TAIL_S + 1e-9) outOfRange++; rWin[Math.min(5, Math.floor(t / 5))]++; });
  if (!(ev.green[0] >= T.LEAD_S - 1e-9) || !(ev.red[0] >= T.RED_LEAD_S - 1e-9)) firstBad++;
  // 最長的「連續」串：綠燈相鄰間隔 ≤ 熄滅 0.4 + 亮 1.2 的最大週期；用「間隔 < 亮燈時間 + 0.45」判斷
  let run = 1; for (let i = 1; i < ev.green.length; i++) { if (ev.green[i] - ev.green[i - 1] < ev.greenLit[i - 1] + 0.45) { run++; maxRun.g = Math.max(maxRun.g, run); } else run = 1; }
  run = 1; for (let i = 1; i < ev.red.length; i++) { if (ev.red[i] - ev.red[i - 1] < T.RED_LIT + 0.46) { run++; maxRun.r = Math.max(maxRun.r, run); } else run = 1; }
}
ok(unsorted === 0, 'events are sorted');
ok(minCross >= T.CROSS_GAP - 1e-9, 'a green and a red never start within CROSS_GAP (' + minCross.toFixed(3) + ')');
ok(minRed >= T.RED_LIT + T.RED_REST[2] - 1e-9, 'two reds are always separated by lit + the minimum rest, so they can be counted (' + minRed.toFixed(3) + ')');
ok(minGreenRest >= T.MIN_REST - 1e-9, 'one green is off for at least MIN_REST before the next (' + minGreenRest.toFixed(3) + ')');
ok(outOfRange === 0, 'all events finish inside the round');
ok(firstBad === 0, 'first green ≥ ' + T.LEAD_S + ' s, first red ≥ ' + T.RED_LEAD_S + ' s');
// 次數：比舊版（3 回合版最難的那一回合：綠約 25、紅 20）多
const meanG = nG / N, meanR = nR / N;
console.log('平均每局：綠燈 ' + meanG.toFixed(1) + ' 次、紅燈 ' + meanR.toFixed(1) + ' 次；最長連續串 綠 ' + maxRun.g + '／紅 ' + maxRun.r + '；每 5 秒綠燈 ' + gWin.map(x => (x / N).toFixed(1)).join(' ') + '、紅燈 ' + rWin.map(x => (x / N).toFixed(1)).join(' ') + '；綠燈亮著時同時有紅燈閃的比例 ' + (overlappedByRed / totalGreen * 100).toFixed(0) + '%');
ok(meanG > 28 && meanG < 36, 'more greens than the old hardest round (~25): ' + meanG.toFixed(1));
ok(meanR > 30 && meanR < 46, 'more reds than the old hardest round (20): ' + meanR.toFixed(1));
// 數量的穩定度：每一局都在合理範圍內（標準差約 1.2～2，下面的範圍是平均值上下 5 個標準差以上）
ok(Math.min.apply(null, gG) >= 24 && Math.max.apply(null, gG) <= 40, 'green count per round stays in a sane range: ' + Math.min.apply(null, gG) + '..' + Math.max.apply(null, gG));
ok(Math.min.apply(null, rR) >= 26 && Math.max.apply(null, rR) <= 50, 'red count per round stays in a sane range: ' + Math.min.apply(null, rR) + '..' + Math.max.apply(null, rR));
// 難度隨時間升高：每 5 秒的綠燈、紅燈次數整體往上（最後一格因為要留空檔，不比較）
ok(gWin[0] < gWin[1] && gWin[1] < gWin[2] && gWin[2] < gWin[3] && gWin[3] < gWin[4], 'greens get denser every 5 seconds: ' + gWin.map(x => (x / N).toFixed(1)).join(' < '));
ok(rWin[0] < rWin[2] && rWin[2] < rWin[4], 'reds get denser over time: ' + rWin.map(x => (x / N).toFixed(1)).join(' '));
ok(maxRun.g >= 4 && maxRun.r >= 4, 'consecutive bursts of 4+ really occur (green ' + maxRun.g + ', red ' + maxRun.r + ')');
ok(overlappedByRed / totalGreen > 0.3, 'greens and reds are often lit at the same time (dual task)');

// ═══ 答案選項：10 個連續號碼，正解在其中 ═══
{ let badOpt = 0; const pos = new Array(10).fill(0);
  for (const truth of [1, 2, 5, 9, 10, 11, 20, 38, 41, 60]) for (let i = 0; i < 2000; i++) {
    const o = T.makeOptions(truth, rnd);
    if (o.length !== 10 || o[0] < 1 || o.indexOf(truth) < 0 || o.some((x, j) => j && x !== o[j - 1] + 1)) badOpt++;
    if (truth === 38) pos[o.indexOf(truth)]++;
  }
  ok(badOpt === 0, '10 consecutive numbers, all ≥ 1, containing the truth (' + badOpt + ' bad)');
  ok(pos.every(c => c > 2000 * 0.06 && c < 2000 * 0.14), 'the truth lands in every position with similar chance: ' + pos.join(','));
  // 正解很小的時候，起始號碼只能是 1～正解（不能出現 0 或負數）
  for (let i = 0; i < 500; i++) { const small = T.makeOptions(3, rnd); ok(small[0] >= 1 && small[0] <= 3 && small.length === 10 && small.indexOf(3) >= 0, 'small truth: options never go below 1'); }
  ok(T.OPT_COUNT === 10 && T.OPT_COLS === 5, 'two rows of five'); }
// ═══ 分數 ═══
ok(T.roundScore(10, 0, 8, 8) === 10 && T.roundScore(10, 0, 9, 8) === 5 && T.roundScore(11, 0, 9, 8) === 6 && T.roundScore(10, 3, 8, 8) === 7 && T.roundScore(2, 9, 8, 8) === 0, 'roundScore');
// ═══ 亮燈判定（每盞綠燈亮的長度不同）═══
ok(T.litIndex([1, 3, 5], 1.2, 1.0) === 0 && T.litIndex([1, 3, 5], 1.2, 2.199) === 0 && T.litIndex([1, 3, 5], 1.2, 2.2) === -1 && T.litIndex([1, 3, 5], 1.2, 0.99) === -1 && T.litIndex([1, 3, 5], 1.2, 3.5) === 1, 'litIndex with a fixed duration');
ok(T.litIndex([1, 3, 5], [0.5, 1.0, 0.4], 1.6) === -1 && T.litIndex([1, 3, 5], [0.5, 1.0, 0.4], 3.9) === 1 && T.litIndex([1, 3, 5], [0.5, 1.0, 0.4], 5.39) === 2 && T.litIndex([1, 3, 5], [0.5, 1.0, 0.4], 5.4) === -1, 'litIndex with per-light durations');
ok(T.rating(5) !== T.rating(15) && T.rating(15) !== T.rating(28), 'rating tiers');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
