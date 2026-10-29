// 切菜單上的（menuslice，企劃 314）的純函式檢查：菜單與長得像的誘餌、拋物線飛行與落地時間、線段碰圓判定、出題（每種菜單水果至少一顆、菜單外 45%、夥伴誘餌）、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_menuslice.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261119), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.menuCountFor(1) === T.MENU_N[0] && T.menuCountFor(T.RAMP_LEVELS) === T.MENU_N[1] && T.menuCountFor(99) === T.MENU_N[1], '菜單種類 ' + T.MENU_N);
ok(T.totalFor(1) === T.TOTAL[0] && T.totalFor(T.RAMP_LEVELS) === T.TOTAL[1], '水果總數 ' + T.TOTAL);
ok(T.spawnMsFor(1) === T.SPAWN_MS[0] && T.spawnMsFor(T.RAMP_LEVELS) === T.SPAWN_MS[1], '拋出間隔 ' + T.SPAWN_MS);
ok(T.VIEW_S === 3, '看菜單 3 秒');
for (let l = 2; l <= 60; l++) ok(T.menuCountFor(l) >= T.menuCountFor(l - 1) && T.totalFor(l) >= T.totalFor(l - 1) && T.spawnMsFor(l) <= T.spawnMsFor(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.totalFor(l) - T.totalFor(l - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '水果數線性成長：每關 +' + Math.min(...d) + '～' + Math.max(...d)); }

// ── 水果表 ──
ok(T.FRUITS.length === 12 && new Set(T.FRUITS.map(f => f.id)).size === 12, '12 種水果、id 不重複');
T.FRUITS.forEach(f => { if (f.pair) { const p = T.fruitOf(f.pair); ok(p && p.pair === f.id, f.id + ' 和 ' + f.pair + ' 互為夥伴'); } ok(T.SHAPES[f.id] && T.SHAPES[f.id].length >= 1 && f.name.length >= 2, f.id + ' 有畫法、有名字'); });
ok(T.PAIRS.every(p => T.fruitOf(p[0]).pair === p[1]) && T.PAIRS.length === 4 && T.SINGLES.length === 4 && T.FRUITS.filter(f => !f.pair).length === 4, '四組長得像的＋四種單獨的');
ok(T.nameOf('orange') === '柳丁' && T.nameOf('tangerine') === '橘子' && T.nameOf('lemon') === '檸檬' && T.nameOf('lime') === '萊姆' && T.nameOf('xyz') === 'xyz', '名字');

// ── 菜單 ──
for (let i = 0; i < 400; i++) {
  const m = 2 + Math.floor(rnd() * 5), menu = T.menuFor(m, rnd);
  ok(menu.length === m && new Set(menu).size === m && menu.every(id => T.fruitOf(id)), '菜單 ' + menu + ' 有 ' + m + ' 種、不重複');
  if (m <= 4) ok(menu.every(id => { const f = T.fruitOf(id); return f.pair && menu.indexOf(f.pair) < 0; }), '≤4 種時每個菜單水果的夥伴都不在菜單上（夥伴就是誘餌）：' + menu);
  const pools = T.decoyPools(menu); ok(pools.partners.concat(pools.others).every(id => menu.indexOf(id) < 0) && pools.partners.concat(pools.others).length === 12 - m, '誘餌池 = 不在菜單上的水果');
  ok(pools.partners.every(id => menu.indexOf(T.fruitOf(id).pair) >= 0), '夥伴池的水果，它的夥伴在菜單上');
  if (m <= 4) ok(pools.partners.length === m, '≤4 種時，夥伴誘餌有 ' + m + ' 種');
}
// ── 飛行 ──
for (let i = 0; i < 300; i++) {
  const tz = { x0: 0.2 + rnd() * 0.6, vx: (rnd() - 0.5) * 0.2, ya: T.APEX[0] + rnd() * (T.APEX[1] - T.APEX[0]), ta: T.T_APEX[0] + rnd() * (T.T_APEX[1] - T.T_APEX[0]) };
  const p0 = T.flightPos(tz, 0), pa = T.flightPos(tz, tz.ta), lt = T.landTime(tz), pl = T.flightPos(tz, lt);
  ok(near(p0.y, T.BOTTOM, 1e-9) && near(pa.y, tz.ya, 1e-9), '起點在畫面下緣外、' + tz.ta.toFixed(2) + ' 秒後到最高點 ' + tz.ya.toFixed(2));
  ok(lt > 2 * tz.ta - 1e-9 && lt < 2 * tz.ta + 0.3, '落地時間 ' + lt.toFixed(2) + ' 秒（約兩倍的上升時間）');
  ok(near(pl.y, T.EXIT, 1e-6), '落地時剛好在 EXIT 線上');
  // 拋物線：最高點之前一直上升、之後一直下降
  let up = true, prev = T.flightPos(tz, 0).y; for (let t = 0.02; t <= lt; t += 0.02) { const y = T.flightPos(tz, t).y; if (t <= tz.ta && y > prev + 1e-9) up = false; if (t > tz.ta + 0.02 && y < prev - 1e-9) up = false; prev = y; } ok(up, '先升後降');
  ok(pa.y < 0.55 && pa.y > 0.1, '最高點在畫面中上方');
}
// ── 線段碰圓 ──
ok(T.segHitsCircle(0, 0, 100, 0, 50, 5, 10) && !T.segHitsCircle(0, 0, 100, 0, 50, 25, 10) && T.segHitsCircle(0, 0, 100, 0, 50, 10, 10), '線段穿過圓／沒碰到／剛好相切');
ok(T.segHitsCircle(0, 0, 10, 0, 15, 0, 6) && !T.segHitsCircle(0, 0, 10, 0, 30, 0, 6), '線段的端點附近：碰得到／碰不到');
ok(T.segHitsCircle(5, 5, 5, 5, 8, 9, 6) && !T.segHitsCircle(5, 5, 5, 5, 30, 30, 6), '線段長度為 0（只按一下）也行');
ok(T.segHitsCircle(0, 0, 100, 100, 50, 50, 1) && T.segHitsCircle(100, 0, 0, 100, 50, 50, 1), '斜著穿過圓心');
for (let i = 0; i < 300; i++) { const a = [rnd() * 400, rnd() * 400], b = [rnd() * 400, rnd() * 400], c = [rnd() * 400, rnd() * 400], r = 5 + rnd() * 40; let brute = false; for (let k = 0; k <= 400; k++) { const t = k / 400, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; if (Math.hypot(x - c[0], y - c[1]) <= r) brute = true; } const fast = T.segHitsCircle(a[0], a[1], b[0], b[1], c[0], c[1], r); if (brute) ok(fast, '密集取樣碰到的，線段判定也要碰到'); }

// ── 整關 ──
let total = 0, partnerTot = 0, decoyTot = 0, gaps = [], spawnDev = [];
for (let i = 0; i < 1200; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const m = T.menuCountFor(lv), F = T.totalFor(lv);
  ok(q.menu.length === m && q.total === F && q.tosses.length === F, '第 ' + lv + ' 關：菜單 ' + m + ' 種、水果 ' + F + ' 顆');
  const onMenu = q.tosses.filter(t => t.onMenu), off = q.tosses.filter(t => !t.onMenu);
  ok(onMenu.every(t => q.menu.indexOf(t.fruit) >= 0) && off.every(t => q.menu.indexOf(t.fruit) < 0), '菜單上的水果標記正確');
  ok(q.menu.every(id => onMenu.some(t => t.fruit === id)), '每種菜單水果至少一顆');
  ok(onMenu.length === Math.max(m, Math.round(F * T.MENU_FRAC)), '菜單上的有 ' + onMenu.length + ' 顆（' + F + ' 顆的 ' + T.MENU_FRAC * 100 + '%）');
  ok(off.length >= 1 && off.length === F - onMenu.length, '誘餌 ' + off.length + ' 顆');
  off.forEach(t => { decoyTot++; if (T.fruitOf(t.fruit).pair && q.menu.indexOf(T.fruitOf(t.fruit).pair) >= 0) partnerTot++; });
  ok(q.tosses.every((t, k) => k === 0 || t.t > q.tosses[k - 1].t) && q.tosses[0].t >= T.LEAD_MS, '拋出時間遞增、第一顆在 ' + T.LEAD_MS + ' 毫秒之後');
  ok(q.tosses.every(t => t.x0 >= T.X_RANGE[0] - 1e-9 && t.x0 <= T.X_RANGE[1] + 1e-9 && t.ya >= T.APEX[0] - 1e-9 && t.ya <= T.APEX[1] + 1e-9 && t.ta >= T.T_APEX[0] - 1e-9 && t.ta <= T.T_APEX[1] + 1e-9), '位置、最高點、上升時間都在範圍內');
  ok(q.tosses.every(t => { const p = T.flightPos(t, t.ta); return p.x > 0.05 && p.x < 0.95; }), '到最高點時還在畫面裡');
  for (let k = 1; k < q.tosses.length; k++) { gaps.push(q.tosses[k].t - q.tosses[k - 1].t); spawnDev.push((q.tosses[k].t - q.tosses[k - 1].t) / q.spawnMs); }
  ok(q.spawnMs === T.spawnMsFor(lv) && q.viewMs === 3000, '間隔與看菜單時間');
  if (lv === 1) ok(m === 2 && F === 8, '第 1 關：2 種、8 顆');
}
ok(partnerTot / decoyTot > 0.55, '誘餌多半是「長得像的夥伴」：' + (100 * partnerTot / decoyTot).toFixed(0) + '%');
ok(Math.min(...spawnDev) >= 0.84 && Math.max(...spawnDev) <= 1.16, '間隔在 ±15% 內：' + Math.min(...spawnDev).toFixed(2) + '～' + Math.max(...spawnDev).toFixed(2));
// 相鄰兩顆的橫向位置不會太近
{ let close = 0, n = 0; for (let i = 0; i < 200; i++) { const q = T.makeLevel(12, rnd); for (let k = 1; k < q.tosses.length; k++) { n++; if (Math.abs(q.tosses[k].x0 - q.tosses[k - 1].x0) < 0.1) close++; } } ok(close / n < 0.08, '相鄰兩顆的橫向位置大多拉開：太近的 ' + (100 * close / n).toFixed(1) + '%'); }
// 同時在空中的最多幾顆（越後面越密）
function maxAir(q) { let mx = 0; q.tosses.forEach(a => { let c = 0; q.tosses.forEach(b => { if (b.t <= a.t && a.t < b.t + T.landTime(b) * 1000) c++; }); mx = Math.max(mx, c); }); return mx; }
{ const q1 = T.makeLevel(1, rnd), q24 = T.makeLevel(24, rnd); console.log('同時在空中的最多顆數：第 1 關 ' + maxAir(q1) + '、第 24 關 ' + maxAir(q24)); ok(maxAir(q24) >= maxAir(q1), '越後面空中同時的水果越多'); }
// 效能
{ const t0 = Date.now(); for (let i = 0; i < 2000; i++) T.makeLevel(1 + (i % 40), rnd); ok((Date.now() - t0) / 2000 < 2, '出題夠快'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_menuslice.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3600/.test(src) && /showMenuAgain/.test(src) && /msl-cmp__box--ok/.test(src), '失敗：菜單再亮出來、錯的與菜單上的並排、停格 2 秒以上');
  ok(/\.msl-board \{[^}]*var\(--msl-board\)/.test(css) && /\.msl-cmp__box--bad \{[^}]*var\(--c-bad/.test(css) && /\.msl-f--orange \{[^}]*var\(--msl-orange\)/.test(css), '黑板、水果顏色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_menuslice.js'") > 0 && /長得像/.test(G.rule), 'boot.js 有載入、玩法說明提到長得像'); }
// 每種水果都有對應的 CSS 顏色
{ const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction6.css'), 'utf8'); T.FRUITS.forEach(f => ok(css.indexOf('.msl-f--' + f.id + ' ') >= 0, 'CSS 有 .msl-f--' + f.id)); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
