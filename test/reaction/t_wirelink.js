// 接電線（wirelink，企劃 222）的純函式檢查：出題一定有解（走遍棋盤的路切成 k 段）、接線規則（不交叉、可收回、可重拖、接通）、難度線性；
// V1.57.3.0（玩家意見：太容易）：出題要讓不同顏色的電線互相干擾——插頭連線互相穿越的比例、繞路、插頭距離、解數；解題器（數解）用暴力列舉對照
// V1.57.3.2（玩家意見：根據一筆填滿／多色填滿的經驗重新構思）：站在人類的立場走一遍（human：路口、要猜的路口、深陷阱、試錯量）；
//   出題改成離線搜尋的題庫（js/wirelink_bank.js）：每一題都剛好只有 1 種解（重新驗證）、結構數字對得上；依難度參數挑題（fromBank）；題庫沒有這種大小才臨時出題（makeFresh）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_wirelink.js'); const T = G.test;
const GEN = require('./gen_wirelink_bank.cjs');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261102), rnd = rng(SEED);
const adj = (n, a, b) => T.adjacent(n, a, b);           // n：數字（正方形）或 { w, h }（長方形）

// ── 難度 ──
{ const a = T.sizeFor(1), b = T.sizeFor(T.RAMP_LEVELS), c = T.sizeFor(99);
  ok(a.w === T.SIZE_W[0] && a.h === T.SIZE_H[0] && b.w === T.SIZE_W[1] && b.h === T.SIZE_H[1] && c.w === b.w && c.h === b.h, '棋盤寬 ' + T.SIZE_W + '、高 ' + T.SIZE_H + '，到頂維持');
  ok(a.w === 5 && a.h === 5 && b.w === 9 && b.h === 11, '第 1 關 5×5、到頂 9×11（玩家指定）');
  // 第 1～30 關會出現的大小，題庫都要有（gen_wirelink_bank.cjs 的 TIERS）
  const sizes = new Set(); for (let l = 1; l <= 30; l++) { const d = T.sizeFor(l); sizes.add(d.w + '×' + d.h); }
  ok([...sizes].every(s => GEN.TIERS.some(c => c.w + '×' + c.h === s)), '第 1～30 關的棋盤大小（' + [...sizes].join('、') + '）題庫都有'); }
ok(T.colorsFor(1) === T.COLORS[0] && T.colorsFor(T.RAMP_LEVELS) === T.COLORS[1] && T.PALETTE.length === 10, '顏色 ' + T.COLORS + '（調色盤 10 種）');
for (let l = 2; l <= 60; l++) ok(T.sizeFor(l).w >= T.sizeFor(l - 1).w && T.sizeFor(l).h >= T.sizeFor(l - 1).h && T.colorsFor(l) >= T.colorsFor(l - 1) && T.timeMs(l) >= T.timeMs(l - 1), '單調 ' + l);
for (let l = 1; l <= 60; l++) { const d = T.sizeFor(l); ok(T.colorsFor(l) * T.MIN_SEG <= d.w * d.h, '第 ' + l + ' 關：每種顏色至少 ' + T.MIN_SEG + ' 格放得下（' + T.colorsFor(l) + ' 種、' + d.w * d.h + ' 格）'); }
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S + ' 秒');
// ── splitLengths ──
for (let i = 0; i < 300; i++) { const k = 2 + Math.floor(rnd() * 6), total = k * 3 + Math.floor(rnd() * 40), lens = T.splitLengths(total, k, 3, rnd); ok(lens.length === k && lens.reduce((a, b) => a + b, 0) === total && lens.every(x => x >= 3), 'splitLengths ' + lens); }
// ── 出題（題庫或臨時出題）：一定有解、電線把棋盤填滿 ──
for (let i = 0; i < 240; i++) {
  const lv = 1 + (i % 40), q = T.makePuzzle(lv, rnd), n = T.sizeFor(lv), k = T.colorsFor(lv);
  ok(q.w === n.w && q.h === n.h && Math.abs(q.k - k) <= 1 && q.plugs.length === q.k && q.solution.length === q.k, '第 ' + lv + ' 關：棋盤 ' + q.w + '×' + q.h + '、顏色 ' + q.k + '（想要 ' + k + '）');
  ok(new Set(q.plugs.map(p => p.c)).size === q.k && q.plugs.every(p => p.c >= 0 && p.c < T.PALETTE.length), '顏色不重複');
  const seen = new Set();
  q.solution.forEach((seg, j) => {
    ok(seg.length >= T.MIN_SEG, '每條電線至少 ' + T.MIN_SEG + ' 格');
    ok(seg[0] === q.plugs[j].a && seg[seg.length - 1] === q.plugs[j].b, '電線兩端就是兩個插頭');
    seg.forEach((cell, t) => { ok(!seen.has(cell), '每一格只屬於一條電線'); seen.add(cell); if (t) ok(adj(n, seg[t - 1], cell), '電線每一步都在相鄰格'); });
  });
  ok(seen.size === n.w * n.h, '電線把整個棋盤填滿：' + seen.size + '／' + n.w * n.h);
}
// ── 照出題的解接完 → 過關；少接一條、少填一格 → 沒過關 ──
function solveAll(q, st, skip) {
  q.plugs.forEach((p, i) => { if (i === skip) return; const c = T.startDraw(st, q.solution[i][0]); ok(c === p.c, 'startDraw 在插頭上回傳那條電線的顏色'); q.solution[i].slice(1).forEach(k => { const a = T.applyDrag(st, c, k); ok(a === 'add' || a === 'connect', '照解走每一步都合法：' + a); }); });
}
for (let i = 0; i < 90; i++) {
  const lv = 1 + (i % 30), q = T.makePuzzle(lv, rnd), st = T.newState(q);
  ok(!T.isSolved(st) && T.linked(st) === 0, '一開始沒過關');
  solveAll(q, st, -1);
  ok(T.isSolved(st) && T.linked(st) === q.k && T.filled(st) === q.w * q.h, '照解接完 → 過關');
  const st2 = T.newState(q); solveAll(q, st2, 0);
  ok(!T.isSolved(st2) && T.linked(st2) === q.k - 1, '少接一條 → 沒過關');
}
// 規則（4×4、2 條電線）：手工擺一題
{ const q = { w: 4, h: 4, k: 2, level: 1, plugs: [{ c: 0, a: 0, b: 3 }, { c: 1, a: 4, b: 7 }], solution: [[0, 1, 2, 3], [4, 5, 6, 7]] }, st = T.newState(q);
  ok(T.startDraw(st, 1) === -1 && T.startDraw(st, 9) === -1, '按在空格或不存在的線上不能開始');
  const c = T.startDraw(st, 0);
  ok(c === 0 && T.applyDrag(st, 0, 1) === 'add' && T.applyDrag(st, 0, 2) === 'add' && st.paths[0].join() === '0,1,2', '從插頭往相鄰空格拖，鋪出電線');
  ok(T.applyDrag(st, 0, 5) === null && T.applyDrag(st, 0, 11) === null && T.applyDrag(st, 0, 0) === null, '不相鄰（斜的、隔太遠）的格子不能鋪');
  ok(T.applyDrag(st, 0, 1) === 'back' && st.paths[0].join() === '0,1' && st.occ[2] === -1, '拖回上一格＝收回一格電線');
  ok(T.applyDrag(st, 0, 5) === 'add' && T.applyDrag(st, 0, 4) === null, '往旁邊空格鋪；別種顏色的插頭（4）擋住，不能穿過');
  ok(T.applyDrag(st, 0, 6) === 'add' && T.applyDrag(st, 0, 7) === null, '別種顏色的插頭（7）也擋住');
  ok(T.startDraw(st, 0) === 0 && st.paths[0].join() === '0' && st.occ[1] === -1 && st.occ[5] === -1 && st.occ[0] === 0 && st.occ[3] === 0, '按在插頭上＝整條電線收回，插頭那一格的顏色還在');
  T.applyDrag(st, 0, 1); T.applyDrag(st, 0, 2); T.applyDrag(st, 0, 3);
  ok(st.done[0] && T.linked(st) === 1 && st.paths[0].join() === '0,1,2,3', '拖到同色的另一個插頭＝接通');
  ok(T.applyDrag(st, 0, 7) === null && T.applyDrag(st, 0, 2) === 'back' && !st.done[0], '接通之後只能往回收；收回之後 done 取消');
  T.applyDrag(st, 0, 3);
  ok(T.startDraw(st, 1) === 0 && st.paths[0].join() === '0,1' && st.occ[2] === -1 && st.occ[3] === 0 && !st.done[0], '按在電線中間（格 1）：那一格之後收回（插頭 3 的顏色不能清掉）、從這裡接著畫'); }
// ── 亂拖：狀態永遠一致（occ 與 paths 對得起來、插頭那格的顏色不會被清掉） ──
for (let rep = 0; rep < 60; rep++) {
  const q = T.makePuzzle(1 + Math.floor(rnd() * 30), rnd), st = T.newState(q), n = q, NN = q.w * q.h;
  let cur = -1;
  for (let step = 0; step < 800; step++) {
    if (cur < 0 || rnd() < 0.05) cur = T.startDraw(st, Math.floor(rnd() * NN));
    else { const head = st.paths[cur].length ? st.paths[cur][st.paths[cur].length - 1] : null; if (head != null) { const nb = [1, -1, q.w, -q.w].map(d => head + d).filter(x => x >= 0 && x < NN); T.applyDrag(st, cur, nb[Math.floor(rnd() * nb.length)]); } }
    if (step % 50 === 0) {
      const owner = new Int8Array(NN).fill(-1);
      Object.keys(st.paths).forEach(c => st.paths[c].forEach((k, t) => { ok(owner[k] === -1, '同一格只屬於一條電線'); owner[k] = Number(c); if (t) ok(adj(n, st.paths[c][t - 1], k), '電線連續相鄰'); }));
      q.plugs.forEach(p => { ok(st.occ[p.a] === p.c && st.occ[p.b] === p.c, '插頭那一格的顏色永遠在'); });
      for (let k = 0; k < NN; k++) if (st.occ[k] >= 0 && st.plugOf[k] == null) ok(owner[k] === st.occ[k], '電線上的格子 occ 與 paths 一致');
      q.plugs.forEach(p => { if (st.done[p.c]) { const pa = st.paths[p.c]; ok(pa[pa.length - 1] !== pa[0] && st.plugOf[pa[pa.length - 1]] === p.c, 'done 的電線尾端是同色插頭'); } });
    }
  }
}
// ═══ 解題器 ═══
// 暴力列舉：一種顏色一種顏色地列出「從插頭 a 走到插頭 b 的所有路」，剩下的格子留給後面的顏色，數有幾種把整塊板子填滿的接法（只給小棋盤對照解題器）
function bruteCount(n, pairs) {
  const D = T.dims(n), N = D.w * D.h, owner = new Int8Array(N).fill(-1), nb = i => T.neighbors(D, i);
  pairs.forEach((p, c) => { owner[p[0]] = c; owner[p[1]] = c; });
  let cnt = 0;
  function colorRec(c, free) {
    if (c === pairs.length) { if (free === 0) cnt++; return; }
    const a = pairs[c][0], b = pairs[c][1];
    (function walk(cur, f) {
      for (const x of nb(cur)) {
        if (x === b) { colorRec(c + 1, f); continue; }
        if (owner[x] >= 0) continue;
        owner[x] = c; walk(x, f - 1); owner[x] = -1;
      }
    })(a, free);
  }
  colorRec(0, N - 2 * pairs.length);
  return cnt;
}
const hamOk = (n, P) => { const D = T.dims(n), N = D.w * D.h, seen = new Set(P); return P.length === N && seen.size === N && P.every((c, i) => c >= 0 && c < N && (i === 0 || adj(n, P[i - 1], c))); };
// randomHam：真的是「走遍棋盤每一格剛好一次」的路，而且被打亂了（不是蛇形）
for (let n = 3; n <= 10; n++) for (let i = 0; i < 12; i++) {
  const P = T.randomHam(n, rnd), snake = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) snake.push(r * n + (r % 2 ? n - 1 - c : c));
  ok(hamOk(n, P), 'randomHam ' + n + '×' + n + ' 是走遍棋盤的路');
  if (n >= 5) ok(P.join() !== snake.join(), 'randomHam 不是原本的蛇形（被打亂了）');
}
ok(hamOk(1, T.randomHam(1, rnd)) && hamOk(2, T.randomHam(2, rnd)), 'randomHam：1×1、2×2 也不會壞');
for (const D of [{ w: 5, h: 6 }, { w: 7, h: 9 }, { w: 9, h: 12 }, { w: 3, h: 7 }]) for (let i = 0; i < 6; i++) ok(hamOk(D, T.randomHam(D, rnd)), 'randomHam：長方形 ' + D.w + '×' + D.h + ' 也是走遍棋盤的路');
// 長方形棋盤：flowSolve 跟暴力列舉一致
for (let rep = 0; rep < 60; rep++) {
  const D = [{ w: 3, h: 4 }, { w: 4, h: 3 }, { w: 3, h: 5 }][rep % 3], N = D.w * D.h, k = 2 + (rep % 2), P = T.randomHam(D, rnd);
  const lens = T.splitLengths(N, k, 3, rnd), starts = []; let a = 0; lens.forEach(l => { starts.push(a); a += l; });
  const m = T.metrics(D, P, starts), bc = bruteCount(D, m.pairs), fs2 = T.flowSolve(D, m.pairs, { limit: 1000, budget: 1e7 });
  ok(!fs2.aborted && fs2.count === bc && bc >= 1, 'flowSolve 長方形 ' + D.w + '×' + D.h + '、' + k + ' 條：解數 ' + fs2.count + ' ＝ 暴力列舉 ' + bc);
}
// 距離與「連線互相穿越」
ok(T.manhattan(5, 0, 24) === 8 && T.manhattan(5, 7, 7) === 0 && T.manhattan(5, 2, 10) === 2 + 2 && T.manhattan(4, 3, 12) === 6, 'manhattan：上下左右走幾步');
{ const n = 5, cell = (r, c) => r * n + c;
  ok(T.segCross(n, cell(0, 0), cell(4, 4), cell(0, 4), cell(4, 0)) === true, '兩條對角線（X）互相穿越');
  ok(T.segCross(n, cell(0, 0), cell(0, 4), cell(2, 0), cell(2, 4)) === false, '平行的兩條不穿越');
  ok(T.segCross(n, cell(0, 0), cell(2, 2), cell(2, 2), cell(4, 0)) === false, '只是端點碰到不算穿越');
  ok(T.segCross(n, cell(0, 0), cell(4, 0), cell(2, 0), cell(2, 3)) === false, '一條的端點落在另一條線上（T 字）不算穿越'); }
// metrics：手工一題（4×4 蛇形切三段：0～4、5～9、10～15）
{ const n = 4, P = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) P.push(r * n + (r % 2 ? n - 1 - c : c));
  const m = T.metrics(n, P, [0, 5, 10]);
  ok(m.pairs.length === 3 && m.lens.join() === '5,5,6' && m.pairs[0].join() === P[0] + ',' + P[4] && m.pairs[2].join() === P[10] + ',' + P[15], 'metrics：插頭與長度');
  ok(m.crossFrac >= 0 && m.crossFrac <= 1 && m.minDist >= 1 && m.meanDist >= m.minDist && m.detour > 0 && m.easy >= 0 && m.easy <= 1, 'metrics：指標在合理範圍'); }
// countSolutions、flowSolve：跟暴力列舉一致
{ let agree = 0, multi = 0, uniq = 0;
  for (let rep = 0; rep < 160; rep++) {
    const n = 3 + (rep % 3), k = 2 + (rep % 3), P = T.randomHam(n, rnd);
    if (k * T.MIN_SEG > n * n) continue;
    const lens = T.splitLengths(n * n, k, 3, rnd), starts = []; let a = 0; lens.forEach(l => { starts.push(a); a += l; });
    const m = T.metrics(n, P, starts), bc = bruteCount(n, m.pairs), sv = T.countSolutions(n, m.pairs, 1000, 1e7), fs2 = T.flowSolve(n, m.pairs, { limit: 1000, budget: 1e7 });
    ok(!sv.aborted && sv.count === bc, 'countSolutions ' + n + '×' + n + '、' + k + ' 條：解數 ' + sv.count + ' ＝ 暴力列舉 ' + bc);
    ok(!fs2.aborted && fs2.count === bc, 'flowSolve ' + n + '×' + n + '、' + k + ' 條：解數 ' + fs2.count + ' ＝ 暴力列舉 ' + bc); if (fs2.count === bc) agree++;
    ok([1, 2].every(lv => T.flowSolve(n, m.pairs, { limit: 1000, budget: 1e7, level: lv }).count === bc), 'flowSolve 剪枝 level 1、2 解數也一樣');
    if (bc === 1) uniq++; if (bc > 1) multi++;
    const f1 = T.flowSolve(n, m.pairs, { limit: 1 }).first; ok(f1 && f1.length === k && f1.every((pa, c) => pa[0] === m.pairs[c][0] && pa[pa.length - 1] === m.pairs[c][1] && pa.every((x, t) => t === 0 || adj(n, pa[t - 1], x))), 'flowSolve 的第一個解：每條從插頭 a 走到 b、每一步相鄰');
  }
  ok(agree >= 100 && multi > 0 && uniq > 0, '解題器對照：一致 ' + agree + ' 題，其中多解 ' + multi + '、唯一解 ' + uniq);
  ok(T.countSolutions(2, [[0, 3], [1, 2]], 10, 1e5).count === 0 && T.flowSolve(2, [[0, 3], [1, 2]], { limit: 10 }).count === 0 && bruteCount(2, [[0, 3], [1, 2]]) === 0, '2×2 兩對插頭交叉擺：無解');
  ok(T.flowSolve(3, [[0, 8]], { limit: 5 }).count === Math.min(5, bruteCount(3, [[0, 8]])), '3×3 一條線走遍全板（0→8）：解數與暴力列舉相符');
  ok(T.flowSolve(7, [[0, 48], [3, 45]], { limit: 5, budget: 20 }).aborted === true, '搜尋量超過上限 → aborted');
  // 從「畫了一部分」接著搜：兩頭各畫一段
  const pairs = [[0, 2], [3, 5], [6, 8]];      // 3×3 三條橫線
  ok(T.flowSolve(3, pairs, { limit: 9 }).count === bruteCount(3, pairs), '3×3 三條橫線：解數跟暴力列舉一樣');
  ok(T.flowSolve(3, pairs, { paths: [[[0, 1], [2]], [[3], [5]], [[6], [8]]], limit: 9 }).count === 1, '第 0 條已經畫到 1：剩下只有一種接法');
  { const st = { paths: [[[0], [2]], [[3, 4, 1], [5]], [[6], [8]]], check: true };   // 第 1 條（中間那條）繞上去佔了 1：第 0 條的兩頭（0 和 2）再也連不起來
    ok(T.flowSolve(3, pairs, Object.assign({ level: 1 }, st)).ok === true && T.flowSolve(3, pairs, Object.assign({ level: 2 }, st)).ok === false, 'check：level 1 只看死巷（看不出錯）、level 2 再看兩頭連不連得起來（看得出錯）'); }
  ok(T.flowSolve(3, pairs, { paths: [[[0, 1], [2]], [[3], [5]], [[6], [8]]], done: [1, 0, 0], limit: 9 }).count === 1, 'done：第 0 條已經接通，其他兩條接著搜');
  { const pr = [[0, 3]], bc = bruteCount(4, pr), kept = T.flowSolve(4, pr, { limit: 50, keep: 3 }); ok(bc >= 3 && kept.sols.length === 3 && new Set(kept.sols.map(s => s[0].join())).size === 3, 'keep：4×4 一條線走遍全板有 ' + bc + ' 種走法，留下 3 個不同的解'); } }

// ═══ 站在人類的立場走一遍（human）═══
{ // 3×3 三條橫線：每一步都沒得選（線頭前面只有一格），沒有路口
  const h = T.human(3, [[0, 2], [3, 5], [6, 8]], [[0, 1, 2], [3, 4, 5], [6, 7, 8]], { detail: true });
  ok(h.guess === 0 && h.deep === 0 && h.hx >= 9 - 3, '3×3 三條橫線：沒有要猜的路口（' + JSON.stringify({ raw: h.raw, guess: h.guess, hx: h.hx }) + '）'); }
{ // 舊的臨時出題法 vs 題庫：同樣大小，題庫的題目要猜的路口多很多（而且題庫的題目都只有 1 種解）
  let bankG = 0, bankN = 0, freshG = 0, freshN = 0, freshMulti = 0;
  for (let lv = 14; lv <= 30; lv += 2) for (let r = 0; r < 3; r++) {
    const qb = T.makePuzzle(lv, rnd); if (qb.info.fromBank) { bankG += qb.info.guess; bankN++; }
    const qf = T.makeFresh(lv, rnd), pl = qf.plugs.map(p => [p.a, p.b]), u = T.flowSolve(qf, pl, { limit: 2, budget: 300000 });
    if (u.count === 1 && !u.aborted) { freshG += T.human(qf, pl, qf.solution).guess; freshN++; } else freshMulti++;
  }
  ok(bankN >= 20, '第 14～30 關都從題庫挑（' + bankN + ' 題）');
  ok(bankG / bankN > (freshN ? freshG / freshN : 0) + 2, '題庫的題目平均要猜 ' + (bankG / bankN).toFixed(1) + ' 個路口，舊出題法（只算唯一解的 ' + freshN + ' 題）' + (freshN ? (freshG / freshN).toFixed(1) : '-') + ' 個；舊出題法另外 ' + freshMulti + ' 題不只一種解'); }

// ═══ 題庫（js/wirelink_bank.js）：每一題重新驗證 ═══
const BANK = T.bank();
ok(Array.isArray(BANK) && BANK.length === GEN.TIERS.length, '題庫有 ' + GEN.TIERS.length + ' 級（' + BANK.length + '）');
{ const keys = new Set(); let total = 0;
  BANK.forEach((list, t) => {
    const cfg = GEN.TIERS[t];
    ok(list.length >= 8, '第 ' + t + ' 級至少 8 題（' + list.length + '）');
    list.forEach((e, i) => {
      const tag = '第 ' + t + ' 級第 ' + i + ' 題 ', d = T.decodeBank(e), n = { w: d.w, h: d.h }, N = n.w * n.h, segs = d.segs, k = segs.length; total++;
      const cov = new Set(); segs.forEach(s => s.forEach(x => cov.add(x)));
      ok(n.w === cfg.w && n.h === cfg.h && cov.size === N && segs.reduce((a, s) => a + s.length, 0) === N && segs.every(s => s.every((x, j) => x >= 0 && x < N && (j === 0 || adj(n, s[j - 1], x)))), tag + n.w + '×' + n.h + '、電線剛好蓋滿棋盤、每一步相鄰');
      ok(k === e.k && k >= cfg.kr[0] && k <= cfg.kr[1] && segs.every(s => s.length >= T.MIN_SEG), tag + k + ' 種顏色、每條至少 ' + T.MIN_SEG + ' 格');
      const plugs = segs.map(s => [s[0], s[s.length - 1]]), P = [], starts = []; segs.forEach(s => { starts.push(P.length); s.forEach(x => P.push(x)); });
      const u = T.flowSolve(n, plugs, { limit: 2, budget: 3e6 });
      const maxSol = cfg.maxSol || 1, u3 = maxSol > 1 ? T.flowSolve(n, plugs, { limit: maxSol + 1, budget: 3e6 }) : u;
      ok(!u.aborted && !u3.aborted && u3.count <= maxSol && u3.count === (e.c || 1), tag + (maxSol > 1 ? '解數 ' + u3.count + '（最多 ' + maxSol + ' 種，題庫記 ' + e.c + '）' : '剛好只有 1 種解（' + u.count + (u.aborted ? '，搜尋中止' : '') + '）'));
      const h = T.human(n, plugs, segs), mt = T.metrics(n, P, starts);
      ok(h.hx === e.e && ['raw', 'dec', 'd3', 'bits', 'guess', 'deep', 'trap'].every(key => h[key] === e.m[key]), tag + '人類視角的數字對得上：' + JSON.stringify(e.m) + ' 試錯量 ' + e.e + '／' + h.hx);
      ok(Math.abs(mt.crossFrac - e.m.cf) < 0.006 && Math.abs(mt.detour - e.m.dt) < 0.006 && mt.minDist === e.m.md && Math.abs(mt.easy - e.m.ez) < 0.006, tag + '干擾指標對得上');
      ok(GEN.viol(0, e.m, N) === 0, tag + '過了「寬鬆」的結構要求');
      // 翻轉旋轉：解數、路口、要猜的路口不變
      if (i < 2 && !(cfg.maxSol > 1)) for (let tt = 1; tt < 8; tt++) { const n2 = tt % 2 ? { w: n.h, h: n.w } : n, f = x => T.transformCell(n, x, tt), segs2 = segs.map(s => s.map(f)), pl2 = segs2.map(s => [s[0], s[s.length - 1]]), u2 = T.flowSolve(n2, pl2, { limit: 2, budget: 3e6 }), h2 = T.human(n2, pl2, segs2); ok(u2.count === 1 && h2.raw === h.raw && h2.guess === h.guess, tag + '翻轉旋轉 ' + tt + '：一樣只有 1 種解、路口 ' + h2.raw + '、要猜 ' + h2.guess); }
      const key = plugs.map(p => p.slice().sort((a, b) => a - b).join('-')).sort().join(',');
      let best = null; for (let tt = 0; tt < 8; tt++) { const f = x => T.transformCell(n, x, tt), kk = plugs.map(p => [f(p[0]), f(p[1])].sort((a, b) => a - b).join('-')).sort().join(','); if (best === null || kk < best) best = kk; }
      ok(!keys.has(best), tag + '沒有重複（翻轉旋轉之後一樣也算重複）'); keys.add(best); void key;
    });
  });
  ok(total >= 150, '題庫共 ' + total + ' 題'); }
// transformCell：8 種都是一對一；轉 4 次回到原位
for (const D of [2, 5, 9, { w: 5, h: 6 }, { w: 9, h: 12 }, { w: 3, h: 7 }].map(T.dims)) for (let t = 0; t < 8; t++) { const s = new Set(); for (let x = 0; x < D.w * D.h; x++) { const y = T.transformCell(D, x, t); if (y >= 0 && y < D.w * D.h) s.add(y); } ok(s.size === D.w * D.h, 'transformCell ' + D.w + '×' + D.h + ' 第 ' + t + ' 種是一對一'); }
{ const D = { w: 5, h: 6 }, D2 = { w: 6, h: 5 }; for (let x = 0; x < 30; x++) { const y = T.transformCell(D, x, 1); ok(adj(D2, T.transformCell(D, 0, 1), T.transformCell(D, 1, 1)) && T.transformCell(D2, y, 3) === x, '長方形轉 90 度再轉 270 度回到原位、相鄰的還是相鄰'); } }
{ let x = 7; for (let i = 0; i < 4; i++) x = T.transformCell(5, x, 1); ok(x === 7 && T.transformCell(5, T.transformCell(5, 7, 4), 4) === 7 && T.transformCell(5, 7, 0) === 7, 'transformCell：轉 4 次 90 度、翻兩次都回到原位'); }

// ═══ 依難度參數挑題（fromBank）═══
{ const flat = []; BANK.forEach((l, t) => l.forEach(e => flat.push(e)));
  const scoreOf = (e, w) => T.violation(e, w) * 8 + Math.abs(e.k - w.k) * 2.5 + Math.abs(Math.log(1 + e.e) - Math.log(1 + w.e)) / 0.5;
  for (let rep = 0; rep < 120; rep++) {
    const sz = GEN.TIERS[Math.floor(rnd() * GEN.TIERS.length)], flip = rnd() < 0.3, n = flip ? { w: sz.h, h: sz.w } : { w: sz.w, h: sz.h }, w = { w: n.w, h: n.h, k: sz.kr[0] + Math.floor(rnd() * 2), e: Math.exp(3 + rnd() * 5), min: { raw: Math.floor(rnd() * 25), guess: Math.floor(rnd() * 12), deep: Math.floor(rnd() * 10), cf: rnd() * 0.9, md: 2 + Math.floor(rnd() * 3) }, max: { trap: 10 + Math.floor(rnd() * 40), ez: rnd() * 0.4 } };
    const same = flat.filter(e => (e.w === n.w && e.h === n.h) || (e.w === n.h && e.h === n.w)), q = T.fromBank(1, rnd, w);
    if (!same.length) { ok(q === null, '題庫沒有 ' + n.w + '×' + n.h + '：回傳 null（改成臨時出題）'); continue; }
    const best = Math.min(...same.map(e => scoreOf(e, w)));
    ok(q && q.w === n.w && q.h === n.h && q.info.fromBank && Math.abs(scoreOf(flat[q.info.idx], w) - q.info.score) < 1e-9 && q.info.score <= best + 0.6 + 1e-9, '挑題：' + n.w + '×' + n.h + (flip ? '（橫的，題庫是直的，要轉 90 度）' : '') + '，評分算得對、跟最好的相差在 0.6 之內');
    if (q) { const cov = new Set(); q.solution.forEach(s => s.forEach((x, j) => { cov.add(x); if (j) ok(adj(q, s[j - 1], x), '轉過的答案每一步都相鄰'); })); ok(cov.size === q.w * q.h, '轉過的答案剛好蓋滿 ' + q.w + '×' + q.h); }
    if (q && q.info.viol === 0) { Object.keys(w.min).forEach(key => { const v = { raw: q.info.raw, guess: q.info.guess, deep: q.info.deep, cf: q.info.crossFrac, md: q.info.minDist }[key]; ok(v >= w.min[key] - 1e-9, '挑到的題目 ' + key + ' ＝ ' + v + ' ≥ ' + w.min[key]); }); ok(q.info.trap <= w.max.trap && q.info.easy <= w.max.ez + 1e-9, '挑到的題目最深陷阱、最短路線就是答案的比例沒超過'); }
  }
  // 條件寬鬆時，連續兩關不會出同一題
  { let prev = -1, rep = 0; const w = { w: 7, h: 8, k: 6, e: 250, min: {}, max: {} }; for (let i = 0; i < 60; i++) { const q = T.fromBank(1, rnd, w); if (q.info.idx === prev) rep++; prev = q.info.idx; } ok(rep === 0, '連續兩關不會出同一題（重複 ' + rep + ' 次）'); }
  // 條件一調嚴，挑到的題目跟著變：要求要猜的路口很多 → 平均要猜的路口變多
  { const base = { w: 8, h: 10, k: 8, e: 600, min: {}, max: {} }, hard = { w: 8, h: 10, k: 8, e: 600, min: { guess: 15, deep: 14 }, max: {} };
    let a = 0, b = 0; for (let i = 0; i < 30; i++) { a += T.fromBank(1, rnd, base).info.guess; b += T.fromBank(1, rnd, hard).info.guess; }
    ok(b / 30 > a / 30 + 1, '要求要猜的路口 ≥ 15：平均要猜 ' + (a / 30).toFixed(1) + ' → ' + (b / 30).toFixed(1)); } }
// 遊戲用的難度參數：每一個都是 [第 1 關, 到頂]；wantFor 兩端對得上
['HUMAN_EFFORT', 'FORK_MIN', 'GUESS_MIN', 'FORK3_MIN', 'DEEP_TRAP_MIN', 'TRAP_MAX', 'CROSS_MIN', 'DETOUR_MIN', 'DIST_MIN', 'EASY_MAX', 'SIZE_W', 'SIZE_H', 'COLORS', 'TIME_S'].forEach(nm => { const a = T[nm]; ok(Array.isArray(a) && a.length === 2 && a.every(x => typeof x === 'number' && isFinite(x)), nm + ' 是 [第 1 關, 到頂]（' + a + '）'); });
{ const w1 = T.wantFor(1), wc = T.wantFor(T.RAMP_LEVELS);
  ok(Math.abs(w1.e - T.HUMAN_EFFORT[0]) < 1e-6 && Math.abs(wc.e - T.HUMAN_EFFORT[1]) < 1e-6 && w1.w === T.SIZE_W[0] && w1.h === T.SIZE_H[0] && wc.w === T.SIZE_W[1] && wc.h === T.SIZE_H[1], '人類試錯量、棋盤寬高：兩端對得上');
  ok(w1.min.raw === T.FORK_MIN[0] && wc.min.raw === T.FORK_MIN[1] && w1.min.guess === T.GUESS_MIN[0] && wc.min.guess === T.GUESS_MIN[1] && w1.min.deep === T.DEEP_TRAP_MIN[0] && wc.min.deep === T.DEEP_TRAP_MIN[1] && w1.max.trap === T.TRAP_MAX[0] && wc.max.trap === T.TRAP_MAX[1] && w1.min.d3 === T.FORK3_MIN[0], '路口、要猜、深陷阱、最深陷阱、三岔：兩端對得上');
  ok(Math.abs(w1.min.cf - T.CROSS_MIN[0]) < 1e-9 && w1.min.md === T.DIST_MIN[0] && Math.abs(wc.max.ez - T.EASY_MAX[1]) < 1e-9, '干擾要求也是挑題條件'); }
// 題庫沒有這種大小的棋盤：臨時出題
{ const keep = T.SIZE_W[1]; T.SIZE_W[1] = 10; const q = T.makePuzzle(T.RAMP_LEVELS, rnd); T.SIZE_W[1] = keep;
  ok(q.w === 10 && q.h === T.SIZE_H[1] && !q.info.fromBank && q.tries >= 1, '棋盤寬調到 10（題庫沒有 10×12）→ 臨時出題'); }
// ═══ 舊的臨時出題法（makeFresh）：互相干擾 ═══
for (let i = 0; i < 40; i++) {
  const lv = 1 + (i % 24), q = T.makeFresh(lv, rnd), n = q, w = T.wantFor(lv);
  ok(q.info && q.want && q.tries >= 1 && q.tries <= T.TRIES, '臨時出題第 ' + lv + ' 關：info／want／tries（' + q.tries + '）');
  ok(q.info.solutions >= 1 && q.info.solutions <= T.SOL_LIMIT + 1, '解數 ' + q.info.solutions + ' 在 1～' + (T.SOL_LIMIT + 1));
  const P = [], starts = []; let acc = 0; q.solution.forEach(seg => { starts.push(acc); seg.forEach(c => P.push(c)); acc += seg.length; });
  const m = T.metrics(n, P, starts);
  ok(Math.abs(m.crossFrac - q.info.crossFrac) < 1e-9 && Math.abs(m.detour - q.info.detour) < 1e-9 && m.minDist === q.info.minDist && q.info.minDist >= 2, 'info 跟答案實際量出來的一致、沒有緊貼的插頭');
  void w;
}
{ let better = 0, total = 0;
  for (let rep = 0; rep < 30; rep++) {
    const n = 5 + (rep % 5), k = 4 + (rep % 5), P = T.randomHam(n, rnd), want = T.wantFor(20), starts = T.pickCuts(n, P, k, T.MIN_SEG, want, rnd, 200);
    ok(starts.length === k && starts[0] === 0 && starts.every((v, i) => i === 0 || v - starts[i - 1] >= T.MIN_SEG) && n * n - starts[k - 1] >= T.MIN_SEG, 'pickCuts：切點合法');
    const lens = T.splitLengths(n * n, k, T.MIN_SEG, rnd), rs = []; let acc = 0; lens.forEach(l => { rs.push(acc); acc += l; });
    total++; if (T.hardness(T.metrics(n, P, starts), n, want) > T.hardness(T.metrics(n, P, rs), n, want)) better++;
  }
  ok(better >= total * 0.9, 'pickCuts 的切法比隨機切更「互相干擾」（' + better + '／' + total + '）'); }
ok(T.TRIES >= T.MIN_TRIES && T.MIN_TRIES >= 1 && T.SOL_LIMIT >= 2 && T.SOL_NODES >= 500 && T.TIME_GUARD_MS > 0, '臨時出題的試做次數、數解上限、時間保險都是正數');
ok(T.SIZE_W[1] <= 9 && T.SIZE_H[1] <= 12 && T.PALETTE.length >= T.COLORS[1], '棋盤最大 9×12（每格至少 48px 才好拖）、調色盤夠用');
// ── 效能：從題庫挑題要很快 ──
{ const t0 = Date.now(); for (let i = 0; i < 60; i++) T.makePuzzle(1 + (i % 30), rnd); const per = (Date.now() - t0) / 60; console.log('出題平均 ' + per.toFixed(1) + ' 毫秒'); ok(per < 30, '從題庫挑題夠快：' + per.toFixed(1) + ' 毫秒'); }
// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_wirelink.js'), css = rd('../../css/games/reaction_wirelink.css').replace(/[ \t]*\/\*[\s\S]*?\*\//g, '').split(/\s+/).join(' '), theme = rd('../../css/theme.css'), boot = rd('../../js/boot.js');
  ok(/stageClass: 'wirelink-stage'/.test(src) && /\.wirelink-stage \{ touch-action: none;/.test(css), '舞台不捲動');
  ok(/\.screen:has\(> \.wirelink-stage\) \{ gap: 4px; \}/.test(css) && /topPad = 26/.test(src), '上方三行靠緊（只對接電線）、盤面從 26px 開始');
  for (let i = 0; i < 10; i++) ok(new RegExp('--wlk-' + i + ': hsl').test(theme) && new RegExp('\\.wirelink-c' + i + ' \\{ --wc: var\\(--wlk-' + i + '\\); \\}').test(css), '電線顏色 ' + i + ' 有 CSS 變數');
  ok(/api\.fail\(\{ delay: 3000/.test(src) && /wirelink-board--lit/.test(src), '失敗停格 3 秒、全部接好整塊板子亮燈');
  ok(boot.indexOf("'js/reaction_wirelink.js'") > 0 && boot.indexOf("'js/wirelink_bank.js'") > 0 && boot.indexOf("'js/wirelink_bank.js'") < boot.indexOf("'js/reaction_wirelink.js'"), 'boot.js 有載入題庫（在遊戲檔之前）與遊戲檔'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
