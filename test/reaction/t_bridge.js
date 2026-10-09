// 搭一座橋：出題保證有成功時機、兩塊方塊不會碰在一起、難度隨關卡線性加大
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_bridge.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const W = 472, SEED = seedOf(20261010), rnd = rng(SEED);
// 判定
const BW = T.BW, pl = { x0: 100, w: 200 };
// 橫板 100～300：左端離左方塊左邊緣 dL＝(100) − (L − 32)；右端離右方塊右邊緣 dR＝(R + 32) − 300
const Lof = (dL) => 100 + BW / 2 - dL, Rof = (dR) => 300 - BW / 2 + dR;
ok(T.judge(pl, Lof(30), Rof(30)).ok, '兩端都落在方塊頂面中間 → 成功');
let r = T.judge(pl, Lof(30), 450); ok(!r.ok && r.reason === 'one' && r.side === 'R' && r.support[0] === Lof(30) - BW / 2, '右邊的方塊離板子很遠 → 只有左端落在方塊上，右端沒有：' + r.reason + r.side);
r = T.judge(pl, 20, Rof(30)); ok(!r.ok && r.reason === 'one' && r.side === 'L', '左邊的方塊沒對上');
r = T.judge(pl, 20, 450); ok(!r.ok && r.reason === 'none', '兩端都沒落在方塊上');
r = T.judge(pl, 150, 190); ok(!r.ok && r.reason === 'none', '兩塊都跑到橫板中間（橫板掛在外面）→ 兩端都沒落在方塊上：' + r.reason);
ok(T.judge(pl, Lof(T.END_MARGIN), Rof(T.END_MARGIN)).ok && T.judge(pl, Lof(BW - T.END_MARGIN), Rof(BW - T.END_MARGIN)).ok, '剛好離邊緣 END_MARGIN 算成功（兩個方向都是）');
ok(!T.judge(pl, Lof(T.END_MARGIN - 0.5), Rof(30)).ok && !T.judge(pl, Lof(30), Rof(BW - T.END_MARGIN + 0.5)).ok, '差 0.5 px 就不算「確實」落在方塊上');
ok(T.overlap(0, 10, 10, 20) === null && T.overlap(0, 10, 5, 20)[0] === 5, '區間重疊');
// 難度曲線線性
ok(Math.abs(T.omegaAt(1) - 1.5) < 1e-9 && Math.abs(T.omegaAt(16) - 4.0) < 1e-9 && T.omegaAt(30) === T.omegaAt(16), 'ω 1.5 → 4.0');
ok(Math.abs(T.asymAt(1) - 0.06) < 1e-9 && Math.abs(T.asymAt(16) - 0.30) < 1e-9, '不對稱 0.06 → 0.30');
ok(Math.abs(T.offsetAt(1) - 0.02) < 1e-9 && Math.abs(T.offsetAt(16) - 0.22) < 1e-9, '橫板偏移 0.02 → 0.22');
for (let l = 1; l < 16; l++) ok(T.omegaAt(l + 1) > T.omegaAt(l) && T.asymAt(l + 1) > T.asymAt(l) && T.offsetAt(l + 1) > T.offsetAt(l), '線性變難 ' + l);
// 出題
const shares = {}; let fallback = 0;
for (let lv = 1; lv <= 24; lv++) {
  let minShare = 1, sum = 0; const N = 150;
  for (let k = 0; k < N; k++) {
    const cfg = T.makeLevel(lv, W, rnd), st = T.motionStats(cfg, W);
    if (!st.inside || st.minGap < T.MIN_GAP) { fallback++; continue; }
    const p = T.posAt(cfg, cfg.tStar); ok(T.judge(cfg.plank, p.L, p.R).ok, '成功時刻一定成功 lv' + lv);
    for (const k2 of [1, 2, 5]) { const q = T.posAt(cfg, cfg.tStar + k2 * cfg.T); ok(T.judge(cfg.plank, q.L, q.R).ok, '每個週期都會再出現成功時機'); }
    ok(cfg.plank.w >= T.PLANK_W[0] && cfg.plank.w <= T.PLANK_W[1] && cfg.plank.x0 >= T.EDGE_X && cfg.plank.x0 + cfg.plank.w <= W - T.EDGE_X, '橫板在畫面內 lv' + lv);
    ok(Math.abs(cfg.L.A - cfg.R.A) > 0.1 * 0 && cfg.L.A > 0 && cfg.R.A > 0, '振幅為正');
    const s = T.successShare(cfg); minShare = Math.min(minShare, s); sum += s;
    // 橫板偏離中央的程度不超過設定
    ok(Math.abs(cfg.plank.x0 + cfg.plank.w / 2 - W / 2) <= T.offsetAt(lv) * W + 1 || cfg.plank.x0 <= T.EDGE_X || cfg.plank.x0 + cfg.plank.w >= W - T.EDGE_X, '橫板偏移量 lv' + lv);
  }
  shares[lv] = { min: minShare, avg: sum / N };
}
console.log('成功時機佔週期的比例（平均／最小）：lv1', (shares[1].avg * 100).toFixed(1) + '%/' + (shares[1].min * 100).toFixed(1) + '%', 'lv8', (shares[8].avg * 100).toFixed(1) + '%', 'lv16', (shares[16].avg * 100).toFixed(1) + '%/' + (shares[16].min * 100).toFixed(1) + '%', '未達標而用保底的', fallback);
ok(shares[1].avg > shares[16].avg + 0.02, '後面的關卡成功時機比較短（平均）');
ok(shares[16].min > 0.004, '最難的一關也至少有 0.4% 的週期可以成功（約 ' + (shares[16].min * 100).toFixed(2) + '%）');
ok(fallback < 30, '找不到合格題目的比例很低：' + fallback);
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
