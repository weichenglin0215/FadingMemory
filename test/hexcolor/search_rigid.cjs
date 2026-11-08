/* 搜尋「剛體拼裝型」的難題：3 色＋挖洞形狀，各色數量決定每塊怎麼翻。
   關鍵質疑：如果目標數量是「某色塞到極限」，人只要想到「每塊都取最大面」就秒破，那不算難。
   所以這裡把題目分成：
     極端型（某色＝全盤可達的最大或最小）  → 貪心就能解
     內部型（每色都落在可達範圍內部）      → 非貪心，真的要湊數
   並量三種難度：湊數節點（人列表湊數的工作量）、假設深度、回溯節點。
   執行：node test/hexcolor/search_rigid.cjs [形狀數] [種子] [輸出檔] */
'use strict';
const L = require('./lab.cjs');
const R = require('./rigid.cjs');
const { Core, makeEngine, rate, nodesStats, hexPatch, largestComponent, minimizeClues, clueCount } = L;
const NSHAPES = Number(process.argv[2] || 300), SEED = Number(process.argv[3] || 1);
const OUT = process.argv[4] || (__dirname + '/rigid_search.json');
const rng = Core.makeRng(SEED);

function decode(key) { return [Math.floor(key / 10000), Math.floor(key / 100) % 100, key % 100]; }

const results = [];
let tried = 0, skipped = 0, crossBad = 0, crossOk = 0;
const t0 = Date.now();
for (let s = 0; s < NSHAPES; s++) {
    const p = 0.22 + rng() * 0.26, Rd = 5 + Math.floor(rng() * 3);
    const cells = largestComponent(hexPatch(Rd).filter(() => rng() > p));
    if (cells.length < 45 || cells.length > 90) { skipped++; continue; }
    cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const G = Core.buildGraph(cells), M = R.buildModel(G);
    const sp = R.enumerate(M, 4000000);
    if (!sp) { skipped++; continue; }
    tried++;
    let mx = 0, mn = 1e9;
    for (const key of sp.map.keys()) { const v = decode(key); for (const x of v) { if (x > mx) mx = x; if (x < mn) mn = x; } }
    const E = makeEngine(G, 3);
    const none = new Int8Array(G.n).fill(-1);
    /* 候選：三色數量相異、且解很少的目標 */
    const cand = [];
    for (const [key, v] of sp.map) {
        const c = decode(key);
        if (!(c[0] > c[1] && c[1] > c[2])) continue;
        if (v > 12) continue;
        const gapTop = mx - c[0], gapBot = c[2] - mn;
        cand.push({ c, v, gapTop, gapBot, interior: Math.min(gapTop, gapBot) });
    }
    cand.sort((a, b) => b.interior - a.interior || a.v - b.v);
    for (const ca of cand.slice(0, 6)) {
        const counts = ca.c;
        let givens = none;
        if (ca.v > 1) {
            /* 解不只一個：拿一個解，加上最少的預填把其他解排除 */
            const r0 = R.arithSearch(M, counts, null, { cap: 1 });
            const sol = R.colorsFromChoice(M, r0.first);
            givens = minimizeClues(E, sol, counts, rng, 60000).givens;
        }
        const clues = clueCount(givens);
        if (clues > 8) continue;
        const u = E.count(givens, counts, 2, 400000);
        const a = R.arithSearch(M, counts, givens, { nodeLimit: 3e6 });
        /* 交叉驗證：兩種解法對解數的看法要一致 */
        if (u.aborted || a.aborted) continue;
        if (u.found === a.solutions) crossOk++; else { crossBad++; console.log('!! 解數不一致', u.found, a.solutions, counts); }
        if (u.found !== 1) continue;
        const rt = rate(E, givens, counts, { maxDepth: 2, ms: 4000 });
        const ns = nodesStats(E, givens, counts, rng, 5, 300000);
        let near = 0;
        for (const [key, v] of sp.map) {
            const c = decode(key);
            const d = Math.abs(c[0] - counts[0]) + Math.abs(c[1] - counts[1]) + Math.abs(c[2] - counts[2]);
            if (d > 0 && d <= 2) near += v;
        }
        results.push({
            cells, counts, givens: Array.from(givens), n: G.n, clues, total: sp.total, blocks: M.blocks.length, range: [mn, mx],
            gapTop: ca.gapTop, gapBot: ca.gapBot, interior: ca.interior, solsNoClue: ca.v,
            arith: a.nodes, nodes: ns.median, depth: rt.solved ? rt.depth : (rt.timedOut ? 'T' : '>2'), uses: rt.uses, l0: rt.l0, near,
        });
    }
}
const hist = {};
results.forEach(r => { const key = 'interior' + Math.min(r.interior, 3); hist[key] = (hist[key] || 0) + 1; });
console.log(`形狀 ${tried}（略過 ${skipped}）；候選唯一解 ${results.length}；內部度分布 ${JSON.stringify(hist)}；兩種解法交叉驗證 一致=${crossOk} 不一致=${crossBad}；${((Date.now() - t0) / 1000).toFixed(0)}s`);
function show(r) { return `N=${r.n} 預填=${r.clues} 數量=${r.counts} 可達範圍=${r.range} 離上限=${r.gapTop} 離下限=${r.gapBot} 著色總數=${r.total} 剛體=${r.blocks} 湊數節點=${r.arith} 回溯節點=${r.nodes} 深度=${r.depth} uses=${JSON.stringify(r.uses)} 規則直推=${r.l0} 假解(差≤2)=${r.near}`; }
console.log('── 極端型（離上限或下限 = 0）依湊數節點排序 ──');
results.filter(r => r.interior === 0).sort((a, b) => b.arith - a.arith).slice(0, 6).forEach(r => console.log(show(r)));
console.log('── 內部型（離上下限都 ≥1）依湊數節點排序 ──');
results.filter(r => r.interior >= 1).sort((a, b) => b.arith - a.arith).slice(0, 12).forEach(r => console.log(show(r)));
require('fs').writeFileSync(OUT, JSON.stringify(results.sort((a, b) => b.arith - a.arith).slice(0, 60)));
