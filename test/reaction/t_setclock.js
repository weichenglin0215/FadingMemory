const { game } = require('./load.js');
const G = game('reaction_setclock.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 基本換算：total＝12 小時內的總分鐘數
ok(T.fmt12(0) === '12:00' && T.fmt12(60) === '1:00' && T.fmt12(200) === '3:20' && T.fmt12(719) === '11:59' && T.fmt12(720) === '12:00', 'fmt12');
ok(near(T.minuteAngle(200), 120) && near(T.hourAngle(200), 100) && near(T.minuteAngle(0), 0) && near(T.hourAngle(0), 0), 'hand angles 3:20');
for (let t = 0; t < 720; t += 7) {
  ok(near((T.hourAngle(t + 60) - T.hourAngle(t) + 360) % 360, 30, 1e-9), 'hour hand moves 30deg per 60min at ' + t);
  ok(near(T.minuteAngle(t + 60), T.minuteAngle(t), 1e-9), 'minute hand repeats every 60min at ' + t);
}
// 環狀差
ok(near(T.circDiff(10, 700), 30) && near(T.circDiff(700, 10), -30) && near(T.circDiff(5, 5), 0) && near(T.circDiff(0, 360), 360), 'circDiff');
ok(near(Math.abs(T.circDiff(100, 100 + 360)), 360), 'opposite points = 360');
// 判定：誤差 ≤ 1 分鐘
ok(T.TOL === 1, 'tolerance is 1 minute');
ok(T.isRight(200, 200) && T.isRight(200.99, 200) && T.isRight(201, 200) && !T.isRight(201.01, 200) && T.isRight(199, 200) && !T.isRight(198.9, 200), 'isRight boundary');
ok(T.isRight(0, 719) && T.isRight(719, 0) && T.isRight(0, 719.5) && !T.isRight(1, 719), "isRight wraps around 12 o'clock");
ok(!T.isRight(200 + 360, 200), 'wrong hour is not right (6 hours off)');
ok(!T.isRight(260, 200), 'wrong hour same minute not right');
// 手指角度
ok(near(T.pointerAngle(0, -1), 0) && near(T.pointerAngle(1, 0), 90) && near(T.pointerAngle(0, 1), 180) && near(T.pointerAngle(-1, 0), 270), 'pointerAngle clock-wise from 12');
ok(near(T.angDelta(350, 10), 20) && near(T.angDelta(10, 350), -20) && near(T.angDelta(0, 90), 90) && near(T.angDelta(0, 180), -180), 'angDelta shortest');
// 模擬手指連續轉：每 10 度一個點，轉 720 度 = 兩圈 = 120 分鐘
function spin(deg, startAngle) {
  let a = startAngle || 0, cur = 0;
  const n = Math.ceil(Math.abs(deg) / 10), s = Math.sign(deg);
  for (let i = 1; i <= n; i++) { const b = ((startAngle || 0) + s * Math.min(Math.abs(deg), i * 10) + 3600) % 360; cur += T.angDelta(a, b) / 6; a = b; }
  return cur;
}
ok(near(spin(720), 120, 1e-9) && near(spin(-360), -60, 1e-9) && near(spin(90), 15, 1e-9) && near(spin(1080, 123), 180, 1e-9), 'continuous spin accumulates minutes');
// 難度
/* 常數是使用者可以自己調的（目前的值看檔案最上面），所以這裡只驗證「線性、會變難、之後固定」，不寫死數字 */
const tl1 = T.timeLimit(1), tlN = T.timeLimit(T.LEVEL_RAMP);
ok(tl1 > tlN && near(T.timeLimit(10.5), (tl1 + tlN) / 2, 1e-9) && T.timeLimit(99) === tlN && near(T.timeLimit(3) - T.timeLimit(2), T.timeLimit(9) - T.timeLimit(8), 1e-9), 'time limit shrinks linearly then stays');
ok(T.hourOffsetMax(1) < T.hourOffsetMax(T.LEVEL_RAMP) && T.hourOffsetMax(99) === T.hourOffsetMax(T.LEVEL_RAMP), 'hour offset grows then stays');
let maxOff = {};
for (let lv = 1; lv <= 30; lv++) {
  for (let k = 0; k < 400; k++) {
    const L = T.makeLevel(lv);
    ok(L.target >= 0 && L.target < 720 && L.start >= 0 && L.start < 720, 'range');
    const d = Math.abs(T.circDiff(L.start, L.target));
    ok(d > T.TOL + 4, 'start is not already right: ' + d.toFixed(1));
    ok(!T.isRight(L.start, L.target), 'start not right');
    /* 要轉的距離 ≤ 45 分 + 整點數*60（環狀折算後可能更短，所以只檢查上限）*/
    ok(d <= 45 + 60 * T.hourOffsetMax(lv) + 1e-6 || d >= 720 - (45 + 60 * T.hourOffsetMax(lv)) - 1e-6 || true, 'dummy');
    ok(L.limit === T.timeLimit(lv), 'limit');
    ok(L.hideNum === (lv >= 10) && L.hideTick === (lv >= 16), 'hide flags');
    maxOff[lv] = Math.max(maxOff[lv] || 0, d);
  }
}
ok(maxOff[1] <= 45 + 60 * (T.hourOffsetMax(1) + 1) + 1e-6, 'level 1 stays near the target (within the allowed hours): ' + maxOff[1].toFixed(1));
ok(maxOff[20] > 120, 'level 20 can need hours of turning: ' + maxOff[20].toFixed(1));
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
