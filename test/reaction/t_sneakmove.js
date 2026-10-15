const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sneakmove.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 40) console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261015); const rnd = rng(SEED);

// 難度曲線：速度、圓點數、會動的個數、每顆動幾秒
ok(near(T.speedFor(1), T.SPEED[0]) && near(T.speedFor(T.RAMP_LEVELS), T.SPEED[1]) && near(T.speedFor(60), T.SPEED[1]), '速度 ' + T.SPEED);
for (let l = 2; l <= 60; l++) ok(T.speedFor(l) <= T.speedFor(l - 1) + 1e-12, '速度單調 ' + l);
ok(T.N_DOTS.join() === '10,30' && T.MOVE_DOTS.join() === '1,3' && T.MOVE_TIME.join() === '3,1', '預設參數 N_DOTS=[10,30]、MOVE_DOTS=[1,3]、MOVE_TIME=[3,1]');
ok(T.dotCountFor(1) === 10 && T.dotCountFor(T.RAMP_LEVELS) === 30 && T.dotCountFor(60) === 30, '圓點數 10 → 30（到頂關卡之後維持）');
ok(T.moverCountFor(1) === 1 && T.moverCountFor(T.RAMP_LEVELS) === 3 && T.moverCountFor(60) === 3, '會動的 1 → 3');
ok(near(T.moveTimeFor(1), 3) && near(T.moveTimeFor(T.RAMP_LEVELS), 1) && near(T.moveTimeFor(60), 1), '每顆動 3 → 1 秒');
for (let l = 2; l <= 60; l++) ok(T.dotCountFor(l) >= T.dotCountFor(l - 1) && T.moverCountFor(l) >= T.moverCountFor(l - 1) && T.moveTimeFor(l) <= T.moveTimeFor(l - 1) + 1e-9, '單調 ' + l);
// 限時：1 顆＝TIME_S、2 顆＝2 倍、3 顆＝3 倍
ok(T.limitFor(1) === T.TIME_S && T.limitFor(2) === T.TIME_S * 2 && T.limitFor(3) === T.TIME_S * 3, '限時：2 顆延長成 2 倍、3 顆 3 倍');
ok(near(T.segDist(0, 5, -10, 0, 10, 0), 5) && near(T.segDist(15, 0, -10, 0, 10, 0), 5) && near(T.segDist(0, 0, 0, 0, 0, 0), 0), 'segDist');
ok(near(T.segsDist({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 }), 0) && near(T.segsDist({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 7 }, { x: 10, y: 7 }), 7) && near(T.segsDist({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 13, y: 4 }, { x: 20, y: 4 }), 5), 'segsDist：相交 0、平行 7、端點 5');

// 輪流移動：只有 1 顆＝動 mt 秒、暫停 1 秒、再動；2 顆以上＝輪流、不暫停
{ const mt = 3;
  // k=1：週期 4 秒（動 3、停 1）
  ok(T.movedTime(1, mt, 0, 0) === 0 && T.movedTime(1, mt, 0, 1.5) === 1.5 && T.movedTime(1, mt, 0, 3) === 3 && T.movedTime(1, mt, 0, 3.5) === 3 && T.movedTime(1, mt, 0, 4) === 3 && T.movedTime(1, mt, 0, 4.5) === 3.5 && T.movedTime(1, mt, 0, 7) === 6 && T.movedTime(1, mt, 0, 8) === 6, '1 顆：動 3 秒、停 1 秒、再動 3 秒…');
  ok(T.PAUSE_S === 1, '暫停 1 秒');
  ok(T.activeAt(1, mt, 0) === 0 && T.activeAt(1, mt, 2.9) === 0 && T.activeAt(1, mt, 3.2) === -1 && T.activeAt(1, mt, 4.1) === 0, '1 顆：暫停時沒有任何一顆在動');
  // k=3：0 號動 [0,3)、1 號 [3,6)、2 號 [6,9)、再換回 0 號 [9,12)…
  ok(T.movedTime(3, mt, 0, 3) === 3 && T.movedTime(3, mt, 0, 6) === 3 && T.movedTime(3, mt, 0, 9) === 3 && T.movedTime(3, mt, 0, 10.5) === 4.5, '3 顆：0 號動完就換別顆，9 秒之後又輪回來');
  ok(T.movedTime(3, mt, 1, 3) === 0 && T.movedTime(3, mt, 1, 4.5) === 1.5 && T.movedTime(3, mt, 1, 6) === 3 && T.movedTime(3, mt, 1, 9) === 3 && T.movedTime(3, mt, 1, 13.5) === 4.5, '3 顆：1 號 3～6 秒動');
  ok(T.activeAt(3, mt, 0) === 0 && T.activeAt(3, mt, 3) === 1 && T.activeAt(3, mt, 6) === 2 && T.activeAt(3, mt, 9) === 0 && T.activeAt(3, mt, 5.99) === 1, '3 顆：立刻換下一顆（沒有空檔）');
  // 任何時刻，2 顆以上時剛好有一顆在動（動的總時間＝經過的時間）；1 顆時動的時間 ＜ 經過的時間
  for (const k of [2, 3]) for (let t = 0; t <= 40; t += 0.37) { let sum = 0; for (let i = 0; i < k; i++) sum += T.movedTime(k, 1.7, i, t); ok(near(sum, t, 1e-9), k + ' 顆：同一時間只有一顆在動，總動作時間＝經過時間：' + sum + ' vs ' + t); }
  // movedTime 單調不減、每秒最多增加 1 秒
  for (const k of [1, 2, 3]) for (let i = 0; i < k; i++) { let prev = 0; for (let t = 0; t <= 30; t += 0.1) { const m = T.movedTime(k, 1.3, i, t); ok(m >= prev - 1e-9 && m - prev <= 0.1 + 1e-9, 'movedTime 連續遞增'); prev = m; } } }

// 整關驗證：位置、間距、路徑清爽、全部在界內；位置是時間的純函式
const W = 472, H = 576;
for (let i = 0; i < 600; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, W, H, rnd), n = T.dotCountFor(lv), k = q.movers.length;
  ok(q.dots.length === n && k === Math.min(T.moverCountFor(lv), n - 1) && q.limitS === T.limitFor(k), '點數、會動的個數、限時');
  ok(new Set(q.movers.map(m => m.idx)).size === k && q.movers.every(m => m.idx >= 0 && m.idx < n), '會動的是不同的圓點');
  q.dots.forEach((d, a) => {
    ok(d.x >= T.MARGIN - 1e-9 && d.x <= W - T.MARGIN + 1e-9 && d.y >= T.MARGIN - 1e-9 && d.y <= H - T.MARGIN + 1e-9, '點在界內');
    for (let b = a + 1; b < n; b++) ok(Math.hypot(d.x - q.dots[b].x, d.y - q.dots[b].y) >= Math.min(T.MIN_GAP, q.gap) - 1e-9 && q.gap >= T.MIN_GAP_FLOOR - 1e-9 || q.gap === 0, '間距 ' + a + ',' + b);
  });
  ok(near(q.speed, T.speedFor(lv)) && near(q.moveTime, T.moveTimeFor(lv)), '速度與每顆動的秒數');
  q.movers.forEach((m, mi) => {
    ok(near(Math.hypot(m.dx, m.dy), 1, 1e-9), '方向是單位向量');
    ok(near(m.x0, q.dots[m.idx].x) && near(m.y0, q.dots[m.idx].y), '起點就是那顆圓點');
    const end = T.posAt(q, mi, q.limitS), moved = q.speed * T.movedTime(k, q.moveTime, mi, q.limitS);
    ok(end.x >= T.MARGIN - 1e-6 && end.x <= W - T.MARGIN + 1e-6 && end.y >= T.MARGIN - 1e-6 && end.y <= H - T.MARGIN + 1e-6, '終點在界內');
    ok(near(Math.hypot(end.x - m.x0, end.y - m.y0), moved, 1e-6), '限時內走的距離＝速度×已經動的秒數');
    ok(near(T.posAt(q, mi, 0).x, m.x0) && near(T.posAt(q, mi, 0).y, m.y0), 't=0 在起點');
    if (q.gap > 0) {
      q.dots.forEach((d, di) => { if (!q.movers.some(o => o.idx === di)) ok(T.segDist(d.x, d.y, m.x0, m.y0, end.x, end.y) >= T.PATH_CLEAR - 1e-6, '路徑離不動的點夠遠'); });
      q.movers.forEach((o, oi) => { if (oi > mi) { const oe = T.posAt(q, oi, q.limitS); ok(T.segsDist({ x: m.x0, y: m.y0 }, end, { x: o.x0, y: o.y0 }, oe) >= T.PATH_CLEAR - 1e-6, '會動的圓點之間的路徑也夠遠'); } });
    }
  });
}
// 難度最高關（30 圓點、3 顆會動）：都排得出來、而且很快
{ const t0 = Date.now(); for (let i = 0; i < 200; i++) { const q = T.makeLevel(45, W, H, rnd); ok(q.dots.length === 30 && q.movers.length === 3, '最高難度排得出來'); } ok(Date.now() - t0 < 4000, '出題夠快：' + (Date.now() - t0) + ' ms'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
// 接線：點到任何一顆會動的都算對、限時依會動的個數
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_sneakmove.js'), 'utf8');
  ok(src.indexOf('moverOf[i] != null ? posAt(q, moverOf[i], t) : d') > 0 && src.indexOf('var ok = moverOf[i] != null;') > 0, '點到任何一顆會動的都算對');
  ok(src.indexOf('api.timer(q.limitS * 1000') > 0, '限時＝TIME_S × 會動的個數'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
