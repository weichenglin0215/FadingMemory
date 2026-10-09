const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_halfvol.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 圓柱：半徑固定 → 容量與高度成正比，一半容量就是一半高度
const cyl = new Array(T.NODES).fill(50), cc = T.cumulative(cyl);
ok(Math.abs(T.halfHeight(cc) - T.VASE_H / 2) < 1e-6, '圓柱的一半容量在一半高度');
ok(Math.abs(T.volumeAt(cc, T.VASE_H) - Math.PI * 2500 * T.VASE_H) < 1e-3 * cc[T.VASE_H], '圓柱總容量 π r² h');
ok(T.errPct(cc, T.VASE_H / 2) < 1e-6, '圓柱在一半高度誤差 0');
// 上寬下窄（像酒杯）：一半容量的高度比一半高度還高
const cone = [20, 35, 50, 65, 80, 95, 105], ccone = T.cumulative(cone);
ok(T.halfHeight(ccone) > T.VASE_H / 2, '上寬下窄：一半容量在一半高度之上');
// 內插與單調
let prev = -1; for (let y = 0; y <= T.VASE_H; y += 7.3) { const v = T.volumeAt(ccone, y); ok(v > prev, '容量遞增'); prev = v; }
ok(T.volumeAt(ccone, -5) === 0 && T.volumeAt(ccone, 9999) === ccone[T.VASE_H], '超出範圍夾住');
// 出題 600 次
let minGap = 9, minStart = 9, differ = new Set();
for (let i = 0; i < 600; i++) {
  const c = T.makeRound(rnd);
  ok(c.rs.length === T.NODES, '控制點數');
  for (let y = 0; y <= T.VASE_H; y += 5) ok(T.radiusAt(c.rs, y) >= T.R_FLOOR - 1e-9, '半徑不低於下限');
  const gap = Math.abs(c.hs - T.VASE_H / 2) / T.VASE_H;
  ok(gap >= T.MIN_GAP - 1e-9 || c.rs.join() === [100, 95, 70, 40, 28, 24, 30].join(), '一半容量與一半高度差距足夠 ' + gap);
  minGap = Math.min(minGap, gap);
  ok(Math.abs(T.errPct(c.cum, c.hs)) < 1e-6, '在 h* 誤差 0');
  ok(Math.abs(c.start - c.hs) >= T.START_GAP * T.VASE_H - 1e-9 || c.rs.join() === [100, 95, 70, 40, 28, 24, 30].join(), '起始水位離答案夠遠');
  ok(T.errPct(c.cum, T.VASE_H / 2) > 0.5, '拉到一半高度的偷吃步誤差要夠大：' + T.errPct(c.cum, T.VASE_H / 2));
  differ.add(c.rs[1].toFixed(3));
}
ok(differ.size > 590, '每次花瓶都不一樣');
ok(T.rating(0.1) !== T.rating(0.5) && T.rating(0.5) !== T.rating(2) && T.rating(2) !== T.rating(9), '評語分級');
console.log('最小 h* 與一半高度差距比例 ' + minGap.toFixed(3));
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
