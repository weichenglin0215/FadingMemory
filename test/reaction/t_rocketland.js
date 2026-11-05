// 火箭回收（rocketland）的純函式檢查：關卡參數（火箭寬 1/10 → 標靶寬、燃料 30 → 60 秒、越來越重）、物理（油門慢慢加、天花板、牆、落地）、
// 落地判定（完全在標靶裡＋夠慢＋夠正）、速度條三區、5 種火箭由小到大、燃料條顏色、輕的點幾下就上升／重的要按住，以及「每一關都降落得了」（自動駕駛模擬）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_rocketland.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261107), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);
const W = 472, H = 667 - T.BAR_H, DT = T.STEP_S;       // H：天空（畫布）的高度＝遊戲區 667 減掉燃料條那一條

// ── 關卡參數 ──
{ const a = T.levelParams(1, W, H, rnd), z = T.levelParams(30, W, H, rnd);
  ok(near(a.baseW, W / 10) && near(z.baseW, z.padW) && near(a.padW, W / 4), '火箭寬：第 1 關＝畫面 1/10，第 30 關＝標靶寬（畫面 1/4）');
  ok(near(a.fuel, T.FUEL_S[0]) && near(z.fuel, T.FUEL_S[1]), '燃料：第 1 關 ' + T.FUEL_S[0] + ' 秒、第 30 關 ' + T.FUEL_S[1] + ' 秒');
  ok(a.lander && !z.lander && a.type === 0 && z.type === T.ROCKETS.length - 1, '第 1 關是登月小艇、最後是' + T.ROCKETS[z.type].name);
  ok(near(a.safeVy, T.SAFE_VY[0]) && near(z.safeVy, T.SAFE_VY[1]) && near(a.tiltOk, T.TILT_OK[0]) && near(z.tiltOk, T.TILT_OK[1]), '落地速度上限 ' + T.SAFE_VY.join(' → ') + '、傾斜上限 ' + T.TILT_OK.join('° → ') + '°');
  ok(near(a.y0, a.rocketH / 3) && near(z.y0, z.rocketH / 3), '一開始只看得到火箭下面 1/3');
  ok(z.groundY < H && z.rocketH < z.groundY, '火箭比畫面矮'); }
for (let L = 2; L <= 30; L++) { const p = T.levelParams(L - 1, W, H, rng(L)), q = T.levelParams(L, W, H, rng(L));
  ok(q.safeVy < p.safeVy && q.tiltOk < p.tiltOk && q.rocketH > p.rocketH, '落地速度、傾斜上限越來越嚴，火箭越來越高（第 ' + L + ' 關）');
  ok(q.baseW > p.baseW && q.aMax < p.aMax && q.spoolUp > p.spoolUp && q.fuel > p.fuel && q.aMax > T.GRAVITY, '越後面越寬、越重、油門越慢、燃料越多（第 ' + L + ' 關），推力仍大於重力'); }
// 5 種火箭：由小到大（寬度、高度都是），第 1 關從第一種開始，每種至少用好幾關
{ ok(T.ROCKETS.length === 5 && T.ROCKETS[0].from === 1, '5 種火箭');
  const firstOf = T.ROCKETS.map(r => T.levelParams(r.from, W, H, rng(1))), lastOf = T.ROCKETS.map((r, i) => T.levelParams(i + 1 < T.ROCKETS.length ? T.ROCKETS[i + 1].from - 1 : 30, W, H, rng(1)));
  for (let i = 0; i < 5; i++) { ok(firstOf[i].type === i && lastOf[i].type === i && lastOf[i].level - firstOf[i].level >= 3, T.ROCKETS[i].name + '：第 ' + firstOf[i].level + '～' + lastOf[i].level + ' 關');
    if (i) ok(firstOf[i].baseW > lastOf[i - 1].baseW && firstOf[i].rocketH > lastOf[i - 1].rocketH, T.ROCKETS[i].name + '比' + T.ROCKETS[i - 1].name + '寬也高'); }
  for (let L = 1; L <= 30; L++) ok(T.levelParams(L, W, H, rng(2)).rocketH < H - T.GROUND_GAP - T.TOP_MIN, '火箭比天空矮（第 ' + L + ' 關）'); }
{ let maxW = 0; for (let i = 0; i < 500; i++) { const P = T.levelParams(30, W, H, rnd); maxW = Math.max(maxW, Math.abs(P.wind)); ok(P.x0 >= P.baseW / 2 && P.x0 <= W - P.baseW / 2, '起點在畫面裡'); } ok(maxW <= T.WIND[1] + 1e-9 && maxW > T.WIND[1] * 0.9, '風的強度上限：' + maxW.toFixed(1)); }
{ const P = T.levelParams(10, W, H, rnd); ok(Math.abs(T.windAt(P, 0, 0)) < Math.abs(T.windAt(P, 0, 500)) && near(T.windAt(P, 0, 500), T.windAt(P, 0)), '越靠近地面風越小'); }
ok(T.sideOf(W / 2, W) === 0 && T.sideOf(0, W) === -1 && T.sideOf(W, W) === 1 && near(T.sideOf(W * 0.75, W), 0.5), '左右推力：正中央 0、越靠邊越大（線性）');
// ── 物理 ──
{ const P = T.levelParams(30, W, H, rng(3)), st = T.initState(P);
  T.step(st, { press: true, side: 0 }, P, P.spoolUp / 2); ok(near(st.thr, 0.5, 1e-6), '按住：油門要 spoolUp 秒才加滿');
  const st2 = T.initState(P); for (let i = 0; i < 120 * 30; i++) T.step(st2, { press: true, side: 0 }, P, DT);
  ok(st2.y >= T.TOP_MIN - 1e-9 && near(st2.y, T.TOP_MIN), '一直按住，火箭下緣也不會超出畫面上緣');
  const st3 = T.initState(P); for (let i = 0; i < 120 * 40; i++) T.step(st3, { press: true, side: 1 }, P, DT);
  ok(st3.x <= W - P.baseW / 2 + 1e-9, '不會飛出右邊'); ok(near(st3.tilt, T.MAX_TILT, 0.5), '往右推時往右傾斜 ' + T.MAX_TILT + ' 度');
  const st4 = T.initState(P); st4.fuel = 0.5; for (let i = 0; i < 120 * 5; i++) T.step(st4, { press: true, side: 0 }, P, DT);
  ok(st4.fuel === 0, '燃料燒完就是 0'); }
{ const P = T.levelParams(1, W, H, rng(5)), st = T.initState(P); for (let i = 0; i < 120; i++) T.step(st, { press: true, side: 0 }, P, DT); ok(near(P.fuel - st.fuel, 1 - P.spoolUp / 2, 0.02), '滿油門每秒燒 1 秒的燃料（加油門那段燒得比較少）'); }
// 輕的點幾下就上升、重的要按住
function hoverThen(L, input) {
  const P = T.levelParams(L, W, H, rng(7)), st = T.initState(P); st.y = 300; st.vy = 0; st.thr = T.GRAVITY / P.aMax; P.wind = 0;
  let vmin = 0; for (let i = 0; i < 120 * 2; i++) { T.step(st, input(i * DT), P, DT); vmin = Math.min(vmin, st.vy); }
  return vmin;
}
const taps = t => ({ press: (t % 0.4) < 0.12 && t < 1.2, side: 0 });
ok(hoverThen(1, taps) < -40, '第 1 關點 3 下就明顯往上（往上速度 ' + (-hoverThen(1, taps)).toFixed(0) + '）');
ok(hoverThen(30, taps) > -5, '第 30 關點 3 下幾乎上不去（' + (-hoverThen(30, taps)).toFixed(1) + '）');
{ const P = T.levelParams(30, W, H, rng(8)), st = T.initState(P); st.y = 400; st.vy = 0; P.wind = 0; let vmin = 0; for (let i = 0; i < 120 * 4; i++) { T.step(st, { press: true, side: 0 }, P, DT); vmin = Math.min(vmin, st.vy); }
  ok(vmin < -40, '第 30 關要按住好幾秒才產生足夠推力往上'); }
// ── 落地判定 ──
{ const P = T.levelParams(30, W, H, rng(9));
  const sv = P.safeVy, ta = P.tiltOk;
  ok(T.judge({ x: P.padX, vy: sv, tilt: 0 }, P).ok, '正中央、夠慢、夠正：成功');
  ok(T.judge({ x: P.padX + T.SLACK, vy: sv - 1 }, P).ok && !T.judge({ x: P.padX + T.SLACK + 1, vy: sv - 1 }, P).ok, '最後一關只容許 ' + T.SLACK + ' px');
  ok(!T.judge({ x: P.padX, vy: sv + 1 }, P).ok && !T.judge({ x: P.padX, vy: sv + 1 }, P).soft, '最後一關超過每秒 ' + sv + '：墜毀');
  ok(T.judge({ x: P.padX, vy: sv - 1, tilt: -ta }, P).ok && !T.judge({ x: P.padX, vy: sv - 1, tilt: ta + 0.5 }, P).upright && !T.judge({ x: P.padX, vy: sv - 1, tilt: -ta - 0.5 }, P).ok, '最後一關傾斜超過 ' + ta + '°（左右都算）：傾倒');
  const Q = T.levelParams(1, W, H, rng(9));
  ok(T.judge({ x: Q.padX, vy: Q.safeVy - 1, tilt: Q.tiltOk - 1 }, Q).ok && !T.judge({ x: Q.padX, vy: Q.safeVy + 1 }, Q).soft && !T.judge({ x: Q.padX, vy: 10, tilt: Q.tiltOk + 1 }, Q).upright, '第 1 關：每秒 ' + Q.safeVy + '、' + Q.tiltOk + '° 以內都可以');
  const P1 = T.levelParams(1, W, H, rng(9)), room = (P1.padW - P1.baseW) / 2;
  ok(T.judge({ x: P1.padX + room, vy: 10 }, P1).ok && !T.judge({ x: P1.padX + room + T.SLACK + 0.5, vy: 10 }, P1).inside, '腳超出標靶就失敗'); }
// 速度條：藍＝往上、綠＝往下但不超過這一關的上限、紅＝超過
{ const P = T.levelParams(30, W, H, rng(4));
  ok(T.speedZone(-1, P) === 'up' && T.speedZone(0, P) === 'ok' && T.speedZone(P.safeVy, P) === 'ok' && T.speedZone(P.safeVy + 0.1, P) === 'bad', '速度條三區：藍（往上）、綠（0～' + P.safeVy + '）、紅（超過）'); }
// 落地前手指移回中間，傾斜會很快變小（不按就慢慢擺正）
{ const P = T.levelParams(30, W, H, rng(6)), st = T.initState(P); st.y = 300; st.vy = 0;
  for (let i = 0; i < 120; i++) T.step(st, { press: true, side: 1 }, P, DT);
  const t0 = st.tilt; for (let i = 0; i < 60; i++) T.step(st, { press: false, side: 0 }, P, DT);
  ok(t0 > 15 && Math.abs(st.tilt) < P.tiltOk, '往旁邊推會傾斜 ' + t0.toFixed(0) + '°，放手 0.5 秒就擺正到 ' + st.tilt.toFixed(1) + '°'); }
ok(T.fuelClass(1) === 'ok' && T.fuelClass(0.21) === 'ok' && T.fuelClass(0.2) === 'low' && T.fuelClass(0.11) === 'low' && T.fuelClass(0.1) === 'crit' && T.fuelClass(0) === 'crit', '燃料條：水藍 → 剩 20% 紅色 → 剩 10% 閃爍');
// ── 每一關都降落得了（自動駕駛）；不按就一定墜毀 ──
function fly(L, seed, ctl) { const P = T.levelParams(L, W, H, rng(seed)), st = T.initState(P); let n = 0; while (!st.landed && n < 120 * 200) { T.step(st, ctl(st, P), P, DT); n++; } return T.judge(st, P); }
let total = 0;
for (let L = 1; L <= 30; L++) {
  let good = 0; const N = 12; for (let s = 0; s < N; s++) if (fly(L, SEED + L * 101 + s, T.autopilot).ok) good++;
  total += good;
  ok(L < 30 ? good >= N - 1 : good >= 3, '第 ' + L + ' 關降落得了（自動駕駛 ' + good + '/' + N + '）');
  ok(!fly(L, SEED + L, () => ({ press: false, side: 0 })).soft, '第 ' + L + ' 關不按就墜毀');
}
console.log('自動駕駛成功 ' + total + '/' + 30 * 12);
// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_rocketland.js'), css = rd('../../css/games/reaction_rocketland.css'), boot = rd('../../js/boot.js'), menu = rd('../../js/menu.js');
  ok(boot.indexOf("'js/reaction_rocketland.js'") > 0 && boot.indexOf("'css/games/reaction_rocketland.css'") > 0, 'boot.js 有載入 js 與 css');
  ok(/id: 'rocketland', name: '火箭回收'/.test(menu) && G.name === '火箭回收', '選單有這一款');
  ok(/rocketland-fuel--low/.test(src) && /rocketland-fuel--crit/.test(src) && /\.rocketland-fuel--crit[^{]*\{[^}]*animation/.test(css) && /--c-sky/.test(css), '燃料條的水藍、紅色、閃爍');
  ok(/maxLevel: MAX_LEVEL/.test(src) && T.MAX_LEVEL === 30, '30 關');
  ok(/function drawSpeedBar/.test(src) && /drawSpeedBar\(\);/.test(src), '畫面上有速度條');
  ok(/角度過斜造成傾倒/.test(src) && /st\.topple = \{/.test(src) && /st\.topple\.t >= TOPPLE_S\) boom\(\)/.test(src), '太斜：先傾倒再爆炸，並寫出角度過斜');
  ok(/leg: '#FFD60A'/.test(src) && /body: '#F7F7F5'/.test(src), '火箭白色、著地腳鮮黃色'); }
ok(new Set([0, 6, 14, 22, 30].map(T.rating)).size === 5, '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
