// 奶茶調色（milktea，企劃 274）的純函式檢查：sRGB→Lab 與 ΔE（已知數值）、混色、一階延遲、出題條件（一定調得出來、按多久、背景對比、奶精）、容許誤差換算成時間窗口、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_milktea.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261115), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.tolFor(1) === T.TOL[0] && T.tolFor(T.RAMP_LEVELS) === T.TOL[1] && T.tolFor(99) === T.TOL[1], '容許顏色差 ' + T.TOL);
ok(near(T.lagFor(1), T.MIX_LAG[0], 1e-9) && near(T.lagFor(T.RAMP_LEVELS), T.MIX_LAG[1], 1e-9), '攪勻延遲 ' + T.MIX_LAG);
ok(near(T.rateFor(1), T.RATE[0], 1e-9) && near(T.rateFor(T.RAMP_LEVELS), T.RATE[1], 1e-9), '流量 ' + T.RATE);
for (let l = 2; l <= 60; l++) ok(T.tolFor(l) <= T.tolFor(l - 1) && T.lagFor(l) >= T.lagFor(l - 1) && T.rateFor(l) >= T.rateFor(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.tolFor(l - 1) - T.tolFor(l)); ok(Math.max(...d) - Math.min(...d) <= 0.02, '容許誤差線性下降：每關 −' + Math.min(...d).toFixed(3) + '～−' + Math.max(...d).toFixed(3)); }

// ── 色彩：sRGB → Lab（D65）已知數值 ──
{ const w = T.rgbToLab([255, 255, 255]), k = T.rgbToLab([0, 0, 0]), r = T.rgbToLab([255, 0, 0]), g = T.rgbToLab([0, 255, 0]), b = T.rgbToLab([0, 0, 255]);
  ok(near(w[0], 100, 0.05) && near(w[1], 0, 0.05) && near(w[2], 0, 0.05), '白色 Lab ≈ (100, 0, 0)：' + w.map(v => v.toFixed(2)));
  ok(near(k[0], 0, 0.01) && near(k[1], 0, 0.01), '黑色 Lab ≈ (0, 0, 0)');
  ok(near(r[0], 53.24, 0.1) && near(r[1], 80.09, 0.2) && near(r[2], 67.20, 0.2), '紅色 Lab ≈ (53.24, 80.09, 67.20)：' + r.map(v => v.toFixed(2)));
  ok(near(g[0], 87.73, 0.1) && near(g[1], -86.18, 0.3) && near(g[2], 83.18, 0.3), '綠色 Lab ≈ (87.73, −86.18, 83.18)：' + g.map(v => v.toFixed(2)));
  ok(near(b[0], 32.30, 0.1) && near(b[1], 79.19, 0.3) && near(b[2], -107.86, 0.3), '藍色 Lab ≈ (32.30, 79.19, −107.86)：' + b.map(v => v.toFixed(2)));
  const mid = T.rgbToLab([119, 119, 119]); ok(near(mid[0], 50, 0.5), '灰 119 的亮度約 50：' + mid[0].toFixed(2)); }
ok(T.deltaE([10, 20, 30], [10, 20, 30]) === 0 && near(T.deltaE([255, 255, 255], [0, 0, 0]), 100, 0.1) && near(T.deltaE([200, 100, 50], [50, 90, 200]), T.deltaE([50, 90, 200], [200, 100, 50]), 1e-12), 'deltaE：同色為 0、黑白相差 100、對稱');
// 三角不等式與單調：混色越多，離紅茶越遠
for (let i = 0; i < 200; i++) { const a = [rnd() * 255, rnd() * 255, rnd() * 255], b = [rnd() * 255, rnd() * 255, rnd() * 255], c = [rnd() * 255, rnd() * 255, rnd() * 255]; ok(T.deltaE(a, c) <= T.deltaE(a, b) + T.deltaE(b, c) + 1e-9, '三角不等式'); }
// 混色
{ const t0 = [100, 40, 20], m = [250, 246, 234]; ok(T.mixColor(t0, m, 0).join() === t0.join() && T.mixColor(t0, m, 1).join() === m.join() && near(T.mixColor(t0, m, 0.5)[0], 175), 'mixColor：f＝0 是紅茶、f＝1 是牛奶、0.5 在正中間');
  let prev = -1; for (let f = 0; f <= 1.0001; f += 0.05) { const de = T.deltaE(t0, T.mixColor(t0, m, Math.min(1, f))); ok(de >= prev - 1e-9, '牛奶越多離紅茶越遠'); prev = de; } }
ok(T.hslToRgb(0, 100, 50).map(Math.round).join() === '255,0,0' && T.hslToRgb(120, 100, 50).map(Math.round).join() === '0,255,0' && T.hslToRgb(240, 100, 50).map(Math.round).join() === '0,0,255' && T.hslToRgb(0, 0, 100).map(Math.round).join() === '255,255,255', 'hslToRgb');
ok(T.css([255.4, 0.6, 9.5]) === 'rgb(255,1,10)', 'css 顏色字串');
// 一階延遲
{ let c = [0, 0, 0]; const tgt = [100, 200, 50], tau = 0.5; for (let t = 0; t < tau * 3 - 1e-9; t += 1 / 60) c = T.lagStep(c, tgt, 1 / 60, tau); ok(near(c[0] / 100, 1 - Math.exp(-3), 0.01), '一階延遲：3τ 之後走了 95% 左右：' + (c[0] / 100).toFixed(3)); }
{ const a = T.lagStep([0, 0, 0], [100, 100, 100], 0.3, 0.5), b = T.lagStep(T.lagStep([0, 0, 0], [100, 100, 100], 0.15, 0.5), [100, 100, 100], 0.15, 0.5); ok(near(a[0], b[0], 1e-9), '延遲與影格長度無關（0.3 秒一步 = 0.15 秒兩步）'); }
ok(T.lagStep([5, 5, 5], [90, 90, 90], 0, 0.5).join() === '5,5,5' && T.lagStep([5, 5, 5], [90, 90, 90], 10, 0.5)[0] > 89.99, 'dt＝0 不動、很久之後到目標');
// 杯子外形
{ const p = T.cupPath(124, 92, 200, 24); ok(/^M/.test(p) && /Z$/.test(p) && (p.match(/Q/g) || []).length === 2, 'cupPath：梯形加兩個圓角'); }

// ── 整關 ──
let total = 0, creamer = 0, contrast = 0, wins = [];
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  ok(q.tol === T.tolFor(lv) && q.tau === T.lagFor(lv), '第 ' + lv + ' 關：容許 ' + q.tol + '、延遲 ' + q.tau);
  ok(q.fTarget >= T.F_TARGET[0] - 1e-9 && q.fTarget <= T.F_TARGET[1] + 1e-9, '目標牛奶比例 ' + q.fTarget.toFixed(3));
  ok(q.tStar >= T.T_RANGE[0] - 1e-9 && q.tStar <= T.T_RANGE[1] + 1e-9 && near(q.tStar, q.fTarget / q.rate, 1e-9), '按多久到目標 ' + q.tStar.toFixed(2) + ' 秒在 ' + T.T_RANGE + '');
  ok(q.sample.join() === T.mixColor(q.t0, q.milk, q.fTarget).join(), '樣品色 = 同一個混色在 f*（一定調得出來）');
  ok(T.deltaE(q.sample, q.t0) > 10 && T.deltaE(q.sample, q.milk) > 10, '樣品色離純紅茶、純牛奶都夠遠（ΔE ' + T.deltaE(q.sample, q.t0).toFixed(1) + '／' + T.deltaE(q.sample, q.milk).toFixed(1) + '）');
  ok(q.t0.every(v => v >= 0 && v <= 255) && T.rgbToLab(q.t0)[0] < 50, '紅茶是深色');
  if (lv < T.CONTRAST_FROM) ok(!q.contrast && q.bgSample === q.bgTea, '第 ' + lv + ' 關兩杯背景一樣'); else ok(q.contrast && q.bgSample !== q.bgTea && ['wood', 'tray'].includes(q.bgSample) && ['wood', 'tray'].includes(q.bgTea), '第 ' + lv + ' 關兩杯背景不同（同時對比）');
  if (q.contrast) contrast++;
  if (lv < T.CREAMER_FROM) ok(!q.creamer && q.milk === T.MILK, '前幾關只有牛奶'); else if (q.creamer) { creamer++; ok(q.milk === T.CREAMER, '奶精的顏色'); }
  // 容許的 ΔE 換算成「放手時機」的窗口（毫秒）：在 f* 附近往兩側找 ΔE ≤ tol 的範圍
  let lo = q.fTarget, hi = q.fTarget; const step = 0.0005;
  while (lo > 0 && T.deltaE(T.mixColor(q.t0, q.milk, lo - step), q.sample) <= q.tol) lo -= step; while (hi < 1 && T.deltaE(T.mixColor(q.t0, q.milk, hi + step), q.sample) <= q.tol) hi += step;
  const win = (hi - lo) / q.rate * 1000; wins.push([lv, win]);
  ok(win > 5, '第 ' + lv + ' 關：放手時機的窗口 ' + win.toFixed(0) + ' 毫秒（不為零）');
}
console.log('奶精 ' + creamer + '／' + total + '；背景不同 ' + contrast + '／' + total);
ok(creamer > 100 && contrast > 800, '奶精、背景對比都有出現');
{ const a = lv => { const w = wins.filter(x => x[0] === lv).map(x => x[1]); return w.reduce((x, y) => x + y, 0) / w.length; }; console.log('放手時機的窗口：第 1 關 ' + a(1).toFixed(0) + ' 毫秒、第 12 關 ' + a(12).toFixed(0) + '、第 24 關 ' + a(24).toFixed(0)); ok(a(1) > 600 && a(24) < a(1) / 4 && a(24) > 20, '第 1 關窗口寬（容易）、到頂窗口縮到四分之一以下但還按得到'); }
// 白色漩渦粒子池：噴出來、會減少（壽命）、不超過上限
{ const sw = T.makeSwirl(60, 80); ok(sw.alive() === 0, '一開始沒有粒子'); sw.spawn(60, 20, 50, [250, 246, 234]); ok(sw.alive() === 50, '噴 50 顆'); for (let t = 0; t < 4; t += 1 / 60) sw.step(1 / 60, t); ok(sw.alive() === 0, '4 秒後全部消失（壽命 0.8～2.2 秒）');
  for (let k = 0; k < 20; k++) sw.spawn(60, 20, 100, [250, 246, 234]); ok(sw.alive() <= T.SWIRL_MAX, '粒子池有上限：' + sw.alive() + ' ≤ ' + T.SWIRL_MAX); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_milktea.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 2800/.test(src) && /de\.toFixed\(4\)/.test(src) && /lagStep/.test(src) && /touchInk/.test(src), '失敗：顏色差 4 位小數、停格 2 秒以上；有一階延遲；標明漩渦改寫自 touchInk.js');
  ok(/\.mlt-panel--wood \{[^}]*var\(--mlt-wood\)/.test(css) && /\.mlt-panel--tray \{[^}]*var\(--mlt-tray\)/.test(css) && /\.mlt-btn \{[^}]*var\(--c-blue\)/.test(css), '木桌、托盤用 CSS 變數');
  ok(boot.indexOf("'js/reaction_milktea.js'") > 0 && /攪勻/.test(G.rule), 'boot.js 有載入、玩法說明提到攪勻'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(18) && T.rating(18) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
