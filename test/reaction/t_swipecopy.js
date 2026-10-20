// 反著滑（swipecopy，企劃 312 依使用者修改）的純函式檢查：方向編號與反方向、滑動方向判定（4／8 個扇形）、箭頭位置（在所指的那一側＝與要滑的方向衝突）、題目（不連續三個同方向）、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_swipecopy.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261117), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.lenFor(1) === Math.min(2, T.LEN_MAX) && T.lenFor(5) === Math.min(6, T.LEN_MAX) && T.lenFor(99) === T.LEN_MAX, '箭頭數＝關卡數＋1，上限 LEN_MAX＝' + T.LEN_MAX + '（使用者調的參數，測試跟著走）');
ok(T.showMsFor(1) === T.SHOW_MS[0] && T.showMsFor(T.RAMP_LEVELS) === T.SHOW_MS[1] && T.showMsFor(99) === T.SHOW_MS[1], '每個箭頭停留 ' + T.SHOW_MS);
ok(T.gapMsFor(1) === T.GAP_MS[0] && T.gapMsFor(T.RAMP_LEVELS) === T.GAP_MS[1], '空檔 ' + T.GAP_MS);
ok(T.dirCountFor(T.DIAG_FROM - 1) === 4 && T.dirCountFor(T.DIAG_FROM) === 8 && T.dirCountFor(40) === 8, '第 ' + T.DIAG_FROM + ' 關起 8 個方向');
for (let l = 2; l <= 60; l++) ok(T.lenFor(l) >= T.lenFor(l - 1) && T.showMsFor(l) <= T.showMsFor(l - 1) && T.gapMsFor(l) <= T.gapMsFor(l - 1) && T.dirCountFor(l) >= T.dirCountFor(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.showMsFor(l - 1) - T.showMsFor(l)); ok(Math.max(...d) - Math.min(...d) <= 1, '停留時間線性縮短：每關 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }

// ── 方向 ──
for (let d = 0; d < 8; d++) { ok(T.opposite(T.opposite(d)) === d && T.opposite(d) !== d, '反方向的反方向是自己 ' + d); const v = T.vec(d), o = T.vec(T.opposite(d)); ok(near(v.x, -o.x, 1e-12) && near(v.y, -o.y, 1e-12), '反方向的向量相反 ' + d); }
ok(T.opposite(0) === 4 && T.opposite(2) === 6 && T.opposite(1) === 5 && T.opposite(7) === 3, '上↔下、右↔左、右上↔左下、左上↔右下');
{ const v0 = T.vec(0), v2 = T.vec(2), v4 = T.vec(4), v6 = T.vec(6); ok(near(v0.x, 0, 1e-12) && near(v0.y, -1) && near(v2.x, 1) && near(v2.y, 0, 1e-12) && near(v4.y, 1) && near(v6.x, -1), 'vec：上 (0,−1)、右 (1,0)、下 (0,1)、左 (−1,0)'); }
ok(T.NAMES.length === 8 && T.NAMES[0] === '上' && T.NAMES[4] === '下' && T.NAMES[2] === '右' && T.NAMES[6] === '左', '方向名稱');

// ── 滑動方向判定 ──
ok(T.swipeDir(0, -100, 4) === 0 && T.swipeDir(100, 0, 4) === 2 && T.swipeDir(0, 100, 4) === 4 && T.swipeDir(-100, 0, 4) === 6, '4 個方向：上、右、下、左');
ok(T.swipeDir(100, -100, 8) === 1 && T.swipeDir(100, 100, 8) === 3 && T.swipeDir(-100, 100, 8) === 5 && T.swipeDir(-100, -100, 8) === 7, '8 個方向的斜角');
ok(T.swipeDir(10, 10, 4) === -1 && T.swipeDir(0, -(T.MIN_SWIPE - 1), 4) === -1 && T.swipeDir(0, -T.MIN_SWIPE, 4) === 0, '位移太短不算滑動（' + T.MIN_SWIPE + ' px）');
// 扇形：4 個方向每個 90°、8 個每個 45°；掃一圈驗證每個角度對應的方向
for (let a = 0; a < 360; a += 3) {
  const rad = a * Math.PI / 180, dx = 100 * Math.sin(rad), dy = -100 * Math.cos(rad);
  const d4 = T.swipeDir(dx, dy, 4), d8 = T.swipeDir(dx, dy, 8);
  if ((a + 45) % 90 === 0) continue;                                                    /* 剛好在兩個扇形的交界上（浮點數誤差會讓結果跳來跳去），不測 */
  ok(d4 === (Math.round(a / 90) % 4) * 2 && d8 === Math.round(a / 45) % 8, '角度 ' + a + '° → 4 向 ' + d4 + '、8 向 ' + d8);
  ok(d4 % 2 === 0 && d4 >= 0 && d4 <= 6 && d8 >= 0 && d8 <= 7, '編號在範圍內');
}
for (let d = 0; d < 8; d++) { const v = T.vec(d); ok(T.swipeDir(v.x * 80, v.y * 80, 8) === d, '沿 ' + T.NAMES[d] + ' 的方向滑 → ' + d); if (d % 2 === 0) ok(T.swipeDir(v.x * 80, v.y * 80, 4) === d, '4 向也一樣：' + d); }
// 容忍歪一點：偏離 ±40° 以內（4 向）、±20°（8 向）還是同一個方向
for (let d = 0; d < 8; d++) for (const off of [-20, 20]) { const a = (d * 45 + off) * Math.PI / 180; ok(T.swipeDir(80 * Math.sin(a), -80 * Math.cos(a), 8) === d, '8 向歪 ' + off + '°：' + d); if (d % 2 === 0) for (const off4 of [-40, 40]) { const a4 = (d * 45 + off4) * Math.PI / 180; ok(T.swipeDir(80 * Math.sin(a4), -80 * Math.cos(a4), 4) === d, '4 向歪 ' + off4 + '°：' + d); } }

// ── 箭頭位置：在所指的那一側（跟要滑的反方向衝突）、不超出範圍 ──
{ const W = 440, H = 400, m = 62; let sideOk = 0, total = 0;
  for (let i = 0; i < 2000; i++) { const d = Math.floor(rnd() * 8), p = T.positionFor(d, W, H, m, rnd), v = T.vec(d); total++;
    ok(p.x >= m - 1e-9 && p.x <= W - m + 1e-9 && p.y >= m - 1e-9 && p.y <= H - m + 1e-9, '位置在範圍內 ' + p.x.toFixed(0) + ',' + p.y.toFixed(0));
    const dx = p.x - W / 2, dy = p.y - H / 2; if (v.x * dx + v.y * dy > 0) sideOk++;                           /* 位置在所指方向的那一側（內積為正） */
    if (d % 2 === 0) { const o = T.vec(T.opposite(d)); ok(o.x * dx + o.y * dy < 0, '朝 ' + T.NAMES[d] + ' 的箭頭不會出現在要滑的那一側（反方向）：位置與要滑的方向衝突'); } }
  ok(sideOk / total > 0.95, '箭頭幾乎都出現在所指的那一側：' + (100 * sideOk / total).toFixed(1) + '%'); }

// ── 整關 ──
let total = 0, dist = [0, 0, 0, 0, 0, 0, 0, 0], diag = 0;
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  ok(q.len === T.lenFor(lv) && q.dirs.length === q.len && q.req.length === q.len, '第 ' + lv + ' 關：' + q.len + ' 個箭頭');
  ok(q.req.every((r, k) => r === T.opposite(q.dirs[k])), '要滑的方向＝箭頭的反方向');
  ok(q.showMs === T.showMsFor(lv) && q.gapMs === T.gapMsFor(lv) && q.nDir === T.dirCountFor(lv), '速度、方向數');
  if (q.nDir === 4) ok(q.dirs.every(d => d % 2 === 0), '4 向的關卡只有上下左右'); else if (q.dirs.some(d => d % 2 === 1)) diag++;
  let triple = false; for (let k = 2; k < q.len; k++) if (q.dirs[k] === q.dirs[k - 1] && q.dirs[k] === q.dirs[k - 2]) triple = true; ok(!triple, '不會連續三個同方向：' + q.dirs);
  if (q.len >= 3) ok(!q.dirs.every(d => d === q.dirs[0]), '不會全部同一個方向');
  q.dirs.forEach(d => { dist[d]++; });
}
console.log('方向分布 ' + dist.join(',') + '；有斜箭頭的 8 向關卡 ' + diag);
const arrows = dist.reduce((a, b) => a + b, 0);       // 箭頭總數（一串的長度由 LEN_MAX 決定，所以門檻用比例）
ok([0, 2, 4, 6].every(d => dist[d] > arrows * 0.05) && [1, 3, 5, 7].every(d => dist[d] > arrows * 0.015), '各方向都有出現（總共 ' + arrows + ' 個箭頭）');
ok(diag > 300, '8 向關卡確實出現斜箭頭：' + diag);
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_swipecopy.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 300 \+ len \* REPLAY_MS \+ 2200/.test(src) && /swc-cell--bad/.test(src) && /opposite/.test(src), '失敗：整串箭頭＋該滑的方向、錯的標紅、重播、停格 2 秒以上');
  ok(/\.swc-sign__disc \{[^}]*var\(--swc-blue\)/.test(css) && /\.swc-cell--bad \{[^}]*var\(--c-bad/.test(css), '藍色圓牌、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_swipecopy.js'") > 0 && /反方向/.test(G.rule), 'boot.js 有載入、玩法說明提到反方向'); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
