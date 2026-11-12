// 六角著色（hexcolor）：關卡規格（線性）、各色格數、解題器（跟暴力窮舉對照）、出題（第 1～30 關＋到頂之後抽 3 關）（答案合法、預填跟答案一致、
// 唯一解的關卡用「研究工具的另一個解題器」完整數完＝1 種）、陷阱挑法（同色預填避開「隔一格」花樣、各色平均）、
// 相鄰同色／「！」警示／過關判斷、記號彈窗的顏色組合、限時、檔案規矩（沒有 resume:false、提示只在前 4 關、CSS 用變數）
// V1.56.0 玩家意見（照「固定間隔」擺就能解完太無聊）：規律花樣（三色 6 種、四色 120 種）、答案不能太像規律花樣、預填要分散、預填要看不出規律、三色形狀不能是一整塊剛體
const { game, rng, seedOf } = require('./load.js');
const fs = require('fs'), path = require('path');
const G = game('reaction_hexcolor.js'); const T = G.test;
const L = require('../hexcolor/lab.cjs');              // 研究工具的解題器：拿來當「第三方」數解，不跟遊戲共用程式
let bad = 0, checks = 0; const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261108);

// ── 登記資料 ──
ok(G.id === 'hexcolor' && G.name === '六角著色' && [...G.name].length <= 5, '登記資料：id、名稱（最多 5 個字）');
ok((G.rule.match(/\*\*/g) || []).length % 2 === 0 && /\*\*/.test(G.rule), '玩法說明有成對的 **重點**');
ok(G.score.better === 'max' && G.score.min === 1 && G.score.max === T.MAX_LEVEL, '成績：越多關越好、1～' + T.MAX_LEVEL + ' 關');

// ── 關卡規格（每一項都是線性；測試跟著參數走：K3_TO＝三色入門到第幾關、RAMP_LEVELS＝難度到頂、MAX_LEVEL＝紀錄到頂）──
const sp = lv => T.specFor(lv), F = T.K3_TO + 1, MX = T.RAMP_LEVELS;    // F：4 色的第一關；MX：難度到頂的那一關
ok(T.RAMP_LEVELS === 30 && T.MAX_LEVEL === 90, '難度第 ' + T.RAMP_LEVELS + ' 關到頂、紀錄到第 ' + T.MAX_LEVEL + ' 關（全站 30／90）');
for (let l = MX + 1; l <= T.MAX_LEVEL; l++) ok(JSON.stringify(sp(l)) === JSON.stringify(sp(MX)) && T.timeFor(l, 40) === T.timeFor(MX, 40), '第 ' + l + ' 關維持到頂的難度與限時');
ok(Array.from({ length: T.K3_TO }, (_, i) => i + 1).every(l => sp(l).k === 3 && sp(l).compact === T.K3_COMPACT && sp(l).unique), '第 1～' + T.K3_TO + ' 關：三色入門、唯一解、形狀緊密度 ' + T.K3_COMPACT);
ok(T.K3_COMPACT < 3, '三色入門不用實心形狀（3 色的實心盤面只有一種規律塗法，預填怎麼挑都是無腦照擺）');
ok(T.coverAt(1) === T.COVER_D[0] && T.coverAt(MX) === T.COVER_D[1] && T.coverAt(T.MAX_LEVEL) === T.COVER_D[1] && sp(1).cover === T.COVER_D[0] && sp(MX).cover === T.COVER_D[1], '預填分散的距離上限 ' + T.COVER_D + '（第 1 關 → 第 ' + MX + ' 關）');
for (let l = 2; l <= MX; l++) ok(T.coverAt(l) >= T.coverAt(l - 1), '預填分散的距離上限不會變小（第 ' + l + ' 關）');
ok(sp(1).n === T.N3[0] && sp(T.K3_TO).n === T.N3[1] && sp(1).extra === T.EXTRA3[0] && sp(T.K3_TO).extra === T.EXTRA3[1], '三色入門：格數 ' + T.N3 + '、暖身預填 ' + T.EXTRA3);
// V1.51 玩家意見：第 3 關太簡單、只有 2 格預填 → 第 3 關改成 4 色自由擺，預填 9 格
ok(sp(3).k === 4 && !sp(3).unique && sp(3).fill >= 9, '第 3 關：4 色自由擺、預填 ' + sp(3).fill + ' 格（舊版 3 色只有 2 格）');
ok(sp(F).k === 4 && sp(F).n === T.N4[0] && sp(MX).n === T.N4[1], '4 色：第 ' + F + ' 關 ' + T.N4[0] + ' 格 → 第 ' + MX + ' 關 ' + T.N4[1] + ' 格');
for (let l = F + 1; l <= MX; l++) ok(sp(l).n >= sp(l - 1).n, '格數不會變少（第 ' + l + ' 關）');
ok(Math.abs(sp(F).rare - T.RARE[0]) < 1e-9 && Math.abs(sp(T.RARE_AT).rare - T.RARE[1]) < 1e-9 && Math.abs(sp(MX).rare - T.RARE[1]) < 1e-9, '最少那色的比例：' + T.RARE[0] + ' → 第 ' + T.RARE_AT + ' 關 ' + T.RARE[1] + '，之後維持');
ok(Math.abs(sp(12).rare - (T.RARE[0] + (T.RARE[1] - T.RARE[0]) * (12 - F) / (T.RARE_AT - F))) < 1e-9, '比例是線性的（第 12 關）');
ok(sp(F).compact === 2 && sp(MX).compact === 3, '緊密度 2 → 3');
ok([F, F + 1, T.FREE_TO].every(l => !sp(l).unique) && [T.FREE_TO + 1, 20, 30, MX].every(l => sp(l).unique), '第 ' + F + '～' + T.FREE_TO + ' 關自由擺、第 ' + (T.FREE_TO + 1) + ' 關起唯一解');
ok(sp(F).fill === Math.round(T.N4[0] * T.FREE_FILL[0]) && sp(T.FREE_TO).fill === Math.round(sp(T.FREE_TO).n * T.FREE_FILL[1]), '自由擺的預填 ' + T.FREE_FILL);
ok(sp(T.FREE_TO + 1).extra === T.EXTRA4[0] && sp(MX).extra === T.EXTRA4[1] && sp(F).extra === 0, '唯一解的暖身預填 ' + T.EXTRA4);
ok(T.specFor(0).n === sp(1).n && T.specFor(T.MAX_LEVEL + 9).n === sp(MX).n, '關卡超出範圍時夾在 1～' + T.MAX_LEVEL);

// ── 各色格數 ──
for (const [n, k, r] of [[30, 4, 0.25], [75, 4, 0.15], [58, 4, 0.15], [47, 4, 0.2]]) {
  const c = T.countsFor(n, k, r), main = c.slice(0, k - 1);
  ok(c.reduce((a, b) => a + b, 0) === n && c[k - 1] === Math.round(n * r) && Math.max(...main) - Math.min(...main) <= 1, '各色格數 ' + n + ' 格、' + r + '：' + c.join(':'));
}

// ── 解題器 vs 暴力窮舉（小盤面：中間一格＋六個鄰居、一排 5 格、兩排 3＋3）──
function brute(nbrs, k, counts, given) {
  const n = nbrs.length, col = new Array(n).fill(-1); let cnt = 0;
  (function rec(i) {
    if (i === n) { const t = new Array(k).fill(0); col.forEach(c => t[c]++); if (t.every((v, c) => v === counts[c])) cnt++; return; }
    for (let c = 0; c < k; c++) {
      if (given[i] >= 0 && given[i] !== c) continue;
      if (nbrs[i].some(j => j < i && col[j] === c)) continue;
      col[i] = c; rec(i + 1); col[i] = -1;
    }
  })(0);
  return cnt;
}
const Core = global.HexColorCore;
const shapes = [
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2]]
];
let engineCases = 0;
for (const cells of shapes) {
  const Gr = Core.buildGraph(cells), n = cells.length;
  for (const k of [3, 4]) {
    // 列出所有「總和＝格數」的各色格數，各給空盤與一格預填
    const all = [];
    (function rec(i, left, cur) { if (i === k - 1) { all.push(cur.concat(left)); return; } for (let v = 0; v <= left; v++) rec(i + 1, left - v, cur.concat(v)); })(0, n, []);
    for (const counts of all) {
      for (const g of [new Int8Array(n).fill(-1), Int8Array.from({ length: n }, (_, i) => i === 0 ? 0 : -1)]) {
        const want = brute(Gr.nbrs, k, counts, g);
        const E = T.makeEngine(Gr.nbrs, k), got = E.count(g, counts, 1e9, 1e9);
        ok(got.found === want && !got.aborted, '解題器＝暴力窮舉：' + n + ' 格 ' + k + ' 色 ' + counts.join(':') + '（' + got.found + ' vs ' + want + '）');
        got.sols.forEach(s => ok(T.isSolved(s, Gr.nbrs, counts), '解題器找到的每一個解都合法'));
        engineCases++;
      }
    }
  }
}
ok(engineCases > 200, '解題器對照了 ' + engineCases + ' 種情況');

// ── 出題：第 1～30 關全部＋到頂之後抽 3 關，各 3 題 ──
function connected(cells) {
  const Gr = Core.buildGraph(cells), seen = new Set([0]), st = [0];
  while (st.length) { const x = st.pop(); Gr.nbrs[x].forEach(y => { if (!seen.has(y)) { seen.add(y); st.push(y); } }); }
  return seen.size === cells.length;
}
let uniqueChecked = 0, totalMs = 0, maxMs = 0, sameNear = 0, brkNear = 0, shares = [], regs = [], regs3 = [];
const LEVELS = Array.from({ length: T.RAMP_LEVELS }, (_, i) => i + 1).concat([45, 60, T.MAX_LEVEL]);     // 到頂之後抽幾關（跟第 30 關一樣難）
for (const lv of LEVELS) {
  for (let s = 0; s < 3; s++) {
    const r = rng(SEED + lv * 101 + s), t0 = Date.now();
    const z = T.makeLevel(lv, r);
    const ms = Date.now() - t0; totalMs += ms; maxMs = Math.max(maxMs, ms);
    const S = sp(lv), tag = '第 ' + lv + ' 關（種子 ' + (SEED + lv * 101 + s) + '）';
    ok(z && z.n === S.n && z.cells.length === S.n && z.k === S.k, tag + '：格數、色數照規格');
    ok(new Set(z.cells.map(c => c.join())).size === z.n && connected(z.cells), tag + '：格子不重複、形狀連在一起');
    ok(T.isSolved(z.sol, z.nbrs, z.counts), tag + '：答案合法（相鄰不同色、各色格數剛好）');
    let clues = 0, mism = 0;
    for (let i = 0; i < z.n; i++) if (z.given[i] >= 0) { clues++; if (z.given[i] !== z.sol[i]) mism++; }
    ok(mism === 0 && clues === z.clues, tag + '：預填跟答案一致、預填數正確');
    ok(clues < z.n - 1, tag + '：至少留 2 格給玩家');
    // V1.56.0：不能讓人照「固定間隔」擺就解完
    const pats = T.patternsFor(z.cells, z.k), reg = T.regularity(pats, z.sol), pf = T.prefillFit(pats, z.given), gap = T.nearGap(z.cells, z.given);
    regs.push(reg); if (S.k === 3) regs3.push(reg);
    ok(reg < 0.9, tag + '：答案不是照規律花樣擺的（最像的花樣只吻合 ' + (100 * reg).toFixed(0) + '%；舊版三色實心盤面是 100%）');
    ok(T.fitOk(pf.best, pf.total), tag + '：預填看不出規律（最像的花樣吻合 ' + pf.best + '／' + pf.total + ' 格預填）');
    ok(gap <= S.cover + (S.unique ? 0 : 1), tag + '：預填分散（每格離最近的預填最多 ' + gap + ' 步，上限 ' + S.cover + (S.unique ? '' : '＋1') + '）');
    if (S.k === 3) ok(T.rigidFrac(z.nbrs) <= T.RIGID_MAX + 1e-9, tag + '：三色形狀不是一整塊剛體（最大一塊佔 ' + (100 * T.rigidFrac(z.nbrs)).toFixed(0) + '%）');
    if (S.k === 4) {
      const c = z.counts;
      ok(c[3] === Math.round(S.n * S.rare), tag + '：最少那色 ' + c[3] + ' 格');
    }
    if (S.unique) {
      const E = L.makeEngine({ n: z.n, nbrs: z.nbrs }, z.k), cnt = E.count(z.given, z.counts, 2, 5e6);
      ok(!cnt.aborted && cnt.found === 1, tag + '：研究工具完整數完＝唯一解（' + cnt.found + (cnt.aborted ? '，沒數完' : '') + '）');
      ok(z.clues >= z.minimal && z.clues - z.minimal <= S.extra, tag + '：預填＝剛好唯一的 ' + z.minimal + ' 格＋暖身最多 ' + S.extra + ' 格');
      uniqueChecked++;
    } else {
      ok(clues === S.fill, tag + '：自由擺預填 ' + S.fill + ' 格');
    }
    if (S.k === 4 && !S.unique) {
      const gi = [], by = [0, 0, 0, 0];
      for (let i = 0; i < z.n; i++) if (z.given[i] >= 0) { gi.push(i); by[z.given[i]]++; }
      shares.push(Math.max(...by) / gi.length);
      for (let a = 0; a < gi.length; a++) for (let b = a + 1; b < gi.length; b++) {
        const i = gi[a], j = gi[b];
        if (z.given[i] === z.given[j] && T.hexDist(z.cells[i], z.cells[j]) <= 6) { if (T.parityOf(z.cells[i]) === T.parityOf(z.cells[j])) sameNear++; else brkNear++; }
      }
    }
  }
}
ok(uniqueChecked === LEVELS.filter(l => sp(l).unique).length * 3, '唯一解的關卡都用第三方解題器數過（' + uniqueChecked + ' 題）');
// 實測（每關 30 盤）：答案最像的規律花樣吻合 0.42～0.53（舊版 4 色高關卡 0.73～0.77、三色實心 1.00）；三色 0.50～0.52
ok(regs.reduce((a, b) => a + b, 0) / regs.length <= 0.6, '全部題目：答案最像的規律花樣平均只吻合 ' + (100 * regs.reduce((a, b) => a + b, 0) / regs.length).toFixed(0) + '%（≤ 60%）');
ok(regs3.reduce((a, b) => a + b, 0) / regs3.length <= 0.65, '三色入門：答案最像的規律花樣平均只吻合 ' + (100 * regs3.reduce((a, b) => a + b, 0) / regs3.length).toFixed(0) + '%（舊版 100%）');
// 陷阱挑法（自由擺的 24 題）：實測同色預填 99～100% 都避開「隔一格」花樣（隨機挑約 71～77%），門檻訂 90%；最多那色佔預填中位 33～38%（隨機 44%），門檻 45%
ok(brkNear / Math.max(1, sameNear + brkNear) >= 0.9, '自由擺：附近的同色預填 ≥ 90% 避開「隔一格」花樣（' + brkNear + '／' + (sameNear + brkNear) + '）');
shares.sort((a, b) => a - b);
ok(shares[shares.length >> 1] <= 0.45, '自由擺：最多那色佔預填的中位數 ≤ 45%（' + (100 * shares[shares.length >> 1]).toFixed(0) + '%）');
console.log('出題 ' + LEVELS.length * 3 + ' 題：平均 ' + (totalMs / (LEVELS.length * 3)).toFixed(0) + 'ms、最久 ' + maxMs + 'ms');

// ── 陷阱分數 ──
{
  const cells = [[0, 0], [2, 0], [3, 0], [5, 0], [1, 0]];   // 一排：第 1 格、第 3 格（隔一格）、第 4 格、第 6 格、中間一格
  const g = new Int8Array(5).fill(-1); g[0] = 0;
  ok(T.trapScore(1, 0, cells, g) < T.trapScore(2, 0, cells, g) && T.trapScore(2, 0, cells, g) < T.trapScore(3, 0, cells, g), '同色：第 1、3 格（隔一格）＜ 第 1、4 格 ＜ 第 1、6 格');
  ok(T.trapScore(1, 1, cells, g) > T.trapScore(2, 1, cells, g), '不同色、隔一格（夾住中間）會加分');
  ok(T.parityOf([0, 0]) === T.parityOf([2, 0]) && T.parityOf([0, 0]) === T.parityOf([0, 2]) && T.parityOf([0, 0]) === T.parityOf([-2, 2]) && T.parityOf([0, 0]) !== T.parityOf([1, 0]), '「隔一格」花樣：三個方向隔一格都同一類');
  ok(T.subOf([0, 0]) === T.subOf([3, 0]) && T.subOf([0, 0]) !== T.subOf([1, 0]) && T.subOf([0, 0]) !== T.subOf([2, 0]), '三色花樣：一排每隔兩格同一類');
  ok(T.hexDist([0, 0], [2, 0]) === 2 && T.hexDist([0, 0], [1, 1]) === 2 && T.hexDist([0, 0], [1, -1]) === 1, '六角距離');
}

// ── 規律花樣（V1.56.0）──
{
  const big = [];
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) if (Math.abs(q + r) <= 4) big.push([q, r]);      // 一個半徑 4 的大六角盤（61 格）
  const Gb = Core.buildGraph(big);
  const p3 = T.patternsFor(big, 3), p4 = T.patternsFor(big, 4);
  ok(p3.length === 6 && p4.length === 24 * 4 + 24, '規律花樣：三色 6 種、四色 ' + p4.length + ' 種（五種花樣 × 顏色對應）');
  const proper = p => big.every((_, i) => Gb.nbrs[i].every(j => p[i] !== p[j]));
  ok(p3.every(proper) && p4.every(proper), '每個規律花樣都是合法的塗法（相鄰不同色）');
  ok(p3.every(p => new Set(Array.from(p)).size === 3) && p4.filter(p => new Set(Array.from(p)).size === 4).length === 96, '三色花樣用滿 3 色；四色花樣 96 種用滿 4 色、24 種是「三色花樣＋一色不用」');
  const sub = big.map(c => T.subOf(c));
  ok(T.regularity(p3, sub) === 1 && T.regularity(p4, sub) === 1, '完全照「每隔兩格同色」擺的答案：規律程度 100%');
  const rnd = rng(SEED + 7), shuffled = Array.from(sub, v => (v + (rnd() < 0.5 ? 1 : 0)) % 4);
  ok(T.regularity(p4, shuffled) < 0.9, '亂改過的答案：規律程度降低');
  // 預填看起來的規律程度
  const g0 = new Int8Array(big.length).fill(-1);
  [[0, 0], [3, 0], [0, 3], [-3, 3]].forEach(c => { const i = big.findIndex(x => x[0] === c[0] && x[1] === c[1]); g0[i] = p3[0][i]; });
  const f0 = T.prefillFit(p3, g0);
  ok(f0.total === 4 && f0.best === 4 && !T.fitOk(f0.best, f0.total), '預填 4 格全都照三色花樣：吻合 4／4，不及格（看得出規律）');
  const i1 = big.findIndex(x => x[0] === 3 && x[1] === -3); g0[i1] = (p3[0][i1] + 1) % 3;       // [3,−3] 跟前面 4 格同一類（每隔兩格同色），卻塗成別的顏色：所有花樣都得跟它唱反調
  const f1 = T.prefillFit(p3, g0);
  ok(f1.total === 5 && f1.best === 4 && f1.best / f1.total < f0.best / f0.total, '加一格唱反調的預填：最像的花樣只吻合 4／5（原本 4／4）');
  ok(T.fitOk(0, 2) && T.fitOk(2, 3) && !T.fitOk(3, 3) && T.fitOk(5, 10) && !T.fitOk(8, 10), '預填 ≤ 2 格不算；3 格最多吻合 2 格；10 格最多吻合 6 格');
  // 預填分散的程度
  const gg = new Int8Array(big.length).fill(-1);
  ok(T.nearGap(big, gg) === 99, '沒有預填：空白距離 99');
  gg[big.findIndex(x => x[0] === 0 && x[1] === 0)] = 0;
  ok(T.nearGap(big, gg) === 4, '一格預填放正中央：最遠的格子離它 4 步');
  // 剛體：實心六角盤＝一整塊；一排＝沒有三角形；兩片三角形只靠一個角連起來＝兩塊
  ok(T.rigidFrac(Gb.nbrs) === 1, '實心盤面：整個是一塊剛體（100%）');
  ok(T.rigidFrac(Core.buildGraph([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]).nbrs) === 0, '一排格子：沒有三角形（0%）');
  const tw = Core.buildGraph([[0, 0], [1, 0], [0, 1], [2, 0], [3, 0], [2, 1]]);     // 兩個三角形（[0,0][1,0][0,1] 與 [2,0][3,0][2,1]）只靠 [1,0]-[2,0] 這條邊連起來，沒有共用邊
  ok(Math.abs(T.rigidFrac(tw.nbrs) - 0.5) < 1e-9, '兩個三角形只靠一條邊連著（沒有共用邊）：各是一塊，最大一塊佔 50%');
}

// ── 相鄰同色、「！」警示、過關 ──
{
  const Gr = Core.buildGraph(shapes[0]), nb = Gr.nbrs;     // shapes[0]：中間一格 [0,0] 加六個鄰居
  const center = shapes[0].findIndex(c => c[0] === 0 && c[1] === 0);
  const p = new Int8Array(7).fill(-1);
  const ring = nb[center];
  p[ring[0]] = 0; p[ring[2]] = 1;
  ok(!T.deadCellsOf(p, nb, 3)[center], '鄰居只有兩色：不警示');
  p[ring[4]] = 2;
  ok(T.deadCellsOf(p, nb, 3)[center] === 1, '鄰居用到全部 3 色：中間的空格要警示');
  ok(T.deadCellsOf(p, nb, 4)[center] === 0, '4 色時鄰居只有 3 色：不警示');
  p[center] = 0;
  ok(T.deadCellsOf(p, nb, 3)[center] === 0, '塗了顏色的格子不警示');
  const cf = T.conflictsOf(p, nb);
  ok(cf[center] === 1 && cf[ring[0]] === 1 && cf[ring[2]] === 0, '相鄰同色：兩格都標出來');
  const Gl = Core.buildGraph(shapes[1]);                   // 一排 5 格
  ok(T.isSolved([0, 1, 0, 1, 0], Gl.nbrs, [3, 2]) && !T.isSolved([0, 1, 0, 1, 0], Gl.nbrs, [2, 3]) && !T.isSolved([0, 0, 1, 0, 1], Gl.nbrs, [3, 2]) && !T.isSolved([0, 1, -1, 1, 0], Gl.nbrs, [3, 2]), '過關：塗滿、不相鄰同色、各色格數剛好');
}

// ── 記號彈窗的顏色組合 ──
{
  const c3 = T.combosFor(3), c4 = T.combosFor(4);
  ok(JSON.stringify(c3) === '[[0,1],[1,2],[2,0]]', '3 色：紅綠、綠藍、藍紅（使用者的例子）：' + JSON.stringify(c3));
  ok(c4.length === 10 && c4.filter(x => x.length === 2).length === 6 && c4.filter(x => x.length === 3).length === 4, '4 色：6 種兩色＋4 種三色');
  ok(JSON.stringify(c4.slice(0, 4)) === '[[0,1],[1,2],[2,3],[3,0]]' && JSON.stringify(c4[6]) === '[0,1,2]', '4 色：先列繞一圈相鄰的兩色，三色第一組是紅綠藍');
  ok(new Set(c4.map(x => x.slice().sort().join())).size === 10, '組合不重複');
}

// ── 記號彈窗的位置：不蓋住被按的格子 ──
// 實際的格子大小：3 色入門半徑最大 58 px → 格子外框半寬約 47、彈窗約 280 高；4 色半徑最大約 38 → 半寬約 31、彈窗約 443 高（12 個選項）
{
  const W = 484, H = 543, pw = Math.round(W * 0.4), gap = 8;
  const hit = (c, p, ph) => Math.min(c.r, p.left + p.width) > Math.max(c.l, p.left) && Math.min(c.b, p.top + ph) > Math.max(c.t, p.top);
  let tried = 0, clean = 0, narrowed = 0;
  for (const [half, ph] of [[20, 443], [31, 443], [20, 280], [31, 280], [40, 280], [47, 280]]) for (let x = half; x <= W - half; x += 7) for (let y = half * 1.15; y <= H - half * 1.15; y += 11) {
    const c = { l: x - half, r: x + half, t: y - half * 1.15, b: y + half * 1.15 }, p = T.popPlace(c, pw, ph, W, H, gap);
    tried++; if (!hit(c, p, ph)) clean++; if (p.width < pw) narrowed++;
    ok(p.left >= gap - 0.01 && p.left + p.width <= W - gap + 0.01 && p.top >= gap - 0.01 && p.top + ph <= H - gap + 0.01 && p.width >= Math.round(W * 0.34), '彈窗在畫面裡面、最窄 34%');
  }
  ok(clean === tried, '彈窗不蓋住被按的格子（' + clean + '／' + tried + ' 種位置；其中 ' + narrowed + ' 種要稍微變窄）');
  const p1 = T.popPlace({ l: 40, r: 90, t: 200, b: 258 }, pw, 280, W, H, gap), p2 = T.popPlace({ l: 400, r: 450, t: 200, b: 258 }, pw, 280, W, H, gap);
  ok(p1.left > W / 2 && p2.left < W / 2 && p1.width === pw && p2.width === pw, '格子在左邊 → 彈窗放右邊；在右邊 → 放左邊（寬度 2/5）');
}

// ── 限時、圖形 ──
ok(T.timeFor(1, 15) === (T.TIME_BASE + 15 * T.TIME_CELL[0]) * 1000 && T.timeFor(MX, 60) === (T.TIME_BASE + 60 * T.TIME_CELL[1]) * 1000, '限時＝' + T.TIME_BASE + ' 秒＋空格 × ' + T.TIME_CELL[0] + ' → ' + T.TIME_CELL[1] + ' 秒');
ok(T.timeFor(15, 40) > T.timeFor(14, 40), '每格秒數隨關卡變多');
const hp = T.roundHexPath(1, 0.2);
ok((hp.match(/Q/g) || []).length === 6 && /Z$/.test(hp), '圓角六角形：6 個圓角、封閉');

// ── 檔案規矩 ──
const src = fs.readFileSync(path.join(__dirname, '../../js/reaction_hexcolor.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../../css/games/reaction_hexcolor.css'), 'utf8');
ok(!/resume:\s*false/.test(src), '沒有 resume:false（高關卡優待：從最佳關卡 − 4 進場）');
ok(/kit\.hintsAllowed\(level\)/.test(src), '提示按鈕只在前 4 關（kit.hintsAllowed）');
ok(/LONG_MS = 450/.test(src) && /POP_FRAC = 0\.4/.test(src), '長按 0.45 秒、彈窗寬度＝畫面 2/5');
ok(/--hexcolor-e0:/.test(css) && /stroke: var\(--hexcolor-edge/.test(css), 'CSS：邊線用同色系的深色變數');
ok(!/#[0-9a-fA-F]{3,6}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'CSS：沒有寫死的色碼（都用變數）');
const boot = fs.readFileSync(path.join(__dirname, '../../js/boot.js'), 'utf8');
ok(boot.indexOf("'js/hexcolor_core.js'") > 0 && boot.indexOf("'js/hexcolor_core.js'") < boot.indexOf("'js/reaction_hexcolor.js'"), 'boot.js 先載入 hexcolor_core.js 再載入遊戲');

console.log(checks + ' checks');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exit(bad ? 1 : 0);
