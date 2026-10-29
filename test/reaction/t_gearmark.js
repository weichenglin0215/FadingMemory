// 齒輪對記號（gearmark，企劃 254）的純函式檢查：轉速關係、最小公倍數圈數、一定有解、齒輪咬合相位（轉到哪裡都咬得上）、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_gearmark.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261109), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);

// ── 難度 ──
ok(T.nFor(1) === T.GEARS[0] && T.nFor(T.RAMP_LEVELS) === T.GEARS[1] && T.nFor(99) === T.GEARS[1], '齒輪數 ' + T.GEARS);
ok(T.tolFor(1) === T.TOL[0] && T.tolFor(T.RAMP_LEVELS) === T.TOL[1], '容許誤差 ' + T.TOL);
ok(T.periodMaxFor(1) === T.PERIOD_MAX[0] && T.periodMaxFor(T.RAMP_LEVELS) === T.PERIOD_MAX[1], '圈數上限 ' + T.PERIOD_MAX);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
for (let l = 2; l <= 60; l++) ok(T.nFor(l) >= T.nFor(l - 1) && T.tolFor(l) <= T.tolFor(l - 1) && T.periodMaxFor(l) >= T.periodMaxFor(l - 1) && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.tolFor(l - 1) - T.tolFor(l)); ok(Math.max(...d) - Math.min(...d) <= 0.2, '容許誤差線性下降：每關 −' + Math.min(...d).toFixed(2) + '～−' + Math.max(...d).toFixed(2)); }

// ── 數學 ──
ok(T.gcd(24, 16) === 8 && T.gcd(7, 5) === 1 && T.lcm(4, 6) === 12 && T.lcm(3, 1) === 3, 'gcd／lcm');
ok(T.wrap180(190) === -170 && T.wrap180(-190) === 170 && T.wrap180(180) === 180 && T.wrap180(-180) === 180 && T.wrap180(720) === 0 && T.wrap180(0) === 0 && near(T.wrap180(359.5), -0.5), 'wrap180');
ok(T.wrap360(-10) === 350 && T.wrap360(370) === 10 && T.wrap360(0) === 0, 'wrap360');
// 轉速：偶數號同方向、奇數號反方向、齒數少的轉得快
{ const t = [24, 12, 8]; ok(T.rotOf(t, 0, 90) === 90 && T.rotOf(t, 1, 90) === -180 && T.rotOf(t, 2, 90) === 270, '轉速 24:12:8 → 大齒輪轉 90°，齒輪 2 反向轉 180°、齒輪 3 同向轉 270°'); }
// 全部回到原位的圈數
ok(T.ratioPeriod([24, 12]) === 1 && T.ratioPeriod([24, 8]) === 1 && T.ratioPeriod([20, 15]) === 3 && T.ratioPeriod([24, 16, 12]) === 2 && T.ratioPeriod([60, 45, 36]) === 3 && T.ratioPeriod([30, 20, 12, 8]) === 4, 'ratioPeriod 範例');
{ // 真的轉那麼多圈，所有齒輪才同時回到原位
  for (const t of [[20, 15], [24, 16, 12], [60, 45, 36], [30, 20, 12, 8], [48, 35, 21]]) {
    const P = T.ratioPeriod(t); let first = 0;
    for (let k = 1; k <= 100 && !first; k++) { if (t.every((tt, i) => { const r = T.rotOf(t, i, 360 * k); return near(((r % 360) + 360) % 360 % 360, 0, 1e-6) || near(((r % 360) + 360) % 360, 360, 1e-6); })) first = k; }
    ok(first === P, '齒數 ' + t + ' 第一次全部回到原位是第 ' + first + ' 圈（算出來 ' + P + '）');
  } }

// ── 咬合相位：任意齒數、任意轉角，相鄰齒輪的咬合量都是 180° ──
let meshBad = 0, meshN = 0;
for (let i = 0; i < 400; i++) {
  const n = 2 + Math.floor(rnd() * 4), t = [24 + Math.floor(rnd() * 40)]; for (let k = 1; k < n; k++) t.push(8 + Math.floor(rnd() * (t[0] - 10)));
  const L = T.layout(t);
  for (let k = 0; k < n - 1; k++) { const th = (rnd() - 0.5) * 3000; const s = T.meshSum(t, L, k, th); meshN++; if (!near(s, 180, 1e-6)) meshBad++; }
  // 相鄰中心距 = 兩個節圓半徑（單位：齒數）相加
  for (let k = 0; k < n - 1; k++) { const dx = L.pos[k + 1].x - L.pos[k].x, dy = L.pos[k + 1].y - L.pos[k].y; ok(near(Math.hypot(dx, dy), t[k] + t[k + 1], 1e-9), '相鄰齒輪的中心距 = 半徑和'); }
}
ok(meshBad === 0, '咬合相位：' + meshN + ' 個相鄰對、隨機轉角，咬合量都是 180°（不對的 ' + meshBad + '）');
{ const L = T.layout([24, 12]); ok(L.pos.length === 2 && near(L.pos[1].y, 0, 1e-9) && near(L.pos[1].x, 36, 1e-9) && L.dirs[0] === 90, '兩個齒輪：水平並排'); }
// 之字形：方向左右交替；不相鄰的齒輪不撞在一起；盡量用最斜的角度
for (let i = 0; i < 300; i++) {
  const n = 3 + Math.floor(rnd() * 3), t = [24 + Math.floor(rnd() * 40)]; for (let k = 1; k < n; k++) t.push(8 + Math.floor(rnd() * (t[0] - 10)));
  const L = T.layout(t), dl = 90 - L.dirs[0];
  ok(L.dirs.every((d, k) => d === 90 + (k % 2 === 0 ? -dl : dl)) && dl >= 0 && dl <= 60, '齒數 ' + t + '：之字形左右交替（斜角 ' + dl + '°）');
  let overlap = false; for (let a = 0; a < n; a++) for (let b2 = a + 2; b2 < n; b2++) if (Math.hypot(L.pos[a].x - L.pos[b2].x, L.pos[a].y - L.pos[b2].y) < t[a] + t[b2] + 4) overlap = true;
  ok(!overlap, '齒數 ' + t + '：不相鄰的齒輪沒有撞在一起（斜角 ' + dl + '°）');
}
// 齒輪形狀：齒數個齒、每個齒 4 個點
{ const p = T.gearPath(12, 40, 0, 4, 5); ok(p.split(' L').length === 48 && /^M/.test(p) && /Z$/.test(p), 'gearPath：12 齒 → 48 個點'); }

// ── 整關 ──
let total = 0, clusters = {}, periods = {};
for (let i = 0; i < 1200; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const n = T.nFor(lv), P = T.ratioPeriod(q.teeth);
  ok(q.teeth.length === n && q.marks.length === n && q.n === n, '第 ' + lv + ' 關：齒輪數 ' + n);
  ok(q.tol === T.tolFor(lv) && q.period === P && P <= T.periodMaxFor(lv), '第 ' + lv + ' 關：容許誤差、圈數 ' + P + ' ≤ ' + T.periodMaxFor(lv));
  ok(new Set(q.teeth).size === n && q.teeth.every(t => t >= T.TEETH_MIN && t <= q.teeth[0]) && q.teeth[0] === Math.max(...q.teeth), '齒數不重複、大齒輪（最左）齒數最多：' + q.teeth);
  ok(q.teeth.every((t, k) => k === 0 || Math.abs(t - q.teeth[k - 1]) >= T.TEETH_GAP), '相鄰齒輪的齒數差至少 ' + T.TEETH_GAP);
  ok(T.T0_LIST.includes(q.teeth[0]), '大齒輪齒數在清單內');
  ok(Math.abs(q.target) >= T.TARGET_TURN[0] && Math.abs(q.target) <= T.TARGET_TURN[1], '對準位置離起點 ' + q.target.toFixed(0) + '°');
  ok(q.marks.every(m => m >= 0 && m < 360), '初始針角在 0～360');
  ok(Math.max(...T.errors(q, q.target)) < 1e-6 && T.solved(q, q.target), '轉到 target，每根針的誤差都是 0（一定有解）');
  ok(Math.max(...T.errors(q, 0)) > q.tol * 3 && !T.solved(q, 0), '起點不是解');
  ok(T.solved(q, q.target + 360 * P) && T.solved(q, q.target - 360 * P), '再轉 ' + P + ' 圈（最小公倍數）又對準');
  ok(!T.solved(q, q.target + 360 * P + 40), '轉過頭一點就不對準');
  periods[P] = (periods[P] || 0) + 1;
  if (i % 12 === 0) {   // 掃描一個週期，數有幾段「全部對準」的區間
    let c = 0, inside = false, hit = false;
    for (let th = q.target - 180 * P; th < q.target + 180 * P; th += 0.05) {
      const s = T.solved(q, th); if (s && !inside) { c++; } inside = s; if (s && Math.abs(th - q.target) < 1) hit = true;
    }
    clusters[c] = (clusters[c] || 0) + 1; ok(hit && c >= 1, '掃描：包含 target 的對準區間存在（共 ' + c + ' 段）');
  }
}
console.log('圈數分布 ' + JSON.stringify(periods) + '；一個週期內的「全部對準」區間數 ' + JSON.stringify(clusters));
{ for (let i = 0; i < 100; i++) { const q = T.makeLevel(1, rnd); ok(q.n === 2 && q.tol === 8 && q.period === 1, '第 1 關：兩個齒輪、8°、每一圈都對得上'); } }
{ let big = 0; for (let i = 0; i < 100; i++) if (T.makeLevel(T.RAMP_LEVELS, rnd).period > 3) big++; ok(big > 20, '到頂的關卡常常要轉好幾圈（>3 圈的有 ' + big + ' 題）'); }
// 效能
for (const lv of [1, 12, 24, 40]) { const t0 = Date.now(); let worst = 0; for (let i = 0; i < 100; i++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 100; console.log('第' + lv + '關 出題平均 ' + per.toFixed(2) + ' 毫秒、最慢 ' + worst); ok(per < 20 && worst < 300, '第 ' + lv + ' 關出題夠快：' + per.toFixed(2) + '／' + worst); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_gearmark.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3200/.test(src) && /deg4\(worst\)/.test(src) && /X\.XXXX|toFixed\(4\)/.test(src), '失敗停格 3 秒以上、顯示 4 位小數的誤差');
  ok(/\.grm-needle \{[^}]*var\(--c-bad-light\)/.test(css) && /\.grm-row--bad \{[^}]*var\(--c-bad\)/.test(css) && /\.grm-body \{[^}]*var\(--grm-copper\)/.test(css), '紅針、銅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_gearmark.js'") > 0 && /畫圈/.test(G.rule), 'boot.js 有載入、玩法說明提到畫圈'); }
ok(T.deg4(2.13844) === '2.1384' && T.deg4(0) === '0.0000', 'deg4 四位小數');
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
