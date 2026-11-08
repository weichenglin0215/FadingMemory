/* 實驗二：「剛體拼裝」假說
   假說：3 色時，三角形相連的一塊（剛體）只有一種圖樣（最多換色）。
         形狀若由許多剛體用細頸（鉸鏈）接起來，每塊可以獨立翻轉，
         局部規則推不動，只有「各色總數」這個全域條件能決定每塊怎麼翻——
         這會把遊戲變成「整數湊數」的全域推理，也就是規則直推和假設都很難破的結構。
   做法：隨機挖洞形狀 → 窮舉所有 3 色著色 → 依各色數量分組 → 找「只有一個解」的數量組合 → 用量尺評分。
   執行：node test/hexcolor/exp_rigid.cjs [形狀數] [種子] */
'use strict';
const L = require('./lab.cjs');
const { Core, makeEngine, rate, nodesStats, hexPatch, largestComponent, shuffle } = L;
const NSHAPES = Number(process.argv[2] || 200);
const rng = Core.makeRng(Number(process.argv[3] || 5));

/* 把形狀拆成剛體：三角形共用一條邊就算同一塊；沒有三角形的格子自成一塊 */
function rigidBlocks(G) {
    const n = G.n, tris = [];
    const adj = G.nbrs.map(a => new Set(a));
    for (let i = 0; i < n; i++) for (const j of G.nbrs[i]) if (j > i) for (const m of G.nbrs[j]) if (m > j && adj[i].has(m)) tris.push([i, j, m]);
    const parent = tris.map((_, i) => i);
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const edgeOwner = new Map();
    tris.forEach((t, ti) => {
        [[t[0], t[1]], [t[0], t[2]], [t[1], t[2]]].forEach(e => {
            const key = e[0] * 1000 + e[1];
            if (edgeOwner.has(key)) parent[find(ti)] = find(edgeOwner.get(key)); else edgeOwner.set(key, ti);
        });
    });
    const blocks = new Map();
    tris.forEach((t, ti) => {
        const r = find(ti);
        if (!blocks.has(r)) blocks.set(r, new Set());
        t.forEach(v => blocks.get(r).add(v));
    });
    return Array.from(blocks.values()).map(s => Array.from(s));
}

/* 窮舉所有 3 色著色，依數量分組（cap 張以內）。回傳 Map(key→個數)，超過 cap 回傳 null */
function spectrum(G, cap) {
    const n = G.n;
    /* 走訪順序：BFS，讓前面的格子盡量先決定鄰居 */
    const order = [], seen = new Uint8Array(n), q = [0];
    seen[0] = 1;
    for (let h = 0; h < q.length; h++) { order.push(q[h]); for (const j of G.nbrs[q[h]]) if (!seen[j]) { seen[j] = 1; q.push(j); } }
    if (order.length !== n) return null;
    const col = new Int8Array(n).fill(-1), cnt = [0, 0, 0];
    const map = new Map();
    let total = 0, over = false;
    (function dfs(t) {
        if (over) return;
        if (t === n) {
            total++;
            if (total > cap) { over = true; return; }
            const key = cnt[0] * 10000 + cnt[1] * 100 + cnt[2];
            map.set(key, (map.get(key) || 0) + 1);
            return;
        }
        const v = order[t];
        let forbid = 0;
        for (const j of G.nbrs[v]) if (col[j] >= 0) forbid |= 1 << col[j];
        for (let c = 0; c < 3; c++) if (!((forbid >> c) & 1)) {
            col[v] = c; cnt[c]++;
            dfs(t + 1);
            cnt[c]--; col[v] = -1;
        }
    })(0);
    return over ? null : { map, total };
}

const results = [];
let tried = 0, skipped = 0;
const t0 = Date.now();
for (let s = 0; s < NSHAPES; s++) {
    const p = 0.28 + rng() * 0.22, R = 5 + Math.floor(rng() * 3);
    let cells = largestComponent(hexPatch(R).filter(() => rng() > p));
    if (cells.length < 40 || cells.length > 90) { skipped++; continue; }
    cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const G = Core.buildGraph(cells);
    const sp = spectrum(G, 3000000);
    if (!sp) { skipped++; continue; }
    tried++;
    /* 只有一個解、且三色數量都不同（否則換色就會有第二個解）的數量組合 */
    const uniq = [];
    for (const [key, v] of sp.map) {
        if (v !== 1) continue;
        const a = Math.floor(key / 10000), b = Math.floor(key / 100) % 100, c = key % 100;
        if (a > b && b > c) uniq.push([a, b, c]);
    }
    if (!uniq.length) continue;
    const blocks = rigidBlocks(G);
    const E = makeEngine(G, 3);
    const none = new Int8Array(G.n).fill(-1);
    for (const counts of uniq) {
        const u = E.count(none, counts, 2, 300000);
        if (u.found !== 1 || u.aborted) continue;
        const r = rate(E, none, counts, { maxDepth: 2, ms: 6000 });
        const ns = nodesStats(E, none, counts, rng, 5, 300000);
        /* 接近這個數量組合的「差一點」假解有幾個（距離 ≤2） */
        let near = 0;
        for (const [key, v] of sp.map) {
            const a = Math.floor(key / 10000), b = Math.floor(key / 100) % 100, c = key % 100;
            const dist = Math.abs(a - counts[0]) + Math.abs(b - counts[1]) + Math.abs(c - counts[2]);
            if (dist > 0 && dist <= 2) near += v;
        }
        results.push({ cells, counts, n: G.n, total: sp.total, blocks: blocks.length, l0: r.l0, depth: r.solved ? r.depth : (r.timedOut ? 'T' : 'S'), uses: r.uses, nodes: ns.median, near });
    }
}
results.sort((a, b) => b.nodes - a.nodes);
console.log(`試了 ${tried} 個形狀（略過 ${skipped}），得到 ${results.length} 組零預填唯一解；${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const r of results.slice(0, 15)) {
    console.log(`N=${r.n} 數量=${r.counts} 著色總數=${r.total} 剛體=${r.blocks} 規則直推=${r.l0} 深度=${r.depth} uses=${JSON.stringify(r.uses)} 節點中位=${r.nodes} 差一點假解=${r.near}`);
}
require('fs').writeFileSync(__dirname + '/rigid_top.json', JSON.stringify(results.slice(0, 40)));
