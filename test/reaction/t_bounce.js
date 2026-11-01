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
// ═══ V1.39.0：珠子「掉完」的時間、揭曉動畫 ═══
{
  let n = 0, badLand = 0, badMotion = 0, badTrail = 0, badSee = 0, minMs = 1e9, maxMs = 0, landBeforeCross = 0;
  for (let L = 1; L <= T.LAST_LEVEL; L += 3) for (let k = 0; k < 60; k++) {
    const R = T.makeRound(L, rnd), s = R.sim; n++;
    if (!(s.tLand >= s.tCross - 1e-9 && s.tLand - s.tCross < 0.2)) badLand++;      // 越過分隔線之後 0.2 秒內就會碰到收集口下緣（只剩 34px 不到）
    if (s.tLand < s.tCross) landBeforeCross++;
    const a0 = T.motionAt(s, 0), aC = T.motionAt(s, s.tCross), aL = T.motionAt(s, s.tLand), aX = T.motionAt(s, s.tLand + 5);
    if (!(near(aL.x, s.landX, 1e-6) && near(aL.y, T.REST_Y, 1e-6) && near(aX.x, s.landX, 1e-6) && near(aX.y, T.REST_Y, 1e-6))) badMotion++;   // 落完剛好停在收集口中央、底緣碰到下緣
    if (!(near(aC.y, s.ys[s.steps], 1e-6) && a0.y < aC.y)) badMotion++;
    // 掉進收集口的那一小段不會往上跳、x 不會跑出自己那一格
    for (let q = 0; q <= 10; q++) { const t = s.tCross + (s.tLand - s.tCross) * q / 10, m = T.motionAt(s, t); if (m.y > T.REST_Y + 1e-6 || m.x < s.slot * T.W - 1e-6 || m.x > (s.slot + 1) * T.W + 1e-6) badMotion++; }
    // 軌跡字串：點數有上限、最後一點是那一刻珠子的位置
    for (const t of [s.tSee, (s.tSee + s.tLand) / 2, s.tLand]) {
      const pts = T.trailPoints(s, t).split(' '), last = pts[pts.length - 1].split(',').map(Number), m = T.motionAt(s, t);
      if (!(pts.length <= 200 && near(last[0], m.x, 0.06) && near(last[1], m.y, 0.06))) badTrail++;
    }
    // tSee：玩家看到的最後位置——那一刻珠子整顆都在簾子上緣之上，之後再也沒有整顆露出來過；它在越線之前
    {
      const cy = R.curtainY, iSee = Math.min(s.steps, Math.floor(s.tSee / T.DT + 1e-6));
      let lateVisible = 0; for (let i = iSee + 1; i <= s.steps; i++) if (s.ys[i] + T.BALL_R <= cy + 1e-9) lateVisible++;
      if (!(s.tSee >= 0 && s.tSee <= s.tCross + 1e-9 && s.ys[iSee] + T.BALL_R <= cy + 1e-9 && lateVisible === 0)) badSee++;
      // 分段軌跡：從 tSee 畫到 tEnd，第一點是看到的最後位置、最後一點是 tEnd 的位置、點數有上限
      const tEnd = (s.tSee + s.tLand) / 2, pts2 = T.trailPoints(s, tEnd, s.tSee).split(' '), first = pts2[0].split(',').map(Number), last2 = pts2[pts2.length - 1].split(',').map(Number);
      const pS = T.pathAt(s, s.tSee), mE = T.motionAt(s, tEnd);
      if (!(pts2.length >= 2 && pts2.length <= 200 && near(first[0], pS.x, 0.06) && near(first[1], pS.y, 0.06) && near(last2[0], mE.x, 0.06) && near(last2[1], mE.y, 0.06))) badTrail++;
    }
    const ms = T.revealMs(s); minMs = Math.min(minMs, ms); maxMs = Math.max(maxMs, ms);
  }
  ok(badLand === 0 && landBeforeCross === 0, '落到底的時間 tLand 緊接在越過分隔線之後（' + badLand + '／' + n + ' 不合）');
  ok(badMotion === 0, 'motionAt：落完停在收集口中央、底緣碰到下緣，中途不亂跳（' + badMotion + '）');
  ok(badTrail === 0, 'trailPoints：點數有上限、第一點是起點（tSee）、最後一點是那一刻珠子的位置（' + badTrail + '）');
  ok(badSee === 0, 'tSee：最後一次整顆露在簾子上緣之上的時間，之後不會再整顆露出來（' + badSee + '／' + n + ' 不合）');
  ok(minMs >= T.REVEAL_MIN_MS && maxMs <= T.REVEAL_MAX_MS && minMs < maxMs, '揭曉動畫長度夾在 ' + T.REVEAL_MIN_MS + '～' + T.REVEAL_MAX_MS + ' 毫秒（實際 ' + minMs + '～' + maxMs + '）');
  // 慢動作：中間長度的那一段是用 REVEAL_SPEED 倍速播（不被夾住時：長度＝原時間 ÷ 倍速）
  const mid = 1.0 / T.REVEAL_SPEED * 1000, fake = { tSee: 1, tLand: 2.0 };
  ok(mid > T.REVEAL_MIN_MS && mid < T.REVEAL_MAX_MS, '測試用的 1 秒落在夾制範圍之內（' + mid.toFixed(0) + ' 毫秒）');
  ok(T.revealMs(fake) === Math.round(mid), 'revealMs 依 REVEAL_SPEED 放慢（1 秒 → ' + T.revealMs(fake) + ' 毫秒）');
  ok(T.revealMs({ tSee: 1, tLand: 1.01 }) === T.REVEAL_MIN_MS && T.revealMs({ tSee: 0, tLand: 99 }) === T.REVEAL_MAX_MS, '太短、太長都夾住');
  ok(T.REVEAL_SPEED <= 0.4 && T.REVEAL_MIN_MS >= 1500 && T.REVEAL_SEEN_MS >= 1000, '揭曉夠長：慢動作 ≤ 0.4 倍、最短 ≥ 1.5 秒、第一段停 ≥ 1 秒');
  // 簾子越高，看不到的那一段越長（從 tSee 算起），揭曉動畫也越長（同一個起點與初速比較）
  const lo = T.simulate(224, 20, T.G_FALL, 1), hi = T.simulate(224, 20, T.G_FALL, 20);
  ok(hi.tLand - hi.tSee > lo.tLand - lo.tSee && T.revealMs(hi) >= T.revealMs(lo), '高關卡看不到的那段更長（' + (lo.tLand - lo.tSee).toFixed(2) + ' → ' + (hi.tLand - hi.tSee).toFixed(2) + ' 秒）');
  // tSee（底緣碰到簾子）通常早於 tHide（整顆被蓋住）：以前拿 tHide 當分界，會把「半顆被蓋住」也算成看得到
  { let early = 0, cnt = 0; for (let L = 2; L <= T.LAST_LEVEL; L += 3) for (let k = 0; k < 30; k++) { const s = T.makeRound(L, rnd).sim; cnt++; if (s.tSee <= s.tHide + 1e-9) early++; }
    ok(early / cnt > 0.9, '絕大多數情況 tSee（底緣碰到簾子）早於 tHide（整顆被蓋住）：' + early + '／' + cnt); }
  // simulate 的回傳多了這些欄位
  const sx = T.simulate(224, 0, T.G_FALL, 1); ok(['tLand', 'landX', 'yCross', 'vyEnd', 'g'].every(k => typeof sx[k] === 'number' && isFinite(sx[k])) && near(sx.landX, sx.slot * T.W + T.W / 2), 'simulate 回傳 tLand／landX／yCross／vyEnd／g');
}
// ═══ 頁面接線（原始碼檢查）：開局版面一開始就擺好、掉完才能選、揭曉分兩段 ═══
{
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_bounce.js'), 'utf8');
  const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/games/reaction_bounce.css'), 'utf8');
  // round() 建好版面後、還沒排 startLevel 之前，就已經設了標題、擺好簾子與收集口、先 setArmed(false)
  const iLayout = src.indexOf('layoutCurtain(hiddenH(level + 1));'), iStart = src.indexOf('my.after(400, startLevel)');
  ok(iLayout > 0 && iStart > iLayout, '開局版面在 400 毫秒的 startLevel 之前就擺好了');
  ok(/head\.textContent = '第 ' \+ \(level \+ 1\) \+ ' 關/.test(src), '開局標題一開始就有字（檯子不會往上偏）');
  ok(/y: curtainY\(level \+ 1\), width: BW, height: hiddenH\(level \+ 1\)/.test(src), '簾子一開始就是這一關的高度');
  ok(/function choose\(s\) \{\s*if \(state !== 'fall' \|\| !armed\) return;/.test(src), '還沒 armed（珠子沒掉完）時點了沒反應');
  ok(/if \(t >= cur\.sim\.tLand\) \{ setArmed\(true\); return false; \}/.test(src), '珠子掉到底（tLand）才 setArmed(true)');
  ok(/classList\.toggle\('bounce-slot--wait', !on\)/.test(src) && /\.bounce-slot--wait \{[^}]*opacity: 0\.35;[^}]*pointer-events: none;/.test(css), '還沒掉完：收集口按鈕半透明、點不到');
  ok(/trailPoints\(sim, tS\)/.test(src) && /tS = sim\.tSee/.test(src), '揭曉第一段：只畫到 tSee（珠子最後完整露出）為止的軌跡');
  ok(/my\.after\(REVEAL_SEEN_MS/.test(src) && /my\.tween\(revealMs\(sim\)/.test(src) && /trailPoints\(sim, ts, tS\)/.test(src) && /\.then\(function \(\) \{ if \(id === rid\) conclude\(s\); \}\)/.test(src), '揭曉第二段：停一下之後，從 tSee 起用慢動作播到落點，播完才 conclude');
  ok(/bounce-seen bounce-seen--on/.test(src) && /最後看到/.test(src) && /bounce-seen--keep/.test(src) && /\.bounce-seen--on \{[^}]*animation: bounce-seen-blink/.test(css) && /\.bounce-trail--hid \{/.test(css), '標出「最後看到」的位置：閃爍虛線圈＋標籤，第二段起圈留著，隱藏段軌跡換色');
  ok(!/function reveal\(s\)[\s\S]{0,1800}Sfx\.play\(right/.test(src), '揭曉一開始不會立刻報猜中／猜錯（要等動畫播完）');
}
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
