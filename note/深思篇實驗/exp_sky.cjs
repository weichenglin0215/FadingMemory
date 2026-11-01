// 實驗 9：摩天樓只給外圍線索，唯一的比例與最少線索數（多試幾張盤面）。
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rand = rng(99);
function latin(N) {
  const g = []; for (let y = 0; y < N; y++) g.push(new Array(N).fill(0));
  function rec(p) {
    if (p === N * N) return true; const y = (p / N) | 0, x = p % N;
    const vs = Array.from({ length: N }, (_, i) => i + 1).sort(() => rand() - 0.5);
    for (const v of vs) { let ok = true; for (let i = 0; i < N; i++) if (g[y][i] === v || g[i][x] === v) { ok = false; break; } if (ok) { g[y][x] = v; if (rec(p + 1)) return true; g[y][x] = 0; } }
    return false;
  }
  rec(0); return g;
}
function seen(arr) { let m = 0, c = 0; for (const v of arr) if (v > m) { m = v; c++; } return c; }
function skyClues(N, g) {
  const cl = [];
  for (let x = 0; x < N; x++) cl.push(seen(g.map(r => r[x])));
  for (let x = 0; x < N; x++) cl.push(seen(g.map(r => r[x]).reverse()));
  for (let y = 0; y < N; y++) cl.push(seen(g[y]));
  for (let y = 0; y < N; y++) cl.push(seen(g[y].slice().reverse()));
  return cl;
}
function skyCount(N, cl, cap) {
  const g = []; for (let y = 0; y < N; y++) g.push(new Array(N).fill(0)); let cnt = 0;
  const colMask = new Array(N).fill(0), rowMask = new Array(N).fill(0);
  function okPartial(y, x) { // 目前這行／列的「已填前綴」最多能看到幾棟，不能超過線索（只用上界）
    return true;
  }
  function rec(p) {
    if (cnt >= cap) return; if (p === N * N) { cnt++; return; }
    const y = (p / N) | 0, x = p % N;
    for (let v = 1; v <= N; v++) {
      if ((rowMask[y] >> v) & 1 || (colMask[x] >> v) & 1) continue;
      g[y][x] = v; rowMask[y] |= 1 << v; colMask[x] |= 1 << v;
      let ok = true;
      if (x === N - 1) { if (cl[2 * N + y] !== -1 && seen(g[y]) !== cl[2 * N + y]) ok = false; else if (cl[3 * N + y] !== -1 && seen(g[y].slice().reverse()) !== cl[3 * N + y]) ok = false; }
      if (ok && y === N - 1) { const col = g.map(r => r[x]); if (cl[x] !== -1 && seen(col) !== cl[x]) ok = false; else if (cl[N + x] !== -1 && seen(col.slice().reverse()) !== cl[N + x]) ok = false; }
      // 上方線索可提早剪枝：欄的前綴已看到的棟數不能超過線索
      if (ok && cl[x] !== -1) { let m = 0, c = 0; for (let i = 0; i <= y; i++) if (g[i][x] > m) { m = g[i][x]; c++; } if (c > cl[x]) ok = false; }
      if (ok && cl[2 * N + y] !== -1) { let m = 0, c = 0; for (let i = 0; i <= x; i++) if (g[y][i] > m) { m = g[y][i]; c++; } if (c > cl[2 * N + y]) ok = false; }
      if (ok) rec(p + 1);
      g[y][x] = 0; rowMask[y] &= ~(1 << v); colMask[x] &= ~(1 << v);
    }
  }
  rec(0); return cnt;
}
for (const N of [4, 5, 6]) {
  let fullUnique = 0, tried = 0, mins = [];
  const t0 = Date.now();
  while (tried < 40) {
    tried++;
    const g = latin(N); const cl = skyClues(N, g);
    if (skyCount(N, cl, 2) !== 1) continue;
    fullUnique++;
    const idx = Array.from({ length: 4 * N }, (_, i) => i).sort(() => rand() - 0.5);
    let kept = 4 * N;
    for (const i of idx) { const old = cl[i]; cl[i] = -1; if (skyCount(N, cl, 2) === 1) kept--; else cl[i] = old; }
    mins.push(kept);
  }
  mins.sort((a, b) => a - b);
  console.log('摩天樓 ' + N + 'x' + N + '：隨機盤面 ' + tried + ' 張，全部外圍線索就唯一的有 ' + fullUnique + ' 張；砍到最少 ' + (mins.length ? mins[0] + '~' + mins[mins.length - 1] + '（中位 ' + mins[mins.length >> 1] + '）' : '—') + ' 條線索  ' + (Date.now() - t0) + 'ms');
}
