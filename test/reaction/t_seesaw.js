// 蹺蹺板比重（seesaw，企劃 257；V1.36.0 改成真正的槓桿）的純函式檢查：力矩與傾斜角、會平衡的放法有幾種（用獨立的窮舉驗證）、出題條件、座位吸附、彈簧動畫會收斂、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_seesaw.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261110), rnd = rng(SEED);
function near(a, b) { return Math.abs(a - b) < 1e-9; }

// ── 難度 ──
ok(T.nFor(1) === T.ANIMALS[0] && T.nFor(T.RAMP_LEVELS) === T.ANIMALS[1] && T.nFor(999) === T.ANIMALS[1], '動物隻數 ' + T.ANIMALS);
ok(T.weightMaxFor(1) === T.WEIGHT_MAX[0] && T.weightMaxFor(T.RAMP_LEVELS) === T.WEIGHT_MAX[1], '重量上限 ' + T.WEIGHT_MAX);
ok(T.slotsFor(1) === T.SLOTS[0] && T.slotsFor(T.RAMP_LEVELS) === T.SLOTS[1], '每邊座位數 ' + T.SLOTS);
ok(T.pinnedFor(T.PIN_FROM - 1) === 0 && T.pinnedFor(T.RAMP_LEVELS) === T.PINNED[1], '被固定的動物：第 ' + T.PIN_FROM + ' 關起才有，到頂 ' + T.PINNED[1] + ' 隻');
ok(T.movesRange(1).join() === T.MOVES_MIN[0] + ',' + T.MOVES[0] && T.movesRange(T.RAMP_LEVELS).join() === T.MOVES_MIN[1] + ',' + T.MOVES[1], '最少要換幾隻的座位：第 1 關 ' + T.MOVES_MIN[0] + '～' + T.MOVES[0] + '、到頂 ' + T.MOVES_MIN[1] + '～' + T.MOVES[1]);
ok(T.maxSolsFor(1) === T.MAX_SOLS[0] && T.maxSolsFor(T.RAMP_LEVELS) === T.MAX_SOLS[1], '會平衡的放法上限 ' + T.MAX_SOLS);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
for (let l = 2; l <= 90; l++) ok(T.nFor(l) >= T.nFor(l - 1) && T.weightMaxFor(l) >= T.weightMaxFor(l - 1) && T.pinnedFor(l) >= T.pinnedFor(l - 1) && T.movesRange(l)[1] >= T.movesRange(l - 1)[1] && T.movesRange(l)[0] >= T.movesRange(l - 1)[0] && T.maxSolsFor(l) <= T.maxSolsFor(l - 1) && T.timeMs(l) <= T.timeMs(l - 1), '難度單調 ' + l);
ok(T.DIFF_MAX === Math.floor(T.TILT_MAX / T.TILT_PER_UNIT), '力矩差上限 = 傾斜上限 ÷ 每單位傾斜度');

// ── 動物的大小：越重越大（線性） ──
for (let w = 1; w <= 9; w++) ok(T.sizeOf(w) === T.SIZE_BASE + T.SIZE_STEP * w && (w === 1 || T.sizeOf(w) > T.sizeOf(w - 1)), '動物大小跟著重量放大：重 ' + w + ' → ' + T.sizeOf(w) + ' px');
ok(T.sizeOf(9) / T.sizeOf(1) > 2 && T.sizeOf(9) <= 68, '最重的明顯比最輕的大（> 2 倍），也不會大到放不下：' + T.sizeOf(1) + ' → ' + T.sizeOf(9));

// ── 力矩、傾斜角 ──
ok(JSON.stringify(T.torqueOf([2, 3, 1], [-2, -1, 3])) === '{"l":7,"r":3,"net":-4}' && JSON.stringify(T.torqueOf([2, 3, 1], [-2, 0, 3])) === '{"l":4,"r":3,"net":-1}', 'torqueOf：重量×格數，左邊 2×2＋3×1＝7、右邊 1×3＝3；被拿在手上的（0）不算');
ok(T.torqueOf([4, 2], [-1, 2]).net === 0, '4 在左 1 格、2 在右 2 格：力矩 4 ＝ 4，平衡');
ok(T.torqueOf([5], [3]).net === 15 && T.torqueOf([5], [-3]).net === -15, '同一隻動物，離支點越遠力矩越大（5×3 ＝ 15）');
ok(T.angleFor(2) === 2 * T.TILT_PER_UNIT && T.angleFor(-3) === -3 * T.TILT_PER_UNIT && (T.angleFor(0) === 0), '右邊力矩大 → 正角度（順時針、右邊下沉）、左邊大 → 負角度');
ok(T.angleFor(500) === T.TILT_MAX && T.angleFor(-500) === -T.TILT_MAX, '傾斜角有上限 ' + T.TILT_MAX + '°');
for (let d = -40; d <= 40; d++) ok(Math.abs(T.angleFor(d)) <= T.TILT_MAX && (d === 0 || Math.sign(T.angleFor(d)) === Math.sign(d)), '角度方向 ' + d);
// 拿起一隻：傾斜角變化 ＝ 牠的力矩 × 每單位傾斜度（沒有超過上限時）；離支點越遠變化越大
{ const w = [3, 5, 2, 4], pos = [-1, 2, -3, 4]; const full = T.angleFor(T.torqueOf(w, pos).net);
  for (let i = 0; i < 4; i++) { const p2 = pos.slice(); p2[i] = 0; const a2 = T.angleFor(T.torqueOf(w, p2).net); ok(near(Math.abs(a2 - full), w[i] * Math.abs(pos[i]) * T.TILT_PER_UNIT) || Math.abs(a2 - full) <= w[i] * Math.abs(pos[i]) * T.TILT_PER_UNIT + 1e-9, '拿起第 ' + i + ' 隻：傾斜角變化不超過 重量×格數×每單位度'); } }

// ── 座位：最接近的座位、被占住時找最近的空位 ──
ok(T.nearestSlot(0.4, 4) === 1 && T.nearestSlot(-0.4, 4) === -1 && T.nearestSlot(0, 4) === 1 && T.nearestSlot(2.4, 4) === 2 && T.nearestSlot(2.6, 4) === 3 && T.nearestSlot(-3.6, 4) === -4 && T.nearestSlot(9, 4) === 4 && T.nearestSlot(-9, 4) === -4, 'nearestSlot：吸附到最近的座位（0 附近看左右、超過就吸到最外面的座位）');
ok(T.freeSlotNear(2, {}, 4) === 2 && T.freeSlotNear(2, { 2: true }, 4) === 1 && T.freeSlotNear(2, { 2: true, 1: true }, 4) === 3 && T.freeSlotNear(1, { 1: true, 2: true, 3: true, 4: true }, 4) === -1, 'freeSlotNear：先找同一邊最近的空位，同邊都滿了才換邊');
ok(T.freeSlotNear(1, (() => { const t = {}; for (let s = -4; s <= 4; s++) if (s) t[s] = true; return t; })(), 4) === 0, '座位全滿 → 0');

// ── solve：跟另一種算法（枚舉所有「座位→重量」的放法，用簽名去掉重複）互相驗證 ──
function indep(weights, fixedPos, pos0, S) {
  const n = weights.length, movable = [], taken = new Set();
  for (let i = 0; i < n; i++) { if (fixedPos[i]) taken.add(fixedPos[i]); else movable.push(i); }
  const free = []; for (let s = -S; s <= S; s++) if (s && !taken.has(s)) free.push(s);
  let base = 0; for (let i = 0; i < n; i++) if (fixedPos[i]) base += weights[i] * fixedPos[i];
  const patterns = new Map();                       // 簽名（每個座位坐的重量）→ 最少要換幾隻
  const initKey = new Map(); movable.forEach(i => { const k = weights[i] + '@' + pos0[i]; initKey.set(k, (initKey.get(k) || 0) + 1); });
  function rec(k, used, net, chosen) {
    if (k === movable.length) {
      if (net !== 0) return;
      const sig = chosen.map(([w, s]) => w + '@' + s).sort().join(',');
      let kept = 0; chosen.forEach(([w, s]) => { if (initKey.has(w + '@' + s)) kept++; });
      patterns.set(sig, movable.length - kept); return;
    }
    const w = weights[movable[k]];
    for (let j = 0; j < free.length; j++) { if (used & (1 << j)) continue; rec(k + 1, used | (1 << j), net + w * free[j], chosen.concat([[w, free[j]]])); }
  }
  rec(0, 0, base, []);
  let moves = 99; patterns.forEach(v => { if (v < moves) moves = v; });
  return { count: patterns.size, moves: patterns.size ? moves : 99 };
}
let compared = 0, nonzero = 0;
for (let i = 0; i < 400; i++) {
  const n = 3 + Math.floor(rnd() * 3), S = 3 + Math.floor(rnd() * 2), W = 3 + Math.floor(rnd() * 5), np = Math.floor(rnd() * 2);
  const all = []; for (let s = -S; s <= S; s++) if (s) all.push(s);
  const sh = all.slice().sort(() => rnd() - 0.5), w = [], pos = [], fp = [];
  for (let k = 0; k < n; k++) { w.push(1 + Math.floor(rnd() * W)); pos.push(sh[k]); fp.push(k < np ? sh[k] : 0); }
  const a = T.solve(w, fp, pos, S, 1e9), b = indep(w, fp, pos, S); compared++; if (b.count) nonzero++;
  ok(a.count === b.count, 'solve 數出的放法數跟獨立窮舉一致：' + JSON.stringify({ w, pos, fp, S }) + ' → ' + a.count + '／' + b.count);
  if (b.count) {
    ok(a.moves === b.moves, 'solve 的「最少要換幾隻」跟獨立窮舉一致：' + a.moves + '／' + b.moves);
    ok(T.torqueOf(w, a.best).net === 0 && a.best.every((s, k) => s !== 0 && (!fp[k] || s === fp[k])) && new Set(a.best).size === n, 'solve 回傳的放法確實平衡、座位不重複、被固定的沒動');
    const diff = a.best.filter((s, k) => !fp[k] && s !== pos[k]).length; ok(diff >= a.moves, 'best 裡換了座位的動物數 ≥ 最少要換的隻數（同重量的動物算同一種，所以可能比較多）');
  } else ok(a.best === null && a.moves === 99, '沒有解：best 是 null');
}
console.log('solve 與獨立窮舉比對了 ' + compared + ' 組（其中有解 ' + nonzero + ' 組）');
ok(nonzero > 100, '比對的題目有一半以上是有解的（' + nonzero + '）');
// 手工：熊 4 在右 1、豬 2 在右 2、狗 2 在左 1：右 4＋4 ＝ 8、左 2（差 6）；平衡的放法有哪些？
{ const r = T.solve([4, 2, 2], [0, 0, 0], [1, 2, -1], 4, 1e9); ok(r.count > 0 && r.moves >= 1 && T.torqueOf([4, 2, 2], r.best).net === 0, '手工：熊4、豬2、狗2 有平衡的放法'); }
{ const r = T.solve([3, 3], [0, 0], [1, -2], 4, 1e9); ok(r.count > 0 && r.moves === 1, '兩隻一樣重：只要把離支點比較遠的那隻移到對稱的座位，換 1 隻（座位 1 與 −2 → 1 與 −1，或 2 與 −2…）：' + r.moves); }
{ const r = T.solve([4, 1], [0, 0], [1, -2], 2, 1e9); ok(r.count === 0, '4×格數 ＝ 1×格數 不可能（座位最多 2 格）→ 沒有解'); }

// ── 整關 ──
let total = 0, moveCount = {}, solsLate = [];
for (let i = 0; i < 1200; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const n = T.nFor(lv), W = T.weightMaxFor(lv), S = T.slotsFor(lv), mr = T.movesRange(lv), np = Math.min(T.pinnedFor(lv), n - 2), t = T.torqueOf(q.weights, q.pos);
  ok(q.n === n && q.weights.length === n && q.pos.length === n && q.kinds.length === n && q.fixed.length === n && q.S === S, '第 ' + lv + ' 關：' + n + ' 隻動物、每邊 ' + S + ' 個座位');
  ok(new Set(q.kinds).size === n && q.kinds.every(k => k >= 0 && k < T.SPECIES.length), '動物種類不重複');
  ok(q.weights.every(w => Number.isInteger(w) && w >= 1 && w <= W) && !q.weights.every(w => w === q.weights[0]), '重量 1～' + W + '（不是每隻一樣重）：' + q.weights);
  ok(q.pos.every(s => Number.isInteger(s) && s !== 0 && Math.abs(s) <= S) && new Set(q.pos).size === n, '座位都在 ±1～±' + S + '、沒有兩隻坐同一個座位：' + q.pos);
  ok(q.pos.some(s => s < 0) && q.pos.some(s => s > 0), '兩邊都有動物');
  ok(q.fixed.filter(Boolean).length === np, '被固定的動物 ' + q.fixed.filter(Boolean).length + ' 隻（目標 ' + np + '）');
  ok(q.net === t.net && Math.abs(q.net) >= 2 && Math.abs(q.net) <= T.DIFF_MAX, '初始力矩差 ' + q.net + ' 在 2～' + T.DIFF_MAX);
  ok(q.sols >= 1 && q.sols <= T.maxSolsFor(lv), '第 ' + lv + ' 關：會平衡的放法 ' + q.sols + ' 種（上限 ' + T.maxSolsFor(lv) + '）');
  ok(q.best && q.best.moves >= mr[0] && q.best.moves <= mr[1], '第 ' + lv + ' 關最少要換 ' + (q.best && q.best.moves) + ' 隻（要 ' + mr + '）');
  ok(T.torqueOf(q.weights, q.best.best).net === 0 && q.best.best.every((s, k) => !q.fixed[k] || s === q.pos[k]), '附的解確實平衡（一定有解）、被固定的動物沒動');
  ok(Math.abs(T.angleFor(q.net)) >= 2 * T.TILT_PER_UNIT && Math.abs(T.angleFor(q.net)) <= T.TILT_MAX, '初始的傾斜角 ' + T.angleFor(q.net) + '° 看得出來、也沒卡在上限外');
  if (i % 12 === 0) { const fp = q.fixed.map((f, k) => f ? q.pos[k] : 0), r = T.solve(q.weights, fp, q.pos, q.S, 1e9); ok(r.count === q.sols || q.sols > T.maxSolsFor(lv), '放法數跟再算一次一致：' + r.count + '／' + q.sols); }
  moveCount[lv >= 24 ? 'late' + q.best.moves : q.best.moves] = (moveCount[lv >= 24 ? 'late' + q.best.moves : q.best.moves] || 0) + 1;
  if (lv >= T.RAMP_LEVELS) solsLate.push(q.sols);
  if (lv === 1) ok(q.n === 3 && q.best.moves === 1, '第 1 關：3 隻動物、換 1 隻的座位就平衡');
}
console.log('最少要換幾隻的分布 ' + JSON.stringify(moveCount) + '；到頂關卡平均 ' + (solsLate.reduce((a, b) => a + b, 0) / solsLate.length).toFixed(1) + ' 種平衡放法');
ok(moveCount.late2 > 100 && moveCount.late3 > 30, '到頂的關卡要換 2～3 隻都有：' + moveCount.late2 + '／' + moveCount.late3);
ok(solsLate.every(s => s <= T.MAX_SOLS[1]) && Math.max(...solsLate) <= T.MAX_SOLS[1], '到頂的關卡，會平衡的放法最多 ' + T.MAX_SOLS[1] + ' 種');
// 到頂的出題夠快
{ for (const lv of [1, 10, 20, 30, 60]) { const t0 = Date.now(); let worst = 0; for (let k = 0; k < 40; k++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 40; console.log('第' + lv + '關出題平均 ' + per.toFixed(1) + ' ms、最慢 ' + worst + ' ms'); ok(per < 60 && worst < 500, '第 ' + lv + ' 關出題夠快'); } }
// 保底題也是好題
{ const q = T.makeLevel(30, () => 0.999999); ok(q.best && q.best.moves >= 1 && Math.abs(q.net) >= 2 && T.torqueOf(q.weights, q.best.best).net === 0, '極端亂數也出得出題（或用保底題）'); }

// ── 彈簧動畫（跟遊戲裡同一個積分公式）：會收斂、有一點彈跳但不會暈 ──
function simulate(a0, tgt, ms) {
  let a = a0, v = 0, maxOver = 0; const dt = 1 / 60;
  for (let t = 0; t < ms / 1000; t += dt) {
    v += (-T.SPRING.omega * T.SPRING.omega * (a - tgt) - 2 * T.SPRING.zeta * T.SPRING.omega * v) * dt; a += v * dt;
    const over = (tgt - a0) !== 0 ? (a - tgt) * Math.sign(tgt - a0) : 0; maxOver = Math.max(maxOver, over);
  }
  return { a, maxOver };
}
{ const r = simulate(-36, 0, 4000); ok(Math.abs(r.a) < 0.01, '彈簧 4 秒後收斂到目標：' + r.a.toFixed(4)); ok(r.maxOver > 0.5 && r.maxOver < 0.25 * 36, '有一點彈跳（過頭 ' + r.maxOver.toFixed(1) + '°，不超過 25%）'); }
{ const r = simulate(0, -12, 3000); ok(Math.abs(r.a + 12) < 0.01, '往另一個目標也收斂'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_seesaw.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3400/.test(src) && /sea-an--move/.test(src) && /sea-ghost/.test(src), '失敗停格 3 秒以上、標出該換座位的動物與目標座位');
  ok(/\.sea-an--move \{[^}]*var\(--c-ok/.test(css) && /\.sea-board \{[^}]*var\(--sea-plank\)/.test(css) && /\.sea-ghost \{[^}]*var\(--c-ok\)/.test(css) && /\.sea-aim \{[^}]*var\(--c-orange\)/.test(css), '綠框、虛線圓圈、木板用 CSS 變數');
  ok(!/stage\.addEventListener/.test(src), '事件監聽放在這一關專用的容器上（不在共用的 stage 上，免得換關後累積）');
  ok(/board\.isConnected/.test(src), '換關後彈簧迴圈會自己停');
  ok(/style\.width = el\.style\.height = sz/.test(src) && /sizeOf\(weights\[i\]\)/.test(src), '動物的大小依重量設定');
  ok(boot.indexOf("'js/reaction_seesaw.js'") > 0 && /傾斜/.test(G.rule) && /越大越重/.test(G.rule) && /離支點越遠/.test(G.rule), 'boot.js 有載入、玩法說明提到越大越重與離支點越遠'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
