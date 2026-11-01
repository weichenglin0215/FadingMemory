// 實作前的實測（2026-11-02，使用者圈的 8 款、照他的修改）：
//   ① piggybank 撲滿：硬幣重量是質數、每種 1～9 枚（或偶數枚），只給總重（簡單關卡加總枚數）——唯一解比例、答案會不會偏向極端
//   ② boxstack 疊箱子：露出幾箱才唯一、「照大小從左上排到右下」會不會剛好對
//   ③ shapegrid 形色不相鄰：n×n、n 種形狀 × n 種顏色各一個，解的個數、回溯求解要多快
//   ④ keypad30 按鍵搶三十：必勝局面要走幾步
// 用法：node exp_impl8.cjs [piggy,box,shape,keypad]
'use strict';
function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261102);
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const want = (process.argv[2] || 'piggy,box,shape,keypad').split(',');

/* ① 撲滿 */
if (want.includes('piggy')) {
  const PR = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  function count(ws, W, N, lo, hi) {
    let n = 0; const k = ws.length, c = new Array(k).fill(lo);
    (function rec(i, w, cnt) { if (i === k) { if (w === W && (N == null || cnt === N)) n++; return; } for (let v = lo; v <= hi; v++) { if (w + ws[i] * v > W) break; rec(i + 1, w + ws[i] * v, cnt + v); } })(0, 0, 0);
    return n;
  }
  for (const k of [2, 3, 4]) for (const giveN of [true, false]) for (const big of [false, true]) {
    let uniq = 0, tries = 0, ext = 0, sumAvg = 0; const T = 2000;
    for (let t = 0; t < T; t++) {
      const pool = big ? PR.slice(4) : PR.slice(0, 7);
      const ws = shuffle(pool).slice(0, k).sort((a, b) => a - b);
      const c = ws.map(() => ri(1, 9));
      const W = ws.reduce((s, w, i) => s + w * c[i], 0), N = c.reduce((a, b) => a + b, 0);
      tries++;
      if (count(ws, W, giveN ? N : null, 1, 9) === 1) { uniq++; sumAvg += N / k; if (c.some(v => v === 1 || v === 9)) ext++; }
    }
    console.log(`撲滿 ${k} 種、${giveN ? '給總枚數' : '只給總重'}、質數${big ? '23～47' : '11～31'}：唯一 ${(uniq / tries * 100).toFixed(1)}%，唯一題裡每種平均 ${(sumAvg / Math.max(1, uniq)).toFixed(2)} 枚、含 1 或 9 枚的 ${(ext / Math.max(1, uniq) * 100).toFixed(0)}%`);
  }
}

/* ② 疊箱子：r×c，1..N 每格一個，往右、往下都變重（標準楊表）。露出的格子＝提示 */
if (want.includes('box')) {
  function randSYT(r, c) {      // 每次在「可以放的角落」隨機挑一格放下一個數字
    const g = Array.from({ length: r }, () => new Array(c).fill(0)); const N = r * c;
    for (let v = 1; v <= N; v++) {
      const cand = [];
      for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) if (!g[i][j] && (i === 0 || g[i - 1][j]) && (j === 0 || g[i][j - 1])) cand.push([i, j]);
      const [i, j] = cand[Math.floor(R() * cand.length)]; g[i][j] = v;
    }
    return g;
  }
  function countFill(r, c, given, limit) {   // given[i][j]＝0 表示空格
    const N = r * c, pos = {}; for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) if (given[i][j]) pos[given[i][j]] = [i, j];
    const g = Array.from({ length: r }, () => new Array(c).fill(0)); let n = 0;
    (function rec(v) {
      if (n >= limit) return;
      if (v > N) { n++; return; }
      const ok = (i, j) => !g[i][j] && (i === 0 || g[i - 1][j]) && (j === 0 || g[i][j - 1]);
      if (pos[v]) { const [i, j] = pos[v]; if (ok(i, j)) { g[i][j] = v; rec(v + 1); g[i][j] = 0; } return; }
      for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) if (!given[i][j] && ok(i, j)) { g[i][j] = v; rec(v + 1); g[i][j] = 0; if (n >= limit) return; }
    })(1);
    return n;
  }
  function naive(r, c, given) {   // 剩下的重量照大小，從左上一排一排填到右下
    const N = r * c, used = new Set(); for (const row of given) for (const v of row) if (v) used.add(v);
    const rest = []; for (let v = 1; v <= N; v++) if (!used.has(v)) rest.push(v);
    const g = given.map(row => row.slice()); let k = 0; for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) if (!g[i][j]) g[i][j] = rest[k++];
    return g;
  }
  function naiveDiag(r, c, given) {   // 照斜線（i+j）從左上填到右下
    const N = r * c, used = new Set(); for (const row of given) for (const v of row) if (v) used.add(v);
    const rest = []; for (let v = 1; v <= N; v++) if (!used.has(v)) rest.push(v);
    const g = given.map(row => row.slice()); let k = 0; for (let s = 0; s <= r + c - 2; s++) for (let i = 0; i < r; i++) { const j = s - i; if (j >= 0 && j < c && !g[i][j]) g[i][j] = rest[k++]; }
    return g;
  }
  const same = (a, b) => a.every((row, i) => row.every((v, j) => v === b[i][j]));
  for (const [r, c] of [[2, 3], [3, 3], [3, 4], [4, 4], [4, 5]]) {
    let sumG = 0, naiveOk = 0, T = 300; const hist = {};
    for (let t = 0; t < T; t++) {
      const sol = randSYT(r, c), cells = shuffle([...Array(r * c).keys()]);
      const given = Array.from({ length: r }, () => new Array(c).fill(0));
      for (const k of cells) { if (countFill(r, c, given, 2) === 1) break; given[Math.floor(k / c)][k % c] = sol[Math.floor(k / c)][k % c]; }
      for (const k of shuffle([...Array(r * c).keys()])) { const i = Math.floor(k / c), j = k % c; if (!given[i][j]) continue; const v = given[i][j]; given[i][j] = 0; if (countFill(r, c, given, 2) !== 1) given[i][j] = v; }
      let ng = 0; given.forEach(row => row.forEach(v => { if (v) ng++; })); sumG += ng; hist[ng] = (hist[ng] || 0) + 1;
      if (same(naive(r, c, given), sol) || same(naiveDiag(r, c, given), sol)) naiveOk++;
    }
    console.log(`疊箱子 ${r}×${c}：最少露出平均 ${(sumG / T).toFixed(2)} 箱（分布 ${JSON.stringify(hist)}），照大小一排一排填或照斜線填就剛好對的 ${(naiveOk / T * 100).toFixed(1)}%`);
  }
}

/* ③ 形色不相鄰：n×n，形狀 0..n-1 × 顏色 0..n-1 各一個；上下左右相鄰的兩格，形狀不同而且顏色不同 */
if (want.includes('shape')) {
  function solve(n, fixed, limit) {      // fixed[k]＝piece（形狀*n+顏色）或 -1
    const used = new Array(n * n).fill(false), g = fixed.slice(); fixed.forEach(p => { if (p >= 0) used[p] = true; });
    let cnt = 0, nodes = 0;
    const okAt = (k, p) => { const r = Math.floor(k / n), c = k % n, s = Math.floor(p / n), co = p % n; for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; const q = g[rr * n + cc]; if (q < 0) continue; if (Math.floor(q / n) === s || q % n === co) return false; } return true; };
    (function rec(k) {
      if (cnt >= limit) return; nodes++;
      if (k === n * n) { cnt++; return; }
      if (g[k] >= 0) { if (okAt(k, g[k])) rec(k + 1); return; }
      for (let p = 0; p < n * n; p++) if (!used[p] && okAt(k, p)) { used[p] = true; g[k] = p; rec(k + 1); g[k] = -1; used[p] = false; if (cnt >= limit) return; }
    })(0);
    return { cnt, nodes };
  }
  for (const n of [3, 4, 5]) {
    const t0 = Date.now(); const lim = n === 3 ? 1e9 : 200000; const r = solve(n, new Array(n * n).fill(-1), lim);
    console.log(`形色不相鄰 ${n}×${n}：完全空白時的擺法 ${r.cnt >= lim ? '≥' : ''}${r.cnt}（搜尋 ${r.nodes} 個節點、${Date.now() - t0} ms）`);
  }
}

/* ④ 按鍵搶三十：計算機鍵盤 1～9，只能按上一鍵的上下左右鄰居，剛好湊到目標的人贏，沒鍵可按的人輸 */
if (want.includes('keypad')) {
  const POS = { 7: [0, 0], 8: [0, 1], 9: [0, 2], 4: [1, 0], 5: [1, 1], 6: [1, 2], 1: [2, 0], 2: [2, 1], 3: [2, 2] };
  const NB = {}; for (let a = 1; a <= 9; a++) NB[a] = []; for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) { const [r1, c1] = POS[a], [r2, c2] = POS[b]; if (Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1) NB[a].push(b); }
  for (const T of [20, 25, 30, 35, 40]) {
    const memo = {};
    // 輪到的人：{ win, plies }，plies＝雙方都走最好（贏的求快、輸的求拖）時還要按幾下（兩人合計）；沒鍵可按＝輸、0 下
    function S(s, last) {
      const key = s + ',' + last; if (key in memo) return memo[key];
      const keys = (last ? NB[last] : [1, 2, 3, 4, 5, 6, 7, 8, 9]).filter(k => s + k <= T);
      if (!keys.length) return (memo[key] = { win: false, plies: 0 });
      if (keys.some(k => s + k === T)) return (memo[key] = { win: true, plies: 1 });
      let bw = Infinity, wl = 0;
      for (const k of keys) { const c = S(s + k, k); if (!c.win) bw = Math.min(bw, c.plies + 1); else wl = Math.max(wl, c.plies + 1); }
      return (memo[key] = bw < Infinity ? { win: true, plies: bw } : { win: false, plies: wl });
    }
    // >0＝必勝，自己最少按幾下；<0＝必輸
    const d = (s, last) => { const r = S(s, last); return r.win ? (r.plies + 1) / 2 : -1; };
    const first = []; for (let k = 1; k <= 9; k++) if (k < T && d(k, k) < 0) first.push(k);
    const fromZero = d(0, 0);
    const hist = {}; for (let s = 0; s < T; s++) for (let l = 1; l <= 9; l++) { const v = d(s, l); if (v > 0) hist[v] = (hist[v] || 0) + 1; }
    console.log(`按鍵搶 ${T}：先手第一鍵必勝的有 ${first.join('、') || '（沒有）'}；從 0 開始先手 ${fromZero > 0 ? '必勝，自己最少按 ' + fromZero + ' 下（電腦盡量拖）' : '必輸'}；各局面必勝步數分布 ${JSON.stringify(hist)}`);
  }
}
