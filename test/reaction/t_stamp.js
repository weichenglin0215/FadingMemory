const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_stamp.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);
const rad = d => d * Math.PI / 180;
// corners：未旋轉時四個角在 ±w/2、±h/2
const c0 = T.corners(100, 200, 0, 220, 140);
ok(c0[0].x === -10 && c0[0].y === 130 && c0[2].x === 210 && c0[2].y === 270, 'corners 未旋轉');
// 旋轉 90°：寬高互換
const c90 = T.corners(0, 0, 90, 220, 140); ok(Math.abs(c90[0].x - 70) < 1e-9 && Math.abs(c90[0].y + 110) < 1e-9, 'corners 旋轉 90°');
// cornerErr：完全重合 → 0；平移 d → 平均 d；轉 δ → 每個角 2·r·sin(δ/2)
const f = { x: 236, y: 230, rot: 5 };
ok(T.cornerErr({ x: 236, y: 230, rot: 5 }, f).mean < 1e-9, '重合 0');
ok(Math.abs(T.cornerErr({ x: 246, y: 230, rot: 5 }, f).mean - 10) < 1e-9, '平移 10px');
const half = Math.hypot(T.FW / 2, T.FH / 2);
ok(Math.abs(T.cornerErr({ x: 236, y: 230, rot: 7 }, f).mean - 2 * half * Math.sin(rad(2) / 2)) < 1e-9, '轉 2° 的平均偏差');
ok(T.toMm(4) === 1, '4px = 1 公釐');
// worst 是偏差最大的角
{ const r = T.cornerErr({ x: 236, y: 230, rot: 15 }, f); ok(r.ds.every(d => d <= r.ds[r.worst] + 1e-9), 'worst'); }
// 出題：紙張歪斜在範圍、不太接近 0；紅框整個在紙張內；框的旋轉＝紙張
for (let i = 0; i < 4000; i++) {
  const c = T.makeRound(rnd);
  ok(Math.abs(c.phi) >= 2 - 1e-9 && Math.abs(c.phi) <= T.PAPER_TILT + 1e-9, '紙張歪斜範圍');
  ok(c.frame.rot === c.phi, '紅框與紙同角度');
  const cs = T.corners(c.frame.x, c.frame.y, c.frame.rot, T.FW + 40, T.FH + 40);   // 連角標一起算
  ok(cs.every(p => p.x > 40 && p.x < 432 && p.y > 20 && p.y < 440), '紅框（含角標）在紙張範圍內');
  // 角標在紙面座標下的位移：框中心離紙中心 ≤ FRAME_OFF 的對角長
  ok(Math.hypot(c.frame.x - T.PAPER.x, c.frame.y - T.PAPER.y) <= Math.hypot(T.FRAME_OFF.x, T.FRAME_OFF.y) + 1e-9, '位移範圍');
}
// 起始位置：不歪的印章與紅框偏差明顯（不會一開始就蓋對）
{ let min = 1e9; for (let i = 0; i < 1000; i++) { const c = T.makeRound(rnd); min = Math.min(min, T.cornerErr({ x: 236, y: 500, rot: 0 }, c.frame).mean); } ok(min > 100, '起始位置離答案很遠：' + min); }
// insideStamp／handleOf
ok(T.insideStamp({ x: 236, y: 500 }, { x: 236, y: 500, rot: 0 }) && !T.insideStamp({ x: 236 + 111, y: 500 }, { x: 236, y: 500, rot: 0 }), 'insideStamp 未旋轉');
ok(T.insideStamp({ x: 236 + 100, y: 500 }, { x: 236, y: 500, rot: 0 }) && !T.insideStamp({ x: 236 + 100, y: 500 }, { x: 236, y: 500, rot: 90 }), 'insideStamp 旋轉 90° 後寬變窄');
{ const h0 = T.handleOf({ x: 100, y: 300, rot: 0 }); ok(Math.abs(h0.x - 100) < 1e-9 && h0.y < 300 - 70, '手柄在印章上方'); const h90 = T.handleOf({ x: 100, y: 300, rot: 90 }); ok(Math.abs(h90.x - (100 + 70 + 40)) < 1e-9 && Math.abs(h90.y - 300) < 1e-9, '轉 90° 後手柄在右邊'); }
ok(T.zoomFor(100) === 1 && T.zoomFor(30) >= 2 && T.zoomFor(1) > T.zoomFor(10) && T.zoomFor(0) === 25, 'ZOOM 倍率');
ok(T.rating(0.1) !== T.rating(0.6) && T.rating(0.6) !== T.rating(1.5) && T.rating(1.5) !== T.rating(4) && T.rating(4) !== T.rating(9), '評語分級');
ok(T.toMm(T.cornerErr({ x: 40, y: 600, rot: 40 }, { x: 436, y: 30, rot: 0 }).mean) <= G.score.max, '最壞誤差在排行榜範圍內');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
