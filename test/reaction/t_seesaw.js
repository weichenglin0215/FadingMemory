// 蹺蹺板比重（seesaw，企劃 257 依使用者修改）的純函式檢查：重量差與傾斜角、最少搬幾隻（獨立驗證）、出題條件、彈簧動畫會收斂、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_seesaw.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261110), rnd = rng(SEED);
const L = T.LEFT, R = T.RIGHT;

// ── 難度 ──
ok(T.nFor(1) === T.ANIMALS[0] && T.nFor(T.RAMP_LEVELS) === T.ANIMALS[1] && T.nFor(99) === T.ANIMALS[1], '動物隻數 ' + T.ANIMALS);
ok(T.weightMaxFor(1) === T.WEIGHT_MAX[0] && T.weightMaxFor(T.RAMP_LEVELS) === T.WEIGHT_MAX[1], '重量上限 ' + T.WEIGHT_MAX);
ok(T.movesRange(1).join() === '1,1' && T.movesRange(T.RAMP_LEVELS).join() === T.MOVES_MIN[1] + ',' + T.MOVES[1], '最少搬幾隻：第 1 關只有 1、到頂是 ' + T.MOVES_MIN[1] + '～' + T.MOVES[1]);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
for (let l = 2; l <= 60; l++) ok(T.nFor(l) >= T.nFor(l - 1) && T.weightMaxFor(l) >= T.weightMaxFor(l - 1) && T.movesRange(l)[1] >= T.movesRange(l - 1)[1] && T.movesRange(l)[0] >= T.movesRange(l - 1)[0] && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
ok(T.DIFF_MAX === T.TILT_MAX / T.TILT_PER_UNIT, '重量差上限 = 傾斜上限 ÷ 每單位傾斜度');

// ── 重量、傾斜角 ──
ok(JSON.stringify(T.sumsOf([2, 3, 1], [L, L, R])) === '{"l":5,"r":1}' && JSON.stringify(T.sumsOf([2, 3, 1], [L, 0, R])) === '{"l":2,"r":1}', 'sumsOf（被拿在手上的 0 不算）');
ok(T.angleFor(2) === -2 * T.TILT_PER_UNIT && T.angleFor(-3) === 3 * T.TILT_PER_UNIT && T.angleFor(0) === 0 || Object.is(T.angleFor(0), -0), '左重 → 負角度（左下）、右重 → 正角度');
ok(T.angleFor(100) === -T.TILT_MAX && T.angleFor(-100) === T.TILT_MAX, '傾斜角有上限 ' + T.TILT_MAX + '°');
for (let d = -20; d <= 20; d++) ok(Math.abs(T.angleFor(d)) <= T.TILT_MAX && (d === 0 || Math.sign(T.angleFor(d)) === -Math.sign(d)), '角度方向 ' + d);
// 拿起一隻 → 傾斜角變化 = 牠的重量 × 每單位傾斜度 × （牠在哪一邊：左邊的拿走，板子往右轉；右邊的拿走往左轉）
{ const w = [3, 5, 2, 4], sd = [L, R, L, R]; const full = T.angleFor(T.sumsOf(w, sd).l - T.sumsOf(w, sd).r);
  for (let i = 0; i < 4; i++) { const sd2 = sd.slice(); sd2[i] = 0; const a2 = T.angleFor(T.sumsOf(w, sd2).l - T.sumsOf(w, sd2).r); ok(near(Math.abs(a2 - full), w[i] * T.TILT_PER_UNIT) || Math.abs(a2 - full) <= w[i] * T.TILT_PER_UNIT + 1e-9, '拿起第 ' + i + ' 隻，傾斜角變化 ' + (a2 - full).toFixed(1) + '（重量 ' + w[i] + '）'); } }
function near(a, b) { return Math.abs(a - b) < 1e-9; }
// 座位
ok(T.seatDist(0, 1) === (T.SEAT_NEAR + T.SEAT_FAR) / 2 && T.seatDist(0, 4) === T.SEAT_NEAR && T.seatDist(3, 4) === T.SEAT_FAR, 'seatDist 範圍');
for (let c = 2; c <= 7; c++) for (let i = 1; i < c; i++) ok(T.seatDist(i, c) > T.seatDist(i - 1, c) && T.seatDist(i, c) <= T.SEAT_FAR, '座位由近到遠 ' + c + '/' + i);

// ── minMoves：跟另一種算法（子集合總和＋漢明距離）互相驗證 ──
function indep(weights, sides) {
  const n = weights.length, tot = weights.reduce((a, b) => a + b, 0); if (tot % 2) return null;
  let best = null;
  for (let mask = 0; mask < (1 << n); mask++) {          // 用位元遮罩列出「左邊的集合」
    let sl = 0, mv = 0; for (let i = 0; i < n; i++) { const left = !((mask >> i) & 1); if (left) sl += weights[i]; if ((left ? L : R) !== sides[i]) mv++; }
    if (sl * 2 === tot && (best === null || mv < best)) best = mv;
  }
  return best;
}
for (let i = 0; i < 500; i++) {
  const n = 3 + Math.floor(rnd() * 5), w = [], sd = []; for (let k = 0; k < n; k++) { w.push(1 + Math.floor(rnd() * 9)); sd.push(rnd() < 0.5 ? L : R); }
  const a = T.minMoves(w, sd), b = indep(w, sd);
  ok((a === null && b === null) || (a && b !== null && a.moves === b), 'minMoves 與獨立算法一致：' + JSON.stringify(w) + JSON.stringify(sd) + ' → ' + (a && a.moves) + '／' + b);
  if (a) { const s = T.sumsOf(w, a.sides); ok(s.l === s.r && s.l > 0 && a.move.length === a.moves && a.move.every(k => a.sides[k] !== sd[k]) && a.sides.every((x, k) => a.move.includes(k) || x === sd[k]), 'minMoves 回傳的分法確實平衡、要搬的動物對得上'); }
}
ok(T.minMoves([2, 3, 1], [L, L, R]).moves === 1 && T.minMoves([2, 3, 1], [L, L, R]).move.join() === '0' && T.minMoves([1, 1, 2], [L, R, R]).moves === 1 && T.minMoves([1, 1, 2, 2], [L, L, L, R]).moves === 1 && T.minMoves([3, 3, 2, 2], [L, L, L, L]).moves === 2, 'minMoves 範例');
ok(T.minMoves([1, 2], [L, R]) === null && T.minMoves([2, 2, 2], [L, L, R]) === null, '沒有平衡分法回傳 null');

// ── 整關 ──
let total = 0, moveCount = {};
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const n = T.nFor(lv), W = T.weightMaxFor(lv), mr = T.movesRange(lv), s = T.sumsOf(q.weights, q.sides);
  ok(q.n === n && q.weights.length === n && q.sides.length === n && q.kinds.length === n, '第 ' + lv + ' 關：' + n + ' 隻動物');
  ok(new Set(q.kinds).size === n && q.kinds.every(k => k >= 0 && k < T.SPECIES.length), '動物種類不重複');
  ok(q.weights.every(w => Number.isInteger(w) && w >= 1 && w <= W), '重量 1～' + W + '：' + q.weights);
  ok(q.weights.reduce((a, b) => a + b, 0) % 2 === 0 && !q.weights.every(w => w === q.weights[0]), '總重量是偶數、不是每隻一樣重');
  ok(q.sides.every(x => x === L || x === R) && q.sides.includes(L) && q.sides.includes(R), '兩邊都有動物');
  ok(q.diff === s.l - s.r && Math.abs(q.diff) >= 2 && Math.abs(q.diff) <= T.DIFF_MAX, '初始重量差 ' + q.diff + ' 在 2～' + T.DIFF_MAX);
  ok(q.best && q.best.moves >= mr[0] && q.best.moves <= mr[1], '第 ' + lv + ' 關最少搬 ' + (q.best && q.best.moves) + ' 隻（要 ' + mr + '）');
  ok(q.best.moves === indep(q.weights, q.sides), '最少搬幾隻跟獨立算法一致');
  const bs = T.sumsOf(q.weights, q.best.sides); ok(bs.l === bs.r && bs.l > 0, '有一種分法平衡（一定有解）');
  ok(Math.abs(T.angleFor(q.diff)) >= T.TILT_PER_UNIT * 2 && Math.abs(T.angleFor(q.diff)) <= T.TILT_MAX, '初始的傾斜角 ' + T.angleFor(q.diff) + '° 看得出來、也沒卡在上限外');
  moveCount[lv >= 24 ? 'late' + q.best.moves : q.best.moves] = (moveCount[lv >= 24 ? 'late' + q.best.moves : q.best.moves] || 0) + 1;
  if (lv === 1) ok(q.best.moves === 1 && q.n === 3, '第 1 關：3 隻動物、搬 1 隻就平衡');
}
console.log('最少搬幾隻分布 ' + JSON.stringify(moveCount));
ok(moveCount.late2 > 100 && moveCount.late3 > 50, '到頂的關卡要搬 2～3 隻都有：' + moveCount.late2 + '／' + moveCount.late3);
// 保底題也是好題
{ const q = T.makeLevel(1, () => 0.999999); ok(q.best && q.best.moves >= 1 && Math.abs(q.diff) >= 2, '極端亂數也出得出題（或用保底題）'); }

// ── 彈簧動畫（跟遊戲裡同一個積分公式）：會收斂、有一點彈跳但不會暈 ──
function simulate(a0, tgt, ms) {
  let a = a0, v = 0, maxOver = 0, settleAt = null; const dt = 1 / 60;
  for (let t = 0; t < ms / 1000; t += dt) {
    v += (-T.SPRING.omega * T.SPRING.omega * (a - tgt) - 2 * T.SPRING.zeta * T.SPRING.omega * v) * dt; a += v * dt;
    const over = (tgt - a0) !== 0 ? (a - tgt) * Math.sign(tgt - a0) : 0; maxOver = Math.max(maxOver, over);
    if (settleAt === null && Math.abs(a - tgt) < 0.4 && Math.abs(v) < 2) settleAt = t;
  }
  return { a, maxOver, settleAt };
}
{ const r = simulate(-36, 0, 4000); ok(Math.abs(r.a) < 0.01, '彈簧 4 秒後收斂到目標：' + r.a.toFixed(4)); ok(r.maxOver > 0.5 && r.maxOver < 0.25 * 36, '有一點彈跳（過頭 ' + r.maxOver.toFixed(1) + '°，不超過 25%）'); ok(r.settleAt !== null && r.settleAt < 1.6, '約 ' + (r.settleAt || 0).toFixed(2) + ' 秒內靜止'); }
{ const r = simulate(0, -12, 3000); ok(Math.abs(r.a + 12) < 0.01, '往另一個目標也收斂'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_seesaw.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3400/.test(src) && /sea-an--move/.test(src) && /showWeights\(\)/.test(src), '失敗停格 3 秒以上、標出該搬的動物與每隻的重量');
  ok(/\.sea-an--move \{[^}]*var\(--c-ok/.test(css) && /\.sea-board \{[^}]*var\(--sea-plank\)/.test(css), '綠框、木板用 CSS 變數');
  ok(!/stage\.addEventListener/.test(src), '事件監聽放在這一關專用的容器上（不在共用的 stage 上，免得換關後累積）');
  ok(/board\.isConnected/.test(src), '換關後彈簧迴圈會自己停');
  ok(boot.indexOf("'js/reaction_seesaw.js'") > 0 && /傾斜/.test(G.rule), 'boot.js 有載入、玩法說明提到傾斜'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
