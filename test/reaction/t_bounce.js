const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_bounce.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
// 出題用固定種子的亂數（test/reaction/load.js 的 rng）：每次跑的軌跡都一樣，統計不會因為運氣失敗。
// 想確認「換任何種子都過」：node test/reaction/sweep_seeds.js t_bounce.js 50
const SEED = seedOf(20261007); const rnd = rng(SEED);

// 幾何：7 個收集口、珠子直徑＝收集口寬度的 80%、釘子間距＝收集口寬度、釘子交錯
ok(T.SLOTS === 7 && T.W === 64 && T.BW === 448, '7 slots of width 64');
/* 珠子大小是使用者調過的參數（現在是收集口寬度的 70%），這裡不寫死，只要求：比收集口窄、比一半寬，而且兩根釘子的間隙放得進去 */
ok(T.BALL_R * 2 < T.W && T.BALL_R * 2 > 0.5 * T.W, 'ball is narrower than a slot (diameter ' + (T.BALL_R * 2 / T.W * 100).toFixed(0) + '% of the slot width)');
ok(T.W - 2 * T.PEG_R > 2 * T.BALL_R, 'gap between two pegs is wider than the ball');
const rows = {}; T.PEGS.forEach(p => { (rows[p.row] = rows[p.row] || []).push(p.x); });
ok(Object.keys(rows).length === T.ROWS, 'peg rows');
Object.keys(rows).forEach(r => {
  const xs = rows[r].slice().sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) ok(near(xs[i] - xs[i - 1], T.W), 'peg spacing = slot width in row ' + r);
  /* 單數排（程式的 r＝0,2,4,6＝畫面第 1、3、5、7 排）在收集口中央、雙數排在分隔線上（錯開半格）*/
  xs.forEach(x => ok(near(((x / T.W) % 1 + 1) % 1, r % 2 === 0 ? 0.5 : 0), 'peg offset row ' + r + ' x=' + x));
  // 第 1、3、5、7 排最左與最右也有一根釘子（跟其他釘子一樣相隔 w）：共 7 根，從 w/2 到 BW − w/2；其他排 6 根
  if (r % 2 === 0) ok(xs.length === 7 && near(xs[0], T.W / 2) && near(xs[6], T.BW - T.W / 2), 'rows 1,3,5,7 (r=' + r + ') include pegs at both walls: ' + xs.join(','));
  else ok(xs.length === 6 && near(xs[0], T.W) && near(xs[5], T.BW - T.W), 'rows 2,4,6,8 (r=' + r + ') have 6 pegs');
});
ok(T.PEGS.every(p => p.x > T.BALL_R && p.x < T.BW - T.BALL_R), 'no peg inside the wall margin');

// ═══ 關卡：簾子高度的基數 1 → 每關 +0.333 → 超過 11 的那一關是最後一關 ═══
ok(near(T.baseAt(1), 1) && near(T.baseAt(2), 1.333) && near(T.baseAt(4), 1 + 3 * 0.333) && T.CURTAIN_BASE_START === 1 && T.CURTAIN_BASE_STEP === 0.333, 'base 1, +0.333 per level');
ok(T.LAST_LEVEL === 32 && T.baseAt(T.LAST_LEVEL - 1) <= T.CURTAIN_BASE_LAST && T.baseAt(T.LAST_LEVEL) > T.CURTAIN_BASE_LAST, 'the last level is the first one whose base exceeds 11 (level ' + T.LAST_LEVEL + ': ' + T.baseAt(T.LAST_LEVEL).toFixed(3) + ', the one before: ' + T.baseAt(T.LAST_LEVEL - 1).toFixed(3) + ')');
ok(T.SCORE_MAX >= T.LAST_LEVEL, 'the leaderboard score range covers every level');
// 簾子高度＝收集口高度 + LEAD_BALLS × 基數 × 珠子半徑，每關線性變高；上緣＝檯面高 − 簾子高度
for (let L = 1; L <= T.LAST_LEVEL; L++) {
  ok(near(T.hiddenH(L), T.SLOT_H + T.LEAD_BALLS * T.baseAt(L) * T.BALL_R), 'hidden height formula level ' + L);
  ok(near(T.curtainY(L), T.BH - T.hiddenH(L)), 'curtain top level ' + L);
  if (L > 1) ok(T.hiddenH(L) > T.hiddenH(L - 1), 'curtain grows every level');
}
ok(T.hiddenH(1) >= T.SLOT_H + T.BALL_R, 'level 1: the curtain covers the slots plus about one ball');
ok(T.curtainY(1) > 70 + (T.ROWS - 1) * T.ROW_GAP, 'level 1: the whole peg field is visible (the curtain is below the last peg row)');
ok(T.curtainY(T.LAST_LEVEL) < 70 + 2 * T.ROW_GAP && T.curtainY(T.LAST_LEVEL) > T.PEG_R, 'last level: the curtain hides all but the first rows, but not the whole board');
const lastRowY = T.ROW0_Y + (T.ROWS - 1) * T.ROW_GAP;
ok(T.curtainY(8) < lastRowY, 'by level 8 the last peg row is already hidden');

// 評語
ok(T.rating(0) === T.rating(3) && T.rating(3) !== T.rating(8) && T.rating(8) !== T.rating(16) && T.rating(16) !== T.rating(T.LAST_LEVEL), 'rating tiers');

// ═══ 模擬：決定性、一定會落到底、七個收集口都有可能、軌跡在檯面內、不穿過釘子 ═══
const a = T.simulate(200.5, 33.3, 1800, 5), b = T.simulate(200.5, 33.3, 1800, 5);
ok(a.slot === b.slot && a.steps === b.steps && a.xs[a.steps] === b.xs[b.steps], 'deterministic');
const cnt = new Array(7).fill(0); let maxT = 0, minPegGap = 1e9, outside = 0, nudgeRounds = 0, total = 0, notDone = 0;
for (let L = 1; L <= T.LAST_LEVEL; L++) {
  for (let k = 0; k < 150; k++) {
    const R = T.makeRound(L, rnd), s = R.sim; total++;
    ok(s.slot >= 0 && s.slot <= 6, 'slot range');
    ok(near(R.hiddenH, T.hiddenH(L)) && near(R.curtainY, T.curtainY(L)) && R.level === L, 'round carries its level curtain');
    if (s.tCross >= 11.9) notDone++;
    ok(s.tCross < 11.5, 'reaches the bottom (t=' + s.tCross.toFixed(2) + ', level ' + L + ')');
    ok(s.tHide <= s.tCross + 1e-9, 'hidden before crossing');
    cnt[s.slot]++; maxT = Math.max(maxT, s.tCross); if (s.nudged > 0) nudgeRounds++;
    for (let i = 0; i <= s.steps; i += 4) {
      if (s.xs[i] < T.BALL_R - 1e-6 || s.xs[i] > T.BW - T.BALL_R + 1e-6 || s.ys[i] < 0) outside++;
      for (let j = 0; j < T.PEGS.length; j++) {
        const p = T.PEGS[j]; if (Math.abs(p.y - s.ys[i]) > 40) continue;
        minPegGap = Math.min(minPegGap, Math.hypot(p.x - s.xs[i], p.y - s.ys[i]) - (T.BALL_R + T.PEG_R));
      }
    }
  }
}
ok(notDone === 0, 'no ball gets stuck for good (the new wall pegs must not trap it): ' + notDone + ' / ' + total);
ok(outside === 0, 'trajectory stays inside the board');
ok(minPegGap > -0.5, 'ball never sinks into a peg (min overlap ' + (-minPegGap).toFixed(3) + ')');
ok(cnt.every(c => c > total * 0.03), 'every slot is reachable ' + JSON.stringify(cnt));
ok(cnt[0] < total * 0.15 && cnt[6] < total * 0.15, 'the two edge slots are not favourites ' + JSON.stringify(cnt));
ok(nudgeRounds < total * 0.3, 'the anti-stuck nudge is needed in a minority of rounds (' + nudgeRounds + ' / ' + total + ')');
ok(maxT < 10, 'the longest fall stays reasonable (' + maxT.toFixed(2) + ' s)');
console.log('槽位分布 ' + cnt.join('/') + '；最長落下 ' + maxT.toFixed(2) + ' 秒；需要推力的比例 ' + (nudgeRounds / total * 100).toFixed(1) + '%');

// ═══ 左右牆邊的釘子：貼著牆掉下來的珠子不會再直直掉到底（舊版沒有這兩根釘子時，約 7 成會直接落進最旁邊那格） ═══
{ let edge = 0, n = 0;
  for (let x0 = 64; x0 <= 100; x0 += 1.5) for (let vx = -90; vx <= -30; vx += 6) { const s = T.simulate(x0, vx, T.G_FALL, 1); n++; if (s.slot === 0) edge++; }
  ok(edge / n < 0.4, 'balls dropped hugging the left wall land in slot 1 only ' + (edge / n * 100).toFixed(0) + '% of the time (old layout: ~68%)');
  let edgeR = 0, nR = 0;
  for (let x0 = 348; x0 <= 384; x0 += 1.5) for (let vx = 30; vx <= 90; vx += 6) { const s = T.simulate(x0, vx, T.G_FALL, 1); nR++; if (s.slot === 6) edgeR++; }
  ok(edgeR / nR < 0.4, 'balls dropped hugging the right wall land in slot 7 only ' + (edgeR / nR * 100).toFixed(0) + '% of the time'); }
// 夾在牆和邊上那根釘子之間的珠子：一定會被推出來（直接放在釘子頂端靠牆的位置，再用 simulate 的推力脫困）
{ const s = T.simulate(T.BALL_R, 0, T.G_FALL, 1); ok(s.tCross < 11.5, 'a ball hugging the wall from the very top still gets all the way down (' + s.tCross.toFixed(2) + ' s)');
  const s2 = T.simulate(T.BW - T.BALL_R, 0, T.G_FALL, 1); ok(s2.tCross < 11.5, 'same on the right wall (' + s2.tCross.toFixed(2) + ' s)'); }
// pathAt 內插
const s2 = T.simulate(224, 0, 1800, 1);
const p0 = T.pathAt(s2, 0), pEnd = T.pathAt(s2, s2.tCross), pMid = T.pathAt(s2, s2.tCross / 2);
ok(near(p0.x, 224) && near(p0.y, T.BALL_R + 4) && pEnd.y >= T.DIV_Y - 1e-6 && pMid.y > p0.y && pMid.y < pEnd.y, 'pathAt endpoints');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
