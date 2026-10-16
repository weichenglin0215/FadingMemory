const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sneakmove.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 40) console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261015); const rnd = rng(SEED);

// 難度曲線：速度、圓點數、會動的個數、每顆動幾秒
ok(near(T.speedFor(1), T.SPEED[0]) && near(T.speedFor(T.RAMP_LEVELS), T.SPEED[1]) && near(T.speedFor(60), T.SPEED[1]), '速度 ' + T.SPEED);
for (let l = 2; l <= 60; l++) ok(T.speedFor(l) <= T.speedFor(l - 1) + 1e-12, '速度單調 ' + l);
// 玩家自己調過 N_DOTS／MOVE_DOTS／MOVE_TIME／SPEED／TIME_S：測試跟著參數走
ok(T.dotCountFor(1) === T.N_DOTS[0] && T.dotCountFor(T.RAMP_LEVELS) === T.N_DOTS[1] && T.dotCountFor(60) === T.N_DOTS[1], '圓點數 ' + T.N_DOTS + '（到頂關卡之後維持）');
ok(T.moverCountFor(1) === T.MOVE_DOTS[0] && T.moverCountFor(T.RAMP_LEVELS) === T.MOVE_DOTS[1] && T.moverCountFor(60) === T.MOVE_DOTS[1], '會動的 ' + T.MOVE_DOTS);
ok(near(T.moveTimeFor(1), T.MOVE_TIME[0]) && near(T.moveTimeFor(T.RAMP_LEVELS), T.MOVE_TIME[1]) && near(T.moveTimeFor(60), T.MOVE_TIME[1]), '每顆動 ' + T.MOVE_TIME + ' 秒');
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
    // 路徑：從起點直直走 m.len，走到盡頭就掉頭走回來；整段路徑都在畫面內
    const need = q.speed * T.movedTime(k, q.moveTime, mi, q.limitS), pe = { x: m.x0 + m.dx * m.len, y: m.y0 + m.dy * m.len };
    ok(m.len > 0 && m.len <= need + 1e-6, '路徑長度 ' + m.len.toFixed(1) + ' 不超過整個限時要走的 ' + need.toFixed(1));
    ok(pe.x >= T.MARGIN - 1e-6 && pe.x <= W - T.MARGIN + 1e-6 && pe.y >= T.MARGIN - 1e-6 && pe.y <= H - T.MARGIN + 1e-6, '路徑的盡頭在界內');
    for (let st = 0; st <= 12; st++) { const tt = q.limitS * st / 12, pp = T.posAt(q, mi, tt); ok(pp.x >= T.MARGIN - 1e-6 && pp.x <= W - T.MARGIN + 1e-6 && pp.y >= T.MARGIN - 1e-6 && pp.y <= H - T.MARGIN + 1e-6, '整個限時內都在界內'); const dd = Math.hypot(pp.x - m.x0, pp.y - m.y0); ok(dd <= m.len + 1e-6 && near(dd, T.triangle(q.speed * T.movedTime(k, q.moveTime, mi, tt), m.len), 1e-6), '離起點的距離 ＝ 三角波(速度×已經動的秒數)'); }
    ok(near(T.posAt(q, mi, 0).x, m.x0) && near(T.posAt(q, mi, 0).y, m.y0), 't=0 在起點');
    if (q.gap > 0) {
      const clearR = Math.min(T.PATH_CLEAR, q.gap - 4);
      q.dots.forEach((d, di) => { if (!q.movers.some(o => o.idx === di)) ok(T.segDist(d.x, d.y, m.x0, m.y0, pe.x, pe.y) >= clearR - 1e-6, '路徑離不動的點夠遠'); });
      q.movers.forEach((o, oi) => { if (oi > mi) { const oe = { x: o.x0 + o.dx * o.len, y: o.y0 + o.dy * o.len }; ok(T.segsDist({ x: m.x0, y: m.y0 }, pe, { x: o.x0, y: o.y0 }, oe) >= clearR - 1e-6, '會動的圓點之間的路徑也夠遠'); } });
    }
  });
}
// 難度最高關：都排得出來、而且夠快
{ const t0 = Date.now(); for (let i = 0; i < 100; i++) { const q = T.makeLevel(45, W, H, rnd); ok(q.dots.length === T.N_DOTS[1] && q.movers.length === T.MOVE_DOTS[1], '最高難度排得出來'); } ok(Date.now() - t0 < 8000, '出題夠快：' + (Date.now() - t0) + ' ms'); }
// V1.32：玩家回報兩顆會動時圓點排成整齊的 5 欄陣列、會動的永遠是左上角兩顆 → 不再有固定格子的保底；位置全是浮點數、隨機
{ const moverIdx = {}, xs = new Set(); let grid = 0, frac = 0, total = 0, lows = 0;
  for (let i = 0; i < 400; i++) {
    const lv = 10 + (i % 51), q = T.makeLevel(lv, W, H, rnd);
    if (q.gap === 0) grid++;
    q.movers.forEach(m => { moverIdx[m.idx] = (moverIdx[m.idx] || 0) + 1; });
    q.dots.forEach(d => { total++; if (!Number.isInteger(d.x) || !Number.isInteger(d.y)) frac++; xs.add(d.x.toFixed(3) + ',' + d.y.toFixed(3)); });
    // 不是整齊的陣列：不會有「5 欄 × 固定 80px 間距」的排列
    const gridLike = q.dots.every((d, a) => Math.abs(d.x - (T.MARGIN + 30 + (a % 5) * 80)) < 1e-9 && Math.abs(d.y - (T.MARGIN + 30 + Math.floor(a / 5) * 76)) < 1e-9);
    ok(!gridLike, '圓點不是固定的格子排列 lv' + lv);
    q.movers.forEach(m => { ok(m.len >= Math.min(T.TRAVEL_MIN / 2, q.speed * T.movedTime(q.movers.length, q.moveTime, 0, q.limitS)) - 1e-6 || q.gap < T.MIN_GAP_FLOOR, '會動的路徑夠長（看得出在動）'); });
  }
  ok(grid === 0, '沒有用到保底（gap 0）：' + grid);
  ok(Object.keys(moverIdx).length > 30 && !(moverIdx[0] > 300 && moverIdx[1] > 300), '會動的圓點編號是隨機的，不是永遠第 0、1 顆：' + Object.keys(moverIdx).length + ' 種編號');
  ok(frac / total > 0.99, '圓心位置是浮點數（有小數）：' + (frac / total * 100).toFixed(1) + '%');
  ok(xs.size > total * 0.95, '位置各不相同'); }
// 三角波
ok(near(T.triangle(0, 100), 0) && near(T.triangle(40, 100), 40) && near(T.triangle(100, 100), 100) && near(T.triangle(130, 100), 70) && near(T.triangle(200, 100), 0) && near(T.triangle(230, 100), 30) && T.triangle(5, 0) === 0, '三角波：走到盡頭掉頭走回來');
// freeLen：碰到邊界或障礙就停
{ const L1 = T.freeLen(100, 100, 1, 0, [], 472, 576, 50); ok(near(L1, 472 - T.MARGIN - 100), '朝右走到邊界：' + L1);
  const L2 = T.freeLen(100, 100, 1, 0, [{ x: 250, y: 100 }], 472, 576, 52); ok(near(L2, 150 - 52), '朝右走，前面 150px 有一個點，離它 52px 就停：' + L2);
  const L3 = T.freeLen(100, 100, 1, 0, [{ x: 250, y: 200 }], 472, 576, 52); ok(L3 > 300, '障礙離路徑太遠（100px）不影響：' + L3);
  const L4 = T.freeLen(100, 100, 1, 0, [{ x: 50, y: 100 }], 472, 576, 52); ok(near(L4, 472 - T.MARGIN - 100), '障礙在背後不影響'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
// 接線：點到任何一顆會動的都算對、限時依會動的個數
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_sneakmove.js'), 'utf8');
  ok(src.indexOf('moverOf[i] != null ? posAt(q, moverOf[i], t) : d') > 0 && src.indexOf('var ok = moverOf[i] != null;') > 0, '點到任何一顆會動的都算對');
  ok(src.indexOf('api.timer(q.limitS * 1000') > 0, '限時＝TIME_S × 會動的個數'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
