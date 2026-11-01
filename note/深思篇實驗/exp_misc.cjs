// 實驗 7：幾個數學／推理小遊戲的出題資料。
// (a) 24 點：1~13 的四張牌有幾成有解？解越少越難。
function solve24(nums, target) {
  const sols = new Set();
  function rec(items) { // items: [{v, e}]
    if (items.length === 1) { if (Math.abs(items[0].v - target) < 1e-9) sols.add(items[0].e); return; }
    for (let i = 0; i < items.length; i++) for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const a = items[i], b = items[j]; const rest = items.filter((_, k) => k !== i && k !== j);
      const cand = [[a.v + b.v, '(' + a.e + '+' + b.e + ')'], [a.v - b.v, '(' + a.e + '-' + b.e + ')'], [a.v * b.v, '(' + a.e + '*' + b.e + ')']];
      if (Math.abs(b.v) > 1e-9) cand.push([a.v / b.v, '(' + a.e + '/' + b.e + ')']);
      for (const [v, e] of cand) rec(rest.concat([{ v, e }]));
    }
  }
  rec(nums.map(n => ({ v: n, e: String(n) })));
  return sols.size;
}
{
  const buckets = { 0: 0, '1-4': 0, '5-19': 0, '20-59': 0, '60+': 0 }; let total = 0;
  for (let a = 1; a <= 13; a++) for (let b = a; b <= 13; b++) for (let c = b; c <= 13; c++) for (let d = c; d <= 13; d++) {
    total++; const k = solve24([a, b, c, d], 24);
    if (k === 0) buckets[0]++; else if (k < 5) buckets['1-4']++; else if (k < 20) buckets['5-19']++; else if (k < 60) buckets['20-59']++; else buckets['60+']++;
  }
  console.log('24點 四張牌(1~13，不計順序) 共 ' + total + ' 組，依「不同寫法數」分布：', JSON.stringify(buckets));
}
// (b) 整除密碼：n 位數、數字 1~9 不重複、前 k 位能被 k 整除。解有幾個？
{
  for (let n = 3; n <= 9; n++) {
    let cnt = 0; const sols = [];
    (function rec(prefix, used, k) {
      if (k === n) { cnt++; if (sols.length < 3) sols.push(prefix); return; }
      for (let d = 1; d <= 9; d++) { if (used & (1 << d)) continue; const p = prefix * 10 + d; if (p % (k + 1) === 0) rec(p, used | (1 << d), k + 1); }
    })(0, 0, 0);
    console.log('整除密碼 ' + n + ' 位（數字 1~9 不重複）：共 ' + cnt + ' 個解' + (cnt <= 3 ? ' ' + sols.join(',') : ''));
  }
}
// (c) 比分推理：n 隊單循環，勝3平1敗0。給定最終積分，有幾種賽果？要揭露幾場才唯一？
function leagueStats(n, trials, seed) {
  let s = seed >>> 0; const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const matches = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) matches.push([i, j]);
  const M = matches.length; let totalReveal = 0, multi = 0; const t0 = Date.now();
  for (let t = 0; t < trials; t++) {
    const res = matches.map(() => Math.floor(rand() * 3)); // 0 主勝 1 平 2 客勝
    const pts = new Array(n).fill(0);
    matches.forEach(([i, j], k) => { if (res[k] === 0) pts[i] += 3; else if (res[k] === 2) pts[j] += 3; else { pts[i]++; pts[j]++; } });
    // 數解（上限 2）：給定「已揭露的場次」
    const countSol = (revealed) => {
      let c = 0; const cur = new Array(n).fill(0);
      (function rec(k) {
        if (c >= 2) return;
        if (k === M) { for (let i = 0; i < n; i++) if (cur[i] !== pts[i]) return; c++; return; }
        const [i, j] = matches[k];
        const opts = revealed.has(k) ? [res[k]] : [0, 1, 2];
        for (const o of opts) {
          if (o === 0) cur[i] += 3; else if (o === 2) cur[j] += 3; else { cur[i]++; cur[j]++; }
          if (cur[i] <= pts[i] && cur[j] <= pts[j]) rec(k + 1);
          if (o === 0) cur[i] -= 3; else if (o === 2) cur[j] -= 3; else { cur[i]--; cur[j]--; }
        }
      })(0);
      return c;
    };
    const revealed = new Set();
    if (countSol(revealed) > 1) multi++;
    const order = matches.map((_, k) => k).sort(() => rand() - 0.5);
    let idx = 0;
    while (countSol(revealed) > 1 && idx < order.length) { revealed.add(order[idx++]); }
    totalReveal += revealed.size;
  }
  console.log('比分推理 ' + n + ' 隊(' + M + ' 場)：只給積分就有多種賽果的比例 ' + (multi / trials * 100).toFixed(0) + '%；要再揭露的場數平均 ' + (totalReveal / trials).toFixed(2) + '  (' + (Date.now() - t0) + 'ms)');
}
leagueStats(4, 300, 1); leagueStats(5, 200, 2); leagueStats(6, 40, 3);
