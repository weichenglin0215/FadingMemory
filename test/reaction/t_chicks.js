const { game } = require('./load.js');
const G = game('reaction_chicks.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 25) console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線（常數是使用者可以自己調的，只驗線性、會變難、之後固定）
ok(T.kFor(1) < T.kFor(T.LEVEL_RAMP) && T.totalFor(1) < T.totalFor(T.LEVEL_RAMP) && T.kFor(99) === T.kFor(T.LEVEL_RAMP) && T.totalFor(99) === T.totalFor(T.LEVEL_RAMP), 'targets and total grow then stay');
ok(T.speedFor(1) < T.speedFor(T.LEVEL_RAMP) && T.moveFor(1) <= T.moveFor(T.LEVEL_RAMP) && T.moveFor(99) === T.moveFor(T.LEVEL_RAMP) && near(T.speedFor(8) - T.speedFor(7), T.speedFor(3) - T.speedFor(2), 1e-9), 'speed ramps linearly');

// V1.38.0 起小雞會互相碰撞（simulate）：整段移動任何時候都不重疊、不穿過；撞牆會反彈；最後煞車停住
const FW = 468, FH = 560;
let minAll = 1e9, minStart = 1e9, outOfBounds = 0, notStopped = 0, chickN = 0, badEnds = 0;
for (const lv of [1, 5, 10, 20, 30]) {
  for (let k = 0; k < (lv >= 20 ? 6 : 12); k++) {
    const S = T.makeLevel(lv, FW, FH);
    ok(S.chicks.length === T.totalFor(lv), 'chick count lv' + lv);
    ok(S.targets.length === T.kFor(lv) && new Set(S.targets).size === S.targets.length && S.targets.every(t => t >= 0 && t < S.chicks.length), 'targets valid');
    ok(near(S.tMove, T.moveFor(lv)), 'stop time is the planned move time');
    S.chicks.forEach(c => {
      chickN++;
      const p0 = T.posAt(c, 0), pT = T.posAt(c, S.tMove), pEnd = T.posAt(c, S.tMove + 5);
      ok(near(p0.x, c.x0, 1e-3) && near(p0.y, c.y0, 1e-3), 'starts at (x0,y0)');
      if (!(near(pEnd.x, pT.x, 1e-9) && near(pEnd.y, pT.y, 1e-9))) badEnds++;
      for (let t = 0; t <= S.tMove; t += 0.1) { const p = T.posAt(c, t); if (p.x < T.MARGIN - 1e-6 || p.x > FW - T.MARGIN + 1e-6 || p.y < T.MARGIN - 1e-6 || p.y > FH - T.MARGIN + 1e-6) outOfBounds++; }
      /* 煞車：最後 0.05 秒幾乎不動（< 1px） */
      const q = T.posAt(c, S.tMove - 0.05); if (Math.hypot(pT.x - q.x, pT.y - q.y) > 1) notStopped++;
      ok(c.len > 0, 'chick moves');
    });
    minStart = Math.min(minStart, T.minDist(S.chicks, 0));
    for (let t = 0; t <= S.tMove + 1e-9; t += 0.05) minAll = Math.min(minAll, T.minDist(S.chicks, t));
  }
}
ok(minStart >= T.CHICK - 1e-6, 'chicks never overlap at the start: min distance ' + minStart.toFixed(1) + ' (chick size ' + T.CHICK + ')');
ok(minAll >= T.HIT_D - 2, 'chicks never overlap while moving or at the stop: min distance ' + minAll.toFixed(1) + ' (HIT_D ' + T.HIT_D + ')');
ok(outOfBounds === 0, 'chicks stay in the yard (' + outOfBounds + ' samples outside)');
ok(badEnds === 0, 'chicks stay at the last position after tMove (' + badEnds + ')');
ok(notStopped === 0, 'chicks come to rest at the end (' + notStopped + ' still moving)');
console.log('min distance over whole movement', minAll.toFixed(1), 'chicks checked', chickN);

// 兩隻面對面衝過來：會彈開、不會互相穿過（rand 依序給：小雞 0 的角度 0 與速度倍率、小雞 1 的角度 π 與速度倍率）
{
  const seq = [0, 0.5, 0.5, 0.5]; let q = 0; const rnd = () => seq[q++ % seq.length];
  const sim = T.simulate([[100, 300], [300, 300]], 200, 1.0, FW, FH, rnd);
  const last = sim[0].xs.length - 1;
  ok(sim[0].xs[last] < sim[1].xs[last], 'head-on chicks bounce back instead of passing through (end x ' + sim[0].xs[last].toFixed(0) + ' < ' + sim[1].xs[last].toFixed(0) + ')');
  let md = 1e9; for (let i = 0; i <= last; i++) md = Math.min(md, Math.hypot(sim[0].xs[i] - sim[1].xs[i], sim[0].ys[i] - sim[1].ys[i]));
  ok(md >= T.HIT_D - 1, 'head-on chicks keep their distance: ' + md.toFixed(1));
}
// 撞牆反彈：一隻往右衝，不會超出院子右邊界
{
  const seq = [0, 0.5]; let q = 0; const rnd = () => seq[q++ % seq.length];
  const sim = T.simulate([[300, 300]], 300, 3.0, FW, FH, rnd);
  let mx = -1; for (let i = 0; i < sim[0].xs.length; i++) mx = Math.max(mx, sim[0].xs[i]);
  ok(mx <= FW - T.MARGIN - 6 + 1e-3 && mx > FW - T.MARGIN - 20, 'a chick bounces off the wall: max x ' + mx.toFixed(1));
  ok(sim[0].xs[sim[0].xs.length - 1] < mx - 10, 'and comes back');
}
// 平均速度隨關卡上升，而且不會退化成原地不動
function avgSpeed(lv) { let sum = 0, n = 0; for (let k = 0; k < 8; k++) { const S = T.makeLevel(lv, FW, FH); S.chicks.forEach(c => { for (let t = 0; t < S.tMove - T.moveFor(lv) * 0.15; t += 0.1) { const a = T.posAt(c, t), b = T.posAt(c, t + 0.1); sum += Math.hypot(b.x - a.x, b.y - a.y) / 0.1; n++; } }); } return sum / n; }
const s1 = avgSpeed(1), sN = avgSpeed(T.LEVEL_RAMP); ok(sN > s1 * 1.5 && s1 > 30, 'average speed rises: ' + s1.toFixed(0) + ' -> ' + sN.toFixed(0));
// 判定：只有「還沒點過的星星小雞」算命中；其他任何東西都是 miss
ok(T.judgeTap([1, 3], [], 1) === 'hit' && T.judgeTap([1, 3], [1], 1) === 'again' && T.judgeTap([1, 3], [], 2) === 'miss' && T.judgeTap([1, 3], [], null) === 'miss' && T.judgeTap([], [], 0) === 'miss', 'judgeTap');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
