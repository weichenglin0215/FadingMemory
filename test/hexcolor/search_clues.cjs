/* 搜尋 4／5 色的難題（對照組）：形狀與解固定，只搜尋預填格的組合。
   問題：不靠剛體結構，只靠「預填位置＋稀有色」能把難度推多高？
   執行：node test/hexcolor/search_clues.cjs <種子> <秒數> <模式> <輸出檔>
   模式：k4rare / k4mid / k5rare / h4rare（挖洞） */
'use strict';
const fs = require('fs');
const L = require('./lab.cjs');
const { Core, makeEngine, nodesStats, hexPatch, largestComponent, minimizeClues, clueCount, randomColoring, tally, shuffle } = L;
const SEED = Number(process.argv[2] || 1), SECONDS = Number(process.argv[3] || 300), MODE = process.argv[4] || 'k4rare';
const OUT = process.argv[5] || (__dirname + '/clues_' + MODE + '_' + SEED + '.json');
const rng = Core.makeRng(SEED * 104729 + 7);
const CFG = {
    k4rare: { k: 4, w: [1, 1, 1, 0.12], shape: () => Core.makeShape(90, 3, rng).cells },
    k4mid: { k: 4, w: [3, 2, 1.5, 1], shape: () => Core.makeShape(90, 3, rng).cells },
    k5rare: { k: 5, w: [1, 1, 1, 0.2, 0.2], shape: () => Core.makeShape(90, 3, rng).cells },
    h4rare: { k: 4, w: [1, 1, 1, 0.12], shape: () => { for (;;) { const c = largestComponent(hexPatch(6).filter(() => rng() > 0.28)); if (c.length >= 75 && c.length <= 90) { c.sort((a, b) => a[1] - b[1] || a[0] - b[0]); return c; } } } },
}[MODE];
const LIMIT = 60000, NODE_CAP = 400000;
const t0 = Date.now();
let best = null;
while ((Date.now() - t0) / 1000 < SECONDS) {
    const cells = CFG.shape();
    const G = Core.buildGraph(cells), E = makeEngine(G, CFG.k);
    const sol = randomColoring(G, CFG.k, CFG.w, rng);
    if (!sol) continue;
    const counts = tally(sol, CFG.k);
    let g = minimizeClues(E, sol, counts, rng, LIMIT).givens;
    let val = nodesStats(E, g, counts, rng, 5, NODE_CAP).median;
    let stale = 0;
    while (stale < 60 && (Date.now() - t0) / 1000 < SECONDS) {
        const h = Int8Array.from(g);
        const empties = [];
        for (let i = 0; i < E.n; i++) if (h[i] < 0) empties.push(i);
        shuffle(empties, rng);
        for (const i of empties.slice(0, 2 + Math.floor(rng() * 4))) h[i] = sol[i];
        const m = minimizeClues(E, sol, counts, rng, LIMIT, h).givens;
        const v2 = nodesStats(E, m, counts, rng, 5, NODE_CAP).median;
        if (v2 > val) { g = m; val = v2; stale = 0; } else if (v2 === val) { g = m; stale++; } else stale++;
        if (!best || val > best.val) {
            best = { val, cells, counts, givens: Array.from(g), solution: Array.from(sol), clues: clueCount(g), n: G.n, k: CFG.k, mode: MODE };
            fs.writeFileSync(OUT, JSON.stringify(best));
        }
    }
}
console.log(`${MODE} 種子${SEED} 最佳回溯節點中位=${best && best.val} N=${best && best.n} 預填=${best && best.clues} 數量=${best && best.counts}`);
