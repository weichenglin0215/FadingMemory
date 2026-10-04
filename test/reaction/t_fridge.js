const { game } = require('./load.js');
const G = game('reaction_fridge.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 資料表
const F = T.FOODS;
ok(F.length >= 36, 'at least 36 foods (' + F.length + ')');
ok(new Set(F.map(f => f.name)).size === F.length, 'names unique');
ok(F.every(f => ['freeze', 'cool', 'pantry'].includes(f.zone) && typeof f.hue === 'number' && f.icon), 'fields valid');
const byZone = { freeze: 0, cool: 0, pantry: 0 }; F.forEach(f => byZone[f.zone]++);
ok(byZone.freeze >= 9 && byZone.cool >= 9 && byZone.pantry >= 9, 'zones balanced ' + JSON.stringify(byZone));
ok(F.filter(f => f.tricky).length >= 6 && F.filter(f => f.tricky).every(f => f.tip), 'tricky foods have tips');
ok(F.find(f => f.name === '雞蛋').zone === 'cool' && F.find(f => f.name === '洋蔥').zone === 'pantry' && F.find(f => f.name === '冰淇淋').zone === 'freeze', 'spot check zones');
// 時間與反直覺比例線性
ok(near(T.timeFor(1), 3.0) && near(T.timeFor(T.RAMP_N), 1.2) && near(T.timeFor(15.5), 2.1, 1e-9) && T.timeFor(99) === T.timeFor(T.RAMP_N), 'time 3.0 -> 1.2');
ok(near(T.trickyP(1), 0.10) && near(T.trickyP(T.RAMP_N), 0.50), 'tricky 10% -> 50%');
// 抽牌規則
let hist = [], sameConsec = 0, maxRun = 0, run = 0, trickyEarly = 0, trickyLate = 0, early = 0, late = 0;
for (let n = 1; n <= 6000; n++) {
  const f = T.nextFood(((n - 1) % 60) + 1, hist);
  if (hist.length && hist[hist.length - 1].name === f.name) sameConsec++;
  if (hist.length && hist[hist.length - 1].zone === f.zone) run++; else run = 1;
  maxRun = Math.max(maxRun, run);
  const m = ((n - 1) % 60) + 1;
  if (m <= 5) { early++; if (f.tricky) trickyEarly++; }
  if (m >= 30 && m <= 34) { late++; if (f.tricky) trickyLate++; }
  hist.push(f); if (hist.length > 50) hist.shift();
}
ok(sameConsec === 0, 'never the same food twice in a row');
ok(maxRun <= T.ZONE_RUN_MAX + 0 || maxRun <= T.ZONE_RUN_MAX, 'zone run <= ' + T.ZONE_RUN_MAX + ' (got ' + maxRun + ')');
ok(trickyLate / late > trickyEarly / early + 0.2, 'tricky share rises: ' + (trickyEarly / early).toFixed(2) + ' -> ' + (trickyLate / late).toFixed(2));
// 滑動方向
ok(T.zoneFromDelta(0, -30) === 'freeze' && T.zoneFromDelta(-30, 0) === 'cool' && T.zoneFromDelta(30, 0) === 'pantry' && T.zoneFromDelta(0, 30) === null, 'swipe zones');
ok(T.zoneFromDelta(20, -25) === 'freeze' && T.zoneFromDelta(-26, 20) === 'cool' && T.zoneFromDelta(26, 20) === 'pantry' && T.zoneFromDelta(10, 40) === null, 'dominant axis');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
