// 反著滑（swipecopy，企劃 312 依使用者修改；V1.36.0 改成一次一個箭頭、箭頭一出現就可以滑）的純函式檢查：
// 方向編號與反方向、滑動方向判定（4／8 個扇形）、九宮格（箭頭所指的那一格、隨關卡增加的「任意一格」機率）、題目、難度線性、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_swipecopy.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261117), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（參數跟著檔案最前面走；使用者手調過）──
ok(T.showMsFor(1) === T.SHOW_MS[0] && T.showMsFor(T.RAMP_LEVELS) === T.SHOW_MS[1] && T.showMsFor(999) === T.SHOW_MS[1], '箭頭亮 ' + T.SHOW_MS + ' 毫秒');
ok(T.respMsFor(1) === T.RESP_MS[0] && T.respMsFor(T.RAMP_LEVELS) === T.RESP_MS[1] && T.respMsFor(999) === T.RESP_MS[1], '可以滑的時間 ' + T.RESP_MS + ' 毫秒（從箭頭出現算起）');
for (let l = 1; l <= 90; l++) ok(T.respMsFor(l) >= T.showMsFor(l), '第 ' + l + ' 關：可以滑的時間（' + T.respMsFor(l) + '）不比箭頭亮的時間（' + T.showMsFor(l) + '）短——箭頭消失之後還可以繼續滑');
ok(T.RESP_MS[0] > T.SHOW_MS[0] && T.RESP_MS[1] > T.SHOW_MS[1], '參數：可以滑的時間比箭頭亮的時間長（使用者的例子：亮 0.5 秒、可以滑到 1.0 秒）');
ok(T.dirCountFor(T.DIAG_FROM - 1) === 4 && T.dirCountFor(T.DIAG_FROM) === 8 && T.dirCountFor(40) === 8, '第 ' + T.DIAG_FROM + ' 關起 8 個方向');
ok(T.scatterPFor(T.SCATTER_FROM - 1) === 0 && near(T.scatterPFor(T.SCATTER_FROM), T.scatterPFor(T.SCATTER_FROM)) && T.scatterPFor(T.SCATTER_FROM) >= T.SCATTER_P[0] - 1e-9 && near(T.scatterPFor(T.RAMP_LEVELS), T.SCATTER_P[1], 1e-6) && near(T.scatterPFor(999), T.SCATTER_P[1], 1e-6), '出現在任意一格的機率：第 ' + T.SCATTER_FROM + ' 關以前 0，之後 ' + T.SCATTER_P[0] + ' → 到頂 ' + T.SCATTER_P[1]);
for (let l = 2; l <= 90; l++) ok(T.showMsFor(l) <= T.showMsFor(l - 1) && T.respMsFor(l) <= T.respMsFor(l - 1) && T.dirCountFor(l) >= T.dirCountFor(l - 1) && T.scatterPFor(l) >= T.scatterPFor(l - 1), '難度單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.showMsFor(l - 1) - T.showMsFor(l)); ok(Math.max(...d) - Math.min(...d) <= 1, '亮的時間線性縮短：每關 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }

// ── 方向 ──
for (let d = 0; d < 8; d++) { ok(T.opposite(T.opposite(d)) === d && T.opposite(d) !== d, '反方向的反方向是自己 ' + d); const v = T.vec(d), o = T.vec(T.opposite(d)); ok(near(v.x, -o.x, 1e-12) && near(v.y, -o.y, 1e-12), '反方向的向量相反 ' + d); }
ok(T.opposite(0) === 4 && T.opposite(2) === 6 && T.opposite(1) === 5 && T.opposite(7) === 3, '上↔下、右↔左、右上↔左下、左上↔右下');
{ const v0 = T.vec(0), v2 = T.vec(2), v4 = T.vec(4), v6 = T.vec(6); ok(near(v0.x, 0, 1e-12) && near(v0.y, -1) && near(v2.x, 1) && near(v2.y, 0, 1e-12) && near(v4.y, 1) && near(v6.x, -1), 'vec：上 (0,−1)、右 (1,0)、下 (0,1)、左 (−1,0)'); }
ok(T.NAMES.length === 8 && T.NAMES[0] === '上' && T.NAMES[4] === '下' && T.NAMES[2] === '右' && T.NAMES[6] === '左', '方向名稱');

// ── 滑動方向判定 ──
ok(T.swipeDir(0, -100, 4) === 0 && T.swipeDir(100, 0, 4) === 2 && T.swipeDir(0, 100, 4) === 4 && T.swipeDir(-100, 0, 4) === 6, '4 個方向：上、右、下、左');
ok(T.swipeDir(100, -100, 8) === 1 && T.swipeDir(100, 100, 8) === 3 && T.swipeDir(-100, 100, 8) === 5 && T.swipeDir(-100, -100, 8) === 7, '8 個方向的斜角');
ok(T.swipeDir(10, 10, 4) === -1 && T.swipeDir(0, -(T.MIN_SWIPE - 1), 4) === -1 && T.swipeDir(0, -T.MIN_SWIPE, 4) === 0, '位移太短不算滑動（' + T.MIN_SWIPE + ' px）；一超過就立刻有方向');
for (let a = 0; a < 360; a += 3) {
  const rad = a * Math.PI / 180, dx = 100 * Math.sin(rad), dy = -100 * Math.cos(rad);
  const d4 = T.swipeDir(dx, dy, 4), d8 = T.swipeDir(dx, dy, 8);
  if ((a + 45) % 90 === 0) continue;                                                    /* 剛好在兩個扇形的交界上（浮點數誤差會讓結果跳來跳去），不測 */
  ok(d4 === (Math.round(a / 90) % 4) * 2 && d8 === Math.round(a / 45) % 8, '角度 ' + a + '° → 4 向 ' + d4 + '、8 向 ' + d8);
  ok(d4 % 2 === 0 && d4 >= 0 && d4 <= 6 && d8 >= 0 && d8 <= 7, '編號在範圍內');
}
for (let d = 0; d < 8; d++) { const v = T.vec(d); ok(T.swipeDir(v.x * 80, v.y * 80, 8) === d, '沿 ' + T.NAMES[d] + ' 的方向滑 → ' + d); if (d % 2 === 0) ok(T.swipeDir(v.x * 80, v.y * 80, 4) === d, '4 向也一樣：' + d); }
for (let d = 0; d < 8; d++) for (const off of [-20, 20]) { const a = (d * 45 + off) * Math.PI / 180; ok(T.swipeDir(80 * Math.sin(a), -80 * Math.cos(a), 8) === d, '8 向歪 ' + off + '°：' + d); }
for (let d = 0; d < 8; d += 2) for (const off4 of [-40, 40]) { const a = (d * 45 + off4) * Math.PI / 180; ok(T.swipeDir(80 * Math.sin(a), -80 * Math.cos(a), 4) === d, '4 向歪 ' + off4 + '°：' + d); }

// ── 九宮格：格子編號 0～8（由左到右、由上到下）；箭頭所指的那一格 ──
ok(T.CELL_OF_DIR.join() === '1,2,5,8,7,6,3,0', '箭頭所指的那一格：上＝上方中間(1)、右上＝右上角(2)、右＝右邊中間(5)、右下＝右下角(8)、下＝下方中間(7)、左下＝左下角(6)、左＝左邊中間(3)、左上＝左上角(0)');
for (let d = 0; d < 8; d++) {
  const c = T.CELL_OF_DIR[d], cx = c % 3 - 1, cy = Math.floor(c / 3) - 1, v = T.vec(d);
  ok(Math.sign(cx) === Math.sign(Math.round(v.x * 10) / 10) && Math.sign(cy) === Math.sign(Math.round(v.y * 10) / 10), '第 ' + c + ' 格在中心的 (' + cx + ',' + cy + ') 方向，跟箭頭 ' + T.NAMES[d] + ' 指的方向一致');
  const o = T.CELL_OF_DIR[T.opposite(d)]; ok(c + o === 8, '箭頭所指的那一格，跟反方向的那一格，對稱於中心（編號相加 8）：' + c + '＋' + o);
}
ok(T.cellFor(0, false, rnd) === 1 && T.cellFor(6, false, rnd) === 3, 'scatter 為假：就是它所指的那一格');
{ const seen = new Set(); for (let i = 0; i < 400; i++) { const c = T.cellFor(0, true, rnd); seen.add(c); ok(Number.isInteger(c) && c >= 0 && c <= 8, '格子編號在 0～8'); } ok(seen.size === 9, 'scatter 為真：9 格都會出現（包含正中間那一格）：' + seen.size); }
{ const c = T.cellCenter(0, 300, 330), e = T.cellCenter(8, 300, 330), m = T.cellCenter(4, 300, 330); ok(near(c.x, 50) && near(c.y, 55) && near(e.x, 250) && near(e.y, 275) && near(m.x, 150) && near(m.y, 165) && near(c.cw, 100) && near(c.ch, 110), 'cellCenter：每格中央（位置固定、不會偏移）'); }

// ── 整關：一個箭頭 ──
let total = 0, dist = [0, 0, 0, 0, 0, 0, 0, 0], diag = 0; const byLv = {};
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd); total++;
  ok(q.dirs.length === 1 && q.req.length === 1, '第 ' + lv + ' 關：只有一個箭頭');
  ok(q.req[0] === T.opposite(q.dirs[0]), '要滑的方向＝箭頭的反方向');
  ok(q.showMs === T.showMsFor(lv) && q.respMs === T.respMsFor(lv) && q.nDir === T.dirCountFor(lv), '速度、時間、方向數');
  ok(q.prepMs >= T.PREP_MS[0] && q.prepMs <= T.PREP_MS[1], '箭頭出現之前的等待 ' + q.prepMs + ' 毫秒在 ' + T.PREP_MS + ' 之內（隨機）');
  ok(Number.isInteger(q.cell) && q.cell >= 0 && q.cell <= 8 && q.matched === (q.cell === T.CELL_OF_DIR[q.dirs[0]]), '格子 ' + q.cell + '、matched 標記正確');
  if (q.nDir === 4) ok(q.dirs[0] % 2 === 0, '4 向的關卡只有上下左右'); else if (q.dirs[0] % 2 === 1) diag++;
  if (lv < T.SCATTER_FROM) ok(q.matched, '第 ' + lv + ' 關（簡單）：箭頭一定出現在它所指的那一格（朝上的在上方中間）');
  dist[q.dirs[0]]++;
  (byLv[lv] = byLv[lv] || { n: 0, matched: 0 }).n++; if (q.matched) byLv[lv].matched++;
}
console.log('方向分布 ' + dist.join(',') + '；有斜箭頭的 8 向關卡 ' + diag + '；所指那一格的比例：第 1 關 ' + (byLv[1].matched / byLv[1].n * 100).toFixed(0) + '%、第 ' + T.SCATTER_FROM + ' 關 ' + (byLv[T.SCATTER_FROM].matched / byLv[T.SCATTER_FROM].n * 100).toFixed(0) + '%、第 15 關 ' + (byLv[15].matched / byLv[15].n * 100).toFixed(0) + '%、第 30 關 ' + (byLv[30].matched / byLv[30].n * 100).toFixed(0) + '%');
ok([0, 2, 4, 6].every(d => dist[d] > total * 0.1) && [1, 3, 5, 7].every(d => dist[d] > total * 0.02), '各方向都有出現（共 ' + total + ' 個箭頭）');
ok(diag > 300, '8 向關卡確實出現斜箭頭：' + diag);
// 越後面，箭頭越常出現在「不是它所指的那一格」（9 格任選時，剛好是所指那格的機率只有 1/9）
ok(byLv[T.SCATTER_FROM].matched / byLv[T.SCATTER_FROM].n > byLv[T.RAMP_LEVELS].matched / byLv[T.RAMP_LEVELS].n + 0.3, '「所指的那一格」的比例越後面越低');
ok(byLv[T.RAMP_LEVELS].matched / byLv[T.RAMP_LEVELS].n < 0.2, '到頂的關卡幾乎都是任意一格（所指那一格只有約 1/9）：' + (byLv[T.RAMP_LEVELS].matched / byLv[T.RAMP_LEVELS].n * 100).toFixed(1) + '%');
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_swipecopy.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(src.indexOf("phase = 'live'; t0 = performance.now()") > 0 && src.indexOf('if (d >= 0) judge(d, performance.now() - t0)') > 0, '箭頭一出現就開始計時，位移超過 MIN_SWIPE 就立刻判定（不用等手指放開）');
  ok(src.indexOf("api.after(q.respMs, function () { if (phase === 'live') fail(-1, 0); })") > 0 && src.indexOf('api.after(q.showMs, function () { if (popEl') > 0, '箭頭亮 showMs 之後消失，但可以滑到 respMs 為止，超時就失敗');
  ok(src.indexOf("if (phase !== 'live' || done || api.over) { if (phase === 'wait')") > 0, '箭頭出現之前的滑動不算');
  ok(src.indexOf("(rt / 1000).toFixed(4) + ' 秒'") > 0, '過關後顯示反應時間（4 位小數的秒）');
  ok(src.indexOf('api.fail({ delay: 2600') > 0 && /swc-cell--bad/.test(src) && /opposite/.test(src), '失敗：箭頭、該滑的方向、你滑的方向並排、紅色標記、停格 2 秒以上');
  ok(css.indexOf('.swc-gridline { position: absolute;') >= 0 && /\.swc-sign__disc \{[^}]*var\(--swc-blue\)/.test(css) && /\.swc-cell--bad \{[^}]*var\(--c-bad/.test(css), '九宮格線、藍色圓牌、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_swipecopy.js'") > 0 && /反方向/.test(G.rule) && /九宮格/.test(G.rule) && /越快/.test(G.rule), 'boot.js 有載入、玩法說明提到九宮格、反方向、越快越好'); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
