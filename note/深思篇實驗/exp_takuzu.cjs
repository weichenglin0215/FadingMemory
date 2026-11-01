// 實驗 6：黑白不連三（Takuzu）只用「兩條規則」能不能出唯一解的題？最少提示數是多少？
// 玩家規則：①同色不能連三格 ②每行每列黑白一樣多。（不用「兩行不能相同」這條，保持規則少）
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function validLine(a, n) { // 用於完整盤面
  let c0 = 0, c1 = 0;
  for (let i = 0; i < n; i++) { if (a[i] === 0) c0++; else c1++; if (i >= 2 && a[i] === a[i - 1] && a[i] === a[i - 2]) return false; }
  return c0 === c1;
}
function randomFull(n, rand) {
  // 先隨機產生所有合法的行，再回溯組合
  const lines = [];
  for (let m = 0; m < (1 << n); m++) { const a = []; for (let i = 0; i < n; i++) a.push((m >> i) & 1); if (validLine(a, n)) lines.push(a); }
  const order = lines.map((l, i) => i).sort(() => rand() - 0.5);
  const rows = [];
  function rec() {
    if (rows.length === n) return true;
    for (const idx of order) {
      const a = lines[idx]; rows.push(a);
      // 檢查欄的前綴有沒有連三／超量
      let ok = true;
      for (let x = 0; x < n && ok; x++) {
        let c1 = 0; for (let y = 0; y < rows.length; y++) c1 += rows[y][x];
        if (c1 > n / 2 || (rows.length - c1) > n / 2) ok = false;
        if (rows.length >= 3) { const l = rows.length; if (rows[l - 1][x] === rows[l - 2][x] && rows[l - 1][x] === rows[l - 3][x]) ok = false; }
      }
      if (ok && rec()) return true;
      rows.pop();
    }
    return false;
  }
  rec(); return rows.map(r => r.slice());
}
// 傳播：回傳是否能完全解出
function propagate(n, g) {
  const a = g.map(r => r.slice()); let changed = true;
  const lineFn = (get, set) => {
    let c0 = 0, c1 = 0; for (let i = 0; i < n; i++) { const v = get(i); if (v === 0) c0++; else if (v === 1) c1++; }
    for (let i = 0; i < n; i++) {
      if (get(i) !== -1) continue;
      // 連兩個同色 => 兩側必反色；夾住 => 中間必反色
      for (const v of [0, 1]) {
        let force = -1;
        if (i >= 2 && get(i - 1) === v && get(i - 2) === v) force = 1 - v;
        if (i + 2 < n && get(i + 1) === v && get(i + 2) === v) force = 1 - v;
        if (i >= 1 && i + 1 < n && get(i - 1) === v && get(i + 1) === v) force = 1 - v;
        if (force !== -1) { set(i, force); changed = true; return; }
      }
      if (c0 === n / 2) { set(i, 1); changed = true; return; }
      if (c1 === n / 2) { set(i, 0); changed = true; return; }
    }
  };
  while (changed) {
    changed = false;
    for (let y = 0; y < n; y++) lineFn(i => a[y][i], (i, v) => { a[y][i] = v; });
    for (let x = 0; x < n; x++) lineFn(i => a[i][x], (i, v) => { a[i][x] = v; });
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (a[y][x] === -1) return false;
  return true;
}
for (const n of [4, 6, 8, 10]) {
  const rand = rng(n * 31); const T = n === 10 ? 20 : 60; const counts = [];
  const t0 = Date.now();
  for (let t = 0; t < T; t++) {
    const sol = randomFull(n, rand);
    const g = sol.map(r => r.slice());
    const cells = []; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) cells.push([y, x]);
    cells.sort(() => rand() - 0.5);
    for (const [y, x] of cells) { const old = g[y][x]; g[y][x] = -1; if (!propagate(n, g)) g[y][x] = old; }
    let clues = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y][x] !== -1) clues++;
    counts.push(clues);
  }
  counts.sort((a, b) => a - b);
  console.log(n + 'x' + n + '：只用兩條規則推得完的最少提示數 min ' + counts[0] + ' / 中位 ' + counts[counts.length >> 1] + ' / max ' + counts[counts.length - 1] + '（總格數 ' + n * n + '）  ' + (Date.now() - t0) + 'ms');
}
