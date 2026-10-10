const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_copycurve.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261033); const rnd = rng(SEED);

// 難度：要求的相似度與限時線性
ok(near(T.reqSim(1), 72) && near(T.reqSim(T.RAMP_LEVELS), 92) && near(T.reqSim(60), 92), '要求 72 → 92％');
ok(T.timeMs(1) === 40000 && T.timeMs(T.RAMP_LEVELS) === 22000, '限時 40 → 22 秒');
for (let l = 2; l <= 60; l++) ok(T.reqSim(l) >= T.reqSim(l - 1) - 1e-12 && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
ok(near(T.reqSim(13) - 82, 0, 1e-9), '中點（線性）');
// 曲線種類隨關卡解鎖
ok(T.typesFor(1).join() === 'scurve' && T.typesFor(3).join() === 'scurve,wave' && T.typesFor(7).includes('right') && T.typesFor(10).includes('bolt') && !T.typesFor(10).includes('scurve') && T.typesFor(13).includes('spiral') && T.typesFor(16).includes('clip') && !T.typesFor(15).includes('clip'), '種類解鎖');
// 幾何函式
ok(near(T.polyLen([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]), 11), 'polyLen');
{ const r = T.resample([{ x: 0, y: 0 }, { x: 100, y: 0 }], 11); ok(r.length === 11 && near(r[0].x, 0) && near(r[10].x, 100) && near(r[5].x, 50, 1e-6), 'resample 等距'); }
{ const d = T.densify([{ x: 0, y: 0 }, { x: 10, y: 0 }], 3); ok(d.length === 5 && near(d[4].x, 10), 'densify'); }
ok(near(T.distToPoly({ x: 5, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }]), 3) && near(T.distToPoly({ x: 14, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }]), 5), 'distToPoly');
// 螺旋：起點在外圈（半徑 76）、終點在圓心（半徑 7）
for (let i = 0; i < 20; i++) { const sp = T.genSpiral(rnd(), rnd); const f = sp[0], l = sp[sp.length - 1]; ok(Math.hypot(f.x, f.y) > 70 && Math.hypot(l.x, l.y) < 10, '螺旋起點外圈終點中心'); }
// 迴紋針：一條不自交的長線，大小合理
{ const c = T.genClip(); ok(c.length > 100, '迴紋針點數'); const pts = T.fit(c); ok(T.polyLen(pts) > 900 && T.polyLen(pts) < 1400, '迴紋針長度 ' + T.polyLen(pts).toFixed(0)); }
// 整批曲線驗證
const seen = {}; let prevT = null, consecSame = 0;
for (let i = 0; i < 4000; i++) {
  const lv = 1 + (i % 60), q = T.makeCurve(lv, rnd, prevT);
  seen[q.type] = (seen[q.type] || 0) + 1;
  ok(T.typesFor(lv).includes(q.type), '種類在解鎖範圍 ' + q.type + ' lv' + lv);
  ok(q.pts.length > 50 && q.pts.every(p => isFinite(p.x) && isFinite(p.y)), '點數與有限');
  ok(q.pts.every(p => p.x >= T.MG - 1 && p.x <= T.PW - T.MG + 1 && p.y >= T.MG - 1 && p.y <= T.PH - T.MG + 1), '全部點在長方格內（含邊界 1 像素誤差）：' + q.type);
  ok(Math.hypot(q.start.x - q.end.x, q.start.y - q.end.y) >= T.MIN_SEP - 1e-6, '起點終點相距 ≥ ' + T.MIN_SEP + '：' + q.type);
  ok(q.len >= T.LEN_RANGE[0] && q.len <= T.LEN_RANGE[1], '長度範圍 ' + q.len.toFixed(0));
  ok(q.start === q.pts[0] && q.end === q.pts[q.pts.length - 1], '起點終點就是頭尾');
  // 相鄰點間距不超過 STEP＋一點點
  let maxGap = 0; for (let k = 1; k < q.pts.length; k++) maxGap = Math.max(maxGap, Math.hypot(q.pts[k].x - q.pts[k - 1].x, q.pts[k].y - q.pts[k - 1].y)); ok(maxGap <= 3.01, '點距 ≤ 3：' + maxGap);
  if (prevT === q.type && T.typesFor(lv).length > 1) consecSame++;
  prevT = lv === 60 ? null : q.type;
}
ok(Object.keys(seen).length === 6, '六種曲線都出現過：' + JSON.stringify(seen));
ok(consecSame === 0, '有多種可選時不會連續兩關同一種：' + consecSame);
// 相似度的性質
for (let i = 0; i < 300; i++) {
  const lv = 1 + (i % 40), q = T.makeCurve(lv, rnd);
  const same = T.similarity(q.pts, q.pts), rev = T.similarity(q.pts, q.pts.slice().reverse());
  ok(near(same, 100, 1e-9) && near(rev, 100, 1e-9), '相同曲線 100％、反向畫也是 100％');
  // 平移 6 像素：平均距離 ≤ 6 → 相似度 ≥ 85
  const shifted = q.pts.map(p => ({ x: p.x + 6, y: p.y }));
  ok(T.similarity(q.pts, shifted) >= 100 * (1 - 6 / T.D0) - 1e-6, '平移 6 像素相似度 ≥ 85：' + T.similarity(q.pts, shifted).toFixed(2));
  // 手抖：每個點隨機 ±2.5 像素：相似度 > 90
  const jit = q.pts.filter((p, k) => k % 3 === 0).map(p => ({ x: p.x + (rnd() - 0.5) * 5, y: p.y + (rnd() - 0.5) * 5 }));
  ok(T.similarity(q.pts, jit) > 90, '輕微抖動仍 > 90：' + T.similarity(q.pts, jit).toFixed(2) + ' ' + q.type);
  // 故意亂畫（偵錯用的 wrong 路徑）一定過不了第 1 關的要求
  const badp = T.densify([q.start, { x: T.PW - 6, y: T.PH / 2 }, { x: 6, y: T.PH - 6 }, q.end], 3);
  ok(T.similarity(q.pts, badp) < T.reqSim(1) - 5 || q.type === 'scurve' && T.similarity(q.pts, badp) < T.reqSim(1), '亂畫過不了：' + T.similarity(q.pts, badp).toFixed(1) + ' ' + q.type);
}
// 難度：複雜曲線隨便畫一條直線過不了（第 7 關起的曲線，直線相似度 < 要求）
let lineFail = 0, lineTot = 0;
for (let i = 0; i < 1500; i++) {
  const lv = 7 + (i % 54), q = T.makeCurve(lv, rnd), line = T.densify([q.start, q.end], 3);
  lineTot++; if (T.similarity(q.pts, line) < T.reqSim(lv)) lineFail++;
}
ok(lineFail / lineTot > 0.97, '第 7 關起的曲線，直線過不了：' + (lineFail / lineTot).toFixed(3));
// 算得夠快（一次相似度要在 5 毫秒內，遊戲才不會卡）
{ const q = T.makeCurve(25, rnd); const t0 = Date.now(); for (let i = 0; i < 100; i++) T.similarity(q.pts, q.pts); ok((Date.now() - t0) / 100 < 5, '相似度計算夠快'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(8) && T.rating(8) !== T.rating(14) && T.rating(14) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
