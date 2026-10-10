const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_spinpick.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261031); const rnd = rng(SEED);

ok(T.sectorsFor(1) === 2 && T.sectorsFor(T.RAMP_LEVELS) === 12 && T.sectorsFor(60) === 12, '格數 2 → 12');
for (let l = 2; l <= 60; l++) ok(T.sectorsFor(l) >= T.sectorsFor(l - 1) && T.omegaFor(l) <= T.omegaFor(l - 1) + 1e-9 && T.ansMs(l) <= T.ansMs(l - 1), '單調 ' + l);
ok(near(T.omegaFor(1), 540) && near(T.omegaFor(T.RAMP_LEVELS), 324), '起轉速度 1.5 → 0.9 圈/秒');
ok(T.ansMs(1) === 6000 && T.ansMs(T.RAMP_LEVELS) === 4000, '限時 6 → 4 秒');
// 漸隱：剩 3 秒起漸隱、剩 2 秒全透明（企劃指定）
ok(T.SPIN_S === 5 && T.FADE_START === 3 && T.FADE_END === 2, '總 5 秒、最後 3 秒起漸隱、最後 2 秒全透明');
ok(T.alphaAt(0, 5) === 1 && T.alphaAt(1.9, 5) === 1 && near(T.alphaAt(2, 5), 1) && near(T.alphaAt(2.5, 5), 0.5) && near(T.alphaAt(3, 5), 0) && T.alphaAt(4, 5) === 0 && T.alphaAt(5, 5) === 0, 'alphaAt');
for (let t = 2; t < 3; t += 0.05) ok(T.alphaAt(t + 0.05, 5) <= T.alphaAt(t, 5) + 1e-12, '漸隱單調');
// 格子判定
ok(T.sectorOf(0, 2) === 0 && T.sectorOf(179.99, 2) === 0 && T.sectorOf(180, 2) === 1 && T.sectorOf(359.99, 2) === 1 && T.sectorOf(360, 2) === 0 && T.sectorOf(-1, 4) === 3 && T.sectorOf(90, 4) === 1, 'sectorOf');
// 整場驗證
const tail = []; 
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), sp = T.makeSpin(lv, rnd), w = 360 / sp.N;
  ok(near(T.norm360(T.thetaAt(sp, sp.T)), T.norm360(sp.thetaF), 1e-6), '第 T 秒剛好在停點 lv' + lv);
  ok(T.sectorOf(sp.thetaF, sp.N) === sp.s, '停點在第 s 格');
  const inCell = (T.norm360(sp.thetaF) % w) / w;
  ok(inCell >= T.MARGIN - 1e-9 && inCell <= 1 - T.MARGIN + 1e-9, '離格線至少 20%：' + inCell.toFixed(3));
  // 減速：角速度從 ω0 線性降到 0；每個時刻不倒退
  let prev = T.thetaAt(sp, 0);
  for (let t = 0.1; t <= 5; t += 0.1) { const th = T.thetaAt(sp, t); ok(th >= prev - 1e-9, '角度不倒退'); prev = th; }
  ok(near(T.thetaAt(sp, 0) , sp.theta0, 1e-9) && near(T.thetaAt(sp, 100), T.thetaAt(sp, 5), 1e-9), '停住後不動');
  // 看不見的最後 2 秒掃過的角度（玩家要推測的量）
  tail.push(T.thetaAt(sp, 5) - T.thetaAt(sp, 3));
  ok(sp.N === T.sectorsFor(lv) && near(sp.omega0, T.omegaFor(lv)), '參數');
}
// 最後 2 秒掃過的角度＝ ω0 × 0.4（等減速）：約 130～216 度
ok(Math.min(...tail) > 120 && Math.max(...tail) < 220, '看不見的 2 秒掃過 ' + Math.min(...tail).toFixed(1) + '～' + Math.max(...tail).toFixed(1) + ' 度');
// 停點的格子分布均勻（N=6 時各格）
const cnt = {}; for (let i = 0; i < 6000; i++) { const sp = T.makeSpin(10, rnd); cnt[sp.s] = (cnt[sp.s] || 0) + 1; } ok(Object.keys(cnt).length === T.sectorsFor(10) && Math.min(...Object.values(cnt)) > 6000 / T.sectorsFor(10) * 0.8, '各格均勻 ' + JSON.stringify(cnt));
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(8) && T.rating(8) !== T.rating(14) && T.rating(14) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
