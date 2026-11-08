/* 實驗四：預填格的「位置與顏色」怎麼挑，對難度影響多大？
   同一個盤面（形狀、解、各色數量都固定），只換預填的挑法：
     隨機固定 k 格  ：目前遊戲的做法——隨機抄 P 格（解通常不唯一，另外記錄）
     隨機極小      ：隨機順序拿掉預填，直到不能再少（唯一解）
     分散          ：優先留下「離其他預填最遠」的格子（避免局部資訊互相加成）
     集中          ：優先留下「靠近其他預填」的格子
     藏稀有色      ：優先拿掉稀有色的預填（稀有色的位置要玩家自己找）
     露稀有色      ：優先留下稀有色的預填
     搜尋          ：局部搜尋，直接以「回溯節點」為目標最佳化
   另外量「多給預填」的效果：極小解再多加 1、3、5 格隨機預填，難度掉多少。
   執行：node test/hexcolor/exp_prefill.cjs [每組盤面數] */
'use strict';
const L = require('./lab.cjs');
const { Core, makeEngine, rate, minimizeClues, clueCount, nodesStats, shuffle, tally, randomColoring } = L;
const T = Number(process.argv[2] || 8), LIMIT = 40000;
const rng = Core.makeRng(303);

function dist(a, b) { const dq = a[0] - b[0], dr = a[1] - b[1]; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; }

/* 依 orderFn 給的順序拿掉預填（前面的先拿）；orderFn 可以依目前剩下的預填動態決定 */
function minimizeOrdered(E, cells, sol, counts, pickNext) {
    const g = Int8Array.from(sol), tried = new Uint8Array(E.n);
    for (let step = 0; step < E.n; step++) {
        const i = pickNext(g, tried);
        if (i < 0) break;
        tried[i] = 1;
        const keep = g[i]; g[i] = -1;
        const r = E.count(g, counts, 2, LIMIT);
        if (r.found !== 1 || r.aborted) g[i] = keep;
    }
    return g;
}
function nearestClueDist(cells, g, i) {
    let best = 1e9;
    for (let j = 0; j < g.length; j++) if (j !== i && g[j] >= 0) { const d = dist(cells[i], cells[j]); if (d < best) best = d; }
    return best;
}
const strategies = {
    '隨機極小': (E, cells, sol, counts) => minimizeClues(E, sol, counts, rng, LIMIT).givens,
    /* 分散：先拿掉「離最近預填最近」的（留下來的自然互相遠離） */
    '分散': (E, cells, sol, counts) => minimizeOrdered(E, cells, sol, counts, (g, tried) => {
        let best = -1, bd = 1e9;
        for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !tried[i]) { const d = nearestClueDist(cells, g, i) + rng() * 0.3; if (d < bd) { bd = d; best = i; } }
        return best;
    }),
    /* 集中：先拿掉「離中心點最遠」的 */
    '集中': (E, cells, sol, counts) => {
        const c0 = cells[Math.floor(rng() * cells.length)];
        return minimizeOrdered(E, cells, sol, counts, (g, tried) => {
            let best = -1, bd = -1;
            for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !tried[i]) { const d = dist(cells[i], c0) + rng() * 0.3; if (d > bd) { bd = d; best = i; } }
            return best;
        });
    },
    /* 藏稀有色：稀有色的預填先拿掉 */
    '藏稀有色': (E, cells, sol, counts) => {
        const rare = counts.indexOf(Math.min.apply(null, counts));
        return minimizeOrdered(E, cells, sol, counts, (g, tried) => {
            const pool = [];
            for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !tried[i] && sol[i] === rare) pool.push(i);
            if (!pool.length) for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !tried[i]) pool.push(i);
            return pool.length ? pool[Math.floor(rng() * pool.length)] : -1;
        });
    },
    /* 露稀有色：稀有色的預填最後才拿 */
    '露稀有色': (E, cells, sol, counts) => {
        const rare = counts.indexOf(Math.min.apply(null, counts));
        return minimizeOrdered(E, cells, sol, counts, (g, tried) => {
            const pool = [];
            for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !tried[i] && sol[i] !== rare) pool.push(i);
            if (!pool.length) for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !tried[i]) pool.push(i);
            return pool.length ? pool[Math.floor(rng() * pool.length)] : -1;
        });
    },
};
function score(E, g, counts) {
    const r = rate(E, g, counts, { maxDepth: 3, ms: 5000 });
    const ns = nodesStats(E, g, counts, rng, 5, 200000);
    return { clues: clueCount(g), l0: r.l0, d: r.solved ? r.depth : 9, d1: r.uses[1], d2: r.uses[2], d3: r.uses[3], nodes: ns.median };
}
function summarize(name, rows) {
    const avg = f => rows.reduce((a, x) => a + f(x), 0) / rows.length;
    const med = f => { const a = rows.map(f).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    const hist = {};
    rows.forEach(x => { const key = x.d === 9 ? '>3' : 'd' + x.d; hist[key] = (hist[key] || 0) + 1; });
    console.log(`  ${name.padEnd(8)} 預填=${avg(x => x.clues).toFixed(1)} 規則直推=${avg(x => x.l0).toFixed(1)} 深度${JSON.stringify(hist)} D1=${avg(x => x.d1).toFixed(1)} D2=${avg(x => x.d2).toFixed(1)} D3=${avg(x => x.d3).toFixed(1)} 節點中位=${med(x => x.nodes)} 平均=${avg(x => x.nodes).toFixed(0)}`);
}
const cases = [
    ['實心 61 格 4 色 微傾', 61, 4, [3, 2, 1.5, 1]],
    ['實心 61 格 4 色 稀有', 61, 4, [1, 1, 1, 0.12]],
];
for (const [label, N, k, w] of cases) {
    console.log(`\n── ${label} ──`);
    const res = {}; Object.keys(strategies).forEach(s => { res[s] = []; });
    const extra = { '+1': [], '+3': [], '+5': [] };
    let searched = [];
    const t0 = Date.now();
    for (let t = 0; t < T; t++) {
        const cells = Core.makeShape(N, 3, rng).cells;
        const G = Core.buildGraph(cells), E = makeEngine(G, k);
        const sol = randomColoring(G, k, w, rng);
        const counts = tally(sol, k);
        let base = null;
        for (const s of Object.keys(strategies)) {
            const g = strategies[s](E, cells, sol, counts);
            res[s].push(score(E, g, counts));
            if (s === '隨機極小') base = g;
        }
        for (const [nm, add] of [['+1', 1], ['+3', 3], ['+5', 5]]) {
            const g = Int8Array.from(base);
            const empties = []; for (let i = 0; i < E.n; i++) if (g[i] < 0) empties.push(i);
            shuffle(empties, rng);
            for (const i of empties.slice(0, add)) g[i] = sol[i];
            extra[nm].push(score(E, g, counts));
        }
        /* 搜尋：反覆「多加幾格再重新極小化」，留下回溯節點最高的 */
        let best = base, bestN = nodesStats(E, base, counts, rng, 7, 200000).median;
        for (let it = 0; it < 40; it++) {
            const g = Int8Array.from(best);
            const empties = []; for (let i = 0; i < E.n; i++) if (g[i] < 0) empties.push(i);
            shuffle(empties, rng);
            for (const i of empties.slice(0, 2 + Math.floor(rng() * 3))) g[i] = sol[i];
            const m = minimizeClues(E, sol, counts, rng, LIMIT, g).givens;
            const nn = nodesStats(E, m, counts, rng, 7, 200000).median;
            if (nn >= bestN) { best = m; bestN = nn; }
        }
        searched.push(score(E, best, counts));
    }
    Object.keys(strategies).forEach(s => summarize(s, res[s]));
    Object.keys(extra).forEach(s => summarize('極小' + s, extra[s]));
    summarize('局部搜尋', searched);
    console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
