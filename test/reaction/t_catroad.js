// 貓咪走山路：難度曲線、山路生成的連續性與邊界、掉下去的判定、機器人能不能一路走到最難
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_catroad.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const W = 472, SEED = seedOf(20261010), rnd = rng(SEED);
// 難度曲線：線性、到頂後維持
const d0 = T.difficulty(0), dm = T.difficulty(T.T_RAMP / 2), d1 = T.difficulty(T.T_RAMP), d2 = T.difficulty(1000);
ok(Math.abs(d0.speed - 110) < 1e-9 && Math.abs(d1.speed - 340) < 1e-9 && Math.abs(d0.hw - 104) < 1e-9 && Math.abs(d1.hw - 36) < 1e-9, '起點與終點 速度 110→340、半寬 104→36');
ok(Math.abs(dm.speed - 225) < 1e-6 && Math.abs(dm.hw - 70) < 1e-6 && Math.abs(dm.slope - 0.6) < 1e-6 && Math.abs(dm.seg - 210) < 1e-6, '中點是線性中間值');
ok(d2.speed === d1.speed && d2.hw === d1.hw && d2.slope === d1.slope, '到頂後維持');
for (let t = 0; t < 89; t += 3) { const a = T.difficulty(t), b = T.difficulty(t + 3); ok(b.speed > a.speed && b.hw < a.hw && b.slope > a.slope && b.seg < a.seg && b.wvar > a.wvar, '越來越難 t=' + t); }
// 山路生成：一路從 0 秒走到 150 秒，每一點都合理
const stats = { maxStep: 0, minW: 1e9, maxLat: 0 };
for (let run = 0; run < 12; run++) {
  const road = T.newRoad(W, rnd);
  let s = 0, t = 0;
  while (t < 150) { t += 0.016; s += T.difficulty(t).speed * 0.016; T.extendRoad(road, s + 900, t); }
  for (let i = 0; i < road.pts.length; i++) {
    const p = road.pts[i];
    ok(p.hw >= T.HW[1] * 0.7 - 1e-6 && p.hw <= T.HW[0] * 1.3 + 1e-6, '半寬在合理範圍：' + p.hw);
    ok(p.c - p.hw >= T.EDGE_PAD - 1e-6 && p.c + p.hw <= W - T.EDGE_PAD + 1e-6, '山路不超出畫面 i=' + i + ' c=' + p.c.toFixed(1) + ' hw=' + p.hw.toFixed(1));
    if (i) { const dc = Math.abs(p.c - road.pts[i - 1].c); stats.maxStep = Math.max(stats.maxStep, dc / T.STEP); }
    stats.minW = Math.min(stats.minW, 2 * p.hw);
  }
  // 橫向要追的速度：斜率 × 捲動速度（最難時 ≤ 0.95 × 340 ≈ 323 px／秒）
  stats.maxLat = Math.max(stats.maxLat, stats.maxStep * 340);
}
ok(stats.maxStep <= T.SLOPE[1] + 1e-6, '中心線斜率不超過上限 ' + stats.maxStep.toFixed(3));
ok(stats.minW >= 2 * T.HW[1] * 0.7 - 1e-6 && stats.minW < 2 * T.HW[1] * 1.1, '最窄的地方約 ' + stats.minW.toFixed(1) + ' px');
// 一開始的一段筆直寬路
{ const road = T.newRoad(W, rnd); T.extendRoad(road, 800, 0); for (let i = 0; i < 60; i++) ok(Math.abs(road.pts[i].c - W / 2) < 1e-9 && Math.abs(road.pts[i].hw - T.HW[0]) < 1e-9, '前 360px 筆直寬路 i=' + i); }
// roadAt 內插與 fallen 判定
{ const road = { pts: [{ c: 100, hw: 50 }, { c: 160, hw: 30 }], rand: Math.random, W };
  const m = T.roadAt(road, T.STEP / 2); ok(Math.abs(m.c - 130) < 1e-9 && Math.abs(m.hw - 40) < 1e-9, 'roadAt 線性內插');
  ok(!T.fallen(road, 0, 100) && !T.fallen(road, 0, 150) && T.fallen(road, 0, 150.01) && T.fallen(road, 0, 49.9), 'fallen：中心離中心線超過半寬才算掉下去');
  ok(T.roadAt(road, 99999).c === 160 && T.roadAt(road, -5).c === 100, '超出範圍取兩端'); }
// 機器人：橫向速度有限（BOT_V px／秒）、往前看 look px（不能看太遠：最陡的路 0.95 × 40px 就偏掉 38px，超過最窄的半寬），跟著中心線走 150 秒。BOT_V 要夠大（最難時需要 ≈ 323 px／秒）才走得過去
function bot(botV, look, seconds, seed) {
  const r = rng(seed), road = T.newRoad(W, r);
  let s = 0, t = 0, x = W / 2;
  while (t < seconds) {
    const dt = 0.016; t += dt; s += T.difficulty(t).speed * dt; T.extendRoad(road, s + 900, t);
    const want = T.roadAt(road, s + look).c, mv = botV * dt, dx = want - x;
    x += Math.abs(dx) <= mv ? dx : Math.sign(dx) * mv;
    if (T.fallen(road, s, x)) return t;
  }
  return Infinity;
}
let died = 0; for (let k = 0; k < 8; k++) if (bot(650, 8, 150, 100 + k) !== Infinity) died++;
ok(died === 0, '橫向速度 650 px／秒的機器人能撐過 150 秒（最難設定）：死了 ' + died + ' 次');
let slowDied = 0, slowT = 0; for (let k = 0; k < 8; k++) { const r = bot(120, 8, 150, 200 + k); if (r !== Infinity) { slowDied++; slowT += r; } }
ok(slowDied >= 6, '橫向速度只有 120 px／秒的機器人撐不到最後（難度是真的會拉開差距）：死了 ' + slowDied + ' 次，平均 ' + (slowT / Math.max(1, slowDied)).toFixed(1) + ' 秒');
console.log('山路統計：最大斜率 ' + stats.maxStep.toFixed(3) + '、最窄 ' + stats.minW.toFixed(1) + ' px；慢機器人平均死在 ' + (slowT / Math.max(1, slowDied)).toFixed(1) + ' 秒');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
