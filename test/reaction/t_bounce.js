const { game } = require('./load.js');
const G = game('reaction_bounce.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 幾何：7 個收集口、珠子直徑＝收集口寬度的 80%、釘子間距＝收集口寬度、釘子交錯
ok(T.SLOTS === 7 && T.W === 64 && T.BW === 448, '7 slots of width 64');
ok(near(T.BALL_R * 2, 0.8 * T.W), 'ball diameter = 80% of slot width');
/* 簾子蓋住收集口 + 至少 1 顆珠子的高度（LEAD_BALLS 的倍數由使用者調整，這裡不寫死）*/
ok(T.HIDDEN_H >= T.SLOT_H + 2 * T.BALL_R && near(T.CURTAIN_Y, T.BH - T.HIDDEN_H), 'curtain covers the slots + at least one ball height');
ok(T.W - 2 * T.PEG_R > 2 * T.BALL_R, 'gap between two pegs is wider than the ball');
const rows = {}; T.PEGS.forEach(p => { (rows[p.row] = rows[p.row] || []).push(p.x); });
ok(Object.keys(rows).length === T.ROWS, 'peg rows');
Object.keys(rows).forEach(r => {
  const xs = rows[r].slice().sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) ok(near(xs[i] - xs[i - 1], T.W), 'peg spacing = slot width in row ' + r);
  /* 偶數列在收集口中央、奇數列在分隔線上（錯開半格）*/
  xs.forEach(x => ok(near(((x / T.W) % 1 + 1) % 1, r % 2 === 0 ? 0.5 : 0), 'peg offset row ' + r + ' x=' + x));
});
ok(T.PEGS.every(p => p.x > T.BALL_R && p.x < T.BW - T.BALL_R), 'no peg too close to a wall');
const lastRowY = 70 + (T.ROWS - 1) * T.ROW_GAP;
/* 最後一排釘子一定在簾子後面，而且上半部（至少前 3 排）還看得到 */
ok(lastRowY > T.CURTAIN_Y && 70 + 2 * T.ROW_GAP + T.PEG_R < T.CURTAIN_Y, 'the last peg row is hidden behind the curtain and the first rows stay visible');
// 難度曲線（線性）
ok(near(T.gFor(1), 1500) && near(T.gFor(T.ROUNDS), 2400) && near(T.gFor(4.5), 1950, 1e-6), 'gravity 1500 -> 2400');
ok(near(T.vxFor(1), 0) && near(T.vxFor(T.ROUNDS), 180), 'initial vx 0 -> 180');
ok(near(T.limitFor(1), 6) && near(T.limitFor(T.ROUNDS), 2.5), 'limit 6 -> 2.5');
// 模擬：決定性、一定會落到底、七個收集口都有可能、軌跡在檯面內、不穿過釘子
const a = T.simulate(200.5, 33.3, 1800), b = T.simulate(200.5, 33.3, 1800);
ok(a.slot === b.slot && a.steps === b.steps && a.xs[a.steps] === b.xs[b.steps], 'deterministic');
const cnt = new Array(7).fill(0); let maxT = 0, minPegGap = 1e9, outside = 0, nudges = 0;
for (let r = 1; r <= 8; r++) {
  for (let k = 0; k < 400; k++) {
    const R = T.makeRound(r), s = R.sim;
    ok(s.slot >= 0 && s.slot <= 6, 'slot range');
    ok(s.tCross < 11.5, 'reaches the bottom (t=' + s.tCross.toFixed(2) + ')');
    ok(s.tHide <= s.tCross + 1e-9, 'hidden before crossing');
    ok(R.limit >= 2.5 - 1e-9 && R.limit <= 6 + 1e-9, 'limit in range');
    cnt[s.slot]++; maxT = Math.max(maxT, s.tCross); nudges += s.nudged;
    for (let i = 0; i <= s.steps; i += 4) {
      if (s.xs[i] < T.BALL_R - 1e-6 || s.xs[i] > T.BW - T.BALL_R + 1e-6 || s.ys[i] < 0) outside++;
      for (let j = 0; j < T.PEGS.length; j++) {
        const p = T.PEGS[j]; if (Math.abs(p.y - s.ys[i]) > 40) continue;
        minPegGap = Math.min(minPegGap, Math.hypot(p.x - s.xs[i], p.y - s.ys[i]) - (T.BALL_R + T.PEG_R));
      }
    }
  }
}
ok(outside === 0, 'trajectory stays inside the board');
ok(minPegGap > -0.5, 'ball never sinks into a peg (min overlap ' + (-minPegGap).toFixed(3) + ')');
ok(cnt.every(c => c > 3200 * 0.03), 'every slot is reachable ' + JSON.stringify(cnt));
ok(nudges < 3200 * 0.12, 'the anti-stuck nudge is rarely needed (' + nudges + ')');
// pathAt 內插
const s2 = T.simulate(224, 0, 1800);
const p0 = T.pathAt(s2, 0), pEnd = T.pathAt(s2, s2.tCross), pMid = T.pathAt(s2, s2.tCross / 2);
ok(near(p0.x, 224) && near(p0.y, T.BALL_R + 4) && pEnd.y >= T.DIV_Y - 1e-6 && pMid.y > p0.y && pMid.y < pEnd.y, 'pathAt endpoints');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
