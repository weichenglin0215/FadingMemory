// 拖曳湊十（sumten）的純函式檢查：
//   · 玩家指定的兩個例子：拖 2、3、5、1、8 → 算 2＋3＋5＝10（1、8 放棄）；拖 4、6、3、7、4 → 算 4＋6＋3＋7＝20（最後的 4 放棄）
//   · 總和是 10 的倍數就能收走、不管幾格；得分＝總和；至少 2 格；挑選的格子不相鄰就只算相鄰的前面幾格
//   · 挑選（拖曳、點選放棄）、收走、掉落補新的方格（跟連號長龍共用 js/numgrid_ui.js）；放棄的格子留在盤面上
//   · 推算法（reachFrom／potentialOf／pickValue）：依「停下來之後四周的數字」挑新方格的數字，ASSIST_P／AIM_SUM／PICK_K／BREAK_P 隨關卡變難；任何時候都有路可走
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sumten.js'); const T = G.test;
let bad = 0, total = 0; const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const rnd = rng(seedOf(20261123));
const G5 = T.gridOf(5, 7), G6 = T.gridOf(6, 9), G8 = T.gridOf(8, 11);

// 做一個盤面：第一列依序放 row，其餘都是 null（沒有格子），測試用
const board = (gr, row, extra) => { const v = new Array(gr.n).fill(null); row.forEach((x, i) => { v[i] = x; }); Object.keys(extra || {}).forEach(k => { v[+k] = extra[k]; }); return v; };

// ── 固定的東西 ──
ok(T.TEN === 10 && T.MIN_CELLS === 2, '總和要是 10 的倍數（玩家指定）、至少 2 格');
ok(T.MAX_LEVEL === 90 && T.RAMP_LEVELS === 30, '標準難度曲線：RAMP_LEVELS 30、MAX_LEVEL 90');
ok(T.getOpts().loupe === true && T.getOpts().fast === false && T.DEFAULT_LOUPE === true && T.DEFAULT_FAST === false, '介面跟連號長龍一樣：「浮窗」預設勾選、「快速拖曳」預設不勾選');
{ const d1 = T.dimsFor(1), d20 = T.dimsFor(20);
  ok(d1.w === 5 && d1.h === 7 && d20.w === 8 && d20.h === 11, '盤面跟連號長龍一樣：第 1 關 5×7、第 20 關 8×11'); }
ok(T.targetFor(1) === T.TARGET[0] && T.targetFor(T.RAMP_LEVELS) === T.TARGET[1] && T.targetFor(99) === T.TARGET[1] && T.targetFor(1) % 1 === 0, '目標分數 ' + T.TARGET + '，到頂後維持');
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S + ' 秒');
{ for (let l = 2; l <= 60; l++) {
    const p0 = T.fillParams(l - 1), p1 = T.fillParams(l);
    ok(T.targetFor(l) >= T.targetFor(l - 1) || T.TARGET[0] > T.TARGET[1], '第 ' + l + ' 關目標分數不降低');
    ok(p1.assist <= p0.assist + 1e-9 || T.ASSIST_P[0] < T.ASSIST_P[1], '第 ' + l + ' 關推算法機率不增加');
    ok(p1.aim <= p0.aim + 1e-9 || T.AIM_SUM[0] < T.AIM_SUM[1], '第 ' + l + ' 關想讓玩家一次拿的分數不變高');
    ok(p1.brk >= p0.brk - 1e-9 || T.BREAK_P[0] > T.BREAK_P[1], '第 ' + l + ' 關搗蛋機率不降低');
  }
  const a = T.fillParams(1), b = T.fillParams(T.RAMP_LEVELS);
  ok(a.k === Math.round(T.PICK_K[0]) && b.k === Math.round(T.PICK_K[1]) && a.k >= 1 && T.minBestFor(1) >= 10 && T.minBestFor(T.RAMP_LEVELS) >= 10, '前幾名裡挑 ' + T.PICK_K + '、保證至少一串 ' + T.MIN_BEST_SUM + '（最少 10 分）'); }

// ── 怎麼算：玩家指定的例子 ──
{ const u1 = T.usable(G5, board(G5, [2, 3, 5, 1, 8]), [0, 1, 2, 3, 4]);
  ok(u1.m === 3 && u1.sum === 10, '拖 2、3、5、1、8 → 算前 3 格 2＋3＋5＝10（1、8 放棄）：' + JSON.stringify(u1));
  const u2 = T.usable(G5, board(G5, [4, 6, 3, 7, 4]), [0, 1, 2, 3, 4]);
  ok(u2.m === 4 && u2.sum === 20, '拖 4、6、3、7、4 → 算前 4 格 4＋6＋3＋7＝20（最後的 4 放棄）：' + JSON.stringify(u2));
  const U = (row, sel) => T.usable(G5, board(G5, row), sel || row.map((_, i) => i));
  ok(U([3, 7]).m === 2 && U([3, 7]).sum === 10, '3、7：剛好 10（2 格）');
  ok(U([1, 2, 3, 4, 5, 6]).m === 4 && U([1, 2, 3, 4, 5, 6]).sum === 10, '1、2、3、4、5、6：累計 1、3、6、10、15、21 → 取前 4 格（10）');
  ok(U([5, 5, 5, 5]).m === 4 && U([5, 5, 5, 5]).sum === 20, '5、5、5、5：10 和 20 都符合 → 取最長的前 4 格（20）');
  ok(U([4, 6, 3, 7]).m === 4 && U([9, 9, 2]).m === 3 && U([9, 9, 2]).sum === 20, '不管幾格：4、6、3、7＝20（4 格）、9、9、2＝20（3 格）');
  ok(U([9, 8]).m === 0 && U([1, 2, 3]).m === 0 && U([6]).m === 0, '總和不是 10 的倍數 → 湊不出（m＝0）；只有 1 格也不行');
  ok(U([9, 1, 9, 1]).m === 4 && U([9, 1, 9, 1]).sum === 20, '9、1、9、1：10 和 20 都符合，取最長的 4 格（20）');
  // 挑選的格子沒有連在一起：只算相鄰的前面幾格
  const v = board(G5, [3, 7, 4, 6]);
  ok(T.usable(G5, v, [0, 1, 2, 3]).m === 4, '相鄰的 4 格：3＋7＋4＋6＝20');
  ok(T.usable(G5, v, [0, 2, 1, 3]).prefix === 1 && T.usable(G5, v, [0, 2, 1, 3]).m === 0, '第二格跟第一格不相鄰（0 → 2）：只算第一格，湊不出');
  ok(T.usable(G5, v, [0, 1, 3, 2]).prefix === 2 && T.usable(G5, v, [0, 1, 3, 2]).m === 2 && T.usable(G5, v, [0, 1, 3, 2]).sum === 10, '3、7 之後換成不相鄰的格子：前兩格 3＋7＝10 照算，後面放棄');
  ok(T.usable(G5, board(G5, [3, 7], { 6: 5 }), [0, 6]).m === 0, '斜的格子不相鄰（DIAG 關掉）：湊不出');
  const withNull = board(G5, [3, 7]); withNull[1] = null; ok(T.usable(G5, withNull, [0, 1]).prefix === 1 && T.usable(G5, withNull, [0, 1]).m === 0, '空格（已經收走）不能算'); }

// ── preview：確定按鈕與橘色的放棄格 ──
{ const st = T.newState({ gr: G5, vals: board(G5, [2, 3, 5, 1, 8]), level: 1 });
  st.sel = [0, 1, 2, 3, 4]; let p = T.preview(st);
  ok(p.valid && p.gain === 10 && p.sum === 10 && p.n === 3 && p.used.join() === '0,1,2' && p.dropped.join() === '3,4', 'preview：算進去 0,1,2（得 10 分）、放棄 3,4：' + JSON.stringify(p));
  st.sel = [3, 4]; p = T.preview(st); ok(!p.valid && p.gain === 0 && p.dropped.length === 0 && p.used.join() === '3,4', '湊不出十：不亮、沒有放棄格（整串都還是挑選）');
  st.sel = []; p = T.preview(st); ok(!p.valid && p.used.length === 0, '沒有挑選：不亮'); }
ok(T.scoreOf(30, 5) === 30 + T.LEN_BONUS * 3 && T.scoreOf(10, 2) === 10, '得分＝總和（＋長度加分 LEN_BONUS＝' + T.LEN_BONUS + '，超過 2 格的部分）');

// ── 拖曳與點選 ──
{ const vals = board(G5, [2, 3, 5, 1, 8]); const st = T.newState({ gr: G5, vals, level: 1 });
  let ss = T.beginDrag(st, 0);
  ok(st.sel.join() === '0' && T.dragStep(st, ss, 1) === 'add' && T.dragStep(st, ss, 2) === 'add' && st.sel.join() === '0,1,2', '數字沒有限制：2→3→5 都能拖');
  ok(T.dragStep(st, ss, 4) === null && st.sel.length === 3, '還是要相鄰：跳過一格（0、1、2 → 4）不行');
  ok(T.dragStep(st, ss, 3) === 'add' && T.dragStep(st, ss, 4) === 'add' && st.sel.length === 5, '拖過頭也能繼續拖（5 格）');
  ok(T.dragStep(st, ss, 3) === 'back' && st.sel.length === 4, '拖回上一格＝收回一格');
  ok(T.endDrag(st, ss) === null && st.sel.length === 4, '手指離開：挑選留著');
  const t = T.newState({ gr: G5, vals: board(G5, [2, 3, 5]), level: 1 });
  T.endDrag(t, T.beginDrag(t, 1)); ok(t.sel.join() === '1', '點一下 → 挑選');
  T.endDrag(t, T.beginDrag(t, 1)); ok(t.sel.length === 0, '再點一下 → 放棄'); }

// ── 收走（commit）：放棄的格子留在盤面上 ──
{ const mk = (row) => T.newState({ gr: G5, vals: board(G5, row).map((v, i) => v == null ? 1 + (i % 9) : v), level: 1 });
  let st = mk([2, 3, 5, 1, 8]);
  ok(T.commit(st, rnd) === null, '沒有挑選：回傳 null');
  st.sel = [0]; let r = T.commit(st, rnd); ok(!r.ok && r.reason === 'short' && st.sel.join() === '0', '只挑選 1 格：至少 2 格（挑選留著）');
  st.sel = [3, 4]; r = T.commit(st, rnd); ok(!r.ok && r.reason === 'sum' && st.sel.length === 2 && st.score === 0, '1＋8＝9 不是 10 的倍數：不收（reason＝sum、挑選留著）');
  const before = st.vals.slice();
  st.sel = [0, 1, 2, 3, 4]; r = T.commit(st, rnd);
  ok(r.ok && r.n === 3 && r.sum === 10 && r.gain === 10 && st.score === 10 && st.done === 1 && st.sel.length === 0, '拖 2、3、5、1、8 → 收走前 3 格、得 10 分、挑選清空');
  ok(r.cells.join() === '0,1,2' && r.dropped.join() === '3,4' && r.oldVals.join() === '2,3,5', '回傳收走的格子與數字，以及放棄的格子 3、4');
  ok(st.vals.every(v => Number.isInteger(v) && v >= 1 && v <= 9), '收走之後，缺的格子都補上新數字（沒有空格）');
  // 放棄的格子（1、8）還在盤面上：它們在第一列，上面沒有格子，所以不會掉；原本的值不變
  ok(st.vals[3] === before[3] && st.vals[4] === before[4], '放棄的 1、8 還留在原本的格子裡');
  ok(r.fresh.length === 3 && r.moves.length === G5.n - 3, '新方格 3 格、其餘 ' + (G5.n - 3) + ' 格各有一筆掉落');
  st = mk([4, 6, 3, 7, 4]); st.sel = [0, 1, 2, 3, 4]; r = T.commit(st, rnd);
  ok(r.ok && r.n === 4 && r.gain === 20 && st.score === 20 && r.dropped.join() === '4', '拖 4、6、3、7、4 → 收走前 4 格、得 20 分、最後的 4 放棄'); }

// ── 掉落（共用的 collapse）：每一欄剩下的往下掉、上面補新的 ──
for (const gr of [G5, G6, G8]) for (let t = 0; t < 60; t++) {
  const vals = Array.from({ length: gr.n }, () => 1 + Math.floor(rnd() * 9));
  const removed = new Set(); const cnt = 2 + Math.floor(rnd() * 8); while (removed.size < cnt) removed.add(Math.floor(rnd() * gr.n));
  const cz = T.collapse(gr, vals, [...removed]);
  let good = true;
  for (let c = 0; c < gr.w; c++) {
    const col = []; for (let r = 0; r < gr.h; r++) if (!removed.has(r * gr.w + c)) col.push(vals[r * gr.w + c]);
    const k = gr.h - col.length;
    for (let r = 0; r < gr.h; r++) { const v = cz.vals[r * gr.w + c]; if (r < k ? v !== null : v !== col[r - k]) good = false; }
  }
  ok(good && cz.fresh.length === removed.size && cz.moves.length === gr.n - removed.size, gr.w + '×' + gr.h + '：每一欄剩下的方格掉到底、上面留空等新方格');
}

// ── 推算法 ──
{ const vals = new Array(G8.n).fill(null); vals[0] = 6; vals[2] = 3;            // 第 0 列：(0,0)=6、(0,2)=3，中間 (0,1)=新方格
  const reach = T.reachFrom(G8, vals, 1);
  ok(reach.length === 2 && reach.some(e => e.s === 6 && e.n === 1) && reach.some(e => e.s === 3 && e.n === 1), 'reachFrom：新方格旁邊有 6 和 3（各 1 格）：' + JSON.stringify(reach));
  ok(T.potentialOf(4, reach) === 10 && T.potentialOf(7, reach) === 10 && T.potentialOf(1, reach) === 0 && T.potentialOf(9, reach) === 0 && T.potentialOf(5, reach) === 0, 'potentialOf：寫 4（4＋6）或 7（7＋3）湊十得 10 分；寫 1、5、9 湊不出');
  const v2 = new Array(G8.n).fill(null); v2[0] = 6; v2[2] = 3; v2[G8.w] = 1;   // 6 的正下方還有一個 1
  const r2 = T.reachFrom(G8, v2, 1);
  ok(r2.some(e => e.n === 2 && e.s === 7) && T.potentialOf(3, r2) === 10 && T.potentialOf(2, r2) === 0 && T.potentialWithin(3, r2, 1) === 0 && T.potentialWithin(7, r2, 1) === 10, '可以往外多拖幾格：新方格寫 3，往旁邊拖 6、再往下拖 1 → 3＋6＋1＝10（reachFrom 有 2 格的串）；只看 1 格時湊不出（potentialWithin）');
  const pick = (P, n, v) => { const out = {}; for (let i = 0; i < n; i++) { const x = T.pickValue(G8, v, 1, P, rnd); out[x] = (out[x] || 0) + 1; } return out; };
  const a = pick({ assist: 1, aim: 10, k: 1, brk: 0 }, 200, vals);
  ok(Object.keys(a).every(x => x === '4' || x === '7') && Object.keys(a).length >= 1, '想拿 10 分、K＝1：新方格寫 4 或 7（湊得出十）：' + JSON.stringify(a));
  const b = pick({ assist: 1, aim: 0, k: 1, brk: 0 }, 400, vals);
  ok(Object.keys(b).every(x => !['4', '7'].includes(x)), '想拿 0 分（不想湊出）：不會寫 4、7：' + JSON.stringify(b));
  const c = pick({ assist: 0, aim: 10, k: 1, brk: 1 }, 400, vals);
  ok(Object.keys(c).every(x => !['4', '7'].includes(x)), '搗蛋：不會寫湊得出十的數字（4、7）：' + JSON.stringify(c));
  const d = pick({ assist: 0, aim: 10, k: 1, brk: 0 }, 900, vals);
  ok(Object.keys(d).length === 9, '推算法機率 0、搗蛋 0：1～9 隨機（' + Object.keys(d).length + ' 種都出現過）');
  const e = pick({ assist: 1, aim: 10, k: 9, brk: 0 }, 900, vals);
  ok(Object.keys(e).length >= 5 && (e[4] + e[7]) > 150, '前 K 名裡隨機挑：K 大一點就會挑到別的數字（' + Object.keys(e).length + ' 種），最接近的 4、7 還是最常出現'); }
// 簡單的關卡：新方格旁邊能湊出的分數比較高；難的關卡比較低、而且更常「旁邊沒有兩格湊十」
{ const stats = (lv, trials) => { let pot = 0, pair = 0, n = 0; const gr = T.gridFor(20);
    for (let i = 0; i < trials; i++) {
      const vals = Array.from({ length: gr.n }, () => 1 + Math.floor(rnd() * 9));
      const removed = new Set(); while (removed.size < 10) removed.add(Math.floor(rnd() * gr.n));
      const cz = T.collapse(gr, vals, [...removed]); T.fillNew(gr, cz.vals, cz.fresh, lv, rnd);
      ok(cz.vals.every(v => Number.isInteger(v) && v >= 1 && v <= 9), '第 ' + lv + ' 關：補完之後每一格都有 1～9');
      cz.fresh.forEach(k => { n++; const reach = T.reachFrom(gr, cz.vals.map((x, j) => j === k ? null : x), k); pot += T.potentialOf(cz.vals[k], reach); if (T.potentialWithin(cz.vals[k], reach, 1) > 0) pair++; });
    } return { pot: pot / n, pair: pair / n }; };
  const hi = stats(1, 120), lo = stats(T.RAMP_LEVELS, 120);
  ok(hi.pot > lo.pot + 3, '新方格旁邊能湊出的分數（平均）：第 1 關 ' + hi.pot.toFixed(1) + ' > 第 ' + T.RAMP_LEVELS + ' 關 ' + lo.pot.toFixed(1));
  ok(lo.pair < hi.pair - 0.03, '新方格旁邊有「兩格剛好湊十」的比例：第 1 關 ' + (hi.pair * 100).toFixed(0) + '% > 第 ' + T.RAMP_LEVELS + ' 關 ' + (lo.pair * 100).toFixed(0) + '%（難關更常躲開）'); }

// ── 找最好的一串、保證有路可走 ──
{ const gr = G8;
  ok(T.bestMove(gr, new Array(gr.n).fill(null)).length === 0 && T.bestScore(gr, new Array(gr.n).fill(null)) === 0, '空盤面沒有任何一串');
  ok(T.bestMove(gr, new Array(gr.n).fill(9)).length === 0, '全是 9（9、18、27…都不是 10 的倍數，連 10 個 9 才是 90）：搜尋範圍內沒有');
  const v = board(gr, [1, 9]); ok(T.bestMove(gr, v).join() === '0,1' && T.bestScore(gr, v) === 10, '1、9：最好的一串是這兩格，10 分');
  const w = board(gr, [4, 6, 3, 7, 4]); ok(T.bestScore(gr, w) === 20 && T.bestMove(gr, w).length === 4, '4、6、3、7、4：最好的是前 4 格 20 分（' + T.bestScore(gr, w) + '）');
  ok(T.bestMove(gr, w, 10).length >= 2 && T.bestScore(gr, w, 5) >= 10, 'stopAt：得分到 10 就停（找到的至少 10 分）');
  // 跟暴力解比一比：小盤面（左上角 3×3，數字 1～5），最多 SEARCH_LEN 格
  for (let t = 0; t < 50; t++) {
    const b = new Array(gr.n).fill(null); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) b[r * gr.w + c] = 1 + Math.floor(rnd() * 5);
    let best = 0; const cells = []; for (let i = 0; i < gr.n; i++) if (b[i] != null) cells.push(i);
    const go = (path, mark, sum) => { if (path.length >= 2 && sum % 10 === 0) best = Math.max(best, T.scoreOf(sum, path.length)); if (path.length >= T.SEARCH_LEN) return; const last = path[path.length - 1]; T.neighbors(gr, last).forEach(k => { if (!mark.has(k) && b[k] != null) { mark.add(k); path.push(k); go(path, mark, sum + b[k]); path.pop(); mark.delete(k); } }); };
    cells.forEach(s => go([s], new Set([s]), b[s]));
    ok(T.bestScore(gr, b) === best, '最好的一串跟暴力解一樣（' + best + ' 分）'); }
  // randomParts／ensureMove
  for (let t = 0; t < 200; t++) { const len = 2 + Math.floor(rnd() * 6), total = 10 * (1 + Math.floor(rnd() * 3)); if (total < len || total > 9 * len) continue; const parts = T.randomParts(total, len, rnd); ok(parts.length === len && parts.reduce((a, x) => a + x, 0) === total && parts.every(x => x >= 1 && x <= 9), '拆 ' + total + ' 成 ' + len + ' 份（每份 1～9）：' + parts.join('、')); }
  for (let t = 0; t < 80; t++) {
    const gr2 = [G5, G6, G8][t % 3], v9 = new Array(gr2.n).fill(9), need = 10 * (1 + (t % 4));
    ok(T.ensureMove(gr2, v9, need, rnd) && T.bestScore(gr2, v9, 600000) >= need, gr2.w + '×' + gr2.h + '：全是 9 的盤面，ensureMove 種出一串 ≥ ' + need + ' 分');
  }
  const ready = board(gr, [3, 7]); ok(!T.ensureMove(gr, ready, 10, rnd), 'ensureMove：已經有就不動'); }

// ── 出題與一直玩下去 ──
for (let i = 0; i < 150; i++) {
  const lv = 1 + (i % 60), q = T.makePuzzle(lv, rnd), d = T.dimsFor(lv);
  ok(q.w === d.w && q.h === d.h && q.vals.length === d.w * d.h && q.vals.every(v => Number.isInteger(v) && v >= 1 && v <= 9) && q.target === T.targetFor(lv), '第 ' + lv + ' 關：棋盤 ' + d.w + '×' + d.h + '、每格 1～9、目標 ' + q.target);
  ok(T.bestScore(q.gr, q.vals) >= T.minBestFor(lv), '第 ' + lv + ' 關：開局盤面至少有一串 ≥ ' + T.minBestFor(lv) + ' 分可以拿');
}
for (const lv of [1, 5, 10, 20, 30, 45]) {
  const q = T.makePuzzle(lv, rnd), st = T.newState(q); let good = true, sum = 0;
  for (let m = 0; m < 40; m++) {
    const p = T.bestMove(st.gr, st.vals, 0, 30000); if (!p.length) { good = false; break; }
    st.sel = p.slice();                                                  // 依拖的順序
    const pv = T.sumOf(st.vals, p);                                      // 再多拖一格會被放棄的（盡量找相鄰的）
    const last = p[p.length - 1]; const extra = T.neighbors(st.gr, last).filter(k => p.indexOf(k) < 0 && st.vals[k] != null)[0]; if (extra != null) st.sel.push(extra);
    const r = T.commit(st, rnd); sum += pv;
    if (!r.ok || r.cells.join() !== p.join() || st.vals.some(v => !(v >= 1 && v <= 9)) || T.bestScore(st.gr, st.vals) < T.minBestFor(lv)) good = false;
  }
  ok(good && st.score === sum && st.done === 40, '第 ' + lv + ' 關（' + q.w + '×' + q.h + '）：連續收走 40 串（每次還多拖一格放棄的），每次都補滿、都還有 ≥ ' + T.minBestFor(lv) + ' 分的串可以拿；得分 ' + st.score);
}

// ── 評語、登記資料 ──
ok(T.rating(25) !== T.rating(12) && T.rating(12) !== T.rating(6) && T.rating(6) !== T.rating(3) && T.rating(3) !== T.rating(0), '評語依關數分級');
ok(G.id === 'sumten' && G.name === '拖曳湊十' && Array.from(G.name).length <= 5, '登記資料：代號 sumten、名稱「拖曳湊十」（≤5 字）');
ok(/10 的倍數/.test(G.rule) && /不管拖幾格/.test(G.rule) && /放棄/.test(G.rule) && /快速拖曳/.test(G.rule) && /浮窗/.test(G.rule) && /確定/.test(G.rule) && /不限拖曳次數/.test(G.rule) && (G.rule.match(/\*\*/g) || []).length % 2 === 0, '玩法說明：10 的倍數、不管幾格、放棄、確定、快速拖曳、浮窗、不限拖曳次數，** 成對');
ok(G.score.better === 'max' && G.score.max === T.MAX_LEVEL, '成績：過幾關，越大越好');
// ── 檔案接線 ──
{ const boot = fs.readFileSync(ROOT + 'js/boot.js', 'utf8'), menu = fs.readFileSync(ROOT + 'js/menu.js', 'utf8'), src = fs.readFileSync(ROOT + 'js/reaction_sumten.js', 'utf8');
  ok(boot.indexOf("'js/numgrid_ui.js'") < boot.indexOf("'js/reaction_sumten.js'") && boot.indexOf("'js/reaction_sumten.js'") > 0, 'boot.js：共用的 numgrid_ui.js 在 reaction_sumten.js 之前載入');
  ok(/id: 'sumten', name: '拖曳湊十', cat: 'number'/.test(menu), 'menu.js 有這款（數字）');
  ok(fs.existsSync(ROOT + 'img/reaction/sumten.png'), '縮圖檔存在');
  ok(/NG\.mount\(root, ctx/.test(src) && !/numgrid-/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), '拖曳湊十把規則交給共用介面 NG.mount（介面跟連號長龍一樣，自己不寫畫面）'); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS ' + total);
process.exit(bad ? 1 : 0);
