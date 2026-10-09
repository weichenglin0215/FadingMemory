// 重心疊疊樂：落地高度、接觸範圍、重心與支撐、整座塔逐塊檢查（純函式）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_stackup.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const W = 472, ZH = 380, H = T.BLOCK_H;     // 380＝實際遊戲裡疊塔區的高度（約 6 層）
const blk = (kind, w) => ({ kind, w, h: H, hue: 200 });
const drop = (tower, b, x0) => T.evaluateDrop(tower, b, x0, W, ZH);
const place = (tower, b, x0) => { const r = drop(tower, b, x0); if (!r.ok) throw new Error('place failed ' + r.reason); return r.tower; };

// 空塔：長方形放哪裡都站得住，落在地板上
for (const x0 of [0, 100, 236, W - 100]) { const r = drop([], blk('rect', 100), x0); ok(r.ok && r.rest === 0 && r.placed.sup.length === 1 && r.placed.sup[0].i === -1, '地板 x0=' + x0); }
ok(drop([], blk('tri', 120), 40).ok && drop([], blk('trap', 120), 40).ok, '三角形、梯形平放在地板上也站得住');
// 面積：長方形 w×h、三角形一半、梯形 (1+TRAP_TOP)/2
ok(T.areaOf({ kind: 'rect', w: 100, h: H }) === 100 * H && T.areaOf({ kind: 'tri', w: 100, h: H }) === 50 * H && Math.abs(T.areaOf({ kind: 'trap', w: 100, h: H }) - 75 * H) < 1e-9, '面積');
// 頂面高度
const tri = { kind: 'tri', x0: 100, w: 100, y0: 0, h: H }, trap = { kind: 'trap', x0: 100, w: 100, y0: 0, h: H }, rect = { kind: 'rect', x0: 100, w: 100, y0: 0, h: H };
ok(T.topAt(tri, 150) === H && T.topAt(tri, 100) === 0 && T.topAt(tri, 125) === H / 2 && T.topAt(tri, 99) === null, '三角形頂面');
ok(T.topAt(trap, 150) === H && T.topAt(trap, 100) === 0 && T.topAt(trap, 125) === H && Math.abs(T.topAt(trap, 112.5) - H / 2) < 1e-9, '梯形頂面（頂寬 ' + T.TRAP_TOP + '）');
ok(T.topAt(rect, 100) === H && T.topAt(rect, 200) === H, '長方形頂面');
// 疊在長方形上：重心剛好在支撐邊緣還算站得住，超出就傾倒
let t1 = place([], blk('rect', 100), 100);                      // 底座 100～200，中心 150
let r = drop(t1, blk('rect', 100), 150); ok(r.ok && r.rest === H, '懸出一半（重心剛好在邊緣）站得住');
r = drop(t1, blk('rect', 100), 160); ok(!r.ok && r.reason === 'tip' && r.fail.idx === 1 && r.fail.dir === 1, '懸出超過一半 → 傾倒，往右：' + JSON.stringify(r.reason));
r = drop(t1, blk('rect', 100), 40); ok(!r.ok && r.reason === 'tip' && r.fail.dir === -1, '往左懸出太多 → 往左倒');
r = drop(t1, blk('rect', 100), 104); ok(r.ok, '幾乎對齊 → 站得住');
// 三角形的尖端：落在尖點上＝滑掉；落在尖端旁邊的斜面也只有一個點
let t2 = place([], blk('tri', 100), 100);
r = drop(t2, blk('rect', 60), 120); ok(!r.ok && r.reason === 'slide', '落在三角形尖端上 → 滑掉：' + r.reason);
r = drop(t2, blk('rect', 60), 205); ok(r.ok && r.rest === 0, '落在三角形旁邊的地板上沒問題');
r = drop(t2, blk('rect', 60), 190); ok(!r.ok && r.reason === 'slide' && r.rest > 0 && r.rest < H / 2, '壓在三角形的斜邊上：先碰到斜面（停在比地板高的位置），只有一點接觸 → 滑掉：' + r.reason + ' ' + r.rest);
// 梯形：頂面是水平的一段，可以疊上去
let t3 = place([], blk('trap', 100), 100);                      // 頂面 125～175
r = drop(t3, blk('rect', 100), 100); ok(r.ok && r.rest === H && Math.abs(r.placed.sup[0].b - r.placed.sup[0].a - 50) < 4, '疊在梯形頂面（接觸 50 寬）：' + JSON.stringify(r.placed.sup));
r = drop(t3, blk('rect', 100), 130); ok(!r.ok && r.reason === 'tip', '梯形頂面只有一半寬，懸出太多會倒');
// 橋接：兩塊同高的方塊中間架一塊長的
let t4 = place(place([], blk('rect', 100), 0), blk('rect', 100), 300);
r = drop(t4, blk('rect', 236), 80); ok(r.ok && r.rest === H && r.placed.sup.length === 2, '架在兩塊同高的方塊上（橋接）：' + JSON.stringify(r.placed.sup));
// 只壓在一塊的邊緣上、另一塊沒碰到 → 重心不在支撐範圍
r = drop(t4, blk('rect', 236), 20); ok(!r.ok, '長板只有一端壓在方塊邊緣 → 倒（' + r.reason + '）');
// 下層被壓倒：上面的方塊本身站得住，但它上面再放一塊把重心拉出去
let base = place([], blk('rect', 100), 100);                    // 底座 100～200
let mid = place(base, blk('rect', 100), 150);                   // 中間那塊 150～250：重心 200 剛好在底座右緣，站得住
let top = drop(mid, blk('rect', 100), 190);                     // 再壓一塊 190～290（重心 240，在中間那塊的頂面上，自己站得住）
ok(!top.ok && top.reason === 'tip' && top.fail.idx === 1, '再壓一塊把中間那塊壓倒（idx=' + (top.fail && top.fail.idx) + '）：' + top.reason);
top = drop(mid, blk('rect', 100), 120); ok(top.ok, '改壓在靠左（重心在底座上方）→ 穩');
// 天花板
let tall = []; for (let i = 0; i < 6; i++) tall = place(tall, blk('rect', 100), 100);
r = T.evaluateDrop(tall, blk('rect', 100), 100, W, ZH); ok(!r.ok && r.reason === 'ceiling' && r.rest === 6 * H, '第 7 層超過 ZH=' + ZH + '：' + r.reason);
r = T.evaluateDrop(tall, blk('rect', 100), 300, W, ZH); ok(r.ok, '旁邊的地板還有位置');
// checkTower：一座穩的塔
ok(T.checkTower(place(place(place([], blk('rect', 120), 100), blk('rect', 100), 110), blk('rect', 80), 120)).ok, '穩的三層');
// 出題：寬度 1/6～1/2、前兩關只有長方形、之後出現梯形與三角形
const rnd = rng(seedOf(20261010));
let kinds = { rect: 0, trap: 0, tri: 0 }, minW = 1e9, maxW = 0;
for (let lv = 1; lv <= 30; lv++) for (let k = 0; k < 400; k++) { const b = T.makeBlock(lv, W, rnd); if (lv <= 2 && b.kind !== 'rect') ok(false, '前兩關只有長方形'); if (lv < 6 && b.kind === 'tri') ok(false, '第 6 關前沒有三角形'); kinds[b.kind]++; minW = Math.min(minW, b.w); maxW = Math.max(maxW, b.w); ok(b.h === H, '高度固定'); }
ok(minW >= Math.round(W / 6) && maxW <= Math.round(W / 2), '寬度範圍 ' + minW + '～' + maxW);
ok(kinds.trap > 500 && kinds.tri > 300, '梯形與三角形都會出現：' + JSON.stringify(kinds));
// 隨機疊塔：每次都挑一個「站得住」的位置疊，一路疊到沒地方為止；整座塔每一步都要通過 checkTower
let totalPlaced = 0, stuck = 0;
for (let run = 0; run < 60; run++) {
  let tw = [];
  for (let lv = 1; lv <= 60; lv++) {
    const b = T.makeBlock(lv, W, rnd), spots = T.stableSpots(tw, b, W, ZH, 4);
    if (!spots.length) { stuck++; break; }
    const x0 = spots[Math.floor(rnd() * spots.length)], res = T.evaluateDrop(tw, b, x0, W, ZH);
    ok(res.ok && T.checkTower(res.tower).ok, '隨機疊塔每一步都穩');
    tw = res.tower; totalPlaced++;
  }
}
console.log('隨機疊塔 60 局：共疊 ' + totalPlaced + ' 塊（平均 ' + (totalPlaced / 60).toFixed(1) + '），有 ' + stuck + ' 局最後沒地方放');
ok(totalPlaced / 60 >= 6, '平均至少疊得上 6 塊（隨機選站得住的位置；遊戲不會一下子就無解）：' + (totalPlaced / 60).toFixed(1));
console.log(bad ? 'FAILED ' + bad + '（seed ' + seedOf(20261010) + '）' : 'ALL PASS');
