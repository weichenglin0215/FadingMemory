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
// 十字、L 形的外形大小要放得進左半邊（形狀中心在 x=122，左半邊寬 236）
for (const kind of T.KINDS) {
  const sh = T.shapeOf(kind, T.EQ_MAX * T.EQ_MAX);
  const ext = sh.kind === 'circle' ? sh.r : Math.max.apply(null, sh.pts.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1]))));
  ok(ext < 118, kind + ' 最大面積時外形半徑 ' + ext.toFixed(1) + ' 應該放得進左半邊');
}
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
