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
  ok(Math.min(...xs) >= 4 && Math.max(...xs) <= 468 && Math.min(...ys) >= 0, kind + ' 最大的圖形整個在畫面內：x ' + Math.min(...xs).toFixed(0) + '～' + Math.max(...xs).toFixed(0) + '，y ' + Math.min(...ys).toFixed(0) + '～' + Math.max(...ys).toFixed(0));
  ok(Math.max(...ys) < T.ANCHOR.y, kind + ' 圖形在方塊的上方（不重疊）：圖形底 ' + Math.max(...ys).toFixed(0) + ' < 方塊頂 ' + T.ANCHOR.y);
}
ok(T.ANCHOR.y > T.SHAPE_C.y && Math.abs(T.SHAPE_C.x - 236) <= 20, '題目圖形在上、答案方塊在下，圖形大致水平置中（玩家自己微調過位置）');
ok(T.ANCHOR.x + T.SQ_MAX + T.HANDLE / 2 <= 472 && T.ANCHOR.y + T.SQ_MAX + T.HANDLE / 2 <= 640, '方塊拉到最大、手柄也在畫面內（不蓋到「確定」按鈕）：右 ' + (T.ANCHOR.x + T.SQ_MAX + T.HANDLE / 2) + '，下 ' + (T.ANCHOR.y + T.SQ_MAX + T.HANDLE / 2));
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
// V1.27：揭曉後的面積差數字動畫（0 → 最後的 ±XX.XXXX%），停住後再維持 2 秒才結算
ok(T.fmtDiff(0) === '0.0000%' && T.fmtDiff(12.34567) === '12.3457%' && T.fmtDiff(-3.5) === '-3.5000%', '數字格式：正數不加號、負數加負號 ' + T.fmtDiff(12.34567) + ' ' + T.fmtDiff(-3.5));
ok(Math.abs(T.signedPct(Math.sqrt(11000), 10000) - 10) < 1e-9 && Math.abs(T.signedPct(Math.sqrt(9000), 10000) + 10) < 1e-9 && T.signedPct(100, 10000) === 0, '有號面積差：多 10% ＝ +10、少 10% ＝ −10');
for (let i = 0; i < 300; i++) { const c = T.makeRound(rnd), s = c.s0; ok(Math.abs(Math.abs(T.signedPct(s, c.A)) - T.errPct(s, c.A)) < 1e-9, '絕對值 ＝ errPct'); }
ok(T.HOLD_MS === 2000 && T.COUNT_MS >= 1500, '數字動畫之後維持 2 秒：' + T.HOLD_MS + '／' + T.COUNT_MS);
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_area.js'), 'utf8');
  ok(src.indexOf('my.tween(COUNT_MS') > src.indexOf('gSq.setAttribute') && src.indexOf('my.after(HOLD_MS') > src.indexOf('my.tween(COUNT_MS'), '先移動疊合 → 數字動畫 → 停住 2 秒 → 結算'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
