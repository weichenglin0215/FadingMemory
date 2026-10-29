// 七彩陷阱：點擊的時間限制（換方塊的間隔）。V1.34 玩家意見：請延長點擊的時間限制
const { game } = require('./load.js');
const G = game('reaction_rainbow.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
// 延長：起始 ≥ 1200 毫秒、最短 ≥ 400 毫秒（舊版 800／200）
ok(T.START_INTERVAL_MS >= 1200 && T.MIN_INTERVAL_MS >= 400, '點擊時間：起始 ' + T.START_INTERVAL_MS + ' ms（舊 800）、最短 ' + T.MIN_INTERVAL_MS + ' ms（舊 200）');
ok(T.intervalAt(0) === T.START_INTERVAL_MS && T.intervalAt(100000) === T.MIN_INTERVAL_MS, '間隔：從起始值開始、縮到最短就維持');
for (let s = 1; s < 400; s++) ok(T.intervalAt(s) <= T.intervalAt(s - 1) && T.intervalAt(s) >= T.MIN_INTERVAL_MS, '間隔只會慢慢縮短、不會低於最短：第 ' + s + ' 個方塊 ' + T.intervalAt(s));
// 同一個進度，比舊版（800 起、200 最短、每個縮 5ms）多給的時間
const old = s => Math.max(200, 800 - s * 5);
for (const s of [0, 20, 60, 120, 200]) ok(T.intervalAt(s) > old(s), '第 ' + s + ' 個方塊：新 ' + T.intervalAt(s) + ' ms > 舊 ' + old(s) + ' ms');
// 縮短得很平順：相鄰兩個方塊的間隔只差 INTERVAL_STEP_MS
for (let s = 1; s < 300; s++) ok(T.intervalAt(s - 1) - T.intervalAt(s) <= T.INTERVAL_STEP_MS + 1e-9, '縮短幅度');
console.log('點擊的時間限制：第 0 個 ' + T.intervalAt(0) + ' ms → 第 100 個 ' + T.intervalAt(100) + ' ms → 第 160 個 ' + T.intervalAt(160) + ' ms → 最短 ' + T.MIN_INTERVAL_MS + ' ms');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
