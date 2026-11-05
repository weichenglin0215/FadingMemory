// 砲打飛機（skyshot）的純函式檢查：10 條航道的尺寸比例（上 0.2、下 1.0、線性）、航道排在上方 2/3、速度由慢到快、
// 重新進場的速度 ±20%、等待 0.5～1.5 秒、掃掠碰撞（不會穿過扁飛機、取最下面那一架）、受傷的樣子、會不會打中的預測
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_skyshot.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261105), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);
const W = 472, H = 667;

// ── 10 種飛行器、尺寸比例 ──
ok(T.TYPES.length === 10, '10 種飛行器');
ok(T.TYPES.map(t => t.key).join() === 'heli,biplane,prop,bizjet,airbus,fighter,stealth,rocket,satellite,ufo', '型式順序：直升機 → 飛碟');
ok(near(T.scaleOf(0), 1.0) && near(T.scaleOf(9), 0.2), '直升機（最下面）1.0、飛碟（最上面）0.2');
{ const d = []; for (let k = 1; k < 10; k++) d.push(T.scaleOf(k - 1) - T.scaleOf(k)); ok(d.every(x => near(x, d[0])), '中間的尺寸線性分配'); }
for (let k = 0; k < 10; k++) ok(T.TYPES[k].speed > 0, '有速度：' + T.TYPES[k].name);
// ── 航道 ──
{ const L = T.lanes(H);
  ok(L.length === 10, '10 條航道');
  for (let k = 1; k < 10; k++) ok(L[k].y < L[k - 1].y, '越快的越上面：' + T.TYPES[k].name);
  ok(L[9].y - L[9].laneH / 2 >= T.SKY_TOP - 1e-6 && L[0].y + L[0].laneH / 2 <= H * 2 / 3 + 1e-6, '全部在畫面上方 2/3');
  L.forEach((ln, k) => ok(ln.h <= ln.laneH + 1e-6, '飛機的高度放得進自己的航道：' + T.TYPES[k].name + ' ' + ln.h.toFixed(1) + ' ≤ ' + ln.laneH.toFixed(1)));
  ok(near(L[0].w / L[9].w, (T.TYPES[0].w * 1.0) / (T.TYPES[9].w * 0.2), 1e-9), '寬度跟尺寸比例成正比'); }
// ── 進場：速度 ±20%、等待 0.5～1.5 秒、從左或右 ──
{ let lo = 1e9, hi = 0, wlo = 1e9, whi = 0, L = 0, R = 0;
  for (let i = 0; i < 20000; i++) { const s = T.entrySpeed(3, rnd); lo = Math.min(lo, s); hi = Math.max(hi, s); const w = T.waitSec(rnd); wlo = Math.min(wlo, w); whi = Math.max(whi, w); const e = T.entryPos(W, 80, rnd); if (e.dir > 0) { L++; ok(e.x < -40, '從左邊進場的起點在畫面外'); } else { R++; ok(e.x > W + 40, '從右邊進場的起點在畫面外'); } }
  const b = T.TYPES[3].speed;
  const J = T.SPEED_JITTER; ok(lo >= b * (1 - J) - 1e-9 && hi <= b * (1 + J) + 1e-9 && lo < b * (1 - J + 0.02) && hi > b * (1 + J - 0.02), '重新進場速度在 ±' + Math.round(J * 100) + '%：' + lo.toFixed(1) + '～' + hi.toFixed(1));
  ok(wlo >= 0.5 && whi <= 1.5 && wlo < 0.52 && whi > 1.48, '等待 0.5～1.5 秒：' + wlo.toFixed(3) + '～' + whi.toFixed(3));
  ok(L > 9000 && R > 9000, '左右各一半：' + L + '/' + R); }
ok(T.isOut(W + 53, 100, 1, W) && !T.isOut(W + 40, 100, 1, W) && T.isOut(-53, 100, -1, W) && !T.isOut(-40, 100, -1, W), '整架都飛出去才算出畫面');
// ── 掃掠碰撞 ──
{ const planes = [{ x: 200, y: 300, w: 100, h: 50, alive: true }, { x: 200, y: 100, w: 30, h: 6, alive: true }];
  ok(T.sweepHit(200, 400, 280, planes, 4) === 0, '先碰到下面那一架');
  ok(T.sweepHit(200, 120, 80, planes, 4) === 1, '一格就跳過扁扁的飛機也打得中（掃掠）');
  ok(T.sweepHit(200, 140, 125, planes, 4) === -1, '還沒到');
  ok(T.sweepHit(200 + 50 + 3, 320, 300, planes, 4) === 0 && T.sweepHit(200 + 50 + 5, 320, 300, planes, 4) === -1, '水平邊緣：機身一半＋砲彈半徑');
  ok(T.sweepHit(200, 400, 0, [{ x: 200, y: 300, w: 100, h: 50, alive: false }, planes[1]], 4) === 1, '不在畫面上的飛機不會擋子彈'); }
ok(T.damageOf(0) === 'ok' && T.damageOf(1) === 'smoke' && T.damageOf(2) === 'spark' && T.damageOf(3) === 'boom', '第 1 次黑煙、第 2 次火花、第 3 次爆炸');
ok(T.SHELLS === 30 && T.HITS_TO_KILL * T.TYPES.length === 30, '30 發砲彈，滿分剛好 30 分');
// ── 預測：現在開砲會不會中 ──
{ const cy = 500, p = { x: 100, y: 200, w: 80, dir: 1, speed: 150 }, t = (cy - p.y) / T.SHELL_V, cx = p.x + p.speed * t;
  ok(T.willHit(cx, cy, p) && !T.willHit(cx + 40, cy, p) && !T.willHit(cx - 40, cy, p), '要提早開砲：預測飛機到砲口上方的時間'); }
// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_skyshot.js'), boot = rd('../../js/boot.js'), menu = rd('../../js/menu.js');
  ok(boot.indexOf("'js/reaction_skyshot.js'") > 0 && boot.indexOf("'css/games/reaction_skyshot.css'") > 0, 'boot.js 有載入 js 與 css');
  ok(/id: 'skyshot', name: '砲打飛機'/.test(menu) && G.name === '砲打飛機', '選單有這一款');
  ok(/scoreOf/.test(src) && T.SCORE.max === T.maxScore() && /text: '\+' \+ pts/.test(src), '成績用 scoreOf、上限＝滿分、會畫 +N');
  ok(/api\.timer\(TIME_S \* 1000/.test(src) && T.TIME_S === 180, '限時 180 秒');
  ok(/p\.speed \*= SLOW_PER_HIT/.test(src) && /slowed\(entrySpeed\(p\.k, rand\), p\.hits\)/.test(src), '打中就變慢，重新進場也一樣慢');
  ok(/globalAlpha = SMOKE_ALPHA/.test(src) && /Math\.sqrt\(SPARK_AREA\)/.test(src) && /Math\.sqrt\(BOOM_AREA\)/.test(src), '黑煙變淡、火花變小、爆炸變大'); }
// ── 計分：前兩次各 1 分，第 3 次（擊毀）直升機 2 分 … 飛碟 11 分 ──
for (let k = 0; k < 10; k++) ok(T.pointsFor(k, 1) === 1 && T.pointsFor(k, 2) === 1 && T.pointsFor(k, 3) === k + 2, T.TYPES[k].name + '：擊毀 ' + (k + 2) + ' 分');
ok(T.maxScore() === 10 * 2 + (2 + 11) * 10 / 2, '滿分 ' + T.maxScore());
// ── 變慢：每打中一次 × 0.9 ──
ok(near(T.SLOW_PER_HIT, 0.9) && near(T.slowed(100, 0), 100) && near(T.slowed(100, 1), 90) && near(T.slowed(100, 2), 81), '打中 1 次 90%、2 次 81%');
ok(T.SMOKE_ALPHA > 0 && T.SMOKE_ALPHA < 0.55 && T.SPARK_AREA > 0 && T.BOOM_AREA > 0, '黑煙比原本淡（' + T.SMOKE_ALPHA.toFixed(3) + '）、火花面積 ×' + T.SPARK_AREA + '、爆炸面積 ×' + T.BOOM_AREA);
ok(new Set([0, 15, 35, 55, 75].map(T.rating)).size === 5, '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
