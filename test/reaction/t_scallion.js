const { game } = require('./load.js');
const G = game('reaction_scallion.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 速度表與位置（分段等速的積分）
const sp = T.makeSpeeds();
ok(sp.length >= Math.ceil(T.DURATION / T.SEG_S) + 1, 'enough speed segments ' + sp.length);
ok(sp.every(v => v >= T.BASE_V * T.V_LO - 1e-9 && v <= T.BASE_V * T.V_HI + 1e-9), 'speeds within range');
ok(T.posAt(sp, -1) === 0 && T.posAt(sp, 0) === 0, 'pos at t<=0');
ok(near(T.posAt(sp, T.SEG_S), sp[0] * T.SEG_S) && near(T.posAt(sp, 0.5 * T.SEG_S), sp[0] * 0.5 * T.SEG_S), 'first segment');
ok(near(T.posAt(sp, 2 * T.SEG_S), (sp[0] + sp[1]) * T.SEG_S), 'two segments');
let prev = 0, mono = true; for (let t = 0; t <= T.DURATION; t += 0.05) { const p = T.posAt(sp, t); if (p < prev - 1e-9) mono = false; prev = p; }
ok(mono, 'position monotonic');
// 連續：段落交界不跳變
for (let k = 1; k < 10; k++) { const t = k * T.SEG_S; ok(Math.abs(T.posAt(sp, t + 1e-6) - T.posAt(sp, t - 1e-6)) < 1e-2, 'continuous at segment ' + k); }

// 切刀：冷卻、最短長度
let c = T.makeCutter(sp);
ok(c.tap(0.01) === null, 'too short slice does not count');
const l1 = c.tap(1.0); ok(l1 != null && near(l1, T.posAt(sp, 1.0)), 'first cut length = distance travelled');
ok(c.tap(1.0 + T.CUT_CD * 0.5) === null, 'cooldown blocks a second tap');
const l2 = c.tap(1.0 + T.CUT_CD + 0.001); ok(l2 != null && near(l2, T.posAt(sp, 1.0 + T.CUT_CD + 0.001) - T.posAt(sp, 1.0)), 'next cut length measured from last cut');
ok(c.cuts() === 2, 'two cuts counted');
// 狂點上限：每 CUT_CD 秒一刀 → 20 秒內最多 ceil(20/CD) 刀
c = T.makeCutter(sp); let n = 0;
for (let t = 0.2; t <= T.DURATION; t += 0.01) if (c.tap(t) != null) n++;
ok(n <= Math.floor(T.DURATION / T.CUT_CD) + 1 && n >= 100, 'mash upper bound ' + n);
// 慢慢點：1 秒一刀 → 約 20 刀，每刀長度總和 = 總前進距離
c = T.makeCutter(sp); let sum = 0, cnt = 0;
for (let t = 1; t <= T.DURATION; t += 1) { const l = c.tap(t); if (l != null) { sum += l; cnt++; } }
ok(cnt === 20 && near(sum, T.posAt(sp, T.DURATION), 1e-6), 'slow tapping: 20 cuts, lengths add up');
ok(c.head(T.DURATION + 0.5) > 0, 'head grows after last cut');
ok(T.rating(140) === '神速刀工！' && T.rating(110) === '快刀手！' && T.rating(80) === '手很快！' && T.rating(10) === '再快一點就更厲害了！', 'rating');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
