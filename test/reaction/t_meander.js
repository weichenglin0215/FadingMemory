// kit.meander（js/reaction_kit4.js）：像手畫的蜿蜒曲線——整條在範圍內、不自己貼自己、起終點條件、圓弧有變化、可重現
const { rng, seedOf } = require('./load.js');
const kit = Reaction.kit;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 25) console.log('FAIL', m); } };
const rnd = rng(seedOf(20261104));
const base = { alt: 0.7, radius: [0.14, 0.34], arc: [60, 230], line: [0, 0.4], clear: 24, sep: 70, scale: [0.5, 2.4] };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);
// ── selfClear：手算的例子 ──
{ const mk = pts => { let s = 0; return pts.map((p, i) => { if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); return { x: p[0], y: p[1], s }; }); };
  const line = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  const U = mk(line([0, 0], [0, 200], 66).concat(line([0, 200], [10, 200], 3).slice(1)).concat(line([10, 200], [10, 0], 66).slice(1)));   // U 形，兩條邊相隔 10 像素
  ok(!kit.selfClear(U, 24, 70), '兩條邊只隔 10 像素 → 太近');
  const V = mk(line([0, 0], [0, 200], 66).concat(line([0, 200], [60, 200], 20).slice(1)).concat(line([60, 200], [60, 0], 66).slice(1)));
  ok(kit.selfClear(V, 24, 70), '兩條邊隔 60 像素 → 可以');
  const T2 = mk(line([0, 0], [100, 0], 33));
  ok(kit.selfClear(T2, 24, 70), '一條直線沒問題'); }
// ── 一般條件（各種彎數、各種長寬）──
const stat = {};
for (const [W, H] of [[152, 448], [173, 528], [182, 450], [120, 300]]) for (const k of [2, 3, 5, 7, 10]) {
  let made = 0; const N = 40;
  for (let i = 0; i < N; i++) {
    const line = Math.max(0.35, 0.9 * (H / W) / (k + 1)), o = Object.assign({}, base, { W, H, k, line: [0, line], margin: 4, ds: 3, tries: 300 }), pts = kit.meander(o, rnd);
    if (!pts) continue; made++;
    ok(pts.length > 20 && pts[0].s === 0, '點數、起點弧長 0');
    ok(pts.every(p => p.x >= 4 - 1e-6 && p.x <= W - 4 + 1e-6 && p.y >= 4 - 1e-6 && p.y <= H - 4 + 1e-6), '整條在範圍內（' + W + '×' + H + ' k' + k + '）');
    ok(pts.every((p, j) => j === 0 || p.s > pts[j - 1].s) && near(pts[pts.length - 1].s, pts.reduce((a, p, j) => j ? a + Math.hypot(p.x - pts[j - 1].x, p.y - pts[j - 1].y) : 0, 0), 1e-6), '弧長遞增、等於折線長度');
    ok(kit.selfClear(pts, 24, 70), '不自己貼自己');
    // 取樣間距約 ds
    let maxStep = 0; for (let j = 1; j < pts.length; j++) maxStep = Math.max(maxStep, Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y)); ok(maxStep < 3 * 1.6, '相鄰點最多相距 ' + maxStep.toFixed(2));
  }
  stat[W + 'x' + H + ' k' + k] = made / N;
}
console.log('做得出來的比例：' + Object.entries(stat).map(([k, v]) => k + ' ' + (100 * v).toFixed(0) + '%').join('，'));
ok(Object.entries(stat).filter(([k]) => /k(5|7)$/.test(k)).every(([, v]) => v >= 0.5), '彎數 5、7 的各種長寬，做得出來的比例都 ≥ 50%');
// ── 起終點條件 ends：起點在最上、終點在最下、都在左右正中央 ──
{ const W = 182, H = 450; let made = 0;
  for (let i = 0; i < 80; i++) {
    const pts = kit.meander(Object.assign({}, base, { W, H, k: 3 + (i % 5), line: [0, 0.5], margin: 8, ends: true, tries: 300 }), rnd); if (!pts) continue; made++;
    const a = pts[0], b = pts[pts.length - 1];
    ok(near(a.x, W / 2, 1e-6) && near(b.x, W / 2, 1e-6), '起點、終點在左右正中央：' + a.x.toFixed(2) + ', ' + b.x.toFixed(2));
    ok(a.y <= 8 + 0.05 * H + 1e-6 && b.y >= H - 8 - 0.05 * H - 1e-6, '起點在最上面、終點在最下面');
    ok(pts.every(p => p.x >= 8 - 1e-6 && p.x <= W - 8 + 1e-6), '剪切之後仍在範圍內');
    ok(kit.selfClear(pts, 24, 70), '剪切之後仍不自己貼自己');
  }
  ok(made > 30, 'ends 模式做得出來：' + made + '/80'); }
// ── 形狀有變化：不是工整的正弦波或直角 ──
{ const W = 152, H = 448; let climb = 0, made = 0, loop = 0, widths = [];
  for (let i = 0; i < 150; i++) {
    const o = Object.assign({}, base, { W, H, k: 6, alt: 0.6, line: [0, 0.4], margin: 4, tries: 300 }), pts = kit.meander(o, rnd); if (!pts) continue; made++;
    if (pts.some((p, j) => j > 6 && p.y < pts[j - 6].y - 4)) climb++;                            // 往上走的一段
    // 鉤子：某一小段（弧長 90 像素內）方向轉了 120 度以上＝急轉彎的大圓弧
    for (let j = 0; j < pts.length; j++) { let t0 = j; while (t0 < pts.length && pts[t0].s - pts[j].s < 90) t0++; if (t0 >= pts.length || t0 - j < 4) break; const m = Math.floor((j + t0) / 2), d = Math.atan2(pts[t0].y - pts[m].y, pts[t0].x - pts[m].x) - Math.atan2(pts[m].y - pts[j].y, pts[m].x - pts[j].x); if (Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) > Math.PI * 120 / 180) { loop++; break; } }
    widths.push(Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x)));
  }
  console.log('蜿蜒曲線：' + made + ' 條，有往上走一段的 ' + (100 * climb / made).toFixed(0) + '%，有急轉大圓弧的 ' + (100 * loop / made).toFixed(0) + '%，平均寬度 ' + (widths.reduce((a, b) => a + b, 0) / widths.length).toFixed(0) + '/' + W);
  ok(made > 100 && climb / made > 0.5, '常常會往上走一段（不是單向往下）：' + (climb / made).toFixed(2));
  ok(widths.reduce((a, b) => a + b, 0) / widths.length > 0.7 * W, '左右用滿大部分寬度'); }
// ── 可重現、做不出來回傳 null ──
{ const o = Object.assign({}, base, { W: 152, H: 448, k: 5, margin: 4, tries: 300 }), a = kit.meander(o, rng(seedOf(5))), b = kit.meander(o, rng(seedOf(5))); ok(a && b && a.length === b.length && a.every((p, i) => near(p.x, b[i].x) && near(p.y, b[i].y)), '同一個亂數種子，曲線一樣');
  ok(kit.meander(Object.assign({}, o, { W: 40, H: 448, k: 8, tries: 20 }), rnd) === null, '寬度小到放不下（曲線一定會貼到自己）→ null'); }
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
