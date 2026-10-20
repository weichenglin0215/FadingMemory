// 洗盤子（dishes，企劃 386 依使用者修改：洗乾淨自動換盤）的純函式檢查：難度線性、盤子的產生（污漬不重疊、在盤子裡）、刷的算法、洗乾淨的判定、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_dishes.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261213), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性，依洗了幾個盤子）──
ok(T.spotsFor(0) === T.SPOTS[0] && T.spotsFor(T.RAMP_PLATES) === T.SPOTS[1] && T.spotsFor(999) === T.SPOTS[1], '污漬數 ' + T.SPOTS);
ok(near(T.spotRFor(0), T.SPOT_R[0]) && near(T.spotRFor(T.RAMP_PLATES), T.SPOT_R[1]), '污漬半徑 ' + T.SPOT_R);
ok(T.needFor(0) === T.NEED[0] && T.needFor(T.RAMP_PLATES) === T.NEED[1], '要刷的距離 ' + T.NEED);
ok(near(T.visFor(0), T.VIS[0]) && near(T.visFor(T.RAMP_PLATES), T.VIS[1]), '污漬濃度 ' + T.VIS);
ok(T.patsFor(0) === T.PATS[0] && T.patsFor(T.RAMP_PLATES) === T.PATS[1], '花紋數 ' + T.PATS);
ok(T.simFor(0) === 0 && T.simFor(T.RAMP_PLATES) === T.SIM_MAX && T.simFor(999) === T.SIM_MAX, '花紋顏色級數 0 → ' + T.SIM_MAX);
for (let n = 1; n <= T.RAMP_PLATES + 2; n++) ok(T.spotsFor(n) >= T.spotsFor(n - 1) && T.spotRFor(n) <= T.spotRFor(n - 1) && T.needFor(n) >= T.needFor(n - 1) && T.visFor(n) <= T.visFor(n - 1) && T.patsFor(n) >= T.patsFor(n - 1) && T.simFor(n) >= T.simFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 1; n <= T.RAMP_PLATES; n++) d.push(T.needFor(n) - T.needFor(n - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '要刷的距離線性增加：每個盤子 +' + Math.min(...d) + '～+' + Math.max(...d)); }
{ const lv = []; for (let n = 0; n <= T.RAMP_PLATES; n++) lv.push(T.simFor(n)); ok(new Set(lv).size === T.SIM_MAX + 1, '四個級數都出現過：' + lv.join('')); }

// ── 產生盤子：全部難度掃一遍 ──
const ST = { n: 0, minGap: 1e9, edge: 0, maxNeed: 0 }; let shr = 9;
for (let n = 0; n <= 40; n++) for (let rep = 0; rep < 100; rep++) {
  const p = T.makePlate(n, rnd); ST.n++;
  ok(p.spots.length === T.spotsFor(n), '污漬塊數 ' + p.spots.length + ' = ' + T.spotsFor(n) + '（第 ' + n + ' 個）');
  ok(near(p.vis, T.visFor(n)) && p.sim === T.simFor(n) && p.n === n, '濃度與花紋級數');
  p.spots.forEach((s, i) => {
    ok(Math.hypot(s.x, s.y) + s.r <= T.PLATE_R - T.EDGE_PAD + 0.35, '污漬完全在盤子裡（離盤心 ' + Math.hypot(s.x, s.y).toFixed(0) + '＋半徑 ' + s.r + '）'); ST.edge = Math.max(ST.edge, Math.hypot(s.x, s.y) + s.r);
    ok(s.r >= T.spotRFor(n) * 0.5 * 0.85 - 0.1 && s.r <= T.spotRFor(n) * 1.05 + 0.1, '污漬半徑在範圍內（擠不下時最多縮到 55%）'); shr = Math.min(shr, s.r / T.spotRFor(n));
    ok(s.need >= T.needFor(n) * 0.85 - 1 && s.need <= T.needFor(n) * 1.15 + 1, '每塊要刷的距離在 ±15% 內'); ST.maxNeed = Math.max(ST.maxNeed, s.need);
    ok(s.v === 1 && s.blob.length === 3, '一開始是髒的、有 3 團形狀');
    for (let j = i + 1; j < p.spots.length; j++) { const t = p.spots[j], gap = Math.hypot(s.x - t.x, s.y - t.y) - s.r - t.r; ST.minGap = Math.min(ST.minGap, gap); ok(gap >= T.MIN_GAP - 0.35, '兩塊污漬不重疊（座標四捨五入到 0.1）（邊距 ' + gap.toFixed(1) + '）'); }
  });
  ok(p.pats.length === T.patsFor(n) + 1 && p.pats[p.pats.length - 1].kind === 'flower', '花紋數 ＋ 盤心的一朵花');
  ok(p.pats.slice(0, -1).every(q => Math.abs(Math.hypot(q.x, q.y) - 120) < 0.2) && p.pats.every(q => ['petal', 'dot', 'arc', 'flower'].includes(q.kind)), '花紋沿著盤緣排一圈');
}
console.log('污漬半徑最小是「該有的半徑」的 ' + (100 * shr).toFixed(0) + '%（擠不下才會縮）'); ok(shr >= 0.5 * 0.85 - 1e-9, '縮小的幅度有限');
console.log('共 ' + ST.n + ' 個盤子；污漬最貼近的邊距 ' + ST.minGap.toFixed(1) + '、最靠近盤緣 ' + ST.edge.toFixed(0) + '／' + (T.PLATE_R - T.EDGE_PAD));
// 每一塊污漬的位置在盤子裡分布平均（不是都擠在中間）
{ let inner = 0, outer = 0; for (let i = 0; i < 400; i++) T.makePlate(10, rnd).spots.forEach(s => { if (Math.hypot(s.x, s.y) < 50) inner++; else outer++; }); ok(outer > inner * 0.8, '污漬不會都擠在中間：內圈 ' + inner + '、外圈 ' + outer); }

// ── 刷 ──
{ const p = { spots: [{ x: 0, y: 0, r: 40, need: 400, v: 1 }, { x: 150, y: 0, r: 40, need: 400, v: 1 }] };
  ok(T.scrub(p, 0, 0, 100) === false && near(p.spots[0].v, 0.75) && p.spots[1].v === 1, '刷一下：在污漬上減少 len/need，別的污漬不受影響');
  T.scrub(p, 0 + 40 + T.BRUSH_R, 0, 100); ok(near(p.spots[0].v, 0.5), '刷子半徑內（污漬邊緣 ＋ BRUSH_R）也算刷到');
  T.scrub(p, 0 + 40 + T.BRUSH_R + 0.5, 0, 100); ok(near(p.spots[0].v, 0.5), '再遠一點就刷不到');
  T.scrub(p, 0, 80, 100); ok(near(p.spots[0].v, 0.5) && p.spots[1].v === 1, '離污漬很遠的刷（刷花紋、刷空白）完全沒有效果');
  ok(T.scrub(p, 0, 0, 10000) === false && p.spots[0].v === 0 && T.isClean(p) === false && T.remaining(p).length === 1, '一塊洗掉之後還沒全乾淨');
  ok(T.scrub(p, 150, 0, 380) === false && near(p.spots[1].v, 0.05, 1e-9), '還剩 5%（> CLEAN_EPS ' + T.CLEAN_EPS + '）不算乾淨');
  ok(T.scrub(p, 150, 0, 10) === true && T.isClean(p) && T.remaining(p).length === 0, '再刷一下剩下的就低於 ' + T.CLEAN_EPS + '：全部洗乾淨');
  const q = { spots: [{ x: 0, y: 0, r: 40, need: 400, v: 0.02 }] }; ok(T.isClean(q) && T.scrub(q, 0, 0, 1) === true, '低於 CLEAN_EPS 就算乾淨'); }
// 相鄰的兩塊污漬：刷子同時刷到兩塊（半徑重疊）
{ const p = { spots: [{ x: 0, y: 0, r: 30, need: 300, v: 1 }, { x: 70, y: 0, r: 30, need: 300, v: 1 }] }; T.scrub(p, 35, 0, 150); ok(near(p.spots[0].v, 0.5) && near(p.spots[1].v, 0.5), '兩塊相鄰的污漬同時被刷到'); }

// ── 純模擬：一個「刷子」沿著每塊污漬畫圈刷；算每個盤子需要多少時間（手指速度 700 px/s）──
function timeFor(n) { const p = T.makePlate(n, rnd); let dist = 0, x = 0, y = 0; const speed = 700;
  p.spots.slice().sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)).forEach(s => { dist += Math.hypot(s.x - x, s.y - y); x = s.x; y = s.y; let a = 0, guard = 0; while (s.v > T.CLEAN_EPS && guard++ < 100000) { const step = 8, nx = s.x + 12 * Math.cos(a), ny = s.y + 12 * Math.sin(a); const len = Math.hypot(nx - x, ny - y); T.scrub(p, nx, ny, len); dist += len; x = nx; y = ny; a += step / 12; } });
  return { t: dist / speed, clean: T.isClean(p), dist }; }
{ const rows = []; for (const n of [0, 6, 12, 18, 24, 40]) { let tot = 0, ok2 = 0, K = 40; for (let i = 0; i < K; i++) { const r = timeFor(n); tot += r.t; if (r.clean) ok2++; } rows.push(n + ':' + (tot / K).toFixed(2) + '秒'); ok(ok2 === K, '第 ' + n + ' 個盤子刷得乾淨'); }
  console.log('以 700 px/s 的手指速度，一個盤子大約要：' + rows.join('、')); }
{ // 時間預算：30 秒內，剛開始的盤子很快，後面的越來越久；到頂的盤子一個大約 4～12 秒
  let a = 0, b = 0, K = 60; for (let i = 0; i < K; i++) { a += timeFor(0).t; b += timeFor(T.RAMP_PLATES).t; } a /= K; b /= K; ok(a < 3 && b > 3.5 && b < 14 && b > a * 2, '開頭的盤子 ' + a.toFixed(2) + ' 秒、到頂的盤子 ' + b.toFixed(2) + ' 秒（越後面越久）');
  // 估成績：用同樣的速度一直洗到 30 秒
  let t = 0, n = 0; while (t < T.TIME_S) { t += timeFor(n).t + 0.35; if (t <= T.TIME_S) n++; } console.log('理想玩家（700 px/s、不浪費時間）30 秒大約洗 ' + n + ' 個盤子'); ok(n >= 6 && n <= 40, '成績範圍合理：' + n); }
// 刷花紋沒有用：整個盤子刷花紋的位置（盤緣一圈）一萬 px，污漬完全不變
{ const p = T.makePlate(15, rnd), before = p.spots.map(s => s.v); let clean = false; for (let i = 0; i < 400; i++) { const a = i / 400 * 6.283 * 3, x = 126 * Math.cos(a), y = 126 * Math.sin(a); if (p.spots.every(s => Math.hypot(x - s.x, y - s.y) > s.r + T.BRUSH_R)) clean = T.scrub(p, x, y, 25) || clean; } ok(p.spots.every((s, i) => s.v === before[i]) && !clean, '在盤緣一直刷（只碰到花紋）污漬不會變'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_dishes.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/function washed\(\)/.test(src) && /newPlate\(false\)/.test(src) && /NEXT_MS/.test(src) && !/按鈕/.test(src.split('var G = {')[1].split("rule:")[0]), '洗乾淨會自動換下一個盤子（washed → newPlate），不需要按鈕');
  ok(/api\.timer\(TIME_S \* 1000/.test(src) && /api\.fail\(\{ delay: 3800/.test(src) && /dsh-ring/.test(src) && /remaining\(plate\)/.test(src), '全部限時 30 秒；時間到：沒洗掉的污漬畫紅圈、停格夠久');
  ok(/scrub\(plate, p\.x, p\.y, len\)/.test(src) && /pointerdown/.test(src) && /pointermove/.test(src) && /scoreOf/.test(src) && /resume: false/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '刷用 scrub；成績用 scoreOf；solve／wrong');
  ok(/\.dsh-spot \{[^}]*var\(--dsh-sauce\)/.test(css) && /\.dsh-pat3 \{[^}]*var\(--dsh-pat3\)/.test(css) && /\.dsh-plate \{[^}]*var\(--dsh-plate\)/.test(css), '污漬、花紋、盤子用 CSS 變數');
  // 花紋第 3 級的顏色和污漬很接近（色相差 ≤ 8°），第 0 級差很多
  const theme = rd('../../css/theme.css'), hue = n => +new RegExp('--dsh-' + n + ': hsl\\((\\d+)').exec(theme)[1];
  ok(Math.abs(hue('pat3') - hue('sauce')) <= 8 && Math.abs(hue('pat0') - hue('sauce')) > 100, '最後一級花紋的顏色跟污漬接近、第 0 級是藍色（色相 ' + [hue('pat0'), hue('pat1'), hue('pat2'), hue('pat3'), hue('sauce')].join('/') + '）');
  ok(boot.indexOf("'js/reaction_dishes.js'") > 0 && /自動換下一個盤子/.test(G.rule) && /青花紋/.test(G.rule), 'boot.js 有載入、玩法說明提到自動換盤與青花紋'); }
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
