// 加到五百（gaspump，企劃 273）的純函式檢查：容許誤差線性、流量加速的公式（累計公升數與反解秒數）、畫面公升取到小數 2 位、結算金額與誤差、出題範圍、最後流量不超標
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_gaspump.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261114), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.tolFor(1) === T.TOL[0] && T.tolFor(T.RAMP_LEVELS) === T.TOL[1] && T.tolFor(99) === T.TOL[1], '容許誤差 ' + T.TOL + '（第 ' + T.RAMP_LEVELS + ' 關到頂）');
ok(near(T.accelFor(1), T.ACCEL[0]) && near(T.accelFor(T.RAMP_LEVELS), T.ACCEL[1]), '加速程度 ' + T.ACCEL);
for (let l = 2; l <= 60; l++) ok(T.tolFor(l) <= T.tolFor(l - 1) && T.accelFor(l) >= T.accelFor(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.tolFor(l - 1) - T.tolFor(l)); ok(Math.max(...d) - Math.min(...d) <= 0.2, '容許誤差線性下降：每關 −' + Math.min(...d).toFixed(2) + '～−' + Math.max(...d).toFixed(2)); }
ok(T.timeMs() === T.TIME_S * 1000, '整關限時');

// ── 公式 ──
ok(near(T.litersAt(0, 1, 0.5), 0) && near(T.litersAt(2, 1, 0.5), 2 + 1) && near(T.litersAt(4, 2, 0), 8), 'litersAt：r0×t + a×t²/2');
for (let i = 0; i < 500; i++) { const r0 = 0.1 + rnd() * 3, a = rnd() < 0.2 ? 0 : rnd() * 1, L = 1 + rnd() * 40, t = T.timeFor(L, r0, a); ok(near(T.litersAt(t, r0, a), L, 1e-7) && t > 0, 'timeFor 是 litersAt 的反函數'); }
ok(T.shown(16.78) === 16.78 && T.shown(16.7899999) === 16.78 && T.shown(16.7799999999999) === 16.78 && T.shown(0.009) === 0 && T.shown(10) === 10 && T.shown(3.999) === 3.99, 'shown：取到小數 2 位、無條件捨去（浮點數誤差不會讓 16.78 變 16.77）');
for (let i = 0; i < 300; i++) { const L = rnd() * 50, s = T.shown(L); ok(s <= L + 1e-9 && L - s < 0.0100001 && near(Math.round(s * 100) / 100, s, 1e-9), 'shown 的誤差小於 0.01'); }
// 結算
{ const r = T.settle(16.84, 29.8, 500, 15); ok(near(r.amount, 501.832, 1e-9) && near(r.diff, 1.832, 1e-9) && r.ok, '16.84 公升 × 29.8 ＝ 501.832 元，多加 1.832（在 ±15 內）'); }
{ const r = T.settle(16.0, 29.8, 500, 15); ok(near(r.diff, -23.2, 1e-9) && !r.ok, '16 公升少加了 23.2 元：不過關'); }
{ const r = T.settle(16.78, 29.8, 500, 0.5); ok(near(r.amount, 500.044, 1e-9) && r.ok, '16.78 × 29.8 ＝ 500.044（±0.5 內）'); }
{ const r = T.settle(17.0, 29.8, 500, 15); ok(r.diff > 0 && r.diff < 7 && r.ok, '17 公升多加 6.6 元'); }
ok(T.fmt4(503.608) === '503.6080' && T.fmt4(3.608) === '3.6080' && T.fmt4(0) === '0.0000', 'fmt4 四位小數（企劃的範例 503.6080）');

// ── 整關 ──
let total = 0, tg = {}, prices = {}, windows = [];
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  ok(q.level === lv && q.tol === T.tolFor(lv), '第 ' + lv + ' 關：容許 ±' + q.tol);
  if (lv <= T.EASY_LEVELS) ok(T.PRICES_EASY.includes(q.price), '前幾關油價是整數：' + q.price); else ok(q.price >= T.PRICE_RANGE[0] - 1e-9 && q.price <= T.PRICE_RANGE[1] + 1e-9 && near(Math.round(q.price * 10) / 10, q.price, 1e-9), '油價 ' + q.price + ' 在 ' + T.PRICE_RANGE + '（一位小數）');
  if (lv < T.TARGET_FROM) ok(q.target === 500, '第 ' + lv + ' 關目標只有 500'); else ok(T.TARGETS.includes(q.target), '目標金額 ' + q.target);
  tg[q.target] = (tg[q.target] || 0) + 1; prices[q.price] = 1;
  ok(near(q.targetL, q.target / q.price, 1e-9) && q.r0 > 0 && q.a >= 0 && q.T >= T.T_RANGE[0] - 1e-9 && q.T <= T.T_MAX + 1e-9, '流量參數合理');
  ok(near(T.litersAt(q.T, q.r0, q.a), q.targetL, 1e-6), '按 T 秒剛好到目標公升數');
  ok(near(q.rEnd, q.r0 + q.a * q.T, 1e-9) && q.rEnd > q.r0 - 1e-12, '最後流量 > 剛按下的流量（越來越快）');
  ok(q.rEnd <= T.RATE_MAX + 1e-6 || near(q.T, T.T_MAX, 1e-9), '最後流量 ' + q.rEnd.toFixed(2) + ' ≤ ' + T.RATE_MAX + '（或 T 已拉到上限）');
  ok(q.maxL > q.targetL && near(q.maxL, q.targetL * T.OVER, 1e-9), '加滿的上限');
  ok(['95 無鉛', '92 無鉛', '98 無鉛'].includes(q.fuel), '油品');
  // 在目標那一刻，金額變化的速度（元／秒）→ 容許誤差換算成「放手時機的窗口」（毫秒）
  const yps = q.price * (q.r0 + q.a * q.T), win = 2 * q.tol / yps * 1000; windows.push([lv, win]);
  // 容許範圍內一定有「畫面公升數」落在裡面（公升每 0.01 跳一次，金額每次跳 price×0.01 元，小於 2×容許誤差）
  ok(q.price * 0.01 < 2 * q.tol, '第 ' + lv + ' 關：公升每跳 0.01 對應 ' + (q.price * 0.01).toFixed(3) + ' 元 < 容許範圍寬度 ' + (2 * q.tol));
}
console.log('目標金額分布 ' + JSON.stringify(tg) + '；不同油價 ' + Object.keys(prices).length + ' 種');
ok(tg[500] > 0 && tg[300] > 0 && tg[800] > 0 && tg[1000] > 0, '300／500／800／1000 都有出現');
{ const w1 = windows.filter(x => x[0] === 1).map(x => x[1]), w25 = windows.filter(x => x[0] === 25).map(x => x[1]); const avg = a => a.reduce((x, y) => x + y, 0) / a.length; console.log('放手時機的窗口：第 1 關平均 ' + avg(w1).toFixed(0) + ' 毫秒、第 25 關平均 ' + avg(w25).toFixed(1) + ' 毫秒'); ok(avg(w1) > 100 && avg(w25) > 3, '第 1 關的窗口夠寬（人按得到）、第 25 關很窄但不為零'); }
// 不同關卡的流量不同（不能靠記秒數）
{ const ts = new Set(); for (let i = 0; i < 100; i++) ts.add(T.makeLevel(10, rnd).T.toFixed(1)); ok(ts.size > 20, '每關的出油節奏不一樣：' + ts.size + ' 種秒數'); }
// 效能
{ const t0 = Date.now(); for (let i = 0; i < 2000; i++) T.makeLevel(1 + (i % 40), rnd); ok((Date.now() - t0) / 2000 < 1, '出題夠快'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_gaspump.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 2800/.test(src) && /gsp-sticker--off/.test(src) && /gsp-digits--zoom/.test(src) && /fmt4\(r\.amount\)/.test(src), '失敗：撕貼紙、放大最後一位、顯示 4 位小數的金額與誤差、停格 2 秒以上');
  ok(/\.gsp-amount \{[^}]*var\(--gsp-digit\)/.test(css) && /\.gsp-panel \{[^}]*var\(--gsp-panel\)/.test(css) && /\.gsp-amount--bad \{[^}]*var\(--c-bad/.test(css), '黑底黃字、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_gaspump.js'") > 0 && /金額 ÷ 油價/.test(G.rule), 'boot.js 有載入、玩法說明提到金額 ÷ 油價'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(18) && T.rating(18) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
