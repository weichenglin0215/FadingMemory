// 照樣調一杯（layerdrink，企劃 319）的純函式檢查：杯形的體積與液面高度（錐台公式、互為反函數）、完美倒法能還原示範、最大差、出題條件、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_layerdrink.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261122), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.layersFor(1) === T.LAYERS[0] && T.layersFor(T.RAMP_LEVELS) === T.LAYERS[1] && T.layersFor(99) === T.LAYERS[1], '層數 ' + T.LAYERS);
ok(T.viewMs(1) === T.VIEW_S[0] * 1000 && T.viewMs(T.RAMP_LEVELS) === T.VIEW_S[1] * 1000, '看的時間 ' + T.VIEW_S);
ok(T.tolFor(1) === T.TOL[0] && T.tolFor(T.RAMP_LEVELS) === T.TOL[1], '容許誤差 ' + T.TOL);
ok(T.ratioFor(1) === T.RATIO[0] && T.ratioFor(T.RAMP_LEVELS) === T.RATIO[1], '杯底/杯口 ' + T.RATIO);
ok(T.fillS(1) === T.FILL_S[0] && T.fillS(T.RAMP_LEVELS) === T.FILL_S[1], '倒滿時間 ' + T.FILL_S);
for (let l = 2; l <= 60; l++) ok(T.layersFor(l) >= T.layersFor(l - 1) && T.viewMs(l) <= T.viewMs(l - 1) && T.tolFor(l) <= T.tolFor(l - 1) && T.ratioFor(l) <= T.ratioFor(l - 1) && T.fillS(l) <= T.fillS(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.tolFor(l - 1) - T.tolFor(l)); ok(Math.max(...d) - Math.min(...d) <= 0.2, '容許誤差線性下降：每關 −' + Math.min(...d).toFixed(2) + '～−' + Math.max(...d).toFixed(2)); }

// ── 杯形：體積與高度 ──
for (const r of [0.5, 0.7, 0.9, 1]) ok(near(T.volumeAt(1, r), (1 + r + r * r) / 3, 1e-12), '整杯體積 = (1 + r + r²)/3（錐台公式）：r = ' + r);
ok(near(T.volumeAt(0.5, 1), 0.5, 1e-12) && T.volumeAt(0, 0.6) === 0, '直筒杯：體積和高度成正比、空杯體積 0');
for (const r of [0.5, 0.8, 1]) { let prev = -1; for (let y = 0; y <= 1.0001; y += 0.02) { const v = T.volumeAt(Math.min(1, y), r); ok(v >= prev - 1e-12, '體積隨高度遞增'); prev = v; } }
for (let i = 0; i < 400; i++) { const r = 0.45 + rnd() * 0.55, y = rnd(), v = T.volumeAt(y, r); ok(near(T.heightAt(v, r), y, 1e-9), 'heightAt 是 volumeAt 的反函數：r=' + r.toFixed(2) + ' y=' + y.toFixed(3)); }
ok(T.heightAt(0, 0.6) === 0 || near(T.heightAt(0, 0.6), 0, 1e-9), '體積 0 → 高度 0'); ok(T.heightAt(10, 0.6) === 1, '超過整杯 → 高度 1（倒滿）');
// 上寬下窄：同樣體積，下半部液面升得比較快——下半杯的體積比上半杯小
for (const r of [0.5, 0.7, 0.9]) ok(T.volumeAt(0.5, r) < T.volumeAt(1, r) / 2, 'r=' + r + '：下半杯的體積小於整杯的一半（下面窄）');
ok(near(T.volumeAt(0.5, 1), T.volumeAt(1, 1) / 2, 1e-12), '直筒杯：下半杯剛好一半');
{ // 液面上升速度：dy/dt = rate / w(y)²，越往上越慢
  const r = 0.5, rate = T.flowRate(r, 6); const dydt = y => rate / ((r + (1 - r) * y) ** 2); ok(dydt(0) > dydt(0.5) && dydt(0.5) > dydt(1) && near(dydt(0) / dydt(1), 1 / (r * r), 1e-9), '液面上升速度越往上越慢：杯底是杯口的 ' + (dydt(0) / dydt(1)).toFixed(2) + ' 倍');
  // 用數值積分驗證 heightAt：一秒一秒倒，到 6 秒剛好倒滿
  let v = 0, t = 0; for (; T.heightAt(v, r) < 1 - 1e-12 && t < 20; t += 0.001) v += rate * 0.001; ok(near(t, 6, 0.01), '倒滿要 ' + t.toFixed(2) + ' 秒（目標 6 秒）'); }
ok(near(T.flowRate(1, 8), 1 / 8, 1e-12), 'flowRate（直筒杯）');

// ── 最大差與厚度 ──
ok(near(T.maxDiff([0.3, 0.3, 0.4], [0.3, 0.3, 0.4]), 0) && near(T.maxDiff([0.3, 0.3, 0.4], [0.25, 0.35, 0.4]), 5, 1e-9) && near(T.maxDiff([0.5, 0.5], [0.4]), 50, 1e-9), 'maxDiff（%）：沒倒的層算 0');
ok(near(T.maxDiff([0.3, 0.3, 0.4], [0.3, 0.3, 0.4 + 0.061238]), 6.1238, 1e-6), '企劃的範例 6.1238%');
{ const t = T.thicknesses([0.3, 0.55, 1]); ok(near(t[0], 0.3) && near(t[1], 0.25) && near(t[2], 0.45), 'thicknesses：由累積高度算每層厚度'); }
// ── 分層 ──
for (let i = 0; i < 500; i++) { const n = 2 + Math.floor(rnd() * 4), f = T.splitLayers(n, rnd); ok(f.length === n && near(f.reduce((a, b) => a + b, 0), 1, 1e-9) && f.every(x => x >= T.MIN_FRAC - 1e-9), '分 ' + n + ' 層：總和 1、每層至少 ' + T.MIN_FRAC + '：' + f.map(x => x.toFixed(3))); ok(Math.max(...f) - Math.min(...f) > 0.07 - 1e-9 || n >= 5, '不是每層一樣厚'); }

// ── 整關 ──
let total = 0, minHold = 9, maxHold = 0, minWin = 1e9;
for (let i = 0; i < 1200; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  ok(q.n === T.layersFor(lv) && q.colors.length === q.n && q.fracs.length === q.n, '第 ' + lv + ' 關：' + q.n + ' 層');
  ok(new Set(q.colors).size === q.n && q.colors.every(c => c >= 0 && c <= 4), '顏色互不相同');
  ok(near(q.fracs.reduce((a, b) => a + b, 0), 1, 1e-9) && q.fracs.every(f => f >= T.MIN_FRAC - 1e-9), '厚度總和 1、每層至少 ' + T.MIN_FRAC);
  ok(q.ratio === T.ratioFor(lv) && q.tol === T.tolFor(lv) && q.viewMs === T.viewMs(lv) && q.fillS === T.fillS(lv) && near(q.rate, T.flowRate(q.ratio, q.fillS), 1e-12), '難度參數');
  // 完美倒法：照著這個時間按住，累計高度剛好等於示範的累計厚度
  const holds = T.perfectHolds(q); ok(holds.length === q.n && holds.every(t => t > 0), '每層按住的時間都是正的');
  let v = 0, cum = 0, okAll = true; q.fracs.forEach((f, k) => { v += holds[k] * q.rate; cum += f; if (!near(T.heightAt(v, q.ratio), Math.min(1, cum), 1e-6)) okAll = false; }); ok(okAll, '照完美倒法按住，每層的累計高度都跟示範一樣');
  const bounds = []; v = 0; holds.forEach(t => { v += t * q.rate; bounds.push(T.heightAt(v, q.ratio)); }); ok(T.maxDiff(q.fracs, T.thicknesses(bounds)) < 1e-6, '完美倒法的最大差是 0');
  holds.forEach(t => { minHold = Math.min(minHold, t); maxHold = Math.max(maxHold, t); });
  // 容許誤差換算成放手時機的窗口（秒）：該層頂端附近，液面高度差 tol 需要的時間
  let cumF = 0; q.fracs.forEach((f, k) => { cumF += f; const y = Math.min(0.999, cumF), speed = q.rate / ((q.ratio + (1 - q.ratio) * y) ** 2); minWin = Math.min(minWin, 2 * (q.tol / 100) / speed * 1000); });
}
console.log('每層按住的時間 ' + minHold.toFixed(2) + '～' + maxHold.toFixed(2) + ' 秒；放手時機的窗口最窄 ' + minWin.toFixed(0) + ' 毫秒');
ok(minHold > 0.1 && maxHold < 9, '按住的時間在人按得出來的範圍');
ok(minWin > 20, '容許誤差換算成時間窗口至少 20 毫秒（最難的情況）：' + minWin.toFixed(0));
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_layerdrink.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3200/.test(src) && /md\.toFixed\(4\)/.test(src) && /wrongColor/.test(src), '失敗：最大差 4 位小數、按錯顏色馬上結束、停格 2 秒以上');
  ok(/\.lyd-c--red \{[^}]*var\(--lyd-red\)/.test(css) && /\.lyd-stop--red \{[^}]*var\(--lyd-red\)/.test(css) && /\.lyd-bottle--bad \.lyd-bottle__body \{[^}]*var\(--c-bad/.test(css), '瓶子、液體顏色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_layerdrink.js'") > 0 && /上寬下窄/.test(G.rule), 'boot.js 有載入、玩法說明提到上寬下窄'); }
{ const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction6.css'), 'utf8'); T.COLORS.forEach(c => ok(css.indexOf('.lyd-c--' + c.id + ' ') >= 0 && css.indexOf('.lyd-stop--' + c.id + ' ') >= 0, 'CSS 有 ' + c.id)); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
