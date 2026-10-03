const { game } = require('./load.js');
const G = game('reaction_pendulum.js');
const T = G.test;
let bad = 0; const eq = (a, b, m) => { if (!(Math.abs(a - b) < 1e-9)) { bad++; console.log('FAIL', m, a, b); } };
// 1. 關卡參數線性
const p1 = T.paramsFor(1, () => 0.5), p10 = T.paramsFor(10, () => 0.5), p30 = T.paramsFor(30, () => 0.5);
eq(p1.A, 15, 'A1'); eq(p10.A, 15 + 1.5 * 9, 'A10'); eq(p30.A, 40, 'Acap'); eq(p1.T, 3.0, 'T1'); eq(p10.T, 3.0 - 0.9, 'T10'); eq(p30.T, 1.4, 'Tmin');
eq(T.passFor(1), 5.0, 'pass1'); eq(T.passFor(2), 4.75, 'pass2'); eq(T.passFor(19), 0.5, 'pass19'); eq(T.passFor(50), 0.5, 'passMin');
// 2. θ(t)
const p = { A: 20, T: 2, phi: 0 };
eq(T.thetaAt(p, 0), 0, 'theta0'); eq(T.thetaAt(p, 0.5), 20, 'theta quarter'); eq(T.thetaAt(p, 1), 0, 'theta half'); eq(T.thetaAt(p, 1.5), -20, 'theta 3/4');
// 3. 放大計畫
const pl = x => JSON.stringify(T.zoomPlan(x));
console.log('plan 0.001', pl(0.001), 'plan 0.03', pl(0.03), 'plan 0.3', pl(0.3), 'plan 3', pl(3), 'plan 4.5', pl(4.5), 'plan 20', pl(20), 'plan 39', pl(39));
if (pl(0.001) !== '[8,80,800]') { bad++; console.log('FAIL plan 0.001'); }
if (pl(0.3) !== '[8,80]') { bad++; console.log('FAIL plan 0.3'); }
if (pl(3) !== '[8]') { bad++; console.log('FAIL plan 3'); }
// 4. 評語
console.log(['0.01', 0.01, 0.1, 0.4, 0.9, 3].map(x => T.rating(+x)).join(' | '));
// 5. 誤差分佈：隨機點下去的誤差（人類抖動 30ms）在各關大概多少
for (const lv of [1, 5, 10, 15, 19]) {
  const pp = T.paramsFor(lv, () => 0.3); const vmax = 2 * Math.PI * pp.A / pp.T;
  console.log('level', lv, 'A', pp.A, 'T', pp.T.toFixed(2), 'vmax deg/s', vmax.toFixed(1), 'pass', T.passFor(lv), '30ms jitter err≈', (vmax * 0.03).toFixed(2));
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
