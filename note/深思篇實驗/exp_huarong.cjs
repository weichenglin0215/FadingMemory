// 實驗 10：華容道（4 欄 x 5 列）隨機佈局：能解的比例、最少步數分布，能不能做出「線性難度」？
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rand = rng(2026);
const W = 4, H = 5;

function randomLayout(nv, nh, ns) {
  // 回傳 20 字元字串：A=2x2 左上 a,b,c,d；V 上 v 下 w；H 左 h 右 i；S=s；'.' 空
  for (let tries = 0; tries < 200; tries++) {
    const g = new Array(W * H).fill('.');
    const can = (x, y, w, h) => { if (x < 0 || y < 0 || x + w > W || y + h > H) return false; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (g[(y + j) * W + x + i] !== '.') return false; return true; };
    const put = (x, y, w, h, codes) => { let k = 0; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g[(y + j) * W + x + i] = codes[k++]; };
    const items = [['A', 2, 2]]; for (let i = 0; i < nv; i++) items.push(['V', 1, 2]); for (let i = 0; i < nh; i++) items.push(['H', 2, 1]); for (let i = 0; i < ns; i++) items.push(['S', 1, 1]);
    let ok = true;
    for (const [t, w, h] of items) {
      let placed = false;
      for (let k = 0; k < 60 && !placed; k++) {
        const x = Math.floor(rand() * (W - w + 1)), y = Math.floor(rand() * (H - h + 1));
        if (can(x, y, w, h)) { put(x, y, w, h, t === 'A' ? ['a', 'b', 'c', 'd'] : t === 'V' ? ['v', 'w'] : t === 'H' ? ['h', 'i'] : ['s']); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return g.join('');
  }
  return null;
}
// 取出所有方塊（左上角座標與大小）
function pieces(st) {
  const res = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = st[y * W + x];
    if (c === 'a') res.push({ x, y, w: 2, h: 2 }); else if (c === 'v') res.push({ x, y, w: 1, h: 2 }); else if (c === 'h') res.push({ x, y, w: 2, h: 1 }); else if (c === 's') res.push({ x, y, w: 1, h: 1 });
  }
  return res;
}
const CODES = { '2,2': ['a', 'b', 'c', 'd'], '1,2': ['v', 'w'], '2,1': ['h', 'i'], '1,1': ['s'] };
function moveStr(st, p, dx, dy) {
  const arr = st.split(''); const codes = CODES[p.w + ',' + p.h];
  let k = 0; for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) arr[(p.y + j) * W + p.x + i] = '.';
  k = 0; for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) arr[(p.y + dy + j) * W + p.x + dx + i] = codes[k++];
  return arr.join('');
}
function canMove(st, p, dx, dy) {
  const nx = p.x + dx, ny = p.y + dy; if (nx < 0 || ny < 0 || nx + p.w > W || ny + p.h > H) return false;
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
    const X = nx + i, Y = ny + j; const inside = X >= p.x && X < p.x + p.w && Y >= p.y && Y < p.y + p.h;
    if (!inside && st[Y * W + X] !== '.') return false;
  }
  return true;
}
const isGoal = (st) => st[3 * W + 1] === 'a';
// BFS：一次「滑動」不管滑幾格都算 1 步（玩家拖一下的算法）
function solve(start) {
  const dist = new Map([[start, 0]]); let q = [start];
  if (isGoal(start)) return { moves: 0, states: 1 };
  while (q.length) {
    const nq = [];
    for (const st of q) {
      const d = dist.get(st);
      for (const p of pieces(st)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let cur = st, cp = p, k = 0;
        while (canMove(cur, cp, dx, dy)) {
          cur = moveStr(cur, cp, dx, dy); cp = { x: cp.x + dx, y: cp.y + dy, w: cp.w, h: cp.h }; k++;
          if (!dist.has(cur)) { dist.set(cur, d + 1); if (isGoal(cur)) return { moves: d + 1, states: dist.size }; nq.push(cur); }
        }
      }
    }
    q = nq;
  }
  return { moves: -1, states: dist.size };
}
const buckets = {}; let solvable = 0, N = 300, maxM = 0; const t0 = Date.now(); const all = [];
for (let i = 0; i < N; i++) {
  const lay = randomLayout(2, 3, 4); // 4 + 2*5 + 4 = 18 格
  if (!lay) continue;
  const r = solve(lay);
  if (r.moves >= 0) { solvable++; maxM = Math.max(maxM, r.moves); all.push(r.moves); const b = Math.floor(r.moves / 10) * 10; buckets[b] = (buckets[b] || 0) + 1; }
}
all.sort((a, b) => a - b);
console.log('隨機佈局 ' + N + ' 張：有解 ' + solvable + ' 張；最少步數(拖一下算 1 步) 中位 ' + all[all.length >> 1] + '，最大 ' + maxM + '；分布(每 10 步一格)：' + JSON.stringify(buckets) + '  用時 ' + (Date.now() - t0) + 'ms');
