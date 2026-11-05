// 草叢找動物（forestpeek）的純函式檢查：難度隨分數（間隔、同時幾隻、露臉時間、速度）、大小隨時間變小、前 20 秒草會晃、
// 動物清單沒有重複、路線不出畫面、露臉的過程（冒出來 → 跑 → 沉下去）、點擊判定、灌木排滿整排（只留小縫、不規則）、整片草原沒有樹
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_forestpeek.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261106), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);
const W = 472;

// ── 難度（輸入是分數）──
{ const a = T.diffFor(0), b = T.diffFor(T.LEVEL_RAMP), c = T.diffFor(999);
  ok(near(a.interval, T.INTERVAL_S[0]) && near(b.interval, T.INTERVAL_S[1]) && near(c.interval, T.INTERVAL_S[1]), '出現間隔 ' + T.INTERVAL_S);
  ok(near(a.show, T.SHOW_S[0]) && near(b.show, T.SHOW_S[1]), '露臉時間 ' + T.SHOW_S);
  ok(near(a.speed, T.SPEED[0]) && near(b.speed, T.SPEED[1]), '速度 ' + T.SPEED);
  ok(a.alive === 1 && T.diffFor(T.ALIVE_AT[1]).alive === 2 && T.diffFor(T.ALIVE_AT[2]).alive === 3 && T.diffFor(T.ALIVE_AT[1] - 1).alive === 1 && c.alive === 3, '同時出現 1 → 2 → 3 隻'); }
for (let s = 1; s <= 60; s++) { const p = T.diffFor(s - 1), q = T.diffFor(s); ok(q.interval <= p.interval && q.show <= p.show && q.speed >= p.speed && q.alive >= p.alive, '分數越高越難（' + s + '）'); }
// ── 大小（輸入是時間）、晃動提醒 ──
ok(near(T.sizeFor(0), T.SIZE_PX[0]) && near(T.sizeFor(T.TIME_S), T.SIZE_PX[1]) && near(T.sizeFor(999), T.SIZE_PX[1]) && T.sizeFor(30) < T.sizeFor(10), '越後面小動物越小：' + T.SIZE_PX);
ok(T.hintOn(0) && T.hintOn(T.HINT_S - 0.1) && !T.hintOn(T.HINT_S) && !T.hintOn(45), '只有前 ' + T.HINT_S + ' 秒灌木會晃動提醒');
ok(T.TIME_S === 60, '限時 60 秒');
// ── 動物清單 ──
ok(new Set(T.ANIMALS).size === T.ANIMALS.length && T.ANIMALS.length >= 50, '動物不重複（' + T.ANIMALS.length + ' 種）');
{ let last = null, same = 0; for (let i = 0; i < 3000; i++) { const a = T.pickAnimal(rnd, last); if (a === last) same++; ok(T.ANIMALS.indexOf(a) >= 0, '挑到清單裡的動物'); last = a; } ok(same === 0, '不會連續兩隻一樣'); }
// ── 路線與露臉過程 ──
for (let i = 0; i < 3000; i++) {
  const size = 34 + rnd() * 40, d = T.diffFor(Math.floor(rnd() * 60)), sp = d.speed * (0.8 + rnd() * 0.4), path = T.planPath(W, size, sp, d.show, rnd);
  const a = { x0: path.x0, dir: path.dir, speed: path.speed, show: d.show };
  const x1 = T.poseAt(a, 0).x, x2 = T.poseAt(a, d.show).x;
  ok(Math.min(x1, x2) >= size * 0.6 - 1e-6 && Math.max(x1, x2) <= W - size * 0.6 + 1e-6, '整段路線都在畫面裡');
  ok(Math.sign(x2 - x1) === path.dir || near(x1, x2, 1e-6), '往 dir 的方向跑');
}
{ const a = { x0: 100, dir: 1, speed: 50, show: 2 };
  ok(T.poseAt(a, 0).up === 0 && near(T.poseAt(a, T.POP_S).up, 1) && near(T.poseAt(a, 1).up, 1) && near(T.poseAt(a, 2 - T.POP_S / 2).up, 0.5) && T.poseAt(a, 2).done, '冒出來 → 跑 → 沉下去');
  ok(near(T.poseAt(a, 1).x, 150), '位置＝起點＋速度×時間'); }
// ── 點擊判定 ──
{ const list = [{ x: 100, y: 100, size: 60, up: 1 }, { x: 140, y: 100, size: 60, up: 1 }, { x: 300, y: 300, size: 40, up: 0.2 }];
  ok(T.hitAnimal(list, 100, 100) === 0 && T.hitAnimal(list, 135, 100) === 1, '重疊取離中心最近的');
  ok(T.hitAnimal([list[0]], 100 + 60 * T.HIT_K + T.HIT_PAD - 1, 100) === 0 && T.hitAnimal([list[0]], 100 + 60 * T.HIT_K + T.HIT_PAD + 1, 100) === -1, '範圍＝大小 × ' + T.HIT_K + ' ＋ ' + T.HIT_PAD);
  ok(T.hitAnimal(list, 300, 300) === -1, '露出不到 30% 不算');
  ok(T.hitAnimal(list, 400, 500) === -1 && T.hitAnimal([], 0, 0) === -1, '點到空白處不算'); }
{ let prev = -1; for (let r = 0; r < T.ROWS; r++) { const y = T.rowY(667, r); ok(y > prev, '草叢由上往下排'); prev = y; } ok(T.rowY(667, T.ROWS - 1) < 667, '最後一排在畫面內'); }
// ── 灌木：每一排從左排到右、排得很密（大多互相重疊，空隙不大）、大小與地面位置不規則 ──
{ const H = 667, gap = T.rowY(H, 1) - T.rowY(H, 0); let holes = 0, total = 0, maxHole = 0, ws = new Set(), ys = new Set();
  ok(T.rowY(H, 0) < H * 0.2, '整片都是草原：第一排灌木從畫面很上面就開始');
  for (let s = 0; s < 200; s++) { const base = T.rowY(H, s % T.ROWS), row = T.layoutRow(W, base, gap, rnd);
    ok(row[0].x - row[0].w / 2 < 0 && row[row.length - 1].x + row[row.length - 1].w / 2 > W, '整排從畫面左邊排到右邊');
    for (let i = 0; i < row.length; i++) { const b = row[i]; total++; ws.add(Math.round(b.w)); ys.add(Math.round(b.y - base));
      ok(b.w >= T.BUSH_W[0] && b.w <= T.BUSH_W[1] && b.h >= gap * T.BUSH_H[0] - 1e-9 && b.h <= gap * T.BUSH_H[1] + 1e-9 && Math.abs(b.y - base) <= T.BUSH_DY, '灌木的大小、位置在範圍內');
      if (i) { const hole = (b.x - b.w / 2) - (row[i - 1].x + row[i - 1].w / 2); if (hole > 0) holes++; maxHole = Math.max(maxHole, hole); } } }
  ok(maxHole <= T.BUSH_GAP[1] + T.HOLE_W[1] + 1e-9 && maxHole < T.SIZE_PX[0], '最大的空隙 ' + maxHole.toFixed(1) + ' px，比一開始的小動物窄（後面的小動物比較小，靠出場前的 VIS 檢查避免整隻露出來）');
  ok(holes > 0 && holes < total * 0.6, '大多互相重疊，偶爾有縫（' + holes + '／' + total + '）');
  ok(ws.size > 30 && ys.size > 10, '大小、位置不規則');
  ok(T.BUSH_H[0] * gap > T.SIZE_PX[1] && T.RISE < 1, '灌木比小動物高，小動物冒出來也不會整隻露出灌木上面');
  ok(T.VIS[0] > 0.05 && T.VIS[1] <= 0.6 && T.VIS_TRIES >= 3, '每隻最多露出 ' + T.VIS.join('～') + ' 成：看得到一部分、看不到整隻');
  ok(/^rgba\(\s*\d+,\s*1\d\d,\s*\d+,\s*0?\.\d+\)$/.test(T.TINT.replace(/ /g, ' ')), '小動物蓋一層淡綠色：' + T.TINT); }
// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_forestpeek.js'), boot = rd('../../js/boot.js'), menu = rd('../../js/menu.js');
  ok(boot.indexOf("'js/reaction_forestpeek.js'") > 0 && boot.indexOf("'css/games/reaction_forestpeek.css'") > 0, 'boot.js 有載入 js 與 css');
  ok(/id: 'forestpeek', name: '草叢找動物'/.test(menu) && G.name === '草叢找動物', '選單有這一款');
  ok(/api\.timer\(TIME_S \* 1000/.test(src) && /scoreOf/.test(src), '限時用 api.timer、成績用 scoreOf');
  ok(!/makeTrees|trunk|canopy/.test(src), '沒有樹了');
  ok(/globalCompositeOperation = 'source-atop'; b\.fillStyle = TINT/.test(src), '綠色只蓋在小動物身上（source-atop）');
  ok(/coverAt\(row, path\.x0/.test(src) && /mx < VIS\[0\]/.test(src), '出場前用像素挑一條露出程度剛好的路線'); }
ok(new Set([0, 8, 18, 30, 45].map(T.rating)).size === 5, '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
