const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_blindcircle.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
const C = T.CENTER;
const circle = (R, a0, turns, n, noise, rn) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + 2 * Math.PI * turns * i / n, r = R * (1 + (noise || 0) * ((rn || rnd)() * 2 - 1)); out.push({ x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) }); } return out; };

// 出題：起點在右下象限、半徑在範圍內、起點到圓心的距離＝R
for (let i = 0; i < 3000; i++) {
  const c = T.makeRound(rnd);
  ok(c.R >= T.R_MIN && c.R <= T.R_MAX, '半徑範圍');
  ok(c.start.x > C.x && c.start.y > C.y, '起點在圓心右下方');
  ok(Math.abs(Math.hypot(c.start.x - C.x, c.start.y - C.y) - c.R) < 1e-9, '起點到圓心的距離＝R');
  const deg = c.ang * 180 / Math.PI; ok(deg >= T.ANG_MIN - 1e-9 && deg <= T.ANG_MAX + 1e-9, '起點方位');
  ok(C.x + c.R + 20 < 472 && C.y + c.R + 20 < 600 && C.x - c.R > 0, '整個圓放得進舞台');
}
// 完美圓：圓度 100、有效；順時針逆時針都一樣
for (const dir of [1, -1]) {
  const a = T.analyze(circle(120, 0.7, dir, 200), C, 120);
  ok(a.valid && a.roundness > 99.98, '完美圓圓度 ' + a.roundness);
  ok(Math.abs(Math.abs(a.turn) - 360) < 2, '繞了 360 度：' + a.turn);
  ok(a.gap < T.STEP * 1.5, '首尾接上：' + a.gap);
}
// 半徑偏小 20%：圓度約 80；偏差越大圓度越低（單調）
let prev = 101;
for (const s of [1, 0.95, 0.9, 0.8, 0.6]) { const a = T.analyze(circle(120 * s, 0.7, 1, 200), C, 120); ok(a.roundness < prev, '偏差越大圓度越低 ' + s); prev = a.roundness; ok(Math.abs(a.roundness - (100 - (1 - s) * 100)) < 0.5, '圓度≈100−偏差%：' + s + ' → ' + a.roundness); }
// 抖動：噪音越大圓度越低
const n1 = T.analyze(circle(120, 0.7, 1, 200, 0.02), C, 120).roundness, n2 = T.analyze(circle(120, 0.7, 1, 200, 0.1), C, 120).roundness;
ok(n1 > n2 && n2 > 80 && n1 < 100, '噪音影響圓度 ' + n1 + ' / ' + n2);
// 無效：半圈、兩圈、太短
ok(!T.analyze(circle(120, 0, 0.5, 100), C, 120).valid, '半圈無效');
ok(!T.analyze(circle(120, 0, 2, 400), C, 120).valid, '兩圈無效');
ok(!T.analyze(circle(10, 0, 1, 40), C, 10).valid, '太小的圈無效（長度不足）');
// 不均勻取點（快慢不同）不影響結果
const uneven = []; { const full = circle(120, 0.7, 1, 2000); let i = 0; while (i < full.length) { uneven.push(full[i]); i += 1 + Math.floor(rnd() * 40); } uneven.push(full[full.length - 1]); }
ok(T.analyze(uneven, C, 120).roundness > 99.9, '取樣疏密不影響圓度');
// resample 間距
const rs = T.resample(circle(120, 0, 1, 600), 4); let maxd = 0, mind = 99; for (let i = 1; i < rs.length - 1; i++) { const d = Math.hypot(rs[i].x - rs[i - 1].x, rs[i].y - rs[i - 1].y); maxd = Math.max(maxd, d); mind = Math.min(mind, d); }
ok(maxd < 4.0001 && mind > 3.9, 'resample 等距：' + mind + '～' + maxd);
ok(T.rating(99.5) !== T.rating(97.5) && T.rating(97.5) !== T.rating(91) && T.rating(91) !== T.rating(50), '評語分級');
// V1.25：半徑加大、起點在畫面內；十字箭頭 200px；畫的過程中不畫任何東西（沒有藍色圓點）
ok(T.R_MIN >= 180 && T.R_MAX <= 236, '半徑加大（原本 100～150）：' + T.R_MIN + '～' + T.R_MAX);
for (let i = 0; i < 2000; i++) { const c = T.makeRound(rnd); ok(c.start.x - 8 >= 0 && c.start.x <= 472 && c.start.y <= 600 && C.x - c.R >= 0 && C.x + c.R <= 472 && C.y - c.R >= 20 && C.y + c.R <= 600, '圓與起點都在畫面內'); }
ok(T.ARROW === 150, '十字箭頭總寬 150px（V1.27：縮小成 75%）');
{ const p = T.arrowPoints(T.ARROW), xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  ok(p.length === 24 && Math.min(...xs) === -75 && Math.max(...xs) === 75 && Math.min(...ys) === -75 && Math.max(...ys) === 75, '箭頭多邊形 24 個頂點、範圍 ±75');
  ok(p.some(q => q[0] === 0 && q[1] === -75) && p.some(q => q[0] === 75 && q[1] === 0) && p.some(q => q[0] === 0 && q[1] === 75) && p.some(q => q[0] === -75 && q[1] === 0), '上下左右四個箭頭尖端'); }
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_blindcircle.js'), 'utf8');
  ok(src.indexOf('bc-finger') < 0, '取消繪製過程中的藍色圓點'); ok(src.indexOf("'class': 'bc-start'") > 0 && src.indexOf('arrowPoints(ARROW)') > 0, '起點用十字箭頭'); }
// V1.27：拖曳軌跡只留手指身後 160px
ok(T.TRAIL_LEN === 160, '軌跡長度 160px');
{ const len = (a) => { let s = 0; for (let i = 1; i < a.length; i++) s += Math.hypot(a[i].x - a[i - 1].x, a[i].y - a[i - 1].y); return s; };
  const line = []; for (let i = 0; i <= 100; i++) line.push({ x: i * 3, y: 0 });                                 // 300px 的直線
  const tl = T.tailOf(line, 160); ok(Math.abs(len(tl) - 160) < 1e-6, '直線 300px → 尾巴剛好 160px：' + len(tl));
  ok(tl[tl.length - 1].x === 300 && Math.abs(tl[0].x - 140) < 1e-6, '尾巴接在最新的點上、起點被裁在 x=140');
  ok(T.tailOf(line.slice(0, 20), 160).length === 20 && Math.abs(len(T.tailOf(line.slice(0, 20), 160)) - 57) < 1e-6, '不到 160px 時整條都留著');
  ok(T.tailOf([], 160).length === 0 && T.tailOf([{ x: 1, y: 2 }], 160).length === 1, '空與單點');
  const C = T.CENTER, R = 190, arc = []; for (let i = 0; i <= 400; i++) { const a = i / 400 * 2 * Math.PI; arc.push({ x: C.x + R * Math.cos(a), y: C.y + R * Math.sin(a) }); }
  for (const k of [50, 150, 300, 400]) { const t = T.tailOf(arc.slice(0, k + 1), 160), L = len(t); ok(L <= 160 + 1e-6 && (L > 159 || len(arc.slice(0, k + 1)) < 160), '圓弧 ' + k + ' 點：尾巴長度 ' + L.toFixed(2)); }
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_blindcircle.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction3.css'), 'utf8');
  ok(src.indexOf('tailOf(pts, TRAIL_LEN)') > 0 && /pts\.push\(loc\(e\)\);[^\n]*\n\s*paintTrail\(\)/.test(src), '每次 pointermove 更新軌跡');
  ok(/\.bc-trail \{[^}]*stroke: #000;[^}]*stroke-width: 1;[^}]*stroke-dasharray/.test(css), '軌跡是 1px 黑色虛線'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
