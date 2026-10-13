const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_area.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 五種形狀：給定目標面積，算出的形狀面積要等於它（多邊形用鞋帶公式、圓用 πr²）
for (const kind of T.KINDS) {
  for (const A of [6400, 8100, 10000, 13225]) {
    const sh = T.shapeOf(kind, A);
    ok(Math.abs(T.areaOf(sh) - A) < 1e-6 * A, kind + ' 面積 ' + A + ' → ' + T.areaOf(sh));
  }
}
// V1.25：題目圖形放上方並加大、答案方塊在下方；手柄是十字箭頭
for (const kind of T.KINDS) {
  const sh = T.shapeOf(kind, T.EQ_MAX * T.EQ_MAX), pts = kind === 'circle' ? [[-sh.r, -sh.r], [sh.r, sh.r]] : sh.pts;
  const xs = pts.map(p => T.SHAPE_C.x + p[0]), ys = pts.map(p => T.SHAPE_C.y + p[1]);
  ok(Math.min(...xs) >= 4 && Math.max(...xs) <= 468 && Math.min(...ys) >= 4, kind + ' 最大的圖形整個在畫面內：x ' + Math.min(...xs).toFixed(0) + '～' + Math.max(...xs).toFixed(0) + '，y ' + Math.min(...ys).toFixed(0) + '～' + Math.max(...ys).toFixed(0));
  ok(Math.max(...ys) < T.ANCHOR.y - 10, kind + ' 圖形在方塊的上方（不重疊）：圖形底 ' + Math.max(...ys).toFixed(0) + ' < 方塊頂 ' + T.ANCHOR.y);
}
ok(T.ANCHOR.y > T.SHAPE_C.y && T.SHAPE_C.x === 236, '題目圖形在上、答案方塊在下，圖形水平置中');
ok(T.ANCHOR.x + T.SQ_MAX + T.HANDLE / 2 <= 472 && T.ANCHOR.y + T.SQ_MAX + T.HANDLE / 2 <= 590, '方塊拉到最大、手柄也在畫面內（不蓋到「確定」按鈕）：右 ' + (T.ANCHOR.x + T.SQ_MAX + T.HANDLE / 2) + '，下 ' + (T.ANCHOR.y + T.SQ_MAX + T.HANDLE / 2));
ok(T.EQ_MIN >= 110 && T.EQ_MAX >= 140, '圖形比原本（80～115）大：' + T.EQ_MIN + '～' + T.EQ_MAX);
{ const p = T.arrowPoints(T.HANDLE); ok(p.length === 24 && Math.max(...p.map(q => q[0])) === T.HANDLE / 2 && Math.min(...p.map(q => q[1])) === -T.HANDLE / 2, '十字箭頭：24 個頂點、總寬 ' + T.HANDLE);
  ok(p.some(q => q[0] === 0 && q[1] === -T.HANDLE / 2) && p.some(q => q[0] === T.HANDLE / 2 && q[1] === 0) && p.some(q => q[0] === 0 && q[1] === T.HANDLE / 2) && p.some(q => q[0] === -T.HANDLE / 2 && q[1] === 0), '上下左右四個箭頭尖端'); }
// 出題：5000 題，形狀都出現、起始邊長離答案至少 25%、在可拖範圍內、答案邊長也在可拖範圍內
const seen = {}; let minDev = 9;
for (let i = 0; i < 5000; i++) {
  const c = T.makeRound(rnd); seen[c.kind] = (seen[c.kind] || 0) + 1;
  ok(c.sAns >= T.EQ_MIN - 1e-9 && c.sAns <= T.EQ_MAX + 1e-9 && Math.abs(c.sAns * c.sAns - c.A) < 1e-6, 'sAns²=A');
  ok(c.s0 >= T.SQ_MIN && c.s0 <= T.SQ_MAX, '起始邊長在範圍內 ' + c.s0);
  ok(c.sAns <= T.SQ_MAX && c.sAns >= T.SQ_MIN, '答案邊長在可拖範圍內');
  minDev = Math.min(minDev, Math.abs(c.s0 / c.sAns - 1));
}
ok(minDev >= 0.25 - 1e-9, '起始邊長離答案至少 25%：' + minDev);
ok(T.KINDS.every(k => seen[k] > 700), '五種形狀都常出現 ' + JSON.stringify(seen));
// 誤差：邊長剛好 → 0；面積多 10% → 10%
ok(T.errPct(100, 10000) === 0, '剛好');
ok(Math.abs(T.errPct(Math.sqrt(11000), 10000) - 10) < 1e-9, '多 10%');
ok(Math.abs(T.errPct(Math.sqrt(9000), 10000) - 10) < 1e-9, '少 10%');
ok(T.rating(0.1) !== T.rating(1) && T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(30), '評語分級');
// SCORE 範圍：最壞的誤差（方塊最大 170 對最小面積 6400）要在 max 以內
ok(T.errPct(T.SQ_MAX, T.EQ_MIN * T.EQ_MIN) <= G.score.max, '最壞誤差在排行榜範圍內');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
