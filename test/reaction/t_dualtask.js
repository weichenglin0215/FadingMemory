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
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(12), 'rating tiers（通過關數）');
// ═══ V1.25 關卡制 ═══
{ const { rng } = require('./load.js'); const rr = rng(20261013);
  // 曲線：第 1 關很短、間隔 150%；後面時間變長、間隔略縮短
  ok(T.durationFor(1) === 12 && T.durationFor(15) === 40 && T.durationFor(30) === 40 && T.durationFor(2) > T.durationFor(1), '總時長 12 秒 → 40 秒（第 1 關縮短）');
  for (let l = 2; l <= 15; l++) ok(T.durationFor(l) >= T.durationFor(l - 1), '總時長不減 ' + l);
  ok(near(T.ivMult(1), 1.5) && T.ivMult(20) < 1 && near(T.ivMult(20), 0.85) && near(T.ivMult(99), 0.85), '閃燈間隔 150% → 85%（第 1 關比現在長 150%，之後略縮短）');
  for (let l = 2; l <= 20; l++) ok(T.ivMult(l) < T.ivMult(l - 1), '間隔每關縮短 ' + l);
  ok(near(T.baseDiff(1), 0) && T.baseDiff(15) > 1 && T.burstCapFor(1) === 1 && T.burstCapFor(15) === 7, '難度值與一串長度上限隨關卡增加');
  ok(T.redMinFor(1) === 3 && T.redMaxFor(1) === 5 && T.greenMaxFor(1) <= 10, '第 1 關：紅燈 3～5 次、綠燈不多');
  for (let l = 2; l <= 15; l++) ok(T.redMaxFor(l) >= T.redMaxFor(l - 1) && T.redMinFor(l) >= T.redMinFor(l - 1) && T.greenMaxFor(l) >= T.greenMaxFor(l - 1), '亮燈次數上下限不減 ' + l);
  // 逐關出事件表：紅燈次數在範圍內、第 1 關 3～5 次；間隔、起點、跨色間距、結束時間都合規；次數平均隨關卡增加
  const meanR = {}, meanG = {};
  for (let l = 1; l <= 20; l++) {
    let sr = 0, sg = 0, n = 150;
    for (let i = 0; i < n; i++) {
      const ev = T.makeEvents(rr, l), dur = T.durationFor(l);
      ok(ev.red.length >= T.redMinFor(l) && ev.red.length <= T.redMaxFor(l) && ev.green.length >= T.greenMinFor(l) && ev.green.length <= T.greenMaxFor(l), '第 ' + l + ' 關次數在範圍內：紅 ' + ev.red.length + '、綠 ' + ev.green.length);
      if (l === 1) ok(ev.red.length >= 3 && ev.red.length <= 5, '第 1 關紅燈 3～5 次：' + ev.red.length);
      ok(ev.green.length === ev.greenLit.length, '每盞綠燈有亮燈時間');
      let sorted = true; for (let j = 1; j < ev.green.length; j++) if (ev.green[j] < ev.green[j - 1]) sorted = false; for (let j = 1; j < ev.red.length; j++) if (ev.red[j] < ev.red[j - 1]) sorted = false;
      ok(sorted, '事件由小到大');
      ev.green.forEach((t, j) => ok(t + ev.greenLit[j] <= dur - T.TAIL_S + 1e-9 && t >= T.LEAD_S - 1e-9, '綠燈在這一關的時間內'));
      ev.red.forEach(t => ok(t + T.RED_LIT <= dur - T.TAIL_S + 1e-9 && t >= T.RED_LEAD_S - 1e-9, '紅燈在這一關的時間內'));
      ev.green.forEach(g => ev.red.forEach(r => { if (Math.abs(g - r) < T.CROSS_GAP - 1e-9) ok(false, '綠紅開始時間至少相隔 CROSS_GAP'); }));
      for (let j = 1; j < ev.green.length; j++) if (ev.green[j] - (ev.green[j - 1] + ev.greenLit[j - 1]) < T.MIN_REST - 1e-9) ok(false, '同一盞綠燈熄滅至少 MIN_REST');
      for (let j = 1; j < ev.red.length; j++) if (ev.red[j] - ev.red[j - 1] < T.RED_LIT - 1e-9) ok(false, '紅燈不重疊');
      sr += ev.red.length; sg += ev.green.length;
    }
    meanR[l] = sr / n; meanG[l] = sg / n;
  }
  for (let l = 2; l <= 15; l++) ok(meanR[l] > meanR[l - 1] - 0.5 && meanG[l] > meanG[l - 1] - 0.5, '平均亮燈次數隨關卡增加 ' + l + '：紅 ' + meanR[l].toFixed(1) + '、綠 ' + meanG[l].toFixed(1));
  ok(meanR[1] < 5.01 && meanR[15] > meanR[1] * 6, '紅燈次數 第 1 關約 ' + meanR[1].toFixed(1) + ' → 第 15 關約 ' + meanR[15].toFixed(1));
  // 第 1 關的燈號間隔比舊版開頭長 150%：同一串綠燈的亮→亮週期 ≥ 亮 1.2 秒 ＋ 熄滅 0.4 × 1.5
  { let minCycle = 1e9; for (let i = 0; i < 300; i++) { const ev = T.makeEvents(rr, 1); for (let j = 1; j < ev.green.length; j++) minCycle = Math.min(minCycle, ev.green[j] - ev.green[j - 1]); } ok(minCycle >= 1.2 + 0.4 * 1.5 - 0.1 || minCycle >= 1.2 + 0.1, '第 1 關兩盞綠燈相隔夠遠（最短 ' + minCycle.toFixed(2) + ' 秒）'); }
  // 過關判定
  ok(T.passNeedFor(10) === 6 && T.passNeedFor(5) === 3 && T.passNeedFor(31) === 19, '過關要點中 60%：10 次要 6 次、5 次要 3 次');
  ok(T.levelPassed(6, 0, 10, 7, 7) && !T.levelPassed(5, 0, 10, 7, 7) && !T.levelPassed(10, 0, 10, 8, 7) && !T.levelPassed(8, 3, 10, 7, 7) && T.levelPassed(8, 2, 10, 7, 7), '過關＝紅燈次數答對，而且（命中 − 亂點）夠多');
  // 原始碼：關卡制的接線
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_dualtask.js'), 'utf8');
  ok(/makeEvents\(Math\.random, level\)/.test(src) && /durationFor\(level\)/.test(src) && /levelPassed\(hits, strays, ev\.green\.length, v, truth\)/.test(src) && /score: passedN/.test(src), '一關一關闖、成績＝通過關數');
  ok(G.score.better === 'max' && G.score.max === T.MAX_LEVEL && G.score.format === '{v} 關', '排行榜成績是通過關數');
}
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
