const { game } = require('./load.js');
const G = game('reaction_mirror.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線（線性）
ok(near(T.hwFor(1), 64) && near(T.hwFor(T.LEVEL_RAMP), 30) && near(T.hwFor(8), 47, 1e-9) && T.hwFor(99) === 30, 'half width 64 -> 30');
ok(T.bendsFor(1) === 1 && T.bendsFor(T.LEVEL_RAMP) === 5 && T.bendsFor(99) === 5, 'bends 1 -> 5');
ok(near(T.gainFor(1), 1.0) && near(T.gainFor(T.LEVEL_RAMP), 1.6) && near(T.gainFor(8), 1.3, 1e-9), 'gain 1.0 -> 1.6');
// 映射：第 1～7 關只有左右反；第 8 關起上下也反
const m1 = T.mapDelta(1, 10, 20); ok(near(m1.x, -10) && near(m1.y, 20), 'level1: x reversed, y normal');
const m7 = T.mapDelta(7, 10, 20); ok(m7.x < 0 && m7.y > 0, 'level7 still y normal');
const m8 = T.mapDelta(8, 10, 20); ok(m8.x < 0 && m8.y < 0, 'level8: both reversed');
const g8 = T.gainFor(8); ok(near(m8.x, -10 * g8, 1e-9) && near(m8.y, -20 * g8, 1e-9), 'gain applied');
ok(!T.flipBoth(7) && T.flipBoth(8), 'flipBoth threshold');
// 距離與轉角
ok(near(T.distSeg(0, 5, 0, 0, 10, 0), 5) && near(T.distSeg(-3, 0, 0, 0, 10, 0), 3) && near(T.distSeg(14, 3, 0, 0, 10, 0), 5), 'distSeg incl. end caps');
const pl = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
ok(near(T.distToPolyline({ x: 50, y: 10 }, pl), 10) && near(T.distToPolyline({ x: 110, y: 50 }, pl), 10) && near(T.distToPolyline({ x: 100, y: 0 }, pl), 0), 'distToPolyline');
ok(near(T.turnDeg({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }), 0) && near(T.turnDeg({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }), 90), 'turnDeg');
// 通道中心線
const FW = 468, FH = 640;
for (let lv = 1; lv <= 20; lv++) {
  for (let k = 0; k < 300; k++) {
    const pts = T.makeCenterline(lv, FW, FH);
    const hw = T.hwFor(lv);
    ok(pts.length === T.bendsFor(lv) + 2, 'points = bends + 2');
    ok(pts.every((p, i) => i === 0 || p.y > pts[i - 1].y), 'y strictly increasing (top to bottom)');
    ok(pts.every(p => p.x - hw >= 0 && p.x + hw <= FW), 'corridor stays inside field lv' + lv);
    for (let i = 1; i < pts.length - 1; i++) ok(T.turnDeg(pts[i - 1], pts[i], pts[i + 1]) <= T.MAX_TURN_DEG + 1e-6, 'turn angle <= max lv' + lv + ' ' + T.turnDeg(pts[i - 1], pts[i], pts[i + 1]).toFixed(1));
    ok(T.inCorridor(pts[0], pts, hw) && T.inCorridor(pts[pts.length - 1], pts, hw), 'start and end are inside');
    ok(!T.inCorridor({ x: pts[0].x + hw + 5, y: pts[0].y }, pts, hw), 'outside is outside');
  }
}
// 最窄時手指容許誤差
ok((T.hwFor(15) - T.BALL_R) / T.gainFor(15) > 8, 'narrowest tolerance still >= 8px of finger travel');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
