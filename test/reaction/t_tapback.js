const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_tapback.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261024); const rnd = rng(SEED);

// 長度 3 → 8，每 2 關多 1 個
ok(T.lenFor(1) === 3 && T.lenFor(2) === 3 && T.lenFor(3) === 4 && T.lenFor(11) === 8 && T.lenFor(12) === 8 && T.lenFor(60) === 8, '長度 3 → 8');
for (let l = 2; l <= 60; l++) ok(T.lenFor(l) >= T.lenFor(l - 1) && T.lenFor(l) - T.lenFor(l - 1) <= 1, '長度每次最多多 1：' + l);
// 速度：到頂前線性
ok(T.flashMs(1) === 800 && T.flashMs(T.SPEED_LEVELS) === 350 && T.flashMs(60) === 350, '亮起時間 800 → 350');
ok(T.gapMs(1) === 260 && T.gapMs(T.SPEED_LEVELS) === 120, '空檔 260 → 120');
for (let l = 2; l <= 60; l++) ok(T.flashMs(l) <= T.flashMs(l - 1) && T.ansMs(l) >= 5000 - 1 || T.ansMs(l) >= 4000, '單調／限時 ' + l);
for (let l = 1; l <= 60; l++) ok(T.ansMs(l) >= 6000, '限時下限 ' + l + '：' + T.ansMs(l));
// 整關驗證
const W = 472, H = 580;
for (let i = 0; i < 3000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, W, H, rnd), n = T.lenFor(lv);
  ok(q.pts.length === n && q.order.length === n && q.back.length === n, '個數 ' + lv);
  ok(new Set(q.order).size === n && q.order.every(v => v >= 0 && v < n), '亮起順序是排列');
  ok(q.back.join() === q.order.slice().reverse().join(), '要點的順序＝亮起順序倒過來');
  q.pts.forEach((p, a) => {
    ok(p.x >= T.MARGIN - 1e-9 && p.x <= W - T.MARGIN + 1e-9 && p.y >= T.MARGIN - 1e-9 && p.y <= H - T.MARGIN + 1e-9, '在界內');
    for (let b = a + 1; b < n; b++) ok(Math.hypot(p.x - q.pts[b].x, p.y - q.pts[b].y) >= T.MIN_GAP - 1e-9, '間距 ' + a + ',' + b);
  });
}
// 亮起順序夠隨機（不是永遠 0,1,2…）
let straight = 0; for (let i = 0; i < 500; i++) { const q = T.makeLevel(5, W, H, rnd); if (q.order.every((v, k) => v === k)) straight++; } ok(straight < 20, '順序隨機：' + straight);
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
