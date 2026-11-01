// 實驗 2：踩地雷「免猜盤面」好不好出？
// 方法：隨機放雷（第一次點的 3x3 內不放雷），用「單格規則＋子集合規則」模擬人類推理，
// 統計「完全不用猜就能清完」的比例，以及不同強度的推理規則會差多少。
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function makeBoard(W, H, M, sx, sy, rand) {
  const mine = new Uint8Array(W * H);
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue; cells.push(y * W + x); }
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  for (let i = 0; i < M; i++) mine[cells[i]] = 1;
  return mine;
}
function nbrs(W, H, i) { const x = i % W, y = (i / W) | 0, r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < W && yy >= 0 && yy < H) r.push(yy * W + xx); } return r; }

// level: 1=只用單格規則；2=加子集合規則
function solve(W, H, mine, sx, sy, level) {
  const num = new Int8Array(W * H);
  for (let i = 0; i < W * H; i++) num[i] = nbrs(W, H, i).reduce((a, j) => a + mine[j], 0);
  const state = new Int8Array(W * H).fill(-1); // -1 未知, 0 已翻, 1 旗
  const stack = [];
  function reveal(i) {
    if (state[i] !== -1) return;
    state[i] = 0;
    if (num[i] === 0) for (const j of nbrs(W, H, i)) if (state[j] === -1) reveal(j);
  }
  reveal(sy * W + sx);
  let progress = true;
  while (progress) {
    progress = false;
    // 單格規則
    const cons = [];
    for (let i = 0; i < W * H; i++) {
      if (state[i] !== 0 || num[i] === 0) continue;
      let flags = 0; const unk = [];
      for (const j of nbrs(W, H, i)) { if (state[j] === 1) flags++; else if (state[j] === -1) unk.push(j); }
      if (!unk.length) continue;
      const need = num[i] - flags;
      if (need === 0) { for (const j of unk) { reveal(j); } progress = true; continue; }
      if (need === unk.length) { for (const j of unk) state[j] = 1; progress = true; continue; }
      cons.push({ s: unk, n: need });
    }
    if (progress) continue;
    if (level >= 2) {
      // 子集合規則：A 是 B 的子集合 => B\A 的雷數 = nB - nA
      for (let a = 0; a < cons.length && !progress; a++) for (let b = 0; b < cons.length && !progress; b++) {
        if (a === b) continue;
        const A = cons[a], B = cons[b];
        if (A.s.length >= B.s.length) continue;
        const setB = new Set(B.s); let sub = true; for (const x of A.s) if (!setB.has(x)) { sub = false; break; }
        if (!sub) continue;
        const setA = new Set(A.s); const diff = B.s.filter(x => !setA.has(x)); const dn = B.n - A.n;
        if (dn === 0) { for (const j of diff) reveal(j); progress = true; }
        else if (dn === diff.length) { for (const j of diff) state[j] = 1; progress = true; }
      }
    }
  }
  // 全部非雷格都翻開 => 成功
  for (let i = 0; i < W * H; i++) if (!mine[i] && state[i] !== 0) return false;
  return true;
}

const cfgs = [[7, 7, 6], [7, 7, 9], [9, 9, 10], [9, 9, 14], [9, 11, 18], [9, 12, 24]];
for (const [W, H, M] of cfgs) {
  const rand = rng(W * 1000 + H * 10 + M); const N = 3000; let l1 = 0, l2 = 0;
  for (let i = 0; i < N; i++) {
    const sx = (W / 2) | 0, sy = (H / 2) | 0;
    const mine = makeBoard(W, H, M, sx, sy, rand);
    if (solve(W, H, mine, sx, sy, 1)) l1++;
    if (solve(W, H, mine, sx, sy, 2)) l2++;
  }
  console.log(W + 'x' + H + ' 雷' + M + '  免猜比例：只用單格規則 ' + (l1 / N * 100).toFixed(1) + '%｜加子集合規則 ' + (l2 / N * 100).toFixed(1) + '%  （平均每 ' + (N / Math.max(l2, 1)).toFixed(1) + ' 張盤抽到 1 張免猜）');
}
