// 連號長龍（numchain）的純函式檢查：
//   · 盤面大小隨關卡變大：第 1 關 5×7、第 20 關起 8×11（玩家指定）；連 n 格得 1＋2＋…＋n 分；數字高度是格子高度的 85%
//   · 選方格：拖曳（拖過的格子被挑選、拖回上一格取消）、點選（點一下挑選、再點一下已挑選的就放棄）；挑選沒有先後順序，按「確定」才檢查排不排得成一串（chainOrder）
//   · 「快速拖曳」預設不勾、「浮窗」預設勾（玩家指定）
//   · 收走之後：每一欄剩下的方格往下掉到底（collapse）、缺的格子補新方格（fillNew）；新方格最後停在哪一格，掉下來之前就知道
//   · 推算法（fillNew／pickValue／potentialOf）：依「停下來之後四周的數字」挑新方格的數字；ASSIST_P／AIM_LEN／PICK_K／BREAK_P 隨關卡變難；
//     任何時候盤面上都至少有一串 MIN_BEST_LEN 格可以拿
//   · 浮窗九宮格的位置（loupeAt）：手指上方兩格處（不蓋住手指上面那一格）、左右不超出畫面、上面放不下就放手指下方
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_numchain.js'); const T = G.test;
let bad = 0, total = 0; const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const rnd = rng(seedOf(20261122));
const inc = (a, b) => a <= b;     // 方向不確定時用的比較（參數第 1 關 vs 到頂）
const G8 = T.gridOf(8, 11), G5 = T.gridOf(5, 7), G6 = T.gridOf(6, 9);

// ── 固定的東西 ──
ok(Math.abs(T.DIGIT_H - 0.85) < 1e-9, '數字高度是格子高度的 85%（玩家指定）');
ok(T.MAX_LEVEL === 90 && T.RAMP_LEVELS === 30, '標準難度曲線：RAMP_LEVELS 30、MAX_LEVEL 90');
ok(T.chainScore(3) === 6 && T.chainScore(4) === 10 && T.chainScore(5) === 15 && T.chainScore(14) === 105, '連 n 格＝1＋2＋…＋n 分：3→6、4→10、5→15、14→105');
ok(T.MIN_CHAIN === 3, '至少連 3 格');
ok(T.DEFAULT_LOUPE === true && T.DEFAULT_FAST === false, '「浮窗」預設勾選、「快速拖曳」預設不勾選（玩家指定）');
ok(T.getOpts().loupe === true && T.getOpts().fast === false, '沒有存過選擇時，用預設值');
// ── 棋盤大小隨關卡 ──
{ const d1 = T.dimsFor(1), d20 = T.dimsFor(20);
  ok(d1.w === 5 && d1.h === 7, '第 1 關 5×7（玩家指定）：' + d1.w + '×' + d1.h);
  ok(d20.w === 8 && d20.h === 11, '第 20 關 8×11（玩家指定）：' + d20.w + '×' + d20.h);
  for (const l of [21, 30, 60, 99]) ok(T.dimsFor(l).w === 8 && T.dimsFor(l).h === 11, '第 ' + l + ' 關維持 8×11');
  for (let l = 2; l <= 40; l++) ok(T.dimsFor(l).w >= T.dimsFor(l - 1).w && T.dimsFor(l).h >= T.dimsFor(l - 1).h, '第 ' + l + ' 關棋盤不會變小');
  ok(T.gridFor(1) === G5 && T.gridFor(20) === G8 && T.gridOf(8, 11) === G8, '同樣大小的棋盤只做一次（共用）'); }
// ── 鄰居（每種大小都檢查）──
for (const gr of [G5, G6, G8]) {
  ok(gr.n === gr.w * gr.h && gr.nb.length === gr.n, gr.w + '×' + gr.h + '：共 ' + gr.n + ' 格');
  ok(T.neighbors(gr, 0).length === 2 && T.neighbors(gr, gr.w - 1).length === 2 && T.neighbors(gr, gr.n - 1).length === 2, gr.w + '×' + gr.h + '：四個角落 2 個鄰居');
  ok(T.neighbors(gr, 1).length === 3 && T.neighbors(gr, gr.w).length === 3 && T.neighbors(gr, gr.w + 1).length === 4, gr.w + '×' + gr.h + '：邊上 3 個、中間 4 個鄰居');
  ok(T.adjacent(gr, 0, 1) && T.adjacent(gr, 0, gr.w) && !T.adjacent(gr, 0, gr.w + 1) && !T.adjacent(gr, gr.w - 1, gr.w), gr.w + '×' + gr.h + '：上下左右相鄰；斜的、換列接起來的不相鄰（斜的是否能走看 DIAG：' + T.DIAG + '）');
  for (let i = 0; i < gr.n; i++) for (const k of T.neighbors(gr, i)) ok(T.neighbors(gr, k).indexOf(i) >= 0, '鄰居是雙向的');
}
// ── 難度曲線 ──
{ ok(T.targetFor(1) === T.TARGET[0] && T.targetFor(T.RAMP_LEVELS) === T.TARGET[1] && T.targetFor(99) === T.TARGET[1], '目標分數 ' + T.TARGET + '，到頂後維持');
  ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S + ' 秒');
  const a = T.fillParams(1), b = T.fillParams(T.RAMP_LEVELS), c = T.fillParams(99);
  ok(Math.abs(a.assist - T.ASSIST_P[0]) < 1e-9 && Math.abs(b.assist - T.ASSIST_P[1]) < 1e-9 && Math.abs(c.assist - b.assist) < 1e-9, '推算法機率 ' + T.ASSIST_P);
  ok(Math.abs(a.aim - T.AIM_LEN[0]) < 1e-9 && Math.abs(b.aim - T.AIM_LEN[1]) < 1e-9, '想連的長度 ' + T.AIM_LEN);
  ok(a.k === Math.round(T.PICK_K[0]) && b.k === Math.round(T.PICK_K[1]) && a.k >= 1, '前幾名裡挑 ' + T.PICK_K + '（整數、至少 1）');
  ok(Math.abs(a.brk - T.BREAK_P[0]) < 1e-9 && Math.abs(b.brk - T.BREAK_P[1]) < 1e-9, '搗蛋機率 ' + T.BREAK_P);
  ok(T.minBestFor(1) === Math.max(T.MIN_CHAIN, Math.round(T.MIN_BEST_LEN[0])) && T.minBestFor(T.RAMP_LEVELS) >= T.MIN_CHAIN, '保證至少一串 ' + T.MIN_BEST_LEN + '（最少 3）');
  for (let l = 2; l <= 60; l++) {
    ok(inc(T.targetFor(l - 1), T.targetFor(l)) || T.TARGET[0] > T.TARGET[1], '第 ' + l + ' 關目標分數不降低');
    const p0 = T.fillParams(l - 1), p1 = T.fillParams(l);
    ok(p1.assist <= p0.assist + 1e-9 || T.ASSIST_P[0] < T.ASSIST_P[1], '第 ' + l + ' 關推算法機率不增加');
    ok(p1.aim <= p0.aim + 1e-9 || T.AIM_LEN[0] < T.AIM_LEN[1], '第 ' + l + ' 關想連的長度不變長');
    ok(p1.brk >= p0.brk - 1e-9 || T.BREAK_P[0] > T.BREAK_P[1], '第 ' + l + ' 關搗蛋機率不降低');
  }
  ok(T.ASSIST_P.concat(T.BREAK_P).every(x => x >= 0 && x <= 1), '機率都在 0～1 之間'); }

// ── 串的排序：挑選的格子（沒有先後順序）排不排得成一串 ──
{ const vals = new Array(G8.n).fill(9);
  [3, 4, 5, 4, 3].forEach((v, i) => { vals[i] = v; });            // 第一列 3 4 5 4 3
  const ord = (cells) => T.chainOrder(G8, vals, cells);
  const asc = ord([0, 1, 2, 3, 4]);
  ok(asc && asc.length === 5 && asc.every((k, j) => j === 0 || (T.adjacent(G8, asc[j - 1], k) && Math.abs(vals[k] - vals[asc[j - 1]]) === 1)), '3、4、5、4、3 排得成一串');
  const mixed = ord([2, 0, 4, 1, 3]);
  ok(mixed && mixed.length === 5 && mixed.slice().sort().join() === '0,1,2,3,4', '挑選的先後順序打亂（先點中間的）也排得成一串');
  ok(ord([0, 1, 3]) === null, '中間缺一格（0、1、3）：連不成一串');
  ok(ord([0, 2]) === null && ord([0, 4]) === null, '不相鄰的兩格：連不成一串');
  ok(ord([0]) !== null && ord([0]).length === 1 && ord([]).length === 0, '一格、沒有格子：單獨成一串（長度不夠由 commit 擋）');
  ok(ord([0, 1, 1, 2]).length === 3, '重複的格子只算一次');
  vals[5] = 2; ok(ord([0, 1, 2, 3, 4, 5]) !== null && ord([0, 1, 2, 3, 4, 5]).length === 6, '3、4、5、4、3、2：尾巴再接一格（2 跟 3 差 1）還是一串');
  vals[6] = 9; ok(ord([0, 1, 2, 3, 4, 6]) === null, '多選了一格不相干的（9 跟旁邊都不差 1）：連不成一串');
  // 暴力解比一比：小盤面，隨機選一些格子
  const sm = new Array(G8.n).fill(null); for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) sm[r * G8.w + c] = 1 + Math.floor(rnd() * 4);
  const cellsAll = []; for (let i = 0; i < G8.n; i++) if (sm[i] != null) cellsAll.push(i);
  for (let t = 0; t < 200; t++) {
    const k = 2 + Math.floor(rnd() * 6), pick = []; while (pick.length < k) { const c = cellsAll[Math.floor(rnd() * cellsAll.length)]; if (pick.indexOf(c) < 0) pick.push(c); }
    let found = false; const perm = (path, mark) => { if (found) return; if (path.length === k) { found = true; return; } const last = path[path.length - 1]; pick.forEach(m => { if (!mark.has(m) && T.adjacent(G8, last, m) && Math.abs(sm[m] - sm[last]) === 1) { mark.add(m); path.push(m); perm(path, mark); path.pop(); mark.delete(m); } }); };
    pick.forEach(s => perm([s], new Set([s])));
    const mine = T.chainOrder(G8, sm, pick);
    ok((mine !== null) === found, '排序跟暴力解一致（' + pick.join() + ' → ' + (found ? '排得成' : '排不成') + '）');
    if (mine) ok(mine.length === k && mine.every((m, j) => j === 0 || (T.adjacent(G8, mine[j - 1], m) && Math.abs(sm[m] - sm[mine[j - 1]]) === 1)), '排出來的每一步都合法'); } }

// ── 拖曳與點選 ──
{ const vals = new Array(G8.n).fill(9);
  [2, 3, 4, 3, 2, 1, 1].forEach((v, i) => { vals[i] = v; });
  vals[G8.w + 2] = 5; vals[40] = null;                         // (1,2)=5 在 4 的正下方；一個空格
  const fresh = () => T.newState({ gr: G8, vals: vals.slice(), level: 1 });
  let st = fresh();
  ok(st.vals !== vals && st.sel.length === 0 && st.score === 0 && st.level === 1 && st.gr === G8, 'newState：複製盤面、沒有挑選、得分 0');
  // 拖曳：按下去就挑選，拖過相鄰差 1 的格子也挑選
  let ss = T.beginDrag(st, 0);
  ok(st.sel.join() === '0' && !ss.moved && !ss.startSel, '按在沒挑選的格子上：挑選它');
  ok(T.dragStep(st, ss, 1) === 'add' && T.dragStep(st, ss, 2) === 'add' && st.sel.join() === '0,1,2' && ss.moved, '拖過 3、4：一路挑選');
  ok(T.dragStep(st, ss, 2) === null, '還在同一格：什麼都不發生');
  ok(T.dragStep(st, ss, 4) === null && st.sel.length === 3, '跳過格子（3 跟 5 不相鄰）不行');
  ok(T.dragStep(st, ss, G8.w + 2) === 'add' && st.sel.join() === '0,1,2,' + (G8.w + 2), '往下拖到 5（4→5）');
  ok(T.dragStep(st, ss, 2) === 'back' && st.sel.join() === '0,1,2', '拖回上一格＝這次拖曳挑選的那一格取消');
  ok(T.dragStep(st, ss, 3) === 'add' && T.dragStep(st, ss, 4) === 'add' && T.dragStep(st, ss, 5) === 'add' && st.sel.length === 6, '4→3→2→1 往下降也可以');
  ok(T.dragStep(st, ss, 6) === null, '1→1 差 0 不行');
  ok(T.dragStep(st, ss, 1) === null, '已經挑選的格子不能再走');
  ok(T.dragStep(st, ss, 40) === null && T.dragStep(st, ss, -1) === null && T.dragStep(st, ss, 999) === null, '空格、棋盤外不行');
  ok(T.endDrag(st, ss) === null && st.sel.length === 6, '拖過之後手指離開：挑選留著');
  // 點選：點沒挑選的＝挑選；再點＝放棄
  st = fresh(); ss = T.beginDrag(st, 3); ok(T.endDrag(st, ss) === null && st.sel.join() === '3', '點一下沒挑選的格子 → 挑選');
  ss = T.beginDrag(st, 3); ok(ss.startSel && st.sel.join() === '3', '再按在已挑選的格子上：先不動');
  ok(T.endDrag(st, ss) === 'drop' && st.sel.length === 0, '點第二次（手指沒動）→ 放棄這一格');
  st = fresh(); [0, 1, 2].forEach(k => { const s = T.beginDrag(st, k); T.endDrag(st, s); });
  ok(st.sel.join() === '0,1,2', '連續點 3 格：都被挑選（不需要相鄰也不需要照順序：點選時不檢查）');
  ss = T.beginDrag(st, 1); T.endDrag(st, ss); ok(st.sel.join() === '0,2', '點中間那格 → 只放棄它（0、2 留著）');
  // 從已挑選的格子開始往外拖：可以接續
  st = fresh(); ss = T.beginDrag(st, 0); T.dragStep(st, ss, 1); T.endDrag(st, ss);
  ss = T.beginDrag(st, 1); ok(ss.startSel && T.dragStep(st, ss, 2) === 'add' && st.sel.join() === '0,1,2', '從已挑選的格子開始再拖：接著往外挑選');
  ok(T.endDrag(st, ss) === null && st.sel.length === 3, '拖過就不算「點一下」：不會放棄起點');
  // 拖回上一格不會取消「先前就挑選過」的格子
  st = fresh(); T.endDrag(st, T.beginDrag(st, 2));
  ss = T.beginDrag(st, 3); T.dragStep(st, ss, 4); ok(T.dragStep(st, ss, 3) === 'back' && st.sel.join() === '2,3', '拖回去：這次拖曳挑選的 4 取消，起點 3 和先前挑選的 2 還在'); }

// ── 收走（commit）──
{ const vals = new Array(G8.n).fill(9);
  [2, 3, 4, 3, 2, 1].forEach((v, i) => { vals[i] = v; });
  const mk = () => T.newState({ gr: G8, vals: vals.slice(), level: 1 });
  let st = mk();
  ok(T.commit(st, rnd) === null, '沒有挑選：回傳 null');
  st.sel = [0, 1]; let r = T.commit(st, rnd);
  ok(!r.ok && r.reason === 'short' && r.n === 2 && st.sel.join() === '0,1' && st.score === 0 && st.vals.join() === vals.join(), '只挑選 2 格：不到 3 格（盤面不動、挑選留著讓玩家補）');
  st.sel = [0, 1, 3]; r = T.commit(st, rnd);
  ok(!r.ok && r.reason === 'broken' && st.sel.length === 3 && st.vals.join() === vals.join(), '挑選的 3 格連不成一串：不收（reason＝broken、挑選留著）');
  st.sel = [5, 3, 1, 0, 4, 2]; const before = st.vals.slice();   // 順序打亂也沒關係
  r = T.commit(st, rnd);
  ok(r.ok && r.n === 6 && r.gain === 21 && st.score === 21 && st.done === 1 && st.sel.length === 0, '挑選 6 格（先後順序打亂）：連成一串、得 21 分、挑選清空');
  ok(r.cells.slice().sort().join() === '0,1,2,3,4,5' && r.cells.every((k, j) => j === 0 || (T.adjacent(G8, r.cells[j - 1], k) && Math.abs(before[k] - before[r.cells[j - 1]]) === 1)) && r.oldVals.length === 6, '回傳排好順序的格子與數字（消失動畫一格接一格用）');
  ok(st.vals.every(v => Number.isInteger(v) && v >= 1 && v <= 9), '收走之後，缺的格子都補上新數字（盤面沒有空格）');
  ok(r.fresh.length === 6 && r.moves.length === G8.n - 6, '新方格 6 格、其餘 ' + (G8.n - 6) + ' 格各有一筆掉落'); }

// ── 掉落（collapse）：每一欄剩下的往下掉、上面補新的（每種棋盤大小都測）──
for (const gr of [G5, G6, G8]) for (let t = 0; t < 120; t++) {
  const vals = Array.from({ length: gr.n }, () => 1 + Math.floor(rnd() * 9));
  const removed = new Set(); const cnt = 1 + Math.floor(rnd() * Math.min(14, gr.n - 1)); while (removed.size < cnt) removed.add(Math.floor(rnd() * gr.n));
  const cz = T.collapse(gr, vals, [...removed]);
  let good = true, freshExpect = 0;
  for (let c = 0; c < gr.w; c++) {
    const col = []; for (let r = 0; r < gr.h; r++) if (!removed.has(r * gr.w + c)) col.push(vals[r * gr.w + c]);
    const k = gr.h - col.length; freshExpect += k;
    for (let r = 0; r < gr.h; r++) { const v = cz.vals[r * gr.w + c]; if (r < k ? v !== null : v !== col[r - k]) good = false; }
  }
  ok(good, gr.w + '×' + gr.h + ' 每一欄：剩下的方格依原來的順序掉到底、上面留空');
  ok(cz.fresh.length === removed.size && cz.fresh.length === freshExpect && cz.fresh.every(i => cz.vals[i] === null), '缺的格子數＝收走的格子數，而且都是空的');
  ok(cz.moves.length === gr.n - removed.size && cz.moves.every(m => m.to % gr.w === m.from % gr.w && Math.floor(m.to / gr.w) >= Math.floor(m.from / gr.w) && cz.vals[m.to] === vals[m.from]), '每個方格只會往下掉（同一欄、不會往上），數字不變');
  ok(new Set(cz.moves.map(m => m.to)).size === cz.moves.length && cz.moves.every(m => !removed.has(m.from)), '沒有兩個方格掉到同一格、被收走的不會掉');
}

// ── 推算法：停下來的位置四周是什麼，就挑什麼數字 ──
{ const vals = new Array(G8.n).fill(null); vals[0] = 5; vals[2] = 7;                      // (0,0)=5、(0,2)=7，中間 (0,1) 是新方格要停的地方
  const K = 1, runs = {}; T.neighbors(G8, K).forEach(n => { if (vals[n] != null) runs[n] = T.runFrom(G8, vals, n, K); });
  ok(runs[0] === 1 && runs[2] === 1, 'runFrom：旁邊沒有別的格子，往外只有自己 1 格');
  ok(T.potentialOf(G8, vals, K, 6, runs) === 3, 'potentialOf：寫 6 同時接上 5 和 7 → 1＋1＋1 ＝ 3 格');
  ok(T.potentialOf(G8, vals, K, 4, runs) === 2 && T.potentialOf(G8, vals, K, 8, runs) === 2 && T.potentialOf(G8, vals, K, 1, runs) === 1, 'potentialOf：只接一邊 2 格；都不接 1 格');
  const pick = (P, n) => { const out = {}; for (let i = 0; i < n; i++) { const x = T.pickValue(G8, vals, K, P, rnd); out[x] = (out[x] || 0) + 1; } return out; };
  const a = pick({ assist: 1, aim: 3, k: 1, brk: 0 }, 200);
  ok(Object.keys(a).join() === '6', '想連 3 格、K＝1：新方格一定寫 6（接上左右兩邊）：' + JSON.stringify(a));
  const b = pick({ assist: 1, aim: 1, k: 1, brk: 0 }, 400);
  ok(Object.keys(b).every(x => [1, 2, 3, 5, 7, 9].includes(+x)), '想連 1 格：不會寫 4、6、8（會接上 5 或 7；5、7 跟旁邊的數字相同、差 0，不算接上）：' + JSON.stringify(b));
  const c = pick({ assist: 0, aim: 3, k: 1, brk: 1 }, 400);
  ok(Object.keys(c).every(x => [1, 2, 3, 5, 7, 9].includes(+x)), '搗蛋：不會寫跟旁邊差 1 的數字（4、6、8）：' + JSON.stringify(c));
  const d = pick({ assist: 0, aim: 3, k: 1, brk: 0 }, 900);
  ok(Object.keys(d).length === 9, '推算法機率 0、搗蛋 0：1～9 隨機（' + Object.keys(d).length + ' 種都出現過）');
  const e = pick({ assist: 1, aim: 3, k: 9, brk: 0 }, 900);
  ok(Object.keys(e).length >= 5 && e[6] > 20, '前 K 名裡隨機挑：K 大一點就會挑到別的數字（' + Object.keys(e).length + ' 種），最接近的 6 還是最常出現（' + e[6] + '）'); }

// ── fillNew：全部填滿、1～9、簡單關卡比難關更常「跟旁邊差 1」 ──
{ const linkShare = (lv, trials) => { let a = 0, b = 0; const gr = T.gridFor(20);
    for (let i = 0; i < trials; i++) {
      const vals = Array.from({ length: gr.n }, () => 1 + Math.floor(rnd() * 9));
      const removed = new Set(); while (removed.size < 10) removed.add(Math.floor(rnd() * gr.n));
      const cz = T.collapse(gr, vals, [...removed]); T.fillNew(gr, cz.vals, cz.fresh, lv, rnd);
      ok(cz.vals.every(v => Number.isInteger(v) && v >= 1 && v <= 9), '第 ' + lv + ' 關：補完之後每一格都有 1～9');
      cz.fresh.forEach(k => { b++; if (T.neighbors(gr, k).some(n => Math.abs(cz.vals[n] - cz.vals[k]) === 1)) a++; });
    } return a / b; };
  const s1 = linkShare(1, 150), s30 = linkShare(T.RAMP_LEVELS, 150);
  ok(s1 > s30 + 0.1, '新方格落地後跟四周「差 1」的比例：第 1 關 ' + (s1 * 100).toFixed(0) + '% > 第 ' + T.RAMP_LEVELS + ' 關 ' + (s30 * 100).toFixed(0) + '%'); }

// ── 開局的盤面：簡單關卡長串多、難的關卡長串少，而且一定有一串可以拿 ──
{ const avgBest = (lv) => { let s = 0; for (let i = 0; i < 40; i++) { const q = T.makePuzzle(lv, rnd); s += T.longestChain(q.gr, q.vals, 30000); } return s / 40; };
  const b1 = avgBest(1), b15 = avgBest(15), b30 = avgBest(T.RAMP_LEVELS);
  ok(b1 > b15 && b15 > b30, '盤面最長那串的平均：第 1 關 ' + b1.toFixed(1) + ' > 第 15 關 ' + b15.toFixed(1) + ' > 第 ' + T.RAMP_LEVELS + ' 關 ' + b30.toFixed(1)); }
for (let i = 0; i < 200; i++) {
  const lv = 1 + (i % 60), q = T.makePuzzle(lv, rnd), d = T.dimsFor(lv);
  ok(q.w === d.w && q.h === d.h && q.gr === T.gridOf(d.w, d.h) && q.vals.length === d.w * d.h && q.vals.every(v => Number.isInteger(v) && v >= 1 && v <= 9) && q.target === T.targetFor(lv), '第 ' + lv + ' 關：棋盤 ' + d.w + '×' + d.h + '、每格 1～9、目標 ' + q.target);
  ok(T.bestChain(q.gr, q.vals, T.minBestFor(lv)).length >= T.minBestFor(lv) && T.hasChain(q.gr, q.vals), '第 ' + lv + ' 關：開局盤面至少有一串 ' + T.minBestFor(lv) + ' 格可以拿');
}
// ── 一直玩下去：每次收走之後，盤面還是滿的、還是有路可走（保證至少 MIN_BEST_LEN 格）──
for (const lv of [1, 5, 10, 20, 30, 45]) {
  const q = T.makePuzzle(lv, rnd), st = T.newState(q); let good = true, scoreSum = 0;
  for (let m = 0; m < 40; m++) {
    const p = T.bestChain(st.gr, st.vals, 0, 20000);
    if (p.length < T.MIN_CHAIN) { good = false; break; }
    st.sel = kit_shuffle(p);                                      // 挑選的先後順序打亂也要收得走
    const r = T.commit(st, rnd); scoreSum += T.chainScore(p.length);
    if (!r.ok || st.vals.some(v => !(v >= 1 && v <= 9)) || T.bestChain(st.gr, st.vals, T.minBestFor(lv)).length < T.minBestFor(lv)) good = false;
  }
  ok(good && st.score === scoreSum && st.done === 40, '第 ' + lv + ' 關（' + q.w + '×' + q.h + '）：連續收走 40 串，每次都補滿、都還有 ' + T.minBestFor(lv) + ' 格以上的串可以拿；得分 ' + st.score);
}
function kit_shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
// ── 貪心玩家（每次拿最長）的平均：簡單的關卡每串比較長 ──
{ const avg = (lv) => { let n = 0, s = 0; for (let i = 0; i < 8; i++) { const st = T.newState(T.makePuzzle(lv, rnd)); for (let m = 0; m < 12; m++) { const p = T.bestChain(st.gr, st.vals, 0, 20000); st.sel = p.slice(); T.commit(st, rnd); n++; s += p.length; } } return s / n; };
  const a1 = avg(1), a30 = avg(T.RAMP_LEVELS);
  ok(a1 > a30 + 1, '每次拿最長一串的平均格數：第 1 關 ' + a1.toFixed(1) + ' > 第 ' + T.RAMP_LEVELS + ' 關 ' + a30.toFixed(1)); }

// ── 最長串搜尋、保證有一串 ──
{ const gr = G8, v = new Array(gr.n).fill(null);
  ok(T.bestChain(gr, v).length === 0 && !T.hasChain(gr, v) && T.longestChain(gr, v) === 0, '空盤面沒有任何一串');
  v[0] = 3; v[1] = 4; ok(!T.hasChain(gr, v) && T.longestChain(gr, v) === 2, '只有 2 格：不夠 3 格');
  v[2] = 5; ok(T.hasChain(gr, v) && T.longestChain(gr, v) === 3 && T.bestChain(gr, v).join() === '0,1,2', '3 格 3→4→5：有一串');
  v[gr.w] = 2; v[gr.w + 1] = 3; v[gr.w + 2] = 4; ok(T.longestChain(gr, v) === 6, '兩列繞一圈共 6 格，最長那一串是 6（' + T.longestChain(gr, v) + '）');
  ok(T.bestChain(gr, v, 4).length >= 4 && T.bestChain(gr, v, 4).length < 7, 'stopAt：找到 4 格就停');
  const w = new Array(gr.n).fill(null); w[0] = 3; w[1] = 4; w[gr.w] = 7; ok(!T.hasChain(gr, w), '4 的鄰居是 3 跟 7：只有一個差 1，不夠 3 格');
  w[gr.w] = 4; ok(T.hasChain(gr, w) && T.longestChain(gr, w) === 3, '4→3→4：3 的兩個鄰居都是 4，是 3 格');
  for (let t = 0; t < 60; t++) {
    const b = new Array(gr.n).fill(null); for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) b[r * gr.w + c] = 1 + Math.floor(rnd() * 4);
    let best = 0; const cells = []; for (let i = 0; i < gr.n; i++) if (b[i] != null) cells.push(i);
    const go = (path, mark) => { best = Math.max(best, path.length); const last = path[path.length - 1]; T.neighbors(gr, last).forEach(k => { if (!mark.has(k) && b[k] != null && Math.abs(b[k] - b[last]) === 1) { mark.add(k); path.push(k); go(path, mark); path.pop(); mark.delete(k); } }); };
    cells.forEach(s => go([s], new Set([s])));
    ok(T.longestChain(gr, b) === best, '最長串搜尋跟暴力解一樣（' + best + '）'); } }
{ const v = new Array(G8.n).fill(9); ok(!T.hasChain(G8, v) && T.ensureChain(G8, v, 6, rnd) && T.bestChain(G8, v, 6).length >= 6, 'ensureChain：沒有串就種一串 6 格的');
  const v2 = new Array(G8.n).fill(null); [1, 2, 3, 4, 5, 6].forEach((x, i) => { v2[i] = x; }); ok(!T.ensureChain(G8, v2, 6, rnd), 'ensureChain：已經有就不動');
  const v3 = new Array(G5.n).fill(9); ok(T.ensureChain(G5, v3, 6, rnd) && T.bestChain(G5, v3, 6).length >= 6, 'ensureChain：5×7 小盤面也種得下'); }
for (let t = 0; t < 100; t++) {
  const gr = [G5, G6, G8][t % 3], free = new Array(gr.n).fill(true), len = 3 + Math.floor(rnd() * 8), p = T.growWalk(gr, free, len, rnd);
  ok(p && p.length === len && new Set(p).size === len && p.every((k, j) => j === 0 || T.adjacent(gr, p[j - 1], k)), '種 ' + len + ' 格的路：不重疊、一格接一格');
  const vs = T.walkValues(len, rnd);
  ok(vs.length === len && vs.every((v, j) => v >= 1 && v <= 9 && (j === 0 || Math.abs(v - vs[j - 1]) === 1)), '數字一格 ±1、都在 1～9');
}

// ── 浮窗九宮格的位置（loupeAt）：手指上方兩格處、不蓋住手指上面那一格、左右不超出畫面 ──
{ const W = 472, H = 640, bx = 6, by = 4, cell = 58, pw = 3 * 58 + 4, ph = pw;
  const at = (px, r) => T.loupeAt(px, r, bx, by, cell, pw, ph, W, H);
  for (let r = 0; r < 11; r++) for (let px = 0; px <= W; px += 23) {
    const p = at(px, r);
    ok(p.left >= 0 && p.left + pw <= W + 1e-9, '第 ' + r + ' 列、手指 x＝' + px + '：浮窗左右不超出畫面（left＝' + p.left + '）');
    ok(p.top >= 0 && p.top + ph <= H + 1e-9, '第 ' + r + ' 列：浮窗上下不超出畫面');
    const rowTop = by + r * cell, aboveTop = by + (r - 1) * cell, aboveBottom = by + r * cell;
    if (p.top + ph <= rowTop + 1e-9) ok(p.top + ph <= aboveTop + 1e-9, '第 ' + r + ' 列：放在手指上方時，浮窗下緣在「手指上面那一格」的上緣（沒有蓋到它）');
    else ok(p.top >= by + (r + 2) * cell - 1e-9 || p.top + ph >= H - 1e-9, '第 ' + r + ' 列：放在手指下方時，空出手指下面那一格（或已經貼著畫面下緣）');
  }
  const up = at(236, 8); ok(up.top + ph === by + 7 * cell && Math.abs(up.left - (236 - pw / 2)) < 1e-9, '空間夠：浮窗下緣＝手指上面那一格的上緣（' + (up.top + ph) + '），水平置中在手指上');
  ok(at(5, 8).left === 0 && at(470, 8).left === W - pw, '手指靠近左右邊：浮窗貼著畫面左右邊、不超出');
  ok(at(236, 1).top >= by + 3 * cell && at(236, 3).top >= by + 5 * cell, '上面放不下（手指在第 1、3 列）：改放手指下方'); }

// ── 動畫的彈跳函式 ──
ok(T.bounce(0) === 0 && T.bounce(1) === 1 && T.bounce(1.5) === 1, 'bounce：起點 0、終點 1');
{ let mx = 0; for (let i = 0; i <= 100; i++) { const y = T.bounce(i / 100); ok(y >= 0 && y <= 1.0001, 'bounce 在 0～1 之間'); mx = Math.max(mx, y); } ok(mx <= 1.0001, 'bounce 不會超過終點'); }
// ── 評語、登記資料 ──
ok(T.rating(25) !== T.rating(12) && T.rating(12) !== T.rating(6) && T.rating(6) !== T.rating(3) && T.rating(3) !== T.rating(0), '評語依關數分級');
ok(G.id === 'numchain' && G.name === '連號長龍' && Array.from(G.name).length <= 5, '登記資料：代號 numchain、名稱「連號長龍」（≤5 字）');
ok(/差 1/.test(G.rule) && /至少連 3 格/.test(G.rule) && /往下掉/.test(G.rule) && /不限拖曳次數/.test(G.rule) && /點/.test(G.rule) && /快速拖曳/.test(G.rule) && /浮窗/.test(G.rule) && /確定/.test(G.rule) && (G.rule.match(/\*\*/g) || []).length % 2 === 0, '玩法說明：差 1、至少 3 格、點選、確定、快速拖曳、浮窗、往下掉補新的、不限拖曳次數，** 成對');
ok(G.score.better === 'max' && G.score.max === T.MAX_LEVEL, '成績：過幾關，越大越好');
// ── 檔案接線 ──
{ const boot = fs.readFileSync(ROOT + 'js/boot.js', 'utf8'), menu = fs.readFileSync(ROOT + 'js/menu.js', 'utf8'), src = fs.readFileSync(ROOT + 'js/reaction_numchain.js', 'utf8'), ui = fs.readFileSync(ROOT + 'js/numgrid_ui.js', 'utf8');
  ok(boot.indexOf("'js/numgrid_ui.js'") > 0 && boot.indexOf("'js/numgrid_ui.js'") < boot.indexOf("'js/reaction_numchain.js'") && boot.indexOf("'js/reaction_numchain.js'") > 0 && boot.indexOf("'css/numgrid.css'") > 0, 'boot.js：共用的 numgrid_ui.js 在遊戲檔案之前載入、有 numgrid.css');
  ok(/id: 'numchain', name: '連號長龍', cat: 'logic'/.test(menu), 'menu.js 有這款（邏輯）');
  ok(fs.existsSync(ROOT + 'img/reaction/numchain.png'), '縮圖檔存在');
  ok(/api\.setInfo\(/.test(ui) && !/剩 '/.test(ui) && !/拖曳剩/.test(ui), '得分放在標題列右邊（setInfo），沒有「剩 X／X 次」');
  ok(!/drawBubble/.test(ui) && !/drawBubble/.test(src), '拖曳時盤面上沒有藍框白底的提示字（drawBubble 拿掉了）');
  ok(/text: '浮窗'/.test(ui) && /text: '快速拖曳'/.test(ui) && /text: '確定'/.test(ui) && /numgrid-bar/.test(ui), '介面最下方有「浮窗」「快速拖曳」兩個勾選框和「確定」按鈕（共用介面）');
  ok(/NG\.mount\(root, ctx/.test(src), '連號長龍把規則交給共用介面 NG.mount');
  const cssRaw = fs.readFileSync(ROOT + 'css/numgrid.css', 'utf8');
  ok(/pointer-events: none/.test(cssRaw), '浮窗不接收手指事件（不會擋到拖曳）');
  const css = cssRaw.replace(/[ 	]*\/\*[\s\S]*?\*\//g, '');
  ok(!/#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(css), 'css：沒有寫死的顏色（一律用 theme.css 的變數）'); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS ' + total);
process.exit(bad ? 1 : 0);
