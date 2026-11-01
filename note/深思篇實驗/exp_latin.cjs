// 實驗 8：(a) 數獨抓錯——填滿的數獨裡只錯一格，「只改一格就能修好」的格子是不是唯一？
//         (c) 整除密碼——每一位的整除規則隨機換，解是否常常唯一？
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rand = rng(12345);

// ---------- (a) 數獨抓錯 ----------
function sudokuFull(R, C, rand) { // R x C 的宮，盤面 N = R*C
  const N = R * C; const g = []; for (let y = 0; y < N; y++) g.push(new Array(N).fill(0));
  const ok = (y, x, v) => {
    for (let i = 0; i < N; i++) { if (g[y][i] === v || g[i][x] === v) return false; }
    const by = y - (y % R), bx = x - (x % C);
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (g[by + i][bx + j] === v) return false;
    return true;
  };
  function rec(p) {
    if (p === N * N) return true;
    const y = (p / N) | 0, x = p % N;
    const vs = Array.from({ length: N }, (_, i) => i + 1).sort(() => rand() - 0.5);
    for (const v of vs) { if (ok(y, x, v)) { g[y][x] = v; if (rec(p + 1)) return true; g[y][x] = 0; } }
    return false;
  }
  rec(0); return g;
}
function validGrid(R, C, g) {
  const N = R * C; const full = (1 << (N + 1)) - 2;
  for (let i = 0; i < N; i++) { let r = 0, c = 0; for (let j = 0; j < N; j++) { r |= 1 << g[i][j]; c |= 1 << g[j][i]; } if (r !== full || c !== full) return false; }
  for (let by = 0; by < N; by += R) for (let bx = 0; bx < N; bx += C) { let b = 0; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) b |= 1 << g[by + i][bx + j]; if (b !== full) return false; }
  return true;
}
function repairs(R, C, g) { // 回傳所有「只改一格就變合法」的 (y,x,v)
  const N = R * C; const res = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const old = g[y][x];
    for (let v = 1; v <= N; v++) { if (v === old) continue; g[y][x] = v; if (validGrid(R, C, g)) res.push([y, x, v]); }
    g[y][x] = old;
  }
  return res;
}
for (const [R, C] of [[2, 2], [2, 3], [3, 3]]) {
  const N = R * C; let uniq = 0, T = 300;
  for (let t = 0; t < T; t++) {
    const g = sudokuFull(R, C, rand);
    const y = Math.floor(rand() * N), x = Math.floor(rand() * N); const orig = g[y][x];
    let w; do { w = 1 + Math.floor(rand() * N); } while (w === orig);
    g[y][x] = w;
    const rp = repairs(R, C, g);
    if (rp.length === 1) uniq++;
  }
  console.log('數獨抓錯 ' + N + 'x' + N + '：隨機改錯一格，剛好只有 1 種單格修法的比例 ' + (uniq / T * 100).toFixed(0) + '%（其餘要重抽或多給線索）');
}

// （摩天樓的實驗已搬到 exp_sky.cjs，那裡先確認盤面全線索唯一才開始砍線索。）

// ---------- (c) 整除密碼：每一位的整除規則隨機 ----------
for (const n of [5, 6, 7, 8]) {
  let uniq = 0, zero = 0, T = 400; const dist = {};
  for (let t = 0; t < T; t++) {
    const d = []; for (let k = 0; k < n; k++) d.push(1 + Math.floor(rand() * 8) + 1); // 2~9
    d[0] = 1; // 第一位不設限
    let cnt = 0;
    (function rec(prefix, used, k) {
      if (cnt > 5) return;
      if (k === n) { cnt++; return; }
      for (let v = 1; v <= 9; v++) { if (used & (1 << v)) continue; const p = prefix * 10 + v; if (p % d[k] === 0) rec(p, used | (1 << v), k + 1); }
    })(0, 0, 0);
    if (cnt === 1) uniq++; if (cnt === 0) zero++;
  }
  console.log('整除密碼 ' + n + ' 位、每位除數隨機 2~9：剛好唯一解 ' + (uniq / T * 100).toFixed(1) + '%，無解 ' + (zero / T * 100).toFixed(1) + '%');
}
