// 實驗 1：隨機點陣圖做成數織，有多少比例「只靠逐行逐列推理」就能唯一解開？
// 結論用途：決定數織出題器要「隨機造圖再過濾」還是「手繪圖庫」。
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function clueOf(line) { const r = []; let c = 0; for (const v of line) { if (v) c++; else if (c) { r.push(c); c = 0; } } if (c) r.push(c); return r.length ? r : [0]; }

// 列舉一行所有符合線索的填法，回傳「每格是否一定相同」的交集；矛盾回傳 null
function solveLine(n, clue, known) {
  if (clue.length === 1 && clue[0] === 0) { for (let k = 0; k < n; k++) if (known[k] === 1) return null; return new Array(n).fill(0); }
  const res = new Array(n).fill(null); let any = false; const cur = new Array(n).fill(0);
  let need = 0; const suffixNeed = [];
  for (let j = clue.length - 1; j >= 0; j--) { need += clue[j] + (j < clue.length - 1 ? 1 : 0); suffixNeed[j] = need; }
  function rec(i, ci) {
    if (ci === clue.length) {
      for (let k = i; k < n; k++) if (known[k] === 1) return;
      for (let k = i; k < n; k++) cur[k] = 0;
      any = true;
      for (let k = 0; k < n; k++) { if (res[k] === null) res[k] = cur[k]; else if (res[k] !== cur[k]) res[k] = -1; }
      return;
    }
    const len = clue[ci];
    for (let s = i; s + suffixNeed[ci] <= n; s++) {
      let ok = true;
      for (let k = i; k < s; k++) { if (known[k] === 1) { ok = false; break; } cur[k] = 0; }
      if (!ok) break;
      for (let k = s; k < s + len; k++) { if (known[k] === 0) { ok = false; break; } }
      if (!ok) continue;
      for (let k = s; k < s + len; k++) cur[k] = 1;
      if (ci < clue.length - 1) {
        if (s + len < n && known[s + len] === 1) continue;
        cur[s + len] = 0;
        rec(s + len + 1, ci + 1);
      } else rec(s + len, ci + 1);
    }
  }
  rec(0, 0);
  if (!any) return null;
  return res.map(v => v === null ? -1 : v);
}

function lineSolvable(W, H, g) {
  const rowC = [], colC = [];
  for (let y = 0; y < H; y++) rowC.push(clueOf(g[y]));
  for (let x = 0; x < W; x++) { const col = []; for (let y = 0; y < H; y++) col.push(g[y][x]); colC.push(clueOf(col)); }
  const known = []; for (let y = 0; y < H; y++) known.push(new Array(W).fill(-1));
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < H; y++) {
      const r = solveLine(W, rowC[y], known[y]); if (!r) return false;
      for (let x = 0; x < W; x++) if (r[x] !== -1 && known[y][x] === -1) { known[y][x] = r[x]; changed = true; }
    }
    for (let x = 0; x < W; x++) {
      const col = known.map(row => row[x]);
      const r = solveLine(H, colC[x], col); if (!r) return false;
      for (let y = 0; y < H; y++) if (r[y] !== -1 && known[y][x] === -1) { known[y][x] = r[y]; changed = true; }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (known[y][x] === -1) return false;
  return true;
}

// 平滑的「像圖案」的點陣：先隨機，再用鄰居多數決平滑幾次
function blobby(W, H, p, rand, smooth) {
  let g = []; for (let y = 0; y < H; y++) { g.push([]); for (let x = 0; x < W; x++) g[y].push(rand() < p ? 1 : 0); }
  for (let it = 0; it < smooth; it++) {
    const n = g.map(r => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) { s += g[yy][xx]; c++; } }
      n[y][x] = s * 2 > c ? 1 : (s * 2 < c ? 0 : g[y][x]);
    }
    g = n;
  }
  return g;
}

const sizes = [[5, 5], [6, 6], [7, 7], [7, 9], [7, 12]];
for (const [W, H] of sizes) {
  const out = [];
  for (const [label, mk] of [
    ['隨機50%', (r) => blobby(W, H, 0.5, r, 0)],
    ['隨機65%', (r) => blobby(W, H, 0.65, r, 0)],
    ['平滑1次', (r) => blobby(W, H, 0.55, r, 1)],
  ]) {
    const rand = rng(W * 100 + H); let ok = 0; const N = 1500; const t0 = Date.now();
    for (let i = 0; i < N; i++) { const g = mk(rand); if (lineSolvable(W, H, g)) ok++; }
    out.push(label + ' ' + (ok / N * 100).toFixed(1) + '%');
  }
  console.log(W + 'x' + H + '  可只靠逐行逐列推完：' + out.join('｜'));
}
