// 泡泡掃射（bubblespray）的純函式檢查：一層一個顏色（紅→橘→黃…）、每層一分為二、半徑越來越小、越小飄越快、
// 第 0／10／20 秒各出現一顆紅泡泡、滿分、子彈掃掠碰撞（線段對圓、取最先碰到的）、瞄準角度不會射進地面、泡泡反彈不出界
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_bubblespray.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261108), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 層、顏色、大小、速度 ──
ok(T.LAYERS === T.COLORS.length && T.LAYERS >= 5 && new Set(T.COLORS).size === T.LAYERS, '一層一個顏色（' + T.LAYERS + ' 層）');
for (let L = 1; L < T.LAYERS; L++) ok(T.radiusOf(L) < T.radiusOf(L - 1) && T.speedOf(L) > T.speedOf(L - 1) && T.colorOf(L) !== T.colorOf(L - 1), '第 ' + (L + 1) + ' 層：更小、更快、換顏色');
ok(near(T.radiusOf(0), T.R0) && T.radiusOf(T.LAYERS - 1) > T.BULLET_R, '最小的泡泡還是比子彈大：' + T.radiusOf(T.LAYERS - 1).toFixed(1));
ok(T.perRed() === Math.pow(2, T.LAYERS) - 1, '一顆紅泡泡全部打完 ' + T.perRed() + ' 顆');
// 一顆紅泡泡實際分裂：第 n 層剛好 2^n 顆
{ let all = [{ layer: 0, r: T.radiusOf(0), x: 200, y: 200, vx: 30, vy: 0 }], count = {}, total = 0;
  while (all.length) { const b = all.pop(); count[b.layer] = (count[b.layer] || 0) + 1; total++; const kids = T.split(b, -Math.PI / 2, rnd);
    ok(b.layer === T.LAYERS - 1 ? kids.length === 0 : kids.length === 2 && kids.every(k => k.layer === b.layer + 1 && near(k.r, T.radiusOf(b.layer + 1))), '一分為二（最後一層不再分）');
    all.push(...kids); }
  ok(total === T.perRed(), '全部打完一共 ' + total + ' 顆');
  for (let L = 0; L < T.LAYERS; L++) ok(count[L] === Math.pow(2, L), '第 ' + (L + 1) + ' 層有 ' + Math.pow(2, L) + ' 顆（' + T.colorOf(L) + '）'); }
{ const kids = T.split({ layer: 0, r: 110, x: 200, y: 200, vx: 0, vy: 0 }, -Math.PI / 2, () => 0.5);
  ok(kids[0].vx * kids[1].vx < 0 && Math.abs(kids[0].vy) < 1e-6, '子彈往上打，兩顆小泡泡往左右兩邊彈開'); }
// ── 出現時間、滿分 ──
ok(T.spawnTimes().every((s, i) => s === i * T.SPAWN_EVERY) && T.spawnTimes()[0] === 0 && T.spawnTimes().slice(-1)[0] < T.TIME_S && T.spawnTimes().slice(-1)[0] + T.SPAWN_EVERY >= T.TIME_S, '第 0 秒起每 ' + T.SPAWN_EVERY + ' 秒出現一顆紅泡泡（限時 ' + T.TIME_S + ' 秒）');
ok(T.maxScore() === T.spawnTimes().length * T.perRed(), '滿分 ' + T.maxScore());
// ── 打中紅泡泡的獎勵：連射與子彈變快、有上限 ──
{ const g0 = T.gunAfter(0), g1 = T.gunAfter(1), big = T.gunAfter(1000);
  ok(g0.rate === T.FIRE_RATE && g0.v === T.BULLET_V, '還沒打中紅泡泡：原本的射速 ' + g0.rate + ' 發／秒、' + g0.v + ' px／秒');
  ok(near(g1.rate, T.FIRE_RATE + T.RED_FIRE_BONUS) && near(g1.v, T.BULLET_V + T.RED_SPEED_BONUS), '打中 1 顆：每秒多 ' + T.RED_FIRE_BONUS + ' 發、子彈快 ' + T.RED_SPEED_BONUS);
  ok(big.rate === T.FIRE_RATE_MAX && big.v === T.BULLET_V_MAX, '加到上限就停');
  for (let r = 1; r <= 40; r++) { const a = T.gunAfter(r - 1), b = T.gunAfter(r); ok(b.rate >= a.rate && b.v >= a.v, '只增不減（第 ' + r + ' 顆）'); } }
// ── 子彈碰撞 ──
ok(near(T.segHit(0, 100, 0, -100, 0, 0, 10), 0.45) && T.segHit(20, 100, 20, -100, 0, 0, 10) === -1 && T.segHit(0, 5, 0, -100, 0, 0, 10) === 0 && T.segHit(0, 100, 0, 50, 0, 0, 10) === -1, '線段對圓：交點、擦過、起點在裡面、還沒到');
{ const bs = [{ x: 0, y: -50, r: 20 }, { x: 0, y: 30, r: 10 }, { x: 0, y: 10, r: 40 }];
  ok(T.firstHit(0, 100, 0, -200, bs, 5) === 2, '同一格碰到好幾顆，取最先碰到的（重疊的泡泡也一樣）');
  ok(T.firstHit(100, 100, 100, -200, bs, 5) === -1, '沒碰到');
  ok(T.firstHit(0, 100, 0, 75, [{ x: 0, y: 30, r: 10 }], 5) === -1 && T.firstHit(0, 100, 0, 44, [{ x: 0, y: 30, r: 10 }], 5) === 0, '泡泡半徑加子彈半徑才算碰到'); }
// 很快的子彈也不會穿過最小的泡泡（一格 50ms 的距離遠大於泡泡直徑）
{ const r = T.radiusOf(T.LAYERS - 1), step = T.BULLET_V_MAX * 0.05; ok(step > 2 * r && T.firstHit(0, step / 2, 0, -step / 2, [{ x: 0, y: 0, r }], T.BULLET_R) === 0, '掃掠：一格跳過整顆泡泡也打得中'); }
// ── 瞄準 ──
{ const up = -Math.PI / 2, lo = -T.MIN_UP_DEG * Math.PI / 180;
  ok(near(T.aimAngle(200, 500, 200, 100), up), '手指在正上方：往上射');
  ok(near(T.aimAngle(200, 500, 400, 600), lo) && near(T.aimAngle(200, 500, 0, 600), -Math.PI - lo), '手指在砲口下面：壓到最低角度，不會射進地面');
  ok(T.aimAngle(200, 500, 400, 499) <= lo + 1e-9, '幾乎水平也不會低於最低角度'); }
// ── 飄浮：不出界、速度回到這一層的速度 ──
{ const W = 472, H = 600; let outside = 0;
  for (let i = 0; i < 200; i++) { const L = Math.floor(rnd() * T.LAYERS), b = { layer: L, r: T.radiusOf(L), x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 600, vy: (rnd() - 0.5) * 600 };
    for (let k = 0; k < 600; k++) { T.drift(b, W, H, 1 / 60); if (b.x < b.r - 1e-6 || b.x > W - b.r + 1e-6 || b.y < b.r - 1e-6 || b.y > H - b.r + 1e-6) outside++; }
    ok(near(Math.hypot(b.vx, b.vy), T.speedOf(L), 2), '彈開的速度慢慢回到這一層的速度'); }
  ok(outside === 0, '碰到邊緣會反彈、不出界'); }
// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_bubblespray.js'), boot = rd('../../js/boot.js'), menu = rd('../../js/menu.js');
  ok(boot.indexOf("'js/reaction_bubblespray.js'") > 0 && boot.indexOf("'css/games/reaction_bubblespray.css'") > 0, 'boot.js 有載入 js 與 css');
  ok(/id: 'bubblespray', name: '泡泡掃射'/.test(menu) && G.name === '泡泡掃射', '選單有這一款');
  ok(/b\.layer === 0\)[^}]*gun = gunAfter\(reds\)/.test(src) && /fireAcc \+= d \* gun\.rate/.test(src) && /\* gun\.v/.test(src), '打中紅泡泡就換成更快的連射與子彈');
  ok(/bullets\.splice\(i, 1\); pop\(/.test(src) && /molecules\(b\)/.test(src), '子彈打中就消失、破掉有分子特效');
  ok(/api\.timer\(TIME_S \* 1000/.test(src) && /scoreOf/.test(src), '限時用 api.timer、成績用 scoreOf'); }
ok(new Set([10, 60, 130, 210, 310].map(T.rating)).size === 5, '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
