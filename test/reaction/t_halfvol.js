const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_halfvol.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 圓柱：半徑固定 → 面積與高度成正比，一半面積就是一半高度（V1.27 起「容量」＝側面剪影面積，不再乘 r²）
const cyl = new Array(T.NODES).fill(50), cc = T.cumulative(cyl);
ok(Math.abs(T.halfHeight(cc) - T.VASE_H / 2) < 1e-6, '圓柱的一半容量在一半高度');
ok(Math.abs(T.volumeAt(cc, T.VASE_H) - 2 * 50 * T.VASE_H) < 1e-3 * cc[T.VASE_H], '圓柱總面積 2 r h（剪影＝長方形）');
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
// V1.25：帶正負號的差異（＋＝超過一半、－＝不足）、1.5 秒停頓、水量差異公式用「獨立算法」核對
{ const rs = [30, 90, 60, 100, 40, 80, 50], cum = T.cumulative(rs);
  ok(T.signedPct(cum, 0) === -50 && Math.abs(T.signedPct(cum, T.VASE_H) - 50) < 1e-9, '空瓶 −50%、滿瓶 ＋50%');
  const hs = T.halfHeight(cum); ok(Math.abs(T.signedPct(cum, hs)) < 1e-6, '一半容量的高度差異 0');
  ok(T.signedPct(cum, hs + 20) > 0 && T.signedPct(cum, hs - 20) < 0, '水位高於一半容量＝正、低於＝負');
  for (let y = 0; y <= T.VASE_H; y += 13.7) ok(Math.abs(Math.abs(T.signedPct(cum, y)) - T.errPct(cum, y)) < 1e-9, '絕對值＝errPct');
  ok(T.fmtSigned(3.12345) === '+3.1235%' || T.fmtSigned(3.12345) === '+3.1234%', '正數：+ 4 位小數 ' + T.fmtSigned(3.12345));
  ok(T.fmtSigned(-0.5) === '−0.5000%' && T.fmtSigned(0) === '+0.0000%' && T.fmtSigned(-50) === '−50.0000%', '負數用「−」：' + T.fmtSigned(-0.5) + ' ' + T.fmtSigned(-50));
  // 獨立算法：把剪影切成 20000 條很薄的橫帶（每條用「中間的半徑」算左右寬 2r × 厚度），逐條加總，再比水位 L 以下的比例
  const N = 20000, dy = T.VASE_H / N, slice = []; let tot = 0;
  for (let i = 0; i < N; i++) { const r = T.radiusAt(rs, (i + 0.5) * dy); tot += 2 * r * dy; slice.push(tot); }
  for (const y of [40, 111, 205.5, 300, 420, 479]) {
    const below = slice[Math.max(0, Math.round(y / dy) - 1)] / tot * 100 - 50;
    ok(Math.abs(T.signedPct(cum, y) - below) < 0.02, '水位 ' + y + '：公式 ' + T.signedPct(cum, y).toFixed(4) + '% ＝ 橫帶相加 ' + below.toFixed(4) + '%');
  }
  // 圓柱：容量跟高度成正比，水位在 y 的差異就是 y ÷ 高度 − 50（%）
  const cyl = T.cumulative([50, 50, 50, 50, 50, 50, 50]); for (const y of [0, 120, 240, 360, 480]) ok(Math.abs(T.signedPct(cyl, y) - (y / T.VASE_H * 100 - 50)) < 1e-6, '圓柱的差異 ' + y);
  // 看的是剪影面積（r）、不是旋轉體容量（r²）：底寬口窄的圓錐台，一半高度時水已超過一半一些，但沒有 r² 那麼誇張
  const cone = T.cumulative([100, 90, 80, 70, 60, 50, 40]); ok(T.signedPct(cone, T.VASE_H / 2) > 3, '底寬口窄的瓶：一半高度時面積已超過一半（' + T.signedPct(cone, T.VASE_H / 2).toFixed(2) + '%）');
  // 梯形（線性變細）的剪影面積有公式解：半寬 r(y) 從 100 線性到 40，面積比例 = (100*y - 60*y^2/(2H)) / (100*H - 30*H) → 與數值積分比對
  const lin = T.cumulative([100, 90, 80, 70, 60, 50, 40]), H = T.VASE_H;
  for (const y of [60, 200, 333]) { const exact = (100 * y - 60 * y * y / (2 * H)) / (100 * H - 30 * H) * 100 - 50; ok(Math.abs(T.signedPct(lin, y) - exact) < 0.2, '梯形剪影面積公式解 ' + y + '：' + T.signedPct(lin, y).toFixed(3) + ' vs ' + exact.toFixed(3)); } }
ok(T.REVEAL_PAUSE_MS === 2000, '動畫結束（水停住、綠線出現）後停 2 秒才結算');
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_halfvol.js'), 'utf8');
  ok(src.indexOf('refHalfH') < 0 && src.indexOf('hv-ref--h') < 0, '取消灰色的一半高度虛線');
  ok(src.indexOf('Wl = target * e') > 0 && src.indexOf('hv-diff') > 0 && src.indexOf('signedPct(cfg.cum, Wl)') > 0, '水位從 0 升到藍線，水面下方即時顯示差異');
  ok(src.indexOf("refHalfV.setAttribute('opacity', 1)") > src.indexOf('Wl = target; paint(); showDiff();'), '水面停住之後才出現綠線');
  ok(src.indexOf('my.after(REVEAL_PAUSE_MS') > src.indexOf("refHalfV.setAttribute('opacity', 1)") && src.indexOf('sign: sgn') > 0, '綠線之後才停頓並結算，結算帶正負號');
  const kit2 = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_kit2.js'), 'utf8');
  ok(/x\.sign \? \(x\.sign > 0 \? '\+' : '−'\)/.test(kit2), 'kit.single 支援結算大字的正負號'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
