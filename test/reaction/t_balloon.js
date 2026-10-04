const { game } = require('./load.js');
const G = game('reaction_balloon.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
ok(T.capacityAt(0) === 0 && T.capacityAt(1 / 60) === 1 && T.capacityAt(2 / 60) === 3 && T.capacityAt(3 / 60) === 6, 'triangular');
ok(T.capacityAt(1) === 60 * 61 / 2, '1s = 1830');
ok(T.capacityAt(5.0) === 300 * 301 / 2, '5s');
// 單調、與幀率無關（純時間函式）
let prev = -1; for (let t = 0; t < 9; t += 0.013) { const c = T.capacityAt(t); ok(c >= prev, 'monotonic'); prev = c; }
ok(T.radiusAt(100) === T.radiusAt(T.T_FULL) && T.radiusAt(-5) === T.radiusAt(0) && Math.abs(T.radiusAt(T.T_FULL / 2) - (T.radiusAt(0) + T.radiusAt(T.T_FULL)) / 2) < 1e-9 && T.radiusAt(T.T_FULL) > T.radiusAt(0), 'radius linear (endpoints clamp, midpoint is the mean)');
// 每局灌氣速度不同，但總容量相同（±2%）；爆破要按住的秒數 = 虛擬秒數 ÷ 速度
const C0 = T.capacityAt(T.TAU_BURST); let minS = 9, maxS = 0, minT = 99, maxT = 0, maxDev = 0;
for (let i = 0; i < 20000; i++) {
  const b = T.makeBurst();
  ok(b.speed >= T.SPEED_MIN && b.speed <= T.SPEED_MAX, 'speed range');
  ok(Math.abs(b.capBurst / T.capOfFrames(T.TAU_BURST * T.FPS) - 1) <= T.CAP_TOL + 1e-9, 'total capacity within ±2%');
  ok(Math.abs(T.capOfFrames(b.tauB * T.FPS) - b.capBurst) < 1e-6 * b.capBurst, 'capacity of tauB frames');
  ok(Math.abs(b.burstT - b.tauB / b.speed) < 1e-12, 'burstT = tauB / speed');
  ok(b.burstT < T.T_FULL, 'balloon radius still growing at the burst moment');
  minS = Math.min(minS, b.speed); maxS = Math.max(maxS, b.speed); minT = Math.min(minT, b.burstT); maxT = Math.max(maxT, b.burstT); maxDev = Math.max(maxDev, Math.abs(b.capBurst / C0 - 1));
}
ok(minS < 0.81 && maxS > 1.19, 'speeds cover the whole range');
ok(minT > 6.5 && maxT < 10.1 && maxT - minT > 2.5, 'burst time varies a lot between games: ' + minT.toFixed(2) + ' ~ ' + maxT.toFixed(2));
ok(maxDev <= 0.0201, 'capacity deviation ' + (maxDev * 100).toFixed(2) + '%');
// 兩局同一時間放手，分數會不同（因為速度不同）；但達到爆破時的分數都幾乎相同
{ const a = { speed: 0.8 }, b2 = { speed: 1.2 }; ok(T.capacityAt(5 * b2.speed) > T.capacityAt(5 * a.speed) * 1.8, 'same hold time, faster game scores more'); }
console.log(T.rating(1), T.rating(0.85), T.rating(0.6), T.rating(0.1));
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
