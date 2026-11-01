// 實驗 12：驗證企劃裡引用的經典益智題「最少步數」數字（BFS）。
function bfs(start, isGoal, next) {
  const dist = new Map([[start, 0]]); let q = [start];
  if (isGoal(start)) return 0;
  while (q.length) { const nq = []; for (const s of q) { const d = dist.get(s); for (const t of next(s)) { if (!dist.has(t)) { dist.set(t, d + 1); if (isGoal(t)) return d + 1; nq.push(t); } } } q = nq; }
  return -1;
}
function bfsAll(start, next) { // 回傳每個狀態的距離
  const dist = new Map([[start, 0]]); let q = [start];
  while (q.length) { const nq = []; for (const s of q) { const d = dist.get(s); for (const t of next(s)) { if (!dist.has(t)) { dist.set(t, d + 1); nq.push(t); } } } q = nq; }
  return dist;
}
// 翻煎餅：N 片，所有排列的最大最少翻轉次數
function pancake(N) {
  const sorted = Array.from({ length: N }, (_, i) => i + 1).join(',');
  const next = (s) => { const a = s.split(',').map(Number); const res = []; for (let k = 2; k <= N; k++) { const b = a.slice(0, k).reverse().concat(a.slice(k)); res.push(b.join(',')); } return res; };
  const dist = bfsAll(sorted, next); let mx = 0; for (const d of dist.values()) mx = Math.max(mx, d); return mx;
}
console.log('翻煎餅 最多需要翻：', [3, 4, 5, 6, 7].map(n => 'N=' + n + ':' + pancake(n)).join('  '));
// 九連環：n 個環最少步數（狀態 = bitmask，1 表示環套著）
function rings(n) {
  const full = (1 << n) - 1;
  const next = (s) => { const res = []; res.push(s ^ 1); // 第 1 個環（bit0）隨時可動
    for (let i = 1; i < n; i++) { // 第 i+1 個環可動：bit(i-1) 為 1，且 bit0..bit(i-2) 全為 0
      if (((s >> (i - 1)) & 1) === 1 && (s & ((1 << (i - 1)) - 1)) === 0) res.push(s ^ (1 << i)); }
    return res; };
  return bfs(full, (s) => s === 0, next);
}
console.log('九連環 最少步數：', [3, 4, 5, 6, 7, 8, 9].map(n => n + '環:' + rings(n)).join('  '));
// 青蛙換位
function frogs(n) {
  const start = 'G'.repeat(n) + '_' + 'R'.repeat(n), goal = 'R'.repeat(n) + '_' + 'G'.repeat(n);
  const next = (s) => { const res = []; const a = s.split(''); for (let i = 0; i < a.length; i++) { const c = a[i]; if (c === '_') continue; const dir = c === 'G' ? 1 : -1;
      for (const step of [1, 2]) { const j = i + dir * step; if (j < 0 || j >= a.length || a[j] !== '_') continue; if (step === 2 && a[i + dir] === c) continue; if (step === 2 && a[i + dir] === '_') continue;
        const b = a.slice(); b[j] = c; b[i] = '_'; res.push(b.join('')); } }
    return res; };
  return bfs(start, (s) => s === goal, next);
}
console.log('青蛙換位 最少步數：', [2, 3, 4, 5].map(n => n + '隻:' + frogs(n) + '(公式' + (n * n + 2 * n) + ')').join('  '));
// 倒水 (a,b) -> 目標 t
function jugs(a, b, t) {
  const next = (s) => { const [x, y] = s.split(',').map(Number); const r = [[a, y], [x, b], [0, y], [x, 0]];
    const p1 = Math.min(x, b - y); r.push([x - p1, y + p1]); const p2 = Math.min(y, a - x); r.push([x + p2, y - p2]); return r.map(v => v.join(',')); };
  return bfs('0,0', (s) => { const [x, y] = s.split(',').map(Number); return x === t || y === t; }, next);
}
console.log('倒水：(3,5)→4:', jugs(3, 5, 4), ' (5,7)→6:', jugs(5, 7, 6), ' (4,9)→6:', jugs(4, 9, 6), ' (3,7)→5:', jugs(3, 7, 5));
// 翻杯子 (N,k)：全部朝上 → 全部朝下
function cups(N, k) {
  const full = (1 << N) - 1; // 1 = 朝下
  const masks = []; for (let m = 0; m < (1 << N); m++) { let c = 0; for (let i = 0; i < N; i++) if (m & (1 << i)) c++; if (c === k) masks.push(m); }
  return bfs(0, (s) => s === full, (s) => masks.map(m => s ^ m));
}
console.log('翻杯子 (杯數,每次翻)：', [[3, 2], [4, 3], [5, 2], [6, 2], [7, 3], [8, 3], [7, 4], [6, 4], [9, 3], [5, 4]].map(([n, k]) => '(' + n + ',' + k + '):' + cups(n, k)).join('  '), '  （-1＝不可能）');
// 過河：狼羊菜
function wgc() {
  // 狀態：農夫、狼、羊、菜 各在 0(左) 或 1(右)
  const key = (f, w, g, c) => f + '' + w + g + c;
  const ok = (f, w, g, c) => !(w === g && f !== w) && !(g === c && f !== g);
  const next = (s) => { const [f, w, g, c] = s.split('').map(Number); const res = []; const nf = 1 - f;
    if (ok(nf, w, g, c)) res.push(key(nf, w, g, c));
    if (w === f && ok(nf, nf, g, c)) res.push(key(nf, nf, g, c));
    if (g === f && ok(nf, w, nf, c)) res.push(key(nf, w, nf, c));
    if (c === f && ok(nf, w, g, nf)) res.push(key(nf, w, g, nf));
    return res; };
  return bfs('0000', (s) => s === '1111', next);
}
console.log('狼羊菜 最少過河次數：', wgc());
// 提燈過橋 (1,2,5,10)：狀態 = 左岸集合 bitmask + 燈在哪 + 已用時間（Dijkstra 簡化：窮舉小規模）
function torch(times) {
  const n = times.length; const full = (1 << n) - 1; const best = new Map(); let ans = 1e9;
  (function rec(left, lamp, t) {
    if (t >= ans) return; const key = left + ',' + lamp; if (best.has(key) && best.get(key) <= t) return; best.set(key, t);
    if (left === 0) { ans = Math.min(ans, t); return; }
    if (lamp === 0) { for (let i = 0; i < n; i++) if (left & (1 << i)) { rec(left & ~(1 << i), 1, t + times[i]); for (let j = i + 1; j < n; j++) if (left & (1 << j)) rec(left & ~(1 << i) & ~(1 << j), 1, t + Math.max(times[i], times[j])); } }
    else { const right = full & ~left; for (let i = 0; i < n; i++) if (right & (1 << i)) rec(left | (1 << i), 0, t + times[i]); }
  })(full, 0, 0);
  return ans;
}
console.log('提燈過橋 (1,2,5,10) 最少分鐘：', torch([1, 2, 5, 10]), ' (1,3,4,9):', torch([1, 3, 4, 9]), ' (2,3,7,11):', torch([2, 3, 7, 11]));
// 數字推盤：8 數字 最難局面步數
(function () {
  const goal = '123456780'; const next = (s) => { const z = s.indexOf('0'); const x = z % 3, y = (z / 3) | 0; const res = []; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx > 2 || ny > 2) continue; const a = s.split(''); const t = ny * 3 + nx; [a[z], a[t]] = [a[t], a[z]]; res.push(a.join('')); } return res; };
  const dist = bfsAll(goal, next); let mx = 0; for (const d of dist.values()) mx = Math.max(mx, d);
  console.log('數字推盤 3x3：可達局面 ' + dist.size + ' 個，最難局面最少 ' + mx + ' 步');
})();
