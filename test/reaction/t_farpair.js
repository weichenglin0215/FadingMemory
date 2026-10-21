const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_farpair.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261021); const rnd = rng(SEED);

// 玩家自己調過 PAIRS／RATIO／ANS_S：測試跟著參數走
ok(T.pairsFor(1) === T.PAIRS[0] && T.pairsFor(T.PAIR_LEVELS) === T.PAIRS[1] && T.pairsFor(60) === T.PAIRS[1], '對數 ' + T.PAIRS);
ok(near(T.ratioFor(1), T.RATIO[0]) && near(T.ratioFor(T.RAMP_LEVELS), T.RATIO[1]) && near(T.ratioFor(60), T.RATIO[1]), '比例 ' + T.RATIO);
for (let l = 2; l <= 60; l++) ok(T.pairsFor(l) >= T.pairsFor(l - 1) && T.ratioFor(l) <= T.ratioFor(l - 1) + 1e-12 && (T.ANS_S[1] >= T.ANS_S[0] ? T.ansMs(l) >= T.ansMs(l - 1) : T.ansMs(l) <= T.ansMs(l - 1)), '單調 ' + l);
ok(T.ansMs(1) === T.ANS_S[0] * 1000 && T.ansMs(T.RAMP_LEVELS) === T.ANS_S[1] * 1000, '限時 ' + T.ANS_S + ' 秒');
// V1.29：顏色數一定夠用（對數最多 PAIRS[1] 對，每一對一種顏色），不然最後幾關出題會當機
ok(T.HUES.length >= T.PAIRS[1] && new Set(T.HUES.map(x => x.n)).size === T.HUES.length && new Set(T.HUES.map(x => x.h)).size === T.HUES.length, '顏色數 ' + T.HUES.length + ' ≥ 最多對數 ' + T.PAIRS[1]);
const W = 472, H = 630;
let sumBest = 0;
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, W, H, rnd);
  ok(q.pairs.length === T.pairsFor(lv), '對數 ' + lv + '：' + q.pairs.length);
  // 距離＝座標算出來的距離；最遠唯一、與第二遠的比例＝設定值
  const ds = q.pairs.map(p => Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y));
  q.pairs.forEach((p, k) => ok(near(ds[k], p.d, 1e-6), '距離一致'));
  const sorted = ds.slice().sort((a, b) => b - a);
  ok(ds[q.best] === sorted[0] && sorted[0] > sorted[1], '最遠唯一');
  if (lv < 100) ok(near(sorted[0] / sorted[1], T.ratioFor(lv), 1e-6) || q.pairs.length === 2 && false || near(sorted[0] / sorted[1], T.ratioFor(lv), 1e-6), '最遠÷第二遠＝設定比例 ' + lv + '：' + sorted[0] / sorted[1] + ' vs ' + T.ratioFor(lv));
  ok(sorted[sorted.length - 1] >= T.D_MIN - 1e-6, '最短距離');
  // 所有點在邊界內、彼此相距 ≥ MIN_GAP
  const pts = []; q.pairs.forEach(p => { pts.push(p.a, p.b); });
  pts.forEach((p, a) => { ok(p.x >= T.MARGIN - 1e-6 && p.x <= W - T.MARGIN + 1e-6 && p.y >= T.MARGIN - 1e-6 && p.y <= H - T.MARGIN + 1e-6, '在界內'); for (let b = a + 1; b < pts.length; b++) ok(Math.hypot(p.x - pts[b].x, p.y - pts[b].y) >= T.MIN_GAP - 1e-6, '點間距'); });
  // 顏色不重複
  ok(new Set(q.pairs.map(p => p.color)).size === q.pairs.length, '顏色不重複');
  sumBest += q.best;
}
// 最遠那一對的位置分布（洗牌後不是固定在第一個）
const bestPos = {}; for (let i = 0; i < 1500; i++) { const q = T.makeLevel(40, W, H, rnd); bestPos[q.best] = (bestPos[q.best] || 0) + 1; }
ok(Object.keys(bestPos).length === T.PAIRS[1] && Math.min(...Object.values(bestPos)) > 100, '最遠的位置均勻分布：' + JSON.stringify(bestPos));
// 方向：橫、直、斜都會出現（避免靠錯覺取巧）
let horiz = 0, vert = 0, diag = 0;
for (let i = 0; i < 2000; i++) { const q = T.makeLevel(20, W, H, rnd); const p = q.pairs[q.best]; const a = Math.abs(Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x)) * 180 / Math.PI; if (a < 20 || a > 160) horiz++; else if (a > 70 && a < 110) vert++; else diag++; }
ok(horiz > 100 && vert > 100 && diag > 600, '方向分布 ' + horiz + '/' + vert + '/' + diag);
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
// V1.29：一對圓點一大一小——起點維持原大小、終點縮成 1/3；命中半徑不變
ok(T.DOT_R === 20 && T.DOT_R2 < T.DOT_R && T.DOT_R2 > 0 && T.dotR('a') === T.DOT_R && T.dotR('b') === T.DOT_R2, '起點 ' + T.DOT_R + '、終點 ' + T.DOT_R2.toFixed(2) + '（' + (T.DOT_R2 / T.DOT_R).toFixed(2) + ' 倍；使用者調過，測試跟著走）');
ok(T.HIT_R === 40, '命中半徑維持 40（小點也好點）');
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_farpair.js'), 'utf8');
  ok(src.indexOf('r: dotR(k)') > 0, '畫圓點時用 dotR(起點／終點)'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
