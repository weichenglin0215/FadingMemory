// 實驗 3：幾A幾B（4 位數、數字不重複）最少要猜幾次？用來決定「猜測次數預算」的起訖。
// 策略：每一步只從「仍可能的答案」裡選猜測，挑「最壞情況剩最少」的那個（極小化最大分組）。
function perms(digits, k) {
  const res = [];
  (function rec(cur, used) {
    if (cur.length === k) { res.push(cur.slice()); return; }
    for (let d = 0; d < digits; d++) { if (used & (1 << d)) continue; cur.push(d); rec(cur, used | (1 << d)); cur.pop(); }
  })([], 0);
  return res;
}
function run(digits, k) {
  const all = perms(digits, k); const n = all.length;
  const fb = (a, b) => { let A = 0, B = 0; for (let i = 0; i < k; i++) { if (a[i] === b[i]) A++; else if (b.indexOf(a[i]) >= 0) B++; } return A * 10 + B; };
  // 預先算好 n*n 的回饋表
  const tab = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const f = fb(all[i], all[j]); tab[i * n + j] = f; tab[j * n + i] = f; }
  const winCode = k * 10;
  let worst = 0, sum = 0; const dist = {};
  function solve(cands, depth) {
    // cands: 索引陣列；回傳 void，並累計統計
    if (cands.length === 1) { // 下一手直接猜中
      const d = depth + 1; worst = Math.max(worst, d); sum += d; dist[d] = (dist[d] || 0) + 1; return;
    }
    // 選猜測
    let best = -1, bestMax = 1e9, bestParts = -1;
    const limit = cands.length > 400 ? 400 : cands.length; // 候選太多時只抽前 400 個當猜測
    for (let gi = 0; gi < limit; gi++) {
      const g = cands[gi]; const cnt = {}; let mx = 0, parts = 0;
      for (const c of cands) { const f = tab[g * n + c]; if (!cnt[f]) { cnt[f] = 0; parts++; } cnt[f]++; if (cnt[f] > mx) mx = cnt[f]; }
      if (mx < bestMax || (mx === bestMax && parts > bestParts)) { bestMax = mx; bestParts = parts; best = g; }
    }
    const groups = {};
    for (const c of cands) { const f = tab[best * n + c]; (groups[f] = groups[f] || []).push(c); }
    for (const f in groups) {
      if (+f === winCode) { const d = depth + 1; worst = Math.max(worst, d); sum += d; dist[d] = (dist[d] || 0) + 1; }
      else solve(groups[f], depth + 1);
    }
  }
  const t0 = Date.now();
  // 第一手固定用 0123...（對稱）
  const first = all.findIndex(a => a.every((v, i) => v === i));
  const groups = {};
  for (let c = 0; c < n; c++) { const f = tab[first * n + c]; (groups[f] = groups[f] || []).push(c); }
  for (const f in groups) {
    if (+f === winCode) { worst = Math.max(worst, 1); sum += 1; dist[1] = (dist[1] || 0) + 1; }
    else solve(groups[f], 1);
  }
  console.log(`${k} 位數、數字 0~${digits - 1} 不重複：答案 ${n} 種，最壞 ${worst} 次，平均 ${(sum / n).toFixed(3)} 次  (${Date.now() - t0}ms)`);
  console.log('  次數分布：', JSON.stringify(dist));
}
run(10, 3);
run(10, 4);
run(6, 4);   // 少一點數字
