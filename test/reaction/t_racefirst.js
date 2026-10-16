const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_racefirst.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261030); const rnd = rng(SEED);

ok(near(T.gapFor(1), 0.12) && near(T.gapFor(T.RAMP_LEVELS), 0.025) && near(T.gapFor(60), 0.025), '時間差 0.12 → 0.025 秒');
for (let l = 2; l <= 60; l++) ok(T.gapFor(l) <= T.gapFor(l - 1) + 1e-12 && T.ansMs(l) <= T.ansMs(l - 1), '單調 ' + l);
ok(near(T.gapFor(11) - (0.12 + 0.025) / 2, 0, 0.004), '中點約等於平均（線性）');
// 運動函式
ok(T.distAt(1000, 0, 400) === 0 && near(T.distAt(1000, 0.5, 4000), 125) && T.distAt(1000, 5, 400) === 400, 'distAt');
ok(near(T.arriveT(T.accelOf(0.7, 400), 400), 0.7), 'accelOf／arriveT 互為反函式');
{ const a = T.accelOf(0.7, 400); ok(near(T.distAt(a, 0.7, 1e9), 400, 1e-6) && T.distAt(a, 0.35, 1e9) < 400 / 2 && near(T.distAt(a, 0.35, 1e9), 100, 1e-6), '加速度運動：一半時間只跑 1/4 距離'); }
// 整場比賽（V1.29：每個小人有自己的起跑延遲 d，到達時間 T ＝ d ＋ 跑的時間）
const D = 388, winLane = {}, gaps = [];
let winnerNotFirstStarter = 0, winnerStartsLast = 0, total = 0, lateSprint = 0;
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), r = T.makeRace(lv, D, rnd); total++;
  ok(r.T.length === 4 && r.a.length === 4 && r.d.length === 4 && r.run.length === 4 && r.hues.length === 4 && new Set(r.hues.map(c => c.n)).size === 4, '四個小人、顏色不重複');
  r.T.forEach((t, k) => {
    ok(r.d[k] >= 0 && r.d[k] <= T.DELAY_MAX + 1e-9 && r.run[k] >= T.MIN_RUN - 1e-9 && near(r.d[k] + r.run[k], t, 1e-9), '起跑延遲 ' + r.d[k].toFixed(3) + ' 範圍、跑的時間 ≥ ' + T.MIN_RUN);
    ok(near(T.arriveT(r.a[k], D), r.run[k], 1e-9) && t > 0.5 && t < 1.15, '跑的時間與加速度一致、到達時間合理 ' + t);
    // 位置函式（V1.32）：起跑之前不動、到達那一刻剛好在終點、衝過終點不停（繼續加速往右）、exitT 那一刻剛好跑出畫面（exitD）
    ok(T.runnerX(r, k, 0) === 0 && (r.d[k] <= 0 || T.runnerX(r, k, r.d[k] * 0.99) === 0) && near(T.runnerX(r, k, t), D, 1e-6), '位置：起跑前 0、到達時＝終點');
    ok(T.runnerX(r, k, t + 0.02) > D + 1 && T.runnerX(r, k, t + 1) > r.exitD && T.runnerX(r, k, t + 0.02) < r.exitD + 1e-6 + (T.runnerX(r, k, t + 0.02) - D), '衝過終點之後不停');
    ok(r.exitD > D && r.exitT[k] > t && near(T.runnerX(r, k, r.exitT[k]), r.exitD, 1e-6) && r.exitT[k] - t < 0.25, '到達之後很快（' + (r.exitT[k] - t).toFixed(3) + ' 秒）就跑出畫面右邊');
    { let prev = -1; for (let u = 0; u <= r.exitT[k] + 0.1; u += 0.02) { const x = T.runnerX(r, k, u); ok(x >= prev - 1e-9, '位置只增不減'); prev = x; } }
    ok(k === r.win || T.runnerX(r, k, r.T[r.win] - 1e-9) < D - 1e-6, '第一名到達之前，別人還沒到終點');
  });
  const sorted = r.T.slice().sort((x, y) => x - y);
  ok(near(sorted[0], r.T[r.win]), '最快的是 win');
  ok(near(sorted[1] - sorted[0], T.gapFor(lv), 1e-9), '第一名領先第二名剛好 GAP：' + (sorted[1] - sorted[0]));
  ok(sorted[1] < sorted[2] && sorted[2] < sorted[3], '名次沒有並列');
  ok(sorted[0] >= T.T_WIN[0] - 1e-9 && sorted[0] <= T.T_WIN[1] + 1e-9, '第一名時間範圍');
  ok(sorted[3] - sorted[0] <= T.gapFor(lv) * (1 + 2 * T.SPREAD[1]) + 1e-9, '總時間差上限');
  ok(r.order.length === 4 && r.order[0] === r.win && r.order.every((lane, rank) => near(r.T[lane], sorted[rank], 1e-9)), 'order 是名次');
  winLane[r.win] = (winLane[r.win] || 0) + 1; gaps.push(sorted[1] - sorted[0]);
  // 起跑慢不一定落後：統計「最先到終點的不是最早起跑的」「冠軍是最晚起跑的」的比例
  const firstStart = r.d.indexOf(Math.min(...r.d)), lastStart = r.d.indexOf(Math.max(...r.d));
  if (r.win !== firstStart) winnerNotFirstStarter++; if (r.win === lastStart) winnerStartsLast++;
  if (r.d[r.win] > 0.05) lateSprint++;
}
ok(Object.keys(winLane).length === 4 && Math.min(...Object.values(winLane)) > 1200, '最快的跑道均勻 ' + JSON.stringify(winLane));
ok(winnerNotFirstStarter / total > 0.4, '冠軍常常不是最早起跑的：' + (winnerNotFirstStarter / total).toFixed(2));
ok(winnerStartsLast / total > 0.1, '冠軍有時是最晚起跑的（衝刺快）：' + (winnerStartsLast / total).toFixed(2));
ok(lateSprint / total > 0.5, '冠軍多半也有起跑延遲（不是只有輸家才晚起跑）：' + (lateSprint / total).toFixed(2));
// 人類做得到：最後一關，第一名到終點的那一刻，第二名落後多少像素 ≥ 15 px（約半個身體寬）
{ let worst = 1e9; for (let i = 0; i < 2000; i++) { const r = T.makeRace(60, D, rnd); const t = Math.min(...r.T); const second = r.order[1]; worst = Math.min(worst, D - T.runnerX(r, second, t)); } ok(worst >= 12, '最後一關第二名落後最少 ' + worst.toFixed(1) + ' px'); }
// 跑步姿勢：起跑前、到終點後站著；跑步中手腳擺動、左右相反
{ const r = T.makeRace(5, D, rnd);
  ok(!T.poseAt(r, 0, 0).moving || r.d[0] <= 0, '哨音響的那一刻還沒起跑');
  for (let k = 0; k < 4; k++) { const stand = T.poseAt(r, k, r.d[k] - 0.001); ok(r.d[k] <= 0 || (!stand.moving && stand.armA === 0), '起跑之前站著');
    ok(T.poseAt(r, k, r.T[k] + 0.03).moving, '衝過終點線之後還在跑（V1.32：不停下來）');
    let swing = 0; for (let t = r.d[k] + 0.01; t < r.exitT[k] - 0.01; t += 0.013) { const p = T.poseAt(r, k, t); ok(p.moving && near(p.legA, -p.legB, 1e-9) && near(p.armA, -p.armB, 1e-9) && near(p.legA, -p.armA / 42 * 48, 1e-9), '手腳左右相反、手與腳反向'); swing = Math.max(swing, Math.abs(p.legA)); }
    ok(swing > 40, '腿有擺動起來：' + swing.toFixed(1) + '°'); } }
// V1.32：慢動作重播（每一關、不管對錯）、小人從右邊跑出畫面、終點線畫在到達的位置
ok(T.SLOW > 0 && T.SLOW < 1 && T.REPLAY_FROM > 0 && T.EXIT_PAD >= 0, '慢動作重播的參數');
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_racefirst.js'), css = rd('../../css/reaction5.css').split(/\s+/).join(' ');
  const j = src.indexOf('function judge(lane)'), jEnd = src.indexOf('api.solve = function');
  const body = src.slice(j, jEnd), iReplay = body.indexOf('var ms = replay();'), iPass = body.indexOf('api.pass({'), iFail = body.indexOf('api.fail({');
  ok(iReplay > 0 && iPass > iReplay && iFail > iReplay, '不管答對答錯，pass／fail 之前都會先慢動作重播');
  ok(body.indexOf('if (!ok) ') < 0 || body.indexOf('if (!ok) ') > iReplay, '重播不是「只有答錯才有」');
  ok(src.indexOf("x1: X1, y1: top, x2: X1, y2: top + laneH * 4, 'class': 'rcf-finish'") > 0, '終點線畫在小人到達的位置 X1（腰碰到線＝到達）');
  ok(src.indexOf('makeRace(level, D, api.rand, W + EXIT_PAD - X0)') > 0 && src.indexOf('Math.max.apply(null, q.exitT)') > 0, '小人一直跑到畫面右邊外面');
  ok(src.indexOf('paint(maxT + 1)') < 0 && src.indexOf('distAt(q.a[k], Math.max(0, t - q.d[k]), q.D)') < 0, '不再把小人停在終點線上');
  ok(css.indexOf('.rcf-fmark--pop { animation: rcf-fpop') > 0 && css.indexOf('.rcf-time--win { fill: var(--c-ok);') > 0, '衝線的圈與第一名標示的樣式'); }
// 重播的時間長度（程式裡的算式）：從第一名到終點前 REPLAY_FROM 秒開始、播到最後一個小人跑出畫面，除以 SLOW
{ let worst = 0, best = 1e9; for (let i = 0; i < 3000; i++) { const r = T.makeRace(1 + (i % 60), D, rnd, 472 + T.EXIT_PAD - 40), minT = Math.min(...r.T), maxE = Math.max(...r.exitT) + 0.03, ms = (maxE - Math.max(0, minT - T.REPLAY_FROM)) / T.SLOW * 1000; worst = Math.max(worst, ms); best = Math.min(best, ms); }
  ok(worst < 6000 && best > 1500, '慢動作重播 ' + best.toFixed(0) + '～' + worst.toFixed(0) + ' 毫秒（不會太長、也夠看清楚）'); console.log('慢動作重播 ' + best.toFixed(0) + '～' + worst.toFixed(0) + ' 毫秒'); }
// 倒數
ok(T.COUNT_STEPS === 3 && T.COUNT_MS >= 600, '倒數 3、2、1');
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_racefirst.js'), css = rd('../../css/reaction5.css').split(/\s+/).join(' ');
  ok(src.indexOf('api.after(400 + COUNT_STEPS * COUNT_MS, go);') > 0 && src.indexOf('String(COUNT_STEPS - c)') > 0, '先倒數 3、2、1 再開跑');
  ok(src.indexOf("makeRunner(svg, q.hues[i].h)") > 0 && src.indexOf("'rcf-dot'") < 0, '圓點改成小人');
  ok(css.indexOf('.rcf-count { position: absolute;') > 0 && css.indexOf('font-size: 200px') > 0, '畫面中央的大倒數數字'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(8) && T.rating(8) !== T.rating(14) && T.rating(14) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
