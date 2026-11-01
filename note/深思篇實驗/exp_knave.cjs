// 實驗 11：問一句——N 人、騙子恰好 k 位；每次問「A 說 B 是老實人嗎？」，答「是」＝A、B 同類。
// 求最壞情況最少要問幾次才能確定誰是騙子（決策樹最小深度）。
function combos(n, k) { const res = []; (function rec(i, cnt, mask) { if (cnt === k) { res.push(mask); return; } if (i === n || n - i < k - cnt) return; rec(i + 1, cnt + 1, mask | (1 << i)); rec(i + 1, cnt, mask); })(0, 0, 0); return res; }
function minQ(n, k) {
  const all = combos(n, k); // mask 的 1 代表騙子
  const memo = new Map();
  function depth(cands) {
    if (cands.length === 1) return 0;
    const key = cands.join(',');
    if (memo.has(key)) return memo.get(key);
    let best = 99;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const same = [], diff = [];
      for (const m of cands) { const sa = (m >> a) & 1, sb = (m >> b) & 1; (sa === sb ? same : diff).push(m); }
      if (!same.length || !diff.length) continue;
      const d = 1 + Math.max(depth(same), depth(diff));
      if (d < best) best = d;
    }
    memo.set(key, best); return best;
  }
  return depth(all);
}
for (const [n, k] of [[3, 1], [4, 1], [5, 1], [5, 2], [6, 1], [6, 2], [7, 2], [7, 3]]) {
  console.log('N=' + n + ' 騙子恰好 ' + k + ' 位：最壞情況最少要問 ' + minQ(n, k) + ' 次（候選 ' + combos(n, k).length + ' 種）');
}
