const { game } = require('./load.js');
const G = game('reaction_pendulum.js');
const T = G.test;
let bad = 0; const eq = (a, b, m) => { if (!(Math.abs(a - b) < 1e-9)) { bad++; console.log('FAIL', m, a, b); } };
// 1. 固定參數：從五點鐘（+30°）出發，週期 1.5 秒（原本 3.0 秒的 200% 速度）
const p = T.params();
eq(p.A, 30, 'A=30'); eq(p.T, 1.5, 'T=1.5');
// 2. θ(t)：t=0 在右邊 +30°（五點鐘），先往 0°（六點鐘）擺＝順時針，再到 −30°（七點鐘）
eq(T.thetaAt(p, 0), 30, 'start at 5 o\'clock (+30°)');
eq(T.thetaAt(p, p.T / 4), 0, 'quarter period at 6 o\'clock');
eq(T.thetaAt(p, p.T / 2), -30, 'half period at 7 o\'clock (-30°)');
eq(T.thetaAt(p, p.T * 3 / 4), 0, '3/4 back at 6 o\'clock');
eq(T.thetaAt(p, p.T), 30, 'full period back to 5 o\'clock');
// 起點之後馬上是遞減（朝六點鐘），不是遞增（朝更右邊）
if (!(T.thetaAt(p, 0.05) < 30 && T.thetaAt(p, 0.05) > 0)) { bad++; console.log('FAIL first move must head toward 6 o\'clock'); }
// 順時針：右(+)→下(0)→左(−)，單調遞減直到半個週期
let prev = 31; for (let t = 0; t <= p.T / 2; t += 0.01) { const v = T.thetaAt(p, t); if (v > prev + 1e-12) { bad++; console.log('FAIL not monotone clockwise at', t); break; } prev = v; }
// 擺的範圍就是 ±30°（5 點到 7 點）
let mx = -99, mn = 99; for (let t = 0; t < 3; t += 0.001) { const v = T.thetaAt(p, t); mx = Math.max(mx, v); mn = Math.min(mn, v); }
if (Math.abs(mx - 30) > 1e-3 || Math.abs(mn + 30) > 1e-3) { bad++; console.log('FAIL range', mx, mn); }
// 3. 放大計畫
const pl = x => JSON.stringify(T.zoomPlan(x));
if (pl(0.001) !== '[8,80,800]') { bad++; console.log('FAIL plan 0.001'); }
if (pl(0.3) !== '[8,80]') { bad++; console.log('FAIL plan 0.3'); }
if (pl(3) !== '[8]') { bad++; console.log('FAIL plan 3'); }
// 4. 評語
console.log(['0.01', 0.01, 0.1, 0.4, 0.9, 3].map(x => T.rating(+x)).join(' | '));
// 5. 難度：最大角速度，以及人類 30 毫秒抖動大概差幾度
const vmax = 2 * Math.PI * p.A / p.T;
console.log('vmax deg/s', vmax.toFixed(1), ' 30ms jitter err≈', (vmax * 0.03).toFixed(2), '度');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
