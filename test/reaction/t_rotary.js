// 轉盤電話（rotary，企劃 309）的純函式檢查：轉盤幾何（每個數字要轉幾度、洞的位置、不重疊）、撥號判定、轉回來的時間、號碼的混淆串、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_rotary.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261116), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.digitsFor(1) === T.DIGITS[0] && T.digitsFor(T.RAMP_LEVELS) === T.DIGITS[1] && T.digitsFor(99) === T.DIGITS[1], '號碼長度 ' + T.DIGITS);
ok(T.viewMs(1) === T.VIEW_S[0] * 1000 && T.viewMs(T.RAMP_LEVELS) === T.VIEW_S[1] * 1000, '看的時間 ' + T.VIEW_S);
ok(T.repeatsFor(1) === T.REPEATS[0] && T.repeatsFor(T.RAMP_LEVELS) === T.REPEATS[1] && T.mirrorsFor(1) === T.MIRRORS[0] && T.mirrorsFor(T.RAMP_LEVELS) === T.MIRRORS[1], '容易混的數字串組數 ' + T.REPEATS + '／' + T.MIRRORS);
for (let l = 2; l <= 60; l++) ok(T.digitsFor(l) >= T.digitsFor(l - 1) && T.viewMs(l) <= T.viewMs(l - 1) && T.repeatsFor(l) >= T.repeatsFor(l - 1) && T.mirrorsFor(l) >= T.mirrorsFor(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.digitsFor(l) - T.digitsFor(l - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '號碼長度線性：每關 +' + Math.min(...d) + '～' + Math.max(...d)); }

// ── 轉盤幾何 ──
ok(T.rotationFor(1) === 60 && T.rotationFor(2) === 87 && T.rotationFor(9) === 276 && T.rotationFor(0) === 303, '數字要轉的度數：1→60、2→87、9→276、0→303');
{ const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]; for (let i = 1; i < 10; i++) ok(T.rotationFor(order[i]) - T.rotationFor(order[i - 1]) === T.ROT_STEP, '每個數字多轉 ' + T.ROT_STEP + '°'); ok(Math.max(...order.map(T.rotationFor)) === T.rotationFor(0) && Math.min(...order.map(T.rotationFor)) === T.rotationFor(1), '0 轉最多、1 轉最少（離擋片最遠／最近）'); }
ok(T.holeAngle(1) === 60 && T.holeAngle(0) === 177, '洞的位置：1 在 60°（右上）、0 在 177°（正下方偏右）');
for (let d = 0; d <= 9; d++) ok(near(T.wrap360(T.holeAngle(d) + T.rotationFor(d)), T.STOP_ANGLE, 1e-9), '數字 ' + d + '：洞轉 ' + T.rotationFor(d) + '° 剛好到擋片');
{ const ang = []; for (let d = 0; d <= 9; d++) ang.push(T.holeAngle(d)); ok(new Set(ang).size === 10, '十個洞的位置都不同');
  const R = 190, ring = R * 0.72, hr = R * 0.135; let minD = 1e9; for (let a = 0; a <= 9; a++) for (let b = a + 1; b <= 9; b++) { const p = [ring * Math.sin(T.holeAngle(a) * Math.PI / 180), -ring * Math.cos(T.holeAngle(a) * Math.PI / 180)], q = [ring * Math.sin(T.holeAngle(b) * Math.PI / 180), -ring * Math.cos(T.holeAngle(b) * Math.PI / 180)]; minD = Math.min(minD, Math.hypot(p[0] - q[0], p[1] - q[1])); }
  ok(minD > 2 * hr * 1.15, '相鄰的洞不會重疊：最近的兩個洞中心距 ' + minD.toFixed(1) + ' > ' + (2 * hr * 1.15).toFixed(1));
  // 擋片所在的方向沒有洞（洞不會一開始就擋在擋片上）
  for (let d = 0; d <= 9; d++) ok(Math.abs(T.wrap180(T.holeAngle(d) - T.STOP_ANGLE)) >= 50, '數字 ' + d + ' 的洞離擋片至少 50°（' + T.wrap180(T.holeAngle(d) - T.STOP_ANGLE).toFixed(0) + '）'); }
// 撥號判定
for (let d = 0; d <= 9; d++) { const r = T.rotationFor(d); ok(T.isDialed(r, d) && T.isDialed(r - T.PULL_TOL, d) && !T.isDialed(r - T.PULL_TOL - 1, d) && !T.isDialed(0, d) && !T.isDialed(r / 2, d), '數字 ' + d + '：轉到底（差 ' + T.PULL_TOL + '° 內）才算'); }
// 轉回來的時間：轉越多越久；0 最久
{ const t = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(T.returnTimeMs); for (let i = 1; i < 10; i++) ok(t[i] > t[i - 1], '轉回來時間遞增'); ok(T.returnTimeMs(0) === Math.round(303 / T.RETURN_DEG_S * 1000) && T.returnTimeMs(1) === Math.round(60 / T.RETURN_DEG_S * 1000), '1 要 ' + T.returnTimeMs(1) + ' 毫秒、0 要 ' + T.returnTimeMs(0) + ' 毫秒'); ok(T.returnTimeMs(0) / T.returnTimeMs(1) > 4, '0 要等的時間是 1 的 4 倍以上'); }
// hitHole、angleOf
{ const cx = 200, cy = 300, ring = 137, hr = 25;
  for (let d = 0; d <= 9; d++) { const a = T.holeAngle(d) * Math.PI / 180, x = cx + ring * Math.sin(a), y = cy - ring * Math.cos(a); ok(T.hitHole(x, y, cx, cy, ring, hr, 0) === d, '轉盤沒轉：點在數字 ' + d + ' 的洞中心 → ' + d); }
  ok(T.hitHole(cx, cy, cx, cy, ring, hr, 0) === -1 && T.hitHole(0, 0, cx, cy, ring, hr, 0) === -1, '點在中心或遠處 → 沒有洞');
  for (let d = 0; d <= 9; d++) { const a = T.STOP_ANGLE * Math.PI / 180, x = cx + ring * Math.sin(a), y = cy - ring * Math.cos(a); ok(T.hitHole(x, y, cx, cy, ring, hr, T.rotationFor(d)) === d, '轉到底之後，擋片位置的洞就是數字 ' + d); } }
ok(near(T.angleOf(0, -1, 0, 0), 0) && near(T.angleOf(1, 0, 0, 0), 90) && near(Math.abs(T.angleOf(0, 1, 0, 0)), 180) && near(T.angleOf(-1, 0, 0, 0), -90), 'angleOf：上 0、右 90、下 180、左 −90');
ok(T.wrap180(190) === -170 && T.wrap180(-190) === 170 && T.wrap180(180) === 180 && T.wrap180(0) === 0 && T.wrap360(-10) === 350, 'wrap');
// 模擬手指畫圈：繞中心順時針轉過去，累加角度變化＝轉盤轉的度數
for (let d = 0; d <= 9; d++) { const cx = 200, cy = 300, r = 120; let rot = 0, last = T.holeAngle(d); const target = T.rotationFor(d); for (let s = 5; s <= target + 4.999; s += 5) { const a = T.holeAngle(d) + Math.min(s, target); const x = cx + r * Math.sin(a * Math.PI / 180), y = cy - r * Math.cos(a * Math.PI / 180), ang = T.angleOf(x, y, cx, cy); rot = Math.min(target, Math.max(0, rot + T.wrap180(ang - last))); last = ang; } ok(near(rot, target, 1e-6) && T.isDialed(rot, d), '手指從洞順時針畫到擋片：轉盤轉 ' + rot.toFixed(1) + '°（要 ' + target + '）'); }

// ── 號碼 ──
for (let i = 0; i < 400; i++) {
  const len = 3 + Math.floor(rnd() * 10), reps = Math.floor(rnd() * 3), mir = Math.floor(rnd() * 3), r = T.makeNumber(len, reps, mir, rnd);
  ok(r.num.length === len && /^[0-9]+$/.test(r.num), '號碼 ' + r.num + ' 長度 ' + len);
  const f = T.feasible(len, reps, mir); ok(T.repeatCount(r.num) >= f.reps && T.mirrorCount(r.num) >= f.mirrors && r.want.reps === f.reps && r.want.mirrors === f.mirrors, '號碼 ' + r.num + '：連續相同 ' + T.repeatCount(r.num) + '（要 ' + f.reps + '）、abca 型 ' + T.mirrorCount(r.num) + '（要 ' + f.mirrors + '）');
}
ok(JSON.stringify(T.feasible(3, 2, 2)) === '{"reps":1,"mirrors":0}' && JSON.stringify(T.feasible(10, 2, 2)) === '{"reps":1,"mirrors":2}' && JSON.stringify(T.feasible(6, 2, 2)) === '{"reps":1,"mirrors":1}', 'feasible：短號碼放不下就減少組數');
ok(T.repeatCount('2255') === 2 && T.repeatCount('0920') === 0 && T.repeatCount('1234') === 0 && T.repeatCount('1112') === 2, 'repeatCount');
ok(T.mirrorCount('0920') === 1 && T.mirrorCount('0902') === 0 && T.mirrorCount('12312') === 2 && T.mirrorCount('1221') === 0, 'mirrorCount（0920：頭尾都是 0，中間 9、2 不同）');
let total = 0, lens = {}, sumRet = 0;
for (let i = 0; i < 600; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  ok(q.len === T.digitsFor(lv) && q.num.length === q.len && q.viewMs === T.viewMs(lv), '第 ' + lv + ' 關：' + q.len + ' 碼、看 ' + q.viewMs + ' 毫秒');
  const f = T.feasible(q.len, T.repeatsFor(lv), T.mirrorsFor(lv)); ok(T.repeatCount(q.num) >= f.reps, '第 ' + lv + ' 關連續相同 ' + T.repeatCount(q.num) + '／' + f.reps + '：' + q.num);
  ok(T.mirrorCount(q.num) >= f.mirrors, '第 ' + lv + ' 關 abca 型 ' + T.mirrorCount(q.num) + '／' + f.mirrors + '：' + q.num);
  lens[q.len] = (lens[q.len] || 0) + 1; sumRet += q.num.split('').reduce((a, c) => a + T.returnTimeMs(Number(c)), 0);
  if (lv === 1) ok(q.len === 3 && q.viewMs === 3000, '第 1 關：3 碼、看 3 秒');
}
console.log('號碼長度分布 ' + JSON.stringify(lens) + '；平均每組號碼轉盤要轉回來共 ' + (sumRet / total / 1000).toFixed(1) + ' 秒');
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_rotary.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3600/.test(src) && /rtr-cmp__d--bad/.test(src) && /Sfx\.play\('tick'\)/.test(src), '失敗：正確號碼與你撥的並排、錯的標紅、停格 3 秒以上；轉回來有嗒嗒聲');
  ok(/\.rtr-cmp__d--bad \{[^}]*var\(--c-bad/.test(css) && /\.rtr-plate \{[^}]*var\(--rtr-plate\)/.test(css) && /\.rtr-metal \{[^}]*var\(--rtr-metal\)/.test(css), '紅色、轉盤顏色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_rotary.js'") > 0 && /轉盤/.test(G.rule), 'boot.js 有載入、玩法說明提到轉盤'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(18) && T.rating(18) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
