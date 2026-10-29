const { game } = require('./load.js');
const G = game('reaction_diff.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const W = 468, Hh = 330;
// V1.34 玩家意見「顏色差異太小，請放大顏色的差異；其他差異維持目前參數」：色相差從 40°→5° 放大成 75°→18°，大小（0.3→0.05）與位置（30→5px）沒動
ok(T.HUE_START >= 70 && T.HUE_END >= 15 && T.HUE_START > 40 && T.HUE_END > 5, '色相差放大：' + T.HUE_START + '° → ' + T.HUE_END + '°（舊 40° → 5°）');
ok(T.SIZE_START === 0.3 && T.SIZE_END === 0.05 && T.POS_START === 30 && T.POS_END === 5, '其他差異（大小、位置）參數維持不變');
ok(T.amounts(1).hue === T.HUE_START && Math.abs(T.amounts(T.LEVEL_RAMP).hue - T.HUE_END) < 1e-9, '第 1 關色相差 ' + T.amounts(1).hue + '°、最後一關 ' + T.amounts(T.LEVEL_RAMP).hue + '°');
// 差異量線性
const a1 = T.amounts(1), a10 = T.amounts(10.5), a20 = T.amounts(20);
for (const k of ['size', 'hue', 'pos']) { ok(a1[k] > a20[k] && Math.abs(a10[k] - (a1[k] + a20[k]) / 2) < 1e-6 * Math.max(1, a1[k]) * 10 && Math.abs(T.amounts(40)[k] - a20[k]) < 1e-12, k + ' ramp: shrinks linearly, clamps at LEVEL_RAMP'); }

for (let lv = 1; lv <= 25; lv++) for (let k = 0; k < 200; k++) {
  const L = T.makeLevel(lv, W, Hh);
  ok(L.items.length === 10 && L.diffs.length === 5, 'counts');
  ok(new Set(L.diffs.map(d => d.i)).size === 5, 'distinct idx');
  ok(new Set(L.diffs.map(d => d.kind)).size === 3, 'all kinds present lv' + lv);
  L.items.forEach(it => ok(it.x >= 0 && it.x <= W && it.y >= 0 && it.y <= Hh, 'inside'));
  // 差異實際存在，而且「沒動手腳的」兩格完全一樣
  L.items.forEach((_, i) => {
    const t = T.itemIn(L, 'top', i), b = T.itemIn(L, 'bot', i);
    const same = t.r === b.r && t.hue === b.hue && t.x === b.x && t.y === b.y;
    ok(same === !L.diffs.some(d => d.i === i), 'diff exactness');
  });
  L.diffs.forEach(d => {
    const t = T.itemIn(L, 'top', d.i), b = T.itemIn(L, 'bot', d.i);
    if (d.kind === 'size') ok(Math.abs(Math.abs(t.r - b.r) / Math.min(t.r, b.r) - 0) >= 0 && Math.abs(t.r - b.r) > 0, 'size differs');
    if (d.kind === 'hue') { const dh = Math.min(Math.abs(t.hue - b.hue), 360 - Math.abs(t.hue - b.hue)); ok(Math.abs(dh - L.amt.hue) < 1e-6, 'hue amount ' + dh + ' vs ' + L.amt.hue); }
    if (d.kind === 'pos') { const dist = Math.hypot(t.x - b.x, t.y - b.y); ok(Math.abs(dist - L.amt.pos) < 1e-6, 'pos amount'); }
    // 位移後仍在格子內
    ok(t.x >= 0 && t.x <= W && t.y >= 0 && t.y <= Hh && b.x >= 0 && b.x <= W && b.y >= 0 && b.y <= Hh, 'shifted inside');
  });
}
ok(T.polyPoints('star', 30).length === 10 && T.polyPoints('triangle', 30).length === 3 && T.polyPoints('hexagon', 30).length === 6, 'polys');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
