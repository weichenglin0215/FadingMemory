// 實驗 5：刪數湊和（Sumplete）隨機出題，唯一解與「只靠逐行逐列推理」的比例。
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// 數解：逐列選子集合，欄剩餘和做剪枝；最多數到 cap
function countSol(n, g, rowT, colT, cap) {
  let cnt = 0;
  const rem = colT.slice();
  // 預先列出每列所有「和等於 rowT」的子集合
  const rowSubs = [];
  for (let y = 0; y < n; y++) {
    const subs = [];
    for (let m = 0; m < (1 << n); m++) { let s = 0; for (let x = 0; x < n; x++) if (m & (1 << x)) s += g[y][x]; if (s === rowT[y]) subs.push(m); }
    rowSubs.push(subs);
  }
  function rec(y) {
    if (cnt >= cap) return;
    if (y === n) { for (let x = 0; x < n; x++) if (rem[x] !== 0) return; cnt++; return; }
    for (const m of rowSubs[y]) {
      let ok = true;
      for (let x = 0; x < n; x++) if ((m & (1 << x)) && rem[x] < g[y][x]) { ok = false; break; }
      if (!ok) continue;
      for (let x = 0; x < n; x++) if (m & (1 << x)) rem[x] -= g[y][x];
      // 後面各列最多還能補多少：簡單剪枝略過
      rec(y + 1);
      for (let x = 0; x < n; x++) if (m & (1 << x)) rem[x] += g[y][x];
    }
  }
  rec(0);
  return cnt;
}
// 逐行逐列推理：每條線列舉「未決格」的所有子集合和，若只有一種方式達標，就定案；
function lineLogic(n, g, rowT, colT) {
  const st = []; for (let y = 0; y < n; y++) st.push(new Array(n).fill(-1)); // 1 保留 0 刪除
  const lines = [];
  for (let y = 0; y < n; y++) lines.push({ cells: Array.from({ length: n }, (_, x) => [y, x]), t: rowT[y] });
  for (let x = 0; x < n; x++) lines.push({ cells: Array.from({ length: n }, (_, y) => [y, x]), t: colT[x] });
  let changed = true;
  while (changed) {
    changed = false;
    for (const L of lines) {
      let keep = 0; const unk = [];
      for (const [y, x] of L.cells) { if (st[y][x] === 1) keep += g[y][x]; else if (st[y][x] === -1) unk.push([y, x]); }
      if (!unk.length) continue;
      const need = L.t - keep; const k = unk.length;
      let cntSol = 0; const always1 = new Array(k).fill(true), always0 = new Array(k).fill(true);
      for (let m = 0; m < (1 << k); m++) {
        let s = 0; for (let i = 0; i < k; i++) if (m & (1 << i)) s += g[unk[i][0]][unk[i][1]];
        if (s !== need) continue; cntSol++;
        for (let i = 0; i < k; i++) { if (m & (1 << i)) always0[i] = false; else always1[i] = false; }
      }
      if (cntSol === 0) return false;
      for (let i = 0; i < k; i++) {
        if (always1[i]) { st[unk[i][0]][unk[i][1]] = 1; changed = true; }
        else if (always0[i]) { st[unk[i][0]][unk[i][1]] = 0; changed = true; }
      }
    }
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (st[y][x] === -1) return false;
  return true;
}

for (const [n, lo, hi, keepP] of [[4, 1, 9, 0.5], [5, 1, 9, 0.5], [6, 1, 9, 0.5], [7, 1, 9, 0.5], [6, 1, 20, 0.5], [7, 1, 30, 0.5], [8, 1, 40, 0.5]]) {
  const rand = rng(n * 77 + hi); const N = 600; let uniq = 0, logic = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const g = []; for (let y = 0; y < n; y++) { g.push([]); for (let x = 0; x < n; x++) g[y].push(lo + Math.floor(rand() * (hi - lo + 1))); }
    const keep = []; for (let y = 0; y < n; y++) { keep.push([]); for (let x = 0; x < n; x++) keep[y].push(rand() < keepP ? 1 : 0); }
    const rowT = [], colT = [];
    for (let y = 0; y < n; y++) { let s = 0; for (let x = 0; x < n; x++) if (keep[y][x]) s += g[y][x]; rowT.push(s); }
    for (let x = 0; x < n; x++) { let s = 0; for (let y = 0; y < n; y++) if (keep[y][x]) s += g[y][x]; colT.push(s); }
    const c = countSol(n, g, rowT, colT, 2);
    if (c === 1) { uniq++; if (lineLogic(n, g, rowT, colT)) logic++; }
  }
  console.log(n + 'x' + n + ' 數字' + lo + '~' + hi + '：唯一解 ' + (uniq / N * 100).toFixed(1) + '%，其中只靠逐行逐列就推得完 ' + (uniq ? (logic / uniq * 100).toFixed(1) : 0) + '%（佔全部 ' + (logic / N * 100).toFixed(1) + '%）  ' + (Date.now() - t0) + 'ms');
}
