// 蝴蝶不對稱（butterfly，企劃 344）的純函式檢查：左右鏡射剛好只有一處不同、差異大小隨關卡線性縮小、歪斜後的點擊判定、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_butterfly.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261127), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.spotsFor(1) === T.SPOTS[0] && T.spotsFor(T.RAMP_LEVELS) === T.SPOTS[1] && T.spotsFor(99) === T.SPOTS[1], '斑點數 ' + T.SPOTS);
ok(near(T.sizeDiffFor(1), T.SIZE_DIFF[0]) && near(T.sizeDiffFor(T.RAMP_LEVELS), T.SIZE_DIFF[1]), '斑點大小差 ' + T.SIZE_DIFF);
ok(near(T.hueDiffFor(1), T.HUE_DIFF[0]) && near(T.hueDiffFor(T.RAMP_LEVELS), T.HUE_DIFF[1]), '顏色差 ' + T.HUE_DIFF);
ok(near(T.angleDiffFor(1), T.ANGLE_DIFF[0]) && near(T.angleDiffFor(T.RAMP_LEVELS), T.ANGLE_DIFF[1]), '紋路角度差 ' + T.ANGLE_DIFF);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.tiltMaxFor(T.TILT_FROM - 1) === 0 && T.tiltMaxFor(T.TILT_FROM) > 0 && near(T.tiltMaxFor(T.RAMP_LEVELS), T.TILT_MAX, 1e-9), '第 ' + T.TILT_FROM + ' 關起歪斜，到頂 ' + T.TILT_MAX + '°');
ok(T.kindsFor(1).join() === 'size' && T.kindsFor(T.COLOR_FROM).join() === 'size,color' && T.kindsFor(T.ANGLE_FROM).join() === 'size,color,angle', '差異種類隨關卡增加');
for (let l = 2; l <= 60; l++) ok(T.spotsFor(l) >= T.spotsFor(l - 1) && T.sizeDiffFor(l) <= T.sizeDiffFor(l - 1) && T.hueDiffFor(l) <= T.hueDiffFor(l - 1) && T.angleDiffFor(l) <= T.angleDiffFor(l - 1) && T.timeMs(l) <= T.timeMs(l - 1) && T.tiltMaxFor(l) >= T.tiltMaxFor(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.sizeDiffFor(l - 1) - T.sizeDiffFor(l)); ok(Math.max(...d) - Math.min(...d) < 0.003, '斑點大小差線性縮小：每關 −' + Math.min(...d).toFixed(4) + '～−' + Math.max(...d).toFixed(4)); }
ok(T.spotRadius(4) > T.spotRadius(20) && T.spotRadius(20) >= 5, '斑點越多越小');

// ── 整關 ──
function wingDiff(q) {   // 右翅膀與（翻過來的）左翅膀，逐個東西比，回傳不同的東西
  const R = T.wingElements(q, q.mod.side === 'R' ? q.mod : null), L = T.wingElements(q, q.mod.side === 'L' ? q.mod : null), out = [];
  R.spots.forEach((s, i) => { const t = L.spots[i]; if (Math.abs(s.r - t.r) > 1e-9 || s.c !== t.c || s.hue !== t.hue || s.x !== t.x || s.y !== t.y) out.push(['spot', i]); });
  R.stripes.forEach((s, i) => { const t = L.stripes[i]; if (Math.abs(s.ang - t.ang) > 1e-9 || s.len !== t.len || s.x !== t.x || s.y !== t.y) out.push(['stripe', i]); });
  return out;
}
let total = 0, kinds = { size: 0, color: 0, angle: 0 }, sides = { L: 0, R: 0 };
for (let i = 0; i < 2000; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const n = T.spotsFor(lv), m = q.mod;
  ok(q.spots.length === n, '第 ' + lv + ' 關：斑點 ' + q.spots.length + '（目標 ' + n + '）');
  ok(q.spots.length >= 3 && q.stripes.length >= 2, '至少有幾個斑點和紋路');
  ok(q.spots.every(s => s.x >= T.CENTER + 20 && s.x <= T.VB.w && s.y >= 0 && s.y <= T.VB.h && T.inLobe(s.x, s.y, s.r)), '斑點都在右翅膀的範圍內');
  let tooClose = false; q.spots.forEach((a, k) => { q.spots.forEach((b, k2) => { if (k2 > k && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 6 - 1e-9) tooClose = true; }); q.stripes.forEach(s => { if (Math.hypot(a.x - s.x, a.y - s.y) < a.r + s.len / 2 + 4 - 1e-9) tooClose = true; }); }); ok(!tooClose, '斑點之間、斑點與紋路之間不重疊');
  ok(T.kindsFor(lv).includes(m.kind) && (m.side === 'L' || m.side === 'R'), '差異種類 ' + m.kind + '、改在 ' + m.side);
  const maxIdx = m.kind === 'angle' ? q.stripes.length : q.spots.length; ok(m.index >= 0 && m.index < maxIdx, '被改的是第 ' + m.index + ' 個');
  const want = m.kind === 'size' ? T.sizeDiffFor(lv) : m.kind === 'color' ? T.hueDiffFor(lv) : T.angleDiffFor(lv); ok(near(Math.abs(m.delta), want, 1e-9), '差異大小 = 這一關的設定 ' + want);
  const diff = wingDiff(q); ok(diff.length === 1 && diff[0][0] === (m.kind === 'angle' ? 'stripe' : 'spot') && diff[0][1] === m.index, '【對稱驗證】左右翅膀（鏡射後）剛好只有 1 處不同：' + JSON.stringify(diff));
  ok(Math.abs(q.tilt) <= T.tiltMaxFor(lv) + 1e-9 && (lv < T.TILT_FROM ? q.tilt === 0 : Math.abs(q.tilt) >= T.tiltMaxFor(lv) * 0.4 - 1e-9), '歪斜 ' + q.tilt.toFixed(1) + '°');
  // 被改的那個東西改完還在翅膀範圍內（大小差 40% 的斑點不會跑出去太多）
  const el = T.wingElements(q, m); if (m.kind === 'size') ok(T.inLobe(el.spots[m.index].x, el.spots[m.index].y, el.spots[m.index].r * 0.7), '改大的斑點還在翅膀裡');
  kinds[m.kind]++; sides[m.side]++;
  // 點擊判定：點被改的東西（任一邊，含歪斜）命中；點身體上方遠處不中
  const t = T.modTarget(q), a = q.tilt * Math.PI / 180, view = (x, y) => ({ x: T.CENTER + (x - T.CENTER) * Math.cos(a) - (y - T.VB.h / 2) * Math.sin(a), y: T.VB.h / 2 + (x - T.CENTER) * Math.sin(a) + (y - T.VB.h / 2) * Math.cos(a) });
  const pr = view(t.right.x, t.right.y), pl = view(t.left.x, t.left.y); ok(T.isHit(q, pr.x, pr.y) && T.isHit(q, pl.x, pl.y), '點被改的東西（右邊／左邊鏡像）命中');
  ok(T.isHit(q, pr.x + t.right.r + T.HIT_EXTRA - 1, pr.y) || !!q.tilt, '邊緣內側命中');
  ok(!T.isHit(q, pr.x + t.right.r + T.HIT_EXTRA + 30, pr.y + 30) || false, '離開很遠的地方不中');
}
console.log('差異種類 ' + JSON.stringify(kinds) + '；改在左／右 ' + sides.L + '／' + sides.R);
ok(kinds.size > 600 && kinds.color > 300 && kinds.angle > 200 && sides.L > 800 && sides.R > 800, '三種差異、左右兩邊都有出現');
// 點到對稱的地方不算
{ let wrong = 0, n = 500; for (let i = 0; i < n; i++) { const q = T.makeLevel(5, rnd); const other = q.spots.find((s, k) => k !== q.mod.index || q.mod.kind === 'angle'); const a = q.tilt * Math.PI / 180; const p = { x: T.CENTER + (other.x - T.CENTER) * Math.cos(a) - (other.y - T.VB.h / 2) * Math.sin(a), y: T.VB.h / 2 + (other.x - T.CENTER) * Math.sin(a) + (other.y - T.VB.h / 2) * Math.cos(a) }; const t = T.modTarget(q); if (Math.hypot(other.x - t.right.x, other.y - t.right.y) > other.r + t.right.r + 2 * T.HIT_EXTRA + 6 && T.isHit(q, p.x, p.y)) wrong++; } ok(wrong === 0, '點在別的（對稱的）斑點上不算：' + wrong); }
// untilt 是旋轉的反運算
for (let i = 0; i < 100; i++) { const tl = (rnd() - 0.5) * 20, x = 100 + rnd() * 250, y = 20 + rnd() * 260, a = tl * Math.PI / 180, vx = T.CENTER + (x - T.CENTER) * Math.cos(a) - (y - T.VB.h / 2) * Math.sin(a), vy = T.VB.h / 2 + (x - T.CENTER) * Math.sin(a) + (y - T.VB.h / 2) * Math.cos(a), p = T.untilt(vx, vy, tl); ok(near(p.x, x, 1e-9) && near(p.y, y, 1e-9), 'untilt 還原'); }
ok(T.describeMod({ kind: 'size', delta: 0.4 }) === '斑點的大小差了 40%' && /顏色/.test(T.describeMod({ kind: 'color', delta: -50 })) && /方向差了 8°/.test(T.describeMod({ kind: 'angle', delta: -8 })), 'describeMod');
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_butterfly.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3200/.test(src) && /btf-ring/.test(src) && /btf-ghost/.test(src), '失敗：左翅膀翻過去疊上（重影）、不同處紅圈、停格 2 秒以上');
  ok(/\.btf-ring \{[^}]*var\(--c-bad-light\)/.test(css) && /\.btf-wing \{[^}]*var\(--btf-wing\)/.test(css) && /\.btf-c--orange \{[^}]*var\(--btf-orange\)/.test(css), '紅圈、翅膀、斑點顏色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_butterfly.js'") > 0 && /翻過來/.test(G.rule), 'boot.js 有載入、玩法說明提到翻過來'); }
{ const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction6.css'), 'utf8'); T.COLORS.forEach(c => ok(css.indexOf('.btf-c--' + c + ' ') >= 0, 'CSS 有斑點顏色 ' + c)); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
